"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast-provider";
import { homeForRoles } from "@/lib/types";

const demoAccounts = [
  { label: "الإدارة", email: "admin@example.com", icon: "dashboard" as const },
  { label: "المسافر", email: "rider@example.com", icon: "user" as const },
  { label: "السائق", email: "driver@example.com", icon: "drivers" as const },
];

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, isLoading: authLoading, login } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace(homeForRoles(user.roles));
  }, [authLoading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      showToast(`مرحبًا ${loggedInUser.firstName}، تم تسجيل الدخول بنجاح.`, "success");
      router.replace(homeForRoles(loggedInUser.roles));
      router.refresh();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "حدث خطأ غير متوقع.";
      setError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell>
      <section className="auth-page">
        <div className="auth-visual-panel">
          <Link className="back-home-link" href="/"><Icon name="arrow-right" size={18} />العودة إلى الموقع</Link>
          <div className="auth-visual-content">
            <span className="auth-visual-icon"><Icon name="route" size={34} /></span>
            <div className="eyebrow-v2 light-eyebrow">منصة طريق الشام</div>
            <h1>كل رحلة تحت المتابعة من الحجز حتى الوصول</h1>
            <p>ادخل إلى حسابك لمتابعة الحجوزات أو إدارة الرحلات أو تنفيذ مهام السائق.</p>
            <div className="auth-benefits">
              <span><Icon name="shield" size={20} /><div><strong>دخول محمي</strong><small>صلاحيات منفصلة لكل مستخدم</small></div></span>
              <span><Icon name="wifi" size={20} /><div><strong>تحديثات فورية</strong><small>متابعة مباشرة للحجوزات والرحلات</small></div></span>
              <span><Icon name="clock" size={20} /><div><strong>سجل واضح</strong><small>كل حالة وإجراء محفوظان في النظام</small></div></span>
            </div>
          </div>
          <div className="auth-route-decoration"><span>BEY</span><i><Icon name="car" size={21} /></i><span>DAM</span></div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-card-v2">
            <div className="auth-card-heading">
              <div className="eyebrow-v2">مرحبًا بعودتك</div>
              <h2>تسجيل الدخول</h2>
              <p>أدخل بريدك الإلكتروني وكلمة المرور للوصول إلى لوحة حسابك.</p>
            </div>

            <form className="auth-form-v2" onSubmit={handleSubmit}>
              <label>
                <span className="label">البريد الإلكتروني</span>
                <div className="input-with-icon auth-input"><Icon name="user" size={19} /><input className="input ltr-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></div>
              </label>
              <label>
                <div className="password-label-row"><span className="label">كلمة المرور</span><button type="button" className="forgot-link" disabled>نسيت كلمة المرور؟</button></div>
                <div className="input-with-icon auth-input"><Icon name="lock" size={19} /><input className="input ltr-input" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button className="password-toggle" type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShowPassword((current) => !current)}><Icon name={showPassword ? "eye-off" : "eye"} size={19} /></button></div>
              </label>

              {error ? <div className="notice error" role="alert">{error}</div> : null}

              <button type="submit" className="button primary button-lg auth-submit" disabled={isSubmitting}>
                {isSubmitting ? <><span className="button-spinner" />جارٍ تسجيل الدخول...</> : <>تسجيل الدخول <Icon name="login" size={19} /></>}
              </button>
            </form>

            <div className="demo-login-v2">
              <div><span>حسابات التجربة</span><small>كلمة المرور لجميع الحسابات: ChangeMe123!</small></div>
              <div className="demo-account-buttons">
                {demoAccounts.map((account) => <button className={email === account.email ? "is-selected" : ""} type="button" key={account.email} onClick={() => { setEmail(account.email); setPassword("ChangeMe123!"); setError(""); }}><Icon name={account.icon} size={18} /><span>{account.label}</span></button>)}
              </div>
            </div>

            <p className="auth-help">تواجه مشكلة في الدخول؟ تواصل مع مركز العمليات.</p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
