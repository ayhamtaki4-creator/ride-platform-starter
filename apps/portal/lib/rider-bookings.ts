import {
  BOOKING_REVIEW_LABELS,
  SERVICE_RUN_PASSENGER_STATUS_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  Trip,
} from "./types";

export type RiderBookingTab =
  | "UPCOMING"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

const cancelledTripStatuses = new Set<Trip["status"]>([
  "CANCELLED_BY_PASSENGER",
  "CANCELLED_BY_DRIVER",
  "NO_DRIVER_AVAILABLE",
  "PASSENGER_NO_SHOW",
  "DRIVER_NO_SHOW",
]);

const activeTripStatuses = new Set<Trip["status"]>([
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "IN_PROGRESS",
]);

const activeRunStatuses = new Set([
  "BOARDING",
  "IN_PROGRESS",
]);

export function isBookingCancelled(booking: Trip) {
  return (
    booking.bookingReviewStatus === "REJECTED" ||
    booking.bookingReviewStatus === "CANCELLED" ||
    cancelledTripStatuses.has(booking.status) ||
    booking.serviceRun?.status === "CANCELLED"
  );
}

export function isBookingCompleted(booking: Trip) {
  return booking.status === "COMPLETED" || booking.serviceRun?.status === "COMPLETED";
}

export function isBookingActive(booking: Trip) {
  return (
    activeTripStatuses.has(booking.status) ||
    Boolean(booking.serviceRun && activeRunStatuses.has(booking.serviceRun.status))
  );
}

export function getBookingTab(booking: Trip): RiderBookingTab {
  if (isBookingCancelled(booking)) return "CANCELLED";
  if (isBookingCompleted(booking)) return "COMPLETED";
  if (isBookingActive(booking)) return "ACTIVE";
  return "UPCOMING";
}

export function getBookingStatus(booking: Trip): {
  label: string;
  tone: StatusTone;
  description: string;
} {
  if (booking.bookingReviewStatus === "REJECTED") {
    return {
      label: BOOKING_REVIEW_LABELS.REJECTED,
      tone: "danger",
      description: "لم تتم الموافقة على الحجز من مركز العمليات.",
    };
  }

  if (booking.bookingReviewStatus === "CANCELLED" || booking.status === "CANCELLED_BY_PASSENGER") {
    return {
      label: "ملغى",
      tone: "danger",
      description: "تم إلغاء الحجز ولن يتم تنفيذه.",
    };
  }

  if (booking.status === "CANCELLED_BY_DRIVER") {
    return {
      label: "ألغاه السائق",
      tone: "danger",
      description: "أعيد الحجز إلى مركز العمليات لاتخاذ الإجراء المناسب.",
    };
  }

  if (booking.status === "NO_DRIVER_AVAILABLE") {
    return {
      label: "لا يوجد سائق متاح",
      tone: "warning",
      description: "يتابع مركز العمليات البحث عن حل بديل.",
    };
  }

  if (booking.status === "PASSENGER_NO_SHOW") {
    return {
      label: "لم يحضر المسافر",
      tone: "danger",
      description: "تم تسجيل عدم حضور المسافر إلى نقطة الالتقاط.",
    };
  }

  if (booking.status === "DRIVER_NO_SHOW") {
    return {
      label: "لم يحضر السائق",
      tone: "danger",
      description: "تم تسجيل عدم حضور السائق وتحتاج الحالة إلى متابعة.",
    };
  }

  if (booking.status === "COMPLETED" || booking.serviceRun?.status === "COMPLETED") {
    return {
      label: "مكتملة",
      tone: "success",
      description: "اكتملت الرحلة بنجاح.",
    };
  }

  if (booking.status === "IN_PROGRESS" || booking.serviceRun?.status === "IN_PROGRESS") {
    return {
      label: "الرحلة جارية",
      tone: "info",
      description: "المركبة في الطريق إلى الوجهة.",
    };
  }

  if (booking.serviceRun?.status === "BOARDING") {
    return {
      label: "صعود الركاب",
      tone: "info",
      description: "بدأ السائق استقبال الركاب وتجهيز الرحلة للانطلاق.",
    };
  }

  if (booking.serviceRunPassengerStatus === "PICKED_UP") {
    return {
      label: SERVICE_RUN_PASSENGER_STATUS_LABELS.PICKED_UP,
      tone: "success",
      description: "تم تسجيل صعودك إلى المركبة.",
    };
  }

  if (booking.driverAssignmentStatus === "ACCEPTED") {
    return {
      label: "أكدها السائق",
      tone: "success",
      description: "قبل السائق المهمة وأصبحت الرحلة جاهزة للتنفيذ.",
    };
  }

  if (booking.driverAssignmentStatus === "PENDING") {
    return {
      label: "بانتظار رد السائق",
      tone: "warning",
      description: "تم إرسال المهمة إلى السائق وننتظر تأكيده.",
    };
  }

  if (booking.driverAssignmentStatus === "REJECTED") {
    return {
      label: "يُعاد تعيين السائق",
      tone: "warning",
      description: "رفض السائق السابق المهمة ويعمل مركز العمليات على تعيين بديل.",
    };
  }

  if (booking.driver || booking.status === "DRIVER_ASSIGNED") {
    return {
      label: "تم تعيين السائق",
      tone: "info",
      description: "تم اختيار السائق والمركبة لهذا الحجز.",
    };
  }

  if (booking.bookingReviewStatus === "CONFIRMED") {
    return {
      label: "الحجز مؤكد",
      tone: "success",
      description: "وافق مركز العمليات على الحجز ويجري تجهيز السائق.",
    };
  }

  if (booking.bookingReviewStatus === "NEW") {
    return {
      label: "قيد المراجعة",
      tone: "warning",
      description: "وصل طلبك إلى مركز العمليات وسيتم مراجعته قريبًا.",
    };
  }

  return {
    label: TRIP_STATUS_LABELS[booking.status],
    tone: "neutral",
    description: "تتم متابعة حالة الحجز من مركز العمليات.",
  };
}

