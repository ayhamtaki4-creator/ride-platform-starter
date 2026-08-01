"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeForRoles } from "@/lib/types";
import { useAuth } from "./auth-provider";

export function ProtectedRoute({
  roles,
  children,
}: {
  roles: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const hasRole = Boolean(user?.roles.some((role) => roles.includes(role)));

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!hasRole) {
      router.replace(homeForRoles(user.roles));
    }
  }, [hasRole, isLoading, router, user]);

  if (isLoading) {
    return <div className="panel">جارٍ التحقق من الجلسة...</div>;
  }

  if (!user || !hasRole) {
    return <div className="panel">جارٍ تحويلك إلى الصفحة المناسبة...</div>;
  }

  return children;
}
