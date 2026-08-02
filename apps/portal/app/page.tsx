import Link from "next/link";
import { BookingForm } from "@/components/booking-form";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";

const steps = [
  { icon: "bookings" as const, number: "01", title: "أرسل طلبك", text: "اختر اتجاه الرحلة ونوع الحجز وأدخل بيانات الموعد والمسافرين." },
  { icon: "shield" as const, number: "02", title: "مراجعة الإدارة", text: "يراجع مركز العمليات الحجز ويثبت السعر ثم يعيّن السائق المناسب." },
  { icon: "car" as const, number: "03", title: "انطلق بأمان", text: "تصل إليك بيانات السائق والمركبة وتتابع حالة رحلتك حتى الوصول." },
];

const benefits = [
  { icon: "shield" as const, title: "سائقون معتمدون", text: "تدقيق بيانات السائقين والمركبات ومتابعة مستمرة من مركز العمليات." },
  { icon: "pricing" as const, title: "سعر واضح وموحّد", text: "تعرف قيمة الحجز قبل الإرسال، من دون مساومة أو رسوم مفاجئة." },
  { icon: "clock" as const, title: "تنظيم حسب موعدك", text: "رحلات مجدولة تراعي وقت الطائرة وعدد الركاب والحقائب." },
  { icon: "wifi" as const, title: "متابعة مباشرة", text: "تحديثات فورية لحالة الحجز وتعيين السائق وتنفيذ الرحلة." },
];

const faqs = [
  ["كيف يتم تحديد السعر؟", "تعتمد الإدارة سعرًا مستقلًا لكل مسار ونوع حجز، ويظهر السعر النهائي قبل إرسال الطلب."],
  ["هل يمكن حجز مقعد واحد؟", "نعم، يمكنك اختيار مقعد في سيارة مشتركة أو حجز سيارة خاصة بالكامل."],
  ["ماذا يحدث عند تأخر الطائرة؟", "أدخل رقم الرحلة ووقت الوصول ضمن الحجز ليتمكن مركز العمليات من متابعة الموعد وتنسيق الاستلام."],
  ["متى تظهر بيانات السائق؟", "تظهر بيانات السائق والمركبة بعد مراجعة الإدارة وتأكيد التعيين وقبول السائق للمهمة."],
];

