import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MapPin, X } from "lucide-react";

export function PhotoLightbox({
  open, onClose, src, alt, caption, lat, lng,
}: {
  open: boolean;
  onClose: () => void;
  src: string | null;
  alt?: string;
  caption?: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const hasGps = lat != null && lng != null;
  const mapHref = hasGps ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[90vw] p-0 bg-black border-0 overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-50 h-10 w-10 rounded-full bg-white text-black shadow-lg flex items-center justify-center hover:bg-white/90"
        >
          <X className="h-5 w-5" />
        </button>
        {src && (
          <div className="flex flex-col items-center justify-center bg-black">
            <img
              src={src}
              alt={alt || ""}
              className="max-h-[85vh] max-w-full object-contain"
            />
            {(caption || mapHref) && (
              <div className="text-xs text-white/80 px-3 py-2 text-center w-full bg-black/80 flex items-center justify-center gap-3 flex-wrap">
                {caption && <span>{caption}</span>}
                {mapHref && (
                  <a href={mapHref} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary-foreground bg-primary/80 hover:bg-primary px-2 py-0.5 rounded">
                    <MapPin className="h-3 w-3" /> View on Map
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
