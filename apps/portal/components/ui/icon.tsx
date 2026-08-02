import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "calendar"
  | "bookings"
  | "users"
  | "drivers"
  | "pricing"
  | "route"
  | "dashboard"
  | "logout"
  | "login"
  | "menu"
  | "close"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "shield"
  | "clock"
  | "car"
  | "plane"
  | "phone"
  | "user"
  | "lock"
  | "eye"
  | "eye-off"
  | "chevron-down"
  | "bell"
  | "wifi"
  | "briefcase"
  | "sparkles"
  | "map-pin"
  | "luggage"
  | "play";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  bookings: <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  drivers: <><path d="M5 17h14l-1.5-7h-11z" /><path d="M7 10 9 5h6l2 5" /><circle cx="8" cy="18" r="2" /><circle cx="16" cy="18" r="2" /></>,
  pricing: <><path d="M20.6 13.4 11 3.8A2 2 0 0 0 9.6 3H4a1 1 0 0 0-1 1v5.6A2 2 0 0 0 3.8 11l9.6 9.6a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  route: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M8.5 16.5 16 8.5M9 6h.01M15 18h.01" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>,
  login: <><path d="M14 8l4 4-4 4M18 12H6" /><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  "arrow-left": <><path d="m15 18-6-6 6-6" /></>,
  "arrow-right": <><path d="m9 18 6-6-6-6" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  car: <><path d="M5 17h14l-1.5-6h-11z" /><path d="m7 11 2-5h6l2 5" /><path d="M5 17v2M19 17v2" /></>,
  plane: <><path d="M22 2 9.5 14.5M22 2l-7 19-4-8-8-4Z" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.9Z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <><path d="m3 3 18 18" /><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  "chevron-down": <><path d="m6 9 6 6 6-6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></>,
  sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2ZM19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7Z" /></>,
  "map-pin": <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  luggage: <><rect x="6" y="6" width="12" height="15" rx="2" /><path d="M9 6V4h6v2M9 10v7M15 10v7" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></>,
};

export function Icon({ name, size = 20, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
