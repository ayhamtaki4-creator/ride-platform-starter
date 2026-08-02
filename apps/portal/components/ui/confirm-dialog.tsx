"use client";

import { Icon } from "./icon";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "تأكيد",
  cancelLabel = "تراجع",
  tone = "primary",
  working = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  working?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="dialog-close" type="button" aria-label="إغلاق" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        <div className={`dialog-symbol dialog-symbol-${tone}`}>
          <Icon name={tone === "danger" ? "bell" : "shield"} size={26} />
        </div>
        <h2 id="dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={onClose} disabled={working}>{cancelLabel}</button>
          <button className={`button ${tone}`} type="button" onClick={onConfirm} disabled={working}>{working ? "جارٍ التنفيذ..." : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
