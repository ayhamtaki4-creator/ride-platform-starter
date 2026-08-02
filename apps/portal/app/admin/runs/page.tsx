"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import { EligibleDriver, ServiceRoute } from "@/lib/admin-operations";
import {
  BOOKING_TYPE_LABELS,
  BookingType,
  DIRECTION_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  ServiceRun,
  ServiceRunRealtimeEvent,
  ServiceRunStatus,
} from "@/lib/types";

const initialForm = {
  routeId: "",
  bookingType: "SHARED_SEAT" as BookingType,
  travelDate: "",
  driverId: "",
  vehicleId: "",
  notes: "",
};

export default function AdminRunsPage() {
  const { socket, isRealtimeConnected } = useAuth();
  const [runs, setRuns] = useState<ServiceRun[]>([]);
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [eligibleDrivers, setEligibleDrivers] = useState<EligibleDriver[]>([]);
  const [form, setForm] = useState(initialForm);
  const [statusFilter, setStatusFilter] = useState<ServiceRunStatus | "">("");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");

  const selectedDriver = useMemo(() => eligibleDrivers.find((driver) => driver.driverId === form.driverId), [eligibleDrivers, form.driverId]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (search.trim()) params.set("search", search.trim());
      const [runRows, routeRows] = await Promise.all([
        apiFetch<ServiceRun[]>(`/admin/runs${params.size ? `?${params}` : ""}`),
        apiFetch<ServiceRoute[]>("/admin/routes"),
      ]);
      setRuns(runRows);
      setRoutes(routeRows.filter((route) => route.isActive));
      setForm((current) => ({ ...current, routeId: current.routeId || routeRows.find((route) => route.isActive)?.id || "" }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الرحلات التشغيلية.");
    }
  }, [dateFilter, search, statusFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = (_event?: ServiceRunRealtimeEvent) => void load();
    socket.on("admin.run.created", refresh);
    socket.on("admin.run.updated", refresh);
    socket.on("run.updated", refresh);
    return () => { socket.off("admin.run.created", refresh); socket.off("admin.run.updated", refresh); socket.off("run.updated", refresh); };
  }, [load, socket]);

  async function loadEligible() {
    if (!form.routeId || !form.travelDate) { setError("حدد المسار والموعد أولًا."); return; }
    setWorking("eligible"); setError(""); setMessage("");
    try {
      const params = new URLSearchParams({ travelDate: new Date(form.travelDate).toISOString(), passengerCount: "1" });
      const rows = await apiFetch<EligibleDriver[]>(`/admin/routes/${form.routeId}/eligible-drivers?${params}`);
      setEligibleDrivers(rows);
      const first = rows.find((driver) => !driver.hasScheduleConflict && driver.vehicles.length) ?? rows[0];
      setForm((current) => ({ ...current, driverId: first?.driverId ?? "", vehicleId: first?.vehicles[0]?.id ?? "" }));
      setMessage(rows.length ? `تم العثور على ${rows.length} سائق مؤهل.` : "لا يوجد سائق مؤهل لهذا المسار والموعد.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السائقين المؤهلين.");
    } finally { setWorking(""); }
  }

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("create"); setError(""); setMessage("");
    try {
      if (!form.routeId || !form.travelDate || !form.driverId || !form.vehicleId) throw new Error("حدد المسار والموعد والسائق والمركبة.");
      const created = await apiFetch<ServiceRun>("/admin/runs", { method: "POST", body: JSON.stringify({ ...form, travelDate: new Date(form.travelDate).toISOString() }) });
      setMessage(`تم إنشاء الرحلة ${created.runReference}.`);
      setForm({ ...initialForm, routeId: form.routeId });
      setEligibleDrivers([]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء الرحلة.");
    } finally { setWorking(""); }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="مركز العمليات" title="الرحلات التشغيلية" subtitle="أنشئ رحلة على مسار ديناميكي واختر سائقًا وسيارة مستوفيين للتصاريح والوثائق." />
        <div className="realtime-toolbar"><span className={`connection-badge ${isRealtimeConnected ? "is-online" : "is-offline"}`}>{isRealtimeConnected ? "التحديث المباشر فعّال" : "التحديث الاحتياطي فعّال"}</span></div>
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><h2>إنشاء رحلة تشغيلية</h2><p className="subtitle">اختيار السائق يتم بعد فحص أهلية المسار تلقائيًا.</p></div></div>
          <form className="admin-form-grid" onSubmit={createRun}>
            <label><span className="label">المسار</span><select className="input" value={form.routeId} onChange={(e) => { setForm({ ...form, routeId: e.target.value, driverId: "", vehicleId: "" }); setEligibleDrivers([]); }} required><option value="">اختر المسار</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.nameAr} ({route.code})</option>)}</select></label>
            <label><span className="label">نوع الحجز</span><select className="input" value={form.bookingType} onChange={(e) => setForm({ ...form, bookingType: e.target.value as BookingType })}>{Object.entries(BOOKING_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="label">موعد الرحلة</span><input className="input" type="datetime-local" value={form.travelDate} onChange={(e) => { setForm({ ...form, travelDate: e.target.value, driverId: "", vehicleId: "" }); setEligibleDrivers([]); }} required /></label>
            <button className="button" disabled={working === "eligible"} type="button" onClick={() => void loadEligible()}>{working === "eligible" ? "جارٍ الفحص..." : "تحميل السائقين المؤهلين"}</button>
            <label><span className="label">السائق</span><select className="input" value={form.driverId} onChange={(e) => { const driver = eligibleDrivers.find((item) => item.driverId === e.target.value); setForm({ ...form, driverId: e.target.value, vehicleId: driver?.vehicles[0]?.id ?? "" }); }} required><option value="">اختر السائق</option>{eligibleDrivers.map((driver) => <option key={driver.driverId} value={driver.driverId} disabled={driver.hasScheduleConflict}>{driver.displayName} · {driver.baseRegion?.nameAr ?? "بلا مركز"}{driver.hasScheduleConflict ? ` · تعارض ${driver.conflictRunReference}` : ""}</option>)}</select></label>
            <label><span className="label">المركبة</span><select className="input" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required><option value="">اختر المركبة</option>{(selectedDriver?.vehicles ?? []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.plateNumber} · {vehicle.seatCapacity} مقاعد</option>)}</select></label>
            <label className="full-width"><span className="label">ملاحظات التشغيل</span><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="button primary" type="submit" disabled={working === "create"}>{working === "create" ? "جارٍ الإنشاء..." : "إنشاء الرحلة"}</button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading"><div><h2>جدول الرحلات</h2><p className="subtitle">ابحث برقم التشغيل أو اسم السائق أو المسافر.</p></div><button className="button" type="button" onClick={() => void load()}>تحديث</button></div>
          <div className="admin-form-grid compact-form-grid"><input className="input" placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} /><input className="input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} /><select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ServiceRunStatus | "")}><option value="">كل الحالات</option>{Object.entries(SERVICE_RUN_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {runs.length === 0 ? <div className="empty-state">لا توجد رحلات تشغيلية مطابقة.</div> : <div className="schedule-card-grid run-grid">{runs.map((run) => <article className="booking-card" key={run.id}><div className="booking-card-head"><div><strong>{run.runReference}</strong><small>{new Date(run.travelDate).toLocaleString("ar")}</small></div><StatusPill status={run.status} label={SERVICE_RUN_STATUS_LABELS[run.status]} /></div><div className="booking-meta"><span>{run.route?.nameAr ?? (run.direction ? DIRECTION_LABELS[run.direction] : "مسار غير محدد")}</span><span>{BOOKING_TYPE_LABELS[run.bookingType]}</span><span>{run.driver?.firstName} {run.driver?.lastName}</span><span>{run.vehicle.make} {run.vehicle.model} · {run.vehicle.plateNumber}</span></div><div className="run-metrics"><div><strong>{run.report.passengerCount}</strong><small>مسافر</small></div><div><strong>{run.report.luggageCount}</strong><small>حقيبة</small></div><div><strong>{run.reservedSeats}/{run.seatCapacity}</strong><small>مقاعد</small></div><div><strong>{run.report.occupancyPercent}%</strong><small>إشغال</small></div></div>{run.driverRejectionReason ? <div className="notice error">{run.driverRejectionReason}</div> : null}<div className="actions"><Link className="button primary" href={`/admin/runs/${run.id}`}>إدارة الرحلة</Link></div></article>)}</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
