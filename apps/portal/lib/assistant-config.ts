import { API_URL } from "@/lib/api";
import { readAnalyticsConsent } from "@/lib/analytics";

export type AssistantFaq = { question: string; answer: string };
export type AssistantConfiguration = {
  enabled: boolean;
  welcomeMessage: string;
  faqs: AssistantFaq[];
};

export type AssistantMetricEvent =
  | "OPEN" | "QUESTION" | "FARE_VIEW" | "QUOTE_SUCCESS" | "BOOKING_CLICK" | "WHATSAPP_CLICK";
export type AssistantMetricTopic =
  | "general" | "booking" | "prices" | "routes" | "guest" | "luggage" | "flight"
  | "status" | "driver" | "change" | "payment" | "support" | "custom";

export async function fetchAssistantConfig(signal?: AbortSignal): Promise<AssistantConfiguration> {
  const response = await fetch(`${API_URL}/assistant/config`, {
    method: "GET",
    credentials: "omit",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("تعذر تحميل إعدادات المساعد.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("إعدادات المساعد غير صالحة.");
  const cfg = data as Record<string, unknown>;
  if (typeof cfg.enabled !== "boolean" || typeof cfg.welcomeMessage !== "string" || !Array.isArray(cfg.faqs)) {
    throw new Error("إعدادات المساعد غير صالحة.");
  }
  const faqs = cfg.faqs.filter((item): item is AssistantFaq =>
    !!item && typeof item === "object" &&
    typeof item.question === "string" && typeof item.answer === "string"
  ).slice(0, 20);
  return {
    enabled: cfg.enabled,
    welcomeMessage: cfg.welcomeMessage.slice(0, 350),
    faqs,
  };
}

/** Aggregate-only operational events. Never send text or identifiers.
 * Only users who explicitly accepted website analytics contribute to the totals.
 */
export function recordAssistantEvent(event: AssistantMetricEvent, topic: AssistantMetricTopic = "general") {
  if (typeof window === "undefined" || readAnalyticsConsent() !== "accepted") return;
  if (!["/", "/booking", "/services", "/contact", "/privacy", "/terms"].some(
    (path) => window.location.pathname === path || (path === "/services" && window.location.pathname.startsWith("/services/"))
  )) return;
  void fetch(`${API_URL}/assistant/metric`, {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, topic }),
    keepalive: true,
  }).catch(() => {
    // Telemetry is optional and must never interrupt bookings or messaging.
  });
}
