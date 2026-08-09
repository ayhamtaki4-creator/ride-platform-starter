import type { TripLiveLocation } from "./tracking";

export type TrackingHealthLevel = "waiting" | "live" | "weak" | "stale" | "lost";

export type TrackingHealth = {
  level: TrackingHealthLevel;
  label: string;
  ageMs: number | null;
  ageLabel: string;
  description: string;
};

function formatAge(ageMs: number) {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 6) return "الآن";
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `منذ ${minutes} دقيقة`;
}

export function trackingHealth(
  location: Pick<TripLiveLocation, "recordedAt"> | null | undefined,
  now = Date.now(),
): TrackingHealth {
  if (!location?.recordedAt) {
    return {
      level: "waiting",
      label: "بانتظار GPS",
      ageMs: null,
      ageLabel: "لم يبدأ التتبع بعد",
      description: "سيظهر موقع السيارة بعد أن يبدأ السائق مشاركة GPS.",
    };
  }

  const recordedAt = Date.parse(location.recordedAt);
  if (!Number.isFinite(recordedAt)) {
    return {
      level: "waiting",
      label: "بانتظار GPS",
      ageMs: null,
      ageLabel: "وقت التحديث غير صالح",
      description: "تعذر التحقق من حداثة آخر موقع معروف.",
    };
  }

  const ageMs = Math.max(0, now - recordedAt);
  const ageLabel = formatAge(ageMs);

  if (ageMs < 30_000) {
    return {
      level: "live",
      label: "مباشر",
      ageMs,
      ageLabel,
      description: "آخر موقع حديث ويُعتبر تتبعًا مباشرًا.",
    };
  }

  if (ageMs < 60_000) {
    return {
      level: "weak",
      label: "إشارة ضعيفة",
      ageMs,
      ageLabel,
      description: "الموقع يتأخر قليلًا؛ قد تكون شبكة هاتف السائق ضعيفة.",
    };
  }

  if (ageMs < 120_000) {
    return {
      level: "stale",
      label: "الموقع متأخر",
      ageMs,
      ageLabel,
      description: "لم يصل موقع جديد منذ أكثر من دقيقة.",
    };
  }

  return {
    level: "lost",
    label: "التتبع منقطع",
    ageMs,
    ageLabel,
    description: "آخر موقع قديم؛ لا تعتمد عليه كموقع حالي للسيارة.",
  };
}
