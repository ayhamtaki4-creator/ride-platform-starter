"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { normalizePublicMediaUrl } from "@/lib/public-media-url";
import type { Trip } from "@/lib/types";
import { whatsappUrl } from "@/lib/whatsapp";
import { Icon } from "./ui/icon";

type DriverContactResponse = {
  assigned: boolean;
  driver: {
    id: string;
    displayName: string;
    phone: string | null;
  } | null;
};

export function RiderDriverVehicleSummary({ booking }: { booking: Trip }) {
  const profile = booking.driverPublicProfile;
  const vehicle = profile?.vehicle ?? booking.serviceRun?.vehicle ?? null;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [driverPhone, setDriverPhone] = useState<string | null>(profile?.phone ?? null);
  const [contactLoading, setContactLoading] = useState(false);
  const avatarUrl = normalizePublicMediaUrl(profile?.avatarUrl);
  const whatsapp = whatsappUrl(
    driverPhone,
    `مرحباً، بخصوص الحجز ${booking.bookingReference ?? ""}`,
  );
  const initials = profile?.displayName
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("") || "س";

  useEffect(() => {
    setDriverPhone(profile?.phone ?? null);
    if (!profile || profile.phone) return;

    let active = true;
    setContactLoading(true);
    void apiFetch<DriverContactResponse>(`/bookings/${booking.id}/driver-contact`)
      .then((result) => {
        if (active) setDriverPhone(result.driver?.phone ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setContactLoading(false);
      });

    return () => {
      active = false;
    };
  }, [booking.id, profile]);

  return (
    <section className="panel rider-driver-panel rider-detail-panel" aria-label="السائق والمركبة">
      <div className="section-heading rider-section-heading">
        <div>
          <span className="eyebrow">السائق والمركبة</span>
          <h2>{profile?.displayName ?? "بانتظار تعيين السائق"}</h2>
        </div>
      </div>

      {profile ? (
        <>
          <div className="rider-driver-profile">
            <span className="rider-driver-avatar" style={{ overflow: "hidden" }}>
              {avatarUrl && !avatarFailed ? (
                <img
                  src={avatarUrl}
                  alt={`صورة السائق ${profile.displayName}`}
                  onError={() => setAvatarFailed(true)}
                  loading="eager"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : initials}
            </span>
            <div>
              <strong>{profile.displayName}</strong>
              <small>
                سائق معتمد
                {profile.rating != null ? ` · تقييم ${Number(profile.rating).toFixed(1)}` : ""}
              </small>
            </div>
          </div>

          {vehicle ? (
            <div className="rider-vehicle-card">
              <Icon name="car" size={25} />
              <div>
                <strong>{vehicle.make} {vehicle.model}</strong>
                <span>{vehicle.color} · {vehicle.maskedPlateNumber || vehicle.plateNumber}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state">تم تعيين السائق، ولم تُربط مركبة بالحجز بعد.</div>
          )}

          {whatsapp ? (
            <a className="button primary" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <Icon name="phone" size={18} /> مراسلة السائق عبر واتساب
            </a>
          ) : contactLoading ? (
            <div className="notice">جارٍ تجهيز وسيلة التواصل مع السائق...</div>
          ) : (
            <div className="notice">تم تعيين السائق، لكن لا يوجد رقم WhatsApp صالح مسجل له حاليًا.</div>
          )}
        </>
      ) : (
        <div className="rider-assignment-empty">
          <span><Icon name="drivers" size={30} /></span>
          <h3>لم يُعيّن السائق بعد</h3>
          <p>سيظهر اسم السائق وصور المركبة ووسيلة التواصل فور إتمام التعيين.</p>
        </div>
      )}
    </section>
  );
}
