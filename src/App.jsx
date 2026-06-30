// ============================================================
// EMAX NETWORK SDN BHD — Sales Performance Dashboard
// Enterprise Analytics Platform
// ============================================================
import { useState, useEffect, useMemo, useRef } from "react";
import { loadData, saveData } from "./storage/index.js";

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
`;

function daysInMonth(m,y){return new Date(y,m,0).getDate();}
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];

const DEFAULT_BRANCH_META={
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

const DEFAULT_SR=[
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

const STORE_KEY="emax_v5_records",TARGET_KEY="emax_v5_targets",SR_KEY="emax_v5_sr_list",BM_KEY="emax_v5_branch_meta",REPAIR_KEY="emax_v5_repair";
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
const statusBaseOptions=["Probation","Confirmed","Director","Resigned"];
function parseStatus(s){
  const m=(s||"").match(/^(Probation|Confirmed|Director|Resigned)\s*(?:\(P(\d+)\s*F(\d+)\))?/i);
  if(!m)return{base:"Probation",p:0,f:0};
  return{base:m[1],p:parseInt(m[2]||0),f:parseInt(m[3]||0)};
}
function buildStatus(base,p,f){
  return(base==="Director"||base==="Resigned")?base:`${base} (P${p} F${f})`;
}

// ─── HELPERS ───────────────────────────────────────────────
const fRM=(n=0)=>"RM "+Number(n||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
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
  return <span className="tag" style={{background:bg,color,fontSize:size==="lg"?14:size==="md"?13:11,fontWeight:700}}>{p.toFixed(2)}%</span>;
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
function SRTable({sr,records,targets,branchPct,onEdit,printMode,month,year,days,rewardBalance=0,pointsAsOf=""}){
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
      <StatusTag status={sr.status}/>
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
      {bonus>0&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Personal Achievement Bonus</span>
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>
          {bonusEarned?fRM(bonus):`${fRM(bonus)} (Pending)`}
        </span>
      </div>}

      {/* Branch Achievement Bonus */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Branch Achievement Bonus</span>
        {(branchPct>=120&&p>=100)
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{fRM(calcAchievementBonus(branchPct,"sr"))}</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>

      {/* Reward Points */}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,marginTop:2}}>
        <span style={{color:"#5A6472"}}>Reward Points (This Month)</span>
        {(branchPct>=100&&p>=110)
          ? <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{calcRewardPoints(p,branchPct).toLocaleString()} pts</span>
          : <span style={{color:"#5A6472"}}>—</span>
        }
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
        <span style={{color:"#5A6472"}}>Earned Reward Points{pointsAsOf?` (as at ${pointsAsOf})`:""}</span>
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{rewardBalance.toLocaleString()} pts</span>
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
function BMTable({branchId,records,targets,srList,branchMeta,onEdit,printMode,month,year,days,rewardBalance=0,pointsAsOf=""}){
  const meta=branchMeta[branchId]||{},bSRs=srList.filter(s=>s.branch===branchId);
  const target=targets?.bm?.[branchId]||0,bmBonus=targets?.bmBonus?.[branchId]||0;
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
      <StatusTag status={meta.mStatus}/><span style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.04em"}}>{meta.name}</span>
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
          <span style={{color:"#5A6472"}}>{l}</span><span style={{fontWeight:700,color:c,fontSize:11}}>{v}</span>
        </div>
      ))}
      <div style={{height:1,background:"#E4EAF2",margin:"7px 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
        <span style={{color:"#5A6472"}}>Target</span><span style={{fontWeight:700,fontSize:11}}>{target>0?fRM(target):"Not set"}</span>
      </div>
      {target>0&&<>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
          <span style={{color:"#5A6472"}}>Personal Achievement</span><AchBadge profit={total} target={target}/>
        </div>
        <ProgressBar pct={p} color={color}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:5}}>
          <span style={{color:"#5A6472"}}>Balance to Hit</span>
          <span style={{fontWeight:700,color:Math.max(target-total,0)>0?"#F0354B":"#00C896",fontSize:11}}>
            {Math.max(target-total,0)>0?fRM(Math.max(target-total,0)):"Target Met"}
          </span>
        </div>
      </>}
      {/* ── BM INCENTIVES ── */}
      <div style={{height:1,background:"#E4EAF2",margin:"8px 0"}}/>
      <div style={{fontSize:9,fontWeight:700,color:"#5A6472",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Incentives</div>

      {/* Personal Achievement Bonus: RM500 always, RM2200 if branch hits 100%+ */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,marginBottom:4}}>
        <span style={{color:"#5A6472"}}>Personal Achievement Bonus</span>
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>
          {p>=100?"RM 2,200":"RM 500 (Pending)"}
        </span>
      </div>



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
        <span style={{fontWeight:700,fontSize:11,color:"#0A1628"}}>{rewardBalance.toLocaleString()} pts</span>
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
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
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

  const total=Object.values(repairData).reduce((s,v)=>s+(v||0),0);
  const activeDays=Object.keys(repairData).filter(d=>repairData[d]!==0).length;

  if(loading)return <div style={{padding:32,textAlign:"center",color:"#8A96A8",fontSize:12}}>Loading...</div>;

  return <div className="fade-in" style={{maxWidth:520}}>
    <div className="card" style={{overflow:"hidden"}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid #E4EAF2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>Repair & Service</div>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:2}}>{MONTHS[month-1]} {year} · {activeDays} {activeDays===1?"entry":"entries"}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em"}}>Monthly Total</div>
          <div style={{fontWeight:700,fontSize:15,color:"#0A1628"}}>{total!==0?fRM(total):"—"}</div>
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
  const bSRs=srList.filter(s=>s.branch===branchId);
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
    {saved&&<div style={{color:"#00C896",fontSize:11,marginTop:8}}>✓ PDF saved — viewers can now download it</div>}
  </div>;
}

// ─── TARGET MODAL ──────────────────────────────────────────
function TargetModal({targets,setTargets,srList,branchMeta,onClose}){
  const [local,setLocal]=useState(JSON.parse(JSON.stringify(targets)));
  const save=()=>{setTargets(local);onClose();};
  const setBM=(b,v)=>setLocal(p=>({...p,bm:{...p.bm,[b]:parseFloat(v)||0}}));
  const setBMB=(b,v)=>setLocal(p=>({...p,bmBonus:{...p.bmBonus,[b]:parseFloat(v)||0}}));
  const setSR=(id,field,v)=>setLocal(p=>({...p,sr:{...p.sr,[id]:{...p.sr?.[id],[field]:parseFloat(v)||0}}}));
  return <div className="modal-overlay">
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:820,maxHeight:"90vh",overflow:"auto"}}>
      <div style={{padding:"18px 24px",borderBottom:"1px solid #E4EAF2",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:1}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>Target & Bonus Settings</h2>
        <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px"}}>Close</button>
      </div>
      <div style={{padding:24}}>
        <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.06em"}}>Branch Manager Targets</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12,marginBottom:24}}>
          {BRANCH_ORDER.map(b=>(
            <div key={b} style={{background:"#F7F9FC",borderRadius:10,padding:14,border:"1px solid #E4EAF2"}}>
              <div style={{fontWeight:700,fontSize:12,color:"#0A1628",textTransform:"uppercase"}}>{branchMeta[b]?.name}</div>
              <div style={{fontSize:10,color:"#8A96A8",marginBottom:10}}>BM: {branchMeta[b]?.manager}</div>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Monthly Target (RM)</label>
              <input className="input" type="number" value={local.bm?.[b]||""} onChange={e=>setBM(b,e.target.value)} placeholder="0" style={{marginBottom:8,fontSize:12}}/>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>BM Bonus if Branch 100%+ (RM)</label>
              <input className="input" type="number" value={local.bmBonus?.[b]||""} onChange={e=>setBMB(b,e.target.value)} placeholder="0" style={{fontSize:12}}/>
            </div>
          ))}
        </div>
        <h3 style={{fontSize:12,fontWeight:800,color:"#0A1628",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>SR Targets</h3>
        <p style={{fontSize:11,color:"#8A96A8",marginBottom:16}}>Achievement bonus calculated automatically. Set personal bonus and target here.</p>
        {BRANCH_ORDER.map(b=>{
          const bSRs=srList.filter(s=>s.branch===b);
          if(!bSRs.length)return null;
          return <div key={b} style={{marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:10,color:"#1E6FDB",marginBottom:8,paddingBottom:4,borderBottom:"1px solid #E4EAF2",textTransform:"uppercase",letterSpacing:"0.08em"}}>{branchMeta[b]?.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
              {bSRs.map(sr=>(
                <div key={sr.id} style={{background:"#F7F9FC",borderRadius:8,padding:10,border:"1px solid #E4EAF2"}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#0A1628",marginBottom:4}}>{sr.canon}</div>
                  <div style={{marginBottom:6}}><TypeTag type={sr.type}/></div>
                  <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>Target (RM)</label>
                  <input className="input" type="number" value={local.sr?.[sr.id]?.target||""} onChange={e=>setSR(sr.id,"target",e.target.value)} placeholder="0" style={{marginBottom:6,fontSize:12,padding:"5px 8px"}}/>
                  <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>Personal Bonus (RM)</label>
                  <input className="input" type="number" value={local.sr?.[sr.id]?.bonus||""} onChange={e=>setSR(sr.id,"bonus",e.target.value)} placeholder="0" style={{fontSize:12,padding:"5px 8px"}}/>
                </div>
              ))}
            </div>
          </div>;
        })}
        <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8,paddingTop:16,borderTop:"1px solid #E4EAF2"}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save Settings</button>
        </div>
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

  // Reset local edit fields whenever the underlying status changes (e.g. after a lock auto-update)
  // or when the editor is closed without saving.
  const startEdit=()=>{const cur=parseStatus(status);setBase(cur.base);setP(cur.p);setF(cur.f);setDesc("");setEditing(true);};

  const save=()=>{
    if(!desc.trim()){return;}
    const newStatus=buildStatus(base,p,f);
    onSave(newStatus,desc.trim());
    setEditing(false);
  };

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

  return <div style={{padding:10,background:"#F7F9FC",border:"1px solid #E4EAF2",borderRadius:8}}>
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
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

function SRBMModal({srList,setSrList,branchMeta,setBranchMeta,onClose,rewardBalances,adjustBalance,statusHistory,setStatusHistory,month,year,setShowStatusHistoryModal,setStatusModalPerson}){
  const [tab,setTab]=useState("bm");
  const [localBM,setLocalBM]=useState(JSON.parse(JSON.stringify(branchMeta)));
  const [localSR,setLocalSR]=useState(JSON.parse(JSON.stringify(srList)));
  const [editSR,setEditSR]=useState(null);
  const [newSR,setNewSR]=useState({id:"",canon:"",branch:"KM",type:"Online",status:"Probation (P0 F0)"});
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [saved,setSaved]=useState(false);
  const [srSaved,setSRSaved]=useState(false);
  const saveBM=async()=>{setBranchMeta(localBM);await saveData(BM_KEY,localBM);setSaved(true);setTimeout(()=>setSaved(false),1500);};
  const saveSR=async(list)=>{setSrList(list);await saveData(SR_KEY,list);setSRSaved(true);setTimeout(()=>setSRSaved(false),1500);};
  const addSR=async()=>{
    if(!newSR.id||!newSR.canon){alert("SR ID and Name are required.");return;}
    if(localSR.find(s=>s.id===newSR.id)){alert("SR ID already exists.");return;}
    const updated=[...localSR,{...newSR}];setLocalSR(updated);setEditSR(null);
    setNewSR({id:"",canon:"",branch:"KM",type:"Online",status:"Probation In Progress"});await saveSR(updated);
  };
  const updateSR=async(id,field,val)=>{const updated=localSR.map(s=>s.id===id?{...s,[field]:val}:s);setLocalSR(updated);await saveSR(updated);};
  const saveSRStatus=async(id,newStatus,desc)=>{
    await updateSR(id,"status",newStatus);
    const hist=statusHistory[id]||[];
    const newHist={...statusHistory,[id]:[...hist,{date:new Date().toISOString(),status:newStatus,note:desc}]};
    setStatusHistory(newHist);
    await saveData("emax_v5_status_history",newHist);
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
  const filteredSR=filterBranch==="ALL"?localSR:localSR.filter(s=>s.branch===filterBranch);
  return <div className="modal-overlay">
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:860,maxHeight:"92vh",overflow:"auto"}}>
      <div style={{padding:"18px 24px",borderBottom:"1px solid #E4EAF2",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff",zIndex:1}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>Manage SR & Branch Managers</h2>
        <button className="btn btn-ghost" onClick={onClose} style={{padding:"6px 14px"}}>Close</button>
      </div>
      <div style={{display:"flex",borderBottom:"1px solid #E4EAF2",padding:"0 24px"}}>
        {[{id:"bm",label:"Branch Managers"},{id:"sr",label:"Sales Representatives"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 20px",border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"Inter,sans-serif",background:"none",
            borderBottom:tab===t.id?"3px solid #1E6FDB":"3px solid transparent",color:tab===t.id?"#1E6FDB":"#8A96A8",marginBottom:-1,transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{padding:24}}>
        {tab==="bm"&&<div>
          <p style={{fontSize:12,color:"#8A96A8",marginTop:0,marginBottom:16}}>Edit branch manager names and employment status shown in reports.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12,marginBottom:20}}>
            {BRANCH_ORDER.map(b=>(
              <div key={b} style={{background:"#F7F9FC",borderRadius:10,padding:14,border:"1px solid #E4EAF2"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#0A1628"}}>{localBM[b]?.name}</div>
                <div style={{fontSize:10,color:"#8A96A8",marginBottom:10}}>{b}</div>
                <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Manager Name</label>
                <input className="input" value={localBM[b]?.manager||""} onChange={e=>setLocalBM(p=>({...p,[b]:{...p[b],manager:e.target.value}}))} style={{marginBottom:8,fontSize:12}}/>
                <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Employment Status{month&&year?` (${["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"][month-1]} ${year})`:""}</label>
                <div style={{marginBottom:8}}>
                  <StatusEditWidget status={localBM[b]?.mStatus||""} onSave={(newStatus,desc)=>saveBMStatus(b,newStatus,desc)} onViewHistory={setShowStatusHistoryModal?()=>{setStatusModalPerson(`BM_${b}`);setShowStatusHistoryModal(true);}:null}/>
                </div>
                <label style={{fontSize:10,fontWeight:700,color:"#F5A623",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>🏆 Reward Points Balance</label>
                <AdjustBalanceWidget personId={`BM_${b}`} balance={rewardBalances?.[`BM_${b}`]?.balance||0} adjustBalance={adjustBalance}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button className="btn btn-primary" onClick={saveBM}>{saved?"Saved!":"Save Changes"}</button>
          </div>
        </div>}
        {tab==="sr"&&<div>
          <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            <select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{width:"auto",minWidth:180,padding:"7px 28px 7px 10px",fontSize:12}}>
              <option value="ALL">All Branches ({localSR.length})</option>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{branchMeta[b]?.name} ({localSR.filter(s=>s.branch===b).length})</option>)}
            </select>
            <div style={{flex:1}}/>
            {srSaved&&<span style={{color:"#00C896",fontWeight:600,fontSize:12}}>Changes saved</span>}
            <button className="btn btn-success" onClick={()=>setEditSR("new")}>Add New SR</button>
          </div>
          {editSR==="new"&&<div style={{background:"rgba(0,200,150,.06)",borderRadius:12,padding:16,border:"1px solid rgba(0,200,150,.3)",marginBottom:16}}>
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
              <div style={{gridColumn:"1/-1"}}>
                <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Employment Status{month&&year?` (${["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"][month-1]} ${year})`:""}</label>
                {(()=>{
                  const ps=parseStatus(newSR.status);
                  return <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <select className="input select" value={ps.base} onChange={e=>setNewSR(p=>({...p,status:buildStatus(e.target.value,ps.p,ps.f)}))} style={{width:"auto",minWidth:110,padding:"4px 24px 4px 8px",fontSize:12}}>
                      {statusBaseOptions.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    {ps.base!=="Director"&&ps.base!=="Resigned"&&<>
                      <label style={{fontSize:11,color:"#8A96A8"}}>P</label>
                      <input type="number" min="0" className="input" value={ps.p} onChange={e=>setNewSR(p=>({...p,status:buildStatus(ps.base,Math.max(0,parseInt(e.target.value)||0),ps.f)}))} style={{width:54,padding:"4px 6px",fontSize:12,textAlign:"center"}}/>
                      <label style={{fontSize:11,color:"#8A96A8"}}>F</label>
                      <input type="number" min="0" className="input" value={ps.f} onChange={e=>setNewSR(p=>({...p,status:buildStatus(ps.base,ps.p,Math.max(0,parseInt(e.target.value)||0))}))} style={{width:54,padding:"4px 6px",fontSize:12,textAlign:"center"}}/>
                    </>}
                  </div>;
                })()}
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
              <button className="btn btn-ghost" onClick={()=>setEditSR(null)}>Cancel</button>
              <button className="btn btn-success" onClick={addSR}>Add SR</button>
            </div>
          </div>}
          <div className="card" style={{overflow:"visible"}}>
            <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
              <thead><tr style={{background:"#0A1628"}}>
                {["ID","Name","Branch","Type",`Employment Status${month&&year?` (${["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"][month-1]} ${year})`:""}`,"Points Balance",""].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filteredSR.map((sr,i)=>(
                <tr key={sr.id} className="shine-row" style={{borderBottom:"1px solid #E4EAF2",background:i%2===0?"#fff":"#F7F9FC"}}>
                  <td style={{padding:"8px 14px",color:"#8A96A8",fontSize:10}}>{sr.id}</td>
                  <td style={{padding:"8px 14px"}}>
                    {editSR?.id===sr.id
                      ?<input autoFocus className="input" style={{width:160,padding:"4px 8px",fontSize:12}} value={editSR.canon}
                          onChange={e=>setEditSR(p=>({...p,canon:e.target.value.toUpperCase()}))}
                          onBlur={async()=>{await updateSR(sr.id,"canon",editSR.canon);setEditSR(null);}}
                          onKeyDown={e=>{if(e.key==="Enter"){updateSR(sr.id,"canon",editSR.canon);setEditSR(null);}if(e.key==="Escape")setEditSR(null);}}/>
                      :<span style={{fontWeight:700,color:"#0A1628",cursor:"pointer",borderBottom:"1px dashed #E4EAF2"}} onClick={()=>setEditSR({...sr})}>{sr.canon}</span>
                    }
                  </td>
                  <td style={{padding:"8px 14px"}}>
                    <select className="input select" value={sr.branch} onChange={e=>updateSR(sr.id,"branch",e.target.value)} style={{width:"auto",minWidth:80,padding:"4px 24px 4px 8px",fontSize:11}}>
                      {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"8px 14px"}}>
                    <select className="input select" value={sr.type} onChange={e=>updateSR(sr.id,"type",e.target.value)} style={{width:"auto",padding:"4px 24px 4px 8px",fontSize:11}}>
                      <option value="Online">Online</option><option value="Offline">Offline</option>
                    </select>
                  </td>
                  <td style={{padding:"8px 14px"}}>
                    <StatusEditWidget status={sr.status} onSave={(newStatus,desc)=>saveSRStatus(sr.id,newStatus,desc)} onViewHistory={setShowStatusHistoryModal?()=>{setStatusModalPerson(sr.id);setShowStatusHistoryModal(true);}:null}/>
                  </td>
                  <td style={{padding:"8px 14px"}}>
                    <AdjustBalanceWidget personId={sr.id} balance={rewardBalances?.[sr.id]?.balance||0} adjustBalance={adjustBalance}/>
                  </td>
                  <td style={{padding:"8px 14px",textAlign:"right"}}>
                    <button className="btn btn-danger" onClick={()=>removeSR(sr.id)}>Remove</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            </div>
          </div>
          <p style={{fontSize:11,color:"#8A96A8",marginTop:8}}>Click SR name to edit inline. Other fields save immediately on change.</p>
        </div>}
      </div>
    </div>
  </div>;
}


// ─── DAILY ENTRY ──────────────────────────────────────────
function DailyEntry({records,setRecords,srList,branchMeta,month,year,days,recordsKey,onRepairSave}){
  const now = new Date();
  const defaultDay = days.includes(now.getDate())?now.getDate():days[days.length-1];
  const [selDay,setSelDay]         = useState(defaultDay);
  const [selBranch,setSelBranch]   = useState(BRANCH_ORDER[0]);
  const [saving,setSaving]         = useState(false);
  const [saved,setSaved]           = useState(false);
  const [localInputs,setLocalInputs] = useState({});

  const dateKey = `${selDay}/${month}/${year}`;
  const bSRs = srList.filter(s=>s.branch===selBranch);

  // Load data whenever day or branch changes
  useEffect(()=>{
    const d = records[dateKey]||{};
    const init = {};
    srList.filter(s=>s.branch===selBranch).forEach(sr=>{
      init[sr.id]={walkin:d[sr.id]?.walkin||0, aeon:d[sr.id]?.aeon||0};
    });
    init[`BM_${selBranch}`]={unalloc:d[`BM_${selBranch}`]?.unalloc||0};
    init[`REPAIR_${selBranch}`]=0;
    setLocalInputs(init);
    // Load repair from repair storage
    const repKey=`emax_v5_repair_${year}_${month}`;
    (async()=>{
      try{
        const rd=await loadData(repKey)||{};
        setLocalInputs(p=>({...p,[`REPAIR_${selBranch}`]:rd[selDay]||0}));
      }catch{}
    })();
  },[selDay,selBranch,month,year]);

  const set=(id,field,val)=>setLocalInputs(p=>({...p,[id]:{...p[id],[field]:parseFloat(val)||0}}));
  const setRepair=(val)=>setLocalInputs(p=>({...p,[`REPAIR_${selBranch}`]:parseFloat(val)||0}));

  const save=async()=>{
    setSaving(true);
    const nr={...records};
    if(!nr[dateKey])nr[dateKey]={};
    bSRs.forEach(sr=>{
      if(!nr[dateKey][sr.id])nr[dateKey][sr.id]={walkin:0,aeon:0,repair:0};
      nr[dateKey][sr.id].walkin=localInputs[sr.id]?.walkin||0;
      nr[dateKey][sr.id].aeon=localInputs[sr.id]?.aeon||0;
    });
    const bmKey=`BM_${selBranch}`;
    if(!nr[dateKey][bmKey])nr[dateKey][bmKey]={walkin:0,aeon:0,unalloc:0};
    nr[dateKey][bmKey].unalloc=localInputs[bmKey]?.unalloc||0;
    await saveData(recordsKey,nr);
    // Auto-snapshot current SR statuses for this month
    const snapKey=`emax_v5_status_${year}_${month}`;
    const existingSnap=await loadData(snapKey)||{};
    srList.forEach(sr=>{if(!existingSnap[sr.id])existingSnap[sr.id]={status:sr.status,active:true};});
    await saveData(snapKey,existingSnap);
    const repairStoreKey=`emax_v5_repair_${year}_${month}`;
    try{
      const rd=await loadData(repairStoreKey)||{};
      const repVal=localInputs[`REPAIR_${selBranch}`]||0;
      if(repVal>0)rd[selDay]=repVal; else delete rd[selDay];
      await saveData(repairStoreKey,rd);
      if(onRepairSave)onRepairSave();
    }catch{}
    setRecords(nr);setSaving(false);setSaved(true);
    setTimeout(()=>setSaved(false),2000);
  };

  // NumInput keeps own string state so typing is smooth (no float re-parse mid-keystroke)
  const NumInput=({value,onChange,accent="#E4EAF2"})=>{
    const [str,setStr]=useState(value===0?"":String(value));
    // Sync if parent value changes (e.g. switching day/branch)
    const prev=useRef(value);
    useEffect(()=>{
      if(prev.current!==value){
        prev.current=value;
        setStr(value===0?"":String(value));  // negative values: String(-15.51) = "-15.51" ✓
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

  const branchDayTotal=bSRs.reduce((s,sr)=>s+(localInputs[sr.id]?.walkin||0)+(localInputs[sr.id]?.aeon||0),0)
    +(localInputs[`BM_${selBranch}`]?.unalloc||0);

  const TH=(label,color="rgba(255,255,255,.7)")=>(
    <th style={{padding:"10px 14px",fontWeight:700,fontSize:10,color,textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap",textAlign:label==="Walk In (RM)"||label==="Invoice (RM)"||label==="Day Total"?"right":"left"}}>{label}</th>
  );

  return <div className="fade-in">
    {/* Header */}
    <div style={{background:"#0A1628",borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
      <div>
        <h2 style={{fontWeight:800,fontSize:14,color:"#fff",margin:0}}>Daily Entry</h2>
        <p style={{fontSize:11,color:"rgba(255,255,255,.45)",margin:0,marginTop:2}}>Enter figures — auto-posts to Monthly Report</p>
      </div>
      <button onClick={save} disabled={saving}
        style={{padding:"9px 24px",border:"none",borderRadius:8,cursor:saving?"wait":"pointer",fontWeight:700,fontSize:13,fontFamily:"Inter,sans-serif",
          background:saved?"#00C896":"linear-gradient(135deg,#1E6FDB,#2D85F0)",color:"#fff",transition:"all .2s"}}>
        {saved?"Saved!":saving?"Saving...":"Save to Monthly Report"}
      </button>
    </div>

    {/* Day + Branch selectors */}
    <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}>
      <div>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Date</label>
        <select value={selDay} onChange={e=>setSelDay(Number(e.target.value))} className="input select" style={{width:"auto",minWidth:130,fontSize:13}}>
          {days.map(d=><option key={d} value={d}>{d}/{month}/{year}</option>)}
        </select>
      </div>
      <div>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Branch</label>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {BRANCH_ORDER.map(b=>(
            <button key={b} onClick={()=>setSelBranch(b)} style={{padding:"6px 12px",border:"none",cursor:"pointer",borderRadius:6,fontWeight:700,fontSize:11,fontFamily:"Inter,sans-serif",
              background:selBranch===b?"#0A1628":"#fff",color:selBranch===b?"#fff":"#4A5568",
              outline:selBranch===b?"none":"1px solid #E4EAF2",transition:"all .15s"}}>
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* Day total */}
    <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"8px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
      <span style={{color:"#1E40AF",fontWeight:600}}>Branch Day Total — {selDay}/{month}/{year}</span>
      <span style={{fontWeight:800,color:"#1E6FDB",fontSize:14}}>{fRM(branchDayTotal)}</span>
    </div>

    {/* Entry table */}
    <div className="card" style={{overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
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
              <NumInput value={localInputs[`BM_${selBranch}`]?.unalloc||0} onChange={v=>set(`BM_${selBranch}`,"unalloc",v)} accent="#BBF7D0"/>
            </td>
            <td style={{padding:"8px 14px",textAlign:"right",color:"#CDD5E0"}}>—</td>
            <td style={{padding:"8px 14px",textAlign:"right",fontWeight:700,color:"#052E20"}}>
              {(localInputs[`BM_${selBranch}`]?.unalloc||0)>0?fRM(localInputs[`BM_${selBranch}`]?.unalloc||0):"—"}
            </td>
          </tr>

          {/* Repair */}
          <tr style={{background:"#FAF5FF"}}>
            <td style={{padding:"8px 16px"}}>
              <div style={{fontWeight:700,color:"#3D1A78"}}>Repair & Service</div>
              <div style={{fontSize:10,color:"#7C3AED",marginTop:1}}>Excluded from targets</div>
            </td>
            <td style={{padding:"8px 16px"}}>
              <span style={{background:"#F5F3FF",color:"#6D28D9",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:600}}>R&S</span>
            </td>
            <td style={{padding:"6px 10px"}}>
              <NumInput value={localInputs[`REPAIR_${selBranch}`]||0} onChange={setRepair} accent="#DDD6FE"/>
            </td>
            <td style={{padding:"8px 14px",textAlign:"right",color:"#CDD5E0"}}>—</td>
            <td style={{padding:"8px 14px",textAlign:"right",fontWeight:700,color:"#3D1A78"}}>
              {(localInputs[`REPAIR_${selBranch}`]||0)>0?fRM(localInputs[`REPAIR_${selBranch}`]||0):"—"}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr style={{background:"#0A1628",fontSize:12}}>
            <td colSpan={2} style={{padding:"10px 16px",fontWeight:600,color:"rgba(255,255,255,.6)"}}>Branch Total (excl. Repair)</td>
            <td style={{padding:"10px 14px",textAlign:"right",color:"rgba(255,255,255,.5)",fontSize:11}}>{fRM(bSRs.reduce((s,sr)=>s+(localInputs[sr.id]?.walkin||0),0)+(localInputs[`BM_${selBranch}`]?.unalloc||0))}</td>
            <td style={{padding:"10px 14px",textAlign:"right",color:"rgba(255,255,255,.5)",fontSize:11}}>{fRM(bSRs.reduce((s,sr)=>s+(localInputs[sr.id]?.aeon||0),0))}</td>
            <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#fff"}}>{fRM(branchDayTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style={{fontSize:11,color:"#8A96A8",marginTop:10,textAlign:"center"}}>Click "Save to Monthly Report" to post all figures. Data appears instantly in Overview and Monthly Report.</p>
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

function StatusHistoryModal({srList,branchMeta,statusHistory,onClose,initialPerson}){
  const people=[
    ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:branchMeta[b]?.manager||b,role:`${b} — Branch Manager`})),
    ...srList.map(sr=>({id:sr.id,name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}))
  ];
  const [selPerson,setSelPerson]=useState(initialPerson||people[0]?.id);
  const person=people.find(p=>p.id===selPerson);
  const currentStatus=(selPerson&&selPerson.startsWith("BM_"))?branchMeta[selPerson.replace("BM_","")]?.mStatus:srList.find(s=>s.id===selPerson)?.status;
  const history=(statusHistory[selPerson]||[]).slice().reverse();

  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid #E4EAF2"}}>
        <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>📋 Employment Status History</h2>
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
          <div style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:2}}>Current Status</div>
        </div>
        <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>{currentStatus||"—"}</div>
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

function PointsHistoryModal({srList,branchMeta,rewardBalances,rewardHistory,onClose,initialPerson}){
  const people=[
    ...BRANCH_ORDER.map(b=>({id:`BM_${b}`,name:branchMeta[b]?.manager||b,role:`${b} — Branch Manager`})),
    ...srList.map(sr=>({id:sr.id,name:sr.canon,role:`${sr.branch} — ${sr.type} SR`}))
  ];
  const [selPerson,setSelPerson]=useState(initialPerson||people[0]?.id);
  const person=people.find(p=>p.id===selPerson);
  const balance=rewardBalances[selPerson]?.balance||0;
  const history=(rewardHistory[selPerson]||[]).slice().reverse();

  return <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
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

export default function App(){
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
  const [tab,setTab]               = useState("overview");
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [showPointsModal,setShowPointsModal] = useState(false);
  const [showStatusHistoryModal,setShowStatusHistoryModal] = useState(false);
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
  const rankingPeriod = lastDataDay ? `${pad2(1)}/${pad2(month)}/${year}-${pad2(lastDataDay)}/${pad2(month)}/${year}` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1]} ${year}`;
  const [repairRefresh,setRepairRefresh] = useState(0);
  const [rewardBalances,setRewardBalances] = useState({});
  const [rewardHistory,setRewardHistory] = useState({});
  const [statusHistory,setStatusHistory] = useState({});
  const [lockedMonths,setLockedMonths] = useState({});
  const [showTargetModal,setShowTargetModal] = useState(false);
  const [showSRModal,setShowSRModal]         = useState(false);
  const [printBranch,setPrintBranch]         = useState(null);
  const summaryRef = useRef();

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

  useEffect(()=>{
    setLoading(true);
    setRecords({});
    setSelStartDay(1);
    setSelEndDay(daysInMonth(selMonth,selYear));
    const snapKey=`emax_v5_status_${selYear}_${selMonth}`;
    const monthKey=`${selYear}_${selMonth}`;
    Promise.all([loadData(recordsKey),loadData(TARGET_KEY),loadData(SR_KEY),loadData(BM_KEY),loadData(snapKey),loadData("emax_v5_reward_balance"),loadData("emax_v5_locked_months"),loadData("emax_v5_reward_history"),loadData("emax_v5_status_history")]).then(([r,t,srData,bmData,snap,rb,lm,rh,sh])=>{
      setRecords(r||{});
      const baseSR=(srData&&Array.isArray(srData)&&srData.length>0)?srData:DEFAULT_SR;
      // Overlay historical status snapshot if viewing a past month
      if(snap&&Object.keys(snap).length>0){
        const merged=baseSR.map(sr=>snap[sr.id]?{...sr,status:snap[sr.id].status,active:snap[sr.id].active!==false}:{...sr});
        setSrList(merged.filter(sr=>sr.active!==false));
      } else {
        setSrList(baseSR);
      }
      if(bmData&&Object.keys(bmData).length>0)setBranchMeta({...DEFAULT_BRANCH_META,...bmData});
      if(t&&t.bm)setTargets({bm:{...DEFAULT_TARGETS.bm,...t.bm},bmBonus:{...DEFAULT_TARGETS.bmBonus,...(t.bmBonus||{})},sr:{...DEFAULT_TARGETS.sr,...t.sr}});
      else setTargets(DEFAULT_TARGETS);
      setRewardBalances(rb||{});
      setLockedMonths(lm||{});
      setRewardHistory(rh||{});
      setStatusHistory(sh||{});
      setLoading(false);
    });
  },[selMonth,selYear]);

  const handleEdit=async(dateKey,srId,field,value)=>{
    const nr={...records};
    if(!nr[dateKey])nr[dateKey]={};
    if(!nr[dateKey][srId])nr[dateKey][srId]={walkin:0,aeon:0,unalloc:0,repair:0};
    nr[dateKey][srId][field]=value;
    setRecords(nr);await saveData(recordsKey,nr);
  };

  // ─── REWARD POINTS: lock a branch's month, crediting all SR + BM earned points to balance ───
  const monthKeyStr=`${selYear}_${selMonth}`;
  const isBranchLocked=(branchId)=>!!lockedMonths[monthKeyStr]?.[branchId];
  const pointsAsOfFor=(branchId)=>{
    if(isBranchLocked(branchId)){
      const lastDay=daysInMonth(selMonth,selYear);
      return `${String(lastDay).padStart(2,"0")}/${String(selMonth).padStart(2,"0")}/${selYear}`;
    }
    // Not locked: show as at last day of previous month
    const prevDate=new Date(selYear,selMonth-1,0); // day 0 of selMonth = last day of previous month
    return `${String(prevDate.getDate()).padStart(2,"0")}/${String(prevDate.getMonth()+1).padStart(2,"0")}/${prevDate.getFullYear()}`;
  };
  const lockBranchMonth=async(branchId)=>{
    if(isBranchLocked(branchId)){alert("This branch's "+selMonth+"/"+selYear+" report is already locked.");return;}
    const bSRs=srList.filter(s=>s.branch===branchId);
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
      const cur=updates[sr.id]||{balance:0,asOf:""};
      updates[sr.id]={...cur,balance:(cur.balance||0)+earned};
      const hist=historyUpdates[sr.id]||[];
      historyUpdates[sr.id]=[...hist,{date:new Date().toISOString(),type:"credit",amount:earned,note:`${noteMonth} performance (${srPct.toFixed(1)}%)`}];
      // Employment status: target hit -> P+1, not hit -> F+1 (skip Director/Resigned)
      const ps=parseStatus(sr.status);
      if(ps.base==="Director"||ps.base==="Resigned"||srTarget<=0)return sr;
      const hit=srTotal>=srTarget;
      const newStatus=buildStatus(ps.base,hit?ps.p+1:ps.p,hit?ps.f:ps.f+1);
      const sHist=statusUpdates[sr.id]||[];
      statusUpdates[sr.id]=[...sHist,{date:new Date().toISOString(),status:newStatus,note:`Auto-updated on lock: ${noteMonth} personal target ${hit?"hit":"missed"} (${srPct.toFixed(1)}%)`}];
      return{...sr,status:newStatus};
    });
    setSrList(updatedSRList);
    await saveData(SR_KEY,updatedSRList);

    // BM points + employment status P/F update
    const bmEarned=calcRewardPoints(branchPct,branchPct);
    const bmKey=`BM_${branchId}`;
    const curBM=updates[bmKey]||{balance:0,asOf:""};
    updates[bmKey]={...curBM,balance:(curBM.balance||0)+bmEarned};
    const bmHist=historyUpdates[bmKey]||[];
    historyUpdates[bmKey]=[...bmHist,{date:new Date().toISOString(),type:"credit",amount:bmEarned,note:`${noteMonth} branch performance (${branchPct.toFixed(1)}%)`}];

    if(bTarget>0){
      const bmMeta=branchMeta[branchId]||{};
      const bps=parseStatus(bmMeta.mStatus);
      if(bps.base!=="Director"&&bps.base!=="Resigned"){
        const bmHit=bTotal>=bTarget;
        const newBMStatus=buildStatus(bps.base,bmHit?bps.p+1:bps.p,bmHit?bps.f:bps.f+1);
        const newBranchMeta={...branchMeta,[branchId]:{...bmMeta,mStatus:newBMStatus}};
        setBranchMeta(newBranchMeta);
        await saveData(BM_KEY,newBranchMeta);
        const bmStatusKey=`BM_${branchId}`;
        const bmSHist=statusUpdates[bmStatusKey]||[];
        statusUpdates[bmStatusKey]=[...bmSHist,{date:new Date().toISOString(),status:newBMStatus,note:`Auto-updated on lock: ${noteMonth} branch target ${bmHit?"hit":"missed"} (${branchPct.toFixed(1)}%)`}];
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
  // Manually adjust a person's points balance by +/- delta, with a required description.
  // This appends a history entry instead of overwriting the balance.
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
  const handleSaveTargets=async(t)=>{setTargets(t);await saveData(TARGET_KEY,t);};

  const branchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b);let wi=0,ae=0;
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
      const bSRs=srList.filter(s=>s.branch===b);let wi=0,ae=0;
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
  const rankEndDay=lastDataDay||daysInMonth(month,year);
  const rankBranchTotals=useMemo(()=>{
    const t={};
    BRANCH_ORDER.forEach(b=>{
      const bSRs=srList.filter(s=>s.branch===b);let wi=0,ae=0;
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

  const bmRanking=useMemo(()=>[...BRANCH_ORDER].map(b=>{
    const profit=rankBranchTotals[b]?.total||0,target=targets?.bm?.[b]||0,bonus=targets?.bmBonus?.[b]||0;
    const bonusEarned=target>0&&profit>=target&&bonus>0,p=pctN(profit,target);
    return{name:branchMeta[b]?.manager,status:branchMeta[b]?.mStatus,branch:b,sub:null,wi:rankBranchTotals[b]?.wi||0,ae:rankBranchTotals[b]?.ae||0,profit,target,bonus,bonusEarned,branchPct:p,role:"bm",points:calcRewardPoints(p,p)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target)),[rankBranchTotals,targets,branchMeta]);

  const mkSRRank=type=>srList.filter(s=>s.type===type).map(s=>{
    const profit=rankSRTotals[s.id]?.total||0,target=targets?.sr?.[s.id]?.target||0,bonus=targets?.sr?.[s.id]?.bonus||0;
    const bTarget=targets?.bm?.[s.branch]||0,bTotal=rankBranchTotals[s.branch]?.total||0;
    const branchHit=bTarget>0&&bTotal>=bTarget,p=pctN(profit,target),branchPct=pctN(bTotal,bTarget);
    return{name:s.canon,status:s.status,branch:s.branch,sub:null,wi:rankSRTotals[s.id]?.wi||0,ae:rankSRTotals[s.id]?.ae||0,profit,target,bonus,bonusEarned:branchHit&&profit>=target&&bonus>0,branchPct,role:"sr",points:calcRewardPoints(p,branchPct)};
  }).sort((a,b)=>pctN(b.profit,b.target)-pctN(a.profit,a.target));

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

  const TABS=[
    {id:"overview",label:"Overview"},
    {id:"rankings",label:"Rankings"},
    {id:"points",label:"Reward Point Ranking"},
    {id:"report",label:"Monthly Report"},
    {id:"daily",label:"Daily Entry"},
    {id:"repair",label:"Repair & Service"},
  ];

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
          {/* Month/Year Picker */}
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
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
          </div>
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
              ...srList.map(sr=>({id:sr.id,name:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
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
            {BRANCH_ORDER.map(b=>(
              <button key={b} onClick={()=>setSelBranch(b)} style={{padding:"4px 12px",cursor:"pointer",borderRadius:6,fontWeight:700,fontSize:11,fontFamily:"Inter,sans-serif",
                background:selBranch===b?"#0A1628":"#fff",color:selBranch===b?"#fff":"#4A5568",
                border:selBranch===b?"none":"1px solid #E4EAF2",transition:"all .15s"}}>
                {b}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            {isBranchLocked(selBranch)
              ? <span style={{padding:"6px 14px",background:"#F0FDF4",color:"#15803D",borderRadius:7,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>🔒 Locked — Points Credited</span>
              : <button className="btn btn-ghost" onClick={()=>{if(confirm(`Lock ${selBranch} for ${selMonth}/${selYear}? This credits all SR + BM reward points earned this month to their running balance. This cannot be undone.`))lockBranchMonth(selBranch);}} style={{fontSize:11}}>🔒 Lock Month & Credit Points</button>}
            <button className="btn btn-primary" onClick={()=>setPrintBranch(selBranch)} style={{fontSize:11}}>Download {selBranch} Report</button>
          </div>
        </div>
        {(()=>{
          const bSRs=srList.filter(s=>s.branch===selBranch);
          const bTarget=targets?.bm?.[selBranch]||0,bTotal=fullMonthBranchTotals[selBranch]?.total||0;
          const branchPct=pctN(bTotal,bTarget);
          return <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14,alignItems:"start"}}>
              {bSRs.map(sr=><SRTable key={sr.id} sr={sr} records={records} targets={targets} branchPct={branchPct} onEdit={handleEdit} printMode={false} month={month} year={year} days={days} rewardBalance={rewardBalances[sr.id]?.balance||0} pointsAsOf={pointsAsOfFor(selBranch)}/>)}
              <BMTable branchId={selBranch} records={records} targets={targets} srList={srList} branchMeta={branchMeta} onEdit={handleEdit} printMode={false} month={month} year={year} days={days} rewardBalance={rewardBalances[`BM_${selBranch}`]?.balance||0} pointsAsOf={pointsAsOfFor(selBranch)}/>
            </div>
            {/* PDF Upload for all SR invoice */}
            <div style={{marginTop:22}}>
              <div style={{fontWeight:800,fontSize:12,color:"#0A1628",marginBottom:10,paddingBottom:7,borderBottom:"1px solid #E4EAF2",textTransform:"uppercase",letterSpacing:"0.06em"}}>Daily AEON Profit Report</div>
              <UploadPanel records={records} setRecords={setRecords} srList={srList} defaultBranch={selBranch} recordsKey={recordsKey}/>
            <PdfDownloads month={month} year={year} branch={selBranch} allowDelete/>
            </div>
          </div>;
        })()}
      </div>}



      {/* DAILY ENTRY */}
      {tab==="daily"&&<DailyEntry records={records} setRecords={setRecords} srList={srList} branchMeta={branchMeta} month={month} year={year} days={days} recordsKey={recordsKey} onRepairSave={()=>setRepairRefresh(r=>r+1)}/>}

      {/* REPAIR */}
      {tab==="repair"&&<RepairTab month={month} year={year} endDay={selEndDay} refreshKey={repairRefresh}/>}

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
            Manage SR
          </button>
          <button onClick={()=>{setShowStatusHistoryModal(true);setSidebarOpen(false);}} style={{
            display:"flex",alignItems:"center",width:"100%",textAlign:"left",padding:"9px 12px",marginBottom:3,
            border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:12,borderRadius:8,
            background:"transparent",color:"rgba(255,255,255,.45)",transition:"background .15s",
          }}>
            Status History
          </button>
        </div>
      </div>
    </div>{/* end flex layout */}

    {showTargetModal&&<TargetModal targets={targets} setTargets={handleSaveTargets} srList={srList} branchMeta={branchMeta} onClose={()=>setShowTargetModal(false)}/>}
    {showSRModal&&<SRBMModal srList={srList} setSrList={setSrList} branchMeta={branchMeta} setBranchMeta={setBranchMeta} onClose={()=>setShowSRModal(false)} rewardBalances={rewardBalances} adjustBalance={adjustBalance} statusHistory={statusHistory} setStatusHistory={setStatusHistory} month={month} year={year} setShowStatusHistoryModal={setShowStatusHistoryModal} setStatusModalPerson={setStatusModalPerson}/>}
    {printBranch&&<PrintBranchReport branchId={printBranch} records={records} targets={targets} srList={srList} branchMeta={branchMeta} onClose={()=>setPrintBranch(null)} month={month} year={year} days={days}/>}
    {showPointsModal&&<PointsHistoryModal srList={srList} branchMeta={branchMeta} rewardBalances={rewardBalances} rewardHistory={rewardHistory} initialPerson={pointsModalPerson} onClose={()=>{setShowPointsModal(false);setPointsModalPerson(null);}}/>}
    {showStatusHistoryModal&&<StatusHistoryModal srList={srList} branchMeta={branchMeta} statusHistory={statusHistory} initialPerson={statusModalPerson} onClose={()=>{setShowStatusHistoryModal(false);setStatusModalPerson(null);}}/>}
  </div>;
}
