import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import BossApp from './pages/viewers/BossViewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// HR — pure viewer of Overview/Rankings/Points Ranking/Monthly Report (same
// read-only reporting as the Boss viewer), PLUS full Manage SR and Set
// Targets admin access, which no other viewer-tier account gets. Everything
// else (Order Tracking, Daily Sales Report, JCL Applications, Repair &
// Service, RTO Summary) is hidden entirely for this account — HR's job here
// is staff composition and targets, not day-to-day sales ops.
const ALLOWED = ["emaxhr@gmail.com", "sophiawsc9395@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BossApp isHR={true} />
    </AuthGate>
    <SpeedInsights />
  </React.StrictMode>
)
