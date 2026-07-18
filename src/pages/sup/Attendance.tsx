// Face-recognition attendance for supervisors.
// The supervisor points the phone at a worker; the app recognises the face
// on-device and lets them mark the worker IN (arrival) or OUT (leaving).
// Unrecognised faces can be picked manually and enrolled on the spot.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { EmployeePhoto } from "@/components/EmployeePhoto";
import { toast } from "sonner";
import {
  Loader2, ScanFace, LogIn, LogOut, SwitchCamera, CameraOff, UserPlus, MapPin,
} from "lucide-react";
import {
  ensureModels, computeDescriptor, bestMatch, MATCH_THRESHOLD, SUGGEST_THRESHOLD,
  type Candidate, type Descriptor,
} from "@/lib/faceapi";
import {
  loadEnrollments, enrollFace, recordAttendance, loadTodayAttendance,
  type AttendanceKind, type TodayEvent,
} from "@/lib/attendance";

type Worker = { id: string; name: string; designation: string; photo_url: string | null };

// --- lightweight GPS cache (best-effort, non-blocking) ---
type Fix = { lat: number; lng: number; acc: number; at: number };
let lastFix: Fix | null = null;
let watchStarted = false;
function startGpsWatch() {
  if (watchStarted || !navigator.geolocation) return;
  watchStarted = true;
  try {
    navigator.geolocation.watchPosition(
      (p) => { lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  } catch { watchStarted = false; }
}

async function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (!video.videoWidth) return null;
  const targetW = 480;
  const scale = Math.min(1, targetW / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.7));
}

