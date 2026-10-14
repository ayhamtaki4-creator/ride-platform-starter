"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type DeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";

type Delivery = {
  id: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  trip: { id: string; bookingReference: string | null } | null;
};

type TelegramConfiguration = {
  enabled: boolean;
  configured: boolean;
  queueIntervalMs: number;
};

const labels: Record<DeliveryStatus, string> = {
  PENDING: "بانتظار الإرسال",
  SENDING: "جارٍ الإرسال",
  SENT: "تم الإرسال",
  FAILED: "فشل الإرسال",
  SKIPPED: "لم يُرسل بسبب الإعدادات",
};

const statuses = Object.keys(labels) as DeliveryStatus[];

export default function AdminTelegramPage() {
  const [filter, setFilter] = useState<DeliveryStatus | "">("");
  const [ready, setReady] = useState(false);
  const [configuration, setConfiguration] = useState<TelegramConfiguration | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("status");
    if (initial && statuses.includes(initial as DeliveryStatus)) {
      setFilter(initial as DeliveryStatus);
    }
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const [status, items] = await Promise.all([
        apiFetch<TelegramConfiguration>("/admin/telegram/status"),
        apiFetch<Delivery[]>(`/admin/telegram/deliveries${filter ? `?status=${filter}` : ""}`),
      ]);
      setConfiguration(status);
      setDeliveries(items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل إشعارات Telegram.");
    }
  }, [filter]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function retry(id: string) {
    if (!configuration?.configured) {
      setError("يجب ضبط اتصال Telegram على الخادم قبل إعادة المحاولة.");
      return;
    }
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/admin/telegram/deliveries/${id}/retry`, { method: "POST" });
      setMessage("أُعيد الإشعار إلى قائمة الإرسال. راجع حالته بعد لحظات.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذرت إعادة إرسال الإشعار.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / التشغيل"
          title="مراقبة إشعارات Telegram"
          subtitle="متابعة إشعارات الحجوزات المرسلة للإدارة وإعادة المحاولة عند الفشل. لا تُعرض رموز البوت أو رسائل العملاء هنا."
          actions={<Link className="button" href="/admin">لوحة الإدارة</Link>}
        />
        {error ? <div className="notice error" role="alert">{error}</div> : null}
        {message ? <div className="notice success" role="status">{message}</div> : null}
        <section className="grid admin-stats">
          <div className="card"><div className="label">خدمة Telegram</div><div className="value compact-value">{configuration?.enabled ? "مفعلة" : "غير مفعلة"}</div></div>
          <div className="card"><div className="label">إعداد الاتصال</div><div className="value compact-value">{configuration?.configured ? "مكتمل" : "غير مكتمل"}</div></div>
          <div className="card"><div className="label">الرسائل المعروضة</div><div className="value">{deliveries.length}</div></div>
          <div className="card"><div className="label">الفاشلة ضمن المعروض</div><div className="value">{deliveries.filter((item) => item.status === "FAILED").length}</div></div>
        </section>
        {configuration && (!configuration.enabled || !configuration.configured) ? (
          <div className="notice">تنبيهات Telegram غير مفعلة أو إعدادها غير مكتمل على الخادم. راجع إعدادات الاتصال في Render.</div>
        ) : null}
        <section className="panel filters">
          <label htmlFor="telegram-delivery-filter">حالة الإرسال</label>
          <select id="telegram-delivery-filter" className="input" value={filter} onChange={(event) => setFilter(event.target.value as DeliveryStatus | "")}>
            <option value="">كل الحالات</option>
            {statuses.map((value) => <option key={value} value={value}>{labels[value]}</option>)}
          </select>
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </section>
        <section className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>الحجز</th><th>الحالة</th><th>المحاولات</th><th>التاريخ</th><th>آخر خطأ</th><th>الإجراء</th></tr></thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>
                      {delivery.trip?.id ? (
                        <Link href={`/admin/bookings/${delivery.trip.id}`}>{delivery.trip.bookingReference || "عرض الحجز"}</Link>
                      ) : "إشعار نظام"}
                    </td>
                    <td><span className={`status ${delivery.status === "SENT" ? "success" : delivery.status === "FAILED" ? "danger" : ""}`}>{labels[delivery.status]}</span></td>
                    <td>{delivery.attempts}</td>
                    <td>{new Date(delivery.sentAt || delivery.createdAt).toLocaleString("ar")}</td>
                    <td>{delivery.lastError ? <small className="danger-text">{delivery.lastError}</small> : "—"}</td>
                    <td>{(delivery.status === "FAILED" || delivery.status === "SKIPPED") ? (
                      <button className="button compact-button" type="button" disabled={Boolean(busyId) || !configuration?.configured} onClick={() => void retry(delivery.id)}>
                        {busyId === delivery.id ? "جارٍ إعادة الإرسال..." : "إعادة المحاولة"}
                      </button>
                    ) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ready && !error && deliveries.length === 0 ? <div className="empty-state">لا توجد إشعارات ضمن الفلتر الحالي.</div> : null}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
