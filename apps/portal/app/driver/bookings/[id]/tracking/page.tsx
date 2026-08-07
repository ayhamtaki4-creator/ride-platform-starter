"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { DriverLocationBroadcaster } from "@/components/driver-location-broadcaster";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { TripTrackingPanel } from "@/components/trip-tracking-panel";

export default function DriverTrackingPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute roles={["DRIVER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="السائق / الخريطة"
          title="مسار المهمة والتتبع المباشر"
          subtitle="يبدأ GPS تلقائيًا بعد الضغط على «وصلت إلى المسافر»، ثم يستمر التتبع أثناء تنفيذ الرحلة."
          actions={<Link className="button" href="/driver/bookings">العودة إلى المهام</Link>}
        />
        <section className="panel">
          <h2>مشاركة موقع السيارة</h2>
          <p className="subtitle">لا يوجد زر تشغيل منفصل. اسمح للمتصفح باستخدام الموقع عند طلبه وأبقِ الموقع مفتوحًا أثناء الرحلة.</p>
          <DriverLocationBroadcaster tripId={params.id} active />
        </section>
        <TripTrackingPanel tripId={params.id} mode="driver" />
      </Shell>
    </ProtectedRoute>
  );
}
