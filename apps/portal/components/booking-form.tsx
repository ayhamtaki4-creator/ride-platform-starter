"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";
import { Icon } from "./ui/icon";
import { useToast } from "./ui/toast-provider";
import { apiFetch } from "@/lib/api";
import { ServiceRoute, ROUTE_TYPE_LABELS } from "@/lib/admin-operations";
import { BookingQuote, BookingType, BOOKING_TYPE_LABELS, Trip, VEHICLE_CLASS_LABELS } from "@/lib/types";

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const stepTitles = ["المسار", "الموعد", "بيانات المسافر", "المراجعة"];

type CapacityPolicy = NonNullable<ServiceRoute["capacityPolicy"]>;

const DEFAULT_CAPACITY_POLICY: CapacityPolicy = {
  minPassengers: 1,
  maxPassengers: 12,
  minLuggage: 0,
  maxLuggage: 24,
  standardMaxPassengers: 4,
  standardMaxLuggage: 6,
};

type BookingFormState = {
  routeId: string;
  bookingType: BookingType;
  travelDate: string;
  flightArrivalTime: string;
  flightNumber: string;
  passengerCount: number;
  luggageCount: number;
  pickupAddress: string;
  dropoffAddress: string;
  passengerName: string;
  passengerPhone: string;
  notes: string;
};

