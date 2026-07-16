import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h1 style={{ fontWeight: 800 }}>Reset your password</h1>

      {sent ? (
        <>
          <p style={{ color: "#2E7D4F", fontSize: 14, background: "#EAF6EE", padding: 12, borderRadius: 6, marginBottom: 16 }}>
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
          <button onClick={() => router.push("/login")} style={{ background: "none", border: "none", color: "#68707B", fontSize: 13, cursor: "pointer" }}>
            ← Back to sign in
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p style={{ color: "#68707B", fontSize: 14, marginBottom: 20 }}>
            Enter the email on your account and we'll send you a link to set a new password.
          </p>
          <input
            type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #D9DDE2", borderRadius: 6 }}
          />
          {error && <p style={{ color: "#E8622C", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: 12, background: "#1B2A41", color: "#fff",
            border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer"
          }}>
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            style={{ marginTop: 14, fontSize: 13, background: "none", border: "none", color: "#68707B", cursor: "pointer", display: "block" }}
          >
            ← Back to sign in
          </button>
        </form>
      )}
    </div>
  );
}
