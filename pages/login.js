import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signup"); // signin | signup
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        router.push("/");
      } else {
        setMessage("Almost there! Check your email and tap the confirmation link, then come back here to sign in.");
        setMode("signin");
        setPassword("");
      }
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontWeight: 800 }}>Tracewire</h1>
      <p style={{ color: "#68707B", fontSize: 14, marginBottom: 24 }}>
        {mode === "signin" ? "Sign in to your account" : "Create your contractor account"}
      </p>

      {message && (
        <p style={{ color: "#2E7D4F", fontSize: 13, background: "#EAF6EE", padding: 10, borderRadius: 6, marginBottom: 14 }}>
          {message}
        </p>
      )}

      <form onSubmit={submit}>
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #D9DDE2", borderRadius: 6 }}
        />
        <input
          type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #D9DDE2", borderRadius: 6 }}
        />
        {error && <p style={{ color: "#E8622C", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{
          width: "100%", padding: 12, background: "#1B2A41", color: "#fff",
          border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer"
        }}>
          {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
      </form>
      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setError(""); }}
        style={{ marginTop: 14, fontSize: 13, background: "none", border: "none", color: "#68707B", cursor: "pointer" }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
      {mode === "signin" && (
        <button
          onClick={() => router.push("/forgot-password")}
          style={{ marginTop: 10, fontSize: 12, background: "none", border: "none", color: "#68707B", cursor: "pointer", display: "block" }}
        >
          Forgot password?
        </button>
      )}
    </div>
  );
}
