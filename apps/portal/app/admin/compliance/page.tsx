"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { MediaUpload } from "@/components/admin/media-upload";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch, fetchProtectedBlob } from "@/lib/api";
import {
  ComplianceDocument,
  ComplianceRequirement,
  ComplianceSubject,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeLabel,
  MEDIA_PURPOSE_LABELS,
  MEDIA_STATUS_LABELS,
  MediaAsset,
  MediaPurpose,
  ServiceRegion,
} from "@/lib/admin-operations";

type ExpiringResponse = {
  days: number;
  driverDocuments: Array<ComplianceDocument & {
    driverProfile?: { user?: { id: string; firstName: string; lastName: string; phone?: string | null } };
  }>;
  vehicleDocuments: Array<ComplianceDocument & {
    vehicle?: { plateNumber?: string; make?: string; model?: string; driverProfile?: { user?: { id: string; firstName: string; lastName: string } } };
  }>;
};

type Tab = "overview" | "requirements" | "media";

const emptyRequirement = {
  regionCode: "JORDAN",
  subject: "DRIVER" as ComplianceSubject,
  documentType: "REGION_ENTRY_PERMIT",
  minValidityDays: 7,
  regionScoped: true,
  isActive: true,
};

export default function AdminCompliancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [regions, setRegions] = useState<ServiceRegion[]>([]);
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [expiring, setExpiring] = useState<ExpiringResponse | null>(null);
  const [days, setDays] = useState(30);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [mediaStatus, setMediaStatus] = useState("PENDING");
  const [mediaPurpose, setMediaPurpose] = useState("");
  const [requirementForm, setRequirementForm] = useState(emptyRequirement);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadCore = useCallback(async () => {
    try {
      const [regionData, requirementData] = await Promise.all([
        apiFetch<ServiceRegion[]>("/admin/regions"),
        apiFetch<ComplianceRequirement[]>("/admin/compliance/requirements"),
      ]);
      setRegions(regionData);
      setRequirements(requirementData);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل إعدادات الامتثال.");
    }
  }, []);

  const loadExpiring = useCallback(async () => {
    try {
      setExpiring(await apiFetch<ExpiringResponse>(`/admin/compliance/expiring?days=${days}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الوثائق القريبة من الانتهاء.");
    }
  }, [days]);

  const loadMedia = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (mediaStatus) params.set("status", mediaStatus);
      if (mediaPurpose) params.set("purpose", mediaPurpose);
      setMedia(await apiFetch<MediaAsset[]>(`/admin/media${params.toString() ? `?${params}` : ""}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل الملفات.");
    }
  }, [mediaPurpose, mediaStatus]);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { void loadExpiring(); }, [loadExpiring]);
  useEffect(() => { void loadMedia(); }, [loadMedia]);

  const countryRegions = useMemo(
    () => regions.filter((region) => region.kind === "COUNTRY_ACCESS" && region.isActive),
    [regions]
  );

  async function saveRequirement(event: FormEvent) {
    event.preventDefault();
    setWorking("requirement"); setError(""); setMessage("");
    try {
      await apiFetch("/admin/compliance/requirements", {
        method: "PUT",
        body: JSON.stringify(requirementForm),
      });
      setMessage("تم حفظ متطلب الوثيقة.");
      await loadCore();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المتطلب.");
    } finally { setWorking(""); }
  }

  async function refreshExpired() {
    setWorking("refresh"); setError(""); setMessage("");
    try {
      const result = await apiFetch<{ driver: number; vehicle: number }>("/admin/compliance/refresh-expired", { method: "POST" });
      setMessage(`تم تحديث ${result.driver} وثيقة سائق و${result.vehicle} وثيقة مركبة.`);
      await Promise.all([loadExpiring(), loadMedia(), loadCore()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث الوثائق المنتهية.");
    } finally { setWorking(""); }
  }

  async function mediaAction(asset: MediaAsset, action: "approve" | "reject" | "delete") {
    setWorking(asset.id); setError(""); setMessage("");
    try {
      if (action === "delete") {
        if (!window.confirm(`حذف الملف ${asset.originalName}؟`)) return;
        await apiFetch(`/admin/media/${asset.id}`, { method: "DELETE" });
      } else if (action === "reject") {
        const reason = window.prompt("سبب رفض الملف:", "الصورة أو الوثيقة غير واضحة");
        if (!reason) return;
        await apiFetch(`/admin/media/${asset.id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      } else {
        await apiFetch(`/admin/media/${asset.id}/approve`, { method: "POST" });
      }
      setMessage(action === "approve" ? "تم اعتماد الملف." : action === "reject" ? "تم رفض الملف." : "تم حذف الملف.");
      await loadMedia();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية.");
    } finally { setWorking(""); }
  }

  async function openPrivateFile(asset: MediaAsset) {
    try {
      const blob = await fetchProtectedBlob(asset.adminFileUrl);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح الملف.");
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الأسطول" title="الامتثال والملفات" subtitle="مراجعة التصاريح والوثائق والصور وتتبع تواريخ الانتهاء." />

        <div className="admin-tabs">
          <button className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")} type="button">المراقبة</button>
          <button className={tab === "requirements" ? "is-active" : ""} onClick={() => setTab("requirements")} type="button">متطلبات الدول</button>
          <button className={tab === "media" ? "is-active" : ""} onClick={() => setTab("media")} type="button">مراجعة الملفات</button>
        </div>

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {tab === "overview" ? (
          <>
            <section className="grid admin-stats">
              <div className="card"><div className="label">وثائق سائقين قريبة الانتهاء</div><div className="value">{expiring?.driverDocuments.length ?? 0}</div></div>
              <div className="card"><div className="label">وثائق مركبات قريبة الانتهاء</div><div className="value">{expiring?.vehicleDocuments.length ?? 0}</div></div>
              <div className="card"><div className="label">متطلبات فعالة</div><div className="value">{requirements.filter((item) => item.isActive).length}</div></div>
              <div className="card"><div className="label">ملفات بانتظار الاعتماد</div><div className="value">{media.filter((item) => item.status === "PENDING").length}</div></div>
            </section>
            <section className="panel filters">
              <label><span className="label">إظهار الوثائق التي تنتهي خلال</span><select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 أيام</option><option value={15}>15 يومًا</option><option value={30}>30 يومًا</option><option value={60}>60 يومًا</option><option value={90}>90 يومًا</option></select></label>
              <button className="button" type="button" onClick={() => void loadExpiring()}>تحديث التقرير</button>
              <button className="button primary" disabled={working === "refresh"} type="button" onClick={() => void refreshExpired()}>فحص المنتهي الآن</button>
            </section>
            <section className="two-column-layout">
              <article className="panel"><h2>وثائق السائقين</h2><div className="schedule-list">{expiring?.driverDocuments.length ? expiring.driverDocuments.map((doc) => <div className="schedule-row" key={doc.id}><div><strong>{doc.driverProfile?.user?.firstName} {doc.driverProfile?.user?.lastName}</strong><small>{documentTypeLabel(doc.documentType)} · {doc.region?.nameAr ?? "عام"}</small></div><div><StatusPill status={doc.status} /><small>{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString("ar") : "بلا انتهاء"}</small></div></div>) : <div className="empty-state">لا توجد وثائق سائقين ضمن الفترة.</div>}</div></article>
              <article className="panel"><h2>وثائق المركبات</h2><div className="schedule-list">{expiring?.vehicleDocuments.length ? expiring.vehicleDocuments.map((doc) => <div className="schedule-row" key={doc.id}><div><strong>{doc.vehicle?.make} {doc.vehicle?.model} · {doc.vehicle?.plateNumber}</strong><small>{documentTypeLabel(doc.documentType)} · {doc.region?.nameAr ?? "عام"}</small></div><div><StatusPill status={doc.status} /><small>{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString("ar") : "بلا انتهاء"}</small></div></div>) : <div className="empty-state">لا توجد وثائق مركبات ضمن الفترة.</div>}</div></article>
            </section>
          </>
        ) : null}

        {tab === "requirements" ? (
          <>
            <section className="panel"><h2>إضافة أو تحديث متطلب</h2><p className="subtitle">القيمة نفسها للمنطقة ونوع صاحب الوثيقة ونوع الوثيقة يتم تحديثها بدل إنشاء نسخة مكررة.</p><form className="admin-form-grid" onSubmit={saveRequirement}>
              <label><span className="label">الدولة</span><select className="input" value={requirementForm.regionCode} onChange={(e) => setRequirementForm({ ...requirementForm, regionCode: e.target.value })}>{countryRegions.map((region) => <option value={region.code} key={region.id}>{region.nameAr}</option>)}</select></label>
              <label><span className="label">تنطبق على</span><select className="input" value={requirementForm.subject} onChange={(e) => setRequirementForm({ ...requirementForm, subject: e.target.value as ComplianceSubject })}><option value="DRIVER">السائق</option><option value="VEHICLE">المركبة</option></select></label>
              <label><span className="label">نوع الوثيقة</span><select className="input" value={requirementForm.documentType} onChange={(e) => setRequirementForm({ ...requirementForm, documentType: e.target.value })}>{DOCUMENT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><span className="label">أقل صلاحية متبقية بالأيام</span><input className="input" type="number" min="0" max="365" value={requirementForm.minValidityDays} onChange={(e) => setRequirementForm({ ...requirementForm, minValidityDays: Number(e.target.value) })} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={requirementForm.regionScoped} onChange={(e) => setRequirementForm({ ...requirementForm, regionScoped: e.target.checked })} />الوثيقة مرتبطة بهذه الدولة تحديدًا</label>
              <label className="checkbox-row"><input type="checkbox" checked={requirementForm.isActive} onChange={(e) => setRequirementForm({ ...requirementForm, isActive: e.target.checked })} />متطلب فعال</label>
              <button className="button primary" disabled={working === "requirement"} type="submit">حفظ المتطلب</button>
            </form></section>
            <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>الدولة</th><th>صاحب الوثيقة</th><th>الوثيقة</th><th>الحد الأدنى</th><th>النطاق</th><th>الحالة</th><th>تعديل</th></tr></thead><tbody>{requirements.map((item) => <tr key={item.id}><td>{item.region.nameAr}</td><td>{item.subject === "DRIVER" ? "سائق" : "مركبة"}</td><td>{documentTypeLabel(item.documentType)}</td><td>{item.minValidityDays} يوم</td><td>{item.regionScoped ? "للدولة المحددة" : "وثيقة عامة"}</td><td><StatusPill status={item.isActive ? "ACTIVE" : "SUSPENDED"} label={item.isActive ? "فعال" : "متوقف"} /></td><td><button className="button compact-button" type="button" onClick={() => setRequirementForm({ regionCode: item.region.code, subject: item.subject, documentType: item.documentType, minValidityDays: item.minValidityDays, regionScoped: item.regionScoped, isActive: item.isActive })}>تحميل للنموذج</button></td></tr>)}</tbody></table></div></section>
          </>
        ) : null}

        {tab === "media" ? (
          <>
            <section className="panel">
              <div className="section-heading"><div><h2>رفع ملف مستقل</h2><p className="subtitle">للاختبار أو لإرفاقه لاحقًا بملف سائق أو مركبة. الرفع من صفحة السائق أسهل عادة.</p></div><MediaUpload purpose="OTHER" visibility="PRIVATE" label="رفع ملف" onUploaded={async () => { setMessage("تم رفع الملف."); await loadMedia(); }} /></div>
            </section>
            <section className="panel filters">
              <select className="input" value={mediaStatus} onChange={(e) => setMediaStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(MEDIA_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <select className="input" value={mediaPurpose} onChange={(e) => setMediaPurpose(e.target.value)}><option value="">كل الأغراض</option>{Object.entries(MEDIA_PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button className="button" type="button" onClick={() => void loadMedia()}>تحديث</button>
            </section>
            <section className="media-review-grid">
              {media.map((asset) => (
                <article className="panel media-review-card" key={asset.id}>
                  {asset.mimeType.startsWith("image/") && asset.publicUrl ? <img className="media-review-preview" src={asset.publicUrl} alt={asset.originalName} /> : <div className="media-file-placeholder">{asset.mimeType === "application/pdf" ? "PDF" : "FILE"}</div>}
                  <div className="section-heading"><div><strong>{asset.originalName}</strong><small>{MEDIA_PURPOSE_LABELS[asset.purpose]} · {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></div><StatusPill status={asset.status} label={MEDIA_STATUS_LABELS[asset.status]} /></div>
                  {asset.rejectionReason ? <div className="notice error">{asset.rejectionReason}</div> : null}
                  <div className="actions"><button className="button" type="button" onClick={() => void openPrivateFile(asset)}>فتح</button><button className="button primary" disabled={working === asset.id || asset.status === "APPROVED"} type="button" onClick={() => void mediaAction(asset, "approve")}>اعتماد</button><button className="button danger" disabled={working === asset.id || asset.status === "REJECTED"} type="button" onClick={() => void mediaAction(asset, "reject")}>رفض</button><button className="button" disabled={working === asset.id} type="button" onClick={() => void mediaAction(asset, "delete")}>حذف</button></div>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </Shell>
    </ProtectedRoute>
  );
}
