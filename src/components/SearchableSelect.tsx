import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string; sublabel?: string };

type Props = {
  value?: string;
  onChange: (v: string, opt?: Option) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** If set, shows "+ Add X" when no exact match. Receives the typed text, returns new value (id). */
  onCreate?: (text: string) => Promise<Option | null>;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  allowClear?: boolean;
};

export function SearchableSelect({
  value, onChange, options, placeholder = "Select…",
  searchPlaceholder = "Search…", emptyText = "No results.",
  onCreate, disabled, className, triggerClassName, allowClear,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.label.localeCompare(b.label)),
    [options]
  );
  const selected = options.find((o) => o.value === value);
  const exact = sorted.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const showCreate = !!onCreate && query.trim().length > 0 && !exact;

  const pick = (opt: Option) => {
    onChange(opt.value, opt);
    setOpen(false); setQuery("");
  };
  const create = async () => {
    if (!onCreate) return;
    setCreating(true);
    const opt = await onCreate(query.trim());
    setCreating(false);
    if (opt) { onChange(opt.value, opt); setOpen(false); setQuery(""); }
  };

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      disabled={disabled}
      className={cn("w-full justify-between font-normal", triggerClassName)}
    >
      <span className={cn("truncate", !selected && "text-muted-foreground")}>
        {selected?.label || placeholder}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const list = (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={searchPlaceholder}
        value={query}
        onValueChange={setQuery}
        className="text-base"
      />
      <CommandList className="max-h-full">
        {!showCreate && <CommandEmpty>{emptyText}</CommandEmpty>}
        {allowClear && value && (
          <CommandGroup>
            <CommandItem value="__clear__" onSelect={() => { onChange("", undefined); setOpen(false); setQuery(""); }}>
              <span className="text-muted-foreground">Clear selection</span>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup>
          {sorted
            .filter((o) => {
              if (!query) return true;
              const q = query.toLowerCase();
              return o.label.toLowerCase().includes(q) || (o.sublabel || "").toLowerCase().includes(q);
            })
            .map((o) => (
              <CommandItem key={o.value} value={o.value} onSelect={() => pick(o)}
                className="min-h-11">
                <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                <div className="flex flex-col">
                  <span>{o.label}</span>
                  {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
        </CommandGroup>
        {showCreate && (
          <CommandGroup heading="New">
            <CommandItem value="__create__" onSelect={create} disabled={creating} className="min-h-11">
              <Plus className="mr-2 h-4 w-4" />
              <span>Add "<span className="font-medium">{query.trim()}</span>"</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <div className={className}>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="max-h-[85vh] flex flex-col overflow-hidden">
            <DrawerHeader className="text-left shrink-0">
              <DrawerTitle className="flex items-center gap-2">
                <Search className="h-4 w-4" />{placeholder}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-2 pb-4 flex-1 overflow-y-auto min-h-0">{list}</div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
          {list}
        </PopoverContent>
      </Popover>
    </div>
  );
}
