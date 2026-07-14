import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];
const PAYMENT_METHODS=["RHB","Public Bank"];

const PHASES=[
  {id:"stock",label:"Stock Order",steps:[1,2,3],color:"#1E6FDB",bg:"#EFF6FF"},
  {id:"transfer",label:"Stock Transfer",steps:[4,5],color:"#7C3AED",bg:"#F5F3FF"},
  {id:"billing",label:"Billing",steps:[6,7,8],color:"#B45309",bg:"#FFFBEB"},
  {id:"agreement_hq",label:"Agreement → HQ",steps:[9,10],color:"#0891B2",bg:"#ECFEFF"},
  {id:"unclaimed",label:"Unclaimed",steps:[11],color:"#DC2626",bg:"#FEF2F2"},
  {id:"claimed",label:"Claimed",steps:[12],color:"#15803D",bg:"#F0FDF4"},
];
const STEPS=[
  {step:1,label:"New Order Request",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsOrderDate:true,needsRemark:true},
  {step:3,label:"Arrived HQ",desc:"Item received at HQ.",who:"admin",phase:"stock"},
  {step:4,label:"Dispatched to Branch",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",desc:"Submit billing request form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",desc:"Customer collects device and payment received.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Collection Proof"},{key:"paymentProof",label:"Payment Proof"}]},
  {step:9,label:"Collection Verified",desc:"HQ verifies collection and upfront payment.",who:"admin",phase:"agreement_hq",needsVerification:true},
  {step:10,label:"Agreement Checklist",desc:"Branch completes agreement checklist.",who:"both",phase:"agreement_hq",needsChecklist:true},
  {step:11,label:"Agreement at HQ",desc:"HQ receives original signed agreement.",who:"admin",phase:"unclaimed",canReverse:true},
  {step:12,label:"Claimed",desc:"Claim released. Enter claim sent date and knock-off date.",who:"admin",phase:"claimed"},
  {step:13,label:"Completed",desc:"Order completed and archived.",who:"admin",phase:"claimed"},
];
const CHECKLIST_ITEMS=["Aeon Application Form (3 pages)","Invoice","Result List","Notice 1 — Application (2 pages × 2 sets)","Notice 2 — Approval (8 pages)","Agreement (16 pages)","IC Copy","AutoDebit Form (Personal Account)","Bank Proof (Personal Account)"];

// Returns steps visible in timeline for a given order
function getVisibleSteps(order){
  const isCash=order.orderType==="cash";
  const isReady=order.stockStatus==="ready";
  if(isCash){
    // Cash: 1, (2,3 if not ready), 4,5,6,7,8,9 then done
    const base=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9];
    return STEPS.filter(s=>base.includes(s.step));
  }
  // CCM: all 1-12
  if(isReady){
    // Show 1-4 as collapsed (auto), then 4-12
    return STEPS.filter(s=>s.step<=12);
  }
  return STEPS.filter(s=>s.step<=12);
}

// Returns the "next" step number for a given order
function nextStepNum(order){
  const isCash=order.orderType==="cash";
  const isReady=order.stockStatus==="ready";
  const cur=order.step;
  if(isCash){
    const seq=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,13]; // 13=completed for cash
    const idx=seq.indexOf(cur);
    return idx>=0&&idx<seq.length-1?seq[idx+1]:null;
  }
  return cur<12?cur+1:null;
}

