"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { TripTrackingPanel } from "@/components/trip-tracking-panel";

export default function AdminTrackingPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / تخطيط الرحلة"
          title="اعتماد مسار الحجز"
          subtitle="أضف نقاط المرور واحسب الطريق الفعلي قبل فرز الحجز إلى السائق. يقفل المسار تلقائيًا بعد التعيين."
          actions={<Link className="button" href={`/admin/bookings/${params.id}`}>العودة إلى الحجز</Link>}
        />
        <TripTrackingPanel tripId={params.id} mode="admin" />
      </Shell>
    </ProtectedRoute>
  );
}
