# Fleet Compliance and Media

هذه المرحلة تضيف رفع الملفات الفعلي، مراجعة صور السائق والمركبة، ووثائق أهلية منفصلة للسائق والمركبة. أهلية المسار الدولي أصبحت تعتمد على:

1. صلاحيات المناطق في `DriverRegionAccess` و`VehicleRegionAccess`.
2. متطلبات الوثائق الفعالة لكل منطقة.
3. اعتماد الوثيقة وعدم انتهاء صلاحيتها عند تاريخ الرحلة.
4. الحد الأدنى المتبقي من الصلاحية، مثل سبعة أيام.

## التخزين

في بيئة التطوير تحفظ الملفات داخل:

```text
apps/api/storage/media
```

يمكن تغيير المسار عبر:

```env
MEDIA_STORAGE_ROOT="./storage/media"
MEDIA_MAX_FILE_MB="10"
PUBLIC_API_URL="http://localhost:4000"
COMPLIANCE_EXPIRY_CHECK_MINUTES="60"
```

على الهاتف أو الشبكة المحلية يجب أن تكون `PUBLIC_API_URL` عنوان الكمبيوتر، مثل:

```env
PUBLIC_API_URL="http://192.168.1.106:4000"
```

الملفات المدعومة: `JPG`, `PNG`, `WEBP`, `PDF`. يتحقق الخادم من نوع MIME ومن ترويسة الملف الفعلية، ولا يعتمد على اسم الملف فقط.

## الخصوصية

- صور السائق والسيارة: `PUBLIC` بعد الاعتماد.
- وثائق الهوية والرخص والتصاريح: `PRIVATE` دائمًا.
- الوثائق الخاصة لا تعرض عبر رابط عام.
- الوصول إلى ملف خاص يتطلب صلاحية `media:manage`.

## رفع ملف

```http
POST /api/admin/media/upload
Content-Type: multipart/form-data
```

الحقول:

```text
file
purpose = DRIVER_AVATAR | VEHICLE_IMAGE | DRIVER_DOCUMENT | VEHICLE_DOCUMENT | OTHER
visibility = PUBLIC | PRIVATE
```

الوثائق تفرض `PRIVATE` تلقائيًا حتى عند إرسال قيمة أخرى.

بعد الرفع تكون الحالة:

```text
PENDING
```

اعتماد أو رفض الملف:

```http
POST /api/admin/media/{id}/approve
POST /api/admin/media/{id}/reject
DELETE /api/admin/media/{id}
```

## ربط صورة السائق

ارفع ملفًا بغرض `DRIVER_AVATAR`، ثم:

```http
POST /api/admin/drivers/{driverId}/avatar
```

```json
{
  "mediaAssetId": "UUID"
}
```

بعد اعتماد الملف يظهر للمسافر عبر:

```text
/api/media/public/{mediaAssetId}
```

## ربط صورة المركبة

ارفع ملفًا بغرض `VEHICLE_IMAGE`، ثم:

```http
POST /api/admin/drivers/{driverId}/vehicles/{vehicleId}/media-images
```

```json
{
  "mediaAssetId": "UUID",
  "isPrimary": true,
  "sortOrder": 0
}
```

لا تظهر الصورة للمسافر قبل اعتماد ملف الوسائط.

## وثائق السائق

```http
GET  /api/admin/drivers/{driverId}/documents
POST /api/admin/drivers/{driverId}/documents
PATCH /api/admin/drivers/{driverId}/documents/{documentId}
POST /api/admin/drivers/{driverId}/documents/{documentId}/approve
POST /api/admin/drivers/{driverId}/documents/{documentId}/reject
```

مثال تصريح دخول الأردن:

```json
{
  "documentType": "REGION_ENTRY_PERMIT",
  "regionCode": "JORDAN",
  "documentNumber": "DRV-JO-12345",
  "issuedAt": "2026-08-01T00:00:00.000Z",
  "expiresAt": "2027-08-01T00:00:00.000Z",
  "mediaAssetId": "UUID ملف DRIVER_DOCUMENT"
}
```

## وثائق المركبة

```http
GET  /api/admin/vehicles/{vehicleId}/documents
POST /api/admin/vehicles/{vehicleId}/documents
PATCH /api/admin/vehicles/{vehicleId}/documents/{documentId}
POST /api/admin/vehicles/{vehicleId}/documents/{documentId}/approve
POST /api/admin/vehicles/{vehicleId}/documents/{documentId}/reject
```

استخدم ملفًا مرفوعًا بغرض `VEHICLE_DOCUMENT`.

## متطلبات الوثائق

```http
GET /api/admin/compliance/requirements
PUT /api/admin/compliance/requirements
```

مثال:

```json
{
  "regionCode": "JORDAN",
  "subject": "DRIVER",
  "documentType": "REGION_ENTRY_PERMIT",
  "minValidityDays": 7,
  "regionScoped": true,
  "isActive": true
}
```

`regionScoped=true` يعني أن وثيقة الأردن لا تحقق متطلب لبنان والعكس صحيح.

الـSeed يضيف:

- تصريح دخول إقليمي للسائق إلى الأردن: فعال.
- تصريح دخول إقليمي للمركبة إلى الأردن: فعال.
- تصريح دخول إقليمي للسائق إلى لبنان: فعال.
- تصريح دخول إقليمي للمركبة إلى لبنان: فعال.
- متطلبات الرخصة والتسجيل والتأمين داخل سوريا: موجودة لكنها غير فعالة افتراضيًا، لتجنب تعطيل البيانات القديمة قبل استكمال رفع وثائقها.

## انتهاء الصلاحية

الخادم يفحص الوثائق دوريًا، ويحوّل الوثيقة المنتهية من `APPROVED` إلى `EXPIRED`.

```http
GET  /api/admin/compliance/expiring?days=30
POST /api/admin/compliance/refresh-expired
```

عند انتهاء تصريح إقليمي وعدم وجود تصريح بديل ساري، تتحول صلاحية المنطقة المرتبطة إلى `EXPIRED`، ويختفي السائق أو المركبة من قائمة المؤهلين.

## التحقق عند التعيين

يطبق التحقق في موضعين:

```http
GET /api/admin/routes/{routeId}/eligible-drivers
POST /api/admin/trips/{tripId}/assign-driver
```

لذلك لا يمكن تجاوز التحقق بإرسال طلب يدوي مباشرة إلى API التعيين.

## الاختبار

بعد تشغيل API:

```powershell
pnpm test:compliance
```

الاختبار ينشئ سائقًا وسيارة لمسار دمشق–عمّان، ويتأكد من عدم أهليتهما قبل رفع التصاريح، ثم يرفع التصاريح والصور ويعتمدها، ويتحقق من الأهلية وظهور صورة السائق والسيارة للمسافر.
