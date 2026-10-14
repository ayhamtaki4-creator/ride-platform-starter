import { API_URL } from "./api";

/**
 * Free Render instances can sleep after 15 minutes without requests.
 * Start one health probe when visitors arrive at a public page, before they
 * attempt to load route prices or submit a booking.
 *
 * No background pings, no credentials, no side effects, and no mutation
 * retries. This is shared by public navigation and the booking form.
 */
const WARM_WINDOW_MS = 4 * 60 * 1000;
const WAKE_DEADLINE_MS = 100 * 1000;
const PROBE_TIMEOUT_MS = 24 * 1000;
const RETRY_DELAY_MS = 3 * 1000;

let lastHealthyAt = 0;
let pendingWarmup: Promise<boolean> | null = null;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function probeHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    // Render may answer with an HTML loading page while its instance boots;
    // that is not a healthy NestJS API response.
    return response.ok && (response.headers.get("content-type") ?? "").includes("application/json");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function warmPublicApi(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (Date.now() - lastHealthyAt < WARM_WINDOW_MS) return Promise.resolve(true);
  if (pendingWarmup) return pendingWarmup;

  pendingWarmup = (async () => {
    const deadline = Date.now() + WAKE_DEADLINE_MS;
    while (Date.now() < deadline) {
      if (navigator.onLine === false) return false;
      if (await probeHealth()) {
        lastHealthyAt = Date.now();
        return true;
      }
      const remaining = deadline - Date.now();
      if (remaining > 0) await delay(Math.min(RETRY_DELAY_MS, remaining));
    }
    return false;
  })().finally(() => {
    pendingWarmup = null;
  });
  return pendingWarmup;
}
