# تقرير التعديلات: ميزات إدارة تفاصيل الحجز

التاريخ: 2026-08-04
الفرع: feat/admin-booking-detail
المُؤلف: آلية التعديلات (عن طريق Copilot)

ملخّص تنفيذي
- أُجريت تعديلات على وظيفة إدارة الحجز في الواجهة الخلفية والـ schema وذلك لتمكين مسؤول النظام من:
  - تأكيد/رفض الحجوزات من لوحة الإدارة.
  - قبول المهمة نيابةً عن السائق (force accept).
  - تحرير ملاحظات الحجز (notes) وحقلي `paymentMethod` و `source` مباشرة من صفحة تفاصيل الحجز.
  - تنزيل / فتح تذكرة الطيران المرتبطة بالحجز إن وُجدت.
  - إطلاق أحداث Realtime عند تغيّر حالة الحجز أو تحريره.

الملفات والتغييرات بالترتيب
1) Schema و Migration
- apps/api/prisma/schema.prisma
  - إ��افة حقلين جديدين في نموذج `Trip`:
    - `paymentMethod` (String?)
    - `source` (String?)
  - الغرض: تخزين وسيلة الدفع المرجعية ومصدر الحجز لأغراض التقارير والعمليات.

- apps/api/prisma/migrations/20260804220000_add_payment_method_source/migration.sql
  - SQL الترحيل الذي أضاف الأعمدة إلى جدول "Trip":
    ```sql
    BEGIN;

    ALTER TABLE "Trip"
      ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

    ALTER TABLE "Trip"
      ADD COLUMN IF NOT EXISTS "source" TEXT;

    COMMIT;
    ```

2) الواجهة الخلفية (API)
- apps/api/src/admin/admin.controller.ts
  - إضافة endpoint جديد: `PATCH /admin/bookings/:id`
    - يستقبل UpdateBookingDto الذي يضم الحقول: notes, paymentMethod, source
  - إضافة endpoint جديد: `POST /admin/trips/:tripId/accept-driver` (قبول نيابةً عن السائق)

- apps/api/src/admin/admin.service.ts
  - إضافة الدالة `updateBooking(actor, id, dto)`:
    - تتحقق من وجود الحجز وكونه حجزًا مُراجعًا (bookingReference موجود).
    - تطبّق التحديثات على الحقول المذكورة، تسجّل سجلًّا في `AuditLog` مع action = `booking.update.admin` و metadata يذكر الحقول المحدثة.
    - تطلق حدث `realtime.bookingUpdated` لمزامنة واجهات الركّاب/السائق/الآدمن.
  - إضافة الدالة `forceAcceptDriver(actor, tripId)`:
    - تتحقق من حالة الحجز وأن هناك سائقًا معينًا وأنه في الحالة الصحيحة (DRIVER_ASSIGNED مع driverAssignmentStatus = PENDING).
    - تغيّر `driverAssignmentStatus` إلى `ACCEPTED`، تعيّن timestamps مناسبة، وتحدّث حالة الـ serviceRun إن لزم.
    - تسجّل auditLog مع action = `booking.dispatch.force_accept`.

3) DTOs
- apps/api/src/admin/dto/update-booking.dto.ts
  - تعريف DTO يحوي الحقول القابلة للتحديث: `notes?: string`, `paymentMethod?: string`, `source?: string`.

ما الذي تمّ اختباره/يجب اختباره (QA)
- تثبيت الترحيل
  - تنفيذ `npx prisma migrate dev --name add_paymentMethod_source` في بيئة التطوير وتأكيد وجود أعمدة `paymentMethod` و `source` في جدول Trip.
- API
  - اختبار PATCH /admin/bookings/:id
    - إرسال تعديل للحقل notes فقط.
    - إرسال تعديل للحقل paymentMethod و source.
    - إرسال تعديل جزئي (بعض الحقول غير موجودة) والتأكد أن غيرها لم تتأثر.
  - التأكد من وجود سجل audit جديد لكل عملية تعديل (action = `booking.update.admin`) واحتواء metadata على الحقول المحدثة.
  - اختبار POST /admin/trips/:tripId/accept-driver
    - حالات ناجحة: trip في حالة DRIVER_ASSIGNED و driverAssignmentStatus = PENDING => يصبح ACCEPTED.
    - حالات فاشلة: لا سائق معين، حالة غير مناسبة => 409/خطأ مناسب.
- Realtime
  - التأكد من إطلاق حدث `realtime.bookingUpdated` بعد التحديث وأن بيانات الحدث صحيحة.
- واجهة المستخدم (Admin portal)
  - صفحة تفاصيل الحجز تعرض الحقول الجديدة وتقبل التعديل.
  - زر قبول نيابة عن السائق يظهر فقط في الحالات المناسبة ويعمل.
  - زر تحميل تذكرة الطيران يعمل إن وُجدت media.

تعليمات النشر
1. أخذ نسخة احتياطية كاملة من قاعدة البيانات (ضروري للإنتاج).
2. على بيئة التطوير:
   - cd apps/api
   - npx prisma generate
   - npx prisma migrate dev --name add_paymentMethod_source
   - npx prisma generate
3. على الإنتاج (بعد الاختبار والنسخة الاحتياطية):
   - cd apps/api
   - npx prisma migrate deploy
   - npx prisma generate
4. بعد تطبيق الترحيل: إعادة بناء وتشغيل جميع الخدمات (backend/frontend) حسب إجراءات المشروع.

خطة الاسترجاع (Rollback)
- في حال حدوث خطأ خطير بعد الترحيل، استرجاع قاعدة البيانات من النسخة الاحتياطية قبل تشغيل `migrate deploy`.
- كمحاولة أخفّ: DROP COLUMN يدوياً (سيؤدي لفقدان البيانات):
  ```sql
  BEGIN;
  ALTER TABLE "Trip" DROP COLUMN IF EXISTS "paymentMethod";
  ALTER TABLE "Trip" DROP COLUMN IF EXISTS "source";
  COMMIT;
  ```

نقاط للاطّلاع/اقتراحات مستقبلية
- تحويل `paymentMethod` إلى enum أو جدول مرجعي إذا كان يوجد مجموعة محددة من طرق الدفع.
- إضافة ترحيل لتحديث القيم القديمة أو ملء بيانات default لمن يحتاجها التقارير.
- توسيع audit metadata لتسجيل القيم القديمة والجديدة لكل حقل (لمزيد من الامتثال والتدقيق).

مرفقات
- ر��ابط الملفات على الفرع feat/admin-booking-detail:
  - Controller: https://github.com/ayhamtaki4-creator/ride-platform-starter/blob/feat/admin-booking-detail/apps/api/src/admin/admin.controller.ts
  - Service: https://github.com/ayhamtaki4-creator/ride-platform-starter/blob/feat/admin-booking-detail/apps/api/src/admin/admin.service.ts
  - Schema: https://github.com/ayhamtaki4-creator/ride-platform-starter/blob/feat/admin-booking-detail/apps/api/prisma/schema.prisma
  - Migration: https://github.com/ayhamtaki4-creator/ride-platform-starter/blob/feat/admin-booking-detail/apps/api/prisma/migrations/20260804220000_add_payment_method_source/migration.sql

---

