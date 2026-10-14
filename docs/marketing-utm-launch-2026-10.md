# طريق الشام — حملة الإطلاق الأولى وروابط UTM

تاريخ الإعداد: 14 أكتوبر 2026. الروابط **جاهزة للاستخدام عند نشر المواد من الحسابات الرسمية**. لم تُنشر إعلانات أو رسائل على أي حساب خارجي. لا تتضمن الروابط معلومات شخصية أو مرجع حجز.

## الحالة المرجعية

- الدومين الرسمي: `https://tareeqalsham.com`.
- معرّف GA4: `G-QGRC5QFLSW`. أكد المالك ظهور زيارة في GA4 بعد إصلاح `page_view` على الإنتاج.
- بحسب تأكيد المالك تم تعليم `booking_submitted` بأنه **Key event**. أول حجز حقيقي من زائر وافق على التحليلات يؤكد قياس الحدث؛ لا تنشئ حجوزات وهمية في الإنتاج.
- القياس اختياري؛ تُقاس الزيارات وأحداث الحجز للزوار الموافقين فقط. `booking_submitted` طلب مقبول وليس حجزاً مدفوعاً أو رحلة منفّذة.
- الرابط يؤدي إلى صفحة خدمة عامة؛ السعر النهائي والمسارات المفعلة يحددهما نموذج الحجز.

## قواعد تسمية الروابط

- `utm_source`: `facebook` أو `instagram` أو `whatsapp`.
- `utm_medium`: `social` للنشر العضوي؛ تجنّب وسم الزيارات على أنها مدفوعة إذا لم تُنفق عليها ميزانية.
- `utm_campaign`: اسم موحد لكل خدمة وفق `launch_oct2026_...`.
- التزم بالأحرف الإنجليزية الصغيرة والأرقام والشرطة السفلية؛ الكود يمرّر إلى GA4 معلمات UTM الثلاث المسموحة فقط.
- **لا تُدخل UTM في الروابط الداخلية للموقع** ولا في روابط نتائج البحث العضوية.
- إذا بدأت لاحقاً Google Ads، اضبط تكامل Google Ads ووسمه التلقائي بشكل مستقل؛ لا تعتمد هذه الروابط للبحث المدفوع.

## روابط الحملات الجاهزة

