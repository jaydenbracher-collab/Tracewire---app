import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const INK = "#1B2A41", ACCENT = "#E8622C", SLATE = "#68707B", PAPER = "#FAF9F6", PANEL = "#EFF2F5", LINE = "#D9DDE2";

export default function PublicJobView() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/job/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return <p style={{ textAlign: "center", marginTop: 100, fontFamily: "sans-serif", color: SLATE }}>This record couldn't be found.</p>;
  }
  if (!data) {
    return <p style={{ textAlign: "center", marginTop: 100, fontFamily: "sans-serif", color: SLATE }}>Loading…</p>;
  }

  const { job, cables } = data;

  return (
    <div style={{ background: "#E7E5DF", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: PAPER }}>
        <div style={{ background: INK, color: PAPER, padding: 16 }}>
          <p style={{ fontSize: 10, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0, fontFamily: "monospace" }}>
            Tracewire — Wiring Record
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: "2px 0 0" }}>{job.name}</h1>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: SLATE, margin: 0 }}>{job.address}</p>
            <p style={{ fontSize: 12, color: SLATE, margin: "4px 0 0" }}>
              {job.contractor || "Contractor not recorded"} {job.reg_no ? `· ${job.reg_no}` : ""}
            </p>
            {job.coc_ref && <p style={{ fontSize: 11, fontFamily: "monospace", color: ACCENT, margin: "4px 0 0" }}>Linked: {job.coc_ref}</p>}
          </div>

          <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", marginBottom: 8 }}>
            Cable Log ({cables.length})
          </p>

          {cables.length === 0 && <p style={{ color: SLATE, fontSize: 13 }}>No cables logged for this job yet.</p>}

          {cables.map((c) => (
            <div key={c.cable_id} style={{ padding: 10, border: `1px solid ${LINE}`, borderRadius: 6, marginBottom: 6 }}>
              <p style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: ACCENT, margin: 0 }}>{c.cable_id}</p>
              <p style={{ fontSize: 13, color: INK, margin: "2px 0 0" }}>{c.from_point} → {c.to_point}</p>
              <p style={{ fontSize: 12, color: SLATE, margin: "2px 0 0" }}>
                {c.cable_type}{c.notes ? ` · ${c.notes}` : ""}{c.photo ? " · 📷" : ""}
              </p>
            </div>
          ))}

          <p style={{ fontSize: 10.5, color: SLATE, marginTop: 20, textAlign: "center" }}>
            This record is read-only. Scanned from a DB board tag — no login required.
          </p>
        </div>
      </div>
    </div>
  );
}
