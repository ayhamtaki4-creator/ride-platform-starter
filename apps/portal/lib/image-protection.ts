export type MediaBrandingConfig = {
  logoMediaAssetId: string | null;
  logoPublicUrl: string | null;
  watermarkEnabled: boolean;
  plateBlurEnabled: boolean;
  watermarkOpacity: number;
  watermarkWidthPercent: number;
};

type BoundingBox = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text?: string; bbox?: BoundingBox };
type OcrLine = { text?: string; bbox?: BoundingBox; words?: OcrWord[] };
type OcrParagraph = { lines?: OcrLine[] };
type OcrBlock = { paragraphs?: OcrParagraph[] };

type TesseractWorker = {
  recognize: (
    image: File | Blob,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ) => Promise<{ data?: { blocks?: OcrBlock[] | null } }>;
  terminate: () => Promise<void>;
};

type TesseractApi = {
  createWorker: (
    languages: string | string[],
    oem?: number,
    options?: Record<string, unknown>,
  ) => Promise<TesseractWorker>;
};

declare global {
  interface Window {
    Tesseract?: TesseractApi;
  }
}

const TESSERACT_SCRIPT_ID = "ride-platform-tesseract";
const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js";

function normalizePlate(value: string) {
  const arabicDigits: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  return value
    .normalize("NFKC")
    .split("")
    .map((char) => arabicDigits[char] ?? char)
    .join("")
    .toUpperCase()
    .replace(/[^0-9A-Z\u0600-\u06FF]/g, "");
}

function looksLikePlateCandidate(value: string) {
  const normalized = normalizePlate(value);
  if (normalized.length < 4 || normalized.length > 14) return false;
  const digits = (normalized.match(/[0-9]/g) ?? []).length;
  return digits >= 3;
}

async function loadTesseract(): Promise<TesseractApi> {
  if (window.Tesseract) return window.Tesseract;

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(TESSERACT_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل محرك قراءة اللوحات.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = TESSERACT_SCRIPT_ID;
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل محرك قراءة اللوحات."));
    document.head.appendChild(script);
  });

  if (!window.Tesseract) throw new Error("محرك قراءة اللوحات غير متاح.");
  return window.Tesseract;
}

function collectPlateBoxes(
  blocks: OcrBlock[] | null | undefined,
  plateNumber?: string,
) {
  const target = normalizePlate(plateNumber ?? "");
  const matches: BoundingBox[] = [];

  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const rawLineText = line.text ?? (line.words ?? []).map((word) => word.text ?? "").join("");
        const lineText = normalizePlate(rawLineText);
        const exactLineMatch = Boolean(
          target && lineText &&
          (lineText.includes(target) || (target.includes(lineText) && lineText.length >= Math.max(3, target.length - 2)))
        );
        const genericLineMatch = !target && line.bbox && looksLikePlateCandidate(rawLineText);
        if (line.bbox && (exactLineMatch || genericLineMatch)) {
          matches.push(line.bbox);
          continue;
        }

        for (const word of line.words ?? []) {
          if (!word.bbox) continue;
          const rawWord = word.text ?? "";
          const wordText = normalizePlate(rawWord);
          const exactWordMatch = Boolean(
            target && wordText.length >= 2 &&
            (wordText === target || (target.includes(wordText) && wordText.length >= Math.max(3, target.length - 2)))
          );
          const genericWordMatch = !target && looksLikePlateCandidate(rawWord);
          if (exactWordMatch || genericWordMatch) matches.push(word.bbox);
        }
      }
    }
  }

  return matches;
}

