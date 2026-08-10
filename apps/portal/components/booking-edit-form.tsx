"use client";

import { FormEvent, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Trip,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
} from "@/lib/types";
import { InternationalPhoneInput } from "./ui/international-phone-input";
import { useToast } from "./ui/toast-provider";

type BookingEditFormProps = {
  booking: Trip;
  admin?: boolean;
  onSaved?: (booking: Trip) => void | Promise<void>;
};

const VEHICLE_CLASSES: VehicleClass[] = ["SMALL", "MEDIUM", "LARGE"];

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function tomorrowValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function BookingEditForm({ booking, admin = false, onSaved }: BookingEditFormProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [travelDate, setTravelDate] = useState(dateValue(booking.travelDate));
  const [flightArrivalTime, setFlightArrivalTime] = useState(booking.flightArrivalTime ?? "");
  const [flightNumber, setFlightNumber] = useState(booking.flightNumber ?? "");
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>(booking.vehicleClass ?? "SMALL");
  const [passengerCount, setPassengerCount] = useState(booking.passengerCount ?? 1);
  const [luggageCount, setLuggageCount] = useState(booking.luggageCount ?? 0);
  const [passengerName, setPassengerName] = useState(booking.contactName ?? "");
  const [passengerPhone, setPassengerPhone] = useState(booking.contactPhone ?? "");
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [changeNote, setChangeNote] = useState("");

  const assigned = Boolean(booking.driver || booking.driverPublicProfile || booking.serviceRun);
  const requiresFlightDetails = Boolean(booking.route?.requiresFlightDetails);
  const minimumDate = useMemo(() => tomorrowValue(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Trip>(
        admin ? `/admin/bookings/${booking.id}` : `/bookings/${booking.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            travelDate,
            flightArrivalTime: flightArrivalTime || null,
            flightNumber: flightNumber || null,
            vehicleClass,
            passengerCount,
            luggageCount,
            passengerName,
            passengerPhone,
            notes: notes || null,
            ...(admin ? { changeNote: changeNote.trim() || undefined } : {}),
          }),
        },
      );
      showToast("تم حفظ تعديلات الحجز.", "success");
      await onSaved?.(updated);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر حفظ تعديلات الحجز.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ display: "grid", gap: 18 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">تعديل الحجز</span>
          <h2>الموعد وبيانات المسافر</h2>
          <p>
            {admin
              ? "سيعاد التحقق من السعر والسعة وجدول السائق قبل الحفظ."
              : "يمكنك تعديل الحجز قبل تعيينه لسائق أو رحلة تشغيلية."}
          </p>
        </div>
      </div>

      {admin && assigned ? (
        <div className="notice warning">
          هذا الحجز معيّن للتشغيل. يجب كتابة سبب التعديل، وسيتم رفض أي تغيير يتعارض مع جدول السائق أو الرحلة التشغيلية.
        </div>
      ) : null}

      <div className="form-grid wizard-form-grid">
        <label>
          <span className="label">تاريخ الرحلة</span>
          <input
            className="input"
            type="date"
            min={minimumDate}
            value={travelDate}
            onChange={(event) => setTravelDate(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="label">{requiresFlightDetails ? "وقت وصول الطائرة" : "وقت الرحلة"}</span>
          <input
            className="input"
            type="time"
            value={flightArrivalTime}
            onChange={(event) => setFlightArrivalTime(event.target.value)}
            required={requiresFlightDetails}
          />
        </label>

        <label>
          <span className="label">رقم الرحلة الجوية</span>
          <input
            className="input"
            value={flightNumber}
            onChange={(event) => setFlightNumber(event.target.value)}
            placeholder="مثال: ME 265"
            maxLength={40}
            required={requiresFlightDetails}
          />
        </label>

        <label>
          <span className="label">فئة السيارة</span>
          <select
            className="input"
            value={vehicleClass}
            onChange={(event) => setVehicleClass(event.target.value as VehicleClass)}
            disabled={Boolean(booking.serviceRun)}
          >
            {VEHICLE_CLASSES.map((value) => (
              <option value={value} key={value}>{VEHICLE_CLASS_LABELS[value]}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="label">عدد الركاب</span>
          <input
            className="input"
            type="number"
            min={1}
            max={8}
            value={passengerCount}
            onChange={(event) => setPassengerCount(Number(event.target.value))}
            required
          />
        </label>

        <label>
          <span className="label">عدد الحقائب</span>
          <input
            className="input"
            type="number"
            min={0}
            max={12}
            value={luggageCount}
            onChange={(event) => setLuggageCount(Number(event.target.value))}
            required
          />
        </label>

        <label>
          <span className="label">اسم المسافر</span>
          <input
            className="input"
            value={passengerName}
            onChange={(event) => setPassengerName(event.target.value)}
            minLength={3}
            maxLength={120}
            required
          />
        </label>

        <label>
          <span className="label">رقم الهاتف</span>
          <InternationalPhoneInput
            value={passengerPhone}
            onChange={setPassengerPhone}
            required
            name="booking-edit-phone"
          />
        </label>
      </div>

      <label>
        <span className="label">ملاحظات الحجز</span>
        <textarea
          className="input"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          placeholder="أي معلومات يجب أن يعرفها مركز العمليات أو السائق"
        />
      </label>

      {admin ? (
        <label>
          <span className="label">سبب التعديل {assigned ? "*" : ""}</span>
          <textarea
            className="input"
            rows={3}
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
            maxLength={500}
            required={assigned}
            placeholder="مثال: تأخر موعد وصول الطائرة بناءً على اتصال المسافر"
          />
        </label>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="button primary" type="submit" disabled={saving}>
          {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
        </button>
        <span className="muted" style={{ alignSelf: "center" }}>
          سيظهر السعر الجديد تلقائيًا إذا تغيّرت فئة السيارة أو متطلبات السعة.
        </span>
      </div>
    </form>
  );
}
