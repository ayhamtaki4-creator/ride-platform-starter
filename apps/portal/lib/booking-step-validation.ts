import type { ServiceRoute } from "./admin-operations";
import type { PendingBookingForm } from "./pending-booking";

export type BookingValidationField =
  | "routeId"
  | "bookingType"
  | "vehicleClass"
  | "passengerCount"
  | "luggageCount"
  | "travelDate"
  | "flightArrivalTime"
  | "flightNumber"
  | "passengerName"
  | "passengerPhone"
  | "pickupAddress"
  | "dropoffAddress"
  | "mapLocations"
  | "notes";

export type BookingValidationIssue = {
  field: BookingValidationField;
  message: string;
};

export type BookingValidationContext = {
  form: PendingBookingForm;
  selectedRoute: ServiceRoute | null;
  priceAvailable: boolean;
  minimumDate: string;
};

const INTERNATIONAL_PHONE = /^\+[1-9][0-9]{7,14}$/;
const FLIGHT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The phone input and API both accept +CC..., 00CC..., spaces and hyphens. */
export function normalizeBookingPhone(value: string) {
  const digits = value
    .trim()
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s().-]/g, "");
  return digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
}

export function bookingPhoneError(value: string): string | null {
  const phone = normalizeBookingPhone(value);
  if (!phone) return "أدخل رقم هاتفك مع رمز الدولة حتى نتمكن من التواصل معك بشأن الرحلة.";
  if (!INTERNATIONAL_PHONE.test(phone)) {
    return "رقم الهاتف غير مكتمل أو غير صحيح. اختر الدولة وأدخل الرقم كاملًا، مثل +963944000000 أو +96171123456 (8 إلى 15 رقمًا).";
  }
  return null;
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateBookingStep(step: number, context: BookingValidationContext): BookingValidationIssue[] {
  const { form, selectedRoute, priceAvailable, minimumDate } = context;
  const issues: BookingValidationIssue[] = [];
  const add = (field: BookingValidationField, message: string) => issues.push({ field, message });

  if (step === 1) {
    if (!selectedRoute || !selectedRoute.bookable) {
      add("routeId", "اختر مسارًا متاحًا للحجز من القائمة قبل المتابعة.");
    } else if (form.bookingType !== "PRIVATE_CAR" || !selectedRoute.bookingTypes.includes(form.bookingType)) {
      add("bookingType", "نوع الحجز المتاح حاليًا هو سيارة خاصة فقط.");
    }
  }

  if (step === 2) {
    if (!selectedRoute || !selectedRoute.bookable) {
      add("routeId", "المسار المحدد لم يعد متاحًا. ارجع إلى الخطوة الأولى واختر مسارًا آخر.");
    }
    if (!form.travelDate) {
      add("travelDate", "اختر تاريخ الرحلة قبل المتابعة.");
    } else if (!isDateOnly(form.travelDate) || form.travelDate < minimumDate) {
      add("travelDate", "اختر تاريخ رحلة صحيحًا يبدأ من الغد أو بعده.");
    }
    if (form.bookingType === "PRIVATE_CAR" && !priceAvailable) {
      add("vehicleClass", "اختر حجم سيارة له سعر متاح لهذا المسار.");
    }
    if (form.bookingType === "PRIVATE_CAR") {
      const capacity = selectedRoute?.vehicleClasses?.find((item) => item.vehicleClass === form.vehicleClass)
        ?? ({ SMALL: { passengerCapacity: 3, luggageCapacity: 4 },
              MEDIUM: { passengerCapacity: 4, luggageCapacity: 5 },
              LARGE: { passengerCapacity: 8, luggageCapacity: 8 } } as const)[form.vehicleClass];
      if (!Number.isInteger(form.passengerCount) || form.passengerCount < 1 ||
          (capacity && form.passengerCount > capacity.passengerCapacity)) {
        add("passengerCount", "اختر عدد ركاب صحيحًا ضمن سعة السيارة المحددة.");
      }
      if (!Number.isInteger(form.luggageCount) || form.luggageCount < 0 ||
          (capacity && form.luggageCount > capacity.luggageCapacity)) {
        add("luggageCount", "اختر عدد حقائب صحيحًا ضمن سعة السيارة المحددة.");
      }
    }
    if (selectedRoute?.requiresFlightDetails && !form.flightArrivalTime) {
      add("flightArrivalTime", "اختر وقت وصول أو إقلاع الطائرة قبل المتابعة.");
    } else if (form.flightArrivalTime && !FLIGHT_TIME.test(form.flightArrivalTime)) {
      add("flightArrivalTime", "وقت الرحلة غير صحيح. اختر وقتًا بصيغة ساعة ودقيقة.");
    }
    if (selectedRoute?.requiresFlightDetails && !form.flightNumber.trim()) {
      add("flightNumber", "أدخل رقم الرحلة الجوية، مثل ME 265.");
    } else if (form.flightNumber.trim().length > 40) {
      add("flightNumber", "رقم الرحلة الجوية طويل جدًا؛ الحد الأقصى 40 حرفًا.");
    }
  }

  if (step === 3) {
    const name = form.passengerName.trim();
    if (!name || name.length < 3) {
      add("passengerName", "أدخل اسم المسافر الكامل (3 أحرف على الأقل).");
    } else if (name.length > 120) {
      add("passengerName", "اسم المسافر طويل جدًا؛ الحد الأقصى 120 حرفًا.");
    }

    const phoneError = bookingPhoneError(form.passengerPhone);
    if (phoneError) add("passengerPhone", phoneError);

    const pickup = form.pickupAddress.trim();
    if (pickup.length < 3 || pickup.length > 180) {
      add("pickupAddress", "اكتب عنوان انطلاق واضحًا بين 3 و180 حرفًا.");
    }
    const dropoff = form.dropoffAddress.trim();
    if (dropoff.length < 3 || dropoff.length > 180) {
      add("dropoffAddress", "اكتب عنوان وصول واضحًا بين 3 و180 حرفًا.");
    }

    if (form.useCustomMapLocations && [
      form.pickupLatitude, form.pickupLongitude, form.dropoffLatitude, form.dropoffLongitude,
    ].some((coordinate) => coordinate === null || !Number.isFinite(coordinate))) {
      add("mapLocations", "تحديد المواقع غير مكتمل. افتح الخريطة وحدد النقطتين، أو ألغِ اختيار الخريطة.");
    }
    if (form.notes.length > 1000) {
      add("notes", "الملاحظات طويلة جدًا؛ الحد الأقصى 1000 حرف.");
    }
  }
  return issues;
}
