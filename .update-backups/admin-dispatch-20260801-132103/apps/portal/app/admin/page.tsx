"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
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

export default function AdminPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");

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

  const loadData = useCallback(async () => {
    try {
      const [usersResponse, tripsResponse, auditResponse] = await Promise.all([
        apiFetch<UserRecord[]>("/users"),
        apiFetch<Trip[]>("/trips"),
        apiFetch<AuditLog[]>("/admin/audit-logs"),
      ]);

      setUsers(usersResponse);
      setTrips(tripsResponse);
      setAuditLogs(auditResponse);
      setError("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "تعذر تحميل اللوحة."
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 10000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="لوحة الإدارة"
          title="مركز العمليات"
          subtitle="بيانات حقيقية من المستخدمين والرحلات وسجل العمليات."
        />

        {error ? <div className="notice error">{error}</div> : null}

        <section className="grid">
          <div className="card">
            <div className="label">المستخدمون</div>
            <div className="value">{users.length}</div>
          </div>
          <div className="card">
            <div className="label">السائقون المسجلون</div>
            <div className="value">{driversCount}</div>
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
      </Shell>
    </ProtectedRoute>
  );
}
