"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { apiFetch } from "@/lib/api";
import { DriverAdminRecord, ServiceRegion } from "@/lib/admin-operations";

const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "ChangeMe123!",
  licenseNumber: "",
  baseRegionCode: "DAMASCUS",
  driverRegionCodes: ["SYRIA"] as string[],
  make: "",
  model: "",
  year: new Date().getFullYear(),
  color: "",
  plateNumber: "",
  seatCapacity: 4,
  vehicleBaseRegionCode: "DAMASCUS",
  vehicleRegionCodes: ["SYRIA"] as string[],
};

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverAdminRecord[]>([]);
  const [regions, setRegions] = useState<ServiceRegion[]>([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [driverData, regionData] = await Promise.all([
        apiFetch<DriverAdminRecord[]>("/admin/drivers"),
        apiFetch<ServiceRegion[]>("/admin/regions"),
      ]);
      setDrivers(driverData);
      setRegions(regionData);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السائقين.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hubs = useMemo(() => regions.filter((r) => r.kind === "OPERATING_HUB" && r.isActive), [regions]);
  const countryRegions = useMemo(() => regions.filter((r) => r.kind === "COUNTRY_ACCESS" && r.isActive), [regions]);
  const normalized = search.trim().toLowerCase();
  const filtered = drivers.filter((driver) => {
    if (statusFilter && driver.status !== statusFilter) return false;
    if (!normalized) return true;
    return `${driver.user.firstName} ${driver.user.lastName} ${driver.user.email} ${driver.user.phone ?? ""} ${driver.vehicles.map((v) => v.plateNumber).join(" ")}`.toLowerCase().includes(normalized);
  });

  function toggleCode(key: "driverRegionCodes" | "vehicleRegionCodes", code: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      [key]: checked ? Array.from(new Set([...current[key], code])) : current[key].filter((item) => item !== code),
    }));
  }

  async function createDriver(event: FormEvent) {
    event.preventDefault();
    setWorking("create"); setMessage(""); setError("");
    try {
      await apiFetch("/admin/drivers", { method: "POST", body: JSON.stringify(form) });
      setMessage("تم إنشاء حساب السائق والمركبة. راجع الوثائق ثم اعتمد السائق.");
      setForm(initialForm);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء السائق.");
    } finally { setWorking(""); }
  }

  async function updateStatus(driverId: string, status: string) {
    setWorking(driverId); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/drivers/${driverId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage("تم تحديث حالة السائق.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث حالة السائق.");
    } finally { setWorking(""); }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الأسطول" title="السائقون والمركبات" subtitle="إنشاء السائقين وفرزهم حسب مركز التشغيل والدول المسموح لهم ولمركباتهم دخولها." />
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading"><div><h2>إضافة سائق ومركبته الأولى</h2><p className="subtitle">الصورة والوثائق تُرفع من صفحة تفاصيل السائق بعد الإنشاء.</p></div></div>
          <form className="admin-form-grid" onSubmit={createDriver}>
            <label><span className="label">الاسم الأول</span><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
            <label><span className="label">الاسم الأخير</span><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
            <label><span className="label">البريد الإلكتروني</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label><span className="label">رقم الهاتف</span><InternationalPhoneInput value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} name="adminDriverPhone" /></label>
            <label><span className="label">كلمة المرور المؤقتة</span><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></label>
            <label><span className="label">رقم رخصة القيادة</span><input className="input" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></label>
            <label><span className="label">مركز السائق</span><select className="input" value={form.baseRegionCode} onChange={(e) => setForm({ ...form, baseRegionCode: e.target.value })}>{hubs.map((region) => <option key={region.id} value={region.code}>{region.nameAr}</option>)}</select></label>
            <fieldset className="checkbox-fieldset"><legend>دول السائق</legend>{countryRegions.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={form.driverRegionCodes.includes(region.code)} onChange={(e) => toggleCode("driverRegionCodes", region.code, e.target.checked)} />{region.nameAr}</label>)}</fieldset>
            <div className="form-divider full-width"><span>المركبة الأولى</span></div>
            <label><span className="label">الشركة</span><input className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required /></label>
            <label><span className="label">الموديل</span><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></label>
            <label><span className="label">سنة الصنع</span><input className="input" type="number" min={1990} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} required /></label>
            <label><span className="label">اللون</span><input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} required /></label>
            <label><span className="label">رقم اللوحة</span><input className="input" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} required /></label>
            <label><span className="label">عدد المقاعد</span><input className="input" type="number" min={1} max={20} value={form.seatCapacity} onChange={(e) => setForm({ ...form, seatCapacity: Number(e.target.value) })} required /></label>
            <label><span className="label">مركز المركبة</span><select className="input" value={form.vehicleBaseRegionCode} onChange={(e) => setForm({ ...form, vehicleBaseRegionCode: e.target.value })}>{hubs.map((region) => <option key={region.id} value={region.code}>{region.nameAr}</option>)}</select></label>
            <fieldset className="checkbox-fieldset"><legend>دول المركبة</legend>{countryRegions.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={form.vehicleRegionCodes.includes(region.code)} onChange={(e) => toggleCode("vehicleRegionCodes", region.code, e.target.checked)} />{region.nameAr}</label>)}</fieldset>
            <button className="button primary full-width" disabled={working === "create"} type="submit">إنشاء السائق والمركبة</button>
          </form>
        </section>

        <section className="panel filters">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد أو اللوحة" />
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">كل الحالات</option><option value="PENDING_REVIEW">بانتظار المراجعة</option><option value="APPROVED">معتمد</option><option value="SUSPENDED">معلق</option><option value="REJECTED">مرفوض</option></select>
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </section>

        <section className="driver-admin-grid">
          {filtered.map((driver) => {
            const vehicle = driver.vehicles.find((item) => item.isActive) ?? driver.vehicles[0];
            const pendingDocs = driver.documents.filter((doc) => doc.status === "PENDING").length + (vehicle?.documents.filter((doc) => doc.status === "PENDING").length ?? 0);
            return (
              <article className="panel driver-admin-card" key={driver.userId}>
                <div className="driver-card-profile">
                  {driver.avatarUrl ? <img className="driver-avatar-large" src={driver.avatarUrl} alt={`${driver.user.firstName} ${driver.user.lastName}`} /> : <div className="driver-avatar-large placeholder">{driver.user.firstName.slice(0, 1)}{driver.user.lastName.slice(0, 1)}</div>}
                  <div><div className="eyebrow">{driver.baseRegion?.nameAr ?? "بلا مركز"}</div><h2>{driver.user.firstName} {driver.user.lastName}</h2><p className="subtitle">{driver.user.phone || driver.user.email}</p></div>
                  <StatusPill status={driver.status} label={driver.status === "PENDING_REVIEW" ? "بانتظار المراجعة" : driver.status === "APPROVED" ? "معتمد" : driver.status === "SUSPENDED" ? "معلق" : "مرفوض"} />
                </div>
                {vehicle ? <div className="vehicle-preview-card">{vehicle.publicImageUrl ? <img src={vehicle.publicImageUrl} alt={`${vehicle.make} ${vehicle.model}`} /> : <div className="vehicle-image-placeholder">لا توجد صورة</div>}<div><strong>{vehicle.make} {vehicle.model} — {vehicle.year}</strong><small>{vehicle.color} · {vehicle.plateNumber} · {vehicle.seatCapacity} مقاعد</small></div></div> : <div className="empty-state">لا توجد مركبة.</div>}
                <div className="tag-list">{driver.regionAccesses.map((access) => <span key={access.region.id}>{access.region.nameAr}: {access.status}</span>)}</div>
                <div className="booking-meta"><span>التقييم: {driver.rating}</span><span>رحلات مكتملة: {driver.completedTrips}</span><span>حجوزات معيّنة: {driver.assignedBookings}</span><span>وثائق معلقة: {pendingDocs}</span></div>
                <div className="actions"><Link className="button primary" href={`/admin/drivers/${driver.userId}`}>فتح الملف الكامل</Link><button className="button" disabled={working === driver.userId || driver.status === "APPROVED"} type="button" onClick={() => void updateStatus(driver.userId, "APPROVED")}>اعتماد</button><button className="button danger" disabled={working === driver.userId || driver.status === "SUSPENDED"} type="button" onClick={() => void updateStatus(driver.userId, "SUSPENDED")}>تعليق</button></div>
              </article>
            );
          })}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
