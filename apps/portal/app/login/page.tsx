"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { homeForRoles } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, login } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(homeForRoles(user.roles));
    }
  }, [authLoading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loggedInUser = await login(email, password);
      router.replace(homeForRoles(loggedInUser.roles));
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "حدث خطأ غير متوقع."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell>
      <div className="panel login-panel">
        <div className="eyebrow">AUTHENTICATION</div>
        <h1>تسجيل الدخول</h1>
        <p className="subtitle">
          استخدم أحد الحسابات التجريبية للدخول إلى المنصة.
        </p>

        <form className="steps" onSubmit={handleSubmit}>
          <label>
            <div className="label">البريد الإلكتروني</div>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            <div className="label">كلمة المرور</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="button primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "جارٍ تسجيل الدخول..." : "دخول"}
          </button>
        </form>

        <div className="demo-accounts">
          <strong>حسابات تجريبية</strong>
          <p>مدير: admin@example.com</p>
          <p>راكب: rider@example.com</p>
          <p>سائق: driver@example.com</p>
          <p>كلمة المرور: ChangeMe123!</p>
        </div>
      </div>
    </Shell>
  );
}
