import { Injectable, Optional, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { Observable, fromEvent, interval, BehaviorSubject } from 'rxjs';
import { pluck, filter, share, finalize } from 'rxjs/operators';
import { ANGULAR_TOKEN_OPTIONS } from './angular-token.token';
import * as i0 from "@angular/core";
import * as i1 from "@angular/common/http";
import * as i2 from "@angular/router";
export class AngularTokenService {
    constructor(http, config, platformId, activatedRoute, router) {
        this.http = http;
        this.platformId = platformId;
        this.activatedRoute = activatedRoute;
        this.router = router;
        this.userType = new BehaviorSubject(null);
        this.authData = new BehaviorSubject(null);
        this.userData = new BehaviorSubject(null);
        this.localStorage = {};
        this.global = (typeof window !== 'undefined') ? window : {};
        if (isPlatformServer(this.platformId)) {
            // Bad pratice, needs fixing
            this.global = {
                open: () => null,
                location: {
                    href: '/',
                    origin: '/'
                }
            };
            // Bad pratice, needs fixing
            this.localStorage.setItem = () => null;
            this.localStorage.getItem = () => null;
            this.localStorage.removeItem = () => null;
        }
        else {
            this.localStorage = localStorage;
        }
        const defaultOptions = {
            apiPath: null,
            apiBase: null,
            signInPath: 'auth/sign_in',
            signInRedirect: null,
            signInStoredUrlStorageKey: null,
            signOutPath: 'auth/sign_out',
            validateTokenPath: 'auth/validate_token',
            signOutFailedValidate: false,
            registerAccountPath: 'auth',
            deleteAccountPath: 'auth',
            registerAccountCallback: this.global.location.href,
            updatePasswordPath: 'auth',
            resetPasswordPath: 'auth/password',
            resetPasswordCallback: this.global.location.href,
            userTypes: null,
            loginField: 'email',
            oAuthBase: this.global.location.origin,
            oAuthPaths: {
                github: 'auth/github'
            },
            oAuthCallbackPath: 'oauth_callback',
            oAuthWindowType: 'newWindow',
            oAuthWindowOptions: null,
            oAuthBrowserCallbacks: {
                github: 'auth/github/callback',
            },
        };
        const mergedOptions = Object.assign(defaultOptions, config);
        this.options = mergedOptions;
        if (this.options.apiBase === null) {
            console.warn(`[angular-token] You have not configured 'apiBase', which may result in security issues. ` +
                `Please refer to the documentation at https://github.com/neroniaky/angular-token/wiki`);
        }
        this.tryLoadAuthData();
    }
    get currentUserType() {
        if (this.userType.value != null) {
            return this.userType.value.name;
        }
        else {
            return undefined;
        }
    }
    get currentUserData() {
        return this.userData.value;
    }
    get currentAuthData() {
        return this.authData.value;
    }
    get apiBase() {
        console.warn('[angular-token] The attribute .apiBase will be removed in the next major release, please use' +
            '.tokenOptions.apiBase instead');
        return this.options.apiBase;
    }
    get tokenOptions() {
        return this.options;
    }
    set tokenOptions(options) {
        this.options = Object.assign(this.options, options);
    }
    userSignedIn() {
        if (this.authData.value == null) {
            return false;
        }
        else {
            return true;
        }
    }
    canActivate(route, state) {
        if (this.userSignedIn()) {
            return true;
        }
        else {
            // Store current location in storage (usefull for redirection after signing in)
            if (this.options.signInStoredUrlStorageKey) {
                this.localStorage.setItem(this.options.signInStoredUrlStorageKey, state.url);
            }
            // Redirect user to sign in if signInRedirect is set
            if (this.router && this.options.signInRedirect) {
                this.router.navigate([this.options.signInRedirect]);
            }
            return false;
        }
    }
    /**
     *
     * Actions
     *
     */
    // Register request
    registerAccount(registerData, additionalData) {
        registerData = Object.assign({}, registerData);
        if (registerData.userType == null) {
            this.userType.next(null);
        }
        else {
            this.userType.next(this.getUserTypeByName(registerData.userType));
            delete registerData.userType;
        }
        if (registerData.password_confirmation == null &&
            registerData.passwordConfirmation != null) {
            registerData.password_confirmation = registerData.passwordConfirmation;
            delete registerData.passwordConfirmation;
        }
        if (additionalData !== undefined) {
            registerData.additionalData = additionalData;
        }
        const login = registerData.login;
        delete registerData.login;
        registerData[this.options.loginField] = login;
        registerData.confirm_success_url = this.options.registerAccountCallback;
        return this.http.post(this.getServerPath() + this.options.registerAccountPath, registerData);
    }
    // Delete Account
    deleteAccount() {
        return this.http.delete(this.getServerPath() + this.options.deleteAccountPath);
    }
    // Sign in request and set storage
    signIn(signInData, additionalData) {
        this.userType.next((signInData.userType == null) ? null : this.getUserTypeByName(signInData.userType));
        const body = {
            [this.options.loginField]: signInData.login,
            password: signInData.password
        };
        if (additionalData !== undefined) {
            body.additionalData = additionalData;
        }
        const observ = this.http.post(this.getServerPath() + this.options.signInPath, body).pipe(share());
        observ.subscribe(res => this.userData.next(res.data));
        return observ;
    }
    signInOAuth(oAuthType, inAppBrowser, platform) {
        const oAuthPath = this.getOAuthPath(oAuthType);
        const callbackUrl = `${this.global.location.origin}/${this.options.oAuthCallbackPath}`;
        const oAuthWindowType = this.options.oAuthWindowType;
        const authUrl = this.getOAuthUrl(oAuthPath, callbackUrl, oAuthWindowType);
        if (oAuthWindowType === 'newWindow' ||
            (oAuthWindowType == 'inAppBrowser' && (!platform || !platform.is('cordova') || !(platform.is('ios') || platform.is('android'))))) {
            const oAuthWindowOptions = this.options.oAuthWindowOptions;
            let windowOptions = '';
            if (oAuthWindowOptions) {
                for (const key in oAuthWindowOptions) {
                    if (oAuthWindowOptions.hasOwnProperty(key)) {
                        windowOptions += `,${key}=${oAuthWindowOptions[key]}`;
                    }
                }
            }
            const popup = window.open(authUrl, '_blank', `closebuttoncaption=Cancel${windowOptions}`);
            return this.requestCredentialsViaPostMessage(popup);
        }
        else if (oAuthWindowType == 'inAppBrowser') {
            let oAuthBrowserCallback = this.options.oAuthBrowserCallbacks[oAuthType];
            if (!oAuthBrowserCallback) {
                throw new Error(`To login with oAuth provider ${oAuthType} using inAppBrowser the callback (in oAuthBrowserCallbacks) is required.`);
            }
            // let oAuthWindowOptions = this.options.oAuthWindowOptions;
            // let windowOptions = '';
            //  if (oAuthWindowOptions) {
            //     for (let key in oAuthWindowOptions) {
            //         windowOptions += `,${key}=${oAuthWindowOptions[key]}`;
            //     }
            // }
            let browser = inAppBrowser.create(authUrl, '_blank', 'location=no');
            return new Observable((observer) => {
                browser.on('loadstop').subscribe((ev) => {
                    if (ev.url.indexOf(oAuthBrowserCallback) > -1) {
                        browser.executeScript({ code: "requestCredentials();" }).then((credentials) => {
                            this.getAuthDataFromPostMessage(credentials[0]);
                            let pollerObserv = interval(400);
                            let pollerSubscription = pollerObserv.subscribe(() => {
                                if (this.userSignedIn()) {
                                    observer.next(this.authData);
                                    observer.complete();
                                    pollerSubscription.unsubscribe();
                                    browser.close();
                                }
                            }, (error) => {
                                observer.error(error);
                                observer.complete();
                            });
                        }, (error) => {
                            observer.error(error);
                            observer.complete();
                        });
                    }
                }, (error) => {
                    observer.error(error);
                    observer.complete();
                });
            });
        }
        else if (oAuthWindowType === 'sameWindow') {
            this.global.location.href = authUrl;
            return undefined;
        }
        else {
            throw new Error(`Unsupported oAuthWindowType "${oAuthWindowType}"`);
        }
    }
    processOAuthCallback() {
        this.getAuthDataFromParams();
    }
    // Sign out request and delete storage
    signOut() {
        return this.http.delete(this.getServerPath() + this.options.signOutPath)
            // Only remove the localStorage and clear the data after the call
            .pipe(finalize(() => {
            this.localStorage.removeItem('accessToken');
            this.localStorage.removeItem('client');
            this.localStorage.removeItem('expiry');
            this.localStorage.removeItem('tokenType');
            this.localStorage.removeItem('uid');
            this.authData.next(null);
            this.userType.next(null);
            this.userData.next(null);
        }));
    }
    // Validate token request
    validateToken() {
        const observ = this.http.get(this.getServerPath() + this.options.validateTokenPath).pipe(share());
        observ.subscribe((res) => this.userData.next(res.data), (error) => {
            if (error.status === 401 && this.options.signOutFailedValidate) {
                this.signOut();
            }
        });
        return observ;
    }
    // Update password request
    updatePassword(updatePasswordData) {
        if (updatePasswordData.userType != null) {
            this.userType.next(this.getUserTypeByName(updatePasswordData.userType));
        }
        let args;
        if (updatePasswordData.passwordCurrent == null) {
            args = {
                password: updatePasswordData.password,
                password_confirmation: updatePasswordData.passwordConfirmation
            };
        }
        else {
            args = {
                current_password: updatePasswordData.passwordCurrent,
                password: updatePasswordData.password,
                password_confirmation: updatePasswordData.passwordConfirmation
            };
        }
        if (updatePasswordData.resetPasswordToken) {
            args.reset_password_token = updatePasswordData.resetPasswordToken;
        }
        const body = args;
        return this.http.put(this.getServerPath() + this.options.updatePasswordPath, body);
    }
    // Reset password request
    resetPassword(resetPasswordData, additionalData) {
        if (additionalData !== undefined) {
            resetPasswordData.additionalData = additionalData;
        }
        this.userType.next((resetPasswordData.userType == null) ? null : this.getUserTypeByName(resetPasswordData.userType));
        const body = {
            [this.options.loginField]: resetPasswordData.login,
            redirect_url: this.options.resetPasswordCallback
        };
        return this.http.post(this.getServerPath() + this.options.resetPasswordPath, body);
    }
    /**
     *
     * Construct Paths / Urls
     *
     */
    getUserPath() {
        return (this.userType.value == null) ? '' : this.userType.value.path + '/';
    }
    getApiPath() {
        let constructedPath = '';
        if (this.options.apiBase != null) {
            constructedPath += this.options.apiBase + '/';
        }
        if (this.options.apiPath != null) {
            constructedPath += this.options.apiPath + '/';
        }
        return constructedPath;
    }
    getServerPath() {
        return this.getApiPath() + this.getUserPath();
    }
    getOAuthPath(oAuthType) {
        let oAuthPath;
        oAuthPath = this.options.oAuthPaths[oAuthType];
        if (oAuthPath == null) {
            oAuthPath = `/auth/${oAuthType}`;
        }
        return oAuthPath;
    }
    getOAuthUrl(oAuthPath, callbackUrl, windowType) {
        let url;
        url = `${this.options.oAuthBase}/${oAuthPath}`;
        url += `?omniauth_window_type=${windowType}`;
        url += `&auth_origin_url=${encodeURIComponent(callbackUrl)}`;
        if (this.userType.value != null) {
            url += `&resource_class=${this.userType.value.name}`;
        }
        return url;
    }
    /**
     *
     * Get Auth Data
     *
     */
    // Try to load auth data
    tryLoadAuthData() {
        const userType = this.getUserTypeByName(this.localStorage.getItem('userType'));
        if (userType) {
            this.userType.next(userType);
        }
        this.getAuthDataFromStorage();
        if (this.activatedRoute) {
            this.getAuthDataFromParams();
        }
        // if (this.authData) {
        //     this.validateToken();
        // }
    }
    // Parse Auth data from response
    getAuthHeadersFromResponse(data) {
        const headers = data.headers;
        const authData = {
            accessToken: headers.get('access-token'),
            client: headers.get('client'),
            expiry: headers.get('expiry'),
            tokenType: headers.get('token-type'),
            uid: headers.get('uid')
        };
        this.setAuthData(authData);
    }
    // Parse Auth data from post message
    getAuthDataFromPostMessage(data) {
        const authData = {
            accessToken: data['auth_token'],
            client: data['client_id'],
            expiry: data['expiry'],
            tokenType: 'Bearer',
            uid: data['uid']
        };
        this.setAuthData(authData);
    }
    // Try to get auth data from storage.
    getAuthDataFromStorage() {
        const authData = {
            accessToken: this.localStorage.getItem('accessToken'),
            client: this.localStorage.getItem('client'),
            expiry: this.localStorage.getItem('expiry'),
            tokenType: this.localStorage.getItem('tokenType'),
            uid: this.localStorage.getItem('uid')
        };
        if (this.checkAuthData(authData)) {
            this.authData.next(authData);
        }
    }
    // Try to get auth data from url parameters.
    getAuthDataFromParams() {
        this.activatedRoute.queryParams.subscribe(queryParams => {
            const authData = {
                accessToken: queryParams['token'] || queryParams['auth_token'],
                client: queryParams['client_id'],
                expiry: queryParams['expiry'],
                tokenType: 'Bearer',
                uid: queryParams['uid']
            };
            if (this.checkAuthData(authData)) {
                this.authData.next(authData);
            }
        });
    }
    /**
     *
     * Set Auth Data
     *
     */
    // Write auth data to storage
    setAuthData(authData) {
        if (this.checkAuthData(authData)) {
            this.authData.next(authData);
            this.localStorage.setItem('accessToken', authData.accessToken);
            this.localStorage.setItem('client', authData.client);
            this.localStorage.setItem('expiry', authData.expiry);
            this.localStorage.setItem('tokenType', authData.tokenType);
            this.localStorage.setItem('uid', authData.uid);
            if (this.userType.value != null) {
                this.localStorage.setItem('userType', this.userType.value.name);
            }
        }
    }
    /**
     *
     * Validate Auth Data
     *
     */
    // Check if auth data complete and if response token is newer
    checkAuthData(authData) {
        if (authData.accessToken != null &&
            authData.client != null &&
            authData.expiry != null &&
            authData.tokenType != null &&
            authData.uid != null) {
            if (this.authData.value != null) {
                return authData.expiry >= this.authData.value.expiry;
            }
            return true;
        }
        return false;
    }
    /**
     *
     * OAuth
     *
     */
    requestCredentialsViaPostMessage(authWindow) {
        const pollerObserv = interval(500);
        const responseObserv = fromEvent(this.global, 'message').pipe(pluck('data'), filter(this.oAuthWindowResponseFilter));
        responseObserv.subscribe(this.getAuthDataFromPostMessage.bind(this));
        const pollerSubscription = pollerObserv.subscribe(() => {
            if (authWindow.closed) {
                pollerSubscription.unsubscribe();
            }
            else {
                authWindow.postMessage('requestCredentials', '*');
            }
        });
        return responseObserv;
    }
    oAuthWindowResponseFilter(data) {
        if (data.message === 'deliverCredentials' || data.message === 'authFailure') {
            return data;
        }
    }
    /**
     *
     * Utilities
     *
     */
    // Match user config by user config name
    getUserTypeByName(name) {
        if (name == null || this.options.userTypes == null) {
            return null;
        }
        return this.options.userTypes.find(userType => userType.name === name);
    }
}
AngularTokenService.ɵfac = function AngularTokenService_Factory(t) { return new (t || AngularTokenService)(i0.ɵɵinject(i1.HttpClient), i0.ɵɵinject(ANGULAR_TOKEN_OPTIONS), i0.ɵɵinject(PLATFORM_ID), i0.ɵɵinject(i2.ActivatedRoute, 8), i0.ɵɵinject(i2.Router, 8)); };
AngularTokenService.ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: AngularTokenService, factory: AngularTokenService.ɵfac, providedIn: 'root' });
(function () { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(AngularTokenService, [{
        type: Injectable,
        args: [{
                providedIn: 'root',
            }]
    }], function () { return [{ type: i1.HttpClient }, { type: undefined, decorators: [{
                type: Inject,
                args: [ANGULAR_TOKEN_OPTIONS]
            }] }, { type: Object, decorators: [{
                type: Inject,
                args: [PLATFORM_ID]
            }] }, { type: i2.ActivatedRoute, decorators: [{
                type: Optional
            }] }, { type: i2.Router, decorators: [{
                type: Optional
            }] }]; }, null); })();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ndWxhci10b2tlbi5zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vcHJvamVjdHMvYW5ndWxhci10b2tlbi9zcmMvbGliL2FuZ3VsYXItdG9rZW4uc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRW5ELE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWhFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDOzs7O0FBc0I5RCxNQUFNLE9BQU8sbUJBQW1CO0lBd0M5QixZQUNVLElBQWdCLEVBQ08sTUFBVyxFQUNiLFVBQWtCLEVBQzNCLGNBQThCLEVBQzlCLE1BQWM7UUFKMUIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUVLLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDM0IsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQzlCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFaN0IsYUFBUSxHQUE4QixJQUFJLGVBQWUsQ0FBVyxJQUFJLENBQUMsQ0FBQztRQUMxRSxhQUFRLEdBQThCLElBQUksZUFBZSxDQUFXLElBQUksQ0FBQyxDQUFDO1FBQzFFLGFBQVEsR0FBOEIsSUFBSSxlQUFlLENBQVcsSUFBSSxDQUFDLENBQUM7UUFHekUsaUJBQVksR0FBa0IsRUFBRSxDQUFDO1FBU3ZDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxPQUFPLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFD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RkFFUCxtQkFBbUI7Y0FIL0IsVUFBVTtlQUFDO2dCQUNWLFVBQVUsRUFBRSxNQUFNO2FBQ25COztzQkEyQ0ksTUFBTTt1QkFBQyxxQkFBcUI7O3NCQUM1QixNQUFNO3VCQUFDLFdBQVc7O3NCQUNsQixRQUFROztzQkFDUixRQUFRIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSW5qZWN0YWJsZSwgT3B0aW9uYWwsIEluamVjdCwgUExBVEZPUk1fSUQgfSBmcm9tICdAYW5ndWxhci9jb3JlJztcclxuaW1wb3J0IHsgQWN0aXZhdGVkUm91dGUsIFJvdXRlciwgQ2FuQWN0aXZhdGUsIEFjdGl2YXRlZFJvdXRlU25hcHNob3QsIFJvdXRlclN0YXRlU25hcHNob3QgfSBmcm9tICdAYW5ndWxhci9yb3V0ZXInO1xyXG5pbXBvcnQgeyBIdHRwQ2xpZW50LCBIdHRwUmVzcG9uc2UsIEh0dHBFcnJvclJlc3BvbnNlIH0gZnJvbSAnQGFuZ3VsYXIvY29tbW9uL2h0dHAnO1xyXG5pbXBvcnQgeyBpc1BsYXRmb3JtU2VydmVyIH0gZnJvbSAnQGFuZ3VsYXIvY29tbW9uJztcclxuXHJcbmltcG9ydCB7IE9ic2VydmFibGUsIGZyb21FdmVudCwgaW50ZXJ2YWwsIEJlaGF2aW9yU3ViamVjdCB9IGZyb20gJ3J4anMnO1xyXG5pbXBvcnQgeyBwbHVjaywgZmlsdGVyLCBzaGFyZSwgZmluYWxpemUgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XHJcblxyXG5pbXBvcnQgeyBBTkdVTEFSX1RPS0VOX09QVElPTlMgfSBmcm9tICcuL2FuZ3VsYXItdG9rZW4udG9rZW4nO1xyXG5cclxuaW1wb3J0IHtcclxuICBTaWduSW5EYXRhLFxyXG4gIFJlZ2lzdGVyRGF0YSxcclxuICBVcGRhdGVQYXNzd29yZERhdGEsXHJcbiAgUmVzZXRQYXNzd29yZERhdGEsXHJcblxyXG4gIFVzZXJUeXBlLFxyXG4gIFVzZXJEYXRhLFxyXG4gIEF1dGhEYXRhLFxyXG4gIEFwaVJlc3BvbnNlLFxyXG5cclxuICBBbmd1bGFyVG9rZW5PcHRpb25zLFxyXG5cclxuICBUb2tlblBsYXRmb3JtLFxyXG4gIFRva2VuSW5BcHBCcm93c2VyLFxyXG59IGZyb20gJy4vYW5ndWxhci10b2tlbi5tb2RlbCc7XHJcblxyXG5ASW5qZWN0YWJsZSh7XHJcbiAgcHJvdmlkZWRJbjogJ3Jvb3QnLFxyXG59KVxyXG5leHBvcnQgY2xhc3MgQW5ndWxhclRva2VuU2VydmljZSBpbXBsZW1lbnRzIENhbkFjdGl2YXRlIHtcclxuXHJcbiAgZ2V0IGN1cnJlbnRVc2VyVHlwZSgpOiBzdHJpbmcge1xyXG4gICAgaWYgKHRoaXMudXNlclR5cGUudmFsdWUgIT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gdGhpcy51c2VyVHlwZS52YWx1ZS5uYW1lO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldCBjdXJyZW50VXNlckRhdGEoKTogVXNlckRhdGEge1xyXG4gICAgcmV0dXJuIHRoaXMudXNlckRhdGEudmFsdWU7XHJcbiAgfVxyXG5cclxuICBnZXQgY3VycmVudEF1dGhEYXRhKCk6IEF1dGhEYXRhIHtcclxuICAgIHJldHVybiB0aGlzLmF1dGhEYXRhLnZhbHVlO1xyXG4gIH1cclxuXHJcbiAgZ2V0IGFwaUJhc2UoKTogc3RyaW5nIHtcclxuICAgIGNvbnNvbGUud2FybignW2FuZ3VsYXItdG9rZW5dIFRoZSBhdHRyaWJ1dGUgLmFwaUJhc2Ugd2lsbCBiZSByZW1vdmVkIGluIHRoZSBuZXh0IG1ham9yIHJlbGVhc2UsIHBsZWFzZSB1c2UnICtcclxuICAgICcudG9rZW5PcHRpb25zLmFwaUJhc2UgaW5zdGVhZCcpO1xyXG4gICAgcmV0dXJuIHRoaXMub3B0aW9ucy5hcGlCYXNlO1xyXG4gIH1cclxuXHJcbiAgZ2V0IHRva2VuT3B0aW9ucygpOiBBbmd1bGFyVG9rZW5PcHRpb25zIHtcclxuICAgIHJldHVybiB0aGlzLm9wdGlvbnM7XHJcbiAgfVxyXG5cclxuICBzZXQgdG9rZW5PcHRpb25zKG9wdGlvbnM6IEFuZ3VsYXJUb2tlbk9wdGlvbnMpIHtcclxuICAgIHRoaXMub3B0aW9ucyA9ICg8YW55Pk9iamVjdCkuYXNzaWduKHRoaXMub3B0aW9ucywgb3B0aW9ucyk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIG9wdGlvbnM6IEFuZ3VsYXJUb2tlbk9wdGlvbnM7XHJcbiAgcHVibGljIHVzZXJUeXBlOiBCZWhhdmlvclN1YmplY3Q8VXNlclR5cGU+ID0gbmV3IEJlaGF2aW9yU3ViamVjdDxVc2VyVHlwZT4obnVsbCk7XHJcbiAgcHVibGljIGF1dGhEYXRhOiBCZWhhdmlvclN1YmplY3Q8QXV0aERhdGE+ID0gbmV3IEJlaGF2aW9yU3ViamVjdDxBdXRoRGF0YT4obnVsbCk7XHJcbiAgcHVibGljIHVzZXJEYXRhOiBCZWhhdmlvclN1YmplY3Q8VXNlckRhdGE+ID0gbmV3IEJlaGF2aW9yU3ViamVjdDxVc2VyRGF0YT4obnVsbCk7XHJcbiAgcHJpdmF0ZSBnbG9iYWw6IFdpbmRvdyB8IGFueTtcclxuXHJcbiAgcHJpdmF0ZSBsb2NhbFN0b3JhZ2U6IFN0b3JhZ2UgfCBhbnkgPSB7fTtcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcml2YXRlIGh0dHA6IEh0dHBDbGllbnQsXHJcbiAgICBASW5qZWN0KEFOR1VMQVJfVE9LRU5fT1BUSU9OUykgY29uZmlnOiBhbnksXHJcbiAgICBASW5qZWN0KFBMQVRGT1JNX0lEKSBwcml2YXRlIHBsYXRmb3JtSWQ6IE9iamVjdCxcclxuICAgIEBPcHRpb25hbCgpIHByaXZhdGUgYWN0aXZhdGVkUm91dGU6IEFjdGl2YXRlZFJvdXRlLFxyXG4gICAgQE9wdGlvbmFsKCkgcHJpdmF0ZSByb3V0ZXI6IFJvdXRlclxyXG4gICkge1xyXG4gICAgdGhpcy5nbG9iYWwgPSAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpID8gd2luZG93IDoge307XHJcblxyXG4gICAgaWYgKGlzUGxhdGZvcm1TZXJ2ZXIodGhpcy5wbGF0Zm9ybUlkKSkge1xyXG5cclxuICAgICAgLy8gQmFkIHByYXRpY2UsIG5lZWRzIGZpeGluZ1xyXG4gICAgICB0aGlzLmdsb2JhbCA9IHtcclxuICAgICAgICBvcGVuOiAoKTogdm9pZCA9PiBudWxsLFxyXG4gICAgICAgIGxvY2F0aW9uOiB7XHJcbiAgICAgICAgICBocmVmOiAnLycsXHJcbiAgICAgICAgICBvcmlnaW46ICcvJ1xyXG4gICAgICAgIH1cclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEJhZCBwcmF0aWNlLCBuZWVkcyBmaXhpbmdcclxuICAgICAgdGhpcy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSA9ICgpOiB2b2lkID0+IG51bGw7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLmdldEl0ZW0gPSAoKTogdm9pZCA9PiBudWxsO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtID0gKCk6IHZvaWQgPT4gbnVsbDtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlID0gbG9jYWxTdG9yYWdlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zOiBBbmd1bGFyVG9rZW5PcHRpb25zID0ge1xyXG4gICAgICBhcGlQYXRoOiAgICAgICAgICAgICAgICAgICAgbnVsbCxcclxuICAgICAgYXBpQmFzZTogICAgICAgICAgICAgICAgICAgIG51bGwsXHJcblxyXG4gICAgICBzaWduSW5QYXRoOiAgICAgICAgICAgICAgICAgJ2F1dGgvc2lnbl9pbicsXHJcbiAgICAgIHNpZ25JblJlZGlyZWN0OiAgICAgICAgICAgICBudWxsLFxyXG4gICAgICBzaWduSW5TdG9yZWRVcmxTdG9yYWdlS2V5OiAgbnVsbCxcclxuXHJcbiAgICAgIHNpZ25PdXRQYXRoOiAgICAgICAgICAgICAgICAnYXV0aC9zaWduX291dCcsXHJcbiAgICAgIHZhbGlkYXRlVG9rZW5QYXRoOiAgICAgICAgICAnYXV0aC92YWxpZGF0ZV90b2tlbicsXHJcbiAgICAgIHNpZ25PdXRGYWlsZWRWYWxpZGF0ZTogICAgICBmYWxzZSxcclxuXHJcbiAgICAgIHJlZ2lzdGVyQWNjb3VudFBhdGg6ICAgICAgICAnYXV0aCcsXHJcbiAgICAgIGRlbGV0ZUFjY291bnRQYXRoOiAgICAgICAgICAnYXV0aCcsXHJcbiAgICAgIHJlZ2lzdGVyQWNjb3VudENhbGxiYWNrOiAgICB0aGlzLmdsb2JhbC5sb2NhdGlvbi5ocmVmLFxyXG5cclxuICAgICAgdXBkYXRlUGFzc3dvcmRQYXRoOiAgICAgICAgICdhdXRoJyxcclxuXHJcbiAgICAgIHJlc2V0UGFzc3dvcmRQYXRoOiAgICAgICAgICAnYXV0aC9wYXNzd29yZCcsXHJcbiAgICAgIHJlc2V0UGFzc3dvcmRDYWxsYmFjazogICAgICB0aGlzLmdsb2JhbC5sb2NhdGlvbi5ocmVmLFxyXG5cclxuICAgICAgdXNlclR5cGVzOiAgICAgICAgICAgICAgICAgIG51bGwsXHJcbiAgICAgIGxvZ2luRmllbGQ6ICAgICAgICAgICAgICAgICAnZW1haWwnLFxyXG5cclxuICAgICAgb0F1dGhCYXNlOiAgICAgICAgICAgICAgICAgIHRoaXMuZ2xvYmFsLmxvY2F0aW9uLm9yaWdpbixcclxuICAgICAgb0F1dGhQYXRoczoge1xyXG4gICAgICAgIGdpdGh1YjogICAgICAgICAgICAgICAgICAgJ2F1dGgvZ2l0aHViJ1xyXG4gICAgICB9LFxyXG4gICAgICBvQXV0aENhbGxiYWNrUGF0aDogICAgICAgICAgJ29hdXRoX2NhbGxiYWNrJyxcclxuICAgICAgb0F1dGhXaW5kb3dUeXBlOiAgICAgICAgICAgICduZXdXaW5kb3cnLFxyXG4gICAgICBvQXV0aFdpbmRvd09wdGlvbnM6ICAgICAgICAgbnVsbCxcclxuXHJcbiAgICAgIG9BdXRoQnJvd3NlckNhbGxiYWNrczoge1xyXG4gICAgICAgIGdpdGh1YjogICAgICAgICAgICAgICAgICAgJ2F1dGgvZ2l0aHViL2NhbGxiYWNrJyxcclxuICAgICAgfSxcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgbWVyZ2VkT3B0aW9ucyA9ICg8YW55Pk9iamVjdCkuYXNzaWduKGRlZmF1bHRPcHRpb25zLCBjb25maWcpO1xyXG4gICAgdGhpcy5vcHRpb25zID0gbWVyZ2VkT3B0aW9ucztcclxuXHJcbiAgICBpZiAodGhpcy5vcHRpb25zLmFwaUJhc2UgPT09IG51bGwpIHtcclxuICAgICAgY29uc29sZS53YXJuKGBbYW5ndWxhci10b2tlbl0gWW91IGhhdmUgbm90IGNvbmZpZ3VyZWQgJ2FwaUJhc2UnLCB3aGljaCBtYXkgcmVzdWx0IGluIHNlY3VyaXR5IGlzc3Vlcy4gYCArXHJcbiAgICAgICAgICAgICAgICAgICBgUGxlYXNlIHJlZmVyIHRvIHRoZSBkb2N1bWVudGF0aW9uIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9uZXJvbmlha3kvYW5ndWxhci10b2tlbi93aWtpYCk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy50cnlMb2FkQXV0aERhdGEoKTtcclxuICB9XHJcblxyXG4gIHVzZXJTaWduZWRJbigpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLmF1dGhEYXRhLnZhbHVlID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjYW5BY3RpdmF0ZShyb3V0ZTogQWN0aXZhdGVkUm91dGVTbmFwc2hvdCwgc3RhdGU6IFJvdXRlclN0YXRlU25hcHNob3QpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLnVzZXJTaWduZWRJbigpKSB7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgLy8gU3RvcmUgY3VycmVudCBsb2NhdGlvbiBpbiBzdG9yYWdlICh1c2VmdWxsIGZvciByZWRpcmVjdGlvbiBhZnRlciBzaWduaW5nIGluKVxyXG4gICAgICBpZiAodGhpcy5vcHRpb25zLnNpZ25JblN0b3JlZFVybFN0b3JhZ2VLZXkpIHtcclxuICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5zZXRJdGVtKFxyXG4gICAgICAgICAgdGhpcy5vcHRpb25zLnNpZ25JblN0b3JlZFVybFN0b3JhZ2VLZXksXHJcbiAgICAgICAgICBzdGF0ZS51cmxcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZWRpcmVjdCB1c2VyIHRvIHNpZ24gaW4gaWYgc2lnbkluUmVkaXJlY3QgaXMgc2V0XHJcbiAgICAgIGlmICh0aGlzLnJvdXRlciAmJiB0aGlzLm9wdGlvbnMuc2lnbkluUmVkaXJlY3QpIHtcclxuICAgICAgICB0aGlzLnJvdXRlci5uYXZpZ2F0ZShbdGhpcy5vcHRpb25zLnNpZ25JblJlZGlyZWN0XSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIEFjdGlvbnNcclxuICAgKlxyXG4gICAqL1xyXG5cclxuICAvLyBSZWdpc3RlciByZXF1ZXN0XHJcbiAgcmVnaXN0ZXJBY2NvdW50KHJlZ2lzdGVyRGF0YTogUmVnaXN0ZXJEYXRhLCBhZGRpdGlvbmFsRGF0YT86IGFueSk6IE9ic2VydmFibGU8QXBpUmVzcG9uc2U+IHtcclxuXHJcbiAgICByZWdpc3RlckRhdGEgPSBPYmplY3QuYXNzaWduKHt9LCByZWdpc3RlckRhdGEpO1xyXG5cclxuICAgIGlmIChyZWdpc3RlckRhdGEudXNlclR5cGUgPT0gbnVsbCkge1xyXG4gICAgICB0aGlzLnVzZXJUeXBlLm5leHQobnVsbCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnVzZXJUeXBlLm5leHQodGhpcy5nZXRVc2VyVHlwZUJ5TmFtZShyZWdpc3RlckRhdGEudXNlclR5cGUpKTtcclxuICAgICAgZGVsZXRlIHJlZ2lzdGVyRGF0YS51c2VyVHlwZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoXHJcbiAgICAgIHJlZ2lzdGVyRGF0YS5wYXNzd29yZF9jb25maXJtYXRpb24gPT0gbnVsbCAmJlxyXG4gICAgICByZWdpc3RlckRhdGEucGFzc3dvcmRDb25maXJtYXRpb24gIT0gbnVsbFxyXG4gICAgKSB7XHJcbiAgICAgIHJlZ2lzdGVyRGF0YS5wYXNzd29yZF9jb25maXJtYXRpb24gPSByZWdpc3RlckRhdGEucGFzc3dvcmRDb25maXJtYXRpb247XHJcbiAgICAgIGRlbGV0ZSByZWdpc3RlckRhdGEucGFzc3dvcmRDb25maXJtYXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFkZGl0aW9uYWxEYXRhICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgcmVnaXN0ZXJEYXRhLmFkZGl0aW9uYWxEYXRhID0gYWRkaXRpb25hbERhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbG9naW4gPSByZWdpc3RlckRhdGEubG9naW47XHJcbiAgICBkZWxldGUgcmVnaXN0ZXJEYXRhLmxvZ2luO1xyXG4gICAgcmVnaXN0ZXJEYXRhW3RoaXMub3B0aW9ucy5sb2dpbkZpZWxkXSA9IGxvZ2luO1xyXG5cclxuICAgIHJlZ2lzdGVyRGF0YS5jb25maXJtX3N1Y2Nlc3NfdXJsID0gdGhpcy5vcHRpb25zLnJlZ2lzdGVyQWNjb3VudENhbGxiYWNrO1xyXG5cclxuICAgIHJldHVybiB0aGlzLmh0dHAucG9zdDxBcGlSZXNwb25zZT4oXHJcbiAgICAgIHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnJlZ2lzdGVyQWNjb3VudFBhdGgsIHJlZ2lzdGVyRGF0YVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8vIERlbGV0ZSBBY2NvdW50XHJcbiAgZGVsZXRlQWNjb3VudCgpOiBPYnNlcnZhYmxlPEFwaVJlc3BvbnNlPiB7XHJcbiAgICByZXR1cm4gdGhpcy5odHRwLmRlbGV0ZTxBcGlSZXNwb25zZT4odGhpcy5nZXRTZXJ2ZXJQYXRoKCkgKyB0aGlzLm9wdGlvbnMuZGVsZXRlQWNjb3VudFBhdGgpO1xyXG4gIH1cclxuXHJcbiAgLy8gU2lnbiBpbiByZXF1ZXN0IGFuZCBzZXQgc3RvcmFnZVxyXG4gIHNpZ25JbihzaWduSW5EYXRhOiBTaWduSW5EYXRhLCBhZGRpdGlvbmFsRGF0YT86IGFueSk6IE9ic2VydmFibGU8QXBpUmVzcG9uc2U+IHtcclxuICAgIHRoaXMudXNlclR5cGUubmV4dCgoc2lnbkluRGF0YS51c2VyVHlwZSA9PSBudWxsKSA/IG51bGwgOiB0aGlzLmdldFVzZXJUeXBlQnlOYW1lKHNpZ25JbkRhdGEudXNlclR5cGUpKTtcclxuXHJcbiAgICBjb25zdCBib2R5ID0ge1xyXG4gICAgICBbdGhpcy5vcHRpb25zLmxvZ2luRmllbGRdOiBzaWduSW5EYXRhLmxvZ2luLFxyXG4gICAgICBwYXNzd29yZDogc2lnbkluRGF0YS5wYXNzd29yZFxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAoYWRkaXRpb25hbERhdGEgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBib2R5LmFkZGl0aW9uYWxEYXRhID0gYWRkaXRpb25hbERhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgb2JzZXJ2ID0gdGhpcy5odHRwLnBvc3Q8QXBpUmVzcG9uc2U+KFxyXG4gICAgICB0aGlzLmdldFNlcnZlclBhdGgoKSArIHRoaXMub3B0aW9ucy5zaWduSW5QYXRoLCBib2R5XHJcbiAgICApLnBpcGUoc2hhcmUoKSk7XHJcblxyXG4gICAgb2JzZXJ2LnN1YnNjcmliZShyZXMgPT4gdGhpcy51c2VyRGF0YS5uZXh0KHJlcy5kYXRhKSk7XHJcblxyXG4gICAgcmV0dXJuIG9ic2VydjtcclxuICB9XHJcblxyXG4gIHNpZ25Jbk9BdXRoKG9BdXRoVHlwZTogc3RyaW5nLCBpbkFwcEJyb3dzZXI/OiBUb2tlbkluQXBwQnJvd3NlcjxhbnksIGFueT4sIHBsYXRmb3JtPzogVG9rZW5QbGF0Zm9ybSkge1xyXG5cclxuICAgIGNvbnN0IG9BdXRoUGF0aDogc3RyaW5nID0gdGhpcy5nZXRPQXV0aFBhdGgob0F1dGhUeXBlKTtcclxuICAgIGNvbnN0IGNhbGxiYWNrVXJsID0gYCR7dGhpcy5nbG9iYWwubG9jYXRpb24ub3JpZ2lufS8ke3RoaXMub3B0aW9ucy5vQXV0aENhbGxiYWNrUGF0aH1gO1xyXG4gICAgY29uc3Qgb0F1dGhXaW5kb3dUeXBlOiBzdHJpbmcgPSB0aGlzLm9wdGlvbnMub0F1dGhXaW5kb3dUeXBlO1xyXG4gICAgY29uc3QgYXV0aFVybDogc3RyaW5nID0gdGhpcy5nZXRPQXV0aFVybChvQXV0aFBhdGgsIGNhbGxiYWNrVXJsLCBvQXV0aFdpbmRvd1R5cGUpO1xyXG5cclxuICAgIGlmIChvQXV0aFdpbmRvd1R5cGUgPT09ICduZXdXaW5kb3cnIHx8XHJcbiAgICAgIChvQXV0aFdpbmRvd1R5cGUgPT0gJ2luQXBwQnJvd3NlcicgJiYgKCFwbGF0Zm9ybSB8fCAhcGxhdGZvcm0uaXMoJ2NvcmRvdmEnKSB8fCAhKHBsYXRmb3JtLmlzKCdpb3MnKSB8fCBwbGF0Zm9ybS5pcygnYW5kcm9pZCcpKSkpKSB7XHJcbiAgICAgIGNvbnN0IG9BdXRoV2luZG93T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5vQXV0aFdpbmRvd09wdGlvbnM7XHJcbiAgICAgIGxldCB3aW5kb3dPcHRpb25zID0gJyc7XHJcblxyXG4gICAgICBpZiAob0F1dGhXaW5kb3dPcHRpb25zKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gb0F1dGhXaW5kb3dPcHRpb25zKSB7XHJcbiAgICAgICAgICBpZiAob0F1dGhXaW5kb3dPcHRpb25zLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgICAgICB3aW5kb3dPcHRpb25zICs9IGAsJHtrZXl9PSR7b0F1dGhXaW5kb3dPcHRpb25zW2tleV19YDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHBvcHVwID0gd2luZG93Lm9wZW4oXHJcbiAgICAgICAgICBhdXRoVXJsLFxyXG4gICAgICAgICAgJ19ibGFuaycsXHJcbiAgICAgICAgICBgY2xvc2VidXR0b25jYXB0aW9uPUNhbmNlbCR7d2luZG93T3B0aW9uc31gXHJcbiAgICAgICk7XHJcbiAgICAgIHJldHVybiB0aGlzLnJlcXVlc3RDcmVkZW50aWFsc1ZpYVBvc3RNZXNzYWdlKHBvcHVwKTtcclxuICAgIH0gZWxzZSBpZiAob0F1dGhXaW5kb3dUeXBlID09ICdpbkFwcEJyb3dzZXInKSB7XHJcbiAgICAgIGxldCBvQXV0aEJyb3dzZXJDYWxsYmFjayA9IHRoaXMub3B0aW9ucy5vQXV0aEJyb3dzZXJDYWxsYmFja3Nbb0F1dGhUeXBlXTtcclxuICAgICAgaWYgKCFvQXV0aEJyb3dzZXJDYWxsYmFjaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVG8gbG9naW4gd2l0aCBvQXV0aCBwcm92aWRlciAke29BdXRoVHlwZX0gdXNpbmcgaW5BcHBCcm93c2VyIHRoZSBjYWxsYmFjayAoaW4gb0F1dGhCcm93c2VyQ2FsbGJhY2tzKSBpcyByZXF1aXJlZC5gKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBsZXQgb0F1dGhXaW5kb3dPcHRpb25zID0gdGhpcy5vcHRpb25zLm9BdXRoV2luZG93T3B0aW9ucztcclxuICAgICAgLy8gbGV0IHdpbmRvd09wdGlvbnMgPSAnJztcclxuXHJcbiAgICAgIC8vICBpZiAob0F1dGhXaW5kb3dPcHRpb25zKSB7XHJcbiAgICAgIC8vICAgICBmb3IgKGxldCBrZXkgaW4gb0F1dGhXaW5kb3dPcHRpb25zKSB7XHJcbiAgICAgIC8vICAgICAgICAgd2luZG93T3B0aW9ucyArPSBgLCR7a2V5fT0ke29BdXRoV2luZG93T3B0aW9uc1trZXldfWA7XHJcbiAgICAgIC8vICAgICB9XHJcbiAgICAgIC8vIH1cclxuXHJcbiAgICAgIGxldCBicm93c2VyID0gaW5BcHBCcm93c2VyLmNyZWF0ZShcclxuICAgICAgICAgIGF1dGhVcmwsXHJcbiAgICAgICAgICAnX2JsYW5rJyxcclxuICAgICAgICAgICdsb2NhdGlvbj1ubydcclxuICAgICAgKTtcclxuXHJcbiAgICAgIHJldHVybiBuZXcgT2JzZXJ2YWJsZSgob2JzZXJ2ZXIpID0+IHtcclxuICAgICAgICBicm93c2VyLm9uKCdsb2Fkc3RvcCcpLnN1YnNjcmliZSgoZXY6IGFueSkgPT4ge1xyXG4gICAgICAgICAgaWYgKGV2LnVybC5pbmRleE9mKG9BdXRoQnJvd3NlckNhbGxiYWNrKSA+IC0xKSB7XHJcbiAgICAgICAgICAgIGJyb3dzZXIuZXhlY3V0ZVNjcmlwdCh7Y29kZTogXCJyZXF1ZXN0Q3JlZGVudGlhbHMoKTtcIn0pLnRoZW4oKGNyZWRlbnRpYWxzOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLmdldEF1dGhEYXRhRnJvbVBvc3RNZXNzYWdlKGNyZWRlbnRpYWxzWzBdKTtcclxuXHJcbiAgICAgICAgICAgICAgbGV0IHBvbGxlck9ic2VydiA9IGludGVydmFsKDQwMCk7XHJcblxyXG4gICAgICAgICAgICAgIGxldCBwb2xsZXJTdWJzY3JpcHRpb24gPSBwb2xsZXJPYnNlcnYuc3Vic2NyaWJlKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnVzZXJTaWduZWRJbigpKSB7XHJcbiAgICAgICAgICAgICAgICAgIG9ic2VydmVyLm5leHQodGhpcy5hdXRoRGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgIG9ic2VydmVyLmNvbXBsZXRlKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICBwb2xsZXJTdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcclxuICAgICAgICAgICAgICAgICAgYnJvd3Nlci5jbG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH0sIChlcnJvcjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5lcnJvcihlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBvYnNlcnZlci5jb21wbGV0ZSgpO1xyXG4gICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0sIChlcnJvcjogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuZXJyb3IoZXJyb3IpO1xyXG4gICAgICAgICAgICAgIG9ic2VydmVyLmNvbXBsZXRlKCk7XHJcbiAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgKGVycm9yOiBhbnkpID0+IHtcclxuICAgICAgICAgIG9ic2VydmVyLmVycm9yKGVycm9yKTtcclxuICAgICAgICAgIG9ic2VydmVyLmNvbXBsZXRlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICB9IGVsc2UgaWYgKG9BdXRoV2luZG93VHlwZSA9PT0gJ3NhbWVXaW5kb3cnKSB7XHJcbiAgICAgIHRoaXMuZ2xvYmFsLmxvY2F0aW9uLmhyZWYgPSBhdXRoVXJsO1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBvQXV0aFdpbmRvd1R5cGUgXCIke29BdXRoV2luZG93VHlwZX1cImApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJvY2Vzc09BdXRoQ2FsbGJhY2soKTogdm9pZCB7XHJcbiAgICB0aGlzLmdldEF1dGhEYXRhRnJvbVBhcmFtcygpO1xyXG4gIH1cclxuXHJcbiAgLy8gU2lnbiBvdXQgcmVxdWVzdCBhbmQgZGVsZXRlIHN0b3JhZ2VcclxuICBzaWduT3V0KCk6IE9ic2VydmFibGU8QXBpUmVzcG9uc2U+IHtcclxuICAgIHJldHVybiB0aGlzLmh0dHAuZGVsZXRlPEFwaVJlc3BvbnNlPih0aGlzLmdldFNlcnZlclBhdGgoKSArIHRoaXMub3B0aW9ucy5zaWduT3V0UGF0aClcclxuICAgICAgLy8gT25seSByZW1vdmUgdGhlIGxvY2FsU3RvcmFnZSBhbmQgY2xlYXIgdGhlIGRhdGEgYWZ0ZXIgdGhlIGNhbGxcclxuICAgICAgLnBpcGUoXHJcbiAgICAgICAgZmluYWxpemUoKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdhY2Nlc3NUb2tlbicpO1xyXG4gICAgICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdjbGllbnQnKTtcclxuICAgICAgICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnZXhwaXJ5Jyk7XHJcbiAgICAgICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3Rva2VuVHlwZScpO1xyXG4gICAgICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCd1aWQnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYXV0aERhdGEubmV4dChudWxsKTtcclxuICAgICAgICAgICAgdGhpcy51c2VyVHlwZS5uZXh0KG51bGwpO1xyXG4gICAgICAgICAgICB0aGlzLnVzZXJEYXRhLm5leHQobnVsbCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgKVxyXG4gICAgICApO1xyXG4gIH1cclxuXHJcbiAgLy8gVmFsaWRhdGUgdG9rZW4gcmVxdWVzdFxyXG4gIHZhbGlkYXRlVG9rZW4oKTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG4gICAgY29uc3Qgb2JzZXJ2ID0gdGhpcy5odHRwLmdldDxBcGlSZXNwb25zZT4oXHJcbiAgICAgIHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnZhbGlkYXRlVG9rZW5QYXRoXHJcbiAgICApLnBpcGUoc2hhcmUoKSk7XHJcblxyXG4gICAgb2JzZXJ2LnN1YnNjcmliZShcclxuICAgICAgKHJlcykgPT4gdGhpcy51c2VyRGF0YS5uZXh0KHJlcy5kYXRhKSxcclxuICAgICAgKGVycm9yKSA9PiB7XHJcbiAgICAgICAgaWYgKGVycm9yLnN0YXR1cyA9PT0gNDAxICYmIHRoaXMub3B0aW9ucy5zaWduT3V0RmFpbGVkVmFsaWRhdGUpIHtcclxuICAgICAgICAgIHRoaXMuc2lnbk91dCgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBvYnNlcnY7XHJcbiAgfVxyXG5cclxuICAvLyBVcGRhdGUgcGFzc3dvcmQgcmVxdWVzdFxyXG4gIHVwZGF0ZVBhc3N3b3JkKHVwZGF0ZVBhc3N3b3JkRGF0YTogVXBkYXRlUGFzc3dvcmREYXRhKTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG5cclxuICAgIGlmICh1cGRhdGVQYXNzd29yZERhdGEudXNlclR5cGUgIT0gbnVsbCkge1xyXG4gICAgICB0aGlzLnVzZXJUeXBlLm5leHQodGhpcy5nZXRVc2VyVHlwZUJ5TmFtZSh1cGRhdGVQYXNzd29yZERhdGEudXNlclR5cGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgYXJnczogYW55O1xyXG5cclxuICAgIGlmICh1cGRhdGVQYXNzd29yZERhdGEucGFzc3dvcmRDdXJyZW50ID09IG51bGwpIHtcclxuICAgICAgYXJncyA9IHtcclxuICAgICAgICBwYXNzd29yZDogICAgICAgICAgICAgICB1cGRhdGVQYXNzd29yZERhdGEucGFzc3dvcmQsXHJcbiAgICAgICAgcGFzc3dvcmRfY29uZmlybWF0aW9uOiAgdXBkYXRlUGFzc3dvcmREYXRhLnBhc3N3b3JkQ29uZmlybWF0aW9uXHJcbiAgICAgIH07XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBhcmdzID0ge1xyXG4gICAgICAgIGN1cnJlbnRfcGFzc3dvcmQ6ICAgICAgIHVwZGF0ZVBhc3N3b3JkRGF0YS5wYXNzd29yZEN1cnJlbnQsXHJcbiAgICAgICAgcGFzc3dvcmQ6ICAgICAgICAgICAgICAgdXBkYXRlUGFzc3dvcmREYXRhLnBhc3N3b3JkLFxyXG4gICAgICAgIHBhc3N3b3JkX2NvbmZpcm1hdGlvbjogIHVwZGF0ZVBhc3N3b3JkRGF0YS5wYXNzd29yZENvbmZpcm1hdGlvblxyXG4gICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh1cGRhdGVQYXNzd29yZERhdGEucmVzZXRQYXNzd29yZFRva2VuKSB7XHJcbiAgICAgIGFyZ3MucmVzZXRfcGFzc3dvcmRfdG9rZW4gPSB1cGRhdGVQYXNzd29yZERhdGEucmVzZXRQYXNzd29yZFRva2VuO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGJvZHkgPSBhcmdzO1xyXG4gICAgcmV0dXJuIHRoaXMuaHR0cC5wdXQ8QXBpUmVzcG9uc2U+KHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnVwZGF0ZVBhc3N3b3JkUGF0aCwgYm9keSk7XHJcbiAgfVxyXG5cclxuICAvLyBSZXNldCBwYXNzd29yZCByZXF1ZXN0XHJcbiAgcmVzZXRQYXNzd29yZChyZXNldFBhc3N3b3JkRGF0YTogUmVzZXRQYXNzd29yZERhdGEsIGFkZGl0aW9uYWxEYXRhPzogYW55KTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG4gICAgXHJcbiAgICBcclxuICAgIGlmIChhZGRpdGlvbmFsRGF0YSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHJlc2V0UGFzc3dvcmREYXRhLmFkZGl0aW9uYWxEYXRhID0gYWRkaXRpb25hbERhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy51c2VyVHlwZS5uZXh0KFxyXG4gICAgICAocmVzZXRQYXNzd29yZERhdGEudXNlclR5cGUgPT0gbnVsbCkgPyBudWxsIDogdGhpcy5nZXRVc2VyVHlwZUJ5TmFtZShyZXNldFBhc3N3b3JkRGF0YS51c2VyVHlwZSlcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYm9keSA9IHtcclxuICAgICAgW3RoaXMub3B0aW9ucy5sb2dpbkZpZWxkXTogcmVzZXRQYXNzd29yZERhdGEubG9naW4sXHJcbiAgICAgIHJlZGlyZWN0X3VybDogdGhpcy5vcHRpb25zLnJlc2V0UGFzc3dvcmRDYWxsYmFja1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdGhpcy5odHRwLnBvc3Q8QXBpUmVzcG9uc2U+KHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnJlc2V0UGFzc3dvcmRQYXRoLCBib2R5KTtcclxuICB9XHJcblxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIENvbnN0cnVjdCBQYXRocyAvIFVybHNcclxuICAgKlxyXG4gICAqL1xyXG5cclxuICBwcml2YXRlIGdldFVzZXJQYXRoKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gKHRoaXMudXNlclR5cGUudmFsdWUgPT0gbnVsbCkgPyAnJyA6IHRoaXMudXNlclR5cGUudmFsdWUucGF0aCArICcvJztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0QXBpUGF0aCgpOiBzdHJpbmcge1xyXG4gICAgbGV0IGNvbnN0cnVjdGVkUGF0aCA9ICcnO1xyXG5cclxuICAgIGlmICh0aGlzLm9wdGlvbnMuYXBpQmFzZSAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0cnVjdGVkUGF0aCArPSB0aGlzLm9wdGlvbnMuYXBpQmFzZSArICcvJztcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhpcy5vcHRpb25zLmFwaVBhdGggIT0gbnVsbCkge1xyXG4gICAgICBjb25zdHJ1Y3RlZFBhdGggKz0gdGhpcy5vcHRpb25zLmFwaVBhdGggKyAnLyc7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNvbnN0cnVjdGVkUGF0aDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0U2VydmVyUGF0aCgpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHRoaXMuZ2V0QXBpUGF0aCgpICsgdGhpcy5nZXRVc2VyUGF0aCgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRPQXV0aFBhdGgob0F1dGhUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgbGV0IG9BdXRoUGF0aDogc3RyaW5nO1xyXG5cclxuICAgIG9BdXRoUGF0aCA9IHRoaXMub3B0aW9ucy5vQXV0aFBhdGhzW29BdXRoVHlwZV07XHJcblxyXG4gICAgaWYgKG9BdXRoUGF0aCA9PSBudWxsKSB7XHJcbiAgICAgIG9BdXRoUGF0aCA9IGAvYXV0aC8ke29BdXRoVHlwZX1gO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBvQXV0aFBhdGg7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldE9BdXRoVXJsKG9BdXRoUGF0aDogc3RyaW5nLCBjYWxsYmFja1VybDogc3RyaW5nLCB3aW5kb3dUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgbGV0IHVybDogc3RyaW5nO1xyXG5cclxuICAgIHVybCA9ICAgYCR7dGhpcy5vcHRpb25zLm9BdXRoQmFzZX0vJHtvQXV0aFBhdGh9YDtcclxuICAgIHVybCArPSAgYD9vbW5pYXV0aF93aW5kb3dfdHlwZT0ke3dpbmRvd1R5cGV9YDtcclxuICAgIHVybCArPSAgYCZhdXRoX29yaWdpbl91cmw9JHtlbmNvZGVVUklDb21wb25lbnQoY2FsbGJhY2tVcmwpfWA7XHJcblxyXG4gICAgaWYgKHRoaXMudXNlclR5cGUudmFsdWUgIT0gbnVsbCkge1xyXG4gICAgICB1cmwgKz0gYCZyZXNvdXJjZV9jbGFzcz0ke3RoaXMudXNlclR5cGUudmFsdWUubmFtZX1gO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB1cmw7XHJcbiAgfVxyXG5cclxuXHJcbiAgLyoqXHJcbiAgICpcclxuICAgKiBHZXQgQXV0aCBEYXRhXHJcbiAgICpcclxuICAgKi9cclxuXHJcbiAgLy8gVHJ5IHRvIGxvYWQgYXV0aCBkYXRhXHJcbiAgcHJpdmF0ZSB0cnlMb2FkQXV0aERhdGEoKTogdm9pZCB7XHJcblxyXG4gICAgY29uc3QgdXNlclR5cGUgPSB0aGlzLmdldFVzZXJUeXBlQnlOYW1lKHRoaXMubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3VzZXJUeXBlJykpO1xyXG5cclxuICAgIGlmICh1c2VyVHlwZSkge1xyXG4gICAgICB0aGlzLnVzZXJUeXBlLm5leHQodXNlclR5cGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuZ2V0QXV0aERhdGFGcm9tU3RvcmFnZSgpO1xyXG5cclxuICAgIGlmICh0aGlzLmFjdGl2YXRlZFJvdXRlKSB7XHJcbiAgICAgIHRoaXMuZ2V0QXV0aERhdGFGcm9tUGFyYW1zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gaWYgKHRoaXMuYXV0aERhdGEpIHtcclxuICAgIC8vICAgICB0aGlzLnZhbGlkYXRlVG9rZW4oKTtcclxuICAgIC8vIH1cclxuICB9XHJcblxyXG4gIC8vIFBhcnNlIEF1dGggZGF0YSBmcm9tIHJlc3BvbnNlXHJcbiAgcHVibGljIGdldEF1dGhIZWFkZXJzRnJvbVJlc3BvbnNlKGRhdGE6IEh0dHBSZXNwb25zZTxhbnk+IHwgSHR0cEVycm9yUmVzcG9uc2UpOiB2b2lkIHtcclxuICAgIGNvbnN0IGhlYWRlcnMgPSBkYXRhLmhlYWRlcnM7XHJcblxyXG4gICAgY29uc3QgYXV0aERhdGE6IEF1dGhEYXRhID0ge1xyXG4gICAgICBhY2Nlc3NUb2tlbjogICAgaGVhZGVycy5nZXQoJ2FjY2Vzcy10b2tlbicpLFxyXG4gICAgICBjbGllbnQ6ICAgICAgICAgaGVhZGVycy5nZXQoJ2NsaWVudCcpLFxyXG4gICAgICBleHBpcnk6ICAgICAgICAgaGVhZGVycy5nZXQoJ2V4cGlyeScpLFxyXG4gICAgICB0b2tlblR5cGU6ICAgICAgaGVhZGVycy5nZXQoJ3Rva2VuLXR5cGUnKSxcclxuICAgICAgdWlkOiAgICAgICAgICAgIGhlYWRlcnMuZ2V0KCd1aWQnKVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNldEF1dGhEYXRhKGF1dGhEYXRhKTtcclxuICB9XHJcblxyXG4gIC8vIFBhcnNlIEF1dGggZGF0YSBmcm9tIHBvc3QgbWVzc2FnZVxyXG4gIHByaXZhdGUgZ2V0QXV0aERhdGFGcm9tUG9zdE1lc3NhZ2UoZGF0YTogYW55KTogdm9pZCB7XHJcbiAgICBjb25zdCBhdXRoRGF0YTogQXV0aERhdGEgPSB7XHJcbiAgICAgIGFjY2Vzc1Rva2VuOiAgICBkYXRhWydhdXRoX3Rva2VuJ10sXHJcbiAgICAgIGNsaWVudDogICAgICAgICBkYXRhWydjbGllbnRfaWQnXSxcclxuICAgICAgZXhwaXJ5OiAgICAgICAgIGRhdGFbJ2V4cGlyeSddLFxyXG4gICAgICB0b2tlblR5cGU6ICAgICAgJ0JlYXJlcicsXHJcbiAgICAgIHVpZDogICAgICAgICAgICBkYXRhWyd1aWQnXVxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNldEF1dGhEYXRhKGF1dGhEYXRhKTtcclxuICB9XHJcblxyXG4gIC8vIFRyeSB0byBnZXQgYXV0aCBkYXRhIGZyb20gc3RvcmFnZS5cclxuICBwdWJsaWMgZ2V0QXV0aERhdGFGcm9tU3RvcmFnZSgpOiB2b2lkIHtcclxuXHJcbiAgICBjb25zdCBhdXRoRGF0YTogQXV0aERhdGEgPSB7XHJcbiAgICAgIGFjY2Vzc1Rva2VuOiAgICB0aGlzLmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdhY2Nlc3NUb2tlbicpLFxyXG4gICAgICBjbGllbnQ6ICAgICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY2xpZW50JyksXHJcbiAgICAgIGV4cGlyeTogICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdleHBpcnknKSxcclxuICAgICAgdG9rZW5UeXBlOiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3Rva2VuVHlwZScpLFxyXG4gICAgICB1aWQ6ICAgICAgICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndWlkJylcclxuICAgIH07XHJcblxyXG4gICAgaWYgKHRoaXMuY2hlY2tBdXRoRGF0YShhdXRoRGF0YSkpIHtcclxuICAgICAgdGhpcy5hdXRoRGF0YS5uZXh0KGF1dGhEYXRhKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIFRyeSB0byBnZXQgYXV0aCBkYXRhIGZyb20gdXJsIHBhcmFtZXRlcnMuXHJcbiAgcHJpdmF0ZSBnZXRBdXRoRGF0YUZyb21QYXJhbXMoKTogdm9pZCB7XHJcbiAgICB0aGlzLmFjdGl2YXRlZFJvdXRlLnF1ZXJ5UGFyYW1zLnN1YnNjcmliZShxdWVyeVBhcmFtcyA9PiB7XHJcbiAgICAgIGNvbnN0IGF1dGhEYXRhOiBBdXRoRGF0YSA9IHtcclxuICAgICAgICBhY2Nlc3NUb2tlbjogICAgcXVlcnlQYXJhbXNbJ3Rva2VuJ10gfHwgcXVlcnlQYXJhbXNbJ2F1dGhfdG9rZW4nXSxcclxuICAgICAgICBjbGllbnQ6ICAgICAgICAgcXVlcnlQYXJhbXNbJ2NsaWVudF9pZCddLFxyXG4gICAgICAgIGV4cGlyeTogICAgICAgICBxdWVyeVBhcmFtc1snZXhwaXJ5J10sXHJcbiAgICAgICAgdG9rZW5UeXBlOiAgICAgICdCZWFyZXInLFxyXG4gICAgICAgIHVpZDogICAgICAgICAgICBxdWVyeVBhcmFtc1sndWlkJ11cclxuICAgICAgfTtcclxuXHJcbiAgICAgIGlmICh0aGlzLmNoZWNrQXV0aERhdGEoYXV0aERhdGEpKSB7XHJcbiAgICAgICAgdGhpcy5hdXRoRGF0YS5uZXh0KGF1dGhEYXRhKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIFNldCBBdXRoIERhdGFcclxuICAgKlxyXG4gICAqL1xyXG5cclxuICAvLyBXcml0ZSBhdXRoIGRhdGEgdG8gc3RvcmFnZVxyXG4gIHByaXZhdGUgc2V0QXV0aERhdGEoYXV0aERhdGE6IEF1dGhEYXRhKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5jaGVja0F1dGhEYXRhKGF1dGhEYXRhKSkge1xyXG5cclxuICAgICAgdGhpcy5hdXRoRGF0YS5uZXh0KGF1dGhEYXRhKTtcclxuXHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2FjY2Vzc1Rva2VuJywgYXV0aERhdGEuYWNjZXNzVG9rZW4pO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjbGllbnQnLCBhdXRoRGF0YS5jbGllbnQpO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdleHBpcnknLCBhdXRoRGF0YS5leHBpcnkpO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5zZXRJdGVtKCd0b2tlblR5cGUnLCBhdXRoRGF0YS50b2tlblR5cGUpO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5zZXRJdGVtKCd1aWQnLCBhdXRoRGF0YS51aWQpO1xyXG5cclxuICAgICAgaWYgKHRoaXMudXNlclR5cGUudmFsdWUgIT0gbnVsbCkge1xyXG4gICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3VzZXJUeXBlJywgdGhpcy51c2VyVHlwZS52YWx1ZS5uYW1lKTtcclxuICAgICAgfVxyXG5cclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIFZhbGlkYXRlIEF1dGggRGF0YVxyXG4gICAqXHJcbiAgICovXHJcblxyXG4gIC8vIENoZWNrIGlmIGF1dGggZGF0YSBjb21wbGV0ZSBhbmQgaWYgcmVzcG9uc2UgdG9rZW4gaXMgbmV3ZXJcclxuICBwcml2YXRlIGNoZWNrQXV0aERhdGEoYXV0aERhdGE6IEF1dGhEYXRhKTogYm9vbGVhbiB7XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICBhdXRoRGF0YS5hY2Nlc3NUb2tlbiAhPSBudWxsICYmXHJcbiAgICAgIGF1dGhEYXRhLmNsaWVudCAhPSBudWxsICYmXHJcbiAgICAgIGF1dGhEYXRhLmV4cGlyeSAhPSBudWxsICYmXHJcbiAgICAgIGF1dGhEYXRhLnRva2VuVHlwZSAhPSBudWxsICYmXHJcbiAgICAgIGF1dGhEYXRhLnVpZCAhPSBudWxsXHJcbiAgICApIHtcclxuICAgICAgaWYgKHRoaXMuYXV0aERhdGEudmFsdWUgIT0gbnVsbCkge1xyXG4gICAgICAgIHJldHVybiBhdXRoRGF0YS5leHBpcnkgPj0gdGhpcy5hdXRoRGF0YS52YWx1ZS5leHBpcnk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG5cclxuXHJcbiAgLyoqXHJcbiAgICpcclxuICAgKiBPQXV0aFxyXG4gICAqXHJcbiAgICovXHJcblxyXG4gIHByaXZhdGUgcmVxdWVzdENyZWRlbnRpYWxzVmlhUG9zdE1lc3NhZ2UoYXV0aFdpbmRvdzogYW55KTogT2JzZXJ2YWJsZTxhbnk+IHtcclxuICAgIGNvbnN0IHBvbGxlck9ic2VydiA9IGludGVydmFsKDUwMCk7XHJcblxyXG4gICAgY29uc3QgcmVzcG9uc2VPYnNlcnYgPSBmcm9tRXZlbnQodGhpcy5nbG9iYWwsICdtZXNzYWdlJykucGlwZShcclxuICAgICAgcGx1Y2soJ2RhdGEnKSxcclxuICAgICAgZmlsdGVyKHRoaXMub0F1dGhXaW5kb3dSZXNwb25zZUZpbHRlcilcclxuICAgICk7XHJcblxyXG4gICAgcmVzcG9uc2VPYnNlcnYuc3Vic2NyaWJlKFxyXG4gICAgICB0aGlzLmdldEF1dGhEYXRhRnJvbVBvc3RNZXNzYWdlLmJpbmQodGhpcylcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgcG9sbGVyU3Vic2NyaXB0aW9uID0gcG9sbGVyT2JzZXJ2LnN1YnNjcmliZSgoKSA9PiB7XHJcbiAgICAgIGlmIChhdXRoV2luZG93LmNsb3NlZCkge1xyXG4gICAgICAgIHBvbGxlclN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGF1dGhXaW5kb3cucG9zdE1lc3NhZ2UoJ3JlcXVlc3RDcmVkZW50aWFscycsICcqJyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiByZXNwb25zZU9ic2VydjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgb0F1dGhXaW5kb3dSZXNwb25zZUZpbHRlcihkYXRhOiBhbnkpOiBhbnkge1xyXG4gICAgaWYgKGRhdGEubWVzc2FnZSA9PT0gJ2RlbGl2ZXJDcmVkZW50aWFscycgfHwgZGF0YS5tZXNzYWdlID09PSAnYXV0aEZhaWx1cmUnKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICogVXRpbGl0aWVzXHJcbiAgICpcclxuICAgKi9cclxuXHJcbiAgLy8gTWF0Y2ggdXNlciBjb25maWcgYnkgdXNlciBjb25maWcgbmFtZVxyXG4gIHByaXZhdGUgZ2V0VXNlclR5cGVCeU5hbWUobmFtZTogc3RyaW5nKTogVXNlclR5cGUge1xyXG4gICAgaWYgKG5hbWUgPT0gbnVsbCB8fCB0aGlzLm9wdGlvbnMudXNlclR5cGVzID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXMub3B0aW9ucy51c2VyVHlwZXMuZmluZChcclxuICAgICAgdXNlclR5cGUgPT4gdXNlclR5cGUubmFtZSA9PT0gbmFtZVxyXG4gICAgKTtcclxuICB9XHJcbn1cclxuIl19