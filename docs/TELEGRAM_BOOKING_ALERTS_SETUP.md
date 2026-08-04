# إعداد تنبيهات الحجوزات عبر Telegram

يرسل الـAPI تنبيهًا عربيًا إلى محادثة Telegram المحددة بعد إنشاء حجز جديد فعليًا. يُحفظ التنبيه أولًا في قاعدة البيانات، لذلك لا يتعطل الحجز عند تعذر Telegram، وتُعاد المحاولة تلقائيًا حتى خمس مرات.

## متغيرات Render

أضف القيم التالية إلى خدمة الـAPI في Render من صفحة **Environment**، ولا تضع القيم الحقيقية داخل `.env.example` أو GitHub:

```text
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_CHAT_ID=<target chat id>
TELEGRAM_QUEUE_INTERVAL_MS=15000
TELEGRAM_TIME_ZONE=Asia/Damascus
PORTAL_URL=https://<portal-domain>
```

يجب أن يكون المستخدم قد ضغط **Start** في المحادثة الخاصة مع البوت. عند الإرسال إلى مجموعة، أضف البوت إلى المجموعة واستخدم معرّف المجموعة، والذي يبدأ عادةً بإشارة سالبة.

## قاعدة البيانات

طبّق Migration التالية في عملية نشر الـAPI:

```text
20260804220000_telegram_booking_notifications
```

أوامر Prisma الآمنة:

```powershell
pnpm --filter api run prisma:generate
pnpm --filter api run prisma:deploy
```

لا تستخدم `prisma migrate reset` أو `prisma:seed` على قاعدة الإنتاج.

## التحقق بعد النشر

جميع النقاط التالية محمية بصلاحيات الإدارة:

```text
GET  /api/admin/telegram/status
POST /api/admin/telegram/test
GET  /api/admin/telegram/deliveries
POST /api/admin/telegram/deliveries/:id/retry
```

لا تُرجع نقطة الحالة رمز البوت. رسالة الحجز تحتوي رقم الحجز، اسم المسافر، الهاتف، المسار، الموعد، فئة السيارة، عدد الركاب والحقائب، السعر، وزرًا يفتح تفاصيل الحجز في لوحة الإدارة.
