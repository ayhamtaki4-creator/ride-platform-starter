# نموذج الصلاحيات

يعتمد المشروع على ثلاثة مستويات:

1. الدور: مثل `PASSENGER` أو `DRIVER`.
2. الصلاحية: مثل `booking:create` أو `trip:update:own`.
3. ملكية المورد: الراكب يشاهد حجوزاته، والسائق يشاهد الرحلات المسندة إليه.

## الحد بين الحجز وتنفيذ الرحلة

- إنشاء طلب جديد وتسعيره يتم حصراً عبر نطاق `bookings` باستخدام `booking:create`.
- مراجعة الطلب وتأكيده أو رفضه تستخدم صلاحيات `booking:*`.
- نطاق `trips` مخصص لمرحلة التنفيذ التشغيلي بعد إنشاء الحجز: الإسناد، وصول السائق، بدء الرحلة، إكمالها أو إلغاؤها.
- `trip:create` صلاحية legacy ما زالت موجودة في بيانات seed للتوافق مع قواعد بيانات أقدم، لكنها لا تحمي أي endpoint لإنشاء رحلة ولا يجب استخدامها في تطوير تدفقات جديدة.

الأدوار الأولية:

- `PASSENGER`
- `DRIVER`
- `SUPPORT_AGENT`
- `OPERATIONS_MANAGER`
- `FINANCE_MANAGER`
- `ADMIN`
- `SUPER_ADMIN`

الصلاحيات الأساسية النشطة:

- `booking:create`
- `booking:read:own`
- `booking:read:any`
- `booking:update:any`
- `trip:read:own`
- `trip:read:any`
- `trip:accept`
- `trip:update:own`
- `trip:update:any`
- `driver:read:own`
- `driver:availability:update`
- `user:read:any`
- `user:update:any`
- `driver:review`
- `pricing:manage`
- `route:manage`
- `media:manage`
- `compliance:read`
- `compliance:manage`
- `payment:refund`
- `support:manage`
- `role:manage`
- `audit:read:any`

## ملاحظات أمنية

- فحص الصلاحيات يتم داخل API، وليس بإخفاء الأزرار فقط.
- `PermissionsGuard` يعيد قراءة حالة المستخدم وأدواره وصلاحياته الحالية من قاعدة البيانات في كل طلب محمي.
- ملكية الرحلة تُفحص داخل الخدمة حتى لو كان الدور يملك صلاحية مثل `trip:update:own`.
- السائق لا يحصل على `startPinHash` في أي استجابة.
- لا يجب إضافة أي endpoint جديد لإنشاء حجز داخل `TripsController`؛ نقطة الدخول الوحيدة للحجز هي `BookingsController`.