export function canPassengerCancel(booking: Trip) {
  return !isBookingCancelled(booking) && !isBookingCompleted(booking) && booking.status !== "IN_PROGRESS";
}

export function getTravelTimestamp(booking: Trip) {
  if (!booking.travelDate) return Number.POSITIVE_INFINITY;
  const parsed = new Date(booking.travelDate).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function sortBookingsNewest(bookings: Trip[]) {
  return [...bookings].sort((first, second) => {
    const firstDate = first.travelDate ? new Date(first.travelDate).getTime() : new Date(first.requestedAt).getTime();
    const secondDate = second.travelDate ? new Date(second.travelDate).getTime() : new Date(second.requestedAt).getTime();
    return secondDate - firstDate;
  });
}

export function sortUpcomingBookings(bookings: Trip[]) {
  const now = Date.now();
  return [...bookings]
    .filter((booking) => getBookingTab(booking) === "UPCOMING")
    .sort((first, second) => {
      const firstTime = getTravelTimestamp(first);
      const secondTime = getTravelTimestamp(second);
      const firstIsPast = firstTime < now;
      const secondIsPast = secondTime < now;

      if (firstIsPast !== secondIsPast) return firstIsPast ? 1 : -1;
      return firstTime - secondTime;
    });
}

export function formatBookingDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SY", options ?? {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatBookingMoney(value: string | number | null | undefined, currency = "USD") {
  const numericValue = Number(value ?? 0);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  try {
    return new Intl.NumberFormat("ar-SY", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `${safeValue.toLocaleString("ar-SY")} ${currency}`;
  }
}

export function getBookingTimeline(booking: Trip) {
  const runStatus = booking.serviceRun?.status;
  const cancelled = isBookingCancelled(booking);
  const completed = isBookingCompleted(booking);
  const driverAssigned = Boolean(booking.driver) || [
    "DRIVER_ASSIGNED",
    "DRIVER_ARRIVING",
    "DRIVER_ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
  ].includes(booking.status);
  const driverAccepted =
    booking.driverAssignmentStatus === "ACCEPTED" ||
    Boolean(runStatus && ["DRIVER_ACCEPTED", "BOARDING", "IN_PROGRESS", "COMPLETED"].includes(runStatus));
  const boarded =
    booking.serviceRunPassengerStatus === "PICKED_UP" ||
    booking.serviceRunPassengerStatus === "DROPPED_OFF" ||
    booking.status === "IN_PROGRESS" ||
    booking.status === "COMPLETED";
  const inProgress = booking.status === "IN_PROGRESS" || booking.status === "COMPLETED" || runStatus === "IN_PROGRESS" || runStatus === "COMPLETED";

  const steps = [
    {
      key: "submitted",
      label: "تم إرسال الطلب",
      description: "استلم مركز العمليات بيانات الحجز.",
      complete: true,
      current: booking.bookingReviewStatus === "NEW" && !cancelled,
    },
    {
      key: "confirmed",
      label: "تم تأكيد الحجز",
      description: "راجع مركز العمليات الحجز ووافق عليه.",
      complete: booking.bookingReviewStatus === "CONFIRMED" || driverAssigned || completed,
      current: booking.bookingReviewStatus === "CONFIRMED" && !driverAssigned && !cancelled,
    },
    {
      key: "assigned",
      label: "تم تعيين السائق",
      description: "تم تحديد السائق والمركبة للرحلة.",
      complete: driverAssigned,
      current: driverAssigned && !driverAccepted && !cancelled,
    },
    {
      key: "accepted",
      label: "أكد السائق المهمة",
      description: "وافق السائق على تنفيذ الرحلة.",
      complete: driverAccepted,
      current: driverAccepted && !boarded && !cancelled,
    },
    {
      key: "boarded",
      label: "تم صعود المسافر",
      description: "سجل السائق صعود المسافر إلى المركبة.",
      complete: boarded,
      current: boarded && !inProgress && !cancelled,
    },
    {
      key: "started",
      label: "بدأت الرحلة",
      description: "انطلقت المركبة باتجاه الوجهة.",
      complete: inProgress,
      current: inProgress && !completed && !cancelled,
    },
    {
      key: "completed",
      label: "اكتملت الرحلة",
      description: "وصلت الرحلة إلى وجهتها النهائية.",
      complete: completed,
      current: completed,
    },
  ];

  if (cancelled) {
    const status = getBookingStatus(booking);
    return [
      ...steps.filter((step) => step.complete && step.key !== "completed"),
      {
        key: "cancelled",
        label: status.label,
        description: status.description,
        complete: true,
        current: true,
        danger: true,
      },
    ];
  }

  return steps;
}

export function getRunStatusLabel(booking: Trip) {
  return booking.serviceRun ? SERVICE_RUN_STATUS_LABELS[booking.serviceRun.status] : null;
}
