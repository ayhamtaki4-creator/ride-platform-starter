import { DashboardHeader } from '@/components/dashboard-header';
import { Shell } from '@/components/shell';

export default function AdminPage() {
  return (
    <Shell>
      <DashboardHeader
        eyebrow="لوحة الإدارة"
        title="مركز العمليات"
        subtitle="مؤشرات أولية يمكن ربطها لاحقًا ببيانات الرحلات الحقيقية."
      />
      <section className="grid">
        <div className="card"><div className="label">رحلات نشطة</div><div className="value">128</div></div>
        <div className="card"><div className="label">سائقون متصلون</div><div className="value">342</div></div>
        <div className="card"><div className="label">متوسط الانتظار</div><div className="value">4.2 د</div></div>
        <div className="card"><div className="label">إيراد اليوم</div><div className="value">18.6 م د.ع</div></div>
      </section>
      <section className="panel">
        <h2>نظام الصلاحيات</h2>
        <div className="steps">
          {[
            'موظف الدعم يشاهد الشكاوى والرحلات دون تعديل التسعير.',
            'المدير المالي يدير الاستردادات دون تعليق السائقين.',
            'مدير العمليات يراجع السائقين والمناطق والتسعير.',
            'كل عملية حساسة تُسجل في Audit Log.'
          ].map((text, index) => (
            <div className="step" key={text}>
              <div className="step-number">{index + 1}</div>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
