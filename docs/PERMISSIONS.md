# نموذج الصلاحيات

يعتمد المشروع على ثلاثة مستويات:

1. الدور: مثل `PASSENGER` أو `DRIVER`.
2. الصلاحية: مثل `trip:create`.
3. ملكية المورد: الراكب يشاهد رحلاته، والسائق يشاهد الرحلات المسندة إليه.

الأدوار الأولية:

- `PASSENGER`
- `DRIVER`
- `SUPPORT_AGENT`
- `OPERATIONS_MANAGER`
- `FINANCE_MANAGER`
- `ADMIN`
- `SUPER_ADMIN`

الصلاحيات الأولية:

- `trip:create`
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
- `payment:refund`
- `support:manage`
- `role:manage`
- `audit:read:any`

## ملاحظات أمنية

- فحص الصلاحيات يتم داخل API، وليس بإخفاء الأزرار فقط.
- `PermissionsGuard` يعيد قراءة حالة المستخدم وأدواره وصلاحياته الحالية من قاعدة البيانات في كل طلب محمي.
- ملكية الرحلة تُفحص داخل الخدمة حتى لو كان الدور يملك صلاحية عامة مثل `trip:update:own`.
- السائق لا يحصل على `startPinHash` في أي استجابة.
