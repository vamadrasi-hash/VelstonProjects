import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { L, tx } from "@/components/BilingualLabel";
import { CameraCapture, type Capture } from "@/components/CameraCapture";
import { Camera, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { expandSeats } from "./_expand";

type Assign = {
  id: string;
  line_item_id: string;
  area_id: string | null;
  site_assignment_id: string | null;
  po_line_items: { description: string; uom: string } | null;
};
type Photo = {
  id: string;
  line_item_id: string | null;
  site_id: string | null;
  kind: "before" | "after";
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  captured_at: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Photos() {
  const { supervisorId, user } = useRole();
  const [assigns, setAssigns] = useState<Assign[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [saSite, setSaSite] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");

  const load = async () => {
    if (!supervisorId) return;
    const [{ data: a }, { data: sas }, { data: ars }, { data: stm }, { data: ph }] = await Promise.all([
      supabase.from("line_item_assignments")
        .select("id,line_item_id,area_id,site_assignment_id,assignment_no,parent_assignment_no,quantity,po_line_items(description,uom)")
        .eq("supervisor_id", supervisorId)
        .is("released_at", null),
      supabase.from("site_assignments").select("id,site_id,area_id"),
      supabase.from("areas").select("id,name"),
      supabase.from("sites").select("id,name"),
      supabase.from("work_photos").select("*").eq("supervisor_id", supervisorId).order("captured_at", { ascending: false }),
    ]);
    const expanded = await expandSeats(((a as any) || []) as any);
    setAssigns(expanded as any);
    const sa: Record<string, string> = {};
    ((sas as any) || []).forEach((s: any) => (sa[s.id] = s.area_id || s.site_id || ""));
    setSaSite(sa);
    const sn: Record<string, string> = {};
    ((ars as any) || []).forEach((s: any) => (sn[s.id] = s.name));
    ((stm as any) || []).forEach((s: any) => { if (!sn[s.id]) sn[s.id] = s.name; });
    setSiteNames(sn);
    setPhotos((ph as any) || []);
    // signed URLs for thumbnails
    const paths = ((ph as any) || []).map((p: any) => p.storage_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("work-photos").createSignedUrls(paths, 60 * 60);
      const m: Record<string, string> = {};
      (signed || []).forEach((s: any, i: number) => { if (s.signedUrl) m[paths[i]] = s.signedUrl; });
      setThumbs(m);
    } else setThumbs({});
  };
  useEffect(() => { load(); }, [supervisorId]);

  const siteOf = (a: Assign) => a.area_id || (a.site_assignment_id ? saSite[a.site_assignment_id] : null);
  const sName = (id: string | null) => (id ? (siteNames[id] || "—") : "Unassigned");

  const grouped = useMemo(() => {
    const m = new Map<string, Assign[]>();
    assigns.forEach((a) => {
      const k = siteOf(a) || "__none";
      m.set(k, [...(m.get(k) || []), a]);
    });
    return Array.from(m.entries())
      .filter(([k]) => siteFilter === "all" || k === siteFilter)
      .map(([k, list]) => ({ key: k, name: sName(k === "__none" ? null : k), list }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assigns, saSite, siteNames, siteFilter]);

  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    assigns.forEach((a) => {
      const k = siteOf(a) || "__none";
      m.set(k, sName(k === "__none" ? null : k));
    });
    return Array.from(m.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [assigns, saSite, siteNames]);

  const photosFor = (lid: string, kind: "before" | "after") =>
    photos.filter((p) => p.line_item_id === lid && p.kind === kind && p.captured_at.slice(0, 10) === today());

  const upload = async (a: Assign, kind: "before" | "after", c: Capture) => {
    if (!supervisorId || !user) return;
    const siteId = siteOf(a);
    const day = today();
    // Enforce strict 1 photo per (sup, line_item, kind, day): remove existing first.
    const { data: existing } = await supabase.from("work_photos")
      .select("id,storage_path")
      .eq("supervisor_id", supervisorId)
      .eq("line_item_id", a.line_item_id)
      .eq("kind", kind)
      .eq("work_date", day);
    const oldPaths = (existing || []).map((x: any) => x.storage_path);
    const oldIds = (existing || []).map((x: any) => x.id);
    if (oldPaths.length) await supabase.storage.from("work-photos").remove(oldPaths);
    if (oldIds.length) await supabase.from("work_photos").delete().in("id", oldIds);

    const path = `${user.id}/${siteId || "no-site"}/${a.line_item_id}/${kind}/${Date.now()}.jpg`;
    const t0 = performance.now();
    const { error: upErr } = await supabase.storage.from("work-photos").upload(path, c.blob, {
      contentType: "image/jpeg", upsert: false, cacheControl: "3600",
    });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: inserted, error: insErr } = await supabase.from("work_photos").insert({
      supervisor_id: supervisorId,
      site_id: siteId,
      line_item_id: a.line_item_id,
      kind,
      work_date: day,
      storage_path: path,
      latitude: c.latitude,
      longitude: c.longitude,
      accuracy_m: c.accuracyM,
      captured_at: c.capturedAt,
    }).select().single();
    if (insErr) { toast.error(insErr.message); return; }
    const { data: signed } = await supabase.storage.from("work-photos").createSignedUrl(path, 60 * 60);
    if (signed?.signedUrl) setThumbs((m) => ({ ...m, [path]: signed.signedUrl }));
    setPhotos((p) => [inserted as any, ...p.filter((x) => !oldIds.includes(x.id))]);
    const ms = Math.round(performance.now() - t0);
    toast.success(`${tx("photo_uploaded")} (${(c.blob.size / 1024).toFixed(0)}KB · ${ms}ms)`);
  };

  const deletePhoto = async (p: Photo) => {
    if (!confirm("Delete this photo?")) return;
    await supabase.storage.from("work-photos").remove([p.storage_path]);
    await supabase.from("work_photos").delete().eq("id", p.id);
    setPhotos((list) => list.filter((x) => x.id !== p.id));
  };

  if (!supervisorId) {
    return <Card className="p-6 text-center text-muted-foreground text-sm"><L k="pick_supervisor" /></Card>;
  }

  return (
    <div className="space-y-3 pb-24">
      <Card className="p-3 flex items-center gap-2">
        <Camera className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold"><L k="photos" layout="inline" /></div>
          <div className="text-xs text-muted-foreground">Geo-tagged before / after photos</div>
        </div>
      </Card>

      <Card className="p-3">
        <div className="text-xs text-muted-foreground mb-1"><L k="site" oneLine /></div>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx("all_sites")}</SelectItem>
            {siteOptions.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {grouped.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm"><L k="no_assignments" /></Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {grouped.map((g) => (
            <AccordionItem key={g.key} value={g.key} className="border rounded-md bg-card">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex items-center gap-2 w-full pr-2 min-w-0">
                  <Badge variant="default" className="text-sm shrink-0">📍 {g.name}</Badge>
                  <span className="text-xs text-muted-foreground">{g.list.length} task(s)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2 space-y-2">
                {g.list.map((a) => {
                  const before = photosFor(a.line_item_id, "before");
                  const after = photosFor(a.line_item_id, "after");
                  return (
                    <Card key={a.id} className="p-3 space-y-3">
                      <div className="font-semibold leading-snug text-sm break-words">
                        {a.po_line_items?.description || "—"}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <PhotoSlot
                          kind="before" photos={before} thumbs={thumbs}
                          onCapture={(c) => upload(a, "before", c)}
                          onDelete={deletePhoto}
                        />
                        <PhotoSlot
                          kind="after" photos={after} thumbs={thumbs}
                          onCapture={(c) => upload(a, "after", c)}
                          onDelete={deletePhoto}
                        />
                      </div>
                    </Card>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function PhotoSlot({
  kind, photos, thumbs, onCapture, onDelete,
}: {
  kind: "before" | "after";
  photos: Photo[];
  thumbs: Record<string, string>;
  onCapture: (c: Capture) => void | Promise<void>;
  onDelete: (p: Photo) => void;
}) {
  const shortLabel = kind === "before" ? "📷 Before / પહેલા" : "📷 After / પછી";
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase font-medium text-muted-foreground">
        <L k={kind} oneLine /> ({photos.length})
      </div>
      <CameraCapture compact label={shortLabel} onCaptured={onCapture} />
      <div className="grid grid-cols-2 gap-1">
        {photos.map((p) => (
          <div key={p.id} className="relative group">
            {thumbs[p.storage_path] ? (
              <a href={thumbs[p.storage_path]} target="_blank" rel="noreferrer">
                <img src={thumbs[p.storage_path]} alt="" className="w-full h-24 object-cover rounded border" />
              </a>
            ) : (
              <div className="w-full h-24 rounded border bg-muted" />
            )}
            <div className="absolute top-0.5 left-0.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold leading-tight">
              {new Date(p.captured_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
            {p.latitude != null && p.longitude != null ? (
              <a
                href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}
                target="_blank" rel="noreferrer"
                className="absolute bottom-0.5 left-0.5 right-7 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 truncate hover:bg-black/85"
                onClick={(e) => e.stopPropagation()}
              >
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · ±{(p.accuracy_m || 0).toFixed(0)}m · Map</span>
              </a>
            ) : (
              <div className="absolute bottom-0.5 left-0.5 bg-destructive text-destructive-foreground text-[9px] px-1 rounded">no GPS</div>
            )}
            <Button
              type="button" size="icon" variant="destructive"
              className="absolute top-0.5 right-0.5 h-6 w-6 shadow"
              onClick={() => onDelete(p)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {photos.length === 0 && (
          <div className="col-span-2 text-[11px] text-muted-foreground text-center py-2">
            <L k="no_photos_yet" oneLine />
          </div>
        )}
      </div>
    </div>
  );
}
