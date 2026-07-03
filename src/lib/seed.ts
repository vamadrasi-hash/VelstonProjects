import { supabase } from "@/integrations/supabase/client";

let seeded = false;

export async function seedIfEmpty() {
  if (seeded) return;
  seeded = true;
  const { count } = await supabase.from("contractors").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const { data: contractors } = await supabase
    .from("contractors")
    .insert([
      { name: "Ravi Builders", phone: "9876543210" },
      { name: "Kumar Interiors", phone: "9123456780" },
    ])
    .select();

  await supabase.from("supervisors").insert([{ name: "Suresh" }, { name: "Anil" }]);

  if (contractors && contractors.length >= 2) {
    await supabase.from("workers").insert([
      { name: "Mani", designation: "Mason", contractor_id: contractors[0].id },
      { name: "Raju", designation: "Helper", contractor_id: contractors[0].id },
      { name: "Vinod", designation: "Carpenter", contractor_id: contractors[1].id },
      { name: "Arun", designation: "Painter", contractor_id: contractors[1].id },
    ]);
  }
}
