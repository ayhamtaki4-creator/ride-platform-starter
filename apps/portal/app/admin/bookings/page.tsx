"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { EligibleDriver } from "@/lib/admin-operations";
import {
  BOOKING_REVIEW_LABELS,
  BOOKING_TYPE_LABELS,
  BookingReviewStatus,
  DIRECTION_LABELS,
  DRIVER_ASSIGNMENT_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  Trip,
  TRIP_STATUS_LABELS,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";

export default function AdminBookingsPage() {
  const { socket } = useAuth();
  const [bookings, setBookings] = useState<Trip[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | BookingReviewStatus>("");
  const [eligible, setEligible] = useState<Record<string, EligibleDriver[]>>({});
  const [selection, setSelection] = useState<Record<string, { driverId: string; vehicleId: string }>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    return params.toString();
  }, [search, status]);

  const load = useCallback(async () => {
    try {
      setBookings(await apiFetch<Trip[]>(`/admin/bookings${query ? `?${query}` : ""}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الحجوزات.");
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => void load();
    socket.on("admin.booking.created", refresh);
    socket.on("admin.booking.updated", refresh);
    socket.on("admin.trip.updated", refresh);
    return () => { socket.off("admin.booking.created", refresh); socket.off("admin.booking.updated", refresh); socket.off("admin.trip.updated", refresh); };
  }, [load, socket]);

  async function action(path: string, body?: object) {
    setWorking(path); setMessage(""); setError("");
    try {
      await apiFetch(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setMessage("تم تحديث الحجز.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
    } finally { setWorking(""); }
  }

  async function loadEligibleDrivers(booking: Trip) {
    if (!booking.routeId || !booking.travelDate) {
      setError("هذا الحجز قديم ولا يحتوي على مسار ديناميكي. استخدم التعيين القديم أو انقل الحجز إلى مسار جديد.");
      return;
    }
    setWorking(`eligible-${booking.id}`); setError(""); setMessage("");
    try {
      const params = new URLSearchParams({
        travelDate: new Date(booking.travelDate).toISOString(),
        vehicleClass: booking.vehicleClass ?? "SMALL",
        passengerCount: String(booking.passengerCount ?? 1),
      });
      const rows = await apiFetch<EligibleDriver[]>(`/admin/routes/${booking.routeId}/eligible-drivers?${params}`);
      setEligible((current) => ({ ...current, [booking.id]: rows }));
      const firstDriver = rows.find((driver) => !driver.hasScheduleConflict && driver.vehicles.length > 0) ?? rows[0];
      if (firstDriver?.vehicles[0]) setSelection((current) => ({ ...current, [booking.id]: { driverId: firstDriver.driverId, vehicleId: firstDriver.vehicles[0].id } }));
      setMessage(rows.length ? `تم العثور على ${rows.length} سائق مؤهل.` : "لا يوجد سائق مؤهل لهذا المسار والتاريخ.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السائقين المؤهلين.");
    } finally { setWorking(""); }
  }

  function chooseDriverVehicle(bookingId: string, value: string) {
    const [driverId, vehicleId] = value.split("|");
    setSelection((current) => ({ ...current, [bookingId]: { driverId, vehicleId } }));
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الإدارة" title="الحجوزات" subtitle="راجع الحجز وحدد مساره، ثم عيّن سائقًا وسيارة مؤهلين للمسار والتصاريح المطلوبة." />
        <section className="panel filters"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الحجز أو اسم المسافر أو الهاتف" /><select className="input" value={status} onChange={(e) => setStatus(e.target.value as "" | BookingReviewStatus)}><option value="">كل الحالات</option>{Object.entries(BOOKING_REVIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button" type="button" onClick={() => void load()}>بحث</button></section>
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="booking-list admin-booking-list">
          {bookings.map((booking) => {
            const driverOptions = eligible[booking.id] ?? [];
            const selected = selection[booking.id];
            return <article className="booking-card" key={booking.id}>
              <div className="booking-card-head"><div><strong>{booking.bookingReference}</strong><small>{booking.contactName} · {booking.contactPhone}</small></div><StatusPill status={booking.bookingReviewStatus ?? booking.status} label={booking.bookingReviewStatus ? BOOKING_REVIEW_LABELS[booking.bookingReviewStatus] : TRIP_STATUS_LABELS[booking.status]} /></div>
              <div className="route-booking-highlight"><div><small>المسار</small><strong>{booking.route?.nameAr ?? (booking.direction ? DIRECTION_LABELS[booking.direction] : "مسار غير محدد")}</strong></div><div><small>النوع</small><strong>{booking.bookingType ? BOOKING_TYPE_LABELS[booking.bookingType] : "—"}</strong></div><div><small>التاريخ</small><strong>{booking.travelDate ? new Date(booking.travelDate).toLocaleDateString("ar") : "—"}</strong></div><div><small>{booking.bookingType === "PRIVATE_CAR" ? "فئة السيارة" : "المقاعد"}</small><strong>{booking.bookingType === "PRIVATE_CAR" ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"] : `${booking.passengerCount ?? 1} مسافر`}</strong></div></div>
              <p>{booking.pickupAddress} ← {booking.dropoffAddress}</p>
              <div className="booking-meta"><span>{booking.flightNumber || "لا يوجد رقم طيران"}</span><span>{booking.flightArrivalTime || "وقت غير محدد"}</span><span>{Number(booking.estimatedFare).toLocaleString("ar")} {booking.currency}</span></div>
              {booking.notes ? <div className="notice">{booking.notes}</div> : null}

              {booking.bookingReviewStatus === "NEW" ? <div className="actions"><button className="button primary" disabled={Boolean(working)} type="button" onClick={() => void action(`/admin/bookings/${booking.id}/confirm`)}>تأكيد الحجز</button><button className="button danger" disabled={Boolean(working)} type="button" onClick={() => void action(`/admin/bookings/${booking.id}/reject`, { note: "Rejected from administration portal" })}>رفض الحجز</button></div> : null}

              {booking.bookingReviewStatus === "CONFIRMED" && !booking.driver && ["PENDING_DISPATCH", "SEARCHING_DRIVER"].includes(booking.status) ? <div className="eligible-dispatch-panel"><div className="section-heading"><div><strong>اختيار السائق والسيارة</strong><small>يفضل مراجعة مسار الرحلة على الخريطة قبل التعيين؛ بعد التعيين يُقفل المسار تلقائيًا.</small></div><div className="actions"><Link className="button" href={`/admin/bookings/${booking.id}/tracking`}>تخطيط المسار</Link><button className="button" disabled={working === `eligible-${booking.id}`} type="button" onClick={() => void loadEligibleDrivers(booking)}>{working === `eligible-${booking.id}` ? "جارٍ الفحص..." : "تحميل المؤهلين"}</button></div></div>{driverOptions.length ? <><select className="input" value={selected ? `${selected.driverId}|${selected.vehicleId}` : ""} onChange={(e) => chooseDriverVehicle(booking.id, e.target.value)}><option value="">اختر السائق والمركبة</option>{driverOptions.flatMap((driver) => driver.vehicles.map((vehicle) => <option key={`${driver.driverId}-${vehicle.id}`} value={`${driver.driverId}|${vehicle.id}`} disabled={driver.hasScheduleConflict}>{driver.displayName} · {vehicle.make} {vehicle.model} · {vehicle.plateNumber} · {vehicle.seatCapacity} مقاعد{driver.hasScheduleConflict ? ` · تعارض ${driver.conflictRunReference}` : ""}</option>))}</select><div className="eligible-driver-cards">{driverOptions.map((driver) => <div className="eligible-driver-card" key={driver.driverId}>{driver.avatarUrl ? <img src={driver.avatarUrl} alt={driver.displayName} /> : <div className="avatar-placeholder">{driver.displayName.slice(0, 1)}</div>}<div><strong>{driver.displayName}</strong><small>{driver.baseRegion?.nameAr ?? "بلا مركز"} · تقييم {driver.rating} · {driver.completedTrips} رحلة</small></div><StatusPill status={driver.hasScheduleConflict ? "SUSPENDED" : "APPROVED"} label={driver.hasScheduleConflict ? "تعارض" : "متاح"} /></div>)}</div><button className="button primary" disabled={!selected || Boolean(working)} type="button" onClick={() => void action(`/admin/trips/${booking.id}/assign-driver`, selected)}>تعيين السائق والسيارة</button></> : <div className="empty-state">اضغط تحميل المؤهلين لعرض النتائج.</div>}</div> : null}

              {booking.driver ? <div className="assigned-driver-summary">{booking.driverPublicProfile?.avatarUrl ? <img src={booking.driverPublicProfile.avatarUrl} alt={booking.driverPublicProfile.displayName} /> : null}<div><strong>السائق: {booking.driver.firstName} {booking.driver.lastName}</strong><small>{TRIP_STATUS_LABELS[booking.status]}{booking.driverAssignmentStatus ? ` · ${DRIVER_ASSIGNMENT_LABELS[booking.driverAssignmentStatus]}` : ""}</small></div>{booking.driverPublicProfile?.vehicle?.primaryImageUrl ? <img className="assigned-vehicle-thumb" src={booking.driverPublicProfile.vehicle.primaryImageUrl} alt="المركبة" /> : null}</div> : null}
              {booking.serviceRun ? <div className="run-summary"><strong>{booking.serviceRun.runReference}</strong><span>{SERVICE_RUN_STATUS_LABELS[booking.serviceRun.status]}</span><span>المقاعد {booking.serviceRun.reservedSeats}/{booking.serviceRun.seatCapacity}</span></div> : null}
              {booking.driverRejectionReason ? <div className="notice error">سبب رفض السائق: {booking.driverRejectionReason}</div> : null}
              <div className="actions"><Link className="button primary" href={`/admin/bookings/${booking.id}/tracking`}>{booking.driver ? "تتبع الرحلة" : "تخطيط المسار"}</Link><Link className="button" href={`/admin/bookings/${booking.id}`}>التفاصيل</Link></div>
            </article>;
          })}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
