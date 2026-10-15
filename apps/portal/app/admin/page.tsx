"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { BOOKING_REVIEW_LABELS, DIRECTION_LABELS, Trip } from "@/lib/types";

type Dashboard = {
  totalBookings: number;
  newBookings: number;
  staleNewBookings: number;
  pendingReviewOver30Minutes: number;
  confirmedWithoutDriver: number;
  confirmedWithoutDriverOver30Minutes: number;
  exhaustedTelegramDeliveries: number;
  delayedTelegramDeliveries: number;
  activeTrips: number;
  availableDrivers: number;
  revenue: number;
  completedBookingValue: number;
  outstandingRevenue: number;
  unpaidCompletedBookings: number;
  latest: Trip[];
};

export default function AdminPage() {
  const { user, socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const canViewFinance = Boolean(user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "FINANCE_MANAGER"].includes(role)));

  const load = useCallback(async () => {
    try { setData(await apiFetch<Dashboard>("/admin/dashboard")); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تحميل لوحة الإدارة."); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => void load();
    socket.on("admin.booking.created", refresh);
    socket.on("admin.booking.updated", refresh);
    socket.on("admin.trip.updated", refresh);
    return () => { socket.off("admin.booking.created", refresh); socket.off("admin.booking.updated", refresh); socket.off("admin.trip.updated", refresh); };
  }, [load, socket]);

  return <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}><Shell>
    <DashboardHeader eyebrow="الإدارة" title="نظرة عامة" subtitle="ملخص الحجوزات والتشغيل والتحصيل النقدي." />
    <div className={`connection-badge ${isRealtimeConnected ? "is-online" : "is-offline"}`}>{isRealtimeConnected ? "مركز العمليات متصل مباشرًا" : "جارٍ استعادة الاتصال"}</div>
    {error ? <div className="notice error">{error}</div> : null}
    <section className="grid admin-stats">
      <div className="card"><div className="label">الحجوزات</div><div className="value">{data?.totalBookings ?? 0}</div></div>
      <div className="card"><div className="label">طلبات جديدة</div><div className="value">{data?.newBookings ?? 0}</div></div>
      <div className="card"><div className="label">رحلات جارية</div><div className="value">{data?.activeTrips ?? 0}</div></div>
      <div className="card"><div className="label">سائقون متاحون</div><div className="value">{data?.availableDrivers ?? 0}</div></div>
      <div className="card"><div className="label">المحصل نقدًا</div><div className="value">${data?.revenue ?? 0}</div></div>
      <div className="card"><div className="label">غير محصل</div><div className="value">${data?.outstandingRevenue ?? 0}</div><small>{data?.unpaidCompletedBookings ?? 0} حجز مكتمل يحتاج مراجعة دفع</small></div>
    </section>
    {data && (data.pendingReviewOver30Minutes > 0 || data.staleNewBookings > 0 || data.confirmedWithoutDriver > 0) ? (
      <section className="panel" aria-labelledby="operations-attention-title">
        <div className="section-heading">
          <div>
            <h2 id="operations-attention-title">حجوزات تحتاج متابعة</h2>
            <p className="subtitle">هذه تنبيهات تشغيلية فقط؛ لن يتم رفض أو إلغاء أي حجز تلقائيًا.</p>
          </div>
          <Link className="button" href="/admin/bookings?status=NEW">مراجعة الطلبات الجديدة</Link>
        </div>
        {data.pendingReviewOver30Minutes > 0 ? (
          <div className="notice error" role="status">
            يوجد <strong>{data.pendingReviewOver30Minutes}</strong> طلب جديد لم يُراجع منذ أكثر من 30 دقيقة.
            {" "}
            <Link href="/admin/bookings?attention=REVIEW_OVER_30M">مراجعة الطلبات المتأخرة</Link>
          </div>
        ) : null}
        {data.staleNewBookings > 0 ? (
          <div className="notice" role="status">
            من طلبات المراجعة المتأخرة، يوجد <strong>{data.staleNewBookings}</strong> تجاوزت 24 ساعة.
            {" "}
            <Link href="/admin/bookings?attention=REVIEW_OVER_24H">عرض الأقدم أولاً</Link>
          </div>
        ) : null}
        {data.confirmedWithoutDriver > 0 ? (
          <div className="notice" role="status">
            يوجد <strong>{data.confirmedWithoutDriver}</strong> حجز مؤكد بانتظار تعيين سائق
            {(data.confirmedWithoutDriverOver30Minutes ?? 0) > 0
              ? <>، منها <strong>{data.confirmedWithoutDriverOver30Minutes}</strong> تجاوزت 30 دقيقة دون تعيين</>
              : null}.
            {" "}
            <Link href="/admin/bookings?attention=DRIVER_UNASSIGNED">عرض قائمة التعيين</Link>
            {(data.confirmedWithoutDriverOver30Minutes ?? 0) > 0
              ? <> · <Link href="/admin/bookings?attention=DRIVER_OVER_30M">عرض المتأخرة فقط</Link></>
              : null}
          </div>
        ) : null}
      </section>
    ) : null}
    {data && ((data.exhaustedTelegramDeliveries ?? 0) > 0 || (data.delayedTelegramDeliveries ?? 0) > 0) ? (
      <section className="panel" aria-labelledby="telegram-attention-title">
        <div className="section-heading">
          <div>
            <h2 id="telegram-attention-title">تنبيهات Telegram تحتاج متابعة</h2>
            <p className="subtitle">راجع محاولات إرسال الإشعارات لتتأكد من وصول حجوزات العملاء إلى مركز العمليات.</p>
          </div>
          <Link className="button" href="/admin/telegram">سجل الإشعارات</Link>
        </div>
        {(data.exhaustedTelegramDeliveries ?? 0) > 0 ? (
          <div className="notice error" role="status">
            يوجد <strong>{data.exhaustedTelegramDeliveries}</strong> إشعار فشل نهائيًا بعد خمس محاولات.
            {" "}<Link href="/admin/telegram?status=FAILED">عرض الإشعارات الفاشلة</Link>
          </div>
        ) : null}
        {(data.delayedTelegramDeliveries ?? 0) > 0 ? (
          <div className="notice" role="status">
            يوجد <strong>{data.delayedTelegramDeliveries}</strong> إشعار متأخر أكثر من 15 دقيقة في قائمة الإرسال.
            {" "}<Link href="/admin/telegram">مراجعة قائمة الإرسال</Link>
          </div>
        ) : null}
      </section>
    ) : null}
    <section className="operations-shortcuts">
      <Link className="panel operations-shortcut" href="/admin/tracking"><span>GPS</span><strong>مراقبة السائقين مباشرة</strong><small>حالة التتبع وآخر موقع وصل إلى الخادم بعيدًا عن قائمة الحجوزات.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/routes"><span>المسارات</span><strong>إدارة المدن والمطارات والخطوط</strong><small>إضافة دمشق–عمّان أو أي محافظة وتسعيرها.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/drivers"><span>الأسطول</span><strong>السائقون والمركبات</strong><small>المراكز والدول والصور والوثائق.</small></Link>
      {canViewFinance ? <Link className="panel operations-shortcut" href="/admin/driver-finance"><span>المالية</span><strong>حسابات وتسويات السائقين</strong><small>اعرف فورًا من يدين لمن وسجل أي تسوية بدون حذف التاريخ.</small></Link> : null}
      <Link className="panel operations-shortcut" href="/admin/compliance"><span>الامتثال</span><strong>التصاريح القريبة من الانتهاء</strong><small>اعتماد الملفات ومتطلبات الأردن ولبنان.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/users"><span>الحسابات</span><strong>إنشاء المستخدمين والموظفين</strong><small>الأدوار والتفعيل وكلمات المرور.</small></Link>
    </section>
    <section className="panel">
      <div className="section-heading"><div><h2>أحدث الحجوزات</h2><p className="subtitle">الطلبات الأحدث ومراحل مراجعتها. يمكن اعتماد مسار كل حجز قبل تعيين السائق.</p></div><Link className="button" href="/admin/bookings">عرض الكل</Link></div>
      <div className="booking-list">{data?.latest.map((booking) => <article className="booking-card compact" key={booking.id}>
        <div className="booking-card-head"><div><strong>{booking.bookingReference}</strong><small>{booking.contactName} · {booking.route?.nameAr ?? (booking.direction ? DIRECTION_LABELS[booking.direction] : booking.pickupAddress)}</small></div><span className="status">{booking.bookingReviewStatus ? BOOKING_REVIEW_LABELS[booking.bookingReviewStatus] : booking.status}</span></div>
        <div className="actions">
          <Link className="button primary compact-button" href={`/admin/bookings/${booking.id}/tracking`}>{booking.driver ? "تتبع الرحلة" : "تخطيط المسار"}</Link>
          <Link className="button compact-button" href={`/admin/bookings/${booking.id}`}>تفاصيل الحجز</Link>
        </div>
      </article>)}</div>
    </section>
  </Shell></ProtectedRoute>;
}
