import { DashboardHeader } from '@/components/dashboard-header';
import { Shell } from '@/components/shell';

export default function Home() {
  return (
    <Shell>
      <DashboardHeader
        eyebrow="النواة البرمجية الأولى"
        title="منصة نقل متعددة الطبقات"
        subtitle="واجهة موحدة للتجربة، مع API وصلاحيات ودورة رحلة قابلة للتوسع."
      />

      <section className="hero">
        <div>
          <div className="eyebrow" style={{ color: '#70e2b5' }}>MVP FOUNDATION</div>
          <h2>ابدأ بالأساس الصحيح، ثم أضف الخرائط والدفع والتتبع.</h2>
          <p>
            هذه النسخة تفصل الواجهة عن الخادم وقاعدة البيانات. الصلاحيات لا تعتمد على
            إخفاء الأزرار فقط، بل تُفحص داخل API لكل عملية محمية.
          </p>
          <a className="button primary" href="/login">تجربة تسجيل الدخول</a>
        </div>
        <div className="map-placeholder"><div className="pin" /></div>
      </section>

      <section className="grid">
        <div className="card"><div className="label">الأدوار الأولية</div><div className="value">7</div></div>
        <div className="card"><div className="label">الصلاحيات الأولية</div><div className="value">13</div></div>
        <div className="card"><div className="label">حالات الرحلة</div><div className="value">11</div></div>
        <div className="card"><div className="label">واجهات المنصة</div><div className="value">3</div></div>
      </section>
    </Shell>
  );
}
