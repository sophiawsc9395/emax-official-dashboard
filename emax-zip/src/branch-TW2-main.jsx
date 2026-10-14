import React from 'react'
import ReactDOM from 'react-dom/client'
import BranchApp from './pages/viewers/BranchTW2Viewer.jsx'
import AuthGate from './auth/AuthGate.jsx'

// TW2 branch
const ALLOWED = ["ahzhong2000@gmail.com", "sophiawsc9395@gmail.com", "wingfeii@gmail.com", "boontheng2004@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <BranchApp />
    </AuthGate>
  </React.StrictMode>
)
