"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Shell } from "@/components/shell";
import { apiFetch } from "@/lib/api";

type VerificationResult = {
  verified: boolean;
  activated: boolean;
  linkedBookings: number;
  temporaryPassword?: string;
};

export default function ActivateAccountPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/auth/phone/request-code", {
        skipAuth: true,
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setCodeRequested(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال الرمز.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await apiFetch<VerificationResult>("/auth/phone/verify-code", {
        skipAuth: true,
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      setResult(response);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "رمز التحقق غير صحيح.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <main className="auth-page" style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>
        <section className="auth-card-v2" style={{ width: "100%" }}>
          <h1>التحقق من رقم الهاتف</h1>
          <p>لتفعيل الحساب الجديد أو ربط حجوزات الضيف بحساب موجود، سنرسل رمزًا صالحًا لعشر دقائق عبر WhatsApp إلى الرقم الذي استخدمته للحجز.</p>
          {result ? (
            <div className="notice success" role="status">
              <p>تم التحقق من الرقم بنجاح.</p>
              {result.linkedBookings > 0 ? <p>تم ربط {result.linkedBookings} من حجوزات الضيف بحسابك.</p> : null}
              {result.activated && result.temporaryPassword ? (
                <>
                  <p>تم تفعيل حسابك. استخدم رقم هاتفك وكلمة المرور المؤقتة التالية لتسجيل الدخول:</p>
                  <p><strong dir="ltr" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{result.temporaryPassword}</strong></p>
                  <p>هذه الكلمة تظهر مرة واحدة فقط. سيتم إلزامك بتغييرها فور تسجيل الدخول. لا تشاركها مع أحد.</p>
                  <button className="button" type="button" onClick={() => void navigator.clipboard?.writeText(result.temporaryPassword!)}>نسخ كلمة المرور</button>
                </>
              ) : (
                <p>إذا كان لديك حساب مسبقًا، يمكنك تسجيل الدخول بكلمة المرور الحالية دون تغييرها.</p>
              )}
              <p><Link className="button primary" href="/login">تسجيل الدخول</Link></p>
            </div>
          ) : (
            <>
              <form onSubmit={requestCode} className="auth-form-v2">
                <label><span className="label">رقم الهاتف المستخدم في الحجز</span>
                  <input className="input ltr-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+9639..." autoComplete="tel" disabled={busy || codeRequested} required />
                </label>
                {!codeRequested ? <button className="button primary" type="submit" disabled={busy}>{busy ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}</button> : null}
              </form>
              {codeRequested ? (
                <form onSubmit={confirmCode} className="auth-form-v2">
                  <label><span className="label">رمز التحقق (6 أرقام)</span>
                    <input className="input ltr-input" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
                  </label>
                  <button className="button primary" type="submit" disabled={busy || code.length !== 6}>{busy ? "جارٍ التحقق..." : "تأكيد الرقم"}</button>
                  <button className="button" type="button" onClick={() => { setCodeRequested(false); setCode(""); setError(""); }} disabled={busy}>إعادة إدخال رقم الهاتف</button>
                </form>
              ) : null}
              {error ? <div className="notice error" role="alert">{error}</div> : null}
            </>
          )}
          <p><Link href="/">العودة إلى الرئيسية</Link></p>
        </section>
      </main>
    </Shell>
  );
}
