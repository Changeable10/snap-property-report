export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

export const ACCEPTED_IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

export const IMAGE_VALIDATION_ERROR = "Please select an image file (JPG, PNG, or HEIC)";

/** Returns true if the file has an accepted image MIME type. Some browsers report
 * empty type for HEIC — fall back to extension sniffing in that case. */
export function isAcceptedImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type && ACCEPTED_IMAGE_TYPES.includes(type)) return true;
  if (!type) {
    const name = file.name.toLowerCase();
    return /\.(jpe?g|png|heic|heif|webp)$/.test(name);
  }
  return false;
}