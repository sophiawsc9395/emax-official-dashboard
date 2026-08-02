/**
 * AuthGate — wraps any page and enforces Supabase authentication.
 *
 * Usage:
 *   <AuthGate allowedEmails={["admin@emax.com"]}>
 *     <App />
 *   </AuthGate>
 *
 * allowedEmails: if provided, only those specific email addresses can see
 *   this page. Anyone logged in with a different account is shown an
 *   "Access Denied" screen instead. Omit it to allow all authenticated users.
 */
import { useState, useEffect } from "react";
import { supabase } from "../storage/index.js";
import LoginPage from "./LoginPage.jsx";
import ResetPasswordPage from "./ResetPasswordPage.jsx";

export default function AuthGate({ children, allowedEmails }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    // Listen for sign-in / sign-out / password-recovery events. Clicking a
    // Supabase "reset password" email link lands back on this page and fires
    // a PASSWORD_RECOVERY event with a temporary session — that's the signal
    // to show the "set new password" form instead of the normal login/app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Still checking session — show nothing (avoids flash of login page)
  if (session === undefined) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0A1628",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ color: "rgba(255,255,255,.3)", fontSize: 13, fontFamily: "Inter,sans-serif" }}>
          Loading…
        </div>
      </div>
    );
  }

  // Arrived via a password-recovery link — let them set a new password
  // before anything else happens.
  if (isRecovery) {
    return <ResetPasswordPage onDone={() => setIsRecovery(false)} />;
  }

  // Not logged in — show login page
  if (!session) {
    return <LoginPage onLogin={setSession} />;
  }

  // Logged in but wrong account for this page
  const userEmail = (session.user.email || "").toLowerCase();
  if (allowedEmails && !allowedEmails.some(e => e.toLowerCase() === userEmail)) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0A1628",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Inter,sans-serif", flexDirection: "column", gap: 16,
      }}>
        
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Access Denied</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", textAlign: "center", maxWidth: 320 }}>
          Your account ({session.user.email}) does not have permission to view this page.
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            marginTop: 8, padding: "8px 20px", borderRadius: 8,
            border: "1px solid #2D3E55", background: "transparent",
            color: "rgba(255,255,255,.5)", cursor: "pointer",
            fontFamily: "Inter,sans-serif", fontSize: 13,
          }}
        >
          Sign out and try a different account
        </button>
      </div>
    );
  }

  // Logged in and authorised — render the page
  return children;
}
