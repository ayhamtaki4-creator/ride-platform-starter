"use client";

import { useEffect, useState } from "react";
import {
  guestBookingClaimForReference,
  type GuestBookingClaim,
} from "@/lib/guest-booking-claims";

export function GuestBookingProof({ bookingReference }: { bookingReference: string | null }) {
  const [claim, setClaim] = useState<GuestBookingClaim | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setClaim(guestBookingClaimForReference(bookingReference));
  }, [bookingReference]);

  if (!claim) return null;

  return (
    <details style={{ margin: "26px auto 16px", maxWidth: 560, textAlign: "right" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>ستستخدم جهازًا آخر؟ احتفظ برمز ربط الحجز</summary>
      <p style={{ lineHeight: 1.8 }}>
        عند تسجيل الدخول من هاتف أو متصفح مختلف، أدخل رمز الربط التالي في صفحة «حجوزاتي».
        احتفظ به بشكل خاص، فهو إثبات امتلاك الحجز ولا ينبغي مشاركته مع الآخرين.
      </p>
      <label style={{ display: "block" }}>
        <span className="label">رمز ربط الحجز الخاص</span>
        <input className="input ltr-input" type="text" readOnly value={claim.clientRequestId} onFocus={(event) => event.target.select()} />
      </label>
      <button
        className="button"
        type="button"
        style={{ marginTop: 10 }}
        onClick={() => {
          void navigator.clipboard?.writeText(claim.clientRequestId)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? "تم نسخ رمز الربط" : "نسخ رمز ربط الحجز"}
      </button>
    </details>
  );
}
