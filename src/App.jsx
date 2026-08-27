// ============================================================
// EMAX NETWORK SDN BHD — Sales Performance Dashboard
// Enterprise Analytics Platform
// ============================================================
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { loadData, saveData, supabase } from "./storage/index.js";
import { listOrders } from "./storage/ordersApi.js";
import RTOTab from "./RTOTab.jsx";
import OrderTab from "./OrderTab.jsx";
import DailySalesTab from "./DailySalesTab.jsx";
import JCLTab from "./JCLTab.jsx";
import ChaileaseTab from "./ChaileaseTab.jsx";
import PurchaseOrderTab from "./PurchaseOrderTab.jsx";
import DailyPaymentTab, {COMPANIES as DAILY_PAYMENT_COMPANIES, keyFor as dailyPaymentKeyFor} from "./DailyPaymentTab.jsx";
import StockProfitTab from "./StockProfitTab.jsx";
import StockTransferTab from "./StockTransferTab.jsx";
import DailyReportPanel from "./DailyReportPanel.jsx";

const T = {
  navy:"#0A1628", navyMid:"#0F2040", navyLight:"#162B52",
  blue:"#1E6FDB", blueBright:"#2D85F0",
  success:"#00C896", successBg:"#00C89612",
  warning:"#F5A623", warningBg:"#F5A62312",
  danger:"#F0354B", dangerBg:"#F0354B12",
  purple:"#7C5CFC", purpleBg:"#7C5CFC12",
  white:"#FFFFFF", surface:"#F7F9FC", border:"#E4EAF2",
  borderDark:"#CDD5E0", text:"#0A1628", textMid:"#4A5568", textLight:"#8A96A8",
  tier1:"#00C896", tier2:"#F5A623", tier3:"#F0794B", tier4:"#F0354B",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',-apple-system,sans-serif;background:#F7F9FC;color:#0A1628;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-thumb{background:#CDD5E0;border-radius:3px;}
  
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
  .rto-grid{display:grid;grid-template-columns:460px 1fr;gap:20px;align-items:start;}
  @media (max-width:768px){
    .rto-grid{grid-template-columns:1fr;}
  }
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

function daysInMonth(m,y){return new Date(y,m,0).getDate();}
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];

const DEFAULT_BRANCH_META={
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
};

export const DEFAULT_SR=[
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

export const DEFAULT_TARGETS = {
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


export const STORE_KEY="emax_v5_records",SR_KEY="emax_v5_sr_list",BM_KEY="emax_v5_branch_meta",REPAIR_KEY="emax_v5_repair";

// Resolves which branch/role/status applied to an SR during a SPECIFIC
// month, using their progressionHistory (if any) — walks backward to the
// latest entry whose effectiveFrom is on or before that month. Falls back
// to the SR's own current flat fields for records with no history yet
// (existing data, or an SR who's never had a progression change), so this
// is fully backward compatible. This is what makes progression changes
// (resignation, confirmation, SR↔BM moves) NOT retroactively rewrite how
// past months are read — only the month a change was made effective from
// onward sees the new branch/role/status; everything before it keeps
// reading whatever was actually true at the time.
export function resolveSRForMonth(sr,year,month){
  const ym=`${year}-${String(month).padStart(2,"0")}`;
  const hist=sr.progressionHistory||[];
  const applicable=hist.filter(h=>h.effectiveFrom<=ym).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
  const latest=applicable[applicable.length-1];
  if(!latest)return{branch:sr.branch,role:sr.role||"sr",status:sr.status};
  return{branch:latest.branch??sr.branch,role:latest.role??(sr.role||"sr"),status:latest.status==="continue"?(applicable.slice(0,-1).reverse().find(h=>h.status&&h.status!=="continue")?.status??sr.status):latest.status};
}

// Targets are stored per-month so each month keeps its own targets independently
// Status snapshot key pattern: emax_v5_status_{year}_{month}

// ─── BONUS CALCULATORS ─────────────────────────────────────
function calcAchievementBonus(pct, role="sr") {
  if(pct<120) return 0;
  const tier=Math.floor((pct-120)/10);
  return role==="bm"?500+tier*500:300+tier*50;
}
function calcRewardPoints(pct, branchPct) {
  if(branchPct<100||pct<110) return 0;
  const TIERS=[[200,12000],[190,9000],[180,7500],[170,6000],[160,4500],[150,3000],[140,2000],[130,1500],[120,1000],[110,500]];
  for(const[t,p] of TIERS){ if(pct>=t) return p; }
  return 0;
}

// ─── EMPLOYMENT STATUS HELPERS (module-level, shared) ────────
const statusBaseOptions=["Training","Probation","Confirmed","Resigned"];
function parseStatus(s){
  if(!s)return{base:"Probation",p:0,f:0};
  // Match base status
  const baseM=s.match(/^(Training|Probation|Confirmed|Director|Resigned)/i);
  if(!baseM)return{base:"Probation",p:0,f:0};
  const base=baseM[1].charAt(0).toUpperCase()+baseM[1].slice(1).toLowerCase();
  if(base==="Director"||base==="Resigned")return{base,p:0,f:0};
  // Try new format: P5 F0
  const newFmt=s.match(/P(\d+)\s*F(\d+)/i);
  if(newFmt)return{base,p:parseInt(newFmt[1]),f:parseInt(newFmt[2])};
  // Try old format: Passed 5, Failed 1  OR  Passed 5
  const passedM=s.match(/Passed\s+(\d+)/i);
  const failedM=s.match(/Failed\s+(\d+)/i);
  return{base,p:passedM?parseInt(passedM[1]):0,f:failedM?parseInt(failedM[1]):0};
}
function buildStatus(base,p,f){
  return(base==="Director"||base==="Resigned")?base:`${base} (P${p} F${f})`;
}

// ─── HELPERS ───────────────────────────────────────────────
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const f2=(n=0)=>Number(n||0).toFixed(2);
const pctN=(p,t)=>t>0?(p/t)*100:0;
const pctS=(p,t)=>t>0?((p/t)*100).toFixed(2)+"%":"—";
const nc=(n)=>Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
function achColor(p,t){const r=pctN(p,t);return r>=100?"#00C896":r>=80?"#F5A623":r>=50?"#F0794B":"#F0354B";}
function achBg(p,t){const r=pctN(p,t);return r>=100?"#00C89612":r>=80?"#F5A62312":r>=50?"#F0794B12":"#F0354B12";}

// ─── STORAGE ───────────────────────────────────────────────
function fileToB64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});}

// ─── PDF PARSING ───────────────────────────────────────────
async function parsePDF(b64,type){
  const sys=type==="walkin"
    ?`Parse "Product Sales Margin Report" PDF from EMAX NETWORK SDN BHD.
CRITICAL RULES:
1. Process each Promoter line item individually.
2. EXCLUDE item codes: S00005, S00006, S00007, M00894 entirely.
3. "profit": sum Profit of items NOT in excluded list.
4. "repair_profit": sum Profit of S00005,S00006,S00007 only.
5. Do NOT use Promoter Count summary line. Recalculate from individual lines.
6. Return ONLY JSON array: [{"promoter_id":"EM0XXX","name":"FULL NAME","profit":123.45,"repair_profit":0.00}]`
    :`Parse "Profit & Loss of Document" PDF (AEON) from EMAX NETWORK SDN BHD.
CRITICAL RULES:
1. Process each Sales Agent line item individually.
2. EXCLUDE item codes: S00005, S00006, S00007, M00894.
3. "profit": sum Profit of non-excluded items. "repair_profit": sum of S00005,S00006,S00007.
4. Return ONLY JSON array: [{"promoter_id":"EM0XXX","name":"FULL NAME","profit":123.45,"repair_profit":0.00}]`;
  let res,data;
  try{
    res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:4000,system:sys,
        messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},{type:"text",text:"Extract all promoter profits as JSON only."}]}]})});
    data=await res.json();
  }catch(e){throw new Error("PDF parsing requires the admin dashboard to be opened from the Claude artifact link. Error: "+e.message);}
  if(data.error) throw new Error(data.error.message||"API error");
  const raw=(data.content||[]).filter(c=>c.type==="text"&&c.text).map(c=>c.text).join("").replace(/```json|```/g,"").trim();
  if(!raw) throw new Error("No response from Claude. Try again.");
  const s=raw.indexOf("["),e=raw.lastIndexOf("]");
  if(s===-1||e===-1) throw new Error("Claude did not return valid JSON. Response: "+raw.slice(0,200));
  return JSON.parse(raw.slice(s,e+1));
}
function matchSR(item,srList){
  const byId=srList.find(s=>s.id===item.promoter_id);if(byId)return byId;
  const up=(item.name||"").toUpperCase();
  return srList.find(s=>up.includes(s.canon.toUpperCase())||s.canon.toUpperCase().split(" ").some(w=>up.startsWith(w)&&w.length>3))||null;
}

// ─── PRIMITIVE COMPONENTS ──────────────────────────────────
function ProgressBar({pct:p,color,height=6}){
  return <div style={{height,background:"#E4EAF2",borderRadius:height,overflow:"hidden"}}>
    <div className="progress-bar-fill" style={{height:"100%",width:Math.min(p,100)+"%",background:color,borderRadius:height}}/>
  </div>;
}
function AchBadge({profit,target,size="sm"}){
  if(!target) return <span style={{color:"#8A96A8",fontSize:11}}>—</span>;
  const p=pctN(profit,target),color=achColor(profit,target),bg=achBg(profit,target);
  return <span className="tag" style={{background:bg,color,fontSize:size==="lg"?14:size==="md"?12:11,fontWeight:700}}>{p.toFixed(2)}%</span>;
}
function StatusTag({status}){
  if(!status) return null;
  const s = status.toLowerCase();
  const isDir = s.includes("director");
  const isConf = s.includes("confirmed");
  const bg    = isDir?"#F5F3FF":isConf?"#F0FDF4":"#EFF6FF";
  const color = isDir?"#6D28D9":isConf?"#15803D":"#1D4ED8";
  const base  = isDir?"Director":isConf?"Confirmed":"Probation";
  const pm = status.match(/\bP(\d+)\b/) || status.match(/Passed\s*(\d+)/i);
  const fm = status.match(/\bF(\d+)\b/) || status.match(/Failed\s*(\d+)/i);
  const passed = pm ? parseInt(pm[1]) : null;
  const failed = fm ? parseInt(fm[1]) : null;
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:bg,color,padding:"2px 10px",borderRadius:20,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>
    {base}
    {(passed!==null||failed!==null)&&<span style={{display:"flex",gap:3,alignItems:"center"}}>
      <span style={{width:1,height:10,background:color+"50"}}/>
      {passed!==null&&<span style={{color:"#00C896",fontWeight:700}}>P{passed}</span>}
      {failed!==null&&<span style={{color:"#F0354B",fontWeight:700}}>F{failed}</span>}
    </span>}
  </span>;
}

