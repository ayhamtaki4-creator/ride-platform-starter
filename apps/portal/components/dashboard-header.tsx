import Link from 'next/link';

export function DashboardHeader({
  eyebrow,
  title,
  subtitle
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <div className="role-switch">
        <Link href="/rider">راكب</Link>
        <Link href="/driver">سائق</Link>
        <Link href="/admin">إدارة</Link>
      </div>
    </header>
  );
}