export default function Home() {
  return (
    <Shell>
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="hero-kicker"><span><Icon name="sparkles" size={17} /></span>شبكة نقل منظمة بين سوريا ولبنان والأردن</div>
          <h1>رحلتك بين <em>دمشق وبيروت وعمّان</em> تبدأ بخطوات واضحة وآمنة</h1>
          <p>اختر أي خط متاح، واحجز مقعدك أو سيارتك الخاصة مع سعر واضح وسائق ومركبة مؤهلين للدول المطلوبة.</p>
          <div className="hero-actions">
            <a className="button primary button-lg" href="#booking">احجز رحلتك الآن <Icon name="arrow-left" size={19} /></a>
            <a className="button button-lg button-ghost" href="#how-it-works"><Icon name="play" size={19} />كيف تعمل الخدمة؟</a>
          </div>
          <div className="hero-trust-row">
            <span><Icon name="check" size={16} />سعر موحّد</span>
            <span><Icon name="check" size={16} />سائقون معتمدون</span>
            <span><Icon name="check" size={16} />دعم ومتابعة</span>
          </div>
        </div>

        <div className="hero-route-card" aria-label="شبكة خطوط الخدمة بين دمشق وبيروت وعمّان">
          <div className="route-card-top">
            <span className="route-card-label">شبكة الخطوط</span>
            <span className="route-card-live"><i />مسارات ديناميكية</span>
          </div>
          <div className="city-stop">
            <span className="city-code">DAM</span>
            <div><strong>دمشق ومطار دمشق</strong><small>مركز تشغيل وخطوط المحافظات</small></div>
            <Icon name="map-pin" size={22} />
          </div>
          <div className="route-progress"><span /><i><Icon name="car" size={20} /></i><span /></div>
          <div className="city-stop">
            <span className="city-code city-code-alt">BEY·AMM</span>
            <div><strong>بيروت وعمّان</strong><small>سيارات وسائقون بتصاريح كل دولة</small></div>
            <Icon name="plane" size={22} />
          </div>
          <div className="route-card-stats">
            <div><strong>24/7</strong><span>متابعة العمليات</span></div>
            <div><strong>3</strong><span>مراكز تشغيل</span></div>
            <div><strong>100%</strong><span>سعر واضح</span></div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="مزايا سريعة">
        <div><Icon name="shield" size={23} /><span><strong>أمان أولًا</strong><small>مركبات وسائقون معتمدون</small></span></div>
        <div><Icon name="clock" size={23} /><span><strong>التزام بالمواعيد</strong><small>تنسيق مع موعد الطائرة</small></span></div>
        <div><Icon name="phone" size={23} /><span><strong>دعم مباشر</strong><small>متابعة قبل وأثناء الرحلة</small></span></div>
        <div><Icon name="pricing" size={23} /><span><strong>أسعار موحّدة</strong><small>لا رسوم غير واضحة</small></span></div>
      </section>

      <section id="booking" className="booking-section-v2">
        <div className="section-intro centered-intro">
          <div className="eyebrow-v2">ابدأ الآن</div>
          <h2>احجز رحلتك خلال دقائق</h2>
          <p>اتبع الخطوات، راجع بياناتك والسعر، ثم أرسل الطلب مباشرة إلى مركز العمليات.</p>
        </div>
        <BookingForm />
      </section>

      <section id="how-it-works" className="content-section how-section-v2">
        <div className="section-intro">
          <div className="eyebrow-v2">طريقة العمل</div>
          <h2>من الحجز إلى الوصول بثلاث مراحل</h2>
          <p>صممنا رحلة المستخدم لتكون بسيطة، بينما يتولى فريق العمليات التنسيق والتعيين والمتابعة.</p>
        </div>
        <div className="steps-grid-v2">
          {steps.map((step) => (
            <article className="step-card-v2" key={step.number}>
              <div className="step-card-head"><span className="step-icon"><Icon name={step.icon} size={24} /></span><span className="step-count">{step.number}</span></div>
              <h3>{step.title}</h3><p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="services" className="content-section services-section-v2">
        <div className="service-copy">
          <div className="eyebrow-v2 light-eyebrow">خيارات تناسب رحلتك</div>
          <h2>مقعد مشترك أو سيارة خاصة</h2>
          <p>اختر الخدمة الأنسب لعدد الركاب والخصوصية المطلوبة، مع الاحتفاظ بنفس مستوى المتابعة والأمان.</p>
          <ul className="service-checklist">
            <li><Icon name="check" size={18} />تحديد عدد الركاب والحقائب مسبقًا</li>
            <li><Icon name="check" size={18} />مراعاة موعد وصول أو إقلاع الطائرة</li>
            <li><Icon name="check" size={18} />عرض السعر قبل إرسال الحجز</li>
          </ul>
          <a className="button light-button" href="#booking">اختيار نوع الحجز <Icon name="arrow-left" size={18} /></a>
        </div>
        <div className="service-cards">
          <article><span><Icon name="users" size={25} /></span><div><small>الخيار الاقتصادي</small><h3>مقعد مشترك</h3><p>احجز عدد المقاعد المطلوبة ضمن رحلة منظمة مع مسافرين آخرين في الاتجاه نفسه.</p></div></article>
          <article><span><Icon name="car" size={25} /></span><div><small>خصوصية ومرونة</small><h3>سيارة خاصة</h3><p>مركبة مخصصة لك ولمرافقيك مع تنسيق مباشر لنقطة الاستلام والوجهة.</p></div></article>
        </div>
      </section>

      <section className="content-section benefits-section-v2">
        <div className="section-intro centered-intro"><div className="eyebrow-v2">لماذا طريق الشام؟</div><h2>تجربة واضحة من البداية إلى النهاية</h2><p>كل تفصيل مهم ظاهر للمسافر، وكل إجراء تشغيلي موثق لدى الإدارة.</p></div>
        <div className="benefits-grid-v2">
          {benefits.map((benefit) => <article key={benefit.title}><span><Icon name={benefit.icon} size={24} /></span><h3>{benefit.title}</h3><p>{benefit.text}</p></article>)}
        </div>
      </section>

      <section id="faq" className="content-section faq-section-v2">
        <div className="section-intro"><div className="eyebrow-v2">الأسئلة الشائعة</div><h2>إجابات سريعة قبل الحجز</h2><p>أهم المعلومات التي يحتاجها المسافر لتجهيز طلبه بصورة صحيحة.</p></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<Icon name="chevron-down" size={19} /></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="home-cta">
        <div><div className="eyebrow-v2 light-eyebrow">جاهز للانطلاق؟</div><h2>أرسل حجزك وسيتولى مركز العمليات الباقي</h2><p>احتفظ برقم الحجز لمتابعة التأكيد والسائق وتفاصيل الرحلة.</p></div>
        <div><a className="button light-button button-lg" href="#booking">احجز الآن <Icon name="arrow-left" size={19} /></a><Link className="button cta-outline button-lg" href="/login">متابعة حجوزاتي</Link></div>
      </section>
    </Shell>
  );
}
