"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { BookingStatusBadge } from "@/components/rider/booking-status-badge";
import { BookingTimeline } from "@/components/rider/booking-timeline";
import { RiderBookingSkeleton } from "@/components/rider/rider-loading";
import { Shell } from "@/components/shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { useRiderBookings } from "@/hooks/use-rider-bookings";
import { apiFetch } from "@/lib/api";
import {
  canPassengerCancel,
  formatBookingDate,
  formatBookingMoney,
  getBookingStatus,
} from "@/lib/rider-bookings";
import {
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  SERVICE_RUN_PASSENGER_STATUS_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  Trip,
  TRIP_STATUS_LABELS,
} from "@/lib/types";
import { VehicleGallery } from "./VehicleGallery";

export default function RiderBookingDetailsPage() {
  const params = useParams<{ id: string }>();
  const { bookings, error, isLoading, reload } = useRiderBookings();
  const { showToast } = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const booking = bookings.find((item) => item.id === params.id);

  async function copyReference() {
    if (!booking?.bookingReference) return;

    try {
      await navigator.clipboard.writeText(booking.bookingReference);
      showToast("تم نسخ رقم الحجز.", "success");
    } catch {
      showToast("تعذر نسخ رقم الحجز.", "error");
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    setIsCancelling(true);

    try {
      await apiFetch<Trip>(`/trips/${booking.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ note: "ألغى المسافر الحجز من لوحة المستخدم" }),
      });
      setCancelOpen(false);
      showToast("تم إلغاء الحجز وتحديث مركز العمليات.", "success");
      await reload();
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "تعذر إلغاء الحجز.", "error");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / تفاصيل الحجز"
          title={booking?.bookingReference ?? "تفاصيل الحجز"}
          subtitle="تابع مراحل الحجز وراجع بيانات الرحلة والسائق والمركبة."
          actions={
            <Link className="button" href="/rider/bookings">
              <Icon name="arrow-right" size={17} /> العودة إلى الحجوزات
            </Link>
          }
        />

        {isLoading ? (
          <RiderBookingSkeleton count={2} />
        ) : error ? (
          <section className="panel rider-empty-state rider-empty-state-featured">
            <span><Icon name="wifi" size={32} /></span>
            <h2>تعذر تحميل الحجز</h2>
            <p>{error}</p>
            <button className="button primary" type="button" onClick={reload}>إعادة المحاولة</button>
          </section>
        ) : !booking ? (
          <section className="panel rider-empty-state rider-empty-state-featured">
            <span><Icon name="bookings" size={32} /></span>
            <h2>الحجز غير موجود</h2>
            <p>قد يكون الرابط غير صحيح أو أن الحجز لا يخص هذا الحساب.</p>
            <Link className="button primary" href="/rider/bookings">العودة إلى الحجوزات</Link>
          </section>
        ) : (
          <BookingDetails
            booking={booking}
            onCopyReference={copyReference}
            onCancel={() => setCancelOpen(true)}
          />
        )}

        <ConfirmDialog
          open={cancelOpen}
          title="إلغاء الحجز"
          description="سيتم إرسال الإلغاء فورًا إلى مركز العمليات وإخلاء المقاعد المحجوزة. لا يمكن التراجع عن هذه العملية من لوحة المسافر."
          confirmLabel="تأكيد الإلغاء"
          tone="danger"
          working={isCancelling}
          onConfirm={() => void cancelBooking()}
          onClose={() => !isCancelling && setCancelOpen(false)}
        />
      </Shell>
    </ProtectedRoute>
  );
}

function BookingDetails({
  booking,
  onCopyReference,
  onCancel,
}: {
  booking: Trip;
  onCopyReference: () => void;
  onCancel: () => void;
}) {
  const status = getBookingStatus(booking);
  const vehicle = booking.driver?.driverProfile?.vehicles[0];

  return (
    <>
      <section className={`rider-detail-hero tone-${status.tone}`}>
        <div className="rider-detail-hero-main">
          <div className="rider-detail-reference-row">
            <BookingStatusBadge booking={booking} />
            <button className="rider-copy-reference" type="button" onClick={onCopyReference}>
              <span>{booking.bookingReference}</span>
              <Icon name="bookings" size={16} /> نسخ الرقم
            </button>
          </div>
          <h2>{booking.direction ? DIRECTION_LABELS[booking.direction] : "تفاصيل الرحلة"}</h2>
          <p>{status.description}</p>
          <div className="rider-detail-hero-facts">
            <span><Icon name="calendar" size={18} />{formatBookingDate(booking.travelDate)}</span>
            <span><Icon name="users" size={18} />{booking.passengerCount ?? 1} مسافر</span>
            <span><Icon name="luggage" size={18} />{booking.luggageCount ?? 0} حقيبة</span>
          </div>
        </div>
        <div className="rider-detail-price">
          <small>قيمة الحجز</small>
          <strong>{formatBookingMoney(booking.estimatedFare, booking.currency)}</strong>
          <span>{booking.bookingType ? BOOKING_TYPE_LABELS[booking.bookingType] : "رحلة"}</span>
        </div>
      </section>

      <div className="rider-detail-layout">
        <main className="rider-detail-main">
          <VehicleGallery vehicle={booking.serviceRun?.vehicle ?? null} />
          <section className="panel rider-detail-panel">
            <div className="section-heading rider-section-heading">
              <div>
                <span className="eyebrow">متابعة مباشرة</span>
                <h2>مراحل الحجز</h2>
              </div>
              <span className="rider-current-state">{TRIP_STATUS_LABELS[booking.status]}</span>
            </div>
            <BookingTimeline booking={booking} />
          </section>

          <section className="panel rider-detail-panel">
            <div className="section-heading rider-section-heading">
              <div>
                <span className="eyebrow">بيانات الرحلة</span>
                <h2>تفاصيل الحجز</h2>
              </div>
            </div>

            <div className="rider-detail-cards">
              <DetailItem icon="map-pin" label="نقطة الانطلاق" value={booking.pickupAddress} />
              <DetailItem icon="route" label="نقطة الوصول" value={booking.dropoffAddress} />
              <DetailItem icon="plane" label="رقم الرحلة الجوية" value={booking.flightNumber || "غير مسجل"} />
              <DetailItem icon="clock" label="وقت وصول الطائرة" value={booking.flightArrivalTime || "غير محدد"} />
              <DetailItem icon="user" label="اسم المسافر" value={booking.contactName || "غير مسجل"} />
              <DetailItem icon="phone" label="رقم التواصل" value={booking.contactPhone || "غير مسجل"} ltr />
            </div>

            {booking.notes ? (
              <div className="rider-notes-box">
                <strong>ملاحظات الحجز</strong>
                <p>{booking.notes}</p>
              </div>
            ) : null}
          </section>

          {booking.statusHistory && booking.statusHistory.length > 0 ? (
            <section className="panel rider-detail-panel">
              <div className="section-heading rider-section-heading">
                <div>
                  <span className="eyebrow">سجل النظام</span>
                  <h2>آخر تحديثات الرحلة</h2>
                </div>
              </div>
              <div className="rider-history-list">
                {[...booking.statusHistory].reverse().slice(0, 6).map((history) => (
                  <div key={history.id}>
                    <span className="rider-history-dot" />
                    <div>
                      <strong>{TRIP_STATUS_LABELS[history.to]}</strong>
                      {history.note ? <p>{history.note}</p> : null}
                    </div>
                    <time>{formatBookingDate(history.createdAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="rider-detail-aside">
          <section className="panel rider-driver-panel">
            <span className="eyebrow">السائق والمركبة</span>
            {booking.driver ? (
              <>
                <div className="rider-driver-profile">
                  <span className="rider-driver-avatar">{booking.driver.firstName.slice(0, 1)}{booking.driver.lastName?.slice(0, 1) ?? ""}</span>
                  <div>
                    <strong>{booking.driver.firstName} {booking.driver.lastName}</strong>
                    <small>سائق معتمد</small>
                  </div>
                </div>
                {vehicle ? (
                  <div className="rider-vehicle-card">
                    <Icon name="car" size={25} />
                    <div>
                      <strong>{vehicle.make} {vehicle.model}</strong>
                      <span>{vehicle.color} · {vehicle.plateNumber}</span>
                    </div>
                  </div>
                ) : null}
                {booking.driver.phone ? (
                  <a className="button primary" href={`tel:${booking.driver.phone}`}><Icon name="phone" size={18} /> الاتصال بالسائق</a>
                ) : null}
              </>
            ) : (
              <div className="rider-assignment-empty">
                <span><Icon name="drivers" size={30} /></span>
                <h3>لم يُعيّن السائق بعد</h3>
                <p>سيظهر اسم السائق والمركبة هنا بعد انتهاء مركز العمليات من التعيين.</p>
              </div>
            )}
          </section>

          {booking.serviceRun ? (
            <section className="panel rider-run-panel">
              <span className="eyebrow">الرحلة التشغيلية</span>
              <div className="rider-run-reference">
                <Icon name="route" size={23} />
                <div><small>رقم الرحلة</small><strong>{booking.serviceRun.runReference}</strong></div>
              </div>
              <dl className="rider-summary-list">
                <div><dt>حالة الرحلة</dt><dd>{SERVICE_RUN_STATUS_LABELS[booking.serviceRun.status]}</dd></div>
                <div><dt>حالة المسافر</dt><dd>{booking.serviceRunPassengerStatus ? SERVICE_RUN_PASSENGER_STATUS_LABELS[booking.serviceRunPassengerStatus] : "بانتظار المتابعة"}</dd></div>
                <div><dt>المقاعد</dt><dd>{booking.serviceRun.reservedSeats} / {booking.serviceRun.seatCapacity}</dd></div>
                <div><dt>المركبة</dt><dd>{booking.serviceRun.vehicle?.make ?? "لم يتم تعيين مركبة بعد"} {booking.serviceRun.vehicle?.model ?? ""}</dd></div>
                
              </dl>
            </section>
          ) : null}

          <section className="panel rider-support-panel">
            <span className="rider-quick-icon"><Icon name="phone" size={24} /></span>
            <h2>تحتاج إلى مساعدة؟</h2>
            <p>تواصل مع مركز العمليات مع ذكر رقم الحجز لتسريع المتابعة.</p>
            <a className="button" href="tel:+96100000000">الاتصال بالدعم</a>
          </section>

          {canPassengerCancel(booking) ? (
            <section className="panel rider-cancel-panel">
              <h3>إلغاء الحجز</h3>
              <p>يمكن إلغاء الحجز قبل بدء الرحلة. قد تطبق سياسة الإلغاء وفق موعد الرحلة.</p>
              <button className="button danger" type="button" onClick={onCancel}>إلغاء هذا الحجز</button>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function DetailItem({
  icon,
  label,
  value,
  ltr = false,
}: {
  icon: "map-pin" | "route" | "plane" | "clock" | "user" | "phone";
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="rider-detail-item">
      <span><Icon name={icon} size={20} /></span>
      <div><small>{label}</small><strong className={ltr ? "ltr-text" : ""}>{value}</strong></div>
    </div>
  );
}
