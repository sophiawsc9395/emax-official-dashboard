import React from 'react'
import ReactDOM from 'react-dom/client'
import BranchApp from './pages/viewers/BranchTW1Viewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// TW1 branch
const ALLOWED = ["wingfeii@gmail.com", "sophiawsc9395@gmail.com", "boontheng2004@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BranchApp />
    </AuthGate>
  </React.StrictMode>
)
