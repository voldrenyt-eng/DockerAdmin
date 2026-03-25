import type { AuthDto } from "@dockeradmin/shared";

export const dashboardRoutePath = "/";
export const loginRoutePath = "/login";

export const resolveProtectedRouteRedirect = (
  authSession: AuthDto | null,
): string | null => {
  return authSession ? null : loginRoutePath;
};

export const resolvePublicRouteRedirect = (
  authSession: AuthDto | null,
): string | null => {
  return authSession ? dashboardRoutePath : null;
};

export const resolveUnknownRouteRedirect = (
  authSession: AuthDto | null,
): string => {
  return authSession ? dashboardRoutePath : loginRoutePath;
};
