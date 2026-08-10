"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useDriverData } from "@/hooks/use-driver-data";
import { apiFetch } from "@/lib/api";
import { isTripEnded, sortTripsNewestFirst } from "@/lib/completed-bookings";
import {
  shouldDriverAutoTrack,
  startDriverLiveLocation,
  stopDriverLiveLocation,
} from "@/lib/driver-live-location";
import {
  BOOKING_TYPE_LABELS,
  DRIVER_ASSIGNMENT_LABELS,
  TRIP_STATUS_LABELS,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";
import { whatsappUrl } from "@/lib/whatsapp";

function mapPointUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export default function DriverBookingsPage() {
  const { socket } = useAuth();
  const { schedule, error, isLoading, reload } = useDriverData();
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");

  const activeSchedule = useMemo(
    () => sortTripsNewestFirst(schedule.filter((trip) => !isTripEnded(trip))),
    [schedule],
  );

  useEffect(() => {
    for (const trip of activeSchedule) {
      if (
        !["DRIVER_ARRIVED", "IN_PROGRESS"].includes(trip.status) ||
        !shouldDriverAutoTrack(trip.id)
      ) {
        continue;
      }

      startDriverLiveLocation(
        trip.id,
        socket,
        (gpsError) => setLocalError(gpsError),
      );
    }
  }, [activeSchedule, socket]);

  async function request(path: string, body?: object, success?: string) {
    setWorking(path);
    setMessage("");
    setLocalError("");
    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(success || "تم تحديث المهمة.");
      await reload();
      return true;
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
      return false;
    } finally {
      setWorking("");
    }
  }

  async function arrivedAndStartTracking(tripId: string) {
    const arrived = await request(
      `/trips/${tripId}/arrived`,
      undefined,
      "تم تسجيل وصولك.",
    );
    if (!arrived) return;

    startDriverLiveLocation(
      tripId,
      socket,
      (gpsError) => setLocalError(gpsError),
      () => setMessage("تم تسجيل وصولك وبدأ التتبع المباشر تلقائيًا."),
    );
  }

  async function completeTrip(tripId: string) {
    const completed = await request(
      `/trips/${tripId}/complete`,
      { note: "Completed from driver bookings page" },
      "تم إنهاء الرحلة.",
    );
    if (completed) stopDriverLiveLocation(tripId, true);
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / المهام"
          title="الحجوزات والمهام الحالية"
          subtitle="يعرض كل حجز موقع الالتقاط الذي حدده المسافر فعليًا، وليس نقطة قالب المسار فقط."
          actions={<div className="actions"><Link className="button" href="/driver/completed-bookings"><Icon name="check" size={17} /> الحجوزات المنتهية</Link><Link className="button" href="/driver"><Icon name="arrow-right" size={17} /> لوحة السائق</Link></div>}
        />

        {error || localError ? <div className="notice error">{localError || error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">الجدول</span><h2>المهام الحالية</h2><p className="subtitle">مرتبة من أحدث حجز إلى الأقدم.</p></div><button className="button" type="button" onClick={() => void reload()}>تحديث</button></div>

          {isLoading ? <div className="empty-state">جارٍ تحميل المهام...</div> : activeSchedule.length === 0 ? <div className="empty-state">لا توجد مهام حالية. راجع الحجوزات المنتهية للسجل السابق.</div> : (
            <div className="schedule-card-grid driver-assignment-grid">
              {activeSchedule.map((trip) => {
                const requestBusy = Boolean(working);
                const trackingAvailable = Boolean(trip.driver) && !["COMPLETED", "CANCELLED_BY_DRIVER", "CANCELLED_BY_PASSENGER"].includes(trip.status);
                const passengerPhone = trip.contactPhone || trip.passenger?.phone || "";
                const passengerWhatsapp = whatsappUrl(
                  passengerPhone,
                  `مرحباً، أنا سائق الحجز ${trip.bookingReference ?? ""}`,
                );
                return (
                  <article className="booking-card driver-assignment-card" key={trip.id}>
                    <div className="booking-card-head">
                      <div><strong>{trip.bookingReference || "رحلة"}</strong><small>{trip.travelDate ? new Date(trip.travelDate).toLocaleDateString("ar") : "غير مجدولة"} · {trip.flightArrivalTime || "وقت غير محدد"}</small></div>
                      <span className="status">{trip.driverAssignmentStatus ? DRIVER_ASSIGNMENT_LABELS[trip.driverAssignmentStatus] : TRIP_STATUS_LABELS[trip.status]}</span>
                    </div>

                    <div className="booking-meta">
                      <span><Icon name="map-pin" size={15} /> {trip.pickupAddress}</span>
                      <span><Icon name="route" size={15} /> {trip.dropoffAddress}</span>
                      <span>{trip.bookingType ? BOOKING_TYPE_LABELS[trip.bookingType] : "رحلة"}</span>
                      <span>{trip.bookingType === "PRIVATE_CAR" ? VEHICLE_CLASS_LABELS[trip.vehicleClass ?? "SMALL"] : "مقعد مشترك"}</span>
                    </div>

                    <div className="driver-passenger-contact">
                      <span><Icon name="user" size={18} /></span>
                      <div>
                        <small>المسافر</small>
                        <strong>{trip.contactName || trip.passenger?.firstName || "—"}</strong>
                        {passengerWhatsapp ? (
                          <a href={passengerWhatsapp} target="_blank" rel="noopener noreferrer">مراسلة المسافر عبر واتساب · {passengerPhone}</a>
                        ) : <span>لا يوجد رقم تواصل</span>}
                      </div>
                    </div>

                    <div className="detail-list compact-detail-list">
                      <div><span>موقع الالتقاط الذي حدده المسافر</span><strong>{trip.pickupAddress}</strong></div>
                      <div><span>الوصول</span><strong>{trip.dropoffAddress}</strong></div>
                      {trip.flightNumber ? <div><span>الطائرة</span><strong>{trip.flightNumber} · {trip.flightArrivalTime}</strong></div> : null}
                    </div>

                    <div className="actions">
                      <a className="button" href={mapPointUrl(trip.pickupLatitude, trip.pickupLongitude)} target="_blank" rel="noopener noreferrer">
                        <Icon name="map-pin" size={17} /> فتح موقع الالتقاط
                      </a>
                      {trackingAvailable ? <Link className="button primary" href={`/driver/bookings/${trip.id}/tracking`}><Icon name="map-pin" size={17} /> الخريطة والتتبع</Link> : null}
                      {trip.serviceRun ? <Link className="button" href={`/driver/runs/${trip.serviceRun.id}`}>الرحلة التشغيلية {trip.serviceRun.runReference}</Link> : null}
                    </div>

                    {trip.driverAssignmentStatus === "PENDING" ? (
                      <div className="driver-assignment-actions">
                        <input className="input" placeholder="سبب الرفض عند الحاجة" value={rejectReasons[trip.id] ?? ""} onChange={(event) => setRejectReasons((current) => ({ ...current, [trip.id]: event.target.value }))} />
                        <div className="actions">
                          <button className="button primary" type="button" disabled={requestBusy} onClick={() => void request(`/drivers/me/bookings/${trip.id}/accept`, undefined, "تم قبول المهمة.")}>قبول المهمة</button>
                          <button className="button danger" type="button" disabled={requestBusy || (rejectReasons[trip.id]?.trim().length ?? 0) < 3} onClick={() => void request(`/drivers/me/bookings/${trip.id}/reject`, { reason: rejectReasons[trip.id] }, "تم رفض المهمة وإعادتها للإدارة.")}>رفض المهمة</button>
                        </div>
                      </div>
                    ) : null}

                    {trip.driverAssignmentStatus === "ACCEPTED" && trip.status === "DRIVER_ASSIGNED" ? <button className="button primary" disabled={requestBusy} type="button" onClick={() => void request(`/trips/${trip.id}/arriving`, undefined, "تم إبلاغ المسافر أنك في الطريق.")}>أنا في الطريق</button> : null}
                    {trip.status === "DRIVER_ARRIVING" ? <button className="button primary" disabled={requestBusy} type="button" onClick={() => void arrivedAndStartTracking(trip.id)}>وصلت إلى المسافر</button> : null}
                    {trip.status === "DRIVER_ARRIVED" ? <button className="button primary" disabled={requestBusy} type="button" onClick={() => void request(`/trips/${trip.id}/start`, undefined, "تم بدء الرحلة.")}>بدء الرحلة</button> : null}
                    {trip.status === "IN_PROGRESS" ? <button className="button primary" disabled={requestBusy} type="button" onClick={() => void completeTrip(trip.id)}>إنهاء الرحلة</button> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}