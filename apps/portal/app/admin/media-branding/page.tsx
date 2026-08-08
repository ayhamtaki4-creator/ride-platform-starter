"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { MediaUpload } from "@/components/admin/media-upload";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";
import { MediaAsset } from "@/lib/admin-operations";
import { MediaBrandingConfig } from "@/lib/image-protection";

export default function MediaBrandingPage() {
  const [config, setConfig] = useState<MediaBrandingConfig | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setConfig(await apiFetch<MediaBrandingConfig>("/admin/media-branding"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل إعدادات الصور.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function attachLogo(asset: MediaAsset) {
    setWorking(true);
    setMessage("");
    setError("");
    try {
      await apiFetch(`/admin/media/${asset.id}/approve`, { method: "POST" });
      const next = await apiFetch<MediaBrandingConfig>("/admin/media-branding", {
        method: "PATCH",
        body: JSON.stringify({ logoMediaAssetId: asset.id }),
      });
      setConfig(next);
      setMessage("تم اعتماد شعار الصور. سيطبق تلقائيًا على الصور الجديدة للسائقين والمركبات.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر اعتماد الشعار.");
    } finally {
      setWorking(false);
    }
  }

  async function save() {
    if (!config) return;
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const next = await apiFetch<MediaBrandingConfig>("/admin/media-branding", {
        method: "PATCH",
        body: JSON.stringify({
          watermarkEnabled: config.watermarkEnabled,
          plateBlurEnabled: config.plateBlurEnabled,
          watermarkOpacity: config.watermarkOpacity,
          watermarkWidthPercent: config.watermarkWidthPercent,
        }),
      });
      setConfig(next);
      setMessage("تم حفظ إعدادات حماية الصور.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الإعدادات.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / الوسائط"
          title="حماية الصور وشعار المنصة"
          subtitle="اعتمد شعارًا واحدًا ليظهر تلقائيًا على صور السائقين والمركبات، مع تغبيش لوحات السيارات قبل الرفع."
        />

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>الشعار المعتمد</h2>
              <p className="subtitle">يفضل PNG بخلفية شفافة ودقة عالية. يحفظ الملف الأصلي دون تصغير أبعاده.</p>
            </div>
          </div>
          <div className="two-column-layout compact-layout">
            <div>
              {config?.logoPublicUrl ? (
                <div style={{ padding: 18, borderRadius: 16, border: "1px solid rgba(127,127,127,.25)", display: "grid", placeItems: "center", minHeight: 180 }}>
                  <img src={config.logoPublicUrl} alt="شعار المنصة المعتمد" style={{ maxWidth: 280, maxHeight: 150, objectFit: "contain" }} />
                </div>
              ) : <div className="empty-state">لم يتم اعتماد شعار بعد.</div>}
            </div>
            <div className="stack-form">
              <MediaUpload
                purpose="OTHER"
                visibility="PUBLIC"
                accept=".jpg,.jpeg,.png,.webp"
                label={working ? "جارٍ الحفظ..." : "رفع واعتماد شعار جديد"}
                disabled={working}
                onUploaded={attachLogo}
              />
              <small className="subtitle">الشعار لا يطبق على نفسه، وإنما على صور DRIVER_AVATAR وVEHICLE_IMAGE فقط.</small>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><div><h2>إعدادات الحماية التلقائية</h2><p className="subtitle">المعالجة تتم في المتصفح قبل إرسال الصورة، ثم تحفظ النسخة المحمية مركزيًا.</p></div></div>
          {config ? (
            <div className="stack-form">
              <label className="checkbox-row">
                <input type="checkbox" checked={config.watermarkEnabled} onChange={(event) => setConfig({ ...config, watermarkEnabled: event.target.checked })} />
                وضع شعار المنصة تلقائيًا على صور السائقين والمركبات
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={config.plateBlurEnabled} onChange={(event) => setConfig({ ...config, plateBlurEnabled: event.target.checked })} />
                البحث عن لوحة السيارة وتغبيشها تلقائيًا في صور المركبات
              </label>
              <label>
                <span className="label">شفافية الشعار: {Math.round(config.watermarkOpacity * 100)}%</span>
                <input type="range" min="0.1" max="1" step="0.05" value={config.watermarkOpacity} onChange={(event) => setConfig({ ...config, watermarkOpacity: Number(event.target.value) })} />
              </label>
              <label>
                <span className="label">عرض الشعار نسبةً للصورة: {Math.round(config.watermarkWidthPercent)}%</span>
                <input type="range" min="5" max="40" step="1" value={config.watermarkWidthPercent} onChange={(event) => setConfig({ ...config, watermarkWidthPercent: Number(event.target.value) })} />
              </label>
              <div className="notice">قراءة اللوحة تستخدم Tesseract.js مفتوح المصدر داخل المتصفح. إذا لم تكن اللوحة واضحة، يظهر تنبيه للمشرف لمراجعة الصورة يدويًا.</div>
              <button className="button primary" type="button" disabled={working} onClick={() => void save()}>{working ? "جارٍ الحفظ..." : "حفظ إعدادات الصور"}</button>
            </div>
          ) : <div className="empty-state">جارٍ تحميل الإعدادات...</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
