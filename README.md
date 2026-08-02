# Ride Platform Starter — Milestone 3

منصة نقل متعددة الأدوار مبنية كـ Monorepo:

- `apps/portal`: Next.js للراكب والسائق والإدارة.
- `apps/api`: NestJS وPrisma وPostgreSQL.
- Redis وSocket.IO للتحديث المباشر.
- OpenStreetMap وLeaflet لاختيار الانطلاق والوجهة.
- RBAC للأدوار والصلاحيات.
- مركز عمليات يعيّن السائقين للطلبات.

## المنجز

- تسجيل الدخول وحماية الصفحات حسب الدور.
- إنشاء رحلة وحساب السعر داخل الخادم.
- عدم كشف PIN للسائق وتخزينه بصورة مشفرة.
- حالات السائق `OFFLINE / ONLINE / ON_TRIP`.
- وصول الطلب إلى الإدارة وتعيين سائق محدد.
- إلغاء التعيين وإعادة التعيين قبل بدء الرحلة.
- WebSocket مصادق بواسطة JWT.
- إشعارات مباشرة للراكب والسائق والإدارة.
- تنبيه مرئي وصوتي اختياري للطلبات الجديدة.
- Redis Adapter لدعم أكثر من نسخة API، مع fallback محلي.
- Polling احتياطي كل 30 ثانية.
- Audit Log وتاريخ حالات الرحلة.

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

لا توجد Migration جديدة خاصة بـMilestone 3.

## الحسابات التجريبية

| الدور | البريد | كلمة المرور |
|---|---|---|
| مدير | `admin@example.com` | `ChangeMe123!` |
| راكب | `rider@example.com` | `ChangeMe123!` |
| سائق | `driver@example.com` | `ChangeMe123!` |

## اختبار التحديث المباشر

بعد تشغيل المشروع:

```powershell
pnpm test:realtime
```

ينشئ الاختبار رحلة، ويتحقق من وصولها فورًا للإدارة، ثم من وصول التعيين للسائق والراكب، ثم يختبر إلغاء التعيين.

## الهاتف والشبكة المحلية

ضع عنوان الكمبيوتر الفعلي بدل المثال:

```env
# apps/api/.env
WEB_ORIGINS="http://localhost:3000,http://172.20.10.2:3000"

# apps/portal/.env.local
NEXT_PUBLIC_API_URL=http://172.20.10.2:4000/api
NEXT_ALLOWED_DEV_ORIGINS=172.20.10.2
```

ثم افتح من الهاتف:

```text
http://172.20.10.2:3000
```

## ملاحظة أمنية

JWT مخزن حاليًا في `localStorage` للتطوير فقط. قبل الإنتاج يجب استخدام Cookies آمنة من نوع `HttpOnly + Secure + SameSite` مع Refresh Tokens وإلغاء الجلسات.

## Operational Runs milestone

The operations center can now create and manage daily service runs at `/admin/runs`, add confirmed bookings, control capacity, replace drivers, print passenger manifests, and monitor financial summaries. Drivers manage each run at `/driver/runs/:id`, including acceptance, boarding, no-show handling, starting, and completion.

Automated test:

```powershell
pnpm test:runs
```

## Rider UI V2

Passenger-facing pages are available at `/rider`, `/rider/bookings`, `/rider/bookings/:id`, and `/rider/profile`. See `docs/RIDER_UI_V2.md`.

## Dynamic routes and fleet access

أضيفت إدارة ديناميكية للمواقع والمسارات، ومراكز تشغيل دمشق وبيروت وعمّان، وصلاحيات دخول مستقلة للسائق والمركبة إلى سوريا ولبنان والأردن. كما أضيفت إدارة الحسابات من الـAPI وعرض الملف العام للسائق وصورة السيارة للمسافر بعد التعيين.

راجع `docs/DYNAMIC_ROUTES_FLEET_ACCESS.md` وشغّل:

```powershell
pnpm test:routes
```

## Fleet compliance and media

أضيف رفع فعلي لصور السائق والمركبة ووثائق التصاريح، مع مراجعة واعتماد الملفات، ومتطلبات وثائق قابلة للإدارة لكل دولة، وفحص تلقائي لانتهاء الصلاحية. لا يظهر السائق أو المركبة لمسار دولي عندما تكون الوثائق المطلوبة ناقصة أو منتهية.

راجع `docs/FLEET_COMPLIANCE_MEDIA.md` وشغّل:

```powershell
pnpm test:compliance
```
