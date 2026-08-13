// EMAX NETWORK — Branch Viewer
// Change BRANCH_ID below for each branch link
// KM | T1 | TW2 | TW1 | LD | KB | T5 | ITCC | TENOM | HQ
import { useState, useEffect, useMemo } from "react";
import { loadData, supabase } from "../../storage/index.js";
import OrderTab from "../../OrderTab.jsx";
import DailySalesTab from "../../DailySalesTab.jsx";
import JCLTab from "../../JCLTab.jsx";
import ChaileaseTab from "../../ChaileaseTab.jsx";
import StockProfitTab from "../../StockProfitTab.jsx";
import StockTransferTab from "../../StockTransferTab.jsx";

const BRANCH_ID = "HQ";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];

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
  SDK:{name:"EC SDK",manager:"",mStatus:""},
};
const DEFAULT_SR = [
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
const DEFAULT_TARGETS = {
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
  tfoot td{white-space:nowrap!important;}
  thead th{white-space:nowrap!important;}
  .order-info-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:20px;}
  .order-info-grid .oi-full{grid-column:1/-1;}
  .order-info-grid .oi-value{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  @media (max-width:640px){
    .order-info-grid{grid-template-columns:1fr;}
    .order-info-grid .oi-value{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;}
  }
  .detail-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px;}
  .detail-topbar-back{order:1;}
  .detail-topbar-title{order:3;flex-basis:100%;}
  .detail-topbar-actions{order:2;}
  .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;}
  .pb-row{display:flex;align-items:flex-start;gap:0;margin-bottom:12px;}
  .pb-label{font-size:9px;}
  @media (max-width:640px){
    .detail-grid{grid-template-columns:1fr;}
  }
  @media (max-width:480px){
    .pb-label{display:none;}
    .pb-circle{width:18px!important;height:18px!important;}
  }

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
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>Employment Status History</h2>
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
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
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
      // Load each PDF as {key, pdf} so we have the full object after JSON.parse
      Promise.all(list.map(k=>loadData(k).then(pdf=>({key:k,pdf})))).then(entries=>{
        const valid=entries.filter(e=>e.pdf&&e.pdf.date&&e.pdf.b64);
        const filtered=valid.filter(e=>{
          const parts=e.pdf.date.split("/");
          const monthOk=parseInt(parts[1])===month&&parseInt(parts[2])===year;
          // Match branch — accept files tagged with BRANCH_ID, or files where
          // the storage key starts with the branch prefix (older uploads)
          const branchOk=e.pdf.branch===BRANCH_ID||e.key.includes(`_${BRANCH_ID}_`);
          return monthOk&&branchOk;
        });
        const seen=new Set();
        const deduped=filtered.filter(e=>{const k=e.pdf.name||e.pdf.date;if(seen.has(k))return false;seen.add(k);return true;});
        setPdfList(deduped);
      });
    });
  },[month,year]);
  if(!pdfList.length)return null;
  return <div style={{marginTop:20}}>
    <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.08em"}}>AEON Profit Reports — {BRANCH_ID}</h3>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {pdfList.map((entry,i)=>(
        <a key={i} href={`data:application/pdf;base64,${entry.pdf.b64}`} download={entry.pdf.name||`AEON_${entry.pdf.date}.pdf`}
          style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",background:"#7C5CFC",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,textDecoration:"none"}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {entry.pdf.name||`AEON ${entry.pdf.date}`}
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
  const [allSRList,setAllSRList]=useState(DEFAULT_SR); // all branches, for company-wide ranking
  const [bMeta,setBMeta]=useState(DEFAULT_BRANCH_META);
  const [loading,setLoading]=useState(true);
  const [tab,setTabRaw]=useState(()=>{const h=window.location.hash.replace("#","");return ["overview","rankings","points","report","orders","repair","dailySales","jclApplications","chaileaseApplications","stockProfit","stockTransfer"].includes(h)?h:"overview";});
  const SIDEBAR_STRUCTURE=[
    {id:"overview",label:"Performance"},
    {group:"ranking",label:"Ranking",children:[
      {id:"rankings",label:"Performance Rankings"},
      {id:"points",label:"Reward Point Ranking"},
    ]},
    {id:"orders",label:"Order Request"},
    {id:"dailySales",label:"Daily Sales Report"},
    {group:"ccmApplication",label:"CCM Application",children:[
      {id:"jclApplications",label:"JCL Application"},
      {id:"chaileaseApplications",label:"Chailease Application"},
    ]},
    {id:"stockProfit",label:"Stock Profit Checker"},
    {id:"stockTransfer",label:"Stock Transfer"},
  ];
  const [expandedGroups,setExpandedGroups]=useState(()=>{
    const initial={};
    SIDEBAR_STRUCTURE.forEach(item=>{if(item.children)initial[item.group]=item.children.some(c=>c.id===tab);});
    return initial;
  });
  useEffect(()=>{
    SIDEBAR_STRUCTURE.forEach(item=>{
      if(item.children&&item.children.some(c=>c.id===tab))setExpandedGroups(p=>p[item.group]?p:{...p,[item.group]:true});
    });
  },[tab]);
  const setTab=(t)=>{setTabRaw(t);window.location.hash=t;};
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<=760);
  useEffect(()=>{const onResize=()=>setIsMobile(window.innerWidth<=760);window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize);},[]);
  const [rewardBalances,setRewardBalances]=useState({});
  const [rewardHistory,setRewardHistory]=useState({});
  const [showPointsModal,setShowPointsModal]=useState(false);
  const [pointsModalPerson,setPointsModalPerson]=useState(null);
  const [showStatusHistoryModal,setShowStatusHistoryModal]=useState(false);
  const [statusModalPerson,setStatusModalPerson]=useState(null);
  const [publishedUntil,setPublishedUntil]=useState(null);
  const [statusHistory,setStatusHistory]=useState({});
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pointsAsOf=(()=>{
    const today=new Date();
    return `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  })();

  useEffect(()=>{
    setLoading(true);setRecords({});
    const snapKey=`emax_v5_status_${selYear}_${selMonth}`;
    const targetKey=`emax_v5_targets_${selYear}_${selMonth}`;
    const prevM=selMonth===1?12:selMonth-1,prevY=selMonth===1?selYear-1:selYear;
    const prevTargetKey=`emax_v5_targets_${prevY}_${prevM}`;
    const publishKey=`emax_v5_published_${selYear}_${selMonth}`;
    const typeKey=`emax_v5_sr_types_${selYear}_${selMonth}`;
    Promise.all([loadData(recordsKey),loadData(targetKey),loadData(prevTargetKey),loadData(SR_KEY),loadData(BM_KEY),loadData("emax_v5_reward_balance"),loadData("emax_v5_reward_history"),loadData("emax_v5_status_history"),loadData(snapKey),loadData(publishKey),loadData(typeKey)]).then(([r,t,tPrev,srData,bmData,rb,rh,sh,snap,pub,srTypes])=>{
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
      const tUse=t||(tPrev)||null;
      if(tUse?.bm)setTargets({bm:{...DEFAULT_TARGETS.bm,...tUse.bm},bmBonus:{...DEFAULT_TARGETS.bmBonus,...(tUse.bmBonus||{})},bmBasic:{...DEFAULT_TARGETS.bmBasic,...(tUse.bmBasic||{})},sr:{...DEFAULT_TARGETS.sr,...tUse.sr}});
      if(srData&&Array.isArray(srData)&&srData.length>0){
        let filtered=srData.filter(s=>s.branch===BRANCH_ID);
        const nowB=new Date();
        const isCurMonthB=(selMonth===nowB.getMonth()+1&&selYear===nowB.getFullYear());
        if(!isCurMonthB&&snap&&Object.keys(snap).length>0){
          filtered=filtered.map(sr=>snap[sr.id]?{...sr,status:snap[sr.id].status}:{...sr});
        }
        // Apply monthly type overrides
        if(srTypes&&Object.keys(srTypes).length>0){
          filtered=filtered.map(sr=>srTypes[sr.id]?{...sr,type:srTypes[sr.id]}:{...sr});
        }
        setSrList(filtered);
        // Keep full SR list (all branches) with type overrides for company-wide ranking
        let allFiltered=srData;
        if(srTypes&&Object.keys(srTypes).length>0){
          allFiltered=allFiltered.map(sr=>srTypes[sr.id]?{...sr,type:srTypes[sr.id]}:{...sr});
        }
        setAllSRList(allFiltered);
      }
      // Build bMeta: start from global bmData, apply snap, then apply monthly overrides LAST
      {
        const baseMeta=bmData&&Object.keys(bmData||{}).length>0?{...DEFAULT_BRANCH_META,...bmData}:{...DEFAULT_BRANCH_META};
        const nowB=new Date();
        const isCurMonthB=(selMonth===nowB.getMonth()+1&&selYear===nowB.getFullYear());
        // Apply BM status snapshot for past months
        const metaWithSnap={...baseMeta};
        if(!isCurMonthB&&snap&&snap[`BM_${BRANCH_ID}`]?.status){
          metaWithSnap[BRANCH_ID]={...metaWithSnap[BRANCH_ID],mStatus:snap[`BM_${BRANCH_ID}`].status};
        }
        // Apply monthly bmName/bmStatus overrides LAST so they win
        const mn=(tUse&&tUse.bmName)||{};
        const ms=(tUse&&tUse.bmStatus)||{};
        const finalMeta={};
        BRANCH_ORDER.forEach(b=>{finalMeta[b]={
          ...metaWithSnap[b],
          name:b==="SDK"?DEFAULT_BRANCH_META[b]?.name:(metaWithSnap[b]?.name||DEFAULT_BRANCH_META[b]?.name),
          manager:mn[b]||metaWithSnap[b]?.manager,
          mStatus:ms[b]||metaWithSnap[b]?.mStatus,
        };});
        setBMeta(p=>({...p,...finalMeta}));
      }
      setRewardBalances(rb||{});
      setRewardHistory(rh||{});
      setStatusHistory(sh||{});
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
  const rankingPeriod=lastDataDay?`1/${month}/${year} — ${lastDataDay}/${month}/${year}`:`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`;
  const rankEndDay=lastDataDay||daysInMonth(month,year);

  const srActiveInMonth=(sr,m,y)=>{
    if(sr.joinDate){const[jy,jm]=sr.joinDate.split("-").map(Number);if(y<jy||(y===jy&&m<jm))return false;}
    return true;
  };
  const srVisibleInMonth=(sr,m,y)=>{
    if(!srActiveInMonth(sr,m,y))return false;
    if(!(sr.status||'').toLowerCase().includes('resigned'))return true;
    if(!sr.resignDate)return false;
    // Parse directly — avoid timezone shift from new Date("YYYY-MM-DD")
    const[ry,rm]=sr.resignDate.split("-").map(Number);
    return ry>y||(ry===y&&rm>=m);
  };

  // For company-wide ranking, compute all SRs from all branches — always 1 → lastDataDay
  const allSRTotals=useMemo(()=>{
    const t={};
    allSRList.filter(s=>srVisibleInMonth(s,month,year)).forEach(sr=>{
      let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){const k=`${d}/${month}/${year}`;wi+=(records[k]?.[sr.id]?.walkin||0);ae+=(records[k]?.[sr.id]?.aeon||0);}
      t[sr.id]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,allSRList,rankEndDay,month,year]);

  const allBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=allSRList.filter(s=>s.branch===b&&srVisibleInMonth(s,month,year));let wi=0,ae=0;
      for(let d=1;d<=rankEndDay;d++){
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      }
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,allSRList,rankEndDay,month,year]);

  const srRankRows=allSRList.filter(s=>srVisibleInMonth(s,month,year)).map(s=>{
    const profit=allSRTotals[s.id]?.total||0,target=targets?.sr?.[s.id]?.target||0,bonus=targets?.sr?.[s.id]?.bonus||0;
    const bTarget=targets?.bm?.[s.branch]||0,bTotal=allBranchTotals[s.branch]?.total||0;
    const branchHit=bTarget>0&&bTotal>=bTarget,p=pctN(profit,target),branchPct=pctN(bTotal,bTarget);
    return{name:s.canon,type:s.type,status:s.status,branch:s.branch,sub:null,wi:allSRTotals[s.id]?.wi||0,ae:allSRTotals[s.id]?.ae||0,profit,target,bonus,bonusEarned:branchHit&&profit>=target&&bonus>0,branchPct,role:"sr",points:calcRewardPoints(p,branchPct)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));

  const bmRankRows=BRANCH_ORDER.map(b=>{
    const profit=allBranchTotals[b]?.total||0,target=targets?.bm?.[b]||0,bonus=targets?.bmBonus?.[b]||0;
    const bonusEarned=target>0&&profit>=target&&bonus>0,p=pctN(profit,target);
    return{name:bMeta[b]?.manager,status:bMeta[b]?.mStatus,branch:b,sub:null,wi:allBranchTotals[b]?.wi||0,ae:allBranchTotals[b]?.ae||0,profit,target,bonus,bonusEarned,branchPct:p,role:"bm",points:calcRewardPoints(p,p)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));
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
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,minHeight:49,overflow:"hidden"}}>
        <div style={{flexShrink:0}}>
          <div style={{fontWeight:900,fontSize:13,color:"#fff",letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{meta.name||DEFAULT_BRANCH_META[BRANCH_ID]?.name}</div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.3)",letterSpacing:"0.12em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Branch Performance</div>

        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {["overview","rankings","points"].includes(tab)&&<><select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
            style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1} style={{background:"#0A1628",color:"#fff"}}>{m}</option>)}
          </select>
          <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
            style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
            {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y} style={{background:"#0A1628",color:"#fff"}}>{y}</option>)}
          </select></>}


          <button onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?"Collapse menu":"Expand menu"}
            style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,border:"1px solid rgba(255,255,255,.15)",borderRadius:7,background:"rgba(255,255,255,.06)",cursor:"pointer",flexShrink:0}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <div style={{display:"flex",maxWidth:1400,margin:"0 auto"}}>
    <div style={{flex:1,minWidth:0,padding:20,maxWidth:1180}}>
      {["overview","rankings"].includes(tab)&&<div style={{padding:"7px 14px",background:"#F0F4FA",borderRadius:8,fontSize:11,color:"#4A5568",marginBottom:16}}>
        <span style={{fontWeight:700,color:"#0A1628"}}>Report Period:</span>
        {" "}<span>{lastDataDay?`1/${month}/${year} — ${lastDataDay}/${month}/${year}`:"No data yet"}</span>
      </div>}

      {tab==="orders"&&<div className="fade-in"><OrderTab branchMeta={bMeta} isAdmin={false} userBranch={BRANCH_ID} srList={srList}/></div>}
      {tab==="dailySales"&&<div className="fade-in"><DailySalesTab branchMeta={bMeta} isAdmin={false} userBranch={BRANCH_ID} canSubmit={false} canVerify={false}/></div>}
      {tab==="jclApplications"&&<div className="fade-in"><JCLTab branchMeta={bMeta} isAdmin={false} userBranch={BRANCH_ID} srList={srList}/></div>}
      {tab==="chaileaseApplications"&&<div className="fade-in"><ChaileaseTab branchMeta={bMeta} isAdmin={false} userBranch={BRANCH_ID} srList={srList}/></div>}
      {tab==="stockProfit"&&<div className="fade-in"><StockProfitTab/></div>}
      {tab==="stockTransfer"&&<div className="fade-in"><StockTransferTab canCreate={false} userBranch={BRANCH_ID} branchMeta={bMeta}/></div>}
      {tab==="rankings"&&<div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20}}>
        <RankingTable title="Branch Manager Ranking" rows={bmRankRows} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
        <RankingTable title="Online SR Ranking — Company" rows={srRankRows.filter(r=>r.type==="Online")} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
        <RankingTable title="Offline SR Ranking — Company" rows={srRankRows.filter(r=>r.type==="Offline")} showBonus showPoints branchMeta={bMeta} period={rankingPeriod}/>
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
              ...allSRList.filter(sr=>srVisibleInMonth(sr,month,year)).map(sr=>({id:sr.id,name:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
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
      {/* Branch summary — gradient hero card */}
      <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",borderRadius:16,padding:"18px 20px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-60,right:-60,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(30,111,219,.35),transparent 70%)",pointerEvents:"none"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,position:"relative",zIndex:1}}>
          <div>
            <h2 style={{fontWeight:800,fontSize:18,color:"#fff",margin:0,letterSpacing:"0.01em"}}>{meta.name||DEFAULT_BRANCH_META[BRANCH_ID]?.name}</h2>
            <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:5,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>BM: {meta.manager} · {meta.mStatus}<button onClick={()=>{setStatusModalPerson(`BM_${BRANCH_ID}`);setShowStatusHistoryModal(true);}} style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:5,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.75)",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>History</button></div>
          </div>
          <div style={{textAlign:"right",marginLeft:"auto"}}>
            <div style={{fontWeight:800,fontSize:24,color:achColor(bTotal.total,bTarget),letterSpacing:"-0.02em"}}>
              {bTarget>0?branchPct.toFixed(1)+"%":"—"}
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>Achievement</div>
          </div>
        </div>
        {bTarget>0&&<div style={{margin:"12px 0 14px",position:"relative",zIndex:1}}><ProgressBar pct={branchPct} color={achColor(bTotal.total,bTarget)}/></div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,position:"relative",zIndex:1}}>
          {[["Total Profit",fRM(bTotal.total),"#fff"],["Target",bTarget>0?fRM(bTarget):"Not Set","rgba(255,255,255,.7)"],
            ["Walk In",fRM(bTotal.wi),"#fff"],["Invoice",fRM(bTotal.ae),"#fff"],
            ["Balance",bTarget>0?(Math.max(bTarget-bTotal.total,0)>0?fRM(Math.max(bTarget-bTotal.total,0)):"Target Met"):"—",
             bTarget>0&&bTotal.total>=bTarget?"#00E0A8":bTarget>0?"#FF6B81":"rgba(255,255,255,.5)"]
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,padding:"8px 11px"}}>
              <div style={{fontSize:9.5,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{l}</div>
              <div style={{fontWeight:800,color:c,fontSize:14,whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Earned Reward Points + Incentive Tiers — folded INTO the hero card as one complete BM card */}
        <div style={{position:"relative",zIndex:1,marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.12)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:10,gap:8,flexWrap:"wrap"}}>
            <span style={{color:"rgba(255,255,255,.55)"}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
            <span style={{fontWeight:800,color:"#fff"}}>{(rewardBalances[`BM_${BRANCH_ID}`]?.balance||0).toLocaleString()} pts</span>
          </div>
      {(()=>{
        const achBonus=branchPct>=120?calcAchievementBonus(branchPct,"bm"):0;
        const pts=calcRewardPoints(branchPct,branchPct);
        if(achBonus<=0&&pts<=0)return null;
        return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
          {/* Branch Achievement Bonus tier — light blue gradient */}
          {achBonus>0&&(()=>{
            const tier=Math.floor((branchPct-120)/10);
            const nextTierPct=120+(tier+1)*10;
            const isMaxTier=nextTierPct>200;
            return <div style={{background:"linear-gradient(135deg,#EFF6FF,#DBEAFE)",borderRadius:10,padding:"9px 12px",border:"1px solid #93C5FD"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{fontSize:11,fontWeight:700,color:"#1E3A8A",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{background:"linear-gradient(135deg,#3B82F6,#2563EB)",color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:9,fontWeight:800,boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}>Tier {tier+1}</span>
                  Branch Achievement Bonus
                </span>
                <span style={{fontWeight:800,fontSize:13,color:"#1D4ED8"}}>{fRM(achBonus)}</span>
              </div>
              {!isMaxTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:5,marginTop:5,borderTop:"1px dashed #93C5FD",fontSize:9.5}}>
                <span style={{color:"#1E3A8A"}}>Next: Tier {tier+2} at {nextTierPct}%</span>
                <span style={{fontWeight:700,color:"#1E3A8A"}}>{fRM(calcAchievementBonus(nextTierPct,"bm"))}</span>
              </div>}
              {isMaxTier&&<div style={{fontSize:9.5,color:"#1D4ED8",fontWeight:600,paddingTop:5,marginTop:5,borderTop:"1px dashed #93C5FD"}}>Maximum tier reached</div>}
            </div>;
          })()}
          {/* Reward Points tier — violet gradient */}
          {pts>0&&(()=>{
            const TIERS=[[110,500],[120,1000],[130,1500],[140,2000],[150,3000],[160,4500],[170,6000],[180,7500],[190,9000],[200,12000]];
            const curTierIdx=TIERS.reduce((acc,[t],i)=>branchPct>=t?i:acc,-1);
            const nextTierEntry=TIERS[curTierIdx+1]||null;
            const isMaxTier=!nextTierEntry;
            return <div style={{background:"linear-gradient(135deg,#F5F0FF,#EDE4FF)",borderRadius:10,padding:"9px 12px",border:"1px solid #C4B5FD"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <span style={{fontSize:11,fontWeight:700,color:"#5B21B6",display:"flex",alignItems:"center",gap:5}}>
                  <span style={{background:"linear-gradient(135deg,#8B5CF6,#6D28D9)",color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:9,fontWeight:800,boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}>
                    {curTierIdx>=0?`Tier ${curTierIdx+1}`:"Tier 1"}
                  </span>
                  Reward Points
                </span>
                <span style={{fontWeight:800,fontSize:13,color:"#6D28D9"}}>{pts.toLocaleString()} pts</span>
              </div>
              {!isMaxTier&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:5,marginTop:5,borderTop:"1px dashed #C4B5FD",fontSize:9.5}}>
                <span style={{color:"#5B21B6"}}>Next: Tier {curTierIdx+2} at {nextTierEntry[0]}%</span>
                <span style={{fontWeight:700,color:"#5B21B6"}}>{nextTierEntry[1].toLocaleString()} pts</span>
              </div>}
              {isMaxTier&&<div style={{fontSize:9.5,color:"#6D28D9",fontWeight:600,paddingTop:5,marginTop:5,borderTop:"1px dashed #C4B5FD"}}>Maximum tier reached</div>}
            </div>;
          })()}
        </div>;
      })()}
        </div>
      </div>

      {/* SR Cards */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:30,height:30,borderRadius:9,background:"#0A16281A",color:"#0A1628",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:"#0A1628"}}>SR Performance</div>
          <div style={{fontSize:11.5,color:"#8A96A8"}}>{srList.filter(sr=>srVisibleInMonth(sr,month,year)).length} sales reps · ranked by achievement</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:isMobile?12:16,alignItems:"start"}}>
        {srList.filter(sr=>srVisibleInMonth(sr,month,year)).sort((a,b)=>pctN(srTotals[b.id]?.total||0,targets?.sr?.[b.id]?.target||0)-pctN(srTotals[a.id]?.total||0,targets?.sr?.[a.id]?.target||0)).map(sr=>{
  const target=targets?.sr?.[sr.id]?.target||0,bonus=targets?.sr?.[sr.id]?.bonus||0;
  const rows=days.map(d=>{const k=`${d}/${month}/${year}`,v=records[k]?.[sr.id]||{};return{day:d,wi:v.walkin||0,ae:v.aeon||0};});
  const tWI=rows.reduce((s,r)=>s+r.wi,0),tAE=rows.reduce((s,r)=>s+r.ae,0),total=tWI+tAE;
  const p=pctN(total,target),color=achColor(total,target);
  const bonusEarned=branchPct>=100&&total>=target&&bonus>0;
  const achBonus=calcAchievementBonus(p),points=calcRewardPoints(p,branchPct);
  const thS={padding:"6px 12px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
  return <div key={sr.id} style={{border:"1px solid #E4EAF2",borderRadius:14,overflow:"hidden",background:"#fff",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
    <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"14px 16px"}}>
      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>EMAX NETWORK SDN BHD</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:5,gap:8}}>
        <span style={{fontWeight:800,fontSize:15,color:"#fff",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sr.canon}</span>
        <span style={{flexShrink:0}}><TypeTag type={sr.type}/></span>
      </div>
    </div>
    <div style={{padding:"7px 16px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <StatusTag status={sr.status}/>
        <button onClick={()=>{setStatusModalPerson(sr.id);setShowStatusHistoryModal(true);}} style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.45)",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>History</button>
      </div>
      <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{(bMeta[sr.branch]?.name||sr.branch).toUpperCase()}</span>
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
    <div style={{padding:"12px 16px",background:"#F7F9FC",borderTop:"2px solid #E4EAF2"}}>
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
      {bonus>0&&<div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11,gap:6}}>
        <span style={{color:"#5A6472"}}>Personal Achievement Bonus</span>
        <span style={{color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>
          {bonusEarned?fRM(bonus):`${fRM(bonus)} (Pending)`}
        </span>
      </div>}

      {/* Branch Achievement Bonus */}
      <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11,gap:6}}>
        <span style={{color:"#5A6472"}}>Branch Achievement Bonus</span>
        {(branchPct>=120&&p>=100)
          ? <span style={{color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{fRM(calcAchievementBonus(branchPct,"sr"))}</span>
          : <span style={{color:"#5A6472",flexShrink:0}}>—</span>
        }
      </div>

      {/* Reward Points */}
      <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11,gap:6}}>
        <span style={{color:"#5A6472"}}>Reward Points (This Month)</span>
        {(branchPct>=100&&p>=110)
          ? <span style={{color:"#0A1628",whiteSpace:"nowrap",flexShrink:0}}>{calcRewardPoints(p,branchPct).toLocaleString()} pts</span>
          : <span style={{color:"#5A6472",flexShrink:0}}>—</span>
        }
      </div>
      <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",marginBottom:4,fontSize:11,gap:6}}>
        <span style={{color:"#5A6472",flex:1,minWidth:0}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
        <span style={{fontSize:11,color:"#4A5568",whiteSpace:"nowrap",flexShrink:0}}>{(rewardBalances[sr.id]?.balance||0).toLocaleString()} pts</span>
      </div>

      {/* Compact tier progress — same blue/violet cards as the Branch Manager's incentive strip, only shown when at least one tier is active */}
      {((branchPct>=120&&p>=100)||(branchPct>=100&&p>=110))&&(()=>{
        const bTier=branchPct>=120&&p>=100?Math.floor((branchPct-120)/10)+1:null;
        const bNextPct=bTier?120+bTier*10:null;
        const bMax=bNextPct>200;
        const pts=calcRewardPoints(p,branchPct);
        const TIERS=[[110,500],[120,1000],[130,1500],[140,2000],[150,3000],[160,4500],[170,6000],[180,7500],[190,9000],[200,12000]];
        const pTierIdx=branchPct>=100&&p>=110?TIERS.reduce((acc,[t],i)=>p>=t?i:acc,-1):-1;
        const pNext=pTierIdx>=0?TIERS[pTierIdx+1]:null;
        return <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
          {bTier&&<div style={{background:"linear-gradient(135deg,#EFF6FF,#DBEAFE)",borderRadius:9,padding:"9px 11px",border:"1px solid #93C5FD"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10.5,color:"#1E3A8A",fontWeight:600}}>Bonus Tier {bTier}{!bMax?` → next at ${bNextPct}%`:" (max)"}</span>
              <span style={{fontSize:11.5,fontWeight:700,color:"#1D4ED8"}}>{!bMax?fRM(calcAchievementBonus(bNextPct,"sr")):"Max"}</span>
            </div>
          </div>}
          {pTierIdx>=0&&<div style={{background:"linear-gradient(135deg,#F5F0FF,#EDE4FF)",borderRadius:9,padding:"9px 11px",border:"1px solid #C4B5FD"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10.5,color:"#5B21B6",fontWeight:600}}>Points Tier {pTierIdx+1}{pNext?` → next at ${pNext[0]}%`:" (max)"}</span>
              <span style={{fontSize:11.5,fontWeight:700,color:"#6D28D9"}}>{pNext?pNext[1].toLocaleString()+" pts":"Max"}</span>
            </div>
          </div>}
        </div>;
      })()}

    </div>
  </div>;
        })}
      </div>

      {/* ── BRANCH CARD — day-by-day Walk In / Invoice / Unallocated,
          aggregated across every SR in this branch plus whatever's logged
          directly against the Branch Manager. Unallocated is broken out as
          its own column rather than folded into Walk In, so it's visible
          how much of the branch's daily profit wasn't attributed to any
          specific SR — Branch Total still sums all three, matching the
          same overall total bTotal above already produces. ── */}
      {(()=>{
        const branchRows=days.map(d=>{
          const k=`${d}/${month}/${year}`;
          const day=records[k]||{};
          let wi=0,ae=0,un=0;
          srList.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
          wi+=(day[`BM_${BRANCH_ID}`]?.walkin||0);ae+=(day[`BM_${BRANCH_ID}`]?.aeon||0);un+=(day[`BM_${BRANCH_ID}`]?.unalloc||0);
          return{day:d,wi,ae,un};
        });
        const branchTWI=branchRows.reduce((s,r)=>s+r.wi,0),branchTAE=branchRows.reduce((s,r)=>s+r.ae,0),branchTUN=branchRows.reduce((s,r)=>s+r.un,0),branchTotal=branchTWI+branchTAE+branchTUN;
        const thS={padding:"6px 12px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
        return<div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:isMobile?12:16,marginTop:16}}>
        <div style={{border:"1px solid #E4EAF2",borderRadius:14,overflow:"hidden",background:"#fff",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
          <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"14px 16px"}}>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>EMAX NETWORK SDN BHD</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:5,gap:8}}>
              <span style={{fontWeight:800,fontSize:15,color:"#fff"}}>{bMeta[BRANCH_ID]?.name||BRANCH_ID} — Branch Total</span>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:340}}>
            <thead><tr>
              <th style={{...thS,textAlign:"center",width:48}}>Date</th>
              <th style={{...thS,color:"#4A5568"}}>Unallocated</th>
              <th style={{...thS,color:"#4A5568"}}>Walk In</th>
              <th style={{...thS,color:"#4A5568"}}>Invoice</th>
              <th style={{...thS,color:"#4A5568"}}>Total</th>
            </tr></thead>
            <tbody>{branchRows.map(({day,wi,ae,un})=>{
              const rt=wi+ae+un;
              return<tr key={day} style={{borderBottom:"1px solid rgba(228,234,242,.8)",background:day%2===0?"#fff":"#F7F9FC"}}>
                <td style={{padding:"4px 8px",color:"#4A5568",fontWeight:600,textAlign:"center",fontSize:11,borderRight:"1px solid rgba(228,234,242,.6)"}}>{day}/{month}</td>
                <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:un!==0?"#4A5568":"#E4EAF2",fontWeight:un!==0?500:300}}>{un!==0?f2(un):"—"}</td>
                <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:wi!==0?"#4A5568":"#E4EAF2",fontWeight:wi!==0?500:300}}>{wi!==0?f2(wi):"—"}</td>
                <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:ae!==0?"#4A5568":"#E4EAF2",fontWeight:ae!==0?500:300}}>{ae!==0?f2(ae):"—"}</td>
                <td style={{padding:"4px 12px",textAlign:"right",fontWeight:rt!==0?600:300,fontSize:11,color:rt>0?"#0A1628":rt<0?"#F0354B":"#E4EAF2"}}>{rt!==0?f2(rt):"—"}</td>
              </tr>;
            })}</tbody>
          </table>
          </div>
          <div style={{padding:"12px 16px",background:"#F7F9FC",borderTop:"2px solid #E4EAF2"}}>
            {[["Unallocated",fRM(branchTUN)],["Walk In",fRM(branchTWI)],["Invoice",fRM(branchTAE)],["Branch Total",fRM(branchTotal)]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",fontSize:11}}>
                <span style={{color:"#5A6472"}}>{l}</span>
                <span style={{color:l==="Branch Total"?"#0A1628":"#4A5568",fontWeight:l==="Branch Total"?700:400}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        </div>;
      })()}

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
          {SIDEBAR_STRUCTURE.map(item=>{
            if(!item.children)return(
              <button key={item.id} onClick={()=>{setTab(item.id);setSidebarOpen(false);}} style={{
                display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
                border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
                background:tab===item.id?"rgba(255,255,255,.1)":"transparent",color:tab===item.id?"#fff":"rgba(255,255,255,.45)",
                transition:"background .15s",
              }}>
                {item.label}
              </button>
            );
            const isOpen=!!expandedGroups[item.group];
            return<div key={item.group}>
              <button onClick={()=>setExpandedGroups(p=>({...p,[item.group]:!p[item.group]}))} style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
                border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
                background:"transparent",color:"rgba(255,255,255,.45)",transition:"background .15s",
              }}>
                <span>{item.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:isOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform .15s",flexShrink:0}}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              {isOpen&&item.children.map(c=>(
                <button key={c.id} onClick={()=>{setTab(c.id);setSidebarOpen(false);}} style={{
                  display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px 9px 26px",marginBottom:3,
                  border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
                  background:tab===c.id?"rgba(255,255,255,.1)":"transparent",color:tab===c.id?"#fff":"rgba(255,255,255,.45)",
                  transition:"background .15s",
                }}>
                  {c.label}
                </button>
              ))}
            </div>;
          })}
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
