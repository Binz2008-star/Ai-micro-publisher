import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, resolveBaseUrlInfo } from "./baseUrl";

const ORIGINAL_APP_URL = process.env.VITE_APP_URL;

describe("resolveBaseUrlInfo", () => {
  afterEach(() => {
    if (ORIGINAL_APP_URL === undefined) {
      delete process.env.VITE_APP_URL;
    } else {
      process.env.VITE_APP_URL = ORIGINAL_APP_URL;
    }
  });

  it("prefers VITE_APP_URL when configured", () => {
    process.env.VITE_APP_URL = "https://publisher.example.com/";

    const result = resolveBaseUrlInfo({
      headers: {
        host: "localhost:3000",
      },
    });

    expect(result).toEqual({
      baseUrl: "https://publisher.example.com",
      source: "env",
    });
  });

  it("falls back to request headers when env is missing", () => {
    delete process.env.VITE_APP_URL;

    const result = resolveBaseUrlInfo({
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "https",
      },
    });

    expect(result).toEqual({
      baseUrl: "https://localhost:3000",
      source: "request",
    });
  });

  it("uses the placeholder only when no env or request host exists", () => {
    delete process.env.VITE_APP_URL;

    expect(resolveBaseUrlInfo()).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      source: "default",
    });
  });
});
