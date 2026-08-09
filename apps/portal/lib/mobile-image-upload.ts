const TARGET_MAX_EDGE = 2400;
const OPTIMIZE_FROM_BYTES = 2 * 1024 * 1024;

export type MobileImageOptimization = {
  file: File;
  optimized: boolean;
  originalBytes: number;
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("تعذر قراءة صورة التذكرة."));
  });

  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function optimizedName(originalName: string, type: string) {
  const base = originalName.replace(/\.[^.]+$/, "") || "flight-ticket";
  const extension = type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg";
  return `${base}.${extension}`;
}

export async function optimizeMobileImageUpload(file: File): Promise<MobileImageOptimization> {
  const supportedImage = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!supportedImage || file.size < OPTIMIZE_FROM_BYTES || typeof document === "undefined") {
    return { file, optimized: false, originalBytes: file.size };
  }

  let decoded: DecodedImage | null = null;
  try {
    decoded = await decodeImage(file);
    if (!decoded.width || !decoded.height) {
      return { file, optimized: false, originalBytes: file.size };
    }

    const scale = Math.min(1, TARGET_MAX_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return { file, optimized: false, originalBytes: file.size };

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    const outputType = file.type === "image/png" ? "image/webp" : file.type;
    const blob = await canvasToBlob(canvas, outputType, 0.86);
    if (!blob || blob.size >= file.size * 0.92) {
      return { file, optimized: false, originalBytes: file.size };
    }

    return {
      file: new File([blob], optimizedName(file.name, blob.type || outputType), {
        type: blob.type || outputType,
        lastModified: file.lastModified,
      }),
      optimized: true,
      originalBytes: file.size,
    };
  } catch {
    return { file, optimized: false, originalBytes: file.size };
  } finally {
    decoded?.cleanup();
  }
}

export function formatUploadSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
