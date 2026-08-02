import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./ui/icon";

export function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar dashboard-heading-v2">
      <div>
        <div className="breadcrumb"><Link href="/">طريق الشام</Link><span>/</span><span>{eyebrow}</span></div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {actions ? (
        <div className="dashboard-header-actions">{actions}</div>
      ) : (
        <div className="role-switch dashboard-shortcuts">
          <Link href="/rider"><Icon name="bookings" size={17} />الراكب</Link>
          <Link href="/driver"><Icon name="briefcase" size={17} />السائق</Link>
          <Link href="/admin"><Icon name="dashboard" size={17} />الإدارة</Link>
        </div>
      )}
    </header>
  );
}
