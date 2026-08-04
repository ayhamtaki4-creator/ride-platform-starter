"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { AuthUser } from "@/lib/types";

export default function RiderProfilePage() {
  const { user, logout, isRealtimeConnected, refreshUser } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhone(user?.phone ?? "");
    setWhatsappOptIn(Boolean(user?.whatsappOptIn));
  }, [user?.phone, user?.whatsappOptIn]);

  async function savePreferences() {
    setSaving(true);
    try {
      await apiFetch<AuthUser>("/auth/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ phone, whatsappOptIn }),
      });
      await refreshUser();
      showToast("تم حفظ رقم الهاتف وإعدادات WhatsApp.", "success");
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر حفظ الإعدادات.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / الملف الشخصي"
          title="إعدادات الحساب"
          subtitle="راجع بيانات حسابك واضبط تفضيلات المتابعة والإشعارات."
        />

        <div className="rider-profile-layout">
          <main className="rider-profile-main">
            <section className="panel rider-profile-card">
              <div className="rider-profile-heading">
                <div className="rider-profile-avatar-large">
                  {user?.firstName.slice(0, 1)}{user?.lastName.slice(0, 1)}
                </div>
                <div>
                  <span className="eyebrow">حساب مسافر</span>
                  <h2>{user?.firstName} {user?.lastName}</h2>
                  <p>{user?.email}</p>
                </div>
              </div>

              <div className="rider-profile-info-grid">
                <div>
                  <span><Icon name="user" size={20} /></span>
                  <div><small>الاسم الكامل</small><strong>{user?.firstName} {user?.lastName}</strong></div>
                </div>
                <div>
                  <span><Icon name="bookings" size={20} /></span>
                  <div><small>نوع الحساب</small><strong>مسافر</strong></div>
                </div>
                <div>
                  <span><Icon name="login" size={20} /></span>
                  <div><small>البريد الإلكتروني</small><strong className="ltr-text">{user?.email}</strong></div>
                </div>
                <div>
                  <span><Icon name="phone" size={20} /></span>
                  <div><small>رقم WhatsApp</small><strong className="ltr-text">{user?.phone || "غير مضاف"}</strong></div>
                </div>
              </div>

              <div className="notice rider-profile-note">
                بيانات الاتصال هنا تخص الحساب والإشعارات. ويمكن استخدام رقم تواصل مختلف داخل حجز معين عند الحاجة.
              </div>
            </section>

            <section className="panel rider-preferences-card">
              <div className="section-heading rider-section-heading">
                <div>
                  <span className="eyebrow">التنبيهات</span>
                  <h2>تحديثات WhatsApp</h2>
                  <p className="subtitle">تصل حالات التأكيد وتعيين السائق وبدء الرحلة وإنهائها إلى الرقم المسجل.</p>
                </div>
              </div>

              <div className="rider-preference-list">
                <label>
                  <span className="label">رقم الهاتف مع رمز الدولة</span>
                  <input className="input ltr-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+963944000000" />
                </label>
                <label className="rider-preference-row">
                  <span className="rider-preference-icon"><Icon name="bell" size={21} /></span>
                  <span className="rider-preference-copy"><strong>إرسال آخر تطورات الحجوزات عبر WhatsApp</strong><small>يمكنك إيقافها في أي وقت مع استمرار الإشعارات داخل المنصة.</small></span>
                  <input type="checkbox" checked={whatsappOptIn} onChange={(event) => setWhatsappOptIn(event.target.checked)} />
                  <span className="rider-toggle" aria-hidden="true" />
                </label>
              </div>

              <div className="rider-preferences-actions">
                <button className="button primary" type="button" onClick={() => void savePreferences()} disabled={saving}>
                  <Icon name="check" size={18} /> {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
                </button>
              </div>
            </section>
          </main>

          <aside className="rider-profile-aside">
            <section className="panel rider-account-status-card">
              <span className={`rider-connection-orb ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
                <Icon name="wifi" size={25} />
              </span>
              <h2>{isRealtimeConnected ? "الاتصال المباشر فعّال" : "وضع الاتصال الاحتياطي"}</h2>
              <p>{isRealtimeConnected ? "تصل تحديثات الرحلات إلى هذه الجلسة فورًا." : "ستستمر الصفحة في التحقق من التحديثات بصورة دورية."}</p>
            </section>

            <section className="panel rider-security-card">
              <span className="eyebrow">الأمان</span>
              <h2>الجلسة الحالية</h2>
              <p>استخدم تسجيل الخروج عند استخدام جهاز مشترك أو عام.</p>
              <button className="button danger" type="button" onClick={handleLogout}>
                <Icon name="logout" size={18} /> تسجيل الخروج
              </button>
            </section>

            <section className="panel rider-support-panel">
              <span className="rider-quick-icon"><Icon name="phone" size={24} /></span>
              <h2>الدعم والمساعدة</h2>
              <p>للاستفسار عن حجز قائم، جهّز رقم الحجز قبل التواصل.</p>
              <a className="button" href="tel:+96100000000">الاتصال بمركز العمليات</a>
            </section>
          </aside>
        </div>
      </Shell>
    </ProtectedRoute>
  );
}