async function detectPlateBoxes(file: File, plateNumber?: string): Promise<BoundingBox[]> {
  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker(["eng", "ara"]);
  try {
    const result = await worker.recognize(file, {}, { text: true, blocks: true });
    return collectPlateBoxes(result.data?.blocks, plateNumber);
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

async function imageBitmapFromBlob(blob: Blob) {
  if ("createImageBitmap" in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("تعذر قراءة الصورة."));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blurBox(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  box: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
) {
  const width = Math.max(1, box.x1 - box.x0);
  const height = Math.max(1, box.y1 - box.y0);
  const padding = Math.max(6, Math.round(Math.max(width, height) * 0.12));
  const sx = Math.max(0, Math.floor(box.x0 - padding));
  const sy = Math.max(0, Math.floor(box.y0 - padding));
  const sw = Math.min(canvasWidth - sx, Math.ceil(width + padding * 2));
  const sh = Math.min(canvasHeight - sy, Math.ceil(height + padding * 2));

  const temp = document.createElement("canvas");
  temp.width = sw;
  temp.height = sh;
  const tempContext = temp.getContext("2d");
  if (!tempContext) return;
  tempContext.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  context.save();
  context.filter = `blur(${Math.max(12, Math.round(Math.min(sw, sh) * 0.22))}px)`;
  context.drawImage(temp, sx, sy, sw, sh);
  context.restore();
}

async function drawWatermark(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  logoUrl: string,
  opacity: number,
  widthPercent: number,
) {
  const response = await fetch(logoUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("تعذر تحميل شعار المنصة لمعالجة الصورة.");
  const logoBlob = await response.blob();
  const logo = await imageBitmapFromBlob(logoBlob);
  const sourceWidth = "width" in logo ? Number(logo.width) : 1;
  const sourceHeight = "height" in logo ? Number(logo.height) : 1;
  const targetWidth = Math.max(80, Math.round(canvas.width * (widthPercent / 100)));
  const targetHeight = Math.max(1, Math.round(targetWidth * (sourceHeight / sourceWidth)));
  const padding = Math.max(16, Math.round(canvas.width * 0.025));

  context.save();
  context.globalAlpha = Math.min(1, Math.max(0.1, opacity));
  context.drawImage(
    logo as CanvasImageSource,
    padding,
    Math.max(padding, canvas.height - targetHeight - padding),
    targetWidth,
    targetHeight,
  );
  context.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string) {
  const supportedMime = ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ? mimeType
    : "image/jpeg";
  const quality = supportedMime === "image/png" ? undefined : 0.96;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("تعذر تجهيز الصورة للحفظ.")),
      supportedMime,
      quality,
    );
  });
}

export async function protectFleetImage(
  file: File,
  config: MediaBrandingConfig,
  options: { plateNumber?: string; blurPlate?: boolean },
): Promise<{ file: File; plateBlurred: boolean; warning?: string }> {
  if (!file.type.startsWith("image/")) return { file, plateBlurred: false };

  const source = await imageBitmapFromBlob(file);
  const width = "width" in source ? Number(source.width) : 0;
  const height = "height" in source ? Number(source.height) : 0;
  if (!width || !height) return { file, plateBlurred: false };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { file, plateBlurred: false };
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);

  let plateBlurred = false;
  let warning: string | undefined;
  if (options.blurPlate && config.plateBlurEnabled) {
    try {
      const boxes = await detectPlateBoxes(file, options.plateNumber);
      for (const box of boxes) blurBox(context, source as CanvasImageSource, box, width, height);
      plateBlurred = boxes.length > 0;
      if (!plateBlurred) warning = "لم يتم العثور على لوحة سيارة واضحة في الصورة؛ راجع الصورة بعد الرفع.";
    } catch {
      warning = "تعذر تشغيل قراءة اللوحة تلقائيًا؛ تم رفع الصورة مع الشعار فقط.";
    }
  }

  if (config.watermarkEnabled && config.logoPublicUrl) {
    try {
      await drawWatermark(
        context,
        canvas,
        config.logoPublicUrl,
        config.watermarkOpacity,
        config.watermarkWidthPercent,
      );
    } catch {
      warning = warning ?? "تعذر تطبيق شعار المنصة على الصورة؛ تحقق من إعداد الشعار.";
    }
  }

  const blob = await canvasToBlob(canvas, file.type);
  return {
    file: new File([blob], file.name, { type: blob.type || file.type, lastModified: Date.now() }),
    plateBlurred,
    warning,
  };
}
