import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AssignmentBadge } from "@/components/AssignmentBadge";
import { ArrowUpDown, ExternalLink, Download, FileSpreadsheet, FileText, FileType2, Pencil, Trash2, LogOut, UserPlus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { pct } from "@/lib/progress";
import { daysAgoLabel } from "@/lib/dates";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  // Seat = one row per (site_assignment, supervisor)
  seat_ids: string[];              // all line_item_assignments rows belonging to the seat
  assignment_no: string | null;
  po_id: string;
  po_number: string | null;
  client_name: string;
  work_order: string;
  work_order_id: string | null;
  site: string;
  site_id: string | null;              // areas.id (used for release RPC)
  site_assignment_id: string;
  supervisor_id: string;
  supervisor_name: string;
  co_supervisors: string[];            // other supervisor names on the same site
  co_supervisor_ids: string[];         // ids of other supervisors on this site
  is_primary: boolean;
  primary_name: string | null;
  assigned_date: string;
  active_workers: number;              // live worker count for this seat
  done: number;                        // sum(work_done) for whole site
  target: number;                      // sum(site_assignment_items.quantity) for whole site
  wages: number;                       // wages this supervisor booked on this site
  started_date: string | null;
  last_date: string | null;
};

type SortKey =
  | "assigned_date" | "po_number" | "assignment_no"
  | "supervisor_name" | "client_name" | "progress" | "wages" | "active_workers";

