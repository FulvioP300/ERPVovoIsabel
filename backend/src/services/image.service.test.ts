import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageProviderPort } from "../plugins/images/image-provider.port.js";
import { MAX_IMAGE_SIZE_BYTES } from "../schemas/image.schema.js";
import {
  ImageTooLargeError,
  InvalidImageTypeError,
  removeImage,
  setImageProviderForTesting,
  uploadImage,
} from "./image.service.js";

function fakeProvider(): ImageProviderPort {
  return {
    upload: vi.fn().mockResolvedValue({ id: "fake-id.jpg", url: "https://blob.test/fake-id.jpg" }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe("image.service", () => {
  let provider: ImageProviderPort;

  beforeEach(() => {
    provider = fakeProvider();
    setImageProviderForTesting(provider);
  });

  it("rejeita MIME type não permitido antes de chamar o provedor", async () => {
    await expect(
      uploadImage({ buffer: Buffer.from("x"), mimeType: "application/pdf" }),
    ).rejects.toBeInstanceOf(InvalidImageTypeError);
    expect(provider.upload).not.toHaveBeenCalled();
  });

  it("rejeita arquivo acima do tamanho máximo antes de chamar o provedor", async () => {
    const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1);
    await expect(uploadImage({ buffer: oversized, mimeType: "image/jpeg" })).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
    expect(provider.upload).not.toHaveBeenCalled();
  });

  it("delega ao provedor quando MIME type e tamanho são válidos", async () => {
    const result = await uploadImage({ buffer: Buffer.from("ok"), mimeType: "image/png" });
    expect(provider.upload).toHaveBeenCalledWith(expect.any(Buffer), "image/png", "png");
    expect(result).toEqual({ id: "fake-id.jpg", url: "https://blob.test/fake-id.jpg" });
  });

  it("removeImage delega ao provedor", async () => {
    await removeImage("fake-id.jpg");
    expect(provider.remove).toHaveBeenCalledWith("fake-id.jpg");
  });
});
