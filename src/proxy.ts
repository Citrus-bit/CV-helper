import { NextRequest, NextResponse } from "next/server";

export const API_SESSION_COOKIE = "resume-assistant-session";
export const API_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

const VALID_SESSION_ID = /^[a-zA-Z0-9_-]{16,128}$/;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const currentSession = request.cookies.get(API_SESSION_COOKIE)?.value;

  if (!currentSession || !VALID_SESSION_ID.test(currentSession)) {
    response.cookies.set({
      name: API_SESSION_COOKIE,
      value: crypto.randomUUID(),
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: API_SESSION_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
