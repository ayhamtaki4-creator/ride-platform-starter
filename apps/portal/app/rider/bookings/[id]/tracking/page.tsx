"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { TripTrackingPanel } from "@/components/trip-tracking-panel";

export default function RiderTrackingPage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute roles={["PASSENGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="المسافر / التتبع"
          title="متابعة الرحلة على الخريطة"
          subtitle="شاهد المسار المعتمد وموقع السيارة أثناء الرحلة وشارك رابط المتابعة مع أحد أقاربك."
          actions={<Link className="button" href={`/rider/bookings/${params.id}`}>العودة إلى الحجز</Link>}
        />
        <TripTrackingPanel tripId={params.id} mode="rider" />
      </Shell>
    </ProtectedRoute>
  );
}
