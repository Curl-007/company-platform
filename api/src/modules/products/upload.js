const path = require("node:path");

const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

function isValidProductImage(file) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();
  return PRODUCT_IMAGE_TYPES.get(extension) === mimeType;
}

function createProductImageUpload({ multer, storageDir }) {
  if (typeof multer !== "function") throw new Error("multer is required to create product image upload middleware.");
  return multer({
    dest: storageDir,
    limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES },
    fileFilter: (_req, file, callback) => {
      if (!isValidProductImage(file)) {
        const error = new Error("Product images support PNG, JPEG, WebP, and GIF only.");
        error.code = "UPLOAD_TYPE_NOT_ALLOWED";
        error.status = 400;
        return callback(error);
      }
      return callback(null, true);
    },
  });
}

module.exports = {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_TYPES,
  createProductImageUpload,
  isValidProductImage,
};
