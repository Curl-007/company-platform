const path = require("path");

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  // plain / structured text
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".xml", ".html", ".htm",
  ".yaml", ".yml", ".log", ".rtf",
  // documents
  ".pdf",
  ".doc", ".docx", ".dot", ".dotx",
  ".odt",
  ".wps",
  // spreadsheets
  ".xls", ".xlsx", ".xlt", ".xltx",
  ".ods",
  ".et",
  // presentations
  ".ppt", ".pptx", ".pot", ".potx",
  ".odp",
  ".dps",
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff",
]);

const ALLOWED_MIME_PREFIXES = ["text/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
  "text/csv",
  "text/tab-separated-values",
  "text/rtf",
  "application/rtf",
  "application/x-yaml",
  "application/yaml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/kswps",
  "application/msword-template",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/octet-stream",
]);

function extensionOf(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return ext;
}

function isAllowedExtension(fileName) {
  const ext = extensionOf(fileName);
  return Boolean(ext) && ALLOWED_EXTENSIONS.has(ext);
}

function isAllowedMime(mimeType) {
  const mime = String(mimeType || "").trim().toLowerCase();
  if (!mime) return true;
  if (ALLOWED_MIME_TYPES.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function decodeBase64Payload(contentBase64) {
  if (contentBase64 == null || contentBase64 === "") return null;
  const raw = String(contentBase64);
  const base64 = raw.includes(",") ? raw.split(",").pop() : raw;
  return Buffer.from(base64 || "", "base64");
}

function validateUploadMeta({ fileName, fileType, size, contentBase64 } = {}) {
  if (!fileName || !String(fileName).trim()) {
    return { ok: false, errorCode: "VALIDATION_FAILED", message: "fileName is required for uploads." };
  }
  if (!isAllowedExtension(fileName)) {
    return {
      ok: false,
      errorCode: "UPLOAD_TYPE_NOT_ALLOWED",
      message: `File type is not allowed. Allowed extensions: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
    };
  }
  if (fileType != null && String(fileType).trim() && !isAllowedMime(fileType)) {
    return {
      ok: false,
      errorCode: "UPLOAD_TYPE_NOT_ALLOWED",
      message: `MIME type is not allowed: ${fileType}`,
    };
  }

  let byteLength = Number(size);
  if (!Number.isFinite(byteLength) || byteLength < 0) byteLength = 0;
  if (contentBase64) {
    try {
      const buffer = decodeBase64Payload(contentBase64);
      if (buffer) byteLength = buffer.length;
    } catch {
      return { ok: false, errorCode: "VALIDATION_FAILED", message: "contentBase64 is not valid base64." };
    }
  }
  if (byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      errorCode: "UPLOAD_TOO_LARGE",
      message: `File exceeds the ${MAX_UPLOAD_BYTES} byte limit.`,
    };
  }
  return { ok: true, byteLength };
}

function createMulterFileFilter() {
  return (req, file, cb) => {
    const check = validateUploadMeta({
      fileName: file.originalname,
      fileType: file.mimetype,
      size: 0,
    });
    if (!check.ok) {
      const error = new Error(check.message);
      error.code = check.errorCode;
      error.status = 400;
      return cb(error);
    }
    return cb(null, true);
  };
}

function createDocumentUpload({ multer, storageDir, maxUploadBytes = MAX_UPLOAD_BYTES }) {
  if (typeof multer !== "function") throw new Error("multer is required to create document upload middleware.");
  return multer({
    dest: storageDir,
    limits: { fileSize: maxUploadBytes },
    fileFilter: createMulterFileFilter(),
  });
}

module.exports = {
  MAX_UPLOAD_BYTES,
  ALLOWED_EXTENSIONS,
  createDocumentUpload,
  validateUploadMeta,
  createMulterFileFilter,
  isAllowedExtension,
  isAllowedMime,
  decodeBase64Payload,
};
