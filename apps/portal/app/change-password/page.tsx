"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { dashboardHomeForRoles } from "@/lib/role-home";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, isLoading, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace("/login");
    else if (!user.mustChangePassword) router.replace(dashboardHomeForRoles(user.roles));
  }, [isLoading, router, user]);

  async function change(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await refreshUser();
      router.replace(dashboardHomeForRoles(user?.roles ?? ["PASSENGER"]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="auth-page" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        <section className="auth-card-v2" style={{ width: "100%" }}>
          <h1>تعيين كلمة مرور جديدة</h1>
          <p>يجب استبدال كلمة المرور المؤقتة قبل استخدام حسابك.</p>
          <form className="auth-form-v2" onSubmit={change}>
            <label><span className="label">كلمة المرور المؤقتة</span><input type="password" className="input" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
            <label><span className="label">كلمة المرور الجديدة (10 أحرف على الأقل)</span><input type="password" className="input" autoComplete="new-password" required minLength={10} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
            <label><span className="label">تأكيد كلمة المرور الجديدة</span><input type="password" className="input" autoComplete="new-password" required minLength={10} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
            {error ? <div className="notice error" role="alert">{error}</div> : null}
            <button className="button primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}</button>
          </form>
          <p><Link href="/login">العودة إلى تسجيل الدخول</Link></p>
        </section>
      </main>
    </Shell>
  );
}
