"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import {
  LOCATION_TYPE_LABELS,
  LocationType,
  REGION_KIND_LABELS,
  RegionKind,
  ROUTE_TYPE_LABELS,
  RouteType,
  ServiceLocation,
  ServiceRegion,
  ServiceRoute,
} from "@/lib/admin-operations";

const emptyRegion = {
  code: "",
  nameAr: "",
  nameEn: "",
  countryCode: "SY",
  kind: "COUNTRY_ACCESS" as RegionKind,
  isActive: true,
};

const emptyLocation = {
  code: "",
  nameAr: "",
  nameEn: "",
  type: "CITY" as LocationType,
  countryCode: "SY",
  city: "",
  governorate: "",
  latitude: "",
  longitude: "",
  isActive: true,
};

const emptyRoute = {
  code: "",
  nameAr: "",
  nameEn: "",
  originId: "",
  destinationId: "",
  routeType: "INTERCITY" as RouteType,
  requiresFlightDetails: false,
  estimatedMinutes: "",
  distanceKm: "",
  requiredRegionCodes: [] as string[],
  isActive: true,
};

type Tab = "routes" | "locations" | "regions";

export default function AdminRoutesPage() {
  const [tab, setTab] = useState<Tab>("routes");
  const [regions, setRegions] = useState<ServiceRegion[]>([]);
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [regionForm, setRegionForm] = useState(emptyRegion);
  const [locationForm, setLocationForm] = useState(emptyLocation);
  const [routeForm, setRouteForm] = useState(emptyRoute);
  const [editingRegionId, setEditingRegionId] = useState("");
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editingRouteId, setEditingRouteId] = useState("");
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [regionData, locationData, routeData] = await Promise.all([
        apiFetch<ServiceRegion[]>("/admin/regions"),
        apiFetch<ServiceLocation[]>("/admin/locations"),
        apiFetch<ServiceRoute[]>("/admin/routes"),
      ]);
      setRegions(regionData);
      setLocations(locationData);
      setRoutes(routeData);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل المواقع والمسارات.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const countryRegions = useMemo(
    () => regions.filter((region) => region.kind === "COUNTRY_ACCESS" && region.isActive),
    [regions]
  );

  const normalized = search.trim().toLowerCase();
  const filteredRoutes = routes.filter((route) =>
    !normalized || `${route.code} ${route.nameAr} ${route.origin.nameAr} ${route.destination.nameAr}`.toLowerCase().includes(normalized)
  );
  const filteredLocations = locations.filter((location) =>
    !normalized || `${location.code} ${location.nameAr} ${location.city ?? ""} ${location.governorate ?? ""}`.toLowerCase().includes(normalized)
  );
  const filteredRegions = regions.filter((region) =>
    !normalized || `${region.code} ${region.nameAr} ${region.countryCode}`.toLowerCase().includes(normalized)
  );

  function clearNotices() {
    setMessage("");
    setError("");
  }

  async function submitRegion(event: FormEvent) {
    event.preventDefault();
    clearNotices();
    setWorking("region");
    try {
      await apiFetch(editingRegionId ? `/admin/regions/${editingRegionId}` : "/admin/regions", {
        method: editingRegionId ? "PATCH" : "POST",
        body: JSON.stringify(regionForm),
      });
      setMessage(editingRegionId ? "تم تحديث المنطقة." : "تمت إضافة المنطقة.");
      setRegionForm(emptyRegion);
      setEditingRegionId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المنطقة.");
    } finally {
      setWorking("");
    }
  }

  async function submitLocation(event: FormEvent) {
    event.preventDefault();
    clearNotices();
    setWorking("location");
    try {
      const payload = {
        ...locationForm,
        latitude: locationForm.latitude === "" ? undefined : Number(locationForm.latitude),
        longitude: locationForm.longitude === "" ? undefined : Number(locationForm.longitude),
      };
      await apiFetch(editingLocationId ? `/admin/locations/${editingLocationId}` : "/admin/locations", {
        method: editingLocationId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(editingLocationId ? "تم تحديث الموقع." : "تمت إضافة الموقع.");
      setLocationForm(emptyLocation);
      setEditingLocationId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ الموقع.");
    } finally {
      setWorking("");
    }
  }

  async function submitRoute(event: FormEvent) {
    event.preventDefault();
    clearNotices();
    if (!routeForm.originId || !routeForm.destinationId) {
      setError("حدد نقطة الانطلاق والوصول.");
      return;
    }
    setWorking("route");
    try {
      const payload = {
        ...routeForm,
        estimatedMinutes: routeForm.estimatedMinutes === "" ? undefined : Number(routeForm.estimatedMinutes),
        distanceKm: routeForm.distanceKm === "" ? undefined : Number(routeForm.distanceKm),
      };
      await apiFetch(editingRouteId ? `/admin/routes/${editingRouteId}` : "/admin/routes", {
        method: editingRouteId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(editingRouteId ? "تم تحديث المسار." : "تم إنشاء المسار.");
      setRouteForm(emptyRoute);
      setEditingRouteId("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر حفظ المسار.");
    } finally {
      setWorking("");
    }
  }

  async function toggleRoute(route: ServiceRoute) {
    clearNotices();
    setWorking(route.id);
    try {
      await apiFetch(`/admin/routes/${route.id}/${route.isActive ? "deactivate" : "activate"}`, { method: "POST" });
      setMessage(route.isActive ? "تم إيقاف المسار." : "تم تفعيل المسار.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث حالة المسار.");
    } finally {
      setWorking("");
    }
  }

  function editRegion(region: ServiceRegion) {
    setTab("regions");
    setEditingRegionId(region.id);
    setRegionForm({
      code: region.code,
      nameAr: region.nameAr,
      nameEn: region.nameEn ?? "",
      countryCode: region.countryCode,
      kind: region.kind,
      isActive: region.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editLocation(location: ServiceLocation) {
    setTab("locations");
    setEditingLocationId(location.id);
    setLocationForm({
      code: location.code,
      nameAr: location.nameAr,
      nameEn: location.nameEn ?? "",
      type: location.type,
      countryCode: location.countryCode,
      city: location.city ?? "",
      governorate: location.governorate ?? "",
      latitude: location.latitude == null ? "" : String(location.latitude),
      longitude: location.longitude == null ? "" : String(location.longitude),
      isActive: location.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editRoute(route: ServiceRoute) {
    setTab("routes");
    setEditingRouteId(route.id);
    setRouteForm({
      code: route.code,
      nameAr: route.nameAr,
      nameEn: route.nameEn ?? "",
      originId: route.originId,
      destinationId: route.destinationId,
      routeType: route.routeType,
      requiresFlightDetails: route.requiresFlightDetails,
      estimatedMinutes: route.estimatedMinutes == null ? "" : String(route.estimatedMinutes),
      distanceKm: route.distanceKm == null ? "" : String(route.distanceKm),
      requiredRegionCodes: route.requiredRegions.map((item) => item.region.code),
      isActive: route.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="إدارة التشغيل"
          title="المواقع والمسارات"
          subtitle="إضافة المراكز والمدن والمطارات وإنشاء أي خط جديد دون تعديل الكود."
        />

        <div className="admin-tabs">
          <button className={tab === "routes" ? "is-active" : ""} onClick={() => setTab("routes")} type="button">المسارات</button>
          <button className={tab === "locations" ? "is-active" : ""} onClick={() => setTab("locations")} type="button">المواقع</button>
          <button className={tab === "regions" ? "is-active" : ""} onClick={() => setTab("regions")} type="button">مناطق التشغيل</button>
        </div>

        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {tab === "routes" ? (
          <>
            <section className="panel">
              <div className="section-heading"><div><h2>{editingRouteId ? "تعديل المسار" : "إضافة مسار جديد"}</h2><p className="subtitle">حدد الانطلاق والوصول والدول التي يجب أن يملك السائق والسيارة تصاريحها.</p></div></div>
              <form className="admin-form-grid" onSubmit={submitRoute}>
                <label><span className="label">رمز المسار</span><input className="input" value={routeForm.code} onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value.toUpperCase() })} placeholder="DAM-AMM" required /></label>
                <label><span className="label">الاسم العربي</span><input className="input" value={routeForm.nameAr} onChange={(e) => setRouteForm({ ...routeForm, nameAr: e.target.value })} placeholder="دمشق إلى عمّان" required /></label>
                <label><span className="label">الاسم الإنجليزي</span><input className="input" value={routeForm.nameEn} onChange={(e) => setRouteForm({ ...routeForm, nameEn: e.target.value })} /></label>
                <label><span className="label">نوع المسار</span><select className="input" value={routeForm.routeType} onChange={(e) => setRouteForm({ ...routeForm, routeType: e.target.value as RouteType })}>{Object.entries(ROUTE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span className="label">الانطلاق</span><select className="input" value={routeForm.originId} onChange={(e) => setRouteForm({ ...routeForm, originId: e.target.value })} required><option value="">اختر الموقع</option>{locations.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.nameAr} ({item.code})</option>)}</select></label>
                <label><span className="label">الوصول</span><select className="input" value={routeForm.destinationId} onChange={(e) => setRouteForm({ ...routeForm, destinationId: e.target.value })} required><option value="">اختر الموقع</option>{locations.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.nameAr} ({item.code})</option>)}</select></label>
                <label><span className="label">المدة التقديرية بالدقائق</span><input className="input" type="number" min="1" value={routeForm.estimatedMinutes} onChange={(e) => setRouteForm({ ...routeForm, estimatedMinutes: e.target.value })} /></label>
                <label><span className="label">المسافة التقديرية كم</span><input className="input" type="number" min="0" step="0.1" value={routeForm.distanceKm} onChange={(e) => setRouteForm({ ...routeForm, distanceKm: e.target.value })} /></label>
                <fieldset className="checkbox-fieldset full-width"><legend>الدول المطلوبة</legend>{countryRegions.map((region) => <label className="checkbox-row" key={region.id}><input type="checkbox" checked={routeForm.requiredRegionCodes.includes(region.code)} onChange={(e) => setRouteForm((current) => ({ ...current, requiredRegionCodes: e.target.checked ? [...current.requiredRegionCodes, region.code] : current.requiredRegionCodes.filter((code) => code !== region.code) }))} />{region.nameAr}</label>)}</fieldset>
                <label className="checkbox-row"><input type="checkbox" checked={routeForm.requiresFlightDetails} onChange={(e) => setRouteForm({ ...routeForm, requiresFlightDetails: e.target.checked })} />يتطلب بيانات الطائرة</label>
                <label className="checkbox-row"><input type="checkbox" checked={routeForm.isActive} onChange={(e) => setRouteForm({ ...routeForm, isActive: e.target.checked })} />مسار فعال</label>
                <div className="actions full-width"><button className="button primary" disabled={working === "route"} type="submit">{editingRouteId ? "حفظ التعديلات" : "إنشاء المسار"}</button>{editingRouteId ? <button className="button" type="button" onClick={() => { setEditingRouteId(""); setRouteForm(emptyRoute); }}>إلغاء التعديل</button> : null}</div>
              </form>
            </section>

            <section className="panel filters"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالرمز أو اسم المسار" /><button className="button" type="button" onClick={() => void load()}>تحديث</button></section>
            <section className="operations-card-grid">
              {filteredRoutes.map((route) => (
                <article className="panel route-admin-card" key={route.id}>
                  <div className="section-heading"><div><div className="eyebrow">{route.code}</div><h2>{route.nameAr}</h2><p className="subtitle">{route.origin.nameAr} ← {route.destination.nameAr}</p></div><StatusPill status={route.isActive ? "ACTIVE" : "SUSPENDED"} label={route.isActive ? "فعال" : "متوقف"} /></div>
                  <div className="booking-meta"><span>{ROUTE_TYPE_LABELS[route.routeType]}</span><span>{route.estimatedMinutes ? `${route.estimatedMinutes} دقيقة` : "مدة غير محددة"}</span><span>{route.distanceKm ? `${route.distanceKm} كم` : "مسافة غير محددة"}</span><span>{route.requiresFlightDetails ? "يتطلب بيانات طائرة" : "لا يتطلب بيانات طائرة"}</span></div>
                  <div className="tag-list">{route.requiredRegions.map((item) => <span key={item.region.id}>{item.region.nameAr}</span>)}</div>
                  <div className="route-price-summary"><strong>{route.bookable ? "قابل للحجز" : "لا توجد أسعار فعالة"}</strong><span>{route.pricingRules.length} قاعدة سعر</span></div>
                  <div className="actions"><button className="button" type="button" onClick={() => editRoute(route)}>تعديل</button><button className={route.isActive ? "button danger" : "button primary"} disabled={working === route.id} type="button" onClick={() => void toggleRoute(route)}>{route.isActive ? "إيقاف" : "تفعيل"}</button></div>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {tab === "locations" ? (
          <>
            <section className="panel"><h2>{editingLocationId ? "تعديل الموقع" : "إضافة موقع"}</h2><form className="admin-form-grid" onSubmit={submitLocation}>
              <label><span className="label">الرمز</span><input className="input" value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value.toUpperCase() })} required /></label>
              <label><span className="label">الاسم العربي</span><input className="input" value={locationForm.nameAr} onChange={(e) => setLocationForm({ ...locationForm, nameAr: e.target.value })} required /></label>
              <label><span className="label">الاسم الإنجليزي</span><input className="input" value={locationForm.nameEn} onChange={(e) => setLocationForm({ ...locationForm, nameEn: e.target.value })} /></label>
              <label><span className="label">النوع</span><select className="input" value={locationForm.type} onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value as LocationType })}>{Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span className="label">رمز الدولة</span><input className="input" maxLength={2} value={locationForm.countryCode} onChange={(e) => setLocationForm({ ...locationForm, countryCode: e.target.value.toUpperCase() })} required /></label>
              <label><span className="label">المدينة</span><input className="input" value={locationForm.city} onChange={(e) => setLocationForm({ ...locationForm, city: e.target.value })} /></label>
              <label><span className="label">المحافظة</span><input className="input" value={locationForm.governorate} onChange={(e) => setLocationForm({ ...locationForm, governorate: e.target.value })} /></label>
              <label><span className="label">خط العرض</span><input className="input" type="number" step="any" value={locationForm.latitude} onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })} /></label>
              <label><span className="label">خط الطول</span><input className="input" type="number" step="any" value={locationForm.longitude} onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })} /></label>
              <label className="checkbox-row"><input type="checkbox" checked={locationForm.isActive} onChange={(e) => setLocationForm({ ...locationForm, isActive: e.target.checked })} />موقع فعال</label>
              <div className="actions full-width"><button className="button primary" type="submit" disabled={working === "location"}>{editingLocationId ? "حفظ" : "إضافة"}</button>{editingLocationId ? <button className="button" type="button" onClick={() => { setEditingLocationId(""); setLocationForm(emptyLocation); }}>إلغاء</button> : null}</div>
            </form></section>
            <section className="panel filters"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في المواقع" /></section>
            <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>الموقع</th><th>النوع</th><th>الدولة</th><th>الإحداثيات</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{filteredLocations.map((location) => <tr key={location.id}><td><strong>{location.nameAr}</strong><small>{location.code}</small></td><td>{LOCATION_TYPE_LABELS[location.type]}</td><td>{location.countryCode}</td><td>{location.latitude ?? "—"}, {location.longitude ?? "—"}</td><td><StatusPill status={location.isActive ? "ACTIVE" : "SUSPENDED"} label={location.isActive ? "فعال" : "متوقف"} /></td><td><button className="button compact-button" type="button" onClick={() => editLocation(location)}>تعديل</button></td></tr>)}</tbody></table></div></section>
          </>
        ) : null}

        {tab === "regions" ? (
          <>
            <section className="panel"><h2>{editingRegionId ? "تعديل منطقة التشغيل" : "إضافة منطقة تشغيل"}</h2><form className="admin-form-grid" onSubmit={submitRegion}>
              <label><span className="label">الرمز</span><input className="input" value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value.toUpperCase() })} required /></label>
              <label><span className="label">الاسم العربي</span><input className="input" value={regionForm.nameAr} onChange={(e) => setRegionForm({ ...regionForm, nameAr: e.target.value })} required /></label>
              <label><span className="label">الاسم الإنجليزي</span><input className="input" value={regionForm.nameEn} onChange={(e) => setRegionForm({ ...regionForm, nameEn: e.target.value })} /></label>
              <label><span className="label">رمز الدولة</span><input className="input" maxLength={2} value={regionForm.countryCode} onChange={(e) => setRegionForm({ ...regionForm, countryCode: e.target.value.toUpperCase() })} required /></label>
              <label><span className="label">النوع</span><select className="input" value={regionForm.kind} onChange={(e) => setRegionForm({ ...regionForm, kind: e.target.value as RegionKind })}>{Object.entries(REGION_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="checkbox-row"><input type="checkbox" checked={regionForm.isActive} onChange={(e) => setRegionForm({ ...regionForm, isActive: e.target.checked })} />منطقة فعالة</label>
              <div className="actions full-width"><button className="button primary" type="submit" disabled={working === "region"}>{editingRegionId ? "حفظ" : "إضافة"}</button>{editingRegionId ? <button className="button" type="button" onClick={() => { setEditingRegionId(""); setRegionForm(emptyRegion); }}>إلغاء</button> : null}</div>
            </form></section>
            <section className="panel filters"><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في مناطق التشغيل" /></section>
            <section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>المنطقة</th><th>النوع</th><th>الدولة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{filteredRegions.map((region) => <tr key={region.id}><td><strong>{region.nameAr}</strong><small>{region.code}</small></td><td>{REGION_KIND_LABELS[region.kind]}</td><td>{region.countryCode}</td><td><StatusPill status={region.isActive ? "ACTIVE" : "SUSPENDED"} label={region.isActive ? "فعال" : "متوقف"} /></td><td><button className="button compact-button" type="button" onClick={() => editRegion(region)}>تعديل</button></td></tr>)}</tbody></table></div></section>
          </>
        ) : null}
      </Shell>
    </ProtectedRoute>
  );
}
