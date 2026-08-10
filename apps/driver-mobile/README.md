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
- إرسال الموقع إلى `POST /api/tracking/trips/:tripId/location`.
- Android foreground location notification أثناء التتبع.
- iOS background location configuration.
- حفظ الرحلة النشطة محليًا واستعادة GPS عند إعادة فتح التطبيق.
- حفظ آخر نقاط GPS محليًا عند انقطاع الشبكة ومحاولة إرسال أحدث نقطة بعد عودة الاتصال.
- خريطة داخل التطبيق تعرض نقطة الالتقاط والوجهة والمسار وموقع السائق الأخير.
- فتح Google Maps على Android وApple Maps على iOS للملاحة إلى الالتقاط أو الوجهة.
- زر اتصال مباشر بالمسافر عند وجود رقم هاتف.

## توليد Android و iOS

ملفات المنصات يتم توليدها من Flutter ثم يطبق السكربت إعدادات GPS والخلفية:

```bash
cd apps/driver-mobile
flutter create --platforms=android,ios --project-name ride_driver --org com.rideplatform --no-pub .
python3 tool/configure_platforms.py
flutter pub get
```

السكربت يضيف تلقائيًا صلاحيات Android التالية:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`
- `POST_NOTIFICATIONS`

كما يضيف إلى iOS نصوص استخدام الموقع و`UIBackgroundModes = location`.

## التشغيل

الـAPI الافتراضي:

`https://ride-platform-starter.onrender.com/api`

تشغيل على API المنشور:

```bash
flutter run --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api
```

Android Emulator مع API محلي:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api
```

يمكن تغيير مصدر map tiles عبر:

```bash
--dart-define=MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

## بناء APK

محليًا:

```bash
flutter build apk --debug --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api
```

كما يقوم GitHub Actions workflow باسم `Driver Mobile CI` بتوليد ملفات Android/iOS، تشغيل `flutter analyze`، بناء APK تجريبي، ثم رفعه كـArtifact باسم يبدأ بـ:

`ride-platform-driver-android-`

## ما تبقى للمرحلة التالية

- Firebase Cloud Messaging لإشعارات تعيين الرحلات الجديدة.
- ربط Socket.IO في تطبيق Flutter لتحديثات realtime بدل الاعتماد على REST فقط.
- تحسين الخريطة لتحديث موقع السيارة لحظيًا بدون إعادة تحميل الشاشة.
- اختبار background tracking على أجهزة Android فعلية مع سياسات البطارية المختلفة.
- اختبار iOS background location على جهاز فعلي وضبط Signing & Capabilities قبل النشر.
