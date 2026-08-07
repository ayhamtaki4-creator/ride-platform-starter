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
  activeTrips: number;
  availableDrivers: number;
  revenue: number;
  latest: Trip[];
};

export default function AdminPage() {
  const { socket, isRealtimeConnected } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

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
    <DashboardHeader eyebrow="الإدارة" title="نظرة عامة" subtitle="ملخص الحجوزات والتشغيل والإيرادات." />
    <div className={`connection-badge ${isRealtimeConnected ? "is-online" : "is-offline"}`}>{isRealtimeConnected ? "مركز العمليات متصل مباشرًا" : "جارٍ استعادة الاتصال"}</div>
    {error ? <div className="notice error">{error}</div> : null}
    <section className="grid admin-stats">
      <div className="card"><div className="label">الحجوزات</div><div className="value">{data?.totalBookings ?? 0}</div></div>
      <div className="card"><div className="label">طلبات جديدة</div><div className="value">{data?.newBookings ?? 0}</div></div>
      <div className="card"><div className="label">رحلات جارية</div><div className="value">{data?.activeTrips ?? 0}</div></div>
      <div className="card"><div className="label">سائقون متاحون</div><div className="value">{data?.availableDrivers ?? 0}</div></div>
      <div className="card"><div className="label">الإيرادات</div><div className="value">${data?.revenue ?? 0}</div></div>
    </section>
    <section className="operations-shortcuts">
      <Link className="panel operations-shortcut" href="/admin/routes"><span>المسارات</span><strong>إدارة المدن والمطارات والخطوط</strong><small>إضافة دمشق–عمّان أو أي محافظة وتسعيرها.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/drivers"><span>الأسطول</span><strong>السائقون والمركبات</strong><small>المراكز والدول والصور والوثائق.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/compliance"><span>الامتثال</span><strong>التصاريح القريبة من الانتهاء</strong><small>اعتماد الملفات ومتطلبات الأردن ولبنان.</small></Link>
      <Link className="panel operations-shortcut" href="/admin/users"><span>الحسابات</span><strong>إنشاء المستخدمين والموظفين</strong><small>الأدوار والتفعيل وكلمات المرور.</small></Link>
    </section>
    <section className="panel">
      <div className="section-heading"><div><h2>أحدث الحجوزات</h2><p className="subtitle">الطلبات الأحدث ومراحل مراجعتها. يمكن اعتماد مسار كل حجز قبل تعيين السائق.</p></div><Link className="button" href="/admin/bookings">عرض الكل</Link></div>
      <div className="booking-list">{data?.latest.map((booking) => <article className="booking-card compact" key={booking.id}>
        <div className="booking-card-head"><div><strong>{booking.bookingReference}</strong><small>{booking.contactName} · {booking.route?.nameAr ?? (booking.direction ? DIRECTION_LABELS[booking.direction] : booking.pickupAddress)}</small></div><span className="status">{booking.bookingReviewStatus ? BOOKING_REVIEW_LABELS[booking.bookingReviewStatus] : booking.status}</span></div>
        <div className="actions">
          {!booking.driverId ? <Link className="button primary compact-button" href={`/admin/bookings/${booking.id}/tracking`}>تخطيط المسار</Link> : <Link className="button primary compact-button" href={`/admin/bookings/${booking.id}/tracking`}>تتبع الرحلة</Link>}
          <Link className="button compact-button" href={`/admin/bookings/${booking.id}`}>تفاصيل الحجز</Link>
        </div>
      </article>)}</div>
    </section>
  </Shell></ProtectedRoute>;
}
