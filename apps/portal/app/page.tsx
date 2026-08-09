import Link from "next/link";
import { HomeVehicleShowcase } from "@/components/home-vehicle-showcase";
import { Shell } from "@/components/shell";
import { Icon, type IconName } from "@/components/ui/icon";

const steps = [
  { icon: "route" as const, number: "01", title: "اختر خط الرحلة", text: "اختر المسار المتاح، موعد الرحلة، وحجم السيارة المناسب لعدد الركاب والحقائب." },
  { icon: "shield" as const, number: "02", title: "مراجعة مركز العمليات", text: "تراجع الإدارة الطلب والسعر وتتحقق من المسار ثم تعيّن السائق والمركبة المؤهلين." },
  { icon: "car" as const, number: "03", title: "انطلق وتابع رحلتك", text: "تصل إليك بيانات السائق والمركبة وتتابع حالة الرحلة وموقعها حتى الوصول." },
];

const serviceRoutes = [
  { icon: "plane" as const, title: "دمشق ↔ مطار بيروت", text: "نقل خاص ذهابًا وإيابًا بين دمشق ومطار رفيق الحريري الدولي مع تنسيق موعد الطائرة." },
  { icon: "plane" as const, title: "دمشق ↔ مطار الملكة علياء", text: "رحلات خاصة بين دمشق ومطار الملكة علياء في الأردن ضمن مسارات وسائقين مؤهلين للدول المطلوبة." },
  { icon: "map-pin" as const, title: "مطار دمشق ↔ المحافظات", text: "خدمة نقل خاصة بين مطار دمشق والمحافظات السورية المتاحة ضمن شبكة المنصة." },
];

const features: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "wifi", title: "إنترنت طوال الطريق", text: "إمكانية اتصال بالإنترنت أثناء الرحلة لتبقى على تواصل وتنجز ما تحتاجه خلال الطريق." },
  { icon: "car", title: "سيارات حديثة ومكيفة", text: "مركبات مريحة ومجهزة للرحلات الطويلة مع تكييف ونظافة وتجهيز قبل الانطلاق." },
  { icon: "shield", title: "سائقون ومركبات معتمدون", text: "الإدارة تراجع بيانات السائق والمركبة والوثائق والتصاريح المطلوبة قبل التشغيل." },
  { icon: "pricing", title: "سعر واضح قبل الإرسال", text: "يظهر سعر فئة السيارة قبل تأكيد طلب الحجز، بدون مفاجآت أو تفاوض عشوائي على الطريق." },
  { icon: "luggage", title: "اختيار حسب الركاب والحقائب", text: "فئات سيارات متعددة بسعات تحددها الإدارة لتناسب عدد المسافرين والحقائب." },
  { icon: "plane", title: "تنسيق مع موعد الطائرة", text: "إدخال رقم الرحلة ووقت الوصول أو الإقلاع، مع إمكانية إرفاق تذكرة الطيران في المسارات التي تفعلها الإدارة." },
  { icon: "map-pin", title: "تتبع الرحلة على الخريطة", text: "متابعة مسار الرحلة وموقع السائق أثناء التنفيذ ضمن نظام التتبع المباشر." },
  { icon: "users", title: "مشاركة التتبع مع العائلة", text: "يمكن للمسافر مشاركة رابط متابعة الرحلة مع أحد أفراد عائلته للاطمئنان على سير الرحلة." },
  { icon: "bell", title: "إشعارات على الهاتف", text: "إشعارات Web Push لتحديثات الحجز مثل التأكيد وتعيين السائق وبدء الرحلة والتغييرات المهمة." },
  { icon: "clock", title: "متابعة مركز العمليات", text: "متابعة تشغيلية للحجز والسائق والمسار، مع إدارة التعيين والتعديلات من لوحة تحكم مركزية." },
  { icon: "phone", title: "دعم مباشر", text: "قناة تواصل ومتابعة للحجز قبل الرحلة وأثناءها عند الحاجة." },
  { icon: "route", title: "مسار منظم وقابل للإدارة", text: "يمكن للإدارة تجهيز مسار الرحلة ومراجعته قبل تسليمه للسائق، مع ضبط نقاط الانطلاق والوصول حسب سياسة الخط." },
];

