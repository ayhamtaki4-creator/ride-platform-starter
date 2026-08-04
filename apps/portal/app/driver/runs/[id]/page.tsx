"use client";

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
  ServiceRunPassengerStatus,
  ServiceRunRealtimeEvent,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function DriverRunDetailPage() {
  const params = useParams<{ id: string }>();
  const { socket, isRealtimeConnected } = useAuth();
  const [run, setRun] = useState<ServiceRun | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ServiceRun>(`/drivers/me/runs/${params.id}`);
      setRun(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الرحلة.");
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const refresh = (event: ServiceRunRealtimeEvent) => {
      if (event.runId === params.id) void load();
    };
    socket.on("driver.run.updated", refresh);
    socket.on("run.updated", refresh);
    socket.on("run.passenger.updated", refresh);
    socket.on("run.started", refresh);
    socket.on("run.completed", refresh);
    return () => {
      socket.off("driver.run.updated", refresh);
      socket.off("run.updated", refresh);
      socket.off("run.passenger.updated", refresh);
      socket.off("run.started", refresh);
      socket.off("run.completed", refresh);
    };
  }, [load, params.id, socket]);

  async function action(path: string, body?: object, success?: string, method = "POST") {
    setWorking(path);
    setError("");
    setMessage("");
    try {
      const updated = await apiFetch<ServiceRun>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setRun(updated);
      setMessage(success ?? "تم تحديث الرحلة.");
      setRejectReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
    } finally {
      setWorking("");
    }
  }

  async function updatePassenger(bookingId: string, status: ServiceRunPassengerStatus) {
    await action(
      `/drivers/me/runs/${params.id}/bookings/${bookingId}/status`,
      { status },
      "تم تحديث حالة المسافر.",
      "PATCH"
    );
  }

  if (!run) {
    return (
      <ProtectedRoute roles={["DRIVER"]}>
        <Shell><div className="panel">{error || "جارٍ تحميل الرحلة..."}</div></Shell>
      </ProtectedRoute>
    );
  }

  const waitingCount = run.bookings.filter(
    (booking) => booking.serviceRunPassengerStatus === "WAITING"
  ).length;
  const pickedUpCount = run.bookings.filter(
    (booking) => booking.serviceRunPassengerStatus === "PICKED_UP"
  ).length;

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الرحلة التشغيلية"
          title={run.runReference}
