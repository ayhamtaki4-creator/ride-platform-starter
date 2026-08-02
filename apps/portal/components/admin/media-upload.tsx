"use client";

import { ChangeEvent, useRef, useState } from "react";
import { apiUpload } from "@/lib/api";
import { MediaAsset, MediaPurpose, MediaVisibility } from "@/lib/admin-operations";

export function MediaUpload({
  purpose,
  visibility,
  label = "رفع ملف",
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  onUploaded,
  disabled,
}: {
  purpose: MediaPurpose;
  visibility?: MediaVisibility;
  label?: string;
  accept?: string;
  onUploaded: (asset: MediaAsset) => void | Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("purpose", purpose);
      if (visibility) formData.set("visibility", visibility);
      const asset = await apiUpload<MediaAsset>("/admin/media/upload", formData);
      await onUploaded(asset);
      if (inputRef.current) inputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر رفع الملف.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="media-upload-control">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled || working}
      />
      <button
        className="button"
        type="button"
        disabled={disabled || working}
        onClick={() => inputRef.current?.click()}
      >
        {working ? "جارٍ الرفع..." : label}
      </button>
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}
