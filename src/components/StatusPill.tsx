import { cn } from "@/lib/utils";

export type StatusKind = "selected" | "assigned" | "working" | "done" | "notask" | "photos" | "ended" | "carryover" | "warn";

const map: Record<StatusKind, { bg: string; text: string; ring: string; label: string }> = {
  selected:  { bg: "bg-status-selected/10",  text: "text-status-selected",  ring: "ring-status-selected/30",  label: "Selected" },
  assigned:  { bg: "bg-status-assigned/15",  text: "text-status-assigned",  ring: "ring-status-assigned/40",  label: "Assigned" },
  working:   { bg: "bg-status-working/15",   text: "text-status-working",   ring: "ring-status-working/40",   label: "Working" },
  done:      { bg: "bg-status-done/15",      text: "text-status-done",      ring: "ring-status-done/40",      label: "Done" },
  notask:    { bg: "bg-status-notask/10",    text: "text-status-notask",    ring: "ring-status-notask/30",    label: "No task" },
  photos:    { bg: "bg-status-photos/15",    text: "text-status-photos",    ring: "ring-status-photos/40",    label: "Photos" },
  ended:     { bg: "bg-status-ended/15",     text: "text-status-ended",     ring: "ring-status-ended/40",     label: "Day Ended" },
  carryover: { bg: "bg-status-carryover/15", text: "text-status-carryover", ring: "ring-status-carryover/40", label: "Carry-over" },
  warn:      { bg: "bg-status-warn/15",      text: "text-status-warn",      ring: "ring-status-warn/40",      label: "Warn" },
};

export function StatusPill({ status, children, className }: { status: StatusKind; children?: React.ReactNode; className?: string }) {
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", m.bg, m.text, m.ring, className)}>
      {children ?? m.label}
    </span>
  );
}

export function statusBorderClass(status: StatusKind) {
  return {
    selected: "border-l-status-selected",
    assigned: "border-l-status-assigned",
    working: "border-l-status-working",
    done: "border-l-status-done",
    notask: "border-l-status-notask",
    photos: "border-l-status-photos",
    ended: "border-l-status-ended",
    carryover: "border-l-status-carryover",
    warn: "border-l-status-warn",
  }[status];
}
