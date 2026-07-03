import { format, parseISO } from "date-fns";

/** Display an ISO date (yyyy-mm-dd or full ISO) as dd-MM-yyyy. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
    return format(d, "dd-MM-yyyy");
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd-MM-yyyy HH:mm");
  } catch {
    return iso;
  }
}

export const todayIso = () => format(new Date(), "yyyy-MM-dd");

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Split a daily-log wage into worker ₹ and contractor ₹.
 * - totalWages: wage_scale + hours/8 (units)
 * - rate: worker's daily rate (₹/day)
 * - contractorShareSnapshot: stored daily_logs.contractor_share (₹, already
 *   scaled by wage_scale at the time the log was created).
 * Total ₹ is unchanged; contractor portion is just carved out of worker's pay.
 */
export const splitWage = (totalWages: number, rate: number, contractorShareSnapshot: number) => {
  const total = Number(totalWages) * Number(rate || 0);
  const contractor = Math.min(Number(contractorShareSnapshot || 0), total);
  const worker = total - contractor;
  return { worker, contractor, total };
};
