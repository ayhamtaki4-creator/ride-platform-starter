# دورة حياة الرحلة

المسار الطبيعي:

```text
SEARCHING_DRIVER
→ DRIVER_ASSIGNED
→ DRIVER_ARRIVING
→ DRIVER_ARRIVED
→ IN_PROGRESS
→ COMPLETED
```

حالات الإلغاء:

- `CANCELLED_BY_PASSENGER`
- `CANCELLED_BY_DRIVER`
- `NO_DRIVER_AVAILABLE`
- `PASSENGER_NO_SHOW`
- `DRIVER_NO_SHOW`

لا يتم تعديل الحالة مباشرة في قاعدة البيانات. كل تعديل يمر عبر `TripStateMachine`، ثم يُكتب سجل في `TripStatusHistory`.
