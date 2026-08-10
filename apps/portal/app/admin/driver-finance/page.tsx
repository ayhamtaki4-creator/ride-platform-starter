"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type BalanceDirection = "PLATFORM_OWES_DRIVER" | "DRIVER_OWES_PLATFORM" | "SETTLED";

type FinanceItem = {
  driverId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  driverStatus: string | null;
  rating: number | null;
  currency: string;
  balance: string;
  balanceDirection: BalanceDirection;
  completedTrips: number;
  driverFees: string;
  platformMargins: string;
  collectedByDriver: string;
  collectedByAdmin: string;
  lastEntryAt: string | null;
};

type FinanceSummary = {
  totals: Array<{
    currency: string;
    netBalance: string;
    platformOwesDrivers: string;
    driversOwePlatform: string;
  }>;
  items: FinanceItem[];
};

const directionLabel: Record<BalanceDirection, string> = {
  PLATFORM_OWES_DRIVER: "مستحق للسائق",
  DRIVER_OWES_PLATFORM: "مستحق للمنصة",
  SETTLED: "مسوّى",
};

function money(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("ar", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${currency}`;
}

export default function AdminDriverFinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<FinanceSummary>("/admin/driver-finance"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل حسابات السائقين.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.items ?? [];
    return (data?.items ?? []).filter((item) =>
      `${item.firstName} ${item.lastName} ${item.phone ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [data, query]);

  const usdTotals = data?.totals.find((row) => row.currency === "USD") ?? data?.totals[0];

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / المالية"
          title="حسابات السائقين"
          subtitle="رصيد واضح لكل سائق: موجب يعني أن المنصة مدينة له، وسالب يعني أن السائق مدين للمنصة."
          actions={<button className="button" type="button" onClick={() => void load()}>تحديث</button>}
        />

        {error ? <div className="notice error">{error}</div> : null}

        <section className="grid admin-stats">
          <div className="card"><div className="label">مستحق للسائقين</div><div className="value">{usdTotals ? money(usdTotals.platformOwesDrivers, usdTotals.currency) : "0 USD"}</div></div>
          <div className="card"><div className="label">مستحق للمنصة</div><div className="value">{usdTotals ? money(usdTotals.driversOwePlatform, usdTotals.currency) : "0 USD"}</div></div>
          <div className="card"><div className="label">صافي الرصيد</div><div className="value">{usdTotals ? money(usdTotals.netBalance, usdTotals.currency) : "0 USD"}</div></div>
          <div className="card"><div className="label">حسابات ظاهرة</div><div className="value">{items.length}</div></div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div><span className="eyebrow">دفتر السائقين</span><h2>الأرصدة المفتوحة وسجل العمل</h2><p className="subtitle">يتم تحديث الرصيد تلقائيًا عند تسجيل التحصيل الكامل للحجز.</p></div>
            <input className="input" style={{ maxWidth: 280 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم السائق أو الرقم" />
          </div>

          {loading ? <div className="empty-state">جارٍ تحميل الحسابات...</div> : items.length === 0 ? <div className="empty-state">لا توجد حسابات مطابقة.</div> : (
            <div className="booking-list admin-booking-list">
              {items.map((item) => {
                const balance = Number(item.balance);
                return (
                  <article className="booking-card" key={`${item.driverId}:${item.currency}`}>
                    <div className="booking-card-head">
                      <div><strong>{item.firstName} {item.lastName}</strong><small>{item.phone || "بدون رقم"} · تقييم {item.rating ?? "—"}</small></div>
                      <span className="status">{directionLabel[item.balanceDirection]}</span>
                    </div>
                    <div className="booking-meta">
                      <span>الرصيد: <strong>{money(Math.abs(balance), item.currency)}</strong></span>
                      <span>رحلات مكتملة: {item.completedTrips}</span>
                      <span>استلم السائق: {money(item.collectedByDriver, item.currency)}</span>
                      <span>استلمت الإدارة: {money(item.collectedByAdmin, item.currency)}</span>
                    </div>
                    <div className="detail-list compact-detail-list">
                      <div><span>إجمالي أجور السائق</span><strong>{money(item.driverFees, item.currency)}</strong></div>
                      <div><span>إجمالي هامش المنصة</span><strong>{money(item.platformMargins, item.currency)}</strong></div>
                    </div>
                    <div className="actions">
                      <Link className="button primary compact-button" href={`/admin/driver-finance/${item.driverId}`}>فتح الحساب والتسوية</Link>
                      {item.lastEntryAt ? <small>آخر حركة: {new Date(item.lastEntryAt).toLocaleString("ar")}</small> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
