import type { ResumePhotoPosition } from "./types";

export const RESUME_PHOTO_MAX_BYTES = 150 * 1024;
export const RESUME_PHOTO_DATA_URL_MAX_CHARS = 210_000;
export const RESUME_PHOTO_POSITIONS: readonly ResumePhotoPosition[] = ["left", "right"];

export type SupportedResumePhotoMime = "image/jpeg" | "image/png" | "image/webp";

export interface ResumePhotoFile {
  name: string;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ResumePhotoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResumePhotoDimensions {
  width: number;
  height: number;
}

export interface DecodedResumePhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?(): void;
}

export interface ResumePhotoSurface {
  resize(width: number, height: number): void;
  drawImage(
    source: CanvasImageSource,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number,
  ): void;
  dispose(): void;
}

export interface ResumePhotoProcessorRuntime {
  decodeImage(bytes: Uint8Array, mime: SupportedResumePhotoMime): Promise<DecodedResumePhoto>;
  createSurface(width: number, height: number): ResumePhotoSurface;
  encodeJpeg(surface: ResumePhotoSurface, quality: number): Promise<Blob>;
  blobToDataUrl(blob: Blob): Promise<string>;
}

const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";
const INITIAL_MAX_WIDTH = 900;
const INITIAL_MAX_HEIGHT = 1200;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 320;
const JPEG_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34] as const;
const MAX_RESIZE_ATTEMPTS = 8;

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectResumePhotoMime(bytes: Uint8Array): SupportedResumePhotoMime | undefined {
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.slice(8, 12), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return undefined;
}

export function computeResumePhotoCrop(sourceWidth: number, sourceHeight: number): ResumePhotoCrop {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("照片尺寸无效。");
  }
  const targetAspect = 3 / 4;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > targetAspect) {
    const width = Math.round(sourceHeight * targetAspect);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }
  const height = Math.round(sourceWidth / targetAspect);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
}

export function fitResumePhotoDimensions(width: number, height: number): ResumePhotoDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("照片尺寸无效。");
  }
  const scale = Math.min(1, INITIAL_MAX_WIDTH / width, INITIAL_MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canonicalJpegPayload(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > RESUME_PHOTO_DATA_URL_MAX_CHARS ||
    !value.startsWith(JPEG_DATA_URL_PREFIX)
  ) {
    return undefined;
  }
  const encoded = value.slice(JPEG_DATA_URL_PREFIX.length);
  if (
    encoded.length < 8 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
    !encoded.startsWith("/9j/")
  ) {
    return undefined;
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const byteLength = (encoded.length / 4) * 3 - padding;
  return byteLength > 0 && byteLength <= RESUME_PHOTO_MAX_BYTES ? encoded : undefined;
}

export function parseJpegDataUrl(value: unknown): Uint8Array | undefined {
  const encoded = canonicalJpegPayload(value);
  if (!encoded) {
    return undefined;
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return undefined;
  }
  if (!binary.length) {
    return undefined;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (!startsWith(bytes, [0xff, 0xd8, 0xff]) || bytes.length > RESUME_PHOTO_MAX_BYTES) {
    return undefined;
  }
  return bytes;
}

export function getResumePhotoDataUrl(value: unknown): string | undefined {
  return canonicalJpegPayload(value) ? value as string : undefined;
}

export function normalizeResumePhotoPosition(value: unknown): ResumePhotoPosition {
  return value === "left" ? "left" : "right";
}

function shrinkPhotoDimensions(width: number, height: number): ResumePhotoDimensions {
  const nextHeight = Math.max(MIN_HEIGHT, Math.round(height * 0.86));
  const nextWidth = Math.max(MIN_WIDTH, Math.round((nextHeight * 3) / 4));
  return { width: nextWidth, height: nextHeight };
}

function createBrowserRuntime(): ResumePhotoProcessorRuntime {
  const surfaceCanvases = new WeakMap<ResumePhotoSurface, HTMLCanvasElement>();
  return {
    async decodeImage(bytes, mime) {
      const blob = new Blob([bytes as BlobPart], { type: mime });
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        };
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.decoding = "async";
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error("无法读取照片，请确认文件没有损坏。"));
          element.src = objectUrl;
        });
        return {
          source: image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },

    createSurface(width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("当前浏览器无法处理照片。");
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const surface: ResumePhotoSurface = {
        resize(nextWidth, nextHeight) {
          canvas.width = nextWidth;
          canvas.height = nextHeight;
          const nextContext = canvas.getContext("2d");
          if (!nextContext) throw new Error("当前浏览器无法处理照片。");
          nextContext.imageSmoothingEnabled = true;
          nextContext.imageSmoothingQuality = "high";
        },
        drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, destinationX, destinationY, destinationWidth, destinationHeight) {
          const activeContext = canvas.getContext("2d");
          if (!activeContext) throw new Error("当前浏览器无法处理照片。");
          activeContext.drawImage(
            source,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            destinationX,
            destinationY,
            destinationWidth,
            destinationHeight,
          );
        },
        dispose() {
          canvas.width = 1;
          canvas.height = 1;
        },
      };
      surfaceCanvases.set(surface, canvas);
      return surface;
    },

    encodeJpeg(surface, quality) {
      const canvas = surfaceCanvases.get(surface);
      if (!canvas) {
        return Promise.reject(new Error("照片压缩失败，请换一张图片重试。"));
      }
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("照片压缩失败，请换一张图片重试。"))),
          "image/jpeg",
          quality,
        );
      });
    },

    blobToDataUrl(blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("照片编码失败，请重试。"));
        };
        reader.onerror = () => reject(new Error("照片编码失败，请重试。"));
        reader.readAsDataURL(blob);
      });
    },
  };
}

