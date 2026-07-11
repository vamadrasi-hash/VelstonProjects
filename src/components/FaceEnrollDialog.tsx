// Enroll (register) a worker's face so it can be recognised for attendance.
// Two paths: reuse the worker's existing profile photo, or capture/upload a new
// clear face photo. Either way we compute a 128-float descriptor on-device and
// store it in worker_face_enrollments.
import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ScanFace, Trash2, Camera, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { getPhotoUrl } from "@/lib/employeePhoto";
import { computeDescriptor, ensureModels, loadBlob, loadImage } from "@/lib/faceapi";
import { clearFaceEnrollments, enrollFace } from "@/lib/attendance";

type EnrollWorker = { id: string; name: string; photo_url?: string | null; designation?: string | null };

export function FaceEnrollDialog({
  worker, open, onOpenChange, enrolledCount = 0, onChanged,
}: {
  worker: EnrollWorker | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  enrolledCount?: number;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Warm the models as soon as the dialog opens so the first scan is quick.
  useEffect(() => { if (open) ensureModels().catch(() => {}); }, [open]);

  if (!worker) return null;

  const enrollFromImage = async (img: HTMLImageElement, source: "capture" | "profile_photo") => {
    setBusy(true);
    setStatus("Detecting face…");
    try {
      const descriptor = await computeDescriptor(img, false);
      if (!descriptor) {
        toast.error("No clear face detected. Use a well-lit, front-facing photo.");
        setStatus("");
        return;
      }
      await enrollFace(worker.id, descriptor, source);
      toast.success(`Face registered for ${worker.name}`);
      setStatus("");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Enrollment failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const enrollFromProfile = async () => {
    if (!worker.photo_url) return;
    setBusy(true);
    setStatus("Loading profile photo…");
    try {
      const url = await getPhotoUrl(worker.photo_url);
      if (!url) throw new Error("Could not load profile photo");
      const img = await loadImage(url);
      await enrollFromImage(img, "profile_photo");
    } catch (e: any) {
      toast.error(e?.message || "Could not use profile photo");
      setStatus("");
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    try {
      const img = await loadBlob(file);
      await enrollFromImage(img, "capture");
    } catch (e: any) {
      toast.error(e?.message || "Could not read photo");
    }
  };

  const clear = async () => {
    if (!confirm(`Remove all registered faces for ${worker.name}?`)) return;
    setBusy(true);
    try {
      await clearFaceEnrollments(worker.id);
      toast.success("Face registration cleared");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-5 w-5" /> Face registration
          </DialogTitle>
          <DialogDescription>
            Register {worker.name}'s face for attendance scanning.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <EmployeePhoto path={worker.photo_url} name={worker.name} size={56} subtitle={worker.designation || undefined} />
          <div className="min-w-0">
            <div className="font-medium truncate">{worker.name}</div>
            <div className="text-xs text-muted-foreground">
              {enrolledCount > 0
                ? <span className="text-emerald-600">✓ {enrolledCount} face sample{enrolledCount > 1 ? "s" : ""} registered</span>
                : "Not registered yet"}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          {worker.photo_url && (
            <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={enrollFromProfile}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Use existing profile photo
            </Button>
          )}
          <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {enrolledCount > 0 ? "Add another face photo" : "Capture / upload a face photo"}
          </Button>
          {enrolledCount > 0 && (
            <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" disabled={busy} onClick={clear}>
              <Trash2 className="h-4 w-4" /> Clear registration
            </Button>
          )}
        </div>

        {status && <div className="text-xs text-muted-foreground text-center">{status}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
