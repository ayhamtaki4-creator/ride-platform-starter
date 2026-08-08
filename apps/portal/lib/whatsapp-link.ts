export function whatsappHref(phone: string) {
  const normalized = phone.trim().replace(/^00/, "").replace(/\D/g, "");
  return normalized ? `https://wa.me/${normalized}` : "#";
}

export function convertTelephoneLinksToWhatsApp(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]').forEach((anchor) => {
    const raw = anchor.getAttribute("href")?.slice(4) ?? "";
    const href = whatsappHref(raw);
    if (href === "#") return;
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.dataset.contactChannel = "whatsapp";
    anchor.setAttribute("aria-label", anchor.getAttribute("aria-label")?.replace(/اتصال|الاتصال/g, "واتساب") || "فتح المحادثة على واتساب");

    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      if (current.textContent) {
        current.textContent = current.textContent
          .replace(/الاتصال بالسائق/g, "مراسلة السائق عبر واتساب")
          .replace(/الاتصال بالدعم/g, "مراسلة الدعم عبر واتساب")
          .replace(/اتصال/g, "واتساب")
          .replace(/الاتصال/g, "واتساب");
      }
      current = walker.nextNode();
    }
  });
}
