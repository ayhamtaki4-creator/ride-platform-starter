"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RideMapClient } from "@/components/ride-map-client";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import {
  ACTIVE_TRIP_STATUSES,
  Trip,
  TRIP_STATUS_LABELS,
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
  }>;
};

export default function DriverPage() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [myTrips, setMyTrips] = useState<Trip[]>([]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const activeTrip = useMemo(
    () => myTrips.find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)),
    [myTrips]
  );

  const loadData = useCallback(async () => {
    try {
      const [driverProfile, trips] = await Promise.all([
        apiFetch<DriverProfile>("/drivers/me"),
        apiFetch<Trip[]>("/trips/me"),
      ]);

      setProfile(driverProfile);
      setMyTrips(trips);
      setError("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحميل بيانات السائق."
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 4000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  async function setAvailability(availability: "OFFLINE" | "ONLINE") {
    setIsWorking(true);
    setError("");
    setMessage("");

    try {
      await apiFetch("/drivers/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ availability }),
      });

      setMessage(
        availability === "ONLINE"
          ? "أصبحت متصلًا. ستظهر الرحلة هنا بعد أن يعيّنها المشرف لك."
          : "أصبحت غير متصل ولن تظهر ضمن قائمة التوزيع."
      );
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحديث حالة الاتصال."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function runTripAction(path: string, body?: object) {
    setIsWorking(true);
    setError("");
    setMessage("");

    try {
      await apiFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      setMessage("تم تحديث الرحلة بنجاح.");
      setPin("");
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحديث الرحلة."
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="تجربة السائق"
          title="لوحة تشغيل السائق"
          subtitle="فعّل حالة الاتصال، ثم انتظر تعيين الرحلة من مركز العمليات."
        />

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="grid">
          <div className="card">
            <div className="label">حالة الاتصال</div>
            <div className="value">
              {profile?.availability === "ONLINE"
                ? "متصل"
                : profile?.availability === "ON_TRIP"
                  ? "في رحلة"
                  : "غير متصل"}
            </div>
          </div>
          <div className="card">
            <div className="label">الاعتماد</div>
            <div className="value">{profile?.status ?? "..."}</div>
          </div>
          <div className="card">
            <div className="label">التقييم</div>
            <div className="value">{profile?.rating ?? "..."}</div>
          </div>
          <div className="card">
            <div className="label">المركبة</div>
            <div className="value vehicle-value">
              {profile?.vehicles[0]
                ? `${profile.vehicles[0].make} ${profile.vehicles[0].model}`
                : "غير محددة"}
            </div>
          </div>
        </section>

        {!activeTrip && profile?.availability !== "ON_TRIP" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>الاستعداد لاستلام رحلة</h2>
                <p className="subtitle">
                  عندما تكون Online سيظهر اسمك للمشرف ضمن السائقين المتاحين.
                  السائق لا يختار الطلب بنفسه.
                </p>
              </div>
              <div className="actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={isWorking || profile?.availability === "ONLINE"}
                  onClick={() => void setAvailability("ONLINE")}
                >
                  اتصال
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={isWorking || profile?.availability === "OFFLINE"}
                  onClick={() => void setAvailability("OFFLINE")}
                >
                  عدم الاتصال
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTrip ? (
          <>
            <section className="panel map-preview-panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">رحلة عيّنها مركز العمليات</div>
                  <h2>
                    {activeTrip.pickupAddress} ← {activeTrip.dropoffAddress}
                  </h2>
                </div>
                <span className="status">
                  {TRIP_STATUS_LABELS[activeTrip.status]}
                </span>
              </div>

              <RideMapClient
                pickup={{
                  latitude: activeTrip.pickupLatitude,
                  longitude: activeTrip.pickupLongitude,
                  label: activeTrip.pickupAddress,
                }}
                dropoff={{
                  latitude: activeTrip.dropoffLatitude,
                  longitude: activeTrip.dropoffLongitude,
                  label: activeTrip.dropoffAddress,
                }}
                height={410}
              />

              <div className="route-summary-row">
                <span>{activeTrip.estimatedDistanceKm} كم</span>
                <span>{activeTrip.estimatedDurationMinutes} دقيقة</span>
                <strong>
                  {Number(activeTrip.estimatedFare).toLocaleString("ar-IQ")}{" "}
                  {activeTrip.currency}
                </strong>
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">الرحلة الحالية</div>
                  <h2>{TRIP_STATUS_LABELS[activeTrip.status]}</h2>
                </div>
                <span className="status">
                  {TRIP_STATUS_LABELS[activeTrip.status]}
                </span>
              </div>

              <div className="trip-route">
                <strong>{activeTrip.pickupAddress}</strong>
                <span>←</span>
                <strong>{activeTrip.dropoffAddress}</strong>
              </div>

              <div className="notice">
                الراكب: {activeTrip.passenger?.firstName}{" "}
                {activeTrip.passenger?.lastName}
                {activeTrip.passenger?.phone
                  ? ` · ${activeTrip.passenger.phone}`
                  : ""}
              </div>

              <div className="actions">
                {activeTrip.status === "DRIVER_ASSIGNED" ? (
                  <button
                    className="button primary"
                    disabled={isWorking}
                    onClick={() =>
                      void runTripAction(`/trips/${activeTrip.id}/arriving`)
                    }
                  >
                    أنا في الطريق
                  </button>
                ) : null}

                {activeTrip.status === "DRIVER_ARRIVING" ? (
                  <button
                    className="button primary"
                    disabled={isWorking}
                    onClick={() =>
                      void runTripAction(`/trips/${activeTrip.id}/arrived`)
                    }
                  >
                    وصلت إلى الراكب
                  </button>
                ) : null}

                {activeTrip.status === "DRIVER_ARRIVED" ? (
                  <>
                    <input
                      className="input pin-input"
                      value={pin}
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="رمز PIN"
                    />
                    <button
                      className="button primary"
                      disabled={isWorking || pin.length !== 4}
                      onClick={() =>
                        void runTripAction(`/trips/${activeTrip.id}/start`, {
                          pin,
                        })
                      }
                    >
                      بدء الرحلة
                    </button>
                  </>
                ) : null}

                {activeTrip.status === "IN_PROGRESS" ? (
                  <button
                    className="button primary"
                    disabled={isWorking}
                    onClick={() =>
                      void runTripAction(`/trips/${activeTrip.id}/complete`, {
                        note: "Completed from driver portal",
                      })
                    }
                  >
                    إنهاء الرحلة
                  </button>
                ) : null}

                {activeTrip.status !== "IN_PROGRESS" ? (
                  <button
                    className="button danger"
                    disabled={isWorking}
                    onClick={() =>
                      void runTripAction(`/trips/${activeTrip.id}/cancel`, {
                        note: "Driver unable to execute assigned trip",
                      })
                    }
                  >
                    تعذر تنفيذ الرحلة
                  </button>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <h2>الرحلة المعيّنة</h2>
            {profile?.availability === "ONLINE" ? (
              <div className="empty-state">
                أنت متصل وتظهر الآن لمركز العمليات. لا توجد رحلة معيّنة لك
                حاليًا، ويتم التحديث تلقائيًا.
              </div>
            ) : profile?.availability === "ON_TRIP" ? (
              <div className="empty-state">
                جارٍ تحميل الرحلة التي عيّنها المشرف...
              </div>
            ) : (
              <div className="empty-state">
                فعّل حالة الاتصال حتى يتمكن المشرف من تعيين رحلة لك.
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <h2>آخر الرحلات</h2>
          {myTrips.length === 0 ? (
            <div className="empty-state">لا توجد رحلات سابقة.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المسار</th>
                    <th>الحالة</th>
                    <th>الأجرة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {myTrips.map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        {trip.pickupAddress} ← {trip.dropoffAddress}
                      </td>
                      <td>{TRIP_STATUS_LABELS[trip.status]}</td>
                      <td>
                        {Number(trip.estimatedFare).toLocaleString("ar-IQ")}{" "}
                        {trip.currency}
                      </td>
                      <td>
                        {new Date(trip.requestedAt).toLocaleString("ar-IQ")}
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
