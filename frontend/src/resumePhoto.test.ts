import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  RESUME_PHOTO_MAX_BYTES,
  computeResumePhotoCrop,
  createResumePhotoDataUrl,
  detectResumePhotoMime,
  fitResumePhotoDimensions,
  getResumePhotoDataUrl,
  parseJpegDataUrl,
} from "./resumePhoto";
import type { ResumePhotoProcessorRuntime } from "./resumePhoto";

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
}

function gifBytes() {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2, 3]);
}

function fakeJpegBytes(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

function toDataUrl(bytes: Uint8Array) {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function runtimeFor(overrides: Partial<ResumePhotoProcessorRuntime> = {}): ResumePhotoProcessorRuntime {
  const source = {} as CanvasImageSource;
  let width = 0;
  let height = 0;
  const surface = {
    resize: vi.fn((nextWidth: number, nextHeight: number) => {
      width = nextWidth;
      height = nextHeight;
    }),
    drawImage: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    decodeImage: vi.fn(async () => ({ source, width: 1200, height: 1200, close: vi.fn() })),
    createSurface: vi.fn(() => surface),
    encodeJpeg: vi.fn(async (_surface, quality) => {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      return new Blob([fakeJpegBytes(quality > 0.84 ? 220_000 : 110_000)], { type: "image/jpeg" });
    }),
    blobToDataUrl: vi.fn(async (blob: Blob) => toDataUrl(new Uint8Array(await blob.arrayBuffer()))),
    ...overrides,
  };
}

describe("resume photo processing", () => {
  it("detects only supported local raster formats from file signatures", () => {
    expect(detectResumePhotoMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectResumePhotoMime(pngBytes())).toBe("image/png");
    expect(detectResumePhotoMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(detectResumePhotoMime(gifBytes())).toBeUndefined();
  });

  it("computes a centered 3:4 crop for landscape and portrait images", () => {
    expect(computeResumePhotoCrop(1200, 1200)).toEqual({ x: 150, y: 0, width: 900, height: 1200 });
    expect(computeResumePhotoCrop(1200, 2000)).toEqual({ x: 0, y: 200, width: 1200, height: 1600 });
  });

  it("preserves the 3:4 ratio while fitting print resolution", () => {
    expect(fitResumePhotoDimensions(2400, 1600)).toEqual({ width: 900, height: 600 });
    expect(fitResumePhotoDimensions(600, 1200)).toEqual({ width: 600, height: 1200 });
  });

  it("rejects non-JPEG bytes even when the browser reports an image MIME type", async () => {
    await expect(createResumePhotoDataUrl({
      name: "fake.png",
      type: "image/png",
      arrayBuffer: async () => gifBytes().buffer,
    }, runtimeFor())).rejects.toThrow("仅支持 JPG、PNG 或 WebP");
  });

  it("crops through a fresh canvas and lowers JPEG quality until the real file is within 150 KB", async () => {
    const runtime = runtimeFor();
    const dataUrl = await createResumePhotoDataUrl({
      name: "portrait.png",
      type: "image/png",
      arrayBuffer: async () => pngBytes().buffer,
    }, runtime);

    const parsed = parseJpegDataUrl(dataUrl);
    expect(parsed).toBeDefined();
    expect(parsed!.byteLength).toBe(110_000);
    expect(parsed!.byteLength).toBeLessThanOrEqual(RESUME_PHOTO_MAX_BYTES);
    expect(runtime.encodeJpeg).toHaveBeenCalledWith(expect.anything(), expect.any(Number));
    expect(runtime.createSurface).toHaveBeenCalled();
    expect(runtime.decodeImage).toHaveBeenCalledWith(pngBytes(), "image/png");

    const surface = (runtime.createSurface as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(surface.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      150,
      0,
      900,
      1200,
      0,
      0,
      expect.any(Number),
      expect.any(Number),
    );
    const destination = surface.drawImage.mock.calls[0].slice(7, 9) as number[];
    expect(destination[0] / destination[1]).toBeCloseTo(3 / 4, 5);
    expect(surface.dispose).toHaveBeenCalled();
  });

  it("accepts only canonical JPEG data URLs and rejects oversized payloads", () => {
    const accepted = toDataUrl(fakeJpegBytes(32));
    expect(getResumePhotoDataUrl(accepted)).toBe(accepted);
    expect(getResumePhotoDataUrl("data:image/png;base64,AAAA")).toBeUndefined();
    expect(getResumePhotoDataUrl(toDataUrl(fakeJpegBytes(RESUME_PHOTO_MAX_BYTES + 1)))).toBeUndefined();
  });
});
