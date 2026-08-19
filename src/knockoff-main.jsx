import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import BossApp from './pages/viewers/BossViewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// Knock-off role — pure viewer of Overview and Monthly Report (same
// read-only reporting as the other restricted viewers), PLUS full admin
// access to Daily Entry, which no other viewer-tier account gets, PLUS
// Order Tracking scoped to this role's existing step-level permissions —
// the same ones they already have logging in via order.html, merged in
// here so this one link covers everything instead of needing two separate
// logins. Everything else (Rankings, Reward Point Ranking, Daily Sales
// Report, JCL Applications, Repair & Service, RTO Summary, Purchase
// Order) is hidden entirely for this account.
const ALLOWED = ["emaxknockoff@gmail.com", "sophiawsc9395@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BossApp isKnockOff={true} />
    </AuthGate>
    <SpeedInsights />
  </React.StrictMode>
)
