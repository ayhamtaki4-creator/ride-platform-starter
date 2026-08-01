"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RideMapClient } from "@/components/ride-map-client";
import type { MapPoint } from "@/components/ride-map";
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

type SelectionMode = "pickup" | "dropoff";

const initialForm = {
  pickupAddress: "شارع فلسطين، بغداد",
  pickupLatitude: 33.324,
  pickupLongitude: 44.421,
  dropoffAddress: "المنصور، بغداد",
  dropoffLatitude: 33.315,
  dropoffLongitude: 44.35,
};

function coordinateLabel(point: MapPoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

export default function RiderPage() {
  const [form, setForm] = useState(initialForm);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("pickup");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [startPin, setStartPin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const activeTrip = useMemo(
    () => trips.find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)),
    [trips]
  );

  const pickupPoint = useMemo<MapPoint>(
    () => ({
      latitude: Number(form.pickupLatitude),
      longitude: Number(form.pickupLongitude),
      label: form.pickupAddress,
    }),
    [form.pickupAddress, form.pickupLatitude, form.pickupLongitude]
  );

  const dropoffPoint = useMemo<MapPoint>(
    () => ({
      latitude: Number(form.dropoffLatitude),
      longitude: Number(form.dropoffLongitude),
      label: form.dropoffAddress,
    }),
    [form.dropoffAddress, form.dropoffLatitude, form.dropoffLongitude]
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

  function applyPoint(mode: SelectionMode, point: MapPoint, address?: string) {
    setEstimate(null);
    setForm((current) => {
      if (mode === "pickup") {
        return {
          ...current,
          pickupAddress:
            address ?? `نقطة انطلاق محددة على الخريطة (${coordinateLabel(point)})`,
          pickupLatitude: point.latitude,
          pickupLongitude: point.longitude,
        };
      }

      return {
        ...current,
        dropoffAddress:
          address ?? `وجهة محددة على الخريطة (${coordinateLabel(point)})`,
        dropoffLatitude: point.latitude,
        dropoffLongitude: point.longitude,
      };
    });
  }

  function handleMapSelect(point: MapPoint) {
    applyPoint(selectionMode, point);
    setMessage(
      selectionMode === "pickup"
        ? "تم تحديث نقطة الانطلاق من الخريطة."
        : "تم تحديث الوجهة من الخريطة."
    );
    setError("");
  }

  function useCurrentLocation() {
    setError("");
    setMessage("");

    if (!navigator.geolocation) {
      setError("المتصفح لا يدعم تحديد الموقع الجغرافي.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };

        applyPoint("pickup", point, "موقعي الحالي");
        setSelectionMode("dropoff");
        setMessage("تم تحديد موقعك كنقطة انطلاق. اختر الوجهة على الخريطة.");
        setIsLocating(false);
      },
      (locationError) => {
        const locationMessage =
          locationError.code === locationError.PERMISSION_DENIED
            ? "تم رفض إذن الوصول إلى الموقع. فعّل الإذن من إعدادات المتصفح."
            : "تعذر تحديد موقعك الحالي. حاول مرة أخرى.";

        setError(locationMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  }

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
      setMessage("تم حساب السعر التقديري داخل الخادم.");
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
    setEstimate(null);
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
          title="اطلب رحلتك من الخريطة"
          subtitle="حدد الانطلاق والوجهة بصريًا، ثم احصل على سعر يحسب داخل الخادم."
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
              height={390}
            />

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
                  {Number(activeTrip.estimatedFare).toLocaleString("ar-IQ")} {" "}
                  {activeTrip.currency}
                </div>
              </div>
            </div>

            {activeTrip.driver ? (
              <div className="notice">
                السائق: {activeTrip.driver.firstName} {" "}
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
            <div className="section-heading">
              <div>
                <h2>رحلة جديدة</h2>
                <p className="subtitle">
                  اختر ما تريد تعديله ثم انقر على الخريطة.
                </p>
              </div>

              <button
                className="button"
                type="button"
                onClick={useCurrentLocation}
                disabled={isLocating || isWorking}
              >
                {isLocating ? "جارٍ تحديد الموقع..." : "استخدم موقعي الحالي"}
              </button>
            </div>

            <div className="map-toolbar" role="group" aria-label="اختيار نقطة الخريطة">
              <button
                className={`map-mode-button ${selectionMode === "pickup" ? "is-active" : ""}`}
                type="button"
                onClick={() => setSelectionMode("pickup")}
              >
                تحديد الانطلاق
              </button>
              <button
                className={`map-mode-button ${selectionMode === "dropoff" ? "is-active" : ""}`}
                type="button"
                onClick={() => setSelectionMode("dropoff")}
              >
                تحديد الوجهة
              </button>
            </div>

            <RideMapClient
              pickup={pickupPoint}
              dropoff={dropoffPoint}
              editable
              selectionMode={selectionMode}
              onSelect={handleMapSelect}
              height={460}
            />

            <div className="coordinate-summary">
              <div>
                <span className="map-dot pickup" />
                <div>
                  <strong>الانطلاق</strong>
                  <small>{coordinateLabel(pickupPoint)}</small>
                </div>
              </div>
              <div>
                <span className="map-dot dropoff" />
                <div>
                  <strong>الوجهة</strong>
                  <small>{coordinateLabel(dropoffPoint)}</small>
                </div>
              </div>
            </div>

            <form className="form-grid ride-request-form" onSubmit={handleCreate}>
              <label className="full-width">
                <span className="label">عنوان نقطة الانطلاق</span>
                <input
                  className="input"
                  value={form.pickupAddress}
                  onChange={(event) =>
                    updateField("pickupAddress", event.target.value)
                  }
                  required
                />
              </label>

              <label className="full-width">
                <span className="label">عنوان الوجهة</span>
                <input
                  className="input"
                  value={form.dropoffAddress}
                  onChange={(event) =>
                    updateField("dropoffAddress", event.target.value)
                  }
                  required
                />
              </label>

              <details className="coordinates-details full-width">
                <summary>عرض الإحداثيات الدقيقة</summary>
                <div className="form-grid coordinates-grid">
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
                </div>
              </details>

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
                  {estimate.estimatedFare.toLocaleString("ar-IQ")} {" "}
                  {estimate.currency}
                </strong>
                <span>
                  {estimate.estimatedDistanceKm} كم · {" "}
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
                        {Number(trip.estimatedFare).toLocaleString("ar-IQ")} {" "}
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
