CREATE POLICY "auth read employee-photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'employee-photos');
CREATE POLICY "auth insert employee-photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-photos');
CREATE POLICY "auth update employee-photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'employee-photos');
CREATE POLICY "auth delete employee-photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'employee-photos');