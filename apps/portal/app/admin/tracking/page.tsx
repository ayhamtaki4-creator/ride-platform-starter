"use client";

import Link from "next/link";
import { AdminGpsMonitor } from "@/components/admin/admin-gps-monitor";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";

export default function AdminTrackingPage() {
  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / التتبع"
          title="مراقبة GPS للسائقين"
          subtitle="نافذة مستقلة لمراقبة حالة GPS وآخر موقع وصل إلى الخادم لكل رحلة نشطة."
          actions={<Link className="button" href="/admin/bookings">الحجوزات الحالية</Link>}
        />
        <AdminGpsMonitor />
      </Shell>
    </ProtectedRoute>
  );
}
