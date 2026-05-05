export const DEFAULT_BASE_URL = "https://your-domain.manus.space";

type HeaderValue = string | string[] | undefined;
type RequestLike = {
  headers?: Record<string, HeaderValue>;
};

export type BaseUrlSource = "env" | "request" | "default";

export interface BaseUrlInfo {
  baseUrl: string;
  source: BaseUrlSource;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function firstHeaderValue(value: HeaderValue): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function getHeader(headers: RequestLike["headers"], key: string): string | null {
  if (!headers) return null;
  return firstHeaderValue(headers[key.toLowerCase()]);
}

export function resolveBaseUrlInfo(req?: RequestLike): BaseUrlInfo {
  const configured = process.env.VITE_APP_URL?.trim();
  if (configured) {
    return { baseUrl: trimTrailingSlash(configured), source: "env" };
  }

  const host = getHeader(req?.headers, "x-forwarded-host") ?? getHeader(req?.headers, "host");
  if (host) {
    const forwardedProto = getHeader(req?.headers, "x-forwarded-proto");
    const proto = forwardedProto?.split(",")[0]?.trim()
      || (process.env.NODE_ENV === "production" ? "https" : "http");

    return {
      baseUrl: `${proto}://${host.split(",")[0].trim()}`,
      source: "request",
    };
  }

  return { baseUrl: DEFAULT_BASE_URL, source: "default" };
}

export function isPlaceholderBaseUrl(baseUrl: string): boolean {
  return trimTrailingSlash(baseUrl) === DEFAULT_BASE_URL;
}
