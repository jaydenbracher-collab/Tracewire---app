import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabaseClient";

const INK = "#1B2A41", ACCENT = "#E8622C", SLATE = "#68707B", PAPER = "#FAF9F6", PANEL = "#EFF2F5", LINE = "#D9DDE2";
const CABLE_TYPES = ["1.5mm² Surfix", "2.5mm² Surfix", "4mm² Surfix", "6mm² Surfix", "10mm² Surfix", "CAT6 Data", "Coax"];

function nextCableId(count) {
  return `C-${String(count + 11).padStart(3, "0")}`;
}

function compressImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Couldn't read image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadCablePhoto(file) {
  const compressed = await compressImage(file);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("cable-photos").upload(path, compressed, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("cable-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadCableAudio(blob) {
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("cable-notes").upload(path, blob, { contentType: blob.type || "audio/webm" });
  if (error) throw error;
  const { data } = supabase.storage.from("cable-notes").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadFloorPlanImage(file) {
  const compressed = await compressImage(file, 2000, 0.85);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from("floor-plans").upload(path, compressed, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("floor-plans").getPublicUrl(path);
  return data.publicUrl;
}

function exportCablesCSV(job, cables) {
  const headers = ["Cable ID", "From", "To", "Type", "Notes", "NFC Tag", "Photo URL", "Voice Note URL", "Date Logged"];
  const rows = cables.map((c) => [
    c.cable_id,
    c.from_point,
    c.to_point,
    c.cable_type,
    c.notes || "",
    c.tag_uid ? "Yes" : "No",
    c.photo_url || "",
    c.audio_url || "",
    c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
  ]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(job.name || "job").replace(/[^a-z0-9]/gi, "-")}-cables.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function hasPath(c) {
  return Array.isArray(c.path_points) && c.path_points.length > 0;
}

export default function App({ user }) {
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [cables, setCables] = useState([]);
  const [view, setView] = useState("jobs");
  const [editingCable, setEditingCable] = useState(null);
  const [stats, setStats] = useState({ totalJobs: 0, totalCables: 0 });
  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => { loadJobs(); loadStats(); loadTeam(); }, []);

  async function loadJobs() {
    const { data } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
    setJobs(data || []);
  }

  async function loadStats() {
    const { count: jobCount } = await supabase.from("jobs").select("*", { count: "exact", head: true });
    const { count: cableCount } = await supabase.from("cables").select("*", { count: "exact", head: true });
    setStats({ totalJobs: jobCount || 0, totalCables: cableCount || 0 });
  }

  async function loadTeam() {
    const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
    if (!profile?.team_id) return;
    const { data: teamData } = await supabase.from("teams").select("*").eq("id", profile.team_id).single();
    const { data: membersData } = await supabase.from("profiles").select("id, email, contractor_name").eq("team_id", profile.team_id);
    setTeam(teamData || null);
    setTeamMembers(membersData || []);
  }

  async function joinTeam(code) {
    const { error } = await supabase.rpc("join_team_by_code", { code });
    if (error) return { error: "That join code doesn't match any team." };
    await loadTeam();
    await loadJobs();
    await loadStats();
    setActiveJob(null);
    setCables([]);
    return { error: null };
  }

  async function renameTeam(name) {
    if (!team || !name.trim()) return;
    const { error } = await supabase.from("teams").update({ name: name.trim() }).eq("id", team.id);
    if (!error) await loadTeam();
  }

  async function loadCables(jobId) {
    const { data } = await supabase.from("cables").select("*").eq("job_id", jobId).order("created_at");
    setCables(data || []);
  }

  async function createJob(job) {
    const { data, error } = await supabase.from("jobs").insert({ ...job, user_id: user.id, team_id: team?.id }).select().single();
    if (!error) {
      await loadJobs();
      await loadStats();
      setActiveJob(data);
      setCables([]);
      setView("job");
    }
  }

  async function addCable(cable) {
    const { error } = await supabase.from("cables").insert({ ...cable, job_id: activeJob.id, created_by: user.id });
    if (!error) {
      await loadCables(activeJob.id);
      await loadStats();
      setView("job");
    }
  }

  async function openJob(job) {
    setActiveJob(job);
    await loadCables(job.id);
    setView("job");
  }

  async function updateJob(jobId, updates) {
    const { data, error } = await supabase.from("jobs").update(updates).eq("id", jobId).select().single();
    if (!error) {
      await loadJobs();
      setActiveJob(data);
      setView("job");
    }
  }

  async function deleteJob(jobId) {
    const { error } = await supabase.from("jobs").delete().eq("id", jobId);
    if (!error) {
      await loadJobs();
      await loadStats();
      setActiveJob(null);
      setCables([]);
      setView("jobs");
    }
  }

  async function uploadFloorPlan(url) {
    const { data, error } = await supabase.from("jobs").update({ floor_plan_url: url }).eq("id", activeJob.id).select().single();
    if (!error) {
      await loadJobs();
      setActiveJob(data);
    }
  }

  async function removeFloorPlan() {
    const { data, error } = await supabase.from("jobs").update({ floor_plan_url: null }).eq("id", activeJob.id).select().single();
    if (!error) {
      await supabase.from("cables").update({ path_points: null }).eq("job_id", activeJob.id);
      await loadJobs();
      await loadCables(activeJob.id);
      setActiveJob(data);
    }
  }

  async function savePath(cableId, points) {
    const { error } = await supabase.from("cables").update({ path_points: points }).eq("id", cableId);
    if (!error) await loadCables(activeJob.id);
  }

  async function removePath(cableId) {
    const { error } = await supabase.from("cables").update({ path_points: null }).eq("id", cableId);
    if (!error) await loadCables(activeJob.id);
  }

  async function updateCable(cableId, updates) {
    const { error } = await supabase.from("cables").update(updates).eq("id", cableId);
    if (!error) {
      await loadCables(activeJob.id);
      setEditingCable(null);
      setView("job");
    }
  }

  async function deleteCable(cableId) {
    const { error } = await supabase.from("cables").delete().eq("id", cableId);
    if (!error) {
      await loadCables(activeJob.id);
      await loadStats();
      setEditingCable(null);
      setView("job");
    }
  }

  function goBack() {
    if (view === "newjob") {
      setView("jobs");
    } else if (["scan", "editcable", "editjob", "floorplan", "report"].includes(view)) {
      setView("job");
    } else if (view === "job") {
      setActiveJob(null);
      setCables([]);
      setView("jobs");
    } else {
      setView("jobs");
    }
  }

  return (
    <div style={{ background: "#E7E5DF", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: PAPER }}>
        <TopBar
          view={view}
          activeJob={activeJob}
          onBack={goBack}
          onSignOut={() => supabase.auth.signOut().then(() => window.location.reload())}
        />
        {(view === "jobs" || view === "howto" || view === "team") && (
          <TabBar view={view} onJobs={() => setView("jobs")} onHowTo={() => setView("howto")} onTeam={() => setView("team")} />
        )}
        {view === "howto" && <HowItWorks />}
        {view === "team" && (
          <TeamView user={user} team={team} teamMembers={teamMembers} onJoinTeam={joinTeam} onRenameTeam={renameTeam} />
        )}
        {view === "jobs" && <JobsList jobs={jobs} stats={stats} team={team} onOpen={openJob} onNew={() => setView("newjob")} />}
        {view === "newjob" && <NewJobForm onCancel={() => setView("jobs")} onCreate={createJob} />}
        {view === "job" && activeJob && (
          <JobDetail
            job={activeJob}
            cables={cables}
            onScan={() => setView("scan")}
            onReport={() => setView("report")}
            onEditJob={() => setView("editjob")}
            onFloorPlan={() => setView("floorplan")}
            onEditCable={(cable) => { setEditingCable(cable); setView("editcable"); }}
          />
        )}
        {view === "editjob" && activeJob && (
          <EditJobForm
            job={activeJob}
            cableCount={cables.length}
            onCancel={() => setView("job")}
            onSave={(updates) => updateJob(activeJob.id, updates)}
            onDelete={() => deleteJob(activeJob.id)}
          />
        )}
        {view === "floorplan" && activeJob && (
          <FloorPlanView
            job={activeJob}
            cables={cables}
            onUploadPlan={uploadFloorPlan}
            onRemovePlan={removeFloorPlan}
            onSavePath={savePath}
            onRemovePath={removePath}
          />
        )}
        {view === "scan" && activeJob && (
          <ScanFlow cables={cables} onCancel={() => setView("job")} onSave={addCable} />
        )}
        {view === "editcable" && editingCable && (
          <EditCableForm
            cable={editingCable}
            onCancel={() => { setEditingCable(null); setView("job"); }}
            onSave={(updates) => updateCable(editingCable.id, updates)}
            onDelete={() => deleteCable(editingCable.id)}
          />
        )}
        {view === "report" && activeJob && (
          <ReportView job={activeJob} cables={cables} />
        )}
      </div>
    </div>
  );
}

function TopBar({ view, activeJob, onBack, onSignOut }) {
  const title = view === "jobs" ? "Tracewire" : view === "howto" ? "How It Works" : view === "team" ? "Team" : view === "newjob" ? "New Job" : view === "editjob" ? "Edit Job" : view === "floorplan" ? "Floor Plan" : view === "editcable" ? "Edit Cable" : view === "scan" ? "Scan Tag" : view === "report" ? "As-Built Report" : activeJob?.name;
  const isTopLevel = view === "jobs" || view === "howto" || view === "team";
  return (
    <div style={{ background: INK, color: PAPER, padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isTopLevel && <button onClick={onBack} style={{ background: "none", border: "none", color: PAPER, cursor: "pointer", fontSize: 18 }}>←</button>}
        <div>
          <p style={{ fontSize: 10, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0, fontFamily: "monospace" }}>
            {view === "jobs" ? "Cable documentation" : view === "howto" ? "Getting started" : view === "team" ? "Your crew" : "Job record"}
          </p>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h1>
        </div>
      </div>
      {isTopLevel && <button onClick={onSignOut} style={{ background: "none", border: "none", color: SLATE, fontSize: 12, cursor: "pointer" }}>Sign out</button>}
    </div>
  );
}

function TabBar({ view, onJobs, onHowTo, onTeam }) {
  const tabStyle = (active) => ({
    flex: 1, padding: "10px 0", textAlign: "center", fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: active ? PAPER : PANEL, color: active ? INK : SLATE, border: "none",
    borderBottom: active ? `2px solid ${ACCENT}` : `2px solid transparent`,
  });
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
      <button style={tabStyle(view === "jobs")} onClick={onJobs}>Jobs</button>
      <button style={tabStyle(view === "team")} onClick={onTeam}>Team</button>
      <button style={tabStyle(view === "howto")} onClick={onHowTo}>How It Works</button>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { title: "1. Get your Tracewire tag bag", body: "Pick one up from your local hardware store or supplier. Inside is a pamphlet with a QR code — scan it with your phone's camera to go straight to the app, no app store or typing in a link needed." },
    { title: "2. Start a job", body: "Tap “+ New Job” and enter the client, address, and your details. This becomes the container for every cable you tag on that site." },
    { title: "3. Tap “Scan New Cable Tag”", body: "Open the job, tap the scan button, then hold your phone near the tag on the cable you're about to install or terminate." },
    { title: "4. Fill in the details", body: "Enter where the cable runs from and to, its type/size, and any notes. Add a photo or a quick voice note if it's easier than typing." },
    { title: "5. Trace it on the floor plan", body: "Upload a floor plan once per job, then tap a series of points to trace the actual path each cable takes." },
    { title: "6. Generate the report", body: "When the job's done, tap “Generate As-Built Report” for a clean, printable document that supports your COC test report, or export the cable log as a CSV." },
    { title: "7. Stick a QR code on the DB board", body: "From any job, get its QR code and print it onto a sticker for the board. The next electrician can scan it — no login needed — and see the full wiring history instantly." },
    { title: "8. Bring your team on board", body: "Share your join code from the Team tab so colleagues see the same jobs you do, instead of starting from scratch on their own." },
  ];
  return (
    <div style={{ padding: 16 }}>
      {steps.map((s) => (
        <div key={s.title} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${LINE}` }}>
          <p style={{ fontWeight: 700, color: INK, fontSize: 14, margin: "0 0 4px" }}>{s.title}</p>
          <p style={{ fontSize: 13, color: SLATE, margin: 0, lineHeight: 1.5 }}>{s.body}</p>
        </div>
      ))}
    </div>
  );
}

function TeamView({ user, team, teamMembers, onJoinTeam, onRenameTeam }) {
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [teamName, setTeamName] = useState(team?.name || "");
  const [savingName, setSavingName] = useState(false);

  const isOwner = team?.owner_id === user.id;

  const handleJoin = async () => {
    setJoining(true);
    setJoinError("");
    setJoinSuccess(false);
    const { error } = await onJoinTeam(joinCode);
    setJoining(false);
    if (error) {
      setJoinError(error);
    } else {
      setJoinSuccess(true);
      setJoinCode("");
    }
  };

  const handleRename = async () => {
    setSavingName(true);
    await onRenameTeam(teamName);
    setSavingName(false);
  };

  return (
    <div style={{ padding: 16 }}>
      {team && (
        <>
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", marginBottom: 6 }}>Your Team</p>
            {isOwner ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input style={inputStyle} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                <button onClick={handleRename} disabled={savingName} style={{ padding: "0 14px", background: INK, color: PAPER, border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>
                  {savingName ? "…" : "Save"}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>{team.name}</p>
            )}
          </div>

          <div style={{ background: INK, borderRadius: 6, padding: 14, marginBottom: 16, textAlign: "center" }}>
            <p style={{ fontSize: 10, fontFamily: "monospace", color: "#B8C0CC", textTransform: "uppercase", marginBottom: 6 }}>Join Code</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: PAPER, letterSpacing: "0.08em", margin: 0 }}>{team.join_code}</p>
            <p style={{ fontSize: 11, color: "#B8C0CC", marginTop: 6 }}>Share this with a colleague so they can join your team</p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", marginBottom: 8 }}>
              Members ({teamMembers.length})
            </p>
            {teamMembers.map((m) => (
              <div key={m.id} style={{ padding: 10, border: `1px solid ${LINE}`, borderRadius: 6, marginBottom: 6 }}>
                <p style={{ fontSize: 13, color: INK, margin: 0 }}>
                  {m.email}{m.id === team.owner_id ? " · Owner" : ""}{m.id === user.id ? " (you)" : ""}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 20 }}>
        <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", marginBottom: 8 }}>
          Join a Different Team
        </p>
        <p style={{ fontSize: 12, color: SLATE, marginBottom: 10 }}>
          Enter a colleague's join code to start seeing their jobs instead of your own. You can always switch back with your own code.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, textTransform: "uppercase" }}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="e.g. A1B2C3"
            maxLength={6}
          />
          <button onClick={handleJoin} disabled={joining || !joinCode.trim()} style={{ padding: "0 16px", background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", opacity: joinCode.trim() ? 1 : 0.5 }}>
            {joining ? "…" : "Join"}
          </button>
        </div>
        {joinError && <p style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>{joinError}</p>}
        {joinSuccess && <p style={{ fontSize: 12, color: "#2E7D4F", marginTop: 8 }}>Joined! Your jobs list now shows that team's work.</p>}
      </div>
    </div>
  );
}

function StatsCard({ stats }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <div style={{ flex: 1, background: INK, borderRadius: 6, padding: 14, textAlign: "center" }}>
        <p style={{ fontSize: 24, fontWeight: 800, color: PAPER, margin: 0 }}>{stats.totalJobs}</p>
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "#B8C0CC", textTransform: "uppercase", margin: "2px 0 0" }}>Jobs</p>
      </div>
      <div style={{ flex: 1, background: ACCENT, borderRadius: 6, padding: 14, textAlign: "center" }}>
        <p style={{ fontSize: 24, fontWeight: 800, color: PAPER, margin: 0 }}>{stats.totalCables}</p>
        <p style={{ fontSize: 10, fontFamily: "monospace", color: "#FFE3D3", textTransform: "uppercase", margin: "2px 0 0" }}>Cables Logged</p>
      </div>
    </div>
  );
}

function JobsList({ jobs, stats, team, onOpen, onNew }) {
  return (
    <div style={{ padding: 16 }}>
      {team && (
        <p style={{ fontSize: 12, color: SLATE, marginBottom: 10 }}>
          Viewing: <span style={{ color: INK, fontWeight: 600 }}>{team.name}</span>
        </p>
      )}
      <StatsCard stats={stats} />
      <button onClick={onNew} style={{ width: "100%", padding: 12, background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, marginBottom: 20, cursor: "pointer" }}>
        + New Job
      </button>
      {jobs.length === 0 && <p style={{ textAlign: "center", color: SLATE, fontSize: 14, padding: "40px 0" }}>No jobs yet. Start a new job to begin tagging cables on site.</p>}
      {jobs.map((j) => (
        <button key={j.id} onClick={() => onOpen(j)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 8, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, cursor: "pointer" }}>
          <p style={{ fontWeight: 600, color: INK, margin: 0, fontSize: 14 }}>{j.name}</p>
          <p style={{ color: SLATE, margin: "2px 0 0", fontSize: 12 }}>{j.address}</p>
        </button>
      ))}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", color: SLATE, marginBottom: 4 }}>
        {label}{required && <span style={{ color: ACCENT }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, color: INK, boxSizing: "border-box" };

function PhotoField({ photoUrl, onPhotoSelected, onRemove, uploading, error }) {
  const inputRef = useRef(null);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", color: SLATE, marginBottom: 4 }}>Photo</label>
      {photoUrl ? (
        <div style={{ position: "relative" }}>
          <img src={photoUrl} alt="Cable" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 6, border: `1px solid ${LINE}`, display: "block" }} />
          {!uploading && (
            <button type="button" onClick={onRemove} style={{ position: "absolute", top: 8, right: 8, background: INK, color: PAPER, border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
              Remove
            </button>
          )}
          {uploading && (
            <div style={{ position: "absolute", top: 8, right: 8, background: INK, color: PAPER, borderRadius: 4, padding: "5px 10px", fontSize: 11 }}>
              Uploading…
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ width: "100%", padding: 16, border: `1px dashed ${LINE}`, borderRadius: 6, background: PANEL, color: SLATE, cursor: uploading ? "default" : "pointer", fontSize: 13 }}
        >
          {uploading ? "Uploading…" : "📷 Add Photo"}
        </button>
      )}
      {error && <p style={{ fontSize: 12, color: ACCENT, marginTop: 6 }}>{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files[0]) onPhotoSelected(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
}

function VoiceNoteField({ audioUrl, onRecordingComplete, onRemove, uploading, error }) {
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    setRecordError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        onRecordingComplete(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      if (err && err.name === "NotAllowedError") {
        setRecordError("Microphone access was blocked. Allow it for this site and try again.");
      } else {
        setRecordError("Couldn't start recording on this device.");
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontFamily: "monospace", textTransform: "uppercase", color: SLATE, marginBottom: 4 }}>Voice Note</label>

      {audioUrl ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, border: `1px solid ${LINE}`, borderRadius: 6, background: PANEL }}>
          <audio controls src={audioUrl} style={{ flex: 1, height: 34 }} />
          {!uploading && (
            <button type="button" onClick={onRemove} style={{ background: INK, color: PAPER, border: "none", borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>
              Remove
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading}
          style={{
            width: "100%", padding: 16, borderRadius: 6, fontSize: 13, cursor: uploading ? "default" : "pointer",
            border: recording ? "none" : `1px dashed ${LINE}`,
            background: recording ? ACCENT : PANEL,
            color: recording ? PAPER : SLATE,
          }}
        >
          {uploading ? "Uploading…" : recording ? "⏺ Recording… tap to stop" : "🎙️ Record Voice Note"}
        </button>
      )}
      {(error || recordError) && <p style={{ fontSize: 12, color: ACCENT, marginTop: 6 }}>{error || recordError}</p>}
    </div>
  );
}

function NewJobForm({ onCancel, onCreate }) {
  const [form, setForm] = useState({ name: "", address: "", contractor: "", reg_no: "", coc_ref: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const canSave = form.name.trim() && form.address.trim() && form.contractor.trim();
  return (
    <div style={{ padding: 16 }}>
      <Field label="Client / Site name" required><input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. Vermeulen Residence" /></Field>
      <Field label="Address" required><input style={inputStyle} value={form.address} onChange={set("address")} placeholder="e.g. Table View, Cape Town" /></Field>
      <Field label="Contractor name" required><input style={inputStyle} value={form.contractor} onChange={set("contractor")} placeholder="e.g. Kaizer Electrical CC" /></Field>
      <Field label="DoL registration no."><input style={inputStyle} value={form.reg_no} onChange={set("reg_no")} placeholder="e.g. DoL 4471" /></Field>
      <Field label="Linked COC reference"><input style={inputStyle} value={form.coc_ref} onChange={set("coc_ref")} placeholder="e.g. COC-2026-01187" /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Cancel</button>
        <button disabled={!canSave} onClick={() => onCreate(form)} style={{ flex: 1, padding: 12, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", opacity: canSave ? 1 : 0.4 }}>Create Job</button>
      </div>
    </div>
  );
}

function EditJobForm({ job, cableCount, onCancel, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: job.name || "",
    address: job.address || "",
    contractor: job.contractor || "",
    reg_no: job.reg_no || "",
    coc_ref: job.coc_ref || "",
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const canSave = form.name.trim() && form.address.trim() && form.contractor.trim();
  return (
    <div style={{ padding: 16 }}>
      <Field label="Client / Site name" required><input style={inputStyle} value={form.name} onChange={set("name")} /></Field>
      <Field label="Address" required><input style={inputStyle} value={form.address} onChange={set("address")} /></Field>
      <Field label="Contractor name" required><input style={inputStyle} value={form.contractor} onChange={set("contractor")} /></Field>
      <Field label="DoL registration no."><input style={inputStyle} value={form.reg_no} onChange={set("reg_no")} /></Field>
      <Field label="Linked COC reference"><input style={inputStyle} value={form.coc_ref} onChange={set("coc_ref")} /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Cancel</button>
        <button disabled={!canSave} onClick={() => onSave(form)} style={{ flex: 1, padding: 12, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", opacity: canSave ? 1 : 0.4 }}>Save Changes</button>
      </div>

      {!confirmingDelete ? (
        <button onClick={() => setConfirmingDelete(true)} style={{ width: "100%", padding: 10, background: "none", border: "none", color: "#B3261E", fontSize: 13, cursor: "pointer" }}>
          Delete this job
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: 12, background: "#FDECE6", borderRadius: 6 }}>
          <p style={{ fontSize: 13, color: INK, marginBottom: 10 }}>
            Delete “{job.name}” and its {cableCount} logged cable{cableCount === 1 ? "" : "s"}? This can't be undone.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmingDelete(false)} style={{ flex: 1, padding: 10, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Keep it</button>
            <button onClick={onDelete} style={{ flex: 1, padding: 10, background: "#B3261E", color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>Delete Job</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FloorPlanView({ job, cables, onUploadPlan, onRemovePlan, onSavePath, onRemovePath }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [tracingCableId, setTracingCableId] = useState(null);
  const [tracingPoints, setTracingPoints] = useState([]);
  const [viewingCableId, setViewingCableId] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const inputRef = useRef(null);

  const placed = cables.filter(hasPath);
  const unplaced = cables.filter((c) => !hasPath(c));
  const tracingCable = cables.find((c) => c.id === tracingCableId);
  const viewingCable = cables.find((c) => c.id === viewingCableId);

  const handleFileSelected = async (file) => {
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadFloorPlanImage(file);
      await onUploadPlan(url);
    } catch (err) {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const startTracing = (cableId, existingPoints) => {
    setViewingCableId(null);
    setTracingCableId(cableId);
    setTracingPoints(existingPoints ? [...existingPoints] : []);
  };

  const handleImageClick = (e) => {
    if (!tracingCableId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTracingPoints((prev) => [...prev, { x, y }]);
  };

  const undoPoint = () => setTracingPoints((prev) => prev.slice(0, -1));

  const finishTracing = async () => {
    if (tracingPoints.length === 0) return;
    await onSavePath(tracingCableId, tracingPoints);
    setTracingCableId(null);
    setTracingPoints([]);
  };

  const cancelTracing = () => {
    setTracingCableId(null);
    setTracingPoints([]);
  };

  const toPixels = (points) =>
    points.map((p) => `${(p.x / 100) * imgSize.w},${(p.y / 100) * imgSize.h}`).join(" ");

  if (!job.floor_plan_url) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, color: SLATE, marginBottom: 16 }}>
          Upload a photo of the floor plan or house layout. You'll be able to trace exactly where each cable runs, point by point.
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ width: "100%", padding: 20, border: `1px dashed ${LINE}`, borderRadius: 6, background: PANEL, color: SLATE, cursor: uploading ? "default" : "pointer", fontSize: 14 }}
        >
          {uploading ? "Uploading…" : "📐 Upload Floor Plan"}
        </button>
        {uploadError && <p style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>{uploadError}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files[0]) handleFileSelected(e.target.files[0]); e.target.value = ""; }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {!tracingCableId && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button onClick={() => setConfirmingRemove(true)} style={{ background: "none", border: "none", color: "#B3261E", fontSize: 12, cursor: "pointer" }}>
            Remove Floor Plan
          </button>
        </div>
      )}

      {confirmingRemove && (
        <div style={{ background: "#FDECE6", borderRadius: 6, padding: 12, marginBottom: 12, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: INK, marginBottom: 10 }}>Remove this floor plan? Every cable's traced route will be cleared too.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmingRemove(false)} style={{ flex: 1, padding: 8, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, fontSize: 12, cursor: "pointer" }}>Keep it</button>
            <button onClick={onRemovePlan} style={{ flex: 1, padding: 8, background: "#B3261E", color: PAPER, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Remove</button>
          </div>
        </div>
      )}

      {tracingCableId && (
        <div style={{ background: ACCENT, color: PAPER, padding: 10, borderRadius: 6, marginBottom: 10, fontSize: 13, textAlign: "center" }}>
          Tap along the plan to trace {tracingCable?.cable_id}'s route, start to end. {tracingPoints.length} point{tracingPoints.length === 1 ? "" : "s"} so far.
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 12, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
        <img
          src={job.floor_plan_url}
          alt="Floor plan"
          onLoad={(e) => setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          onClick={handleImageClick}
          style={{ width: "100%", display: "block", cursor: tracingCableId ? "crosshair" : "default" }}
        />
        {imgSize.w > 0 && (
          <svg
            viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            {placed.map((c) => (
              c.path_points.length > 1 && (
                <polyline
                  key={c.id}
                  points={toPixels(c.path_points)}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={Math.max(imgSize.w, imgSize.h) * 0.006}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            ))}
            {tracingPoints.length > 1 && (
              <polyline
                points={toPixels(tracingPoints)}
                fill="none"
                stroke={INK}
                strokeWidth={Math.max(imgSize.w, imgSize.h) * 0.006}
                strokeDasharray={`${Math.max(imgSize.w, imgSize.h) * 0.012} ${Math.max(imgSize.w, imgSize.h) * 0.008}`}
                strokeLinecap="round"
              />
            )}
          </svg>
        )}

        {placed.map((c) => {
          const p = c.path_points[0];
          return (
            <button
              key={c.id}
              onClick={(e) => { e.stopPropagation(); if (!tracingCableId) setViewingCableId(c.id); }}
              style={{
                position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
                transform: "translate(-50%, -50%)", width: 20, height: 20, borderRadius: "50%",
                background: ACCENT, border: `2px solid ${PAPER}`, color: PAPER, fontSize: 9, fontWeight: 700,
                cursor: tracingCableId ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                pointerEvents: tracingCableId ? "none" : "auto",
              }}
            >
              •
            </button>
          );
        })}

        {tracingPoints.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
              transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%",
              background: INK, border: `2px solid ${PAPER}`, pointerEvents: "none",
            }}
          />
        ))}
      </div>

      {tracingCableId && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={cancelTracing} style={{ flex: 1, padding: 10, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={undoPoint} disabled={tracingPoints.length === 0} style={{ flex: 1, padding: 10, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: INK, fontSize: 13, cursor: "pointer", opacity: tracingPoints.length ? 1 : 0.4 }}>
            Undo Point
          </button>
          <button onClick={finishTracing} disabled={tracingPoints.length === 0} style={{ flex: 1, padding: 10, background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: tracingPoints.length ? 1 : 0.4 }}>
            Finish Route
          </button>
        </div>
      )}

      {viewingCable && !tracingCableId && (
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <p style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: ACCENT, margin: 0 }}>{viewingCable.cable_id}</p>
          <p style={{ fontSize: 13, color: INK, margin: "2px 0 8px" }}>{viewingCable.from_point} → {viewingCable.to_point}</p>
          <p style={{ fontSize: 11, color: SLATE, marginBottom: 10 }}>{viewingCable.path_points.length}-point route</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setViewingCableId(null)} style={{ flex: 1, padding: 8, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, fontSize: 12, cursor: "pointer" }}>Close</button>
            <button onClick={() => startTracing(viewingCable.id, viewingCable.path_points)} style={{ flex: 1, padding: 8, background: INK, color: PAPER, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Edit Route</button>
            <button onClick={() => { onRemovePath(viewingCable.id); setViewingCableId(null); }} style={{ flex: 1, padding: 8, background: "#B3261E", color: PAPER, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Remove</button>
          </div>
        </div>
      )}

      {!tracingCableId && unplaced.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", marginBottom: 8 }}>
            Not yet traced ({unplaced.length})
          </p>
          {unplaced.map((c) => (
            <button
              key={c.id}
              onClick={() => startTracing(c.id, null)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: 10, marginBottom: 6, borderRadius: 6, cursor: "pointer", border: `1px solid ${LINE}`, background: "none" }}
            >
              <p style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: ACCENT, margin: 0 }}>{c.cable_id}</p>
              <p style={{ fontSize: 13, color: INK, margin: "2px 0 0" }}>{c.from_point} → {c.to_point}</p>
            </button>
          ))}
        </div>
      )}

      {!tracingCableId && unplaced.length === 0 && placed.length > 0 && (
        <p style={{ textAlign: "center", color: SLATE, fontSize: 13 }}>Every cable has been traced on the plan.</p>
      )}
    </div>
  );
}

function JobDetail({ job, cables, onScan, onReport, onEditJob, onFloorPlan, onEditCable }) {
  const [showQr, setShowQr] = useState(false);
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/j/${job.id}` : "";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, padding: 12, marginBottom: 16, position: "relative" }}>
        <button
          onClick={onEditJob}
          style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: ACCENT, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          Edit
        </button>
        <p style={{ fontSize: 12, color: SLATE, margin: 0, paddingRight: 40 }}>{job.address}</p>
        <p style={{ fontSize: 12, color: SLATE, margin: "4px 0 0" }}>{job.contractor || "No contractor set"} {job.reg_no ? `· ${job.reg_no}` : ""}</p>
        {job.coc_ref && <p style={{ fontSize: 11, fontFamily: "monospace", color: ACCENT, margin: "4px 0 0" }}>Linked: {job.coc_ref}</p>}
      </div>

      <button onClick={onScan} style={{ width: "100%", padding: 12, background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
        Scan New Cable Tag
      </button>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowQr(!showQr)} style={{ flex: 1, padding: 10, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          QR Code
        </button>
        <button onClick={onFloorPlan} style={{ flex: 1, padding: 10, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          Floor Plan
        </button>
      </div>

      {showQr && (
        <div style={{ textAlign: "center", padding: 16, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: SLATE, margin: "0 0 12px" }}>
            Stick this on the DB board. Scanning it opens this job's wiring record — no login needed.
          </p>
          <div style={{ background: "#fff", display: "inline-block", padding: 12, borderRadius: 6 }}>
            <QRCodeSVG value={publicUrl} size={160} />
          </div>
          <p style={{ fontSize: 11, fontFamily: "monospace", color: SLATE, marginTop: 10, wordBreak: "break-all" }}>{publicUrl}</p>
          <button onClick={() => window.print()} style={{ marginTop: 10, padding: "8px 16px", background: INK, color: PAPER, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
            Print
          </button>
        </div>
      )}

      {cables.length === 0 ? (
        <p style={{ textAlign: "center", color: SLATE, fontSize: 14, padding: "24px 0" }}>No cables logged yet.</p>
      ) : (
        <>
          <CircuitMap cables={cables} />
          <div style={{ margin: "16px 0" }}>
            {cables.map((c) => (
              <button
                key={c.id}
                onClick={() => onEditCable(c)}
                style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: 10, border: `1px solid ${LINE}`, borderRadius: 6, marginBottom: 6, background: "none", cursor: "pointer" }}
              >
                {c.photo_url && (
                  <img src={c.photo_url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: ACCENT, margin: 0 }}>{c.cable_id}</p>
                  <p style={{ fontSize: 13, color: INK, margin: "2px 0 0" }}>{c.from_point} → {c.to_point}</p>
                  <p style={{ fontSize: 12, color: SLATE, margin: "2px 0 0" }}>
                    {c.cable_type}{c.tag_uid ? " · 🏷️ NFC" : ""}{c.audio_url ? " · 🎙️" : ""}{hasPath(c) ? " · 📍" : ""}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onReport} style={{ flex: 1, padding: 12, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              Generate As-Built Report
            </button>
            <button onClick={() => exportCablesCSV(job, cables)} style={{ padding: "0 16px", background: "none", border: `1px solid ${LINE}`, color: INK, borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
              CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ScanFlow({ cables, onCancel, onSave }) {
  const [phase, setPhase] = useState("idle");
  const [nfcSupported, setNfcSupported] = useState(false);
  const [scanError, setScanError] = useState("");
  const [tagUid, setTagUid] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [form, setForm] = useState({ from_point: "", to_point: "", cable_type: CABLE_TYPES[1], notes: "" });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [audioPreview, setAudioPreview] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError, setAudioError] = useState("");

  useEffect(() => {
    setNfcSupported(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  const handleTagRead = (uid) => {
    setTagUid(uid);
    if (uid) {
      const match = cables.find((c) => c.tag_uid === uid);
      if (match) {
        setDuplicate(match);
        setPhase("duplicate");
        return;
      }
    }
    setPhase("scanned");
  };

  const startRealScan = async () => {
    setScanError("");
    setPhase("scanning");
    try {
      const reader = new window.NDEFReader();
      await reader.scan();
      reader.onreading = (event) => {
        handleTagRead(event.serialNumber || null);
      };
      reader.onreadingerror = () => {
        setScanError("Couldn't read that tag. Hold your phone steady against it and try again.");
        setPhase("idle");
      };
    } catch (err) {
      if (err && err.name === "NotAllowedError") {
        setScanError("NFC access was blocked. Allow NFC for this site in your browser settings and try again.");
      } else if (err && err.name === "NotSupportedError") {
        setScanError("No NFC hardware detected, or NFC is turned off on this device.");
      } else {
        setScanError("Couldn't start scanning. Try again.");
      }
      setPhase("idle");
    }
  };

  const enterManually = () => handleTagRead(null);

  const handlePhotoSelected = async (file) => {
    setPhotoError("");
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    try {
      const url = await uploadCablePhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      setPhotoError("Photo upload failed — check your connection and try again.");
      setPhotoPreview(null);
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoUrl(null);
    setPhotoError("");
  };

  const handleRecordingComplete = async (blob) => {
    setAudioError("");
    setAudioPreview(URL.createObjectURL(blob));
    setAudioUploading(true);
    try {
      const url = await uploadCableAudio(blob);
      setAudioUrl(url);
    } catch (err) {
      setAudioError("Voice note upload failed — check your connection and try again.");
      setAudioPreview(null);
    } finally {
      setAudioUploading(false);
    }
  };

  const removeAudio = () => {
    setAudioPreview(null);
    setAudioUrl(null);
    setAudioError("");
  };

  if (phase === "duplicate" && duplicate) {
    return (
      <div style={{ padding: 16, textAlign: "center", minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 14, color: INK, fontWeight: 600, marginBottom: 6 }}>This tag is already logged</p>
        <p style={{ fontSize: 13, color: SLATE, marginBottom: 20 }}>
          {duplicate.cable_id}: {duplicate.from_point} → {duplicate.to_point}
        </p>
        <button onClick={onCancel} style={{ padding: "10px 20px", background: INK, color: PAPER, border: "none", borderRadius: 6, cursor: "pointer" }}>
          Back to Job
        </button>
      </div>
    );
  }

  if (phase !== "scanned") {
    return (
      <div style={{ padding: 16, textAlign: "center", minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <button
          onClick={startRealScan}
          disabled={phase === "scanning" || !nfcSupported}
          style={{ width: 130, height: 130, borderRadius: "50%", background: phase === "scanning" ? PANEL : INK, border: "none", marginBottom: 20, cursor: nfcSupported ? "pointer" : "not-allowed", opacity: nfcSupported ? 1 : 0.4 }}
        >
          <span style={{ color: phase === "scanning" ? ACCENT : PAPER, fontSize: 14 }}>
            {phase === "scanning" ? "Reading…" : "Tap to Scan"}
          </span>
        </button>

        {nfcSupported ? (
          <p style={{ fontSize: 13, color: SLATE, maxWidth: 240 }}>Hold your phone against the NFC tag on the cable.</p>
        ) : (
          <p style={{ fontSize: 13, color: SLATE, maxWidth: 260 }}>
            Tap-to-scan needs an NFC-enabled phone on Android Chrome. Not available on this device/browser.
          </p>
        )}

        {scanError && <p style={{ fontSize: 12, color: ACCENT, marginTop: 10, maxWidth: 260 }}>{scanError}</p>}

        <button onClick={enterManually} style={{ marginTop: 20, background: "none", border: "none", color: INK, fontSize: 13, fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
          Enter details manually instead
        </button>
        <button onClick={onCancel} style={{ marginTop: 12, background: "none", border: "none", color: SLATE, fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    );
  }

  const cableId = nextCableId(cables.length);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const busy = photoUploading || audioUploading;

  return (
    <div style={{ padding: 16 }}>
      <p style={{ fontSize: 12, color: "#2E7D4F", marginBottom: 12 }}>
        {tagUid ? `✓ Tag read — ${cableId}` : `Manual entry — ${cableId}`}
      </p>
      <Field label="From"><input style={inputStyle} value={form.from_point} onChange={set("from_point")} placeholder="e.g. DB Board — Circuit 4" /></Field>
      <Field label="To"><input style={inputStyle} value={form.to_point} onChange={set("to_point")} placeholder="e.g. Kitchen Plug Circuit" /></Field>
      <Field label="Cable type">
        <select style={inputStyle} value={form.cable_type} onChange={set("cable_type")}>
          {CABLE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, resize: "none" }} rows={2} value={form.notes} onChange={set("notes")} /></Field>

      <PhotoField
        photoUrl={photoPreview}
        onPhotoSelected={handlePhotoSelected}
        onRemove={removePhoto}
        uploading={photoUploading}
        error={photoError}
      />

      <VoiceNoteField
        audioUrl={audioPreview}
        onRecordingComplete={handleRecordingComplete}
        onRemove={removeAudio}
        uploading={audioUploading}
        error={audioError}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Discard</button>
        <button
          disabled={!form.from_point.trim() || !form.to_point.trim() || busy}
          onClick={() => onSave({ cable_id: cableId, tag_uid: tagUid, photo_url: photoUrl, audio_url: audioUrl, ...form })}
          style={{ flex: 1, padding: 12, background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", opacity: form.from_point && form.to_point && !busy ? 1 : 0.4 }}
        >
          {busy ? "Uploading…" : "Save Cable"}
        </button>
      </div>
    </div>
  );
}

function EditCableForm({ cable, onCancel, onSave, onDelete }) {
  const [form, setForm] = useState({
    from_point: cable.from_point || "",
    to_point: cable.to_point || "",
    cable_type: cable.cable_type || CABLE_TYPES[1],
    notes: cable.notes || "",
  });
  const [photoPreview, setPhotoPreview] = useState(cable.photo_url || null);
  const [photoUrl, setPhotoUrl] = useState(cable.photo_url || null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [audioPreview, setAudioPreview] = useState(cable.audio_url || null);
  const [audioUrl, setAudioUrl] = useState(cable.audio_url || null);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handlePhotoSelected = async (file) => {
    setPhotoError("");
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    try {
      const url = await uploadCablePhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      setPhotoError("Photo upload failed — check your connection and try again.");
      setPhotoPreview(cable.photo_url || null);
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoUrl(null);
    setPhotoError("");
  };

  const handleRecordingComplete = async (blob) => {
    setAudioError("");
    setAudioPreview(URL.createObjectURL(blob));
    setAudioUploading(true);
    try {
      const url = await uploadCableAudio(blob);
      setAudioUrl(url);
    } catch (err) {
      setAudioError("Voice note upload failed — check your connection and try again.");
      setAudioPreview(cable.audio_url || null);
    } finally {
      setAudioUploading(false);
    }
  };

  const removeAudio = () => {
    setAudioPreview(null);
    setAudioUrl(null);
    setAudioError("");
  };

  const busy = photoUploading || audioUploading;

  return (
    <div style={{ padding: 16 }}>
      <p style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: ACCENT, marginBottom: 12 }}>
        Editing {cable.cable_id}{cable.tag_uid ? " · 🏷️ NFC" : ""}
      </p>
      <Field label="From"><input style={inputStyle} value={form.from_point} onChange={set("from_point")} /></Field>
      <Field label="To"><input style={inputStyle} value={form.to_point} onChange={set("to_point")} /></Field>
      <Field label="Cable type">
        <select style={inputStyle} value={form.cable_type} onChange={set("cable_type")}>
          {CABLE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, resize: "none" }} rows={2} value={form.notes} onChange={set("notes")} /></Field>

      <PhotoField
        photoUrl={photoPreview}
        onPhotoSelected={handlePhotoSelected}
        onRemove={removePhoto}
        uploading={photoUploading}
        error={photoError}
      />

      <VoiceNoteField
        audioUrl={audioPreview}
        onRecordingComplete={handleRecordingComplete}
        onRemove={removeAudio}
        uploading={audioUploading}
        error={audioError}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: 12, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Cancel</button>
        <button
          disabled={!form.from_point.trim() || !form.to_point.trim() || busy}
          onClick={() => onSave({ ...form, photo_url: photoUrl, audio_url: audioUrl })}
          style={{ flex: 1, padding: 12, background: ACCENT, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", opacity: form.from_point && form.to_point && !busy ? 1 : 0.4 }}
        >
          {busy ? "Uploading…" : "Save Changes"}
        </button>
      </div>

      {!confirmingDelete ? (
        <button onClick={() => setConfirmingDelete(true)} style={{ width: "100%", padding: 10, background: "none", border: "none", color: "#B3261E", fontSize: 13, cursor: "pointer" }}>
          Delete this cable
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: 12, background: "#FDECE6", borderRadius: 6 }}>
          <p style={{ fontSize: 13, color: INK, marginBottom: 10 }}>Delete {cable.cable_id}? This can't be undone.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmingDelete(false)} style={{ flex: 1, padding: 10, border: `1px solid ${LINE}`, background: "none", borderRadius: 6, color: SLATE, cursor: "pointer" }}>Keep it</button>
            <button onClick={onDelete} style={{ flex: 1, padding: 10, background: "#B3261E", color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CircuitMap({ cables }) {
  const rowH = 44, height = Math.max(150, cables.length * rowH + 30), dbY = height / 2;
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 6, padding: 8, marginBottom: 16 }}>
      <svg width="100%" viewBox={`0 0 340 ${height}`}>
        <rect x="10" y={dbY - 18} width="60" height="36" fill={INK} rx="3" />
        <text x="40" y={dbY + 5} textAnchor="middle" fill={PAPER} fontFamily="monospace" fontSize="9" fontWeight="700">DB</text>
        {cables.map((c, i) => {
          const y = 24 + i * rowH;
          return (
            <g key={c.id}>
              <path d={`M70 ${dbY} L130 ${y}`} stroke={ACCENT} strokeWidth="1.5" fill="none" />
              <circle cx="130" cy={y} r="4" fill={PAPER} stroke={INK} strokeWidth="1.5" />
              <text x="140" y={y - 2} fontFamily="monospace" fontSize="9" fill={INK} fontWeight="700">{c.to_point}</text>
              <text x="140" y={y + 9} fontFamily="monospace" fontSize="8" fill={ACCENT}>{c.cable_id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ReportFloorPlan({ job, cables }) {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const placed = cables.filter(hasPath);
  const toPixels = (points) =>
    points.map((p) => `${(p.x / 100) * imgSize.w},${(p.y / 100) * imgSize.h}`).join(" ");

  return (
    <div style={{ position: "relative", marginBottom: 16, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
      <img
        src={job.floor_plan_url}
        alt="Floor plan"
        onLoad={(e) => setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        style={{ width: "100%", display: "block" }}
      />
      {imgSize.w > 0 && (
        <svg viewBox={`0 0 ${imgSize.w} ${imgSize.h}`} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
          {placed.map((c) => (
            c.path_points.length > 1 ? (
              <polyline
                key={c.id}
                points={toPixels(c.path_points)}
                fill="none"
                stroke={ACCENT}
                strokeWidth={Math.max(imgSize.w, imgSize.h) * 0.006}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <circle
                key={c.id}
                cx={(c.path_points[0].x / 100) * imgSize.w}
                cy={(c.path_points[0].y / 100) * imgSize.h}
                r={Math.max(imgSize.w, imgSize.h) * 0.008}
                fill={ACCENT}
                stroke={PAPER}
                strokeWidth={Math.max(imgSize.w, imgSize.h) * 0.002}
              />
            )
          ))}
        </svg>
      )}
    </div>
  );
}

function ReportView({ job, cables }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()} style={{ flex: 1, padding: 12, background: INK, color: PAPER, border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          Print / Save as PDF
        </button>
        <button onClick={() => exportCablesCSV(job, cables)} style={{ padding: "0 16px", background: "none", border: `1px solid ${LINE}`, color: INK, borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          CSV
        </button>
      </div>
      <div style={{ border: `1.5px solid ${INK}` }}>
        <div style={{ padding: 16, borderBottom: `1.5px solid ${INK}` }}>
          <p style={{ fontSize: 10, fontFamily: "monospace", color: ACCENT, textTransform: "uppercase", margin: 0 }}>Tracewire — Job Record</p>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: INK, margin: "2px 0" }}>As-Built Wiring Documentation</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <TB label="Client / Site" value={`${job.name}, ${job.address}`} border />
          <TB label="Contractor" value={job.contractor || "—"} />
          <TB label="COC Ref" value={job.coc_ref || "—"} border top />
          <TB label="Cables" value={`${cables.length} logged`} top />
        </div>
        <div style={{ padding: 16 }}>
          {job.floor_plan_url && <ReportFloorPlan job={job} cables={cables} />}
          <CircuitMap cables={cables} />
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "From", "To", "Type", "Media"].map((h) => <th key={h} style={{ background: INK, color: PAPER, textAlign: "left", padding: 6, fontSize: 9 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {cables.map((c) => (
                <tr key={c.id}>
                  <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, fontFamily: "monospace", color: ACCENT }}>{c.cable_id}</td>
                  <td style={{ padding: 6, borderBottom: `1px solid ${LINE}` }}>{c.from_point}</td>
                  <td style={{ padding: 6, borderBottom: `1px solid ${LINE}` }}>{c.to_point}</td>
                  <td style={{ padding: 6, borderBottom: `1px solid ${LINE}`, fontFamily: "monospace", color: SLATE }}>{c.cable_type}</td>
                  <td style={{ padding: 6, borderBottom: `1px solid ${LINE}` }}>
                    {c.photo_url && <img src={c.photo_url} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 3, marginRight: 4 }} />}
                    {c.audio_url && <span title="Voice note attached">🎙️</span>}
                    {!c.photo_url && !c.audio_url && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${LINE}`, fontSize: 11, color: SLATE }}>
          This cable log supports the diagram and photographic evidence requirements of the SANS 10142-1 test report{job.coc_ref ? ` accompanying ${job.coc_ref}` : ""}.
        </div>
      </div>
    </div>
  );
}

function TB({ label, value, border, top }) {
  return (
    <div style={{ padding: 10, borderRight: border ? `1px solid ${LINE}` : "none", borderTop: top ? `1px solid ${LINE}` : "none" }}>
      <p style={{ fontSize: 9, fontFamily: "monospace", color: SLATE, textTransform: "uppercase", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: "2px 0 0" }}>{value}</p>
    </div>
  );
}
