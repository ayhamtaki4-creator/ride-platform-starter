"use client";

import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { apiFetch, fetchProtectedBlob } from "@/lib/api";
import { EligibleDriver } from "@/lib/admin-operations";
import {
  BOOKING_REVIEW_LABELS,
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  DRIVER_ASSIGNMENT_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  Trip,
  TRIP_STATUS_LABELS,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
} from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type BookingEditForm = {
  contactName: string;
  contactPhone: string;
  travelDate: string;
  flightArrivalTime: string;
  flightNumber: string;
  notes: string;
  passengerCount: number;
  luggageCount: number;
  vehicleClass: VehicleClass;
  estimatedFare: number;
  currency: string;
};

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function bookingForm(booking: Trip): BookingEditForm {
  return {
    contactName: booking.contactName ?? "",
    contactPhone: booking.contactPhone ?? "",
    travelDate: toDateInput(booking.travelDate),
    flightArrivalTime: booking.flightArrivalTime ?? "",
    flightNumber: booking.flightNumber ?? "",
    notes: booking.notes ?? "",
    passengerCount: booking.passengerCount ?? 1,
    luggageCount: booking.luggageCount ?? 0,
    vehicleClass: booking.vehicleClass ?? "SMALL",
    estimatedFare: Number(booking.estimatedFare ?? 0),
    currency: booking.currency ?? "USD",
  };
}

