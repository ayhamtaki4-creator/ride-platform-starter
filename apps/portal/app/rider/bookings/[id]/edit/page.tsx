"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BookingEditForm } from "@/components/booking-edit-form";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useRiderBookings } from "@/hooks/use-rider-bookings";

export default function RiderBookingEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { bookings, error, isLoading } = useRiderBookings();
  const booking = bookings.find((item) => item.id === params.id);
  const assigned = Boolean(booking?.driver || booking?.driverPublicProfile || booking?.serviceRun);
  const editableStatus = booking
    ? ["PENDING_DISPATCH", "SEARCHING_DRIVER"].includes(booking.status)
    : false;

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / تعديل الحجز"
          title={booking?.bookingReference ? `تعديل ${booking.bookingReference}` : "تعديل الحجز"}
          subtitle="غيّر الموعد أو بيانات المسافر قبل تعيين الحجز للتشغيل."
          actions={
            <Link className="button" href={`/rider/bookings/${params.id}`}>
              <Icon name="arrow-right" size={17} /> العودة إلى الحجز
            </Link>
          }
        />

        {isLoading ? (
          <section className="panel"><p>جارٍ تحميل الحجز...</p></section>
        ) : error ? (
          <section className="panel"><h2>تعذر تحميل الحجز</h2><p>{error}</p></section>
        ) : !booking ? (
          <section className="panel"><h2>الحجز غير موجود</h2><p>قد يكون الرابط غير صحيح أو أن الحجز لا يخص حسابك.</p></section>
        ) : assigned || !editableStatus ? (
          <section className="panel" style={{ display: "grid", gap: 12 }}>
            <span className="eyebrow">التعديل عبر مركز العمليات</span>
            <h2>لم يعد التعديل المباشر متاحًا</h2>
            <p>
              تم تعيين الحجز للتشغيل أو انتقل إلى مرحلة لا تسمح بالتعديل المباشر. تواصل مع مركز العمليات لتغيير الموعد أو البيانات بدون التأثير على السائق والرحلة.
            </p>
            <Link className="button primary" href={`/rider/bookings/${booking.id}`}>العودة إلى تفاصيل الحجز</Link>
          </section>
        ) : (
          <BookingEditForm
            booking={booking}
            onSaved={() => router.replace(`/rider/bookings/${booking.id}`)}
          />
        )}
      </Shell>
    </ProtectedRoute>
  );
}
