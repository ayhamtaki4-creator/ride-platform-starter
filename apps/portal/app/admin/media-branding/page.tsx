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
        body: JSON.stringify({ logoMediaAssetId: asset.id, watermarkEnabled: true }),
      });
      setConfig(next);
      setMessage("تم اعتماد الشعار الجديد واستبدال الشعار السابق. سيطبق على الصور الجديدة تلقائيًا.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر اعتماد الشعار.");
    } finally {
      setWorking(false);
    }
  }

  async function removeLogo() {
    if (!config?.logoMediaAssetId) return;
    if (!window.confirm("هل تريد حذف الشعار المعتمد نهائيًا؟ سيتم حذفه أيضًا من التخزين المركزي ولن يطبق على الصور الجديدة.")) return;
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const next = await apiFetch<MediaBrandingConfig>("/admin/media-branding/logo", { method: "DELETE" });
      setConfig(next);
      setMessage("تم حذف الشعار وتعطيل العلامة المائية تلقائيًا.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حذف الشعار.");
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

  async function resetSettings() {
    if (!window.confirm("إعادة إعدادات الحماية إلى القيم الافتراضية؟ لن يتم حذف الشعار الحالي.")) return;
    setWorking(true);
    setMessage("");
    setError("");
    try {
      const next = await apiFetch<MediaBrandingConfig>("/admin/media-branding/reset", { method: "POST" });
      setConfig(next);
      setMessage("تمت إعادة إعدادات الحماية إلى القيم الافتراضية.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إعادة الإعدادات الافتراضية.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / الوسائط"
          title="التحكم الكامل بالصور والشعار"
          subtitle="إدارة الشعار والاستبدال والحذف، موضع العلامة المائية، الشفافية والحجم، وتغبيش لوحات المركبات من مكان واحد."
        />

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>الشعار المعتمد</h2>
              <p className="subtitle">يفضل PNG بخلفية شفافة ودقة عالية. عند رفع شعار جديد يتم استبدال السابق وتنظيف ملفه من التخزين المركزي.</p>
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
                label={config?.logoPublicUrl ? "استبدال الشعار" : "رفع واعتماد شعار"}
                disabled={working}
                onUploaded={attachLogo}
              />
              {config?.logoPublicUrl ? (
                <button className="button danger" type="button" disabled={working} onClick={() => void removeLogo()}>
                  حذف الشعار نهائيًا
                </button>
              ) : null}
              <small className="subtitle">حذف الشعار يعطل العلامة المائية تلقائيًا. استبداله لا يؤثر على الصور القديمة، وإنما يستخدم الشعار الجديد في الصور التي ترفع بعد التغيير.</small>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>معاينة العلامة المائية</h2>
              <p className="subtitle">المعاينة توضح الموضع والحجم والشفافية قبل الحفظ. الموضع المعتمد هو أعلى يسار الصورة.</p>
            </div>
          </div>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 18, minHeight: 260, maxWidth: 760, background: "linear-gradient(135deg,#d8e4ea,#7f929c)", border: "1px solid rgba(127,127,127,.25)" }}>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 800, opacity: .5 }}>معاينة صورة مركبة</div>
            {config?.watermarkEnabled && config.logoPublicUrl ? (
              <img
                src={config.logoPublicUrl}
                alt="معاينة الشعار"
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  width: `${config.watermarkWidthPercent}%`,
                  maxHeight: 100,
                  objectFit: "contain",
                  opacity: config.watermarkOpacity,
                }}
              />
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading"><div><h2>إعدادات الحماية التلقائية</h2><p className="subtitle">كل خيار مستقل ويمكن للإدارة تشغيله أو إيقافه في أي وقت.</p></div></div>
          {config ? (
            <div className="stack-form">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.watermarkEnabled}
                  disabled={!config.logoPublicUrl}
                  onChange={(event) => setConfig({ ...config, watermarkEnabled: event.target.checked })}
                />
                وضع شعار المنصة تلقائيًا على صور السائقين والمركبات
              </label>
              {!config.logoPublicUrl ? <small className="field-hint">ارفع شعارًا أولًا لتفعيل العلامة المائية.</small> : null}

              <label className="checkbox-row">
                <input type="checkbox" checked={config.plateBlurEnabled} onChange={(event) => setConfig({ ...config, plateBlurEnabled: event.target.checked })} />
                السماح بخيار تغبيش لوحة السيارة عند رفع صور المركبات
              </label>

              <label>
                <span className="label">شفافية الشعار: {Math.round(config.watermarkOpacity * 100)}%</span>
                <input type="range" min="0.1" max="1" step="0.05" value={config.watermarkOpacity} onChange={(event) => setConfig({ ...config, watermarkOpacity: Number(event.target.value) })} />
              </label>

              <label>
                <span className="label">عرض الشعار نسبةً للصورة: {Math.round(config.watermarkWidthPercent)}%</span>
                <input type="range" min="5" max="40" step="1" value={config.watermarkWidthPercent} onChange={(event) => setConfig({ ...config, watermarkWidthPercent: Number(event.target.value) })} />
              </label>

              <div className="notice">
                صور المركبات لديها زران منفصلان: رفع مع تغبيش اللوحة أو رفع بدون تغبيش. الشعار يطبق في الحالتين إذا كان مفعّلًا.
              </div>

              <div className="actions">
                <button className="button primary" type="button" disabled={working} onClick={() => void save()}>{working ? "جارٍ الحفظ..." : "حفظ جميع الإعدادات"}</button>
                <button className="button" type="button" disabled={working} onClick={() => void resetSettings()}>إعادة القيم الافتراضية</button>
                <button className="button" type="button" disabled={working} onClick={() => void load()}>إلغاء التغييرات غير المحفوظة</button>
              </div>
            </div>
          ) : <div className="empty-state">جارٍ تحميل الإعدادات...</div>}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
