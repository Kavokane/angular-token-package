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
    set currentAuthData(authData) {
        if (this.checkAuthData(authData)) {
            this.authData.next(authData);
        }
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
    updateCurrentAuthData(authData) {
        if (this.checkAuthData(authData)) {
            this.authData.next(authData);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ndWxhci10b2tlbi5zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vcHJvamVjdHMvYW5ndWxhci10b2tlbi9zcmMvbGliL2FuZ3VsYXItdG9rZW4uc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRW5ELE9BQU8sRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFDeEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWhFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDOzs7O0FBc0I5RCxNQUFNLE9BQU8sbUJBQW1CO0lBOEM5QixZQUNVLElBQWdCLEVBQ08sTUFBVyxFQUNiLFVBQWtCLEVBQzNCLGNBQThCLEVBQzlCLE1BQWM7UUFKMUIsU0FBSSxHQUFKLElBQUksQ0FBWTtRQUVLLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDM0IsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQzlCLFdBQU0sR0FBTixNQUFNLENBQVE7UUFaN0IsYUFBUSxHQUE4QixJQUFJLGVBQWUsQ0FBVyxJQUFJLENBQUMsQ0FBQztRQUMxRSxhQUFRLEdBQThCLElBQUksZUFBZSxDQUFXLElBQUksQ0FBQyxDQUFDO1FBQzFFLGFBQVEsR0FBOEIsSUFBSSxlQUFlLENBQVcsSUFBSSxDQUFDLENBQUM7UUFHekUsaUJBQVksR0FBa0IsRUFBRSxDQUFDO1FBU3ZDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxPQUFPLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFD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SUFBSSxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLElBQUksRUFBRTtZQUNsRCxPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQ2hDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxJQUFJLENBQ25DLENBQUM7SUFDSixDQUFDOztzRkF0b0JVLG1CQUFtQiwwQ0FnRHBCLHFCQUFxQixlQUNyQixXQUFXO3lFQWpEVixtQkFBbUIsV0FBbkIsbUJBQW1CLG1CQUZsQixNQUFNO3VGQUVQLG1CQUFtQjtjQUgvQixVQUFVO2VBQUM7Z0JBQ1YsVUFBVSxFQUFFLE1BQU07YUFDbkI7O3NCQWlESSxNQUFNO3VCQUFDLHFCQUFxQjs7c0JBQzVCLE1BQU07dUJBQUMsV0FBVzs7c0JBQ2xCLFFBQVE7O3NCQUNSLFFBQVEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJbmplY3RhYmxlLCBPcHRpb25hbCwgSW5qZWN0LCBQTEFURk9STV9JRCB9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xyXG5pbXBvcnQgeyBBY3RpdmF0ZWRSb3V0ZSwgUm91dGVyLCBDYW5BY3RpdmF0ZSwgQWN0aXZhdGVkUm91dGVTbmFwc2hvdCwgUm91dGVyU3RhdGVTbmFwc2hvdCB9IGZyb20gJ0Bhbmd1bGFyL3JvdXRlcic7XHJcbmltcG9ydCB7IEh0dHBDbGllbnQsIEh0dHBSZXNwb25zZSwgSHR0cEVycm9yUmVzcG9uc2UgfSBmcm9tICdAYW5ndWxhci9jb21tb24vaHR0cCc7XHJcbmltcG9ydCB7IGlzUGxhdGZvcm1TZXJ2ZXIgfSBmcm9tICdAYW5ndWxhci9jb21tb24nO1xyXG5cclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgZnJvbUV2ZW50LCBpbnRlcnZhbCwgQmVoYXZpb3JTdWJqZWN0IH0gZnJvbSAncnhqcyc7XHJcbmltcG9ydCB7IHBsdWNrLCBmaWx0ZXIsIHNoYXJlLCBmaW5hbGl6ZSB9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcclxuXHJcbmltcG9ydCB7IEFOR1VMQVJfVE9LRU5fT1BUSU9OUyB9IGZyb20gJy4vYW5ndWxhci10b2tlbi50b2tlbic7XHJcblxyXG5pbXBvcnQge1xyXG4gIFNpZ25JbkRhdGEsXHJcbiAgUmVnaXN0ZXJEYXRhLFxyXG4gIFVwZGF0ZVBhc3N3b3JkRGF0YSxcclxuICBSZXNldFBhc3N3b3JkRGF0YSxcclxuXHJcbiAgVXNlclR5cGUsXHJcbiAgVXNlckRhdGEsXHJcbiAgQXV0aERhdGEsXHJcbiAgQXBpUmVzcG9uc2UsXHJcblxyXG4gIEFuZ3VsYXJUb2tlbk9wdGlvbnMsXHJcblxyXG4gIFRva2VuUGxhdGZvcm0sXHJcbiAgVG9rZW5JbkFwcEJyb3dzZXIsXHJcbn0gZnJvbSAnLi9hbmd1bGFyLXRva2VuLm1vZGVsJztcclxuXHJcbkBJbmplY3RhYmxlKHtcclxuICBwcm92aWRlZEluOiAncm9vdCcsXHJcbn0pXHJcbmV4cG9ydCBjbGFzcyBBbmd1bGFyVG9rZW5TZXJ2aWNlIGltcGxlbWVudHMgQ2FuQWN0aXZhdGUge1xyXG5cclxuICBnZXQgY3VycmVudFVzZXJUeXBlKCk6IHN0cmluZyB7XHJcbiAgICBpZiAodGhpcy51c2VyVHlwZS52YWx1ZSAhPSBudWxsKSB7XHJcbiAgICAgIHJldHVybiB0aGlzLnVzZXJUeXBlLnZhbHVlLm5hbWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0IGN1cnJlbnRVc2VyRGF0YSgpOiBVc2VyRGF0YSB7XHJcbiAgICByZXR1cm4gdGhpcy51c2VyRGF0YS52YWx1ZTtcclxuICB9XHJcblxyXG4gIGdldCBjdXJyZW50QXV0aERhdGEoKTogQXV0aERhdGEge1xyXG4gICAgcmV0dXJuIHRoaXMuYXV0aERhdGEudmFsdWU7XHJcbiAgfVxyXG5cclxuICBzZXQgY3VycmVudEF1dGhEYXRhKGF1dGhEYXRhOiBBdXRoRGF0YSkge1xyXG4gICAgaWYgKHRoaXMuY2hlY2tBdXRoRGF0YShhdXRoRGF0YSkpIHtcclxuICAgICAgdGhpcy5hdXRoRGF0YS5uZXh0KGF1dGhEYXRhKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldCBhcGlCYXNlKCk6IHN0cmluZyB7XHJcbiAgICBjb25zb2xlLndhcm4oJ1thbmd1bGFyLXRva2VuXSBUaGUgYXR0cmlidXRlIC5hcGlCYXNlIHdpbGwgYmUgcmVtb3ZlZCBpbiB0aGUgbmV4dCBtYWpvciByZWxlYXNlLCBwbGVhc2UgdXNlJyArXHJcbiAgICAnLnRva2VuT3B0aW9ucy5hcGlCYXNlIGluc3RlYWQnKTtcclxuICAgIHJldHVybiB0aGlzLm9wdGlvbnMuYXBpQmFzZTtcclxuICB9XHJcblxyXG4gIGdldCB0b2tlbk9wdGlvbnMoKTogQW5ndWxhclRva2VuT3B0aW9ucyB7XHJcbiAgICByZXR1cm4gdGhpcy5vcHRpb25zO1xyXG4gIH1cclxuXHJcbiAgc2V0IHRva2VuT3B0aW9ucyhvcHRpb25zOiBBbmd1bGFyVG9rZW5PcHRpb25zKSB7XHJcbiAgICB0aGlzLm9wdGlvbnMgPSAoPGFueT5PYmplY3QpLmFzc2lnbih0aGlzLm9wdGlvbnMsIG9wdGlvbnMpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvcHRpb25zOiBBbmd1bGFyVG9rZW5PcHRpb25zO1xyXG4gIHB1YmxpYyB1c2VyVHlwZTogQmVoYXZpb3JTdWJqZWN0PFVzZXJUeXBlPiA9IG5ldyBCZWhhdmlvclN1YmplY3Q8VXNlclR5cGU+KG51bGwpO1xyXG4gIHB1YmxpYyBhdXRoRGF0YTogQmVoYXZpb3JTdWJqZWN0PEF1dGhEYXRhPiA9IG5ldyBCZWhhdmlvclN1YmplY3Q8QXV0aERhdGE+KG51bGwpO1xyXG4gIHB1YmxpYyB1c2VyRGF0YTogQmVoYXZpb3JTdWJqZWN0PFVzZXJEYXRhPiA9IG5ldyBCZWhhdmlvclN1YmplY3Q8VXNlckRhdGE+KG51bGwpO1xyXG4gIHByaXZhdGUgZ2xvYmFsOiBXaW5kb3cgfCBhbnk7XHJcblxyXG4gIHByaXZhdGUgbG9jYWxTdG9yYWdlOiBTdG9yYWdlIHwgYW55ID0ge307XHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcHJpdmF0ZSBodHRwOiBIdHRwQ2xpZW50LFxyXG4gICAgQEluamVjdChBTkdVTEFSX1RPS0VOX09QVElPTlMpIGNvbmZpZzogYW55LFxyXG4gICAgQEluamVjdChQTEFURk9STV9JRCkgcHJpdmF0ZSBwbGF0Zm9ybUlkOiBPYmplY3QsXHJcbiAgICBAT3B0aW9uYWwoKSBwcml2YXRlIGFjdGl2YXRlZFJvdXRlOiBBY3RpdmF0ZWRSb3V0ZSxcclxuICAgIEBPcHRpb25hbCgpIHByaXZhdGUgcm91dGVyOiBSb3V0ZXJcclxuICApIHtcclxuICAgIHRoaXMuZ2xvYmFsID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHdpbmRvdyA6IHt9O1xyXG5cclxuICAgIGlmIChpc1BsYXRmb3JtU2VydmVyKHRoaXMucGxhdGZvcm1JZCkpIHtcclxuXHJcbiAgICAgIC8vIEJhZCBwcmF0aWNlLCBuZWVkcyBmaXhpbmdcclxuICAgICAgdGhpcy5nbG9iYWwgPSB7XHJcbiAgICAgICAgb3BlbjogKCk6IHZvaWQgPT4gbnVsbCxcclxuICAgICAgICBsb2NhdGlvbjoge1xyXG4gICAgICAgICAgaHJlZjogJy8nLFxyXG4gICAgICAgICAgb3JpZ2luOiAnLydcclxuICAgICAgICB9XHJcbiAgICAgIH07XHJcblxyXG4gICAgICAvLyBCYWQgcHJhdGljZSwgbmVlZHMgZml4aW5nXHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0gPSAoKTogdm9pZCA9PiBudWxsO1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZS5nZXRJdGVtID0gKCk6IHZvaWQgPT4gbnVsbDtcclxuICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSA9ICgpOiB2b2lkID0+IG51bGw7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLmxvY2FsU3RvcmFnZSA9IGxvY2FsU3RvcmFnZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9uczogQW5ndWxhclRva2VuT3B0aW9ucyA9IHtcclxuICAgICAgYXBpUGF0aDogICAgICAgICAgICAgICAgICAgIG51bGwsXHJcbiAgICAgIGFwaUJhc2U6ICAgICAgICAgICAgICAgICAgICBudWxsLFxyXG5cclxuICAgICAgc2lnbkluUGF0aDogICAgICAgICAgICAgICAgICdhdXRoL3NpZ25faW4nLFxyXG4gICAgICBzaWduSW5SZWRpcmVjdDogICAgICAgICAgICAgbnVsbCxcclxuICAgICAgc2lnbkluU3RvcmVkVXJsU3RvcmFnZUtleTogIG51bGwsXHJcblxyXG4gICAgICBzaWduT3V0UGF0aDogICAgICAgICAgICAgICAgJ2F1dGgvc2lnbl9vdXQnLFxyXG4gICAgICB2YWxpZGF0ZVRva2VuUGF0aDogICAgICAgICAgJ2F1dGgvdmFsaWRhdGVfdG9rZW4nLFxyXG4gICAgICBzaWduT3V0RmFpbGVkVmFsaWRhdGU6ICAgICAgZmFsc2UsXHJcblxyXG4gICAgICByZWdpc3RlckFjY291bnRQYXRoOiAgICAgICAgJ2F1dGgnLFxyXG4gICAgICBkZWxldGVBY2NvdW50UGF0aDogICAgICAgICAgJ2F1dGgnLFxyXG4gICAgICByZWdpc3RlckFjY291bnRDYWxsYmFjazogICAgdGhpcy5nbG9iYWwubG9jYXRpb24uaHJlZixcclxuXHJcbiAgICAgIHVwZGF0ZVBhc3N3b3JkUGF0aDogICAgICAgICAnYXV0aCcsXHJcblxyXG4gICAgICByZXNldFBhc3N3b3JkUGF0aDogICAgICAgICAgJ2F1dGgvcGFzc3dvcmQnLFxyXG4gICAgICByZXNldFBhc3N3b3JkQ2FsbGJhY2s6ICAgICAgdGhpcy5nbG9iYWwubG9jYXRpb24uaHJlZixcclxuXHJcbiAgICAgIHVzZXJUeXBlczogICAgICAgICAgICAgICAgICBudWxsLFxyXG4gICAgICBsb2dpbkZpZWxkOiAgICAgICAgICAgICAgICAgJ2VtYWlsJyxcclxuXHJcbiAgICAgIG9BdXRoQmFzZTogICAgICAgICAgICAgICAgICB0aGlzLmdsb2JhbC5sb2NhdGlvbi5vcmlnaW4sXHJcbiAgICAgIG9BdXRoUGF0aHM6IHtcclxuICAgICAgICBnaXRodWI6ICAgICAgICAgICAgICAgICAgICdhdXRoL2dpdGh1YidcclxuICAgICAgfSxcclxuICAgICAgb0F1dGhDYWxsYmFja1BhdGg6ICAgICAgICAgICdvYXV0aF9jYWxsYmFjaycsXHJcbiAgICAgIG9BdXRoV2luZG93VHlwZTogICAgICAgICAgICAnbmV3V2luZG93JyxcclxuICAgICAgb0F1dGhXaW5kb3dPcHRpb25zOiAgICAgICAgIG51bGwsXHJcblxyXG4gICAgICBvQXV0aEJyb3dzZXJDYWxsYmFja3M6IHtcclxuICAgICAgICBnaXRodWI6ICAgICAgICAgICAgICAgICAgICdhdXRoL2dpdGh1Yi9jYWxsYmFjaycsXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IG1lcmdlZE9wdGlvbnMgPSAoPGFueT5PYmplY3QpLmFzc2lnbihkZWZhdWx0T3B0aW9ucywgY29uZmlnKTtcclxuICAgIHRoaXMub3B0aW9ucyA9IG1lcmdlZE9wdGlvbnM7XHJcblxyXG4gICAgaWYgKHRoaXMub3B0aW9ucy5hcGlCYXNlID09PSBudWxsKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybihgW2FuZ3VsYXItdG9rZW5dIFlvdSBoYXZlIG5vdCBjb25maWd1cmVkICdhcGlCYXNlJywgd2hpY2ggbWF5IHJlc3VsdCBpbiBzZWN1cml0eSBpc3N1ZXMuIGAgK1xyXG4gICAgICAgICAgICAgICAgICAgYFBsZWFzZSByZWZlciB0byB0aGUgZG9jdW1lbnRhdGlvbiBhdCBodHRwczovL2dpdGh1Yi5jb20vbmVyb25pYWt5L2FuZ3VsYXItdG9rZW4vd2lraWApO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMudHJ5TG9hZEF1dGhEYXRhKCk7XHJcbiAgfVxyXG5cclxuICB1cGRhdGVDdXJyZW50QXV0aERhdGEoYXV0aERhdGE6IEF1dGhEYXRhKSB7XHJcbiAgICBpZiAodGhpcy5jaGVja0F1dGhEYXRhKGF1dGhEYXRhKSkge1xyXG4gICAgICB0aGlzLmF1dGhEYXRhLm5leHQoYXV0aERhdGEpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgdXNlclNpZ25lZEluKCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMuYXV0aERhdGEudmFsdWUgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNhbkFjdGl2YXRlKHJvdXRlOiBBY3RpdmF0ZWRSb3V0ZVNuYXBzaG90LCBzdGF0ZTogUm91dGVyU3RhdGVTbmFwc2hvdCk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKHRoaXMudXNlclNpZ25lZEluKCkpIHtcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBTdG9yZSBjdXJyZW50IGxvY2F0aW9uIGluIHN0b3JhZ2UgKHVzZWZ1bGwgZm9yIHJlZGlyZWN0aW9uIGFmdGVyIHNpZ25pbmcgaW4pXHJcbiAgICAgIGlmICh0aGlzLm9wdGlvbnMuc2lnbkluU3RvcmVkVXJsU3RvcmFnZUtleSkge1xyXG4gICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oXHJcbiAgICAgICAgICB0aGlzLm9wdGlvbnMuc2lnbkluU3RvcmVkVXJsU3RvcmFnZUtleSxcclxuICAgICAgICAgIHN0YXRlLnVybFxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlZGlyZWN0IHVzZXIgdG8gc2lnbiBpbiBpZiBzaWduSW5SZWRpcmVjdCBpcyBzZXRcclxuICAgICAgaWYgKHRoaXMucm91dGVyICYmIHRoaXMub3B0aW9ucy5zaWduSW5SZWRpcmVjdCkge1xyXG4gICAgICAgIHRoaXMucm91dGVyLm5hdmlnYXRlKFt0aGlzLm9wdGlvbnMuc2lnbkluUmVkaXJlY3RdKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICogQWN0aW9uc1xyXG4gICAqXHJcbiAgICovXHJcblxyXG4gIC8vIFJlZ2lzdGVyIHJlcXVlc3RcclxuICByZWdpc3RlckFjY291bnQocmVnaXN0ZXJEYXRhOiBSZWdpc3RlckRhdGEsIGFkZGl0aW9uYWxEYXRhPzogYW55KTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG5cclxuICAgIHJlZ2lzdGVyRGF0YSA9IE9iamVjdC5hc3NpZ24oe30sIHJlZ2lzdGVyRGF0YSk7XHJcblxyXG4gICAgaWYgKHJlZ2lzdGVyRGF0YS51c2VyVHlwZSA9PSBudWxsKSB7XHJcbiAgICAgIHRoaXMudXNlclR5cGUubmV4dChudWxsKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXNlclR5cGUubmV4dCh0aGlzLmdldFVzZXJUeXBlQnlOYW1lKHJlZ2lzdGVyRGF0YS51c2VyVHlwZSkpO1xyXG4gICAgICBkZWxldGUgcmVnaXN0ZXJEYXRhLnVzZXJUeXBlO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChcclxuICAgICAgcmVnaXN0ZXJEYXRhLnBhc3N3b3JkX2NvbmZpcm1hdGlvbiA9PSBudWxsICYmXHJcbiAgICAgIHJlZ2lzdGVyRGF0YS5wYXNzd29yZENvbmZpcm1hdGlvbiAhPSBudWxsXHJcbiAgICApIHtcclxuICAgICAgcmVnaXN0ZXJEYXRhLnBhc3N3b3JkX2NvbmZpcm1hdGlvbiA9IHJlZ2lzdGVyRGF0YS5wYXNzd29yZENvbmZpcm1hdGlvbjtcclxuICAgICAgZGVsZXRlIHJlZ2lzdGVyRGF0YS5wYXNzd29yZENvbmZpcm1hdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYWRkaXRpb25hbERhdGEgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICByZWdpc3RlckRhdGEuYWRkaXRpb25hbERhdGEgPSBhZGRpdGlvbmFsRGF0YTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBsb2dpbiA9IHJlZ2lzdGVyRGF0YS5sb2dpbjtcclxuICAgIGRlbGV0ZSByZWdpc3RlckRhdGEubG9naW47XHJcbiAgICByZWdpc3RlckRhdGFbdGhpcy5vcHRpb25zLmxvZ2luRmllbGRdID0gbG9naW47XHJcblxyXG4gICAgcmVnaXN0ZXJEYXRhLmNvbmZpcm1fc3VjY2Vzc191cmwgPSB0aGlzLm9wdGlvbnMucmVnaXN0ZXJBY2NvdW50Q2FsbGJhY2s7XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuaHR0cC5wb3N0PEFwaVJlc3BvbnNlPihcclxuICAgICAgdGhpcy5nZXRTZXJ2ZXJQYXRoKCkgKyB0aGlzLm9wdGlvbnMucmVnaXN0ZXJBY2NvdW50UGF0aCwgcmVnaXN0ZXJEYXRhXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLy8gRGVsZXRlIEFjY291bnRcclxuICBkZWxldGVBY2NvdW50KCk6IE9ic2VydmFibGU8QXBpUmVzcG9uc2U+IHtcclxuICAgIHJldHVybiB0aGlzLmh0dHAuZGVsZXRlPEFwaVJlc3BvbnNlPih0aGlzLmdldFNlcnZlclBhdGgoKSArIHRoaXMub3B0aW9ucy5kZWxldGVBY2NvdW50UGF0aCk7XHJcbiAgfVxyXG5cclxuICAvLyBTaWduIGluIHJlcXVlc3QgYW5kIHNldCBzdG9yYWdlXHJcbiAgc2lnbkluKHNpZ25JbkRhdGE6IFNpZ25JbkRhdGEsIGFkZGl0aW9uYWxEYXRhPzogYW55KTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG4gICAgdGhpcy51c2VyVHlwZS5uZXh0KChzaWduSW5EYXRhLnVzZXJUeXBlID09IG51bGwpID8gbnVsbCA6IHRoaXMuZ2V0VXNlclR5cGVCeU5hbWUoc2lnbkluRGF0YS51c2VyVHlwZSkpO1xyXG5cclxuICAgIGNvbnN0IGJvZHkgPSB7XHJcbiAgICAgIFt0aGlzLm9wdGlvbnMubG9naW5GaWVsZF06IHNpZ25JbkRhdGEubG9naW4sXHJcbiAgICAgIHBhc3N3b3JkOiBzaWduSW5EYXRhLnBhc3N3b3JkXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChhZGRpdGlvbmFsRGF0YSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIGJvZHkuYWRkaXRpb25hbERhdGEgPSBhZGRpdGlvbmFsRGF0YTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBvYnNlcnYgPSB0aGlzLmh0dHAucG9zdDxBcGlSZXNwb25zZT4oXHJcbiAgICAgIHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnNpZ25JblBhdGgsIGJvZHlcclxuICAgICkucGlwZShzaGFyZSgpKTtcclxuXHJcbiAgICBvYnNlcnYuc3Vic2NyaWJlKHJlcyA9PiB0aGlzLnVzZXJEYXRhLm5leHQocmVzLmRhdGEpKTtcclxuXHJcbiAgICByZXR1cm4gb2JzZXJ2O1xyXG4gIH1cclxuXHJcbiAgc2lnbkluT0F1dGgob0F1dGhUeXBlOiBzdHJpbmcsIGluQXBwQnJvd3Nlcj86IFRva2VuSW5BcHBCcm93c2VyPGFueSwgYW55PiwgcGxhdGZvcm0/OiBUb2tlblBsYXRmb3JtKSB7XHJcblxyXG4gICAgY29uc3Qgb0F1dGhQYXRoOiBzdHJpbmcgPSB0aGlzLmdldE9BdXRoUGF0aChvQXV0aFR5cGUpO1xyXG4gICAgY29uc3QgY2FsbGJhY2tVcmwgPSBgJHt0aGlzLmdsb2JhbC5sb2NhdGlvbi5vcmlnaW59LyR7dGhpcy5vcHRpb25zLm9BdXRoQ2FsbGJhY2tQYXRofWA7XHJcbiAgICBjb25zdCBvQXV0aFdpbmRvd1R5cGU6IHN0cmluZyA9IHRoaXMub3B0aW9ucy5vQXV0aFdpbmRvd1R5cGU7XHJcbiAgICBjb25zdCBhdXRoVXJsOiBzdHJpbmcgPSB0aGlzLmdldE9BdXRoVXJsKG9BdXRoUGF0aCwgY2FsbGJhY2tVcmwsIG9BdXRoV2luZG93VHlwZSk7XHJcblxyXG4gICAgaWYgKG9BdXRoV2luZG93VHlwZSA9PT0gJ25ld1dpbmRvdycgfHxcclxuICAgICAgKG9BdXRoV2luZG93VHlwZSA9PSAnaW5BcHBCcm93c2VyJyAmJiAoIXBsYXRmb3JtIHx8ICFwbGF0Zm9ybS5pcygnY29yZG92YScpIHx8ICEocGxhdGZvcm0uaXMoJ2lvcycpIHx8IHBsYXRmb3JtLmlzKCdhbmRyb2lkJykpKSkpIHtcclxuICAgICAgY29uc3Qgb0F1dGhXaW5kb3dPcHRpb25zID0gdGhpcy5vcHRpb25zLm9BdXRoV2luZG93T3B0aW9ucztcclxuICAgICAgbGV0IHdpbmRvd09wdGlvbnMgPSAnJztcclxuXHJcbiAgICAgIGlmIChvQXV0aFdpbmRvd09wdGlvbnMpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBvQXV0aFdpbmRvd09wdGlvbnMpIHtcclxuICAgICAgICAgIGlmIChvQXV0aFdpbmRvd09wdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgICAgIHdpbmRvd09wdGlvbnMgKz0gYCwke2tleX09JHtvQXV0aFdpbmRvd09wdGlvbnNba2V5XX1gO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgcG9wdXAgPSB3aW5kb3cub3BlbihcclxuICAgICAgICAgIGF1dGhVcmwsXHJcbiAgICAgICAgICAnX2JsYW5rJyxcclxuICAgICAgICAgIGBjbG9zZWJ1dHRvbmNhcHRpb249Q2FuY2VsJHt3aW5kb3dPcHRpb25zfWBcclxuICAgICAgKTtcclxuICAgICAgcmV0dXJuIHRoaXMucmVxdWVzdENyZWRlbnRpYWxzVmlhUG9zdE1lc3NhZ2UocG9wdXApO1xyXG4gICAgfSBlbHNlIGlmIChvQXV0aFdpbmRvd1R5cGUgPT0gJ2luQXBwQnJvd3NlcicpIHtcclxuICAgICAgbGV0IG9BdXRoQnJvd3NlckNhbGxiYWNrID0gdGhpcy5vcHRpb25zLm9BdXRoQnJvd3NlckNhbGxiYWNrc1tvQXV0aFR5cGVdO1xyXG4gICAgICBpZiAoIW9BdXRoQnJvd3NlckNhbGxiYWNrKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUbyBsb2dpbiB3aXRoIG9BdXRoIHByb3ZpZGVyICR7b0F1dGhUeXBlfSB1c2luZyBpbkFwcEJyb3dzZXIgdGhlIGNhbGxiYWNrIChpbiBvQXV0aEJyb3dzZXJDYWxsYmFja3MpIGlzIHJlcXVpcmVkLmApO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIGxldCBvQXV0aFdpbmRvd09wdGlvbnMgPSB0aGlzLm9wdGlvbnMub0F1dGhXaW5kb3dPcHRpb25zO1xyXG4gICAgICAvLyBsZXQgd2luZG93T3B0aW9ucyA9ICcnO1xyXG5cclxuICAgICAgLy8gIGlmIChvQXV0aFdpbmRvd09wdGlvbnMpIHtcclxuICAgICAgLy8gICAgIGZvciAobGV0IGtleSBpbiBvQXV0aFdpbmRvd09wdGlvbnMpIHtcclxuICAgICAgLy8gICAgICAgICB3aW5kb3dPcHRpb25zICs9IGAsJHtrZXl9PSR7b0F1dGhXaW5kb3dPcHRpb25zW2tleV19YDtcclxuICAgICAgLy8gICAgIH1cclxuICAgICAgLy8gfVxyXG5cclxuICAgICAgbGV0IGJyb3dzZXIgPSBpbkFwcEJyb3dzZXIuY3JlYXRlKFxyXG4gICAgICAgICAgYXV0aFVybCxcclxuICAgICAgICAgICdfYmxhbmsnLFxyXG4gICAgICAgICAgJ2xvY2F0aW9uPW5vJ1xyXG4gICAgICApO1xyXG5cclxuICAgICAgcmV0dXJuIG5ldyBPYnNlcnZhYmxlKChvYnNlcnZlcikgPT4ge1xyXG4gICAgICAgIGJyb3dzZXIub24oJ2xvYWRzdG9wJykuc3Vic2NyaWJlKChldjogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAoZXYudXJsLmluZGV4T2Yob0F1dGhCcm93c2VyQ2FsbGJhY2spID4gLTEpIHtcclxuICAgICAgICAgICAgYnJvd3Nlci5leGVjdXRlU2NyaXB0KHtjb2RlOiBcInJlcXVlc3RDcmVkZW50aWFscygpO1wifSkudGhlbigoY3JlZGVudGlhbHM6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMuZ2V0QXV0aERhdGFGcm9tUG9zdE1lc3NhZ2UoY3JlZGVudGlhbHNbMF0pO1xyXG5cclxuICAgICAgICAgICAgICBsZXQgcG9sbGVyT2JzZXJ2ID0gaW50ZXJ2YWwoNDAwKTtcclxuXHJcbiAgICAgICAgICAgICAgbGV0IHBvbGxlclN1YnNjcmlwdGlvbiA9IHBvbGxlck9ic2Vydi5zdWJzY3JpYmUoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudXNlclNpZ25lZEluKCkpIHtcclxuICAgICAgICAgICAgICAgICAgb2JzZXJ2ZXIubmV4dCh0aGlzLmF1dGhEYXRhKTtcclxuICAgICAgICAgICAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgIHBvbGxlclN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xyXG4gICAgICAgICAgICAgICAgICBicm93c2VyLmNsb3NlKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSwgKGVycm9yOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAgIG9ic2VydmVyLmVycm9yKGVycm9yKTtcclxuICAgICAgICAgICAgICAgIG9ic2VydmVyLmNvbXBsZXRlKCk7XHJcbiAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSwgKGVycm9yOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICBvYnNlcnZlci5lcnJvcihlcnJvcik7XHJcbiAgICAgICAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGUoKTtcclxuICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCAoZXJyb3I6IGFueSkgPT4ge1xyXG4gICAgICAgICAgb2JzZXJ2ZXIuZXJyb3IoZXJyb3IpO1xyXG4gICAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGUoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgIH0gZWxzZSBpZiAob0F1dGhXaW5kb3dUeXBlID09PSAnc2FtZVdpbmRvdycpIHtcclxuICAgICAgdGhpcy5nbG9iYWwubG9jYXRpb24uaHJlZiA9IGF1dGhVcmw7XHJcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIG9BdXRoV2luZG93VHlwZSBcIiR7b0F1dGhXaW5kb3dUeXBlfVwiYCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcm9jZXNzT0F1dGhDYWxsYmFjaygpOiB2b2lkIHtcclxuICAgIHRoaXMuZ2V0QXV0aERhdGFGcm9tUGFyYW1zKCk7XHJcbiAgfVxyXG5cclxuICAvLyBTaWduIG91dCByZXF1ZXN0IGFuZCBkZWxldGUgc3RvcmFnZVxyXG4gIHNpZ25PdXQoKTogT2JzZXJ2YWJsZTxBcGlSZXNwb25zZT4ge1xyXG4gICAgcmV0dXJuIHRoaXMuaHR0cC5kZWxldGU8QXBpUmVzcG9uc2U+KHRoaXMuZ2V0U2VydmVyUGF0aCgpICsgdGhpcy5vcHRpb25zLnNpZ25PdXRQYXRoKVxyXG4gICAgICAvLyBPbmx5IHJlbW92ZSB0aGUgbG9jYWxTdG9yYWdlIGFuZCBjbGVhciB0aGUgZGF0YSBhZnRlciB0aGUgY2FsbFxyXG4gICAgICAucGlwZShcclxuICAgICAgICBmaW5hbGl6ZSgoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ2FjY2Vzc1Rva2VuJyk7XHJcbiAgICAgICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ2NsaWVudCcpO1xyXG4gICAgICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdleHBpcnknKTtcclxuICAgICAgICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgndG9rZW5UeXBlJyk7XHJcbiAgICAgICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ3VpZCcpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5hdXRoRGF0YS5uZXh0KG51bGwpO1xyXG4gICAgICAgICAgICB0aGlzLnVzZXJUeXBlLm5leHQobnVsbCk7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckRhdGEubmV4dChudWxsKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICApXHJcbiAgICAgICk7XHJcbiAgfVxyXG5cclxuICAvLyBWYWxpZGF0ZSB0b2tlbiByZXF1ZXN0XHJcbiAgdmFsaWRhdGVUb2tlbigpOiBPYnNlcnZhYmxlPEFwaVJlc3BvbnNlPiB7XHJcbiAgICBjb25zdCBvYnNlcnYgPSB0aGlzLmh0dHAuZ2V0PEFwaVJlc3BvbnNlPihcclxuICAgICAgdGhpcy5nZXRTZXJ2ZXJQYXRoKCkgKyB0aGlzLm9wdGlvbnMudmFsaWRhdGVUb2tlblBhdGhcclxuICAgICkucGlwZShzaGFyZSgpKTtcclxuXHJcbiAgICBvYnNlcnYuc3Vic2NyaWJlKFxyXG4gICAgICAocmVzKSA9PiB0aGlzLnVzZXJEYXRhLm5leHQocmVzLmRhdGEpLFxyXG4gICAgICAoZXJyb3IpID0+IHtcclxuICAgICAgICBpZiAoZXJyb3Iuc3RhdHVzID09PSA0MDEgJiYgdGhpcy5vcHRpb25zLnNpZ25PdXRGYWlsZWRWYWxpZGF0ZSkge1xyXG4gICAgICAgICAgdGhpcy5zaWduT3V0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIG9ic2VydjtcclxuICB9XHJcblxyXG4gIC8vIFVwZGF0ZSBwYXNzd29yZCByZXF1ZXN0XHJcbiAgdXBkYXRlUGFzc3dvcmQodXBkYXRlUGFzc3dvcmREYXRhOiBVcGRhdGVQYXNzd29yZERhdGEpOiBPYnNlcnZhYmxlPEFwaVJlc3BvbnNlPiB7XHJcblxyXG4gICAgaWYgKHVwZGF0ZVBhc3N3b3JkRGF0YS51c2VyVHlwZSAhPSBudWxsKSB7XHJcbiAgICAgIHRoaXMudXNlclR5cGUubmV4dCh0aGlzLmdldFVzZXJUeXBlQnlOYW1lKHVwZGF0ZVBhc3N3b3JkRGF0YS51c2VyVHlwZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBhcmdzOiBhbnk7XHJcblxyXG4gICAgaWYgKHVwZGF0ZVBhc3N3b3JkRGF0YS5wYXNzd29yZEN1cnJlbnQgPT0gbnVsbCkge1xyXG4gICAgICBhcmdzID0ge1xyXG4gICAgICAgIHBhc3N3b3JkOiAgICAgICAgICAgICAgIHVwZGF0ZVBhc3N3b3JkRGF0YS5wYXNzd29yZCxcclxuICAgICAgICBwYXNzd29yZF9jb25maXJtYXRpb246ICB1cGRhdGVQYXNzd29yZERhdGEucGFzc3dvcmRDb25maXJtYXRpb25cclxuICAgICAgfTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGFyZ3MgPSB7XHJcbiAgICAgICAgY3VycmVudF9wYXNzd29yZDogICAgICAgdXBkYXRlUGFzc3dvcmREYXRhLnBhc3N3b3JkQ3VycmVudCxcclxuICAgICAgICBwYXNzd29yZDogICAgICAgICAgICAgICB1cGRhdGVQYXNzd29yZERhdGEucGFzc3dvcmQsXHJcbiAgICAgICAgcGFzc3dvcmRfY29uZmlybWF0aW9uOiAgdXBkYXRlUGFzc3dvcmREYXRhLnBhc3N3b3JkQ29uZmlybWF0aW9uXHJcbiAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHVwZGF0ZVBhc3N3b3JkRGF0YS5yZXNldFBhc3N3b3JkVG9rZW4pIHtcclxuICAgICAgYXJncy5yZXNldF9wYXNzd29yZF90b2tlbiA9IHVwZGF0ZVBhc3N3b3JkRGF0YS5yZXNldFBhc3N3b3JkVG9rZW47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYm9keSA9IGFyZ3M7XHJcbiAgICByZXR1cm4gdGhpcy5odHRwLnB1dDxBcGlSZXNwb25zZT4odGhpcy5nZXRTZXJ2ZXJQYXRoKCkgKyB0aGlzLm9wdGlvbnMudXBkYXRlUGFzc3dvcmRQYXRoLCBib2R5KTtcclxuICB9XHJcblxyXG4gIC8vIFJlc2V0IHBhc3N3b3JkIHJlcXVlc3RcclxuICByZXNldFBhc3N3b3JkKHJlc2V0UGFzc3dvcmREYXRhOiBSZXNldFBhc3N3b3JkRGF0YSwgYWRkaXRpb25hbERhdGE/OiBhbnkpOiBPYnNlcnZhYmxlPEFwaVJlc3BvbnNlPiB7XHJcbiAgICBcclxuICAgIFxyXG4gICAgaWYgKGFkZGl0aW9uYWxEYXRhICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgcmVzZXRQYXNzd29yZERhdGEuYWRkaXRpb25hbERhdGEgPSBhZGRpdGlvbmFsRGF0YTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnVzZXJUeXBlLm5leHQoXHJcbiAgICAgIChyZXNldFBhc3N3b3JkRGF0YS51c2VyVHlwZSA9PSBudWxsKSA/IG51bGwgOiB0aGlzLmdldFVzZXJUeXBlQnlOYW1lKHJlc2V0UGFzc3dvcmREYXRhLnVzZXJUeXBlKVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBib2R5ID0ge1xyXG4gICAgICBbdGhpcy5vcHRpb25zLmxvZ2luRmllbGRdOiByZXNldFBhc3N3b3JkRGF0YS5sb2dpbixcclxuICAgICAgcmVkaXJlY3RfdXJsOiB0aGlzLm9wdGlvbnMucmVzZXRQYXNzd29yZENhbGxiYWNrXHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiB0aGlzLmh0dHAucG9zdDxBcGlSZXNwb25zZT4odGhpcy5nZXRTZXJ2ZXJQYXRoKCkgKyB0aGlzLm9wdGlvbnMucmVzZXRQYXNzd29yZFBhdGgsIGJvZHkpO1xyXG4gIH1cclxuXHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICogQ29uc3RydWN0IFBhdGhzIC8gVXJsc1xyXG4gICAqXHJcbiAgICovXHJcblxyXG4gIHByaXZhdGUgZ2V0VXNlclBhdGgoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiAodGhpcy51c2VyVHlwZS52YWx1ZSA9PSBudWxsKSA/ICcnIDogdGhpcy51c2VyVHlwZS52YWx1ZS5wYXRoICsgJy8nO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRBcGlQYXRoKCk6IHN0cmluZyB7XHJcbiAgICBsZXQgY29uc3RydWN0ZWRQYXRoID0gJyc7XHJcblxyXG4gICAgaWYgKHRoaXMub3B0aW9ucy5hcGlCYXNlICE9IG51bGwpIHtcclxuICAgICAgY29uc3RydWN0ZWRQYXRoICs9IHRoaXMub3B0aW9ucy5hcGlCYXNlICsgJy8nO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLm9wdGlvbnMuYXBpUGF0aCAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0cnVjdGVkUGF0aCArPSB0aGlzLm9wdGlvbnMuYXBpUGF0aCArICcvJztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY29uc3RydWN0ZWRQYXRoO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZXRTZXJ2ZXJQYXRoKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRBcGlQYXRoKCkgKyB0aGlzLmdldFVzZXJQYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGdldE9BdXRoUGF0aChvQXV0aFR5cGU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBsZXQgb0F1dGhQYXRoOiBzdHJpbmc7XHJcblxyXG4gICAgb0F1dGhQYXRoID0gdGhpcy5vcHRpb25zLm9BdXRoUGF0aHNbb0F1dGhUeXBlXTtcclxuXHJcbiAgICBpZiAob0F1dGhQYXRoID09IG51bGwpIHtcclxuICAgICAgb0F1dGhQYXRoID0gYC9hdXRoLyR7b0F1dGhUeXBlfWA7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG9BdXRoUGF0aDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2V0T0F1dGhVcmwob0F1dGhQYXRoOiBzdHJpbmcsIGNhbGxiYWNrVXJsOiBzdHJpbmcsIHdpbmRvd1R5cGU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBsZXQgdXJsOiBzdHJpbmc7XHJcblxyXG4gICAgdXJsID0gICBgJHt0aGlzLm9wdGlvbnMub0F1dGhCYXNlfS8ke29BdXRoUGF0aH1gO1xyXG4gICAgdXJsICs9ICBgP29tbmlhdXRoX3dpbmRvd190eXBlPSR7d2luZG93VHlwZX1gO1xyXG4gICAgdXJsICs9ICBgJmF1dGhfb3JpZ2luX3VybD0ke2VuY29kZVVSSUNvbXBvbmVudChjYWxsYmFja1VybCl9YDtcclxuXHJcbiAgICBpZiAodGhpcy51c2VyVHlwZS52YWx1ZSAhPSBudWxsKSB7XHJcbiAgICAgIHVybCArPSBgJnJlc291cmNlX2NsYXNzPSR7dGhpcy51c2VyVHlwZS52YWx1ZS5uYW1lfWA7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHVybDtcclxuICB9XHJcblxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIEdldCBBdXRoIERhdGFcclxuICAgKlxyXG4gICAqL1xyXG5cclxuICAvLyBUcnkgdG8gbG9hZCBhdXRoIGRhdGFcclxuICBwcml2YXRlIHRyeUxvYWRBdXRoRGF0YSgpOiB2b2lkIHtcclxuXHJcbiAgICBjb25zdCB1c2VyVHlwZSA9IHRoaXMuZ2V0VXNlclR5cGVCeU5hbWUodGhpcy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndXNlclR5cGUnKSk7XHJcblxyXG4gICAgaWYgKHVzZXJUeXBlKSB7XHJcbiAgICAgIHRoaXMudXNlclR5cGUubmV4dCh1c2VyVHlwZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5nZXRBdXRoRGF0YUZyb21TdG9yYWdlKCk7XHJcblxyXG4gICAgaWYgKHRoaXMuYWN0aXZhdGVkUm91dGUpIHtcclxuICAgICAgdGhpcy5nZXRBdXRoRGF0YUZyb21QYXJhbXMoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBpZiAodGhpcy5hdXRoRGF0YSkge1xyXG4gICAgLy8gICAgIHRoaXMudmFsaWRhdGVUb2tlbigpO1xyXG4gICAgLy8gfVxyXG4gIH1cclxuXHJcbiAgLy8gUGFyc2UgQXV0aCBkYXRhIGZyb20gcmVzcG9uc2VcclxuICBwdWJsaWMgZ2V0QXV0aEhlYWRlcnNGcm9tUmVzcG9uc2UoZGF0YTogSHR0cFJlc3BvbnNlPGFueT4gfCBIdHRwRXJyb3JSZXNwb25zZSk6IHZvaWQge1xyXG4gICAgY29uc3QgaGVhZGVycyA9IGRhdGEuaGVhZGVycztcclxuXHJcbiAgICBjb25zdCBhdXRoRGF0YTogQXV0aERhdGEgPSB7XHJcbiAgICAgIGFjY2Vzc1Rva2VuOiAgICBoZWFkZXJzLmdldCgnYWNjZXNzLXRva2VuJyksXHJcbiAgICAgIGNsaWVudDogICAgICAgICBoZWFkZXJzLmdldCgnY2xpZW50JyksXHJcbiAgICAgIGV4cGlyeTogICAgICAgICBoZWFkZXJzLmdldCgnZXhwaXJ5JyksXHJcbiAgICAgIHRva2VuVHlwZTogICAgICBoZWFkZXJzLmdldCgndG9rZW4tdHlwZScpLFxyXG4gICAgICB1aWQ6ICAgICAgICAgICAgaGVhZGVycy5nZXQoJ3VpZCcpXHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuc2V0QXV0aERhdGEoYXV0aERhdGEpO1xyXG4gIH1cclxuXHJcbiAgLy8gUGFyc2UgQXV0aCBkYXRhIGZyb20gcG9zdCBtZXNzYWdlXHJcbiAgcHJpdmF0ZSBnZXRBdXRoRGF0YUZyb21Qb3N0TWVzc2FnZShkYXRhOiBhbnkpOiB2b2lkIHtcclxuICAgIGNvbnN0IGF1dGhEYXRhOiBBdXRoRGF0YSA9IHtcclxuICAgICAgYWNjZXNzVG9rZW46ICAgIGRhdGFbJ2F1dGhfdG9rZW4nXSxcclxuICAgICAgY2xpZW50OiAgICAgICAgIGRhdGFbJ2NsaWVudF9pZCddLFxyXG4gICAgICBleHBpcnk6ICAgICAgICAgZGF0YVsnZXhwaXJ5J10sXHJcbiAgICAgIHRva2VuVHlwZTogICAgICAnQmVhcmVyJyxcclxuICAgICAgdWlkOiAgICAgICAgICAgIGRhdGFbJ3VpZCddXHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuc2V0QXV0aERhdGEoYXV0aERhdGEpO1xyXG4gIH1cclxuXHJcbiAgLy8gVHJ5IHRvIGdldCBhdXRoIGRhdGEgZnJvbSBzdG9yYWdlLlxyXG4gIHB1YmxpYyBnZXRBdXRoRGF0YUZyb21TdG9yYWdlKCk6IHZvaWQge1xyXG5cclxuICAgIGNvbnN0IGF1dGhEYXRhOiBBdXRoRGF0YSA9IHtcclxuICAgICAgYWNjZXNzVG9rZW46ICAgIHRoaXMubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2FjY2Vzc1Rva2VuJyksXHJcbiAgICAgIGNsaWVudDogICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdjbGllbnQnKSxcclxuICAgICAgZXhwaXJ5OiAgICAgICAgIHRoaXMubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2V4cGlyeScpLFxyXG4gICAgICB0b2tlblR5cGU6ICAgICAgdGhpcy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgndG9rZW5UeXBlJyksXHJcbiAgICAgIHVpZDogICAgICAgICAgICB0aGlzLmxvY2FsU3RvcmFnZS5nZXRJdGVtKCd1aWQnKVxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAodGhpcy5jaGVja0F1dGhEYXRhKGF1dGhEYXRhKSkge1xyXG4gICAgICB0aGlzLmF1dGhEYXRhLm5leHQoYXV0aERhdGEpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gVHJ5IHRvIGdldCBhdXRoIGRhdGEgZnJvbSB1cmwgcGFyYW1ldGVycy5cclxuICBwcml2YXRlIGdldEF1dGhEYXRhRnJvbVBhcmFtcygpOiB2b2lkIHtcclxuICAgIHRoaXMuYWN0aXZhdGVkUm91dGUucXVlcnlQYXJhbXMuc3Vic2NyaWJlKHF1ZXJ5UGFyYW1zID0+IHtcclxuICAgICAgY29uc3QgYXV0aERhdGE6IEF1dGhEYXRhID0ge1xyXG4gICAgICAgIGFjY2Vzc1Rva2VuOiAgICBxdWVyeVBhcmFtc1sndG9rZW4nXSB8fCBxdWVyeVBhcmFtc1snYXV0aF90b2tlbiddLFxyXG4gICAgICAgIGNsaWVudDogICAgICAgICBxdWVyeVBhcmFtc1snY2xpZW50X2lkJ10sXHJcbiAgICAgICAgZXhwaXJ5OiAgICAgICAgIHF1ZXJ5UGFyYW1zWydleHBpcnknXSxcclxuICAgICAgICB0b2tlblR5cGU6ICAgICAgJ0JlYXJlcicsXHJcbiAgICAgICAgdWlkOiAgICAgICAgICAgIHF1ZXJ5UGFyYW1zWyd1aWQnXVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgaWYgKHRoaXMuY2hlY2tBdXRoRGF0YShhdXRoRGF0YSkpIHtcclxuICAgICAgICB0aGlzLmF1dGhEYXRhLm5leHQoYXV0aERhdGEpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICogU2V0IEF1dGggRGF0YVxyXG4gICAqXHJcbiAgICovXHJcblxyXG4gIC8vIFdyaXRlIGF1dGggZGF0YSB0byBzdG9yYWdlXHJcbiAgcHJpdmF0ZSBzZXRBdXRoRGF0YShhdXRoRGF0YTogQXV0aERhdGEpOiB2b2lkIHtcclxuICAgIGlmICh0aGlzLmNoZWNrQXV0aERhdGEoYXV0aERhdGEpKSB7XHJcblxyXG4gICAgICB0aGlzLmF1dGhEYXRhLm5leHQoYXV0aERhdGEpO1xyXG5cclxuICAgICAgdGhpcy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnYWNjZXNzVG9rZW4nLCBhdXRoRGF0YS5hY2Nlc3NUb2tlbik7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NsaWVudCcsIGF1dGhEYXRhLmNsaWVudCk7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2V4cGlyeScsIGF1dGhEYXRhLmV4cGlyeSk7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3Rva2VuVHlwZScsIGF1dGhEYXRhLnRva2VuVHlwZSk7XHJcbiAgICAgIHRoaXMubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3VpZCcsIGF1dGhEYXRhLnVpZCk7XHJcblxyXG4gICAgICBpZiAodGhpcy51c2VyVHlwZS52YWx1ZSAhPSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgndXNlclR5cGUnLCB0aGlzLnVzZXJUeXBlLnZhbHVlLm5hbWUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfVxyXG4gIH1cclxuXHJcblxyXG4gIC8qKlxyXG4gICAqXHJcbiAgICogVmFsaWRhdGUgQXV0aCBEYXRhXHJcbiAgICpcclxuICAgKi9cclxuXHJcbiAgLy8gQ2hlY2sgaWYgYXV0aCBkYXRhIGNvbXBsZXRlIGFuZCBpZiByZXNwb25zZSB0b2tlbiBpcyBuZXdlclxyXG4gIHByaXZhdGUgY2hlY2tBdXRoRGF0YShhdXRoRGF0YTogQXV0aERhdGEpOiBib29sZWFuIHtcclxuXHJcbiAgICBpZiAoXHJcbiAgICAgIGF1dGhEYXRhLmFjY2Vzc1Rva2VuICE9IG51bGwgJiZcclxuICAgICAgYXV0aERhdGEuY2xpZW50ICE9IG51bGwgJiZcclxuICAgICAgYXV0aERhdGEuZXhwaXJ5ICE9IG51bGwgJiZcclxuICAgICAgYXV0aERhdGEudG9rZW5UeXBlICE9IG51bGwgJiZcclxuICAgICAgYXV0aERhdGEudWlkICE9IG51bGxcclxuICAgICkge1xyXG4gICAgICBpZiAodGhpcy5hdXRoRGF0YS52YWx1ZSAhPSBudWxsKSB7XHJcbiAgICAgICAgcmV0dXJuIGF1dGhEYXRhLmV4cGlyeSA+PSB0aGlzLmF1dGhEYXRhLnZhbHVlLmV4cGlyeTtcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcblxyXG5cclxuICAvKipcclxuICAgKlxyXG4gICAqIE9BdXRoXHJcbiAgICpcclxuICAgKi9cclxuXHJcbiAgcHJpdmF0ZSByZXF1ZXN0Q3JlZGVudGlhbHNWaWFQb3N0TWVzc2FnZShhdXRoV2luZG93OiBhbnkpOiBPYnNlcnZhYmxlPGFueT4ge1xyXG4gICAgY29uc3QgcG9sbGVyT2JzZXJ2ID0gaW50ZXJ2YWwoNTAwKTtcclxuXHJcbiAgICBjb25zdCByZXNwb25zZU9ic2VydiA9IGZyb21FdmVudCh0aGlzLmdsb2JhbCwgJ21lc3NhZ2UnKS5waXBlKFxyXG4gICAgICBwbHVjaygnZGF0YScpLFxyXG4gICAgICBmaWx0ZXIodGhpcy5vQXV0aFdpbmRvd1Jlc3BvbnNlRmlsdGVyKVxyXG4gICAgKTtcclxuXHJcbiAgICByZXNwb25zZU9ic2Vydi5zdWJzY3JpYmUoXHJcbiAgICAgIHRoaXMuZ2V0QXV0aERhdGFGcm9tUG9zdE1lc3NhZ2UuYmluZCh0aGlzKVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBwb2xsZXJTdWJzY3JpcHRpb24gPSBwb2xsZXJPYnNlcnYuc3Vic2NyaWJlKCgpID0+IHtcclxuICAgICAgaWYgKGF1dGhXaW5kb3cuY2xvc2VkKSB7XHJcbiAgICAgICAgcG9sbGVyU3Vic2NyaXB0aW9uLnVuc3Vic2NyaWJlKCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXV0aFdpbmRvdy5wb3N0TWVzc2FnZSgncmVxdWVzdENyZWRlbnRpYWxzJywgJyonKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHJlc3BvbnNlT2JzZXJ2O1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBvQXV0aFdpbmRvd1Jlc3BvbnNlRmlsdGVyKGRhdGE6IGFueSk6IGFueSB7XHJcbiAgICBpZiAoZGF0YS5tZXNzYWdlID09PSAnZGVsaXZlckNyZWRlbnRpYWxzJyB8fCBkYXRhLm1lc3NhZ2UgPT09ICdhdXRoRmFpbHVyZScpIHtcclxuICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuXHJcbiAgLyoqXHJcbiAgICpcclxuICAgKiBVdGlsaXRpZXNcclxuICAgKlxyXG4gICAqL1xyXG5cclxuICAvLyBNYXRjaCB1c2VyIGNvbmZpZyBieSB1c2VyIGNvbmZpZyBuYW1lXHJcbiAgcHJpdmF0ZSBnZXRVc2VyVHlwZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBVc2VyVHlwZSB7XHJcbiAgICBpZiAobmFtZSA9PSBudWxsIHx8IHRoaXMub3B0aW9ucy51c2VyVHlwZXMgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcy5vcHRpb25zLnVzZXJUeXBlcy5maW5kKFxyXG4gICAgICB1c2VyVHlwZSA9PiB1c2VyVHlwZS5uYW1lID09PSBuYW1lXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG4iXX0=