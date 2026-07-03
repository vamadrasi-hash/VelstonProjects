import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";

const items: { color: string; label: string; desc: string }[] = [
  { color: "bg-status-selected", label: "Selected",   desc: "Worker picked, no task yet" },
  { color: "bg-status-assigned", label: "Assigned",   desc: "Task assigned, work not logged" },
  { color: "bg-status-working",  label: "Working",    desc: "Currently on a task (day in progress)" },
  { color: "bg-status-done",     label: "Done",       desc: "Wages logged for the day" },
  { color: "bg-status-notask",   label: "No task",    desc: "Released without work — 0 wage" },
  { color: "bg-status-ended",    label: "Day Ended",  desc: "All workers released by supervisor" },
  { color: "bg-status-carryover",label: "Carry-over", desc: "Unreleased worker from a prior day" },
  { color: "bg-status-warn",     label: "Warning",    desc: "Late release / missing photos" },
];

export function ColorLegend() {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Info className="h-3.5 w-3.5" /> Legend
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="text-xs font-semibold mb-2">Color guide</div>
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2 text-[11px]">
              <span className={`inline-block h-3 w-3 rounded mt-0.5 ${i.color}`} />
              <div className="min-w-0">
                <div className="font-medium">{i.label}</div>
                <div className="text-muted-foreground">{i.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
