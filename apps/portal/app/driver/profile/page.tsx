"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { useDriverData } from "@/hooks/use-driver-data";
import { apiFetch } from "@/lib/api";
import { AuthUser } from "@/lib/types";

export default function DriverProfilePage() {
  const { user, refreshUser } = useAuth();
  const { profile, error, isLoading, reload } = useDriverData();
  const { showToast } = useToast();
  const [phone, setPhone] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [working, setWorking] = useState("");

  useEffect(() => {
    setPhone(user?.phone ?? "");
    setWhatsappOptIn(Boolean(user?.whatsappOptIn));
  }, [user?.phone, user?.whatsappOptIn]);

  async function setAvailability(availability: "ONLINE" | "OFFLINE") {
    setWorking(`availability:${availability}`);
    try {
      await apiFetch("/drivers/me/availability", {
        method: "PATCH",
        body: JSON.stringify({ availability }),
      });
      showToast(availability === "ONLINE" ? "أصبحت متصلًا." : "أصبحت غير متصل.", "success");
      await reload();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر تحديث حالة التوفر.", "error");
    } finally {
      setWorking("");
    }
  }

  async function saveWhatsApp() {
    setWorking("whatsapp");
    try {
      await apiFetch<AuthUser>("/auth/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ phone, whatsappOptIn }),
      });
      await refreshUser();
      showToast("تم حفظ إعدادات WhatsApp.", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر حفظ إعدادات WhatsApp.", "error");
    } finally {
      setWorking("");
    }
  }

  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / الحساب"
          title="الحساب والمركبة"
          subtitle="حالة التوفر وبيانات المركبة ورقم استقبال تحديثات WhatsApp."
          actions={<Link className="button" href="/driver"><Icon name="arrow-right" size={17} /> لوحة السائق</Link>}
        />

        {error ? <div className="notice error">{error}</div> : null}
        {isLoading ? <div className="panel empty-state">جارٍ تحميل الحساب...</div> : (
          <div className="two-column-layout driver-profile-layout">
            <main className="driver-profile-main">
              <section className="panel">
                <div className="section-heading"><div><span className="eyebrow">حالة العمل</span><h2>التوفر للتعيين</h2><p className="subtitle">اجعل حالتك متصلًا عندما تكون جاهزًا لاستلام مهام جديدة.</p></div><span className="status">{profile?.availability ?? "—"}</span></div>
                <div className="actions">
                  <button className="button primary" type="button" disabled={Boolean(working) || profile?.availability === "ONLINE" || profile?.availability === "ON_TRIP"} onClick={() => void setAvailability("ONLINE")}>متصل</button>
                  <button className="button" type="button" disabled={Boolean(working) || profile?.availability === "OFFLINE" || profile?.availability === "ON_TRIP"} onClick={() => void setAvailability("OFFLINE")}>غير متصل</button>
                </div>
              </section>

              <section className="panel">
                <div className="section-heading"><div><span className="eyebrow">الأسطول</span><h2>المركبات المسجلة</h2></div></div>
                {profile?.vehicles.length ? <div className="schedule-card-grid">{profile.vehicles.map((vehicle) => <article className="booking-card" key={vehicle.id}><div className="booking-card-head"><div><strong>{vehicle.make} {vehicle.model}</strong><small>{vehicle.year} · {vehicle.color}</small></div><span className="status">{vehicle.seatCapacity} أشخاص</span></div><div className="detail-list compact-detail-list"><div><span>رقم اللوحة</span><strong>{vehicle.plateNumber}</strong></div><div><span>السعة</span><strong>{vehicle.seatCapacity}</strong></div></div></article>)}</div> : <div className="empty-state">لا توجد مركبة مسجلة.</div>}
              </section>
            </main>

            <aside className="driver-profile-aside">
              <section className="panel rider-account-card">
                <div className="rider-account-avatar">{user?.firstName.slice(0, 1)}{user?.lastName.slice(0, 1)}</div>
                <div><small>حساب السائق</small><strong>{user?.firstName} {user?.lastName}</strong><span>{user?.email}</span></div>
                <span className="status">{profile?.status ?? "—"}</span>
              </section>

              <section className="panel rider-preferences-card">
                <span className="eyebrow">WhatsApp</span><h2>تحديثات المهام</h2><p className="subtitle">تصل التعيينات وتغييرات الرحلات التشغيلية إلى هذا الرقم.</p>
                <div className="rider-preference-list">
                  <label><span className="label">رقم الهاتف مع رمز الدولة</span><input className="input ltr-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+963944000000" /></label>
                  <label className="rider-preference-row"><span className="rider-preference-icon"><Icon name="bell" size={21} /></span><span className="rider-preference-copy"><strong>تفعيل رسائل WhatsApp</strong><small>إشعارات تشغيلية فقط.</small></span><input type="checkbox" checked={whatsappOptIn} onChange={(event) => setWhatsappOptIn(event.target.checked)} /><span className="rider-toggle" aria-hidden="true" /></label>
                </div>
                <button className="button primary full-width" type="button" disabled={Boolean(working)} onClick={() => void saveWhatsApp()}>{working === "whatsapp" ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</button>
              </section>
            </aside>
          </div>
        )}
      </Shell>
    </ProtectedRoute>
  );
}