// Max step for progress calculation
function maxStep(order){
  return order.orderType==="cash"?9:12;
}

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>{const d=new Date();return`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
const fDT=(date,time)=>date?(time?`${fDate(date)} ${time}`:fDate(date)):"—";
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];
const getPhase=step=>PHASES.find(p=>p.steps.includes(step));
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";
const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:f.name,data:r.result});r.readAsDataURL(f);});
const calcUpfront=o=>{const a=parseFloat(o.agreementFee)||0,s=parseFloat(o.stampingFee)||0,d=parseFloat(o.deposit)||0;return{a,s,d,total:a+s+d};};

/* ── Icons ────────────────────────────────────────────────────────────── */
const Ic={
  box:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1"y="3"width="22"height="5"/><line x1="10"y1="12"x2="14"y2="12"/></svg>,
  truck:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><rect x="1"y="3"width="15"height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5"cy="18.5"r="2.5"/><circle cx="18.5"cy="18.5"r="2.5"/></svg>,
  card:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><rect x="1"y="4"width="22"height="16"rx="2"/><line x1="1"y1="10"x2="23"y2="10"/></svg>,
  fileText:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16"y1="13"x2="8"y2="13"/><line x1="16"y1="17"x2="8"y2="17"/><line x1="10"y1="9"x2="8"y2="9"/></svg>,
  checkCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  alertCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>,
  plus:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round"><line x1="12"y1="5"x2="12"y2="19"/><line x1="5"y1="12"x2="19"y2="12"/></svg>,
  chevL:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevR:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  edit:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  rotate:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>,
  download:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12"y1="15"x2="12"y2="3"/></svg>,
  check:<svg width="10"height="10"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3"strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:<svg width="10"height="10"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3"strokeLinecap="round"><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></svg>,
  clipboard:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8"y="2"width="8"height="4"rx="1"/></svg>,
  calendar:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><rect x="3"y="4"width="18"height="18"rx="2"/><line x1="16"y1="2"x2="16"y2="6"/><line x1="8"y1="2"x2="8"y2="6"/><line x1="3"y1="10"x2="21"y2="10"/></svg>,
  lightning:<svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  cash:<svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><line x1="12"y1="1"x2="12"y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
};
const PHASE_ICONS={stock:Ic.box,transfer:Ic.truck,billing:Ic.card,agreement_hq:Ic.fileText,unclaimed:Ic.alertCircle,claimed:Ic.checkCircle};

/* ── Design tokens (matching App.jsx) ────────────────────────────────── */
const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1E6FDB",blueBright:"#2D85F0",yellow:"#FFD500",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const inp={width:"100%",padding:"8px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",color:C.text,outline:"none",background:C.white,boxSizing:"border-box"};
const lbl={fontSize:10,fontWeight:700,color:C.textLight,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)"};

/* ── Primitives ───────────────────────────────────────────────────────── */
function L({children,req}){return<label style={lbl}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;}
function I(p){return<input style={{...inp,...p.style}} {...p}/>;}
function SEL({children,...p}){return<select style={{...inp,appearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238A96A8'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",paddingRight:28,...p.style}} {...p}>{children}</select>;}
function TX(p){return<textarea style={{...inp,resize:"vertical",...p.style}} {...p}/>;}
function Divider(){return<div style={{height:1,background:C.border,margin:"14px 0"}}/>;}

function PBtn({children,onClick,disabled,style={}}){
  return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:C.white,border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":`0 2px 8px rgba(30,111,219,.3)`,transition:"all .15s",...style}}>{children}</button>;
}
function GBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",...style}}>{children}</button>;
}
function DBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 13px",background:"transparent",color:"#DC2626",border:"1px solid rgba(220,38,38,.3)",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;
}

/* ── Section header matching dashboard style ─────────────────────────── */
function SecHdr({icon,children,right}){
  return<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
    <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,color:C.text,textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:C.blue}}>{icon}</span>}{children}</div>
    {right&&<div>{right}</div>}
  </div>;
}
function InfoCell({label,value}){return<div><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2,fontWeight:600}}>{label}</div><div style={{fontSize:12,fontWeight:600,color:C.text}}>{value||"—"}</div></div>;}

/* ── Phase Progress Bar ───────────────────────────────────────────────── */
function PhaseBar({step,order}){
  const mxS=order?maxStep(order):12;
  const pct=Math.round(((Math.min(step,mxS)-1)/(mxS-1))*100);
  const ph=getPhase(step);
  return(
    <div>
      <div style={{display:"flex",alignItems:"flex-start",gap:0,marginBottom:12}}>
        {(order?.orderType==="cash"?PHASES.filter(p=>["stock","transfer","billing","agreement_hq"].includes(p.id)):PHASES).map((p,i,arr)=>{
          const maxS=Math.max(...p.steps),done=step>maxS,active=p.steps.includes(step);
          return<div key={p.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
            <div style={{display:"flex",alignItems:"center",width:"100%"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:done?C.navy:active?C.blue:"#E4EAF2",border:`2px solid ${done?C.navy:active?C.blue:"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .2s"}}>
                {done?Ic.check:active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{i+1}</span>}
              </div>
              {i<arr.length-1&&<div style={{flex:1,height:2,background:done?C.navy:"#E4EAF2",margin:"0 3px",transition:"background .3s"}}/>}
            </div>
            <div style={{marginTop:5,paddingLeft:1}}>
              <div style={{fontSize:9,fontWeight:700,color:active?ph.color:done?C.textMid:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",lineHeight:1.2}}>{p.label}</div>
            </div>
          </div>;
        })}
      </div>
      <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.blueBright})`,borderRadius:2,transition:"width .5s cubic-bezier(.4,0,.2,1)"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.textLight}}>
        <span>Step {step} of {mxS}</span><span style={{fontWeight:600,color:ph?.color||C.blue}}>{pct}%</span>
      </div>
    </div>
  );
}

/* ── Phase + Step badge ───────────────────────────────────────────────── */
function StepBadge({step}){
  const ph=getPhase(step),s=getStep(step);
  if(!ph)return null;
  return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,background:ph.bg,color:ph.color,border:`1px solid ${ph.color}30`,whiteSpace:"nowrap"}}>{s.label}</span>;
}

/* ── Timeline ─────────────────────────────────────────────────────────── */
function Timeline({order}){
  const cur=order.step;
  const isReady=order.stockStatus==="ready";
  const visSteps=getVisibleSteps(order);
  let lastPh=null;
  return<div>{visSteps.map((s,i)=>{
    const isAutoReady=isReady&&[2,3].includes(s.step);
    const done=cur>s.step||isAutoReady;
    const active=cur===s.step&&!isAutoReady;
    const hist=(order.history||[]).find(h=>h.step===s.step);
    const ph=getPhase(s.step),showPh=ph&&ph.id!==lastPh;
    if(ph)lastPh=ph.id;
    return<div key={s.step}>
      {showPh&&<div style={{fontSize:9,fontWeight:800,color:ph.color,textTransform:"uppercase",letterSpacing:"0.08em",padding:"8px 0 5px 36px",marginTop:i>0?8:0,borderBottom:`1px solid ${ph.color}20`,marginBottom:5,display:"flex",alignItems:"center",gap:5}}><span style={{color:ph.color}}>{PHASE_ICONS[ph.id]}</span>{ph.label}</div>}
      <div style={{display:"flex",position:"relative"}}>
        {i<visSteps.length-1&&<div style={{position:"absolute",left:11,top:24,width:1,height:"calc(100% + 2px)",background:done?`${ph?.color}40`:C.border,zIndex:0}}/>}
        <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:done?C.navy:active?C.blue:C.surface,border:`2px solid ${done?C.navy:active?C.blue:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:10,marginTop:1,color:"#fff",transition:"all .2s"}}>
          {done?Ic.check:active?<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{s.step}</span>}
        </div>
        <div style={{flex:1,paddingBottom:i<visSteps.length-1?11:0,paddingTop:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:done||active?600:400,color:done||active?C.text:"#9CA3AF"}}>{s.label}</span>
            {isAutoReady&&<span style={{background:"#EFF6FF",color:C.blue,padding:"1px 7px",borderRadius:20,fontSize:9,fontWeight:700,border:`1px solid ${C.blue}30`}}>Auto</span>}
            {active&&<span style={{background:"#FEF9C3",color:"#92400E",padding:"1px 7px",borderRadius:20,fontSize:9,fontWeight:700,border:"1px solid #FDE68A"}}>Current</span>}
            {hist?.date&&<span style={{fontSize:10,color:C.textLight}}>{fDT(hist.date,hist.time)}</span>}
          </div>
          {hist&&<div style={{marginTop:4,background:C.surface,borderRadius:7,padding:"6px 10px",border:`1px solid ${C.border}`,fontSize:11,color:C.textMid}}>
            {hist.orderDate&&<div style={{marginBottom:2,color:C.blue,fontWeight:600}}>{Ic.calendar} Order Date: {fDate(hist.orderDate)}{hist.supplierName?` · ${hist.supplierName}`:""}</div>}
            {hist.remark&&<div style={{marginBottom:2}}>Remark: {hist.remark}</div>}
            {hist.invoiceNo&&<div style={{marginBottom:2,color:C.blue,fontWeight:600}}>Invoice: {hist.invoiceNo}</div>}
            {hist.claimSentDate&&<div style={{marginBottom:2,color:"#0891B2",fontWeight:600}}>Claim Sent: {fDate(hist.claimSentDate)}</div>}
            {hist.knockOffDate&&<div style={{marginBottom:2,color:"#15803D",fontWeight:600}}>Knock-off: {fDate(hist.knockOffDate)}</div>}
            {hist.verificationRemark&&<div style={{marginBottom:2}}>Note: {hist.verificationRemark}</div>}
            {hist.upfrontPaymentDate&&<div style={{marginBottom:2,color:C.blue}}>Payment Date: {fDate(hist.upfrontPaymentDate)} · {hist.paymentMethod}</div>}
            {hist.returnRemark&&<div style={{marginBottom:2,color:"#DC2626",fontWeight:600}}>Returned: {hist.returnRemark}</div>}
            {hist.issueItems?.length>0&&<div style={{marginBottom:2,color:"#DC2626",fontSize:10}}>Issues: {hist.issueItems.join(" · ")}</div>}
            {hist.checklistItems&&<div style={{fontSize:10}}>{hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items</div>}
            {hist.collectionChecked!==undefined&&<div style={{fontSize:10,color:hist.collectionChecked?"#15803D":"#DC2626"}}>{hist.collectionChecked?"✓":"✗"} Collection · {hist.paymentChecked?"✓":"✗"} Payment verified</div>}
            {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&<a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:C.blue,textDecoration:"none",background:"#EFF6FF",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} {f.name}</a>)}
          </div>}
        </div>
      </div>
    </div>;
  })}</div>;
}

