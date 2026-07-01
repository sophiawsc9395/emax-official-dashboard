import { useState } from "react";
import { supabase } from "../storage/index.js";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#0A1628;}
  .input{width:100%;padding:10px 14px;border:1px solid #2D3E55;borderRadius:8px;background:#162035;color:#fff;font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color .15s;}
  .input:focus{border-color:#1E6FDB;}
  .input::placeholder{color:rgba(255,255,255,.3);}
`;

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (authError) {
      setError("Invalid email or password. Please try again.");
      return;
    }
    if (onLogin) onLogin(data.session);
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0A1628", padding: 20,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: "0.06em" }}>
              EMAX NETWORK
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Sales Performance Dashboard
            </div>
          </div>

          {/* Card */}
          <div style={{
            background: "#0F1E35", border: "1px solid #1C2D4A",
            borderRadius: 16, padding: "32px 28px",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 24 }}>
              Sign in to continue
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Email
                </label>
                <input
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Password
                </label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div style={{
                  background: "#3B1219", border: "1px solid #F0354B33",
                  borderRadius: 8, padding: "10px 14px", fontSize: 12,
                  color: "#F0354B", marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 8,
                  border: "none", cursor: loading ? "wait" : "pointer",
                  background: loading || !email || !password ? "#1C2D4A" : "#1E6FDB",
                  color: loading || !email || !password ? "rgba(255,255,255,.35)" : "#fff",
                  fontFamily: "'Inter',sans-serif", fontWeight: 700,
                  fontSize: 14, transition: "background .15s",
                }}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,.2)" }}>
            Contact your administrator if you need access.
          </div>
        </div>
      </div>
    </>
  );
}
