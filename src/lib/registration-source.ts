export function normalizeRegistrationSource(value: unknown): "APP" | "WEB" | "UNKNOWN" {
  if (typeof value !== "string") return "UNKNOWN"
  const normalized = value.trim().toLowerCase()
  if (normalized === "app") return "APP"
  if (normalized === "web") return "WEB"
  return "UNKNOWN"
}
