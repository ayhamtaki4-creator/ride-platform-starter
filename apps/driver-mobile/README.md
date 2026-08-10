# Ride Platform Driver Mobile

تطبيق السائق المبني بـ Flutter ويستخدم نفس NestJS API الخاص بمنصة Ride Platform.

## ما يعمل حاليًا

- تسجيل الدخول بحساب `DRIVER` فقط.
- تخزين `accessToken` و`refreshToken` في secure storage.
- تجديد الجلسة تلقائيًا عند انتهاء access token.
- عرض حجوزات السائق من `GET /api/drivers/me/schedule`.
- قبول ورفض المهمة مع سبب الرفض.
- دورة الرحلة: أنا في الطريق → وصلت إلى المسافر → بدء الرحلة → إنهاء الرحلة.
- بدء GPS تلقائيًا عند وصول السائق واستمراره أثناء الرحلة.
- إرسال الموقع عبر Socket.IO مباشرة مع REST fallback إلى `POST /api/tracking/trips/:tripId/location`.
- انتظار تأكيد `trip.location.accepted` من الخادم قبل اعتبار تحديث GPS ناجحًا.
- استقبال أحداث تعيين وتحديث الرحلات مباشرة وتحديث قائمة مهام السائق تلقائيًا.
- شاشة إشعارات كاملة مع عداد غير المقروء وتحديد إشعار أو جميع الإشعارات كمقروءة.
- Firebase Cloud Messaging اختياري لإشعارات Android/iOS عندما يكون التطبيق بالخلفية أو مغلقًا.
- تسجيل FCM token في `POST /api/mobile-push/devices` وإزالته عند تسجيل الخروج.
- Android foreground location notification أثناء التتبع.
- iOS background location configuration.
- حفظ الرحلة النشطة محليًا واستعادة GPS عند إعادة فتح التطبيق.
- حفظ آخر نقاط GPS محليًا عند انقطاع الشبكة ومحاولة إرسال أحدث نقطة بعد عودة الاتصال.
- خريطة داخل التطبيق تعرض نقطة الالتقاط والوجهة والمسار وموقع السائق.
- تحديث علامة السيارة على الخريطة من `trip.location.updated` مباشرة.
- فتح Google Maps على Android وApple Maps على iOS للملاحة إلى الالتقاط أو الوجهة.
- زر اتصال مباشر بالمسافر عند وجود رقم هاتف.

## توليد Android و iOS

```bash
cd apps/driver-mobile
flutter create --platforms=android,ios --project-name ride_driver --org com.rideplatform --no-pub .
python3 tool/configure_platforms.py
flutter pub get
```

السكربت يضيف صلاحيات Android الخاصة بالموقع والخلفية و`POST_NOTIFICATIONS`، كما يضيف إلى iOS نصوص استخدام الموقع و`UIBackgroundModes = location`.

## التشغيل

الـAPI الافتراضي:

`https://ride-platform-starter.onrender.com/api`

تشغيل بدون Firebase:

```bash
flutter run --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api
```

تشغيل مع Firebase Cloud Messaging:

```bash
flutter run \
  --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api \
  --dart-define=FIREBASE_API_KEY=... \
  --dart-define=FIREBASE_APP_ID=... \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=... \
  --dart-define=FIREBASE_PROJECT_ID=...
```

إذا كانت إحدى قيم Firebase الأربع غير موجودة، يبقى FCM معطلاً ويستمر التطبيق طبيعيًا باستخدام Socket.IO وصندوق الإشعارات الداخلي.

عنوان Socket.IO يُشتق تلقائيًا من عنوان الـAPI ويمكن تحديده صراحةً عبر `REALTIME_URL`.

## GitHub Actions + Firebase

لإنتاج APK يدعم FCM من `Driver Mobile CI` أضف Repository Secrets التالية:

- `DRIVER_FIREBASE_API_KEY`
- `DRIVER_FIREBASE_APP_ID`
- `DRIVER_FIREBASE_MESSAGING_SENDER_ID`
- `DRIVER_FIREBASE_PROJECT_ID`

إذا لم تكن موجودة، يستمر الـworkflow ببناء APK بدون FCM.

## إعداد السيرفر على Render

الـAPI لا يحتاج Firebase Admin SDK dependency. الإرسال يتم عبر Firebase HTTP v1 باستخدام Service Account.

أضف متغير البيئة التالي إلى خدمة الـAPI على Render:

`FIREBASE_SERVICE_ACCOUNT_JSON`

القيمة يمكن أن تكون JSON الخاص بحساب الخدمة مباشرة، أو نفس JSON بعد تحويله إلى Base64.

بعد deploy وتشغيل migration الجديدة، يقوم التطبيق بتسجيل جهاز السائق تلقائيًا. خدمة الـAPI تلتقط سجلات `Notification` الجديدة وترسلها إلى الأجهزة المسجلة، مع جدول `MobilePushDelivery` لمنع التكرار وإعادة المحاولة عند الفشل.

## بناء APK

```bash
flutter build apk --debug \
  --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api
```

GitHub Actions يرفع الـAPK كـArtifact باسم يبدأ بـ:

`ride-platform-driver-android-`

## ما تبقى قبل الإنتاج

- إنشاء/اختيار Firebase project وإضافة قيم Android الفعلية إلى GitHub Secrets.
- إضافة Service Account إلى Render وتشغيل Prisma migration في بيئة الإنتاج.
- اختبار وصول Push على هاتف Android والتطبيق بالخلفية ثم مغلقًا بالكامل.
- إعداد APNs وPush Notifications capability قبل تفعيل FCM على iOS.
- إعداد Android release signing وبناء AAB للنشر.
