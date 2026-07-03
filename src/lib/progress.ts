export const pct = (done: number, total: number) =>
  total > 0 ? Math.min(100, (done / total) * 100) : 0;

export const fmtProgress = (done: number, total: number, uom = "") =>
  `${done.toFixed(2)} / ${total} ${uom} (${pct(done, total).toFixed(0)}%)`;
