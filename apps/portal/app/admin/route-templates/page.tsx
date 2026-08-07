"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import type { AdminRouteTemplateRecord } from "@/lib/route-templates";

export default function AdminRouteTemplatesPage() {
  const [items, setItems] = useState<AdminRouteTemplateRecord[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AdminRouteTemplateRecord[]>("/admin/route-templates");
      setItems(data);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل قوالب المسارات.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader
          eyebrow="إدارة التشغيل"
          title="قوالب المسارات المحفوظة"
          subtitle="حدد البداية والنهاية والطريق الافتراضي لكل خط. كل حجز جديد يستخدم القالب المحفوظ تلقائيًا."
          actions={<Link className="button" href="/admin/routes">المواقع والمسارات</Link>}
        />

        {error ? <div className="notice error">{error}</div> : null}

        <section className="operations-card-grid">
          {items.map(({ route, template }) => (
            <article className="panel route-admin-card" key={route.id}>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">{route.code}</div>
                  <h2>{route.nameAr}</h2>
                  <p className="subtitle">{route.origin.nameAr} ← {route.destination.nameAr}</p>
                </div>
                <StatusPill
                  status={template ? "ACTIVE" : "PENDING"}
                  label={template ? "قالب محفوظ" : "يحتاج إعداد"}
                />
              </div>

              {template ? (
                <div className="tracking-summary-grid">
                  <div><small>البداية</small><strong>{template.originAddress}</strong></div>
                  <div><small>النهاية</small><strong>{template.destinationAddress}</strong></div>
                  <div><small>المسافة</small><strong>{template.distanceKm != null ? `${template.distanceKm.toFixed(1)} كم` : "—"}</strong></div>
                </div>
              ) : (
                <div className="notice">لم يتم بعد تحديد نقطة البداية والنهاية الدقيقة لهذا المسار.</div>
              )}

              <div className="actions">
                <Link className="button primary" href={`/admin/route-templates/${route.id}`}>
                  {template ? "تعديل القالب والخريطة" : "تحديد البداية والنهاية"}
                </Link>
              </div>
            </article>
          ))}
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