export default function Attendance() {
  const { supervisorId, user } = useRole();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);       // a detect pass is in flight
  const pausedRef = useRef(false);          // paused while recording
  const lastDescriptorRef = useRef<Descriptor | null>(null);

  // Camera preference persists across scans; back camera by default (the
  // supervisor points the phone at the worker). Flip button changes it anytime.
  const [facing, setFacingState] = useState<"user" | "environment">(
    () => (localStorage.getItem("attendance_cam") === "user" ? "user" : "environment"),
  );
  const setFacing = (f: "user" | "environment") => {
    localStorage.setItem("attendance_cam", f);
    setFacingState(f);
  };
  const [modelsReady, setModelsReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);

  const [workers, setWorkers] = useState<Record<string, Worker>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [events, setEvents] = useState<TodayEvent[]>([]);

  const [faceInView, setFaceInView] = useState(false);
  const [suggestion, setSuggestion] = useState<{ workerId: string; distance: number } | null>(null);
  const [recording, setRecording] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualWorker, setManualWorker] = useState("");
  const [manualEnroll, setManualEnroll] = useState(true);

  // ---- data ----
  const loadData = async () => {
    const [{ data: ws }, enr, ev] = await Promise.all([
      supabase.from("workers").select("id,name,designation,photo_url"),
      loadEnrollments(),
      loadTodayAttendance(),
    ]);
    const wm: Record<string, Worker> = {};
    ((ws as any[]) || []).forEach((w) => (wm[w.id] = w));
    setWorkers(wm);
    setCandidates(enr.candidates);
    setEvents(ev);
  };

  useEffect(() => {
    startGpsWatch();
    ensureModels().then(() => setModelsReady(true)).catch(() => setCamError("Could not load face models."));
    loadData();
  }, [supervisorId]);

  // ---- camera lifecycle ----
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const startCamera = async () => {
    setCamError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch (e: any) {
      setCamError(e?.message || "Camera permission denied");
      setCamOn(false);
    }
  };

  useEffect(() => {
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  // ---- scan loop ----
  useEffect(() => {
    if (!camOn || !modelsReady) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (!scanningRef.current && !pausedRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        scanningRef.current = true;
        try {
          const desc = await computeDescriptor(videoRef.current, true);
          if (alive) {
            if (desc) {
              lastDescriptorRef.current = desc;
              setFaceInView(true);
              const m = candidates.length ? bestMatch(desc, candidates) : null;
              setSuggestion(m && m.distance <= SUGGEST_THRESHOLD ? m : null);
            } else {
              setFaceInView(false);
              setSuggestion(null);
            }
          }
        } catch { /* ignore a bad frame */ } finally {
          scanningRef.current = false;
        }
      }
    };
    const id = setInterval(tick, 600);
    return () => { alive = false; clearInterval(id); };
  }, [camOn, modelsReady, candidates]);

  // ---- attendance actions ----
  const statusOf = (workerId: string): AttendanceKind | null => {
    const ev = events.find((e) => e.worker_id === workerId); // events are newest-first
    return ev ? ev.kind : null;
  };

  const mark = async (workerId: string, kind: AttendanceKind, method: "face" | "manual", matchDistance?: number | null) => {
    if (!user) return;
    const prev = statusOf(workerId);
    if (prev === kind) {
      const label = kind === "in" ? "checked in" : "checked out";
      if (!confirm(`${workers[workerId]?.name || "Worker"} is already ${label} today. Record again?`)) return;
    }
    setRecording(true);
    pausedRef.current = true;
    try {
      // Best-effort snapshot for the audit trail.
      let storagePath: string | null = null;
      const video = videoRef.current;
      const blob = video ? await grabFrame(video) : null;
      if (blob) {
        const path = `${user.id}/${workerId}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("attendance-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (!upErr) storagePath = path;
      }
      const fix = lastFix && Date.now() - lastFix.at < 60_000 ? lastFix : null;
      await recordAttendance({
        workerId,
        supervisorId: supervisorId || null,
        kind,
        method,
        matchDistance: matchDistance ?? null,
        latitude: fix?.lat ?? null,
        longitude: fix?.lng ?? null,
        accuracyM: fix?.acc ?? null,
        storagePath,
      });
      toast.success(`${workers[workerId]?.name || "Worker"} marked ${kind === "in" ? "IN" : "OUT"}`);
      setEvents(await loadTodayAttendance());
      setSuggestion(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not record attendance");
    } finally {
      setRecording(false);
      pausedRef.current = false;
    }
  };

  const confirmManual = async () => {
    if (!manualWorker) { toast.error("Pick a worker"); return; }
    // Enroll the currently-seen face for this worker, if requested and available.
    if (manualEnroll && lastDescriptorRef.current) {
      try { await enrollFace(manualWorker, lastDescriptorRef.current, "capture"); }
      catch { /* non-fatal */ }
    }
    setManualOpen(false);
    const kind: AttendanceKind = statusOf(manualWorker) === "in" ? "out" : "in";
    await mark(manualWorker, kind, "manual", null);
    setManualWorker("");
    // refresh candidates so the new enrollment is matchable immediately
    try { setCandidates((await loadEnrollments()).candidates); } catch { /* ignore */ }
  };

  const suggestedWorker = suggestion ? workers[suggestion.workerId] : null;
  const confident = !!suggestion && suggestion.distance <= MATCH_THRESHOLD;

  const workerOptions = useMemo(
    () => Object.values(workers)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => ({ value: w.id, label: w.name, sublabel: w.designation })),
    [workers],
  );

  const summary = useMemo(() => {
    const seen = new Map<string, AttendanceKind>();
    // events newest-first: first occurrence per worker is their latest status
    events.forEach((e) => { if (!seen.has(e.worker_id)) seen.set(e.worker_id, e.kind); });
    let inN = 0, outN = 0;
    seen.forEach((k) => { if (k === "in") inN++; else outN++; });
    return { inN, outN };
  }, [events]);

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">Pick a supervisor first.</Card>;
  }

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3 flex items-center gap-2">
        <ScanFace className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Face Attendance / ચહેરા હાજરી</div>
          <div className="text-xs text-muted-foreground">Scan a worker's face to mark arrival or leaving</div>
        </div>
        <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">IN {summary.inN}</Badge>
        <Badge variant="outline" className="text-orange-600 border-orange-500/40">OUT {summary.outN}</Badge>
      </Card>

      {/* Camera + overlay */}
      <Card className="p-0 overflow-hidden">
        <div className="relative bg-black aspect-[4/3] w-full">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
          />
          {!camOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
              {camError ? (
                <>
                  <CameraOff className="h-8 w-8" />
                  <div className="px-6 text-center">{camError}</div>
                  <Button size="sm" variant="secondary" onClick={startCamera}>Retry camera</Button>
                </>
              ) : (
                <><Loader2 className="h-6 w-6 animate-spin" /> Starting camera…</>
              )}
            </div>
          )}

          {/* face guide + status chip */}
          {camOn && (
            <>
              <div className={`absolute inset-8 sm:inset-12 rounded-[40%] border-2 pointer-events-none transition-colors ${
                confident ? "border-emerald-400" : faceInView ? "border-amber-300" : "border-white/40"
              }`} />
              <div className="absolute top-2 left-2 flex items-center gap-1">
                {!modelsReady && <span className="bg-black/60 text-white text-[11px] px-2 py-1 rounded flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading models…</span>}
                {modelsReady && !faceInView && <span className="bg-black/60 text-white text-[11px] px-2 py-1 rounded">Position face in the oval</span>}
              </div>
              <Button
                size="icon" variant="secondary"
                className="absolute top-2 right-2 h-9 w-9 opacity-90"
                onClick={() => setFacing(facing === "user" ? "environment" : "user")}
                title="Flip camera"
              >
                <SwitchCamera className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Recognition result / actions */}
        <div className="p-3 space-y-3">
          {suggestedWorker ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <EmployeePhoto path={suggestedWorker.photo_url} name={suggestedWorker.name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-tight">{suggestedWorker.name}</div>
                  <div className="text-xs text-muted-foreground">{suggestedWorker.designation}</div>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <Badge className={confident ? "bg-emerald-600 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-500"}>
                      {confident ? "Match" : "Possible match"}
                    </Badge>
                    {statusOf(suggestedWorker.id) && (
                      <span className="text-[11px] text-muted-foreground">
                        Currently {statusOf(suggestedWorker.id) === "in" ? "IN" : "OUT"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-12 bg-emerald-600 hover:bg-emerald-700"
                  disabled={recording}
                  onClick={() => mark(suggestedWorker.id, "in", "face", suggestion!.distance)}
                >
                  {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-5 w-5" />} Mark IN
                </Button>
                <Button
                  className="h-12 bg-orange-600 hover:bg-orange-700"
                  disabled={recording}
                  onClick={() => mark(suggestedWorker.id, "out", "face", suggestion!.distance)}
                >
                  {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-5 w-5" />} Mark OUT
                </Button>
              </div>
              <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setManualOpen(true)}>
                Not {suggestedWorker.name.split(" ")[0]}? Pick manually
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-center text-muted-foreground">
                {faceInView
                  ? (candidates.length ? "Face not recognised." : "No faces enrolled yet.")
                  : "Looking for a face…"}
              </div>
              <Button variant="outline" className="w-full" onClick={() => setManualOpen(true)}>
                <UserPlus className="h-4 w-4" /> Pick worker manually {faceInView ? "& enroll face" : ""}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Today's log */}
      <Card className="p-3 space-y-2">
        <div className="font-semibold text-sm">Today's scans ({events.length})</div>
        {events.length === 0 && <div className="text-xs text-muted-foreground">No attendance recorded yet.</div>}
        <div className="space-y-1">
          {events.slice(0, 40).map((e) => {
            const w = workers[e.worker_id];
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1.5">
                <Badge className={e.kind === "in" ? "bg-emerald-600 hover:bg-emerald-600" : "bg-orange-600 hover:bg-orange-600"}>
                  {e.kind === "in" ? "IN" : "OUT"}
                </Badge>
                <span className="font-medium truncate flex-1">{w?.name || "—"}</span>
                {e.method === "manual" && <span className="text-[10px] text-muted-foreground">manual</span>}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.captured_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Manual pick / enroll dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pick worker</DialogTitle>
            <DialogDescription>Mark attendance manually. If a face is in view you can also register it.</DialogDescription>
          </DialogHeader>
          <SearchableSelect
            value={manualWorker}
            onChange={setManualWorker}
            options={workerOptions}
            placeholder="Search worker…"
          />
          {lastDescriptorRef.current && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={manualEnroll} onChange={(e) => setManualEnroll(e.target.checked)} />
              Register the face currently in view for this worker
            </label>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button onClick={confirmManual} disabled={!manualWorker || recording}>
              {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Mark {statusOf(manualWorker) === "in" ? "OUT" : "IN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
        <MapPin className="h-3 w-3" /> Location is captured with each scan when available.
      </div>
    </div>
  );
}
