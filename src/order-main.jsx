import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import OrderTab from './OrderTab.jsx'
import AuthGate from './auth/AuthGate.jsx'
import { mergeOrderPermissions, ORDER_USER_ROLES } from './auth/orderRoles.js'
import { supabase, loadData } from './storage/index.js'

// Only emails with a role in orderRoles.js can even reach this page.
const ALLOWED = Object.keys(ORDER_USER_ROLES)

const SR_KEY = "emax_v5_sr_list", BM_KEY = "emax_v5_branch_meta"

const DEFAULT_BRANCH_META = {
  KM:{name:"EMAX Kota Marudu",manager:"SUHAINIZAM",mStatus:"Confirmed (P5 F0)"},
  T1:{name:"EMAX Tuaran",manager:"REX WENMIN",mStatus:"Confirmed (P5 F0)"},
  TW2:{name:"EMAX Tawau 2",manager:"TONY YONG",mStatus:"Confirmed (P5 F0)"},
  TW1:{name:"EMAX Tawau 1",manager:"MAX SIEW",mStatus:"Director"},
  LD:{name:"EMAX Lahad Datu",manager:"SHAHRUL",mStatus:"Confirmed (P3 F0)"},
  KB:{name:"EMAX Kota Belud",manager:"MAHADI",mStatus:"Confirmed (P2 F3)"},
  T5:{name:"EMAX CKS",manager:"SUHAIDI",mStatus:"Confirmed (P0 F2)"},
  ITCC:{name:"EMAX ITCC",manager:"SUHAIDI",mStatus:"Confirmed (P0 F1)"},
  TENOM:{name:"EMAX Tenom",manager:"AZIQIL",mStatus:"Probation (P1 F1)"},
  HQ:{name:"EMAX HQ",manager:"MIKE PANG",mStatus:"Confirmed (P0 F1)"},
}

function OrderOnlyApp(){
  const [email, setEmail] = useState(null)
  const [branchMeta, setBranchMeta] = useState(DEFAULT_BRANCH_META)
  const [srList, setSrList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null))
    Promise.all([loadData(BM_KEY), loadData(SR_KEY)]).then(([bm, sr]) => {
      if (bm && Object.keys(bm).length) setBranchMeta({ ...DEFAULT_BRANCH_META, ...bm })
      if (Array.isArray(sr)) setSrList(sr)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading || !email) {
    return <div style={{ minHeight: "100vh", background: "#F7F9FC", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", color: "#8A96A8", fontSize: 13 }}>Loading…</div>
  }

  const orderPermissions = mergeOrderPermissions(email)

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", padding: "20px 20px 60px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#0A1628", fontFamily: "Inter,sans-serif" }}>EMAX NETWORK — Order Tracking</div>
          <button onClick={() => supabase.auth.signOut()} style={{ fontSize: 12, color: "#8A96A8", background: "none", border: "1px solid #E4EAF2", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Sign out ({email})
          </button>
        </div>
        <OrderTab branchMeta={branchMeta} isAdmin={true} srList={srList} isReadOnly={false} orderPermissions={orderPermissions} />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate allowedEmails={ALLOWED}>
      <OrderOnlyApp />
    </AuthGate>
  </React.StrictMode>
)
