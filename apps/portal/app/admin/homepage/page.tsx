"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { MediaUpload } from "@/components/admin/media-upload";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import type { HomeShowcaseItem, MediaAsset } from "@/lib/admin-operations";

export default function AdminHomepagePage() {
  const [items, setItems] = useState<HomeShowcaseItem[]>([]);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await apiFetch<HomeShowcaseItem[]>("/admin/home-showcase"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل صور الصفحة الرئيسية.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function attachImage(asset: MediaAsset) {
    setWorking(`attach-${asset.id}`);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/admin/home-showcase/${asset.id}`, {
        method: "POST",
        body: JSON.stringify({
          titleAr: "سيارة من أسطول طريق الشام",
          subtitleAr: "سيارات حديثة ومكيفة ومجهزة لرحلات المسافات الطويلة.",
          isActive: true,
          sortOrder: items.length,
        }),
      });
      setMessage("تم رفع الصورة وإضافتها إلى معرض الصفحة الرئيسية.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إضافة الصورة إلى المعرض.");
    } finally {
      setWorking("");
    }
  }

  function updateLocal(id: string, patch: Partial<HomeShowcaseItem>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(item: HomeShowcaseItem) {
    setWorking(item.id);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/admin/home-showcase/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          titleAr: item.titleAr,
          subtitleAr: item.subtitleAr,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        }),
      });
      setMessage("تم حفظ إعدادات الصورة.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ إعدادات الصورة.");
    } finally {
      setWorking("");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / الموقع العام"
          title="الصفحة الرئيسية ومعرض السيارات"
          subtitle="ارفع صور السيارات التي تريد عرضها للزوار، ثم عدّل النص والترتيب أو أخفِ أي صورة دون حذفها من التخزين."
        />

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>إضافة صور سيارات</h2>
              <p className="subtitle">يفضل صورًا أفقية واضحة وعالية الجودة. تظهر الصور المعتمدة فقط في الموقع العام.</p>
            </div>
          </div>
          <MediaUpload
            purpose="OTHER"
            visibility="PUBLIC"
            accept=".jpg,.jpeg,.png,.webp"
            label="رفع صورة سيارة للرئيسية"
            disabled={Boolean(working)}
            onUploaded={attachImage}
          />
        </section>

        <section className="panel">
          <div className="section-heading">
            <div><h2>الصور المختارة</h2><p className="subtitle">رقم الترتيب الأصغر يظهر أولًا. يمكن إبقاء الصورة محفوظة وإخفاؤها مؤقتًا من الصفحة الرئيسية.</p></div>
          </div>

          {items.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 18 }}>
              {items.map((item) => (
                <article className="booking-card" key={item.id}>
                  <img
                    src={item.imageUrl}
                    alt={item.titleAr}
                    style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 16, marginBottom: 16 }}
                  />
                  <div className="stack-form">
                    <label>
                      <span className="label">العنوان</span>
                      <input className="input" value={item.titleAr} maxLength={90} onChange={(event) => updateLocal(item.id, { titleAr: event.target.value })} />
                    </label>
                    <label>
                      <span className="label">الوصف القصير</span>
                      <textarea className="input" rows={3} value={item.subtitleAr} maxLength={180} onChange={(event) => updateLocal(item.id, { subtitleAr: event.target.value })} />
                    </label>
                    <label>
                      <span className="label">الترتيب</span>
                      <input className="input" type="number" min={0} max={1000} value={item.sortOrder} onChange={(event) => updateLocal(item.id, { sortOrder: Number(event.target.value) || 0 })} />
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={item.isActive} onChange={(event) => updateLocal(item.id, { isActive: event.target.checked })} />
                      عرض الصورة في الصفحة الرئيسية
                    </label>
                    <button className="button primary" type="button" disabled={Boolean(working)} onClick={() => void save(item)}>
                      {working === item.id ? "جارٍ الحفظ..." : "حفظ"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state">لم تضف الإدارة صور سيارات إلى الصفحة الرئيسية بعد.</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
