import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h1 style={{ fontWeight: 800 }}>Set a new password</h1>

      {done ? (
        <p style={{ color: "#2E7D4F", fontSize: 14, background: "#EAF6EE", padding: 12, borderRadius: 6 }}>
          Password updated — taking you into Tracewire…
        </p>
      ) : !ready ? (
        <p style={{ color: "#68707B", fontSize: 14 }}>
          Confirming your reset link… If this doesn't update in a few seconds, the link may have expired — request a new one.
        </p>
      ) : (
        <form onSubmit={submit}>
          <input
            type="password" required placeholder="New password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #D9DDE2", borderRadius: 6 }}
          />
          <input
            type="password" required placeholder="Confirm new password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #D9DDE2", borderRadius: 6 }}
          />
          {error && <p style={{ color: "#E8622C", fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: 12, background: "#1B2A41", color: "#fff",
            border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer"
          }}>
            {loading ? "Updating…" : "Update Password"}
          </button>
        </form>
      )}
    </div>
  );
}
