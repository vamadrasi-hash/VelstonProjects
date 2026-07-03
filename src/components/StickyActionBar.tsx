import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky action bar — fixed at bottom on mobile (above the bottom nav),
 * inline on desktop. Use for primary action(s) of a page (Save, Assign, Close Day).
 */
export function StickyActionBar({
  children,
  className,
  hasBottomNav = true,
}: {
  children: ReactNode;
  className?: string;
  hasBottomNav?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-30 px-3 md:static md:px-0 md:mt-4",
        hasBottomNav ? "bottom-[68px] md:bottom-auto" : "bottom-2 md:bottom-auto",
        "pointer-events-none",
      )}
      style={{ paddingBottom: hasBottomNav ? undefined : "env(safe-area-inset-bottom)" }}
    >
      <div className={cn("max-w-5xl mx-auto pointer-events-auto", className)}>
        {children}
      </div>
    </div>
  );
}
