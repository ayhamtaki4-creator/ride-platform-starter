"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/ui/icon";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { useToast } from "@/components/ui/toast-provider";
import { authPathWithReturn, currentAuthReturnPath } from "@/lib/auth-return-path";
import { hasPendingBooking } from "@/lib/pending-booking";
import { homeForRoles } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    whatsappOptIn: true,
  });
  const [pendingBooking, setPendingBooking] = useState(false);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  function destinationFor(roles: string[]) {
    const requestedPath = roles.includes("PASSENGER") ? currentAuthReturnPath() : null;
    if (requestedPath) return requestedPath;
    return roles.includes("PASSENGER") && hasPendingBooking()
      ? "/booking?resumeBooking=1"
      : homeForRoles(roles);
  }

  useEffect(() => {
    setPendingBooking(hasPendingBooking());
    setReturnPath(currentAuthReturnPath());
  }, []);

  useEffect(() => {
    if (!authLoading && user) router.replace(destinationFor(user.roles));
  }, [authLoading, router, user]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const registeredUser = await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        whatsappOptIn: form.whatsappOptIn,
      });
      showToast("تم إنشاء حساب المسافر بنجاح.", "success");
      router.replace(destinationFor(registeredUser.roles));
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تعذر إنشاء الحساب.";
      setError(message);
      showToast(message, "error");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Shell>
      <section className="auth-page register-page">
        <div className="auth-visual-panel">
          <Link className="back-home-link" href="/"><Icon name="arrow-right" size={18} />العودة إلى الموقع</Link>
          <div className="auth-visual-content">
            <span className="auth-visual-icon"><Icon name="user" size={34} /></span>
            <div className="eyebrow-v2 light-eyebrow">حساب المسافر</div>
            <h1>احجز مرة وتابع كل تفاصيل الرحلة من حسابك</h1>
            <p>احتفظ بالحجوزات، استلم تحديثات السائق والإدارة، وافتح تفاصيل كل رحلة من مكان واحد.</p>
            <div className="auth-benefits">
              <span><Icon name="bookings" size={20} /><div><strong>حجوزات محفوظة</strong><small>لن تضيع مسودة الحجز عند تسجيل الدخول</small></div></span>
              <span><Icon name="bell" size={20} /><div><strong>تحديثات WhatsApp</strong><small>رسائل تشغيلية مرتبطة بحجزك</small></div></span>
              <span><Icon name="shield" size={20} /><div><strong>ملفات خاصة</strong><small>تذكرة الطيران لا تظهر إلا لك وللإدارة</small></div></span>
            </div>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-card-v2 register-card-v2">
            <div className="auth-card-heading">
              <div className="eyebrow-v2">ابدأ الآن</div>
              <h2>إنشاء حساب مسافر</h2>
              <p>أدخل بيانات صحيحة لأنها ستستخدم للتواصل ومتابعة الحجز.</p>
            </div>

            {returnPath === "/booking" ? (
              <div className="notice success">أنشئ حسابك أولًا، وبعدها سننقلك مباشرة إلى صفحة الحجز.</div>
            ) : pendingBooking ? (
              <div className="notice success">مسودة حجزك محفوظة وستُرسل تلقائيًا بعد إنشاء الحساب.</div>
            ) : null}

            <form className="auth-form-v2" onSubmit={submit}>
              <div className="auth-name-grid">
                <label><span className="label">الاسم الأول</span><input className="input" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} autoComplete="given-name" required /></label>
                <label><span className="label">الاسم الأخير</span><input className="input" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} autoComplete="family-name" required /></label>
              </div>
              <label><span className="label">البريد الإلكتروني</span><div className="input-with-icon auth-input"><Icon name="user" size={19} /><input className="input ltr-input" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" placeholder="name@example.com" required /></div></label>
              <label><span className="label">رقم WhatsApp مع رمز الدولة</span><InternationalPhoneInput value={form.phone} onChange={(value) => update("phone", value)} name="phone" required /></label>
              <label><span className="label">كلمة المرور</span><div className="input-with-icon auth-input"><Icon name="lock" size={19} /><input className="input ltr-input" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" required /><button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)}><Icon name={showPassword ? "eye-off" : "eye"} size={19} /></button></div></label>
              <label><span className="label">تأكيد كلمة المرور</span><div className="input-with-icon auth-input"><Icon name="lock" size={19} /><input className="input ltr-input" type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} autoComplete="new-password" required /></div></label>
              <label className="whatsapp-consent-row"><input type="checkbox" checked={form.whatsappOptIn} onChange={(event) => update("whatsappOptIn", event.target.checked)} /><span><strong>أوافق على استلام تحديثات الحجز على WhatsApp</strong><small>مثل التأكيد وتعيين السائق وبدء الرحلة. يمكنك إيقافها لاحقًا من الحساب.</small></span></label>

              {error ? <div className="notice error" role="alert">{error}</div> : null}
              <button className="button primary button-lg auth-submit" disabled={working} type="submit">{working ? <><span className="button-spinner" />جارٍ إنشاء الحساب...</> : <>إنشاء الحساب <Icon name="login" size={19} /></>}</button>
            </form>

            <div className="auth-register-cta"><span>لديك حساب بالفعل؟</span><Link href={authPathWithReturn("/login", returnPath)}>تسجيل الدخول</Link></div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
