# Dynamic Routes, Accounts, Fleet Access and Passenger Driver Profile

هذه المرحلة تنقل المنصة من اتجاهين ثابتين إلى مسارات قابلة للإدارة، وتضيف إدارة الحسابات والسائقين والمركبات مع فصل واضح بين:

- **مركز التشغيل**: دمشق، بيروت، عمّان.
- **صلاحية دخول الدولة**: سوريا، لبنان، الأردن.

مركز التشغيل لا يمنح صلاحية دخول دولة تلقائيًا. تعيين أي حجز دولي يتطلب أن يملك **السائق والمركبة معًا** جميع صلاحيات الدول المطلوبة للمسار، وأن تكون الصلاحيات معتمدة وغير منتهية.

## البيانات المزروعة

### مراكز التشغيل

- `DAMASCUS`
- `BEIRUT`
- `AMMAN`

### صلاحيات الدول

- `SYRIA`
- `LEBANON`
- `JORDAN`

### المسارات

- مطار بيروت ↔ دمشق.
- دمشق ↔ عمّان.
- مطار دمشق ↔ مدينة دمشق.
- مطار دمشق ↔ المحافظات السورية المزروعة في `seed.ts`.

المسارات الجديدة لا تحصل على أسعار افتراضية مصطنعة. يجب إنشاء قاعدة سعر لكل `routeId + bookingType` قبل أن يصبح المسار قابلًا للحجز.

## إنشاء المستخدمين

التسجيل العام ينشئ مسافرًا فقط:

```http
POST /api/auth/register
```

إنشاء حساب من الإدارة:

```http
POST /api/admin/users
```

مثال:

```json
{
  "firstName": "محمد",
  "lastName": "أحمد",
  "email": "mohammad@example.com",
  "phone": "+963944000000",
  "password": "SecurePass123!",
  "roleCodes": ["OPERATIONS_MANAGER"]
}
```

لا ينشأ السائق من هذا المسار. استخدم `/api/admin/drivers` كي تنشأ هوية المستخدم وملف السائق والمركبة والصلاحيات داخل Transaction واحدة.

## إنشاء سائق ومركبة

```http
POST /api/admin/drivers
```

مثال لسائق دمشق وسيارة مسموح لهما بالعمل في سوريا والأردن فقط:

```json
{
  "firstName": "أحمد",
  "lastName": "محمود",
  "email": "driver.amman@example.com",
  "phone": "+963933000000",
  "password": "SecurePass123!",
  "licenseNumber": "SY-DL-102030",
  "avatarUrl": "https://cdn.example.com/drivers/ahmad.jpg",
  "baseRegionCode": "DAMASCUS",
  "driverRegionCodes": ["SYRIA", "JORDAN"],
  "make": "Hyundai",
  "model": "H1",
  "year": 2024,
  "color": "أبيض",
  "plateNumber": "DAM-123456",
  "seatCapacity": 7,
  "primaryImageUrl": "https://cdn.example.com/vehicles/h1-front.jpg",
  "vehicleImageUrls": [
    "https://cdn.example.com/vehicles/h1-front.jpg",
    "https://cdn.example.com/vehicles/h1-side.jpg"
  ],
  "vehicleBaseRegionCode": "DAMASCUS",
  "vehicleRegionCodes": ["SYRIA", "JORDAN"]
}
```

للتوافق مع واجهة الإدارة القديمة، الحقول الجديدة اختيارية عند الإنشاء؛ عند غيابها يستخدم النظام:

- مركز السائق والسيارة: `DAMASCUS`
- صلاحية السائق والسيارة: `SYRIA`

لكن يجب إدخال الصلاحيات صراحة للسائقين الدوليين.

بعد الإنشاء تكون حالة السائق `PENDING_REVIEW`. يعتمد عبر:

```http
PATCH /api/admin/drivers/{driverUserId}/status
```

```json
{ "status": "APPROVED" }
```

## تعديل مركز التشغيل والصلاحيات

تعديل ملف السائق:

```http
PATCH /api/admin/drivers/{driverUserId}/profile
```

```json
{
  "baseRegionCode": "AMMAN",
  "avatarUrl": "https://cdn.example.com/drivers/ahmad-new.jpg"
}
```

استبدال قائمة دول السائق المعتمدة:

```http
PUT /api/admin/drivers/{driverUserId}/regions
```

