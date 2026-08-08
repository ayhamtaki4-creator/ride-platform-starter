"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { MediaUpload } from "@/components/admin/media-upload";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch, fetchProtectedBlob } from "@/lib/api";
import {
  ComplianceDocument,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeLabel,
  DriverAdminRecord,
  DriverVehicle,
  MediaAsset,
  ServiceRegion,
} from "@/lib/admin-operations";

const emptyDoc = {
  documentType: "DRIVING_LICENSE",
  regionCode: "",
  documentNumber: "",
  issuedAt: "",
  expiresAt: "",
  notes: "",
};

const emptyVehicle = {
  make: "",
  model: "",
  year: new Date().getFullYear(),
  color: "",
  plateNumber: "",
  seatCapacity: 4,
  baseRegionCode: "DAMASCUS",
  regionCodes: ["SYRIA"] as string[],
};

export default function AdminDriverDetailPage() {
  const params = useParams<{ id: string }>();
  const driverId = params.id;
  const [driver, setDriver] = useState<DriverAdminRecord | null>(null);
  const [regions, setRegions] = useState<ServiceRegion[]>([]);
  const [driverDocForm, setDriverDocForm] = useState(emptyDoc);
  const [driverDocAsset, setDriverDocAsset] = useState<MediaAsset | null>(null);
  const [vehicleDocForms, setVehicleDocForms] = useState<Record<string, typeof emptyDoc>>({});
  const [vehicleDocAssets, setVehicleDocAssets] = useState<Record<string, MediaAsset | null>>({});
  const [newVehicle, setNewVehicle] = useState(emptyVehicle);
  const [profile, setProfile] = useState({ licenseNumber: "", baseRegionCode: "DAMASCUS" });
  const [driverRegionCodes, setDriverRegionCodes] = useState<string[]>([]);
  const [vehicleRegionCodes, setVehicleRegionCodes] = useState<Record<string, string[]>>({});
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [driverData, regionData] = await Promise.all([
        apiFetch<DriverAdminRecord>(`/admin/drivers/${driverId}`),
        apiFetch<ServiceRegion[]>("/admin/regions"),
      ]);
      setDriver(driverData);
      setRegions(regionData);
      setProfile({ licenseNumber: driverData.licenseNumber ?? "", baseRegionCode: driverData.baseRegion?.code ?? "DAMASCUS" });
      setDriverRegionCodes(driverData.regionAccesses.filter((item) => item.status === "APPROVED").map((item) => item.region.code));
      setVehicleRegionCodes(Object.fromEntries(driverData.vehicles.map((vehicle) => [vehicle.id, vehicle.regionAccesses.filter((item) => item.status === "APPROVED").map((item) => item.region.code)])));
      setVehicleDocForms((current) => Object.fromEntries(driverData.vehicles.map((vehicle) => [vehicle.id, current[vehicle.id] ?? emptyDoc])));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل ملف السائق.");
    }
  }, [driverId]);

  useEffect(() => { void load(); }, [load]);

  const hubs = useMemo(() => regions.filter((r) => r.kind === "OPERATING_HUB" && r.isActive), [regions]);
  const countries = useMemo(() => regions.filter((r) => r.kind === "COUNTRY_ACCESS" && r.isActive), [regions]);

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setWorking(key); setError(""); setMessage("");
    try { await action(); setMessage(success); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تنفيذ العملية."); }
    finally { setWorking(""); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await runAction("profile", () => apiFetch(`/admin/drivers/${driverId}/profile`, { method: "PATCH", body: JSON.stringify(profile) }), "تم تحديث بيانات السائق.");
  }

  async function saveDriverRegions() {
    await runAction("driver-regions", () => apiFetch(`/admin/drivers/${driverId}/regions`, { method: "PUT", body: JSON.stringify({ regionCodes: driverRegionCodes, status: "APPROVED" }) }), "تم تحديث صلاحيات السائق.");
  }

  async function saveVehicleRegions(vehicleId: string) {
    await runAction(`vehicle-regions-${vehicleId}`, () => apiFetch(`/admin/drivers/${driverId}/vehicles/${vehicleId}/regions`, { method: "PUT", body: JSON.stringify({ regionCodes: vehicleRegionCodes[vehicleId] ?? [], status: "APPROVED" }) }), "تم تحديث صلاحيات المركبة.");
  }

  function toggleCodes(values: string[], code: string, checked: boolean) {
    return checked ? Array.from(new Set([...values, code])) : values.filter((value) => value !== code);
  }

  async function attachAvatar(asset: MediaAsset) {
    await apiFetch(`/admin/media/${asset.id}/approve`, { method: "POST" });
    await apiFetch(`/admin/drivers/${driverId}/avatar`, { method: "POST", body: JSON.stringify({ mediaAssetId: asset.id }) });
    setMessage("تم رفع واعتماد صورة السائق.");
    await load();
  }

  async function deleteAvatar() {
    const mediaId = driver?.avatarMedia?.id;
    if (!mediaId) {
      setError("هذه الصورة قديمة وغير مرتبطة بملف وسائط قابل للحذف. ارفع صورة جديدة أولًا إن أردت استبدالها.");
      return;
    }
    if (!window.confirm("هل تريد حذف صورة السائق نهائيًا؟")) return;
    await runAction("delete-avatar", () => apiFetch(`/admin/media/${mediaId}`, { method: "DELETE" }), "تم حذف صورة السائق.");
  }

  async function attachVehicleImages(vehicleId: string, assets: MediaAsset[]) {
    const vehicle = driver?.vehicles.find((item) => item.id === vehicleId);
    const approvedCount = vehicle?.images.filter((image) => image.isApproved).length ?? 0;
    setWorking(`vehicle-images-${vehicleId}`);
    setError("");
    setMessage("");
    try {
      for (let index = 0; index < assets.length; index += 1) {
        const asset = assets[index];
        await apiFetch(`/admin/media/${asset.id}/approve`, { method: "POST" });
        await apiFetch(`/admin/drivers/${driverId}/vehicles/${vehicleId}/media-images`, {
          method: "POST",
          body: JSON.stringify({
            mediaAssetId: asset.id,
            isPrimary: approvedCount === 0 && index === 0,
            sortOrder: approvedCount + index,
          }),
        });
      }
      setMessage(assets.length > 1 ? `تم رفع واعتماد ${assets.length} صور للمركبة.` : "تم رفع واعتماد صورة المركبة.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرفاق صور المركبة.");
    } finally {
      setWorking("");
    }
  }

  async function deleteVehicleImage(vehicleId: string, image: DriverVehicle["images"][number]) {
    const mediaId = image.mediaAsset?.id;
    if (!mediaId) {
      setError("هذه صورة قديمة غير مرتبطة بملف وسائط قابل للحذف من التخزين.");
      return;
    }
    if (!window.confirm("هل تريد حذف هذه الصورة نهائيًا من المركبة والتخزين؟")) return;
    await runAction(
      `delete-image-${image.id}`,
      () => apiFetch(`/admin/media/${mediaId}`, { method: "DELETE" }),
      "تم حذف صورة المركبة.",
    );
  }

  async function createDriverDocument(event: FormEvent) {
    event.preventDefault();
    if (!driverDocAsset) { setError("ارفع ملف الوثيقة أولًا."); return; }
    await runAction("driver-document", () => apiFetch(`/admin/drivers/${driverId}/documents`, {
      method: "POST",
      body: JSON.stringify({ ...driverDocForm, mediaAssetId: driverDocAsset.id, regionCode: driverDocForm.regionCode || undefined, issuedAt: driverDocForm.issuedAt || undefined, expiresAt: driverDocForm.expiresAt || undefined }),
    }), "تمت إضافة وثيقة السائق وبانتظار الاعتماد.");
    setDriverDocForm(emptyDoc); setDriverDocAsset(null);
  }

  async function createVehicleDocument(event: FormEvent, vehicleId: string) {
    event.preventDefault();
    const asset = vehicleDocAssets[vehicleId];
    const form = vehicleDocForms[vehicleId] ?? emptyDoc;
    if (!asset) { setError("ارفع ملف وثيقة المركبة أولًا."); return; }
    await runAction(`vehicle-document-${vehicleId}`, () => apiFetch(`/admin/vehicles/${vehicleId}/documents`, {
      method: "POST",
      body: JSON.stringify({ ...form, mediaAssetId: asset.id, regionCode: form.regionCode || undefined, issuedAt: form.issuedAt || undefined, expiresAt: form.expiresAt || undefined }),
    }), "تمت إضافة وثيقة المركبة وبانتظار الاعتماد.");
    setVehicleDocForms((current) => ({ ...current, [vehicleId]: emptyDoc }));
    setVehicleDocAssets((current) => ({ ...current, [vehicleId]: null }));
  }

  async function reviewDocument(kind: "driver" | "vehicle", ownerId: string, document: ComplianceDocument, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt("سبب الرفض:", "الوثيقة غير واضحة أو البيانات غير مطابقة") ?? undefined;
      if (!reason) return;
    }
    const base = kind === "driver" ? `/admin/drivers/${ownerId}/documents/${document.id}` : `/admin/vehicles/${ownerId}/documents/${document.id}`;
    await runAction(`${action}-${document.id}`, () => apiFetch(`${base}/${action}`, { method: "POST", body: action === "reject" ? JSON.stringify({ reason }) : undefined }), action === "approve" ? "تم اعتماد الوثيقة." : "تم رفض الوثيقة.");
  }

  async function openDocument(document: ComplianceDocument) {
    try {
      const blob = await fetchProtectedBlob(document.mediaAsset.adminFileUrl);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر فتح الوثيقة."); }
  }

  async function addVehicle(event: FormEvent) {
    event.preventDefault();
    await runAction("add-vehicle", () => apiFetch(`/admin/drivers/${driverId}/vehicles`, { method: "POST", body: JSON.stringify(newVehicle) }), "تمت إضافة المركبة.");
    setNewVehicle(emptyVehicle);
  }

  if (!driver) {
    return <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}><Shell><DashboardHeader eyebrow="الأسطول" title="ملف السائق" subtitle="جارٍ تحميل البيانات..." />{error ? <div className="notice error">{error}</div> : <div className="empty-state">جارٍ التحميل...</div>}</Shell></ProtectedRoute>;
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="ملف السائق" title={`${driver.user.firstName} ${driver.user.lastName}`} subtitle="إدارة الصورة والمركبات وصلاحيات الدول والوثائق والتصاريح." />
        <div className="actions"><Link className="button" href="/admin/drivers">العودة للسائقين</Link><button className="button" type="button" onClick={() => void load()}>تحديث</button></div>
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="driver-detail-hero panel">
          <div className="driver-card-profile">
            {driver.avatarUrl ? <img className="driver-avatar-xl" src={driver.avatarUrl} alt="صورة السائق" /> : <div className="driver-avatar-xl placeholder">{driver.user.firstName.slice(0, 1)}{driver.user.lastName.slice(0, 1)}</div>}
            <div><div className="eyebrow">{driver.baseRegion?.nameAr ?? "بلا مركز"}</div><h2>{driver.user.firstName} {driver.user.lastName}</h2><p className="subtitle">{driver.user.email} · {driver.user.phone ?? "لا يوجد هاتف"}</p><div className="tag-list"><StatusPill status={driver.status} /><StatusPill status={driver.availability} /></div></div>
          </div>
          <div className="actions">
            <MediaUpload purpose="DRIVER_AVATAR" visibility="PUBLIC" accept=".jpg,.jpeg,.png,.webp" label="رفع صورة السائق" onUploaded={attachAvatar} />
            {driver.avatarUrl ? <button className="button danger" disabled={working === "delete-avatar"} type="button" onClick={() => void deleteAvatar()}>حذف صورة السائق</button> : null}
          </div>
        </section>

        <section className="two-column-layout">
          <article className="panel"><h2>البيانات الأساسية</h2><form className="stack-form" onSubmit={saveProfile}><label><span className="label">رقم رخصة القيادة</span><input className="input" value={profile.licenseNumber} onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })} /></label><label><span className="label">مركز التشغيل</span><select className="input" value={profile.baseRegionCode} onChange={(e) => setProfile({ ...profile, baseRegionCode: e.target.value })}>{hubs.map((hub) => <option key={hub.id} value={hub.code}>{hub.nameAr}</option>)}</select></label><button className="button primary" disabled={working === "profile"} type="submit">حفظ البيانات</button></form></article>
          <article className="panel"><h2>صلاحيات دخول السائق</h2><p className="subtitle">هذه الصلاحيات لا تكفي وحدها؛ يجب وجود وثائق معتمدة وسارية حسب متطلبات الدولة.</p><div className="checkbox-list">{countries.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={driverRegionCodes.includes(region.code)} onChange={(e) => setDriverRegionCodes((current) => toggleCodes(current, region.code, e.target.checked))} />{region.nameAr}</label>)}</div><button className="button primary" disabled={working === "driver-regions"} type="button" onClick={() => void saveDriverRegions()}>حفظ الصلاحيات</button></article>
        </section>

        <DocumentSection title="وثائق السائق" documents={driver.documents} ownerId={driverId} kind="driver" onOpen={openDocument} onReview={reviewDocument} />
        <section className="panel"><h2>رفع وثيقة سائق</h2><form className="admin-form-grid" onSubmit={createDriverDocument}><DocumentFormFields form={driverDocForm} setForm={setDriverDocForm} countries={countries} /><div><span className="label">ملف الوثيقة</span><MediaUpload purpose="DRIVER_DOCUMENT" visibility="PRIVATE" label={driverDocAsset ? `تم الرفع: ${driverDocAsset.originalName}` : "اختيار الملف"} onUploaded={(asset) => setDriverDocAsset(asset)} /></div><button className="button primary" disabled={working === "driver-document"} type="submit">إضافة الوثيقة</button></form></section>

        <section className="section-heading fleet-section-heading"><div><h2>المركبات</h2><p className="subtitle">لكل مركبة مركز تشغيل وصلاحيات ووثائق وصور مستقلة.</p></div></section>
        {driver.vehicles.map((vehicle) => (
          <article className="panel vehicle-detail-card" key={vehicle.id}>
            <div className="section-heading"><div><div className="eyebrow">{vehicle.baseRegion?.nameAr ?? "بلا مركز"}</div><h2>{vehicle.make} {vehicle.model} — {vehicle.year}</h2><p className="subtitle">{vehicle.color} · {vehicle.plateNumber} · {vehicle.seatCapacity} مقاعد</p></div><StatusPill status={vehicle.isActive ? "ACTIVE" : "SUSPENDED"} label={vehicle.isActive ? "فعالة" : "متوقفة"} /></div>
            <div className="vehicle-gallery">
              {vehicle.images.filter((img) => img.isApproved).map((image) => (
                <div key={image.id} style={{ position: "relative" }}>
                  <img src={image.url} alt={`${vehicle.make} ${vehicle.model}`} />
                  <button
                    className="button danger compact-button"
                    style={{ position: "absolute", left: 8, bottom: 8 }}
                    disabled={working === `delete-image-${image.id}`}
                    type="button"
                    onClick={() => void deleteVehicleImage(vehicle.id, image)}
                  >
                    حذف
                  </button>
                </div>
              ))}
              {vehicle.images.filter((img) => img.isApproved).length === 0 ? <div className="vehicle-image-placeholder">لا توجد صور معتمدة</div> : null}
            </div>
            <div className="actions" style={{ alignItems: "flex-start" }}>
              <MediaUpload
                purpose="VEHICLE_IMAGE"
                visibility="PUBLIC"
                accept=".jpg,.jpeg,.png,.webp"
                label="رفع صور مع تغبيش اللوحة"
                multiple
                blurPlate
                plateNumber={vehicle.plateNumber}
                disabled={working === `vehicle-images-${vehicle.id}`}
                onUploadedMany={(assets) => attachVehicleImages(vehicle.id, assets)}
              />
              <MediaUpload
                purpose="VEHICLE_IMAGE"
                visibility="PUBLIC"
                accept=".jpg,.jpeg,.png,.webp"
                label="رفع صور بدون تغبيش"
                multiple
                blurPlate={false}
                plateNumber={vehicle.plateNumber}
                disabled={working === `vehicle-images-${vehicle.id}`}
                onUploadedMany={(assets) => attachVehicleImages(vehicle.id, assets)}
              />
            </div>
            <p className="subtitle">كلا الخيارين يضيفان شعار المنصة أعلى يسار الصورة. خيار التغبيش لا يغيّر أي جزء من الصورة إذا لم يطابق OCR رقم اللوحة المحفوظ بدقة.</p>
            <div className="two-column-layout compact-layout">
              <div><h3>صلاحيات المركبة</h3><div className="checkbox-list">{countries.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={(vehicleRegionCodes[vehicle.id] ?? []).includes(region.code)} onChange={(e) => setVehicleRegionCodes((current) => ({ ...current, [vehicle.id]: toggleCodes(current[vehicle.id] ?? [], region.code, e.target.checked) }))} />{region.nameAr}</label>)}</div><button className="button primary" disabled={working === `vehicle-regions-${vehicle.id}`} type="button" onClick={() => void saveVehicleRegions(vehicle.id)}>حفظ صلاحيات المركبة</button></div>
              <div><h3>رفع وثيقة للمركبة</h3><form className="stack-form" onSubmit={(event) => void createVehicleDocument(event, vehicle.id)}><DocumentFormFields form={vehicleDocForms[vehicle.id] ?? emptyDoc} setForm={(next) => setVehicleDocForms((current) => ({ ...current, [vehicle.id]: typeof next === "function" ? next(current[vehicle.id] ?? emptyDoc) : next }))} countries={countries} /><MediaUpload purpose="VEHICLE_DOCUMENT" visibility="PRIVATE" label={vehicleDocAssets[vehicle.id] ? `تم الرفع: ${vehicleDocAssets[vehicle.id]?.originalName}` : "اختيار ملف الوثيقة"} onUploaded={(asset) => setVehicleDocAssets((current) => ({ ...current, [vehicle.id]: asset }))} /><button className="button primary" disabled={working === `vehicle-document-${vehicle.id}`} type="submit">إضافة الوثيقة</button></form></div>
            </div>
            <DocumentSection title="وثائق المركبة" documents={vehicle.documents} ownerId={vehicle.id} kind="vehicle" onOpen={openDocument} onReview={reviewDocument} />
          </article>
        ))}

        <section className="panel"><h2>إضافة مركبة أخرى</h2><form className="admin-form-grid" onSubmit={addVehicle}><label><span className="label">الشركة</span><input className="input" value={newVehicle.make} onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })} required /></label><label><span className="label">الموديل</span><input className="input" value={newVehicle.model} onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })} required /></label><label><span className="label">السنة</span><input className="input" type="number" min={1990} max={2100} value={newVehicle.year} onChange={(e) => setNewVehicle({ ...newVehicle, year: Number(e.target.value) })} required /></label><label><span className="label">اللون</span><input className="input" value={newVehicle.color} onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })} required /></label><label><span className="label">اللوحة</span><input className="input" value={newVehicle.plateNumber} onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value })} required /></label><label><span className="label">المقاعد</span><input className="input" type="number" min={1} max={20} value={newVehicle.seatCapacity} onChange={(e) => setNewVehicle({ ...newVehicle, seatCapacity: Number(e.target.value) })} required /></label><label><span className="label">المركز</span><select className="input" value={newVehicle.baseRegionCode} onChange={(e) => setNewVehicle({ ...newVehicle, baseRegionCode: e.target.value })}>{hubs.map((hub) => <option key={hub.id} value={hub.code}>{hub.nameAr}</option>)}</select></label><fieldset className="checkbox-fieldset"><legend>الدول</legend>{countries.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={newVehicle.regionCodes.includes(region.code)} onChange={(e) => setNewVehicle({ ...newVehicle, regionCodes: toggleCodes(newVehicle.regionCodes, region.code, e.target.checked) })} />{region.nameAr}</label>)}</fieldset><button className="button primary full-width" disabled={working === "add-vehicle"} type="submit">إضافة المركبة</button></form></section>
      </Shell>
    </ProtectedRoute>
  );
}

