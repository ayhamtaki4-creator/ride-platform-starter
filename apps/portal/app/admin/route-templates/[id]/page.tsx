"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { RouteTemplateEditor } from "@/components/admin/route-template-editor";
import { Shell } from "@/components/shell";

export default function AdminRouteTemplatePage() {
  const params = useParams<{ id: string }>();
  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="الإدارة / قوالب المسارات"
          title="تحديد وحفظ المسار الافتراضي"
          subtitle="هذا القالب يحدد نقطة البداية والنهاية والطريق الذي يُنسخ تلقائيًا إلى الحجوزات الجديدة."
          actions={<Link className="button" href="/admin/route-templates">العودة إلى القوالب</Link>}
        />
        <RouteTemplateEditor routeId={params.id} />
      </Shell>
    </ProtectedRoute>
  );
}
