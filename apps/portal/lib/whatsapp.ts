export function whatsappUrl(phone?: string | null, message?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
