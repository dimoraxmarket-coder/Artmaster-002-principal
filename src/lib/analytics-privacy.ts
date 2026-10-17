export function analyticsLocation(value: string) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol)
      ? u.origin + u.pathname
      : "";
  } catch {
    return "";
  }
}
export function analyticsReferrer(value: string) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.origin : "";
  } catch {
    return "";
  }
}
export function analyticsCookieNames(value: string) {
  return value
    .split(";")
    .map((v) => v.trim().split("=")[0])
    .filter((v) => /^_ga(?:_[A-Z0-9]+)?$/i.test(v));
}
export function removeAnalyticsCookies() {
  const host = window.location.hostname,
    parts = host.split(".");
  const domains = ["", host, "." + host];
  // GA can use a parent domain; never touch authentication or other cookies.
  for (let i = 1; i < parts.length - 1; i++)
    domains.push("." + parts.slice(i).join("."));
  for (const name of analyticsCookieNames(document.cookie))
    for (const domain of domains)
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${window.location.protocol === "https:" ? "; Secure" : ""}`;
}
