// Camera + GPS capture. Uses Capacitor native plugins when available,
// falls back to <input type="file" capture> + navigator.geolocation in the browser.
//
// Speed: warms a GPS cache on mount so the shutter doesn't block waiting for a fix.
// Visibility: shows a live GPS chip while waiting and burns lat/lng/accuracy/timestamp
// into the bottom strip of every saved image.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera as CameraIcon, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { tx } from "@/components/BilingualLabel";

export type Capture = {
  blob: Blob;
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string; // ISO
};

const isNative = () => {
  try {
    // @ts-ignore
    return typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

type Fix = { lat: number; lng: number; acc: number; at: number };

// Shared cache so multiple CameraCapture instances share a recent fix.
let lastFix: Fix | null = null;
let watchStarted = false;

function startWatchWeb() {
  if (watchStarted || !navigator.geolocation) return;
  watchStarted = true;
  try {
    navigator.geolocation.watchPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  } catch {
    watchStarted = false;
  }
}

async function startWatchNative() {
  if (watchStarted) return;
  watchStarted = true;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    await Geolocation.requestPermissions();
    await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos) => {
      if (pos && pos.coords) {
        lastFix = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          acc: pos.coords.accuracy, at: Date.now(),
        };
      }
    });
  } catch {
    watchStarted = false;
  }
}

async function getFix(): Promise<Fix> {
  // Use cached fix if recent enough (< 30s) — instant.
  if (lastFix && Date.now() - lastFix.at < 30_000) return lastFix;

  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000,
    });
    const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() };
    lastFix = f; return f;
  }
  return new Promise<Fix>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
        lastFix = f; resolve(f);
      },
      (e) => {
        // Fall back to whatever cached fix we have, even if stale.
        if (lastFix) return resolve(lastFix);
        reject(e);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30_000 },
    );
  });
}

async function captureNative(): Promise<Blob> {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 60,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });
  const dataUrl = photo.dataUrl!;
  const res = await fetch(dataUrl);
  return await res.blob();
}

/** Burn GPS + timestamp onto bottom strip of the image. */
async function stamp(blob: Blob, lat: number, lng: number, acc: number): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(blob);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = (e) => rej(e);
    img.src = url;
  });
  // Smaller for faster uploads
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  // Bigger, more legible strip
  const stripH = Math.max(44, Math.round(h * 0.075));
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, h - stripH, w, stripH);
  ctx.fillStyle = "#fff";
  const fs = Math.max(14, Math.round(stripH * 0.42));
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const ts = new Date().toLocaleString();
  const txt = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}  ±${acc.toFixed(0)}m  ·  ${ts}`;
  ctx.fillText(txt, 10, h - stripH / 2);
  URL.revokeObjectURL(url);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.6));
}

type Props = {
  label?: string;
  onCaptured: (c: Capture) => void | Promise<void>;
  disabled?: boolean;
  /** Compact = icon + short label, wraps text, fits in 2-col grid on mobile. */
  compact?: boolean;
};

export function CameraCapture({ label, onCaptured, disabled, compact }: Props) {
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<Fix | null>(lastFix);
  const fileRef = useRef<HTMLInputElement>(null);

  // Warm GPS as soon as the button mounts.
  useEffect(() => {
    if (isNative()) startWatchNative(); else startWatchWeb();
    const id = setInterval(() => setFix(lastFix ? { ...lastFix } : null), 1000);
    return () => clearInterval(id);
  }, []);

  const handle = async (blob: Blob) => {
    setBusy(true);
    try {
      const gps = await getFix();
      if (gps.acc > 500) {
        toast.warning(`Low GPS accuracy (±${gps.acc.toFixed(0)}m). Photo saved anyway.`);
      }
      const stamped = await stamp(blob, gps.lat, gps.lng, gps.acc);
      await onCaptured({
        blob: stamped,
        latitude: gps.lat,
        longitude: gps.lng,
        accuracyM: gps.acc,
        capturedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      toast.error(e.message || "Capture failed");
    } finally {
      setBusy(false);
    }
  };

  const onClick = async () => {
    if (busy || disabled) return;
    if (isNative()) {
      try {
        setBusy(true);
        const blob = await captureNative();
        setBusy(false);
        await handle(blob);
      } catch (e: any) {
        setBusy(false);
        toast.error(e.message || "Camera failed");
      }
    } else {
      // Synchronously trigger the file picker from the user gesture.
      fileRef.current?.click();
    }
  };

  const gpsChip = (() => {
    if (!fix) return { tone: "bg-amber-500/15 text-amber-700 border-amber-500/30", text: "GPS…" };
    if (fix.acc <= 50) return { tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", text: `GPS ±${fix.acc.toFixed(0)}m` };
    if (fix.acc <= 150) return { tone: "bg-amber-500/15 text-amber-700 border-amber-500/30", text: `GPS ±${fix.acc.toFixed(0)}m` };
    return { tone: "bg-orange-500/15 text-orange-700 border-orange-500/30", text: `GPS ±${fix.acc.toFixed(0)}m` };
  })();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        className={
          compact
            ? "w-full h-auto min-h-11 py-2 px-2 text-[11px] leading-tight whitespace-normal gap-1"
            : "w-full h-auto min-h-12 py-2 whitespace-normal text-sm leading-tight"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <CameraIcon className="h-4 w-4 shrink-0" />}
        <span className="break-words">{label || tx("take_before_photo")}</span>
      </Button>
      <div className={`flex items-center justify-center gap-1 text-[10px] px-1 py-0.5 rounded border ${gpsChip.tone}`}>
        <MapPin className="h-2.5 w-2.5" />
        <span className="font-medium truncate">
          {fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} · ${gpsChip.text}` : gpsChip.text}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
    </div>
  );
}
