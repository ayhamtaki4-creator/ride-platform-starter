export function safeLocalReturnPath(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("\n") || normalized.includes("\r")) return null;
  return normalized;
}

export function currentAuthReturnPath() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return safeLocalReturnPath(params.get("next"));
}

export function authPathWithReturn(path: "/login" | "/register", returnPath: string | null | undefined) {
  const safeReturn = safeLocalReturnPath(returnPath);
  return safeReturn ? `${path}?next=${encodeURIComponent(safeReturn)}` : path;
}
