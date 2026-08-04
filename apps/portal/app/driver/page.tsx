"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { useAuth } from "@/components/auth-provider";
import { ProtectedRoute } from "@/components/protected-route";
import { RideMapClient } from "@/components/ride-map-client";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import {
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  DRIVER_ASSIGNMENT_LABELS,
  DriverAvailabilityRealtimeEvent,
  SERVICE_RUN_STATUS_LABELS,
  ServiceRun,
  ServiceRunRealtimeEvent,
  Trip,
  TripRealtimeEvent,
  TRIP_STATUS_LABELS,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";

type DriverProfile = {
  id: string;
  status: string;
  availability: "OFFLINE" | "ONLINE" | "ON_TRIP";
  rating: number;
  vehicles: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
    seatCapacity: number;
  }>;
};

const operationalStatuses = [
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
] as const;

export default function DriverPage() {
  const { socket, isRealtimeConnected } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [schedule, setSchedule] = useState<Trip[]>([]);
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const operationalTrip = useMemo(
    () =>
      schedule.find(
        (trip) =>
          operationalStatuses.includes(
            trip.status as (typeof operationalStatuses)[number]
          ) &&
          trip.driverAssignmentStatus === "ACCEPTED"
      ),
    [schedule]
  );

  const loadData = useCallback(async () => {
    try {
      const [driverProfile, trips, serviceRuns] = await Promise.all([
        apiFetch<DriverProfile>("/drivers/me"),
        apiFetch<Trip[]>("/drivers/me/schedule"),
        apiFetch<ServiceRun[]>("/drivers/me/runs"),
      ]);

      setProfile(driverProfile);
      setSchedule(trips);
      setRuns(serviceRuns);
      setError("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحميل جدول السائق."
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;

    const refresh = (_event?: TripRealtimeEvent) => void loadData();
    const onAssigned = (event: TripRealtimeEvent) => {
      setMessage(
        `وصلتك مهمة مجدولة جديدة ${
          event.bookingReference || `#${event.tripId.slice(0, 8)}`
        }. راجعها ثم اقبلها أو ارفضها.`
      );
      void loadData();
    };
    const onUnassigned = () => {
      setMessage("ألغى مركز العمليات التعيين أو نقله إلى سائق آخر.");
      void loadData();
    };
    const onAvailability = (_event: DriverAvailabilityRealtimeEvent) =>
      void loadData();

    const onRun = (event: ServiceRunRealtimeEvent) => {
      setMessage(`تم تحديث الرحلة التشغيلية ${event.runReference}.`);
      void loadData();
    };

    socket.on("driver.trip.assigned", onAssigned);
    socket.on("driver.trip.updated", refresh);
    socket.on("driver.trip.unassigned", onUnassigned);
    socket.on("driver.availability.updated", onAvailability);
    socket.on("driver.run.assigned", onRun);
    socket.on("driver.run.updated", onRun);
    socket.on("driver.run.unassigned", onRun);

    return () => {
      socket.off("driver.trip.assigned", onAssigned);
      socket.off("driver.trip.updated", refresh);
      socket.off("driver.trip.unassigned", onUnassigned);
      socket.off("driver.availability.updated", onAvailability);
      socket.off("driver.run.assigned", onRun);
      socket.off("driver.run.updated", onRun);
      socket.off("driver.run.unassigned", onRun);
    };
  }, [loadData, socket]);

  useEffect(() => {
    if (!socket || !operationalTrip) return;
    socket.emit("trip.subscribe", { tripId: operationalTrip.id });
  }, [operationalTrip?.id, socket]);

  async function request(path: string, body?: object, success?: string) {
    setWorking(path);
    setError("");
    setMessage("");

    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(success || "تم تحديث المهمة.");
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تنفيذ العملية."
      );
    } finally {
      setWorking("");
    }
  }

  async function setAvailability(availability: "OFFLINE" | "ONLINE") {
    setWorking(`availability:${availability}`);
    setError("");
    setMessage("");

    try {
      await apiFetch("/drivers/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ availability }),
      });
      setMessage(
        availability === "ONLINE"
          ? "أصبحت متصلًا ويمكن لمركز العمليات جدولة حجوزات لك."
          : "أصبحت غير متصل."
      );
      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحديث حالة الاتصال."
      );
    } finally {
      setWorking("");
    }
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق"
          title="المهام والجدول اليومي"
          subtitle="راجع المهام المجدولة، اقبلها أو ارفضها، ثم نفّذ مراحل الرحلة."
        />

        <div className="realtime-toolbar">
          <span
            className={`connection-badge ${
              isRealtimeConnected ? "is-online" : "is-offline"
            }`}
          >
            {isRealtimeConnected
              ? "التحديث المباشر فعّال"
              : "جارٍ استعادة الاتصال"}
          </span>
          <span className="subtitle">
            يتم التحديث الاحتياطي كل 30 ثانية.
          </span>
        </div>

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="grid">
          <div className="card">
            <div className="label">حالة الاتصال</div>
            <div className="value compact-value">
              {profile?.availability ?? "..."}
            </div>
          </div>
          <div className="card">
            <div className="label">الاعتماد</div>
            <div className="value compact-value">{profile?.status ?? "..."}</div>
          </div>
          <div className="card">
            <div className="label">التقييم</div>
            <div className="value">{profile?.rating ?? "..."}</div>
          </div>
          <div className="card">
            <div className="label">المركبة والسعة</div>
            <div className="value compact-value">
              {profile?.vehicles[0]
                ? `${profile.vehicles[0].make} ${profile.vehicles[0].model} · ${profile.vehicles[0].seatCapacity} مقاعد`
                : "غير محددة"}
            </div>
          </div>
        </section>

        {profile?.availability !== "ON_TRIP" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>حالة التوفر</h2>
                <p className="subtitle">
                  يجب أن تكون Online حتى يتمكن مركز العمليات من تعيين حجوزات
                  جديدة لك.
                </p>
              </div>
              <div className="actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    Boolean(working) || profile?.availability === "ONLINE"
                  }
                  onClick={() => void setAvailability("ONLINE")}
                >
                  اتصال
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={
                    Boolean(working) || profile?.availability === "OFFLINE"
                  }
                  onClick={() => void setAvailability("OFFLINE")}
                >
                  عدم الاتصال
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>الرحلات التشغيلية</h2>
              <p className="subtitle">اقبل الرحلة كوحدة واحدة ثم سجّل صعود الركاب وابدأ التنفيذ.</p>
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="empty-state">لا توجد رحلات تشغيلية معيّنة لك.</div>
          ) : (
            <div className="schedule-card-grid run-grid">
              {runs.map((run) => (
                <article className="booking-card" key={run.id}>
                  <div className="booking-card-head">
                    <div>
                      <strong>{run.runReference}</strong>
                      <small>{new Date(run.travelDate).toLocaleString("ar")}</small>
                    </div>
                    <span className="status">{SERVICE_RUN_STATUS_LABELS[run.status]}</span>
                  </div>
                  <div className="booking-meta">
                    <span>{run.route?.nameAr ?? (run.direction ? DIRECTION_LABELS[run.direction] : "مسار غير محدد")}</span>
                    <span>{BOOKING_TYPE_LABELS[run.bookingType]}</span>
                    <span>{run.report.passengerCount} مسافر · {run.report.luggageCount} حقيبة</span>
                    <span>{run.reservedSeats}/{run.seatCapacity} مقاعد</span>
                  </div>
                  {run.driverRejectionReason ? <div className="notice error">{run.driverRejectionReason}</div> : null}
                  <Link className="button primary" href={`/driver/runs/${run.id}`}>
                    فتح الرحلة وقائمة الركاب
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        {operationalTrip ? (
          <section className="panel map-preview-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">المهمة الحالية</div>
                <h2>
                  {operationalTrip.pickupAddress} ←{" "}
                  {operationalTrip.dropoffAddress}
                </h2>
              </div>
              <span className="status">
                {TRIP_STATUS_LABELS[operationalTrip.status]}
              </span>
            </div>
            <RideMapClient
              pickup={{
                latitude: operationalTrip.pickupLatitude,
                longitude: operationalTrip.pickupLongitude,
                label: operationalTrip.pickupAddress,
              }}
              dropoff={{
                latitude: operationalTrip.dropoffLatitude,
                longitude: operationalTrip.dropoffLongitude,
                label: operationalTrip.dropoffAddress,
              }}
              height={390}
            />
          </section>
        ) : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>المهام المجدولة</h2>
              <p className="subtitle">
                الرحلات المشتركة التي تحمل رقم تشغيل واحد تُنفذ بالمركبة نفسها
                مع الالتزام بالسعة.
              </p>
            </div>
            <button className="button" onClick={() => void loadData()} type="button">
              تحديث
            </button>
          </div>

          {schedule.length === 0 ? (
            <div className="empty-state">لا توجد مهام مجدولة.</div>
          ) : (
            <div className="schedule-card-grid">
              {schedule.map((trip) => (
                <article className="booking-card" key={trip.id}>
                  <div className="booking-card-head">
                    <div>
                      <strong>{trip.bookingReference || "رحلة"}</strong>
                      <small>
                        {trip.travelDate
                          ? new Date(trip.travelDate).toLocaleDateString("ar")
                          : "غير مجدولة"}
                        {" · "}
                        {trip.flightArrivalTime || "وقت غير محدد"}
                      </small>
                    </div>
                    <span className="status">
                      {trip.driverAssignmentStatus
                        ? DRIVER_ASSIGNMENT_LABELS[
                            trip.driverAssignmentStatus
                          ]
                        : TRIP_STATUS_LABELS[trip.status]}
                    </span>
                  </div>

                  <div className="booking-meta">
                    <span>
                      {trip.route?.nameAr ?? (trip.direction
                        ? DIRECTION_LABELS[trip.direction]
                        : trip.pickupAddress)}
                    </span>
                    <span>
                      {trip.bookingType
                        ? BOOKING_TYPE_LABELS[trip.bookingType]
                        : "رحلة"}
                    </span>
                    <span>
                      {trip.bookingType === "PRIVATE_CAR"
                        ? VEHICLE_CLASS_LABELS[trip.vehicleClass ?? "SMALL"]
                        : "مقعد واحد"}
                    </span>
                    <span>{TRIP_STATUS_LABELS[trip.status]}</span>
                  </div>

                  <div className="notice">
                    المسافر: {trip.contactName || trip.passenger?.firstName}
                    {trip.contactPhone ? ` · ${trip.contactPhone}` : ""}
                  </div>

                  {trip.serviceRun ? (
                    <div className="run-summary">
                      <strong>{trip.serviceRun.runReference}</strong>
                      <span>
                        {
                          SERVICE_RUN_STATUS_LABELS[
                            trip.serviceRun.status
                          ]
                        }
                      </span>
                      <span>
                        المقاعد {trip.serviceRun.reservedSeats}/
                        {trip.serviceRun.seatCapacity}
                      </span>
                    </div>
                  ) : null}

                  {trip.serviceRun &&
                  trip.serviceRun.bookings.length > 1 ? (
                    <div className="schedule-list">
                      <strong>ركاب الرحلة المشتركة</strong>
                      {trip.serviceRun.bookings.map((item) => (
                        <div className="schedule-row" key={item.id}>
                          <div>
                            <strong>{item.bookingReference || "حجز"}</strong>
                            <small>
                              {item.contactName || "—"} ·{" "}
                              {item.contactPhone || "—"}
                            </small>
                          </div>
                          <span>
                            {item.passengerCount} مسافر · {item.luggageCount} حقيبة
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {trip.driverAssignmentStatus === "PENDING" ? (
                    <>
                      <input
                        className="input"
                        placeholder="سبب الرفض عند الحاجة"
                        value={rejectReasons[trip.id] ?? ""}
                        onChange={(event) =>
                          setRejectReasons((current) => ({
                            ...current,
                            [trip.id]: event.target.value,
                          }))
                        }
                      />
                      <div className="actions">
                        <button
                          className="button primary"
                          disabled={Boolean(working)}
                          type="button"
                          onClick={() =>
                            void request(
                              `/drivers/me/bookings/${trip.id}/accept`,
                              undefined,
                              "تم قبول المهمة وإضافتها إلى جدولك المؤكد."
                            )
                          }
                        >
                          قبول المهمة
                        </button>
                        <button
                          className="button danger"
                          disabled={
                            Boolean(working) ||
                            (rejectReasons[trip.id]?.trim().length ?? 0) < 3
                          }
                          type="button"
                          onClick={() =>
                            void request(
                              `/drivers/me/bookings/${trip.id}/reject`,
                              { reason: rejectReasons[trip.id] },
                              "تم رفض المهمة وإعادتها إلى مركز العمليات."
                            )
                          }
                        >
                          رفض المهمة
                        </button>
                      </div>
                    </>
                  ) : null}

                  {trip.driverAssignmentStatus === "ACCEPTED" &&
                  trip.status === "DRIVER_ASSIGNED" ? (
                    <div className="actions">
                      <button
                        className="button primary"
                        disabled={Boolean(working)}
                        onClick={() =>
                          void request(`/trips/${trip.id}/arriving`)
                        }
                        type="button"
                      >
                        أنا في الطريق
                      </button>
                    </div>
                  ) : null}

                  {trip.status === "DRIVER_ARRIVING" ? (
                    <div className="actions">
                      <button
                        className="button primary"
                        disabled={Boolean(working)}
                        onClick={() =>
                          void request(`/trips/${trip.id}/arrived`)
                        }
                        type="button"
                      >
                        وصلت إلى المسافر
                      </button>
                    </div>
                  ) : null}

                  {trip.status === "DRIVER_ARRIVED" ? (
                    <div className="actions">
                      <button
                        className="button primary"
                        disabled={Boolean(working)}
                        onClick={() =>
                          void request(
                            `/trips/${trip.id}/start`,
                            undefined,
                            "تم بدء الرحلة."
                          )
                        }
                        type="button"
                      >
                        بدء الرحلة
                      </button>
                    </div>
                  ) : null}

                  {trip.status === "IN_PROGRESS" ? (
                    <div className="actions">
                      <button
                        className="button primary"
                        disabled={Boolean(working)}
                        onClick={() =>
                          void request(`/trips/${trip.id}/complete`, {
                            note: "Completed from scheduled driver portal",
                          })
                        }
                        type="button"
                      >
                        إنهاء رحلة هذا المسافر
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
