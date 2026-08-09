"use client";

import { ROUTE_TYPE_LABELS, ServiceRoute, VehicleClassConfig } from "@/lib/admin-operations";
import { apiFetch, apiUpload } from "@/lib/api";
import { reverseGeocode } from "@/lib/geocoding";
import { formatUploadSize, optimizeMobileImageUpload } from "@/lib/mobile-image-upload";
import {
  clearPendingBooking,
  createPendingBookingId,
  deletePendingTicket,
  loadPendingBooking,
  loadPendingTicket,
  PendingBooking,
  PendingBookingForm,
  savePendingBooking,
  storePendingTicket,
} from "@/lib/pending-booking";
import {
  BOOKING_TYPE_LABELS,
  BookingQuote,
  BookingType,
  FlightTicketExtraction,
  FlightTicketUploadResponse,
  Trip,
  VEHICLE_CLASS_LABELS,
  VehicleClass,
} from "@/lib/types";
import { format, parse } from "date-fns";
import { ar } from "date-fns/locale";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FormEvent, forwardRef, useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import { useAuth } from "./auth-provider";
import { Icon } from "./ui/icon";
import { InternationalPhoneInput } from "./ui/international-phone-input";
import { useToast } from "./ui/toast-provider";

const BookingLocationMap = dynamic(() => import("./booking-location-map"), { ssr: false });

const tomorrowDate = new Date();
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
tomorrowDate.setHours(0, 0, 0, 0);
const tomorrow = format(tomorrowDate, "yyyy-MM-dd");
const stepTitles = ["المسار", "الموعد والسيارة", "بيانات المسافر", "المراجعة"];
const MAX_TICKET_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
const DEFAULT_VEHICLE_CLASSES: VehicleClassConfig[] = [
  { vehicleClass: "SMALL", passengerCapacity: 3, luggageCapacity: 4 },
  { vehicleClass: "MEDIUM", passengerCapacity: 4, luggageCapacity: 5 },
  { vehicleClass: "LARGE", passengerCapacity: 8, luggageCapacity: 8 },
];

type RouteBookingPolicy = {
  routeId: string;
  passengerCanEditPickup: boolean;
  passengerCanEditDropoff: boolean;
  flightTimeMode: "ARRIVAL" | "DEPARTURE";
};

type FlightTicketAnalysisResponse = {
  extraction: FlightTicketExtraction;
};

type BookingFormState = PendingBookingForm;
type PickerButtonProps = {
  value?: string;
  onClick?: () => void;
  placeholder?: string;
};

const PickerButton = forwardRef<HTMLButtonElement, PickerButtonProps>(
  ({ value, onClick, placeholder }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="input date-time-picker-input"
      style={{
        width: "100%",
        textAlign: "right",
        cursor: "pointer",
        font: "inherit",
        color: value ? "inherit" : "#6b7280",
      }}
    >
      {value || placeholder}
    </button>
  ),
);

PickerButton.displayName = "PickerButton";