function formatMoney(value: number, currency: string) {
  return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function BookingForm({ onCreated }: { onCreated?: (booking: Trip) => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BookingFormState>({
    routeId: "",
    bookingType: "SHARED_SEAT",
    travelDate: tomorrow,
    flightArrivalTime: "",
    flightNumber: "",
    passengerCount: 1,
    luggageCount: 1,
    pickupAddress: "",
    dropoffAddress: "",
    passengerName: "",
    passengerPhone: "",
    notes: "",
  });
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [createdBooking, setCreatedBooking] = useState<Trip | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const selectedRoute = useMemo(() => routes.find((route) => route.id === form.routeId) ?? null, [form.routeId, routes]);
  const availableBookingTypes = selectedRoute?.bookingTypes ?? [];
  const isPassenger = Boolean(user?.roles.includes("PASSENGER"));
  const capacityPolicy = selectedRoute?.capacityPolicy ?? DEFAULT_CAPACITY_POLICY;
  const requiresFamilyVehicle = form.bookingType === "PRIVATE_CAR"
    && (form.passengerCount > capacityPolicy.standardMaxPassengers
      || form.luggageCount > capacityPolicy.standardMaxLuggage);

  useEffect(() => {
    void apiFetch<ServiceRoute[]>("/routes", { skipAuth: true })
      .then((data) => {
        setRoutes(data);
        const first = data.find((route) => route.bookable);
        if (first) {
          setForm((current) => ({
            ...current,
            routeId: current.routeId || first.id,
            bookingType: first.bookingTypes.includes(current.bookingType) ? current.bookingType : first.bookingTypes[0] ?? "SHARED_SEAT",
            pickupAddress: current.pickupAddress || first.origin.nameAr,
            dropoffAddress: current.dropoffAddress || first.destination.nameAr,
          }));
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "تعذر تحميل المسارات."));
  }, []);

  useEffect(() => {
    if (user && !form.passengerName) {
      setForm((current) => ({ ...current, passengerName: `${user.firstName} ${user.lastName}` }));
    }
  }, [form.passengerName, user]);

  function chooseRoute(route: ServiceRoute) {
    const bookingType = route.bookingTypes.includes(form.bookingType) ? form.bookingType : route.bookingTypes[0] ?? "SHARED_SEAT";
    setForm((current) => ({
      ...current,
      routeId: route.id,
      bookingType,
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      flightArrivalTime: route.requiresFlightDetails ? current.flightArrivalTime : "",
      flightNumber: route.requiresFlightDetails ? current.flightNumber : "",
    }));
    setQuote(null);
    setError("");
  }

  function update<K extends keyof BookingFormState>(key: K, value: BookingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (["routeId", "bookingType", "passengerCount", "luggageCount"].includes(key)) setQuote(null);
    setError("");
  }

  function validateStep() {
    if (step === 1 && !selectedRoute) {
      setError("اختر مسارًا متاحًا للحجز.");
      return false;
    }
    if (step === 2 && !form.travelDate) {
      setError("حدد تاريخ الرحلة.");
      return false;
    }
    if (
      step === 2
      && (!Number.isInteger(form.passengerCount)
        || form.passengerCount < capacityPolicy.minPassengers
        || form.passengerCount > capacityPolicy.maxPassengers)
    ) {
      setError(`عدد الركاب يجب أن يكون بين ${capacityPolicy.minPassengers} و${capacityPolicy.maxPassengers}.`);
      return false;
    }
    if (
      step === 2
      && (!Number.isInteger(form.luggageCount)
        || form.luggageCount < capacityPolicy.minLuggage
        || form.luggageCount > capacityPolicy.maxLuggage)
    ) {
      setError(`عدد الحقائب يجب أن يكون بين ${capacityPolicy.minLuggage} و${capacityPolicy.maxLuggage}.`);
      return false;
    }
    if (step === 2 && selectedRoute?.requiresFlightDetails && (!form.flightArrivalTime || !form.flightNumber.trim())) {
      setError("هذا المسار يتطلب وقت ورقم الرحلة الجوية.");
      return false;
    }
    if (step === 3 && (!form.passengerName.trim() || !form.passengerPhone.trim())) {
      setError("أدخل اسم المسافر ورقم الهاتف.");
      return false;
    }
    if (step === 3 && (!form.pickupAddress.trim() || !form.dropoffAddress.trim())) {
      setError("أدخل عنوان الالتقاط والوصول.");
      return false;
    }
    return true;
  }

  async function loadQuote() {
    if (!form.routeId) return null;
    setWorking(true); setError("");
    try {
      const params = new URLSearchParams({
        routeId: form.routeId,
        bookingType: form.bookingType,
        passengerCount: String(form.passengerCount),
        luggageCount: String(form.luggageCount),
      });
      const data = await apiFetch<BookingQuote>(`/bookings/quote?${params}`, { skipAuth: true });
      setQuote(data);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السعر.");
      return null;
    } finally { setWorking(false); }
  }

  async function nextStep() {
    if (!validateStep()) return;
    if (step === 3 && !(quote ?? await loadQuote())) return;
    setStep((current) => Math.min(4, current + 1));
    document.getElementById("booking-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step !== 4) { await nextStep(); return; }
    if (!isPassenger) { setError("سجل الدخول بحساب مسافر قبل إرسال الحجز."); return; }
    setWorking(true); setError("");
    try {
      const booking = await apiFetch<Trip>("/bookings", { method: "POST", body: JSON.stringify(form) });
      setCreatedBooking(booking);
      showToast(`تم إرسال الحجز ${booking.bookingReference ?? ""}.`, "success");
      onCreated?.(booking);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تعذر إرسال الحجز.";
      setError(message);
      showToast(message, "error");
    } finally { setWorking(false); }
  }

  if (createdBooking) {
    return <section id="booking-card" className="booking-wizard booking-success-card"><div className="success-symbol"><Icon name="check" size={36} /></div><div className="eyebrow-v2">تم إرسال الطلب</div><h3>وصل حجزك إلى مركز العمليات</h3><p>سيتم مراجعته وتعيين سائق ومركبة مؤهلين للمسار والدول المطلوبة.</p><div className="booking-reference-box"><small>رقم الحجز</small><strong>{createdBooking.bookingReference ?? createdBooking.id.slice(0, 8)}</strong></div><div className="success-summary-grid"><div><span>المسار</span><strong>{createdBooking.route?.nameAr ?? selectedRoute?.nameAr}</strong></div><div><span>التاريخ</span><strong>{new Date(createdBooking.travelDate ?? form.travelDate).toLocaleDateString("ar")}</strong></div><div><span>السعر</span><strong>{quote ? formatMoney(quote.passengerPrice, quote.currency) : `${createdBooking.estimatedFare} ${createdBooking.currency}`}</strong></div></div><div className="wizard-actions centered-actions"><button className="button" type="button" onClick={() => { setCreatedBooking(null); setStep(1); setQuote(null); }}>حجز رحلة أخرى</button><Link className="button primary" href="/rider">متابعة حجوزاتي</Link></div></section>;
  }

  return (
    <form id="booking-card" className="booking-wizard" onSubmit={submit}>
      <div className="wizard-header"><div><span className="wizard-step-label">الخطوة {step} من 4</span><h3>{stepTitles[step - 1]}</h3></div><span className="wizard-secure"><Icon name="shield" size={17} />حجز آمن</span></div>
      <ol className="wizard-progress">{stepTitles.map((title, index) => { const number = index + 1; return <li className={`${number < step ? "is-done" : ""} ${number === step ? "is-current" : ""}`} key={title}><span>{number < step ? <Icon name="check" size={16} /> : number}</span><small>{title}</small></li>; })}</ol>
      <div className="wizard-body">
        {step === 1 ? <div className="wizard-pane"><div className="pane-heading"><h4>اختر خط الرحلة</h4><p>تظهر هنا المسارات الفعالة التي لديها سعر متاح.</p></div>{routes.length === 0 ? <div className="empty-state">لا توجد مسارات قابلة للحجز حاليًا.</div> : <div className="dynamic-route-grid">{routes.filter((route) => route.bookable).map((route) => <button className={`route-choice-card ${route.id === form.routeId ? "is-selected" : ""}`} type="button" key={route.id} onClick={() => chooseRoute(route)}><span className="choice-icon"><Icon name={route.requiresFlightDetails ? "plane" : "route"} size={24} /></span><span><strong>{route.nameAr}</strong><small>{ROUTE_TYPE_LABELS[route.routeType]} · {route.estimatedMinutes ? `${route.estimatedMinutes} دقيقة` : "المدة حسب التشغيل"}</small></span>{route.id === form.routeId ? <Icon name="check" size={18} /> : null}</button>)}</div>}<div className="pane-heading secondary-pane-heading"><h4>نوع الحجز</h4></div><div className="choice-grid">{availableBookingTypes.map((value) => <button className={`choice-card ${form.bookingType === value ? "is-selected" : ""}`} type="button" key={value} onClick={() => update("bookingType", value)}><span className="choice-icon"><Icon name={value === "SHARED_SEAT" ? "users" : "car"} size={24} /></span><span><strong>{BOOKING_TYPE_LABELS[value]}</strong><small>{value === "SHARED_SEAT" ? "السعر لكل مسافر" : "المركبة كاملة"}</small></span></button>)}</div></div> : null}
        {step === 2 ? (
          <div className="wizard-pane">
            <div className="pane-heading">
              <h4>موعد الرحلة والسعة</h4>
              <p>{selectedRoute?.requiresFlightDetails ? "بيانات الطائرة مطلوبة لهذا المسار." : "بيانات الطائرة اختيارية لهذا المسار."}</p>
            </div>
            <div className="form-grid wizard-form-grid">
              <label>
                <span className="label">تاريخ الرحلة</span>
                <input className="input" type="date" min={tomorrow} value={form.travelDate} onChange={(e) => update("travelDate", e.target.value)} required />
              </label>
              <label>
                <span className="label">عدد المسافرين</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={capacityPolicy.minPassengers}
                  max={capacityPolicy.maxPassengers}
                  value={form.passengerCount}
                  onChange={(e) => update("passengerCount", Number(e.target.value))}
                  required
                />
                <small className="field-help">من {capacityPolicy.minPassengers} إلى {capacityPolicy.maxPassengers} راكبًا.</small>
              </label>
              <label>
                <span className="label">وقت الطائرة</span>
                <input className="input" type="time" value={form.flightArrivalTime} onChange={(e) => update("flightArrivalTime", e.target.value)} required={selectedRoute?.requiresFlightDetails} />
              </label>
              <label>
                <span className="label">رقم الرحلة الجوية</span>
                <input className="input" value={form.flightNumber} onChange={(e) => update("flightNumber", e.target.value)} required={selectedRoute?.requiresFlightDetails} />
              </label>
              <label>
                <span className="label">عدد الحقائب</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={capacityPolicy.minLuggage}
                  max={capacityPolicy.maxLuggage}
                  value={form.luggageCount}
                  onChange={(e) => update("luggageCount", Number(e.target.value))}
                  required
                />
                <small className="field-help">من {capacityPolicy.minLuggage} إلى {capacityPolicy.maxLuggage} حقيبة.</small>
              </label>
            </div>
            <div className={`capacity-policy-card ${requiresFamilyVehicle ? "is-family" : ""}`} aria-live="polite">
              <span className="capacity-policy-icon"><Icon name="car" size={24} /></span>
              <div>
                <strong>
                  {form.bookingType === "PRIVATE_CAR"
                    ? `الاختيار الحالي: ${requiresFamilyVehicle ? "سيارة عائلية" : "سيارة عادية"}`
                    : "الحجز الحالي: مقاعد مشتركة"}
                </strong>
                {form.bookingType === "PRIVATE_CAR" ? (
                  <p>
                    السيارة العادية حتى {capacityPolicy.standardMaxPassengers} ركاب و{capacityPolicy.standardMaxLuggage} حقائب.
                    عند تجاوز أي حد يختار النظام السيارة العائلية وسعرها تلقائيًا.
                  </p>
                ) : (
                  <p>يُحسب السعر لكل مسافر، ويُراجع النظام سعة المركبة قبل تعيينها.</p>
                )}
                <small>
                  الحد الأعلى للحجز الإلكتروني: {capacityPolicy.maxPassengers} راكبًا و{capacityPolicy.maxLuggage} حقيبة.
                </small>
              </div>
            </div>
          </div>
        ) : null}
        {step === 3 ? <div className="wizard-pane"><div className="pane-heading"><h4>بيانات المسافر والعناوين</h4></div><div className="form-grid wizard-form-grid"><label><span className="label">الاسم الكامل</span><input className="input" value={form.passengerName} onChange={(e) => update("passengerName", e.target.value)} required /></label><label><span className="label">رقم الهاتف</span><input className="input" value={form.passengerPhone} onChange={(e) => update("passengerPhone", e.target.value)} placeholder="+963..." required /></label><label><span className="label">عنوان الالتقاط</span><input className="input" value={form.pickupAddress} onChange={(e) => update("pickupAddress", e.target.value)} required /></label><label><span className="label">عنوان الوصول</span><input className="input" value={form.dropoffAddress} onChange={(e) => update("dropoffAddress", e.target.value)} required /></label><label className="full-width"><span className="label">ملاحظات</span><textarea className="input" rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label></div></div> : null}
        {step === 4 ? <div className="wizard-pane"><div className="pane-heading"><h4>راجع طلبك</h4><p>السعر مأخوذ من قاعدة السعر الفعالة للمسار.</p></div><div className="review-grid"><div><span>المسار</span><strong>{selectedRoute?.nameAr}</strong></div><div><span>نوع الحجز</span><strong>{BOOKING_TYPE_LABELS[form.bookingType]}</strong></div><div><span>فئة السيارة</span><strong>{quote ? VEHICLE_CLASS_LABELS[quote.vehicleClass] : "—"}</strong></div><div><span>التاريخ</span><strong>{new Date(form.travelDate).toLocaleDateString("ar")}</strong></div><div><span>المسافرون والحقائب</span><strong>{form.passengerCount} مسافر · {form.luggageCount} حقيبة</strong></div><div><span>الانطلاق</span><strong>{form.pickupAddress}</strong></div><div><span>الوصول</span><strong>{form.dropoffAddress}</strong></div></div><div className="quote-card"><span>السعر التقديري</span><strong>{quote ? formatMoney(quote.passengerPrice, quote.currency) : "—"}</strong></div>{!isPassenger ? <div className="notice">يجب تسجيل الدخول بحساب مسافر لإرسال الطلب.</div> : null}</div> : null}
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="wizard-actions">{step > 1 ? <button className="button" type="button" onClick={() => setStep((current) => current - 1)}>السابق</button> : <span />}{step < 4 ? <button className="button primary" type="button" disabled={working} onClick={() => void nextStep()}>التالي</button> : isPassenger ? <button className="button primary" type="submit" disabled={working}>{working ? "جارٍ الإرسال..." : "إرسال الحجز"}</button> : <Link className="button primary" href="/login">تسجيل الدخول</Link>}</div>
    </form>
  );
}
