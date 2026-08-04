"use client";

import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { apiFetch, fetchProtectedBlob } from "@/lib/api";
import {
  BOOKING_REVIEW_LABELS,
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  DRIVER_ASSIGNMENT_LABELS,
  SERVICE_RUN_STATUS_LABELS,
  Trip,
  TRIP_STATUS_LABELS,
  VEHICLE_CLASS_LABELS,
} from "@/lib/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function AdminBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [openingTicket, setOpeningTicket] = useState(false);

  const load = useCallback(async () => {
    try {
      setBooking(await apiFetch<Trip>(`/admin/bookings/${params.id}`));
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "تعذر تحميل تفاصيل الحجز."
      );
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openFlightTicket() {
    if (!booking?.flightTicketMedia) return;
    setOpeningTicket(true);
    try {
      const blob = await fetchProtectedBlob(`/bookings/${booking.id}/flight-ticket`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح تذكرة الطيران.");
    } finally {
      setOpeningTicket(false);
    }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="تفاصيل الحجز"
          title={booking?.bookingReference || "تحميل الحجز"}
          subtitle="بيانات المسافر والرحلة والتعيين وسجل الحالات."
        />

        <div className="actions">
          <Link className="button" href="/admin/bookings">
            العودة إلى الحجوزات
          </Link>
          <button className="button" type="button" onClick={() => void load()}>
            تحديث
          </button>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {booking ? (
          <>
            <section className="grid admin-stats">
              <div className="card">
                <div className="label">مراجعة الإدارة</div>
                <div className="value compact-value">
                  {booking.bookingReviewStatus
                    ? BOOKING_REVIEW_LABELS[booking.bookingReviewStatus]
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">حالة التشغيل</div>
                <div className="value compact-value">
                  {TRIP_STATUS_LABELS[booking.status]}
                </div>
              </div>
              <div className="card">
                <div className="label">رد السائق</div>
                <div className="value compact-value">
                  {booking.driverAssignmentStatus
                    ? DRIVER_ASSIGNMENT_LABELS[
                        booking.driverAssignmentStatus
                      ]
                    : "—"}
                </div>
              </div>
              <div className="card">
                <div className="label">السعر</div>
                <div className="value compact-value">
                  {Number(booking.estimatedFare).toLocaleString("ar")}{" "}
                  {booking.currency}
                </div>
              </div>
            </section>

            <section className="two-column-layout">
              <article className="panel">
                <h2>بيانات الحجز</h2>
                <div className="detail-list">
                  <div>
                    <span>المسافر</span>
                    <strong>{booking.contactName || "—"}</strong>
                  </div>
                  <div>
                    <span>الهاتف</span>
                    <strong>{booking.contactPhone || "—"}</strong>
                  </div>
                  <div>
                    <span>الاتجاه</span>
                    <strong>
                      {booking.direction
                        ? DIRECTION_LABELS[booking.direction]
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>نوع الحجز</span>
                    <strong>
                      {booking.bookingType
                        ? BOOKING_TYPE_LABELS[booking.bookingType]
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>يوم وتاريخ الوصول</span>
                    <strong>
                      {booking.travelDate
                        ? new Date(booking.travelDate).toLocaleDateString("ar-SY", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>الطائرة</span>
                    <strong>
                      {booking.flightNumber || "—"} ·{" "}
                      {booking.flightArrivalTime || "—"}
                    </strong>
                  </div>
                  {booking.flightTicketMedia ? (
                    <div>
                      <span>ملف التذكرة</span>
                      <strong>
                        <button className="text-button" type="button" disabled={openingTicket} onClick={() => void openFlightTicket()}>
                          {openingTicket ? "جارٍ الفتح..." : booking.flightTicketMedia.originalName}
                        </button>
                      </strong>
                    </div>
                  ) : null}
                  <div>
                    <span>{booking.bookingType === "PRIVATE_CAR" ? "فئة السيارة" : "الحجز المشترك"}</span>
                    <strong>
                      {booking.bookingType === "PRIVATE_CAR"
                        ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"]
                        : "مقعد واحد"}
                    </strong>
                  </div>
                  <div>
                    <span>المسار</span>
                    <strong>
                      {booking.pickupAddress} ← {booking.dropoffAddress}
                    </strong>
                  </div>
                </div>
                {booking.notes ? (
                  <div className="notice">{booking.notes}</div>
                ) : null}
              </article>

              <article className="panel">
                <h2>السائق والتشغيل</h2>
                {booking.driver ? (
                  <div className="detail-list">
                    <div>
                      <span>السائق</span>
                      <strong>
                        {booking.driver.firstName} {booking.driver.lastName}
                      </strong>
                    </div>
                    <div>
                      <span>الهاتف</span>
                      <strong>{booking.driver.phone || "—"}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">لم يعيّن سائق بعد.</div>
                )}

                {booking.serviceRun ? (
                  <>
                    <div className="notice success">
                      تشغيل {booking.serviceRun.runReference} ·{" "}
                      {
                        SERVICE_RUN_STATUS_LABELS[
                          booking.serviceRun.status
                        ]
                      }
                    </div>
                    <div className="detail-list">
                      <div>
                        <span>المركبة</span>
                        <strong>
{booking.serviceRun.vehicle?.make ?? "مركبة غير محددة"}{" "}
{booking.serviceRun.vehicle?.model ?? ""} ·{" "}
{booking.serviceRun.vehicle?.plateNumber ?? "بدون لوحة"}
                        </strong>
                      </div>
                      <div>
                        <span>المقاعد المحجوزة</span>
                        <strong>
                          {booking.serviceRun.reservedSeats}/
                          {booking.serviceRun.seatCapacity}
                        </strong>
                      </div>
                    </div>
                    <div className="schedule-list">
                      <strong>{booking.bookingType === "PRIVATE_CAR" ? "الحجز الخاص" : "ركاب التشغيل المشترك"}</strong>
                      {booking.serviceRun.bookings.map((item) => (
                        <div className="schedule-row" key={item.id}>
                          <div>
                            <strong>{item.bookingReference || "حجز"}</strong>
                            <small>
                              {item.contactName || "—"} ·{" "}
                              {item.contactPhone || "—"}
                            </small>
                          </div>
                          <span>
                            {booking.bookingType === "PRIVATE_CAR"
                              ? VEHICLE_CLASS_LABELS[booking.vehicleClass ?? "SMALL"]
                              : "مقعد واحد"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </article>
            </section>

            <section className="panel">
              <h2>سجل الحالات</h2>
              <div className="timeline-list">
                {booking.statusHistory?.map((item) => (
                  <div className="timeline-row" key={item.id}>
                    <span>{TRIP_STATUS_LABELS[item.to]}</span>
                    <small>
                      {new Date(item.createdAt).toLocaleString("ar")}
                    </small>
                    <p>{item.note || "—"}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">جارٍ تحميل بيانات الحجز...</div>
        )}
      </Shell>
    </ProtectedRoute>
  );
}
