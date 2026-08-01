import { DashboardHeader } from '@/components/dashboard-header';
import { Shell } from '@/components/shell';

export default function RiderPage() {
  return (
    <Shell>
      <DashboardHeader
        eyebrow="تجربة الراكب"
        title="إلى أين تريد الذهاب؟"
        subtitle="واجهة أولية لتدفق إنشاء الرحلة ومتابعتها."
      />
      <section className="hero">
        <div>
          <h2>اطلب رحلة خلال خطوات واضحة</h2>
          <p>حدّد نقطة الانطلاق والوجهة، شاهد السعر التقديري، ثم أرسل الطلب إلى السائقين القريبين.</p>
          <button className="button primary">إنشاء رحلة</button>
        </div>
        <div className="map-placeholder"><div className="pin" /></div>
      </section>
      <section className="panel">
        <h2>دورة الطلب</h2>
        <div className="steps">
          {['تحديد الموقع والوجهة', 'احتساب السعر التقديري', 'البحث عن سائق', 'متابعة الرحلة', 'التقييم والفاتورة'].map((text, index) => (
            <div className="step" key={text}>
              <div className="step-number">{index + 1}</div>
              <strong>{text}</strong>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
