import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import App from "../components/App";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => { check(); }, []);

  async function check() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/login");
      return;
    }
    setUser(session.user);
    setReady(true);
  }

  if (!ready) {
    return <p style={{ textAlign: "center", marginTop: 100, fontFamily: "sans-serif", color: "#68707B" }}>Loading…</p>;
  }

  return <App user={user} />;
}
