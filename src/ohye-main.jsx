import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import AuthGate from './auth/AuthGate.jsx'
import { supabase } from './storage/index.js'
import POSPreview from './ohye/POSPreview.jsx'

// OHYE! POS — separate business from EMAX Network, hosted on this same
// project purely because this is the working auth backend already in
// place. Both Sophia and kennethc.interior@gmail.com get full, normal
// interactive admin access. The view-only overlay code below still exists
// for any future account added to ALLOWED but not ADMIN_EMAILS — an
// invisible overlay blocks every click/keystroke for that case, rather
// than threading a read-only prop through the whole 2000-line preview
// component (it was built as a fully self-contained interactive demo with
// no props at all, so blocking interaction from the outside is far safer
// than rewiring its internals).
const ALLOWED = ["sophiawsc9395@gmail.com", "kennethc.interior@gmail.com"]
const ADMIN_EMAILS = ["kennethc.interior@gmail.com", "sophiawsc9395@gmail.com"]

function OhyeApp() {
  const [email, setEmail] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail((data.session?.user?.email || '').toLowerCase())
    })
  }, [])

  const isAdmin = ADMIN_EMAILS.includes(email)
  const isViewOnly = email !== null && !isAdmin

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <POSPreview />
      {isViewOnly && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 99998,
              cursor: 'default', background: 'transparent',
            }}
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onKeyDown={(e) => e.preventDefault()}
          />
          <div
            style={{
              position: 'fixed', top: 10, right: 10, zIndex: 99999,
              background: '#0A1628', color: '#fff', fontFamily: 'Inter,sans-serif',
              fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 20,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              boxShadow: '0 2px 8px rgba(0,0,0,.25)', pointerEvents: 'none',
            }}
          >
            View Only
          </div>
        </>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <OhyeApp />
    </AuthGate>
  </React.StrictMode>
)
