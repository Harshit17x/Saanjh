/** Longest side after downscaling: enough to read print, small enough to upload quickly. */
const MAX_SIDE = 1600;
/** Base64 budget, matching the server's limit with headroom. */
const MAX_BASE64 = 1_300_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image we can read.'));
    };
    image.src = url;
  });
}

/**
 * Downscales a photo in the browser and returns it as base64 JPEG, so large
 * camera images never leave the device at full size.
 */
export async function prepareImage(file: File): Promise<{ mimeType: 'image/jpeg'; data: string }> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare images.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (let quality = 0.85; quality >= 0.4; quality -= 0.15) {
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
    if (data.length <= MAX_BASE64) return { mimeType: 'image/jpeg', data };
  }
  throw new Error('That photo is too large. Please try a smaller one.');
}