```json
{
  "regionCodes": ["JORDAN", "SYRIA"],
  "status": "APPROVED",
  "validFrom": "2026-08-01T00:00:00.000Z",
  "validUntil": "2027-08-01T00:00:00.000Z",
  "notes": "تصريح خط دمشق عمّان"
}
```

استبدال صلاحيات مركبة محددة:

```http
PUT /api/admin/drivers/{driverUserId}/vehicles/{vehicleId}/regions
```

يمكن أن تكون صلاحيات السائق أوسع من صلاحيات السيارة أو العكس، لكن المركبة لا تظهر مؤهلة إلا عند اكتمال الشرطين.

## إضافة مركبة وصورها

```http
POST /api/admin/drivers/{driverUserId}/vehicles
```

إضافة صورة معتمدة:

```http
POST /api/admin/drivers/{driverUserId}/vehicles/{vehicleId}/images
```

```json
{
  "url": "https://cdn.example.com/vehicles/car-front.jpg",
  "isPrimary": true,
  "isApproved": true,
  "sortOrder": 0
}
```

هذه النسخة تخزن **روابط صور**. رفع الملفات الثنائية إلى S3 أو Cloudinary أو تخزين محلي آمن مرحلة منفصلة.

## المواقع والمسارات

عرض المواقع والمسارات الإدارية:

```http
GET /api/admin/locations
GET /api/admin/routes
GET /api/admin/regions
```

إنشاء موقع:

```http
POST /api/admin/locations
```

إنشاء مسار:

```http
POST /api/admin/routes
```

مثال دمشق إلى عمّان:

```json
{
  "code": "DAM-AMM",
  "nameAr": "دمشق إلى عمّان",
  "originId": "UUID موقع دمشق",
  "destinationId": "UUID موقع عمّان",
  "routeType": "INTERNATIONAL",
  "requiresFlightDetails": false,
  "requiredRegionCodes": ["SYRIA", "JORDAN"],
  "isActive": true
}
```

كل اتجاه مسار مستقل لأن السعر والتشغيل قد يختلفان.

## التسعير

```http
PUT /api/pricing
```

```json
{
  "routeId": "UUID المسار",
  "bookingType": "SHARED_SEAT",
  "passengerPrice": 35,
  "driverFee": 25,
  "platformMargin": 10,
  "currency": "USD",
  "isActive": true
}
```

السعر يحسب في الخادم، ولا يعتمد على مبلغ يرسله المتصفح.

## السائقون المؤهلون

```http
GET /api/admin/routes/{routeId}/eligible-drivers?travelDate=2026-08-15T08:00:00.000Z&passengerCount=2
```

تصفية اختيارية حسب مركز التشغيل:

```http
GET /api/admin/routes/{routeId}/eligible-drivers?travelDate=2026-08-15T08:00:00.000Z&passengerCount=2&baseRegionCode=DAMASCUS
```

النتيجة تستبعد السائق أو السيارة عند:

- عدم اعتماد السائق أو تعطيل حسابه.
- عدم كفاية المقاعد.
- فقد صلاحية دولة مطلوبة.
- انتهاء أو تعليق الصلاحية.

كما تعيد معلومات تعارض الجدول حتى لا يختار المشرف سائقًا مشغولًا. يعيد الخادم التحقق مرة أخرى وقت التعيين.

## معلومات السائق للمسافر

بعد تعيين السائق يظهر في حجز المسافر:

- الاسم والصورة الشخصية.
- التقييم وعدد الرحلات المكتملة.
- مركز التشغيل.
- السيارة المحددة فعليًا للرحلة.
- الشركة والموديل والسنة واللون والسعة.
- لوحة مخفية جزئيًا.
- الصورة الرئيسية ومعرض الصور المعتمدة.

رقم الهاتف لا يظهر إلا بعد قبول السائق للمهمة. لا ترسل وثائق الهوية أو الرخصة أو تصاريح الحدود للمسافر.

## الاختبار الآلي

بعد تشغيل API والواجهة:

```powershell
pnpm test:routes
```

ينشئ الاختبار سعرًا لمسار دمشق–عمّان، وسائقًا وسيارة بصلاحية سوريا والأردن، ثم ينشئ حجزًا ويؤكده ويعين المركبة ويتحقق من ظهور السائق وصورة السيارة للمسافر.
