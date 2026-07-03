export function daysAgo(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

export function daysAgoLabel(iso: string): string {
  const n = daysAgo(iso);
  if (n === 0) return "today";
  if (n === 1) return "1 day ago";
  return `${n} days ago`;
}
