import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sanitizeAuthReturnTo } from "./lib/auth-navigation";
import {
  EDGE_CLIENT_IP_HEADER,
  EDGE_SECRET_HEADER,
  PREVIEW_COOKIE,
  edgeProxyHeaders,
  isPreviewTokenShaped,
  visitorIp
} from "./lib/edge-proxy";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/v1/")) return relayToApi(request);
  if (pathname.startsWith("/e/")) return rememberPreview(request);
  return redirectLegacyAuth(request);
}

/**
 * Appel du navigateur relayé vers l'API (réécriture de next.config) : l'IP du
 * visiteur part signée par le secret partagé. Des en-têtes de relais envoyés
 * par le client lui-même sont toujours retirés.
 */
function relayToApi(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(EDGE_SECRET_HEADER);
  headers.delete(EDGE_CLIENT_IP_HEADER);
  for (const [name, value] of Object.entries(edgeProxyHeaders(visitorIp(request.headers)))) {
    headers.set(name, value);
  }
  return NextResponse.next({ request: { headers } });
}

/**
 * Aperçu d'un brouillon : le jeton reçu sur /e/{slug}?preview= est gardé une
 * heure dans un cookie limité à /e/{slug}, pour que toute la mini-plateforme
 * (candidats, résultats, billetterie) reste visible en naviguant.
 */
function rememberPreview(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.nextUrl.searchParams.get("preview");
  const slug = request.nextUrl.pathname.split("/")[2];
  if (slug && isPreviewTokenShaped(token)) {
    response.cookies.set(PREVIEW_COOKIE, token, {
      path: `/e/${slug}`,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60
    });
  }
  return response;
}

/** Anciennes routes auth → modal global sur l'accueil. */
function redirectLegacyAuth(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/login" && pathname !== "/register") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("auth", pathname === "/login" ? "login" : "register");

  const next = sanitizeAuthReturnTo(searchParams.get("next"));
  if (next) {
    url.searchParams.set("next", next);
  }

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/login", "/register", "/api/v1/:path*", "/e/:path*"]
};
