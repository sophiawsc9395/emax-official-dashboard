import { useEffect, useState } from "react";
import { supabase } from "../storage/index.js";

function getAllowedPath(profile) {
  if (profile.role === "super_admin") return "/";
  if (profile.role === "boss") return "/boss.html";
  if (profile.role === "branch_manager") return `/branch-${profile.branch}.html`;
  return "/";
}

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function loadProfile(user) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      setErrorMsg("No role assigned. Please contact admin.");
      return null;
    }

    setProfile(data);

    const allowedPath = getAllowedPath(data);
    const currentPath = window.location.pathname;

    if (data.role !== "super_admin" && currentPath !== allowedPath) {
      window.location.href = allowedPath;
      return data;
    }

    return data;
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);

      if (data.session?.user) {
        await loadProfile(data.session.user);
      }

      setLoading(false);
    }

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user) {
          await loadProfile(newSession.user);
        } else {
          setProfile(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setErrorMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data.user) {
      const userProfile = await loadProfile(data.user);
      if (userProfile) {
        window.location.href = getAllowedPath(userProfile);
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Loading...</div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div style={styles.page}>
        <form onSubmit={handleLogin} style={styles.card}>
          <div style={styles.logo}>EMAX NETWORK</div>
          <div style={styles.subtitle}>Sales Performance Dashboard</div>

          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {errorMsg && <div style={styles.error}>{errorMsg}</div>}

          <button style={styles.button} type="submit">
            Unlock Dashboard
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div style={styles.logoutBar}>
        <span>
          Logged in as <b>{profile.email}</b> ({profile.role}
          {profile.branch ? ` - ${profile.branch}` : ""})
        </span>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>
      {children}
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0A1628",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, Arial, sans-serif",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 20px 50px rgba(0,0,0,.25)",
  },
  logo: {
    fontWeight: 900,
    fontSize: 22,
    color: "#0A1628",
    textAlign: "center",
    letterSpacing: ".08em",
  },
  subtitle: {
    fontSize: 12,
    color: "#8A96A8",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
    textTransform: "uppercase",
    letterSpacing: ".08em",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: 12,
    border: "1.5px solid #E4EAF2",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
  },
  button: {
    width: "100%",
    padding: "12px 14px",
    border: "none",
    borderRadius: 10,
    background: "#1E6FDB",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    marginTop: 6,
  },
  error: {
    background: "#FEE2E2",
    color: "#B91C1C",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
  logoutBar: {
    background: "#0A1628",
    color: "#fff",
    padding: "8px 16px",
    fontSize: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  logoutBtn: {
    background: "#fff",
    color: "#0A1628",
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    cursor: "pointer",
    fontWeight: 700,
  },
};