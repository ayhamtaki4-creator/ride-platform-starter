import Link from 'next/link';
import React from 'react';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">مسار<span>+</span></div>
        <nav className="nav">
          <Link href="/">نظرة عامة</Link>
          <Link href="/rider">واجهة الراكب</Link>
          <Link href="/driver">واجهة السائق</Link>
          <Link href="/admin">لوحة الإدارة</Link>
          <Link href="/login">تسجيل الدخول</Link>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