function formatMoney(value: number, currency: string) {
  return `${new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function formatArrivalDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-SY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function parseDateValue(value: string) {
  if (!value) return null;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeValue(value: string) {
  if (!value) return null;
  const time = parse(value, "HH:mm", new Date());
  return Number.isNaN(time.getTime()) ? null : time;
}

function numericCoordinate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function preferredBookingType(route: ServiceRoute, current?: BookingType): BookingType {
  if (current && route.bookingTypes.includes(current)) return current;
  if (route.bookingTypes.includes("PRIVATE_CAR")) return "PRIVATE_CAR";
  return route.bookingTypes[0] ?? "PRIVATE_CAR";
}

function firstPricedVehicleClass(route: ServiceRoute, bookingType: BookingType): VehicleClass {
  if (bookingType !== "PRIVATE_CAR") return "SMALL";
  return (
    DEFAULT_VEHICLE_CLASSES.find((config) =>
      route.pricingRules.some(
        (rule) =>
          rule.bookingType === bookingType &&
          rule.vehicleClass === config.vehicleClass &&
          rule.isActive !== false,
      ),
    )?.vehicleClass ?? "SMALL"
  );
}

export function BookingForm({ onCreated }: { onCreated?: (booking: Trip) => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [routePolicies, setRoutePolicies] = useState<Record<string, RouteBookingPolicy>>({});
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BookingFormState>({
    routeId: "",
    bookingType: "PRIVATE_CAR",
    vehicleClass: "SMALL",
    travelDate: tomorrow,
    flightArrivalTime: "",
    flightNumber: "",
    flightTicketMediaId: "",
    flightTicketFileName: "",
    pickupAddress: "",
    dropoffAddress: "",
    useCustomMapLocations: false,
    pickupLatitude: null,
    pickupLongitude: null,
    dropoffLatitude: null,
    dropoffLongitude: null,
    passengerName: "",
    passengerPhone: "",
    notes: "",
  });
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [draftId, setDraftId] = useState(() => createPendingBookingId());
  const [restoredDraft, setRestoredDraft] = useState<PendingBooking | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [ticketExtraction, setTicketExtraction] = useState<FlightTicketExtraction | null>(null);
  const [ticketWorking, setTicketWorking] = useState(false);
  const [working, setWorking] = useState(false);
  const [mapWorking, setMapWorking] = useState(false);
  const [mapSelectionMode, setMapSelectionMode] = useState<"pickup" | "dropoff">("pickup");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [error, setError] = useState("");
  const resumeStarted = useRef(false);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === form.routeId) ?? null,
    [form.routeId, routes],
  );
  const selectedPolicy = useMemo<RouteBookingPolicy | null>(() => {
    if (!selectedRoute) return null;
    return routePolicies[selectedRoute.id] ?? {
      routeId: selectedRoute.id,
      passengerCanEditPickup: selectedRoute.origin.type !== "AIRPORT",
      passengerCanEditDropoff: selectedRoute.destination.type !== "AIRPORT",
      flightTimeMode: selectedRoute.destination.type === "AIRPORT" ? "DEPARTURE" : "ARRIVAL",
    };
  }, [routePolicies, selectedRoute]);
  const canEditPickup = selectedPolicy?.passengerCanEditPickup ?? true;
  const canEditDropoff = selectedPolicy?.passengerCanEditDropoff ?? true;
  const flightTimeMode = selectedPolicy?.flightTimeMode ?? "ARRIVAL";
  const flightDateLabel = flightTimeMode === "DEPARTURE" ? "تاريخ إقلاع الطائرة" : "تاريخ وصول الطائرة";
  const flightTimeLabel = flightTimeMode === "DEPARTURE" ? "وقت إقلاع الطائرة" : "وقت وصول الطائرة";
  const flightTimePlaceholder = flightTimeMode === "DEPARTURE" ? "اختر وقت الإقلاع" : "اختر وقت الوصول";

  const availableBookingTypes = selectedRoute?.bookingTypes ?? [];
  const isPassenger = Boolean(user?.roles.includes("PASSENGER"));
  const vehicleClasses = selectedRoute?.vehicleClasses?.length
    ? selectedRoute.vehicleClasses
    : DEFAULT_VEHICLE_CLASSES;
  const selectedClassConfig =
    vehicleClasses.find((config) => config.vehicleClass === form.vehicleClass) ??
    DEFAULT_VEHICLE_CLASSES.find((config) => config.vehicleClass === form.vehicleClass)!;
  const isTicketUploadEnabled = Boolean(
    selectedRoute?.requiresFlightDetails && selectedRoute.flightTicketUploadEnabled !== false,
  );

  const pickupMapPoint =
    form.useCustomMapLocations && form.pickupLatitude !== null && form.pickupLongitude !== null
      ? { latitude: form.pickupLatitude, longitude: form.pickupLongitude, label: form.pickupAddress }
      : null;
  const dropoffMapPoint =
    form.useCustomMapLocations && form.dropoffLatitude !== null && form.dropoffLongitude !== null
      ? { latitude: form.dropoffLatitude, longitude: form.dropoffLongitude, label: form.dropoffAddress }
      : null;

  function tierPrice(vehicleClass: VehicleClass) {
    const rule = selectedRoute?.pricingRules.find(
      (item) => item.bookingType === form.bookingType && item.vehicleClass === vehicleClass && item.isActive !== false,
    );
    if (!rule) return null;
    return { amount: Number(rule.passengerPrice), currency: rule.currency };
  }

  useEffect(() => {
    const pending = loadPendingBooking();
    if (pending) {
      setDraftId(pending.id);
      setForm((current) => ({ ...current, ...pending.form }));
      setStep(Math.min(4, Math.max(1, pending.step || 1)));
      setRestoredDraft(pending);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    void Promise.all([
      apiFetch<ServiceRoute[]>("/routes", { skipAuth: true }),
      apiFetch<RouteBookingPolicy[]>("/route-booking-policies", { skipAuth: true }),
    ])
      .then(([data, policies]) => {
        setRoutes(data);
        setRoutePolicies(Object.fromEntries(policies.map((policy) => [policy.routeId, policy])));
        const first = data.find((route) => route.bookable);
        if (first) {
          setForm((current) => {
            const restoredRoute = data.find((item) => item.id === current.routeId && item.bookable);
            const route = restoredRoute ?? first;
            const bookingType = preferredBookingType(route, current.bookingType);
            const keepsVehicleClass =
              bookingType !== "PRIVATE_CAR" ||
              route.pricingRules.some(
                (rule) => rule.bookingType === bookingType && rule.vehicleClass === current.vehicleClass && rule.isActive !== false,
              );
            return {
              ...current,
              routeId: route.id,
              bookingType,
              vehicleClass: keepsVehicleClass ? current.vehicleClass : firstPricedVehicleClass(route, bookingType),
              pickupAddress: restoredRoute ? current.pickupAddress || route.origin.nameAr : route.origin.nameAr,
              dropoffAddress: restoredRoute ? current.dropoffAddress || route.destination.nameAr : route.destination.nameAr,
            };
          });
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "تعذر تحميل المسارات."));
  }, []);

  useEffect(() => {
    if (user && (!form.passengerName || !form.passengerPhone)) {
      setForm((current) => ({
        ...current,
        passengerName: current.passengerName || `${user.firstName} ${user.lastName}`.trim(),
        passengerPhone: current.passengerPhone || user.phone || "",
      }));
    }
  }, [form.passengerName, form.passengerPhone, user]);

  useEffect(() => {
    if (!form.useCustomMapLocations) return;
    if (mapSelectionMode === "pickup" && !canEditPickup && canEditDropoff) setMapSelectionMode("dropoff");
    if (mapSelectionMode === "dropoff" && !canEditDropoff && canEditPickup) setMapSelectionMode("pickup");
  }, [canEditDropoff, canEditPickup, form.useCustomMapLocations, mapSelectionMode]);

  function chooseRoute(route: ServiceRoute) {
    const bookingType = preferredBookingType(route, form.bookingType);
    const ticketUploadEnabled = route.requiresFlightDetails && route.flightTicketUploadEnabled !== false;
    const policy = routePolicies[route.id];
    const initialMapMode = policy?.passengerCanEditPickup === false && policy?.passengerCanEditDropoff !== false ? "dropoff" : "pickup";
    setForm((current) => ({
      ...current,
      routeId: route.id,
      bookingType,
      vehicleClass: firstPricedVehicleClass(route, bookingType),
      pickupAddress: route.origin.nameAr,
      dropoffAddress: route.destination.nameAr,
      useCustomMapLocations: false,
      pickupLatitude: null,
      pickupLongitude: null,
      dropoffLatitude: null,
      dropoffLongitude: null,
      flightArrivalTime: route.requiresFlightDetails ? current.flightArrivalTime : "",
      flightNumber: route.requiresFlightDetails ? current.flightNumber : "",
      flightTicketMediaId: ticketUploadEnabled ? current.flightTicketMediaId : "",
      flightTicketFileName: ticketUploadEnabled ? current.flightTicketFileName : "",
    }));
    setMapSelectionMode(initialMapMode);
    if (!ticketUploadEnabled) {
      setTicketExtraction(null);
      void deletePendingTicket(draftId).catch(() => undefined);
    }
    setQuote(null);
    setError("");
  }

  function chooseBookingType(bookingType: BookingType) {
    setForm((current) => ({
      ...current,
      bookingType,
      vehicleClass: selectedRoute ? firstPricedVehicleClass(selectedRoute, bookingType) : "SMALL",
    }));
    setQuote(null);
    setError("");
  }

  function update<K extends keyof BookingFormState>(key: K, value: BookingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (["routeId", "bookingType", "vehicleClass"].includes(key)) setQuote(null);
    setError("");
  }

  function toggleMapLocations(enabled: boolean) {
    if (!selectedRoute) {
      setError("اختر مسار الرحلة أولًا.");
      return;
    }
    if (enabled && !canEditPickup && !canEditDropoff) {
      setError("الإدارة جعلت نقطتي الانطلاق والوصول ثابتتين لهذا المسار.");
      return;
    }
    if (!enabled) {
      setForm((current) => ({
        ...current,
        useCustomMapLocations: false,
        pickupLatitude: null,
        pickupLongitude: null,
        dropoffLatitude: null,
        dropoffLongitude: null,
        pickupAddress: selectedRoute.origin.nameAr,
        dropoffAddress: selectedRoute.destination.nameAr,
      }));
      setMapSelectionMode(canEditPickup ? "pickup" : "dropoff");
      setError("");
      return;
    }

    const pickupLatitude = numericCoordinate(selectedRoute.origin.latitude);
    const pickupLongitude = numericCoordinate(selectedRoute.origin.longitude);
    const dropoffLatitude = numericCoordinate(selectedRoute.destination.latitude);
    const dropoffLongitude = numericCoordinate(selectedRoute.destination.longitude);
    if (pickupLatitude === null || pickupLongitude === null || dropoffLatitude === null || dropoffLongitude === null) {
      setError("لا توجد إحداثيات صالحة لهذا المسار. اطلب من الإدارة ضبط قالب المسار أولًا.");
      return;
    }

    setForm((current) => ({
      ...current,
      useCustomMapLocations: true,
      pickupLatitude: current.pickupLatitude ?? pickupLatitude,
      pickupLongitude: current.pickupLongitude ?? pickupLongitude,
      dropoffLatitude: current.dropoffLatitude ?? dropoffLatitude,
      dropoffLongitude: current.dropoffLongitude ?? dropoffLongitude,
      pickupAddress: current.pickupAddress || selectedRoute.origin.nameAr,
      dropoffAddress: current.dropoffAddress || selectedRoute.destination.nameAr,
    }));
    setMapSelectionMode(canEditPickup ? "pickup" : "dropoff");
    setError("");
  }

  async function selectMapLocation(point: { latitude: number; longitude: number }) {
    if (!form.useCustomMapLocations) return;
    const mode = mapSelectionMode;
    if ((mode === "pickup" && !canEditPickup) || (mode === "dropoff" && !canEditDropoff)) {
      setError("هذه النقطة ثابتة حسب إعدادات الإدارة لهذا المسار.");
      return;
    }
    setMapWorking(true);
    setError("");

    let label = `موقع محدد على الخريطة (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`;
    try {
      const resolved = await reverseGeocode(point.latitude, point.longitude);
      label = resolved.label;
    } catch {
      showToast("تم حفظ النقطة، لكن تعذر جلب اسم العنوان تلقائيًا. يمكنك تعديله يدويًا.", "info");
    }

    setForm((current) =>
      mode === "pickup"
        ? { ...current, pickupLatitude: point.latitude, pickupLongitude: point.longitude, pickupAddress: label }
        : { ...current, dropoffLatitude: point.latitude, dropoffLongitude: point.longitude, dropoffAddress: label },
    );
    showToast(mode === "pickup" ? "تم تحديد نقطة الانطلاق." : "تم تحديد نقطة الوصول.", "success");
    if (mode === "pickup" && canEditDropoff) setMapSelectionMode("dropoff");
    setMapWorking(false);
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
    if (step === 2 && form.bookingType === "PRIVATE_CAR" && !tierPrice(form.vehicleClass)) {
      setError("السعر غير متاح لفئة السيارة المختارة.");
      return false;
    }
    if (
      step === 2 &&
      selectedRoute?.requiresFlightDetails &&
      (!form.flightArrivalTime || !form.flightNumber.trim()) &&
      !(!isPassenger && isTicketUploadEnabled && form.flightTicketFileName)
    ) {
      setError("أرفق تذكرة الطيران أو أدخل وقت الرحلة ورقم الرحلة.");
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
    if (
      step === 3 &&
      form.useCustomMapLocations &&
      [form.pickupLatitude, form.pickupLongitude, form.dropoffLatitude, form.dropoffLongitude].some(
        (value) => value === null || !Number.isFinite(value),
      )
    ) {
      setError("تعذر تجهيز نقاط الخريطة. أعد فتح الخريطة وحاول مجددًا.");
      return false;
    }
    return true;
  }

  async function loadQuoteFor(candidate: BookingFormState) {
    if (!candidate.routeId) return null;
    setWorking(true);
    setError("");
    try {
      const params = new URLSearchParams({
        routeId: candidate.routeId,
        bookingType: candidate.bookingType,
        vehicleClass: candidate.bookingType === "PRIVATE_CAR" ? candidate.vehicleClass : "SMALL",
      });
      const data = await apiFetch<BookingQuote>(`/bookings/quote?${params}`, { skipAuth: true });
      setQuote(data);
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل السعر.");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function uploadTicketFile(file: File, routeId: string) {
    setTicketWorking(true);
    setError("");
    try {
      const data = new FormData();
      data.set("file", file);
      if (routeId) data.set("routeId", routeId);
      const result = await apiUpload<FlightTicketUploadResponse>("/bookings/flight-ticket", data);
      setTicketExtraction(result.extraction);
      if (result.extraction.warning) {
        showToast(result.extraction.warning, result.extraction.status === "EXTRACTED" ? "success" : "info");
      } else {
        showToast("تم استخراج بيانات تذكرة الطيران تلقائيًا.", "success");
      }
      return result;
    } finally {
      setTicketWorking(false);
    }
  }

  async function analyzeTicketFile(file: File, routeId: string) {
    setTicketWorking(true);
    setError("");
    try {
      const data = new FormData();
      data.set("file", file);
      if (routeId) data.set("routeId", routeId);
      const result = await apiUpload<FlightTicketAnalysisResponse>(
        "/bookings/flight-ticket/analyze",
        data,
        { skipAuth: true },
      );
      setTicketExtraction(result.extraction);
      if (result.extraction.warning) {
        showToast(result.extraction.warning, result.extraction.status === "EXTRACTED" ? "success" : "info");
      } else {
        showToast("تم تحليل التذكرة وتعبئة بيانات الرحلة قبل تسجيل الدخول.", "success");
      }
      return result.extraction;
    } finally {
      setTicketWorking(false);
    }
  }

  function withExtraction(candidate: BookingFormState, upload: FlightTicketUploadResponse): BookingFormState {
    const { extraction } = upload;
    return {
      ...candidate,
      flightTicketMediaId: upload.asset.id,
      flightTicketFileName: upload.asset.originalName,
      travelDate: extraction.arrivalDate || candidate.travelDate,
      flightArrivalTime: extraction.arrivalTime || candidate.flightArrivalTime,
      flightNumber: extraction.flightNumber || candidate.flightNumber,
      passengerName: candidate.passengerName.trim() ? candidate.passengerName : extraction.passengerName || candidate.passengerName,
    };
  }

  function withPublicExtraction(
    candidate: BookingFormState,
    extraction: FlightTicketExtraction,
  ): BookingFormState {
    return {
      ...candidate,
      travelDate: extraction.arrivalDate || candidate.travelDate,
      flightArrivalTime: extraction.arrivalTime || candidate.flightArrivalTime,
      flightNumber: extraction.flightNumber || candidate.flightNumber,
      passengerName: candidate.passengerName.trim()
        ? candidate.passengerName
        : extraction.passengerName || candidate.passengerName,
    };
  }

  async function handleTicketSelected(file: File | undefined) {
    if (!file) return;
    if (!isTicketUploadEnabled) {
      setError("إرفاق تذكرة الطيران غير متاح لهذا المسار حاليًا.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      setError("صيغة التذكرة غير مدعومة. ارفع JPG أو PNG أو WEBP أو PDF.");
      return;
    }
    if (file.type === "application/pdf" && file.size > MAX_TICKET_BYTES) {
      setError("حجم ملف PDF يجب ألا يتجاوز 10 ميغابايت.");
      return;
    }
    if (file.type !== "application/pdf" && file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError("صورة التذكرة كبيرة جدًا. اختر صورة لا تتجاوز 30 ميغابايت.");
      return;
    }

    setTicketExtraction(null);
    setTicketWorking(true);
    setError("");

    try {
      let preparedFile = file;
      if (file.type !== "application/pdf") {
        const optimized = await optimizeMobileImageUpload(file);
        preparedFile = optimized.file;
        if (optimized.optimized) {
          showToast(
            `تم تصغير صورة التذكرة من ${formatUploadSize(optimized.originalBytes)} إلى ${formatUploadSize(preparedFile.size)} لتسريع الرفع.`,
            "info",
          );
        }
      }

      if (preparedFile.size > MAX_TICKET_BYTES) {
        setError("تعذر تصغير التذكرة إلى أقل من 10 ميغابايت. التقط صورة أوضح بحجم أصغر.");
        return;
      }

      const candidate: BookingFormState = {
        ...form,
        flightTicketFileName: preparedFile.name,
        flightTicketMediaId: "",
      };
      setForm(candidate);

      await storePendingTicket(draftId, preparedFile);
      savePendingBooking({ id: draftId, form: candidate, step, submitAfterAuth: false });
      if (isPassenger) {
        const upload = await uploadTicketFile(preparedFile, candidate.routeId);
        const extracted = withExtraction(candidate, upload);
        setForm(extracted);
        savePendingBooking({ id: draftId, form: extracted, step, submitAfterAuth: false });
      } else {
        const extraction = await analyzeTicketFile(preparedFile, candidate.routeId);
        const extracted = withPublicExtraction(candidate, extraction);
        setForm(extracted);
        savePendingBooking({ id: draftId, form: extracted, step, submitAfterAuth: false });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تعذر حفظ أو تحليل التذكرة.";
      setError(message);
      showToast(message, "error");
    } finally {
      setTicketWorking(false);
    }
  }

  async function createBooking(candidate: BookingFormState, requestId = draftId) {
    setWorking(true);
    setError("");
    try {
      const {
        flightTicketFileName: _fileName,
        useCustomMapLocations,
        pickupLatitude,
        pickupLongitude,
        dropoffLatitude,
        dropoffLongitude,
        ...payload
      } = candidate;
      const booking = await apiFetch<Trip>("/bookings", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          clientRequestId: requestId,
          flightTicketMediaId: candidate.flightTicketMediaId || undefined,
          vehicleClass: candidate.bookingType === "PRIVATE_CAR" ? candidate.vehicleClass : "SMALL",
          pickupLatitude: useCustomMapLocations && canEditPickup ? pickupLatitude ?? undefined : undefined,
          pickupLongitude: useCustomMapLocations && canEditPickup ? pickupLongitude ?? undefined : undefined,
          dropoffLatitude: useCustomMapLocations && canEditDropoff ? dropoffLatitude ?? undefined : undefined,
          dropoffLongitude: useCustomMapLocations && canEditDropoff ? dropoffLongitude ?? undefined : undefined,
        }),
      });

      clearPendingBooking();
      await deletePendingTicket(requestId).catch(() => undefined);
      showToast(`تم إرسال الحجز ${booking.bookingReference ?? ""}.`, "success");
      onCreated?.(booking);
      router.replace(`/rider/bookings/${booking.id}`);
      return booking;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تعذر إرسال الحجز.";
      setError(message);
      showToast(message, "error");
      return null;
    } finally {
      setWorking(false);
    }
  }

  function continueToLogin() {
    savePendingBooking({ id: draftId, form, step: 4, submitAfterAuth: true });
    router.push("/login?continue=booking");
  }

  async function nextStep() {
    if (!validateStep()) return;
    if (step === 3 && !(quote ?? (await loadQuoteFor(form)))) return;
    setStep((current) => Math.min(4, current + 1));
    document.getElementById("booking-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step !== 4) {
      await nextStep();
      return;
    }
    if (!isPassenger) {
      continueToLogin();
      return;
    }
    await createBooking(form);
  }

  useEffect(() => {
    if (!draftLoaded || !restoredDraft?.submitAfterAuth || !isPassenger || routes.length === 0 || resumeStarted.current) return;

    resumeStarted.current = true;
    void (async () => {
      let candidate: BookingFormState = {
        ...restoredDraft.form,
        passengerName: restoredDraft.form.passengerName || `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim(),
        passengerPhone: restoredDraft.form.passengerPhone || user?.phone || "",
      };

      try {
        const route = routes.find((item) => item.id === candidate.routeId);
        const canUploadTicket = Boolean(route?.requiresFlightDetails && route.flightTicketUploadEnabled !== false);

        if (!canUploadTicket && candidate.flightTicketFileName) {
          candidate = { ...candidate, flightTicketMediaId: "", flightTicketFileName: "" };
          await deletePendingTicket(restoredDraft.id).catch(() => undefined);
        }
        if (canUploadTicket && candidate.flightTicketFileName && !candidate.flightTicketMediaId) {
          const ticketFile = await loadPendingTicket(restoredDraft.id);
          if (!ticketFile) {
            setForm(candidate);
            setStep(2);
            setError("تعذر استعادة ملف التذكرة. أعد اختياره ثم تابع الحجز.");
            return;
          }
          const upload = await uploadTicketFile(ticketFile, candidate.routeId);
          candidate = withExtraction(candidate, upload);
          setForm(candidate);
        }
        if (route?.requiresFlightDetails && (!candidate.flightArrivalTime || !candidate.flightNumber.trim())) {
          setForm(candidate);
          setStep(2);
          savePendingBooking({ id: restoredDraft.id, form: candidate, step: 2, submitAfterAuth: false });
          setError("راجع بيانات التذكرة وأكمل وقت الرحلة ورقم الرحلة قبل الإرسال.");
          return;
        }
        const restoredQuote = await loadQuoteFor(candidate);
        if (!restoredQuote) return;
        await createBooking(candidate, restoredDraft.id);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "تعذر استكمال الحجز المحفوظ.";
        setError(message);
        setStep(4);
      }
    })();
  }, [draftLoaded, isPassenger, restoredDraft, routes, user]);

  return (
    <form id="booking-card" className="booking-wizard" onSubmit={submit}>
      <div className="wizard-header">
        <div><span className="wizard-step-label">الخطوة {step} من 4</span><h3>{stepTitles[step - 1]}</h3></div>
        <span className="wizard-secure"><Icon name="shield" size={17} />حجز آمن</span>
      </div>
      <ol className="wizard-progress">
        {stepTitles.map((title, index) => {
          const number = index + 1;
          return <li className={`${number < step ? "is-done" : ""} ${number === step ? "is-current" : ""}`} key={title}><span>{number < step ? <Icon name="check" size={16} /> : number}</span><small>{title}</small></li>;
        })}
      </ol>
      <div className="wizard-body">
        {step === 1 ? (
          <div className="wizard-pane">
            <div className="pane-heading"><h4>اختر خط الرحلة</h4><p>تظهر هنا المسارات الفعالة التي لديها سعر متاح.</p></div>
            {routes.length === 0 ? <div className="empty-state">لا توجد مسارات قابلة للحجز حاليًا.</div> : (
              <div className="dynamic-route-grid">
                {routes.filter((route) => route.bookable).map((route) => (
                  <button className={`route-choice-card ${route.id === form.routeId ? "is-selected" : ""}`} type="button" key={route.id} onClick={() => chooseRoute(route)}>
                    <span className="choice-icon"><Icon name={route.requiresFlightDetails ? "plane" : "route"} size={24} /></span>
                    <span><strong>{route.nameAr}</strong><small>{ROUTE_TYPE_LABELS[route.routeType]} · {route.estimatedMinutes ? `${route.estimatedMinutes} دقيقة` : "المدة حسب التشغيل"}</small></span>
                    {route.id === form.routeId ? <Icon name="check" size={18} /> : null}
                  </button>
                ))}
              </div>
            )}
            <div className="pane-heading secondary-pane-heading"><h4>نوع الحجز</h4></div>
            <div className="choice-grid">
              {availableBookingTypes.map((value) => (
                <button className={`choice-card ${form.bookingType === value ? "is-selected" : ""}`} type="button" key={value} onClick={() => chooseBookingType(value)}>
                  <span className="choice-icon"><Icon name={value === "SHARED_SEAT" ? "users" : "car"} size={24} /></span>
                  <span><strong>{BOOKING_TYPE_LABELS[value]}</strong><small>{value === "SHARED_SEAT" ? "حجز مقعد واحد" : "المركبة كاملة"}</small></span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-pane">
            <div className="pane-heading">
              <h4>{form.bookingType === "PRIVATE_CAR" ? "اختر موعد الرحلة وحجم السيارة" : "اختر موعد الرحلة"}</h4>
              <p>{selectedRoute?.requiresFlightDetails ? `بيانات ${flightTimeMode === "DEPARTURE" ? "إقلاع" : "وصول"} الطائرة مطلوبة لهذا المسار.` : "بيانات الطائرة اختيارية لهذا المسار."}</p>
            </div>

            {isTicketUploadEnabled ? (
              <section className={`flight-ticket-upload ${form.flightTicketFileName ? "has-file" : ""}`}>
                <div className="flight-ticket-upload-copy"><span className="flight-ticket-icon"><Icon name="plane" size={24} /></span><div><strong>أرفق تذكرة الطيران (إختياري)</strong><small>سنقرأ بيانات الرحلة تلقائيًا. PDF حتى 10 MB، وصور JPG/PNG/WEBP الكبيرة تُصغّر تلقائيًا قبل الرفع لتناسب شبكة الهاتف.</small></div></div>
                <label className={`button ${form.flightTicketFileName ? "" : "primary"}`}>
                  <input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={ticketWorking} onChange={(event) => void handleTicketSelected(event.target.files?.[0])} />
                  {ticketWorking ? "جارٍ تجهيز وتحليل التذكرة..." : form.flightTicketFileName ? "استبدال التذكرة" : "اختيار التذكرة"}
                </label>
                {form.flightTicketFileName ? <div className="flight-ticket-result"><Icon name="check" size={18} /><span><strong>{form.flightTicketFileName}</strong><small>{form.flightTicketMediaId ? "تم رفعها وحفظها بصورة خاصة" : "تم تحليلها ومحفوظة مؤقتًا حتى تسجيل الدخول"}</small></span></div> : null}
                {ticketExtraction ? <div className={`ticket-extraction-status ${ticketExtraction.status === "EXTRACTED" ? "success" : "warning"}`}><strong>{ticketExtraction.status === "EXTRACTED" ? "تمت تعبئة البيانات تلقائيًا" : "تحتاج البيانات إلى مراجعة"}</strong><span>دقة القراءة التقريبية: {Math.round(ticketExtraction.confidence * 100)}%</span>{ticketExtraction.warning ? <small>{ticketExtraction.warning}</small> : null}</div> : null}
              </section>
            ) : null}

            <div className="form-grid wizard-form-grid">
              <label>
                <span className="label">{selectedRoute?.requiresFlightDetails ? flightDateLabel : "تاريخ الرحلة"}</span>
                <DatePicker
                  selected={parseDateValue(form.travelDate)}
                  onChange={(date: Date | null) => { update("travelDate", date ? format(date, "yyyy-MM-dd") : ""); setDatePickerOpen(false); }}
                  minDate={tomorrowDate}
                  locale={ar}
                  dateFormat="dd/MM/yyyy"
                  customInput={<PickerButton placeholder="اختر التاريخ" />}
                  calendarClassName="arrival-calendar"
                  popperClassName="arrival-date-time-popper"
                  showPopperArrow={false}
                  open={datePickerOpen}
                  onInputClick={() => setDatePickerOpen(true)}
                  onClickOutside={() => setDatePickerOpen(false)}
                  shouldCloseOnSelect
                  required
                />
              </label>

              <label>
                <span className="label">{selectedRoute?.requiresFlightDetails ? flightTimeLabel : "وقت الرحلة"}</span>
                <DatePicker
                  selected={parseTimeValue(form.flightArrivalTime)}
                  onChange={(time: Date | null) => { update("flightArrivalTime", time ? format(time, "HH:mm") : ""); setTimePickerOpen(false); }}
                  locale={ar}
                  showTimeSelect
                  showTimeSelectOnly
                  timeIntervals={15}
                  timeCaption="الوقت"
                  timeFormat="HH:mm"
                  dateFormat="HH:mm"
                  customInput={<PickerButton placeholder={selectedRoute?.requiresFlightDetails ? flightTimePlaceholder : "اختر الوقت"} />}
                  calendarClassName="arrival-calendar arrival-time-calendar"
                  popperClassName="arrival-date-time-popper"
                  showPopperArrow={false}
                  open={timePickerOpen}
                  onInputClick={() => setTimePickerOpen(true)}
                  onClickOutside={() => setTimePickerOpen(false)}
                  shouldCloseOnSelect
                  required={selectedRoute?.requiresFlightDetails}
                />
              </label>

              <label><span className="label">رقم الرحلة الجوية</span><input className="input" value={form.flightNumber} onChange={(event) => update("flightNumber", event.target.value)} placeholder="مثال: ME 265" required={selectedRoute?.requiresFlightDetails} /></label>
            </div>

            {form.bookingType === "PRIVATE_CAR" ? (
              <>
                <div className="pane-heading secondary-pane-heading"><h4>حجم السيارة</h4><p>اختر الفئة التي تريد طلبها. السعة تُحددها إدارة المنصة.</p></div>
                <div className="capacity-tier-grid vehicle-choice-grid">
                  {vehicleClasses.map((config) => {
                    const price = tierPrice(config.vehicleClass);
                    const isSelected = config.vehicleClass === form.vehicleClass;
                    return <button className={`capacity-tier-card vehicle-choice-card ${isSelected ? "is-selected" : ""}`} data-vehicle-class={config.vehicleClass} disabled={!price} key={config.vehicleClass} onClick={() => update("vehicleClass", config.vehicleClass)} type="button"><span className="capacity-tier-heading"><span className="vehicle-class-title"><strong>{VEHICLE_CLASS_LABELS[config.vehicleClass]}</strong><small className="vehicle-capacity-label">تتسع حتى {config.passengerCapacity} أشخاص و{config.luggageCapacity} حقائب</small></span>{isSelected ? <span className="vehicle-selected-badge"><Icon name="check" size={13} />محددة</span> : null}</span><span className="capacity-tier-price">{price ? `${formatMoney(price.amount, price.currency)} للسيارة` : "السعر غير متاح حاليًا"}</span></button>;
                  })}
                </div>
              </>
            ) : <div className="notice">الحجز لمقعد واحد، وتختار الإدارة المركبة المناسبة للرحلة المشتركة.</div>}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-pane">
            <div className="pane-heading"><h4>بيانات المسافر والعناوين</h4></div>
            <div className="form-grid wizard-form-grid">
              <label><span className="label">الاسم الكامل</span><input className="input" value={form.passengerName} onChange={(e) => update("passengerName", e.target.value)} required /></label>
              <label><span className="label">رقم الهاتف</span><InternationalPhoneInput value={form.passengerPhone} onChange={(value) => update("passengerPhone", value)} name="passengerPhone" required /></label>

              {(canEditPickup || canEditDropoff) ? (
                <label className="full-width notice" style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.useCustomMapLocations} onChange={(event) => toggleMapLocations(event.target.checked)} style={{ width: 20, height: 20, marginTop: 2, flex: "0 0 auto" }} />
                  <span style={{ display: "grid", gap: 4 }}>
                    <strong>تحديد مكان الانطلاق أو الوصول عبر الخريطة</strong>
                    <small>{canEditPickup && canEditDropoff ? "يمكنك تحديد النقطتين بدقة." : canEditPickup ? "نقطة الوصول ثابتة حسب إعدادات الإدارة؛ يمكنك تحديد نقطة الانطلاق فقط." : "نقطة الانطلاق ثابتة حسب إعدادات الإدارة؛ يمكنك تحديد نقطة الوصول فقط."}</small>
                  </span>
                </label>
              ) : <div className="full-width notice">نقطتا الانطلاق والوصول ثابتتان حسب إعدادات الإدارة لهذا المسار.</div>}

              {form.useCustomMapLocations ? (
                <div className="full-width" style={{ display: "grid", gap: 14 }}>
                  <div className="section-heading" style={{ marginBottom: 0 }}>
                    <div><strong>اختر النقطة التي تريد تحديدها</strong><small>ستفتح الخريطة في نافذة مستقلة مناسبة للهاتف، ويمكنك البحث عن مكان أو الضغط مباشرة على الخريطة.</small></div>
                    <div className="actions">
                      {canEditPickup ? <button className={`button ${mapSelectionMode === "pickup" ? "primary" : ""}`} type="button" onClick={() => setMapSelectionMode("pickup")}><Icon name="map-pin" size={17} /> تحديد الانطلاق</button> : null}
                      {canEditDropoff ? <button className={`button ${mapSelectionMode === "dropoff" ? "primary" : ""}`} type="button" onClick={() => setMapSelectionMode("dropoff")}><Icon name="map-pin" size={17} /> تحديد الوصول</button> : null}
                    </div>
                  </div>
                  <BookingLocationMap pickup={pickupMapPoint} dropoff={dropoffMapPoint} activeMode={mapSelectionMode} fitKey={`${selectedRoute?.id ?? "route"}:booking-location-picker`} onSelect={selectMapLocation} />
                  {mapWorking ? <div className="notice">جارٍ قراءة اسم المكان المحدد...</div> : <div className="booking-meta"><span>A · {canEditPickup ? "قابلة للتعديل" : "ثابتة من الإدارة"}</span><span>B · {canEditDropoff ? "قابلة للتعديل" : "ثابتة من الإدارة"}</span></div>}
                </div>
              ) : null}

              <label>
                <span className="label">عنوان الالتقاط</span>
                <input className="input" value={form.pickupAddress} onChange={(e) => canEditPickup && update("pickupAddress", e.target.value)} readOnly={!canEditPickup} required />
                {!canEditPickup ? <small className="booking-location-policy-note">ثابت حسب إعدادات الإدارة.</small> : null}
              </label>
              <label>
                <span className="label">عنوان الوصول</span>
                <input className="input" value={form.dropoffAddress} onChange={(e) => canEditDropoff && update("dropoffAddress", e.target.value)} readOnly={!canEditDropoff} required />
                {!canEditDropoff ? <small className="booking-location-policy-note">ثابت حسب إعدادات الإدارة.</small> : null}
              </label>
              <label className="full-width"><span className="label">ملاحظات</span><textarea className="input" rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="wizard-pane">
            <div className="pane-heading"><h4>راجع طلبك</h4><p>السعر مأخوذ من قاعدة السعر الفعالة للمسار والفئة.</p></div>
            <div className="review-grid">
              <div><span>المسار</span><strong>{selectedRoute?.nameAr}</strong></div>
              <div><span>نوع الحجز</span><strong>{BOOKING_TYPE_LABELS[form.bookingType]}</strong></div>
              {form.bookingType === "PRIVATE_CAR" ? <div><span>فئة السيارة</span><strong>{VEHICLE_CLASS_LABELS[form.vehicleClass]} · حتى {quote?.passengerCapacity ?? selectedClassConfig.passengerCapacity} أشخاص و{quote?.luggageCapacity ?? selectedClassConfig.luggageCapacity} حقائب</strong></div> : null}
              <div><span>{selectedRoute?.requiresFlightDetails ? flightDateLabel : "تاريخ الرحلة"}</span><strong>{formatArrivalDate(form.travelDate)}</strong></div>
              {selectedRoute?.requiresFlightDetails ? <div><span>الرحلة الجوية</span><strong>{form.flightNumber || "بانتظار الاستخراج"} · {form.flightArrivalTime || "—"}</strong></div> : null}
              {isTicketUploadEnabled && form.flightTicketFileName ? <div><span>تذكرة الطيران</span><strong>{form.flightTicketFileName}</strong></div> : null}
              <div><span>الانطلاق</span><strong>{form.pickupAddress}</strong></div>
              <div><span>الوصول</span><strong>{form.dropoffAddress}</strong></div>
              {form.useCustomMapLocations ? <div><span>تحديد المواقع</span><strong>تم تخصيص النقاط المسموح بها عبر الخريطة</strong></div> : null}
            </div>
            <div className="quote-card"><span>السعر التقديري</span><strong>{quote ? formatMoney(quote.passengerPrice, quote.currency) : "—"}</strong></div>
            {!isPassenger ? <div className="notice success">تفاصيل هذا الحجز محفوظة. بعد الدخول أو إنشاء حساب سنرسله تلقائيًا ونفتح صفحة التفاصيل.</div> : null}
          </div>
        ) : null}
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="wizard-actions">
        {step > 1 ? <button className="button" type="button" onClick={() => setStep((current) => current - 1)}>السابق</button> : <span />}
        {step < 4 ? <button className="button primary" type="button" disabled={working || ticketWorking || mapWorking} onClick={() => void nextStep()}>التالي</button> : isPassenger ? <button className="button primary" type="submit" disabled={working || ticketWorking || mapWorking}>{working ? "جارٍ الإرسال..." : "إرسال الحجز"}</button> : <button className="button primary" type="button" onClick={continueToLogin} disabled={mapWorking}>تسجيل الدخول وإكمال الحجز</button>}
      </div>
    </form>
  );
}
