"use client";

import { ChangeEvent, useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import { MediaAsset, MediaPurpose, MediaVisibility } from "@/lib/admin-operations";
import { MediaBrandingConfig, protectFleetImage } from "@/lib/image-protection";

export function MediaUpload({
  purpose,
  visibility,
  label = "رفع ملف",
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  onUploaded,
  disabled,
  plateNumber,
}: {
  purpose: MediaPurpose;
  visibility?: MediaVisibility;
  label?: string;
  accept?: string;
  onUploaded: (asset: MediaAsset) => void | Promise<void>;
  disabled?: boolean;
  plateNumber?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    setWorking(true);
    setError("");
    setInfo("");
    try {
      let file = selectedFile;
      if (["DRIVER_AVATAR", "VEHICLE_IMAGE"].includes(purpose) && selectedFile.type.startsWith("image/")) {
        setPhase(purpose === "VEHICLE_IMAGE" ? "جارٍ حماية الصورة وقراءة اللوحة..." : "جارٍ إضافة شعار المنصة...");
        const config = await apiFetch<MediaBrandingConfig>("/admin/media-branding");
        const protectedResult = await protectFleetImage(selectedFile, config, {
          plateNumber,
          blurPlate: purpose === "VEHICLE_IMAGE",
        });
        file = protectedResult.file;
        if (protectedResult.warning) setInfo(protectedResult.warning);
        else if (purpose === "VEHICLE_IMAGE" && plateNumber && protectedResult.plateBlurred) {
          setInfo("تم العثور على رقم اللوحة وتغبيشه قبل الرفع.");
        }
      }

      setPhase("جارٍ رفع الملف...");
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
      setPhase("");
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
        {working ? (phase || "جارٍ المعالجة...") : label}
      </button>
      {info ? <small className="field-hint">{info}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}
