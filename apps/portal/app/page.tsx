import { DashboardHeader } from "@/components/dashboard-header";
import { Shell } from "@/components/shell";

export default function Home() {
  return (
    <Shell>
      <DashboardHeader
        eyebrow="Milestone 1"
        title="منصة نقل متعددة الأدوار"
        subtitle="مصادقة وصلاحيات ودورة رحلة فعلية بين الراكب والسائق والإدارة."
      />

      <section className="hero">
        <div>
          <div className="eyebrow" style={{ color: "#70e2b5" }}>
            SECURE TRIP FLOW
          </div>
          <h2>دورة رحلة قابلة للتجربة قبل إضافة الخرائط الحية.</h2>
          <p>
            يحسب الخادم السعر، يمنع الرحلات المتكررة، يخفي رمز البدء عن
            السائق، ويتحقق من الصلاحيات الحالية من قاعدة البيانات.
          </p>
          <a className="button primary" href="/login">
            تسجيل الدخول
          </a>
        </div>
        <div className="map-placeholder">
          <div className="pin" />
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="label">مصادقة</div>
          <div className="value">JWT</div>
        </div>
        <div className="card">
          <div className="label">حماية الصلاحيات</div>
          <div className="value">RBAC</div>
        </div>
        <div className="card">
          <div className="label">دورة الرحلة</div>
          <div className="value">كاملة</div>
        </div>
        <div className="card">
          <div className="label">التحديث الحالي</div>
          <div className="value">Polling</div>
        </div>
      </section>
    </Shell>
  );
}
