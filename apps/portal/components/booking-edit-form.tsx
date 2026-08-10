"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { reverseGeocode } from "@/lib/geocoding";
import {
  Trip,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
} from "@/lib/types";
import { InternationalPhoneInput } from "./ui/international-phone-input";
import { useToast } from "./ui/toast-provider";

const BookingLocationMap = dynamic(() => import("./booking-location-map"), { ssr: false });

type BookingEditFormProps = {
  booking: Trip;
  admin?: boolean;
  onSaved?: (booking: Trip) => void | Promise<void>;
};

type RouteBookingPolicy = {
  routeId: string;
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
  flightTimeMode: "ARRIVAL" | "DEPARTURE";
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
  const [pickupAddress, setPickupAddress] = useState(booking.pickupAddress);
  const [pickupLatitude, setPickupLatitude] = useState(booking.pickupLatitude);
  const [pickupLongitude, setPickupLongitude] = useState(booking.pickupLongitude);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoffAddress);
  const [dropoffLatitude, setDropoffLatitude] = useState(booking.dropoffLatitude);
  const [dropoffLongitude, setDropoffLongitude] = useState(booking.dropoffLongitude);
  const [mapMode, setMapMode] = useState<"pickup" | "dropoff">("pickup");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapWorking, setMapWorking] = useState(false);
  const [policy, setPolicy] = useState<RouteBookingPolicy | null>(null);
  const [policyLoaded, setPolicyLoaded] = useState(admin || !booking.routeId);

  const assigned = Boolean(booking.driver || booking.driverPublicProfile || booking.serviceRun);
  const requiresFlightDetails = Boolean(booking.route?.requiresFlightDetails);
  const minimumDate = useMemo(() => tomorrowValue(), []);
  const canEditEndpoints = !assigned;
  const canEditPickup = canEditEndpoints && (admin || Boolean(policy?.passengerCanEditPickup));
  const canEditDropoff = canEditEndpoints && (admin || Boolean(policy?.passengerCanEditDropoff));

  useEffect(() => {
    if (admin || !booking.routeId) return;
    let active = true;
    void apiFetch<RouteBookingPolicy[]>("/route-booking-policies", { skipAuth: true })
      .then((policies) => {
        if (!active) return;
        setPolicy(policies.find((item) => item.routeId === booking.routeId) ?? null);
      })
      .catch(() => {
        if (active) setPolicy(null);
      })
      .finally(() => {
        if (active) setPolicyLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [admin, booking.routeId]);

  async function selectMapLocation(point: { latitude: number; longitude: number }) {
    if ((mapMode === "pickup" && !canEditPickup) || (mapMode === "dropoff" && !canEditDropoff)) return;
    setMapWorking(true);
    let label = `موقع محدد على الخريطة (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`;
    try {
      const resolved = await reverseGeocode(point.latitude, point.longitude);
      label = resolved.label;
    } catch {
      showToast("تم تحديد النقطة، لكن تعذر جلب اسم العنوان تلقائيًا.", "info");
    }

    if (mapMode === "pickup") {
      setPickupLatitude(point.latitude);
      setPickupLongitude(point.longitude);
      setPickupAddress(label);
      if (canEditDropoff) setMapMode("dropoff");
    } else {
      setDropoffLatitude(point.latitude);
      setDropoffLongitude(point.longitude);
      setDropoffAddress(label);
    }
    setMapWorking(false);
    showToast(mapMode === "pickup" ? "تم تحديث نقطة الانطلاق." : "تم تحديث نقطة الوصول.", "success");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const endpointPayload = {
        ...(canEditPickup
          ? { pickupAddress, pickupLatitude, pickupLongitude }
          : {}),
        ...(canEditDropoff
          ? { dropoffAddress, dropoffLatitude, dropoffLongitude }
          : {}),
      };
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
            ...endpointPayload,
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

      <section style={{ display: "grid", gap: 12 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">نقاط الرحلة</span>
            <h2>الانطلاق والوصول</h2>
            <p>
              {assigned
                ? "تم تثبيت المسار بعد التعيين. ألغِ التعيين أولًا إذا كان تغيير النقاط ضروريًا."
                : !admin && policyLoaded && !canEditPickup && !canEditDropoff
                  ? "الإدارة جعلت نقطتي الانطلاق والوصول ثابتتين لهذا المسار."
                  : "يمكن تعديل النقاط المسموحة من العنوان أو الخريطة."}
            </p>
          </div>
          {canEditPickup || canEditDropoff ? (
            <button className="button" type="button" onClick={() => setMapOpen((current) => !current)}>
              {mapOpen ? "إغلاق الخريطة" : "تعديل على الخريطة"}
            </button>
          ) : null}
        </div>

        <div className="form-grid wizard-form-grid">
          <label>
            <span className="label">نقطة الانطلاق</span>
            <input
              className="input"
              value={pickupAddress}
              onChange={(event) => setPickupAddress(event.target.value)}
              disabled={!canEditPickup}
              minLength={3}
              maxLength={180}
            />
          </label>
          <label>
            <span className="label">نقطة الوصول</span>
            <input
              className="input"
              value={dropoffAddress}
              onChange={(event) => setDropoffAddress(event.target.value)}
              disabled={!canEditDropoff}
              minLength={3}
              maxLength={180}
            />
          </label>
        </div>

        {mapOpen && (canEditPickup || canEditDropoff) ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="actions">
              {canEditPickup ? (
                <button
                  className={`button compact-button ${mapMode === "pickup" ? "primary" : ""}`}
                  type="button"
                  onClick={() => setMapMode("pickup")}
                >
                  تحديد الانطلاق
                </button>
              ) : null}
              {canEditDropoff ? (
                <button
                  className={`button compact-button ${mapMode === "dropoff" ? "primary" : ""}`}
                  type="button"
                  onClick={() => setMapMode("dropoff")}
                >
                  تحديد الوصول
                </button>
              ) : null}
              {mapWorking ? <span className="muted">جارٍ تحديد العنوان...</span> : null}
            </div>
            <BookingLocationMap
              pickup={{ latitude: pickupLatitude, longitude: pickupLongitude, label: pickupAddress }}
              dropoff={{ latitude: dropoffLatitude, longitude: dropoffLongitude, label: dropoffAddress }}
              activeMode={mapMode}
              fitKey={`${booking.id}:${pickupLatitude}:${pickupLongitude}:${dropoffLatitude}:${dropoffLongitude}`}
              onSelect={selectMapLocation}
            />
          </div>
        ) : null}
      </section>

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
        <button className="button primary" type="submit" disabled={saving || (!admin && !policyLoaded)}>
          {saving ? "جارٍ الحفظ..." : !admin && !policyLoaded ? "جارٍ تحميل سياسة المسار..." : "حفظ التعديلات"}
        </button>
        <span className="muted" style={{ alignSelf: "center" }}>
          سيظهر السعر الجديد تلقائيًا إذا تغيّرت فئة السيارة أو متطلبات السعة.
        </span>
      </div>
    </form>
  );
}
