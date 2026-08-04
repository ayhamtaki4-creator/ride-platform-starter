"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import {
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  SERVICE_RUN_PASSENGER_STATUS_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  ServiceRun,
  ServiceRunRealtimeEvent,
  Trip,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";

type AdminDriver = {
  userId: string;
  status: string;
  user: { firstName: string; lastName: string };
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    plateNumber: string;
    seatCapacity: number;
    isActive: boolean;
  }>;
};

export default function AdminRunDetailPage() {
  const params = useParams<{ id: string }>();
  const { socket } = useAuth();
  const [run, setRun] = useState<ServiceRun | null>(null);
  const [pending, setPending] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [selectedBooking, setSelectedBooking] = useState("");
  const [replacementDriver, setReplacementDriver] = useState("");
  const [replacementVehicle, setReplacementVehicle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    try {
      const [runData, pendingTrips, driverRows] = await Promise.all([
        apiFetch<ServiceRun>(`/admin/runs/${params.id}`),
        apiFetch<Trip[]>("/admin/trips/pending"),
        apiFetch<AdminDriver[]>("/admin/drivers"),
      ]);
      setRun(runData);
      setPending(pendingTrips);
      setDrivers(driverRows.filter((driver) => driver.status === "APPROVED"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الرحلة.");
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const refresh = (event: ServiceRunRealtimeEvent) => {
      if (event.runId === params.id) void load();
    };
    socket.on("admin.run.updated", refresh);
    socket.on("run.updated", refresh);
    socket.on("run.passenger.updated", refresh);
    socket.on("run.completed", refresh);
    return () => {
      socket.off("admin.run.updated", refresh);
      socket.off("run.updated", refresh);
      socket.off("run.passenger.updated", refresh);
      socket.off("run.completed", refresh);
    };
  }, [load, params.id, socket]);

  const compatibleBookings = useMemo(() => {
    if (!run) return [];
    return pending.filter((booking) => {
      if (booking.direction !== run.direction || booking.bookingType !== run.bookingType) {
        return false;
      }
      if (!booking.travelDate) return false;
      const bookingDate = new Date(booking.travelDate);
      const runDate = new Date(run.travelDate);
      return bookingDate.toDateString() === runDate.toDateString();
    });
  }, [pending, run]);

  const selectedReplacement = useMemo(
    () => drivers.find((driver) => driver.userId === replacementDriver),
    [drivers, replacementDriver]
  );

  useEffect(() => {
    const activeVehicle = selectedReplacement?.vehicles.find((vehicle) => vehicle.isActive);
    if (activeVehicle && replacementVehicle !== activeVehicle.id) {
      setReplacementVehicle(activeVehicle.id);
    }
  }, [replacementVehicle, selectedReplacement]);

  async function action(path: string, body?: object, success?: string, method = "POST") {
    setWorking(path);
    setError("");
    setMessage("");
    try {
      await apiFetch(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(success ?? "تم تحديث الرحلة.");
      setNote("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
    } finally {
      setWorking("");
    }
  }

  if (!run) {
    return (
      <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
        <Shell>
          <div className="panel">{error || "جارٍ تحميل الرحلة التشغيلية..."}</div>
        </Shell>
      </ProtectedRoute>
    );
  }

  const isEditable = [
    "DRAFT",
    "PLANNED",
    "SCHEDULED",
    "DRIVER_PENDING",
    "DRIVER_ACCEPTED",
    "DRIVER_REPLACEMENT_REQUIRED",
  ].includes(run.status);

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="تفاصيل الرحلة التشغيلية"
          title={run.runReference}
subtitle={`${
  run.direction
    ? (DIRECTION_LABELS[run.direction] ?? run.direction)
    : "مسار غير محدد"
} · ${new Date(run.travelDate).toLocaleString("ar")}`}        />

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="grid admin-stats">
          <div className="card"><div className="label">الحالة</div><div className="value compact-value">{SERVICE_RUN_STATUS_LABELS[run.status]}</div></div>
          <div className="card"><div className="label">الإشغال</div><div className="value">{run.reservedSeats}/{run.seatCapacity}</div></div>
          <div className="card"><div className="label">المسافرون</div><div className="value">{run.report.passengerCount}</div></div>
          <div className="card"><div className="label">الحقائب</div><div className="value">{run.report.luggageCount}</div></div>
          <div className="card"><div className="label">الإيراد</div><div className="value">${run.report.grossRevenue.toFixed(2)}</div></div>
          <div className="card"><div className="label">هامش المنصة</div><div className="value">${run.report.platformMargin.toFixed(2)}</div></div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>بيانات التشغيل</h2>
              <p className="subtitle">السائق والمركبة ونوع الخدمة.</p>
            </div>
            <div className="actions no-print">
              <button className="button" type="button" onClick={() => window.print()}>طباعة كشف الركاب</button>
              <Link className="button" href="/admin/runs">العودة للجدول</Link>
            </div>
          </div>

          <div className="booking-meta run-detail-meta">
            <span><strong>السائق:</strong> {run.driver?.firstName} {run.driver?.lastName}</span>
            <span><strong>الهاتف:</strong> {run.driver?.phone || "—"}</span>
            <span><strong>المركبة:</strong> {run.vehicle.make} {run.vehicle.model}</span>
            <span><strong>اللوحة:</strong> {run.vehicle.plateNumber}</span>
            <span><strong>النوع:</strong> {BOOKING_TYPE_LABELS[run.bookingType]}</span>
            <span><strong>السعة:</strong> {run.seatCapacity} مقاعد</span>
          </div>

          {run.notes ? <div className="notice">{run.notes}</div> : null}
          {run.driverRejectionReason ? <div className="notice error">سبب الرفض: {run.driverRejectionReason}</div> : null}

          {isEditable ? (
            <div className="actions no-print">
              <button
                className="button primary"
                type="button"
                disabled={Boolean(working) || run.bookings.length === 0}
                onClick={() => void action(`/admin/runs/${run.id}/schedule`, undefined, "تم إرسال الرحلة إلى السائق.")}
              >
                جدولة وإرسال للسائق
              </button>
              <button
                className="button danger"
                type="button"
                disabled={Boolean(working)}
                onClick={() => void action(`/admin/runs/${run.id}/cancel`, { note }, "تم إلغاء الرحلة وإعادة الحجوزات لمركز العمليات.")}
              >
                إلغاء الرحلة
              </button>
            </div>
          ) : null}
        </section>

        {isEditable ? (
          <section className="panel no-print">
            <div className="section-heading">
              <div>
                <h2>إضافة حجز مؤكد</h2>
                <p className="subtitle">تظهر الحجوزات المتوافقة مع الاتجاه والنوع والتاريخ فقط.</p>
              </div>
            </div>
            <div className="admin-form-grid compact-form-grid">
              <select className="input" value={selectedBooking} onChange={(event) => setSelectedBooking(event.target.value)}>
                <option value="">اختر حجزًا</option>
                {compatibleBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.bookingReference} · {booking.contactName} · {booking.bookingType === "PRIVATE_CAR" ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"] : "مقعد واحد"}
                  </option>
                ))}
              </select>
              <button
                className="button primary"
                type="button"
                disabled={!selectedBooking || Boolean(working)}
                onClick={() => void action(`/admin/runs/${run.id}/bookings/${selectedBooking}`, undefined, "تمت إضافة الحجز إلى الرحلة.")}
              >
                إضافة الحجز
              </button>
            </div>
          </section>
        ) : null}

        {isEditable ? (
          <section className="panel no-print">
            <div className="section-heading"><div><h2>استبدال السائق</h2><p className="subtitle">يُعاد إرسال الرحلة للسائق الجديد للموافقة.</p></div></div>
            <div className="admin-form-grid compact-form-grid">
              <select
                className="input"
                value={replacementDriver}
                onChange={(event) => {
                  setReplacementDriver(event.target.value);
                  setReplacementVehicle("");
                }}
              >
                <option value="">اختر السائق البديل</option>
                {drivers.filter((driver) => driver.userId !== run.driverId).map((driver) => (
                  <option key={driver.userId} value={driver.userId}>{driver.user.firstName} {driver.user.lastName}</option>
                ))}
              </select>
              <select className="input" value={replacementVehicle} onChange={(event) => setReplacementVehicle(event.target.value)}>
                <option value="">اختر المركبة</option>
                {(selectedReplacement?.vehicles ?? []).filter((vehicle) => vehicle.isActive).map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.plateNumber} · {vehicle.seatCapacity} مقاعد</option>
                ))}
              </select>
              <input className="input" placeholder="ملاحظة أو سبب الاستبدال" value={note} onChange={(event) => setNote(event.target.value)} />
              <button
                className="button"
                type="button"
                disabled={!replacementDriver || !replacementVehicle || Boolean(working)}
                onClick={() => void action(`/admin/runs/${run.id}/replace-driver`, { driverId: replacementDriver, vehicleId: replacementVehicle, note }, "تم تعيين السائق البديل.")}
              >
                تأكيد الاستبدال
              </button>
            </div>
          </section>
        ) : null}

        <section className="panel manifest-panel">
          <div className="section-heading">
            <div>
              <h2>كشف الركاب</h2>
              <p className="subtitle">ترتيب الالتقاط والحضور والحقائب ومعلومات الطائرة.</p>
            </div>
            <span className="status">{run.report.bookingCount} حجوزات</span>
          </div>

          {run.bookings.length === 0 ? (
            <div className="empty-state">لم تُضف حجوزات إلى هذه الرحلة بعد.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>الترتيب</th>
                    <th>الحجز والمسافر</th>
                    <th>الهاتف</th>
                    <th>{run.bookingType === "PRIVATE_CAR" ? "فئة السيارة" : "المقاعد"}</th>
                    <th>الالتقاط والوصول</th>
                    <th>الطائرة</th>
                    <th>الحضور</th>
                    <th className="no-print">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {run.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.pickupOrder ?? "—"}</td>
                      <td><strong>{booking.bookingReference}</strong><br /><small>{booking.contactName || `${booking.passenger?.firstName} ${booking.passenger?.lastName || ""}`}</small></td>
                      <td>{booking.contactPhone || booking.passenger?.phone || "—"}</td>
                      <td>{booking.bookingType === "PRIVATE_CAR" ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"] : "مقعد واحد"}</td>
                      <td><small>{booking.pickupAddress}<br />← {booking.dropoffAddress}</small></td>
                      <td>{booking.flightNumber || "—"}<br /><small>{booking.flightArrivalTime || "—"}</small></td>
                      <td><span className="status">{SERVICE_RUN_PASSENGER_STATUS_LABELS[booking.serviceRunPassengerStatus]}</span></td>
                      <td className="no-print">
                        {isEditable ? (
                          <button
                            className="button danger small-button"
                            type="button"
                            disabled={Boolean(working)}
                            onClick={() => void action(`/admin/runs/${run.id}/bookings/${booking.id}`, undefined, "تمت إزالة الحجز من الرحلة.", "DELETE")}
                          >
                            إزالة
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
