import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import JCLTab from './JCLTab.jsx'
import AuthGate from './auth/AuthGate.jsx'
import { supabase, loadData } from './storage/index.js'

// Admin/Manager — full manage access (submit to JCL, request follow-up,
// approve/reject, sees every branch). Boss Viewer is deliberately NOT here —
// same view-only-vs-elevated split as Daily Sales Report (Manager gets
// elevated access there too, Boss doesn't).
const JCL_ADMIN_EMAILS = ["sophiawsc9395@gmail.com", "boontheng2004@gmail.com"]

// Read-only across every branch, no submit/manage actions, no branch picker
// — Boss Viewer.
const JCL_VIEWER_EMAILS = ["wingfeii@gmail.com"]

// Everyone who should be able to log into this page at all — admins/viewers
// above, plus every branch email that should be able to submit a New
// Application. This list is almost certainly incomplete for branch staff —
// add the real branch emails here as you roll this out.
const ALLOWED = [
  ...JCL_ADMIN_EMAILS, ...JCL_VIEWER_EMAILS,
  "emaxbilling@gmail.com", "emaxknockoff@gmail.com", "emaxpurchase@gmail.com", "emaxstock@gmail.com",
  "eddy.suhaidi61@gmail.com",
]

const BM_KEY = "emax_v5_branch_meta"
const JCL_BRANCH_SESSION_KEY = "jcl_selected_branch"

