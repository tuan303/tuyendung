// Base64 plus the JSON envelope must fit within Vercel's 4.5 MB request limit.
export const MAX_CV_BYTES = 3 * 1024 * 1024;
export const MAX_CV_SIZE_LABEL = '3 MiB';