const faqs = [
  ["هل الحجز لسيارة خاصة؟", "نعم، الحجز العام في المنصة مخصص للسيارة الخاصة، وتختار الفئة المناسبة لعدد الركاب والحقائب."],
  ["كيف يتم تحديد السعر؟", "تعتمد الإدارة سعرًا مستقلًا لكل مسار وفئة سيارة، ويظهر السعر قبل إرسال الطلب."],
  ["ماذا يحدث عند وجود رحلة طيران؟", "يمكن إدخال رقم الرحلة ووقت الوصول أو الإقلاع، وقد تتيح الإدارة إرفاق التذكرة ليتم استخراج بياناتها ومراجعتها."],
  ["متى تظهر بيانات السائق؟", "تظهر بيانات السائق والمركبة بعد مراجعة الإدارة وتأكيد التعيين وفق حالة الحجز."],
  ["هل يمكن لعائلتي متابعة الرحلة؟", "نعم، عند تفعيل التتبع للرحلة يمكنك مشاركة رابط المتابعة مع شخص تثق به."],
];

export default function Home() {
  return (
    <Shell>
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="hero-kicker"><span><Icon name="sparkles" size={17} /></span>نقل خاص منظم بين سوريا ولبنان والأردن</div>
          <h1>رحلة مريحة من <em>الحجز إلى الوصول</em></h1>
          <p>احجز سيارة خاصة بخطوات واضحة، مع سيارات حديثة ومكيفة، إنترنت طوال الطريق، سعر معروف مسبقًا، ومتابعة من مركز العمليات.</p>
          <div className="hero-actions">
            <Link className="button primary button-lg" href="/booking">احجز رحلتك الآن <Icon name="arrow-left" size={19} /></Link>
            <a className="button button-lg button-ghost" href="#services"><Icon name="sparkles" size={19} />اكتشف خدماتنا</a>
          </div>
          <div className="hero-trust-row">
            <span><Icon name="wifi" size={16} />إنترنت طوال الطريق</span>
            <span><Icon name="car" size={16} />سيارات حديثة ومكيفة</span>
            <span><Icon name="shield" size={16} />سائقون معتمدون</span>
          </div>
        </div>

        <div className="hero-route-card" aria-label="شبكة خطوط الخدمة بين دمشق وبيروت وعمّان">
          <div className="route-card-top">
            <span className="route-card-label">رحلة خاصة</span>
            <span className="route-card-live"><i />متابعة تشغيلية</span>
          </div>
          <div className="city-stop">
            <span className="city-code">DAM</span>
            <div><strong>دمشق ومطار دمشق</strong><small>نقطة ربط لخطوط لبنان والأردن والمحافظات</small></div>
            <Icon name="map-pin" size={22} />
          </div>
          <div className="route-progress"><span /><i><Icon name="car" size={20} /></i><span /></div>
          <div className="city-stop">
            <span className="city-code city-code-alt">BEY · AMM</span>
            <div><strong>مطار بيروت ومطار الملكة علياء</strong><small>تنسيق للرحلات الجوية والمسافات الطويلة</small></div>
            <Icon name="plane" size={22} />
          </div>
          <div className="route-card-stats">
            <div><strong>خاص</strong><span>سيارة مخصصة لك</span></div>
            <div><strong>Wi‑Fi</strong><span>اتصال أثناء الطريق</span></div>
            <div><strong>Live</strong><span>تحديثات وتتبع</span></div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="مزايا سريعة">
        <div><Icon name="car" size={23} /><span><strong>راحة أعلى</strong><small>سيارات حديثة ومكيفة</small></span></div>
        <div><Icon name="wifi" size={23} /><span><strong>اتصال مستمر</strong><small>إنترنت طوال الطريق</small></span></div>
        <div><Icon name="clock" size={23} /><span><strong>تنظيم المواعيد</strong><small>تنسيق مع وقت الطائرة</small></span></div>
        <div><Icon name="pricing" size={23} /><span><strong>سعر واضح</strong><small>قبل إرسال الحجز</small></span></div>
      </section>

      <section id="services" className="content-section benefits-section-v2">
        <div className="section-intro centered-intro">
          <div className="eyebrow-v2">خطوط الخدمة</div>
          <h2>رحلات خاصة للخطوط التي تحتاجها</h2>
          <p>تدير المنصة المسارات والأسعار والسائقين مركزيًا، وتعرض للمسافر فقط الخطوط الفعالة والمتاحة للحجز.</p>
        </div>
        <div className="benefits-grid-v2">
          {serviceRoutes.map((service) => (
            <article key={service.title}>
              <span><Icon name={service.icon} size={24} /></span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
        <div className="actions" style={{ justifyContent: "center", marginTop: 28 }}>
          <Link className="button primary button-lg" href="/booking">عرض المسارات والحجز <Icon name="arrow-left" size={18} /></Link>
        </div>
      </section>

      <HomeVehicleShowcase />

      <section className="content-section services-section-v2">
        <div className="service-copy">
          <div className="eyebrow-v2 light-eyebrow">راحة الطريق</div>
          <h2>الرحلة ليست مجرد وسيلة نقل</h2>
          <p>الخدمة مصممة للرحلات بين المدن والمطارات؛ لذلك نهتم براحة المسافر طوال الطريق وليس فقط بنقطة الانطلاق والوصول.</p>
          <ul className="service-checklist">
            <li><Icon name="wifi" size={18} />إنترنت طوال الطريق</li>
            <li><Icon name="car" size={18} />سيارات حديثة ونظيفة ومكيفة</li>
            <li><Icon name="luggage" size={18} />اختيار السيارة بحسب الركاب والحقائب</li>
            <li><Icon name="plane" size={18} />تنسيق مع رحلات الوصول والإقلاع</li>
            <li><Icon name="shield" size={18} />سائقون ومركبات تخضع لمراجعة الإدارة</li>
          </ul>
          <Link className="button light-button" href="/booking">ابدأ الحجز <Icon name="arrow-left" size={18} /></Link>
        </div>
        <div className="service-cards">
          <article><span><Icon name="car" size={25} /></span><div><small>خصوصية ومرونة</small><h3>سيارة خاصة</h3><p>المركبة مخصصة لك ولمرافقيك، وتختار الفئة المناسبة قبل إرسال الطلب.</p></div></article>
          <article><span><Icon name="wifi" size={25} /></span><div><small>خلال الرحلة</small><h3>إنترنت على الطريق</h3><p>ابقَ متصلًا بعائلتك وأعمالك أثناء الانتقال بين المدن والمطارات.</p></div></article>
          <article><span><Icon name="clock" size={25} /></span><div><small>من البداية للنهاية</small><h3>متابعة تشغيلية</h3><p>الإدارة تراجع الحجز والمسار وتعيين السائق وتتابع التغييرات المهمة.</p></div></article>
        </div>
      </section>

      <section className="content-section benefits-section-v2">
        <div className="section-intro centered-intro">
          <div className="eyebrow-v2">كل ما تحصل عليه</div>
          <h2>ميزات المنصة والخدمة في مكان واحد</h2>
          <p>من اختيار السيارة إلى الإشعارات والتتبع، صممت المنصة لتجعل رحلة المسافر واضحة وقابلة للمتابعة.</p>
        </div>
        <div className="benefits-grid-v2">
          {features.map((feature) => (
            <article key={feature.title}>
              <span><Icon name={feature.icon} size={24} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="content-section how-section-v2">
        <div className="section-intro">
          <div className="eyebrow-v2">طريقة العمل</div>
          <h2>من الطلب إلى الوصول بثلاث مراحل</h2>
          <p>الواجهة بسيطة للمسافر، بينما تتولى لوحة العمليات التحقق والتعيين والمتابعة خلف الكواليس.</p>
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

      <section id="faq" className="content-section faq-section-v2">
        <div className="section-intro"><div className="eyebrow-v2">الأسئلة الشائعة</div><h2>معلومات مهمة قبل الحجز</h2><p>أهم التفاصيل التي يحتاجها المسافر قبل بدء طلب جديد.</p></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<Icon name="chevron-down" size={19} /></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <section className="home-cta">
        <div><div className="eyebrow-v2 light-eyebrow">جاهز للانطلاق؟</div><h2>اختر مسارك وسيارتك في صفحة حجز مخصصة</h2><p>ابدأ الحجز الآن، راجع السعر والبيانات، ثم أرسل الطلب مباشرة إلى مركز العمليات.</p></div>
        <div><Link className="button light-button button-lg" href="/booking">احجز الآن <Icon name="arrow-left" size={18} /></Link><Link className="button cta-outline button-lg" href="/login">متابعة حجوزاتي</Link></div>
      </section>
    </Shell>
  );
}