subtitle={`${
  run.direction
    ? (DIRECTION_LABELS[run.direction] ?? run.direction)
    : "مسار غير محدد"
} · ${new Date(run.travelDate).toLocaleString("ar")}`}        />

        <div className="realtime-toolbar">
          <span className={`connection-badge ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
            {isRealtimeConnected ? "التحديث المباشر فعّال" : "جارٍ استعادة الاتصال"}
          </span>
          <Link className="button" href="/driver">العودة للجدول</Link>
        </div>

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="grid admin-stats">
          <div className="card"><div className="label">الحالة</div><div className="value compact-value">{SERVICE_RUN_STATUS_LABELS[run.status]}</div></div>
          <div className="card"><div className="label">النوع</div><div className="value compact-value">{BOOKING_TYPE_LABELS[run.bookingType]}</div></div>
          <div className="card"><div className="label">المسافرون</div><div className="value">{run.report.passengerCount}</div></div>
          <div className="card"><div className="label">الحقائب</div><div className="value">{run.report.luggageCount}</div></div>
          <div className="card"><div className="label">المقاعد</div><div className="value">{run.reservedSeats}/{run.seatCapacity}</div></div>
          <div className="card"><div className="label">صعدوا</div><div className="value">{pickedUpCount}</div></div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>المركبة والتنفيذ</h2>
              <p className="subtitle">{run.vehicle.make} {run.vehicle.model} · {run.vehicle.plateNumber}</p>
            </div>
            <span className="status">{SERVICE_RUN_STATUS_LABELS[run.status]}</span>
          </div>

          {run.driverRejectionReason ? <div className="notice error">{run.driverRejectionReason}</div> : null}

          {["SCHEDULED", "DRIVER_PENDING"].includes(run.status) ? (
            <>
              <input
                className="input"
                placeholder="سبب الرفض عند الحاجة"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
              <div className="actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={Boolean(working)}
                  onClick={() => void action(`/drivers/me/runs/${run.id}/accept`, undefined, "تم قبول الرحلة التشغيلية.")}
                >
                  قبول الرحلة
                </button>
                <button
                  className="button danger"
                  type="button"
                  disabled={Boolean(working) || rejectReason.trim().length < 3}
                  onClick={() => void action(`/drivers/me/runs/${run.id}/reject`, { reason: rejectReason }, "تم إرسال الرفض إلى مركز العمليات.")}
                >
                  رفض الرحلة
                </button>
              </div>
            </>
          ) : null}

          {run.status === "DRIVER_ACCEPTED" ? (
            <button
              className="button primary"
              type="button"
              disabled={Boolean(working)}
              onClick={() => void action(`/drivers/me/runs/${run.id}/boarding`, undefined, "بدأت مرحلة صعود الركاب.")}
            >
              بدء صعود الركاب
            </button>
          ) : null}

          {run.status === "BOARDING" ? (
            <div className="actions">
              <button
                className="button primary"
                type="button"
                disabled={Boolean(working) || waitingCount > 0 || pickedUpCount === 0}
                onClick={() => void action(`/drivers/me/runs/${run.id}/start`, undefined, "بدأت الرحلة.")}
              >
                بدء الرحلة
              </button>
              {waitingCount > 0 ? <span className="subtitle">بقي {waitingCount} حجوزات دون تحديد حالة.</span> : null}
            </div>
          ) : null}

          {run.status === "IN_PROGRESS" ? (
            <button
              className="button primary"
              type="button"
              disabled={Boolean(working)}
              onClick={() => void action(`/drivers/me/runs/${run.id}/complete`, undefined, "تم إنهاء الرحلة وتحديث الحجوزات.")}
            >
              إنهاء الرحلة
            </button>
          ) : null}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>قائمة الركاب ونقاط الالتقاط</h2>
              <p className="subtitle">اتصل بالمسافر وسجل صعوده أو عدم حضوره.</p>
            </div>
          </div>

          <div className="schedule-card-grid passenger-manifest-grid">
            {run.bookings.map((booking) => (
              <article className="booking-card" key={booking.id}>
                <div className="booking-card-head">
                  <div>
                    <strong>{booking.bookingReference}</strong>
                    <small>ترتيب الالتقاط: {booking.pickupOrder ?? "—"}</small>
                  </div>
                  <span className="status">
                    {SERVICE_RUN_PASSENGER_STATUS_LABELS[booking.serviceRunPassengerStatus]}
                  </span>
                </div>

                <div className="booking-meta">
                  <span>{booking.contactName || `${booking.passenger?.firstName} ${booking.passenger?.lastName || ""}`}</span>
                  <span>{booking.contactPhone || booking.passenger?.phone || "—"}</span>
                  <span>{booking.bookingType === "PRIVATE_CAR" ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"] : "مقعد واحد"}</span>
                  <span>{booking.flightNumber || "دون رقم طائرة"} · {booking.flightArrivalTime || "—"}</span>
                </div>

                <div className="notice">
                  <strong>الالتقاط:</strong> {booking.pickupAddress}<br />
                  <strong>الوصول:</strong> {booking.dropoffAddress}
                </div>

                {run.status === "BOARDING" && booking.serviceRunPassengerStatus === "WAITING" ? (
                  <div className="actions">
                    <button
                      className="button primary"
                      disabled={Boolean(working)}
                      type="button"
                      onClick={() => void updatePassenger(booking.id, "PICKED_UP")}
                    >
                      صعد إلى المركبة
                    </button>
                    <button
                      className="button danger"
                      disabled={Boolean(working)}
                      type="button"
                      onClick={() => void updatePassenger(booking.id, "NO_SHOW")}
                    >
                      لم يحضر
                    </button>
                  </div>
                ) : null}

                {run.status === "IN_PROGRESS" && booking.serviceRunPassengerStatus === "PICKED_UP" ? (
                  <button
                    className="button"
                    disabled={Boolean(working)}
                    type="button"
                    onClick={() => void updatePassenger(booking.id, "DROPPED_OFF")}
                  >
                    تم إنزال المسافر
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
