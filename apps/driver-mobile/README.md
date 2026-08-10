# Ride Platform Driver Mobile

نسخة أولية لتطبيق السائق مبنية بـ Flutter وتستخدم نفس NestJS API الموجود في المشروع.

## ما يعمل في هذه المرحلة

- تسجيل الدخول بحساب DRIVER فقط.
- تخزين access/refresh tokens في secure storage.
- تجديد الجلسة تلقائيًا عند 401.
- عرض جدول حجوزات السائق من `GET /api/drivers/me/schedule`.
- قبول أو رفض المهمة.
- تحديث الحالة: أنا في الطريق → وصلت إلى المسافر → بدء الرحلة → إنهاء الرحلة.
- بدء GPS تلقائيًا بعد تسجيل الوصول إلى المسافر.
- إرسال الموقع إلى `POST /api/tracking/trips/:tripId/location`.
- Android foreground location notification أثناء التتبع.
- iOS background location settings في طبقة Flutter.

## إنشاء Android و iOS لأول مرة

هذه المرحلة أضافت كود Flutter إلى المستودع من دون ملفات المنصات المولدة آليًا. على جهاز تطوير يحتوي Flutter SDK:

```bash
cd apps/driver-mobile
flutter create --platforms=android,ios --project-name ride_driver --org com.rideplatform .
flutter pub get
```

راجع `lib/main.dart` بعد `flutter create` وتأكد أنه لم يستبدل ملف المشروع الحالي. إذا استبدله الأمر في إصدار Flutter المستخدم لديك، استرجع الملف من Git قبل المتابعة.

## Android permissions

أضف داخل `android/app/src/main/AndroidManifest.xml` قبل `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

يجب أن يبدأ السائق التتبع من داخل التطبيق وهو ظاهر على الشاشة. عند بدء التتبع يستخدم `geolocator` إشعار foreground دائمًا على Android.

## iOS permissions

في `ios/Runner/Info.plist` أضف نصوص استخدام الموقع:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>نستخدم موقع السائق أثناء تنفيذ الرحلة لعرض موقع المركبة للمسافر.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>نحتاج موقع السائق أثناء الرحلة حتى عند انتقال التطبيق إلى الخلفية.</string>
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```

ومن Xcode فعّل:

`Runner > Signing & Capabilities > Background Modes > Location updates`

## التشغيل

الـAPI الافتراضي هو:

`https://ride-platform-starter.onrender.com/api`

ويمكن تغييره بدون تعديل الكود:

```bash
flutter run --dart-define=API_BASE_URL=https://ride-platform-starter.onrender.com/api
```

للتطوير المحلي على Android Emulator مثلًا:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api
```

## ملاحظات المرحلة التالية

- إضافة شاشة خريطة فعلية داخل التطبيق.
- فتح Google Maps / Apple Maps للملاحة إلى نقطة الالتقاط والوجهة.
- ربط Socket.IO بدل REST فقط للموقع عند توفر الاتصال المباشر.
- إضافة Firebase Cloud Messaging لإشعارات تعيين الرحلات.
- حفظ آخر مهمة نشطة محليًا واستعادة التتبع بعد إعادة تشغيل التطبيق.
- إضافة queue محلية للمواقع عند انقطاع الإنترنت إن احتجنا الاحتفاظ بتاريخ المسار وليس آخر موقع فقط.
