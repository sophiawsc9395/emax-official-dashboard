import React from 'react'
import ReactDOM from 'react-dom/client'
import { SpeedInsights } from '@vercel/speed-insights/react'
import BossApp from './pages/viewers/BossViewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// Boss viewer
const ALLOWED = ["wingfeii@gmail.com", "sophiawsc9395@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BossApp />
    </AuthGate>
    <SpeedInsights />
  </React.StrictMode>
)
