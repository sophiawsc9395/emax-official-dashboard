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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null))
    Promise.all([loadData(BM_KEY), loadData(SR_KEY)]).then(([bm, sr]) => {
      if (bm && Object.keys(bm).length) setBranchMeta({ ...DEFAULT_BRANCH_META, ...bm })
      if (Array.isArray(sr)) setSrList(sr)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading || !email) {
    return <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0A1628", fontFamily:"Inter,sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontWeight:900, fontSize:18, color:"#fff", letterSpacing:"0.06em" }}>EMAX NETWORK</div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", letterSpacing:"0.15em", textTransform:"uppercase", marginTop:8 }}>Loading...</div>
      </div>
    </div>
  }

  const orderPermissions = mergeOrderPermissions(email)

  return (
    <div style={{ minHeight:"100vh", background:"#F7F9FC", fontFamily:"Inter,-apple-system,sans-serif" }}>
      {/* Top bar — same navy chrome as the main dashboard */}
      <div style={{ background:"#0A1628", borderBottom:"1px solid #162B52", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight:48, gap:8, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
              <div>
                <div style={{ fontWeight:900, fontSize:12, color:"#fff", letterSpacing:"0.06em", lineHeight:1 }}>EMAX NETWORK</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap", rowGap:6 }}>
              <button onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?"Collapse menu":"Expand menu"}
                style={{ display:"flex", alignItems:"center", justifyContent:"center", width:30, height:30, border:"1px solid rgba(255,255,255,.15)", borderRadius:7, background:"rgba(255,255,255,.06)", cursor:"pointer", flexShrink:0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", maxWidth:1400, margin:"0 auto" }}>
        {/* MAIN CONTENT */}
        <div style={{ flex:1, minWidth:0, padding:"20px", maxWidth:1180 }}>
          <OrderTab branchMeta={branchMeta} isAdmin={true} srList={srList} isReadOnly={false} orderPermissions={orderPermissions} />
        </div>

        {/* SIDEBAR — right side, collapsible, same treatment as the main dashboard's */}
        <div style={{
          width:sidebarOpen?220:0, flexShrink:0, overflow:"hidden",
          transition:"width .2s ease", background:"#0F1B30", borderLeft:sidebarOpen?"1px solid #1C2D4A":"none",
          minHeight:"calc(100vh - 49px)", position:"sticky", top:49, alignSelf:"flex-start",
        }}>
          <div style={{ width:220, padding:"16px 10px", visibility:sidebarOpen?"visible":"hidden" }}>
            <div style={{ padding:"9px 12px", marginBottom:3, fontSize:11, color:"rgba(255,255,255,.35)", wordBreak:"break-all" }}>{email}</div>
            <div style={{ width:"100%", height:1, background:"rgba(255,255,255,.08)", margin:"6px 0 10px" }}/>
            <button onClick={()=>supabase.auth.signOut()} style={{
              display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", padding:"9px 12px",
              border:"none", cursor:"pointer", fontFamily:"Inter,sans-serif", fontWeight:600, fontSize:12, borderRadius:8,
              background:"transparent", color:"rgba(255,255,255,.45)", transition:"background .15s",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign Out
            </button>
          </div>
        </div>
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
