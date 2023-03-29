import { Injectable } from '@angular/core';
import { HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import * as i0 from "@angular/core";
import * as i1 from "./angular-token.service";
export class AngularTokenInterceptor {
    constructor(tokenService) {
        this.tokenService = tokenService;
    }
    intercept(req, next) {
        // Get auth data from local storage
        this.tokenService.getAuthDataFromStorage();
        // Add the headers if the request is going to the configured server
        const authData = this.tokenService.authData.value;
        if (authData &&
            (this.tokenService.tokenOptions.apiBase === null || req.url.match(this.tokenService.tokenOptions.apiBase))) {
            const headers = {
                'access-token': authData.accessToken,
                'client': authData.client,
                'expiry': authData.expiry,
                'token-type': authData.tokenType,
                'uid': authData.uid
            };
            req = req.clone({
                setHeaders: headers
            });
        }
        return next.handle(req).pipe(tap(res => this.handleResponse(res), err => this.handleResponse(err)));
    }
    // Parse Auth data from response
    handleResponse(res) {
        if (res instanceof HttpResponse || res instanceof HttpErrorResponse) {
            if (this.tokenService.tokenOptions.apiBase === null || (res.url && res.url.match(this.tokenService.tokenOptions.apiBase))) {
                this.tokenService.getAuthHeadersFromResponse(res);
            }
        }
    }
}
AngularTokenInterceptor.ɵfac = function AngularTokenInterceptor_Factory(t) { return new (t || AngularTokenInterceptor)(i0.ɵɵinject(i1.AngularTokenService)); };
AngularTokenInterceptor.ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: AngularTokenInterceptor, factory: AngularTokenInterceptor.ɵfac });
(function () { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(AngularTokenInterceptor, [{
        type: Injectable
    }], function () { return [{ type: i1.AngularTokenService }]; }, null); })();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ndWxhci10b2tlbi5pbnRlcmNlcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Byb2plY3RzL2FuZ3VsYXItdG9rZW4vc3JjL2xpYi9hbmd1bGFyLXRva2VuLmludGVyY2VwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDM0MsT0FBTyxFQUF3RCxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUs3SCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7OztBQUdyQyxNQUFNLE9BQU8sdUJBQXVCO0lBRWxDLFlBQXFCLFlBQWlDO1FBQWpDLGlCQUFZLEdBQVosWUFBWSxDQUFxQjtJQUFLLENBQUM7SUFFNUQsU0FBUyxDQUFDLEdBQXFCLEVBQUUsSUFBaUI7UUFFaEQsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxZQUFZLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUUzQyxtRUFBbUU7UUFDbkUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBRWxELElBQUksUUFBUTtZQUNWLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsT0FBTyxLQUFLLElBQUksSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFO1lBRTVHLE1BQU0sT0FBTyxHQUFHO2dCQUNkLGNBQWMsRUFBRSxRQUFRLENBQUMsV0FBVztnQkFDcEMsUUFBUSxFQUFRLFFBQVEsQ0FBQyxNQUFNO2dCQUMvQixRQUFRLEVBQVEsUUFBUSxDQUFDLE1BQU07Z0JBQy9CLFlBQVksRUFBSSxRQUFRLENBQUMsU0FBUztnQkFDbEMsS0FBSyxFQUFXLFFBQVEsQ0FBQyxHQUFHO2FBQzdCLENBQUM7WUFFRixHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDZCxVQUFVLEVBQUUsT0FBTzthQUNwQixDQUFDLENBQUM7U0FDSjtRQUVELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUM1QixHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQy9CLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FDbEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUdELGdDQUFnQztJQUN4QixjQUFjLENBQUMsR0FBMkQ7UUFDaEYsSUFBSSxHQUFHLFlBQVksWUFBWSxJQUFJLEdBQUcsWUFBWSxpQkFBaUIsRUFBRTtZQUNuRSxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLE9BQU8sS0FBSyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUU7Z0JBQ3pILElBQUksQ0FBQyxZQUFZLENBQUMsMEJBQTBCLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkQ7U0FDRjtJQUNILENBQUM7OzhGQTFDVSx1QkFBdUI7NkVBQXZCLHVCQUF1QixXQUF2Qix1QkFBdUI7dUZBQXZCLHVCQUF1QjtjQURuQyxVQUFVIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSW5qZWN0YWJsZSB9IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xyXG5pbXBvcnQgeyBIdHRwRXZlbnQsIEh0dHBSZXF1ZXN0LCBIdHRwSW50ZXJjZXB0b3IsIEh0dHBIYW5kbGVyLCBIdHRwUmVzcG9uc2UsIEh0dHBFcnJvclJlc3BvbnNlIH0gZnJvbSAnQGFuZ3VsYXIvY29tbW9uL2h0dHAnO1xyXG5cclxuaW1wb3J0IHsgQW5ndWxhclRva2VuU2VydmljZSB9IGZyb20gJy4vYW5ndWxhci10b2tlbi5zZXJ2aWNlJztcclxuXHJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tICdyeGpzJztcclxuaW1wb3J0IHsgdGFwIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xyXG5cclxuQEluamVjdGFibGUoKVxyXG5leHBvcnQgY2xhc3MgQW5ndWxhclRva2VuSW50ZXJjZXB0b3IgaW1wbGVtZW50cyBIdHRwSW50ZXJjZXB0b3Ige1xyXG5cclxuICBjb25zdHJ1Y3RvciggcHJpdmF0ZSB0b2tlblNlcnZpY2U6IEFuZ3VsYXJUb2tlblNlcnZpY2UgKSB7IH1cclxuXHJcbiAgaW50ZXJjZXB0KHJlcTogSHR0cFJlcXVlc3Q8YW55PiwgbmV4dDogSHR0cEhhbmRsZXIpOiBPYnNlcnZhYmxlPEh0dHBFdmVudDxhbnk+PiB7XHJcblxyXG4gICAgLy8gR2V0IGF1dGggZGF0YSBmcm9tIGxvY2FsIHN0b3JhZ2VcclxuICAgIHRoaXMudG9rZW5TZXJ2aWNlLmdldEF1dGhEYXRhRnJvbVN0b3JhZ2UoKTtcclxuXHJcbiAgICAvLyBBZGQgdGhlIGhlYWRlcnMgaWYgdGhlIHJlcXVlc3QgaXMgZ29pbmcgdG8gdGhlIGNvbmZpZ3VyZWQgc2VydmVyXHJcbiAgICBjb25zdCBhdXRoRGF0YSA9IHRoaXMudG9rZW5TZXJ2aWNlLmF1dGhEYXRhLnZhbHVlO1xyXG5cclxuICAgIGlmIChhdXRoRGF0YSAmJlxyXG4gICAgICAodGhpcy50b2tlblNlcnZpY2UudG9rZW5PcHRpb25zLmFwaUJhc2UgPT09IG51bGwgfHwgcmVxLnVybC5tYXRjaCh0aGlzLnRva2VuU2VydmljZS50b2tlbk9wdGlvbnMuYXBpQmFzZSkpKSB7XHJcblxyXG4gICAgICBjb25zdCBoZWFkZXJzID0ge1xyXG4gICAgICAgICdhY2Nlc3MtdG9rZW4nOiBhdXRoRGF0YS5hY2Nlc3NUb2tlbixcclxuICAgICAgICAnY2xpZW50JzogICAgICAgYXV0aERhdGEuY2xpZW50LFxyXG4gICAgICAgICdleHBpcnknOiAgICAgICBhdXRoRGF0YS5leHBpcnksXHJcbiAgICAgICAgJ3Rva2VuLXR5cGUnOiAgIGF1dGhEYXRhLnRva2VuVHlwZSxcclxuICAgICAgICAndWlkJzogICAgICAgICAgYXV0aERhdGEudWlkXHJcbiAgICAgIH07XHJcblxyXG4gICAgICByZXEgPSByZXEuY2xvbmUoe1xyXG4gICAgICAgIHNldEhlYWRlcnM6IGhlYWRlcnNcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5leHQuaGFuZGxlKHJlcSkucGlwZSh0YXAoXHJcbiAgICAgICAgcmVzID0+IHRoaXMuaGFuZGxlUmVzcG9uc2UocmVzKSxcclxuICAgICAgICBlcnIgPT4gdGhpcy5oYW5kbGVSZXNwb25zZShlcnIpXHJcbiAgICApKTtcclxuICB9XHJcblxyXG5cclxuICAvLyBQYXJzZSBBdXRoIGRhdGEgZnJvbSByZXNwb25zZVxyXG4gIHByaXZhdGUgaGFuZGxlUmVzcG9uc2UocmVzOiBIdHRwUmVzcG9uc2U8YW55PiB8IEh0dHBFcnJvclJlc3BvbnNlIHwgSHR0cEV2ZW50PGFueT4pOiB2b2lkIHtcclxuICAgIGlmIChyZXMgaW5zdGFuY2VvZiBIdHRwUmVzcG9uc2UgfHwgcmVzIGluc3RhbmNlb2YgSHR0cEVycm9yUmVzcG9uc2UpIHtcclxuICAgICAgaWYgKHRoaXMudG9rZW5TZXJ2aWNlLnRva2VuT3B0aW9ucy5hcGlCYXNlID09PSBudWxsIHx8IChyZXMudXJsICYmIHJlcy51cmwubWF0Y2godGhpcy50b2tlblNlcnZpY2UudG9rZW5PcHRpb25zLmFwaUJhc2UpKSkge1xyXG4gICAgICAgIHRoaXMudG9rZW5TZXJ2aWNlLmdldEF1dGhIZWFkZXJzRnJvbVJlc3BvbnNlKHJlcyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19