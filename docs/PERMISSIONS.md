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
- `user:read:any`
- `user:update:any`
- `driver:review`
- `pricing:manage`
- `payment:refund`
- `support:manage`
- `role:manage`
