import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
   const debugUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin"); // signin | signup
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fn = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { error } = await fn;
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ fontWeight: 800 }}>Tracewire</h1>
            <p style={{ fontSize: 11, color: "red", wordBreak: "break-all" }}>DEBUG: {debugUrl || "MISSING"}</p>

  <p style={{ color: "#68707B", fontSize: 14, marginBottom: 24 }}>
        {mode === "signin" ? "Sign in to your account" : "Create your contractor account"}
      </p>
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
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        style={{ marginTop: 14, fontSize: 13, background: "none", border: "none", color: "#68707B", cursor: "pointer" }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
