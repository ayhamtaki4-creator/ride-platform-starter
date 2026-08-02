import { statusClass } from "@/lib/admin-operations";

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`status-pill ${statusClass(status)}`}>{label ?? status}</span>;
}
