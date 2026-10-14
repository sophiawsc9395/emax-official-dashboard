import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './auth/AuthGate.jsx'

// Dashboard — admin only
const ALLOWED = ["sophiawsc9395@gmail.com"]

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <App />
    </AuthGate>
  </React.StrictMode>
)