type DocumentDraft = typeof emptyDoc;
type DocumentSetter = (value: DocumentDraft | ((current: DocumentDraft) => DocumentDraft)) => void;

function DocumentFormFields({ form, setForm, countries }: { form: DocumentDraft; setForm: DocumentSetter; countries: ServiceRegion[] }) {
  return <><label><span className="label">نوع الوثيقة</span><select className="input" value={form.documentType} onChange={(e) => setForm((current) => ({ ...current, documentType: e.target.value }))}>{DOCUMENT_TYPE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><label><span className="label">الدولة المرتبطة</span><select className="input" value={form.regionCode} onChange={(e) => setForm((current) => ({ ...current, regionCode: e.target.value }))}><option value="">وثيقة عامة</option>{countries.map((region) => <option key={region.id} value={region.code}>{region.nameAr}</option>)}</select></label><label><span className="label">رقم الوثيقة</span><input className="input" value={form.documentNumber} onChange={(e) => setForm((current) => ({ ...current, documentNumber: e.target.value }))} /></label><label><span className="label">تاريخ الإصدار</span><input className="input" type="date" value={form.issuedAt} onChange={(e) => setForm((current) => ({ ...current, issuedAt: e.target.value }))} /></label><label><span className="label">تاريخ الانتهاء</span><input className="input" type="date" value={form.expiresAt} onChange={(e) => setForm((current) => ({ ...current, expiresAt: e.target.value }))} /></label><label><span className="label">ملاحظات</span><input className="input" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label></>;
}

function DocumentSection({ title, documents, ownerId, kind, onOpen, onReview }: { title: string; documents: ComplianceDocument[]; ownerId: string; kind: "driver" | "vehicle"; onOpen: (document: ComplianceDocument) => Promise<void>; onReview: (kind: "driver" | "vehicle", ownerId: string, document: ComplianceDocument, action: "approve" | "reject") => Promise<void> }) {
  return <section className="panel nested-panel"><h3>{title}</h3>{documents.length === 0 ? <div className="empty-state">لا توجد وثائق.</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>الوثيقة</th><th>الدولة</th><th>الرقم</th><th>الانتهاء</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{documentTypeLabel(document.documentType)}</strong><small>{document.mediaAsset.originalName}</small></td><td>{document.region?.nameAr ?? "عامة"}</td><td>{document.documentNumber ?? "—"}</td><td>{document.expiresAt ? new Date(document.expiresAt).toLocaleDateString("ar") : "بلا انتهاء"}</td><td><StatusPill status={document.status} label={DOCUMENT_STATUS_LABELS[document.status]} /></td><td><div className="actions"><button className="button compact-button" type="button" onClick={() => void onOpen(document)}>فتح</button><button className="button primary compact-button" disabled={document.status === "APPROVED"} type="button" onClick={() => void onReview(kind, ownerId, document, "approve")}>اعتماد</button><button className="button danger compact-button" disabled={document.status === "REJECTED"} type="button" onClick={() => void onReview(kind, ownerId, document, "reject")}>رفض</button></div></td></tr>)}</tbody></table></div>}</section>;
}
