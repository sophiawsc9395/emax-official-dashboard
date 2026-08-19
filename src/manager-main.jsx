import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import BossApp from './pages/viewers/BossViewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// Manager viewer — same view-only Overview/Rankings/Points/Monthly Report/
// Repair & Service/RTO Summary as the Boss viewer, but its own dedicated
// entry point/link rather than sharing boss.html. Order Tracking's admin
// level comes from whatever order-page role(s) this email holds in
// auth/orderRoles.js (Remove Completed still stays super-admin-only,
// enforced inside OrderTab.jsx regardless of which page hosts it).
const ALLOWED = ["boontheng2004@gmail.com", "sophiawsc9395@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BossApp elevateOrderAccess={true} />
    </AuthGate>
    <SpeedInsights />
  </React.StrictMode>
)
