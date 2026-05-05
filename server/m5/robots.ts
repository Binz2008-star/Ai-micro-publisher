function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildRobotsTxt(baseUrl: string): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /prototype",
    "",
    `Sitemap: ${normalizedBaseUrl}/sitemap.xml`,
  ].join("\n");
}
