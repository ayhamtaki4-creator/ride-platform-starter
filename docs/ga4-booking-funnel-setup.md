# Google Analytics 4 — القياس مع احترام الخصوصية

## حالة الإطلاق

- **التكامل البرمجي جاهز، لكن القياس غير مفعّل تلقائياً.**
- لا يتم تحميل Google Analytics أو إظهار نافذة الموافقة إذا لم يوجد
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` صالح عند **بناء** Next.js.
- عند تهيئة المعرف، لا يُحمّل سكربت GA4 قبل موافقة الزائر الصريحة.
  يظل الحجز وكل وظائف المنصة متاحاً لمن يرفض الموافقة.
- لا تستخدم معرّفاً وهمياً ولا تنسخ رمز القياس لموقع آخر. يجب إنشاء
  **GA4 Web data stream** خاص بـ `https://tareeqalsham.com`.

## تفعيل الخدمة بواسطة مالك حساب Google

1. في https://analytics.google.com اختر **Admin** ثم أنشئ Google Analytics 4
   property باسم `طريق الشام` إن لم تكن موجودة.
2. أنشئ **Web data stream** بعنوان
   `https://tareeqalsham.com`، وانسخ **Measurement ID**
   الذي يتبع نمط `G-XXXXXXXXXX`.
3. في **GA4 Web stream > Enhanced measurement > Page views** عطّل
   خيار **Page changes based on browser history events**. التطبيق يرسل
   `page_view` يدوياً للصفحات العامة فقط؛ تعطيل أحداث History الإضافية
   يمنع الازدواجية ويقلل خطر تعقب صفحات الحسابات الخاصة.
4. في Cloudflare Workers Builds لخدمة واجهة `alnokhbaeducation`،
   أضف **Build-time environment variable**:
   `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX`
   بالقيمة الحقيقية ثم أعد بناء ونشر الواجهة. **إعداد Runtime
   environment variable وحده قد لا يكفي** لأن Next.js يضمّن
   متغيرات `NEXT_PUBLIC_*` وقت البناء.
5. جرّب زيارة الصفحة الرئيسية من نافذة خاصة، واضغط **السماح بالتحليلات**.
   تحقق من ظهور زيارة في **GA4 Realtime** أو **DebugView**.
   ارفض التحليلات من متصفح آخر وتأكد من عدم تحميل
   `https://www.googletagmanager.com/gtag/js`.
6. يمكن تعديل الاختيار من **إعدادات خصوصية التحليلات** في أسفل
   الصفحات العامة؛ الرفض يوقف الإرسال ويحذف ملفات `_ga` المحلية
   القابلة للحذف.
7. صِل GA4 إلى GSC Wizard من حسابك نفسه في https://tool.gscwizard.com
   إذا أردت مقارنة إحصائيات Google Search مع زيارات الموقع من داخل ChatGPT.

لا تتطلب هذه الخطوات تغيير خادم NestJS أو قاعدة بيانات Neon أو الأسعار.

## الأحداث المسجلة

| الحدث | متى يحدث | البيانات المرسلة |
| --- | --- | --- |
| `page_view` | عند زيارة صفحة عامة، وبعد الموافقة | رابط الصفحة **دون معلومات الحجز**؛ وعند وجود UTM معتمد، معاملات `utm_source` و`utm_medium` و`utm_campaign` المنقّاة |
| `booking_started` | بعد إكمال خطوة المسار الأولى بنجاح | `booking_mode`: guest أو registered |
| `booking_step_completed` | بعد اجتياز إحدى الخطوات 1–3 | `booking_mode`، `step_number` |
| `booking_submitted` | عند قبول API لطلب الحجز فعلياً، لا عند النقر على زر الإرسال | `booking_mode` |

لا ترسل أحداثاً لتجارب حجز غير مكتملة بوصفها مبيعات فعلية.
`booking_submitted` يعبر عن **طلب حجز مقبول** وليس عن رحلة منفذة أو
دفعة تم تحصيلها.

لا تُرسل إلى Google Analytics: الأسماء، البريد، الهواتف، نصوص الملاحظات،
مواقع الانطلاق والوصول التفصيلية، رقم الحجز، معرّف الطلب، معلومات التذاكر،
رموز التتبع، ملفات الرحلة، قيم كلمة المرور أو المعرّفات الداخلية.

لا ترصد زيارة صفحات `/admin` أو `/driver` أو `/rider` أو
`/track` أو `/login` أو `/register` أو صفحة نجاح الحجز التي تحمل
`?ref=`.

## إعداد تقارير التحويل

بعد ظهور `booking_submitted` مرة واحدة على الأقل:

1. افتح **GA4 Admin > Events / Key events** (قد يختلف اسم القائمة).
2. علّم `booking_submitted` بوصفه **Key event**.
3. إذا أردت تقسيم النتائج إلى حجز ضيف/حساب، عرّف
   `booking_mode` كـ **Event-scoped custom dimension** في GA4.
4. قارن أحداث `booking_started` بـ `booking_submitted`
   على مستوى فترة زمنية لتقدير تسرّب القمع؛ هذه الأعداد لا تعطي
   معدل إكمال دقيقاً لكل مستخدم لأن القياس اختياري ويتأثر
   بالموافقة والحظر والزيارات المتكررة.
5. استعمل روابط حملات عامة مثل:
   `https://tareeqalsham.com/services/damascus-beirut-airport?utm_source=facebook&utm_medium=paid&utm_campaign=airport_launch`.
   اختبر Attribution / Realtime بعد تهيئة Stream.
6. إذا احتجت قياس حجوزات مؤكدة أو مدفوعة (وليس مجرد إرسال الطلب)،
   يجب تصميم ربط خلفي منفصل مع سياسة موافقة وبدون بيانات شخصية،
   وليس اعتبار `booking_submitted` عملية بيع.

## اختبار آمن

- `node --experimental-strip-types --test scripts/test-analytics-consent.ts`
  يتحقق من عدم تشغيل السكربت قبل الموافقة، وقراءة UTM المسموح،
  وحجب مسارات الإدارة، وحذف كوكيز التحليلات عند الرفض.
- اختبر على الإنتاج **دون إرسال حجز تجريبي فعلي**؛ يمكنك فحص
  `booking_started` مع التوقف قبل مرحلة الإرسال.
- اختبر `booking_submitted` في بيئة معزولة للاختبار حتى لا تنشئ
  حجوزات وهمية في الإنتاج ولا تُشوش إحصاءات العملاء الحقيقيين.

## خصوصية وموافقات

تتضمن صفحة `/privacy` شرحاً مبدئياً لتحليلات Google الاختيارية.
قبل تفعيل GA4 أو حملات الدفع، اعتمد نصوص سياسة الخصوصية بما يتناسب
مع القوانين والبلدان التي سيعمل فيها المشروع ومعالجة Google للبيانات.
تأكد أيضاً من إعدادات Google Analytics للاحتفاظ بالبيانات وتقليل
جمع بيانات الإعلانات وفق الاحتياجات الفعلية.
