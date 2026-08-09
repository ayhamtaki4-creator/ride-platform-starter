"use client";

import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RiderBookingCard } from "@/components/rider/booking-card";
import { RiderBookingSkeleton } from "@/components/rider/rider-loading";
import { Shell } from "@/components/shell";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/components/auth-provider";
import { useRiderBookings } from "@/hooks/use-rider-bookings";
import {
  getBookingTab,
  sortBookingsNewest,
  sortUpcomingBookings,
} from "@/lib/rider-bookings";

export default function RiderPage() {
  const { user } = useAuth();
  const {
    bookings,
    error,
    isLoading,
    isRefreshing,
    isRealtimeConnected,
    reload,
  } = useRiderBookings();

  const upcoming = sortUpcomingBookings(bookings);
  const nextBooking = upcoming[0] ?? null;
  const completedCount = bookings.filter((booking) => getBookingTab(booking) === "COMPLETED").length;
  const activeCount = bookings.filter((booking) => getBookingTab(booking) === "ACTIVE").length;
  const recentBookings = sortBookingsNewest(bookings).slice(0, 3);

  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="حساب المسافر"
          title={`مرحبًا ${user?.firstName ?? "بك"}`}
          subtitle="تابع رحلتك القادمة، راجع حجوزاتك، واستلم التحديثات فور حدوثها."
          actions={
            <Link className="button primary" href="/booking">
              <Icon name="calendar" size={18} /> حجز رحلة جديدة
            </Link>
          }
        />

        <div className="rider-dashboard-toolbar">
          <div className={`rider-live-status ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
            <span />
            <div>
              <strong>{isRealtimeConnected ? "متصل بالتحديث المباشر" : "التحديث الاحتياطي فعّال"}</strong>
              <small>{isRealtimeConnected ? "ستظهر تغييرات الحجز فورًا" : "يتم التحقق من الحجوزات كل 30 ثانية"}</small>
            </div>
          </div>
          <button className="button compact-button" type="button" onClick={reload} disabled={isRefreshing}>
            <Icon name="wifi" size={17} /> {isRefreshing ? "جارٍ التحديث..." : "تحديث البيانات"}
          </button>
        </div>

        {error ? (
          <div className="notice error rider-page-notice">
            <strong>تعذر تحميل بعض البيانات.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <section className="rider-stat-grid" aria-label="ملخص الحجوزات">
          <article className="rider-stat-card tone-primary">
            <span className="rider-stat-icon"><Icon name="calendar" size={21} /></span>
            <div><small>الحجوزات القادمة</small><strong>{upcoming.length}</strong></div>
          </article>
          <article className="rider-stat-card tone-info">
            <span className="rider-stat-icon"><Icon name="route" size={21} /></span>
            <div><small>رحلات جارية</small><strong>{activeCount}</strong></div>
          </article>
          <article className="rider-stat-card tone-success">
            <span className="rider-stat-icon"><Icon name="check" size={21} /></span>
            <div><small>رحلات مكتملة</small><strong>{completedCount}</strong></div>
          </article>
          <article className="rider-stat-card tone-neutral">
            <span className="rider-stat-icon"><Icon name="bookings" size={21} /></span>
            <div><small>إجمالي الحجوزات</small><strong>{bookings.length}</strong></div>
          </article>
        </section>

        <div className="rider-dashboard-grid">
          <section className="panel rider-next-panel">
            <div className="section-heading rider-section-heading">
              <div>
                <span className="eyebrow">الأولوية الآن</span>
                <h2>رحلتك القادمة</h2>
              </div>
              <Link className="text-button rider-inline-link" href="/rider/bookings">
                جميع الحجوزات <Icon name="arrow-left" size={16} />
              </Link>
            </div>

            {isLoading ? (
              <RiderBookingSkeleton count={1} />
            ) : nextBooking ? (
              <RiderBookingCard booking={nextBooking} />
            ) : (
              <div className="rider-empty-state rider-empty-state-featured">
                <span><Icon name="plane" size={32} /></span>
                <h3>لا توجد رحلة قادمة</h3>
                <p>أنشئ حجزًا جديدًا وسيظهر هنا مع حالته وبيانات السائق.</p>
                <Link className="button primary" href="/booking">ابدأ الحجز</Link>
              </div>
            )}
          </section>

          <aside className="rider-side-stack">
            <section className="panel rider-quick-card">
              <span className="rider-quick-icon"><Icon name="shield" size={25} /></span>
              <h2>مركز العمليات يتابع رحلتك</h2>
              <p>كل حجز يمر بالمراجعة، تأكيد الموعد، ثم تعيين سائق ومركبة معتمدين.</p>
              <a className="button" href="tel:+96100000000"><Icon name="phone" size={18} /> الاتصال بالدعم</a>
            </section>

            <section className="panel rider-account-card">
              <div className="rider-account-avatar">{user?.firstName.slice(0, 1)}{user?.lastName.slice(0, 1)}</div>
              <div>
                <small>الحساب المسجل</small>
                <strong>{user?.firstName} {user?.lastName}</strong>
                <span>{user?.email}</span>
              </div>
              <Link className="text-button" href="/rider/profile">إدارة الحساب</Link>
            </section>
          </aside>
        </div>

        <section className="panel rider-recent-panel">
          <div className="section-heading rider-section-heading">
            <div>
              <span className="eyebrow">آخر النشاطات</span>
              <h2>أحدث الحجوزات</h2>
            </div>
            <Link className="button compact-button" href="/rider/bookings">
              عرض السجل الكامل
            </Link>
          </div>

          {isLoading ? (
            <RiderBookingSkeleton />
          ) : recentBookings.length > 0 ? (
            <div className="rider-recent-grid">
              {recentBookings.map((booking) => (
                <RiderBookingCard booking={booking} compact key={booking.id} />
              ))}
            </div>
          ) : (
            <div className="rider-empty-state">
              <Icon name="bookings" size={28} />
              <p>لم تنشئ أي حجز حتى الآن.</p>
            </div>
          )}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
