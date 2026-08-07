"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type RouteBookingPolicy = {
  routeId: string;
  routeCode: string;
  routeNameAr: string;
  requiresFlightDetails: boolean;
  originNameAr: string;
  originType: string;
  destinationNameAr: string;
  destinationType: string;
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
  flightTimeMode: "ARRIVAL" | "DEPARTURE";
};

export default function AdminRoutePoliciesPage() {
  const [rows, setRows] = useState<RouteBookingPolicy[]>([]);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await apiFetch<RouteBookingPolicy[]>("/admin/route-booking-policies"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل سياسات الحجز.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(row: RouteBookingPolicy, patch: Partial<RouteBookingPolicy>) {
    setWorking(row.routeId);
    setMessage("");
    setError("");
    try {
      await apiFetch(`/admin/route-booking-policies/${row.routeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          passengerCanEditPickup: patch.passengerCanEditPickup ?? row.passengerCanEditPickup,
          passengerCanEditDropoff: patch.passengerCanEditDropoff ?? row.passengerCanEditDropoff,
          flightTimeMode: patch.flightTimeMode ?? row.flightTimeMode,
        }),
      });
      setMessage(`تم تحديث سياسة ${row.routeNameAr}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ سياسة المسار.");
    } finally {
      setWorking("");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="إدارة الحجز"
          title="سياسات نقاط الرحلة والطيران"
          subtitle="حدد لكل مسار ما إذا كان المسافر يستطيع تغيير نقطة الانطلاق أو الوصول، وهل بيانات الطائرة تمثل الوصول أم الإقلاع."
        />
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="booking-list">
          {rows.map((row) => (
            <article className="panel" key={row.routeId}>
              <div className="section-heading">
                <div>
                  <h2>{row.routeNameAr}</h2>
                  <p className="subtitle">{row.originNameAr} ← {row.destinationNameAr} · {row.routeCode}</p>
                </div>
              </div>

              <div className="admin-form-grid">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={row.passengerCanEditPickup}
                    disabled={working === row.routeId}
                    onChange={(event) => void save(row, { passengerCanEditPickup: event.target.checked })}
                  />
                  السماح للمسافر بتعديل نقطة الانطلاق
                  {row.originType === "AIRPORT" ? <small> · نقطة الانطلاق مطار</small> : null}
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={row.passengerCanEditDropoff}
                    disabled={working === row.routeId}
                    onChange={(event) => void save(row, { passengerCanEditDropoff: event.target.checked })}
                  />
                  السماح للمسافر بتعديل نقطة الوصول
                  {row.destinationType === "AIRPORT" ? <small> · نقطة الوصول مطار</small> : null}
                </label>

                <label>
                  <span className="label">معنى تاريخ ووقت الطائرة</span>
                  <select
                    className="input"
                    value={row.flightTimeMode}
                    disabled={!row.requiresFlightDetails || working === row.routeId}
                    onChange={(event) => void save(row, { flightTimeMode: event.target.value as "ARRIVAL" | "DEPARTURE" })}
                  >
                    <option value="ARRIVAL">وصول الطائرة</option>
                    <option value="DEPARTURE">إقلاع / انطلاق الطائرة</option>
                  </select>
                  {!row.requiresFlightDetails ? <small>هذا المسار لا يتطلب بيانات طيران حاليًا.</small> : null}
                </label>
              </div>
            </article>
          ))}
          {!rows.length ? <div className="empty-state">لا توجد سياسات مسارات بعد. طبّق Migration الجديدة ثم أعد التحميل.</div> : null}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
