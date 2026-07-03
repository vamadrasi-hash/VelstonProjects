
-- 1. daily_logs: restrict supervisor SELECT to own logs
DROP POLICY IF EXISTS "sup read logs" ON public.daily_logs;
CREATE POLICY "sup read own logs" ON public.daily_logs
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  );

-- 2. line_item_assignments: restrict supervisor SELECT to own
DROP POLICY IF EXISTS "sup read assigns" ON public.line_item_assignments;
CREATE POLICY "sup read own assigns" ON public.line_item_assignments
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  );

-- 3. clients: restrict supervisor SELECT to clients tied to sites with own assignments
DROP POLICY IF EXISTS "sup read" ON public.clients;
CREATE POLICY "sup read assigned clients" ON public.clients
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND id IN (
      SELECT s.client_id
      FROM public.sites s
      JOIN public.purchase_orders po ON po.site_id = s.id
      JOIN public.po_line_items li ON li.po_id = po.id
      JOIN public.line_item_assignments la ON la.line_item_id = li.id
      WHERE la.supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
    )
  );

-- 4. workers: restrict supervisor SELECT to workers currently assigned to them
DROP POLICY IF EXISTS "sup read" ON public.workers;
CREATE POLICY "sup read own workers" ON public.workers
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND current_supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  );

-- 5. workers: restrict supervisor UPDATE to workers currently assigned to them
DROP POLICY IF EXISTS "sup update workers" ON public.workers;
CREATE POLICY "sup update own workers" ON public.workers
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND current_supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'supervisor'::app_role)
  );

-- 6. contractors: restrict supervisor SELECT to contractors of own currently-assigned workers
DROP POLICY IF EXISTS "sup read" ON public.contractors;
CREATE POLICY "sup read own contractors" ON public.contractors
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND id IN (
      SELECT DISTINCT contractor_id FROM public.workers
      WHERE current_supervisor_id IN (SELECT id FROM public.supervisors WHERE user_id = auth.uid())
        AND contractor_id IS NOT NULL
    )
  );

-- 7. supervisors: restrict supervisor SELECT to own record
DROP POLICY IF EXISTS "sup read" ON public.supervisors;
CREATE POLICY "sup read self" ON public.supervisors
  FOR SELECT
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND user_id = auth.uid()
  );

-- 8. Storage employee-photos: lock mutations to staff; reads to approved users
DROP POLICY IF EXISTS "auth delete employee-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth insert employee-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth update employee-photos" ON storage.objects;
DROP POLICY IF EXISTS "auth read employee-photos" ON storage.objects;

CREATE POLICY "staff insert employee-photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos' AND public.is_staff(auth.uid()));

CREATE POLICY "staff update employee-photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'employee-photos' AND public.is_staff(auth.uid()));

CREATE POLICY "staff delete employee-photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_staff(auth.uid()));

CREATE POLICY "approved read employee-photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-photos' AND public.is_approved(auth.uid()));

-- 9. Revoke public/anon EXECUTE on SECURITY DEFINER helpers; keep authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
