"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type BalanceDirection = "PLATFORM_OWES_DRIVER" | "DRIVER_OWES_PLATFORM" | "SETTLED";

type DriverFinanceDetail = {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string;
    driverProfile: { status: string; rating: number };
  };
  balances: Array<{
    currency: string;
    balance: string;
    balanceDirection: BalanceDirection;
    lastEntryAt: string | null;
  }>;
  entries: Array<{
    id: string;
    tripId: string | null;
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

const entryLabels = {
  TRIP_POSITION: "حركة ناتجة عن حجز",
  SETTLEMENT_TO_DRIVER: "دفعة للسائق",
  SETTLEMENT_TO_PLATFORM: "تسليم للمنصة",
} as const;

function money(value: string | number, currency: string) {
  return `${Number(value).toLocaleString("ar", { maximumFractionDigits: 3 })} ${currency}`;
}

export default function AdminDriverFinanceDetailPage() {
  const params = useParams<{ driverId: string }>();
  const [data, setData] = useState<DriverFinanceDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("USD");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiFetch<DriverFinanceDetail>(`/admin/driver-finance/${params.driverId}`);
      setData(next);
      setCurrency((current) => next.balances.some((row) => row.currency === current) ? current : (next.balances[0]?.currency ?? "USD"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل حساب السائق.");
    } finally {
      setLoading(false);
    }
  }, [params.driverId]);

  useEffect(() => { void load(); }, [load]);

  const selectedBalance = useMemo(
    () => data?.balances.find((row) => row.currency === currency) ?? null,
    [currency, data],
  );
  const balanceValue = Number(selectedBalance?.balance ?? 0);
  const balanceText = balanceValue > 0
    ? "المنصة مدينة للسائق"
    : balanceValue < 0
      ? "السائق مدين للمنصة"
      : "الحساب مسوّى";

  async function submitSettlement(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("أدخل مبلغ تسوية صحيحًا.");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ newBalance: string; direction: string }>(`/admin/driver-finance/${params.driverId}/settlements`, {
        method: "POST",
        body: JSON.stringify({ amount: numericAmount, currency, note: note.trim() || undefined }),
      });
      setMessage(`تم تسجيل التسوية. الرصيد الجديد ${money(result.newBalance, currency)}.`);
      setAmount("");
      setNote("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل التسوية.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / المالية / السائق"
          title={data ? `${data.driver.firstName} ${data.driver.lastName}` : "حساب السائق"}
          subtitle="سجل غير قابل للمحو للحجوزات والتسويات المالية."
          actions={<Link className="button" href="/admin/driver-finance">العودة إلى الحسابات</Link>}
        />

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}

        {loading ? <div className="empty-state">جارٍ تحميل الحساب...</div> : !data ? null : (
          <>
            <section className="grid admin-stats">
              <div className="card"><div className="label">الرصيد الحالي</div><div className="value">{money(Math.abs(balanceValue), currency)}</div><small>{balanceText}</small></div>
              <div className="card"><div className="label">عدد التسويات</div><div className="value">{data.settlements.length}</div></div>
              <div className="card"><div className="label">عدد حركات الدفتر</div><div className="value">{data.entries.length}</div></div>
              <div className="card"><div className="label">تقييم السائق</div><div className="value">{data.driver.driverProfile.rating}</div></div>
            </section>

            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">تسوية الرصيد</span><h2>{balanceText}</h2><p className="subtitle">لا يمكن تسجيل مبلغ أكبر من الرصيد المفتوح. اتجاه التسوية يحدده النظام تلقائيًا.</p></div></div>
              <form className="form-grid" onSubmit={submitSettlement}>
                <label><span className="label">العملة</span><select className="input" value={currency} onChange={(event) => setCurrency(event.target.value)}>{data.balances.map((row) => <option key={row.currency} value={row.currency}>{row.currency}</option>)}</select></label>
                <label><span className="label">مبلغ التسوية</span><input className="input" type="number" min="0.001" step="0.001" max={Math.abs(balanceValue) || undefined} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.000" /></label>
                <label style={{ gridColumn: "1 / -1" }}><span className="label">ملاحظة</span><textarea className="input" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: تسوية نقدية بتاريخ اليوم" /></label>
                <div className="actions" style={{ gridColumn: "1 / -1" }}><button className="button primary" type="submit" disabled={working || balanceValue === 0}>{working ? "جارٍ التسجيل..." : balanceValue > 0 ? "تسجيل دفع للسائق" : balanceValue < 0 ? "تسجيل استلام من السائق" : "الحساب مسوّى"}</button></div>
              </form>
            </section>

            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">دفتر الحساب</span><h2>آخر الحركات</h2></div></div>
              {data.entries.length === 0 ? <div className="empty-state">لا توجد حركات مالية بعد.</div> : (
                <div className="booking-list admin-booking-list">
                  {data.entries.map((entry) => {
                    const delta = Number(entry.balanceDelta);
                    return <article className="booking-card compact" key={entry.id}>
                      <div className="booking-card-head"><div><strong>{entryLabels[entry.type]}</strong><small>{entry.bookingReference || "بدون حجز مرتبط"} · {new Date(entry.createdAt).toLocaleString("ar")}</small></div><span className="status">{delta > 0 ? "+" : "−"}{money(Math.abs(delta), entry.currency)}</span></div>
                      {entry.note ? <p className="subtitle">{entry.note}</p> : null}
                      {entry.tripId ? <div className="actions"><Link className="button compact-button" href={`/admin/bookings/${entry.tripId}`}>فتح الحجز</Link></div> : null}
                    </article>;
                  })}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-heading"><div><span className="eyebrow">التسويات</span><h2>سجل عمليات التسوية</h2></div></div>
              {data.settlements.length === 0 ? <div className="empty-state">لم تسجل أي تسوية بعد.</div> : (
                <div className="schedule-list">
                  {data.settlements.map((settlement) => <div className="schedule-row" key={settlement.id}><div><strong>{settlement.direction === "TO_DRIVER" ? "دفعة للسائق" : "استلام من السائق"}</strong><small>{settlement.note || new Date(settlement.settledAt).toLocaleString("ar")}</small></div><span>{money(settlement.amount, settlement.currency)}</span></div>)}
                </div>
              )}
            </section>
          </>
        )}
      </Shell>
    </ProtectedRoute>
  );
}
