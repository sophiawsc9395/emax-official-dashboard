// EMAX NETWORK — Boss Viewer (All Branches, Read-Only)
import { useState, useEffect, useMemo, useRef } from "react";
import { loadData, supabase } from "../../storage/index.js";

const CSS = `
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
  tfoot td{white-space:nowrap!important;}
  thead th{white-space:nowrap!important;}
`;


const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const DEFAULT_BRANCH_META={
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
};
const DEFAULT_SR=[
  {id:"EM0285",canon:"ESTHER",branch:"KM",type:"Online",status:"Confirmed (P4 F0)"},
  {id:"EM0264",canon:"LYFIE MIEHCHIE",branch:"KM",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0069",canon:"EFFIEARZERRA",branch:"KM",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0243",canon:"SITI NORDIANA",branch:"KM",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0187",canon:"ROSE",branch:"KM",type:"Online",status:"Probation (P0 F0)"},
  {id:"EM0033",canon:"KEVIN CHIN",branch:"T1",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0045",canon:"INJJIE",branch:"T1",type:"Online",status:"Confirmed (P5 F0)"},
  {id:"EM0056",canon:"EVVY",branch:"T1",type:"Online",status:"Confirmed (P5 F0)"},
  {id:"EM0078",canon:"FRISHIKA",branch:"T1",type:"Online",status:"Confirmed (P3 F1)"},
  {id:"EM0089",canon:"ADRINA",branch:"T1",type:"Online",status:"Probation (P3 F1)"},
  {id:"EM0090",canon:"MASDANIAR",branch:"TW2",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0103",canon:"ZAHARAH",branch:"TW2",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0112",canon:"SHAHRIL",branch:"TW2",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0121",canon:"ERNITA",branch:"TW2",type:"Online",status:"Confirmed (P5 F0)"},
  {id:"EM0197",canon:"NURUL ZIANA",branch:"TW1",type:"Offline",status:"Confirmed (P1 F1)"},
  {id:"EM0229",canon:"NURSHAFATIN",branch:"TW1",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0231",canon:"MIRA SABRINA",branch:"TW1",type:"Online",status:"Probation (P0 F0)"},
  {id:"EM0232",canon:"NUR ATIKAH",branch:"TW1",type:"Online",status:"Probation (P1 F0)"},
  {id:"EM0233",canon:"NUR DIANA",branch:"TW1",type:"Online",status:"Probation (P0 F0)"},
  {id:"EM0282",canon:"NURUL FARAH",branch:"LD",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0299",canon:"NURHIKMAH",branch:"LD",type:"Offline",status:"Confirmed (P3 F0)"},
  {id:"EM0300",canon:"ALIF FARHAD",branch:"LD",type:"Offline",status:"Confirmed (P3 F0)"},
  {id:"EM0301",canon:"MAZWANIE",branch:"LD",type:"Offline",status:"Confirmed (P4 F1)"},
  {id:"EM0204",canon:"MOHD FAID",branch:"KB",type:"Offline",status:"Confirmed (P2 F3)"},
  {id:"EM0236",canon:"AERON SEAN",branch:"KB",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0267",canon:"MUAZAM",branch:"KB",type:"Offline",status:"Confirmed (P2 F3)"},
  {id:"EM0199",canon:"SHAHMIRUL",branch:"T5",type:"Offline",status:"Confirmed (P1 F4)"},
  {id:"EM0306",canon:"AIMAN",branch:"T5",type:"Online",status:"Probation (P1 F1)"},
  {id:"EM0253",canon:"NAZRIN",branch:"ITCC",type:"Online",status:"Probation (P0 F0)"},
  {id:"EM0281",canon:"SAHRIZAN",branch:"ITCC",type:"Offline",status:"Probation (P3 F2)"},
  {id:"EM0305",canon:"O'DONELL",branch:"ITCC",type:"Online",status:"Probation (P1 F1)"},
  {id:"EM0240",canon:"JENIAH",branch:"TENOM",type:"Offline",status:"Confirmed (P5 F0)"},
  {id:"EM0263",canon:"MARDIANA",branch:"TENOM",type:"Offline",status:"Confirmed (P4 F1)"},
  {id:"EM0270",canon:"SHERAIN",branch:"TENOM",type:"Online",status:"Probation (P2 F1)"},
  {id:"EM0290",canon:"ABD FERHAN",branch:"TENOM",type:"Online",status:"Probation (P0 F0)"},
];
const DEFAULT_TARGETS={
  bm:{KM:50000,T1:50000,TW2:50000,TW1:55000,LD:45000,KB:50000,T5:38000,ITCC:50000,TENOM:45000,HQ:36000},
  bmBonus:{KM:0,T1:0,TW2:0,TW1:0,LD:0,KB:0,T5:0,ITCC:0,TENOM:0,HQ:0},
  bmBasic:{KM:0,T1:0,TW2:0,TW1:0,LD:0,KB:0,T5:0,ITCC:0,TENOM:0,HQ:0},
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
const SR_KEY="emax_v5_sr_list",BM_KEY="emax_v5_branch_meta";

const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const f2=(n=0)=>Number(n||0).toFixed(2);
const nc=(n)=>Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
const pctN=(p,t)=>t>0?(p/t)*100:0;
function daysInMonth(m,y){return new Date(y,m,0).getDate();}
function achColor(p,t){const r=pctN(p,t);return r>=100?"#00C896":r>=80?"#F5A623":r>=50?"#F0794B":"#F0354B";}
function achBg(p,t){const r=pctN(p,t);return r>=100?"#00C89612":r>=80?"#F5A62312":r>=50?"#F0794B12":"#F0354B12";}
function calcAchievementBonus(pct,role="sr"){if(pct<120)return 0;const t=Math.floor((pct-120)/10);return role==="bm"?500+t*500:300+t*50;}
function calcRewardPoints(pct,bPct){if(bPct<100||pct<110)return 0;const T=[[200,12000],[190,9000],[180,7500],[170,6000],[160,4500],[150,3000],[140,2000],[130,1500],[120,1000],[110,500]];for(const[t,p]of T)if(pct>=t)return p;return 0;}

// loadData imported

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
function AchBadge({profit,target,size="sm"}){
  if(!target)return <span style={{color:"#8A96A8"}}>—</span>;
  const p=pctN(profit,target),c=achColor(profit,target),bg=achBg(profit,target);
  return <span style={{background:bg,color:c,padding:"2px 10px",borderRadius:20,fontSize:size==="md"?12:11,fontWeight:700}}>{p.toFixed(2)}%</span>;
}
function ProgressBar({pct,color,h=5}){
  return <div style={{height:h,background:"#E4EAF2",borderRadius:h,overflow:"hidden"}}>
    <div style={{height:"100%",width:Math.min(pct,100)+"%",background:color,transition:"width .6s"}}/>
  </div>;
}
function RankMedal({rank}){
  if(rank===1)return <span style={{fontWeight:900,color:"#D97706"}}>1st</span>;
  if(rank===2)return <span style={{fontWeight:900,color:"#64748B"}}>2nd</span>;
  if(rank===3)return <span style={{fontWeight:900,color:"#B45309"}}>3rd</span>;
  return <span style={{fontWeight:700,color:"#8A96A8"}}>#{rank}</span>;
}

function SRCard({sr,records,targets,branchPct,month,year,days,bMeta,rewardBalance=0,pointsAsOf="",onStatusHistory}){
  const target=targets?.sr?.[sr.id]?.target||0,bonus=targets?.sr?.[sr.id]?.bonus||0;
  const rows=days.map(d=>{const k=`${d}/${month}/${year}`,v=records[k]?.[sr.id]||{};return{day:d,wi:v.walkin||0,ae:v.aeon||0};});
  const tWI=rows.reduce((s,r)=>s+r.wi,0),tAE=rows.reduce((s,r)=>s+r.ae,0),total=tWI+tAE;
  const p=pctN(total,target),color=achColor(total,target);
  const bonusEarned=branchPct>=100&&total>=target&&bonus>0;
  const achBonus=calcAchievementBonus(p),points=calcRewardPoints(p,branchPct);
  const thS={padding:"6px 12px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
  return <div style={{border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden",background:"#fff",boxShadow:"0 1px 4px rgba(10,22,40,.05)"}}>
    <div style={{background:"#0A1628",padding:"10px 14px"}}>
      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>EMAX NETWORK SDN BHD</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontWeight:800,fontSize:13,color:"#fff"}}>{sr.canon}</span>
        <TypeTag type={sr.type}/>
      </div>
    </div>
    <div style={{padding:"5px 14px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <StatusTag status={sr.status}/>
        {onStatusHistory&&<button onClick={()=>onStatusHistory(sr.id)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.45)",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>History</button>}
      </div>
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
          <span style={{color:c,fontSize:11}}>{v}</span>
        </div>
      ))}
      <div style={{height:1,background:"#E4EAF2",margin:"7px 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Target</span>
        <span style={{fontSize:11,color:"#4A5568"}}>{target>0?fRM(target):"Not set"}</span>
      </div>
      {target>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
          <span style={{color:"#5A6472"}}>Personal Achievement</span>
          <AchBadge profit={total} target={target}/>
        </div>
        <ProgressBar pct={p} color={color}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:5}}>
          <span style={{color:"#5A6472"}}>Balance to Hit</span>
          <span style={{color:Math.max(target-total,0)>0?"#F0354B":"#00C896",fontSize:11}}>
            {Math.max(target-total,0)>0?fRM(Math.max(target-total,0)):"Target Met"}
          </span>
        </div>
      </>}
      {/* ── BRANCH ACHIEVEMENT BONUS & REWARD POINTS ── */}
      <div style={{height:1,background:"#E4EAF2",margin:"8px 0"}}/>
      <div style={{fontSize:9,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Incentives</div>

      {/* Personal Achievement Bonus */}
      {bonus>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Personal Achievement Bonus</span>
        <span style={{fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>
          {bonusEarned?fRM(bonus):`${fRM(bonus)} (Pending)`}
        </span>
      </div>}

      {/* Branch Achievement Bonus */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Branch Achievement Bonus</span>
        {(branchPct>=120&&p>=100)
          ? <span style={{fontSize:11,color:"#0A1628"}}>{fRM(calcAchievementBonus(branchPct,"sr"))}</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>

      {/* Reward Points */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,marginTop:2}}>
        <span style={{color:"#5A6472"}}>Reward Points (This Month)</span>
        {(branchPct>=100&&p>=110)
          ? <span style={{fontSize:11,color:"#0A1628"}}>{calcRewardPoints(p,branchPct).toLocaleString()} pts</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
        <span style={{color:"#5A6472"}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
        <span style={{fontSize:11,color:"#0A1628"}}>{rewardBalance.toLocaleString()} pts</span>
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
}

function BMCard({branchId,records,targets,srList,branchMeta,month,year,days,rewardBalance=0,pointsAsOf="",onStatusHistory}){
  const meta=branchMeta[branchId]||{},bSRs=srList.filter(s=>s.branch===branchId);
  const target=targets?.bm?.[branchId]||0,bmBonus=targets?.bmBonus?.[branchId]||0,bmBasic=targets?.bmBasic?.[branchId]||0;
  const rows=days.map(d=>{
    const k=`${d}/${month}/${year}`,day=records[k]||{},bm=day[`BM_${branchId}`]||{};
    let wi=bm.walkin||0,ae=bm.aeon||0,ua=bm.unalloc||0;
    bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
    return{day:d,wi,ae,ua};
  });
  const tWI=rows.reduce((s,r)=>s+r.wi,0),tAE=rows.reduce((s,r)=>s+r.ae,0),tUA=rows.reduce((s,r)=>s+r.ua,0),total=tWI+tAE+tUA;
  const p=pctN(total,target),color=achColor(total,target);
  const bmBonusEarned=target>0&&total>=target&&bmBonus>0;
  const achBonus=calcAchievementBonus(p,"bm"),points=calcRewardPoints(p,p);
  const thS={padding:"6px 10px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
  return <div style={{border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden",background:"#fff",boxShadow:"0 1px 4px rgba(10,22,40,.05)"}}>
    <div style={{background:"#0A1628",padding:"10px 14px"}}>
      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>EMAX NETWORK SDN BHD</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontWeight:800,fontSize:13,color:"#fff"}}>{meta.manager}</span>
        <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)"}}>Branch Manager</span>
      </div>
    </div>
    <div style={{padding:"5px 14px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <StatusTag status={meta.mStatus}/>
        {onStatusHistory&&<button onClick={()=>onStatusHistory(`BM_${branchId}`)} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.45)",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>History</button>}
      </div>
      <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{meta.name}</span>
    </div>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>
        <th style={{...thS,textAlign:"center",width:48}}>Date</th>
        <th style={{...thS,fontSize:9}}>Unalloc.</th>
        <th style={{...thS,color:"#4A5568"}}>Walk In</th>
        <th style={{...thS,color:"#4A5568"}}>Invoice</th>
        <th style={{...thS,color:"#4A5568"}}>Total</th>
      </tr></thead>
      <tbody>{rows.map(({day,wi,ae,ua})=>{
        const rt=wi+ae+ua;
        return <tr key={day} className="shine-row" style={{borderBottom:"1px solid rgba(228,234,242,.8)",background:day%2===0?"#fff":"#F7F9FC"}}>
          <td style={{padding:"4px 8px",color:"#4A5568",fontWeight:600,textAlign:"center",fontSize:11,borderRight:"1px solid rgba(228,234,242,.6)"}}>{day}/{month}</td>
          <td style={{padding:"4px 10px",textAlign:"right",fontSize:11,color:ua<0?"#F0354B":"#8A96A8"}}>{ua!==0?f2(ua):"—"}</td>
          <td style={{padding:"4px 10px",textAlign:"right",fontSize:11,color:wi!==0?"#4A5568":"#E4EAF2",fontWeight:wi!==0?500:300}}>{wi!==0?f2(wi):"—"}</td>
          <td style={{padding:"4px 10px",textAlign:"right",fontSize:11,color:ae!==0?"#4A5568":"#E4EAF2",fontWeight:ae!==0?500:300}}>{ae!==0?f2(ae):"—"}</td>
          <td style={{padding:"4px 10px",textAlign:"right",fontWeight:rt!==0?600:300,fontSize:11,color:rt>0?"#0A1628":rt<0?"#F0354B":"#E4EAF2"}}>{rt!==0?f2(rt):"—"}</td>
        </tr>;
      })}</tbody>
    </table>
    <div style={{padding:"10px 14px",background:"#F7F9FC",borderTop:"2px solid #E4EAF2"}}>
      {[["Unallocated",fRM(tUA),"#4A5568"],["Walk In",fRM(tWI),"#4A5568"],["Invoice",fRM(tAE),"#4A5568"],["Total Profit",fRM(total),"#0A1628"]].map(([l,v,c])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}>
          <span style={{color:"#5A6472"}}>{l}</span><span style={{color:c,fontSize:11}}>{v}</span>
        </div>
      ))}
      <div style={{height:1,background:"#E4EAF2",margin:"7px 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Target</span><span style={{fontSize:11,color:"#4A5568"}}>{target>0?fRM(target):"Not set"}</span>
      </div>
      {target>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
          <span style={{color:"#5A6472"}}>Personal Achievement</span><AchBadge profit={total} target={target}/>
        </div>
        <ProgressBar pct={p} color={color}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:5}}>
          <span style={{color:"#5A6472"}}>Balance to Hit</span>
          <span style={{color:Math.max(target-total,0)>0?"#F0354B":"#00C896",fontSize:11}}>
            {Math.max(target-total,0)>0?fRM(Math.max(target-total,0)):"Target Met"}
          </span>
        </div>
      </>}
      {/* ── BM INCENTIVES ── */}
      <div style={{height:1,background:"#E4EAF2",margin:"8px 0"}}/>
      <div style={{fontSize:9,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Incentives</div>

      {bmBasic>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Monthly Basic</span>
        <span style={{fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(bmBasic)}</span>
      </div>}
      {bmBonus>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Personal Achievement Bonus</span>
        <span style={{fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>
          {bmBonusEarned?fRM(bmBonus):`${fRM(bmBonus)} (Pending)`}
        </span>
      </div>}



      {/* Branch Achievement Bonus — BM qualifies when branch >=120% */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Branch Achievement Bonus</span>
        {p>=120
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{fRM(calcAchievementBonus(p,"bm"))}</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>
      {/* Reward Points */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,marginTop:2}}>
        <span style={{color:"#5A6472"}}>Reward Points (This Month)</span>
        {(p>=100&&p>=110)
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{calcRewardPoints(p,p).toLocaleString()} pts</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
        <span style={{color:"#5A6472"}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
        <span style={{fontSize:11,color:"#0A1628"}}>{rewardBalance.toLocaleString()} pts</span>
      </div>

      {/* Compact tier progress — only shown when at least one tier is active */}
      {((p>=120)||(p>=100&&p>=110))&&(()=>{
        const bTier=p>=120?Math.floor((p-120)/10)+1:null;
        const bNextPct=bTier?120+bTier*10:null;
        const bMax=bNextPct>200;
        const pts=calcRewardPoints(p,p);
        const TIERS=[[110,500],[120,1000],[130,1500],[140,2000],[150,3000],[160,4500],[170,6000],[180,7500],[190,9000],[200,12000]];
        const pTierIdx=p>=100&&p>=110?TIERS.reduce((acc,[t],i)=>p>=t?i:acc,-1):-1;
        const pNext=pTierIdx>=0?TIERS[pTierIdx+1]:null;
        return <div style={{background:"#F7F9FC",borderRadius:8,padding:"8px 10px",border:"1px solid #E4EAF2",display:"flex",flexDirection:"column",gap:5}}>
          {bTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#92400E",fontWeight:600}}>Bonus Tier {bTier}{!bMax?` → next at ${bNextPct}%`:" (max)"}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#0A1628"}}>{!bMax?fRM(calcAchievementBonus(bNextPct,"bm")):"🏆"}</span>
          </div>}
          {pTierIdx>=0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#1E40AF",fontWeight:600}}>Points Tier {pTierIdx+1}{pNext?` → next at ${pNext[0]}%`:" (max)"}</span>
            <span style={{fontSize:10,fontWeight:700,color:"#0A1628"}}>{pNext?pNext[1].toLocaleString()+" pts":"🏆"}</span>
          </div>}
        </div>;
      })()}

    </div>
  </div>;
}


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


function BranchPerfTable({branchTotals,targets,branchMeta,printRef,month,year,startDay=1,endDay=30,onChangeStartDay,onChangeEndDay,maxDay}){
  const bt = branchTotals;

  const grandWI=BRANCH_ORDER.reduce((s,b)=>s+(bt[b]?.wi||0),0);
  const grandAE=BRANCH_ORDER.reduce((s,b)=>s+(bt[b]?.ae||0),0);
  const grandT=grandWI+grandAE;
  const grandTgt=BRANCH_ORDER.reduce((s,b)=>s+(targets?.bm?.[b]||0),0);
  const TH=(e={})=>({padding:"10px 16px",fontWeight:700,fontSize:10,background:"#0A1628",color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",whiteSpace:"nowrap",...e});
  const TD=(e={})=>({padding:"9px 16px",fontSize:12,whiteSpace:"nowrap",borderBottom:"1px solid rgba(228,234,242,.7)",...e});
  return <div ref={printRef} style={{background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #E4EAF2",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #E4EAF2"}}>
      <div>
        <h3 style={{fontWeight:800,fontSize:14,color:"#0A1628",margin:0}}>Branch Performance Report</h3>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#5A6472"}}>Period:</span>
          {onChangeStartDay
            ? <select value={startDay} onChange={e=>onChangeStartDay(Number(e.target.value))}
                style={{fontSize:11,color:"#1E6FDB",fontWeight:700,border:"none",background:"transparent",outline:"none",cursor:"pointer",padding:0,fontFamily:"Inter,sans-serif"}}>
                {Array.from({length:maxDay||daysInMonth(month,year)},(_,i)=>i+1).filter(d=>d<=endDay).map(d=>(
                  <option key={d} value={d}>{d}/{month}/{year}</option>
                ))}
              </select>
            : <span style={{fontSize:11,color:"#5A6472"}}>{startDay}/{month}/{year}</span>
          }
          <span style={{fontSize:11,color:"#5A6472"}}>–</span>
          {onChangeEndDay
            ? <select value={endDay} onChange={e=>onChangeEndDay(Number(e.target.value))}
                style={{fontSize:11,color:"#1E6FDB",fontWeight:700,border:"none",background:"transparent",outline:"none",cursor:"pointer",padding:0,fontFamily:"Inter,sans-serif"}}>
                {Array.from({length:maxDay||daysInMonth(month,year)},(_,i)=>i+1).filter(d=>d>=startDay).map(d=>(
                  <option key={d} value={d}>{d}/{month}/{year}</option>
                ))}
              </select>
            : <span style={{fontSize:11,color:"#5A6472"}}>{endDay}/{month}/{year}</span>
          }
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:10,color:"#5A6472"}}>Total</div>
        <div style={{fontWeight:700,fontSize:14,color:"#0A1628"}}>{fRM(grandT)}</div>
      </div>
    </div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:920}}>
        <thead><tr>
          <th style={TH({textAlign:"left"})}>Branch</th>
          <th style={TH()}>Monthly Target</th>
          <th style={TH()}>Total Profit</th>
          <th style={TH()}>Walk In</th>
          <th style={TH()}>Invoice</th>
          <th style={TH()}>Balance</th>
          <th style={TH()}>Achievement</th>
        </tr></thead>
        <tbody>{[...BRANCH_ORDER].sort((a,b2)=>{
            const pa=pctN(bt[a]?.total||0,targets?.bm?.[a]||0);
            const pb=pctN(bt[b2]?.total||0,targets?.bm?.[b2]||0);
            return pb-pa;
          }).map((b,i)=>{
          const wi=bt[b]?.wi||0,ae=bt[b]?.ae||0,total=wi+ae;
          const target=targets?.bm?.[b]||0,bal=target>0?total-target:null,over=target>0&&total>=target;
          return <tr key={b} className="shine-row" style={{background:"#fff"}}>
            <td style={{...TD({textAlign:"left"})}}>
              <div style={{fontWeight:700,color:"#0A1628",fontSize:12,textTransform:"uppercase"}}>{branchMeta[b]?.name||b}</div>
              <div style={{fontSize:10,color:"#5A6472",marginTop:1}}>{branchMeta[b]?.manager}</div>
            </td>
            <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontSize:12}}>{target>0?`RM ${nc(target)}`:"—"}</span></td>
            <td style={{...TD(),textAlign:"right"}}>
              <span style={{color:"#4A5568",fontSize:12}}>{total>0?`RM ${nc(total)}`:"—"}</span>
            </td>
            <td style={{...TD(),textAlign:"right"}}>
              <span style={{color:"#4A5568",fontSize:12}}>{wi!==0?`RM ${nc(wi)}`:"—"}</span>
            </td>
            <td style={{...TD(),textAlign:"right"}}>
              <span style={{color:"#4A5568",fontSize:12}}>{ae>0?`RM ${nc(ae)}`:"—"}</span>
            </td>
            <td style={{...TD(),textAlign:"right"}}>
              {bal===null?<span style={{color:"#4A5568",fontSize:12}}>—</span>
                :bal>=0?<span style={{color:"#4A5568",fontSize:12}}>+RM {nc(bal)}</span>
                :<span style={{color:"#4A5568",fontSize:12}}>RM {nc(Math.abs(bal))}</span>}
            </td>
            <td style={{...TD(),textAlign:"right"}}>
              {target>0?<AchBadge profit={total} target={target} size="md"/>:<span style={{color:"#4A5568",fontSize:12}}>—</span>}
            </td>
          </tr>;
        })}</tbody>
        <tfoot><tr style={{background:"#0A1628",fontSize:12}}>
          <td style={{padding:"10px 16px",fontWeight:600,color:"rgba(255,255,255,.6)"}}>Total</td>
          <td style={{padding:"10px 16px",textAlign:"right"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandTgt>0?`RM ${nc(grandTgt)}`:"—"}</span></td>
          <td style={{padding:"10px 16px",textAlign:"right"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandT>0?`RM ${nc(grandT)}`:"—"}</span></td>
          <td style={{padding:"10px 16px",textAlign:"right"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandWI!==0?`RM ${nc(grandWI)}`:"—"}</span></td>
          <td style={{padding:"10px 16px",textAlign:"right"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandAE>0?`RM ${nc(grandAE)}`:"—"}</span></td>
          <td style={{padding:"10px 16px",textAlign:"right"}}>
            <span style={{color:"rgba(255,255,255,.6)"}}>
              {grandTgt>0?(grandT-grandTgt>=0?"+RM "+nc(grandT-grandTgt):"RM "+nc(Math.abs(grandT-grandTgt))):"—"}
            </span>
          </td>
          <td style={{padding:"10px 16px",textAlign:"right"}}><AchBadge profit={grandT} target={grandTgt} size="md"/></td>
        </tr></tfoot>
      </table>
    </div>
  </div>;
}


function KpiCard({label,value,sub,accent="#1E6FDB"}){
  return <div className="card fade-in" style={{padding:"18px 20px",borderTop:`3px solid ${accent}`}}>
    <div style={{fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{label}</div>
    <div style={{fontSize:16,fontWeight:700,color:"#0A1628",letterSpacing:"-0.01em",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#8A96A8",marginTop:4}}>{sub}</div>}
  </div>;
}

function PdfDownloads({month,year,branch}){
  const [pdfList,setPdfList]=useState([]);
  useEffect(()=>{
    loadData("emax_v5_pdf_index").then(idx=>{
      const list=Array.isArray(idx)?idx:[];
      Promise.all(list.map(k=>loadData(k))).then(pdfs=>{
        const valid=pdfs.filter(p=>p&&p.date&&p.b64);
        let filtered=valid.filter(p=>{const parts=p.date.split("/");return parseInt(parts[1])===month&&parseInt(parts[2])===year;});
        if(branch)filtered=filtered.filter(p=>p.branch===branch);
        const seen=new Set();
        const deduped=filtered.filter(p=>{if(seen.has(p.name||p.date))return false;seen.add(p.name||p.date);return true;});
        setPdfList(deduped);
      });
    });
  },[month,year,branch]);
  if(!pdfList.length)return null;
  return <div style={{marginTop:20}}>
    <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>AEON Profit Reports{branch?` — ${branch}`:""}</h3>
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

function StatusHistoryModal({srList,bMeta,statusHistory,onClose,initialPerson}){
  const isBM=initialPerson&&initialPerson.startsWith("BM_");
  const branchId=isBM?initialPerson.replace("BM_",""):null;
  const person=isBM
    ?{name:bMeta[branchId]?.manager||branchId,role:`${branchId} — Branch Manager`}
    :(()=>{const sr=srList.find(s=>s.id===initialPerson);return sr?{name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}:null;})();
  const currentStatus=isBM?bMeta[branchId]?.mStatus:srList.find(s=>s.id===initialPerson)?.status;
  const history=(statusHistory[initialPerson]||[]).slice().reverse();

  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #E4EAF2"}}>
        <div>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>📋 Employment Status History</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:3}}>{person?.name} · {person?.role}</div>
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px"}}>Close</button>
      </div>
      <div style={{padding:"16px 24px",background:"linear-gradient(135deg,#0A1628,#162B52)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>Current Status</div>
        <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>{currentStatus||"—"}</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 24px"}}>
        {history.length===0
          ? <div style={{padding:"32px 0",textAlign:"center",color:"#8A96A8",fontSize:12}}>No status change history yet.</div>
          : history.map((h,i)=>(
            <div key={i} style={{padding:"10px 0",borderBottom:i<history.length-1?"1px solid #F0F2F5":"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:800,color:"#0A1628"}}>{h.status}</span>
                <span style={{fontSize:10,color:"#8A96A8"}}>{new Date(h.date).toLocaleString("en-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div style={{fontSize:12,color:"#5A6472",marginTop:3}}>{h.note}</div>
            </div>
          ))
        }
      </div>
    </div>
  </div>;
}

function PointsHistoryModal({srList,bMeta,rewardBalances,rewardHistory,onClose,initialPerson}){
  const isBM=initialPerson&&initialPerson.startsWith("BM_");
  const branchId=isBM?initialPerson.replace("BM_",""):null;
  const person=isBM
    ?{name:bMeta[branchId]?.manager||branchId,role:`${branchId} — Branch Manager`}
    :(()=>{const sr=srList.find(s=>s.id===initialPerson);return sr?{name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}:null;})();
  const balance=rewardBalances[initialPerson]?.balance||0;
  const rawHistory=rewardHistory[initialPerson]||[];
  const history=rawHistory.map(h=>({
    ...h,
    note:h.type==="adjustment"&&h.note==="Manual balance adjustment"?"Opening balance as at 31/05/2026":h.note
  })).slice().reverse();

  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #E4EAF2"}}>
        <div>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>🏆 Reward Points Balance</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:3}}>{person?.name} · {person?.role}</div>
        </div>
        <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px"}}>Close</button>
      </div>
      <div style={{padding:"16px 24px",background:"linear-gradient(135deg,#0A1628,#162B52)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.35)"}}>Current Balance</div>
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

const RTO_KEY_BOSS="emax_v5_rto_customers";
const MONTHS_BOSS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const MNTHS_SHORT_BOSS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function genScheduleBoss(customer){
  const{autoDebitMonth,autoDebitYear,tenure,monthlyInstallment}=customer;
  if(!autoDebitMonth||!autoDebitYear||!tenure||!monthlyInstallment)return[];
  const schedule=[];
  let m=parseInt(autoDebitMonth),y=parseInt(autoDebitYear);
  for(let i=0;i<parseInt(tenure);i++){
    const key=`${y}-${String(m).padStart(2,"0")}`;
    schedule.push({key,label:`${MNTHS_SHORT_BOSS[m-1]} ${y}`,amount:parseFloat(monthlyInstallment)||0});
    m++;if(m>12){m=1;y++;}
  }
  return schedule;
}

function RTOSummaryComp({customers}){
  const summaryRef=useRef(null);
  const now=new Date();
  const currentKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const analytics=customers.map(c=>{
    const schedule=genScheduleBoss(c);
    const payments=c.payments||{};
    const totalContract=(parseInt(c.tenure)||0)*(parseFloat(c.monthlyInstallment)||0);
    const totalReceived=schedule.filter(s=>payments[s.key]?.paid).reduce((sum,s)=>sum+(payments[s.key]?.amount||s.amount),0);
    const outstanding=totalContract-totalReceived;
    const cost=parseFloat(c.cost)||0;
    const pl=-cost+totalReceived;
    const paidCount=schedule.filter(s=>payments[s.key]?.paid).length;
    const overdue=schedule.filter(s=>s.key<currentKey&&!payments[s.key]?.paid);
    const currentDue=schedule.find(s=>s.key===currentKey&&!payments[s.key]?.paid);
    return{...c,schedule,totalContract,totalReceived,outstanding,cost,pl,paidCount,overdue,currentDue,isComplete:outstanding<=0};
  });
  const totals={
    customers:analytics.length,
    totalContract:analytics.reduce((s,c)=>s+c.totalContract,0),
    totalCost:analytics.reduce((s,c)=>s+c.cost,0),
    totalReceived:analytics.reduce((s,c)=>s+c.totalReceived,0),
    totalOutstanding:analytics.reduce((s,c)=>s+c.outstanding,0),
    totalPL:analytics.reduce((s,c)=>s+c.pl,0),
    overdueCount:analytics.filter(c=>c.overdue.length>0).length,
    completeCount:analytics.filter(c=>c.isComplete).length,
  };
  const overdueCustomers=analytics.filter(c=>c.overdue.length>0).sort((a,b)=>b.overdue.length-a.overdue.length);
  const downloadPhoto=async()=>{
    const el=summaryRef.current;if(!el)return;
    try{
      if(!window.html2canvas){await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
      const canvas=await window.html2canvas(el,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`RTO_Summary_${now.toISOString().split("T")[0]}.png`;a.click();
    }catch(e){alert("Download failed: "+e.message);}
  };
  const today=`${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0,flex:1}}>RTO Portfolio Summary</h2>
        <div style={{fontSize:11,color:"#8A96A8"}}>As at {today}</div>
      </div>
      <div ref={summaryRef} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>EMAX NETWORK SDN BHD</div>
            <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>Rent-to-Own Portfolio Summary</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:3}}>As at {today} · {totals.customers} customers</div>
          </div>
          <div style={{textAlign:"right"}}>
            {totals.overdueCount>0&&<div style={{background:"#FEF2F2",color:"#B91C1C",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>⚠ {totals.overdueCount} Overdue</div>}
            {totals.overdueCount===0&&<div style={{background:"#F0FDF4",color:"#15803D",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>✓ No Overdue</div>}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:0,borderBottom:"1px solid #E4EAF2"}}>
          {[
            ["Total Customers",totals.customers+" customers","#0A1628"],
            ["Active",`${totals.customers-totals.completeCount} / ${totals.customers}`,"#1E6FDB"],
            ["Completed",totals.completeCount+" customers","#15803D"],
            ["Total Contract",fRM(totals.totalContract),"#0A1628"],
            ["Total Cost",fRM(totals.totalCost),"#0A1628"],
            ["Total Received",fRM(totals.totalReceived),"#15803D"],
            ["Outstanding",fRM(totals.totalOutstanding),totals.totalOutstanding>0?"#B91C1C":"#15803D"],
            ["Portfolio P&L",fRM(totals.totalPL),totals.totalPL>=0?"#15803D":"#B91C1C"],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"#fff",padding:"12px 16px",borderRight:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{l}</div>
              <div style={{fontWeight:800,fontSize:13,color:c,lineHeight:1.3,whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>
        {overdueCustomers.length>0&&<>
          <div style={{fontSize:11,fontWeight:800,color:"#B91C1C",textTransform:"uppercase",letterSpacing:"0.07em",padding:"10px 16px",background:"#FEF2F2",display:"flex",alignItems:"center",gap:8,borderTop:"1px solid #FECACA",borderBottom:"1px solid #FECACA"}}>
            <span>⚠</span><span>Overdue Payments ({overdueCustomers.length} customers)</span>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
            <thead><tr style={{background:"#7F1D1D"}}>
              {["Customer","Phone","Branch","Overdue Months","Amount Overdue","Outstanding Bal","Action Required"].map(h=>(
                <th key={h} style={{padding:"8px 12px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:"left"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueCustomers.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #FEE2E2",background:i%2===0?"#FFF5F5":"#FEF2F2"}}>
                <td style={{padding:"8px 12px"}}><div style={{fontWeight:700,color:"#7F1D1D"}}>{c.name}</div><div style={{fontSize:10,color:"#B91C1C"}}>{c.memberId}</div></td>
                <td style={{padding:"8px 12px",color:"#B91C1C",fontSize:11}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"8px 12px",color:"#B91C1C",fontSize:11}}>{c.branch}</td>
                <td style={{padding:"8px 12px"}}><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{c.overdue.map(s=>(<span key={s.key} style={{background:"#FEE2E2",color:"#991B1B",padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{s.label}</span>))}</div></td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#B91C1C"}}>{fRM(c.overdue.reduce((s,sl)=>s+sl.amount,0))}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#B91C1C"}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"8px 12px",fontSize:11,color:"#7F1D1D"}}>{c.overdue.length===1?"1 month — follow up":`${c.overdue.length} months — urgent`}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>}
        <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",padding:"12px 16px 8px",borderTop:"1px solid #E4EAF2"}}>All Customers Payment Analysis</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:800}}>
          <thead><tr style={{background:"#0A1628"}}>
            {[["#",32],["Customer",160],["Branch",60],["Contract",95],["Cost",90],["Received",90],["Outstanding",95],["P&L",90],["Paid",65],["Status",70]].map(([h,w])=>(
              <th key={h} style={{padding:"8px 10px",color:"rgba(255,255,255,.7)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:h==="#"?"center":"left",width:w,minWidth:w}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {analytics.map((c,i)=>{
              const pct=c.schedule.length?Math.round(c.paidCount/c.schedule.length*100):0;
              const status=c.isComplete?"Completed":c.overdue.length>0?`${c.overdue.length} Overdue`:"Active";
              const statusColor=c.isComplete?"#15803D":c.overdue.length>0?"#B91C1C":"#1E6FDB";
              return(
                <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:c.overdue.length>0?"#FFF5F5":i%2===0?"#fff":"#FAFBFC"}}>
                  <td style={{padding:"7px 10px",textAlign:"center",color:"#8A96A8",fontSize:10}}>{i+1}</td>
                  <td style={{padding:"7px 10px",minWidth:160}}><div style={{fontWeight:700,color:"#0A1628",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:200}}>{c.name}</div><div style={{fontSize:10,color:"#8A96A8",marginTop:1}}>{c.memberId}</div><div style={{fontSize:10,color:"#8A96A8"}}>{c.contactNumber}</div></td>
                  <td style={{padding:"7px 10px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(c.totalContract)}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(c.cost)}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:"#15803D",fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.totalReceived)}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:c.outstanding>0?"#B91C1C":"#15803D",fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
                  <td style={{padding:"7px 10px",fontSize:11,color:c.pl>=0?"#15803D":"#B91C1C",fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.pl)}</td>
                  <td style={{padding:"7px 10px"}}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{flex:1,height:5,background:"#E4EAF2",borderRadius:3,overflow:"hidden",minWidth:40}}><div style={{height:"100%",background:c.overdue.length>0?"#B91C1C":"#1E6FDB",width:`${pct}%`,borderRadius:3}}/></div><span style={{fontSize:10,color:"#4A5568",whiteSpace:"nowrap"}}>{c.paidCount}/{c.schedule.length}</span></div></td>
                  <td style={{padding:"7px 10px"}}><span style={{background:c.isComplete?"#DCFCE7":c.overdue.length>0?"#FEE2E2":"#EFF6FF",color:statusColor,padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{status}</span></td>
                </tr>
              );
            })}
            <tr style={{background:"#F0F4FA",borderTop:"2px solid #E4EAF2"}}>
              <td colSpan={3} style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#0A1628"}}>TOTAL ({analytics.length})</td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(totals.totalContract)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(totals.totalCost)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#15803D",whiteSpace:"nowrap"}}>{fRM(totals.totalReceived)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:totals.totalOutstanding>0?"#B91C1C":"#15803D",whiteSpace:"nowrap"}}>{fRM(totals.totalOutstanding)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:totals.totalPL>=0?"#15803D":"#B91C1C",whiteSpace:"nowrap"}}>{fRM(totals.totalPL)}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table></div>
        {analytics.filter(c=>c.currentDue).length>0&&(()=>{
          const dueCusts=analytics.filter(c=>c.currentDue);
          const totalDue=dueCusts.reduce((s,c)=>s+c.currentDue.amount,0);
          return <>
            <div style={{fontSize:11,fontWeight:800,color:"#854D0E",textTransform:"uppercase",letterSpacing:"0.07em",padding:"10px 16px",background:"#FFFBEB",display:"flex",alignItems:"center",gap:8,borderTop:"1px solid #FDE68A",borderBottom:"1px solid #FDE68A"}}>
              <span>📅</span><span>Due This Month — {MONTHS_BOSS[now.getMonth()]} {now.getFullYear()} ({dueCusts.length} customers)</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:500}}>
              <thead><tr style={{background:"#0A1628"}}>
                {["Member ID","Customer","Phone","Branch","Amount Due"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:h==="Amount Due"?"right":"left"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {dueCusts.map((c,i)=>(
                  <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:i%2===0?"#fff":"#FAFBFC"}}>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#8A96A8"}}>{c.memberId}</td>
                    <td style={{padding:"8px 12px",fontWeight:700,color:"#0A1628"}}>{c.name}</td>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#4A5568"}}>{c.contactNumber||"—"}</td>
                    <td style={{padding:"8px 12px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                    <td style={{padding:"8px 12px",fontWeight:700,color:"#0A1628",textAlign:"right",whiteSpace:"nowrap"}}>{fRM(c.currentDue.amount)}</td>
                  </tr>
                ))}
                <tr style={{background:"#F0F4FA",borderTop:"2px solid #E4EAF2"}}>
                  <td colSpan={4} style={{padding:"8px 12px",fontWeight:800,fontSize:12,color:"#0A1628"}}>TOTAL DUE THIS MONTH</td>
                  <td style={{padding:"8px 12px",fontWeight:800,fontSize:13,color:"#0A1628",textAlign:"right",whiteSpace:"nowrap"}}>{fRM(totalDue)}</td>
                </tr>
              </tbody>
            </table></div>
          </>;
        })()}
      </div>
    </div>
  );
}

function RTOSummary({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{loadData(RTO_KEY_BOSS).then(d=>{setCustomers(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontFamily:"Inter,sans-serif"}}>Loading…</div>;
  if(!customers.length)return<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontFamily:"Inter,sans-serif"}}>No RTO customers found.</div>;
  return <RTOSummaryComp customers={customers}/>;
}

export default function App(){
  const now=new Date();
  const [selMonth,setSelMonth]=useState(now.getMonth()+1);
  const [selYear,setSelYear]=useState(now.getFullYear());
  const month=selMonth,year=selYear;
  const days=Array.from({length:daysInMonth(month,year)},(_,i)=>i+1);
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pointsAsOf=(()=>{
    const today=new Date();
    return `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  })();

  const [selStartDay,setSelStartDay]=useState(1);
  const [selEndDay,setSelEndDay]=useState(daysInMonth(now.getMonth()+1,now.getFullYear()));
  const periodDays=days.filter(d=>d>=selStartDay&&d<=selEndDay);
  const [selBranch,setSelBranch]=useState(BRANCH_ORDER[0]);
  const [tab,setTabRaw]=useState(()=>{const h=window.location.hash.replace("#","");return ["overview","rankings","points","report","repair","rto"].includes(h)?h:"overview";});
  const setTab=(t)=>{setTabRaw(t);window.location.hash=t;};
  const [sidebarOpen,setSidebarOpen]=useState(false);

  const [records,setRecords]=useState({});
  const [targets,setTargets]=useState(DEFAULT_TARGETS);
  const [srList,setSrList]=useState(DEFAULT_SR);
  const [bMeta,setBMeta]=useState(DEFAULT_BRANCH_META);
  const [loading,setLoading]=useState(true);
  const [repairData,setRepairData]=useState({});
  const [rewardBalances,setRewardBalances]=useState({});
  const [rewardHistory,setRewardHistory]=useState({});
  const [statusHistory,setStatusHistory]=useState({});
  const [showStatusHistoryModal,setShowStatusHistoryModal]=useState(false);
  const [statusModalPerson,setStatusModalPerson]=useState(null);
  const [publishedUntil,setPublishedUntil]=useState(null);
  const [showPointsModal,setShowPointsModal]=useState(false);
  const [pointsModalPerson,setPointsModalPerson]=useState(null);

  useEffect(()=>{
    setLoading(true);setRecords({});
    setSelStartDay(1);setSelEndDay(daysInMonth(selMonth,selYear));
    const snapKey=`emax_v5_status_${selYear}_${selMonth}`;
    const repKey=`emax_v5_repair_${selYear}_${selMonth}`;
    const targetKey=`emax_v5_targets_${selYear}_${selMonth}`;
    const prevM=selMonth===1?12:selMonth-1,prevY=selMonth===1?selYear-1:selYear;
    const prevTargetKey=`emax_v5_targets_${prevY}_${prevM}`;
    const publishKey=`emax_v5_published_${selYear}_${selMonth}`;
    const typeKey=`emax_v5_sr_types_${selYear}_${selMonth}`;
    Promise.all([
      loadData(`emax_v5_records_${selYear}_${selMonth}`),
      loadData(targetKey),
      loadData(prevTargetKey),
      loadData("emax_v5_sr_list"),
      loadData("emax_v5_branch_meta"),
      loadData(snapKey),
      loadData(repKey),
      loadData("emax_v5_reward_balance"),
      loadData("emax_v5_reward_history"),
      loadData("emax_v5_status_history"),
      loadData(publishKey),
      loadData(typeKey),
    ]).then(([r,t,tPrev,srData,bmData,snap,rep,rb,rh,sh,pub,srTypes])=>{
      // Only show records up to the published date
      const pubDate=pub?new Date(pub):null;
      const filteredR={};
      Object.entries(r||{}).forEach(([k,v])=>{
        const parts=k.split("/");
        if(parts.length===3){
          const d=new Date(`${parts[2]}-${String(parts[1]).padStart(2,"0")}-${String(parts[0]).padStart(2,"0")}`);
          if(!pubDate||d<=pubDate)filteredR[k]=v;
        }
      });
      setRecords(filteredR);
      setPublishedUntil(pub||null);
      const baseSR=(srData&&Array.isArray(srData)&&srData.length>0)?srData:DEFAULT_SR;
      // Apply monthly type overrides to base SR list
      const baseSRTyped=srTypes&&Object.keys(srTypes).length>0
        ?baseSR.map(sr=>srTypes[sr.id]?{...sr,type:srTypes[sr.id]}:{...sr})
        :baseSR;
      const nowD=new Date();
      const isCurrentMonthV=(selMonth===nowD.getMonth()+1&&selYear===nowD.getFullYear());
      if(!isCurrentMonthV&&snap&&Object.keys(snap).length>0){
        const merged=baseSRTyped.map(sr=>snap[sr.id]?{...sr,status:snap[sr.id].status,active:snap[sr.id].active!==false}:{...sr});
        setSrList(merged.filter(sr=>sr.active!==false));
      } else setSrList(baseSRTyped);
      if(bmData&&Object.keys(bmData).length>0)setBMeta({...DEFAULT_BRANCH_META,...bmData});
      setRewardBalances(rb||{});
      setRewardHistory(rh||{});
      setStatusHistory(sh||{});
      const tUse=t||(tPrev)||null;
      if(tUse?.bm)setTargets({bm:{...DEFAULT_TARGETS.bm,...tUse.bm},bmBonus:{...DEFAULT_TARGETS.bmBonus,...(tUse.bmBonus||{})},bmBasic:{...DEFAULT_TARGETS.bmBasic,...(tUse.bmBasic||{})},sr:{...DEFAULT_TARGETS.sr,...tUse.sr}});
      else setTargets(DEFAULT_TARGETS);
      // Apply monthly BM name/status overrides from targets
      if(tUse&&(tUse.bmName||tUse.bmStatus)){
        const baseBM=srData?{...DEFAULT_BRANCH_META,...(bmData||{})}:{...DEFAULT_BRANCH_META};
        const merged={};
        const mn=tUse.bmName||{},ms=tUse.bmStatus||{};
        BRANCH_ORDER.forEach(b=>{merged[b]={...baseBM[b],manager:mn[b]||baseBM[b]?.manager,mStatus:ms[b]||baseBM[b]?.mStatus};});
        setBMeta(p=>({...p,...merged}));
      }
      setRepairData(rep||{});
      setLoading(false);
    });
  },[selMonth,selYear]);

  const srActiveInMonth=(sr,m,y)=>{
    if(sr.joinDate){const[jy,jm]=sr.joinDate.split("-").map(Number);if(y<jy||(y===jy&&m<jm))return false;}
    return true;
  };
  const srVisibleInMonth=(sr,m,y)=>{
    if(!srActiveInMonth(sr,m,y))return false;
    if(!(sr.status||'').toLowerCase().includes('resigned'))return true;
    if(!sr.resignDate)return false;
    const[ry,rm]=sr.resignDate.split("-").map(Number);
    return ry>y||(ry===y&&rm>=m);
  };

  const branchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));
      let wi=0,ae=0;
      for(let d=selStartDay;d<=selEndDay;d++){
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      }
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,selStartDay,selEndDay,month,year]);

  // Full-month branch totals — Monthly Report always uses this (not period-filtered)
  const fullMonthBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));
      let wi=0,ae=0;
      days.forEach(d=>{
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      });
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,days,month,year]);

  const srTotals=useMemo(()=>{
    const t={};
    srList.forEach(sr=>{
      let wi=0,ae=0;
      periodDays.forEach(d=>{const k=`${d}/${month}/${year}`;wi+=(records[k]?.[sr.id]?.walkin||0);ae+=(records[k]?.[sr.id]?.aeon||0);});
      t[sr.id]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,periodDays,month,year]);

  const grandTotal=BRANCH_ORDER.reduce((s,b)=>s+(branchTotals[b]?.total||0),0);
  const grandTarget=BRANCH_ORDER.reduce((s,b)=>s+(targets?.bm?.[b]||0),0);

  // Last day in the month where ANY branch/SR has a non-zero walkin/aeon/unalloc value
  const lastDataDay=useMemo(()=>{
    const allDays=Array.from({length:daysInMonth(month,year)},(_,i)=>i+1);
    for(let i=allDays.length-1;i>=0;i--){
      const k=`${allDays[i]}/${month}/${year}`;
      const day=records[k];
      if(day){
        const hasValue=Object.values(day).some(entry=>(entry?.walkin||0)!==0||(entry?.aeon||0)!==0||(entry?.unalloc||0)!==0);
        if(hasValue)return allDays[i];
      }
    }return null;
  },[records,month,year]);
  const pad2=(n)=>String(n).padStart(2,"0");
  const rankingPeriod=lastDataDay?`1/${month}/${year} — ${lastDataDay}/${month}/${year}`:`${MONTHS[month-1]} ${year}`;

  // Ranking-specific totals: always 1 → lastDataDay, independent of the Overview period filter
  const rankEndDay=lastDataDay||daysInMonth(month,year);
  const rankBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      }
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,rankEndDay,month,year]);
  const rankSRTotals=useMemo(()=>{
    const t={};
    srList.forEach(sr=>{
      let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){const k=`${d}/${month}/${year}`;wi+=(records[k]?.[sr.id]?.walkin||0);ae+=(records[k]?.[sr.id]?.aeon||0);}
      t[sr.id]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,rankEndDay,month,year]);

  const branchMeta=bMeta;
  const bmRank=[...BRANCH_ORDER].map(b=>{
    const profit=rankBranchTotals[b]?.total||0,target=targets?.bm?.[b]||0,bonus=targets?.bmBonus?.[b]||0;
    const bonusEarned=target>0&&profit>=target&&bonus>0,p=pctN(profit,target);
    return{name:bMeta[b]?.manager,status:bMeta[b]?.mStatus,branch:b,sub:(bMeta[b]?.name||b).toUpperCase(),wi:rankBranchTotals[b]?.wi||0,ae:rankBranchTotals[b]?.ae||0,profit,target,bonus,bonusEarned,branchPct:p,role:"bm",points:calcRewardPoints(p,p)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));



  const mkSRRank=type=>srList.filter(s=>s.type===type&&srVisibleInMonth(s,selMonth,selYear)).map(s=>{
    const profit=rankSRTotals[s.id]?.total||0,target=targets?.sr?.[s.id]?.target||0,bonus=targets?.sr?.[s.id]?.bonus||0;
    const bTotal=rankBranchTotals[s.branch]?.total||0,bTarget=targets?.bm?.[s.branch]||0;
    const branchHit=bTarget>0&&bTotal>=bTarget,p=pctN(profit,target),branchPct=pctN(bTotal,bTarget);
    return{name:s.canon,status:s.status,branch:s.branch,sub:(bMeta[s.branch]?.name||s.branch).toUpperCase(),wi:rankSRTotals[s.id]?.wi||0,ae:rankSRTotals[s.id]?.ae||0,profit,target,bonus,bonusEarned:branchHit&&profit>=target&&bonus>0,branchPct,role:"sr",points:calcRewardPoints(p,branchPct)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));

  const TABS=[{id:"overview",label:"Overview"},{id:"rankings",label:"Rankings"},{id:"points",label:"Reward Point Ranking"},{id:"report",label:"Monthly Report"},{id:"repair",label:"Repair & Service"},{id:"rto",label:"RTO Summary"}];

  if(loading)return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0A1628",fontFamily:"Inter,sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontWeight:900,fontSize:18,color:"#fff",letterSpacing:"0.06em"}}>EMAX NETWORK</div>
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:"0.15em",textTransform:"uppercase",marginTop:8}}>Loading...</div>
    </div>
  </div>;

  return <div style={{minHeight:"100vh",background:"#F7F9FC",fontFamily:"Inter,-apple-system,sans-serif"}}>
    <style>{CSS}</style>
    <div style={{background:"#0A1628",borderBottom:"1px solid #162B52",position:"sticky",top:0,zIndex:100}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 12px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:48,gap:8,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div>
              <div style={{fontWeight:900,fontSize:12,color:"#fff",letterSpacing:"0.06em",lineHeight:1}}>EMAX NETWORK</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:"0.14em",textTransform:"uppercase",marginTop:1}}>Boss View · All Branches</div>

            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
              style={{padding:"4px 8px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
              {MONTHS.map((m,i)=><option key={i+1} value={i+1} style={{background:"#0A1628",color:"#fff"}}>{m}</option>)}
            </select>
            <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
              style={{padding:"4px 8px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
              {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y} style={{background:"#0A1628",color:"#fff"}}>{y}</option>)}
            </select>

          <button onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?"Collapse menu":"Expand menu"}
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,border:"1px solid rgba(255,255,255,.15)",borderRadius:7,background:"rgba(255,255,255,.06)",cursor:"pointer",flexShrink:0}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div style={{display:"flex",maxWidth:1400,margin:"0 auto"}}>
    <div style={{flex:1,minWidth:0,padding:"20px 12px",maxWidth:1180}}>
      <div style={{padding:"7px 14px",background:"#F0F4FA",borderRadius:8,fontSize:11,color:"#4A5568",marginBottom:16}}>
        <span style={{fontWeight:700,color:"#0A1628"}}>Report Period:</span>
        {" "}<span>{lastDataDay?`1/${month}/${year} — ${lastDataDay}/${month}/${year}`:"No data yet"}</span>
      </div>

      {/* OVERVIEW */}
      {tab==="overview"&&<div className="fade-in">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:20}}>
          <KpiCard label="Total Profit" value={fRM(grandTotal)} accent="#1E6FDB"/>
          <KpiCard label="Monthly Target" value={grandTarget>0?fRM(grandTarget):"Not Set"} accent="#162B52"/>
          <KpiCard label="Achievement" value={grandTarget>0?pctN(grandTotal,grandTarget).toFixed(1)+"%":"—"} accent={achColor(grandTotal,grandTarget)}/>
          <KpiCard label="Target Balance" value={grandTarget>0?(grandTotal-grandTarget>=0?"+"+fRM(grandTotal-grandTarget):fRM(grandTotal-grandTarget)):"—"} accent={grandTarget>0&&grandTotal>=grandTarget?"#00C896":"#F0354B"} sub={grandTarget>0&&grandTotal>=grandTarget?"Target exceeded":"Remaining"}/>
          <KpiCard label="On Target" value={`${BRANCH_ORDER.filter(b=>{const t=targets?.bm?.[b]||0;return t>0&&(branchTotals[b]?.total||0)>=t;}).length}/${BRANCH_ORDER.filter(b=>(targets?.bm?.[b]||0)>0).length}`} accent="#F5A623" sub="Branches with target set"/>
        </div>
        <BranchPerfTable branchTotals={branchTotals} targets={targets} branchMeta={bMeta} month={month} year={year} startDay={selStartDay} endDay={Math.min(selEndDay,lastDataDay||daysInMonth(month,year))} maxDay={lastDataDay||daysInMonth(month,year)} onChangeStartDay={setSelStartDay} onChangeEndDay={setSelEndDay}/>
      </div>}

      {/* RANKINGS */}
      {tab==="rankings"&&<div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20}}>
        <RankingTable title="Branch Manager Ranking" rows={bmRank} showBonus showPoints branchMeta={branchMeta} period={rankingPeriod}/>
        <RankingTable title="Online SR Ranking" rows={mkSRRank("Online")} showBonus showPoints branchMeta={branchMeta} period={rankingPeriod}/>
        <RankingTable title="Offline SR Ranking" rows={mkSRRank("Offline")} showBonus showPoints branchMeta={branchMeta} period={rankingPeriod}/>
      </div>}

      {/* REWARD POINT RANKING */}
      {tab==="points"&&<div className="fade-in">
        <div style={{marginBottom:14}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>🏆 Reward Point Ranking</h2>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(()=>{
            const allPeople=[
              ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:bMeta[b]?.manager||b,role:"Branch Manager",branch:b})),
              ...srList.filter(sr=>srVisibleInMonth(sr,selMonth,selYear)).map(sr=>({id:sr.id,name:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
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
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <div style={{fontWeight:800,fontSize:15,color:isTop?"#fff":"#0A1628",whiteSpace:"nowrap"}}>{p.balance.toLocaleString()} pts</div>
                  <button onClick={e=>{e.stopPropagation();setStatusModalPerson(p.id);setShowStatusHistoryModal(true);}} style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:isTop?"rgba(255,255,255,.5)":"#8A96A8",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>Status History</button>
                </div>
              </div>;
            });
          })()}
        </div>
      </div>}

      {/* MONTHLY REPORT */}
      {tab==="report"&&<div className="fade-in">
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#8A96A8",marginRight:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Branch</span>
          <button onClick={()=>setSelBranch("ALL")} style={{padding:"4px 12px",cursor:"pointer",borderRadius:6,fontWeight:700,fontSize:11,fontFamily:"Inter,sans-serif",
            background:selBranch==="ALL"?"#1E6FDB":"#fff",color:selBranch==="ALL"?"#fff":"#4A5568",
            border:selBranch==="ALL"?"none":"1px solid #E4EAF2",transition:"all .15s"}}>
            All
          </button>
          {BRANCH_ORDER.map(b=>(
            <button key={b} onClick={()=>setSelBranch(b)} style={{padding:"4px 12px",cursor:"pointer",borderRadius:6,fontWeight:700,fontSize:11,fontFamily:"Inter,sans-serif",
              background:selBranch===b?"#0A1628":"#fff",color:selBranch===b?"#fff":"#4A5568",
              border:selBranch===b?"none":"1px solid #E4EAF2",transition:"all .15s"}}>
              {b}
            </button>
          ))}
        </div>
        {selBranch==="ALL"
          ? <div>
              <div style={{marginBottom:14,padding:"12px 16px",background:"#F7F9FC",borderRadius:10,border:"1px solid #E4EAF2"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#0A1628"}}>All Branches — {MONTHS[month-1]} {year} Total Daily Performance</div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
                  <thead><tr style={{background:"#0A1628"}}>
                    <th style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",textAlign:"left"}}>Day</th>
                    {BRANCH_ORDER.map(b=><th key={b} style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",textAlign:"right"}}>{b}</th>)}
                    <th style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.9)",textTransform:"uppercase",textAlign:"right"}}>Total</th>
                  </tr></thead>
                  <tbody>
                    {days.map((d,i)=>{
                      const k=`${d}/${month}/${year}`,day=records[k]||{};
                      const bTotals=BRANCH_ORDER.map(b=>{
                        const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));
                        let t=bSRs.reduce((s,sr)=>(s+(day[sr.id]?.walkin||0)+(day[sr.id]?.aeon||0)),0);
                        t+=(day[`BM_${b}`]?.walkin||0)+(day[`BM_${b}`]?.aeon||0)+(day[`BM_${b}`]?.unalloc||0);
                        return t;
                      });
                      const dayTotal=bTotals.reduce((s,t)=>s+t,0);
                      if(dayTotal===0)return null;
                      return <tr key={d} style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#F7F9FC"}}>
                        <td style={{padding:"8px 12px",fontSize:12,fontWeight:600,color:"#0A1628"}}>{d}/{month}</td>
                        {bTotals.map((t,bi)=><td key={bi} style={{padding:"8px 12px",fontSize:12,textAlign:"right",color:t>0?"#4A5568":"#CDD5E0",whiteSpace:"nowrap"}}>{t>0?fRM(t):"—"}</td>)}
                        <td style={{padding:"8px 12px",fontSize:12,fontWeight:700,textAlign:"right",color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(dayTotal)}</td>
                      </tr>;
                    })}
                  </tbody>
                  <tfoot><tr style={{background:"#0A1628"}}>
                    <td style={{padding:"9px 12px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.7)",whiteSpace:"nowrap"}}>Total</td>
                    {BRANCH_ORDER.map(b=>{const t=fullMonthBranchTotals[b]?.total||0;return <td key={b} style={{padding:"9px 12px",fontSize:11,textAlign:"right",color:"rgba(255,255,255,.7)",whiteSpace:"nowrap"}}>{t>0?fRM(t):"—"}</td>;})}
                    <td style={{padding:"9px 12px",fontSize:11,fontWeight:700,textAlign:"right",color:"#fff",whiteSpace:"nowrap"}}>{fRM(Object.values(fullMonthBranchTotals).reduce((s,b)=>s+(b?.total||0),0))}</td>
                  </tr></tfoot>
                </table>
              </div>
              <div style={{marginTop:16}}><PdfDownloads month={month} year={year}/></div>
            </div>
          : (()=>{
          const bSRs=srList.filter(s=>s.branch===selBranch&&srVisibleInMonth(s,selMonth,selYear));
          const bTarget=targets?.bm?.[selBranch]||0;
          const bTot=BRANCH_ORDER.includes(selBranch)?fullMonthBranchTotals[selBranch]?.total||0:0;
          const branchPct=pctN(bTot,bTarget);
          return <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14,alignItems:"start"}}>
              {bSRs.map(sr=><SRCard key={sr.id} sr={sr} records={records} targets={targets} branchPct={branchPct} month={month} year={year} days={days} bMeta={bMeta} rewardBalance={rewardBalances[sr.id]?.balance||0} pointsAsOf={pointsAsOf} onStatusHistory={id=>{setStatusModalPerson(id);setShowStatusHistoryModal(true);}}/>)}
              <BMCard branchId={selBranch} records={records} targets={targets} srList={srList} branchMeta={bMeta} month={month} year={year} days={days} rewardBalance={rewardBalances[`BM_${selBranch}`]?.balance||0} pointsAsOf={pointsAsOf} onStatusHistory={id=>{setStatusModalPerson(id);setShowStatusHistoryModal(true);}}/>
            </div>
            <div style={{marginTop:16}}><PdfDownloads month={month} year={year} branch={selBranch}/></div>
          </div>;
        })()}
      </div>}

      {/* REPAIR */}
      {tab==="repair"&&<div className="fade-in" style={{maxWidth:520}}>
        <div className="card" style={{overflow:"hidden",padding:0}}>
          {/* Dark blue header — matches SR card design */}
          <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 16px"}}>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>EMAX NETWORK SDN BHD</div>
            <div style={{fontWeight:800,fontSize:16,color:"#fff",letterSpacing:"0.01em"}}>Repair & Service</div>
          </div>
          <div style={{padding:"5px 14px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>{MONTHS[month-1]} {year}</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</span>
              <span style={{fontWeight:700,fontSize:13,color:"#fff"}}>{Object.values(repairData).reduce((s,v)=>s+(parseFloat(v)||0),0)>0?fRM(Object.values(repairData).reduce((s,v)=>s+(parseFloat(v)||0),0)):"—"}</span>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#F7F9FC",borderBottom:"1px solid #E4EAF2"}}>
              <th style={{padding:"8px 16px",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"left"}}>Date</th>
              <th style={{padding:"8px 16px",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right"}}>Amount (RM)</th>
            </tr></thead>
            <tbody>
              {days.map(d=>{
                const val=repairData[d]||0;
                return <tr key={d} style={{borderBottom:"1px solid rgba(228,234,242,.6)"}}>
                  <td style={{padding:"7px 16px",fontSize:12,color:"#4A5568"}}>{d}/{month}/{year}</td>
                  <td style={{padding:"7px 16px",textAlign:"right",fontSize:12,color:val>0?"#0A1628":val<0?"#F0354B":"#CDD5E0",fontWeight:val!==0?600:400}}>{val!==0?fRM(val):"—"}</td>
                </tr>;
              })}
            </tbody>
            <tfoot><tr style={{background:"#0A1628"}}>
              <td style={{padding:"9px 16px",fontWeight:700,color:"rgba(255,255,255,.7)",fontSize:12}}>Total</td>
              <td style={{padding:"9px 16px",textAlign:"right",fontWeight:700,color:"rgba(255,255,255,.9)",fontSize:12}}>{Object.values(repairData).reduce((s,v)=>s+(parseFloat(v)||0),0)>0?fRM(Object.values(repairData).reduce((s,v)=>s+(parseFloat(v)||0),0)):"—"}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>}

      {tab==="rto"&&<div style={{padding:"12px 4px",minHeight:400}}><RTOSummary branchMeta={bMeta}/></div>}
    </div>{/* end main content */}

      {/* SIDEBAR — right side, collapsible */}
      <div style={{
        width:sidebarOpen?220:0,flexShrink:0,overflow:"hidden",
        transition:"width .2s ease",background:"#0F1B30",borderLeft:sidebarOpen?"1px solid #1C2D4A":"none",
        minHeight:"calc(100vh - 49px)",position:"sticky",top:49,alignSelf:"flex-start",
      }}>
        <div style={{width:220,padding:"16px 10px",visibility:sidebarOpen?"visible":"hidden"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setSidebarOpen(false);}} style={{
              display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
              border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
              background:tab===t.id?"rgba(255,255,255,.1)":"transparent",color:tab===t.id?"#fff":"rgba(255,255,255,.45)",
              transition:"background .15s",
            }}>
              {t.label}
            </button>
          ))}
          <div style={{width:"100%",height:1,background:"rgba(255,255,255,.08)",margin:"10px 0"}}/>

          <button onClick={()=>supabase.auth.signOut()} style={{
            display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"9px 12px",
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"transparent",color:"rgba(255,255,255,.35)",transition:"background .15s",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </div>
    </div>{/* end flex layout */}
    {showPointsModal&&<PointsHistoryModal srList={srList} bMeta={bMeta} rewardBalances={rewardBalances} rewardHistory={rewardHistory} initialPerson={pointsModalPerson} onClose={()=>{setShowPointsModal(false);setPointsModalPerson(null);}}/>}
    {showStatusHistoryModal&&<StatusHistoryModal srList={srList} bMeta={bMeta} statusHistory={statusHistory} initialPerson={statusModalPerson} onClose={()=>{setShowStatusHistoryModal(false);setStatusModalPerson(null);}}/>}
  </div>;
}
