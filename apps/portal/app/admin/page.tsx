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

type UserRecord = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  createdAt: string;
  roles: Array<{ role: { code: string; name: string } }>;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: string;
  actor?: {
    email: string;
    firstName: string;
    lastName: string;
  } | null;
};

type AvailableDriver = {
  id: string;
  userId: string;
  status: string;
  availability: "ONLINE";
  rating: number;
  completedTrips: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  };
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    plateNumber: string;
  } | null;
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<AvailableDriver[]>(
    []
  );
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [driverSelection, setDriverSelection] = useState<
    Record<string, string>
  >({});
  const [previewTripId, setPreviewTripId] = useState<string | null>(null);
  const [workingTripId, setWorkingTripId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeTrips = useMemo(
    () => trips.filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)),
    [trips]
  );

  const completedTrips = useMemo(
    () => trips.filter((trip) => trip.status === "COMPLETED"),
    [trips]
  );

  const driversCount = useMemo(
    () =>
      users.filter((user) =>
        user.roles.some((entry) => entry.role.code === "DRIVER")
      ).length,
    [users]
  );

  const previewTrip = useMemo(
    () =>
      pendingTrips.find((trip) => trip.id === previewTripId) ??
      pendingTrips[0] ??
      null,
    [pendingTrips, previewTripId]
  );

  const loadData = useCallback(async () => {
    try {
      const [
        usersResponse,
        tripsResponse,
        pendingResponse,
        driversResponse,
        auditResponse,
      ] = await Promise.all([
        apiFetch<UserRecord[]>("/users"),
        apiFetch<Trip[]>("/trips"),
        apiFetch<Trip[]>("/admin/trips/pending"),
        apiFetch<AvailableDriver[]>("/admin/drivers/available"),
        apiFetch<AuditLog[]>("/admin/audit-logs"),
      ]);

      setUsers(usersResponse);
      setTrips(tripsResponse);
      setPendingTrips(pendingResponse);
      setAvailableDrivers(driversResponse);
      setPreviewTripId((current) => {
        if (current && pendingResponse.some((trip) => trip.id === current)) {
          return current;
        }
        return pendingResponse[0]?.id ?? null;
      });

      setDriverSelection((current) => {
        const next: Record<string, string> = {};
        const availableIds = new Set(
          driversResponse.map((driver) => driver.userId)
        );

        for (const trip of pendingResponse) {
          const currentDriverId = current[trip.id];
          next[trip.id] =
            currentDriverId && availableIds.has(currentDriverId)
              ? currentDriverId
              : driversResponse[0]?.userId ?? "";
        }

        return next;
      });

      setAuditLogs(auditResponse);
      setError("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحميل لوحة العمليات."
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 5000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  async function assignDriver(tripId: string) {
    const driverId = driverSelection[tripId];

    if (!driverId) {
      setError("اختر سائقًا متاحًا أولًا.");
      return;
    }

    setWorkingTripId(tripId);
    setError("");
    setMessage("");

    try {
      const assigned = await apiFetch<Trip>(
        `/admin/trips/${tripId}/assign-driver`,
        {
          method: "POST",
          body: JSON.stringify({ driverId }),
        }
      );

      const driverName = assigned.driver
        ? `${assigned.driver.firstName} ${assigned.driver.lastName ?? ""}`
        : "السائق";

      setMessage(`تم تعيين ${driverName} للطلب بنجاح.`);
      await loadData();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تعيين السائق."
      );
      await loadData();
    } finally {
      setWorkingTripId(null);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="لوحة الإدارة"
          title="مركز توزيع الرحلات"
          subtitle="تصل طلبات الركاب إلى مركز العمليات، ثم يختار المشرف السائق المناسب."
        />

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        <section className="grid">
          <div className="card">
            <div className="label">طلبات تنتظر التعيين</div>
            <div className="value">{pendingTrips.length}</div>
          </div>
          <div className="card">
            <div className="label">سائقون متاحون الآن</div>
            <div className="value">{availableDrivers.length}</div>
          </div>
          <div className="card">
            <div className="label">رحلات نشطة</div>
            <div className="value">{activeTrips.length}</div>
          </div>
          <div className="card">
            <div className="label">رحلات مكتملة</div>
            <div className="value">{completedTrips.length}</div>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">DISPATCH QUEUE</div>
              <h2>طلبات الرحلات الجديدة</h2>
              <p className="subtitle">
                يتم التحديث تلقائيًا كل خمس ثوانٍ.
              </p>
            </div>
            <button className="button" type="button" onClick={() => void loadData()}>
              تحديث الآن
            </button>
          </div>

          {pendingTrips.length === 0 ? (
            <div className="empty-state">
              لا توجد طلبات تنتظر تعيين سائق حاليًا.
            </div>
          ) : (
            <div className="trip-list">
              {pendingTrips.map((trip) => (
                <article
                  className={`trip-card ${
                    previewTrip?.id === trip.id ? "is-selected" : ""
                  }`}
                  key={trip.id}
                >
                  <div>
                    <div className="eyebrow">
                      طلب #{trip.id.slice(0, 8)}
                    </div>
                    <strong>
                      {trip.pickupAddress} ← {trip.dropoffAddress}
                    </strong>
                    <p className="subtitle">
                      الراكب: {trip.passenger?.firstName}{" "}
                      {trip.passenger?.lastName}
                      {trip.passenger?.phone
                        ? ` · ${trip.passenger.phone}`
                        : ""}
                    </p>
                    <p className="subtitle">
                      {trip.estimatedDistanceKm} كم ·{" "}
                      {trip.estimatedDurationMinutes} دقيقة ·{" "}
                      {new Date(trip.requestedAt).toLocaleString("ar-IQ")}
                    </p>
                  </div>

                  <div className="trip-price">
                    {Number(trip.estimatedFare).toLocaleString("ar-IQ")}{" "}
                    {trip.currency}
                  </div>

                  <label style={{ minWidth: 280 }}>
                    <span className="label">السائق المتاح</span>
                    <select
                      className="input"
                      value={driverSelection[trip.id] ?? ""}
                      onChange={(event) =>
                        setDriverSelection((current) => ({
                          ...current,
                          [trip.id]: event.target.value,
                        }))
                      }
                      disabled={
                        availableDrivers.length === 0 ||
                        workingTripId === trip.id
                      }
                    >
                      <option value="">اختر سائقًا</option>
                      {availableDrivers.map((driver) => (
                        <option key={driver.userId} value={driver.userId}>
                          {driver.user.firstName} {driver.user.lastName} —{" "}
                          {driver.vehicle
                            ? `${driver.vehicle.make} ${driver.vehicle.model} / ${driver.vehicle.plateNumber}`
                            : "دون مركبة"}{" "}
                          — تقييم {driver.rating}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="actions">
                    <button
                      className="button"
                      type="button"
                      onClick={() => setPreviewTripId(trip.id)}
                    >
                      عرض المسار
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      disabled={
                        workingTripId === trip.id ||
                        !driverSelection[trip.id]
                      }
                      onClick={() => void assignDriver(trip.id)}
                    >
                      {workingTripId === trip.id
                        ? "جارٍ التعيين..."
                        : "تأكيد تعيين السائق"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {pendingTrips.length > 0 && availableDrivers.length === 0 ? (
            <div className="notice error" style={{ marginTop: 16 }}>
              لا يوجد سائق Online ومعتمد ومركبته فعالة. اطلب من أحد السائقين
              تفعيل حالة الاتصال.
            </div>
          ) : null}
        </section>

        {previewTrip ? (
          <section className="panel map-preview-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">معاينة طلب التوزيع</div>
                <h2>
                  {previewTrip.pickupAddress} ← {previewTrip.dropoffAddress}
                </h2>
              </div>
              <span className="status">
                {TRIP_STATUS_LABELS[previewTrip.status]}
              </span>
            </div>

            <RideMapClient
              pickup={{
                latitude: previewTrip.pickupLatitude,
                longitude: previewTrip.pickupLongitude,
                label: previewTrip.pickupAddress,
              }}
              dropoff={{
                latitude: previewTrip.dropoffLatitude,
                longitude: previewTrip.dropoffLongitude,
                label: previewTrip.dropoffAddress,
              }}
              height={410}
            />
          </section>
        ) : null}

        <section className="panel">
          <h2>السائقون المتاحون للتوزيع</h2>
          {availableDrivers.length === 0 ? (
            <div className="empty-state">لا يوجد سائق متاح حاليًا.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>السائق</th>
                    <th>المركبة</th>
                    <th>التقييم</th>
                    <th>الرحلات المكتملة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {availableDrivers.map((driver) => (
                    <tr key={driver.userId}>
                      <td>
                        {driver.user.firstName} {driver.user.lastName}
                        <br />
                        <small>{driver.user.phone ?? driver.user.email}</small>
                      </td>
                      <td>
                        {driver.vehicle
                          ? `${driver.vehicle.make} ${driver.vehicle.model} · ${driver.vehicle.plateNumber}`
                          : "غير محددة"}
                      </td>
                      <td>{driver.rating}</td>
                      <td>{driver.completedTrips}</td>
                      <td>متصل</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>آخر الرحلات</h2>
          {trips.length === 0 ? (
            <div className="empty-state">لا توجد رحلات.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>الراكب</th>
                    <th>السائق</th>
                    <th>المسار</th>
                    <th>الحالة</th>
                    <th>الأجرة</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.slice(0, 30).map((trip) => (
                    <tr key={trip.id}>
                      <td>
                        {trip.passenger?.firstName}{" "}
                        {trip.passenger?.lastName}
                      </td>
                      <td>
                        {trip.driver
                          ? `${trip.driver.firstName} ${trip.driver.lastName}`
                          : "غير معين"}
                      </td>
                      <td>
                        {trip.pickupAddress} ← {trip.dropoffAddress}
                      </td>
                      <td>{TRIP_STATUS_LABELS[trip.status]}</td>
                      <td>
                        {Number(trip.estimatedFare).toLocaleString("ar-IQ")}{" "}
                        {trip.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>المستخدمون</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>البريد</th>
                  <th>الأدوار</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {users.slice(0, 50).map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.firstName} {user.lastName}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      {user.roles.map((entry) => entry.role.code).join("، ")}
                    </td>
                    <td>{user.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>سجل العمليات</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>العملية</th>
                  <th>المنفذ</th>
                  <th>الكيان</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 50).map((log) => (
                  <tr key={log.id}>
                    <td>{log.action}</td>
                    <td>{log.actor?.email ?? "النظام"}</td>
                    <td>
                      {log.entityType}
                      {log.entityId ? ` / ${log.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td>{new Date(log.createdAt).toLocaleString("ar-IQ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="subtitle" style={{ marginTop: 20 }}>
          إجمالي السائقين المسجلين: {driversCount}
        </div>
      </Shell>
    </ProtectedRoute>
  );
}
