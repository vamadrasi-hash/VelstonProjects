import { t } from "@/lib/i18n-sup";
import { cn } from "@/lib/utils";

type Props = {
  k: string;
  className?: string;
  /** stacked: English on top, Gujarati below. inline: "EN · GU" on one line. */
  layout?: "stacked" | "inline";
  /** Show only English when true (saves vertical space for tight chrome). */
  oneLine?: boolean;
};

/** Bilingual label: shows English + Gujarati from the SUP_LANG dictionary. */
export function L({ k, className, layout = "stacked", oneLine = false }: Props) {
  const v = t(k);
  if (oneLine) return <span className={className}>{v.en}</span>;
  if (layout === "inline") {
    return (
      <span className={className}>
        {v.en} <span className="text-muted-foreground">· {v.gu}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span>{v.en}</span>
      <span className="text-[10px] opacity-80">{v.gu}</span>
    </span>
  );
}

/** Inline plain string helper for placeholders / aria. */
export const tx = (k: string) => {
  const v = t(k);
  return `${v.en} / ${v.gu}`;
};
