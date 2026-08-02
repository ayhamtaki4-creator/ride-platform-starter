# Milestone 3 — Real-time Admin Dispatch

## التدفق

1. ينشئ الراكب طلبًا بحالة `PENDING_DISPATCH`.
2. يبث الخادم الحدث `admin.trip.created` إلى غرفة مركز العمليات.
3. يختار المشرف سائقًا متاحًا عبر REST.
4. يبث الخادم التعيين فورًا إلى الراكب والسائق والإدارة.
5. كل انتقال في حالة الرحلة يولد حدثًا مباشرًا للأطراف المعنية.
6. يمكن للمشرف إلغاء التعيين أو نقل الرحلة إلى سائق آخر قبل بدء الرحلة.

## WebSocket

- العنوان: `/realtime`
- المصادقة: JWT عبر `handshake.auth.token`
- غرف المستخدمين: `user:{userId}`
- غرفة مركز العمليات: `role:dispatch`
- غرفة الرحلة: `trip:{tripId}`

## الأحداث

### الإدارة

- `admin.trip.created`
- `admin.trip.updated`
- `admin.driver.availability.updated`

### السائق

- `driver.trip.assigned`
- `driver.trip.updated`
- `driver.trip.unassigned`
- `driver.availability.updated`

### الراكب

- `rider.trip.updated`

### عام للرحلة

- `trip.status.updated`

## Redis

يستخدم Socket.IO Redis Adapter لنشر الأحداث بين نسخ API متعددة. إذا تعذر الاتصال بـRedis، يبدأ الخادم باستخدام Adapter داخلي في الذاكرة حتى يبقى التطوير المحلي متاحًا.

## مسارات إدارة التعيين

- `GET /api/admin/trips/pending`
- `GET /api/admin/drivers/available`
- `POST /api/admin/trips/:tripId/assign-driver`
- `POST /api/admin/trips/:tripId/unassign-driver`
- `POST /api/admin/trips/:tripId/reassign-driver`

لا يسمح بإلغاء أو إعادة التعيين بعد انتقال الرحلة إلى `IN_PROGRESS`.
