import { homeForRoles } from "@/lib/types";

export function dashboardHomeForRoles(roles: string[]) {
  const defaultHome = homeForRoles(roles);
  if (defaultHome !== "/") return defaultHome;
  if (roles.includes("FINANCE_MANAGER")) return "/admin/driver-finance";
  return defaultHome;
}
