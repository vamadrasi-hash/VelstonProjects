import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type IsoRange = { from?: string; to?: string };

type Props = {
  value: IsoRange;
  onChange: (v: IsoRange) => void;
  className?: string;
  placeholder?: string;
};

const toIso = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : undefined);
const fromIso = (s?: string) => (s ? new Date(s + "T00:00:00") : undefined);

export function DateRangePicker({ value, onChange, className, placeholder = "Pick date range" }: Props) {
  const range: DateRange | undefined =
    value.from || value.to ? { from: fromIso(value.from), to: fromIso(value.to) } : undefined;

  const label = (() => {
    if (range?.from && range?.to) return `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yyyy")}`;
    if (range?.from) return `${format(range.from, "dd MMM yyyy")} – ?`;
    return placeholder;
  })();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !range?.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => onChange({ from: toIso(r?.from), to: toIso(r?.to) })}
          numberOfMonths={typeof window !== "undefined" && window.innerWidth >= 768 ? 2 : 1}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
