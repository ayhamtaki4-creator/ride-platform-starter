"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
  };
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | LoginResponse
        | { message?: string | string[] }
        | null;

      if (!response.ok) {
        const message =
          data &&
          "message" in data &&
          Array.isArray(data.message)
            ? data.message.join("، ")
            : data && "message" in data
              ? data.message
              : "تعذر تسجيل الدخول.";

        throw new Error(message || "تعذر تسجيل الدخول.");
      }

      const loginData = data as LoginResponse;

      localStorage.setItem("ride_access_token", loginData.accessToken);
      localStorage.setItem("ride_user", JSON.stringify(loginData.user));

      const roles = loginData.user.roles;

      if (roles.includes("SUPER_ADMIN") || roles.includes("ADMIN")) {
        router.replace("/admin");
      } else if (roles.includes("DRIVER")) {
        router.replace("/driver");
      } else {
        router.replace("/rider");
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "حدث خطأ غير متوقع."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 520, margin: "60px auto" }} className="panel">
        <div className="eyebrow">AUTHENTICATION</div>
        <h1>تسجيل الدخول</h1>
        <p className="subtitle">
          استخدم أحد الحسابات التجريبية للدخول إلى المنصة.
        </p>

        <form
          className="steps"
          style={{ marginTop: 24 }}
          onSubmit={handleSubmit}
        >
          <label>
            <div className="label">البريد الإلكتروني</div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              style={{
                width: "100%",
                padding: 14,
                border: "1px solid var(--border)",
                borderRadius: 12,
                marginTop: 7,
              }}
            />
          </label>

          <label>
            <div className="label">كلمة المرور</div>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              style={{
                width: "100%",
                padding: 14,
                border: "1px solid var(--border)",
                borderRadius: 12,
                marginTop: 7,
              }}
            />
          </label>

          {error ? (
            <div
              role="alert"
              style={{
                padding: 12,
                borderRadius: 12,
                background: "#fff1f0",
                color: "var(--danger)",
                border: "1px solid #f4c7c3",
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="button primary"
            disabled={isLoading}
            style={{
              cursor: isLoading ? "wait" : "pointer",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? "جارٍ تسجيل الدخول..." : "دخول"}
          </button>
        </form>

        <div className="panel" style={{ marginTop: 18 }}>
          <strong>حسابات تجريبية</strong>
          <p className="subtitle">مدير: admin@example.com</p>
          <p className="subtitle">راكب: rider@example.com</p>
          <p className="subtitle">سائق: driver@example.com</p>
          <p className="subtitle">كلمة المرور: ChangeMe123!</p>
        </div>
      </div>
    </Shell>
  );
}
