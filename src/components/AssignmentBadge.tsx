import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

export function AssignmentBadge({
  no,
  size = "sm",
  className,
  title,
}: {
  no?: string | null;
  size?: Size;
  className?: string;
  title?: string;
}) {
  if (!no) return null;
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(no).then(
      () => toast.success(`Copied ${no}`),
      () => {},
    );
  };
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      title={title || `Assignment ${no} — click to copy`}
      className={cn(
        "inline-flex items-center font-mono font-bold tracking-wide rounded border",
        "bg-primary/15 text-primary border-primary/40 shadow-sm",
        "hover:bg-primary/25 active:bg-primary/30 transition cursor-pointer select-none",
        size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1",
        className,
      )}
    >
      {no}
    </span>
  );
}
