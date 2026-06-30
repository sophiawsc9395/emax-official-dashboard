// EMAX NETWORK — Branch Viewer
// Change BRANCH_ID below for each branch link
// KM | T1 | TW2 | TW1 | LD | KB | T5 | ITCC | TENOM | HQ
import { useState, useEffect, useMemo } from "react";
import { loadData } from "../../storage/index.js";

const BRANCH_ID = "TENOM";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];

const DEFAULT_BRANCH_META = {
  KM:{name:"EMAX Kota Marudu",manager:"SUHAINIZAM",mStatus:"Confirmed (Passed 5)"},
  T1:{name:"EMAX Tuaran",manager:"REX WENMIN",mStatus:"Confirmed (Passed 5)"},
  TW2:{name:"EMAX Tawau 2",manager:"TONY YONG",mStatus:"Confirmed"},
  TW1:{name:"EMAX Tawau 1",manager:"MAX SIEW",mStatus:"Director"},
  LD:{name:"EMAX Lahad Datu",manager:"SHAHRUL",mStatus:"Confirmed (Passed 3)"},
  KB:{name:"EMAX Kota Belud",manager:"MAHADI",mStatus:"Confirmed (Failed 3)"},
  T5:{name:"EMAX CKS",manager:"SUHAIDI",mStatus:"Confirmed (Failed 2)"},
  ITCC:{name:"EMAX ITCC",manager:"SUHAIDI",mStatus:"Confirmed (Failed 1)"},
  TENOM:{name:"EMAX Tenom",manager:"AZIQIL",mStatus:"Probation (Passed 1, Failed 1)"},
  HQ:{name:"EMAX HQ",manager:"MIKE PANG",mStatus:"—"},
};
const DEFAULT_SR = [
  {id:"EM0285",canon:"ESTHER",branch:"KM",type:"Online",status:"Confirmed (Passed 4)"},
  {id:"EM0264",canon:"LYFIE MIEHCHIE",branch:"KM",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0069",canon:"EFFIEARZERRA",branch:"KM",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0243",canon:"SITI NORDIANA",branch:"KM",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0187",canon:"ROSE",branch:"KM",type:"Online",status:"Probation In Progress"},
  {id:"EM0033",canon:"KEVIN CHIN",branch:"T1",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0045",canon:"INJJIE",branch:"T1",type:"Online",status:"Confirmed (Passed 5)"},
  {id:"EM0056",canon:"EVVY",branch:"T1",type:"Online",status:"Confirmed (Passed 5)"},
  {id:"EM0078",canon:"FRISHIKA",branch:"T1",type:"Online",status:"Confirmed (Passed 3, Failed 1)"},
  {id:"EM0089",canon:"ADRINA",branch:"T1",type:"Online",status:"Probation (Passed 3, Failed 1)"},
  {id:"EM0090",canon:"MASDANIAR",branch:"TW2",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0103",canon:"ZAHARAH",branch:"TW2",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0112",canon:"SHAHRIL",branch:"TW2",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0121",canon:"ERNITA",branch:"TW2",type:"Online",status:"Confirmed (Passed 5)"},
  {id:"EM0197",canon:"NURUL ZIANA",branch:"TW1",type:"Offline",status:"Confirmed (Passed 1, Failed 1)"},
  {id:"EM0229",canon:"NURSHAFATIN",branch:"TW1",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0231",canon:"MIRA SABRINA",branch:"TW1",type:"Online",status:"Probation In Progress"},
  {id:"EM0232",canon:"NUR ATIKAH",branch:"TW1",type:"Online",status:"Probation (Passed 1)"},
  {id:"EM0233",canon:"NUR DIANA",branch:"TW1",type:"Online",status:"Probation In Progress"},
  {id:"EM0282",canon:"NURUL FARAH",branch:"LD",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0299",canon:"NURHIKMAH",branch:"LD",type:"Offline",status:"Confirmed (Passed 3)"},
  {id:"EM0300",canon:"ALIF FARHAD",branch:"LD",type:"Offline",status:"Confirmed (Passed 3)"},
  {id:"EM0301",canon:"MAZWANIE",branch:"LD",type:"Offline",status:"Confirmed (Passed 4, Failed 1)"},
  {id:"EM0204",canon:"MOHD FAID",branch:"KB",type:"Offline",status:"Confirmed (Passed 2, Failed 3)"},
  {id:"EM0236",canon:"AERON SEAN",branch:"KB",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0267",canon:"MUAZAM",branch:"KB",type:"Offline",status:"Confirmed (Passed 2, Failed 3)"},
  {id:"EM0199",canon:"SHAHMIRUL",branch:"T5",type:"Offline",status:"Confirmed (Passed 1, Failed 4)"},
  {id:"EM0306",canon:"AIMAN",branch:"T5",type:"Online",status:"Probation (Passed 1, Failed 1)"},
  {id:"EM0253",canon:"NAZRIN",branch:"ITCC",type:"Online",status:"Probation In Progress"},
  {id:"EM0281",canon:"SAHRIZAN",branch:"ITCC",type:"Offline",status:"Probation (Passed 3, Failed 2)"},
  {id:"EM0305",canon:"O'DONELL",branch:"ITCC",type:"Online",status:"Probation (Passed 1, Failed 1)"},
  {id:"EM0240",canon:"JENIAH",branch:"TENOM",type:"Offline",status:"Confirmed (Passed 5)"},
  {id:"EM0263",canon:"MARDIANA",branch:"TENOM",type:"Offline",status:"Confirmed (Passed 4, Failed 1)"},
  {id:"EM0270",canon:"SHERAIN",branch:"TENOM",type:"Online",status:"Probation (Passed 2, Failed 1)"},
  {id:"EM0290",canon:"ABD FERHAN",branch:"TENOM",type:"Online",status:"Probation In Progress"},
];
const DEFAULT_TARGETS = {
  bm:{KM:50000,T1:50000,TW2:50000,TW1:55000,LD:45000,KB:50000,T5:38000,ITCC:50000,TENOM:45000,HQ:36000},
  bmBonus:{KM:0,T1:0,TW2:0,TW1:0,LD:0,KB:0,T5:0,ITCC:0,TENOM:0,HQ:0},
  sr:{
    EM0285:{target:12250,bonus:500},EM0264:{target:12250,bonus:500},EM0069:{target:12250,bonus:500},EM0243:{target:12250,bonus:500},EM0187:{target:6000,bonus:0},
    EM0033:{target:27000,bonus:600},EM0045:{target:7000,bonus:400},EM0056:{target:7000,bonus:400},EM0078:{target:7000,bonus:300},EM0089:{target:7000,bonus:300},
    EM0090:{target:16000,bonus:500},EM0103:{target:16000,bonus:500},EM0112:{target:16000,bonus:500},EM0121:{target:7000,bonus:500},
    EM0197:{target:21000,bonus:600},EM0229:{target:21000,bonus:600},EM0231:{target:6000,bonus:0},EM0232:{target:6000,bonus:300},EM0233:{target:6000,bonus:0},
    EM0282:{target:12500,bonus:500},EM0299:{target:12500,bonus:500},EM0300:{target:12500,bonus:500},EM0301:{target:12500,bonus:500},
    EM0204:{target:18334,bonus:500},EM0236:{target:18334,bonus:500},EM0267:{target:18334,bonus:500},
    EM0199:{target:21500,bonus:500},EM0306:{target:21500,bonus:500},
    EM0253:{target:18300,bonus:500},EM0281:{target:18400,bonus:500},EM0305:{target:18300,bonus:500},
    EM0240:{target:18000,bonus:700},EM0263:{target:18000,bonus:700},EM0270:{target:7000,bonus:300},EM0290:{target:7000,bonus:300},
  }
};
const TARGET_KEY="emax_v5_targets",SR_KEY="emax_v5_sr_list",BM_KEY="emax_v5_branch_meta";

const fRM=(n=0)=>"RM "+Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
const f2=(n=0)=>Number(n||0).toFixed(2);
const pctN=(p,t)=>t>0?(p/t)*100:0;
function achColor(p,t){const r=pctN(p,t);return r>=100?"#00C896":r>=80?"#F5A623":r>=50?"#F0794B":"#F0354B";}
function achBg(p,t){const r=pctN(p,t);return r>=100?"#00C89612":r>=80?"#F5A62312":r>=50?"#F0794B12":"#F0354B12";}
function daysInMonth(m,y){return new Date(y,m,0).getDate();}
function calcAchievementBonus(pct,role="sr"){if(pct<120)return 0;const t=Math.floor((pct-120)/10);return role==="bm"?500+t*500:300+t*50;}
function calcRewardPoints(pct,bPct){if(bPct<100||pct<110)return 0;const T=[[200,12000],[190,9000],[180,7500],[170,6000],[160,4500],[150,3000],[140,2000],[130,1500],[120,1000],[110,500]];for(const[t,p]of T)if(pct>=t)return p;return 0;}

function AchBadge({profit,target}){
  if(!target)return <span style={{color:"#8A96A8"}}>—</span>;
  const p=pctN(profit,target),c=achColor(profit,target),bg=achBg(profit,target);
  return <span style={{background:bg,color:c,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>{p.toFixed(2)}%</span>;
}
function ProgressBar({pct,color}){
  return <div style={{height:5,background:"#E4EAF2",borderRadius:5,overflow:"hidden"}}>
    <div style={{height:"100%",width:Math.min(pct,100)+"%",background:color,transition:"width .6s"}}/>
  </div>;
}

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#F7F9FC;color:#0A1628;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-thumb{background:#CDD5E0;border-radius:3px;}
  .sidebar-rank-item:hover{background:rgba(255,255,255,.06)!important;}
  
  .card{background:#fff;border:1px solid #E4EAF2;border-radius:12px;box-shadow:0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04);transition:box-shadow .2s,transform .2s;}
  .card:hover{box-shadow:0 4px 16px rgba(10,22,40,.10);}
  .btn{border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;letter-spacing:.01em;transition:all .15s;display:inline-flex;align-items:center;gap:6px;}
  .btn-primary{background:linear-gradient(135deg,#1E6FDB,#2D85F0);color:#fff;padding:9px 20px;border-radius:8px;font-size:13px;box-shadow:0 2px 8px rgba(30,111,219,.30);}
  .btn-primary:hover{box-shadow:0 4px 16px rgba(30,111,219,.45);transform:translateY(-1px);}
  .btn-ghost{background:transparent;color:#4A5568;padding:8px 16px;border-radius:8px;font-size:13px;border:1px solid #E4EAF2;}
  .btn-ghost:hover{background:#F7F9FC;color:#0A1628;}
  .btn-success{background:linear-gradient(135deg,#00B87A,#00C896);color:#fff;padding:9px 20px;border-radius:8px;font-size:13px;box-shadow:0 2px 8px rgba(0,200,150,.25);}
  .btn-danger{background:transparent;color:#F0354B;padding:5px 12px;border-radius:6px;font-size:11px;border:1px solid rgba(240,53,75,.3);}
  .btn-danger:hover{background:rgba(240,53,75,.08);}
  .input{width:100%;padding:8px 12px;border:1.5px solid #E4EAF2;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;color:#0A1628;outline:none;transition:border-color .15s;background:#fff;}
  .input:focus{border-color:#1E6FDB;box-shadow:0 0 0 3px rgba(30,111,219,.12);}
  .select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238A96A8'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}
  .tag{display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.02em;white-space:nowrap;}
  .tag-online{background:#EFF6FF;color:#1D4ED8;}
  .tag-offline{background:#FEFCE8;color:#854D0E;}
  .tag-confirmed{background:#F0FDF4;color:#15803D;}
  .tag-probation{background:#EFF6FF;color:#1D4ED8;}
  .tag-director{background:#F5F3FF;color:#6D28D9;}
  .shine-row:hover{background:#F7F9FC!important;}
  .nav-item{transition:all .15s;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fade-in{animation:fadeIn .25s ease forwards;}
  .progress-bar-fill{transition:width .8s cubic-bezier(.4,0,.2,1);}
  .modal-overlay{position:fixed;inset:0;background:rgba(10,22,40,.65);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;}
`;

function RankingTable({title,rows,showBonus,showPoints,branchMeta,period}){
  const StatusTagR=({status})=>{
    if(!status)return null;
    const s=status.toLowerCase(),isDir=s.includes("director"),isConf=s.includes("confirmed");
    const bg=isDir?"#F5F3FF":isConf?"#F0FDF4":"#EFF6FF",color=isDir?"#6D28D9":isConf?"#15803D":"#1D4ED8";
    const base=isDir?"Director":isConf?"Confirmed":"Probation";
    const pm=status.match(/\bP(\d+)\b/)||status.match(/Passed\s*(\d+)/i),fm=status.match(/\bF(\d+)\b/)||status.match(/Failed\s*(\d+)/i);
    const passed=pm?parseInt(pm[1]):null,failed=fm?parseInt(fm[1]):null;
    return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:bg,color,padding:"1px 8px",borderRadius:20,fontSize:9,fontWeight:700,whiteSpace:"nowrap"}}>
      {base}
      {(passed!==null||failed!==null)&&<span style={{display:"flex",gap:2}}>
        <span style={{width:1,height:9,background:color+"50"}}/>
        {passed!==null&&<span style={{color:"#00C896",fontWeight:800}}>P{passed}</span>}
        {failed!==null&&<span style={{color:"#F0354B",fontWeight:800}}>F{failed}</span>}
      </span>}
    </span>;
  };

  const medals=["🥇","🥈","🥉"];
  return <div style={{marginBottom:24,display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{marginBottom:10,minHeight:36,flexShrink:0}}>
      <h3 style={{fontSize:13,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.05em",margin:0}}>{title}</h3>
      <div style={{fontSize:10,color:"#8A96A8",fontWeight:500,marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{period?`Period: ${period}`:"\u00A0"}</div>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6,flex:1}}>
      {rows.map((r,i)=>{
        const p=pctN(r.profit,r.target),branchPct=r.branchPct||p,color=achColor(r.profit,r.target);
        const achBonus=branchPct>=120&&p>=100?calcAchievementBonus(branchPct,r.role||"sr"):0;
        const pts=calcRewardPoints(p,branchPct);
        const isTop=i<3;
        return <div key={i} style={{
          background:isTop?"linear-gradient(135deg,#0A1628,#162B52)":"#fff",
          border:isTop?"none":"1px solid #E4EAF2",
          borderRadius:10,padding:"10px 14px",
          boxShadow:isTop?"0 2px 8px rgba(10,22,40,.2)":"0 1px 3px rgba(10,22,40,.04)",
          display:"flex",alignItems:"center",gap:12,
          minHeight:60,
        }}>
          {/* Rank */}
          <div style={{flexShrink:0,width:32,textAlign:"center"}}>
            {i<3
              ? <span style={{fontSize:20,lineHeight:1}}>{medals[i]}</span>
              : <span style={{fontWeight:800,fontSize:13,color:"#8A96A8"}}>#{i+1}</span>}
          </div>
          {/* Name + status */}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:12,color:isTop?"#fff":"#0A1628",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</div>
            <div style={{marginTop:2,display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
              <StatusTagR status={r.status}/>
              {r.branch&&branchMeta&&<span style={{fontSize:9,color:isTop?"rgba(255,255,255,.4)":"#8A96A8",textTransform:"uppercase"}}>{(branchMeta[r.branch]?.name||r.branch).replace("EMAX ","")}</span>}
            </div>
          </div>
          {/* Achievement */}
          <div style={{flexShrink:0,textAlign:"right",display:"flex",flexDirection:"column",gap:2,minWidth:64}}>
            <div style={{fontWeight:800,fontSize:14,color:isTop?color:color,lineHeight:1.2}}>{r.target>0?pctN(r.profit,r.target).toFixed(1)+"%":"—"}</div>
            {showBonus&&<div style={{fontSize:10,fontWeight:700,lineHeight:1.2,color:achBonus>0?"#F5A623":(isTop?"rgba(255,255,255,.25)":"#CDD5E0")}}>{achBonus>0?fRM(achBonus):"—"}</div>}
            {showPoints&&<div style={{fontSize:10,fontWeight:700,lineHeight:1.2,color:pts>0?(isTop?"#93C5FD":"#1E6FDB"):(isTop?"rgba(255,255,255,.25)":"#CDD5E0")}}>{pts>0?pts.toLocaleString()+" pts":"—"}</div>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}


function PointsHistoryModal({srList,bMeta,rewardBalances,rewardHistory,onClose,initialPerson}){
  const people=[
    ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:bMeta[b]?.manager||b,role:"Branch Manager"})),
    ...DEFAULT_SR.map(sr=>({id:sr.id,name:sr.canon,role:sr.type+" SR"}))
  ];
  const [selPerson,setSelPerson]=useState(initialPerson||people[0]?.id);
  const person=people.find(p=>p.id===selPerson);
  const balance=rewardBalances[selPerson]?.balance||0;
  const history=(rewardHistory[selPerson]||[]).slice().reverse();

  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #E4EAF2"}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>🏆 Reward Points Balance</h2>
        <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px"}}>Close</button>
      </div>
      <div style={{padding:"16px 24px",borderBottom:"1px solid #E4EAF2"}}>
        <select className="input select" value={selPerson} onChange={e=>setSelPerson(e.target.value)} style={{fontSize:13,padding:"8px 28px 8px 12px"}}>
          {people.map(p=><option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
        </select>
      </div>
      <div style={{padding:"16px 24px",background:"linear-gradient(135deg,#0A1628,#162B52)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{person?.name}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2}}>Current Balance</div>
        </div>
        <div style={{fontSize:24,fontWeight:800,color:"#F5A623"}}>{balance.toLocaleString()} pts</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 24px"}}>
        {history.length===0
          ? <div style={{padding:"32px 0",textAlign:"center",color:"#8A96A8",fontSize:12}}>No transaction history yet.</div>
          : history.map((h,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<history.length-1?"1px solid #F0F2F5":"none"}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:"#0A1628"}}>{h.note}</div>
                <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>{new Date(h.date).toLocaleString("en-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:h.amount>=0?"#00C896":"#F0354B",whiteSpace:"nowrap"}}>
                {h.amount>=0?"+":""}{h.amount.toLocaleString()} pts
              </div>
            </div>
          ))
        }
      </div>
    </div>
  </div>;
}

function StatusTag({status}){
  if(!status)return null;
  const s=status.toLowerCase();
  const isDir=s.includes("director"),isConf=s.includes("confirmed"),isRes=s.includes("resigned");
  const bg=isRes?"#FEF2F2":isDir?"#F5F3FF":isConf?"#F0FDF4":"#EFF6FF";
  const color=isRes?"#B91C1C":isDir?"#6D28D9":isConf?"#15803D":"#1D4ED8";
  const base=isRes?"Resigned":isDir?"Director":isConf?"Confirmed":"Probation";
  const pm=status.match(/\bP(\d+)\b/)||status.match(/Passed\s*(\d+)/i);
  const fm=status.match(/\bF(\d+)\b/)||status.match(/Failed\s*(\d+)/i);
  const passed=pm?parseInt(pm[1]):null,failed=fm?parseInt(fm[1]):null;
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>
    {base}
    {(passed!==null||failed!==null)&&<span style={{display:"flex",gap:3,alignItems:"center"}}>
      <span style={{width:1,height:10,background:color+"50"}}/>
      {passed!==null&&<span style={{color:"#00C896",fontWeight:700}}>P{passed}</span>}
      {failed!==null&&<span style={{color:"#F0354B",fontWeight:700}}>F{failed}</span>}
    </span>}
  </span>;
}
function TypeTag({type}){return <span style={{background:type==="Online"?"#EFF6FF":"#FEFCE8",color:type==="Online"?"#1D4ED8":"#854D0E",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600}}>{type}</span>;}

function PdfDownloads({month,year}){
  const [pdfList,setPdfList]=useState([]);
  useEffect(()=>{
    loadData("emax_v5_pdf_index").then(idx=>{
      const list=Array.isArray(idx)?idx:[];
      Promise.all(list.map(k=>loadData(k))).then(pdfs=>{
        const valid=pdfs.filter(p=>p&&p.date&&p.b64);
        const filtered=valid.filter(p=>{
          const parts=p.date.split("/");
          return parseInt(parts[1])===month&&parseInt(parts[2])===year&&p.branch===BRANCH_ID;
        });
        // Deduplicate by filename
        const seen=new Set();
        const deduped=filtered.filter(p=>{if(seen.has(p.name||p.date))return false;seen.add(p.name||p.date);return true;});
        setPdfList(deduped);
      });
    });
  },[month,year]);
  if(!pdfList.length)return null;
  return <div style={{marginTop:20}}>
    <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>AEON Profit Reports</h3>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {pdfList.map((pdf,i)=>(
        <a key={i} href={`data:application/pdf;base64,${pdf.b64}`} download={pdf.name||`AEON_${pdf.date}.pdf`}
          style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",background:"#7C5CFC",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,textDecoration:"none"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {pdf.name||`AEON ${pdf.date}`}
        </a>
      ))}
    </div>
  </div>;
}

export default function App(){
  const now=new Date();
  const [selMonth,setSelMonth]=useState(now.getMonth()+1);
  const [selYear,setSelYear]=useState(now.getFullYear());
  const month=selMonth,year=selYear;
  const days=Array.from({length:daysInMonth(month,year)},(_,i)=>i+1);
  const recordsKey=`emax_v5_records_${year}_${month}`;

  const [records,setRecords]=useState({});
  const [targets,setTargets]=useState(DEFAULT_TARGETS);
  const [srList,setSrList]=useState(DEFAULT_SR.filter(s=>s.branch===BRANCH_ID));
  const [bMeta,setBMeta]=useState(DEFAULT_BRANCH_META);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('overview');
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [rewardBalances,setRewardBalances]=useState({});
  const [rewardHistory,setRewardHistory]=useState({});
  const [showPointsModal,setShowPointsModal]=useState(false);
  const [pointsModalPerson,setPointsModalPerson]=useState(null);
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pointsAsOf=(()=>{
    const prevDate=new Date(selYear,selMonth-1,0);
    return `${String(prevDate.getDate()).padStart(2,"0")}/${String(prevDate.getMonth()+1).padStart(2,"0")}/${prevDate.getFullYear()}`;
  })();

  useEffect(()=>{
    setLoading(true);setRecords({});
    Promise.all([loadData(recordsKey),loadData(TARGET_KEY),loadData(SR_KEY),loadData(BM_KEY),loadData("emax_v5_reward_balance"),loadData("emax_v5_reward_history")]).then(([r,t,srData,bmData,rb,rh])=>{
      setRecords(r||{});
      if(t?.bm)setTargets({bm:{...DEFAULT_TARGETS.bm,...t.bm},bmBonus:{...DEFAULT_TARGETS.bmBonus,...(t.bmBonus||{})},sr:{...DEFAULT_TARGETS.sr,...t.sr}});
      if(srData&&Array.isArray(srData)&&srData.length>0)setSrList(srData.filter(s=>s.branch===BRANCH_ID));
      if(bmData&&Object.keys(bmData).length>0)setBMeta(p=>({...p,...bmData}));
      setRewardBalances(rb||{});
      setRewardHistory(rh||{});
      setLoading(false);
    });
  },[selMonth,selYear]);

  // Branch totals
  const bTotal=useMemo(()=>{
    let wi=0,ae=0;
    Object.values(records).forEach(day=>{
      srList.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
      wi+=(day[`BM_${BRANCH_ID}`]?.walkin||0);ae+=(day[`BM_${BRANCH_ID}`]?.aeon||0);wi+=(day[`BM_${BRANCH_ID}`]?.unalloc||0);
    });
    return{wi,ae,total:wi+ae};
  },[records,srList]);

  const srTotals=useMemo(()=>{
    const t={};
    srList.forEach(sr=>{let wi=0,ae=0;Object.values(records).forEach(day=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});t[sr.id]={wi,ae,total:wi+ae};});
    return t;
  },[records,srList]);

  const bTarget=targets?.bm?.[BRANCH_ID]||0;
  const branchPct2=pctN(bTotal.total,bTarget);

  // Ranking data for this branch's SRs
  // Last day in the month where ANY branch/SR has a non-zero walkin/aeon/unalloc value
  const lastDataDay=useMemo(()=>{
    for(let d=days[days.length-1];d>=1;d--){
      const k=`${d}/${month}/${year}`;
      const day=records[k];
      if(day){
        const hasValue=Object.values(day).some(entry=>(entry?.walkin||0)!==0||(entry?.aeon||0)!==0||(entry?.unalloc||0)!==0);
        if(hasValue)return d;
      }
    }return null;
  },[records,days,month,year]);
  const pad2=(n)=>String(n).padStart(2,"0");
  const rankingPeriod=lastDataDay?`${pad2(1)}/${pad2(month)}/${year}-${pad2(lastDataDay)}/${pad2(month)}/${year}`:`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`;
  const rankEndDay=lastDataDay||daysInMonth(month,year);

  // For company-wide ranking, compute all SRs from all branches — always 1 → lastDataDay
  const allSRTotals=useMemo(()=>{
    const t={};
    DEFAULT_SR.forEach(sr=>{
      let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){const k=`${d}/${month}/${year}`;wi+=(records[k]?.[sr.id]?.walkin||0);ae+=(records[k]?.[sr.id]?.aeon||0);}
      t[sr.id]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,rankEndDay,month,year]);

  const allBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=DEFAULT_SR.filter(s=>s.branch===b);let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      }
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,rankEndDay,month,year]);

  const srRankRows=DEFAULT_SR.map(s=>{
    const profit=allSRTotals[s.id]?.total||0,target=targets?.sr?.[s.id]?.target||0;
    const bTotalPct=pctN(allBranchTotals[s.branch]?.total||0,targets?.bm?.[s.branch]||0);
    const p=pctN(profit,target);
    return{name:s.canon,status:s.status,branch:s.branch,profit,target,p,branchPct:bTotalPct,role:"sr"};
  }).sort((a,b)=>b.p-a.p);

  const bmRankRows=BRANCH_ORDER.map(b=>{
    const profit=allBranchTotals[b]?.total||0,target=targets?.bm?.[b]||0,p=pctN(profit,target);
    return{name:bMeta[b]?.manager,status:bMeta[b]?.mStatus,branch:b,profit,target,p,branchPct:p,role:"bm"};
  }).sort((a,b)=>b.p-a.p);
  const branchPct=pctN(bTotal.total,bTarget);
  const meta=bMeta[BRANCH_ID]||{};

  if(loading)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A1628",fontFamily:"Inter,sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontWeight:900,fontSize:16,color:"#fff"}}>{DEFAULT_BRANCH_META[BRANCH_ID]?.name}</div>
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:"0.15em",textTransform:"uppercase",marginTop:6}}>Loading</div>
    </div>
  </div>;

  return <div style={{minHeight:"100vh",background:"#F7F9FC",fontFamily:"Inter,-apple-system,sans-serif"}}>
    <style>{CSS}</style>

    {/* Nav */}
    <div style={{background:"#0A1628",borderBottom:"1px solid #162B52",position:"sticky",top:0,zIndex:100}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",rowGap:8}}>
        <div style={{flexShrink:0}}>
          <div style={{fontWeight:900,fontSize:13,color:"#fff",letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{meta.name||DEFAULT_BRANCH_META[BRANCH_ID]?.name}</div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:"0.12em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Branch Performance · Read Only</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",rowGap:6}}>
          <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
            style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1} style={{background:"#0A1628",color:"#fff"}}>{m}</option>)}
          </select>
          <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
            style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
            {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y} style={{background:"#0A1628",color:"#fff"}}>{y}</option>)}
          </select>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.1em",whiteSpace:"nowrap"}}>{MONTHS[month-1]} {year}</div>
            <div style={{fontWeight:800,fontSize:13,color:"#fff",whiteSpace:"nowrap"}}>{fRM(bTotal.total)}</div>
          </div>
          <button onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?"Collapse menu":"Expand menu"}
            style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,border:"1px solid rgba(255,255,255,.15)",borderRadius:7,background:"rgba(255,255,255,.06)",cursor:"pointer",flexShrink:0}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div style={{display:"flex",maxWidth:1400,margin:"0 auto"}}>
    <div style={{flex:1,minWidth:0,padding:20,maxWidth:1180}}>

      {tab==="rankings"&&<div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20}}>
        <RankingTable title="Branch Manager Ranking" rows={bmRankRows} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
        <RankingTable title="Online SR Ranking — Company" rows={srRankRows.filter(r=>DEFAULT_SR.find(s=>s.canon===r.name)?.type==="Online")} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
        <RankingTable title="Offline SR Ranking — Company" rows={srRankRows.filter(r=>DEFAULT_SR.find(s=>s.canon===r.name)?.type==="Offline")} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
      </div>}

      {/* REWARD POINT RANKING — company-wide */}
      {tab==="points"&&<div className="fade-in">
        <div style={{marginBottom:14}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>🏆 Reward Point Ranking</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(()=>{
            const allPeople=[
              ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:bMeta[b]?.manager||b,role:"Branch Manager",branch:b})),
              ...DEFAULT_SR.map(sr=>({id:sr.id,name:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
            ];
            const ranked=allPeople.map(p=>({...p,balance:rewardBalances[p.id]?.balance||0})).sort((a,b)=>b.balance-a.balance);
            const medals=["🥇","🥈","🥉"];
            return ranked.map((p,i)=>{
              const isTop=i<3;
              return <div key={p.id} onClick={()=>{setPointsModalPerson(p.id);setShowPointsModal(true);}} style={{
                background:isTop?"linear-gradient(135deg,#0A1628,#162B52)":"#fff",
                border:isTop?"none":"1px solid #E4EAF2",
                borderRadius:10,padding:"10px 14px",
                boxShadow:isTop?"0 2px 8px rgba(10,22,40,.2)":"0 1px 3px rgba(10,22,40,.04)",
                display:"flex",alignItems:"center",gap:12,cursor:"pointer",
              }}>
                <div style={{flexShrink:0,width:32,textAlign:"center"}}>
                  {isTop?<span style={{fontSize:20,lineHeight:1}}>{medals[i]}</span>
                        :<span style={{fontWeight:800,fontSize:13,color:"#8A96A8"}}>#{i+1}</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:isTop?"#fff":"#0A1628",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                  <div style={{fontSize:10,color:isTop?"rgba(255,255,255,.4)":"#8A96A8",marginTop:2}}>{p.role} · {p.branch} · As at {pointsAsOf}</div>
                </div>
                <div style={{fontWeight:800,fontSize:15,color:isTop?"#fff":"#0A1628",flexShrink:0,whiteSpace:"nowrap"}}>{p.balance.toLocaleString()} pts</div>
              </div>;
            });
          })()}
        </div>
      </div>}

      {tab==="overview"&&<div className="fade-in">
      {/* Branch summary card */}
      <div className="card" style={{padding:"18px 20px",marginBottom:20,borderTop:"3px solid #1E6FDB"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:14}}>
          <div>
            <h2 style={{fontWeight:800,fontSize:15,color:"#0A1628",margin:0,textTransform:"uppercase"}}>{meta.name||DEFAULT_BRANCH_META[BRANCH_ID]?.name}</h2>
            <div style={{fontSize:11,color:"#5A6472",marginTop:3}}>BM: {meta.manager} · {meta.mStatus}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:900,fontSize:22,color:achColor(bTotal.total,bTarget),letterSpacing:"-0.02em"}}>
              {bTarget>0?branchPct.toFixed(1)+"%":"—"}
            </div>
            <div style={{fontSize:10,color:"#5A6472"}}>Achievement</div>
          </div>
        </div>
        {bTarget>0&&<ProgressBar pct={branchPct} color={achColor(bTotal.total,bTarget)}/>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginTop:14}}>
          {[["Total Profit",fRM(bTotal.total),"#0A1628"],["Target",bTarget>0?fRM(bTarget):"Not Set","#4A5568"],
            ["Walk In",fRM(bTotal.wi),"#1E6FDB"],["Invoice",fRM(bTotal.ae),"#7C5CFC"],
            ["Balance",bTarget>0?(Math.max(bTarget-bTotal.total,0)>0?fRM(Math.max(bTarget-bTotal.total,0)):"Target Met"):"—",
             bTarget>0&&bTotal.total>=bTarget?"#00C896":bTarget>0?"#F0354B":"#8A96A8"]
          ].map(([l,v,c])=>(
            <div key={l}>
              <div style={{fontSize:10,color:"#5A6472",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,color:c,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v}</div>
            </div>
          ))}
        </div>
        {/* BM Incentive Tiers */}
        {(()=>{
          const achBonus=branchPct>=120?calcAchievementBonus(branchPct,"bm"):0;
          const pts=calcRewardPoints(branchPct,branchPct);
          return <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,gap:6,flexWrap:"nowrap"}}>
              <span style={{color:"#5A6472",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>🏆 Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
              <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{(rewardBalances[`BM_${BRANCH_ID}`]?.balance||0).toLocaleString()} pts</span>
            </div>
            {/* Branch Achievement Bonus tier */}
            {achBonus>0&&(()=>{
              const tier=Math.floor((branchPct-120)/10);
              const nextTierPct=120+(tier+1)*10;
              const isMaxTier=nextTierPct>200;
              return <div style={{background:"linear-gradient(135deg,#FFF9EB,#FFFBF0)",borderRadius:8,padding:"8px 10px",border:"1px solid #FDE68A"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#92400E",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{background:"#F5A623",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:800}}>Tier {tier+1}</span>
                    Branch Achievement Bonus
                  </span>
                  <span style={{fontWeight:800,fontSize:12,color:"#D97706"}}>{fRM(achBonus)}</span>
                </div>
                {!isMaxTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:4,borderTop:"1px dashed #FDE68A"}}>
                  <span style={{fontSize:9,color:"#B45309"}}>Next: Tier {tier+2} at {nextTierPct}%</span>
                  <span style={{fontSize:9,fontWeight:700,color:"#B45309"}}>{fRM(calcAchievementBonus(nextTierPct,"bm"))}</span>
                </div>}
                {isMaxTier&&<div style={{fontSize:9,color:"#D97706",fontWeight:600,paddingTop:4,borderTop:"1px dashed #FDE68A"}}>🏆 Maximum tier reached</div>}
              </div>;
            })()}
            {/* Reward Points tier */}
            {pts>0&&(()=>{
              const TIERS=[[110,500],[120,1000],[130,1500],[140,2000],[150,3000],[160,4500],[170,6000],[180,7500],[190,9000],[200,12000]];
              const curTierIdx=TIERS.reduce((acc,[t],i)=>branchPct>=t?i:acc,-1);
              const nextTierEntry=TIERS[curTierIdx+1]||null;
              const isMaxTier=!nextTierEntry;
              return <div style={{background:"linear-gradient(135deg,#EFF6FF,#F0F7FF)",borderRadius:8,padding:"8px 10px",border:"1px solid #BFDBFE"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:10,fontWeight:700,color:"#1E40AF",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{background:"#1E6FDB",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:800}}>
                      {curTierIdx>=0?`Tier ${curTierIdx+1}`:"Tier 1"}
                    </span>
                    Reward Points
                  </span>
                  <span style={{fontWeight:800,fontSize:12,color:"#1E6FDB"}}>{pts.toLocaleString()} pts</span>
                </div>
                {!isMaxTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:4,borderTop:"1px dashed #BFDBFE"}}>
                  <span style={{fontSize:9,color:"#1E40AF"}}>Next: Tier {curTierIdx+2} at {nextTierEntry[0]}%</span>
                  <span style={{fontSize:9,fontWeight:700,color:"#1E40AF"}}>{nextTierEntry[1].toLocaleString()} pts</span>
                </div>}
                {isMaxTier&&<div style={{fontSize:9,color:"#1E6FDB",fontWeight:600,paddingTop:4,borderTop:"1px dashed #BFDBFE"}}>🏆 Maximum tier reached</div>}
              </div>;
            })()}
          </div>;
        })()}
      </div>

      {/* SR Cards */}
      <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.08em"}}>SR Performance</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,alignItems:"start"}}>
        {srList.sort((a,b)=>pctN(srTotals[b.id]?.total||0,targets?.sr?.[b.id]?.target||0)-pctN(srTotals[a.id]?.total||0,targets?.sr?.[a.id]?.target||0)).map(sr=>{
  const target=targets?.sr?.[sr.id]?.target||0,bonus=targets?.sr?.[sr.id]?.bonus||0;
  const rows=days.map(d=>{const k=`${d}/${month}/${year}`,v=records[k]?.[sr.id]||{};return{day:d,wi:v.walkin||0,ae:v.aeon||0};});
  const tWI=rows.reduce((s,r)=>s+r.wi,0),tAE=rows.reduce((s,r)=>s+r.ae,0),total=tWI+tAE;
  const p=pctN(total,target),color=achColor(total,target);
  const bonusEarned=branchPct>=100&&total>=target&&bonus>0;
  const achBonus=calcAchievementBonus(p),points=calcRewardPoints(p,branchPct);
  const thS={padding:"6px 12px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
  return <div key={sr.id} style={{border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden",background:"#fff",boxShadow:"0 1px 4px rgba(10,22,40,.05)"}}>
    <div style={{background:"#0A1628",padding:"10px 14px"}}>
      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>EMAX NETWORK SDN BHD</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontWeight:800,fontSize:13,color:"#fff"}}>{sr.canon}</span>
        <TypeTag type={sr.type}/>
      </div>
    </div>
    <div style={{padding:"5px 14px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <StatusTag status={sr.status}/>
      <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{(bMeta[sr.branch]?.name||sr.branch).toUpperCase()}</span>
    </div>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>
        <th style={{...thS,textAlign:"center",width:48}}>Date</th>
        <th style={{...thS,color:"#4A5568"}}>Walk In</th>
        <th style={{...thS,color:"#4A5568"}}>Invoice</th>
        <th style={{...thS,color:"#4A5568"}}>Total</th>
      </tr></thead>
      <tbody>{rows.map(({day,wi,ae})=>{
        const rt=wi+ae;
        return <tr key={day} className="shine-row" style={{borderBottom:"1px solid rgba(228,234,242,.8)",background:day%2===0?"#fff":"#F7F9FC"}}>
          <td style={{padding:"4px 8px",color:"#4A5568",fontWeight:600,textAlign:"center",fontSize:11,borderRight:"1px solid rgba(228,234,242,.6)"}}>{day}/{month}</td>
          <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:wi!==0?"#4A5568":"#E4EAF2",fontWeight:wi!==0?500:300}}>{wi!==0?f2(wi):"—"}</td>
          <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:ae!==0?"#4A5568":"#E4EAF2",fontWeight:ae!==0?500:300}}>{ae!==0?f2(ae):"—"}</td>
          <td style={{padding:"4px 12px",textAlign:"right",fontWeight:rt!==0?600:300,fontSize:11,color:rt>0?"#0A1628":rt<0?"#F0354B":"#E4EAF2"}}>{rt!==0?f2(rt):"—"}</td>
        </tr>;
      })}</tbody>
    </table>
    <div style={{padding:"10px 14px",background:"#F7F9FC",borderTop:"2px solid #E4EAF2"}}>
      {[["Walk In",fRM(tWI),"#4A5568"],["Invoice",fRM(tAE),"#4A5568"],["Total Profit",fRM(total),"#0A1628"]].map(([l,v,c])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}>
          <span style={{color:"#5A6472"}}>{l}</span>
          <span style={{fontWeight:700,color:c,fontSize:11}}>{v}</span>
        </div>
      ))}
      <div style={{height:1,background:"#E4EAF2",margin:"7px 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Target</span>
        <span style={{fontWeight:700,fontSize:11}}>{target>0?fRM(target):"Not set"}</span>
      </div>
      {target>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
          <span style={{color:"#5A6472"}}>Personal Achievement</span>
          <AchBadge profit={total} target={target}/>
        </div>
        <ProgressBar pct={p} color={color}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:5}}>
          <span style={{color:"#5A6472"}}>Balance to Hit</span>
          <span style={{fontWeight:700,color:Math.max(target-total,0)>0?"#F0354B":"#00C896",fontSize:11}}>
            {Math.max(target-total,0)>0?fRM(Math.max(target-total,0)):"Target Met"}
          </span>
        </div>
      </>}
      {/* ── BRANCH ACHIEVEMENT BONUS & REWARD POINTS ── */}
      <div style={{height:1,background:"#E4EAF2",margin:"8px 0"}}/>
      <div style={{fontSize:9,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Incentives</div>

      {/* Personal Achievement Bonus */}
      {bonus>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4,gap:6,flexWrap:"nowrap"}}>
        <span style={{color:"#5A6472",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Personal Achievement Bonus</span>
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>
          {bonusEarned?fRM(bonus):`${fRM(bonus)} (Pending)`}
        </span>
      </div>}

      {/* Branch Achievement Bonus */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,gap:6,flexWrap:"nowrap"}}>
        <span style={{color:"#5A6472",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Branch Achievement Bonus</span>
        {(branchPct>=120&&p>=100)
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{fRM(calcAchievementBonus(branchPct,"sr"))}</span>
          : <span style={{color:"#5A6472",flexShrink:0}}>—</span>
        }
      </div>

      {/* Reward Points */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,marginTop:2,gap:6,flexWrap:"nowrap"}}>
        <span style={{color:"#5A6472",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Reward Points (This Month)</span>
        {(branchPct>=100&&p>=110)
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{calcRewardPoints(p,branchPct).toLocaleString()} pts</span>
          : <span style={{color:"#5A6472",flexShrink:0}}>—</span>
        }
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:6,gap:6,flexWrap:"nowrap"}}>
        <span style={{color:"#5A6472",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{(rewardBalances[sr.id]?.balance||0).toLocaleString()} pts</span>
      </div>

      {/* Compact tier progress — only shown when at least one tier is active */}
      {((branchPct>=120&&p>=100)||(branchPct>=100&&p>=110))&&(()=>{
        const bTier=branchPct>=120&&p>=100?Math.floor((branchPct-120)/10)+1:null;
        const bNextPct=bTier?120+bTier*10:null;
        const bMax=bNextPct>200;
        const pts=calcRewardPoints(p,branchPct);
        const TIERS=[[110,500],[120,1000],[130,1500],[140,2000],[150,3000],[160,4500],[170,6000],[180,7500],[190,9000],[200,12000]];
        const pTierIdx=branchPct>=100&&p>=110?TIERS.reduce((acc,[t],i)=>p>=t?i:acc,-1):-1;
        const pNext=pTierIdx>=0?TIERS[pTierIdx+1]:null;
        return <div style={{background:"#F7F9FC",borderRadius:8,padding:"8px 10px",border:"1px solid #E4EAF2",display:"flex",flexDirection:"column",gap:5}}>
          {bTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#92400E",fontWeight:600}}>Bonus Tier {bTier}{!bMax?` → next at ${bNextPct}%`:" (max)"}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#0A1628"}}>{!bMax?fRM(calcAchievementBonus(bNextPct,"sr")):"🏆"}</span>
          </div>}
          {pTierIdx>=0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#1E40AF",fontWeight:600}}>Points Tier {pTierIdx+1}{pNext?` → next at ${pNext[0]}%`:" (max)"}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#0A1628"}}>{pNext?pNext[1].toLocaleString()+" pts":"🏆"}</span>
          </div>}
        </div>;
      })()}

    </div>
  </div>;
        })}
      </div>

      <PdfDownloads month={month} year={year}/>
      </div>}{/* end overview tab */}
    </div>{/* end main content */}

      {/* SIDEBAR — right side, collapsible */}
      <div style={{
        width:sidebarOpen?220:0,flexShrink:0,overflow:"hidden",
        transition:"width .2s ease",background:"#0F1B30",borderLeft:sidebarOpen?"1px solid #1C2D4A":"none",
        minHeight:"calc(100vh - 49px)",position:"sticky",top:49,alignSelf:"flex-start",
      }}>
        <div style={{width:220,padding:"16px 10px",visibility:sidebarOpen?"visible":"hidden"}}>
          {[{id:"overview",label:"Performance"},{id:"rankings",label:"Rankings"},{id:"points",label:"Reward Point Ranking"}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setSidebarOpen(false);}} style={{
              display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
              border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
              background:tab===t.id?"rgba(255,255,255,.1)":"transparent",color:tab===t.id?"#fff":"rgba(255,255,255,.45)",
              transition:"background .15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>{/* end flex layout */}
    {showPointsModal&&<PointsHistoryModal srList={srList} bMeta={bMeta} rewardBalances={rewardBalances} rewardHistory={rewardHistory} initialPerson={pointsModalPerson} onClose={()=>{setShowPointsModal(false);setPointsModalPerson(null);}}/>}
  </div>;
}
