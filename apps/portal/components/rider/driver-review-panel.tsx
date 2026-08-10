"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { apiFetch } from "@/lib/api";
import { Trip } from "@/lib/types";

export type PassengerDriverReview = {
  id: string;
  tripId: string;
  driverId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  driverRating?: number;
  reviewCount?: number;
};

export function DriverReviewPanel({
  booking,
  review,
  onCreated,
}: {
  booking: Trip;
  review?: PassengerDriverReview | null;
  onCreated: (review: PassengerDriverReview) => void;
}) {
  const { showToast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (booking.status !== "COMPLETED" || (!booking.driver && !booking.driverPublicProfile)) {
    return null;
  }

  if (review) {
    return (
      <section
        className="panel"
        style={{ marginTop: 12, padding: 16, borderRadius: 18 }}
        aria-label="تقييم السائق"
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <small style={{ color: "var(--muted)" }}>تقييمك لهذه الرحلة</small>
            <div aria-label={`${review.rating} من 5`} style={{ fontSize: 24, letterSpacing: 3, marginTop: 4 }}>
              {Array.from({ length: 5 }, (_, index) => (index < review.rating ? "★" : "☆")).join("")}
            </div>
          </div>
          <span className="status">{review.rating}/5</span>
        </div>
        {review.comment ? (
          <p style={{ margin: "12px 0 0", lineHeight: 1.8 }}>{review.comment}</p>
        ) : (
          <p className="subtitle" style={{ margin: "10px 0 0" }}>تم إرسال التقييم بدون تعليق.</p>
        )}
      </section>
    );
  }

  async function submit() {
    if (rating < 1 || rating > 5) {
      showToast("اختر تقييمًا من نجمة إلى خمس نجوم.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<PassengerDriverReview>(`/bookings/${booking.id}/driver-review`, {
        method: "POST",
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      onCreated(created);
      showToast("شكرًا لك، تم إرسال تقييم السائق.", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر إرسال التقييم.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="panel"
      style={{ marginTop: 12, padding: 16, borderRadius: 18 }}
      aria-label="قيّم السائق"
    >
      <div>
        <small style={{ color: "var(--muted)" }}>بعد اكتمال الرحلة</small>
        <h3 style={{ margin: "4px 0 6px" }}>كيف كانت تجربتك مع السائق؟</h3>
        <p className="subtitle" style={{ margin: 0 }}>اختر من 1 إلى 5 نجوم. التعليق اختياري.</p>
      </div>

      <div role="radiogroup" aria-label="تقييم السائق من خمس نجوم" style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} ${value === 1 ? "نجمة" : "نجوم"}`}
            onClick={() => setRating(value)}
            disabled={submitting}
            style={{
              border: 0,
              background: "transparent",
              fontSize: 32,
              lineHeight: 1,
              padding: 4,
              cursor: submitting ? "wait" : "pointer",
            }}
          >
            {value <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        <span className="label">تعليق اختياري</span>
        <textarea
          className="input"
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="مثلاً: السائق ملتزم بالموعد والتعامل ممتاز"
          disabled={submitting}
        />
      </label>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <small style={{ color: "var(--muted)" }}>{comment.length}/500</small>
        <button className="button primary" type="button" onClick={() => void submit()} disabled={submitting || rating === 0}>
          {submitting ? "جارٍ إرسال التقييم..." : "إرسال التقييم"}
        </button>
      </div>
    </section>
  );
}
