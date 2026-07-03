ALTER TABLE public.line_item_assignments
  ADD CONSTRAINT lia_line_item_fk
  FOREIGN KEY (line_item_id) REFERENCES public.po_line_items(id) ON DELETE CASCADE;

ALTER TABLE public.line_item_assignments
  ADD CONSTRAINT lia_supervisor_fk
  FOREIGN KEY (supervisor_id) REFERENCES public.supervisors(id) ON DELETE CASCADE;