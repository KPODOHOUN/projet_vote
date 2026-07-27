import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Anciennes routes auth → modal global sur l'accueil. */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname !== "/login" && pathname !== "/register") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("auth", pathname === "/login" ? "login" : "register");

  const next = searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") && !next.startsWith("/register")) {
    url.searchParams.set("next", next);
  }

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/login", "/register"]
};