export default function Assignments() {
  const { supervisors } = useRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [pastRows, setPastRows] = useState<Array<{ id: string; supervisor_name: string; site: string; work_order: string; client_name: string; po_number: string | null; assigned_date: string; released_at: string; replaced_by_name: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [supFilter, setSupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "assigned_date", dir: "desc" });
  const [poDialog, setPoDialog] = useState<string | null>(null);
  const [manageFor, setManageFor] = useState<Row | null>(null);
  const [manageMode, setManageMode] = useState<"add" | "handover" | "release" | "promote">("release");
  const [replaceId, setReplaceId] = useState<string>("");
  const [addSupId, setAddSupId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const navigate = useNavigate();

  const [promoteId, setPromoteId] = useState<string>("");

  const openManage = (r: Row, mode: "add" | "handover" | "release" | "promote") => {
    setManageFor(r); setManageMode(mode as any); setReplaceId(""); setAddSupId(""); setPromoteId("");
  };

  const doManage = async () => {
    if (!manageFor) return;
    setBusy(true);
    try {
      if (manageMode === "release") {
        if (!manageFor.site_id) { toast.error("Missing site id"); return; }

        // Release a PRIMARY supervisor
        if (manageFor.is_primary) {
          const others = manageFor.co_supervisor_ids;
          if (others.length === 0) {
            // No one else — only allowed if no active workers
            if (manageFor.active_workers > 0) {
              toast.error("Add another supervisor first, then hand-over.");
              return;
            }
            const { error } = await supabase.rpc("release_supervisor_from_site" as any, {
              _area_id: manageFor.site_id,
              _supervisor_id: manageFor.supervisor_id,
              _replacement_id: null,
            });
            if (error) { toast.error(error.message); return; }
            toast.success("Released — site is now unassigned");
          } else {
            // Promote another supervisor and release the outgoing primary
            const chosen = others.length === 1 ? others[0] : promoteId;
            if (!chosen) { toast.error("Pick the new Primary"); return; }
            // Promote first
            const { error: pErr } = await supabase.rpc("set_primary_supervisor" as any, {
              _site_assignment_id: manageFor.site_assignment_id,
              _supervisor_id: chosen,
            });
            if (pErr) { toast.error(pErr.message); return; }
            // Then release with the chosen as replacement (transfers workers)
            const { error } = await supabase.rpc("release_supervisor_from_site" as any, {
              _area_id: manageFor.site_id,
              _supervisor_id: manageFor.supervisor_id,
              _replacement_id: chosen,
            });
            if (error) { toast.error(error.message); return; }
            toast.success("Released and promoted new Primary");
          }
        } else {
          // Releasing a secondary
          if (manageFor.active_workers > 0) {
            toast.error(`${manageFor.supervisor_name} still has ${manageFor.active_workers} worker(s).`);
            return;
          }
          const { error } = await supabase.rpc("release_supervisor_from_site" as any, {
            _area_id: manageFor.site_id,
            _supervisor_id: manageFor.supervisor_id,
            _replacement_id: null,
          });
          if (error) { toast.error(error.message); return; }
          toast.success("Released");
        }
      } else if (manageMode === "handover") {
        if (!replaceId) { toast.error("Pick replacement supervisor"); return; }
        if (!manageFor.site_id) { toast.error("Missing site id"); return; }
        const { error } = await supabase.rpc("release_supervisor_from_site" as any, {
          _area_id: manageFor.site_id,
          _supervisor_id: manageFor.supervisor_id,
          _replacement_id: replaceId,
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Handed over");
      } else if (manageMode === "add") {
        if (!addSupId) { toast.error("Pick a supervisor"); return; }
        const { error } = await supabase.rpc("add_supervisor_to_site" as any, {
          _site_assignment_id: manageFor.site_assignment_id,
          _supervisor_id: addSupId,
          _assigned_date: new Date().toISOString().slice(0, 10),
        });
        if (error) { toast.error(error.message); return; }
        toast.success("Supervisor added");
      } else if ((manageMode as any) === "promote") {
        const { error } = await supabase.rpc("set_primary_supervisor" as any, {
          _site_assignment_id: manageFor.site_assignment_id,
          _supervisor_id: manageFor.supervisor_id,
        });
        if (error) { toast.error(error.message); return; }
        toast.success(`${manageFor.supervisor_name} is now Primary`);
      }
      setManageFor(null); setReplaceId(""); setAddSupId(""); setPromoteId("");
      setReloadTick((t) => t + 1);
    } finally { setBusy(false); }
  };


  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: items }, { data: pos }, { data: logs }, { data: areas }, { data: sas }, { data: sais }, { data: sts }, { data: ws }] = await Promise.all([
        supabase.from("line_item_assignments")
          .select("id,assignment_no,line_item_id,supervisor_id,quantity,assigned_date,area_id,site_assignment_id,released_at,released_by,replaced_by_supervisor_id"),
        supabase.from("po_line_items").select("id,description,uom,quantity,po_id"),
        supabase.from("purchase_orders").select("id,po_number,client_name,site,site_id"),
        supabase.from("daily_logs").select("line_item_id,supervisor_id,work_done,total_wages,worker_id,date"),
        supabase.from("areas").select("id,name,site_id"),
        supabase.from("site_assignments").select("id,po_id,site_id,area_id,primary_supervisor_id"),
        supabase.from("site_assignment_items").select("site_assignment_id,po_line_item_id,quantity"),
        supabase.from("sites").select("id,name"),
        supabase.from("workers").select("id,daily_rate,is_busy,current_supervisor_id,current_area_id"),
      ]);
      const rateMap: Record<string, number> = {};
      (ws || []).forEach((w: any) => (rateMap[w.id] = Number(w.daily_rate) || 0));

      const itemMap = new Map<string, any>();
      (items || []).forEach((i: any) => itemMap.set(i.id, i));
      const poMap = new Map<string, any>();
      (pos || []).forEach((p: any) => poMap.set(p.id, p));
      const supMap = new Map<string, string>();
      supervisors.forEach((s) => supMap.set(s.id, s.name));
      const areaMap = new Map<string, { name: string; site_id: string }>();
      (areas || []).forEach((ar: any) => areaMap.set(ar.id, { name: ar.name, site_id: ar.site_id }));
      const siteMap = new Map<string, string>();
      (sts || []).forEach((s: any) => siteMap.set(s.id, s.name));
      // saMap returns the resolved "site" name+id for an SA — prefer area, fall back to legacy site.
      const saMap = new Map<string, { id: string; name: string; po_id: string; primary_id: string | null }>();
      (sas || []).forEach((s: any) => {
        if (s.area_id && areaMap.has(s.area_id)) {
          saMap.set(s.id, { id: s.area_id, name: areaMap.get(s.area_id)!.name, po_id: s.po_id, primary_id: s.primary_supervisor_id || null });
        } else if (s.site_id) {
          saMap.set(s.id, { id: s.site_id, name: siteMap.get(s.site_id) || "—", po_id: s.po_id, primary_id: s.primary_supervisor_id || null });
        }
      });

      // Per-site targets from stage-1 items
      const saTargets = new Map<string, number>();
      const saLineIds = new Map<string, Set<string>>();
      (sais || []).forEach((r: any) => {
        saTargets.set(r.site_assignment_id, (saTargets.get(r.site_assignment_id) || 0) + Number(r.quantity || 0));
        let s = saLineIds.get(r.site_assignment_id);
        if (!s) { s = new Set<string>(); saLineIds.set(r.site_assignment_id, s); }
        s.add(r.po_line_item_id);
      });

      // Per-site done (sum of daily_logs.work_done for line items in that SA)
      const saDone = new Map<string, number>();
      (logs || []).forEach((l: any) => {
        if (!l.line_item_id) return;
        saLineIds.forEach((setLines, saId) => {
          if (setLines.has(l.line_item_id)) {
            saDone.set(saId, (saDone.get(saId) || 0) + Number(l.work_done || 0));
          }
        });
      });

      // Wages per (SA, supervisor) — approximate by summing logs for lines under SA authored by supervisor
      const wagesMap = new Map<string, number>();       // key: saId|supId
      const startMap = new Map<string, string>();
      const lastMap = new Map<string, string>();
      (logs || []).forEach((l: any) => {
        if (!l.line_item_id || !l.supervisor_id) return;
        saLineIds.forEach((setLines, saId) => {
          if (setLines.has(l.line_item_id)) {
            const k = `${saId}|${l.supervisor_id}`;
            const rs = Number(l.total_wages || 0) * (rateMap[l.worker_id] || 0);
            wagesMap.set(k, (wagesMap.get(k) || 0) + rs);
            const d = l.date as string | undefined;
            if (d) {
              if (!startMap.get(k) || d < startMap.get(k)!) startMap.set(k, d);
              if (!lastMap.get(k) || d > lastMap.get(k)!) lastMap.set(k, d);
            }
          }
        });
      });

      // Active workers per (area_id, supervisor_id)
      const activeMap = new Map<string, number>();
      (ws || []).forEach((w: any) => {
        if (!w.is_busy || !w.current_area_id || !w.current_supervisor_id) return;
        const k = `${w.current_area_id}|${w.current_supervisor_id}`;
        activeMap.set(k, (activeMap.get(k) || 0) + 1);
      });

      // Collapse LIAs to seats
      type SeatKey = string; // saId|supId
      const seatData = new Map<SeatKey, {
        row: any; saId: string; supId: string;
        earliestDate: string;
      }>();
      const seatSupsBySA = new Map<string, Set<string>>();
      const activeA = (a || []).filter((x: any) => !x.released_at);
      const releasedA = (a || []).filter((x: any) => x.released_at);
      activeA.forEach((x: any) => {
        if (!x.site_assignment_id) return;
        const k = `${x.site_assignment_id}|${x.supervisor_id}`;
        const cur = seatData.get(k);
        const d = x.assigned_date || "";
        if (!cur) {
          seatData.set(k, { row: x, saId: x.site_assignment_id, supId: x.supervisor_id, earliestDate: d });
        } else if (d && (!cur.earliestDate || d < cur.earliestDate)) {
          cur.earliestDate = d; cur.row = x;
        }
        let s = seatSupsBySA.get(x.site_assignment_id);
        if (!s) { s = new Set<string>(); seatSupsBySA.set(x.site_assignment_id, s); }
        s.add(x.supervisor_id);
      });

      const seatIdsByKey = new Map<string, string[]>();
      activeA.forEach((x: any) => {
        if (!x.site_assignment_id) return;
        const k = `${x.site_assignment_id}|${x.supervisor_id}`;
        const arr = seatIdsByKey.get(k) || [];
        arr.push(x.id);
        seatIdsByKey.set(k, arr);
      });

      const built: Row[] = Array.from(seatData.values()).map(({ row, saId, supId, earliestDate }) => {
        const sa = saMap.get(saId);
        const po = sa ? poMap.get(sa.po_id) : null;
        const wk = `${saId}|${supId}`;
        const otherIds = Array.from(seatSupsBySA.get(saId) || []).filter((s) => s !== supId);
        const others = otherIds.map((s) => supMap.get(s) || "—");
        const primaryId = sa?.primary_id || null;
        return {
          seat_ids: seatIdsByKey.get(wk) || [row.id],
          assignment_no: row.assignment_no,
          po_id: po?.id || "",
          po_number: po?.po_number || null,
          client_name: po?.client_name || "—",
          work_order: po?.site || "—",
          work_order_id: po?.site_id || null,
          site: sa?.name || "Unassigned",
          site_id: sa?.id || null,
          site_assignment_id: saId,
          supervisor_id: supId,
          supervisor_name: supMap.get(supId) || "—",
          co_supervisors: others,
          co_supervisor_ids: otherIds,
          is_primary: primaryId === supId,
          primary_name: primaryId ? (supMap.get(primaryId) || null) : null,
          assigned_date: earliestDate,
          active_workers: sa ? (activeMap.get(`${sa.id}|${supId}`) || 0) : 0,
          done: saDone.get(saId) || 0,
          target: saTargets.get(saId) || 0,
          wages: wagesMap.get(wk) || 0,
          started_date: startMap.get(wk) || null,
          last_date: lastMap.get(wk) || null,
        };
      });
      // Sort so primary appears first within each site
      built.sort((a, b) => {
        if (a.site_assignment_id === b.site_assignment_id) {
          return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
        }
        return 0;
      });
      setRows(built);

      // Build "past / released" list — one entry per released seat (SA + supervisor)
      const pastSeen = new Set<string>();
      const past: any[] = [];
      releasedA
        .slice()
        .sort((x: any, y: any) => (y.released_at || "").localeCompare(x.released_at || ""))
        .forEach((x: any) => {
          if (!x.site_assignment_id) return;
          const k = `${x.site_assignment_id}|${x.supervisor_id}|${x.released_at}`;
          if (pastSeen.has(k)) return;
          pastSeen.add(k);
          const sa = saMap.get(x.site_assignment_id);
          const po = sa ? poMap.get(sa.po_id) : null;
          past.push({
            id: x.id,
            supervisor_name: supMap.get(x.supervisor_id) || "—",
            site: sa?.name || "—",
            work_order: po?.site || "—",
            client_name: po?.client_name || "—",
            po_number: po?.po_number || null,
            assigned_date: x.assigned_date || "",
            released_at: x.released_at || "",
            replaced_by_name: x.replaced_by_supervisor_id ? (supMap.get(x.replaced_by_supervisor_id) || null) : null,
          });
        });
      setPastRows(past);

      setLoading(false);
    })();
  }, [supervisors, reloadTick]);

  // Work Order options come from PO work order
  const workOrderOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (!r.work_order_id) return;
      if (!m.has(r.work_order_id)) m.set(r.work_order_id, r.work_order);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (!r.site_id || r.site === "Unassigned") return;
      if (siteFilter !== "all" && r.work_order_id !== siteFilter) return;
      m.set(r.site_id, r.site);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, siteFilter]);

  useEffect(() => {
    if (areaFilter !== "all" && !siteOptions.some(([id]) => id === areaFilter)) {
      setAreaFilter("all");
    }
  }, [siteOptions, areaFilter]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (supFilter !== "all" && r.supervisor_id !== supFilter) return false;
      if (siteFilter !== "all" && r.work_order_id !== siteFilter) return false;
      if (areaFilter !== "all" && r.site_id !== areaFilter) return false;
      const p = r.target > 0 ? r.done / r.target : 0;
      if (statusFilter === "not_started" && r.done > 0) return false;
      if (statusFilter === "in_progress" && (r.done === 0 || p >= 1)) return false;
      if (statusFilter === "completed" && p < 1) return false;
      if (ql) {
        const hay = `${r.assignment_no} ${r.po_number} ${r.client_name} ${r.work_order} ${r.site} ${r.supervisor_name}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q, supFilter, siteFilter, areaFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      let av: any, bv: any;
      if (key === "progress") {
        av = a.target > 0 ? a.done / a.target : 0;
        bv = b.target > 0 ? b.done / b.target : 0;
      } else {
        av = (a as any)[key];
        bv = (b as any)[key];
      }
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
      return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

  const totals = useMemo(() => ({
    count: sorted.length,
    wages: sorted.reduce((s, r) => s + r.wages, 0),
    workers: sorted.reduce((s, r) => s + r.active_workers, 0),
  }), [sorted]);

  // ---------- Exports ----------
  const exportHeader = ["VEL #", "PO #", "Client", "Work Order", "Site", "Supervisor", "Co-supervisors", "Active workers", "Done", "Target", "Progress %", "Wages ₹", "Assigned", "Started", "Last"];
  const exportRows = () => sorted.map((r) => [
    r.assignment_no || "", r.po_number || "", r.client_name, r.work_order, r.site,
    r.supervisor_name, r.co_supervisors.join(", "),
    r.active_workers, r.done, r.target,
    r.target > 0 ? Number(((r.done / r.target) * 100).toFixed(1)) : 0,
    Math.round(r.wages), r.assigned_date,
    r.started_date || "", r.last_date || "",
  ]);
  const todayStamp = () => new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    const csv = [exportHeader, ...exportRows()]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `assignments_${todayStamp()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([exportHeader, ...exportRows()]);
    ws["!cols"] = exportHeader.map((h) => ({ wch: Math.max(10, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assignments");
    XLSX.writeFile(wb, `assignments_${todayStamp()}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Assignments Register", 40, 36);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}  ·  ${sorted.length} rows`, 40, 52);
    autoTable(doc, {
      head: [exportHeader],
      body: exportRows().map((r) => r.map((c) => String(c))),
      startY: 64,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        5: { cellWidth: 140 }, // Line Item
        2: { cellWidth: 70 },  // Client
        3: { cellWidth: 70 },  // Site
      },
    });
    doc.save(`assignments_${todayStamp()}.pdf`);
  };

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sort.key === k ? "text-primary" : "opacity-50"}`} />
    </button>
  );

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl font-semibold">Assignments Register</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportXlsx}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportPdf}>
              <FileType2 className="h-4 w-4 mr-2" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportCsv}>
              <FileText className="h-4 w-4 mr-2" /> CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="stage2">
        <div className="-mx-1 overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="stage1">Site assignments</TabsTrigger>
            <TabsTrigger value="stage2">Supervisor assignments</TabsTrigger>
            <TabsTrigger value="past">Past / Released {pastRows.length ? `(${pastRows.length})` : ""}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stage1" className="pt-2">
          <SiteAssignmentsTab />
        </TabsContent>

        <TabsContent value="stage2" className="space-y-3 pt-2">


      {/* Single-line filter bar (wraps gracefully on small screens) */}
      <Card className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-nowrap items-center gap-2">
        <Input
          placeholder="Search VEL, PO, item…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-full lg:flex-1 lg:min-w-[180px] sm:col-span-2 lg:col-span-1"
        />
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="h-9 w-full lg:w-[160px]"><SelectValue placeholder="Work Order" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work orders</SelectItem>
            {workOrderOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-9 w-full lg:w-[150px]"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {siteOptions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supFilter} onValueChange={setSupFilter}>
          <SelectTrigger className="h-9 w-full lg:w-[160px]"><SelectValue placeholder="Supervisor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All supervisors</SelectItem>
            {supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full lg:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_started">Not started</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </Card>


      {(() => {
        // Group seats by site_assignment so each site renders as one row.
        const groups = new Map<string, Row[]>();
        sorted.forEach((r) => {
          const arr = groups.get(r.site_assignment_id) || [];
          arr.push(r);
          groups.set(r.site_assignment_id, arr);
        });
        groups.forEach((arr) => arr.sort((a, b) =>
          (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.supervisor_name.localeCompare(b.supervisor_name)
        ));
        const groupList = Array.from(groups.values());
        const nSites = groupList.length;
        const nSeats = sorted.length;

        return (
          <>
            <Card className="p-3 space-y-2 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="secondary">Sites: {nSites}</Badge>
                <Badge variant="secondary">Seats: {nSeats}</Badge>
                <Badge>Active workers: {totals.workers}</Badge>
                <Badge>Total Wages ₹{totals.wages.toFixed(0)}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                One row per site. All supervisors on a site appear together.
              </div>
            </Card>

            {/* Desktop: table */}
            <Card className="p-0 overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><SortBtn k="po_number">PO #</SortBtn></TableHead>
                    <TableHead><SortBtn k="client_name">Client / Work Order</SortBtn></TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Supervisors</TableHead>
                    <TableHead className="text-right">Workers</TableHead>
                    <TableHead className="w-44"><SortBtn k="progress">Site progress</SortBtn></TableHead>
                    <TableHead className="text-right"><SortBtn k="wages">Wages ₹</SortBtn></TableHead>
                    <TableHead><SortBtn k="assigned_date">Activity</SortBtn></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                  ) : nSites === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No supervisor seats.</TableCell></TableRow>
                  ) : groupList.map((seats) => {
                    const head = seats[0];
                    const primary = seats.find((s) => s.is_primary) || head;
                    const p = head.target > 0 ? (head.done / head.target) * 100 : 0;
                    const totalWorkers = seats.reduce((s, x) => s + x.active_workers, 0);
                    const totalWages = seats.reduce((s, x) => s + x.wages, 0);
                    const earliest = seats.map((s) => s.assigned_date).filter(Boolean).sort()[0] || head.assigned_date;
                    return (
                      <TableRow key={head.site_assignment_id} className="align-top">
                        <TableCell>
                          <button onClick={() => setPoDialog(head.po_id)} className="text-primary font-medium hover:underline">
                            {head.po_number || "(no #)"}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium truncate max-w-[180px]" title={head.client_name}>{head.client_name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={head.work_order}>WO: {head.work_order}</div>
                        </TableCell>
                        <TableCell>
                          <div className="truncate max-w-[180px]" title={head.site}>📍 {head.site}</div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5 min-w-[260px]">
                            {seats.map((s) => (
                              <div key={s.supervisor_id} className={`flex items-center gap-1.5 flex-wrap border-l-2 pl-2 py-0.5 ${s.is_primary ? "border-l-role-primary" : "border-l-role-assist"}`}>
                                <span className="font-medium text-sm">{s.supervisor_name}</span>
                                {s.is_primary
                                  ? <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
                                  : <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0">Assist</Badge>}
                                <span className="text-[11px] text-muted-foreground">
                                  · {s.active_workers}w{s.wages > 0 ? ` · ₹${s.wages.toFixed(0)}` : ""}
                                </span>
                                <div className="ml-auto flex gap-1">
                                  {!s.is_primary && (
                                    <Button size="sm" variant="ghost" className="h-6 px-2 text-role-primary" onClick={() => openManage(s, "promote")} title="Make Primary">★</Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => openManage(s, "release")} title="Release">
                                    <LogOut className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {totalWorkers > 0
                            ? <Badge className="bg-state-working hover:bg-state-working text-white">{totalWorkers}</Badge>
                            : <span className="text-xs text-muted-foreground">none</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct(head.done, head.target)} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{p.toFixed(0)}%</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">{head.done} / {head.target}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap font-medium text-tone-money">
                          {totalWages > 0 ? `₹${totalWages.toFixed(0)}` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>Assigned: {earliest} <span className="text-muted-foreground">({daysAgoLabel(earliest)})</span></div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => openManage(primary, "add")}>
                            <UserPlus className="h-4 w-4 mr-1" /> Add
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: card list — one card per site */}
            <div className="md:hidden space-y-2">
              {loading ? (
                <Card className="p-6 text-center text-muted-foreground text-sm">Loading…</Card>
              ) : nSites === 0 ? (
                <Card className="p-6 text-center text-muted-foreground text-sm">No supervisor seats.</Card>
              ) : groupList.map((seats) => {
                const head = seats[0];
                const primary = seats.find((s) => s.is_primary) || head;
                const p = head.target > 0 ? (head.done / head.target) * 100 : 0;
                const totalWorkers = seats.reduce((s, x) => s + x.active_workers, 0);
                const totalWages = seats.reduce((s, x) => s + x.wages, 0);
                return (
                  <Card key={head.site_assignment_id} className="p-3 space-y-2 text-sm border-l-4 border-l-role-primary">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => setPoDialog(head.po_id)} className="text-primary font-medium hover:underline text-sm">
                        PO {head.po_number || "(no #)"}
                      </button>
                      {totalWages > 0 && <span className="text-xs font-medium whitespace-nowrap text-tone-money">₹{totalWages.toFixed(0)}</span>}
                    </div>

                    <div className="min-w-0">
                      <div className="font-medium break-words">{head.client_name}</div>
                      <div className="text-xs text-muted-foreground break-words">WO: {head.work_order}</div>
                      <div className="text-xs text-muted-foreground break-words">📍 {head.site}</div>
                    </div>

                    <div className="border-t pt-2">
                      <div className="flex items-center gap-2">
                        <Progress value={pct(head.done, head.target)} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {head.done}/{head.target} · {p.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    <div className="border-t pt-2 space-y-1.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Supervisors · {totalWorkers} worker{totalWorkers === 1 ? "" : "s"}
                      </div>
                      {seats.map((s) => (
                        <div key={s.supervisor_id} className={`rounded border-l-2 pl-2 py-1 ${s.is_primary ? "border-l-role-primary bg-role-primary/5" : "border-l-role-assist bg-role-assist/5"}`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium break-words">👷 {s.supervisor_name}</span>
                            {s.is_primary
                              ? <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
                              : <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0">Assist</Badge>}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.active_workers} worker{s.active_workers === 1 ? "" : "s"}
                            {s.wages > 0 && <> · ₹{s.wages.toFixed(0)}</>}
                          </div>
                          <div className={`grid gap-1 pt-1 ${!s.is_primary ? "grid-cols-2" : "grid-cols-1"}`}>
                            {!s.is_primary && (
                              <Button size="sm" variant="outline" className="h-7 border-role-primary text-role-primary" onClick={() => openManage(s, "promote")}>
                                ★ Make Primary
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => openManage(s, "release")}>
                              <LogOut className="h-3.5 w-3.5 mr-1" /> Release
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-2">
                      <Button size="sm" variant="outline" className="w-full" onClick={() => openManage(primary, "add")}>
                        <UserPlus className="h-4 w-4 mr-1" /> Add assisting supervisor
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        );
      })()}


        </TabsContent>

        <TabsContent value="past" className="pt-2">
          {pastRows.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No released assignments yet.</Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Released</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Work Order</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>PO #</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Handed over to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastRows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap text-xs">{p.released_at ? new Date(p.released_at).toLocaleString() : "—"}</TableCell>
                        <TableCell className="font-medium">{p.supervisor_name}</TableCell>
                        <TableCell className="max-w-[180px] break-words">{p.site}</TableCell>
                        <TableCell className="max-w-[180px] break-words">{p.work_order}</TableCell>
                        <TableCell className="max-w-[160px] break-words">{p.client_name}</TableCell>
                        <TableCell className="text-xs">{p.po_number || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{p.assigned_date || "—"}</TableCell>
                        <TableCell>{p.replaced_by_name ? <Badge variant="secondary">{p.replaced_by_name}</Badge> : <span className="text-xs text-muted-foreground">— (released)</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {pastRows.map((p) => (
                  <div key={p.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm break-words">{p.supervisor_name}</div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{p.released_at ? new Date(p.released_at).toLocaleDateString() : "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground break-words">📍 {p.site} · {p.work_order}</div>
                    <div className="text-xs break-words">{p.client_name} {p.po_number ? `· ${p.po_number}` : ""}</div>
                    <div className="text-xs">
                      {p.replaced_by_name ? <>Handed over to <Badge variant="secondary" className="ml-1">{p.replaced_by_name}</Badge></> : <span className="text-muted-foreground">Released — no successor</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PoDetailDialog poId={poDialog} onClose={() => setPoDialog(null)} />

      {/* Unified Manage dialog: Add / Hand-over / Release */}
      <Dialog open={!!manageFor} onOpenChange={(o) => { if (!o) { setManageFor(null); setReplaceId(""); setAddSupId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">
              {manageMode === "add" ? "Add assisting supervisor"
                : manageMode === "handover" ? "Hand over site to another supervisor"
                : manageMode === "promote" ? "Make this supervisor Primary"
                : "Release supervisor from site"}
            </DialogTitle>
          </DialogHeader>
          {manageFor && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-2.5 bg-muted/40 space-y-0.5 break-words">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground text-xs">Site:</span> <b>{manageFor.site}</b>
                </div>
                <div className="text-xs text-muted-foreground">
                  {manageFor.client_name} · WO: {manageFor.work_order} · PO {manageFor.po_number || "—"}
                </div>
                <div className="text-xs flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-muted-foreground">Selected:</span>
                  <b>{manageFor.supervisor_name}</b>
                  {manageFor.is_primary
                    ? <Badge className="bg-role-primary hover:bg-role-primary text-white text-[10px] px-1.5 py-0">PRIMARY</Badge>
                    : <Badge variant="outline" className="border-role-assist text-role-assist text-[10px] px-1.5 py-0">Assist</Badge>}
                </div>
                {manageFor.co_supervisors.length > 0 && (
                  <div className="text-xs text-muted-foreground">Also on site: {manageFor.co_supervisors.join(", ")}</div>
                )}
                <div className="text-xs">Active workers under this supervisor: <b>{manageFor.active_workers}</b></div>
              </div>

              {manageMode === "add" && (
                <div>
                  <Label className="text-xs">Assisting supervisor</Label>
                  <Select value={addSupId} onValueChange={setAddSupId}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick supervisor…" /></SelectTrigger>
                    <SelectContent>
                      {supervisors
                        .filter((s) => s.id !== manageFor.supervisor_id && !manageFor.co_supervisor_ids.includes(s.id))
                        .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Assist works alongside the Primary. Only the Primary can pick workers, enter wages and file reports.
                  </p>
                </div>
              )}

              {manageMode === "handover" && (
                <div>
                  <Label className="text-xs">New supervisor</Label>
                  <Select value={replaceId} onValueChange={setReplaceId}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick replacement…" /></SelectTrigger>
                    <SelectContent>
                      {supervisors.filter((s) => s.id !== manageFor.supervisor_id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {manageFor.active_workers} worker(s) under {manageFor.supervisor_name} will auto-transfer to the new supervisor.
                  </p>
                </div>
              )}

              {manageMode === "promote" && (
                <div className="text-xs text-muted-foreground">
                  <b>{manageFor.supervisor_name}</b> will become the Primary of this site.
                  {manageFor.primary_name && <> The current Primary ({manageFor.primary_name}) will move to Assist.</>}
                </div>
              )}

              {manageMode === "release" && (
                <div className="space-y-2 text-xs">
                  {!manageFor.is_primary ? (
                    manageFor.active_workers > 0 ? (
                      <div className="rounded-md border border-state-blocked/30 bg-state-blocked/10 p-2 text-state-blocked">
                        {manageFor.supervisor_name} still has {manageFor.active_workers} worker(s). Release workers first or use Hand-over.
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Assist will be removed from the site. Past logs are preserved.</div>
                    )
                  ) : manageFor.co_supervisor_ids.length === 0 ? (
                    manageFor.active_workers > 0 ? (
                      <div className="rounded-md border border-state-blocked/30 bg-state-blocked/10 p-2 text-state-blocked">
                        This is the only supervisor and there are {manageFor.active_workers} active worker(s).
                        Add an assisting supervisor first, then hand-over.
                      </div>
                    ) : (
                      <div className="text-muted-foreground">The site will become unassigned. Re-assign later from the Purchase Order.</div>
                    )
                  ) : manageFor.co_supervisor_ids.length === 1 ? (
                    <div className="rounded-md border p-2 bg-muted/30">
                      <b>{manageFor.co_supervisors[0]}</b> will be promoted to Primary and take over {manageFor.active_workers} worker(s).
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">Promote new Primary</Label>
                      <Select value={promoteId} onValueChange={setPromoteId}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick new Primary…" /></SelectTrigger>
                        <SelectContent>
                          {manageFor.co_supervisor_ids.map((id, i) => (
                            <SelectItem key={id} value={id}>{manageFor.co_supervisors[i]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Workers transfer to the new Primary automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageFor(null)} disabled={busy}>Cancel</Button>
            <Button
              onClick={doManage}
              disabled={
                busy ||
                (manageMode === "add" && !addSupId) ||
                (manageMode === "handover" && !replaceId) ||
                (manageMode === "release" && !manageFor?.is_primary && (manageFor?.active_workers ?? 0) > 0) ||
                (manageMode === "release" && !!manageFor?.is_primary && manageFor.co_supervisor_ids.length === 0 && (manageFor?.active_workers ?? 0) > 0) ||
                (manageMode === "release" && !!manageFor?.is_primary && manageFor.co_supervisor_ids.length > 1 && !promoteId)
              }
            >
              {busy ? "…" : manageMode === "add" ? "Add supervisor"
                : manageMode === "handover" ? "Hand over"
                : manageMode === "promote" ? "Make Primary"
                : "Release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ---------------- Stage 1 — Site Assignments Tab ----------------

type SiteAsg = {
  id: string;
  assignment_no: string | null;
  po_id: string;
  site_id: string;
  site_name: string;
  po_label: string;
  items: number;
  total_qty: number;
};

function SiteAssignmentsTab() {
  const [rows, setRows] = useState<SiteAsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: sa }, { data: items }, { data: pos }, { data: ar }, { data: ss }] = await Promise.all([
        supabase.from("site_assignments").select("id,assignment_no,po_id,site_id,area_id,created_at").order("created_at", { ascending: false }),
        supabase.from("site_assignment_items").select("site_assignment_id,quantity"),
        supabase.from("purchase_orders").select("id,po_number,client_name,site"),
        supabase.from("areas").select("id,name").order("name"),
        supabase.from("sites").select("id,name").order("name"),
      ]);
      const poMap = new Map<string, any>();
      (pos || []).forEach((p: any) => poMap.set(p.id, p));
      const areaMap = new Map<string, string>();
      (ar || []).forEach((a: any) => areaMap.set(a.id, a.name));
      const siteMap = new Map<string, string>();
      (ss || []).forEach((s: any) => siteMap.set(s.id, s.name));
      // Filter options come from areas (legacy sites included as fallback only when not migrated).
      setSites((ar || []) as any);
      const sums = new Map<string, { items: number; total_qty: number }>();
      (items || []).forEach((i: any) => {
        const s = sums.get(i.site_assignment_id) || { items: 0, total_qty: 0 };
        s.items += 1; s.total_qty += Number(i.quantity || 0);
        sums.set(i.site_assignment_id, s);
      });
      const built: SiteAsg[] = (sa || []).map((x: any) => {
        const po = poMap.get(x.po_id);
        const sm = sums.get(x.id) || { items: 0, total_qty: 0 };
        const resolvedName = (x.area_id && areaMap.get(x.area_id)) || (x.site_id && siteMap.get(x.site_id)) || "—";
        const resolvedId = x.area_id || x.site_id || "";
        return {
          id: x.id,
          assignment_no: x.assignment_no,
          po_id: x.po_id,
          site_id: resolvedId,
          site_name: resolvedName,
          po_label: po ? `${po.po_number || "(no #)"} · ${po.client_name} — ${po.site}` : "—",
          items: sm.items,
          total_qty: sm.total_qty,
        };
      });
      setRows(built);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (siteFilter !== "all" && r.site_id !== siteFilter) return false;
      if (ql) {
        const hay = `${r.assignment_no} ${r.site_name} ${r.po_label}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, q, siteFilter]);

  return (
    <div className="space-y-3">
      <Card className="p-2 flex flex-wrap items-center gap-2">
        <Input placeholder="Search VEL #, site, PO…" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-9 flex-1 min-w-[180px]" />
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>
      <Card className="p-3 flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">Stage 1 rows: {filtered.length}</Badge>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>VEL #</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Purchase Order</TableHead>
              <TableHead className="text-right">Line items</TableHead>
              <TableHead className="text-right">Total qty</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No site assignments.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell><AssignmentBadge no={r.assignment_no} size="md" /></TableCell>
                <TableCell>📍 {r.site_name}</TableCell>
                <TableCell className="text-sm">{r.po_label}</TableCell>
                <TableCell className="text-right">{r.items}</TableCell>
                <TableCell className="text-right">{r.total_qty}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/admin/purchase-orders/${r.po_id}/sites`}>Manage</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}


// ---------------- PO Detail Dialog ----------------

type DialogLine = {
  id: string; description: string; uom: string; quantity: number;
  assigned: number;
};

function PoDetailDialog({ poId, onClose }: { poId: string | null; onClose: () => void }) {
  const [po, setPo] = useState<any | null>(null);
  const [items, setItems] = useState<DialogLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!poId) { setPo(null); setItems([]); return; }
    setLoading(true);
    (async () => {
      const [{ data: p }, { data: lis }] = await Promise.all([
        supabase.from("purchase_orders").select("*").eq("id", poId).single(),
        supabase.from("po_line_items").select("id,description,uom,quantity").eq("po_id", poId),
      ]);
      const itemIds = (lis || []).map((i: any) => i.id);
      const { data: asgs } = itemIds.length
        ? await supabase.from("line_item_assignments").select("line_item_id,quantity").in("line_item_id", itemIds)
        : { data: [] as any[] };
      const aMap: Record<string, number> = {};
      (asgs || []).forEach((a: any) => {
        aMap[a.line_item_id] = (aMap[a.line_item_id] || 0) + Number(a.quantity || 0);
      });
      const built: DialogLine[] = (lis || []).map((i: any) => ({
        id: i.id,
        description: i.description,
        uom: i.uom,
        quantity: Number(i.quantity),
        assigned: aMap[i.id] || 0,
      }));
      setPo(p);
      setItems(built);
      setLoading(false);
    })();
  }, [poId]);

  const totals = useMemo(() => {
    const total = items.reduce((s, i) => s + i.quantity, 0);
    const assigned = items.reduce((s, i) => s + i.assigned, 0);
    return { total, assigned, remaining: total - assigned };
  }, [items]);

  const statusStyle = (i: DialogLine) => {
    const rem = i.quantity - i.assigned;
    if (i.assigned === 0) return "text-muted-foreground";
    if (rem < 0) return "text-orange-600 font-medium";
    if (rem === 0) return "text-emerald-600 font-medium";
    return "text-amber-600";
  };

  return (
    <Dialog open={!!poId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>PO {po?.po_number || "(no number)"}</DialogTitle>
        </DialogHeader>
        {loading || !po ? (
          <div className="text-muted-foreground text-sm py-4">Loading…</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Client:</span> <b>{po.client_name}</b></div>
              <div><span className="text-muted-foreground">Work Order:</span> <b>{po.site}</b></div>
              <div><span className="text-muted-foreground">Date:</span> {po.doc_date}</div>
              <div><span className="text-muted-foreground">Items:</span> {items.length}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Total Qty: {totals.total}</Badge>
              <Badge variant="secondary">Assigned: {totals.assigned}</Badge>
              <Badge variant={totals.remaining < 0 ? "destructive" : totals.remaining === 0 ? "default" : "outline"}>
                Remaining: {totals.remaining}
              </Badge>
            </div>
            <div className="border rounded max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>UoM</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Assigned</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const rem = i.quantity - i.assigned;
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="text-sm">{i.description}</TableCell>
                        <TableCell>{i.uom}</TableCell>
                        <TableCell className="text-right">{i.quantity}</TableCell>
                        <TableCell className="text-right">{i.assigned}</TableCell>
                        <TableCell className={`text-right ${statusStyle(i)}`}>{rem}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link to={`/admin/purchase-orders/${poId}`} onClick={onClose}>
              <ExternalLink className="h-4 w-4 mr-1" /> Open PO
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/admin/purchase-orders/${poId}/assign`} onClick={onClose}>
              <ExternalLink className="h-4 w-4 mr-1" /> Go to Assignments
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
