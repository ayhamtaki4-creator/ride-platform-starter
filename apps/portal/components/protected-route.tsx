"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { dashboardHomeForRoles } from "@/lib/role-home";
import { useAuth } from "./auth-provider";

export function ProtectedRoute({
  roles,
  children,
  unauthenticatedRedirect = "/login",
}: {
  roles: string[];
  children: ReactNode;
  unauthenticatedRedirect?: string;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const hasRole = Boolean(user?.roles.some((role) => roles.includes(role)));

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(unauthenticatedRedirect);
      return;
    }

    if (!hasRole) {
      router.replace(dashboardHomeForRoles(user.roles));
    }
  }, [hasRole, isLoading, router, unauthenticatedRedirect, user]);

  if (isLoading) {
    return <div className="panel">جارٍ التحقق من الجلسة...</div>;
  }

  if (!user || !hasRole) {
    return <div className="panel">جارٍ تحويلك إلى الصفحة المناسبة...</div>;
  }

  return children;
}
