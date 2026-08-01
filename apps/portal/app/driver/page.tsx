import { DashboardHeader } from '@/components/dashboard-header';
import { Shell } from '@/components/shell';

export default function DriverPage() {
  return (
    <Shell>
      <DashboardHeader
        eyebrow="تجربة السائق"
        title="جاهز لاستقبال الرحلات"
        subtitle="النسخة التالية ستربط حالة الاتصال والموقع المباشر عبر WebSocket."
      />
      <section className="grid">
        <div className="card"><div className="label">الحالة</div><div className="value">متصل</div></div>
        <div className="card"><div className="label">رحلات اليوم</div><div className="value">8</div></div>
        <div className="card"><div className="label">التقييم</div><div className="value">4.9</div></div>
        <div className="card"><div className="label">أرباح اليوم</div><div className="value">94,000 د.ع</div></div>
      </section>
      <section className="panel">
        <h2>طلب قريب</h2>
        <div className="step">
          <div className="step-number">3</div>
          <div>
            <strong>3 دقائق إلى نقطة الالتقاط</strong>
            <div className="subtitle">شارع فلسطين ← المنصور</div>
          </div>
          <button className="button primary" style={{ marginInlineStart: 'auto' }}>قبول</button>
        </div>
      </section>
    </Shell>
  );
}