const DEFAULT_BRANCH_META = {
  KM:{name:"EMAX Kota Marudu"}, T1:{name:"EMAX Tuaran"}, TW2:{name:"EMAX Tawau 2"},
  TW1:{name:"EMAX Tawau 1"}, LD:{name:"EMAX Lahad Datu"}, KB:{name:"EMAX Kota Belud"},
  T5:{name:"EMAX CKS"}, ITCC:{name:"EMAX ITCC"}, TENOM:{name:"EMAX Tenom"}, HQ:{name:"EMAX HQ"}, SDK:{name:"EC SDK"},
}
// HQ/SDK aren't real selling branches — excluded from the branch picker,
// same convention as Daily Sales Report.
const sellingBranches = (bm) => Object.keys(bm || {}).filter(b => b !== "HQ" && b !== "SDK")

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#F7F9FC;color:#0A1628;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-thumb{background:#CDD5E0;border-radius:3px;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fade-in{animation:fadeIn .25s ease forwards;}
`

function JCLApp(){
  const [email, setEmail] = useState(null)
  const [branchMeta, setBranchMeta] = useState(DEFAULT_BRANCH_META)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState(() => {
    // A branch viewer's sidebar link passes ?branch=T5 so their own staff
    // never have to manually pick — falls back to whatever was remembered
    // for this browser session otherwise.
    const fromUrl = new URLSearchParams(window.location.search).get("branch")
    if (fromUrl) { sessionStorage.setItem(JCL_BRANCH_SESSION_KEY, fromUrl); return fromUrl }
    return sessionStorage.getItem(JCL_BRANCH_SESSION_KEY) || ""
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null))
    loadData(BM_KEY).then((bm) => {
      if (bm && Object.keys(bm).length) {
        const merged = { ...DEFAULT_BRANCH_META, ...bm }
        setBranchMeta(merged)
      }
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

  const isAdmin = JCL_ADMIN_EMAILS.map(e=>e.toLowerCase()).includes(email.toLowerCase())
  const isGlobalViewer = JCL_VIEWER_EMAILS.map(e=>e.toLowerCase()).includes(email.toLowerCase())

  // Branch (non-admin, non-global-viewer) sessions pick which branch they're
  // submitting for once per browser session — this app's access control is
  // primarily "who is allowed to log in at all" (same trust model as the
  // rest of the app), not a hard per-branch lock at this layer.
  if (!isAdmin && !isGlobalViewer && !selectedBranch) {
    return <div style={{ minHeight:"100vh", background:"#F7F9FC", fontFamily:"Inter,-apple-system,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <style>{CSS}</style>
      <div style={{ background:"#fff", border:"1px solid #E4EAF2", borderRadius:12, padding:24, maxWidth:360, width:"100%" }}>
        <div style={{ fontWeight:800, fontSize:14, color:"#0A1628", marginBottom:4 }}>Which branch are you?</div>
        <div style={{ fontSize:11, color:"#8A96A8", marginBottom:14 }}>This is remembered for this browser session.</div>
        <select onChange={(e)=>{ if(!e.target.value)return; sessionStorage.setItem(JCL_BRANCH_SESSION_KEY, e.target.value); setSelectedBranch(e.target.value) }} defaultValue="" style={{ width:"100%", padding:"9px 11px", border:"1px solid #E4EAF2", borderRadius:8, fontSize:13, fontFamily:"Inter,sans-serif" }}>
          <option value="">Choose your branch…</option>
          {sellingBranches(branchMeta).map(b => <option key={b} value={b}>{branchMeta[b]?.name || b}</option>)}
        </select>
      </div>
    </div>
  }

  return (
    <div style={{ minHeight:"100vh", background:"#F7F9FC", fontFamily:"Inter,-apple-system,sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ background:"#0A1628", borderBottom:"1px solid #162B52", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight:48, gap:8, flexWrap:"wrap" }}>
            <div style={{ fontWeight:900, fontSize:12, color:"#fff", letterSpacing:"0.06em" }}>EMAX NETWORK — JCL APPLICATIONS</div>
            <button onClick={()=>setSidebarOpen(o=>!o)} style={{ display:"flex", alignItems:"center", justifyContent:"center", width:30, height:30, border:"1px solid rgba(255,255,255,.15)", borderRadius:7, background:"rgba(255,255,255,.06)", cursor:"pointer" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display:"flex", maxWidth:1200, margin:"0 auto" }}>
        <div style={{ flex:1, minWidth:0, padding:"20px", maxWidth:1000 }} className="fade-in">
          <JCLTab branchMeta={branchMeta} isAdmin={isAdmin} userBranch={(isAdmin||isGlobalViewer) ? null : selectedBranch} />
        </div>

        <div style={{
          width:sidebarOpen?220:0, flexShrink:0, overflow:"hidden",
          transition:"width .2s ease", background:"#0F1B30", borderLeft:sidebarOpen?"1px solid #1C2D4A":"none",
          minHeight:"calc(100vh - 49px)", position:"sticky", top:49, alignSelf:"flex-start",
        }}>
          <div style={{ width:220, padding:"16px 10px", visibility:sidebarOpen?"visible":"hidden" }}>
            <div style={{ padding:"9px 12px", marginBottom:3, fontSize:11, color:"rgba(255,255,255,.35)", wordBreak:"break-all" }}>{email}</div>
            {!isAdmin && !isGlobalViewer && <div style={{ padding:"0 12px 9px", fontSize:11, color:"rgba(255,255,255,.35)" }}>Branch: {branchMeta[selectedBranch]?.name || selectedBranch}</div>}
            <div style={{ width:"100%", height:1, background:"rgba(255,255,255,.08)", margin:"6px 0 10px" }}/>
            {!isAdmin && !isGlobalViewer && <button onClick={()=>{ sessionStorage.removeItem(JCL_BRANCH_SESSION_KEY); setSelectedBranch("") }} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", padding:"9px 12px", border:"none", cursor:"pointer", fontFamily:"Inter,sans-serif", fontWeight:600, fontSize:12, borderRadius:8, background:"transparent", color:"rgba(255,255,255,.45)", marginBottom:4 }}>Change Branch</button>}
            <button onClick={()=>supabase.auth.signOut()} style={{
              display:"flex", alignItems:"center", gap:8, width:"100%", textAlign:"left", padding:"9px 12px",
              border:"none", cursor:"pointer", fontFamily:"Inter,sans-serif", fontWeight:600, fontSize:12, borderRadius:8,
              background:"transparent", color:"rgba(255,255,255,.45)",
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
      <JCLApp />
    </AuthGate>
  </React.StrictMode>
)
