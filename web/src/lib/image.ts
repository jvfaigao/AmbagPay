// Phone photos are often 3–8 MB; the review API accepts 3 MB. Shrink to ≤1600 px JPEG before upload.
// shortcut: browsers that cannot decode the file (e.g. HEIC on desktop Chrome) send it unchanged; the API then rejects files over 3 MB.
export async function shrinkImage(file: File, maxSide = 1600): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.split(",")[1], mimeType: "image/jpeg", previewUrl: dataUrl };
  } catch {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return { base64: dataUrl.split(",")[1], mimeType: file.type, previewUrl: dataUrl };
  }
}
