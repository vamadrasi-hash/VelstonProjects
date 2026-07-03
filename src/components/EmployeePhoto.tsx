import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getPhotoUrl, initialsOf } from "@/lib/employeePhoto";
import { cn } from "@/lib/utils";

type Props = {
  path?: string | null;
  name: string;
  size?: number; // px
  className?: string;
  zoomable?: boolean;
  subtitle?: string;
};

export function EmployeePhoto({ path, name, size = 40, className, zoomable = true, subtitle }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getPhotoUrl(path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);

  const avatar = (
    <Avatar
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="text-xs">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );

  if (!zoomable) return avatar;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className="focus:outline-none focus:ring-2 focus:ring-primary rounded-full"
        aria-label={`View photo of ${name}`}
      >
        {avatar}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-4">
          <div className="flex flex-col items-center gap-3">
            {url ? (
              <img src={url} alt={name} className="w-full h-auto rounded-lg object-cover max-h-[70vh]" />
            ) : (
              <div className="w-64 h-64 rounded-lg bg-muted flex items-center justify-center text-3xl text-muted-foreground">
                {initialsOf(name)}
              </div>
            )}
            <div className="text-center">
              <div className="font-semibold">{name}</div>
              {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
