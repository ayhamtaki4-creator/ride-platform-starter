<<<<<<< HEAD
# Ride Platform Starter

نواة أولية لمنصة نقل متعددة الأدوار، مبنية كـ Monorepo:

- `apps/portal`: واجهة Next.js لتجارب الراكب والسائق والإدارة.
- `apps/api`: خادم NestJS مع Prisma وPostgreSQL.
- نظام RBAC للأدوار والصلاحيات.
- دورة رحلة محكومة بـ State Machine.
- Swagger API Documentation.
- Docker Compose لتشغيل PostgreSQL/PostGIS وRedis.
- Seed ينشئ أدوارًا وصلاحيات وحساب مدير تجريبي.

## المتطلبات

- Node.js إصدار LTS حديث
- pnpm
- Docker Desktop أو Docker Engine

## التشغيل

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

ثم افتح:

- الواجهة: `http://localhost:3000`
- Swagger: `http://localhost:4000/docs`
- فحص API: `http://localhost:4000/api/health`

## الحساب التجريبي

بعد تشغيل Seed:

```text
مدير النظام:
email: admin@example.com
password: ChangeMe123!

راكب تجريبي:
email: rider@example.com
password: ChangeMe123!

سائق تجريبي معتمد:
email: driver@example.com
password: ChangeMe123!
```

غيّر كلمة المرور فورًا في أي بيئة غير محلية.

## ما تم تنفيذه

1. التسجيل وتسجيل الدخول بواسطة JWT.
2. أدوار وصلاحيات مخزنة في قاعدة البيانات.
3. Guard للصلاحيات على مستوى API.
4. إنشاء رحلة للراكب.
5. عرض الرحلات الخاصة بالمستخدم.
6. قبول السائق للرحلة.
7. انتقالات حالات الرحلة وفق قواعد محددة.
8. تسجيل تاريخ حالات الرحلة.
9. Audit Log للعمليات الحساسة الأساسية.
10. واجهات أولية منفصلة للراكب والسائق والإدارة.

## الخطوات التالية

راجع `docs/NEXT_STEPS.md`.


## ملاحظة التحقق

تم التحقق من بنية الملفات وملفات JSON محليًا. تعذر تنزيل حزم npm داخل بيئة الإنشاء بسبب حظر الاتصال بسجل npm، لذلك يجب تنفيذ `pnpm install` ثم `pnpm typecheck` على جهازك بعد فك الضغط.

## ملاحظة الإصدارات

تم تثبيت Next.js وReact وNestJS على إصدارات حديثة محددة. تم تثبيت Prisma على خط 6.19 المتوافق مع إعداد NestJS/CommonJS الحالي، بدل استخدام وسم `latest` الذي يجلب Prisma 7 ويتطلب إعداد Driver Adapter وتهيئة مختلفة.
=======
# ride-platform-starter
>>>>>>> b5d6e4efa876bab828559d26bab807972feafbe1
