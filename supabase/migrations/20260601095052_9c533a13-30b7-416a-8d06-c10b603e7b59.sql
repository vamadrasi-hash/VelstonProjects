CREATE POLICY "sup update workers"
ON public.workers
FOR UPDATE
USING (has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));