"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import type { AssistantConfiguration, AssistantFaq } from "@/lib/assistant-config";

type AssistantStats = {
  periodDays: number;
  note: string;
  totals: Record<string, number>;
  topics: Record<string, number>;
  daily: Array<{ day: string; count: number }>;
};

const eventNames: Array<{ key: string; label: string }> = [
  { key: "OPEN", label: "فتح نافذة المساعد" },
  { key: "QUESTION", label: "أسئلة أُرسلت" },
  { key: "FARE_VIEW", label: "عرض أداة الأسعار" },
  { key: "QUOTE_SUCCESS", label: "أسعار جرى استرجاعها" },
  { key: "BOOKING_CLICK", label: "انتقال إلى الحجز" },
  { key: "WHATSAPP_CLICK", label: "انتقال إلى واتساب" },
];
const topicNames: Record<string, string> = {
  general: "عام", booking: "الحجز", prices: "الأسعار", routes: "المسارات",
  guest: "الحجز كضيف", luggage: "الحقائب", flight: "الطيران",
  status: "متابعة الحجز", driver: "السائق", change: "التعديل والإلغاء",
  payment: "الدفع", support: "الدعم", custom: "أسئلة خاصة",
};

export default function AssistantAdminPage() {
  const { user } = useAuth();
  const canEdit = Boolean(user?.roles.some((role) => role === "SUPER_ADMIN" || role === "ADMIN"));
  const [config, setConfig] = useState<AssistantConfiguration | null>(null);
  const [stats, setStats] = useState<AssistantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, metrics] = await Promise.all([
        apiFetch<AssistantConfiguration>("/admin/assistant/config"),
        apiFetch<AssistantStats>("/admin/assistant/metrics"),
      ]);
      setConfig(settings);
      setStats(metrics);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل إعدادات المساعد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"].includes(role))) {
      void load();
    }
  }, [load, user]);

  function editFaq(index: number, patch: Partial<AssistantFaq>) {
    setConfig((current) => current ? {
      ...current, faqs: current.faqs.map((faq, i) => i === index ? { ...faq, ...patch } : faq),
    } : null);
  }

  async function save() {
    if (!config || saving || !canEdit) return;
    if (!config.welcomeMessage.trim() || config.welcomeMessage.length > 350) {
      setError("رسالة الترحيب مطلوبة ويجب ألا تتجاوز 350 محرفاً.");
      return;
    }
    if (config.faqs.some((faq) =>
      faq.question.trim().length < 4 || faq.question.length > 120 ||
      faq.answer.trim().length < 3 || faq.answer.length > 650
    )) {
      setError("راجع الأسئلة والأجوبة: يجب أن تكون كاملة وضمن حدود الطول المحددة.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await apiFetch<AssistantConfiguration>("/admin/assistant/config", {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      setConfig(saved);
      setMessage("تم حفظ الإعدادات. قد تستغرق مزامنتها مع المساعد فترة قصيرة.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ إعدادات المساعد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / الموقع العام"
          title="إدارة المساعد الذكي"
          subtitle="إعدادات رسالة الترحيب والأسئلة المخصصة وإحصائيات استخدام إجمالية بدون نصوص المحادثات."
          actions={<Link href="/admin" className="button">لوحة الإدارة</Link>}
        />

        {error ? <div className="notice error" role="alert">{error}</div> : null}
        {message ? <div className="notice success" role="status">{message}</div> : null}
        {loading ? <div className="panel">جارٍ تحميل إعدادات المساعد...</div> : null}

        {config ? (
          <section className="panel stack-form">
            <div className="section-heading">
              <div><h2>الإعدادات الأساسية</h2><p className="subtitle">أي تغيير هنا يصبح متاحاً للموقع العام بعد حفظه وتحديث الإعدادات.</p></div>
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={!canEdit || saving}
                onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
              />
              تفعيل نافذة المساعد للزوار
            </label>
            <label>
              <span className="label">رسالة الترحيب ({config.welcomeMessage.length}/350)</span>
              <textarea className="input" rows={3} maxLength={350} disabled={!canEdit || saving}
                value={config.welcomeMessage}
                onChange={(event) => setConfig({ ...config, welcomeMessage: event.target.value })} />
            </label>

            <div className="section-heading">
              <div><h2>الأسئلة الشائعة المخصصة ({config.faqs.length}/20)</h2>
                <p className="subtitle">يمكنك إضافة أسئلة محلية يختارها العميل. لا تضف تفاصيل خاصة أو أسعاراً ثابتة هنا؛ تبقى الأسعار من نظام الحجز.</p>
              </div>
              {canEdit ? <button type="button" className="button" disabled={saving || config.faqs.length >= 20}
                onClick={() => setConfig((current) => current ? {
                  ...current, faqs: [...current.faqs, { question: "", answer: "" }],
                } : null)}>إضافة سؤال</button> : null}
            </div>
            {config.faqs.map((faq, i) => (
              <div key={i} className="booking-card stack-form">
                <label><span className="label">السؤال {i + 1}</span>
                  <input className="input" disabled={!canEdit || saving} maxLength={120} value={faq.question}
                    onChange={(event) => editFaq(i, { question: event.target.value })} />
                </label>
                <label><span className="label">الجواب</span>
                  <textarea className="input" disabled={!canEdit || saving} maxLength={650} rows={3} value={faq.answer}
                    onChange={(event) => editFaq(i, { answer: event.target.value })} />
                </label>
                {canEdit ? <button type="button" className="button" disabled={saving}
                  onClick={() => setConfig((current) => current ? {
                    ...current, faqs: current.faqs.filter((_, index) => index !== i),
                  } : null)}>حذف السؤال</button> : null}
              </div>
            ))}
            {!config.faqs.length ? <div className="empty-state">لا توجد أسئلة مخصصة. لا تزال إجابات الحجز والأسعار الأساسية متاحة في الكود.</div> : null}
            {canEdit ? <button type="button" className="button primary" disabled={saving} onClick={() => void save()}>
              {saving ? "جارٍ حفظ الإعدادات..." : "حفظ الإعدادات"}
            </button> : <p className="subtitle">يمكنك الاطلاع على الإعدادات والإحصائيات؛ التعديل متاح لمدير المنصة فقط.</p>}
          </section>
        ) : null}

        {stats ? (
          <>
            <section className="panel">
              <div className="section-heading"><div><h2>إحصائيات آخر {stats.periodDays} يوماً</h2><p className="subtitle">{stats.note}</p></div>
                <button className="button" type="button" disabled={loading} onClick={() => void load()}>تحديث</button>
              </div>
              <div className="grid admin-stats">
                {eventNames.map(({ key, label }) => (
                  <div className="card" key={key}>
                    <div className="label">{label}</div>
                    <div className="value">{stats.totals[key] ?? 0}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <h2>موضوعات أسئلة الزوار</h2>
              <p className="subtitle">أعداد تقريبية مجمعة حسب الفئة، وليست أسئلة مكتوبة أو بيانات عملاء.</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>الموضوع</th><th>العدد</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.topics).sort((a, b) => b[1] - a[1]).map(([topic, count]) => (
                      <tr key={topic}><td>{topicNames[topic] || "أخرى"}</td><td>{count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!Object.keys(stats.topics).length ? <div className="empty-state">لا توجد أحداث أسئلة مسجلة بعد.</div> : null}
            </section>
            <section className="panel">
              <h2>فتح المساعد حسب اليوم</h2>
              <p className="subtitle">عدد مرات فتح نافذة المحادثة المسجلة بموافقة الزوار خلال آخر 30 يومًا (قد يفتح الشخص النافذة أكثر من مرة).</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>التاريخ</th><th>مرات الفتح</th></tr></thead>
                  <tbody>
                    {stats.daily.slice().reverse().map((item) => (
                      <tr key={item.day}><td>{item.day}</td><td>{item.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!stats.daily.length ? <div className="empty-state">لا توجد أحداث مسجلة بعد.</div> : null}
            </section>
          </>
        ) : null}
      </Shell>
    </ProtectedRoute>
  );
}
