import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import BranchApp from './pages/viewers/BranchLDViewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// LD branch
const ALLOWED = ["shahruliz0209@gmail.com", "sophiawsc9395@gmail.com", "wingfeii@gmail.com", "boontheng2004@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BranchApp />
    </AuthGate>
    <SpeedInsights />
  </React.StrictMode>
)
