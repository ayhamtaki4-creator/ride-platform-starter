"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "@/components/dashboard-header";
import { ProtectedRoute } from "@/components/protected-route";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/admin/status-pill";
import { apiFetch } from "@/lib/api";
import { AdminUserRecord } from "@/lib/admin-operations";

const roleOptions = [
  { code: "PASSENGER", label: "مسافر" },
  { code: "SUPPORT_AGENT", label: "دعم العملاء" },
  { code: "OPERATIONS_MANAGER", label: "مدير عمليات" },
  { code: "FINANCE_MANAGER", label: "مدير مالي" },
  { code: "ADMIN", label: "مدير" },
];

const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "ChangeMe123!",
  roleCodes: ["PASSENGER"] as string[],
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setUsers(await apiFetch<AdminUserRecord[]>("/admin/users"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحميل المستخدمين.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const normalized = search.trim().toLowerCase();
  const filtered = useMemo(() => users.filter((user) => {
    const roles = user.roles.map((item) => item.role.code);
    if (roleFilter && !roles.includes(roleFilter)) return false;
    if (!normalized) return true;
    return `${user.firstName} ${user.lastName} ${user.email} ${user.phone ?? ""} ${roles.join(" ")}`.toLowerCase().includes(normalized);
  }), [normalized, roleFilter, users]);

  function toggleRole(code: string, checked: boolean) {
    setForm((current) => ({ ...current, roleCodes: checked ? Array.from(new Set([...current.roleCodes, code])) : current.roleCodes.filter((role) => role !== code) }));
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setWorking("create"); setMessage(""); setError("");
    try {
      await apiFetch("/admin/users", { method: "POST", body: JSON.stringify(form) });
      setMessage("تم إنشاء الحساب بنجاح.");
      setForm(initialForm);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء الحساب.");
    } finally { setWorking(""); }
  }

  async function changeStatus(user: AdminUserRecord, status: "activate" | "suspend") {
    setWorking(user.id); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/users/${user.id}/${status}`, { method: "POST" });
      setMessage(status === "activate" ? "تم تفعيل الحساب." : "تم تعليق الحساب.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث الحساب.");
    } finally { setWorking(""); }
  }

  async function resetPassword(user: AdminUserRecord) {
    const password = window.prompt(`كلمة المرور الجديدة لحساب ${user.firstName}:`, "ChangeMe123!");
    if (!password) return;
    setWorking(user.id); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/users/${user.id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) });
      setMessage("تم تعيين كلمة المرور الجديدة.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إعادة تعيين كلمة المرور.");
    } finally { setWorking(""); }
  }

  async function editRoles(user: AdminUserRecord) {
    const current = user.roles.map((item) => item.role.code).join(",");
    const raw = window.prompt("اكتب رموز الأدوار مفصولة بفواصل:", current);
    if (!raw) return;
    const roleCodes = raw.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
    setWorking(user.id); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ roleCodes }) });
      setMessage("تم تحديث أدوار المستخدم.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث الأدوار.");
    } finally { setWorking(""); }
  }

  async function editContact(user: AdminUserRecord) {
    const phone = window.prompt(
      "رقم WhatsApp مع رمز الدولة، مثل +963 أو +961 أو +962:",
      user.phone ?? "+963",
    );
    if (!phone) return;
    setWorking(user.id); setMessage(""); setError("");
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ phone }),
      });
      setMessage("تم تحديث رقم الهاتف وتفعيل رسائل WhatsApp للحساب.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تحديث رقم الهاتف.");
    } finally { setWorking(""); }
  }

  return (
    <ProtectedRoute roles={["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"]}>
      <Shell>
        <DashboardHeader eyebrow="الإدارة" title="الحسابات والمستخدمون" subtitle="إنشاء حسابات العملاء والموظفين وتفعيلها وتعليقها وإدارة كلمات المرور والأدوار." />
        {message ? <div className="notice success">{message}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <section className="panel">
          <h2>إنشاء حساب جديد</h2>
          <p className="subtitle">السائقون يُنشؤون من صفحة السائقين حتى يتم إنشاء الملف والمركبة والصلاحيات معًا.</p>
          <form className="admin-form-grid" onSubmit={createUser}>
            <label><span className="label">الاسم الأول</span><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
            <label><span className="label">الاسم الأخير</span><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
            <label><span className="label">البريد الإلكتروني</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label><span className="label">رقم الهاتف</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label><span className="label">كلمة المرور المؤقتة</span><input className="input" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <fieldset className="checkbox-fieldset"><legend>الأدوار</legend>{roleOptions.map((role) => <label className="checkbox-row" key={role.code}><input type="checkbox" checked={form.roleCodes.includes(role.code)} onChange={(e) => toggleRole(role.code, e.target.checked)} />{role.label}</label>)}</fieldset>
            <button className="button primary full-width" disabled={working === "create"} type="submit">إنشاء الحساب</button>
          </form>
        </section>

        <section className="panel filters">
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد أو الهاتف" />
          <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="">كل الأدوار</option>{roleOptions.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}<option value="DRIVER">سائق</option><option value="SUPER_ADMIN">مدير أعلى</option></select>
          <button className="button" type="button" onClick={() => void load()}>تحديث</button>
        </section>

        <section className="panel">
          <div className="table-wrap"><table className="data-table"><thead><tr><th>المستخدم</th><th>الأدوار</th><th>الحالة</th><th>الحجوزات</th><th>الإنفاق</th><th>تاريخ الإنشاء</th><th>الإجراءات</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><strong>{user.firstName} {user.lastName}</strong><small>{user.phone || user.email}</small></td><td><div className="tag-list compact-tags">{user.roles.map((item) => <span key={item.role.code}>{item.role.name || item.role.code}</span>)}</div></td><td><StatusPill status={user.status} label={user.status === "ACTIVE" ? "فعال" : "معلق"} /></td><td>{user.bookingCount} / {user.completedBookings} مكتملة</td><td>{user.totalSpent.toLocaleString("ar")} {user.currency}</td><td>{new Date(user.createdAt).toLocaleDateString("ar")}</td><td><div className="actions"><button className="button compact-button" disabled={working === user.id} type="button" onClick={() => void editContact(user)}>الهاتف</button><button className="button compact-button" disabled={working === user.id} type="button" onClick={() => void editRoles(user)}>الأدوار</button><button className="button compact-button" disabled={working === user.id} type="button" onClick={() => void resetPassword(user)}>كلمة المرور</button>{user.status === "ACTIVE" ? <button className="button danger compact-button" disabled={working === user.id} type="button" onClick={() => void changeStatus(user, "suspend")}>تعليق</button> : <button className="button primary compact-button" disabled={working === user.id} type="button" onClick={() => void changeStatus(user, "activate")}>تفعيل</button>}</div></td></tr>)}</tbody></table></div>
        </section>
      </Shell>
    </ProtectedRoute>
  );
}
