import { homeForRoles } from "@/lib/types";

export function dashboardHomeForRoles(roles: string[]) {
  if (roles.includes("FINANCE_MANAGER")) return "/admin/driver-finance";
  return homeForRoles(roles);
}
