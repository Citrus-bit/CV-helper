import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  API_SESSION_COOKIE,
  API_SESSION_MAX_AGE_SECONDS,
  proxy,
} from "./proxy";

describe("anonymous API session proxy", () => {
  it("issues a 24-hour HttpOnly cookie without exposing application data", () => {
    const response = proxy(new NextRequest("http://127.0.0.1:3000/api/demo"));
    const cookie = response.cookies.get(API_SESSION_COOKIE);

    expect(cookie?.value).toMatch(/^[a-zA-Z0-9_-]{16,128}$/);
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: API_SESSION_MAX_AGE_SECONDS,
    });
  });

  it("keeps a valid existing session and replaces an invalid one", () => {
    const existing = new NextRequest("https://resume.local/api/demo", {
      headers: { cookie: `${API_SESSION_COOKIE}=session-existing-1234567890` },
    });
    const invalid = new NextRequest("https://resume.local/api/demo", {
      headers: { cookie: `${API_SESSION_COOKIE}=short` },
    });

    expect(proxy(existing).cookies.get(API_SESSION_COOKIE)).toBeUndefined();
    expect(proxy(invalid).cookies.get(API_SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      secure: true,
    });
  });
});
