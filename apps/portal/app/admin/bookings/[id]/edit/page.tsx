"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BookingEditForm } from "@/components/booking-edit-form";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api";
import { Trip } from "@/lib/types";

export default function AdminBookingEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBooking(await apiFetch<Trip>(`/admin/bookings/${params.id}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الحجز.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = booking
    ? [
        "PENDING_DISPATCH",
        "SEARCHING_DRIVER",
        "DRIVER_ASSIGNED",
        "DRIVER_ARRIVING",
        "DRIVER_ARRIVED",
      ].includes(booking.status) &&
      booking.bookingReviewStatus !== "REJECTED" &&
      booking.bookingReviewStatus !== "CANCELLED"
    : false;

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / تعديل الحجز"
          title={booking?.bookingReference ? `تعديل ${booking.bookingReference}` : "تعديل وإعادة جدولة الحجز"}
          subtitle="تعديل آمن يعيد التحقق من السعر والسعة وتعارضات السائق قبل الحفظ."
          actions={
            <Link className="button" href={`/admin/bookings/${params.id}`}>
              <Icon name="arrow-right" size={17} /> العودة إلى التفاصيل
            </Link>
          }
        />

        {loading ? (
          <section className="panel"><p>جارٍ تحميل الحجز...</p></section>
        ) : error ? (
          <section className="panel" style={{ display: "grid", gap: 10 }}>
            <div className="notice error">{error}</div>
            <button className="button" type="button" onClick={() => void load()}>إعادة المحاولة</button>
          </section>
        ) : !booking ? (
          <section className="panel"><h2>الحجز غير موجود</h2></section>
        ) : !editable ? (
          <section className="panel" style={{ display: "grid", gap: 12 }}>
            <span className="eyebrow">الحجز مقفل</span>
            <h2>لا يمكن تعديل الحجز في حالته الحالية</h2>
            <p>التعديل متاح قبل بدء الرحلة فقط، ولا يسمح بتغيير الحجوزات المكتملة أو الملغاة أو المرفوضة.</p>
            <Link className="button primary" href={`/admin/bookings/${booking.id}`}>العودة إلى تفاصيل الحجز</Link>
          </section>
        ) : (
          <BookingEditForm
            booking={booking}
            admin
            onSaved={() => router.replace(`/admin/bookings/${booking.id}`)}
          />
        )}
      </Shell>
    </ProtectedRoute>
  );
}
