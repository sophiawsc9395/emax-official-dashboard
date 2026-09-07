import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import WarrantyTab from './WarrantyTab.jsx'
import StockWriteOffTab from './StockWriteOffTab.jsx'
import AuthGate from './auth/AuthGate.jsx'
import { supabase, loadData } from './storage/index.js'

// Dedicated page for emaxwarranty@gmail.com — she couldn't reliably reach
// Warranty/Stock Write-off through boss.html (a shared, multi-role page
// with several gates layered on top of each other), so this page exists
// solely for her, with both pages grouped under one menu, matching the
// same look as ccm.html (emaxjcl@gmail.com's own dedicated page).
const ALLOWED = ["emaxwarranty@gmail.com", "sophiawsc9395@gmail.com"]

const SR_KEY = "emax_v5_sr_list", BM_KEY = "emax_v5_branch_meta"

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#F7F9FC;color:#0A1628;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-thumb{background:#CDD5E0;border-radius:3px;}
  .card{background:#fff;border:1px solid #E4EAF2;border-radius:12px;box-shadow:0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04);transition:box-shadow .2s,transform .2s;}
  .card:hover{box-shadow:0 4px 16px rgba(10,22,40,.10);}
  .btn{border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.01em;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
  .input{width:100%;padding:8px 12px;border:1.5px solid #E4EAF2;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;color:#0A1628;outline:none;transition:border-color .15s;background:#fff;}
  .input:focus{border-color:#1E6FDB;box-shadow:0 0 0 3px rgba(30,111,219,.12);}
  .select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238A96A8'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fade-in{animation:fadeIn .25s ease forwards;}
  .progress-bar-fill{transition:width .8s cubic-bezier(.4,0,.2,1);}
  .modal-overlay{position:fixed;inset:0;background:rgba(10,22,40,.65);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;}
  tfoot td{white-space:nowrap!important;}
  thead th{white-space:nowrap!important;}
  @media (max-width:640px){
    .detail-grid{grid-template-columns:1fr;}
  }
`;

const DEFAULT_BRANCH_META = {
  KM:{name:"EMAX Kota Marudu",manager:"SUHAINIZAM",mStatus:"Confirmed (P5 F0)"},
  T1:{name:"EMAX Tuaran 1",manager:"REX WENMIN",mStatus:"Confirmed (P5 F0)"},
  TW2:{name:"EMAX Tawau 2",manager:"TONY YONG",mStatus:"Confirmed (P5 F0)"},
  TW1:{name:"EMAX Tawau 1",manager:"MAX SIEW",mStatus:"Director"},
  LD:{name:"EMAX Lahad Datu",manager:"SHAHRUL",mStatus:"Confirmed (P3 F0)"},
  KB:{name:"EMAX Kota Belud",manager:"MAHADI",mStatus:"Confirmed (P2 F3)"},
  T5:{name:"EMAX CKS",manager:"SUHAIDI",mStatus:"Confirmed (P0 F2)"},
  ITCC:{name:"EMAX ITCC",manager:"SUHAIDI",mStatus:"Confirmed (P0 F1)"},
  TENOM:{name:"EMAX Tenom",manager:"AZIQIL",mStatus:"Probation (P1 F1)"},
  HQ:{name:"EMAX HQ",manager:"MIKE PANG",mStatus:"Confirmed (P0 F1)"},
  SDK:{name:"EC SDK",manager:"",mStatus:""},
}

const SIDEBAR_STRUCTURE = [
  {id:"warranty",label:"Warranty"},
  {id:"stockWriteOff",label:"Stock Write-off"},
]

function WarrantyApp(){
  const [email, setEmail] = useState(null)
  const [branchMeta, setBranchMeta] = useState(DEFAULT_BRANCH_META)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageTab, setPageTabRaw] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return ['warranty', 'stockWriteOff'].includes(h) ? h : 'warranty'
  })
  const setPageTab = (t) => { setPageTabRaw(t); window.location.hash = t }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null))
    Promise.all([loadData(BM_KEY), loadData(SR_KEY)]).then(([bm]) => {
      if (bm && Object.keys(bm).length) {
        const merged = { ...DEFAULT_BRANCH_META, ...bm }
        Object.keys(merged).forEach(b => { merged[b] = { ...merged[b], name: b==="SDK"?DEFAULT_BRANCH_META[b]?.name:(merged[b]?.name || DEFAULT_BRANCH_META[b]?.name) } })
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

  return (
    <div style={{ minHeight:"100vh", background:"#F7F9FC", fontFamily:"Inter,-apple-system,sans-serif" }}>
      <style>{CSS}</style>
      {/* Top bar — same navy chrome as the main dashboard */}
      <div style={{ background:"#0A1628", borderBottom:"1px solid #162B52", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 12px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", minHeight:48, gap:8, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
              <div>
                <div style={{ fontWeight:900, fontSize:12, color:"#fff", letterSpacing:"0.06em", lineHeight:1 }}>EMAX NETWORK</div>
                <div style={{ fontSize:9, color:"rgba(255,255,255,.3)", letterSpacing:"0.14em", textTransform:"uppercase", marginTop:1 }}>Warranty</div>
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
          {pageTab==="warranty" && <WarrantyTab branchMeta={branchMeta} isAdmin={true} userBranch={null} email={email} />}
          {pageTab==="stockWriteOff" && <StockWriteOffTab branchMeta={branchMeta} isAdmin={true} userBranch={null} email={email} />}
        </div>

        {/* SIDEBAR — right side, collapsible, same treatment as the main dashboard's */}
        <div style={{
          width:sidebarOpen?220:0, flexShrink:0, overflow:"hidden",
          transition:"width .2s ease", background:"#0F1B30", borderLeft:sidebarOpen?"1px solid #1C2D4A":"none",
          minHeight:"calc(100vh - 49px)", position:"sticky", top:49, alignSelf:"flex-start",
        }}>
          <div style={{ width:220, padding:"16px 10px", visibility:sidebarOpen?"visible":"hidden" }}>
            {SIDEBAR_STRUCTURE.map(item=>(
              <button key={item.id} onClick={()=>{setPageTab(item.id);setSidebarOpen(false);}} style={{
                display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
                border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
                background:pageTab===item.id?"rgba(255,255,255,.1)":"transparent",color:pageTab===item.id?"#fff":"rgba(255,255,255,.45)",
                transition:"background .15s",
              }}>
                {item.label}
              </button>
            ))}
            <div style={{ width:"100%", height:1, background:"rgba(255,255,255,.08)", margin:"10px 0" }}/>
            <div style={{ padding:"9px 12px", marginBottom:3, fontSize:11, color:"rgba(255,255,255,.35)", wordBreak:"break-all" }}>{email}</div>
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
      <WarrantyApp />
    </AuthGate>
  </React.StrictMode>
)