export default function AdminBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Trip | null>(null);
  const [edit, setEdit] = useState<BookingEditForm | null>(null);
  const [eligible, setEligible] = useState<EligibleDriver[]>([]);
  const [selection, setSelection] = useState<{ driverId: string; vehicleId: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openingTicket, setOpeningTicket] = useState(false);
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Trip>(`/admin/bookings/${params.id}`);
      setBooking(data);
      setEdit(bookingForm(data));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل تفاصيل الحجز.");
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(path: string, body?: object) {
    setWorking(path);
    setMessage("");
    setError("");
    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage("تم تنفيذ العملية بنجاح.");
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
      return false;
    } finally {
      setWorking("");
    }
  }

  async function saveBooking(event: FormEvent) {
    event.preventDefault();
    if (!edit) return;
    setWorking("save");
    setMessage("");
    setError("");
    try {
      await apiFetch(`/admin/booking-control/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...edit,
          currency: edit.currency.trim().toUpperCase(),
        }),
      });
      setMessage("تم حفظ معلومات الحجز والسعر.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ معلومات الحجز.");
    } finally {
      setWorking("");
    }
  }

  async function loadEligibleDrivers() {
    if (!booking?.routeId || !booking.travelDate) {
      setError("لا يحتوي الحجز على مسار وتاريخ صالحين لتحميل السائقين المؤهلين.");
      return;
    }
    setWorking("eligible");
    setMessage("");
    setError("");
    try {
      const paramsQuery = new URLSearchParams({
        travelDate: new Date(booking.travelDate).toISOString(),
        vehicleClass: booking.vehicleClass ?? "SMALL",
        passengerCount: String(booking.passengerCount ?? 1),
      });
      const rows = await apiFetch<EligibleDriver[]>(
        `/admin/routes/${booking.routeId}/eligible-drivers?${paramsQuery}`,
      );
      setEligible(rows);
      const first = rows.find((driver) => !driver.hasScheduleConflict && driver.vehicles.length > 0);
      setSelection(first?.vehicles[0] ? { driverId: first.driverId, vehicleId: first.vehicles[0].id } : null);
      setMessage(rows.length ? `تم العثور على ${rows.length} سائق مؤهل.` : "لا يوجد سائق مؤهل لهذا التاريخ.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السائقين.");
    } finally {
      setWorking("");
    }
  }

  async function assignSelectedDriver() {
    if (!booking || !selection) return;
    if (booking.driver) {
      await runAction(`/admin/trips/${booking.id}/reassign-driver`, {
        ...selection,
        note: "Driver changed from booking detail by administration",
      });
    } else {
      await runAction(`/admin/trips/${booking.id}/assign-driver`, selection);
    }
    setEligible([]);
    setSelection(null);
  }

  function chooseDriverVehicle(value: string) {
    const [driverId, vehicleId] = value.split("|");
    setSelection(driverId && vehicleId ? { driverId, vehicleId } : null);
  }

  async function openFlightTicket() {
    if (!booking?.flightTicketMedia) return;
    setOpeningTicket(true);
    try {
      const blob = await fetchProtectedBlob(`/bookings/${booking.id}/flight-ticket`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح تذكرة الطيران.");
    } finally {
      setOpeningTicket(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="تفاصيل الحجز"
          title={booking?.bookingReference || "تحميل الحجز"}
          subtitle="مركز التحكم الكامل بالحجز والتعيين والسعر والمعلومات التشغيلية."
        />

        <div className="actions">
          <Link className="button" href="/admin/bookings">العودة إلى الحجوزات</Link>
          <Link className="button primary" href={`/admin/bookings/${params.id}/tracking`}>الخريطة والمسار</Link>
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </div>

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {booking && edit ? (
          <>
            <section className="grid admin-stats">
              <div className="card"><div className="label">مراجعة الإدارة</div><div className="value compact-value">{booking.bookingReviewStatus ? BOOKING_REVIEW_LABELS[booking.bookingReviewStatus] : "—"}</div></div>
              <div className="card"><div className="label">حالة التشغيل</div><div className="value compact-value">{TRIP_STATUS_LABELS[booking.status]}</div></div>
              <div className="card"><div className="label">رد السائق</div><div className="value compact-value">{booking.driverAssignmentStatus ? DRIVER_ASSIGNMENT_LABELS[booking.driverAssignmentStatus] : "—"}</div></div>
              <div className="card"><div className="label">السعر</div><div className="value compact-value">{Number(booking.estimatedFare).toLocaleString("ar")} {booking.currency}</div></div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div><h2>إجراءات الإدارة</h2><p className="subtitle">تستطيع الإدارة تنفيذ الإجراءات نيابة عن مركز العمليات دون انتظار صفحات أخرى.</p></div>
              </div>
              <div className="actions">
                {booking.bookingReviewStatus === "NEW" ? (
                  <>
                    <button className="button primary" disabled={Boolean(working)} type="button" onClick={() => void runAction(`/admin/bookings/${booking.id}/confirm`)}>تأكيد الحجز</button>
                    <button className="button danger" disabled={Boolean(working)} type="button" onClick={() => void runAction(`/admin/bookings/${booking.id}/reject`, { note: "Rejected from booking detail" })}>رفض الحجز</button>
                  </>
                ) : null}
                {booking.driver && booking.driverAssignmentStatus === "PENDING" && booking.status === "DRIVER_ASSIGNED" ? (
                  <button className="button primary" disabled={Boolean(working)} type="button" onClick={() => void runAction(`/admin/booking-control/${booking.id}/accept-driver`)}>
                    الموافقة نيابة عن السائق
                  </button>
                ) : null}
                {booking.driver && ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED"].includes(booking.status) ? (
                  <button className="button" disabled={Boolean(working)} type="button" onClick={() => void runAction(`/admin/trips/${booking.id}/unassign-driver`, { note: "Unassigned from booking detail" })}>
                    إلغاء تعيين السائق
                  </button>
                ) : null}
              </div>
            </section>

            <section className="two-column-layout">
              <article className="panel">
                <h2>تعديل معلومات الحجز</h2>
                <form className="admin-form-grid" onSubmit={saveBooking}>
                  <label><span className="label">اسم المسافر</span><input className="input" value={edit.contactName} onChange={(e) => setEdit({ ...edit, contactName: e.target.value })} required /></label>
                  <label><span className="label">رقم الهاتف</span><InternationalPhoneInput value={edit.contactPhone} onChange={(value) => setEdit({ ...edit, contactPhone: value })} name="adminBookingPhone" required /></label>
                  <label><span className="label">تاريخ الرحلة</span><input className="input" type="date" value={edit.travelDate} onChange={(e) => setEdit({ ...edit, travelDate: e.target.value })} required /></label>
                  <label><span className="label">وقت الطائرة</span><input className="input" type="time" value={edit.flightArrivalTime} onChange={(e) => setEdit({ ...edit, flightArrivalTime: e.target.value })} /></label>
                  <label><span className="label">رقم الرحلة الجوية</span><input className="input" value={edit.flightNumber} onChange={(e) => setEdit({ ...edit, flightNumber: e.target.value })} /></label>
                  <label><span className="label">فئة السيارة</span><select className="input" value={edit.vehicleClass} onChange={(e) => setEdit({ ...edit, vehicleClass: e.target.value as VehicleClass })}>{Object.entries(VEHICLE_CLASS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span className="label">عدد المسافرين</span><input className="input" type="number" min={1} max={20} value={edit.passengerCount} onChange={(e) => setEdit({ ...edit, passengerCount: Number(e.target.value) })} /></label>
                  <label><span className="label">عدد الحقائب</span><input className="input" type="number" min={0} max={30} value={edit.luggageCount} onChange={(e) => setEdit({ ...edit, luggageCount: Number(e.target.value) })} /></label>
                  <label><span className="label">سعر الحجز</span><input className="input" type="number" min={0} step="0.01" value={edit.estimatedFare} onChange={(e) => setEdit({ ...edit, estimatedFare: Number(e.target.value) })} /></label>
                  <label><span className="label">العملة</span><input className="input" value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })} maxLength={8} /></label>
                  <label className="full-width"><span className="label">ملاحظات</span><textarea className="input" rows={4} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
                  <button className="button primary full-width" disabled={working === "save"} type="submit">{working === "save" ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button>
                </form>
                <div className="notice">
                  <strong>نقاط المسار:</strong> {booking.pickupAddress} ← {booking.dropoffAddress}
                  <br />لتعديل المكان الدقيق والإحداثيات استخدم زر «الخريطة والمسار» حتى يتحدث الطريق معها بصورة صحيحة.
                </div>
                {booking.flightTicketMedia ? (
                  <div className="actions"><button className="button" type="button" disabled={openingTicket} onClick={() => void openFlightTicket()}>{openingTicket ? "جارٍ فتح التذكرة..." : `فتح التذكرة: ${booking.flightTicketMedia.originalName}`}</button></div>
                ) : null}
              </article>

              <article className="panel">
                <h2>السائق والتشغيل</h2>
                {booking.driver ? (
                  <div className="detail-list">
                    <div><span>السائق الحالي</span><strong>{booking.driver.firstName} {booking.driver.lastName}</strong></div>
                    <div><span>الهاتف</span><strong>{booking.driver.phone || "—"}</strong></div>
                    <div><span>حالة الموافقة</span><strong>{booking.driverAssignmentStatus ? DRIVER_ASSIGNMENT_LABELS[booking.driverAssignmentStatus] : "—"}</strong></div>
                  </div>
                ) : <div className="empty-state">لم يعيّن سائق بعد.</div>}

                {booking.routeId && booking.travelDate ? (
                  <div className="eligible-dispatch-panel">
                    <div className="section-heading">
                      <div><strong>{booking.driver ? "تغيير السائق" : "تعيين سائق"}</strong><small>السائق الذي يعمل الآن سيظهر أيضًا إذا لم يكن لديه تعارض في تاريخ هذا الحجز.</small></div>
                      <button className="button" disabled={working === "eligible"} type="button" onClick={() => void loadEligibleDrivers()}>{working === "eligible" ? "جارٍ الفحص..." : "تحميل السائقين المؤهلين"}</button>
                    </div>
                    {eligible.length ? (
                      <>
                        <select className="input" value={selection ? `${selection.driverId}|${selection.vehicleId}` : ""} onChange={(e) => chooseDriverVehicle(e.target.value)}>
                          <option value="">اختر السائق والمركبة</option>
                          {eligible.flatMap((driver) => driver.vehicles.map((vehicle) => (
                            <option key={`${driver.driverId}-${vehicle.id}`} value={`${driver.driverId}|${vehicle.id}`} disabled={driver.hasScheduleConflict}>
                              {driver.displayName} · {vehicle.make} {vehicle.model} · {vehicle.plateNumber} · {driver.availability === "ON_TRIP" ? "في رحلة الآن" : "متاح الآن"}{driver.hasScheduleConflict ? ` · تعارض في هذا اليوم ${driver.conflictRunReference ?? ""}` : ""}
                            </option>
                          )))}
                        </select>
                        <button className="button primary" disabled={!selection || Boolean(working)} type="button" onClick={() => void assignSelectedDriver()}>{booking.driver ? "تغيير السائق" : "تعيين السائق"}</button>
                      </>
                    ) : <div className="empty-state">اضغط «تحميل السائقين المؤهلين» لعرض النتائج.</div>}
                  </div>
                ) : null}

                {booking.serviceRun ? (
                  <>
                    <div className="notice success">تشغيل {booking.serviceRun.runReference} · {SERVICE_RUN_STATUS_LABELS[booking.serviceRun.status]}</div>
                    <div className="detail-list">
                      <div><span>المركبة</span><strong>{booking.serviceRun.vehicle?.make ?? "مركبة غير محددة"} {booking.serviceRun.vehicle?.model ?? ""} · {booking.serviceRun.vehicle?.plateNumber ?? "بدون لوحة"}</strong></div>
                      <div><span>المقاعد المحجوزة</span><strong>{booking.serviceRun.reservedSeats}/{booking.serviceRun.seatCapacity}</strong></div>
                    </div>
                  </>
                ) : null}
              </article>
            </section>

            <section className="panel">
              <h2>بيانات مرجعية</h2>
              <div className="detail-list">
                <div><span>الاتجاه</span><strong>{booking.direction ? DIRECTION_LABELS[booking.direction] : "—"}</strong></div>
                <div><span>نوع الحجز</span><strong>{booking.bookingType ? BOOKING_TYPE_LABELS[booking.bookingType] : "—"}</strong></div>
                <div><span>الطائرة</span><strong>{booking.flightNumber || "—"} · {booking.flightArrivalTime || "—"}</strong></div>
              </div>
            </section>

            <section className="panel">
              <h2>سجل الحالات</h2>
              <div className="timeline-list">
                {booking.statusHistory?.map((item) => (
                  <div className="timeline-row" key={item.id}><span>{TRIP_STATUS_LABELS[item.to]}</span><small>{new Date(item.createdAt).toLocaleString("ar")}</small><p>{item.note || "—"}</p></div>
                ))}
              </div>
            </section>
          </>
        ) : <div className="empty-state">جارٍ تحميل بيانات الحجز...</div>}
      </Shell>
    </ProtectedRoute>
  );
}