| الخدمة | القناة | الرابط |
|---|---|---|
| دمشق ↔ مطار بيروت | Facebook | [رابط حملة Facebook](https://tareeqalsham.com/services/damascus-beirut-airport?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_beirut) |
| دمشق ↔ مطار بيروت | Instagram | [رابط حملة Instagram](https://tareeqalsham.com/services/damascus-beirut-airport?utm_source=instagram&utm_medium=social&utm_campaign=launch_oct2026_beirut) |
| دمشق ↔ مطار بيروت | WhatsApp | [رابط حملة WhatsApp](https://tareeqalsham.com/services/damascus-beirut-airport?utm_source=whatsapp&utm_medium=social&utm_campaign=launch_oct2026_beirut) |
| دمشق ↔ مطار الملكة علياء | Facebook | [رابط حملة Facebook](https://tareeqalsham.com/services/damascus-amman-airport?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_queen_alia) |
| دمشق ↔ مطار الملكة علياء | Instagram | [رابط حملة Instagram](https://tareeqalsham.com/services/damascus-amman-airport?utm_source=instagram&utm_medium=social&utm_campaign=launch_oct2026_queen_alia) |
| دمشق ↔ مطار الملكة علياء | WhatsApp | [رابط حملة WhatsApp](https://tareeqalsham.com/services/damascus-amman-airport?utm_source=whatsapp&utm_medium=social&utm_campaign=launch_oct2026_queen_alia) |
| مطار دمشق ↔ المحافظات السورية | Facebook | [رابط حملة Facebook](https://tareeqalsham.com/services/damascus-airport-governorates?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_damascus_airport) |
| مطار دمشق ↔ المحافظات السورية | Instagram | [رابط حملة Instagram](https://tareeqalsham.com/services/damascus-airport-governorates?utm_source=instagram&utm_medium=social&utm_campaign=launch_oct2026_damascus_airport) |
| مطار دمشق ↔ المحافظات السورية | WhatsApp | [رابط حملة WhatsApp](https://tareeqalsham.com/services/damascus-airport-governorates?utm_source=whatsapp&utm_medium=social&utm_campaign=launch_oct2026_damascus_airport) |

## نصوص منشورات مقترحة — غير منشورة

### دمشق ↔ مطار بيروت

رحلتك بين دمشق ومطار بيروت أسهل بالتخطيط المسبق. اختر الموعد وفئة السيارة، وتعرّف على السعر قبل إرسال طلبك. يمكنك الحجز كضيف بدون إنشاء حساب.

رابط النشر على Facebook: https://tareeqalsham.com/services/damascus-beirut-airport?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_beirut

### دمشق ↔ مطار الملكة علياء

مسافر بين دمشق ومطار الملكة علياء؟ حدّد اتجاه الرحلة وموعد السفر وعدد الركاب والحقائب، ثم راجع السعر قبل إرسال طلب الحجز عبر طريق الشام.

رابط النشر على Facebook: https://tareeqalsham.com/services/damascus-amman-airport?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_queen_alia

### مطار دمشق ↔ المحافظات السورية

متجه إلى مطار دمشق أو قادم منه؟ استعرض خدمات النقل الخاص إلى المحافظات المتاحة، واختر فئة السيارة المناسبة وأرسل طلب الحجز دون تسجيل الدخول.

رابط النشر على Facebook: https://tareeqalsham.com/services/damascus-airport-governorates?utm_source=facebook&utm_medium=social&utm_campaign=launch_oct2026_damascus_airport

## اختبار التتبع من دون حجوزات وهمية

1. اختر رابط حملة واحداً وافتحه في نافذة خاصة، ثم وافق على التحليلات. راجع `page_view` في **Reports → Realtime**؛ قد يتأخر ظهور البيانات دقائق.
2. انتقل إلى `/booking`، وأكمل خطوة المسار باختيار مسار صالح، دون إرسال طلب نهائي. ينبغي أن يظهر `booking_started` إذا اجتاز النموذج شروط التحقق.
3. لاحقاً افتح **Reports → Acquisition → Traffic acquisition**، واختر **Session source/medium** أو **Session campaign** لمعرفة أداء القنوات. قد تتأخر بيانات التقارير مقارنةً بـRealtime.
4. بعد أول حجز حقيقي من زائر وافق على التحليلات، اختر `booking_submitted` من محدّد **Key events** في تقرير الاكتساب. لا تعدّ هذا الحدث دفعة أو رحلة مكتملة.
5. لا تضف مرجع الحجز أو أرقام الهواتف أو معرفات الطلب إلى أي رابط حملة أو Analytics.
6. قارن بيانات GA4 مع لوحة الإدارة على أنها **مصدران منفصلان**؛ رفض التحليلات وحظر التتبع يعني أن أحداث GA4 لا تساوي عدد جميع الحجوزات.

## مؤشرات أول أسبوعين

| المؤشر | أين نراجعه | الهدف |
|---|---|---|
| عدد الجلسات حسب القناة | GA4: Traffic acquisition | قياس زيارات Facebook وInstagram وWhatsApp |
| اسم حملة الزيارة | GA4: Session campaign | مقارنة اهتمام العملاء بالمسارات الثلاثة |
| `booking_started` | GA4 Events | متابعة من بدأ الحجز |
| `booking_submitted` | GA4 Key events | قياس طلبات الحجز المقبولة للموافقين على التحليلات |
| جميع الحجوزات الحقيقية | لوحة عمليات طريق الشام | مرجع تشغيلي مستقل عن GA4 |
| رسائل الاستفسار | قنوات الدعم | تسجيل مجموع الحالات يدوياً دون نسخ بيانات شخصية إلى GA4 |

## متطلبات قبل حملة ممولة

- اعتماد شروط الحجز وسياسة الإلغاء والاسترداد وسياسة الخصوصية مع الجهة المشغلة.
- تأكيد جاهزية موظفي الدعم لاستقبال الأسئلة على أرقام الموقع الرسمية.
- تجنب وعود بسعر ثابت لكل الفئات أو بتوفر كل المسارات أو ضمان قبول كل الطلبات.
- لا تفعّل Google Ads أو Meta Pixel دون مراجعة الإعدادات والموافقة المطلوبة.
- ربط GA4 مع GSC Wizard يحتاج منح إضافة GSC Wizard صلاحية Google Analytics من الحساب المتصل نفسه؛ اتصال Search Console وحده لا يمنح صلاحية قراءة Analytics.
