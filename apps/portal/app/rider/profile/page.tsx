"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { useAuth } from "@/components/auth-provider";

const preferenceKey = "ride_rider_preferences";

type RiderPreferences = {
  bookingUpdates: boolean;
  driverUpdates: boolean;
  serviceMessages: boolean;
};

const defaultPreferences: RiderPreferences = {
  bookingUpdates: true,
  driverUpdates: true,
  serviceMessages: false,
};

export default function RiderProfilePage() {
  const { user, logout, isRealtimeConnected } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [preferences, setPreferences] = useState<RiderPreferences>(defaultPreferences);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(preferenceKey);
      if (stored) setPreferences({ ...defaultPreferences, ...JSON.parse(stored) as Partial<RiderPreferences> });
    } catch {
      // Keep defaults when local preferences are invalid.
    } finally {
      setLoaded(true);
    }
  }, []);

  function updatePreference(key: keyof RiderPreferences) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  function savePreferences() {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    showToast("تم حفظ تفضيلات الإشعارات على هذا الجهاز.", "success");
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
                  <span><Icon name="shield" size={20} /></span>
                  <div><small>حالة الحساب</small><strong>نشط ومصرّح</strong></div>
                </div>
              </div>

              <div className="notice rider-profile-note">
                تعديل الاسم ورقم الهاتف وكلمة المرور سيضاف ضمن مرحلة إدارة الحسابات والأمان. بيانات الحجز الجديدة تُؤخذ من نموذج الحجز ويمكن تغييرها في كل مرة.
              </div>
            </section>

            <section className="panel rider-preferences-card">
              <div className="section-heading rider-section-heading">
                <div>
                  <span className="eyebrow">التنبيهات</span>
                  <h2>تفضيلات المتابعة</h2>
                  <p className="subtitle">تُحفظ هذه التفضيلات على المتصفح الحالي حتى ربط خدمة الإشعارات الخارجية.</p>
                </div>
              </div>

              <div className="rider-preference-list">
                <PreferenceRow
                  icon="bookings"
                  title="تحديثات الحجز"
                  description="التأكيد والرفض وتغيير حالة الحجز."
                  checked={preferences.bookingUpdates}
                  disabled={!loaded}
                  onChange={() => updatePreference("bookingUpdates")}
                />
                <PreferenceRow
                  icon="drivers"
                  title="تحديثات السائق"
                  description="تعيين السائق وقبوله وبيانات المركبة."
                  checked={preferences.driverUpdates}
                  disabled={!loaded}
                  onChange={() => updatePreference("driverUpdates")}
                />
                <PreferenceRow
                  icon="bell"
                  title="رسائل الخدمة"
                  description="إعلانات الخدمة والتحديثات العامة غير المرتبطة بحجز محدد."
                  checked={preferences.serviceMessages}
                  disabled={!loaded}
                  onChange={() => updatePreference("serviceMessages")}
                />
              </div>

              <div className="rider-preferences-actions">
                <button className="button primary" type="button" onClick={savePreferences} disabled={!loaded}>
                  <Icon name="check" size={18} /> حفظ التفضيلات
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

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: "bookings" | "drivers" | "bell";
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="rider-preference-row">
      <span className="rider-preference-icon"><Icon name={icon} size={21} /></span>
      <span className="rider-preference-copy"><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="rider-toggle" aria-hidden="true" />
    </label>
  );
}
