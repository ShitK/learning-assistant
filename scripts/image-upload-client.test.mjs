import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  MAX_UPLOAD_IMAGE_BYTES,
  getBase64ByteSize,
  getImageUploadErrorMessage,
  isSupportedUploadMimeType,
  selectUploadSizedDataUrl,
  stripDataUrlPrefix,
  validateImageFileMetadata,
} = jiti("../src/lib/image-upload-client.ts");

assert.equal(MAX_UPLOAD_IMAGE_BYTES, 1_000_000);
assert.equal(isSupportedUploadMimeType("image/png"), true);
assert.equal(isSupportedUploadMimeType("image/jpeg"), true);
assert.equal(isSupportedUploadMimeType("image/webp"), true);
assert.equal(isSupportedUploadMimeType("image/gif"), false);

assert.deepEqual(
  stripDataUrlPrefix("data:image/png;base64,YWJjZA=="),
  { ok: true, base64: "YWJjZA==", mime_type: "image/png" },
);
assert.deepEqual(
  stripDataUrlPrefix("data:image/gif;base64,YWJjZA=="),
  { ok: false, error: "invalid_type" },
);
assert.equal(getBase64ByteSize("YWJjZA=="), 4);

assert.deepEqual(
  validateImageFileMetadata({
    name: "mistake.png",
    type: "image/png",
    size: 900_000,
  }),
  { ok: true },
);
assert.deepEqual(
  validateImageFileMetadata({
    name: "mistake.gif",
    type: "image/gif",
    size: 10_000,
  }),
  { ok: false, error: "invalid_type" },
);
assert.deepEqual(
  validateImageFileMetadata({
    name: "huge.jpg",
    type: "image/jpeg",
    size: 8_500_001,
  }),
  { ok: false, error: "source_too_large" },
);

assert.equal(
  getImageUploadErrorMessage("invalid_type"),
  "请上传 PNG、JPEG 或 WebP 格式的图片。",
);
assert.equal(
  getImageUploadErrorMessage("compressed_too_large"),
  "图片压缩后仍超过 1MB，请裁剪题目区域后重试。",
);

const smallJpegDataUrl = "data:image/jpeg;base64,YWJjZA==";
const oversizedJpegDataUrl = `data:image/jpeg;base64,${Buffer.alloc(
  MAX_UPLOAD_IMAGE_BYTES + 1,
).toString("base64")}`;

assert.equal(
  selectUploadSizedDataUrl([oversizedJpegDataUrl, smallJpegDataUrl]),
  smallJpegDataUrl,
);
assert.equal(selectUploadSizedDataUrl([oversizedJpegDataUrl]), null);

console.log("image upload client regression test passed");