const browserRuntime = createBrowserRuntime();

export async function createResumePhotoDataUrl(
  file: ResumePhotoFile,
  runtime: ResumePhotoProcessorRuntime = browserRuntime,
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error("无法读取照片，请确认文件没有损坏。");
  }

  const detectedMime = detectResumePhotoMime(bytes);
  if (!detectedMime) {
    throw new Error("仅支持 JPG、PNG 或 WebP 图片。");
  }
  const declaredMime = file.type.trim().toLowerCase();
  const normalizedDeclaredMime = declaredMime === "image/jpg" ? "image/jpeg" : declaredMime;
  if (normalizedDeclaredMime && normalizedDeclaredMime !== detectedMime) {
    throw new Error("图片格式与文件声明不一致，请重新选择 JPG、PNG 或 WebP 图片。");
  }

  const decoded = await runtime.decodeImage(bytes, detectedMime);
  const surface = runtime.createSurface(1, 1);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error("无法读取照片尺寸。");
    }
    const crop = computeResumePhotoCrop(decoded.width, decoded.height);
    let dimensions = fitResumePhotoDimensions(crop.width, crop.height);

    for (let resizeAttempt = 0; resizeAttempt < MAX_RESIZE_ATTEMPTS; resizeAttempt += 1) {
      surface.resize(dimensions.width, dimensions.height);
      surface.drawImage(
        decoded.source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );

      for (const quality of JPEG_QUALITIES) {
        const blob = await runtime.encodeJpeg(surface, quality);
        if (blob.size <= RESUME_PHOTO_MAX_BYTES) {
          const dataUrl = await runtime.blobToDataUrl(blob);
          if (parseJpegDataUrl(dataUrl)) {
            return dataUrl;
          }
        }
      }

      if (dimensions.width <= MIN_WIDTH && dimensions.height <= MIN_HEIGHT) {
        break;
      }
      dimensions = shrinkPhotoDimensions(dimensions.width, dimensions.height);
    }
  } finally {
    surface.dispose();
    decoded.close?.();
  }

  throw new Error("照片压缩后仍超过 150 KB，请换一张更简单的图片。");
}
