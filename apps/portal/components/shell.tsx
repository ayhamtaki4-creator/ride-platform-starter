"use client";

import Link from "next/link";
import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  const isAdmin = Boolean(
    user?.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"].includes(role)
    )
  );
  const isDriver = Boolean(user?.roles.includes("DRIVER"));
  const isPassenger = Boolean(user?.roles.includes("PASSENGER"));

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          مسار<span>+</span>
        </div>

        {user ? (
          <div className="sidebar-user">
            <strong>
              {user.firstName} {user.lastName}
            </strong>
            <small>{user.email}</small>
          </div>
        ) : null}

        <nav className="nav">
          <Link href="/">نظرة عامة</Link>
          {isPassenger ? <Link href="/rider">واجهة الراكب</Link> : null}
          {isDriver ? <Link href="/driver">واجهة السائق</Link> : null}
          {isAdmin ? <Link href="/admin">لوحة الإدارة</Link> : null}
          {!user ? <Link href="/login">تسجيل الدخول</Link> : null}
        </nav>

        {user ? (
          <button className="sidebar-logout" type="button" onClick={handleLogout}>
            تسجيل الخروج
          </button>
        ) : null}
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
