"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import { BOOKING_TYPE_LABELS } from "@/lib/types";
import { DynamicPricingRule, ServiceRoute } from "@/lib/admin-operations";

const emptyForm = {
  routeId: "",
  bookingType: "SHARED_SEAT" as "SHARED_SEAT" | "PRIVATE_CAR",
  passengerPrice: 0,
  driverFee: 0,
  platformMargin: 0,
  currency: "USD",
  isActive: true,
};

export default function PricingPage() {
  const [rules, setRules] = useState<DynamicPricingRule[]>([]);
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [drafts, setDrafts] = useState<Record<string, DynamicPricingRule>>({});
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [ruleData, routeData] = await Promise.all([
        apiFetch<DynamicPricingRule[]>("/pricing/admin"),
        apiFetch<ServiceRoute[]>("/admin/routes"),
      ]);
      setRules(ruleData);
      setRoutes(routeData);
      setDrafts(Object.fromEntries(ruleData.map((rule) => [rule.id, { ...rule }])));
      setForm((current) => ({ ...current, routeId: current.routeId || routeData.find((route) => route.isActive)?.id || "" }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الأسعار.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const normalized = search.trim().toLowerCase();
  const filteredRules = rules.filter((rule) => {
    const route = rule.routeId ? routeById.get(rule.routeId) : null;
    return !normalized || `${route?.nameAr ?? rule.direction ?? ""} ${rule.bookingType} ${rule.currency}`.toLowerCase().includes(normalized);
  });

  function calculateMargin(passengerPrice: number, driverFee: number) {
    return Math.max(0, Number((passengerPrice - driverFee).toFixed(2)));
  }

  async function createRule(event: FormEvent) {
    event.preventDefault();
    setWorking("create"); setMessage(""); setError("");
    try {
      await apiFetch("/pricing", { method: "PUT", body: JSON.stringify(form) });
      setMessage("تم حفظ سعر المسار.");
      setForm((current) => ({ ...emptyForm, routeId: current.routeId }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ السعر.");
    } finally { setWorking(""); }
  }

  async function saveRule(rule: DynamicPricingRule) {
    setWorking(rule.id); setMessage(""); setError("");
    try {
      await apiFetch("/pricing", {
        method: "PUT",
        body: JSON.stringify({
          ...(rule.routeId ? { routeId: rule.routeId } : { direction: rule.direction }),
          bookingType: rule.bookingType,
          passengerPrice: Number(rule.passengerPrice),
          driverFee: Number(rule.driverFee),
          platformMargin: Number(rule.platformMargin),
          currency: rule.currency,
          isActive: rule.isActive,
        }),
      });
      setMessage("تم تحديث قاعدة السعر.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث السعر.");
    } finally { setWorking(""); }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الإدارة" title="أسعار المسارات" subtitle="ضع سعرًا مستقلًا لكل مسار ونوع حجز. المسار لا يصبح قابلًا للحجز دون سعر فعال." />
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <h2>إضافة أو تحديث سعر لمسار</h2>
          <form className="admin-form-grid" onSubmit={createRule}>
            <label className="full-width"><span className="label">المسار</span><select className="input" value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} required><option value="">اختر المسار</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.nameAr} ({route.code}){route.isActive ? "" : " — متوقف"}</option>)}</select></label>
            <label><span className="label">نوع الحجز</span><select className="input" value={form.bookingType} onChange={(e) => setForm({ ...form, bookingType: e.target.value as typeof form.bookingType })}>{Object.entries(BOOKING_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="label">سعر المسافر</span><input className="input" type="number" min="0" step="0.01" value={form.passengerPrice} onChange={(e) => { const passengerPrice = Number(e.target.value); setForm({ ...form, passengerPrice, platformMargin: calculateMargin(passengerPrice, form.driverFee) }); }} required /></label>
            <label><span className="label">أجر السائق</span><input className="input" type="number" min="0" step="0.01" value={form.driverFee} onChange={(e) => { const driverFee = Number(e.target.value); setForm({ ...form, driverFee, platformMargin: calculateMargin(form.passengerPrice, driverFee) }); }} required /></label>
            <label><span className="label">هامش المنصة</span><input className="input" type="number" min="0" step="0.01" value={form.platformMargin} onChange={(e) => setForm({ ...form, platformMargin: Number(e.target.value) })} required /></label>
            <label><span className="label">العملة</span><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} required /></label>
            <label className="checkbox-row"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />قاعدة فعالة</label>
            <button className="button primary" disabled={working === "create"} type="submit">حفظ السعر</button>
          </form>
          <div className="price-equation">سعر المسافر = أجر السائق + هامش المنصة</div>
        </section>

        <section className="panel filters"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المسار أو نوع الحجز" /><button className="button" type="button" onClick={() => void load()}>تحديث</button></section>

        <section className="pricing-grid">
          {filteredRules.map((rule) => {
            const draft = drafts[rule.id] ?? rule;
            const route = rule.routeId ? routeById.get(rule.routeId) : null;
            return <article className="panel pricing-card" key={rule.id}><div className="section-heading"><div><div className="eyebrow">{route?.code ?? "LEGACY"}</div><h3>{route?.nameAr ?? rule.direction ?? "اتجاه قديم"}</h3><p className="subtitle">{BOOKING_TYPE_LABELS[rule.bookingType]}</p></div><StatusPill status={draft.isActive ? "ACTIVE" : "SUSPENDED"} label={draft.isActive ? "فعال" : "متوقف"} /></div><div className="form-grid"><label><span className="label">سعر المسافر</span><input className="input" type="number" step="0.01" value={draft.passengerPrice} onChange={(e) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, passengerPrice: e.target.value } }))} /></label><label><span className="label">أجر السائق</span><input className="input" type="number" step="0.01" value={draft.driverFee} onChange={(e) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, driverFee: e.target.value } }))} /></label><label><span className="label">هامش المنصة</span><input className="input" type="number" step="0.01" value={draft.platformMargin} onChange={(e) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, platformMargin: e.target.value } }))} /></label><label><span className="label">العملة</span><input className="input" value={draft.currency} onChange={(e) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, currency: e.target.value.toUpperCase() } }))} /></label></div><label className="checkbox-row"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDrafts((current) => ({ ...current, [rule.id]: { ...draft, isActive: e.target.checked } }))} />قاعدة فعالة</label><button className="button primary" disabled={working === rule.id} onClick={() => void saveRule(draft)} type="button">حفظ</button></article>;
          })}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
