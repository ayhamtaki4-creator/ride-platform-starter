"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { NotificationCenter } from "./notification-center";
import { Icon, IconName } from "./ui/icon";
import { homeForRoles } from "@/lib/types";

type NavItem = { href: string; label: string; icon: IconName };

const adminItems: NavItem[] = [
  { href: "/admin", label: "نظرة عامة", icon: "dashboard" },
  { href: "/admin/bookings", label: "الحجوزات", icon: "bookings" },
  { href: "/admin/runs", label: "الرحلات التشغيلية", icon: "route" },
  { href: "/admin/completed-bookings", label: "الحجوزات المنتهية", icon: "check" },
  { href: "/admin/routes", label: "المواقع والمسارات", icon: "map-pin" },
  { href: "/admin/route-templates", label: "قوالب المسارات", icon: "route" },
  { href: "/admin/drivers", label: "السائقون والمركبات", icon: "drivers" },
  { href: "/admin/compliance", label: "الامتثال والملفات", icon: "shield" },
  { href: "/admin/users", label: "الحسابات", icon: "users" },
  { href: "/admin/pricing", label: "الأسعار", icon: "pricing" },
  { href: "/admin/whatsapp", label: "رسائل WhatsApp", icon: "bell" },
];

function isActivePath(pathname: string, href: string) {
  if (["/admin", "/rider", "/driver"].includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isRealtimeConnected } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isPublic = pathname === "/" || pathname === "/login" || pathname.startsWith("/register");
  const isAdmin = Boolean(user?.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "OPERATIONS_MANAGER"].includes(role)));
  const isDriver = Boolean(user?.roles.includes("DRIVER"));
  const isPassenger = Boolean(user?.roles.includes("PASSENGER"));

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (isPassenger) {
      items.push(
        { href: "/rider", label: "الرئيسية", icon: "dashboard" },
        { href: "/rider/bookings", label: "حجوزاتي", icon: "bookings" },
        { href: "/rider/completed-bookings", label: "الحجوزات المنتهية", icon: "check" },
        { href: "/rider/profile", label: "حسابي", icon: "user" },
      );
    }
    if (isDriver) {
      items.push(
        { href: "/driver", label: "لوحة السائق", icon: "dashboard" },
        { href: "/driver/bookings", label: "الحجوزات والمهام", icon: "briefcase" },
        { href: "/driver/runs", label: "الرحلات التشغيلية", icon: "route" },
        { href: "/driver/completed-bookings", label: "الحجوزات المنتهية", icon: "check" },
        { href: "/driver/profile", label: "الحساب والمركبة", icon: "user" },
      );
    }
    if (isAdmin) items.push(...adminItems);
    return items;
  }, [isAdmin, isDriver, isPassenger]);

  useEffect(() => setDrawerOpen(false), [pathname]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (isPublic) {
    return (
      <div className="public-shell">
        <header className="public-header">
          <div className="public-header-inner">
            <Link className="public-brand" href="/" aria-label="طريق الشام - الرئيسية">
              <span className="brand-mark"><Icon name="route" size={23} /></span>
              <span><strong>طريق الشام</strong><small>دمشق · بيروت · عمّان</small></span>
            </Link>
            <nav className="public-nav" aria-label="التنقل الرئيسي">
              <Link href="/#booking">احجز رحلتك</Link>
              <Link href="/#how-it-works">كيف تعمل المنصة</Link>
              <Link href="/#services">خدماتنا</Link>
              <Link href="/#faq">الأسئلة الشائعة</Link>
            </nav>
            <div className="public-header-actions">
              {user ? (
                <Link className="button primary compact-button" href={homeForRoles(user.roles)}>لوحة التحكم</Link>
              ) : (
                <Link className="button primary compact-button" href="/login"><Icon name="login" size={18} /> تسجيل الدخول</Link>
              )}
            </div>
          </div>
        </header>
        <main className="public-main">{children}</main>
        <footer className="public-footer">
          <div className="public-footer-grid">
            <div>
              <Link className="public-brand footer-brand" href="/">
                <span className="brand-mark"><Icon name="route" size={23} /></span>
                <span><strong>طريق الشام</strong><small>نقل آمن ومنظّم</small></span>
              </Link>
              <p>منصة موثوقة للحجز والمتابعة على خطوط سوريا ولبنان والأردن، بإشراف مركز عمليات وسائقين ومركبات معتمدين.</p>
            </div>
            <div><strong>روابط سريعة</strong><Link href="/#booking">الحجز</Link><Link href="/#how-it-works">طريقة العمل</Link><Link href="/login">تسجيل الدخول</Link></div>
            <div><strong>الدعم</strong><span>خدمة ومتابعة على مدار الساعة</span><a href="tel:+96100000000">+961 / +963</a><a href="mailto:info@tareeqalsham.example">info@tareeqalsham.example</a></div>
          </div>
          <div className="public-footer-bottom"><span>© 2026 طريق الشام — جميع الحقوق محفوظة</span><span>دمشق · بيروت · عمّان</span></div>
        </footer>
      </div>
    );
  }

  return (
    <div className="shell app-shell">
      <button className="mobile-menu-button" type="button" aria-label="فتح القائمة" onClick={() => setDrawerOpen(true)}>
        <Icon name="menu" size={23} />
      </button>
      {drawerOpen ? <button className="sidebar-backdrop" type="button" aria-label="إغلاق القائمة" onClick={() => setDrawerOpen(false)} /> : null}
      <aside className={`sidebar app-sidebar ${drawerOpen ? "is-open" : ""}`}>
        <div className="sidebar-heading">
          <Link className="sidebar-brand" href="/">
            <span className="brand-mark"><Icon name="route" size={22} /></span>
            <span><strong>طريق الشام</strong><small>مركز العمليات</small></span>
          </Link>
          <button className="sidebar-close" type="button" aria-label="إغلاق القائمة" onClick={() => setDrawerOpen(false)}><Icon name="close" size={21} /></button>
        </div>

        {user ? (
          <div className="sidebar-user-v2">
            <span className="user-avatar">{user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}</span>
            <div><strong>{user.firstName} {user.lastName}</strong><small>{user.email}</small></div>
          </div>
        ) : null}

        <div className="sidebar-section-label">القائمة الرئيسية</div>
        <nav className="nav app-nav" aria-label="قائمة لوحة التحكم">
          <Link className={pathname === "/" ? "is-active" : ""} href="/"><Icon name="home" size={19} /><span>الموقع العام</span></Link>
          {navItems.map((item) => (
            <Link className={isActivePath(pathname, item.href) ? "is-active" : ""} href={item.href} key={item.href}>
              <Icon name={item.icon} size={19} /><span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer-v2">
          <div className={`sidebar-connection ${isRealtimeConnected ? "is-online" : "is-offline"}`}>
            <span />
            <div><strong>{isRealtimeConnected ? "متصل مباشرة" : "إعادة الاتصال"}</strong><small>تحديثات العمليات الفورية</small></div>
          </div>
          {user ? <button className="sidebar-logout-v2" type="button" onClick={handleLogout}><Icon name="logout" size={19} /> تسجيل الخروج</button> : null}
        </div>
      </aside>
      <main className="main app-main">
        <div className="app-top-strip">
          <div><span className={`live-dot ${isRealtimeConnected ? "online" : "offline"}`} />{isRealtimeConnected ? "النظام متصل" : "جارٍ استعادة الاتصال"}</div>
          <div className="app-top-actions"><NotificationCenter /><span className="top-user-name">{user?.firstName} {user?.lastName}</span></div>
        </div>
        {children}
      </main>
    </div>
  );
}
