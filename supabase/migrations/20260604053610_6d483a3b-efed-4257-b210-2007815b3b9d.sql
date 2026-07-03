WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY date, line_item_id, worker_id, work_done, wage_scale, hours, remark ORDER BY released_at) AS rn
  FROM public.daily_logs
  WHERE date = '2026-06-01' AND line_item_id = '0075dc53-ecf5-4056-95d4-0aed4469192a'
)
DELETE FROM public.daily_logs WHERE id IN (SELECT id FROM dups WHERE rn > 1);