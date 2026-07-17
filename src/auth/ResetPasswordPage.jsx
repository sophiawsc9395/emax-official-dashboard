/**
 * ResetPasswordPage — shown instead of the normal app when the user arrives
 * via a Supabase password-recovery link (e.g. from "Send password recovery
 * email" in the Supabase dashboard, or a self-service "forgot password"
 * flow). Supabase signs them into a temporary recovery session and fires a
 * PASSWORD_RECOVERY auth event — AuthGate.jsx watches for that and renders
 * this page instead of the login form or the app itself.
 */
import { useState } from "react";
import { supabase } from "../storage/index.js";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#0A1628;}
  .input{width:100%;padding:10px 14px;border:1px solid #2D3E55;border-radius:8px;background:#162035;color:#fff;font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color .15s;}
  .input:focus{border-color:#1E6FDB;}
  .input::placeholder{color:rgba(255,255,255,.3);}
`;

export default function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message || "Could not update password. Please try the reset link again."); return; }
    setDone(true);
    setTimeout(() => { if (onDone) onDone(); }, 1800);
  };

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#0A1628", padding: 20,
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: "0.06em" }}>
              EMAX NETWORK
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 4, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Reset Password
            </div>
          </div>

          <div style={{
            background: "#0F1E35", border: "1px solid #1C2D4A",
            borderRadius: 16, padding: "32px 28px",
          }}>
            {done ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#00C896", marginBottom: 8 }}>
                  ✓ Password updated
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>
                  Taking you back to sign in…
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                  Set a new password
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 24 }}>
                  Choose a new password for your account.
                </div>

                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      New Password
                    </label>
                    <input
                      className="input"
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password"
                      autoFocus
                    />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Confirm Password
                    </label>
                    <input
                      className="input"
                      type="password"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      autoComplete="new-password"
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
                    disabled={loading || !password || !confirm}
                    style={{
                      width: "100%", padding: "11px 0", borderRadius: 8,
                      border: "none", cursor: loading ? "wait" : "pointer",
                      background: loading || !password || !confirm ? "#1C2D4A" : "#1E6FDB",
                      color: loading || !password || !confirm ? "rgba(255,255,255,.35)" : "#fff",
                      fontFamily: "'Inter',sans-serif", fontWeight: 700,
                      fontSize: 14, transition: "background .15s",
                    }}
                  >
                    {loading ? "Updating…" : "Update Password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
