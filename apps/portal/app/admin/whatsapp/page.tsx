"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/lib/api";

type WhatsAppStatus = {
  enabled: boolean;
  configured: boolean;
  graphVersion: string;
  templateName: string;
  languageCode: string;
};

type Delivery = {
  id: string;
  recipientPhone: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; phone?: string | null };
  notification: { type: string; title: string; message: string; link?: string | null };
};

const labels: Record<Delivery["status"], string> = {
  PENDING: "بانتظار الإرسال",
  SENDING: "جارٍ الإرسال",
  SENT: "تم الإرسال",
  FAILED: "فشل الإرسال",
  SKIPPED: "غير مهيأ",
};

export default function AdminWhatsAppPage() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filter, setFilter] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${filter}` : "";
      const [configuration, items] = await Promise.all([
        apiFetch<WhatsAppStatus>("/admin/whatsapp/status"),
        apiFetch<Delivery[]>(`/admin/whatsapp/deliveries${query}`),
      ]);
      setStatus(configuration);
      setDeliveries(items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل سجل WhatsApp.");
    }
  }, [filter]);

  useEffect(() => void load(), [load]);

  async function retry(id: string) {
    setWorking(id);
    try {
      await apiFetch(`/admin/whatsapp/deliveries/${id}/retry`, { method: "POST" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إعادة الإرسال.");
    } finally {
      setWorking("");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الإدارة / الرسائل" title="متابعة WhatsApp" subtitle="حالة الربط وسجل آخر التحديثات المرسلة للمسافرين والسائقين والإدارة." />
        {error ? <div className="notice error">{error}</div> : null}

        <section className="grid admin-stats">
          <div className="card"><div className="label">الخدمة</div><div className="value compact-value">{status?.enabled ? "مفعلة" : "متوقفة"}</div></div>
          <div className="card"><div className="label">إعداد Meta</div><div className="value compact-value">{status?.configured ? "مكتمل" : "ناقص"}</div></div>
          <div className="card"><div className="label">القالب</div><div className="value compact-value">{status?.templateName ?? "—"}</div></div>
          <div className="card"><div className="label">تم إرسالها</div><div className="value">{deliveries.filter((item) => item.status === "SENT").length}</div></div>
        </section>

        {!status?.configured ? <div className="notice">الربط البرمجي جاهز، لكن الإرسال الفعلي يبدأ بعد إضافة بيانات Meta والقالب المعتمد إلى إعدادات الخادم.</div> : null}

        <section className="panel filters">
          <select className="input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">كل الحالات</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <button className="button" type="button" onClick={() => void load()}><Icon name="wifi" size={17} /> تحديث</button>
        </section>

        <section className="panel">
          <div className="table-wrap"><table className="data-table"><thead><tr><th>المستلم</th><th>الرسالة</th><th>الحالة</th><th>المحاولات</th><th>الوقت</th><th>الإجراء</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td><strong>{delivery.user.firstName} {delivery.user.lastName}</strong><small>{delivery.recipientPhone}</small></td><td><strong>{delivery.notification.title}</strong><small>{delivery.notification.message}</small>{delivery.lastError ? <small className="danger-text">{delivery.lastError}</small> : null}</td><td><span className={`status ${delivery.status === "SENT" ? "success" : delivery.status === "FAILED" ? "danger" : ""}`}>{labels[delivery.status]}</span></td><td>{delivery.attempts}</td><td>{new Date(delivery.sentAt || delivery.createdAt).toLocaleString("ar")}</td><td>{["FAILED", "SKIPPED"].includes(delivery.status) ? <button className="button compact-button" type="button" disabled={working === delivery.id} onClick={() => void retry(delivery.id)}>إعادة الإرسال</button> : "—"}</td></tr>)}</tbody></table></div>
          {deliveries.length === 0 ? <div className="empty-state">لا توجد رسائل ضمن هذا الفلتر.</div> : null}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
