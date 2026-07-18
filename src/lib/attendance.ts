// Data access for face enrollment + attendance events.
import { supabase } from "@/integrations/supabase/client";
import type { Candidate, Descriptor } from "@/lib/faceapi";

export type AttendanceKind = "in" | "out";

/** All enrolled face descriptors, grouped per worker, plus a per-worker count. */
export async function loadEnrollments(): Promise<{
  candidates: Candidate[];
  countByWorker: Record<string, number>;
}> {
  const { data, error } = await supabase
    .from("worker_face_enrollments")
    .select("worker_id,descriptor");
  if (error) throw error;
  const byWorker = new Map<string, Descriptor[]>();
  ((data as any[]) || []).forEach((r) => {
    const arr = byWorker.get(r.worker_id) || [];
    if (Array.isArray(r.descriptor)) arr.push(r.descriptor as Descriptor);
    byWorker.set(r.worker_id, arr);
  });
  const candidates: Candidate[] = [];
  const countByWorker: Record<string, number> = {};
  byWorker.forEach((descriptors, workerId) => {
    candidates.push({ workerId, descriptors });
    countByWorker[workerId] = descriptors.length;
  });
  return { candidates, countByWorker };
}

/** How many face samples each worker has (for enrollment status UI). */
export async function loadEnrollmentCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("worker_face_enrollments").select("worker_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  ((data as any[]) || []).forEach((r) => { counts[r.worker_id] = (counts[r.worker_id] || 0) + 1; });
  return counts;
}

export async function enrollFace(
  workerId: string,
  descriptor: Descriptor,
  source: "capture" | "profile_photo",
): Promise<void> {
  const { error } = await supabase
    .from("worker_face_enrollments")
    .insert({ worker_id: workerId, descriptor: descriptor as any, source });
  if (error) throw error;
}

export async function clearFaceEnrollments(workerId: string): Promise<void> {
  const { error } = await supabase.from("worker_face_enrollments").delete().eq("worker_id", workerId);
  if (error) throw error;
}

export type AttendanceInput = {
  workerId: string;
  supervisorId: string | null;
  kind: AttendanceKind;
  method: "face" | "manual";
  matchDistance?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  storagePath?: string | null;
};

export async function recordAttendance(input: AttendanceInput) {
  const { data, error } = await supabase
    .from("attendance_events")
    .insert({
      worker_id: input.workerId,
      supervisor_id: input.supervisorId,
      kind: input.kind,
      method: input.method,
      match_distance: input.matchDistance ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      accuracy_m: input.accuracyM ?? null,
      storage_path: input.storagePath ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export type TodayEvent = {
  id: string; worker_id: string; kind: AttendanceKind; method: string;
  captured_at: string; match_distance: number | null; supervisor_id: string | null;
};

/** All of today's attendance events (across supervisors), newest first. */
export async function loadTodayAttendance(): Promise<TodayEvent[]> {
  const { data, error } = await supabase
    .from("attendance_events")
    .select("id,worker_id,kind,method,captured_at,match_distance,supervisor_id")
    .eq("work_date", todayStr())
    .order("captured_at", { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}
