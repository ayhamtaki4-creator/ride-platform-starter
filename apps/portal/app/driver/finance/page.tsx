"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type FinanceDetail = {
  balances: Array<{
    currency: string;
    balance: string;
    balanceDirection: "PLATFORM_OWES_DRIVER" | "DRIVER_OWES_PLATFORM" | "SETTLED";
    lastEntryAt: string | null;
  }>;
  entries: Array<{
    id: string;
    type: "TRIP_POSITION" | "SETTLEMENT_TO_DRIVER" | "SETTLEMENT_TO_PLATFORM";
    balanceDelta: string;
    currency: string;
    note: string | null;
    createdAt: string;
    bookingReference: string | null;
  }>;
  settlements: Array<{
    id: string;
    direction: "TO_DRIVER" | "TO_PLATFORM";
    amount: string;
    currency: string;
    note: string | null;
    settledAt: string;
  }>;
};

function money(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("ar", { maximumFractionDigits: 3 })} ${currency}`;
}

export default function DriverFinancePage() {
  const [data, setData] = useState<FinanceDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<FinanceDetail>("/drivers/me/finance"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الحساب المالي.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const primary = data?.balances.find((row) => row.currency === "USD") ?? data?.balances[0];
  const balance = Number(primary?.balance ?? 0);
  const balanceDescription = balance > 0
    ? "مبلغ مستحق لك من المنصة"
    : balance < 0
      ? "مبلغ مستحق للمنصة لديك"
      : "حسابك مسوّى حاليًا";

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / المالية"
          title="حسابي المالي"
          subtitle="تفاصيل أجور الرحلات والمبالغ التي تم تحصيلها والتسويات المسجلة من الإدارة."
          actions={<Link className="button" href="/driver">العودة إلى لوحة السائق</Link>}
        />

        {error ? <div className="notice error">{error}</div> : null}
        {loading ? <div className="empty-state">جارٍ تحميل الحساب...</div> : !data ? null : (
          <>
            <section className="grid admin-stats">
              <div className="card"><div className="label">الرصيد الحالي</div><div className="value">{money(Math.abs(balance), primary?.currency ?? "USD")}</div><small>{balanceDescription}</small></div>
              <div className="card"><div className="label">التسويات المسجلة</div><div className="value">{data.settlements.length}</div></div>
              <div className="card"><div className="label">الحركات المالية</div><div className="value">{data.entries.length}</div></div>
            </section>

            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">آخر الحركات</span><h2>دفتر حسابي</h2><p className="subtitle">القيمة الموجبة تزيد مستحقاتك، والقيمة السالبة تزيد مستحقات المنصة.</p></div><button className="button" type="button" onClick={() => void load()}>تحديث</button></div>
              {data.entries.length === 0 ? <div className="empty-state">لا توجد حركات مالية حتى الآن.</div> : (
                <div className="booking-list">
                  {data.entries.slice(0, 30).map((entry) => {
                    const delta = Number(entry.balanceDelta);
                    return <article className="booking-card compact" key={entry.id}>
                      <div className="booking-card-head"><div><strong>{entry.bookingReference || (entry.type === "SETTLEMENT_TO_DRIVER" ? "تسوية مدفوعة لك" : entry.type === "SETTLEMENT_TO_PLATFORM" ? "تسوية مسلمة للمنصة" : "حركة مالية")}</strong><small>{new Date(entry.createdAt).toLocaleString("ar")}</small></div><span className="status">{delta > 0 ? "+" : "−"}{money(Math.abs(delta), entry.currency)}</span></div>
                    </article>;
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </Shell>
    </ProtectedRoute>
  );
}
