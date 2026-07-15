import { useRouter } from "next/router";

const INK = "#1B2A41", ACCENT = "#E8622C", SLATE = "#68707B", PAPER = "#FAF9F6", PANEL = "#EFF2F5", LINE = "#D9DDE2";

export default function Welcome() {
  const router = useRouter();

  const features = [
    {
      title: "Tag cables as you install them",
      body: "Tap your phone to an NFC tag on each cable and log where it runs from and to — takes seconds, right there on site.",
    },
    {
      title: "Your circuit map builds itself",
      body: "No extra drawing. Every cable you log adds itself to a clean, automatic wiring diagram for the job.",
    },
    {
      title: "COC-ready reports, done for you",
      body: "Generate a printable as-built report that supports the diagram and photo evidence your SANS 10142-1 test report already needs.",
    },
    {
      title: "One QR code on the DB board",
      body: "Stick it on the board when you're done. Any electrician who opens that board later can scan it and see the full wiring history — no login needed.",
    },
  ];

  return (
    <div style={{ background: "#E7E5DF", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: PAPER }}>

        <div style={{ background: INK, padding: "48px 24px 36px", textAlign: "center" }}>
          <img src="/apple-touch-icon.png" alt="Tracewire" style={{ width: 72, height: 72, borderRadius: 16, marginBottom: 16 }} />
          <h1 style={{ color: PAPER, fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>Tracewire</h1>
          <p style={{ color: "#B8C0CC", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Know every cable. Prove every job.
          </p>
        </div>

        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: SLATE, lineHeight: 1.6, marginBottom: 28 }}>
            Tracewire is a free tool for electricians to document wiring as they work —
            tag cables on site, build a wiring record automatically, and hand over proof
            of the job that actually holds up later.
          </p>

          {features.map((f) => (
            <div key={f.title} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${LINE}` }}>
              <p style={{ fontWeight: 700, color: INK, fontSize: 15, margin: "0 0 4px" }}>{f.title}</p>
              <p style={{ fontSize: 13, color: SLATE, margin: 0, lineHeight: 1.5 }}>{f.body}</p>
            </div>
          ))}

          <button
            onClick={() => router.push("/login")}
            style={{
              width: "100%", padding: 14, background: ACCENT, color: PAPER,
              border: "none", borderRadius: 6, fontWeight: 700, fontSize: 15,
              cursor: "pointer", marginTop: 8,
            }}
          >
            Get Started — It's Free
          </button>

          <p style={{ fontSize: 11, color: SLATE, textAlign: "center", marginTop: 14 }}>
            Scanned this from a Tracewire tag bag? You're in the right place.
          </p>
        </div>

      </div>
    </div>
  );
}
