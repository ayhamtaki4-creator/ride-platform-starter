# Ride Platform Starter — Milestone 1

نواة عملية لمنصة نقل متعددة الأدوار، مبنية كـ Monorepo:

- `apps/portal`: واجهة Next.js للراكب والسائق والإدارة.
- `apps/api`: خادم NestJS مع Prisma وPostgreSQL.
- نظام RBAC مع إعادة قراءة حالة المستخدم وصلاحياته من قاعدة البيانات.
- دورة رحلة محكومة بـ State Machine.
- Swagger API Documentation.
- Docker Compose لتشغيل PostgreSQL/PostGIS وRedis.

## ما تم تنفيذه في Milestone 1

- تسجيل الدخول وتوجيه المستخدم حسب دوره.
- حماية صفحات الراكب والسائق والإدارة.
- تسجيل الخروج ومعالجة انتهاء الجلسة.
- حساب السعر داخل الخادم.
- منع الراكب من إنشاء رحلتين نشطتين.
- حالة السائق: Offline / Online / On Trip.
- عرض الرحلات المتاحة للسائق المتصل.
- قبول الرحلة وتنفيذ حالات الوصول والبدء والإنهاء.
- تخزين Hash لرمز PIN وعدم إعادته للسائق.
- تحرير السائق تلقائيًا بعد انتهاء الرحلة أو إلغائها.
- لوحة إدارة مرتبطة بالمستخدمين والرحلات وسجل العمليات.
- Polling مؤقت للتحديث كل عدة ثوانٍ قبل إضافة WebSocket.

## التشغيل

```powershell
Copy-Item .env.example .env -Force
Copy-Item .env apps\api\.env -Force
"NEXT_PUBLIC_API_URL=http://localhost:4000/api" |
  Set-Content apps\portal\.env.local -Encoding ascii

docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

عند طلب Prisma اسم Migration، استخدم:

```text
milestone_1
```

ثم افتح:

- الواجهة: `http://localhost:3000`
- Swagger: `http://localhost:4000/docs`
- فحص API: `http://localhost:4000/api/health`

## الحسابات التجريبية

| الدور | البريد | كلمة المرور |
|---|---|---|
| مدير | `admin@example.com` | `ChangeMe123!` |
| راكب | `rider@example.com` | `ChangeMe123!` |
| سائق | `driver@example.com` | `ChangeMe123!` |

## سيناريو الاختبار

1. افتح نافذة عادية وسجل الدخول كراكب.
2. افتح نافذة خاصة وسجل الدخول كسائق.
3. اجعل السائق Online.
4. أنشئ رحلة من حساب الراكب.
5. اقبل الرحلة من حساب السائق.
6. اضغط «أنا في الطريق»، ثم «وصلت إلى الراكب».
7. من حساب الراكب أنشئ رمز PIN وشاركه مع السائق.
8. ابدأ الرحلة ثم أنهها.
9. سجل الدخول كمدير لمشاهدة الرحلة وسجل العمليات.


## اختبار آلي لدورة الرحلة

بعد تشغيل المشروع، افتح PowerShell جديدًا ونفّذ:

```powershell
.\scripts\test-trip-flow.ps1
```

ينفذ السكربت تسجيل الدخول، تشغيل السائق، إنشاء الرحلة، قبولها، بدءها بالـPIN، ثم إنهاءها.

## ملاحظات أمنية

التخزين الحالي لرمز JWT في `localStorage` مناسب لمرحلة التطوير فقط. قبل الإنتاج يجب الانتقال إلى جلسات تعتمد على Cookies من نوع `HttpOnly + Secure + SameSite`.
