"use client";

import { ChangeEvent, useRef, useState } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import { MediaAsset, MediaPurpose, MediaVisibility } from "@/lib/admin-operations";
import {
  createFleetImageVariant,
  MediaBrandingConfig,
  protectFleetImage,
} from "@/lib/image-protection";

type VariantKind = "ORIGINAL" | "DISPLAY" | "THUMBNAIL";

export function MediaUpload({
  purpose,
  visibility,
  label = "رفع ملف",
  accept = ".jpg,.jpeg,.png,.webp,.pdf",
  onUploaded,
  onUploadedMany,
  disabled,
  plateNumber,
  blurPlate = false,
  multiple = false,
}: {
  purpose: MediaPurpose;
  visibility?: MediaVisibility;
  label?: string;
  accept?: string;
  onUploaded?: (asset: MediaAsset) => void | Promise<void>;
  onUploadedMany?: (assets: MediaAsset[]) => void | Promise<void>;
  disabled?: boolean;
  plateNumber?: string;
  blurPlate?: boolean;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function uploadFile(file: File, variantKind: VariantKind, variantOfId?: string) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("purpose", purpose);
    formData.set("variantKind", variantKind);
    if (variantOfId) formData.set("variantOfId", variantOfId);
    if (visibility) formData.set("visibility", visibility);
    return apiUpload<MediaAsset>("/admin/media/upload", formData);
  }

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    setWorking(true);
    setError("");
    setInfo("");

    try {
      const uploaded: MediaAsset[] = [];
      const messages: string[] = [];
      let config: MediaBrandingConfig | null = null;
      const protectsImage = ["DRIVER_AVATAR", "VEHICLE_IMAGE"].includes(purpose);

      if (protectsImage) {
        config = await apiFetch<MediaBrandingConfig>("/admin/media-branding");
      }

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const selectedFile = selectedFiles[index];
        let file = selectedFile;
        const progress = selectedFiles.length > 1 ? ` (${index + 1}/${selectedFiles.length})` : "";

        if (protectsImage && selectedFile.type.startsWith("image/") && config) {
          setPhase(
            purpose === "VEHICLE_IMAGE" && blurPlate
              ? `جارٍ إضافة الشعار ومحاولة تغبيش اللوحة${progress}...`
              : `جارٍ إضافة شعار المنصة${progress}...`,
          );
          const protectedResult = await protectFleetImage(selectedFile, config, {
            plateNumber,
            blurPlate: purpose === "VEHICLE_IMAGE" && blurPlate,
          });
          file = protectedResult.file;
          if (protectedResult.warning) messages.push(`${selectedFile.name}: ${protectedResult.warning}`);
          else if (purpose === "VEHICLE_IMAGE" && blurPlate && plateNumber && protectedResult.plateBlurred) {
            messages.push(`${selectedFile.name}: تم العثور على رقم اللوحة وتغبيشه.`);
          }
        }

        setPhase(`جارٍ رفع الملف الأصلي${progress}...`);
        const original = await uploadFile(file, "ORIGINAL");

        if (purpose === "VEHICLE_IMAGE" && file.type.startsWith("image/")) {
          try {
            setPhase(`جارٍ تجهيز نسخة العرض${progress}...`);
            const display = await createFleetImageVariant(file, {
              maxDimension: 1600,
              quality: 0.86,
              suffix: "display",
            });
            setPhase(`جارٍ رفع نسخة العرض${progress}...`);
            await uploadFile(display, "DISPLAY", original.id);

            setPhase(`جارٍ تجهيز الصورة المصغرة${progress}...`);
            const thumbnail = await createFleetImageVariant(file, {
              maxDimension: 480,
              quality: 0.78,
              suffix: "thumbnail",
            });
            setPhase(`جارٍ رفع الصورة المصغرة${progress}...`);
            await uploadFile(thumbnail, "THUMBNAIL", original.id);
            messages.push(`${selectedFile.name}: تم حفظ الأصل مع نسخة عرض ونسخة مصغرة للموبايل.`);
          } catch (variantError) {
            await apiFetch(`/admin/media/${original.id}`, { method: "DELETE" }).catch(() => undefined);
            throw variantError;
          }
        }

        uploaded.push(original);
      }

      if (onUploadedMany) await onUploadedMany(uploaded);
      else if (onUploaded) {
        for (const asset of uploaded) await onUploaded(asset);
      }

      if (messages.length) setInfo(messages.join(" "));
      else if (uploaded.length > 1) setInfo(`تم رفع ${uploaded.length} صور بنجاح.`);

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
        multiple={multiple}
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