function TypeTag({type}){return <span className={`tag tag-${(type||"").toLowerCase()}`}>{type}</span>;}
function RankMedal({rank}){
  if(rank===1)return <span style={{fontSize:13,fontWeight:900,color:"#D97706"}}>1st</span>;
  if(rank===2)return <span style={{fontSize:13,fontWeight:900,color:"#64748B"}}>2nd</span>;
  if(rank===3)return <span style={{fontSize:13,fontWeight:900,color:"#B45309"}}>3rd</span>;
  return <span style={{fontSize:12,fontWeight:700,color:"#8A96A8"}}>#{rank}</span>;
}
function KpiCard({label,value,sub,accent="#1E6FDB"}){
  return <div className="card fade-in" style={{padding:"18px 20px",borderTop:`3px solid ${accent}`}}>
    <div style={{fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{label}</div>
    <div style={{fontSize:16,fontWeight:700,color:"#0A1628",letterSpacing:"-0.01em",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#8A96A8",marginTop:4}}>{sub}</div>}
  </div>;
}
function SectionHeader({title,subtitle,action}){
  return <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:16,gap:12,flexWrap:"wrap"}}>
    <div>
      <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",letterSpacing:"-0.01em",marginBottom:2}}>{title}</h2>
      {subtitle&&<p style={{fontSize:12,color:"#8A96A8",margin:0}}>{subtitle}</p>}
    </div>
    {action&&<div>{action}</div>}
  </div>;
}

// ─── EDITABLE CELL ─────────────────────────────────────────
function EC({value,onSave,color="#4A5568"}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState("");
  if(editing)return <td style={{padding:"2px 6px",background:"#FFFBEB",textAlign:"right"}}>
    <input autoFocus type="number" value={val} step="0.01" onChange={e=>setVal(e.target.value)}
      onBlur={()=>{onSave(isNaN(parseFloat(val))?0:parseFloat(val));setEditing(false);}}
      onKeyDown={e=>{if(e.key==="Enter"){onSave(isNaN(parseFloat(val))?0:parseFloat(val));setEditing(false);}if(e.key==="Escape")setEditing(false);}}
      style={{width:80,padding:"3px 8px",border:"1.5px solid #F5A623",borderRadius:6,fontSize:11,outline:"none",fontFamily:"'Inter',sans-serif",textAlign:"right"}}/></td>;
  return <td onClick={()=>{setVal(value!==0?value:"");setEditing(true);}} title="Click to edit"
    style={{padding:"6px 12px",textAlign:"right",cursor:"pointer",color:value>0?color:value<0?"#F0354B":"#E4EAF2",fontWeight:value!==0?600:400,fontSize:11,whiteSpace:"nowrap"}}
    onMouseEnter={e=>e.currentTarget.style.background="#EFF6FF"}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
    {value!==0?f2(value):"—"}</td>;
}

// ─── SR TABLE ──────────────────────────────────────────────
function SRTable({sr,records,targets,branchPct,onEdit,printMode,month,year,days,rewardBalance=0,pointsAsOf="",onStatusHistory}){
  const target=targets?.sr?.[sr.id]?.target||0,bonus=targets?.sr?.[sr.id]?.bonus||0;
  const rows=days.map(d=>{const k=`${d}/${month}/${year}`,v=records[k]?.[sr.id]||{};return{day:d,wi:v.walkin||0,ae:v.aeon||0};});
  const tWI=rows.reduce((s,r)=>s+r.wi,0),tAE=rows.reduce((s,r)=>s+r.ae,0),total=tWI+tAE;
  const p=pctN(total,target),color=achColor(total,target);
  const bonusEarned=branchPct>=100&&total>=target&&bonus>0;
  const achBonus=calcAchievementBonus(p),points=calcRewardPoints(p,branchPct);
  const thS={padding:"6px 12px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",whiteSpace:"nowrap"};
  return <div style={{border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden",background:"#fff",boxShadow:printMode?"none":"0 1px 4px rgba(10,22,40,.05)"}}>
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
      <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{DEFAULT_BRANCH_META[sr.branch]?.name}</span>
    </div>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>
        <th style={{...thS,textAlign:"center",width:48}}>Date</th>
        <th style={{...thS,color:"#4A5568"}}>Walk In</th>
        <th style={{...thS,color:"#4A5568"}}>Invoice</th>
        <th style={{...thS,color:"#4A5568"}}>Total</th>
      </tr></thead>
      <tbody>{rows.map(({day,wi,ae})=>{
        const dk=`${day}/${month}/${year}`,rt=wi+ae;
        return <tr key={day} className="shine-row" style={{borderBottom:"1px solid rgba(228,234,242,.8)",background:day%2===0?"#fff":"#F7F9FC"}}>
          <td style={{padding:"4px 8px",color:"#4A5568",fontWeight:600,textAlign:"center",fontSize:11,borderRight:"1px solid rgba(228,234,242,.6)"}}>{day}/{month}</td>
          {printMode
            ?<><td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:wi!==0?"#4A5568":"#E4EAF2",fontWeight:wi!==0?500:300}}>{wi!==0?f2(wi):"—"}</td>
               <td style={{padding:"4px 12px",textAlign:"right",fontSize:11,color:ae!==0?"#4A5568":"#E4EAF2",fontWeight:ae!==0?500:300}}>{ae!==0?f2(ae):"—"}</td></>
            :<><EC value={wi} color="#4A5568" onSave={v=>onEdit(dk,sr.id,"walkin",v)}/>
               <EC value={ae} color="#4A5568" onSave={v=>onEdit(dk,sr.id,"aeon",v)}/></>
          }
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

// ─── BM TABLE ──────────────────────────────────────────────
function BMTable({branchId,records,targets,srList,branchMeta,onEdit,printMode,month,year,days,rewardBalance=0,pointsAsOf="",onStatusHistory}){
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
  return <div style={{border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden",background:"#fff",boxShadow:printMode?"none":"0 1px 4px rgba(10,22,40,.05)"}}>
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
        const dk=`${day}/${month}/${year}`,rt=wi+ae+ua;
        return <tr key={day} className="shine-row" style={{borderBottom:"1px solid rgba(228,234,242,.8)",background:day%2===0?"#fff":"#F7F9FC"}}>
          <td style={{padding:"4px 8px",color:"#4A5568",fontWeight:600,textAlign:"center",fontSize:11,borderRight:"1px solid rgba(228,234,242,.6)"}}>{day}/{month}</td>
          {printMode
            ?<td style={{padding:"4px 10px",textAlign:"right",fontSize:11,color:ua<0?"#F0354B":"#8A96A8"}}>{ua!==0?f2(ua):"—"}</td>
            :<EC value={ua} color="#8A96A8" onSave={v=>onEdit(dk,`BM_${branchId}`,"unalloc",v)}/>
          }
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

      {/* Monthly Basic — always shown if set */}
      {bmBasic>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Monthly Basic</span>
        <span style={{fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(bmBasic)}</span>
      </div>}
      {/* Personal Achievement Bonus — only if set, only earned when branch target hit */}
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

// ─── AEON TABLE ────────────────────────────────────────────
function AeonTable({sr,records,printMode,month,year,days}){
  const rows=days.map(d=>({day:d,ae:records[`${d}/${month}/${year}`]?.[sr.id]?.aeon||0}));
  const total=rows.reduce((s,r)=>s+r.ae,0),active=rows.filter(r=>r.ae>0);
  return <div style={{border:"1px solid rgba(124,92,252,.25)",borderRadius:10,overflow:"hidden",background:"#fff"}}>
    <div style={{background:"#3D1A78",padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontWeight:800,fontSize:11,color:"#fff",letterSpacing:"0.02em"}}>AEON — {sr.canon}</span>
      <span style={{fontSize:10,color:"rgba(255,255,255,.45)"}}>{active.length} days</span>
    </div>
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr style={{background:"#F7F9FC"}}>
        <th style={{padding:"5px 10px",fontSize:10,fontWeight:700,color:"#5A6472",textTransform:"uppercase",textAlign:"center",borderBottom:"1px solid #E4EAF2",width:48}}>Date</th>
        <th style={{padding:"5px 10px",fontSize:10,fontWeight:700,color:"#7C5CFC",textTransform:"uppercase",textAlign:"right",borderBottom:"1px solid #E4EAF2"}}>Amount</th>
      </tr></thead>
      <tbody>{active.map(({day,ae})=>(
        <tr key={day} style={{borderBottom:"1px solid rgba(228,234,242,.6)"}}>
          <td style={{padding:"4px 10px",fontSize:11,textAlign:"center",fontWeight:600,color:"#4A5568"}}>{day}/{month}</td>
          <td style={{padding:"4px 10px",fontSize:11,textAlign:"right",fontWeight:700,color:"#7C5CFC"}}>{f2(ae)}</td>
        </tr>
      ))}</tbody>
    </table>
    <div style={{padding:"8px 14px",background:"#F7F9FC",borderTop:"1px solid #E4EAF2",display:"flex",justifyContent:"space-between",fontSize:11}}>
      <span style={{color:"#5A6472",fontWeight:600}}>Total</span>
      <span style={{fontWeight:800,color:"#7C5CFC"}}>{fRM(total)}</span>
    </div>
  </div>;
}

// ─── BRANCH PERFORMANCE TABLE ──────────────────────────────
const TH=(e={})=>({padding:"10px 10px",fontWeight:700,fontSize:10,background:"#0A1628",color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",whiteSpace:"nowrap",...e});
const TD=(e={})=>({padding:"9px 10px",fontSize:12,whiteSpace:"nowrap",borderBottom:"1px solid rgba(228,234,242,.7)",...e});
function BranchPerfTable({branchTotals,targets,branchMeta,printRef,month,year,startDay=1,endDay=30,onChangeStartDay,onChangeEndDay,maxDay}){
  const bt = branchTotals;

  const grandWI=BRANCH_ORDER.reduce((s,b)=>s+(bt[b]?.wi||0),0);
  const grandAE=BRANCH_ORDER.reduce((s,b)=>s+(bt[b]?.ae||0),0);
  const grandT=grandWI+grandAE;
  const grandTgt=BRANCH_ORDER.reduce((s,b)=>s+(targets?.bm?.[b]||0),0);
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
          <th style={TH()}>Achievement</th>
          <th style={TH()}>Total Profit</th>
          <th style={TH()}>Walk In</th>
          <th style={TH()}>Invoice</th>
          <th style={TH()}>Balance</th>
          <th style={TH()}>Monthly Target</th>
        </tr></thead>
        <tbody>{[...BRANCH_ORDER].filter(b=>(targets?.bm?.[b]||0)>0).sort((a,b2)=>{
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
            <td style={{...TD(),textAlign:"right"}}>
              {target>0?<AchBadge profit={total} target={target} size="md"/>:<span style={{color:"#4A5568",fontSize:12}}>—</span>}
            </td>
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
            <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontSize:12}}>{target>0?`RM ${nc(target)}`:"—"}</span></td>
          </tr>;
        })}</tbody>
        <tfoot><tr style={{background:"#0A1628",fontSize:11}}>
          <td style={{padding:"9px 10px",fontWeight:600,color:"rgba(255,255,255,.6)",whiteSpace:"nowrap"}}>Total</td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><AchBadge profit={grandT} target={grandTgt} size="md"/></td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandT>0?`RM ${nc(grandT)}`:"—"}</span></td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandWI!==0?`RM ${nc(grandWI)}`:"—"}</span></td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandAE>0?`RM ${nc(grandAE)}`:"—"}</span></td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
            <span style={{color:"rgba(255,255,255,.6)"}}>
              {grandTgt>0?(grandT-grandTgt>=0?"+RM "+nc(grandT-grandTgt):"RM "+nc(Math.abs(grandT-grandTgt))):"—"}
            </span>
          </td>
          <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{grandTgt>0?`RM ${nc(grandTgt)}`:"—"}</span></td>
        </tr></tfoot>
      </table>
    </div>
  </div>;
}

// ─── RANKING TABLE ─────────────────────────────────────────
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

// ─── BONUS REFERENCE ───────────────────────────────────────
function BonusReference(){
  const srTiers=[["120% – 129%","RM 300"],["130% – 139%","RM 350"],["140% – 149%","RM 400"],["150% – 159%","RM 450"],["160% +","RM 500+ (RM50/tier)"]];
  const bmTiers=[["120% – 129%","RM 500"],["130% – 139%","RM 1,000"],["140% – 149%","RM 1,500"],["150% – 159%","RM 2,000"],["160% +","RM 2,500+ (RM500/tier)"]];
  const ptsTiers=[["110%–119%","500"],["120%–129%","1,000"],["130%–139%","1,500"],["140%–149%","2,000"],["150%–159%","3,000"],["160%–169%","4,500"],["170%–179%","6,000"],["180%–189%","7,500"],["190%–199%","9,000"],["200%+","12,000"]];
  const TableCard=({title,rows,accent,note})=>(
    <div className="card" style={{padding:0,overflow:"hidden",borderTop:`3px solid ${accent}`}}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid #E4EAF2"}}>
        <h4 style={{fontWeight:800,fontSize:12,color:"#0A1628",margin:0}}>{title}</h4>
        {note&&<p style={{fontSize:10,color:"#8A96A8",margin:"2px 0 0"}}>{note}</p>}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr style={{background:"#F7F9FC"}}>
          <th style={{padding:"7px 14px",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"left",borderBottom:"1px solid #E4EAF2"}}>Achievement</th>
          <th style={{padding:"7px 14px",fontSize:10,fontWeight:700,color:accent,textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",borderBottom:"1px solid #E4EAF2"}}>Reward</th>
        </tr></thead>
        <tbody>{rows.map(([tier,reward],i)=>(
          <tr key={i} style={{borderBottom:"1px solid rgba(228,234,242,.6)",background:i%2===0?"#fff":"#F7F9FC"}}>
            <td style={{padding:"6px 14px",fontSize:11,color:"#4A5568"}}>{tier}</td>
            <td style={{padding:"6px 14px",fontSize:11,fontWeight:800,color:accent,textAlign:"right",}}>{reward}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  return <div className="fade-in">
    <div style={{marginBottom:16,padding:"14px 18px",background:"#0F2040",borderRadius:10,border:"1px solid #162B52"}}>
      <h3 style={{fontWeight:800,fontSize:13,color:"#fff",margin:0,marginBottom:6}}>Eligibility Rules</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",lineHeight:1.7}}>
          <span style={{color:"#F5A623",fontWeight:700}}>Achievement Bonus:</span> Branch must exceed 120% target. SR must achieve 100%+ personal target. BM qualifies on branch performance.
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",lineHeight:1.7}}>
          <span style={{color:"#00C896",fontWeight:700}}>Reward Points:</span> Branch must hit 100%+. SR and BM must achieve 110%+ of their respective targets.
        </div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:16}}>
      <TableCard title="SR Achievement Bonus" accent="#F5A623" note="Branch must exceed 120% to activate" rows={srTiers}/>
      <TableCard title="BM Achievement Bonus" accent="#F0354B" note="Branch must exceed 120% to activate" rows={bmTiers}/>
      <TableCard title="Reward Points (SR & BM)" accent="#1E6FDB" note="Branch 100%+ required; individual must hit 110%+" rows={ptsTiers}/>
    </div>
  </div>;
}

// ─── REPAIR TAB ─────────────────────────────────────────────
function RepairTab({month,year,endDay,refreshKey=0}){
  const [repairData,setRepairData]=useState({});
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState(null);
  const [editVal,setEditVal]=useState("");
  const days=Array.from({length:daysInMonth(month,year)},(_,i)=>i+1);
  const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  useEffect(()=>{
    setRepairData({});
    loadData(`emax_v5_repair_${year}_${month}`).then(d=>{setRepairData(d||{});setLoading(false);});
  },[month,year,refreshKey]);

  const handleSave=async(day,val)=>{
    const v=parseFloat(val)||0;
    const updated={...repairData};
    if(v!==0)updated[day]=v; else delete updated[day];
    setRepairData(updated);setEditing(null);
    await saveData(`emax_v5_repair_${year}_${month}`,updated);
  };

  const total=Object.values(repairData).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const activeDays=Object.keys(repairData).filter(d=>repairData[d]!==0).length;

  if(loading)return <div style={{padding:32,textAlign:"center",color:"#8A96A8",fontSize:12}}>Loading...</div>;

  return <div className="fade-in" style={{maxWidth:520}}>
    <div className="card" style={{overflow:"hidden",padding:0}}>
      <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 16px"}}>
        <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>EMAX NETWORK SDN BHD</div>
        <div style={{fontWeight:800,fontSize:16,color:"#fff",letterSpacing:"0.01em"}}>Repair & Service</div>
      </div>
      <div style={{padding:"5px 14px",background:"#0F2040",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>{MONTHS[month-1]} {year} · {activeDays} {activeDays===1?"entry":"entries"}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</span>
          <span style={{fontWeight:700,fontSize:13,color:"#fff"}}>{total!==0?fRM(total):"—"}</span>
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
            const isEditing=editing===d;
            return <tr key={d} style={{borderBottom:"1px solid rgba(228,234,242,.6)"}}>
              <td style={{padding:"7px 16px",fontSize:12,color:"#4A5568",fontWeight:val!==0?500:400}}>{d}/{month}/{year}</td>
              {isEditing
                ?<td style={{padding:"4px 12px",textAlign:"right"}}>
                  <input autoFocus type="number" step="0.01" value={editVal}
                    onChange={e=>setEditVal(e.target.value)}
                    onBlur={()=>handleSave(d,editVal)}
                    onKeyDown={e=>{if(e.key==="Enter")handleSave(d,editVal);if(e.key==="Escape")setEditing(null);}}
                    style={{width:120,padding:"4px 8px",border:"1.5px solid #0A1628",borderRadius:6,fontSize:12,outline:"none",textAlign:"right",fontFamily:"Inter,sans-serif"}}/>
                </td>
                :<td onClick={()=>{setEditVal(val!==0?val:"");setEditing(d);}}
                    style={{padding:"7px 16px",textAlign:"right",cursor:"pointer",fontSize:12,
                      color:val>0?"#0A1628":val<0?"#F0354B":"#CDD5E0",fontWeight:val!==0?600:400}}
                    title="Click to edit">
                    {val!==0?f2(val):"—"}
                  </td>
              }
            </tr>;
          })}
        </tbody>
        <tfoot><tr style={{background:"#0A1628"}}>
          <td style={{padding:"9px 16px",fontWeight:700,color:"rgba(255,255,255,.7)",fontSize:12}}>Total</td>
          <td style={{padding:"9px 16px",textAlign:"right",fontWeight:700,color:total!==0?"#fff":"rgba(255,255,255,.3)",fontSize:12}}>{total!==0?fRM(total):"—"}</td>
        </tr></tfoot>
      </table>
    </div>
    <p style={{fontSize:11,color:"#8A96A8",marginTop:8}}>Click any amount to edit. Press Enter or click away to save.</p>
  </div>;
}

// ─── PRINT BRANCH REPORT ───────────────────────────────────
function PrintBranchReport({branchId,records,targets,srList,branchMeta,onClose,month,year,days}){
  const ref=useRef();
  const bSRs=srList.filter(s=>s.branch===branchId&&!(s.status||'').toLowerCase().includes('resigned'));
  const bTarget=targets?.bm?.[branchId]||0;
  const bTotal=days.reduce((s,d)=>{
    const k=`${d}/${month}/${year}`,day=records[k]||{};
    let t=0;bSRs.forEach(sr=>t+=(day[sr.id]?.walkin||0)+(day[sr.id]?.aeon||0));
    return s+t;
  },0);
  const branchPct=pctN(bTotal,bTarget);
  const print=()=>{
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>${branchMeta[branchId]?.name} Branch Report</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,system-ui,sans-serif;}body{background:#fff;padding:16px;}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
    @page{size:A3 landscape;margin:10mm;}</style></head><body>
    <div style="text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #0A1628">
      <div style="font-size:10px;color:#8A96A8;text-transform:uppercase;letter-spacing:.1em;font-weight:700">EMAX NETWORK SDN BHD</div>
      <div style="font-size:16px;font-weight:900;color:#0A1628">${branchMeta[branchId]?.name} — Monthly Report</div>
      <div style="font-size:11px;color:#4A5568">June ${year}</div>
    </div>`);
    w.document.write('<div class="grid">');
    w.document.write(ref.current.innerHTML);
    w.document.write('</div></body></html>');
    w.document.close();setTimeout(()=>w.print(),400);
  };

  return <div className="modal-overlay">
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1200,maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 80px rgba(0,0,0,.4)"}}>
      <div style={{padding:"16px 24px",borderBottom:"1px solid #E4EAF2",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:1}}>
        <div>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>{branchMeta[branchId]?.name} — Branch Report</h2>
          <p style={{fontSize:11,color:"#8A96A8",margin:0,marginTop:1}}>June {year} · Preview before printing</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn btn-success" onClick={print}>Print / Save PDF</button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <div style={{padding:20,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14,alignItems:"start"}} ref={ref}>
        {bSRs.map(sr=><SRTable key={sr.id} sr={sr} records={records} targets={targets} branchPct={branchPct} onEdit={()=>{}} printMode={true} month={month} year={year} days={days}/>)}
        <BMTable branchId={branchId} records={records} targets={targets} srList={srList} branchMeta={branchMeta} onEdit={()=>{}} printMode={true} month={month} year={year} days={days}/>
      </div>

    </div>
  </div>;
}

// ─── UPLOAD PANEL ──────────────────────────────────────────
function UploadPanel({records,setRecords,srList,defaultBranch,recordsKey:rKey}){
  const [file,setFile]=useState(null);
  const [date,setDate]=useState(()=>{const d=new Date();return`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;});
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [err,setErr]=useState("");

  const save=async()=>{
    if(!file){setErr("Please select a PDF file.");return;}
    setErr("");setSaving(true);
    try{
      const b64=await fileToB64(file);
      const pdfKey=`emax_v5_pdf_${defaultBranch}_${date.replace(/\//g,"_")}_${Date.now()}`;
      await saveData(pdfKey,{name:file.name,date,b64,branch:defaultBranch});
      const idxKey="emax_v5_pdf_index";
      const existing=await loadData(idxKey)||[];
      const arr=Array.isArray(existing)?existing:[];
      if(!arr.includes(pdfKey))arr.push(pdfKey);
      await saveData(idxKey,[...new Set(arr)]);
      setSaved(true);setTimeout(()=>{setSaved(false);setFile(null);},2000);
    }catch(e){setErr(e.message);}
    setSaving(false);
  };

  return <div style={{maxWidth:560,background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,padding:16,marginTop:16}}>
    <div style={{fontWeight:700,fontSize:12,color:"#0A1628",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>Daily AEON Profit Report — Upload PDF</div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
      <div>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:"#8A96A8",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Report Date</label>
        <input className="input" type="text" value={date} onChange={e=>setDate(e.target.value)} placeholder="D/M/YYYY" style={{width:130,fontSize:12}}/>
      </div>
      <div style={{flex:1,minWidth:200}}>
        <label style={{display:"block",fontSize:10,fontWeight:600,color:"#8A96A8",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>PDF File</label>
        <label style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`1.5px solid ${file?"#0A1628":"#E4EAF2"}`,borderRadius:7,cursor:"pointer",background:"#F7F9FC",fontSize:12,color:file?"#0A1628":"#8A96A8"}}>
          <input type="file" accept=".pdf" style={{display:"none"}} onChange={e=>setFile(e.target.files[0])}/>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          {file?file.name:"Choose PDF file"}
        </label>
      </div>
      <button onClick={save} disabled={saving||!file} style={{padding:"9px 18px",background:saved?"#00C896":"#0A1628",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"Inter,sans-serif",cursor:saving||!file?"not-allowed":"pointer",opacity:!file?0.5:1}}>
        {saved?"Saved!":saving?"Saving...":"Upload"}
      </button>
    </div>
    {err&&<div style={{color:"#F0354B",fontSize:11,marginTop:8}}>{err}</div>}
    {saved&&<div style={{color:"#00C896",fontSize:11,marginTop:8}}>PDF saved — viewers can now download it</div>}
  </div>;
}

// ─── TARGET MODAL ──────────────────────────────────────────
export function TargetModal({targets,setTargets,srList,branchMeta,onClose,currentMonth,currentYear,onSaveForMonth,isHR=false}){
  const MONTHS_LABEL=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const [tgtMonth,setTgtMonth]=useState(currentMonth);
  const [tgtYear,setTgtYear]=useState(currentYear);
  const realNow=new Date();
  const hrLocked=isHR&&(tgtYear<realNow.getFullYear()||(tgtYear===realNow.getFullYear()&&tgtMonth<realNow.getMonth()+1));
  const [selBranch,setSelBranch]=useState("ALL");
  const [local,setLocal]=useState(JSON.parse(JSON.stringify(targets)));
  const [loading,setLoading]=useState(false);
  const [saved,setSaved]=useState(false);

  // When month/year changes, load that month's targets
  const loadMonthTargets=async(m,y)=>{
    setLoading(true);
    setTgtMonth(m);setTgtYear(y);
    const {loadData:ld}=await import("./storage/index.js");
    const t=await ld(`emax_v5_targets_${y}_${m}`);
    const tPrev=await ld(`emax_v5_targets_${m===1?y-1:y}_${m===1?12:m-1}`);
    const tUse=t||tPrev||targets;
    if(tUse?.bm)setLocal({bm:{...targets.bm,...tUse.bm},bmBonus:{...targets.bmBonus,...(tUse.bmBonus||{})},bmBasic:{...DEFAULT_TARGETS.bmBasic,...(tUse.bmBasic||{})},sr:{...targets.sr,...tUse.sr},bmName:{...tUse.bmName},bmStatus:{...tUse.bmStatus}});
    else setLocal({...JSON.parse(JSON.stringify(targets)),bmName:{},bmStatus:{},bmBasic:{}});
    setLoading(false);
  };

  const save=async()=>{
    if(onSaveForMonth)await onSaveForMonth(local,tgtMonth,tgtYear);
    else setTargets(local);
    setSaved(true);setTimeout(()=>setSaved(false),1500);
  };

  const setBM=(b,v)=>setLocal(p=>({...p,bm:{...p.bm,[b]:parseFloat(v)||0}}));
  const setBMB=(b,v)=>setLocal(p=>({...p,bmBonus:{...p.bmBonus,[b]:parseFloat(v)||0}}));
  const setBMBasic=(b,v)=>setLocal(p=>({...p,bmBasic:{...(p.bmBasic||{}),[b]:parseFloat(v)||0}}));
  const setSR=(id,field,v)=>setLocal(p=>({...p,sr:{...p.sr,[id]:{...p.sr?.[id],[field]:parseFloat(v)||0}}}));

  const branches=selBranch==="ALL"?BRANCH_ORDER:[selBranch];

  return <div className="modal-overlay">
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:860,maxHeight:"90vh",overflow:"auto"}}>
      {/* Sticky header */}
      <div style={{padding:"14px 20px",borderBottom:"1px solid #E4EAF2",position:"sticky",top:0,background:"#fff",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>Targets</h2>
          {saved&&<span style={{fontSize:12,color:"#00C896",fontWeight:700}}>Saved</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:8}}>
          <select className="input select" value={tgtMonth} onChange={e=>loadMonthTargets(parseInt(e.target.value),tgtYear)} style={{fontSize:12,padding:"4px 20px 4px 6px",width:88}}>
            {MONTHS_LABEL.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input select" value={tgtYear} onChange={e=>loadMonthTargets(tgtMonth,parseInt(e.target.value))} style={{fontSize:12,padding:"4px 20px 4px 6px",width:78}}>
            {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input select" value={selBranch} onChange={e=>setSelBranch(e.target.value)} style={{fontSize:12,padding:"4px 20px 4px 6px",width:130}}>
            <option value="ALL">All Branches</option>
            {BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name}</option>)}
          </select>
          <div style={{flex:1}}/>
          <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px",fontSize:12}}>Close</button>
        </div>
      </div>

      <div style={{padding:20}}>
        {loading&&<div style={{textAlign:"center",padding:"32px 0",color:"#8A96A8",fontSize:13}}>Loading targets for {MONTHS_LABEL[tgtMonth-1]} {tgtYear}…</div>}
        {!loading&&<>
          {/* Branch-by-branch: BM + SR together */}
          {hrLocked&&<div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#92400E"}}>
            You're viewing {MONTHS_LABEL[tgtMonth-1]} {tgtYear} — that's a past month, so it's read-only from here. Switch to the current month to make changes.
          </div>}

          {branches.map(b=>{
            const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,tgtMonth,tgtYear));
            const bmName=branchMeta[b]?.manager??"";
            return <div key={b} style={{marginBottom:24,border:"1px solid #E4EAF2",borderRadius:12,overflow:"hidden"}}>
              {/* Branch header */}
              <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{branchMeta[b]?.name}{bmName&&<span style={{fontWeight:500,color:"rgba(255,255,255,.5)"}}> — {bmName}</span>}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{b}</div>
              </div>
              {/* BM targets */}
              <div style={{padding:"14px 16px",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#1E6FDB",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Branch Manager Targets</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch Target (RM)</label>
                    <input className="input" type="number" value={local.bm?.[b]||""} onChange={e=>setBM(b,e.target.value)} placeholder="0" disabled={hrLocked} style={{fontSize:12}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Personal Achievement Bonus (RM)</label>
                    <input className="input" type="number" value={local.bmBonus?.[b]||""} onChange={e=>setBMB(b,e.target.value)} placeholder="0" disabled={hrLocked} style={{fontSize:12}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Monthly Basic (RM)</label>
                    <input className="input" type="number" value={local.bmBasic?.[b]||""} onChange={e=>setBMBasic(b,e.target.value)} placeholder="0" disabled={hrLocked} style={{fontSize:12}}/>
                  </div>
                </div>
              </div>
              {/* SR targets */}
              {bSRs.length>0&&<div style={{padding:"12px 16px",overflowX:"auto"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#1E6FDB",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>SR Targets</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"2px solid #E4EAF2"}}>
                    {["Name","Type","Target (RM)","Personal Bonus (RM)"].map(h=>
                      <th key={h} style={{textAlign:"left",padding:"8px",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>{bSRs.map((sr,i)=>(
                    <tr key={sr.id} style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#F7F9FC"}}>
                      <td style={{padding:"7px 8px",fontWeight:700,color:"#0A1628",whiteSpace:"nowrap"}}>{sr.canon}</td>
                      <td style={{padding:"7px 8px"}}><TypeTag type={sr.type}/></td>
                      <td style={{padding:"7px 8px"}}><input className="input" type="number" value={local.sr?.[sr.id]?.target||""} onChange={e=>setSR(sr.id,"target",e.target.value)} placeholder="0" disabled={hrLocked} style={{fontSize:12,padding:"5px 8px",width:110}}/></td>
                      <td style={{padding:"7px 8px"}}><input className="input" type="number" value={local.sr?.[sr.id]?.bonus||""} onChange={e=>setSR(sr.id,"bonus",e.target.value)} placeholder="0" disabled={hrLocked} style={{fontSize:12,padding:"5px 8px",width:110}}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
              {bSRs.length===0&&<div style={{padding:"10px 16px",fontSize:11,color:"#8A96A8"}}>No active SR for this branch in {MONTHS_LABEL[tgtMonth-1]} {tgtYear}.</div>}
            </div>;
          })}

          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8,paddingTop:16,borderTop:"1px solid #E4EAF2"}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save — {MONTHS_LABEL[tgtMonth-1]} {tgtYear}{selBranch!=="ALL"?` · ${selBranch}`:""}</button>
          </div>
        </>}
      </div>
    </div>
  </div>;
}

// ─── SR/BM MANAGEMENT MODAL ────────────────────────────────
function StatusEditWidget({status,onSave,onViewHistory}){
  const [editing,setEditing]=useState(false);
  const ps=parseStatus(status);
  const [base,setBase]=useState(ps.base);
  const [p,setP]=useState(ps.p);
  const [f,setF]=useState(ps.f);
  const [desc,setDesc]=useState("");
  // resignDate must be declared before any early return (React hooks rule)
  const today=new Date();
  const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const [resignDate,setResignDate]=useState(todayStr);

  const startEdit=()=>{const cur=parseStatus(status);setBase(cur.base);setP(cur.p);setF(cur.f);setDesc("");setEditing(true);};

  if(!editing){
    return <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:600,color:"#0A1628"}}>{status||"—"}</span>
      <button onClick={startEdit} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:6,background:"#F7F9FC",color:"#4A5568",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
        Edit
      </button>
      {onViewHistory&&<button onClick={onViewHistory} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:6,background:"#fff",color:"#1E6FDB",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
        History
      </button>}
    </div>;
  }

  const save=()=>{
    if(!desc.trim()){return;}
    const newStatus=buildStatus(base,p,f);
    // Pass resignDate along when saving Resigned status
    onSave(newStatus,desc.trim(),base==="Resigned"?resignDate:null);
    setEditing(false);
  };

  return <div style={{padding:10,background:"#F7F9FC",border:"1px solid #E4EAF2",borderRadius:8}}>
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
      <select className="input select" value={base} onChange={e=>setBase(e.target.value)} style={{width:"auto",minWidth:96,padding:"4px 22px 4px 8px",fontSize:11}}>
        {statusBaseOptions.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      {base!=="Director"&&base!=="Resigned"&&<>
        <label style={{fontSize:10,color:"#8A96A8"}}>P</label>
        <input type="number" min="0" className="input" value={p} onChange={e=>setP(Math.max(0,parseInt(e.target.value)||0))} style={{width:42,padding:"4px 4px",fontSize:11,textAlign:"center"}}/>
        <label style={{fontSize:10,color:"#8A96A8"}}>F</label>
        <input type="number" min="0" className="input" value={f} onChange={e=>setF(Math.max(0,parseInt(e.target.value)||0))} style={{width:42,padding:"4px 4px",fontSize:11,textAlign:"center"}}/>
      </>}
    </div>
    {base==="Resigned"&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <label style={{fontSize:11,color:"#4A5568",whiteSpace:"nowrap"}}>Resignation Date:</label>
      <input type="date" className="input" value={resignDate} onChange={e=>setResignDate(e.target.value)} style={{fontSize:11,flex:1}}/>
    </div>}
    <input type="text" className="input" placeholder="Reason for change (required)" value={desc} onChange={e=>setDesc(e.target.value)} style={{fontSize:11,marginBottom:8}}/>
    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>setEditing(false)} style={{flex:1,padding:"6px 0",fontSize:11,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:6,background:"#fff",color:"#8A96A8",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
      <button onClick={save} disabled={!desc.trim()} style={{flex:1,padding:"6px 0",fontSize:11,fontWeight:700,border:"none",borderRadius:6,background:!desc.trim()?"#E4EAF2":"#0A1628",color:!desc.trim()?"#8A96A8":"#fff",cursor:!desc.trim()?"not-allowed":"pointer",fontFamily:"Inter,sans-serif"}}>Save</button>
    </div>
  </div>;
}

function AdjustBalanceWidget({personId,balance,adjustBalance}){
  const [open,setOpen]=useState(false);
  const [amount,setAmount]=useState("");
  const [note,setNote]=useState("");
  const [mode,setMode]=useState("add"); // "add" | "subtract"

  const submit=async()=>{
    const n=Math.abs(Number(amount)||0);
    if(n===0||!note.trim()){return;}
    await adjustBalance(personId,mode==="add"?n:-n,note.trim());
    setAmount("");setNote("");setOpen(false);
  };

  return <div style={{position:"relative"}}>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{balance.toLocaleString()} pts</span>
      <button onClick={()=>setOpen(o=>!o)} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:6,background:open?"#0A1628":"#F7F9FC",color:open?"#fff":"#4A5568",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
        {open?"Cancel":"Adjust ±"}
      </button>
    </div>
    {open&&<div style={{position:"absolute",top:"100%",right:0,marginTop:6,padding:10,background:"#fff",border:"1px solid #E4EAF2",borderRadius:8,boxShadow:"0 4px 16px rgba(10,22,40,.15)",width:220,zIndex:50}}>
      <div style={{display:"flex",gap:6,marginBottom:6}}>
        <button onClick={()=>setMode("add")} style={{flex:1,padding:"5px 0",fontSize:11,fontWeight:700,border:"1px solid "+(mode==="add"?"#00C896":"#E4EAF2"),borderRadius:6,background:mode==="add"?"#00C89615":"#fff",color:mode==="add"?"#00C896":"#8A96A8",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>+ Add</button>
        <button onClick={()=>setMode("subtract")} style={{flex:1,padding:"5px 0",fontSize:11,fontWeight:700,border:"1px solid "+(mode==="subtract"?"#F0354B":"#E4EAF2"),borderRadius:6,background:mode==="subtract"?"#F0354B15":"#fff",color:mode==="subtract"?"#F0354B":"#8A96A8",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>− Subtract</button>
      </div>
      <input type="number" min="0" className="input" placeholder="Points amount" value={amount} onChange={e=>setAmount(e.target.value)} style={{fontSize:12,marginBottom:6}}/>
      <input type="text" className="input" placeholder="Reason / description (required)" value={note} onChange={e=>setNote(e.target.value)} style={{fontSize:12,marginBottom:8}}/>
      <button onClick={submit} disabled={!amount||!note.trim()} style={{width:"100%",padding:"7px 0",fontSize:12,fontWeight:700,border:"none",borderRadius:6,background:(!amount||!note.trim())?"#E4EAF2":"#0A1628",color:(!amount||!note.trim())?"#8A96A8":"#fff",cursor:(!amount||!note.trim())?"not-allowed":"pointer",fontFamily:"Inter,sans-serif"}}>
        Confirm {mode==="add"?"+":"−"}{amount||0} pts
      </button>
    </div>}
  </div>;
}

export function SRBMModal({srList,setSrList,branchMeta,setBranchMeta,onClose,rewardBalances,adjustBalance,statusHistory,setStatusHistory,month,year,setShowStatusHistoryModal,setStatusModalPerson,renameSRId,isHR=false}){
  const MONTHS_LABEL=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const [tab,setTab]=useState("bm");
  const [localBM,setLocalBM]=useState(JSON.parse(JSON.stringify(branchMeta)));
  const [localSR,setLocalSR]=useState(JSON.parse(JSON.stringify(srList)));
  const [editSR,setEditSR]=useState(null);
  const [updatePerson,setUpdatePerson]=useState(null);
  const [expandedResigned,setExpandedResigned]=useState({});
  const [editSRId,setEditSRId]=useState(null); // {oldId, value} — separate from editSR (name) since renaming an ID needs its own validation/migration path
  const [srIdError,setSrIdError]=useState(null);
  const trySaveSRId=async(oldId,value)=>{
    const newId=value.trim();
    let res=await renameSRId(oldId,newId);
    if(!res.ok&&res.reason==="duplicate"){
      const proceed=confirm(`"${newId}" is already used by ${res.conflictName}. Since one agent should only have one ID, continuing will merge that record into this one — ${res.conflictName}'s existing entry will be removed and this SR will take over the ID. Continue?`);
      if(proceed)res=await renameSRId(oldId,newId,true);
      else return;
    }
    if(res.ok){
      // renameSRId already updated the parent's srList/Supabase — this
      // modal keeps its own separate local copy (localSR) for editing,
      // which doesn't refresh on its own, so mirror the same result here
      // too or the table won't visibly update.
      if(res.newSRList)setLocalSR(res.newSRList);
      setEditSRId(null);setSrIdError(null);
    }
    else if(res.reason!=="unchanged")setSrIdError("Could not save");
    else setEditSRId(null);
  };
  const [newSR,setNewSR]=useState({id:"",canon:"",branch:"KM",type:"Online",status:"Training (P0 F0)",joinDate:`${year}-${String(month).padStart(2,"0")}`});
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [saved,setSaved]=useState(false);
  const [srSaved,setSRSaved]=useState(false);
  // Monthly type overrides — per month, per SR
  const [typeMonth,setTypeMonth]=useState(month);
  const [typeYear,setTypeYear]=useState(year);
  const realNow=new Date();
  const isPastMonth=isHR&&(typeYear<realNow.getFullYear()||(typeYear===realNow.getFullYear()&&typeMonth<realNow.getMonth()+1));
  const hrLocked=isHR&&isPastMonth;
  const [typeOverrides,setTypeOverrides]=useState({});

  // Load type overrides whenever month/year changes
  useEffect(()=>{
    loadData(`emax_v5_sr_types_${typeYear}_${typeMonth}`).then(d=>setTypeOverrides(d||{}));
  },[typeMonth,typeYear]);

  // Get effective type for a given SR in the selected month
  const getType=(sr)=>typeOverrides[sr.id]||sr.type;

  // Save type override for a specific SR in the selected month
  const setTypeOverride=async(srId,newType)=>{
    const updated={...typeOverrides,[srId]:newType};
    setTypeOverrides(updated);
    await saveData(`emax_v5_sr_types_${typeYear}_${typeMonth}`,updated);
    setSRSaved(true);setTimeout(()=>setSRSaved(false),1500);
  };
  const saveBM=async()=>{setBranchMeta(localBM);await saveData(BM_KEY,localBM);setSaved(true);setTimeout(()=>setSaved(false),1500);};
  const saveSR=async(list)=>{setSrList(list);await saveData(SR_KEY,list);setSRSaved(true);setTimeout(()=>setSRSaved(false),1500);};
  const addSR=async()=>{
    if(!newSR.id||!newSR.canon){alert("SR ID and Name are required.");return;}
    if(localSR.find(s=>s.id===newSR.id)){alert("SR ID already exists.");return;}
    const srToAdd={...newSR};
    // joinDate already set in newSR state — store as "YYYY-MM"
    const updated=[...localSR,srToAdd];setLocalSR(updated);setEditSR(null);
    setNewSR({id:"",canon:"",branch:"KM",type:"Online",status:"Probation (P0 F0)",joinDate:`${year}-${String(month).padStart(2,"0")}`});
    await saveSR(updated);
  };
  const updateSR=async(id,field,val)=>{const updated=localSR.map(s=>s.id===id?{...s,[field]:val}:s);setLocalSR(updated);await saveSR(updated);};
  const saveSRStatus=async(id,newStatus,desc,resignDate=null)=>{
    // If resigned, store resignDate on the SR object so monthly report can filter by it
    if(resignDate){
      const updated=srList.map(s=>s.id===id?{...s,status:newStatus,resignDate}:s);
      setSrList(updated);
      await saveData(SR_KEY,updated);
    } else {
      await updateSR(id,"status",newStatus);
    }
    const hist=statusHistory[id]||[];
    const noteStr=resignDate?`${desc} (Resignation date: ${resignDate})`:desc;
    const newHist={...statusHistory,[id]:[...hist,{date:new Date().toISOString(),status:newStatus,note:noteStr}]};
    setStatusHistory(newHist);
    await saveData("emax_v5_status_history",newHist);
  };
  // Handles every kind of staff update from the unified panel: a plain
  // status/branch/type change, or a role change bridging SR list and
  // branchMeta correctly in either direction (SR promoted to Branch
  // Manager, or Branch Manager moved back to a regular SR) — something the
  // two data structures never automatically kept in sync before. Only
  // touches the "current" flat state if effectiveFrom is now or in the
  // past; a future-dated change is recorded in history only, same
  // now-vs-past-vs-future rule as everything else here.
  const saveStaffUpdate=async(person,{effectiveFrom,newRole,newBranch,newType,status})=>{
    const nowYM=`${year}-${String(month).padStart(2,"0")}`;
    const isNowOrPast=effectiveFrom<=nowYM;
    const isSR=person.kind==="sr";
    const roleChanging=newRole!==(isSR?"sr":"bm");
    const historyKey=isSR?person.sr.id:`BM_${person.branch}`;
    const resolvedStatus=status==="continue"?(isSR?person.sr.status:person.status):status;
    const logNote=(parts)=>{
      const hist=statusHistory[historyKey]||[];
      const note=`Staff update (effective ${effectiveFrom}): ${parts.join(", ")}`;
      const newHist={...statusHistory,[historyKey]:[...hist,{date:new Date().toISOString(),status:status==="continue"?"—":status,note}]};
      setStatusHistory(newHist);
      saveData("emax_v5_status_history",newHist);
    };

    if(isSR&&!roleChanging){
      const sr=person.sr;
      const entry={effectiveFrom,branch:newBranch!==sr.branch?newBranch:undefined,status:resolvedStatus,loggedAt:new Date().toISOString()};
      const updated=localSR.map(s=>s.id!==sr.id?s:{
        ...s,
        progressionHistory:[...(s.progressionHistory||[]),entry],
        ...(isNowOrPast?{branch:newBranch,status:resolvedStatus}:{}),
      });
      setLocalSR(updated);
      await saveSR(updated);
      if(isNowOrPast&&newType&&newType!==sr.type){
        const typeKey=`emax_v5_sr_types_${nowYM.split("-")[0]}_${parseInt(nowYM.split("-")[1])}`;
        const curTypes=(await loadData(typeKey))||{};
        await saveData(typeKey,{...curTypes,[sr.id]:newType});
      }
      logNote([newBranch!==sr.branch?`branch → ${newBranch}`:null,`status → ${resolvedStatus}`].filter(Boolean));

    }else if(isSR&&roleChanging){
      // SR → Branch Manager
      const sr=person.sr;
      if(isNowOrPast){
        const updatedMeta={...localBM,[newBranch]:{...localBM[newBranch],manager:sr.canon,mStatus:resolvedStatus}};
        setLocalBM(updatedMeta);
        setBranchMeta(updatedMeta);
        await saveData(BM_KEY,updatedMeta);
        const updated=localSR.map(s=>s.id!==sr.id?s:{
          ...s,
          status:"Promoted to Branch Manager",
          progressionHistory:[...(s.progressionHistory||[]),{effectiveFrom,role:"bm",branch:newBranch,status:resolvedStatus,loggedAt:new Date().toISOString()}],
        });
        setLocalSR(updated);
        await saveSR(updated);
      }else{
        const updated=localSR.map(s=>s.id!==sr.id?s:{...s,progressionHistory:[...(s.progressionHistory||[]),{effectiveFrom,role:"bm",branch:newBranch,status:resolvedStatus,loggedAt:new Date().toISOString()}]});
        setLocalSR(updated);
        await saveSR(updated);
      }
      logNote([`role → Branch Manager (${branchMeta[newBranch]?.name||newBranch})`,`status → ${resolvedStatus}`]);

    }else if(!isSR&&!roleChanging){
      const b=person.branch;
      if(isNowOrPast){
        const updatedMeta={...localBM,[b]:{...localBM[b],mStatus:resolvedStatus}};
        setLocalBM(updatedMeta);
        setBranchMeta(updatedMeta);
        await saveData(BM_KEY,updatedMeta);
      }
      logNote([`status → ${resolvedStatus}`]);

    }else{
      // Branch Manager → SR
      const b=person.branch;
      if(isNowOrPast){
        let newId="BM"+b+nowYM.replace("-","");
        let suffix=1;
        while(localSR.find(s=>s.id===newId)){newId="BM"+b+nowYM.replace("-","")+"_"+suffix;suffix++;}
        const newSR={id:newId,canon:person.name,branch:b,type:newType||"Online",status:resolvedStatus,joinDate:effectiveFrom};
        const updatedSRList=[...localSR,newSR];
        setLocalSR(updatedSRList);
        await saveSR(updatedSRList);
        const updatedMeta={...localBM,[b]:{...localBM[b],manager:"",mStatus:""}};
        setLocalBM(updatedMeta);
        setBranchMeta(updatedMeta);
        await saveData(BM_KEY,updatedMeta);
      }
      logNote([`role → SR`,`status → ${resolvedStatus}`]);
    }
  };
  const saveBMStatus=async(b,newStatus,desc)=>{
    const updatedMeta={...branchMeta,[b]:{...branchMeta[b],mStatus:newStatus}};
    setBranchMeta(updatedMeta);
    await saveData(BM_KEY,updatedMeta);
    setLocalBM(p=>({...p,[b]:{...p[b],mStatus:newStatus}}));
    const key=`BM_${b}`;
    const hist=statusHistory[key]||[];
    const newHist={...statusHistory,[key]:[...hist,{date:new Date().toISOString(),status:newStatus,note:desc}]};
    setStatusHistory(newHist);
    await saveData("emax_v5_status_history",newHist);
  };
  const removeSR=async(id)=>{if(!confirm("Remove this SR?"))return;const updated=localSR.filter(s=>s.id!==id);setLocalSR(updated);await saveSR(updated);};
  const filteredSR=(filterBranch==="ALL"?localSR:localSR.filter(s=>s.branch===filterBranch)).filter(s=>!(s.status||'').toLowerCase().includes('resigned')&&srActiveInMonth(s,month,year));
  // All staff for this branch: BM + SRs (active + resigned)
  const allStaffForBranch=(b)=>{
    const active=localSR.filter(s=>s.branch===b&&srActiveInMonth(s,month,year)&&!(s.status||'').toLowerCase().includes('resigned'));
    const resigned=localSR.filter(s=>s.branch===b&&(s.status||'').toLowerCase().includes('resigned'));
    return{active,resigned};
  };

  return <div className="modal-overlay">
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:900,maxHeight:"92vh",overflow:"auto"}}>
      {/* Header */}
      <div style={{padding:"14px 24px",borderBottom:"1px solid #E4EAF2",position:"sticky",top:0,background:"#fff",zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>Manage Staff</h2>
          {(saved||srSaved)&&<span style={{fontSize:12,color:"#00C896",fontWeight:700}}>Saved</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginTop:8}}>
          <select className="input select" value={typeMonth} onChange={e=>setTypeMonth(parseInt(e.target.value))} style={{fontSize:12,padding:"4px 20px 4px 6px",width:88}}>
            {MONTHS_LABEL.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input select" value={typeYear} onChange={e=>setTypeYear(parseInt(e.target.value))} style={{fontSize:12,padding:"4px 20px 4px 6px",width:78}}>
            {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{flex:1}}/>
          <button className="btn btn-success" onClick={()=>setEditSR("new")} disabled={hrLocked} style={{fontSize:12,padding:"6px 12px",opacity:hrLocked?.5:1}}>+ Add New SR</button>
          <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px",fontSize:12}}>Close</button>
        </div>
      </div>

      <div style={{padding:"20px 24px"}}>
        {/* Add New SR form */}
        {hrLocked&&<div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#92400E"}}>
          You're viewing {MONTHS_LABEL[typeMonth-1]} {typeYear} — that's a past month, so it's read-only from here. Switch to the current month to make changes.
        </div>}
        {editSR==="new"&&<div style={{background:"rgba(0,200,150,.06)",borderRadius:12,padding:16,border:"1px solid rgba(0,200,150,.3)",marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:13,color:"#00C896",marginBottom:12}}>New Sales Representative</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Promoter ID</label>
              <input className="input" placeholder="EM0311" value={newSR.id} onChange={e=>setNewSR(p=>({...p,id:e.target.value.toUpperCase()}))} style={{fontSize:12}}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Full Name</label>
              <input className="input" placeholder="FULL NAME" value={newSR.canon} onChange={e=>setNewSR(p=>({...p,canon:e.target.value.toUpperCase()}))} style={{fontSize:12}}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
              <select className="input select" value={newSR.branch} onChange={e=>setNewSR(p=>({...p,branch:e.target.value}))} style={{fontSize:12}}>
                {BRANCH_ORDER.map(b=><option key={b} value={b}>{branchMeta[b]?.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Type</label>
              <select className="input select" value={newSR.type} onChange={e=>setNewSR(p=>({...p,type:e.target.value}))} style={{fontSize:12}}>
                <option value="Online">Online</option><option value="Offline">Offline</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:"#00C896",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Start Month</label>
              <div style={{display:"flex",gap:4}}>
                <select className="input select" value={(newSR.joinDate||"").split("-")[1]||String(month).padStart(2,"0")} onChange={e=>setNewSR(p=>({...p,joinDate:`${(p.joinDate||`${year}-${String(month).padStart(2,"0")}`).split("-")[0]}-${e.target.value}`}))} style={{fontSize:11,flex:1,padding:"4px 20px 4px 6px"}}>
                  {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=><option key={i+1} value={String(i+1).padStart(2,"0")}>{m}</option>)}
                </select>
                <select className="input select" value={(newSR.joinDate||"").split("-")[0]||year} onChange={e=>setNewSR(p=>({...p,joinDate:`${e.target.value}-${(p.joinDate||`${year}-${String(month).padStart(2,"0")}`).split("-")[1]}`}))} style={{fontSize:11,width:70,padding:"4px 20px 4px 6px"}}>
                  {[2024,2025,2026,2027,2028].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div style={{marginTop:10,gridColumn:"1/-1"}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Employment Status</label>
            <div style={{fontSize:12,color:"#0A1628",fontWeight:600,padding:"7px 0"}}>Training (P0 F0) — every new SR starts here</div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
            <button className="btn btn-ghost" onClick={()=>setEditSR(null)}>Cancel</button>
            <button className="btn btn-success" onClick={addSR}>Add SR</button>
          </div>
        </div>}

        {/* Branch-by-branch view */}
        {BRANCH_ORDER.map(b=>{
          const {active,resigned}=allStaffForBranch(b);
          const bm=localBM[b];
          return <div key={b} style={{marginBottom:20,border:"1px solid #E4EAF2",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 3px rgba(10,22,40,.05)"}}>
            {/* Branch header */}
            <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
              <input value={bm?.name||branchMeta[b]?.name||b} onChange={e=>setLocalBM(p=>({...p,[b]:{...p[b],name:e.target.value}}))} onBlur={saveBM} readOnly={hrLocked} style={{fontWeight:800,fontSize:14,color:"#fff",border:"none",background:"transparent",padding:"2px 0",flex:1,minWidth:0}}/>
              <div style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{active.length} SR{active.length!==1?"s":""}</div>
            </div>

            {/* BM card */}
            <div style={{padding:"14px 18px",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"#EFF6FF",color:"#1E6FDB",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,flexShrink:0}}>BM</div>
              <div style={{flex:1,minWidth:160}}>
                <input className="input" value={bm?.manager||""} onChange={e=>setLocalBM(p=>({...p,[b]:{...p[b],manager:e.target.value}}))} onBlur={saveBM} placeholder="Branch Manager Name" readOnly={hrLocked} style={{fontSize:13,fontWeight:700,border:"none",background:"transparent",padding:"2px 0",width:"100%"}}/>
                <div style={{fontSize:11,color:"#8A96A8",marginTop:2}}>{bm?.mStatus||"No status set"}</div>
              </div>
              {!isHR&&<AdjustBalanceWidget personId={`BM_${b}`} balance={rewardBalances?.[`BM_${b}`]?.balance||0} adjustBalance={adjustBalance}/>}
              {bm?.manager&&<button className="btn" onClick={()=>setUpdatePerson({kind:"bm",branch:b,name:bm.manager,status:bm.mStatus})} disabled={hrLocked} style={{fontSize:11,padding:"6px 12px",opacity:hrLocked?.5:1}}>Update</button>}
              {setShowStatusHistoryModal&&<button className="btn btn-ghost" onClick={()=>{setStatusModalPerson(`BM_${b}`);setShowStatusHistoryModal(true);}} style={{fontSize:11,padding:"6px 10px"}}>History</button>}
            </div>

            {/* Active SR table */}
            {active.length>0&&<div style={{padding:"0 18px 14px",overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{borderBottom:"2px solid #E4EAF2"}}>
                  {["Name / ID","Type","Joined","Status","Points",""].map(h=>
                    <th key={h} style={{textAlign:"left",padding:"10px 8px",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                  )}
                </tr></thead>
                <tbody>{active.map((sr,i)=>(
                  <tr key={sr.id} style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#FBFCFE"}}>
                    <td style={{padding:"8px",minWidth:150}}>
                      {editSR?.id===sr.id
                        ?<input autoFocus className="input" style={{width:"100%",padding:"3px 7px",fontSize:12,fontWeight:700}} value={editSR.canon} onChange={e=>setEditSR(p=>({...p,canon:e.target.value.toUpperCase()}))} onBlur={async()=>{await updateSR(sr.id,"canon",editSR.canon);setEditSR(null);}} onKeyDown={e=>{if(e.key==="Enter"){updateSR(sr.id,"canon",editSR.canon);setEditSR(null);}if(e.key==="Escape")setEditSR(null);}}/>
                        :<div style={{fontWeight:700,fontSize:12,color:"#0A1628",cursor:"pointer"}} onClick={()=>setEditSR({...sr})} title="Click to edit name">{sr.canon}</div>}
                      {editSRId?.oldId===sr.id
                        ?<div style={{display:"flex",flexDirection:"column",gap:2,marginTop:3}}>
                          <input autoFocus className="input" style={{width:90,padding:"2px 6px",fontSize:10}} value={editSRId.value} onChange={e=>{setEditSRId(p=>({...p,value:e.target.value}));setSrIdError(null);}} onKeyDown={e=>{if(e.key==="Enter")trySaveSRId(sr.id,editSRId.value);if(e.key==="Escape"){setEditSRId(null);setSrIdError(null);}}}/>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>trySaveSRId(sr.id,editSRId.value)} style={{fontSize:9,padding:"1px 6px",background:"#1E6FDB",color:"#fff",border:"none",borderRadius:4,cursor:"pointer"}}>Save</button>
                            <button onClick={()=>{setEditSRId(null);setSrIdError(null);}} style={{fontSize:9,padding:"1px 6px",background:"none",border:"1px solid #E4EAF2",borderRadius:4,cursor:"pointer",color:"#8A96A8"}}>×</button>
                          </div>
                          {srIdError&&<div style={{fontSize:9,color:"#DC2626"}}>{srIdError}</div>}
                        </div>
                        :<div style={{fontSize:10,color:"#8A96A8",cursor:"pointer",marginTop:1}} onClick={()=>{setEditSRId({oldId:sr.id,value:sr.id});setSrIdError(null);}} title="Click to edit ID">{sr.id}</div>}
                    </td>
                    <td style={{padding:"8px"}}><TypeTag type={getType(sr)}/></td>
                    <td style={{padding:"8px",color:"#4A5568",whiteSpace:"nowrap"}}>{sr.joinDate?sr.joinDate.replace(/(\d{4})-(\d{2})/,(f,y,m)=>["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]+" "+y):"—"}</td>
                    <td style={{padding:"8px",color:"#0A1628",fontWeight:600,whiteSpace:"nowrap"}}>{sr.status||"—"}</td>
                    <td style={{padding:"8px"}}>{!isHR&&<AdjustBalanceWidget personId={sr.id} balance={rewardBalances?.[sr.id]?.balance||0} adjustBalance={adjustBalance}/>}</td>
                    <td style={{padding:"8px",textAlign:"right",whiteSpace:"nowrap"}}>
                      <button className="btn" onClick={()=>setUpdatePerson({kind:"sr",sr})} disabled={hrLocked} style={{fontSize:10,padding:"4px 9px",marginRight:4,opacity:hrLocked?.5:1}}>Update</button>
                      <button className="btn btn-danger" onClick={()=>removeSR(sr.id)} disabled={hrLocked} style={{fontSize:10,padding:"4px 9px",opacity:hrLocked?.5:1}}>Remove</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}

            {/* Resigned / inactive — always collapsed by default */}
            {resigned.length>0&&<div style={{borderTop:"1px solid #E4EAF2"}}>
              <button onClick={()=>setExpandedResigned(p=>({...p,[b]:!p[b]}))} style={{width:"100%",textAlign:"left",padding:"9px 18px",background:"none",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.07em",display:"flex",alignItems:"center",gap:6}}>
                <span style={{transform:expandedResigned[b]?"rotate(90deg)":"none",transition:"transform .15s",display:"inline-block"}}>›</span>
                Resigned / Inactive ({resigned.length})
              </button>
              {expandedResigned[b]&&<div style={{padding:"0 18px 14px",overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{borderBottom:"2px solid #FECACA"}}>
                    {["Name / ID","Type","Resigned","Status",""].map(h=>
                      <th key={h} style={{textAlign:"left",padding:"8px",fontSize:10,fontWeight:700,color:"#B91C1C",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>{resigned.map(sr=>(
                    <tr key={sr.id} style={{borderBottom:"1px solid #FECACA"}}>
                      <td style={{padding:"7px 8px"}}>
                        <div style={{fontWeight:700,color:"#7F1D1D"}}>{sr.canon}</div>
                        <div style={{fontSize:10,color:"#B91C1C"}}>{sr.id}</div>
                      </td>
                      <td style={{padding:"7px 8px",color:"#B91C1C"}}>{sr.type}</td>
                      <td style={{padding:"7px 8px",color:"#B91C1C",whiteSpace:"nowrap"}}>{sr.resignDate?sr.resignDate.split("-").reverse().join("/"):"—"}</td>
                      <td style={{padding:"7px 8px",color:"#B91C1C"}}>{sr.status}</td>
                      <td style={{padding:"7px 8px",textAlign:"right",whiteSpace:"nowrap"}}>
                        <button className="btn" onClick={()=>setUpdatePerson({kind:"sr",sr})} disabled={hrLocked} style={{fontSize:10,padding:"4px 9px",marginRight:4,opacity:hrLocked?.5:1}}>Update</button>
                        <button className="btn btn-danger" onClick={()=>removeSR(sr.id)} disabled={hrLocked} style={{fontSize:10,padding:"4px 9px",opacity:hrLocked?.5:1}}>Remove</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
            </div>}

            {active.length===0&&resigned.length===0&&<div style={{padding:"14px 18px",color:"#8A96A8",fontSize:12}}>No staff in this branch.</div>}
          </div>;
        })}
        <p style={{fontSize:11,color:"#8A96A8",marginTop:4}}>Click SR name to edit inline. Type changes apply to selected month.</p>
      </div>
    </div>
    {updatePerson&&<StaffUpdatePanel person={updatePerson} branchMeta={branchMeta} year={year} month={month} isHR={isHR} onClose={()=>setUpdatePerson(null)} onSave={saveStaffUpdate}/>}
  </div>;
}

function StaffUpdatePanel({person,branchMeta,year,month,isHR=false,onClose,onSave}){
  // person: {kind:'sr', sr} for a sales rep, or {kind:'bm', branch, name, status} for a branch manager
  const isSR=person.kind==="sr";
  const currentBranch=isSR?person.sr.branch:person.branch;
  const currentName=isSR?person.sr.canon:person.name;
  const currentStatus=isSR?person.sr.status:(person.status||"Training (P0 F0)");
  const currentStatusBase=parseStatus(currentStatus).base;
  const nowYM=`${year}-${String(month).padStart(2,"0")}`;
  const [effectiveFrom,setEffectiveFrom]=useState(nowYM);
  const [roleChoice,setRoleChoice]=useState(isSR?"sr":"bm"); // sr | bm — the role AFTER this update
  const [newBranch,setNewBranch]=useState(currentBranch);
  const [newType,setNewType]=useState(isSR?person.sr.type:"Online");
  const [statusMode,setStatusMode]=useState("continue"); // continue | set
  const [statusBase,setStatusBase]=useState(["Training","Probation"].includes(currentStatusBase)?currentStatusBase:"Training");
  const [statusP,setStatusP]=useState(()=>parseStatus(currentStatus).p);
  const [statusF,setStatusF]=useState(()=>parseStatus(currentStatus).f);
  const [saving,setSaving]=useState(false);
  const roleChanging=roleChoice!==(isSR?"sr":"bm");
  const branchChanging=isSR&&newBranch!==currentBranch;

  // Employment only ever moves forward — Training → Probation → Confirmed
  // — through a normal status update; it can't drop back a step (e.g.
  // Confirmed can't be set back to Probation). A role change is the one
  // exception, since that's specifically meant to start fresh in the new
  // role. Director isn't offered here at all — the company only has two
  // Directors and that status never changes for them.
  const PROGRESSION=["Training","Probation","Confirmed"];
  const availableStatusOptions=(()=>{
    if(roleChanging)return[...PROGRESSION.slice(1),"Resigned"]; // skip Training — a role change starts at Probation, not from scratch
    const curIdx=PROGRESSION.indexOf(currentStatusBase);
    if(curIdx===-1)return[...PROGRESSION,"Resigned"]; // unrecognized/legacy status (e.g. old "Director") — allow any
    return[...PROGRESSION.slice(curIdx),"Resigned"];
  })();

  const save=async()=>{
    setSaving(true);
    const status=statusMode==="continue"?"continue":buildStatus(statusBase,statusP,statusF);
    await onSave(person,{effectiveFrom,newRole:roleChoice,newBranch,newType,status});
    setSaving(false);
    onClose();
  };

  return<div className="modal-overlay" style={{zIndex:1000}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:460,maxHeight:"90vh",overflow:"auto"}}>
      <div style={{padding:"18px 22px",borderBottom:"1px solid #E4EAF2"}}>
        <h3 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:"0 0 3px"}}>Update Staff</h3>
        <div style={{fontSize:12,color:"#8A96A8"}}>{currentName} — currently {branchMeta[currentBranch]?.name||currentBranch}, {isSR?"Sales Rep":"Branch Manager"}</div>
      </div>

      <div style={{padding:"18px 22px"}}>
        <label style={{fontSize:10,fontWeight:700,color:"#4A5568",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Effective Month</label>
        <input type="month" className="input" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} style={{fontSize:13,marginBottom:6,width:"100%",boxSizing:"border-box"}}/>
        <div style={{fontSize:10,color:"#8A96A8",marginBottom:18}}>Only this month onward is affected — every earlier month's report keeps reading whatever was true at the time.</div>

        <div style={{background:"#F7F9FC",borderRadius:10,padding:14,marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#4A5568",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Role</label>
          <div style={{display:"flex",gap:8,marginBottom:branchChanging||roleChanging?10:0}}>
            <button onClick={()=>{setRoleChoice("sr");if("sr"!==(isSR?"sr":"bm")&&statusBase==="Training")setStatusBase("Probation");}} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${roleChoice==="sr"?"#1E6FDB":"#E4EAF2"}`,background:roleChoice==="sr"?"#EFF6FF":"#fff",color:roleChoice==="sr"?"#1E6FDB":"#4A5568",fontWeight:700,fontSize:12,cursor:"pointer"}}>Sales Rep</button>
            <button onClick={()=>{setRoleChoice("bm");if("bm"!==(isSR?"sr":"bm")&&statusBase==="Training")setStatusBase("Probation");}} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${roleChoice==="bm"?"#1E6FDB":"#E4EAF2"}`,background:roleChoice==="bm"?"#EFF6FF":"#fff",color:roleChoice==="bm"?"#1E6FDB":"#4A5568",fontWeight:700,fontSize:12,cursor:"pointer"}}>Branch Manager</button>
          </div>
          {roleChanging&&<div style={{fontSize:11,color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:6,padding:"6px 8px",marginBottom:isSR?10:0}}>
            {isSR?`This moves ${currentName} from SR to Branch Manager of the branch below, effective ${effectiveFrom}.`:`This moves ${currentName} from Branch Manager to a regular SR, effective ${effectiveFrom}. Their branch manager slot will be cleared.`}
          </div>}
          {isSR&&<>
            <label style={{fontSize:10,fontWeight:700,color:"#4A5568",display:"block",marginBottom:4,marginTop:roleChanging?0:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
            <select className="input select" value={newBranch} onChange={e=>setNewBranch(e.target.value)} style={{fontSize:13,width:"100%"}}>
              {Object.keys(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
            </select>
          </>}
          {roleChoice==="sr"&&<div style={{marginTop:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#4A5568",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Type</label>
            <select className="input select" value={newType} onChange={e=>setNewType(e.target.value)} style={{fontSize:13,width:"100%"}}>
              <option value="Online">Online</option><option value="Offline">Offline</option>
            </select>
          </div>}
        </div>

        <div style={{background:"#F7F9FC",borderRadius:10,padding:14}}>
          <label style={{fontSize:10,fontWeight:700,color:"#4A5568",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>Employment Status</label>
          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer"}}>
            <input type="radio" name="empstatus" checked={statusMode==="continue"} onChange={()=>setStatusMode("continue")}/>
            <span style={{fontSize:12,color:"#0A1628"}}>Continue current status ({currentStatus})</span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:statusMode==="set"?8:0,cursor:"pointer"}}>
            <input type="radio" name="empstatus" checked={statusMode==="set"} onChange={()=>setStatusMode("set")}/>
            <span style={{fontSize:12,color:"#0A1628"}}>Set status</span>
          </label>
          {statusMode==="set"&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",paddingLeft:26}}>
            <select className="input select" value={statusBase} onChange={e=>setStatusBase(e.target.value)} style={{width:"auto",minWidth:100,padding:"5px 22px 5px 8px",fontSize:12}}>
              {availableStatusOptions.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            {!isHR&&statusBase!=="Confirmed"&&statusBase!=="Resigned"&&<>
              <span style={{fontSize:11,color:"#8A96A8"}}>P</span>
              <input type="number" min="0" className="input" value={statusP} onChange={e=>setStatusP(Math.max(0,parseInt(e.target.value)||0))} style={{width:44,padding:"5px 6px",fontSize:12,textAlign:"center"}}/>
              <span style={{fontSize:11,color:"#8A96A8"}}>F</span>
              <input type="number" min="0" className="input" value={statusF} onChange={e=>setStatusF(Math.max(0,parseInt(e.target.value)||0))} style={{width:44,padding:"5px 6px",fontSize:12,textAlign:"center"}}/>
            </>}
            {isHR&&statusBase!=="Confirmed"&&statusBase!=="Resigned"&&<span style={{fontSize:11,color:"#8A96A8"}}>P{statusP} F{statusF}</span>}
          </div>}
          {roleChanging&&<div style={{fontSize:10,color:"#8A96A8",marginTop:8}}>Tip: role changes like this usually start fresh — set status to Probation (P0 F0) for their new role, rather than carrying over their old one.</div>}
        </div>
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 22px",borderTop:"1px solid #E4EAF2"}}>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-success" onClick={save} disabled={saving}>{saving?"Saving…":"Save Update"}</button>
      </div>
    </div>
  </div>;
}


// ─── SR VISIBILITY (joined + resigned filters) ────────────
function srActiveInMonth(sr,m,y){
  // Not yet joined: hide before joinDate month
  if(sr.joinDate){
    const [jy,jm]=sr.joinDate.split("-").map(Number);
    if(y<jy||(y===jy&&m<jm))return false;
  }
  return true;
}
function srVisibleInMonth(sr,m,y){
  if(!srActiveInMonth(sr,m,y))return false;
  if(!(sr.status||'').toLowerCase().includes('resigned'))return true;
  if(!sr.resignDate)return false;
  const [ry,rm]=sr.resignDate.split("-").map(Number);
  return ry>y||(ry===y&&rm>=m);
}

// ─── DAILY ENTRY ──────────────────────────────────────────
export function DailyEntry({records,setRecords,srList,branchMeta,month,year,days,recordsKey,onRepairSave}){
  const now = new Date();
  const defaultDay = days.includes(now.getDate())?now.getDate():days[days.length-1];
  const [selDay,setSelDay]         = useState(defaultDay);
  const [saving,setSaving]         = useState(false);
  const [saved,setSaved]           = useState(false);
  const [localInputs,setLocalInputs] = useState({});
  const [repairInput,setRepairInput] = useState(0); // single company-wide figure for this day
  const [fileInputs,setFileInputs] = useState({}); // { [branch]: File } — staged, uploaded on Save All
  const [existingPdf,setExistingPdf] = useState({}); // { [branch]: {name,key} } — already-uploaded file for this date

  const dateKey = `${selDay}/${month}/${year}`;
  const visibleSRs = srList.filter(s=>srVisibleInMonth(s,month,year));

  // Load every branch's data for this date in one go.
  useEffect(()=>{
    const d = records[dateKey]||{};
    const init = {};
    visibleSRs.forEach(sr=>{
      init[sr.id]={walkin:d[sr.id]?.walkin||0, aeon:d[sr.id]?.aeon||0};
    });
    BRANCH_ORDER.forEach(b=>{
      init[`BM_${b}`]={unalloc:d[`BM_${b}`]?.unalloc||0};
    });
    setLocalInputs(init);
    setFileInputs({});
    // Repair & Service is one company-wide figure per day (same store the
    // Repair tab reads/writes — kept as a plain number, not per-branch).
    const repKey=`emax_v5_repair_${year}_${month}`;
    (async()=>{
      try{
        const rd=await loadData(repKey)||{};
        setRepairInput(rd[selDay]||0);
      }catch{setRepairInput(0);}
    })();
    // Check which branches already have a report file uploaded for this date
    (async()=>{
      try{
        const idx=await loadData("emax_v5_pdf_index")||[];
        const list=Array.isArray(idx)?idx:[];
        const entries=await Promise.all(list.map(k=>loadData(k).then(p=>({key:k,pdf:p}))));
        const found={};
        entries.forEach(e=>{if(e.pdf&&e.pdf.date===dateKey&&e.pdf.branch&&BRANCH_ORDER.includes(e.pdf.branch))found[e.pdf.branch]={name:e.pdf.name,key:e.key};});
        setExistingPdf(found);
      }catch{setExistingPdf({});}
    })();
  },[selDay,month,year]);

  const set=(id,field,val)=>setLocalInputs(p=>({...p,[id]:{...p[id],[field]:parseFloat(val)||0}}));
  const setFile=(branch,file)=>setFileInputs(p=>({...p,[branch]:file}));

  const save=async()=>{
    setSaving(true);
    const latest=(await loadData(recordsKey))||records;
    const nr={...latest};
    if(!nr[dateKey])nr[dateKey]={};
    visibleSRs.forEach(sr=>{
      if(!nr[dateKey][sr.id])nr[dateKey][sr.id]={walkin:0,aeon:0,repair:0};
      nr[dateKey][sr.id].walkin=localInputs[sr.id]?.walkin||0;
      nr[dateKey][sr.id].aeon=localInputs[sr.id]?.aeon||0;
    });
    BRANCH_ORDER.forEach(b=>{
      const bmKey=`BM_${b}`;
      if(!nr[dateKey][bmKey])nr[dateKey][bmKey]={walkin:0,aeon:0,unalloc:0};
      nr[dateKey][bmKey].unalloc=localInputs[bmKey]?.unalloc||0;
    });
    await saveData(recordsKey,nr);
    // Auto-snapshot current SR statuses for this month
    const snapKey=`emax_v5_status_${year}_${month}`;
    const existingSnap=await loadData(snapKey)||{};
    srList.forEach(sr=>{if(!existingSnap[sr.id])existingSnap[sr.id]={status:sr.status,active:true};});
    await saveData(snapKey,existingSnap);
    // Repair — single company-wide figure for this day
    const repairStoreKey=`emax_v5_repair_${year}_${month}`;
    try{
      const rd=await loadData(repairStoreKey)||{};
      if(repairInput>0)rd[selDay]=repairInput; else delete rd[selDay];
      await saveData(repairStoreKey,rd);
      if(onRepairSave)onRepairSave();
    }catch{}
    // Report files — one PDF per branch for this date, staged in fileInputs.
    // Reuses the exact same storage the Monthly Report's "AEON Profit Reports"
    // downloads already read from, so anything uploaded here shows up there.
    const branchesWithFiles=Object.keys(fileInputs).filter(b=>fileInputs[b]);
    if(branchesWithFiles.length){
      try{
        const idx=await loadData("emax_v5_pdf_index")||[];
        const idxArr=Array.isArray(idx)?idx:[];
        for(const b of branchesWithFiles){
          const file=fileInputs[b];
          const b64=await fileToB64(file);
          const pdfKey=`emax_v5_pdf_${b}_${dateKey.replace(/\//g,"_")}_${Date.now()}`;
          await saveData(pdfKey,{name:file.name,date:dateKey,b64,branch:b});
          if(!idxArr.includes(pdfKey))idxArr.push(pdfKey);
        }
        await saveData("emax_v5_pdf_index",[...new Set(idxArr)]);
      }catch(e){console.error("Report file upload failed:",e);}
    }
    setRecords(nr);setSaving(false);setSaved(true);setFileInputs({});
    setTimeout(()=>setSaved(false),2000);
  };

  // NumInput keeps own string state so typing is smooth (no float re-parse mid-keystroke)
  const NumInput=({value,onChange,accent="#E4EAF2"})=>{
    const [str,setStr]=useState(value===0?"":String(value));
    // Sync if parent value changes (e.g. switching day)
    const prev=useRef(value);
    useEffect(()=>{
      if(prev.current!==value){
        prev.current=value;
        setStr(value===0?"":String(value));  // negative values: String(-15.51) = "-15.51"
      }
    },[value]);
    return <input type="number" step="0.01"
      value={str}
      onChange={e=>{setStr(e.target.value);}}
      onBlur={e=>{
        const v=isNaN(parseFloat(e.target.value))?0:parseFloat(e.target.value);
        prev.current=v;
        setStr(v===0?"":String(v));
        onChange(String(v));
        e.target.style.borderColor=v>0?"#F5A623":accent;
        e.target.style.background=v>0?"#FFFBEB":"#F7F9FC";
        e.target.style.boxShadow="none";
      }}
      placeholder="0.00"
      style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${value>0?"#F5A623":accent}`,borderRadius:7,fontSize:12,
        outline:"none",textAlign:"right",fontFamily:"Inter,sans-serif",
        background:value>0?"#FFFBEB":"#F7F9FC"}}
      onFocus={e=>{e.target.style.borderColor="#1E6FDB";e.target.style.background="#fff";e.target.style.boxShadow="0 0 0 3px rgba(30,111,219,.1)";}}
    />;
  };

  const branchWalkinTotal=(b)=>visibleSRs.filter(s=>s.branch===b).reduce((s,sr)=>s+(localInputs[sr.id]?.walkin||0),0)+(localInputs[`BM_${b}`]?.unalloc||0);
  const branchInvoiceTotal=(b)=>visibleSRs.filter(s=>s.branch===b).reduce((s,sr)=>s+(localInputs[sr.id]?.aeon||0),0);
  const branchDayTotal=(b)=>branchWalkinTotal(b)+branchInvoiceTotal(b);
  const companyDayTotal=BRANCH_ORDER.reduce((s,b)=>s+branchDayTotal(b),0);
  const companyWalkinTotal=BRANCH_ORDER.reduce((s,b)=>s+branchWalkinTotal(b),0);
  const companyInvoiceTotal=BRANCH_ORDER.reduce((s,b)=>s+branchInvoiceTotal(b),0);

  const TH=(label,color="rgba(255,255,255,.7)")=>(
    <th style={{padding:"10px 14px",fontWeight:700,fontSize:10,color,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap",textAlign:label==="Walk In (RM)"||label==="Invoice (RM)"||label==="Day Total"?"right":"left"}}>{label}</th>
  );

  return <div className="fade-in">
    {/* Header */}
    <div style={{background:"#0A1628",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div>
        <h2 style={{fontWeight:800,fontSize:14,color:"#fff",margin:0}}>Daily Entry — All Branches</h2>
        <p style={{fontSize:11,color:"rgba(255,255,255,.45)",margin:0,marginTop:2}}>Enter every branch's figures for one date, then save once — auto-posts to Monthly Report</p>
      </div>
      <button onClick={save} disabled={saving}
        style={{padding:"9px 24px",border:"none",borderRadius:8,cursor:saving?"wait":"pointer",fontWeight:700,fontSize:13,fontFamily:"Inter,sans-serif",
          background:saved?"#00C896":"linear-gradient(135deg,#1E6FDB,#2D85F0)",color:"#fff",transition:"all .2s"}}>
        {saved?"Saved!":saving?"Saving...":"Save All to Monthly Report"}
      </button>
    </div>

    {/* Day selector */}
    <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}>
      <div>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Date</label>
        <select value={selDay} onChange={e=>setSelDay(Number(e.target.value))} className="input select" style={{width:"auto",minWidth:130,fontSize:13}}>
          {days.map(d=><option key={d} value={d}>{d}/{month}/{year}</option>)}
        </select>
      </div>
      {/* Quick jump to a branch section further down the page */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {BRANCH_ORDER.map(b=>(
          <a key={b} href={`#daily-entry-${b}`} style={{padding:"6px 12px",borderRadius:6,fontWeight:700,fontSize:11,fontFamily:"Inter,sans-serif",
            background:"#fff",color:"#4A5568",outline:"1px solid #E4EAF2",textDecoration:"none",display:"inline-block"}}>
            {b}
          </a>
        ))}
      </div>
    </div>

    {/* Company-wide day total */}
    <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 14px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,fontSize:12}}>
      <span style={{color:"#1E40AF",fontWeight:600}}>Company Day Total — {selDay}/{month}/{year}</span>
      <div style={{display:"flex",gap:18,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{color:"#60AAFF",fontWeight:700}}>Walk In: {fRM(companyWalkinTotal)}</span>
        <span style={{color:"#7C3AED",fontWeight:700}}>Invoice: {fRM(companyInvoiceTotal)}</span>
        <span style={{fontWeight:800,color:"#1E6FDB",fontSize:14}}>{fRM(companyDayTotal)}</span>
      </div>
    </div>

    {/* One section per branch */}
    {BRANCH_ORDER.map(b=>{
      const bSRs=visibleSRs.filter(s=>s.branch===b);
      const dayTotal=branchDayTotal(b);
      const wiTotal=branchWalkinTotal(b);
      const invTotal=branchInvoiceTotal(b);
      return <div key={b} id={`daily-entry-${b}`} style={{marginBottom:24,scrollMarginTop:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
          <div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>{b} — {branchMeta[b]?.name||b}</div>
          <div style={{display:"flex",gap:14,alignItems:"center",fontSize:11,flexWrap:"wrap"}}>
            <span style={{color:"#60AAFF",fontWeight:700}}>Walk In: {fRM(wiTotal)}</span>
            <span style={{color:"#7C3AED",fontWeight:700}}>Invoice: {fRM(invTotal)}</span>
            <span style={{fontSize:12,fontWeight:800,color:dayTotal>0?"#1E6FDB":"#8A96A8"}}>{fRM(dayTotal)}</span>
          </div>
        </div>
        <div className="card" style={{overflow:"hidden"}}>
          {/* Horizontal scroll wrapper — table is wider than mobile screens */}
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:640}}>
            <thead>
              <tr style={{background:"#0A1628"}}>
                {TH("SR / Entry")}
                {TH("Type")}
                {TH("Walk In (RM)","#60AAFF")}
                {TH("Invoice (RM)","#A78BFA")}
                {TH("Day Total")}
              </tr>
            </thead>
            <tbody>
              {bSRs.length===0&&<tr><td colSpan={5} style={{padding:"14px 16px",color:"#8A96A8",fontSize:12}}>No active SRs for {b} this month.</td></tr>}
              {bSRs.map((sr,i)=>{
                const wi=localInputs[sr.id]?.walkin||0;
                const ae=localInputs[sr.id]?.aeon||0;
                const dt=wi+ae;
                return <tr key={sr.id} style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#F7F9FC"}}>
                  <td style={{padding:"8px 16px"}}>
                    <div style={{fontWeight:700,color:"#0A1628"}}>{sr.canon}</div>
                    <div style={{fontSize:10,color:"#8A96A8",marginTop:1}}><StatusTag status={sr.status}/></div>
                  </td>
                  <td style={{padding:"8px 16px"}}>
                    <TypeTag type={sr.type}/>
                  </td>
                  <td style={{padding:"6px 10px"}}>
                    <NumInput value={wi} onChange={v=>set(sr.id,"walkin",v)}/>
                  </td>
                  <td style={{padding:"6px 10px"}}>
                    <NumInput value={ae} onChange={v=>set(sr.id,"aeon",v)}/>
                  </td>
                  <td style={{padding:"8px 14px",textAlign:"right",fontWeight:dt>0?700:400,color:dt>0?"#0A1628":"#CDD5E0"}}>{dt>0?fRM(dt):"—"}</td>
                </tr>;
              })}

              {/* BM Unallocated */}
              <tr style={{borderBottom:"2px solid #E4EAF2",background:"#F0FDF4"}}>
                <td style={{padding:"8px 16px"}}>
                  <div style={{fontWeight:700,color:"#052E20"}}>Branch Manager</div>
                  <div style={{fontSize:10,color:"#166534",marginTop:1}}>Unallocated Profit</div>
                </td>
                <td style={{padding:"8px 16px"}}>
                  <span style={{background:"#DCFCE7",color:"#15803D",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600}}>BM</span>
                </td>
                <td style={{padding:"6px 10px"}}>
                  <NumInput value={localInputs[`BM_${b}`]?.unalloc||0} onChange={v=>set(`BM_${b}`,"unalloc",v)} accent="#BBF7D0"/>
                </td>
                <td style={{padding:"8px 14px",textAlign:"right",color:"#CDD5E0"}}>—</td>
                <td style={{padding:"8px 14px",textAlign:"right",fontWeight:700,color:"#052E20"}}>
                  {(localInputs[`BM_${b}`]?.unalloc||0)>0?fRM(localInputs[`BM_${b}`]?.unalloc||0):"—"}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{background:"#0A1628",fontSize:12}}>
                <td colSpan={2} style={{padding:"10px 16px",fontWeight:600,color:"rgba(255,255,255,.6)"}}>Branch Total</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:"rgba(255,255,255,.5)",fontSize:11}}>{fRM(bSRs.reduce((s,sr)=>s+(localInputs[sr.id]?.walkin||0),0)+(localInputs[`BM_${b}`]?.unalloc||0))}</td>
                <td style={{padding:"10px 14px",textAlign:"right",color:"rgba(255,255,255,.5)",fontSize:11}}>{fRM(bSRs.reduce((s,sr)=>s+(localInputs[sr.id]?.aeon||0),0))}</td>
                <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#fff"}}>{fRM(dayTotal)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
        {/* Per-branch report file upload — posted to storage when Save All is clicked */}
        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",padding:"8px 2px"}}>
          <label style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",border:`1.5px solid ${fileInputs[b]?"#0A1628":"#E4EAF2"}`,borderRadius:7,cursor:"pointer",background:"#fff",fontSize:11,color:fileInputs[b]?"#0A1628":"#8A96A8"}}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>setFile(b,e.target.files[0]||null)}/>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {fileInputs[b]?fileInputs[b].name:"Attach report file (PDF/image)"}
          </label>
          {fileInputs[b]&&<span style={{fontSize:10,color:"#8A96A8"}}>Will upload when you click "Save All to Monthly Report"</span>}
          {!fileInputs[b]&&existingPdf[b]&&<span style={{fontSize:10,color:"#15803D",fontWeight:600}}>{existingPdf[b].name} already uploaded for this date</span>}
        </div>
      </div>;
    })}

    {/* Repair & Service — one company-wide figure for this day, not per branch */}
    <div className="card" style={{overflow:"hidden",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#FAF5FF"}}>
        <div>
          <div style={{fontWeight:700,color:"#3D1A78",fontSize:13}}>Repair & Service</div>
          <div style={{fontSize:10,color:"#7C3AED",marginTop:1}}>Company-wide for this date · Excluded from targets</div>
        </div>
        <div style={{width:160}}>
          <NumInput value={repairInput} onChange={v=>setRepairInput(parseFloat(v)||0)} accent="#DDD6FE"/>
        </div>
      </div>
    </div>
    <p style={{fontSize:11,color:"#8A96A8",marginTop:10,textAlign:"center"}}>Click "Save All to Monthly Report" to post every branch's figures for this date at once. Data appears instantly in Overview and Monthly Report.</p>
  </div>;
}


// ─── MAIN APP ──────────────────────────────────────────────
// ─── PDF DOWNLOADS ───────────────────────────────────────────
function PdfDownloads({month,year,branch,allowDelete=false}){
  const [pdfList,setPdfList]=useState([]);
  const refresh=()=>{
    loadData("emax_v5_pdf_index").then(idx=>{
      const list=Array.isArray(idx)?idx:[];
      Promise.all(list.map(k=>loadData(k).then(p=>({key:k,pdf:p})))).then(entries=>{
        const valid=entries.filter(e=>e.pdf&&e.pdf.date&&e.pdf.b64);
        let filtered=valid.filter(e=>{const parts=e.pdf.date.split("/");return parseInt(parts[1])===month&&parseInt(parts[2])===year;});
        if(branch)filtered=filtered.filter(e=>e.pdf.branch===branch);
        const seen=new Set();
        const deduped=filtered.filter(e=>{const k=e.pdf.name||e.pdf.date;if(seen.has(k))return false;seen.add(k);return true;});
        setPdfList(deduped);
      });
    });
  };
  useEffect(refresh,[month,year,branch]);
  const handleDelete=async(key)=>{
    if(!confirm("Delete this uploaded PDF? This cannot be undone."))return;
    await saveData(key,null);
    const idx=await loadData("emax_v5_pdf_index");
    const list=Array.isArray(idx)?idx:[];
    await saveData("emax_v5_pdf_index",list.filter(k=>k!==key));
    refresh();
  };
  if(!pdfList.length)return null;
  return <div style={{marginTop:16,padding:"14px 16px",background:"#fff",border:"1px solid #E4EAF2",borderRadius:10}}>
    <div style={{fontSize:11,fontWeight:700,color:"#0A1628",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>AEON Profit Reports{branch?` — ${branch}`:""} — Click to Download</div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      {pdfList.map((entry,idx)=>(
        <div key={idx} style={{display:"inline-flex",alignItems:"center",gap:0,borderRadius:7,overflow:"hidden"}}>
          <a href={`data:application/pdf;base64,${entry.pdf.b64}`} download={entry.pdf.name||`AEON_${entry.pdf.date}.pdf`}
            style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",background:"#0A1628",color:"#fff",fontSize:12,fontWeight:600,textDecoration:"none"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {entry.pdf.name||`AEON ${entry.pdf.date}`}
          </a>
          {allowDelete&&<button onClick={()=>handleDelete(entry.key)} title="Delete this PDF"
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:30,alignSelf:"stretch",background:"#F0354B",color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:700}}>
            ×
          </button>}
        </div>
      ))}
    </div>
  </div>;
}

function StatusHistoryModal({srList,branchMeta,statusHistory,onClose,initialPerson,onDeleteStatusEntry}){
  const isBM=initialPerson&&initialPerson.startsWith("BM_");
  const branchId=isBM?initialPerson.replace("BM_",""):null;
  const person=isBM
    ?{name:branchMeta[branchId]?.manager||branchId,role:`${branchId} — Branch Manager`}
    :(()=>{const sr=srList.find(s=>s.id===initialPerson);return sr?{name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}:null;})();
  const currentStatus=isBM?branchMeta[branchId]?.mStatus:srList.find(s=>s.id===initialPerson)?.status;
  const raw=statusHistory[initialPerson]||[];
  // Keep original indices for deletion, display reversed
  const history=raw.map((h,origIdx)=>({...h,origIdx})).reverse();

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
            <div key={i} style={{padding:"10px 0",borderBottom:i<history.length-1?"1px solid #F0F2F5":"none",display:"flex",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#0A1628"}}>{h.status}</span>
                  <span style={{fontSize:10,color:"#8A96A8"}}>{new Date(h.date).toLocaleString("en-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                </div>
                <div style={{fontSize:12,color:"#5A6472",marginTop:3}}>{h.note}</div>
              </div>
              {onDeleteStatusEntry&&<button onClick={()=>onDeleteStatusEntry(initialPerson,h.origIdx)} style={{flexShrink:0,padding:"3px 8px",fontSize:10,fontWeight:700,border:"1px solid #FECACA",borderRadius:5,background:"#FEF2F2",color:"#B91C1C",cursor:"pointer",fontFamily:"Inter,sans-serif",marginTop:2}}>×</button>}
            </div>
          ))
        }
      </div>
    </div>
  </div>;
}

function PointsHistoryModal({srList,branchMeta,rewardBalances,rewardHistory,onClose,initialPerson,onDeletePointsEntry}){
  const isBM=initialPerson&&initialPerson.startsWith("BM_");
  const branchId=isBM?initialPerson.replace("BM_",""):null;
  const person=isBM
    ?{name:branchMeta[branchId]?.manager||branchId,role:`${branchId} — Branch Manager`}
    :(()=>{const sr=srList.find(s=>s.id===initialPerson);return sr?{name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}:null;})();
  const balance=rewardBalances[initialPerson]?.balance||0;
  const rawHistory=rewardHistory[initialPerson]||[];
  // Rename "Manual balance adjustment" entries to "Opening balance as at 31/05/2026", track origIdx
  const history=rawHistory.map((h,origIdx)=>({
    ...h,
    origIdx,
    note:h.type==="adjustment"&&h.note==="Manual balance adjustment"?"Opening balance as at 31/05/2026":h.note
  })).reverse();

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
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:i<history.length-1?"1px solid #F0F2F5":"none"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#0A1628"}}>{h.note}</div>
                  <div style={{fontSize:13,fontWeight:800,color:h.amount>=0?"#00C896":"#F0354B",whiteSpace:"nowrap"}}>
                    {h.amount>=0?"+":""}{h.amount.toLocaleString()} pts
                  </div>
                </div>
                <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>{new Date(h.date).toLocaleString("en-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
              {onDeletePointsEntry&&<button onClick={()=>onDeletePointsEntry(initialPerson,h.origIdx,h.amount)} style={{flexShrink:0,padding:"3px 8px",fontSize:10,fontWeight:700,border:"1px solid #FECACA",borderRadius:5,background:"#FEF2F2",color:"#B91C1C",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>×</button>}
            </div>
          ))
        }
      </div>
    </div>
  </div>;
}

export default function App(){
  // Logged-in user's email — used only for edit-log attribution (Daily
  // Sales Report / Order Tracking), so an edit shows the specific role
  // relevant to the action rather than a generic capability-based guess.
  const [currentEmail,setCurrentEmail]=useState(null);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setCurrentEmail(data?.session?.user?.email||null));},[]);
  // Month/year selection — default to current month
  const now = new Date();
  const [selMonth,setSelMonth]     = useState(now.getMonth()+1);
  const [selYear,setSelYear]       = useState(now.getFullYear());
  const month = selMonth;
  const year  = selYear;
  const days       = Array.from({length:daysInMonth(month,year)},(_,i)=>i+1);
  // Month-specific storage keys
  const recordsKey = `emax_v5_records_${year}_${month}`;
  const repairKey  = `emax_v5_repair_${year}_${month}`;
  const [records,setRecords]       = useState({});
  const [targets,setTargets]       = useState({bm:{},bmBonus:{},sr:{}});
  const [srList,setSrList]         = useState(DEFAULT_SR);
  const [branchMeta,setBranchMeta] = useState(DEFAULT_BRANCH_META);
  const [loading,setLoading]       = useState(true);
  const [tab,setTabRaw]             = useState(()=>{
    const h=window.location.hash.replace("#","");
    return ["overview","rankings","points","report","daily","repair","rto","orders","purchaseOrder","dailySales","jclApplications","chaileaseApplications","dailyPayment","stockProfit","stockTransfer"].includes(h)?h:"overview";
  });
  const setTab=(t)=>{setTabRaw(t);window.location.hash=t;};
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [showPointsModal,setShowPointsModal] = useState(false);
  const [showStatusHistoryModal,setShowStatusHistoryModal] = useState(false);
  const [publishedUntil,setPublishedUntil] = useState(null);
  const [showDailyReport,setShowDailyReport] = useState(false);
  const [srTypeOverrides,setSrTypeOverrides] = useState({});
  const [statusModalPerson,setStatusModalPerson] = useState(null);
  const [pointsModalPerson,setPointsModalPerson] = useState(null);
  const [selBranch,setSelBranch]   = useState("KM");
  const [selStartDay,setSelStartDay] = useState(1);
  const [selEndDay,setSelEndDay]   = useState(()=>daysInMonth(new Date().getMonth()+1,new Date().getFullYear()));
  const periodDays = days.filter(d=>d>=selStartDay&&d<=selEndDay);
  // Last day with any records entered (for ranking period label)
  // Find the last day in the month where ANY branch/SR has a non-zero walkin/aeon/unalloc value.
  // Days after this (even if a record key exists with all-zero values) are treated as "not yet filled".
  const lastDataDay = useMemo(()=>{
    for(let d=days[days.length-1];d>=1;d--){
      const k=`${d}/${month}/${year}`;
      const day=records[k];
      if(day){
        const hasValue=Object.values(day).some(entry=>(entry?.walkin||0)!==0||(entry?.aeon||0)!==0||(entry?.unalloc||0)!==0);
        if(hasValue) return d;
      }
    }
    return null;
  },[records,days,month,year]);
  const pad2=(n)=>String(n).padStart(2,"0");
  const rankingPeriod = lastDataDay ? `1/${month}/${year} — ${lastDataDay}/${month}/${year}` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`;
  const [repairRefresh,setRepairRefresh] = useState(0);
  const [rewardBalances,setRewardBalances] = useState({});
  const [rewardHistory,setRewardHistory] = useState({});
  const [statusHistory,setStatusHistory] = useState({});
  const [lockedMonths,setLockedMonths] = useState({});
  const [showTargetModal,setShowTargetModal] = useState(false);
  const [showSRModal,setShowSRModal]         = useState(false);
  const [printBranch,setPrintBranch]         = useState(null);
  const summaryRef = useRef();


  useEffect(()=>{
    setLoading(true);
    setRecords({});
    setSelStartDay(1);
    setSelEndDay(daysInMonth(selMonth,selYear));
    const snapKey=`emax_v5_status_${selYear}_${selMonth}`;
    const monthKey=`${selYear}_${selMonth}`;
    const targetKey=`emax_v5_targets_${selYear}_${selMonth}`;
    const prevM=selMonth===1?12:selMonth-1,prevY=selMonth===1?selYear-1:selYear;
    const prevTargetKey=`emax_v5_targets_${prevY}_${prevM}`;
    const publishKey=`emax_v5_published_${selYear}_${selMonth}`;
    const typeKey=`emax_v5_sr_types_${selYear}_${selMonth}`;
    Promise.all([loadData(recordsKey),loadData(targetKey),loadData(prevTargetKey),loadData(SR_KEY),loadData(BM_KEY),loadData(snapKey),loadData("emax_v5_reward_balance"),loadData("emax_v5_locked_months"),loadData("emax_v5_reward_history"),loadData("emax_v5_status_history"),loadData(publishKey),loadData(typeKey)]).then(([r,t,tPrev,srData,bmData,snap,rb,lm,rh,sh,pub,srTypes])=>{
      setRecords(r||{});
      const baseSR=(srData&&Array.isArray(srData)&&srData.length>0)?srData:DEFAULT_SR;
      // Overlay historical status snapshot if viewing a past month
      // Only apply status snapshot for PAST months — for the current month,
      // the sr_list itself is the source of truth (the snapshot could be stale)
      const now=new Date();
      const isCurrentMonth=(selMonth===now.getMonth()+1&&selYear===now.getFullYear());
      const applyTypes=(list)=>list.map(sr=>srTypes&&srTypes[sr.id]?{...sr,type:srTypes[sr.id]}:{...sr});
      if(!isCurrentMonth&&snap&&Object.keys(snap).length>0){
        const merged=baseSR.map(sr=>snap[sr.id]?{...sr,status:snap[sr.id].status,active:snap[sr.id].active!==false}:{...sr});
        setSrList(applyTypes(merged.filter(sr=>sr.active!==false)));
      } else {
        setSrList(applyTypes(baseSR));
      }
      if(bmData&&Object.keys(bmData).length>0){
        const merged0={...DEFAULT_BRANCH_META,...bmData};
        Object.keys(DEFAULT_BRANCH_META).forEach(b=>{merged0[b]={...DEFAULT_BRANCH_META[b],...merged0[b],name:b==="SDK"?DEFAULT_BRANCH_META[b]?.name:(merged0[b]?.name||DEFAULT_BRANCH_META[b]?.name)};});
        setBranchMeta(merged0);
      }
      // Use this month's saved targets; if none yet, fall back to previous month as starting point
      const tUse=t||(tPrev)||null;
      if(tUse&&tUse.bm){
        setTargets({bm:{...DEFAULT_TARGETS.bm,...tUse.bm},bmBonus:{...DEFAULT_TARGETS.bmBonus,...(tUse.bmBonus||{})},bmBasic:{...DEFAULT_TARGETS.bmBasic,...(tUse.bmBasic||{})},sr:{...DEFAULT_TARGETS.sr,...tUse.sr},bmName:tUse.bmName||{}});
      } else setTargets(DEFAULT_TARGETS);
      // Always rebuild branchMeta from global base + this month's bmName/bmStatus overrides only
      // Never let the global branchMeta get overwritten by monthly changes
      {
        const baseData=bmData&&Object.keys(bmData).length>0?{...DEFAULT_BRANCH_META,...bmData}:{...DEFAULT_BRANCH_META};
        const mergedMeta={};
        const monthBmName=(tUse&&tUse.bmName)||{};
        const monthBmStatus=(tUse&&tUse.bmStatus)||{};
        BRANCH_ORDER.forEach(b=>{mergedMeta[b]={
          ...baseData[b],
          name:b==="SDK"?DEFAULT_BRANCH_META[b]?.name:(baseData[b]?.name||DEFAULT_BRANCH_META[b]?.name),
          manager:monthBmName[b]||baseData[b]?.manager,
          mStatus:monthBmStatus[b]||baseData[b]?.mStatus,
        };});
        // SDK (EC SDK) is a pickup-only location, not a real branch — kept out
        // of BRANCH_ORDER entirely so it never appears in Branch Performance,
        // targets, BM, or SR. It still needs a name for the Order page's
        // Pick Up Branch dropdown, so it's added here directly.
        mergedMeta.SDK={name:DEFAULT_BRANCH_META.SDK?.name};
        setBranchMeta(mergedMeta);
      }
      setRewardBalances(rb||{});
      setLockedMonths(lm||{});
      setRewardHistory(rh||{});
      setStatusHistory(sh||{});
      setPublishedUntil(pub||null);
      setSrTypeOverrides(srTypes||{});
      setLoading(false);
    });
  },[selMonth,selYear]);

  const handleEdit=async(dateKey,srId,field,value)=>{
    const latest=(await loadData(recordsKey))||records;
    const nr={...latest};
    if(!nr[dateKey])nr[dateKey]={};
    if(!nr[dateKey][srId])nr[dateKey][srId]={walkin:0,aeon:0,unalloc:0,repair:0};
    nr[dateKey][srId][field]=value;
    setRecords(nr);await saveData(recordsKey,nr);
  };

  // ─── REWARD POINTS: lock a branch's month, crediting all SR + BM earned points to balance ───
  const monthKeyStr=`${selYear}_${selMonth}`;
  const isBranchLocked=(branchId)=>!!lockedMonths[monthKeyStr]?.[branchId];
  // Delete a single employment status history entry
  const deleteStatusEntry=async(personId,origIdx)=>{
    const hist=[...(statusHistory[personId]||[])];
    hist.splice(origIdx,1);
    const newHist={...statusHistory,[personId]:hist};
    setStatusHistory(newHist);
    await saveData("emax_v5_status_history",newHist);
  };

  // Delete a single reward points history entry and adjust balance
  const deletePointsEntry=async(personId,origIdx,amount)=>{
    const hist=[...(rewardHistory[personId]||[])];
    hist.splice(origIdx,1);
    const newRH={...rewardHistory,[personId]:hist};
    setRewardHistory(newRH);
    await saveData("emax_v5_reward_history",newRH);
    // Adjust balance
    const cur=rewardBalances[personId]?.balance||0;
    const newBal=Math.max(0,cur-(amount||0));
    const newRB={...rewardBalances,[personId]:{...(rewardBalances[personId]||{}),balance:newBal}};
    setRewardBalances(newRB);
    await saveData("emax_v5_reward_balance",newRB);
  };

  const pointsAsOfFor=(_branchId)=>{
    const today=new Date();
    return `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  };

  // Returns true if this SR should appear in the monthly report for the given month/year
  // Resigned SRs only appear in the month they resigned (and all months before)
  const lockBranchMonth=async(branchId)=>{
    if(isBranchLocked(branchId)){alert("This branch's "+selMonth+"/"+selYear+" report is already locked.");return;}
    const bSRs=srList.filter(s=>s.branch===branchId&&!(s.status||'').toLowerCase().includes('resigned'));
    const bTarget=targets?.bm?.[branchId]||0,bTotal=fullMonthBranchTotals[branchId]?.total||0;
    const branchPct=pctN(bTotal,bTarget);
    const updates={...rewardBalances};
    const historyUpdates={...rewardHistory};
    const MONTHS_FULL=["January","February","March","April","May","June","July","August","September","October","November","December"];
    const noteMonth=`${MONTHS_FULL[selMonth-1]} ${selYear}`;

    // SR points + employment status P/F update
    const statusUpdates={...statusHistory};
    const updatedSRList=srList.map(sr=>{
      if(sr.branch!==branchId)return sr;
      const srTarget=targets?.sr?.[sr.id]?.target||0;
      let wi=0,ae=0;
      days.forEach(d=>{const k=`${d}/${selMonth}/${selYear}`;wi+=(records[k]?.[sr.id]?.walkin||0);ae+=(records[k]?.[sr.id]?.aeon||0);});
      const srTotal=wi+ae,srPct=pctN(srTotal,srTarget);
      const earned=calcRewardPoints(srPct,branchPct);
      const hist=historyUpdates[sr.id]||[];
      // Guard: don't double-credit if this month already has a credit entry
      const alreadyCredited=hist.some(h=>h.type==="credit"&&h.note&&h.note.startsWith(noteMonth));
      if(!alreadyCredited){
        const cur=updates[sr.id]||{balance:0,asOf:""};
        updates[sr.id]={...cur,balance:(cur.balance||0)+earned};
        historyUpdates[sr.id]=[...hist,{date:new Date().toISOString(),type:"credit",amount:earned,note:`${noteMonth} performance (${srPct.toFixed(1)}%)`}];
      }
      // Employment status: target hit -> P+1, not hit -> F+1 (skip Director/Resigned only)
      const ps=parseStatus(sr.status);
      if(ps.base==="Director"||ps.base==="Resigned")return sr;
      // If no target set, count as missed (F+1)
      const hit=srTarget>0&&srTotal>=srTarget;
      const newStatus=buildStatus(ps.base,hit?ps.p+1:ps.p,hit?ps.f:ps.f+1);
      const sHist=statusUpdates[sr.id]||[];
      const noteStr=srTarget>0
        ?`Auto-updated on lock: ${noteMonth} personal target ${hit?"hit":"missed"} (${srPct.toFixed(1)}%)`
        :`Auto-updated on lock: ${noteMonth} (no target set — counted as missed)`;
      statusUpdates[sr.id]=[...sHist,{date:new Date().toISOString(),status:newStatus,note:noteStr}];
      return{...sr,status:newStatus};
    });
    setSrList(updatedSRList);
    await saveData(SR_KEY,updatedSRList);

    // Save post-lock status as the NEXT month's opening snapshot.
    // e.g. locking June saves to July, so July report shows post-June statuses.
    const postLockSnap={};
    updatedSRList.forEach(sr=>{postLockSnap[sr.id]={status:sr.status,active:true};});
    const nextMonth=selMonth===12?1:selMonth+1;
    const nextYear=selMonth===12?selYear+1:selYear;
    await saveData(`emax_v5_status_${nextYear}_${nextMonth}`,postLockSnap);

    // BM points + employment status P/F update
    const bmEarned=calcRewardPoints(branchPct,branchPct);
    const bmKey=`BM_${branchId}`;
    const bmHist=historyUpdates[bmKey]||[];
    // Guard: don't double-credit BM if already credited this month
    const bmAlreadyCredited=bmHist.some(h=>h.type==="credit"&&h.note&&h.note.startsWith(noteMonth));
    if(!bmAlreadyCredited){
      const curBM=updates[bmKey]||{balance:0,asOf:""};
      updates[bmKey]={...curBM,balance:(curBM.balance||0)+bmEarned};
      historyUpdates[bmKey]=[...bmHist,{date:new Date().toISOString(),type:"credit",amount:bmEarned,note:`${noteMonth} branch performance (${branchPct.toFixed(1)}%)`}];
    }

    {
      const bmMeta=branchMeta[branchId]||{};
      const bps=parseStatus(bmMeta.mStatus);
      if(bps.base!=="Director"&&bps.base!=="Resigned"){
        const bmHit=bTarget>0&&bTotal>=bTarget;
        const newBMStatus=buildStatus(bps.base,bmHit?bps.p+1:bps.p,bmHit?bps.f:bps.f+1);
        const newBranchMeta={...branchMeta,[branchId]:{...bmMeta,mStatus:newBMStatus}};
        setBranchMeta(newBranchMeta);
        await saveData(BM_KEY,newBranchMeta);
        const bmStatusKey=`BM_${branchId}`;
        const bmSHist=statusUpdates[bmStatusKey]||[];
        const bmNoteStr=bTarget>0
          ?`Auto-updated on lock: ${noteMonth} branch target ${bmHit?"hit":"missed"} (${branchPct.toFixed(1)}%)`
          :`Auto-updated on lock: ${noteMonth} (no branch target set — counted as missed)`;
        statusUpdates[bmStatusKey]=[...bmSHist,{date:new Date().toISOString(),status:newBMStatus,note:bmNoteStr}];
        postLockSnap[`BM_${branchId}`]={status:newBMStatus};
        await saveData(`emax_v5_status_${nextYear}_${nextMonth}`,postLockSnap);
      }
    }

    setRewardBalances(updates);
    await saveData("emax_v5_reward_balance",updates);
    setRewardHistory(historyUpdates);
    await saveData("emax_v5_reward_history",historyUpdates);
    setStatusHistory(statusUpdates);
    await saveData("emax_v5_status_history",statusUpdates);
    const newLocked={...lockedMonths,[monthKeyStr]:{...(lockedMonths[monthKeyStr]||{}),[branchId]:true}};
    setLockedMonths(newLocked);
    await saveData("emax_v5_locked_months",newLocked);
    alert(`${branchId} — ${selMonth}/${selYear} locked. Reward points credited and employment status updated.`);
  };
  const unlockBranchMonth=async(branchId)=>{
    if(!isBranchLocked(branchId)){alert("This branch's "+selMonth+"/"+selYear+" report is not locked.");return;}
    if(!confirm(`Unlock ${branchId} for ${selMonth}/${selYear}? Points and employment status changes from this lock will be reversed.`))return;
    const MONTHS_FULL=["January","February","March","April","May","June","July","August","September","October","November","December"];
    const noteMonth=`${MONTHS_FULL[selMonth-1]} ${selYear}`;
    const updates={...rewardBalances};
    const historyUpdates={...rewardHistory};
    const statusUpdates={...statusHistory};

    // ── Reverse SR points and employment status ────────────────────────────
    const bSRs=srList.filter(s=>s.branch===branchId&&!(s.status||'').toLowerCase().includes('resigned'));
    const revertedSRList=srList.map(sr=>{
      if(sr.branch!==branchId)return sr;

      // Reverse reward points — remove the credit entry entirely so re-lock can credit cleanly
      const hist=(historyUpdates[sr.id]||[]);
      const lockCreditIdx=hist.findLastIndex(h=>h.type==="credit"&&h.note&&h.note.startsWith(noteMonth));
      if(lockCreditIdx>=0){
        const amt=hist[lockCreditIdx].amount||0;
        const cur=updates[sr.id]||{balance:0};
        updates[sr.id]={...cur,balance:Math.max(0,(cur.balance||0)-amt)};
        // Remove the credit entry (don't add a debit — clean slate for re-lock)
        historyUpdates[sr.id]=hist.filter((_,i)=>i!==lockCreditIdx);
      }

      // Reverse employment status — find the auto-lock entry and revert to status before it
      const sHist=statusUpdates[sr.id]||[];
      const lockEntryIdx=sHist.findLastIndex(h=>h.note&&h.note.includes(`Auto-updated on lock: ${noteMonth}`));
      if(lockEntryIdx>0){
        // Revert to the status recorded in the entry BEFORE the lock entry
        const prevStatus=sHist[lockEntryIdx-1].status;
        // Remove the lock entry from history
        const cleanedHist=sHist.filter((_,i)=>i!==lockEntryIdx);
        statusUpdates[sr.id]=cleanedHist;
        return{...sr,status:prevStatus};
      } else if(lockEntryIdx===0){
        // Lock was the very first entry — remove it and revert to status from sr's pre-lock state
        // We reverse the +1 that was applied
        const lockedStatus=sHist[0].status;
        const ps=parseStatus(lockedStatus);
        // Determine if it was a hit or miss from the note
        const wasHit=sHist[0].note&&sHist[0].note.includes("target hit");
        const prevStatus=buildStatus(ps.base,wasHit?ps.p-1:ps.p,wasHit?ps.f:ps.f-1);
        statusUpdates[sr.id]=sHist.filter((_,i)=>i!==0);
        return{...sr,status:prevStatus};
      }
      return sr;
    });

    // ── Reverse BM points and employment status ────────────────────────────
    const bmKey=`BM_${branchId}`;
    const bmHist=(historyUpdates[bmKey]||[]);
    const bmLockCreditIdx=bmHist.findLastIndex(h=>h.type==="credit"&&h.note&&h.note.startsWith(noteMonth));
    if(bmLockCreditIdx>=0){
      const amt=bmHist[bmLockCreditIdx].amount||0;
      const curBM=updates[bmKey]||{balance:0};
      updates[bmKey]={...curBM,balance:Math.max(0,(curBM.balance||0)-amt)};
      // Remove the credit entry so re-lock credits cleanly
      historyUpdates[bmKey]=bmHist.filter((_,i)=>i!==bmLockCreditIdx);
    }

    const bmSHist=statusUpdates[bmKey]||[];
    const bmLockIdx=bmSHist.findLastIndex(h=>h.note&&h.note.includes(`Auto-updated on lock: ${noteMonth}`));
    let revertedBMeta={...branchMeta};
    if(bmLockIdx>=0){
      let prevBMStatus;
      if(bmLockIdx>0){
        prevBMStatus=bmSHist[bmLockIdx-1].status;
      } else {
        const lockedBMStatus=bmSHist[0].status;
        const bps=parseStatus(lockedBMStatus);
        const wasHit=bmSHist[0].note&&bmSHist[0].note.includes("target hit");
        prevBMStatus=buildStatus(bps.base,wasHit?bps.p-1:bps.p,wasHit?bps.f:bps.f-1);
      }
      statusUpdates[bmKey]=bmSHist.filter((_,i)=>i!==bmLockIdx);
      revertedBMeta={...branchMeta,[branchId]:{...branchMeta[branchId],mStatus:prevBMStatus}};
      setBranchMeta(revertedBMeta);
      await saveData(BM_KEY,revertedBMeta);
    }

    // Save all reversals
    setSrList(revertedSRList);
    await saveData(SR_KEY,revertedSRList);
    setRewardBalances(updates);
    await saveData("emax_v5_reward_balance",updates);
    setRewardHistory(historyUpdates);
    await saveData("emax_v5_reward_history",historyUpdates);
    setStatusHistory(statusUpdates);
    await saveData("emax_v5_status_history",statusUpdates);

    // Remove next month's opening snapshot created by this lock
    const nextMonthU=selMonth===12?1:selMonth+1;
    const nextYearU=selMonth===12?selYear+1:selYear;
    await saveData(`emax_v5_status_${nextYearU}_${nextMonthU}`,null);

    const newLocked={...lockedMonths};
    if(newLocked[monthKeyStr]){
      delete newLocked[monthKeyStr][branchId];
      if(Object.keys(newLocked[monthKeyStr]).length===0)delete newLocked[monthKeyStr];
    }
    setLockedMonths(newLocked);
    await saveData("emax_v5_locked_months",newLocked);
    alert(`${branchId} — ${selMonth}/${selYear} unlocked. Points and status changes have been fully reversed.`);
  };

  // Manually adjust a person's points balance by +/- delta, with a required description.
  // This appends a history entry instead of overwriting the balance.
  // Migrates one month's worth of daily sales records from oldId to newId.
  // Reused both by the automatic current+previous-month migration inside
  // renameSRId, and by the standalone "Fix Records" repair tool below for
  // manually fixing months an earlier rename didn't reach.
  const migrateRecordsForMonth=async(oldId,newId,year,month)=>{
    const key=`emax_v5_records_${year}_${month}`;
    const monthRecords=await loadData(key);
    if(!monthRecords)return false;
    let changed=false;
    const updated={...monthRecords};
    Object.keys(updated).forEach(dateKey=>{
      const day=updated[dateKey];
      if(day&&day[oldId]!==undefined){
        updated[dateKey]={...day,[newId]:day[oldId]};
        delete updated[dateKey][oldId];
        changed=true;
      }
    });
    if(changed){
      await saveData(key,updated);
      if(Number(year)===selYear&&Number(month)===selMonth)setRecords(updated);
    }
    return changed;
  };
  const adjustBalance=async(personId,delta,note)=>{
    const d=Number(delta)||0;
    if(d===0)return;
    const prevBalance=rewardBalances[personId]?.balance||0;
    const newBalance=prevBalance+d;
    const updates={...rewardBalances,[personId]:{...(rewardBalances[personId]||{}),balance:newBalance}};
    setRewardBalances(updates);
    await saveData("emax_v5_reward_balance",updates);
    const hist=rewardHistory[personId]||[];
    const newHist={...rewardHistory,[personId]:[...hist,{date:new Date().toISOString(),type:"adjustment",amount:d,note:note||"Manual adjustment"}]};
    setRewardHistory(newHist);
    await saveData("emax_v5_reward_history",newHist);
  };
  // Renames an SR's ID everywhere this dashboard itself tracks it by ID —
  // the SR list, their points balance, points history, status history, and
  // their daily sales records (Monthly Report / Overview / Rankings data)
  // for the current and previous month specifically.
  // Does NOT (and can't from here) touch: sales records or Type overrides
  // from any month further back than last month — those are stored per
  // month/year and would need every historical month re-fetched and
  // re-saved individually; or the Order Tracking system's salesAgentId on
  // already-submitted orders, which lives in a separate Supabase table this
  // dashboard doesn't write to. Historical orders there will keep showing
  // the old ID/name after a rename.
  const renameSRId=async(oldId,newId,allowOverride=false)=>{
    if(!newId||newId===oldId)return{ok:false,reason:"unchanged"};
    const conflict=srList.find(s=>s.id===newId&&s.id!==oldId);
    if(conflict&&!allowOverride)return{ok:false,reason:"duplicate",conflictName:conflict.canon};
    const renaming=srList.find(s=>s.id===oldId);
    // If overriding onto an ID that already belongs to another SR record,
    // that record represents the SAME agent going forward (per Sophia: one
    // agent, one ID across every activity) — drop the duplicate entry rather
    // than end up with two SR records sharing one ID.
    const newSRList=srList.filter(s=>!(conflict&&s.id===newId)).map(s=>s.id===oldId?{...s,id:newId}:s);
    setSrList(newSRList);
    await saveData(SR_KEY,newSRList);
    if(rewardBalances[oldId]!==undefined){
      const rb={...rewardBalances};
      rb[newId]=rb[oldId];
      delete rb[oldId];
      setRewardBalances(rb);
      await saveData("emax_v5_reward_balance",rb);
    }
    if(rewardHistory[oldId]!==undefined){
      const rh={...rewardHistory};
      rh[newId]=rh[oldId];
      delete rh[oldId];
      setRewardHistory(rh);
      await saveData("emax_v5_reward_history",rh);
    }
    if(statusHistory[oldId]!==undefined){
      const sh={...statusHistory};
      sh[newId]=sh[oldId];
      delete sh[oldId];
      setStatusHistory(sh);
      await saveData("emax_v5_status_history",sh);
    }
    // Current month's Type override (Online/Offline), if any — same caveat
    // as above, only THIS loaded month is migrated, not every past month.
    const curTypeKey=`emax_v5_sr_types_${selYear}_${selMonth}`;
    const curTypes=await loadData(curTypeKey);
    if(curTypes&&curTypes[oldId]!==undefined){
      const t={...curTypes};
      t[newId]=t[oldId];
      delete t[oldId];
      await saveData(curTypeKey,t);
    }
    // Daily sales records — the actual dataset behind Monthly Report,
    // Overview, and Rankings. Stored per month/year, with each day keyed by
    // SR ID (records[date][srId] = {walkin, aeon, ...}). Migrates EVERY
    // month from the SR's join date through to the currently selected
    // month, not just current+previous — a rename now carries their full
    // sales history over on its own, no separate "Fix Missing Records" step
    // needed afterward. Falls back to checking the last 24 months if the SR
    // record has no joinDate on file, as a safety net.
    let startY=selYear,startM=selMonth;
    if(renaming?.joinDate&&/^\d{4}-\d{2}$/.test(renaming.joinDate)){
      const[jy,jm]=renaming.joinDate.split("-").map(Number);
      startY=jy;startM=jm;
    }else{
      for(let i=0;i<24;i++){startM--;if(startM<1){startM=12;startY--;}}
    }
    // Safety cap — never walk more than 10 years of months in one rename,
    // even if joinDate somehow predates that.
    const capMonths=120;
    let y=startY,m=startM,walked=0;
    while((y<selYear||(y===selYear&&m<=selMonth))&&walked<capMonths){
      await migrateRecordsForMonth(oldId,newId,y,m);
      m++;if(m>12){m=1;y++;}
      walked++;
    }
    return{ok:true,newSRList};
  };
  const handleSaveTargets=async(t)=>{setTargets(t);await saveData(`emax_v5_targets_${selYear}_${selMonth}`,t);};

  const branchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));let wi=0,ae=0;
      for(let d=selStartDay;d<=selEndDay;d++){
        const k=`${d}/${month}/${year}`,day=records[k]||{};
        bSRs.forEach(sr=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});
        wi+=(day[`BM_${b}`]?.walkin||0);ae+=(day[`BM_${b}`]?.aeon||0);wi+=(day[`BM_${b}`]?.unalloc||0);
      }
      t[b]={wi,ae,total:wi+ae};
    });
    return t;
  },[records,srList,selStartDay,selEndDay,month,year]);

  // Full-month branch totals (NOT period-filtered) — Monthly Report always uses this
  const fullMonthBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,selMonth,selYear));let wi=0,ae=0;
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
    srList.forEach(sr=>{let wi=0,ae=0;Object.values(records).forEach(day=>{wi+=(day[sr.id]?.walkin||0);ae+=(day[sr.id]?.aeon||0);});t[sr.id]={wi,ae,total:wi+ae};});
    return t;
  },[records,srList]);

  // Ranking-specific totals: always 1 → lastDataDay (last day with real data), independent of the Overview period filter
  // Cap rankEndDay at publishedUntil so dashboard ranking matches viewer ranking
  const publishedDay=publishedUntil?(()=>{const[,, d]=publishedUntil.split("-");return parseInt(d);})():null;
  const rankEndDay=publishedDay?Math.min(publishedDay,lastDataDay||daysInMonth(month,year)):lastDataDay||daysInMonth(month,year);
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

  const grandTotal=BRANCH_ORDER.reduce((s,b)=>s+(branchTotals[b]?.total||0),0);
  const grandTarget=BRANCH_ORDER.reduce((s,b)=>s+(targets?.bm?.[b]||0),0);

  const bmRanking=useMemo(()=>[...BRANCH_ORDER].filter(b=>(targets?.bm?.[b]||0)>0).map(b=>{
    const profit=rankBranchTotals[b]?.total||0,target=targets?.bm?.[b]||0,bonus=targets?.bmBonus?.[b]||0;
    const bonusEarned=target>0&&profit>=target&&bonus>0,p=pctN(profit,target);
    return{name:branchMeta[b]?.manager,status:branchMeta[b]?.mStatus,branch:b,sub:null,wi:rankBranchTotals[b]?.wi||0,ae:rankBranchTotals[b]?.ae||0,profit,target,bonus,bonusEarned,branchPct:p,role:"bm",points:calcRewardPoints(p,p)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target)),[rankBranchTotals,targets,branchMeta]);

  const mkSRRank=type=>srList.filter(s=>s.type===type&&srVisibleInMonth(s,selMonth,selYear)).map(s=>{
    const profit=rankSRTotals[s.id]?.total||0,target=targets?.sr?.[s.id]?.target||0,bonus=targets?.sr?.[s.id]?.bonus||0;
    const bTarget=targets?.bm?.[s.branch]||0,bTotal=rankBranchTotals[s.branch]?.total||0;
    const branchHit=bTarget>0&&bTotal>=bTarget,p=pctN(profit,target),branchPct=pctN(bTotal,bTarget);
    return{name:s.canon,status:s.status,branch:s.branch,sub:null,wi:rankSRTotals[s.id]?.wi||0,ae:rankSRTotals[s.id]?.ae||0,profit,target,bonus,bonusEarned:branchHit&&profit>=target&&bonus>0,branchPct,role:"sr",points:calcRewardPoints(p,branchPct)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));

  // Expected Profit table (Overview page, bottom section) — every order
  // still before Billing Request (steps 1-5: New Order Request through
  // Arrived Branch), across all branches, that has both a selling price
  // and an Ordered Price on file. Fetched once, lazily, only when the
  // Overview tab is actually open — this data isn't needed anywhere else.
  const [expectedProfitOrders,setExpectedProfitOrders]=useState(null);
  useEffect(()=>{
    if(tab==="overview"&&expectedProfitOrders===null){
      listOrders().then(setExpectedProfitOrders);
    }
  },[tab,expectedProfitOrders]);
  const STEP_LABELS={1:"New Order Request",2:"Ordered",3:"Arrived HQ",4:"Dispatched to Branch",5:"Arrived Branch"};
  const expectedProfitList=useMemo(()=>{
    if(!expectedProfitOrders)return[];
    return expectedProfitOrders.filter(o=>{
      if(o.cancelled||!(o.step>=1&&o.step<=5))return false;
      const sellPrice=o.orderType==="cash"?o.retailPrice:o.financePrice;
      return parseFloat(sellPrice)>0&&parseFloat(o.actualPrice)>0;
    }).map(o=>{
      const sellPrice=parseFloat(o.orderType==="cash"?o.retailPrice:o.financePrice)||0;
      return{...o,expectedProfit:sellPrice-(parseFloat(o.actualPrice)||0)};
    }).sort((a,b)=>b.id-a.id);
  }, [expectedProfitOrders]);
  const [expandedProfitBranches,setExpandedProfitBranches]=useState(()=>new Set());
  const toggleProfitBranch=(b)=>setExpandedProfitBranches(prev=>{
    const next=new Set(prev);
    next.has(b)?next.delete(b):next.add(b);
    return next;
  });
  const expectedProfitByBranch=useMemo(()=>{
    const groups={};
    expectedProfitList.forEach(o=>{(groups[o.branch]||=[]).push(o);});
    const branches=Object.keys(groups).sort((a,b)=>
      groups[b].reduce((s,o)=>s+o.expectedProfit,0)-groups[a].reduce((s,o)=>s+o.expectedProfit,0)
    );
    return{groups,branches};
  },[expectedProfitList]);
  const goToOrder=(id)=>{
    const url=new URL(window.location.href);
    url.searchParams.set("orderId",id);
    window.history.replaceState({},"",url);
    setTab("orders");
  };

  const printSummary=()=>{
    const w=window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Branch Performance Report</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,system-ui,sans-serif;}body{padding:24px;}
    h2{font-size:15px;font-weight:800;color:#0A1628;margin-bottom:2px;}.period{font-size:11px;color:#8A96A8;margin-bottom:16px;}
    table{border-collapse:collapse;width:100%;font-size:12px;}
    th{background:#0A1628;color:rgba(255,255,255,.8);padding:9px 14px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:right;}
    th.L{text-align:left;}td{padding:8px 14px;border-bottom:1px solid #E4EAF2;text-align:right;}td.L{text-align:left;font-weight:700;}
    tfoot td{background:#0A1628;color:#fff;font-weight:800;}
    @page{size:A4 landscape;margin:12mm;}</style></head><body>
    <h2>Branch Performance Report — EMAX NETWORK SDN BHD</h2>
    <div class="period">Period: ${selStartDay}/${month}/${year} – ${selEndDay}/${month}/${year}</div>
    <table><thead><tr><th class="L">Branch</th><th class="L">Manager</th><th>Target</th><th>Total Profit</th><th>Walk In</th><th>Invoice</th><th>Balance</th><th>Achievement</th></tr></thead>
    <tbody>${BRANCH_ORDER.map(b=>{
      const wi=branchTotals[b]?.wi||0,ae=branchTotals[b]?.ae||0,tot=wi+ae,tgt=targets?.bm?.[b]||0,bal=tgt>0?tot-tgt:null,p=pctN(tot,tgt);
      return `<tr><td class="L">${branchMeta[b]?.name||b}</td><td class="L" style="font-weight:400;color:#4A5568">${branchMeta[b]?.manager||""}</td>
        <td>${tgt>0?nc(tgt):"—"}</td><td style="font-weight:800;color:${tot>=tgt?"#00C896":"#0A1628"}">${tot>0?"RM "+nc(tot):"—"}</td>
        <td style="color:#4A5568">${wi>0?"RM "+nc(wi):"—"}</td><td style="color:#4A5568">${ae>0?"RM "+nc(ae):"—"}</td>
        <td style="font-weight:700;color:${bal===null?"#8A96A8":bal>=0?"#00C896":"#F0354B"}">${bal===null?"—":bal>=0?"+"+nc(bal):nc(Math.abs(bal))}</td>
        <td style="font-weight:800;color:${tgt>0?achColor(tot,tgt):"#8A96A8"}">${tgt>0?p.toFixed(2)+"%":"—"}</td></tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td class="L">Total</td><td class="L"></td><td>${grandTarget>0?nc(grandTarget):"—"}</td><td style="font-size:13px;color:#00C896">${fRM(grandTotal)}</td>
    <td style="color:#60AAFF">${fRM(BRANCH_ORDER.reduce((s,b)=>s+(branchTotals[b]?.wi||0),0))}</td>
    <td style="color:#A78BFA">${fRM(BRANCH_ORDER.reduce((s,b)=>s+(branchTotals[b]?.ae||0),0))}</td>
    <td></td><td style="color:${grandTotal>=grandTarget?"#00C896":"#F0354B"}">${grandTarget>0?pctN(grandTotal,grandTarget).toFixed(2)+"%":"—"}</td></tr></tfoot></table></body></html>`);
    w.document.close();setTimeout(()=>w.print(),400);
  };

  // Sidebar structure — a mix of flat top-level items and collapsible
  // groups. Each group's own tab ids are unchanged from before (routes,
  // permissions, and render logic elsewhere in this file all still key
  // off these same ids) — only the sidebar's visual grouping and a couple
  // of labels changed, nothing about what each page actually does.
  const SIDEBAR_STRUCTURE=[
    {id:"overview",label:"Overview"},
    {group:"ranking",label:"Ranking",children:[
      {id:"rankings",label:"Performance Rankings"},
      {id:"points",label:"Reward Point Ranking"},
    ]},
    {group:"monthlyReport",label:"Monthly Report",children:[
      {id:"report",label:"Branch Report"},
      {id:"repair",label:"Repair & Service"},
      {id:"daily",label:"Daily Entry"},
    ]},
    {id:"rto",label:"Rent to Own"},
    {group:"purchasing",label:"Purchasing",children:[
      {id:"orders",label:"Order Tracking"},
      {id:"purchaseOrder",label:"Purchase Order"},
    ]},
    {id:"dailySales",label:"Daily Sales Report"},
    {group:"ccmApplication",label:"CCM Application",children:[
      {id:"jclApplications",label:"JCL Application"},
      {id:"chaileaseApplications",label:"Chailease Application"},
    ]},
    {id:"dailyPayment",label:"Daily Payment"},
    {id:"stockProfit",label:"Stock Profit Checker"},
    {id:"stockTransfer",label:"Stock Transfer"},
  ];
  const [expandedGroups,setExpandedGroups]=useState(()=>{
    const initial={};
    SIDEBAR_STRUCTURE.forEach(item=>{if(item.children)initial[item.group]=item.children.some(c=>c.id===tab);});
    return initial;
  });
  // Whenever the active tab changes to something inside a group, force
  // that group open — even if the person had previously collapsed it —
  // so the active page is never hidden inside a closed group.
  useEffect(()=>{
    SIDEBAR_STRUCTURE.forEach(item=>{
      if(item.children&&item.children.some(c=>c.id===tab))setExpandedGroups(p=>p[item.group]?p:{...p,[item.group]:true});
    });
  },[tab]);

  // Red-dot notification on the Daily Payment sidebar item — lit whenever
  // there's at least one item needing someone's attention: "pending"
  // (uploaded by Knock-off, not yet reviewed by Sophia), "rejected" (Sophia
  // sent it back, Knock-off needs to re-upload), or "requested" (Sophia
  // asked for a file, Knock-off hasn't uploaded it yet) — across ANY of
  // the 4 company tabs, not just Emax. Checked once on load, then kept
  // live via a Supabase Realtime subscription scoped to these specific
  // storage keys, so the dot appears/clears without needing a refresh.
  const [hasPendingDailyPayment,setHasPendingDailyPayment]=useState(false);
  useEffect(()=>{
    const dailyPaymentKeys=DAILY_PAYMENT_COMPANIES.map(c=>dailyPaymentKeyFor(c.key));
    const checkPending=async()=>{
      const results=await Promise.all(dailyPaymentKeys.map(k=>loadData(k)));
      const anyPending=results.some(entries=>Array.isArray(entries)&&entries.some(e=>["pending","rejected","requested"].includes(e.status)));
      setHasPendingDailyPayment(anyPending);
    };
    checkPending();
    const channel=supabase.channel("daily-payment-notify")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_storage",filter:`key=in.(${dailyPaymentKeys.join(",")})`},checkPending)
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

  if(loading)return <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"#0A1628",fontFamily:"Inter,sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontWeight:900,fontSize:18,color:"#fff",letterSpacing:"0.05em",marginBottom:8}}>EMAX NETWORK</div>
      <div style={{fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:"0.15em",textTransform:"uppercase"}}>Loading Dashboard</div>
    </div>
  </div>;

  return <div style={{minHeight:"100vh",background:"#F7F9FC",fontFamily:"Inter,-apple-system,sans-serif"}}>
    <style>{CSS}</style>
    {/* NAV */}
    <div style={{background:"#0A1628",borderBottom:"1px solid #162B52",position:"sticky",top:0,zIndex:100}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 12px"}}>
        {/* Row 1: Logo + Tabs + Controls */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:48,gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div>
            <div style={{fontWeight:900,fontSize:12,color:"#fff",letterSpacing:"0.06em",lineHeight:1}}>EMAX NETWORK</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",rowGap:6}}>
          {/* Month/Year Picker — only relevant on tabs that actually use it */}
          {["overview","report","rankings","points"].includes(tab)&&<div style={{display:"flex",gap:4,alignItems:"center"}}>
            <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
              style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,
                background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i)=>(
                <option key={i+1} value={i+1} style={{background:"#0A1628",color:"#fff"}}>{m}</option>
              ))}
            </select>
            <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
              style={{padding:"4px 6px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,
                background:"rgba(255,255,255,.1)",color:"#fff",outline:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600}}>
              {[2024,2025,2026,2027,2028].map(y=>(
                <option key={y} value={y} style={{background:"#0A1628",color:"#fff"}}>{y}</option>
              ))}
            </select>
          </div>}

          <button onClick={()=>setSidebarOpen(o=>!o)} title={sidebarOpen?"Collapse menu":"Expand menu"}
            style={{display:"flex",alignItems:"center",justifyContent:"center",width:30,height:30,border:"1px solid rgba(255,255,255,.15)",borderRadius:7,background:"rgba(255,255,255,.06)",cursor:"pointer",flexShrink:0}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
        </div>{/* Row 1 end */}
      </div>
    </div>

    <div style={{display:"flex",maxWidth:1400,margin:"0 auto"}}>
      {/* MAIN CONTENT */}
      <div style={{flex:1,minWidth:0,padding:"20px",maxWidth:1180}}>
      {/* Period bar — shows actual data period, consistent across all tabs */}
      {/* Period bar */}
      {["overview","rankings","report","daily"].includes(tab)&&<div style={{padding:"7px 14px",background:"#F0F4FA",borderRadius:8,fontSize:11,color:"#4A5568",marginBottom:16,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,color:"#0A1628"}}>Report Period:</span>
        <span>{lastDataDay?`1/${month}/${year} — ${lastDataDay}/${month}/${year}`:`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year} (no data yet)`}</span>
        {publishedUntil&&<span style={{marginLeft:8,color:"#15803D",fontWeight:600}}>Published up to {publishedUntil.replace(/(\d{4})-(\d{2})-(\d{2})/,(m,y,mo,d)=>`${d}/${mo}/${y}`)}</span>}
      </div>}
      {/* OVERVIEW */}
      {tab==="overview"&&<div className="fade-in">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12,marginBottom:20}}>
          <KpiCard label="Total Profit" value={fRM(grandTotal)} accent="#1E6FDB"/>
          <KpiCard label="Monthly Target" value={grandTarget>0?fRM(grandTarget):"Not Set"} accent="#162B52"/>
          <KpiCard label="Achievement" value={grandTarget>0?pctN(grandTotal,grandTarget).toFixed(1)+"%":"—"} accent={achColor(grandTotal,grandTarget)}/>
          <KpiCard label="Target Balance" value={grandTarget>0?(grandTotal-grandTarget>=0?"+"+fRM(grandTotal-grandTarget):fRM(grandTotal-grandTarget)):"—"} accent={grandTarget>0&&grandTotal>=grandTarget?"#00C896":"#F0354B"} sub={grandTarget>0&&grandTotal>=grandTarget?"Target exceeded":"Remaining"}/>
          <KpiCard label="On Target" value={`${BRANCH_ORDER.filter(b=>{const t=targets?.bm?.[b]||0;return t>0&&(branchTotals[b]?.total||0)>=t;}).length}/${BRANCH_ORDER.filter(b=>(targets?.bm?.[b]||0)>0).length}`} accent="#F5A623" sub="Of branches with target set"/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <h2 style={{fontSize:14,fontWeight:800,color:"#0A1628",margin:0}}>Branch Performance</h2>
          <button className="btn btn-primary" onClick={printSummary} style={{fontSize:12}}>Download Report</button>
        </div>
        <BranchPerfTable branchTotals={branchTotals} targets={targets} branchMeta={branchMeta} printRef={summaryRef} month={month} year={year} startDay={selStartDay} endDay={Math.min(selEndDay,lastDataDay||daysInMonth(month,year))} onChangeStartDay={setSelStartDay} onChangeEndDay={setSelEndDay} maxDay={lastDataDay||daysInMonth(month,year)}/>

        <h2 style={{fontSize:14,fontWeight:800,color:"#0A1628",margin:"24px 0 12px"}}>Expected Profit — Not Yet Billed</h2>
        <div style={{background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #E4EAF2",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #E4EAF2"}}>
            <div>
              <h3 style={{fontWeight:800,fontSize:14,color:"#0A1628",margin:0}}>Expected Profit by Branch</h3>
              <div style={{fontSize:11,color:"#5A6472",marginTop:2}}>{expectedProfitList.length} order{expectedProfitList.length===1?"":"s"} not yet billed, across {expectedProfitByBranch.branches.length} branch{expectedProfitByBranch.branches.length===1?"":"es"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#5A6472"}}>Total Expected Profit</div>
              <div style={{fontWeight:700,fontSize:14,color:"#0A1628"}}>{(()=>{const t=expectedProfitList.reduce((s,o)=>s+o.expectedProfit,0);return t>=0?"+"+fRM(t):fRM(Math.abs(t));})()}</div>
            </div>
          </div>
          {expectedProfitOrders===null
            ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>Loading…</div>
            :<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
                <thead><tr>
                  <th style={TH({textAlign:"left"})}>Branch</th>
                  <th style={TH()}>Orders</th>
                  <th style={TH()}>Expected Profit</th>
                </tr></thead>
                <tbody>
                  {expectedProfitByBranch.branches.length===0
                    ?<tr><td colSpan={3} style={{padding:"40px 10px",textAlign:"center",color:"#8A96A8",fontSize:13}}>Nothing outstanding — every order before Billing Request has Actual Purchase Price on file, or none are in progress right now.</td></tr>
                    :expectedProfitByBranch.branches.map(b=>{
                      const branchOrders=expectedProfitByBranch.groups[b];
                      const branchTotal=branchOrders.reduce((s,o)=>s+o.expectedProfit,0);
                      const open=expandedProfitBranches.has(b);
                      return<Fragment key={b}>
                        <tr className="shine-row" style={{background:"#fff",cursor:"pointer"}} onClick={()=>toggleProfitBranch(b)}>
                          <td style={{...TD({textAlign:"left"})}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{display:"inline-block",transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10}}>▶</span>
                              <div>
                                <div style={{fontWeight:700,color:"#0A1628",fontSize:12,textTransform:"uppercase"}}>{branchMeta[b]?.name||b}</div>
                                <div style={{fontSize:10,color:"#5A6472",marginTop:1}}>{branchMeta[b]?.manager}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontSize:12}}>{branchOrders.length}</span></td>
                          <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontSize:12,fontWeight:700}}>{branchTotal>=0?"+"+fRM(branchTotal):fRM(Math.abs(branchTotal))}</span></td>
                        </tr>
                        {open&&branchOrders.map(o=><tr key={o.id} className="shine-row" style={{background:"#FAFBFD",cursor:"pointer"}} onClick={e=>{e.stopPropagation();goToOrder(o.id);}}>
                          <td style={{...TD({textAlign:"left"})}}>
                            <div style={{paddingLeft:18,fontSize:12,color:"#0A1628"}}>{o.phoneModel||"—"}</div>
                            <div style={{paddingLeft:18,fontSize:10,color:"#8A96A8",marginTop:1}}>{STEP_LABELS[o.step]}</div>
                          </td>
                          <td style={TD()}></td>
                          <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontSize:12,fontWeight:600}}>{o.expectedProfit>=0?"+"+fRM(o.expectedProfit):fRM(Math.abs(o.expectedProfit))}</span></td>
                        </tr>)}
                      </Fragment>;
                    })}
                </tbody>
                {expectedProfitByBranch.branches.length>0&&<tfoot><tr style={{background:"#0A1628",fontSize:11}}>
                  <td style={{padding:"9px 10px",fontWeight:600,color:"rgba(255,255,255,.6)",whiteSpace:"nowrap"}}>Total</td>
                  <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{expectedProfitList.length}</span></td>
                  <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{(()=>{const t=expectedProfitList.reduce((s,o)=>s+o.expectedProfit,0);return t>=0?"+"+fRM(t):fRM(Math.abs(t));})()}</span></td>
                </tr></tfoot>}
              </table>
            </div>}
        </div>
      </div>}

      {/* RANKINGS */}
      {tab==="rankings"&&<div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20,alignItems:"stretch"}}>
        <RankingTable title="Branch Manager Ranking" rows={bmRanking} showBonus showPoints branchMeta={branchMeta} period={rankingPeriod}/>
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
              ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:branchMeta[b]?.manager||b,role:"Branch Manager",branch:b})),
              ...srList.filter(sr=>srVisibleInMonth(sr,selMonth,selYear)).map(sr=>({id:sr.id,name:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
            ];
            const ranked=allPeople.map(p=>({...p,balance:rewardBalances[p.id]?.balance||0,asOf:pointsAsOfFor(p.branch)})).sort((a,b)=>b.balance-a.balance);
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
                  <div style={{fontSize:10,color:isTop?"rgba(255,255,255,.4)":"#8A96A8",marginTop:2}}>{p.role} · {p.branch} · As at {p.asOf}</div>
                </div>
                <div style={{fontWeight:800,fontSize:15,color:isTop?"#fff":"#0A1628",flexShrink:0,whiteSpace:"nowrap"}}>{p.balance.toLocaleString()} pts</div>
              </div>;
            });
          })()}
        </div>
      </div>}

      {/* MONTHLY REPORT */}
      {tab==="report"&&<div className="fade-in">
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
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
          {selBranch!=="ALL"&&<div style={{display:"flex",gap:8}}>
            {isBranchLocked(selBranch)
              ? <button className="btn btn-ghost" onClick={()=>unlockBranchMonth(selBranch)} style={{fontSize:11,color:"#F0354B",borderColor:"#F0354B22",background:"#FFF5F5"}}>Locked — Click to Unlock</button>
              : <button className="btn btn-ghost" onClick={()=>{if(confirm(`Lock ${selBranch} for ${selMonth}/${selYear}? This credits all SR + BM reward points and updates employment status.`))lockBranchMonth(selBranch);}} style={{fontSize:11}}>Lock Month &amp; Credit Points</button>}
            <button className="btn btn-primary" onClick={()=>setPrintBranch(selBranch)} style={{fontSize:11}}>Download {selBranch} Report</button>
          </div>}
        </div>
        {selBranch==="ALL"
          ? <div>
              <div style={{marginBottom:14,padding:"12px 16px",background:"#F7F9FC",borderRadius:10,border:"1px solid #E4EAF2"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#0A1628",marginBottom:4}}>All Branches — {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month-1]} {year} Total Daily Performance</div>
                <div style={{fontSize:11,color:"#5A6472"}}>Showing combined totals for all branches</div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
                  <thead><tr style={{background:"#0A1628"}}>
                    <th style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"left"}}>Day</th>
                    {BRANCH_ORDER.map(b=><th key={b} style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right"}}>{b}</th>)}
                    <th style={{padding:"9px 12px",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.9)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right"}}>Total</th>
                  </tr></thead>
                  <tbody>
                    {days.map((d,i)=>{
                      const k=`${d}/${month}/${year}`,day=records[k]||{};
                      const branchTotals=BRANCH_ORDER.map(b=>{
                        const bSRs=srList.filter(s=>s.branch===b&&srVisibleInMonth(s,month,year));
                        let t=bSRs.reduce((s,sr)=>(s+(day[sr.id]?.walkin||0)+(day[sr.id]?.aeon||0)),0);
                        t+=(day[`BM_${b}`]?.walkin||0)+(day[`BM_${b}`]?.aeon||0)+(day[`BM_${b}`]?.unalloc||0);
                        return t;
                      });
                      const dayTotal=branchTotals.reduce((s,t)=>s+t,0);
                      if(dayTotal===0)return null;
                      return <tr key={d} style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#F7F9FC"}}>
                        <td style={{padding:"8px 12px",fontSize:12,fontWeight:600,color:"#0A1628"}}>{d}/{month}</td>
                        {branchTotals.map((t,bi)=><td key={bi} style={{padding:"8px 12px",fontSize:12,textAlign:"right",color:t>0?"#4A5568":"#CDD5E0",whiteSpace:"nowrap"}}>{t>0?fRM(t):"—"}</td>)}
                        <td style={{padding:"8px 12px",fontSize:12,fontWeight:700,textAlign:"right",color:"#0A1628",whiteSpace:"nowrap"}}>{fRM(dayTotal)}</td>
                      </tr>;
                    })}
                  </tbody>
                  <tfoot><tr style={{background:"#0A1628"}}>
                    <td style={{padding:"9px 12px",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.7)",whiteSpace:"nowrap"}}>Total</td>
                    {BRANCH_ORDER.map(b=>{
                      const t=fullMonthBranchTotals[b]?.total||0;
                      return <td key={b} style={{padding:"9px 12px",fontSize:11,textAlign:"right",color:"rgba(255,255,255,.7)",whiteSpace:"nowrap"}}>{t>0?fRM(t):"—"}</td>;
                    })}
                    <td style={{padding:"9px 12px",fontSize:11,fontWeight:700,textAlign:"right",color:"#fff",whiteSpace:"nowrap"}}>{fRM(Object.values(fullMonthBranchTotals).reduce((s,b)=>s+(b?.total||0),0))}</td>
                  </tr></tfoot>
                </table>
              </div>
              <div style={{marginTop:22}}>
                <PdfDownloads month={month} year={year} allowDelete/>
              </div>
            </div>
          : (()=>{
              const bSRs=srList.filter(s=>s.branch===selBranch&&srVisibleInMonth(s,month,year));
              const bTarget=targets?.bm?.[selBranch]||0,bTotal=fullMonthBranchTotals[selBranch]?.total||0;
              const branchPct=pctN(bTotal,bTarget);
              return <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14,alignItems:"start"}}>
                  {bSRs.map(sr=><SRTable key={sr.id} sr={sr} records={records} targets={targets} branchPct={branchPct} onEdit={handleEdit} printMode={false} month={month} year={year} days={days} rewardBalance={rewardBalances[sr.id]?.balance||0} pointsAsOf={pointsAsOfFor(selBranch)} onStatusHistory={id=>{setStatusModalPerson(id);setShowStatusHistoryModal(true);}}/>)}
                  <BMTable branchId={selBranch} records={records} targets={targets} srList={srList} branchMeta={branchMeta} onEdit={handleEdit} printMode={false} month={month} year={year} days={days} rewardBalance={rewardBalances[`BM_${selBranch}`]?.balance||0} pointsAsOf={pointsAsOfFor(selBranch)} onStatusHistory={id=>{setStatusModalPerson(id);setShowStatusHistoryModal(true);}}/>
                </div>
                <div style={{marginTop:22}}>
                  <div style={{fontWeight:800,fontSize:12,color:"#0A1628",marginBottom:10,paddingBottom:7,borderBottom:"1px solid #E4EAF2",textTransform:"uppercase",letterSpacing:"0.06em"}}>Daily AEON Profit Report</div>
                  <UploadPanel records={records} setRecords={setRecords} srList={srList} defaultBranch={selBranch} recordsKey={recordsKey}/>
                  <PdfDownloads month={month} year={year} branch={selBranch} allowDelete/>
                </div>
              </div>;
            })()
        }
      </div>}



      {/* DAILY ENTRY */}
      {tab==="daily"&&<DailyEntry records={records} setRecords={setRecords} srList={srList} branchMeta={branchMeta} month={month} year={year} days={days} recordsKey={recordsKey} onRepairSave={()=>setRepairRefresh(p=>p+1)}/>}

      {/* REPAIR */}
      {tab==="repair"&&<RepairTab month={month} year={year} endDay={selEndDay} refreshKey={repairRefresh}/>}
      {tab==="rto"&&<RTOTab branchMeta={branchMeta} email={currentEmail}/>}
      {tab==="orders"&&<OrderTab branchMeta={branchMeta} isAdmin={true} srList={srList} email={currentEmail}/>}
      {tab==="dailySales"&&<DailySalesTab branchMeta={branchMeta} isAdmin={true} canSubmit={true} canVerify={true} email={currentEmail}/>}
      {tab==="jclApplications"&&<JCLTab branchMeta={branchMeta} isAdmin={true} userBranch={null} srList={srList} email={currentEmail}/>}
      {tab==="chaileaseApplications"&&<ChaileaseTab branchMeta={branchMeta} isAdmin={true} userBranch={null} srList={srList} email={currentEmail}/>}
      {tab==="purchaseOrder"&&<PurchaseOrderTab branchMeta={branchMeta} isAdmin={true}/>}
      {tab==="dailyPayment"&&<DailyPaymentTab email={currentEmail}/>}
      {tab==="stockProfit"&&<StockProfitTab email={currentEmail}/>}
      {tab==="stockTransfer"&&<StockTransferTab canCreate={true} branchMeta={branchMeta} email={currentEmail}/>}

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
                display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
                border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
                background:tab===item.id?"rgba(255,255,255,.1)":"transparent",color:tab===item.id?"#fff":"rgba(255,255,255,.45)",
                transition:"background .15s",
              }}>
                <span>{item.label}</span>
                {item.id==="dailyPayment"&&hasPendingDailyPayment&&<span style={{width:7,height:7,borderRadius:"50%",background:"#DC2626",flexShrink:0}}/>}
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
          <button onClick={async()=>{
            const d=new Date();
            const ldd=lastDataDay||d.getDate();
            const ds=`${year}-${String(month).padStart(2,"0")}-${String(ldd).padStart(2,"0")}`;
            setPublishedUntil(ds);
            await saveData(`emax_v5_published_${year}_${month}`,ds);
            setSidebarOpen(false);
            alert(`Data up to ${ldd}/${month}/${year} published to viewers.`);
          }} style={{
            display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"rgba(30,111,219,.25)",color:"#60A5FA",transition:"background .15s",
          }}>
            Publish to Viewers
          </button>
          <div style={{width:"100%",height:1,background:"rgba(255,255,255,.08)",margin:"10px 0"}}/>
          <button onClick={()=>{setShowTargetModal(true);setSidebarOpen(false);}} style={{
            display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"transparent",color:"rgba(255,255,255,.45)",transition:"background .15s",
          }}>
            Set Targets
          </button>
          <button onClick={()=>{setShowSRModal(true);setSidebarOpen(false);}} style={{
            display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"transparent",color:"rgba(255,255,255,.45)",transition:"background .15s",
          }}>
            Manage Staff
          </button>
          <div style={{width:"100%",height:1,background:"rgba(255,255,255,.08)",margin:"10px 0"}}/>
          <button onClick={()=>{setShowDailyReport(true);setSidebarOpen(false);}} style={{
            display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"rgba(255,213,0,.1)",color:"#FFD500",transition:"background .15s",
          }}>
            Daily Financial Report
          </button>
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

    {showTargetModal&&<TargetModal targets={targets} setTargets={setTargets} srList={srList} branchMeta={branchMeta} onClose={()=>setShowTargetModal(false)} currentMonth={selMonth} currentYear={selYear} onSaveForMonth={async(t,m,y)=>{if(m===selMonth&&y===selYear){setTargets(t);handleSaveTargets(t);}else await saveData(`emax_v5_targets_${y}_${m}`,t);}}/>}
    {showSRModal&&<SRBMModal srList={srList} setSrList={setSrList} branchMeta={branchMeta} setBranchMeta={setBranchMeta} onClose={()=>setShowSRModal(false)} rewardBalances={rewardBalances} adjustBalance={adjustBalance} statusHistory={statusHistory} setStatusHistory={setStatusHistory} month={month} year={year} setShowStatusHistoryModal={setShowStatusHistoryModal} setStatusModalPerson={setStatusModalPerson} renameSRId={renameSRId}/>}
    {printBranch&&<PrintBranchReport branchId={printBranch} records={records} targets={targets} srList={srList} branchMeta={branchMeta} onClose={()=>setPrintBranch(null)} month={month} year={year} days={days}/>}
    {showPointsModal&&<PointsHistoryModal srList={srList} branchMeta={branchMeta} rewardBalances={rewardBalances} rewardHistory={rewardHistory} initialPerson={pointsModalPerson} onDeletePointsEntry={deletePointsEntry} onClose={()=>{setShowPointsModal(false);setPointsModalPerson(null);}}/>}
    {showStatusHistoryModal&&<StatusHistoryModal srList={srList} branchMeta={branchMeta} statusHistory={statusHistory} initialPerson={statusModalPerson} onDeleteStatusEntry={deleteStatusEntry} onClose={()=>{setShowStatusHistoryModal(false);setStatusModalPerson(null);}}/>}
  {showDailyReport&&<DailyReportPanel onClose={()=>setShowDailyReport(false)}/>}
  </div>;
}
