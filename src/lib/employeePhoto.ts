import { supabase } from "@/integrations/supabase/client";

const BUCKET = "employee-photos";

// Resize/crop the image to a square JPEG, max 512px, ~80% quality.
async function resizeToJpeg(file: File, maxSize = 512, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const target = Math.min(maxSize, side);
    const canvas = document.createElement("canvas");
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadEmployeePhoto(role: "worker" | "supervisor" | "contractor", file: File): Promise<string> {
  const blob = await resizeToJpeg(file);
  const path = `${role}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

// In-memory signed URL cache (paths -> { url, expiresAt }).
const cache = new Map<string, { url: string; expiresAt: number }>();
const EXPIRES_IN = 60 * 60; // 1h

export async function getPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  // Already a full URL (legacy)
  if (/^https?:\/\//.test(path)) return path;
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, EXPIRES_IN);
  if (error || !data) return null;
  cache.set(path, { url: data.signedUrl, expiresAt: now + EXPIRES_IN * 1000 });
  return data.signedUrl;
}

export async function deleteEmployeePhoto(path: string | null | undefined): Promise<void> {
  if (!path || /^https?:\/\//.test(path)) return;
  await supabase.storage.from(BUCKET).remove([path]);
  cache.delete(path);
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}
