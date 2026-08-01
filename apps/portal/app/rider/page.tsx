"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import {
  ACTIVE_TRIP_STATUSES,
  Trip,
  TRIP_STATUS_LABELS,
} from "@/lib/types";

type Estimate = {
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  estimatedFare: number;
  currency: string;
};

const initialForm = {
  pickupAddress: "شارع فلسطين، بغداد",
  pickupLatitude: 33.324,
  pickupLongitude: 44.421,
  dropoffAddress: "المنصور، بغداد",
  dropoffLatitude: 33.315,
  dropoffLongitude: 44.35,
};

export default function RiderPage() {
  const [form, setForm] = useState(initialForm);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [startPin, setStartPin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const activeTrip = useMemo(
    () => trips.find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)),
    [trips]
  );

  const loadTrips = useCallback(async () => {
    try {
      const data = await apiFetch<Trip[]>("/trips/me");
      setTrips(data);
      setError("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحميل الرحلات."
      );
    }
  }, []);

  useEffect(() => {
    void loadTrips();
    const timer = window.setInterval(() => void loadTrips(), 5000);
    return () => window.clearInterval(timer);
  }, [loadTrips]);

  async function handleEstimate() {
    setError("");
    setMessage("");
    setIsWorking(true);

    try {
      const result = await apiFetch<Estimate>("/trips/estimate", {
        method: "POST",
        body: JSON.stringify({
          pickupLatitude: Number(form.pickupLatitude),
          pickupLongitude: Number(form.pickupLongitude),
          dropoffLatitude: Number(form.dropoffLatitude),
          dropoffLongitude: Number(form.dropoffLongitude),
        }),
      });
      setEstimate(result);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "تعذر حساب السعر."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsWorking(true);

    try {
      const created = await apiFetch<Trip>("/trips", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          pickupLatitude: Number(form.pickupLatitude),
          pickupLongitude: Number(form.pickupLongitude),
          dropoffLatitude: Number(form.dropoffLatitude),
          dropoffLongitude: Number(form.dropoffLongitude),
        }),
      });

      setStartPin(created.startPin ?? "");
      setMessage("تم إرسال طلب الرحلة إلى السائقين المتصلين.");
      await loadTrips();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر إنشاء الرحلة."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function cancelTrip() {
    if (!activeTrip) return;
    setIsWorking(true);
    setError("");

    try {
      await apiFetch(`/trips/${activeTrip.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ note: "Cancelled from rider portal" }),
      });
      setMessage("تم إلغاء الرحلة.");
      setStartPin("");
      await loadTrips();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر إلغاء الرحلة."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function refreshPin() {
    if (!activeTrip) return;
    setIsWorking(true);
    setError("");

    try {
      const response = await apiFetch<{ startPin: string }>(
        `/trips/${activeTrip.id}/start-pin`,
        { method: "POST" }
      );
      setStartPin(response.startPin);
      setMessage("تم إنشاء رمز بدء جديد. شاركه مع السائق بعد وصوله.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "تعذر إنشاء الرمز."
      );
    } finally {
      setIsWorking(false);
    }
  }

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm((current) => {
      switch (field) {
        case "pickupAddress":
          return { ...current, pickupAddress: value };
        case "dropoffAddress":
          return { ...current, dropoffAddress: value };
        case "pickupLatitude":
          return { ...current, pickupLatitude: Number(value) };
        case "pickupLongitude":
          return { ...current, pickupLongitude: Number(value) };
        case "dropoffLatitude":
          return { ...current, dropoffLatitude: Number(value) };
        case "dropoffLongitude":
          return { ...current, dropoffLongitude: Number(value) };
      }
    });
  }

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="تجربة الراكب"
          title="اطلب رحلتك"
          subtitle="السعر يحسب داخل الخادم ولا يمكن للمتصفح تحديده."
        />

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        {activeTrip ? (
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

            <div className="grid trip-metrics">
              <div className="card">
                <div className="label">المسافة التقديرية</div>
                <div className="value">{activeTrip.estimatedDistanceKm} كم</div>
              </div>
              <div className="card">
                <div className="label">المدة التقديرية</div>
                <div className="value">
                  {activeTrip.estimatedDurationMinutes} دقيقة
                </div>
              </div>
              <div className="card">
                <div className="label">الأجرة</div>
                <div className="value">
                  {Number(activeTrip.estimatedFare).toLocaleString("ar-IQ")}{" "}
                  {activeTrip.currency}
                </div>
              </div>
            </div>

            {activeTrip.driver ? (
              <div className="notice">
                السائق: {activeTrip.driver.firstName}{" "}
                {activeTrip.driver.lastName}
              </div>
            ) : (
              <div className="notice">جارٍ البحث عن سائق متصل...</div>
            )}

            {startPin ? (
              <div className="pin-box">
                <span>رمز بدء الرحلة</span>
                <strong>{startPin}</strong>
                <small>لا تشاركه إلا بعد وصول السائق.</small>
              </div>
            ) : null}

            <div className="actions">
              {["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED"].includes(
                activeTrip.status
              ) ? (
                <button
                  className="button"
                  type="button"
                  onClick={refreshPin}
                  disabled={isWorking}
                >
                  إنشاء رمز بدء جديد
                </button>
              ) : null}

              {activeTrip.status !== "IN_PROGRESS" ? (
                <button
                  className="button danger"
                  type="button"
                  onClick={cancelTrip}
                  disabled={isWorking}
                >
                  إلغاء الرحلة
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="panel">
            <h2>رحلة جديدة</h2>
            <form className="form-grid" onSubmit={handleCreate}>
              <label className="full-width">
                <span className="label">نقطة الانطلاق</span>
                <input
                  className="input"
                  value={form.pickupAddress}
                  onChange={(event) =>
                    updateField("pickupAddress", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                <span className="label">خط عرض الانطلاق</span>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={form.pickupLatitude}
                  onChange={(event) =>
                    updateField("pickupLatitude", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                <span className="label">خط طول الانطلاق</span>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={form.pickupLongitude}
                  onChange={(event) =>
                    updateField("pickupLongitude", event.target.value)
                  }
                  required
                />
              </label>

              <label className="full-width">
                <span className="label">الوجهة</span>
                <input
                  className="input"
                  value={form.dropoffAddress}
                  onChange={(event) =>
                    updateField("dropoffAddress", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                <span className="label">خط عرض الوجهة</span>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={form.dropoffLatitude}
                  onChange={(event) =>
                    updateField("dropoffLatitude", event.target.value)
                  }
                  required
                />
              </label>

              <label>
                <span className="label">خط طول الوجهة</span>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={form.dropoffLongitude}
                  onChange={(event) =>
                    updateField("dropoffLongitude", event.target.value)
                  }
                  required
                />
              </label>

              <div className="actions full-width">
                <button
                  className="button"
                  type="button"
                  onClick={handleEstimate}
                  disabled={isWorking}
                >
                  حساب السعر
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={isWorking}
                >
                  طلب الرحلة
                </button>
              </div>
            </form>

            {estimate ? (
              <div className="estimate-box">
                <strong>
                  {estimate.estimatedFare.toLocaleString("ar-IQ")}{" "}
                  {estimate.currency}
                </strong>
                <span>
                  {estimate.estimatedDistanceKm} كم ·{" "}
                  {estimate.estimatedDurationMinutes} دقيقة
                </span>
              </div>
            ) : null}
          </section>
        )}

        <section className="panel">
          <h2>سجل الرحلات</h2>
          {trips.length === 0 ? (
            <div className="empty-state">لا توجد رحلات حتى الآن.</div>
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
                  {trips.map((trip) => (
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