/* ── Billing Form ─────────────────────────────────────────────────────── */
function BillingForm({order,onSubmit,onCancel}){
  const [f,setF]=useState(order.billingData||{billingDate:nowDate(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",monthlyInstallment:""});
  const [fls,setFls]=useState({});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCashOrder=order.orderType==="cash";
  const REQUIRED=["billingDate","customerFullName","customerIC","customerHP","customerEmail","customerAddress","customerPostCode","customerCity","itemCode","imeiSerial",...(isCashOrder?[]:["cashPriceOnListing","monthlyInstallment"])];
  const missing=REQUIRED.filter(k=>!f[k]?.toString().trim());
  const submit=async()=>{if(missing.length)return;setSaving(true);const data={...f};for(const[k,file] of Object.entries(fls))if(file)data[k]=await readFile(file);onSubmit(data);setSaving(false);};
  const row=(k,l,t="text",req=false,full=false)=><div key={k} style={full?{gridColumn:"1/-1"}:{}}>
    <L req={req}>{l}</L>
    <I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&!f[k]?.toString().trim()?{borderColor:"#FECACA"}:{}}/>
  </div>;
  const sec=t=><div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.07em",paddingTop:4,borderBottom:`1px solid ${C.border}`,paddingBottom:6}}>{t}</div>;
  return<div style={{...card,marginBottom:16}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Billing Request Form</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>All marked fields are required</div></div>
    <div style={{padding:18}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {sec("Billing Info")}{row("billingDate","Billing Date","date",true)}<div/>
        {sec("Customer Details")}{row("customerFullName","Customer Full Name","text",true)}{row("customerIC","Customer IC No.","text",true)}{row("customerHP","HP Number","tel",true)}{row("customerEmail","Email","email",true)}{row("customerAddress","Address","text",true,true)}{row("customerPostCode","Post Code","text",true)}{row("customerCity","City","text",true)}
        {sec("Item Details")}{row("itemCode","Item Code","text",true)}{row("imeiSerial","IMEI / Serial No.","text",true)}{row("freeGiftItemCode","Free Gift Item Code")}{row("freeGiftItemName","Free Gift Item Name")}
        {order.orderType!=="cash"&&row("cashPriceOnListing","Cash Price on Result Listing (RM)","number",true)}
        {order.orderType!=="cash"&&row("monthlyInstallment","Monthly Installment (RM)","number",true)}
        {sec("File Uploads")}
        {(isCashOrder?[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image",false]]:[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image",false],["resultListFile","Result Listing File",true],["agreementFile","Agreement File",true]]).map(([k,l,req])=><div key={k}><L req={req}>{l}</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFls(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>{(fls[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2,fontWeight:600}}>✓ {fls[k]?.name||f[k]?.name}</div>}</div>)}
      </div>
      {missing.length>0&&<div style={{padding:"9px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill all required fields before submitting.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn><PBtn onClick={submit} disabled={!!missing.length||saving}>{saving?"Saving…":"Submit Billing Request"}</PBtn></div>
    </div>
  </div>;
}

/* ── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel,issueItems=[]}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const allChecked=items.every(x=>x.checked);
  return<div style={{...card,marginBottom:16}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Agreement Checklist</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Tick all items before sending to HQ</div></div>
    <div style={{padding:16}}>
      {items.map((item,i)=><div key={i} onClick={()=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x))} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:9,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":C.surface,border:`1px solid ${item.issue&&!item.checked?"#FECACA":item.checked?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
        <div style={{width:18,height:18,borderRadius:4,background:item.checked?C.navy:"#fff",border:`2px solid ${item.checked?C.navy:item.issue?"#EF4444":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .15s"}}>{item.checked&&Ic.check}</div>
        <span style={{fontSize:12,fontWeight:item.checked?600:400,color:item.issue&&!item.checked?"#DC2626":item.checked?"#15803D":C.textMid}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:10,marginLeft:7,fontWeight:700,color:"#DC2626"}}> ⚠ Flagged</span>}</span>
      </div>)}
      {!allChecked&&<div style={{padding:"8px 12px",background:"#FFFBEB",borderRadius:8,border:"1px solid #FDE68A",fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} All items must be ticked to proceed.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn><PBtn onClick={()=>allChecked&&onSubmit(items)} disabled={!allChecked}>Submit Checklist</PBtn></div>
    </div>
  </div>;
}

/* ── Report generators ────────────────────────────────────────────────── */
function downloadReport(orders,type,dateFilter){
  const isClaim=type==="claim";
  const filtered=orders.filter(o=>{
    if(isClaim) return o.claimSentDate&&(!dateFilter||o.claimSentDate===dateFilter)&&o.step>=12;
    const h=(o.history||[]).find(h=>h.step===9);
    return h&&h.upfrontPaymentDate&&(!dateFilter||h.upfrontPaymentDate===dateFilter);
  }).sort((a,b)=>(a.invoiceNo||"").localeCompare(b.invoiceNo||""));
  if(!filtered.length){alert(`No records found${dateFilter?` for ${fDate(dateFilter)}`:""}.`);return;}
  const dateStr=dateFilter?fDate(dateFilter):"All Dates";
  let rows="",total1=0,total2=0;
  if(isClaim){
    rows=filtered.map((o,i)=>{const fp=parseFloat(o.financePrice)||0;total1+=fp;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${o.merchant||"—"}</td><td>RM ${fp.toFixed(2)}</td><td>${fDate(o.claimSentDate)}</td><td>${fDate(o.knockOffDate)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="7"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td colspan="2"></td></tr>`;
  } else {
    rows=filtered.map((o,i)=>{const h=(o.history||[]).find(h=>h.step===9);const up=calcUpfront(o);const monthly=parseFloat(o.billingData?.monthlyInstallment||o.monthlyInstallment)||0;total1+=monthly;total2+=up.total;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${fDate(h?.upfrontPaymentDate)}</td><td>RM ${monthly.toFixed(2)}</td><td>RM ${up.total.toFixed(2)}</td><td>${h?.paymentMethod||"—"}</td><td>${h?.verificationRemark||"—"}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="7"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td><b>RM ${total2.toFixed(2)}</b></td><td colspan="2"></td></tr>`;
  }
  const title=isClaim?"Claim Sent Report":"Upfront Payment Report";
  const heads=isClaim?"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Merchant</th><th>Finance Price</th><th>Claim Sent Date</th><th>Knock-off Date</th>":"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Payment Date</th><th>1st Monthly (RM)</th><th>Total Due (RM)</th><th>Method</th><th>Remark</th>";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — ${dateStr}</title><style>body{font-family:Inter,sans-serif;margin:28px;color:#0A1628}h1{font-size:17px;font-weight:800;margin-bottom:2px}h2{font-size:12px;color:#8A96A8;margin:0 0 20px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0A1628;color:#fff;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em}td{padding:7px 10px;border-bottom:1px solid #E4EAF2}tr:nth-child(even) td{background:#F7F9FC}.tot td{background:#0A1628;color:#fff;font-size:12px}.footer{margin-top:16px;font-size:10px;color:#8A96A8}</style></head><body><h1>${title}</h1><h2>${dateStr} · ${filtered.length} record${filtered.length!==1?"s":""}</h2><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated ${new Date().toLocaleString("en-MY")} · EMAX Network Sdn Bhd</div></body></html>`;
  const w=window.open("","_blank");if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
}

/* ── Action Panel ─────────────────────────────────────────────────────── */
function ActionPanel({order,isAdmin,onUpdate,allOrders}){
  const step=order.step;
  const isCash=order.orderType==="cash";
  const nextStepN=nextStepNum(order);
  const nextDef=nextStepN?getStep(nextStepN):null;
  const [remark,setRemark]=useState("");
  const [invoiceNo,setInvoiceNo]=useState("");
  const [orderDate,setOrderDate]=useState(nowDate());
  const [supplierName,setSupplierName]=useState("");
  const [claimSentDate,setClaimSentDate]=useState(nowDate());
  const [knockOffDate,setKnockOffDate]=useState(nowDate());
  const [files,setFiles]=useState({});
  const [collection,setCollection]=useState(false);
  const [payment,setPayment]=useState(false);
  const [verRemark,setVerRemark]=useState("");
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [upfrontMonthly,setUpfrontMonthly]=useState(order.billingData?.monthlyInstallment||order.monthlyInstallment||"");
  const [payMethod,setPayMethod]=useState(PAYMENT_METHODS[0]);
  const [reportDate,setReportDate]=useState(nowDate());
  const [saving,setSaving]=useState(false);
  const [showBilling,setShowBilling]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(n=>({name:n,issue:false})));
  const upfront=calcUpfront(order);

  if(step===12&&!isCash){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.checkCircle}>Claimed — Enter Dates</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{background:"#F0FDF4",borderRadius:8,padding:"10px 12px",border:"1px solid #BBF7D0",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#15803D",fontWeight:600}}>{Ic.checkCircle} Claim released. Record claim sent and knock-off dates to complete.</div>
          {order.claimSentDate?<div style={{fontSize:12,marginBottom:8}}><span style={{color:C.textLight,fontWeight:600}}>Claim Sent: </span>{fDate(order.claimSentDate)}</div>:<div style={{marginBottom:10}}><L req>Claim Sent Out to Merchant Date</L><I type="date" value={claimSentDate} onChange={e=>setClaimSentDate(e.target.value)}/></div>}
          {order.knockOffDate?<div style={{fontSize:12,marginBottom:12}}><span style={{color:C.textLight,fontWeight:600}}>Knock-off Date: </span>{fDate(order.knockOffDate)}</div>:<div style={{marginBottom:12}}><L req>Knock-off Date</L><I type="date" value={knockOffDate} onChange={e=>setKnockOffDate(e.target.value)}/></div>}
          {(!order.knockOffDate||!order.claimSentDate)&&<PBtn onClick={async()=>{setSaving(true);const sd=claimSentDate||order.claimSentDate,kd=knockOffDate||order.knockOffDate;const h={step:12,date:nowDate(),time:nowTime(),note:"Claim sent and knock-off recorded",claimSentDate:sd,knockOffDate:kd};await onUpdate({...order,claimSentDate:sd,knockOffDate:kd,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||(!claimSentDate&&!order.claimSentDate)} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Save Dates"}</PBtn>}
          {order.knockOffDate&&isAdmin&&<><Divider/><DBtn onClick={async()=>{if(!confirm("Move to Completed?"))return;setSaving(true);const h={step:13,date:nowDate(),time:nowTime(),note:"Completed and archived"};await onUpdate({...order,step:13,history:[...(order.history||[]),h]});setSaving(false);}} style={{width:"100%",justifyContent:"center"}}>{Ic.trash} Mark as Completed</DBtn></>}
        </div>
      </div>
      {isAdmin&&<ReportCard allOrders={allOrders} reportDate={reportDate} setReportDate={setReportDate}/>}
    </div>;
  }
  if(step===13)return<div style={{background:"#F0FDF4",borderRadius:12,padding:"16px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:10}}>{Ic.checkCircle}<div><div style={{fontWeight:700,fontSize:14,color:"#15803D"}}>Order Completed</div><div style={{fontSize:11,color:"#166534",marginTop:2}}>Knock-off: {fDate(order.knockOffDate)}</div></div></div>;
  if(!nextDef)return null;
  const branchOk=isAdmin||[5,6,10].includes(nextDef.step);

  if(nextDef.step===6&&branchOk){
    if(showBilling)return<BillingForm order={order} onCancel={()=>setShowBilling(false)} onSubmit={async d=>{setSaving(true);const h={step:6,date:nowDate(),time:nowTime(),note:"Billing Request",billingData:d};await onUpdate({...order,step:6,billingData:d,history:[...(order.history||[]),h]});setSaving(false);setShowBilling(false);}}/>;
    return<ActionBox icon={Ic.clipboard} title="Billing Request" desc="Complete the billing form to advance."><PBtn onClick={()=>setShowBilling(true)} style={{width:"100%",justifyContent:"center"}}>Open Billing Form {Ic.chevR}</PBtn></ActionBox>;
  }
  if(nextDef.step===10){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    if(showChecklist)return<ChecklistForm issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async items=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items};await onUpdate({...order,step:10,checklistItems:items,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<ActionBox icon={Ic.clipboard} title="Agreement Checklist" desc="Complete checklist before sending to HQ."><PBtn onClick={()=>setShowChecklist(true)} style={{width:"100%",justifyContent:"center"}}>Open Checklist {Ic.chevR}</PBtn></ActionBox>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};for(const[k,f] of Object.entries(files))if(f)rf[k]=await readFile(f);
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,orderDate:nextDef.needsOrderDate?orderDate:undefined,supplierName:nextDef.needsOrderDate&&supplierName?supplierName:undefined,files:Object.keys(rf).length?rf:undefined,...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment,verificationRemark:verRemark||undefined,upfrontPaymentDate:upfrontDate,monthlyInstallment:upfrontMonthly,totalDue:upfront.total,paymentMethod:payMethod}:{})};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(isCash&&nextDef.step===13){updated.step=13;}
    if(nextDef.needsOrderDate){updated.orderDate=orderDate;if(supplierName)updated.supplierName=supplierName;}
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    await onUpdate(updated);setSaving(false);setRemark("");setInvoiceNo("");setFiles({});setVerRemark("");setCollection(false);setPayment(false);
  };
  const ok=()=>{
    if(!branchOk)return false;
    if(nextDef.needsOrderDate&&isAdmin&&!orderDate)return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsFiles){const req=(nextDef.needsFiles||[]).filter(f=>!f.optional);if(isAdmin&&req.some(f=>!files[f.key]))return false;}
    return true;
  };

  return<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <ActionBox icon={Ic.chevR} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
      {!branchOk?<div style={{fontSize:12,color:C.textLight,fontStyle:"italic",padding:"2px 0"}}>Waiting for admin to process this step.</div>:<>
        {nextDef.needsOrderDate&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Order Date</L><I type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></div>
          <div><L>Supplier Name</L><I value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier name…"/></div>
        </div>}
        {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}><L>Remark / ETA / Order Details</L><TX value={remark} onChange={e=>setRemark(e.target.value)} rows={2} placeholder="ETA, order reference, notes…"/></div>}
        {nextDef.needsInvoiceNo&&isAdmin&&<>
          <div style={{marginBottom:12}}><L req>Sales Invoice Number</L><I value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
          <div style={{background:C.surface,borderRadius:9,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:12}}>
            <div style={{...lbl,marginBottom:8}}>Customer Upfront Payment Breakdown</div>
            {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>)}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:C.navy}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
          </div>
        </>}
        {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
          <div style={{...lbl,marginBottom:8}}>Verification Checklist</div>
          {[[collection,setCollection,"Customer Collection Proof verified"],[payment,setPayment,"Upfront Payment Proof verified"]].map(([val,setter,label],i)=><div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,background:val?"#F0FDF4":C.surface,border:`1px solid ${val?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
            <div style={{width:18,height:18,borderRadius:4,background:val?C.navy:"#fff",border:`2px solid ${val?C.navy:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .15s"}}>{val&&Ic.check}</div>
            <span style={{fontSize:12,color:val?"#15803D":C.text,fontWeight:val?600:400}}>{label}</span>
          </div>)}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,margin:"10px 0"}}>
            <div><L req>Upfront Payment Date</L><I type="date" value={upfrontDate} onChange={e=>setUpfrontDate(e.target.value)}/></div>
            <div><L>Payment Method</L><SEL value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
            <div><L>1st Monthly Installment (RM)</L><I type="number" value={upfrontMonthly} onChange={e=>setUpfrontMonthly(e.target.value)} placeholder={order.billingData?.monthlyInstallment||order.monthlyInstallment||""}/></div>
            <div><L>Total Due (RM)</L><div style={{...inp,background:C.surface,color:C.textLight}}>{fRM(upfront.total)}</div></div>
          </div>
          <div><L>Remark</L><I value={verRemark} onChange={e=>setVerRemark(e.target.value)} placeholder="Verification notes…"/></div>
        </div>}
        {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.filter(f=>!(isCash&&f.key==="collectionProof")).map(({key,label,optional})=><div key={key} style={{marginBottom:12}}><L req={!optional}>{label}{optional?" (optional)":""}</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>{files[key]&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {files[key].name}</div>}</div>)}
        {!nextDef.needsOrderDate&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&!nextDef.needsBillingForm&&<div style={{marginBottom:12}}><L>Remark (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
        <PBtn onClick={advance} disabled={!ok()||saving} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":`Confirm: ${nextDef.label}`} {!saving&&Ic.chevR}</PBtn>
      </>}
    </ActionBox>
    {step===11&&isAdmin&&(!showReturn
      ?<DBtn onClick={()=>setShowReturn(true)} style={{width:"100%",justifyContent:"center"}}>{Ic.rotate} Return Agreement to Branch</DBtn>
      :<div style={card}>
        <SecHdr icon={Ic.rotate}><span style={{color:"#DC2626"}}>Return Agreement to Branch</span></SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{marginBottom:12}}><L req>Return Remark</L><TX value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} placeholder="Reason for returning…" style={{borderColor:"#FECACA"}}/></div>
          <div style={{...lbl,marginBottom:8}}>Mark Problematic Items</div>
          {returnItems.map((item,i)=><div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,background:item.issue?"#FEF2F2":C.surface,border:`1px solid ${item.issue?"#FECACA":C.border}`,marginBottom:5,cursor:"pointer"}}>
            <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#DC2626":"#fff",border:`2px solid ${item.issue?"#DC2626":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{item.issue&&Ic.x}</div>
            <span style={{fontSize:12,color:item.issue?"#DC2626":C.textMid}}>{item.name}</span>
          </div>)}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <GBtn onClick={()=>setShowReturn(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
            <DBtn onClick={async()=>{if(!returnRemark.trim()){alert("Remark required.");return;}setSaving(true);const issues=returnItems.filter(x=>x.issue).map(x=>x.name);const h={step:10,date:nowDate(),time:nowTime(),note:"Returned — Issues",returnRemark,issueItems:issues,reversedFrom:11};await onUpdate({...order,step:10,history:[...(order.history||[]),h]});setSaving(false);setShowReturn(false);setReturnRemark("");}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.rotate} {saving?"Saving…":"Return to Branch"}</DBtn>
          </div>
        </div>
      </div>
    )}
    {step>=9&&isAdmin&&<ReportCard allOrders={allOrders} reportDate={reportDate} setReportDate={setReportDate}/>}
  </div>;
}

function ActionBox({icon,title,desc,children}){
  return<div style={card}>
    <SecHdr icon={icon}>{title}</SecHdr>
    {desc&&<div style={{padding:"8px 16px",fontSize:11,color:C.textMid,background:C.surface,borderBottom:`1px solid ${C.border}`}}>{desc}</div>}
    <div style={{padding:"14px 16px"}}>{children}</div>
  </div>;
}

function ReportCard({allOrders,reportDate,setReportDate}){
  return<div style={card}>
    <SecHdr icon={Ic.download}>Download Reports</SecHdr>
    <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      {[["Upfront Payment","upfront"],["Claim Sent","claim"]].map(([label,type])=><div key={type}>
        <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>{label} Report</div>
        <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
          <div style={{flex:1}}><L>Date</L><I type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></div>
          <PBtn onClick={()=>downloadReport(allOrders||[],type,reportDate)} style={{padding:"8px 10px",flexShrink:0}}>{Ic.download}</PBtn>
        </div>
        <button onClick={()=>downloadReport(allOrders||[],type,"")} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",marginTop:4}}>All dates</button>
      </div>)}
    </div>
  </div>;
}

/* ── Order Detail ─────────────────────────────────────────────────────── */
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin,allOrders,isReadOnly}){
  const s=getStep(order.step),ph=getPhase(order.step),isCash=order.orderType==="cash";
  const upfront=order.billingData&&order.step>=7?calcUpfront(order):null;
  return<div className="fade-in">
    {/* Top bar */}
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <GBtn onClick={onBack}>{Ic.chevL} Back</GBtn>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:14,fontWeight:800,color:C.navy}}>{order.phoneModel}</span>
          <span style={{fontSize:10,color:C.textLight,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>{shortId(order.id)}</span>
          <StepBadge step={order.step}/>
          {order.stockStatus==="ready"&&<span style={{fontSize:9,fontWeight:700,color:C.blue,background:"#EFF6FF",padding:"2px 8px",borderRadius:4,border:"1px solid #BFDBFE",display:"inline-flex",alignItems:"center",gap:3}}>{Ic.lightning} Ready Stock</span>}
          {isCash&&<span style={{fontSize:9,fontWeight:700,color:"#15803D",background:"#F0FDF4",padding:"2px 8px",borderRadius:4,border:"1px solid #BBF7D0",display:"inline-flex",alignItems:"center",gap:3}}>{Ic.cash} Cash</span>}
        </div>
        <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
      </div>
      {isAdmin&&!isReadOnly&&<div style={{display:"flex",gap:6}}><GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn><DBtn onClick={onDelete}>{Ic.trash} Delete</DBtn></div>}
    </div>

    {/* Phase progress card */}
    <div style={{...card,padding:"16px 20px",marginBottom:14}}><PhaseBar step={order.step} order={order}/></div>

    {/* Order info summary */}
    <div style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.fileText}>Order Information</SecHdr>
      <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12}}>
        {[!isCash&&["Merchant",order.merchant],!isCash&&["Agreement No.",order.agreementNumber],!isCash&&["Approval Date",fDate(order.aeonApprovalDate)],!isCash&&["Finance Price",fRM(order.financePrice)],!isCash&&["Stamping Fee",fRM(order.stampingFee)],!isCash&&["Agreement Fee",fRM(order.agreementFee)],isCash&&["Retail Price",fRM(order.retailPrice)],["Deposit",fRM(order.deposit)],order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate)],order.invoiceNo&&["Invoice No.",order.invoiceNo],order.orderDate&&["Order Date",fDate(order.orderDate)],order.supplierName&&["Supplier",order.supplierName],order.claimSentDate&&["Claim Sent",fDate(order.claimSentDate)],order.knockOffDate&&["Knock-off",fDate(order.knockOffDate)]].filter(Boolean).map(([l,v])=><InfoCell key={l} label={l} value={v}/>)}
      </div>
      {order.adminRemark&&<div style={{padding:"8px 16px",borderTop:`1px solid ${C.border}`,background:"#FFFBEB"}}><div style={{fontSize:10,color:"#92400E",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Admin Remark</div><div style={{fontSize:12,color:"#78350F"}}>{order.adminRemark}</div></div>}
    </div>

    {/* Upfront breakdown */}
    {upfront&&<div style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.cash}>Upfront Payment Breakdown</SecHdr>
      <div style={{padding:"10px 16px"}}>
        {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>)}
        {order.billingData?.monthlyInstallment&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>1st Monthly Installment</span><span style={{fontWeight:600}}>{fRM(order.billingData.monthlyInstallment)}</span></div>}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 2px",fontWeight:800,color:C.navy}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
      </div>
    </div>}

    {/* Billing details */}
    {order.billingData&&<div style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.card}>Billing Details</SecHdr>
      <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
        {[["Billing Date",fDate(order.billingData.billingDate)],["Customer IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Monthly",fRM(order.billingData.monthlyInstallment)]].filter(([,v])=>v&&v!=="RM 0.00").map(([l,v])=><InfoCell key={l} label={l} value={v}/>)}
        {order.billingData.customerAddress&&<div style={{gridColumn:"1/-1"}}><InfoCell label="Address" value={`${order.billingData.customerAddress}, ${order.billingData.customerPostCode} ${order.billingData.customerCity}`}/></div>}
      </div>
    </div>}

    {/* Checklist */}
    {order.checklistItems&&<div style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.clipboard}>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length})</SecHdr>
      <div style={{padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:5}}>
        {order.checklistItems.map((item,i)=><span key={i} style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:item.checked?"#F0FDF4":"#FEF2F2",color:item.checked?"#15803D":"#DC2626",fontWeight:600,border:`1px solid ${item.checked?"#BBF7D0":"#FECACA"}`}}>{item.checked?"✓":"✗"} {item.name}</span>)}
      </div>
    </div>}

    {/* Two-col: timeline | action */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
      <div style={card}>
        <SecHdr icon={Ic.calendar}>Tracking Timeline</SecHdr>
        <div style={{padding:"14px 16px"}}><Timeline order={order}/></div>
      </div>
      <div>
        {isReadOnly?<div style={{...card,padding:"16px"}}>
          <div style={{fontSize:12,color:C.textLight,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>View only — actions disabled for this viewer.</div>
        </div>:<ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate} allOrders={allOrders}/>}
      </div>
    </div>
  </div>;
}

/* ── Order Form ───────────────────────────────────────────────────────── */
function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch,srList}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",monthlyInstallment:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositSlip:null};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCash=f.orderType==="cash",isReady=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const REQUIRED=["phoneModel","customerName",...(isCash?["retailPrice","deposit"]:["financePrice","stampingFee","agreementFee","deposit"])];
  const missing=REQUIRED.filter(k=>!f[k]?.toString().trim());
  const submit=async()=>{
    if(missing.length){alert("Please fill in all required fields.");return;}
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile);
    const initStep=isReady?4:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"},{step:4,date:nowDate(),time:nowTime(),note:"Dispatching"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHist});
  };
  const row=(k,l,t="text",req=false)=><div key={k}><L req={req}>{l}</L><I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&missing.includes(k)?{borderColor:"#FECACA"}:{}}/></div>;
  const CardSection=({title,children})=><div style={{...card,marginBottom:14}}>
    <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
    <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{children}</div>
  </div>;
  return<div className="fade-in">
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
      <GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn>
      <div style={{fontSize:15,fontWeight:800,color:C.navy}}>{order?"Edit Order":"New Order Request"}</div>
    </div>
    <CardSection title="Order Type">
      <div>
        <L req>Stock Status</L>
        <div style={{display:"flex",gap:8}}>
          {[["stock_request","Stock Request"],["ready","Ready Stock"]].map(([v,l])=><button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"9px 8px",borderRadius:8,border:`2px solid ${f.stockStatus===v?C.navy:C.border}`,background:f.stockStatus===v?C.navy:C.white,color:f.stockStatus===v?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
        {isReady&&<div style={{fontSize:10,color:"#15803D",marginTop:5,fontWeight:600}}>Will skip to Step 4 — Dispatching</div>}
      </div>
      <div>
        <L req>Order Type</L>
        <div style={{display:"flex",gap:8}}>
          {[["ccm","CCM Order"],["cash","Cash Order"]].map(([v,l])=><button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"9px 8px",borderRadius:8,border:`2px solid ${f.orderType===v?C.navy:C.border}`,background:f.orderType===v?C.navy:C.white,color:f.orderType===v?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
      </div>
    </CardSection>
    <CardSection title="Basic Information">
      {row("phoneModel","Phone Model / Item","text",true)}
      {row("customerName","Customer Name","text",true)}
      <div><L>Branch</L><SEL value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</SEL></div>
      <div><L>Sales Agent</L>{branchSRs.length>0?<SEL value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</SEL>:<I value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID"/>}</div>
    </CardSection>
    {!isCash&&<CardSection title="CCM / Financing Details">
      <div><L>Merchant</L><SEL value={f.merchant} onChange={e=>set("merchant",e.target.value)}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
      {row("agreementNumber","Agreement No.")}
      {row("aeonApprovalDate","Aeon Approval Date","date")}
      {row("financePrice","Finance Price (RM)","number",true)}
      {row("stampingFee","Stamping Fee (RM)","number",true)}
      {row("agreementFee","Agreement Fee (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      {row("monthlyInstallment","Monthly Installment (RM)","number")}
    </CardSection>}
    {isCash&&<CardSection title="Cash Order Details">
      {row("retailPrice","Retail Price (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      {row("depositPaymentDate","Deposit Payment Date","date")}
      <div><L>Deposit Payment Slip</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}</div>
    </CardSection>}
    {missing.length>0&&!order&&<div style={{padding:"9px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill all required fields to submit.</div>}
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><GBtn onClick={onCancel}>Cancel</GBtn><PBtn onClick={submit} disabled={!order&&missing.length>0}>{isReady?"Submit & Dispatch":"Submit Order Request"}</PBtn></div>
  </div>;
}

/* ── Alert helpers ────────────────────────────────────────────────────── */
function daysSince(dateStr){
  if(!dateStr)return null;
  const parts=dateStr.split("-");
  const d=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  const now=new Date();
  const nowDay=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.floor((nowDay-d)/(1000*60*60*24));
}
function getOrderAlerts(orders,userBranch=null){
  const myOrders=orders.filter(o=>o.step<13&&(!userBranch||o.branch===userBranch));
  const alerts=[];
  myOrders.filter(o=>o.step===2&&o.orderDate).forEach(o=>{
    const days=daysSince(o.orderDate);
    if(days>=7)alerts.push({type:"overdue_order",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Ordered ${days} days ago — not yet arrived at HQ`});
  });
  myOrders.filter(o=>o.aeonApprovalDate&&o.step>=1&&o.step<=12).forEach(o=>{
    const days=daysSince(o.aeonApprovalDate);
    if(days>=91)alerts.push({type:"approval_expired",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval EXPIRED — ${days} days ago`});
    else if(days>=61)alerts.push({type:"approval_urgent",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval ${days} days ago — URGENT`});
    else if(days>=31)alerts.push({type:"approval_warning",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval ${days} days ago — action needed`});
  });
  return alerts;
}
function AlertBanner({alerts,onClickOrder}){
  if(!alerts.length)return null;
  const expired=alerts.filter(a=>a.type==="approval_expired");
  const urgent=alerts.filter(a=>a.type==="approval_urgent"||a.type==="overdue_order");
  const warning=alerts.filter(a=>a.type==="approval_warning");
  const Block=({items,bg,border,color,title})=>items.length>0&&<div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{color,flexShrink:0}}>{Ic.alertCircle}</span><span style={{fontSize:11,fontWeight:800,color,textTransform:"uppercase",letterSpacing:"0.06em"}}>{title} ({items.length})</span></div>
    {items.map((a,i)=><div key={i} onClick={()=>onClickOrder&&onClickOrder(a.orderId)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:7,background:"rgba(255,255,255,.55)",marginBottom:3,cursor:onClickOrder?"pointer":"default",border:`1px solid ${border}`}}>
      <div><span style={{fontSize:11,fontWeight:700,color}}>{a.phoneModel}</span><span style={{fontSize:10,color,marginLeft:6,opacity:.8}}>{a.customerName} · {a.branch}</span></div>
      <span style={{fontSize:10,color,fontWeight:600,whiteSpace:"nowrap"}}>{a.msg}</span>
    </div>)}
  </div>;
  return<div style={{marginBottom:16}}>
    <Block items={expired} bg="#1A0000" border="#7F1D1D" color="#FCA5A5" title="Approval Expired"/>
    <Block items={urgent} bg="#FEF2F2" border="#FECACA" color="#B91C1C" title="Urgent Attention"/>
    <Block items={warning} bg="#FFFBEB" border="#FDE68A" color="#92400E" title="Approval Warning"/>
  </div>;
}

/* ── Batch Archive ────────────────────────────────────────────────────── */
function BatchArchive({orders,onSave,onClose}){
  const completed=orders.filter(o=>o.step===13);
  const [sel,setSel]=useState(new Set());
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.trash} Remove Completed Orders</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {completed.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No completed orders yet.</div>:<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{completed.length} completed</div>
            <button onClick={()=>setSel(sel.size===completed.length?new Set():new Set(completed.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===completed.length?"Deselect All":"Select All"}</button>
          </div>
          {completed.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#FEF2F2":C.surface,border:`1px solid ${sel.has(o.id)?"#FECACA":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#DC2626":"#fff",border:`2px solid ${sel.has(o.id)?"#DC2626":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:C.textLight}}>{shortId(o.id)} · {o.branch} · Knock-off: {fDate(o.knockOffDate)}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <GBtn onClick={onClose}>Cancel</GBtn>
        <DBtn onClick={async()=>{if(!sel.size)return;if(!confirm(`Remove ${sel.size} completed order(s) permanently?`))return;await onSave(orders.filter(o=>!sel.has(o.id)));onClose();}} disabled={!sel.size}>{Ic.trash} Remove {sel.size>0?`(${sel.size})`:""}</DBtn>
      </div>
    </div>
  </div>;
}

/* ── Main export ──────────────────────────────────────────────────────── */
export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[],isReadOnly=false}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState(()=>sessionStorage.getItem("orderView")||"list");
  const [selected,setSelected]=useState(()=>{try{const s=sessionStorage.getItem("orderSelected");return s?JSON.parse(s):null;}catch{return null;}});
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");
  const [showArchive,setShowArchive]=useState(false);
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [claimDate,setClaimDate]=useState(nowDate());

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);
  const nav=(v,sel=null)=>{setView(v);setSelected(sel);sessionStorage.setItem("orderView",v);sessionStorage.setItem("orderSelected",sel?JSON.stringify(sel):"null");};
  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];await save(list);nav("detail",o);};
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));nav("list");};

  const activeOrders=orders.filter(o=>o.step!==13&&(!userBranch||o.branch===userBranch));
  const filtered=activeOrders.filter(o=>(filterPhase==="all"||getPhase(o.step)?.id===filterPhase)&&(filterBranch==="ALL"||o.branch===filterBranch)&&(!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:60,textAlign:"center",color:C.textLight,fontSize:13}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=orders.find(o=>o.id===selected.id)||selected;
    return<><OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} isReadOnly={isReadOnly} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);nav("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>nav("list")} allOrders={activeOrders}/>{showArchive&&<BatchArchive orders={orders} onSave={async l=>{await save(l);}} onClose={()=>setShowArchive(false)}/>}</>;
  }
  if(view==="form")return<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{nav(editOrder?"detail":"list",editOrder||selected);setEditOrder(null);}}/>;

  const phaseCounts=PHASES.reduce((acc,ph)=>{acc[ph.id]=activeOrders.filter(o=>ph.steps.includes(o.step)).length;return acc;},{});
  const completedCount=orders.filter(o=>o.step===13&&(!userBranch||o.branch===userBranch)).length;
  const alerts=getOrderAlerts(activeOrders,userBranch);

  return<div className="fade-in">
    {showArchive&&<BatchArchive orders={orders} onSave={async l=>{await save(l);}} onClose={()=>setShowArchive(false)}/>}

    {/* Page header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:16,fontWeight:800,color:C.navy}}>Order Tracking</div>
        <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{activeOrders.length} active · {completedCount} completed</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {isAdmin&&!isReadOnly&&completedCount>0&&<GBtn onClick={()=>setShowArchive(true)}>{Ic.trash} Remove Completed ({completedCount})</GBtn>}
        {!isReadOnly&&<PBtn onClick={()=>{setEditOrder(null);nav("form");}}>{Ic.plus} New Order</PBtn>}
      </div>
    </div>

    {/* Alerts */}
    <AlertBanner alerts={alerts} onClickOrder={id=>{const o=activeOrders.find(x=>x.id===id);if(o)nav("detail",o);}}/>

    {/* Report downloads — admin only */}
    {isAdmin&&!isReadOnly&&<div style={{...card,marginBottom:18}}>
      <SecHdr icon={Ic.download}>Reports</SecHdr>
      <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {[["Upfront Payment","upfront",upfrontDate,setUpfrontDate],["Claim Sent","claim",claimDate,setClaimDate]].map(([label,type,date,setDate])=><div key={type}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>{label} Report</div>
          <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
            <div style={{flex:1}}><L>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <PBtn onClick={()=>downloadReport(activeOrders,type,date)} style={{padding:"8px 10px",flexShrink:0}}>{Ic.download}</PBtn>
          </div>
          <button onClick={()=>downloadReport(activeOrders,type,"")} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",marginTop:4}}>All dates</button>
        </div>)}
      </div>
    </div>}

    {/* Phase KPI cards — 2×2 grid */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
      {PHASES.map(ph=>{
        const count=phaseCounts[ph.id]||0,active=filterPhase===ph.id;
        return<div key={ph.id} onClick={()=>setFilterPhase(active?"all":ph.id)} style={{...card,padding:"12px 14px",cursor:"pointer",border:`${active?2:1}px solid ${active?ph.color:C.border}`,transition:"all .15s",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:9,background:active?ph.color:ph.bg,display:"flex",alignItems:"center",justifyContent:"center",color:active?"#fff":ph.color,flexShrink:0,transition:"all .15s"}}>{PHASE_ICONS[ph.id]}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:active?ph.color:C.navy,lineHeight:1}}>{count}</div>
          </div>
        </div>;
      })}
    </div>

    {/* Search + filter */}
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <I placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:160}}/>
      {isAdmin&&<SEL value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</SEL>}
    </div>

    {/* Order cards */}
    {filtered.length===0
      ?<div style={{...card,padding:"44px 20px",textAlign:"center",color:C.textLight,fontSize:13}}>{search||filterPhase!=="all"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click New Order to get started."}</div>
      :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(o=>{
          const s=getStep(o.step),ph=getPhase(o.step),pct=Math.round(((Math.min(o.step,12)-1)/11)*100);
          const alert=getOrderAlerts([o])[0];
          return<div key={o.id} onClick={()=>nav("detail",o)} className="card" style={{cursor:"pointer",overflow:"hidden",transition:"box-shadow .2s,transform .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(10,22,40,.10)";e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)";e.currentTarget.style.transform="none";}}>
            {/* Gradient header strip */}
            <div style={{background:o.step===12||o.step===13?`linear-gradient(135deg,#14532D,#166534)`:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:8,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.08)",padding:"1px 7px",borderRadius:4}}>{shortId(o.id)}</span>
                    {ph&&<span style={{fontSize:8,fontWeight:700,color:"rgba(255,255,255,.9)",background:ph.color+"40",padding:"1px 7px",borderRadius:4}}>{ph.label}</span>}
                    {o.stockStatus==="ready"&&<span style={{fontSize:8,fontWeight:700,color:C.yellow,background:"rgba(255,213,0,.15)",padding:"1px 7px",borderRadius:4,display:"inline-flex",alignItems:"center",gap:2}}>{Ic.lightning} Ready</span>}
                    {o.orderType==="cash"&&<span style={{fontSize:8,fontWeight:700,color:"#86EFAC",background:"rgba(134,239,172,.15)",padding:"1px 7px",borderRadius:4,display:"inline-flex",alignItems:"center",gap:2}}>{Ic.cash} Cash</span>}
                  </div>
                  <div style={{fontWeight:800,fontSize:14,color:"#fff",lineHeight:1.2}}>{o.phoneModel}</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>{o.customerName} · {o.branch}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.9)"}}>{pct}%</div>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{height:3,background:C.border}}><div style={{height:"100%",width:`${pct}%`,background:o.step>=12?`linear-gradient(90deg,#15803D,#16A34A)`:`linear-gradient(90deg,${C.blue},${C.blueBright})`,transition:"width .3s"}}/></div>
            {/* Body */}
            <div style={{padding:"10px 14px"}}>
              {alert&&<div style={{fontSize:10,fontWeight:700,color:alert.type==="approval_expired"?"#DC2626":alert.type==="approval_urgent"?"#B91C1C":"#92400E",background:alert.type==="approval_warning"?"#FFFBEB":"#FEF2F2",borderRadius:5,padding:"3px 8px",marginBottom:7,border:`1px solid ${alert.type==="approval_warning"?"#FDE68A":"#FECACA"}`}}>{alert.msg}</div>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:11,fontWeight:700,color:ph?.color||C.blue}}>Step {o.step}/{maxStep(o)} · {s.label}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{flex:1,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:ph?.color||C.blue,borderRadius:2}}/></div>
                <span style={{fontSize:9,color:C.textLight,flexShrink:0}}>{o.salesAgentName||o.salesAgentId||"—"}</span>
              </div>
              {(order=>{ const lh=(o.history||[]).slice(-1)[0]; return lh?.date&&<div style={{fontSize:10,color:C.textLight,marginTop:5}}>Updated {fDT(lh.date,lh.time)}</div>; })()}
            </div>
          </div>;
        })}
      </div>
    }
  </div>;
}
