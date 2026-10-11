# نشر حجوزات الضيوف — خطة آمنة للإنتاج

الحالة: **معلّق إلى حين الوصول إلى Render وCloudflare والتحقق من إعداد WhatsApp OTP**.

## متطلبات قبل الدمج

- [ ] تأكيد الخدمة الصحيحة لواجهة NestJS داخل Render وخطة النشر الآلي للفرع `main`.
- [ ] التحقق من حالة PostgreSQL الحالية، وحفظ نسخة احتياطية قابلة للاستعادة **قبل تطبيق أي Migration**.
- [ ] مقارنة النسخة العاملة من API مع الفرع، والتحقق من ترتيب `prisma migrate deploy` قبل تشغيل NestJS المعدل.
- [ ] التأكد من إعداد R2 الخاص مع `MEDIA_REQUIRE_R2=true` إن كان Render يستخدم تخزينًا غير دائم.
- [ ] إنشاء/اعتماد قالب WhatsApp Authentication (Copy Code) وتحديد `WHATSAPP_OTP_TEMPLATE` و`WHATSAPP_OTP_LANGUAGE` وبقية بيانات Meta بشكل سري على Render.
- [ ] اختبار إرسال الرمز إلى هاتف اختبار حقيقي، ثم التفعيل وتغيير كلمة المرور، وعدم إرسال الرموز إلى Telegram.
- [ ] التأكد من Cloudflare Worker المرتبط بـ `alnokhbaeducation.com`، ثم تأكيد ملكية وربط `tareeqalsham.com` قبل تغيير الدومين العام.
- [ ] إعداد `NEXT_PUBLIC_SITE_URL` و`PORTAL_URL` و`WEB_ORIGINS` وCORS بشكل متوافق مع الدومين النهائي.

## خطوات الإصدار

1. إبقاء Pull Request #64 في وضع Draft حتى جاهزية البنود السابقة.
2. استعادة قاعدة بيانات الاختبار من نسخة نظيفة ومقارنة Migrations:
   - `20261011210000_guest_bookings`
   - `20261011220000_phone_verification`
3. نفّذ `pnpm --filter api run prisma:deploy` على البيئة المحددة **بعد** نسخة احتياطية ناجحة ومختبرة.
4. ارفع إصدار NestJS إلى Render وتحقق من:
   - `GET /api/health`
   - `GET /api/health/ready`
   - `POST /api/bookings/guest` ببيانات ناقصة يعطي 400 وليس 401 أو 404.
   - `POST /api/auth/phone/request-code` ببيانات ناقصة يعطي 400 وليس 401 أو 404.
   - `POST /api/bookings` يبقى مصادقًا عليه.
5. ابنِ تطبيق Next.js عبر OpenNext Cloudflare مع ضبط `NEXT_PUBLIC_API_URL` و`NEXT_PUBLIC_SITE_URL`. انشر إصدار Cloudflare بعد جاهزية API.
6. تأكد من مسارات `/booking`, `/booking/success`, `/activate`, `/login`, `/change-password`.
7. جرّب حجزًا واحدًا باستخدام هاتف اختبار، وتأكد من ظهوره في لوحة الإدارة وTelegram، وخصم معدل الإرسال ضمن الحدود المتوقعة.
8. افحص رفع التذكرة PDF/صورة إلى مخزن خاص واسترجاعها بصلاحيات الإدارة فقط.
9. شغّل `node scripts/production-smoke.mjs` بعد تحديد `PRODUCTION_API_URL` و`PRODUCTION_PORTAL_URL`.

## التراجع

- احتفظ بالنسخة السابقة من API/Worker ونسخة قاعدة البيانات قبل الإصدار.
- إذا فشلت خدمات جديدة مع بقاء قاعدة البيانات مستقرة، أعد إصدار Worker وAPI القديمين. لا تستعمل `prisma migrate reset` ولا تحذف الأعمدة أو السجلات.
- تراجع Migration الذي يحول حقل `passengerId` إلى nullable لا يتم بعملية `SET NOT NULL` مباشرة بعد بدء استقبال حجوزات ضيوف؛ هذا سيفشل أو يتسبب بفقدان بيانات. اختر خطة ترحيل عكسية بعد فحص الحقول وحفظ جميع حجوزات الضيوف.

## حدود الوصول الحالي

الاعتماد الحالي على GitHub وحده لا يعطي صلاحية فحص النسخ الاحتياطية أو بيئة Render أو نشر Cloudflare. **لا يعني نجاح GitHub Actions أن خدمات الإنتاج نُشرت بالفعل.**
