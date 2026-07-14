import { supabaseAdmin } from "../../../../lib/supabaseClient";

// Deliberately public: anyone with the link (i.e. anyone who scanned the QR
// code physically stuck on the DB board) can view this job's wiring record.
// Job ids are unguessable UUIDs, so this is reasonable for "the next
// electrician on site" access — not intended for data that needs real access
// control.

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing job id" });

  const admin = supabaseAdmin();

  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id, name, address, contractor, reg_no, coc_ref, created_at")
    .eq("id", id)
    .single();

  if (jobError || !job) return res.status(404).json({ error: "Job not found" });

  const { data: cables } = await admin
    .from("cables")
    .select("cable_id, from_point, to_point, cable_type, notes, photo, created_at")
    .eq("job_id", id)
    .order("created_at");

  res.status(200).json({ job, cables: cables || [] });
}
