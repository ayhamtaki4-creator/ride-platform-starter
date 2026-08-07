"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RiderBookingCard } from "@/components/rider/booking-card";
import { RiderBookingSkeleton } from "@/components/rider/rider-loading";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useRiderBookings } from "@/hooks/use-rider-bookings";
import {
  getBookingTab,
  isBookingCancelled,
  isBookingCompleted,
  RiderBookingTab,
  sortBookingsNewest,
} from "@/lib/rider-bookings";
import { BookingDirection, DIRECTION_LABELS } from "@/lib/types";

const tabs: Array<{ value: RiderBookingTab | "ALL"; label: string }> = [
  { value: "ALL", label: "الكل" },
  { value: "UPCOMING", label: "القادمة" },
  { value: "ACTIVE", label: "الجارية" },
];

const pageSize = 6;

export default function RiderBookingsPage() {
  const {
    bookings,
    error,
    isLoading,
    isRefreshing,
    isRealtimeConnected,
    reload,
  } = useRiderBookings();
  const [tab, setTab] = useState<RiderBookingTab | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<BookingDirection | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const activeBookings = useMemo(
    () => bookings.filter((booking) => !isBookingCompleted(booking) && !isBookingCancelled(booking)),
    [bookings],
  );

  const counts = useMemo(() => {
    const result: Record<RiderBookingTab | "ALL", number> = {
      ALL: activeBookings.length,
      UPCOMING: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    activeBookings.forEach((booking) => {
      result[getBookingTab(booking)] += 1;
    });
    return result;
  }, [activeBookings]);

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortBookingsNewest(activeBookings).filter((booking) => {
      if (tab !== "ALL" && getBookingTab(booking) !== tab) return false;
      if (direction !== "ALL" && booking.direction !== direction) return false;

      if (!normalizedQuery) return true;
      return [
        booking.bookingReference,
        booking.contactName,
        booking.contactPhone,
        booking.pickupAddress,
        booking.dropoffAddress,
        booking.flightNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [activeBookings, direction, query, tab]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const visibleBookings = filteredBookings.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [tab, query, direction]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر / الحجوزات"
          title="حجوزاتي الحالية"
          subtitle="الحجوزات الجديدة والجارية فقط، مرتبة بحيث يظهر الأحدث أولًا. الحجوزات المكتملة والملغاة محفوظة في الحجوزات المنتهية."
          actions={
            <div className="actions">
              <Link className="button" href="/rider/completed-bookings"><Icon name="check" size={18} /> الحجوزات المنتهية</Link>
              <Link className="button primary" href="/#booking"><Icon name="calendar" size={18} /> حجز جديد</Link>
            </div>
          }
        />

        <div className="rider-dashboard-toolbar">
          <div className={`rider-live-status ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
            <span />
            <div>
              <strong>{isRealtimeConnected ? "التحديث المباشر متصل" : "التحديث الاحتياطي فعّال"}</strong>
              <small>آخر البيانات المعروضة تخص حسابك فقط</small>
            </div>
          </div>
          <button className="button compact-button" type="button" onClick={reload} disabled={isRefreshing}>
            <Icon name="wifi" size={17} /> {isRefreshing ? "جارٍ التحديث..." : "تحديث"}
          </button>
        </div>

        <section className="panel rider-bookings-panel">
          <div className="rider-booking-tabs" role="tablist" aria-label="تصفية الحجوزات حسب الحالة">
            {tabs.map((item) => (
              <button
                className={tab === item.value ? "is-active" : ""}
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                onClick={() => setTab(item.value)}
              >
                <span>{item.label}</span>
                <small>{counts[item.value]}</small>
              </button>
            ))}
          </div>

          <div className="rider-booking-filters">
            <label className="rider-search-field">
              <span className="label">البحث في الحجوزات</span>
              <span className="rider-input-with-icon">
                <Icon name="bookings" size={18} />
                <input
                  className="input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="رقم الحجز، الاسم، الهاتف أو رقم الطائرة"
                />
              </span>
            </label>

            <label>
              <span className="label">اتجاه الرحلة</span>
              <select
                className="input"
                value={direction}
                onChange={(event) => setDirection(event.target.value as BookingDirection | "ALL")}
              >
                <option value="ALL">كل الاتجاهات</option>
                <option value="BEIRUT_AIRPORT_TO_DAMASCUS">{DIRECTION_LABELS.BEIRUT_AIRPORT_TO_DAMASCUS}</option>
                <option value="DAMASCUS_TO_BEIRUT_AIRPORT">{DIRECTION_LABELS.DAMASCUS_TO_BEIRUT_AIRPORT}</option>
              </select>
            </label>

            <div className="rider-filter-summary">
              <small>النتائج</small>
              <strong>{filteredBookings.length}</strong>
            </div>
          </div>

          {error ? <div className="notice error">{error}</div> : null}

          {isLoading ? (
            <RiderBookingSkeleton count={4} />
          ) : visibleBookings.length > 0 ? (
            <>
              <div className="rider-booking-list-v2">
                {visibleBookings.map((booking) => (
                  <RiderBookingCard booking={booking} key={booking.id} />
                ))}
              </div>

              {totalPages > 1 ? (
                <nav className="rider-pagination" aria-label="صفحات الحجوزات">
                  <button className="button compact-button" type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                    <Icon name="arrow-right" size={16} /> السابق
                  </button>
                  <span>صفحة {page} من {totalPages}</span>
                  <button className="button compact-button" type="button" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>
                    التالي <Icon name="arrow-left" size={16} />
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <div className="rider-empty-state rider-empty-state-featured">
              <span><Icon name="bookings" size={32} /></span>
              <h3>لا توجد حجوزات حالية مطابقة</h3>
              <p>الحجوزات المكتملة أو الملغاة ستجدها في صفحة الحجوزات المنتهية.</p>
              <div className="actions">
                {(query || direction !== "ALL" || tab !== "ALL") ? (
                  <button className="button" type="button" onClick={() => { setQuery(""); setDirection("ALL"); setTab("ALL"); }}>
                    مسح التصفية
                  </button>
                ) : null}
                <Link className="button" href="/rider/completed-bookings">الحجوزات المنتهية</Link>
                <Link className="button primary" href="/#booking">حجز رحلة جديدة</Link>
              </div>
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
