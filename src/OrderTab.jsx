import {useState,useEffect,useRef,useMemo,useCallback,memo,Fragment} from "react";
import {listOrders,getOrderHistory,getHistoryForOrders,getOrder,reconcile,deleteOrder as apiDeleteOrder,deleteOrders as apiDeleteOrders,uploadOrderFile,signOrderFiles,updateHistoryRow,deleteHistoryRow} from "./storage/ordersApi.js";
import {supabase} from "./storage/index.js";
import {resolveEditorRole} from "./auth/orderRoles.js";
import * as XLSX from "xlsx";

const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
// SDK (EC SDK) is a pickup-only location — it's not a real branch (no targets,
// no BM, no SR, never appears in Branch Performance). It only ever shows up
// as an option for "which branch is the customer picking up from", so it
// gets its own list rather than being mixed into BRANCH_ORDER.
const PICKUP_BRANCH_OPTIONS=[...BRANCH_ORDER,"SDK"];
const MERCHANTS=["Aeon","JCL","Chailease"];
const PAYMENT_METHODS=["RHB","Public Bank"];
const MERCHANT_BADGE_COLORS={Aeon:"#1D4ED8",JCL:"#7C3AED",Chailease:"#B45309",Cash:"#15803D"};
// Small colored badge showing which merchant (Aeon/JCL/Chailease) or Cash
// an order belongs to — reused across the order list, knock-off
// checklists, and the payment breakdown table so it looks the same
// everywhere.
const MerchantBadge=({order})=>{
  const label=order.orderType==="cash"?"Cash":(order.merchant||"—");
  const color=MERCHANT_BADGE_COLORS[label]||"#8A96A8";
  return<span style={{fontSize:9,fontWeight:700,color,background:color+"18",border:`1px solid ${color}40`,padding:"1px 7px",borderRadius:4,whiteSpace:"nowrap",display:"inline-block"}}>{label}</span>;
};

// Which merchant filter buttons a given report type should offer. Kept
// as a lookup here (rather than one shared dropdown above every report)
// since different reports cover different slices of orders: some are
// CCM-merchant-specific and have no notion of "Cash" at all, one is
// cash-specific and has no notion of merchants, one genuinely covers
// both, and one (Purchase Claim) already covers everything regardless of
// merchant so it needs no filter at all.
const REPORT_MERCHANT_BUTTONS={
  cashKnockoff:["cash"],
  paymentCollection:["all","Aeon","JCL","Chailease","cash"],
  purchaseClaim:[],
};
const merchantButtonsFor=type=>REPORT_MERCHANT_BUTTONS[type]||["all","Aeon","JCL","Chailease"];
const merchantButtonLabel=v=>v==="all"?"All":v==="cash"?"Cash":v;

// Each report card manages its own local merchant filter (not a shared
// dropdown above the whole grid), since different cards may need
// different button sets and different people may want to check different
// merchants side by side without one selection affecting every card.
function MerchantReportCard({label,type,date,setDate,src,isMobile}){
  const buttons=merchantButtonsFor(type);
  const [merchantFilter,setMerchantFilter]=useState(buttons[0]||"all");
  const isLiveSnapshot=["firstInstallment","agreementReceived","claim","collectionOverdue"].includes(type);
  const noDateNeeded=type==="collectionOverdue"||type==="purchaseClaim";
  return<div style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",background:C.surface,display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>{label} Report</div>
    {buttons.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
      {buttons.map(b=><button key={b} onClick={()=>setMerchantFilter(b)} style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:20,cursor:"pointer",fontFamily:"Inter,sans-serif",border:`1px solid ${merchantFilter===b?C.blue:C.border}`,background:merchantFilter===b?C.blue:"#fff",color:merchantFilter===b?"#fff":C.textMid}}>{merchantButtonLabel(b)}</button>)}
    </div>}
    {noDateNeeded
      ?<div style={{fontSize:10,color:C.textLight,marginBottom:10}}>{type==="purchaseClaim"?"Always shows orders still waiting on their Claim Release to Purchaser file.":"Always shows who's currently overdue."}</div>
      :<div style={{marginBottom:10}}><L>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:"auto"}}>
      {!noDateNeeded?<button onClick={()=>downloadReport(src,type,"",merchantFilter)} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",whiteSpace:"nowrap",padding:0}}>{isLiveSnapshot?"Show Outstanding Now":"All dates"}</button>:<span/>}
      <PBtn onClick={()=>downloadReport(src,type,noDateNeeded?"":date,merchantFilter)} style={{padding:"9px 12px",width:38,height:38,justifyContent:"center",flexShrink:0}}>{Ic.download}</PBtn>
    </div>
  </div>;
}

const PHASES=[
  {id:"stock",label:"Stock Order",steps:[1,2,3],color:"#1E6FDB",bg:"#EFF6FF"},
  {id:"transfer",label:"Stock Transfer",steps:[4,5],color:"#7C3AED",bg:"#F5F3FF"},
  {id:"billing",label:"Billing",steps:[6,7,8,9],color:"#B45309",bg:"#FFFBEB"},
  {id:"agreement_hq",label:"Agreement Submission",steps:[10],color:"#0891B2",bg:"#ECFEFF"},
  {id:"unclaimed",label:"Agreement Received by HQ",steps:[11],color:"#DC2626",bg:"#FEF2F2"},
  {id:"claimed",label:"Claimed",steps:[12,13],color:"#15803D",bg:"#F0FDF4"},
];
const STEPS=[
  {step:1,label:"New Order Request",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsOrderDate:true},
  {step:3,label:"Arrived HQ",desc:"Item received at HQ.",who:"admin",phase:"stock",needsFiles:[{key:"claimToPurchaser",label:"Claim Release to Purchaser File"}]},
  {step:4,label:"Dispatched to Branch",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsTransferNumbers:true},
  {step:5,label:"Arrived Branch",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",desc:"Submit billing request form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",desc:"Customer collects device and payment received.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Phone Collection Proof",multiple:true},{key:"paymentProof",label:"Payment Proof"},{key:"balancePaymentProof",label:"Additional Balance Payment Proof",optional:true}]},
  {step:9,label:"Collection Verified",desc:"HQ verifies collection and upfront payment.",who:"admin",phase:"billing",needsVerification:true},
  {step:10,label:"Agreement Submission by Branch",desc:"Branch completes agreement checklist.",who:"both",phase:"agreement_hq",needsChecklist:true},
  {step:11,label:"Agreement Received by HQ",desc:"HQ receives original signed agreement.",who:"admin",phase:"unclaimed",canReverse:true},
  {step:12,label:"Claim Submitted",desc:"Claim submitted to merchant.",who:"admin",phase:"claimed",needsClaimInfo:true},
  {step:13,label:"Claim Released",desc:"Claim released by merchant. Enter knock-off date and amount.",who:"admin",phase:"claimed",needsKnockOff:true},
  {step:14,label:"Completed",desc:"Order completed and archived.",who:"admin",phase:"claimed"},
];
const AEON_CHECKLIST_ITEMS=["Aeon Application Form (3 pages)","Invoice","Result List","Notice 1 — Application (2 pages × 2 sets)","Notice 2 — Approval (8 pages)","Agreement (16 pages)","IC Copy","AutoDebit Form (Personal Account)","Bank Proof (Personal Account)"];
const JCL_CHECKLIST_ITEMS=["JCL Application Form (2 pages)","JCL Summary Form (2 pages)","Notice II (14 pages)","Notice II (20 pages)","Credit Acknowledgement Form","IMEI Photo","eMandate Photo","JCLick Photo","Phone Collection (2 photos)"];
const checklistItemsFor=merchant=>merchant==="JCL"?JCL_CHECKLIST_ITEMS:AEON_CHECKLIST_ITEMS;
const FILE_LABELS=STEPS.reduce((m,s)=>{(s.needsFiles||[]).forEach(f=>{m[f.key]=f.label;});return m;},{});

// Returns steps visible in timeline for a given order
function getVisibleSteps(order){
  const isCash=order.orderType==="cash";
  const isReady=order.stockStatus==="ready";
  if(isCash){
    // Cash: 1, (2,3 if not ready), 4,5,6,7,8,9 then done
    const base=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9];
    return STEPS.filter(s=>base.includes(s.step));
  }
  // CCM: 1-13 (14=Completed is archived, shown separately). Ready stock
  // skips 2 (Ordered) and 3 (Arrived HQ) — there's nothing to order or wait
  // to arrive when the phone is already sitting in stock.
  const base=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,10,11,12,13];
  return STEPS.filter(s=>base.includes(s.step));
}

// Returns the "next" step number for a given order. Uses "first sequence
// step greater than current" rather than requiring an exact match in the
// sequence — this way an order that's landed on a step outside its own
// sequence (e.g. a Ready Stock order sitting at step 2/3, which doesn't
// exist in the ready sequence at all) still gets a sensible next step
// instead of silently returning null and showing no action panel at all.
function nextStepNum(order){
  const isCash=order.orderType==="cash";
  const isReady=order.stockStatus==="ready";
  const cur=order.step;
  const seq=isCash
    ?[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,14]
    :[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,10,11,12,13];
  const next=seq.find(n=>n>cur);
  return next!==undefined?next:null;
}

// Max step for progress calculation
function maxStep(order){
  return order.orderType==="cash"?9:13;
}

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const SOPHIA_EMAIL="sophiawsc9395@gmail.com";
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>{const d=new Date();return`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
const fDT=(date,time)=>date?(time?`${fDate(date)} ${time}`:fDate(date)):"—";
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];
const getPhase=step=>PHASES.find(p=>p.steps.includes(step));
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";
// Reads a picked File, compresses it if it's an image, and UPLOADS it to
// Supabase Storage — returns {name, path} (never base64). `orderId` scopes
// the storage path; every call site below has an order (existing or
// freshly-id'd) in scope.
const readFile=(f,orderId)=>new Promise((res,rej)=>{
  if(!f.type||!f.type.startsWith("image/")){
    // Non-image (e.g. PDF) — upload as-is, nothing we can safely compress client-side.
    uploadOrderFile(orderId,f,f.name).then(res).catch(rej);
    return;
  }
  // Image — downscale + re-encode as JPEG before upload to keep Storage usage small.
  const img=new Image();
  const url=URL.createObjectURL(f);
  img.onload=()=>{
    const MAX=1600;
    let{width:w,height:h}=img;
    if(w>MAX||h>MAX){const s=MAX/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    canvas.getContext("2d").drawImage(img,0,0,w,h);
    canvas.toBlob(blob=>{
      URL.revokeObjectURL(url);
      if(!blob){rej(new Error("Image compression failed"));return;}
      const name=f.name.replace(/\.(png|jpe?g|webp|heic|heif)$/i,"")+".jpg";
      uploadOrderFile(orderId,blob,name).then(res).catch(rej);
    },"image/jpeg",0.75);
  };
  img.onerror=()=>{
    URL.revokeObjectURL(url);
    // Fallback: if it can't be decoded as an image for some reason, upload as-is.
    uploadOrderFile(orderId,f,f.name).then(res).catch(rej);
  };
  img.src=url;
});
const calcUpfront=o=>{const a=parseFloat(o.agreementFee)||0,s=parseFloat(o.stampingFee)||0,d=parseFloat(o.deposit)||0;return{a,s,d,total:a+s+d};};
const calcCashDue=o=>(parseFloat(o.retailPrice)||0)-(parseFloat(o.deposit)||0);

/* ── Icons ────────────────────────────────────────────────────────────── */
const Ic={
  copy:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="9"y="9"width="13"height="13"rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  box:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1"y="3"width="22"height="5"/><line x1="10"y1="12"x2="14"y2="12"/></svg>,
  truck:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><rect x="1"y="3"width="15"height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5"cy="18.5"r="2.5"/><circle cx="18.5"cy="18.5"r="2.5"/></svg>,
  card:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><rect x="1"y="4"width="22"height="16"rx="2"/><line x1="1"y1="10"x2="23"y2="10"/></svg>,
  fileText:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16"y1="13"x2="8"y2="13"/><line x1="16"y1="17"x2="8"y2="17"/><line x1="10"y1="9"x2="8"y2="9"/></svg>,
  checkCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  alertCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>,
  plus:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5"strokeLinecap="round"><line x1="12"y1="5"x2="12"y2="19"/><line x1="5"y1="12"x2="19"y2="12"/></svg>,
  chevL:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevR:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  chevDown:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
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
  share:<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="18"cy="5"r="3"/><circle cx="6"cy="12"r="3"/><circle cx="18"cy="19"r="3"/><line x1="8.59"y1="13.51"x2="15.42"y2="17.49"/><line x1="15.41"y1="6.51"x2="8.59"y2="10.49"/></svg>,
};
const PHASE_ICONS={stock:Ic.box,transfer:Ic.truck,billing:Ic.card,agreement_hq:Ic.fileText,unclaimed:Ic.alertCircle,claimed:Ic.checkCircle};

/* ── Design tokens (matching App.jsx) ────────────────────────────────── */
const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",yellow:"#FFD500",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const inp={display:"block",width:"100%",padding:"11px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:13,fontFamily:"Inter,sans-serif",color:C.text,outline:"none",background:C.white,boxSizing:"border-box",lineHeight:"1.4",minWidth:0};
const lbl={fontSize:11,fontWeight:700,color:C.textLight,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

/* ── Primitives ───────────────────────────────────────────────────────── */
function L({children,req}){return<label style={lbl}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;}
function I({style,...p}){return<input style={{...inp,...style,width:"100%"}} {...p}/>;}
function SEL({children,style,...p}){return<select style={{...inp,appearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238A96A8'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",paddingRight:28,...style,width:"100%"}} {...p}>{children}</select>;}
function TX(p){return<textarea style={{...inp,resize:"vertical",...p.style}} {...p}/>;}
function Divider(){return<div style={{height:1,background:C.border,margin:"14px 0"}}/>;}

function PBtn({children,onClick,disabled,style={}}){
  return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:C.white,border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":`0 2px 8px rgba(27,63,114,.35)`,transition:"all .15s",...style}}>{children}</button>;
}
function GBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",...style}}>{children}</button>;
}
function DBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 13px",background:"transparent",color:"#DC2626",border:"1px solid rgba(220,38,38,.3)",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;
}

/* ── Section header matching dashboard style ─────────────────────────── */
function SecHdr({icon,children,right}){
  return<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
    <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:"rgba(255,255,255,.85)"}}>{icon}</span>}{children}</div>
    {right&&<div>{right}</div>}
  </div>;
}
function InfoCell({label,value,nowrap}){return<div style={{minWidth:0}}><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2,fontWeight:600}}>{label}</div><div style={nowrap?{fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}:{fontSize:12,fontWeight:600,color:C.text,wordBreak:"break-word",overflowWrap:"anywhere"}} title={nowrap?value:undefined}>{value||"—"}</div></div>;}

/* ── Phase Progress Bar ───────────────────────────────────────────────── */
function PhaseBar({step,order,dark=false}){
  const mxS=order?maxStep(order):12;
  const pct=Math.round(((Math.min(step,mxS)-1)/(mxS-1))*100);
  const curPhase=getPhase(step);
  return(
    <div>
      <div className="pb-row">
        {(order?.orderType==="cash"?PHASES.filter(p=>["stock","transfer","billing","agreement_hq"].includes(p.id)):PHASES).map((p,i,arr)=>{
          const maxS=Math.max(...p.steps),done=step>maxS,active=p.steps.includes(step);
          return<div key={p.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
            <div style={{display:"flex",alignItems:"center",width:"100%"}}>
              <div className="pb-circle" style={{width:24,height:24,borderRadius:"50%",background:done?(dark?"rgba(255,255,255,.9)":C.navy):active?C.blue:(dark?"rgba(255,255,255,.1)":"#E4EAF2"),border:`2px solid ${done?(dark?"rgba(255,255,255,.7)":C.navy):active?C.blue:(dark?"rgba(255,255,255,.2)":"#E4EAF2")}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:dark&&done?"#0A1628":"#fff",transition:"all .2s"}}>
                {done?Ic.check:active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:dark?"rgba(255,255,255,.35)":C.textLight}}>{i+1}</span>}
              </div>
              {i<arr.length-1&&<div style={{flex:1,height:2,background:done?(dark?"rgba(255,255,255,.7)":C.navy):(dark?"rgba(255,255,255,.15)":"#E4EAF2"),margin:"0 3px",transition:"background .3s"}}/>}
            </div>
            <div className="pb-label" style={{marginTop:5,paddingLeft:1}}>
              <div style={{fontSize:9,fontWeight:700,color:dark?(active?"#FFD500":done?"rgba(255,255,255,.7)":"rgba(255,255,255,.35)"):(active?C.blue:done?C.textMid:C.textLight),textTransform:"uppercase",letterSpacing:"0.04em",lineHeight:1.2}}>{p.label}</div>
            </div>
          </div>;
        })}
      </div>
      <div style={{height:4,background:dark?"rgba(255,255,255,.15)":C.border,borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:dark?"linear-gradient(90deg,#FFD500,#FFF176)":`linear-gradient(90deg,${C.blue},${C.blueBright})`,borderRadius:2,transition:"width .5s cubic-bezier(.4,0,.2,1)"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.textLight}}>
        <span style={{color:dark?"rgba(255,255,255,.5)":C.textLight}}>Step {step} of {mxS}{curPhase?` — ${curPhase.label}`:""}</span><span style={{fontWeight:700,color:dark?"#FFD500":C.blue}}>{pct}%</span>
      </div>
    </div>
  );
}

/* ── Phase + Step badge ───────────────────────────────────────────────── */
function isPendingBranchAction(order){
  if(order.step!==10)return false;
  // Header-level flag, kept in sync server-side on every history write —
  // works on list cards (header only) and the hydrated detail order alike.
  if(order.pendingBranchAction!==undefined)return!!order.pendingBranchAction;
  const last=(order.history||[]).filter(h=>h.issueItems||h.checklistItems).slice(-1)[0];
  return!!(last&&last.issueItems);
}
function isShortPaymentPending(order){
  if(order.step!==8)return false;
  if(order.shortPaymentPending!==undefined)return!!order.shortPaymentPending;
  const last=(order.history||[]).filter(h=>h.shortPayment||h.collectionChecked!==undefined).slice(-1)[0];
  return!!(last&&last.shortPayment);
}
function StepBadge({order,step}){
  const s2=step!=null?step:order?.step;
  const ph=getPhase(s2),s=getStep(s2);
  if(order?.cancelled)return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",whiteSpace:"nowrap"}}>Cancelled</span>;
  if(order&&isPendingBranchAction(order))return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",whiteSpace:"nowrap"}}>Pending Branch Action</span>;
  if(order&&isShortPaymentPending(order))return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",whiteSpace:"nowrap"}}>Balance Payment Needed</span>;
  if(!ph)return null;
  return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:C.surface,color:C.navy,border:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{s.label}</span>;
}

/* ── Timeline ─────────────────────────────────────────────────────────── */
function PhoneModelField({order,onUpdate}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(order.phoneModel||"");
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!val.trim())return;
    setSaving(true);
    await onUpdate({...order,phoneModel:val.trim()});
    setSaving(false);
    setEditing(false);
  };
  if(!editing){
    return<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.phoneModel||"—"}</div>
      <button onClick={()=>{setVal(order.phoneModel||"");setEditing(true);}} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",padding:0}}>Edit</button>
    </div>;
  }
  return<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
    <input value={val} onChange={e=>setVal(e.target.value)} placeholder="Phone Model / Item…" style={{flex:1,minWidth:120,padding:"5px 8px",border:`1.5px solid ${!val.trim()?"#FECACA":C.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif",outline:"none"}}/>
    <button onClick={save} disabled={saving||!val.trim()} style={{fontSize:11,fontWeight:700,color:"#fff",background:C.blue,border:"none",borderRadius:7,padding:"5px 10px",cursor:saving?"wait":"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"Save"}</button>
    <button onClick={()=>setEditing(false)} style={{fontSize:11,color:C.textLight,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
  </div>;
}

function TrackingNumberEditor({order,onUpdate,canEdit}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(order.trackingNumber||"");
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    await onUpdate({...order,trackingNumber:val.trim()});
    setSaving(false);
    setEditing(false);
  };
  if(!editing){
    return<div style={{marginTop:4,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      {order.trackingNumber?<div style={{fontSize:11,color:C.navy,fontWeight:600}}>Tracking Number: {order.trackingNumber}</div>:<div style={{fontSize:11,color:C.textLight,fontStyle:"italic"}}>No tracking number yet</div>}
      {canEdit&&<button onClick={()=>{setVal(order.trackingNumber||"");setEditing(true);}} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",padding:0}}>{order.trackingNumber?"Edit":"Add Tracking Number"}</button>}
    </div>;
  }
  return<div style={{marginTop:6,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
    <input value={val} onChange={e=>setVal(e.target.value)} placeholder="Tracking number…" style={{flex:1,minWidth:140,padding:"6px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif",outline:"none"}}/>
    <button onClick={save} disabled={saving} style={{fontSize:11,fontWeight:700,color:"#fff",background:C.blue,border:"none",borderRadius:7,padding:"6px 12px",cursor:saving?"wait":"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"Save"}</button>
    <button onClick={()=>setEditing(false)} style={{fontSize:11,color:C.textLight,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
  </div>;
}

function Timeline({order,isAdmin,canManageTracking,onUpdate,orderPermissions,email}){
  const cur=order.step;
  const isReady=order.stockStatus==="ready";
  const visSteps=getVisibleSteps(order);
  const isSuperAdminOrderTL=isAdmin&&(!orderPermissions||orderPermissions.adminSteps==="all");
  const isBillingRoleTL=isAdmin&&!!orderPermissions&&orderPermissions.adminSteps!=="all"&&orderPermissions.adminSteps.includes(7);
  const canSeeMerchantRejection=isSuperAdminOrderTL||isBillingRoleTL;
  // Sophia specifically, by email — not just "no orderPermissions object",
  // since that's only true on the main dashboard. She can also reach this
  // page via order.html, where she still has an orderPermissions object
  // (adminSteps:"all"), same as it'd look for any other super admin there.
  const isTrueSuperAdminTL=isAdmin&&(email||"").toLowerCase()==="sophiawsc9395@gmail.com";
  // Self-healing — every time this order's timeline is viewed, quietly
  // check that the current step actually has a log entry backing it up.
  // This is what makes "no step can be skipped" hold even without another
  // deletion happening: if a step's entry was removed and nothing since
  // has re-triggered a correction (the order just hasn't been touched
  // again), viewing it here is enough on its own to catch and fix it.
  useEffect(()=>{
    if(order.step<=1)return;
    const hist=order.history||[];
    if(hist.some(h=>h.step===order.step)){
      console.log("[step self-heal] order",order.id,"step",order.step,"is backed by its own log entry — no correction needed.");
      return;
    }
    const isCash=order.orderType==="cash";
    const isReady=order.stockStatus==="ready";
    const seq=isCash?[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,14]:[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,10,11,12,13];
    let correctStep=seq[0];
    for(const s of seq)if(hist.some(h=>h.step===s))correctStep=s;
    console.log("[step self-heal] order",order.id,"step",order.step,"has NO backing entry. Steps actually in log:",hist.map(h=>h.step),". Correcting to step",correctStep);
    if(correctStep!==order.step)onUpdate({...order,step:correctStep});
  },[order.id,order.step,order.history?.length]);
  const [editingAmount,setEditingAmount]=useState(null); // {rowId, field} | null
  const [amountDraft,setAmountDraft]=useState("");
  const saveAmount=async(rowId,field)=>{
    const result=await updateHistoryRow(rowId,{[field]:parseFloat(amountDraft)||0});
    if(!result.ok){alert("Failed to save — please try again.");return;}
    await onUpdate(order); // no-op on the order row itself, but refreshes history from the database
    setEditingAmount(null);
  };
  const deleteHistoryEntry=async(rowId)=>{
    if(!window.confirm("Remove this log entry from the tracking timeline? This can't be undone."))return;
    const deletedEntry=(order.history||[]).find(h=>h._rowId===rowId);
    const result=await deleteHistoryRow(rowId);
    if(!result.ok){alert("Failed to remove — please try again.");return;}
    // The order's current step must never sit ahead of what the remaining
    // log actually supports. Taking the max step among whatever entries
    // are LEFT isn't enough on its own — a later step's entry (e.g.
    // "Agreement Submission by Branch") can still be sitting in the log
    // even after the earlier step it depended on (e.g. "Collection
    // Verified") gets removed, which would leave the order stuck ahead of
    // where it should be. So this always reverts to the step immediately
    // before whichever entry was deleted, in sequence — never just "the
    // highest step still logged" — since anything logged at or after the
    // deleted step no longer has a coherent chain behind it.
    const remainingHistory=(order.history||[]).filter(h=>h._rowId!==rowId);
    let newStep=remainingHistory.length?Math.max(...remainingHistory.map(h=>h.step||1)):1;
    if(deletedEntry){
      const isCash=order.orderType==="cash";
      const isReady=order.stockStatus==="ready";
      const seq=isCash?[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,14]:[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,10,11,12,13];
      const idx=seq.indexOf(deletedEntry.step);
      const stepBeforeDeleted=idx>0?seq[idx-1]:seq[0];
      newStep=Math.min(newStep,stepBeforeDeleted);
    }
    await onUpdate({...order,step:newStep,history:remainingHistory});
  };
  let lastPh=null;
  const renderEntry=(hist,histIdx,s,isLatest)=><div style={{marginTop:4,background:C.surface,borderRadius:7,padding:"6px 10px",border:`1px solid ${C.border}`,fontSize:11,color:C.textMid,position:"relative"}}>
    {isTrueSuperAdminTL&&hist._rowId&&<button onClick={()=>deleteHistoryEntry(hist._rowId)} title="Remove this log entry" style={{position:"absolute",top:5,right:5,background:"none",border:"none",cursor:"pointer",color:"#DC2626",padding:2,fontSize:13,lineHeight:1,fontWeight:700}}>×</button>}
    {hist.date&&<div style={{marginBottom:3,fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em"}}>{isLatest?"Latest — ":""}{fDT(hist.date,hist.time)}</div>}
    {hist.reversedFrom&&<div style={{marginBottom:3,fontSize:12,fontWeight:700,color:"#DC2626"}}>Agreement Issue</div>}
    {hist.orderDate&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Order Date: {fDate(hist.orderDate)}{hist.supplierName?` · ${hist.supplierName}`:""}</div>}
    {hist.poNumber&&<div style={{marginBottom:2,color:C.textMid}}>PO Number: {hist.poNumber}</div>}
    {isAdmin&&hist.purchaserName&&<div style={{marginBottom:2,color:C.textMid}}>Purchaser: {hist.purchaserName}</div>}
    {hist.cancelledDate&&<div style={{marginBottom:2,color:"#DC2626",fontWeight:700}}>Supplier Cancelled — {fDate(hist.cancelledDate)}{hist.reversedTo?` · Returned to ${getStep(hist.reversedTo)?.label||"New Order Request"}`:""}</div>}
    {hist.remark&&<div style={{marginBottom:2,color:C.textMid}}>Remark: {hist.remark}</div>}
    {hist.invoiceNo&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Invoice: {hist.invoiceNo}</div>}
    {hist.claimSentDate&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Claim Sent Out to Merchant Date: {fDate(hist.claimSentDate)}</div>}
    {hist.consignmentNo&&<div style={{marginBottom:2,color:C.textMid}}>Consignment Note No.: {hist.consignmentNo}</div>}
    {hist.stockTransferNo&&<div style={{marginBottom:2,color:C.textMid}}>Stock Transfer No.: {hist.stockTransferNo}</div>}
    {hist.knockOffDate&&<div style={{marginBottom:2,color:C.textMid,fontWeight:600}}>Knock-off: {fDate(hist.knockOffDate)}</div>}
    {hist.knockOffAmount&&<div style={{marginBottom:2,color:C.textMid,fontWeight:600}}>Knock-off Amount: {fRM(hist.knockOffAmount)}</div>}
    {hist.shortPayment&&<div style={{marginBottom:2,color:"#DC2626",fontWeight:700}}>Short Payment — Balance Payment Needed</div>}
    {hist.collectionChecked!==undefined&&<div style={{marginBottom:3,fontSize:10,color:C.textMid}}>{order.orderType!=="cash"&&<>{hist.collectionChecked?"Done":"Not done"} Phone Collection · </>}{hist.paymentChecked?"Done":"Not done"} Payment verified</div>}
    {hist.upfrontPaymentDate&&(order.orderType==="cash"?hist.monthlyInstallment:hist.paymentProofAmount)&&<div style={{marginBottom:2,color:C.navy,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
      <span>{order.orderType==="cash"?"Payment Amount":"Payment Proof Amount"} {fDate(hist.upfrontPaymentDate)} · {hist.paymentMethod} · {
        editingAmount?.rowId===hist._rowId&&editingAmount?.field===(order.orderType==="cash"?"monthlyInstallment":"paymentProofAmount")
          ?<input type="number" autoFocus value={amountDraft} onChange={e=>setAmountDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveAmount(hist._rowId,order.orderType==="cash"?"monthlyInstallment":"paymentProofAmount");if(e.key==="Escape")setEditingAmount(null);}} style={{width:80,padding:"1px 5px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:4}}/>
          :fRM(order.orderType==="cash"?hist.monthlyInstallment:hist.paymentProofAmount)
      }</span>
      {isTrueSuperAdminTL&&hist._rowId&&(editingAmount?.rowId===hist._rowId&&editingAmount?.field===(order.orderType==="cash"?"monthlyInstallment":"paymentProofAmount")
        ?<button onClick={()=>saveAmount(hist._rowId,order.orderType==="cash"?"monthlyInstallment":"paymentProofAmount")} style={{fontSize:9,padding:"1px 6px",background:C.navy,color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:700}}>Save</button>
        :<button onClick={()=>{setEditingAmount({rowId:hist._rowId,field:order.orderType==="cash"?"monthlyInstallment":"paymentProofAmount"});setAmountDraft(String(order.orderType==="cash"?hist.monthlyInstallment:hist.paymentProofAmount));}} style={{fontSize:9,padding:"1px 6px",background:"none",border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",color:C.textLight,fontWeight:600}}>Edit</button>)}
    </div>}
    {hist.secondPaymentDate&&<div style={{marginBottom:2,color:"#92400E",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
      <span>2nd Payment: {fDate(hist.secondPaymentDate)} · {hist.secondPayMethod} · {
        editingAmount?.rowId===hist._rowId&&editingAmount?.field==="secondPaymentAmount"
          ?<input type="number" autoFocus value={amountDraft} onChange={e=>setAmountDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveAmount(hist._rowId,"secondPaymentAmount");if(e.key==="Escape")setEditingAmount(null);}} style={{width:80,padding:"1px 5px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:4}}/>
          :fRM(hist.secondPaymentAmount)
      }</span>
      {isTrueSuperAdminTL&&hist._rowId&&(editingAmount?.rowId===hist._rowId&&editingAmount?.field==="secondPaymentAmount"
        ?<button onClick={()=>saveAmount(hist._rowId,"secondPaymentAmount")} style={{fontSize:9,padding:"1px 6px",background:C.navy,color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontWeight:700}}>Save</button>
        :<button onClick={()=>{setEditingAmount({rowId:hist._rowId,field:"secondPaymentAmount"});setAmountDraft(String(hist.secondPaymentAmount));}} style={{fontSize:9,padding:"1px 6px",background:"none",border:`1px solid ${C.border}`,borderRadius:4,cursor:"pointer",color:C.textLight,fontWeight:600}}>Edit</button>)}
    </div>}
    {hist.verificationRemark&&<div style={{marginBottom:2,color:C.textMid}}>Note: {hist.verificationRemark}</div>}
    {hist.returnRemark&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Returned: {hist.returnRemark}</div>}
    {hist.billingData&&<div style={{marginTop:6}}><BillingDetailsCard billingData={hist.billingData} isCash={order.orderType==="cash"} title="Billing Request Details" liveOrder={order}/></div>}
    {s.step===8&&order.orderType!=="cash"&&!hist.shortPaymentProofUpload&&<div style={{marginTop:6,background:C.white,borderRadius:7,padding:"8px 10px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Upfront Payment Breakdown</div>
      {(()=>{const up=calcUpfront(order);const monthly=(order.monthlyInstallment!=null&&order.monthlyInstallment!=="")?parseFloat(order.monthlyInstallment)||0:parseFloat(order.billingData?.monthlyInstallment)||0;return<>
        {[["Agreement Fee",up.a],["Stamping Fee",up.s],["Deposit",up.d]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>)}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:700}}><span>Upfront 1 (Subtotal)</span><span>{fRM(up.total)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:700}}><span>Upfront 2 (First Monthly Installment)</span><span>{fRM(monthly)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0 0",borderTop:`2px solid ${C.navy}`,marginTop:4,color:C.navy,fontWeight:800}}><span>Total Upfront Payment Upon Collection</span><span>{fRM(up.total+monthly)}</span></div>
      </>;})()}
    </div>}
    {hist.issueItems?.length>0&&<div style={{marginBottom:2,color:C.textMid,fontSize:10}}>Issues: {hist.issueItems.join(" · ")}</div>}
    {hist.checklistItems&&<div style={{fontSize:10,color:C.textMid}}>{hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items</div>}
    {hist.agreementConsignmentNo&&<div style={{marginTop:2,color:C.navy,fontWeight:600,fontSize:11}}>Consignment Note No.: {hist.agreementConsignmentNo}</div>}
    {hist.files&&Object.entries(hist.files).filter(([k])=>isAdmin||k!=="claimToPurchaser").flatMap(([k,f])=>f?(Array.isArray(f)?f.map((ff,i)=>[k,ff]):[[k,f]]):[]).map(([k,f],i)=>f&&<a key={k+i} href={f.url||f.data} target={f.url?"_blank":undefined} rel={f.url?"noopener noreferrer":undefined} download={f.url?undefined:f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:C.blue,textDecoration:"none",background:"#EEF1F7",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} {FILE_LABELS[k]?`${FILE_LABELS[k]}: `:""}{f.name}</a>)}
    {s.step===1&&order.orderType==="cash"&&order.depositPaymentDate&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Deposit Payment Date: {fDate(order.depositPaymentDate)}{order.depositPaymentMethod?` · ${order.depositPaymentMethod}`:""}{order.deposit?` · ${fRM(order.deposit)}`:""}</div>}
    {s.step===1&&order.orderType==="cash"&&order.depositSlip&&<a href={order.depositSlip.url||order.depositSlip.data} target={order.depositSlip.url?"_blank":undefined} rel={order.depositSlip.url?"noopener noreferrer":undefined} download={order.depositSlip.url?undefined:order.depositSlip.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:C.blue,textDecoration:"none",background:"#EEF1F7",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} Deposit Payment Slip — {order.depositSlip.name}</a>}
  </div>;
  return<div>
    {visSteps.map((s,i)=>{
    const isAutoReady=isReady&&s.step===2;
    const done=cur>s.step||isAutoReady;
    const active=cur===s.step&&!isAutoReady;
    const histEntries=(order.history||[]).map((h,idx)=>({h,idx})).filter(({h})=>h.step===s.step);
    const ph=getPhase(s.step),showPh=ph&&ph.id!==lastPh;
    if(ph)lastPh=ph.id;
    return<div key={s.step}>
      {showPh&&<div style={{fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.08em",padding:"8px 0 5px 36px",marginTop:i>0?8:0,borderBottom:`1px solid ${C.border}`,marginBottom:5,display:"flex",alignItems:"center",gap:5}}><span style={{color:C.textLight}}>{PHASE_ICONS[ph.id]}</span>{ph.label}</div>}
      <div style={{display:"flex",position:"relative"}}>
        {i<visSteps.length-1&&<div style={{position:"absolute",left:11,top:24,width:1,height:"calc(100% + 2px)",background:done?C.navy+"30":C.border,zIndex:0}}/>}
        <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:done?C.navy:active?C.blue:C.surface,border:`2px solid ${done?C.navy:active?C.blue:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:10,marginTop:1,color:"#fff",transition:"all .2s"}}>
          {done?Ic.check:active?<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{s.step}</span>}
        </div>
        <div style={{flex:1,paddingBottom:i<visSteps.length-1?11:0,paddingTop:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:done||active?600:400,color:done||active?C.text:"#9CA3AF"}}>{s.label}</span>
            {isAutoReady&&<span style={{background:C.surface,color:C.textLight,padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:600,border:`1px solid ${C.border}`}}>Auto</span>}
            {active&&<span style={{background:C.surface,color:C.blue,padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:700,border:`1px solid ${C.border}`}}>Current</span>}
            {histEntries.length>1&&<span style={{background:C.surface,color:C.textLight,padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:600,border:`1px solid ${C.border}`}}>{histEntries.length} updates</span>}
          </div>
          {histEntries.map(({h,idx},hi)=><div key={hi}>{renderEntry(h,idx,s,hi===histEntries.length-1&&histEntries.length>1)}</div>)}
          {s.step===2&&!isAutoReady&&order.step>=2&&<TrackingNumberEditor order={order} onUpdate={onUpdate} canEdit={canManageTracking}/>}
          {s.step===12&&order.merchantRejected&&canSeeMerchantRejection&&<div style={{marginTop:4,background:"#FEF2F2",borderRadius:7,padding:"6px 10px",border:"1px solid #FECACA",fontSize:11,color:"#DC2626"}}>
            <div style={{marginBottom:3,fontSize:9,fontWeight:700,color:"#DC2626",textTransform:"uppercase",letterSpacing:"0.04em"}}>Merchant Rejected — {fDate(order.merchantRejectedDate)}</div>
            <div style={{fontWeight:600}}>Remark: {order.merchantRejectedRemark}</div>
          </div>}
          {s.step===12&&order.resubmittedDate&&canSeeMerchantRejection&&<div style={{marginTop:4,background:"#F0FDF4",borderRadius:7,padding:"6px 10px",border:"1px solid #BBF7D0",fontSize:11,color:"#15803D"}}>
            <div style={{marginBottom:3,fontSize:9,fontWeight:700,color:"#15803D",textTransform:"uppercase",letterSpacing:"0.04em"}}>Resubmitted to Merchant — {fDate(order.resubmittedDate)}</div>
            <div style={{fontWeight:600}}>Consignment Note: {order.resubmittedConsignmentNote}</div>
          </div>}
        </div>
      </div>
    </div>;
  })}</div>;
}

/* ── Billing Form ─────────────────────────────────────────────────────── */
function BillingForm({order,onSubmit,onCancel}){
  const [f,setF]=useState(order.billingData||{billingDate:nowDate(),customerFullName:order.customerName||"",customerIC:order.customerIC||"",customerHP:order.customerHP||"",customerAddress:order.customerAddress||"",customerPostCode:order.customerPostCode||"",customerCity:order.customerCity||"",customerEmail:order.customerEmail||"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",freeGiftSerialNo:"",cashPriceOnListing:order.orderType==="cash"?"":(order.financePrice||""),monthlyInstallment:order.monthlyInstallment||"",agreementNumber:order.agreementNumber||"",agreementFee:order.agreementFee||"",stampingFee:order.stampingFee||"",deposit:order.deposit||""});
  const [fls,setFls]=useState({});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCashOrder=order.orderType==="cash";
  const REQUIRED=["billingDate","customerFullName","customerIC","customerHP","customerEmail","customerAddress","customerPostCode","customerCity","itemCode","imeiSerial",...(isCashOrder?[]:["cashPriceOnListing","monthlyInstallment"])];
  const FILE_FIELDS=isCashOrder?[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image",false]]:[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image",false],["resultListFile","Result Listing File",true],["agreementFile","Agreement File",true]];
  const missingFiles=FILE_FIELDS.filter(([k,,req])=>req&&!fls[k]&&!f[k]).map(([k])=>k);
  const missing=[...REQUIRED.filter(k=>!f[k]?.toString().trim()),...missingFiles];
  const submit=async()=>{
    if(missing.length)return;
    setSaving(true);
    const data={...f};
    const entries=Object.entries(fls).filter(([,file])=>file);
    const uploaded=await Promise.all(entries.map(([k,file])=>readFile(file,order.id).then(url=>[k,url])));
    uploaded.forEach(([k,url])=>{data[k]=url;});
    onSubmit(data);
    setSaving(false);
  };
  const row=(k,l,t="text",req=false,full=false)=><div key={k} style={full?{gridColumn:"1/-1"}:{}}>
    <L req={req}>{l}</L>
    <I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&!f[k]?.toString().trim()?{borderColor:"#FECACA"}:{}}/>
  </div>;
  const lockedRow=(k,l,t="text",full=false)=><div key={k} style={full?{gridColumn:"1/-1"}:{}}>
    <L>{l}</L>
    <I type={t} value={f[k]||""} disabled style={{background:C.surface,color:C.textMid,cursor:"not-allowed"}}/>
  </div>;
  const sec=t=><div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.07em",paddingTop:4,borderBottom:`1px solid ${C.border}`,paddingBottom:6}}>{t}</div>;
  return<div style={{...card,marginBottom:16}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Billing Request Form</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Prefilled fields are locked from the original order — new fields marked * are required</div></div>
    <div style={{padding:18}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {sec("Billing Info")}{row("billingDate","Billing Date","date",true)}{!isCashOrder&&lockedRow("agreementNumber","Agreement Number")}
        {sec("Customer Details (from order — locked)")}{lockedRow("customerFullName","Customer Full Name")}{lockedRow("customerIC","Customer IC No.")}{lockedRow("customerHP","HP Number")}{lockedRow("customerEmail","Email")}{lockedRow("customerAddress","Address","text",true)}{lockedRow("customerPostCode","Post Code")}{lockedRow("customerCity","City")}
        {sec("Item Details")}{row("itemCode","Item Code","text",true)}{row("imeiSerial","IMEI / Serial No.","text",true)}{row("freeGiftItemCode","Free Gift Item Code")}{row("freeGiftItemName","Free Gift Item Name")}{row("freeGiftSerialNo","Free Gift Serial No.")}
        {order.orderType!=="cash"&&lockedRow("cashPriceOnListing","Cash Price on Result Listing (RM) — from Finance Price","number")}
        {order.orderType!=="cash"&&lockedRow("monthlyInstallment","Monthly Installment (RM)","number")}
        {sec("Charges (from order — locked)")}{!isCashOrder&&lockedRow("agreementFee","Agreement Fee (RM)","number")}{!isCashOrder&&lockedRow("stampingFee","Stamping Fee (RM)","number")}{lockedRow("deposit","Deposit (RM)","number")}{!isCashOrder&&<div/>}
        {sec("File Uploads")}
        {FILE_FIELDS.map(([k,l,req])=>{
          const isMissing=req&&!fls[k]&&!f[k];
          return<div key={k}>
            <L req={req}>{l}</L>
            <div style={isMissing?{border:"1.5px solid #FECACA",borderRadius:8,padding:6}:{}}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFls(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
            </div>
            {(fls[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2,fontWeight:600}}>{fls[k]?.name||f[k]?.name}</div>}
            {isMissing&&<div style={{fontSize:10,color:"#DC2626",marginTop:2}}>Required</div>}
          </div>;
        })}
      </div>
      {missing.length>0&&<div style={{padding:"9px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill all required fields before submitting.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn><PBtn onClick={submit} disabled={!!missing.length||saving}>{saving?"Saving…":"Submit Billing Request"}</PBtn></div>
    </div>
  </div>;
}

/* ── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel,issueItems=[],merchant}){
  const [items,setItems]=useState(checklistItemsFor(merchant).map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const [consignmentNo,setConsignmentNo]=useState("");
  const [saving,setSaving]=useState(false);
  const allChecked=items.every(x=>x.checked);
  const canSubmit=allChecked&&consignmentNo.trim();
  const submit=async()=>{
    if(!canSubmit)return;
    setSaving(true);
    onSubmit(items,consignmentNo);
  };
  return<div style={{...card,marginBottom:16}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Agreement Checklist</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Tick all items and fill in the consignment note number before sending to HQ</div></div>
    <div style={{padding:16}}>
      {items.map((item,i)=><div key={i} onClick={()=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x))} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:9,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":C.surface,border:`1px solid ${item.issue&&!item.checked?"#FECACA":item.checked?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
        <div style={{width:18,height:18,borderRadius:4,background:item.checked?C.navy:"#fff",border:`2px solid ${item.checked?C.navy:item.issue?"#EF4444":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .15s"}}>{item.checked&&Ic.check}</div>
        <span style={{fontSize:12,fontWeight:item.checked?600:400,color:item.issue&&!item.checked?"#DC2626":item.checked?"#15803D":C.textMid}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:10,marginLeft:7,fontWeight:700,color:"#DC2626"}}> — Flagged</span>}</span>
      </div>)}
      <div style={{marginTop:10,marginBottom:4}}>
        <L req>Consignment Note No.</L>
        <I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/>
      </div>
      {!canSubmit&&<div style={{padding:"8px 12px",background:"#FFFBEB",borderRadius:8,border:"1px solid #FDE68A",fontSize:11,color:"#92400E",marginBottom:12,marginTop:8,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} {!allChecked?"All items must be ticked":"Consignment note number must be filled in"} before submitting.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn><PBtn onClick={submit} disabled={!canSubmit||saving}>{saving?"Saving…":"Submit Checklist"}</PBtn></div>
    </div>
  </div>;
}

/* ── Report generators ────────────────────────────────────────────────── */
function calcAmountDueByMerchant(o){
  const cashPrice=parseFloat(o.billingData?.cashPriceOnListing)||0;
  const deposit=parseFloat(o.billingData?.deposit??o.deposit)||0;
  const agreementFee=parseFloat(o.billingData?.agreementFee??o.agreementFee)||0;
  const stampingFee=parseFloat(o.billingData?.stampingFee??o.stampingFee)||0;
  return cashPrice-deposit-agreementFee-stampingFee;
}
// Claim Amount = Finance Price − Deposit − Stamping Fee − Agreement Fee,
// using the top-level order fields entered at order creation.
function calcClaimAmount(o){
  const financePrice=parseFloat(o.financePrice)||0;
  const deposit=parseFloat(o.deposit)||0;
  const stampingFee=parseFloat(o.stampingFee)||0;
  const agreementFee=parseFloat(o.agreementFee)||0;
  return financePrice-deposit-stampingFee-agreementFee;
}

async function downloadReport(orders,type,dateFilter,merchantFilter){
  const isClaim=type==="claim";
  const isKnockoff=type==="knockoff";
  const isCompleted=type==="completed";
  const isAgreementReceived=type==="agreementReceived";
  const isFirstInstallment=type==="firstInstallment";
  const isCashKnockoff=type==="cashKnockoff";
  const isCollectionOverdue=type==="collectionOverdue";
  const isFirstInstallmentKnockoff=type==="firstInstallmentKnockoff";
  const isUpfront1Knockoff=type==="upfront1Knockoff";
  const isPaymentCollection=type==="paymentCollection";
  const isPurchaseClaim=type==="purchaseClaim";
  // Cash orders aren't tied to a merchant, so the merchant filter doesn't
  // apply to this report. "cash" itself is a special filter value (not a
  // real merchant) that filters by orderType instead of the merchant field.
  orders=(merchantFilter&&merchantFilter!=="all"&&!isCashKnockoff)?(merchantFilter==="cash"?orders.filter(o=>o.orderType==="cash"):orders.filter(o=>o.merchant===merchantFilter)):orders;
  // The `orders` array passed in only has header fields — no `.history` (that's
  // lazily loaded per-order elsewhere for performance). These two report types
  // need to scan actual history entries, so fetch it in one batched query and
  // attach it before filtering — otherwise every history-based lookup below
  // silently comes back empty.
  if(isFirstInstallment||isCashKnockoff||isPurchaseClaim){
    const histByOrder=await getHistoryForOrders(orders.map(o=>o.id));
    orders=orders.map(o=>({...o,history:histByOrder[o.id]||[]}));
  }
  // First Monthly Installment — based on the "Upfront Payment Date" field the
  // admin actually fills in at step 9 (Collection Verified), NOT the system
  // date the save button happened to be clicked on (those can differ, e.g.
  // when an entry is filed a day late or backdated). Same field used by the
  // Cash Order Knock Off report's getCashBalanceEntry below, for consistency.
  // An order can have more than one such tick over its life (e.g. a short
  // payment redo), so we take the latest one that matches the filter date.
  const getInstallmentEntry=o=>{
    const entries=(o.history||[]).filter(h=>h.step===9&&h.paymentChecked&&h.monthlyInstallment!==undefined&&h.monthlyInstallment!==null&&h.monthlyInstallment!=="");
    const matching=dateFilter?entries.filter(h=>h.upfrontPaymentDate===dateFilter):entries;
    return matching[matching.length-1];
  };
  // Cash Order Knock Off — same "latest verification at step 9" lookup as
  // above, since a cash order's balance payment date/amount/method is
  // recorded there too (as upfrontPaymentDate/monthlyInstallment/paymentMethod).
  const getCashBalanceEntry=o=>{
    const entries=(o.history||[]).filter(h=>h.step===9&&h.upfrontPaymentDate);
    const matching=dateFilter?entries.filter(h=>h.upfrontPaymentDate===dateFilter):entries;
    return matching[matching.length-1];
  };
  const filtered=orders.filter(o=>{
    // Cancelled orders never appear in any report.
    if(o.cancelled)return false;
    // Every report except Cash Order Knock Off and Purchase Claim is
    // CCM-only (stock request and ready stock CCM orders) — cash orders have
    // their own dedicated report and shouldn't appear in these. Purchase
    // Claim is the exception because non-ready-stock cash orders still go
    // through Ordered/Arrived HQ like any CCM order, and still need the
    // Claim Release to Purchaser file uploaded there.
    if(o.orderType==="cash"&&!isCashKnockoff&&!isPurchaseClaim)return false;
    // Agreement Received — based on the actual date admin clicked "confirm
    // agreement received by HQ" (stepDates records this the moment step 11
    // is reached, regardless of what the order's current step is now). With
    // a specific date picked, show every order that reached this step that
    // day, wherever they are now. With "All Dates", show a current snapshot
    // instead — only orders still actually sitting at this step right now.
    if(isAgreementReceived){const d=o.stepDates?.["11"]?.date;if(!d)return false;return dateFilter?d===dateFilter:o.step===11;}
    // Completed — actual date the order was marked completed.
    if(isCompleted){const d=o.stepDates?.["14"]?.date;return!!d&&(!dateFilter||d===dateFilter);}
    // Claim Released — based on the knock-off date admin filled in.
    if(isKnockoff)return o.knockOffDate&&(!dateFilter||o.knockOffDate===dateFilter);
    // Claim Submitted — based on the claim-sent-to-merchant date admin filled
    // in. Same "All Dates = current snapshot" rule as Agreement Received.
    if(isClaim){if(!o.claimSentDate)return false;return dateFilter?o.claimSentDate===dateFilter:o.step===12;}
    // With a specific date, show every order whose first monthly installment
    // was collected that day. With "All Dates", show a current snapshot
    // instead — collected orders that haven't been knocked off yet.
    if(isFirstInstallment){
      const entry=getInstallmentEntry(o);
      if(!entry)return false;
      return dateFilter?true:!o.firstInstallmentKnockOffDate;
    }
    // Collection Proof Overdue — a live snapshot of orders stuck at "Billed"
    // (step 7) past the same day they were billed, still missing their
    // collection & payment proof upload. Not date-filtered — there's no
    // historical "date" this happened on, it's just current status, so the
    // date picker is ignored for this report.
    if(isCollectionOverdue){
      if(o.step<6||o.step>=8)return false;
      const billingDate=o.billingData?.billingDate;
      if(!billingDate)return false;
      return daysSince(billingDate)>=1;
    }
    // First Monthly Installment Knock Off — a record of installments that
    // HAVE been knocked off (paid to the merchant), the flip side of the
    // First Monthly Installment Report above.
    if(isFirstInstallmentKnockoff)return o.firstInstallmentKnockOffDate&&(!dateFilter||o.firstInstallmentKnockOffDate===dateFilter);
    // Upfront 1 Payment Knock Off — Upfront 1 has two separate knock-off
    // stages (K/O 1 and K/O 2), so this matches on EITHER date being set
    // and matching the filter, non-cash CCM orders only.
    if(isUpfront1Knockoff){
      if(o.orderType==="cash")return false;
      return(o.upfront1KnockOffDate&&(!dateFilter||o.upfront1KnockOffDate===dateFilter))
        ||(o.upfront1KnockOff2Date&&(!dateFilter||o.upfront1KnockOff2Date===dateFilter));
    }
    // Payment Collection Overview — every payment actually collected from
    // the customer, cash and CCM orders together: cash Deposit (from New
    // Order Request) + Balance (from Collection Verified), CCM Upfront 1 +
    // Upfront 2 (both verified together in the same Collection Verified
    // step, sharing one payment date). Uses upfrontPaymentDate — the date
    // admin manually sets as the actual payment date — not .date, which
    // is just the automatic system timestamp of when admin responded to
    // that step, not when the payment itself happened.
    if(isPaymentCollection){
      if(o.orderType==="cash"){
        return(o.depositPaymentDate&&(!dateFilter||o.depositPaymentDate===dateFilter))
          ||(o.lastVerification?.upfrontPaymentDate&&(!dateFilter||o.lastVerification.upfrontPaymentDate===dateFilter));
      }
      return o.lastVerification?.upfrontPaymentDate&&(!dateFilter||o.lastVerification.upfrontPaymentDate===dateFilter);
    }
    // Cash Order Knock Off — matches on EITHER the deposit payment date
    // (from New Order Request) OR the balance payment date (from Collection
    // Verified), cash orders only.
    if(isCashKnockoff){
      if(o.orderType!=="cash")return false;
      const bal=getCashBalanceEntry(o); // already respects dateFilter internally
      const depositOk=o.depositPaymentDate&&(!dateFilter||o.depositPaymentDate===dateFilter);
      return!!(depositOk||bal);
    }
    // Purchase Claim — a live snapshot, not date-filtered (same reasoning as
    // Collection Proof Overdue: this is current outstanding status, not a
    // historical date). Shows every order that has been Ordered (step 2,
    // which is where PO Number/Supplier/Purchaser get filled in) but where
    // no history entry at step 3 (Arrived HQ) has the "Claim Release to
    // Purchaser" file uploaded yet. The moment that file is uploaded, the
    // order drops out of this report on its own — nothing to knock off.
    if(isPurchaseClaim){
      if(!o.orderDate)return false;
      const claimUploaded=(o.history||[]).some(h=>h.step===3&&h.files?.claimToPurchaser);
      return!claimUploaded;
    }
    // Upfront Payment — follows the date the admin clicked "Confirm:
    // Collection Verified" (h.date), not the typed Upfront/2nd Payment Date
    // fields (those are now shown as their own reference columns instead).
    const h=o.lastVerification;
    return h&&(h.upfrontPaymentDate||h.secondPaymentDate)&&(!dateFilter||h.date===dateFilter);
  }).sort((a,b)=>(a.invoiceNo||"").localeCompare(b.invoiceNo||""));
  if(!filtered.length){alert(`No records found${dateFilter?` for ${fDate(dateFilter)}`:""}.`);return;}
  const dateStr=dateFilter?fDate(dateFilter):"All Dates";
  const merchantLabel=isCashKnockoff?"N/A (Cash Orders)":(merchantFilter==="cash"?"Cash Orders":(merchantFilter&&merchantFilter!=="all"?merchantFilter:"All Merchants"));
  let rows="",total1=0,total2=0,total3=0,total4=0;
  if(isAgreementReceived){
    const showReceivedCol=!dateFilter;
    rows=filtered.map((o,i)=>{
      const claim=calcClaimAmount(o);total1+=claim;
      const receivedCol=showReceivedCol?`<td>${fDate(o.stepDates?.["11"]?.date)}</td>`:"";
      return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.branch}</td><td>${o.agreementNumber||"—"}</td><td>${fDate(o.aeonApprovalDate)}</td>${receivedCol}<td>RM ${claim.toFixed(2)}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="${showReceivedCol?6:5}"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isClaim){
    rows=filtered.map((o,i)=>{const claim=calcClaimAmount(o);total1+=claim;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.branch}</td><td>${o.agreementNumber||"—"}</td><td>${fDate(o.claimSentDate)}</td><td>RM ${claim.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="5"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isKnockoff){
    rows=filtered.map((o,i)=>{const ka=parseFloat(o.knockOffAmount)||0;const claim=calcClaimAmount(o);total1+=ka;total2+=claim;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.agreementNumber||"—"}</td><td>RM ${ka.toFixed(2)}</td><td>RM ${claim.toFixed(2)}</td><td>${o.claimReportKnockOffDate?fDate(o.claimReportKnockOffDate):"Pending"}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="3"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td><b>RM ${total2.toFixed(2)}</b></td><td></td></tr>`;
  } else if(isCompleted){
    rows=filtered.map((o,i)=>{const claim=calcClaimAmount(o);total1+=claim;const d=o.stepDates?.["14"]?.date;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.branch}</td><td>${o.agreementNumber||"—"}</td><td>${fDate(d)}</td><td>RM ${claim.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="5"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isFirstInstallment){
    rows=filtered.map((o,i)=>{const h=getInstallmentEntry(o);const amt=parseFloat(h?.monthlyInstallment)||0;total1+=amt;return`<tr><td>${i+1}</td><td>${o.agreementNumber||"—"}</td><td>${o.customerName}</td><td><b>${o.invoiceNo||"—"}</b></td><td>RM ${amt.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="4"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isCashKnockoff){
    rows=filtered.map((o,i)=>{
      const bal=getCashBalanceEntry(o); // already null if it doesn't match dateFilter
      const depositOk=!dateFilter||o.depositPaymentDate===dateFilter;
      const showExpected=!!bal||!dateFilter;
      const depositAmt=depositOk?parseFloat(o.deposit)||0:0;
      const balAmt=bal?parseFloat(bal.monthlyInstallment)||0:0;
      const expected=showExpected?(parseFloat(o.retailPrice)||0)-(parseFloat(o.deposit)||0):0;
      total1+=balAmt;total2+=expected;
      return`<tr><td>${i+1}</td><td>${o.phoneModel}</td><td>${o.branch}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${depositOk?fDate(o.depositPaymentDate):"—"}</td><td>${depositOk?(o.depositPaymentMethod||"—"):"—"}</td><td>${depositOk?`RM ${depositAmt.toFixed(2)}`:"—"}</td><td>${bal?fDate(bal.date):"—"}</td><td>${bal?(bal.paymentMethod||"—"):"—"}</td><td>${bal?`RM ${balAmt.toFixed(2)}`:"—"}</td><td>${showExpected?`RM ${expected.toFixed(2)}`:"—"}</td><td>${o.cashReportKnockOffDate?fDate(o.cashReportKnockOffDate):"Pending"}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="9"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td><b>RM ${total2.toFixed(2)}</b></td><td></td></tr>`;
  } else if(isCollectionOverdue){
    rows=filtered.map((o,i)=>{
      const billingDate=o.billingData?.billingDate;
      const days=daysSince(billingDate);
      return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.branch}</td><td>${o.agreementNumber||"—"}</td><td>${o.customerName}</td><td>${fDate(billingDate)}</td><td>${days} day${days!==1?"s":""}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="6"><b>TOTAL (${filtered.length})</b></td><td></td></tr>`;
  } else if(isFirstInstallmentKnockoff){
    rows=filtered.map((o,i)=>{
      const amt=parseFloat(o.monthlyInstallment)||0;
      total1+=amt;
      return`<tr><td>${i+1}</td><td>${o.agreementNumber||"—"}</td><td>${o.customerName}</td><td><b>${o.invoiceNo||"—"}</b></td><td>RM ${amt.toFixed(2)}</td><td>${fDate(o.firstInstallmentKnockOffDate)}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="4"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td></td></tr>`;
  } else if(isUpfront1Knockoff){
    rows=filtered.map((o,i)=>{
      const amt=calcUpfront(o).total;
      total1+=amt;
      return`<tr><td>${i+1}</td><td>${o.agreementNumber||"—"}</td><td>${o.customerName}</td><td><b>${o.invoiceNo||"—"}</b></td><td>RM ${amt.toFixed(2)}</td><td>${o.upfront1KnockOffDate?fDate(o.upfront1KnockOffDate):"Pending"}</td><td>${o.upfront1KnockOff2Date?fDate(o.upfront1KnockOff2Date):"Pending"}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="4"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td></td><td></td></tr>`;
  } else if(isPaymentCollection){
    rows=filtered.map((o,i)=>{
      const isCash=o.orderType==="cash";
      const amt1=isCash?(parseFloat(o.deposit)||0):calcUpfront(o).total;
      const date1=isCash?o.depositPaymentDate:o.lastVerification?.upfrontPaymentDate;
      const amt2=parseFloat(o.lastVerification?.monthlyInstallment||o.monthlyInstallment)||0;
      const date2=o.lastVerification?.upfrontPaymentDate;
      total1+=amt1; total2+=amt2;
      return`<tr><td>${i+1}</td><td>${isCash?"Cash":"CCM"}</td><td>${o.customerName}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${amt1?`RM ${amt1.toFixed(2)}`:"—"}</td><td>${date1?fDate(date1):"—"}</td><td>${amt2?`RM ${amt2.toFixed(2)}`:"—"}</td><td>${date2?fDate(date2):"—"}</td><td>${o.lastVerification?.verificationRemark||"—"}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="4"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td></td><td><b>RM ${total2.toFixed(2)}</b></td><td></td><td></td></tr>`;
  } else if(isPurchaseClaim){
    rows=filtered.map((o,i)=>`<tr><td>${i+1}</td><td>${o.phoneModel||"—"}</td><td>${o.agreementNumber||"—"}</td><td>${o.branch}</td><td>${o.poNumber||"—"}</td><td>${o.purchaserName||"—"}</td><td>${fDate(o.orderDate)}</td><td>${o.supplierName||"—"}</td></tr>`).join("");
    rows+=`<tr class="tot"><td colspan="8"><b>TOTAL (${filtered.length})</b></td></tr>`;
  } else {
    rows=filtered.map((o,i)=>{
      const h=o.lastVerification;
      // Both amounts belong to the same verification event (one Confirm
      // click), so both are shown/hidden together based on that click's
      // date matching the report's date filter.
      const showRow=!dateFilter||h?.date===dateFilter;
      const amt1=showRow?parseFloat(h?.paymentProofAmount)||0:0;
      const amt2=showRow?parseFloat(h?.secondPaymentAmount)||0:0;
      total1+=amt1;total2+=amt2;
      // Upfront 1 = Agreement Fee + Stamping Fee + Deposit (the subtotal due
      // before collection). Upfront 2 = First Monthly Installment. Both are
      // fixed contract figures, not date-specific, so always shown.
      const upfront1=calcUpfront(o).total;
      const upfront2=parseFloat(h?.monthlyInstallment??o.monthlyInstallment)||0;
      total3+=upfront1;total4+=upfront2;
      return`<tr>${!dateFilter?`<td>${fDate(h?.date)}</td>`:""}<td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.customerName||"—"}</td><td>${o.agreementNumber||"—"}</td><td>${showRow?fDate(h?.upfrontPaymentDate):"—"}</td><td>${showRow&&amt1?`RM ${amt1.toFixed(2)}`:"—"}</td><td>${showRow?(h?.paymentMethod||"—"):"—"}</td><td>${showRow&&h?.secondPaymentDate?fDate(h.secondPaymentDate):"—"}</td><td>${showRow&&amt2?`RM ${amt2.toFixed(2)}`:"—"}</td><td>${showRow&&amt2?(h?.secondPayMethod||"—"):"—"}</td><td>RM ${upfront1.toFixed(2)}</td><td>${o.upfront1KnockOffDate?fDate(o.upfront1KnockOffDate):"Pending"}</td><td>RM ${upfront2.toFixed(2)}</td><td>${o.upfront2KnockOffDate?fDate(o.upfront2KnockOffDate):"Pending"}</td></tr>`;
    }).join("");
    rows+=`<tr class="tot"><td colspan="${!dateFilter?5:4}"><b>TOTAL (${filtered.length})</b></td><td></td><td><b>RM ${total1.toFixed(2)}</b></td><td></td><td></td><td><b>RM ${total2.toFixed(2)}</b></td><td></td><td><b>RM ${total3.toFixed(2)}</b></td><td></td><td><b>RM ${total4.toFixed(2)}</b></td><td></td></tr>`;
  }
  const title=isAgreementReceived?"Agreement Received by HQ Report":isCompleted?"Completed Orders Report":isKnockoff?"Claim Released - Knock Off Report":isClaim?"Claim Submitted Report":isFirstInstallment?"First Monthly Installment Report":isCashKnockoff?"Cash Order Knock Off Report":isCollectionOverdue?"Collection Proof Overdue Report":isFirstInstallmentKnockoff?"First Monthly Installment Knock Off Report":isUpfront1Knockoff?"Upfront 1 Payment Knock Off Report":isPaymentCollection?"Payment Collection Overview":isPurchaseClaim?"Purchase Claim Report":"Upfront Payment Report";
  const heads=isAgreementReceived?`<th>#</th><th>Invoice No</th><th>Branch</th><th>Agreement No</th><th>Merchant Approval Date</th>${!dateFilter?"<th>Date of Agreement Received by HQ</th>":""}<th>Claim Amount</th>`
    :isCompleted?"<th>#</th><th>Invoice No</th><th>Branch</th><th>Agreement No</th><th>Completed Date</th><th>Claim Amount</th>"
    :isKnockoff?"<th>#</th><th>Invoice No</th><th>Agreement No</th><th>Knock-off Amount</th><th>Expected Claim Amount</th><th>Reconciled</th>"
    :isClaim?"<th>#</th><th>Invoice No</th><th>Branch</th><th>Agreement No</th><th>Claim Sent Date</th><th>Claim Amount</th>"
    :isFirstInstallment?"<th>#</th><th>Agreement No</th><th>Customer Name</th><th>Invoice No</th><th>Monthly Installment Amount</th>"
    :isCashKnockoff?"<th>#</th><th>Device Name</th><th>Branch</th><th>Invoice No</th><th>Deposit Payment Date</th><th>Deposit Payment Method</th><th>Deposit Amount</th><th>Balance Payment Date</th><th>Balance Payment Method</th><th>Balance Payment Amount</th><th>Expected Balance Payment Amount</th><th>Reconciled</th>"
    :isCollectionOverdue?"<th>#</th><th>Invoice No</th><th>Branch</th><th>Agreement No</th><th>Customer Name</th><th>Billing Date</th><th>Days Overdue</th>"
    :isFirstInstallmentKnockoff?"<th>#</th><th>Agreement No</th><th>Customer Name</th><th>Invoice No</th><th>Monthly Installment Amount</th><th>Knock-off Date</th>"
    :isUpfront1Knockoff?"<th>#</th><th>Agreement No</th><th>Customer Name</th><th>Invoice No</th><th>Upfront 1 Amount</th><th>K/O 1 Date</th><th>K/O 2 Date</th>"
    :isPaymentCollection?"<th>#</th><th>Type</th><th>Customer Name</th><th>Invoice No</th><th>Deposit / Upfront 1</th><th>Date</th><th>Balance / Upfront 2</th><th>Date</th><th>Remark</th>"
    :isPurchaseClaim?"<th>#</th><th>Device Name</th><th>Agreement No</th><th>Branch</th><th>PO Number</th><th>Purchaser</th><th>Order Date</th><th>Supplier Name</th>"
    :`${!dateFilter?"<th>Date Verified</th>":""}<th>#</th><th>Invoice No</th><th>Customer Name</th><th>Agreement No</th><th>Upfront Payment Date</th><th>Payment Proof Amount</th><th>Method</th><th>2nd Upfront Payment Date</th><th>2nd Payment Proof Amount</th><th>2nd Method</th><th>Upfront 1 Amount</th><th>Upfront 1 Knocked Off</th><th>Upfront 2 Amount</th><th>Upfront 2 Knocked Off</th>`;
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — ${dateStr}</title><style>body{font-family:Inter,sans-serif;margin:28px;color:#0A1628}h1{font-size:17px;font-weight:800;margin-bottom:2px}h2{font-size:12px;color:#8A96A8;margin:0 0 20px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0A1628;color:#fff;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em}td{padding:7px 10px;border-bottom:1px solid #E4EAF2}tr:nth-child(even) td{background:#F7F9FC}.tot td{background:#0A1628;color:#fff;font-size:12px}.footer{margin-top:16px;font-size:10px;color:#8A96A8}</style></head><body><h1>${title}</h1><h2>${dateStr} · ${filtered.length} record${filtered.length!==1?"s":""} · Merchant: ${merchantLabel}</h2><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated ${new Date().toLocaleString("en-MY")} · EMAX Network Sdn Bhd</div></body></html>`;
  const w=window.open("","_blank");if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
}

/* ── Action Panel ─────────────────────────────────────────────────────── */
function BillingDetailsCard({billingData:bd,isCash,title="Billing Request Details (as submitted)",liveOrder}){
  if(!bd)return null;
  // Agreement Fee, Stamping Fee, Deposit, Monthly Installment, and Agreement
  // Number all overlap with the main Order's own editable fields — if admin
  // corrects one of these after the billing form was submitted, show the
  // corrected value here too rather than freezing at the original submission.
  // Everything else here (customer/item details) stays as the historical
  // record of what was actually submitted.
  const agreementFee=liveOrder?.agreementFee!=null&&liveOrder.agreementFee!==""?liveOrder.agreementFee:bd.agreementFee;
  const stampingFee=liveOrder?.stampingFee!=null&&liveOrder.stampingFee!==""?liveOrder.stampingFee:bd.stampingFee;
  const deposit=liveOrder?.deposit!=null&&liveOrder.deposit!==""?liveOrder.deposit:bd.deposit;
  const monthlyInstallment=liveOrder?.monthlyInstallment!=null&&liveOrder.monthlyInstallment!==""?liveOrder.monthlyInstallment:bd.monthlyInstallment;
  const agreementNumber=liveOrder?.agreementNumber!=null&&liveOrder.agreementNumber!==""?liveOrder.agreementNumber:bd.agreementNumber;
  const rows=[["Billing Date",fDate(bd.billingDate)],["Customer Name",bd.customerFullName],["Customer IC",bd.customerIC],["HP Number",bd.customerHP],["Item Code",bd.itemCode],["IMEI / Serial No.",bd.imeiSerial],agreementNumber&&["Agreement Number",agreementNumber],!isCash&&["Cash Price on Listing",fRM(bd.cashPriceOnListing)],!isCash&&["Monthly Installment",fRM(monthlyInstallment)],agreementFee&&["Agreement Fee",fRM(agreementFee)],stampingFee&&["Stamping Fee",fRM(stampingFee)],deposit&&["Deposit",fRM(deposit)]].filter(Boolean);
  const fileKeys=[["deviceSerialImg","Device Serial No. Image"],["freeGiftSerialImg","Free Gift Serial No. Image"],["resultListFile","Result Listing File"],["agreementFile","Agreement File"]];
  const hasFiles=fileKeys.some(([k])=>bd[k]);
  return<div className="order-info-card" style={{background:C.surface,borderRadius:9,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:12}}>
    <div style={{...lbl,marginBottom:4}}>{title}</div>
    <div className="order-info-grid">
      {rows.map(([l,v])=><div key={l} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>{l}</div>
        <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{v||"—"}</div>
      </div>)}
      {bd.customerEmail&&<div className="oi-full" style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Email</div>
        <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{bd.customerEmail}</div>
      </div>}
      {bd.customerAddress&&<div className="oi-full" style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Address{(bd.customerPostCode||bd.customerCity)?` (${[bd.customerPostCode,bd.customerCity].filter(Boolean).join(", ")})`:""}</div>
        <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{bd.customerAddress}</div>
      </div>}
      {(bd.freeGiftItemCode||bd.freeGiftItemName)&&<div className="oi-full" style={{padding:"6px 0",minWidth:0}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Free Gift</div>
        <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{bd.freeGiftItemCode||"—"}{bd.freeGiftItemName?` · ${bd.freeGiftItemName}`:""}{bd.freeGiftSerialNo?` · Serial: ${bd.freeGiftSerialNo}`:""}</div>
      </div>}
    </div>
    <div style={{...lbl,margin:"10px 0 6px"}}>Uploaded Files</div>
    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
      {fileKeys.map(([k,l])=>bd[k]&&<a key={k} href={bd[k].url||bd[k].data} target={bd[k].url?"_blank":undefined} rel={bd[k].url?"noopener noreferrer":undefined} download={bd[k].url?undefined:bd[k].name} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:C.blue,textDecoration:"none",background:"#EEF1F7",padding:"4px 10px",borderRadius:5,fontWeight:600,border:"1px solid #C7D2E3"}}>{Ic.download} {l}</a>)}
      {!hasFiles&&<span style={{fontSize:11,color:C.textLight,fontStyle:"italic"}}>No files uploaded.</span>}
    </div>
  </div>;
}

// Which order-page role (see auth/orderRoles.js) is responsible for a given
// step — used only for the forceViewOnly message below, so a restricted
// viewer knows exactly who to chase up, not just "Admin".
// Which order-page role (see auth/orderRoles.js) — or Branch — is actually
// responsible for a given step, used for the forceViewOnly message below so
// a restricted viewer knows exactly who to chase up. Must respect `who`:
// steps marked "branch" or "both" are genuinely done by the branch rep, not
// by any of the restricted admin-side roles, regardless of which phase the
// step falls under.
function stepRoleLabel(step,who){
  if(who==="branch"||who==="both")return"Branch";
  if([1,2,3].includes(step))return"Purchase user";
  if([4,5].includes(step))return"Stock user";
  if([6,7,8,9,10,11,12,13].includes(step))return"Billing user";
  return who==="admin"?"Admin":"Branch";
}

function ActionPanel({order,isAdmin,onUpdate,allOrders,forceViewOnly=false,orderPermissions}){
  const step=order.step;
  const isCash=order.orderType==="cash";
  const nextStepN=nextStepNum(order);
  const nextDef=nextStepN?getStep(nextStepN):null;
  // "Reject by Merchant" is restricted to Billing role, Super Admin, and
  // Manager/Boss Viewer — NOT Knock-off/Purchase/Stock, even though every
  // order-system role passes isAdmin=true uniformly from order-main.jsx.
  // Boss/Manager Viewer naturally qualify here too: when not elevated they
  // get orderPermissions=null, which this same "!orderPermissions" check
  // already treats as full access everywhere else in this file.
  const isSuperAdminOrderPanel=isAdmin&&(!orderPermissions||orderPermissions.adminSteps==="all");
  const isBillingRolePanel=isAdmin&&!!orderPermissions&&orderPermissions.adminSteps!=="all"&&orderPermissions.adminSteps.includes(7);
  const canRejectByMerchant=isSuperAdminOrderPanel||isBillingRolePanel;
  const [showRejectPanel,setShowRejectPanel]=useState(false);
  const [rejectRemark,setRejectRemark]=useState("");
  const [showResubmitPanel,setShowResubmitPanel]=useState(false);
  const [resubmitDate,setResubmitDate]=useState(nowDate());
  const [resubmitConsignmentNote,setResubmitConsignmentNote]=useState("");
  const [refundFile,setRefundFile]=useState(null);
  const [refundUploading,setRefundUploading]=useState(false);
  const [remark,setRemark]=useState("");
  const [invoiceNo,setInvoiceNo]=useState("");
  const [orderDate,setOrderDate]=useState(nowDate());
  const [supplierName,setSupplierName]=useState("");
  const [poNumber,setPoNumber]=useState("");
  const [consignmentNo,setConsignmentNo]=useState("");
  const [stockTransferNo,setStockTransferNo]=useState("");
  const [purchaserName,setPurchaserName]=useState("");
  const [claimSentDate,setClaimSentDate]=useState(nowDate());
  const [claimConsignmentNo,setClaimConsignmentNo]=useState("");
  const [knockOffDate,setKnockOffDate]=useState(nowDate());
  const [knockOffAmount,setKnockOffAmount]=useState("");
  const [files,setFiles]=useState({});
  const [collection,setCollection]=useState(false);
  const [payment,setPayment]=useState(false);
  const [verRemark,setVerRemark]=useState("");
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [upfrontMonthly,setUpfrontMonthly]=useState(order.monthlyInstallment||order.billingData?.monthlyInstallment||"");
  const [payMethod,setPayMethod]=useState(PAYMENT_METHODS[0]);
  const [paymentProofAmount,setPaymentProofAmount]=useState("");
  const [secondPaymentDate,setSecondPaymentDate]=useState(nowDate());
  const [secondPayMethod,setSecondPayMethod]=useState(PAYMENT_METHODS[0]);
  const [secondPaymentAmount,setSecondPaymentAmount]=useState("");
  const [saving,setSaving]=useState(false);
  const [showBilling,setShowBilling]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(checklistItemsFor(order.merchant).map(n=>({name:n,issue:false})));
  const [showShortPayment,setShowShortPayment]=useState(false);
  const [shortPayRemark,setShortPayRemark]=useState("");
  const upfront=calcUpfront(order);

  // Some roles can see this order's full history/status but aren't allowed
  // to act on THIS particular step (e.g. a Purchase-only user viewing an
  // order that's already moved on to Billing). Show what's pending, with no
  // way to actually submit anything — placed after all hooks above so the
  // early return never violates the Rules of Hooks.
  if(forceViewOnly){
    if(order.step===14)return<div style={{background:"#F0FDF4",borderRadius:12,padding:"16px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:10}}>{Ic.checkCircle}<div><div style={{fontWeight:700,fontSize:14,color:"#15803D"}}>Order Completed</div><div style={{fontSize:11,color:"#166534",marginTop:2}}>Knock-off: {fDate(order.knockOffDate)}</div></div></div>;
    return<div style={card}>
      <SecHdr icon={Ic.chevR}>{nextDef?`Next: ${nextDef.label}`:"Status"}</SecHdr>
      <div style={{padding:"14px 16px"}}>
        {nextDef?<>
          <div style={{fontSize:12,color:C.textMid,marginBottom:6}}>{nextDef.desc}</div>
          <div style={{fontSize:11,color:C.textLight,fontStyle:"italic"}}>Waiting for {stepRoleLabel(nextDef.step,nextDef.who)} to process this step.</div>
        </>:<div style={{fontSize:12,color:C.textLight,fontStyle:"italic"}}>No further action pending on this order.</div>}
      </div>
    </div>;
  }

  const isReadyOrphaned=order.stockStatus==="ready"&&[2,3].includes(step);
  if((step===4||isReadyOrphaned)&&!order.consignmentNo&&!order.stockTransferNo){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.truck}>Dispatched to Branch</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{background:"#F0FDF4",borderRadius:8,padding:"10px 12px",border:"1px solid #BBF7D0",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#15803D",fontWeight:600}}>{Ic.checkCircle} Ready stock order — fill in the Consignment Note No. and Stock Transfer No. for this dispatch.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><L req>Consignment Note Number</L><I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
            <div><L req>Stock Transfer Number</L><I value={stockTransferNo} onChange={e=>setStockTransferNo(e.target.value)} placeholder="Stock transfer no…" style={!stockTransferNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          </div>
          <PBtn onClick={async()=>{if(!consignmentNo.trim()||!stockTransferNo.trim()){alert("Please fill in both numbers.");return;}setSaving(true);const h={step:4,date:nowDate(),time:nowTime(),note:"Dispatch details recorded",consignmentNo,stockTransferNo};await onUpdate({...order,step:4,consignmentNo,stockTransferNo,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||!consignmentNo.trim()||!stockTransferNo.trim()} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Save Dispatch Details"}</PBtn>
        </div>
      </div>
    </div>;
  }

  if(step===13&&!isCash){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.checkCircle}>Claim Released</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{fontSize:12,marginBottom:8}}><span style={{color:C.textLight,fontWeight:600}}>Claim Sent: </span>{fDate(order.claimSentDate)}</div>
          <div style={{fontSize:12,marginBottom:8}}><span style={{color:C.textLight,fontWeight:600}}>Knock-off Date: </span>{fDate(order.knockOffDate)}</div>
          {order.knockOffAmount&&<div style={{fontSize:12,marginBottom:12}}><span style={{color:C.textLight,fontWeight:600}}>Knock-off Amount: </span>{fRM(order.knockOffAmount)}</div>}
          {isAdmin&&<><Divider/><DBtn onClick={async()=>{if(!confirm("Move to Completed?"))return;setSaving(true);const h={step:14,date:nowDate(),time:nowTime(),note:"Completed and archived"};await onUpdate({...order,step:14,history:[...(order.history||[]),h]});setSaving(false);}} style={{width:"100%",justifyContent:"center"}}>{Ic.trash} Mark as Completed</DBtn></>}
        </div>
      </div>
    </div>;
  }
  if(step===14)return<div style={{background:"#F0FDF4",borderRadius:12,padding:"16px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:10}}>{Ic.checkCircle}<div><div style={{fontWeight:700,fontSize:14,color:"#15803D"}}>Order Completed</div><div style={{fontSize:11,color:"#166534",marginTop:2}}>Knock-off: {fDate(order.knockOffDate)}</div></div></div>;
  if(!nextDef)return null;
  const branchOk=isAdmin||[5,6,8,10].includes(nextDef.step)||(nextDef.step===9&&isShortPaymentPending(order));

  if(nextDef.step===6&&branchOk){
    const isCashOrder=order.orderType==="cash";
    const approvalDays=!isCashOrder?daysSince(order.aeonApprovalDate):null;
    const approvalBlocked=!isCashOrder&&approvalDays!==null&&approvalDays>60;
    if(approvalBlocked)return<ActionBox icon={Ic.alertCircle} title="Billing Request Blocked">
      <div style={{padding:"10px 12px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,fontSize:12,color:"#DC2626",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>{Ic.alertCircle} Unable to proceed. Agreement approval date is {approvalDays} days ago — exceeded the 60-day limit. Please submit a new agreement.</div>
    </ActionBox>;
    if(showBilling)return<BillingForm order={order} onCancel={()=>setShowBilling(false)} onSubmit={async d=>{setSaving(true);const h={step:6,date:nowDate(),time:nowTime(),note:"Billing Request",billingData:d};await onUpdate({...order,step:6,billingData:d,history:[...(order.history||[]),h]});setSaving(false);setShowBilling(false);}}/>;
    return<ActionBox icon={Ic.clipboard} title="Billing Request" desc="Complete the billing form to advance."><PBtn onClick={()=>setShowBilling(true)} style={{width:"100%",justifyContent:"center"}}>Open Billing Form {Ic.chevR}</PBtn></ActionBox>;
  }
  if(nextDef.step===10){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    const lastChecklist=(order.history||[]).filter(h=>h.checklistItems).slice(-1)[0];
    const pending=lastReturn&&(!lastChecklist||(order.history||[]).indexOf(lastReturn)>(order.history||[]).indexOf(lastChecklist));
    if(showChecklist)return<ChecklistForm merchant={order.merchant} issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async(items,consignmentNo)=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items,agreementConsignmentNo:consignmentNo};await onUpdate({...order,step:10,checklistItems:items,agreementConsignmentNo:consignmentNo,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      {pending&&<div style={{...card}}>
        <SecHdr icon={Ic.alertCircle}><span style={{color:"#DC2626"}}>Rejected by HQ</span></SecHdr>
        <div style={{padding:"14px 16px"}}>
          {lastReturn.returnRemark&&<div style={{marginBottom:10,fontSize:12,color:"#78350F",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 12px"}}><b>Remark:</b> {lastReturn.returnRemark}</div>}
          {lastChecklist&&<div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {lastChecklist.checklistItems.map((item,i)=>{const failed=lastReturn.issueItems?.includes(item.name);return<span key={i} style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:failed?"#FEF2F2":"#F0FDF4",color:failed?"#DC2626":"#15803D",fontWeight:600,border:`1px solid ${failed?"#FECACA":"#BBF7D0"}`}}>{item.name}{failed?" — Flagged":""}</span>;})}
          </div>}
        </div>
      </div>}
      <ActionBox icon={Ic.clipboard} title="Agreement Checklist" desc="Complete checklist before sending to HQ."><PBtn onClick={()=>setShowChecklist(true)} style={{width:"100%",justifyContent:"center"}}>Open Checklist {Ic.chevR}</PBtn></ActionBox>
    </div>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};
    const fileEntries=Object.entries(files).filter(([,f])=>f);
    await Promise.all(fileEntries.map(async([k,f])=>{
      rf[k]=Array.isArray(f)?await Promise.all(f.map(x=>readFile(x,order.id))):await readFile(f,order.id);
    }));
    const totalBytes=Object.values(rf).reduce((sum,fl)=>sum+(Array.isArray(fl)?fl.reduce((s2,x)=>s2+(x?.data?.length||0),0):(fl?.data?.length||0)),0);
    if(totalBytes>4*1024*1024){
      alert("One or more of these files is too large to save (even after compression). Please use a smaller file — for PDFs, try re-exporting or scanning at a lower resolution — then try again.");
      setSaving(false);
      return;
    }
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,orderDate:nextDef.needsOrderDate?orderDate:undefined,supplierName:nextDef.needsOrderDate&&supplierName?supplierName:undefined,poNumber:nextDef.needsOrderDate&&poNumber?poNumber:undefined,purchaserName:nextDef.needsOrderDate&&purchaserName?purchaserName:undefined,consignmentNo:nextDef.needsTransferNumbers?consignmentNo:nextDef.needsClaimInfo?claimConsignmentNo:undefined,stockTransferNo:nextDef.needsTransferNumbers?stockTransferNo:undefined,claimSentDate:nextDef.needsClaimInfo?claimSentDate:undefined,knockOffDate:nextDef.needsKnockOff?knockOffDate:undefined,knockOffAmount:nextDef.needsKnockOff&&knockOffAmount?knockOffAmount:undefined,files:Object.keys(rf).length?rf:undefined,...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment,verificationRemark:verRemark||undefined,upfrontPaymentDate:upfrontDate,monthlyInstallment:upfrontMonthly,paymentProofAmount:!isCash?paymentProofAmount:undefined,totalDue:isCash?calcCashDue(order):upfront.total,totalUpfrontPayment:isCash?undefined:upfront.total+(parseFloat(upfrontMonthly)||0),paymentMethod:payMethod,...(isShortPaymentPending(order)?{secondPaymentDate,secondPayMethod,secondPaymentAmount}:{})}:{})};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(isCash&&nextDef.step===14){updated.step=14;}
    if(nextDef.needsOrderDate){updated.orderDate=orderDate;if(supplierName)updated.supplierName=supplierName;if(poNumber)updated.poNumber=poNumber;if(purchaserName)updated.purchaserName=purchaserName;}
    if(nextDef.needsTransferNumbers){updated.consignmentNo=consignmentNo;updated.stockTransferNo=stockTransferNo;}
    if(nextDef.needsClaimInfo){updated.claimSentDate=claimSentDate;updated.consignmentNo=claimConsignmentNo;}
    if(nextDef.needsKnockOff){updated.knockOffDate=knockOffDate;if(knockOffAmount)updated.knockOffAmount=knockOffAmount;}
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    // Denormalized onto the header (not just history) because the alert
    // system (getOrderAlerts) only has header-level order data to work with
    // for performance — it can't afford to fetch full history for every
    // active order on every render.
    if(rf.balancePaymentProof)updated.balancePaymentUploadedDate=nowDate();
    const ok=await onUpdate(updated);setSaving(false);if(ok!==false){setRemark("");setInvoiceNo("");setFiles({});setVerRemark("");setCollection(false);setPayment(false);setPoNumber("");setPurchaserName("");setConsignmentNo("");setStockTransferNo("");setClaimConsignmentNo("");}
  };
  const ok=()=>{
    if(!branchOk)return false;
    if(nextDef.needsOrderDate&&isAdmin&&(!orderDate||!supplierName.trim()||!poNumber.trim()||!purchaserName.trim()||!files.purchaseProof))return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsTransferNumbers&&branchOk&&(!consignmentNo.trim()||!stockTransferNo.trim()))return false;
    if(nextDef.needsClaimInfo&&isAdmin&&(!claimSentDate||!claimConsignmentNo.trim()))return false;
    if(nextDef.needsKnockOff&&isAdmin&&!knockOffDate)return false;
    if(nextDef.needsVerification&&!isAdmin)return false;
    if(nextDef.needsVerification&&isAdmin){
      if(!isCash&&!paymentProofAmount.toString().trim())return false;
      if(isCash&&!upfrontMonthly.toString().trim())return false;
      if(isShortPaymentPending(order)&&(!secondPaymentDate||!secondPaymentAmount.toString().trim()))return false;
      // The actual payment proof amount(s) must match the expected total
      // upfront payment (Upfront 1 + Upfront 2) before this can be
      // confirmed — otherwise a mismatched collection could slip through
      // unnoticed.
      if(!isCash){
        const expectedTotal=upfront.total+(parseFloat(upfrontMonthly)||0);
        const proof1=parseFloat(paymentProofAmount)||0;
        const proof2=isShortPaymentPending(order)?(parseFloat(secondPaymentAmount)||0):0;
        if(Math.abs((proof1+proof2)-expectedTotal)>0.01)return false;
      }
    }
    if(nextDef.needsFiles){const priorFiles=new Set((order.history||[]).filter(h=>h.step===nextDef.step).flatMap(h=>Object.keys(h.files||{})));const req=(nextDef.needsFiles||[]).filter(f=>!f.optional&&!(isCash&&f.key==="collectionProof")&&!priorFiles.has(f.key));if(branchOk&&req.some(f=>f.multiple?!(files[f.key]?.length):!files[f.key]))return false;}
    return true;
  };

  // Out of Stock (cash orders, step 1 only) — once flagged, blocks the
  // normal "Confirm" panel entirely until admin uploads the refund slip,
  // at which point the order auto-cancels. Anyone who can act at step 1
  // can flag it (branch usually notices stock isn't available first), but
  // only admin can actually upload the refund proof and complete the
  // cancellation, since that's a financial action.
  if(isCash&&step===1&&order.outOfStock&&!order.cancelled){
    return<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Out of Stock</div>
      <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>Flagged {fDate(order.outOfStockDate)} — waiting for the customer's deposit to be refunded and proof uploaded before this order is cancelled.</div>
      {isAdmin
        ?<>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setRefundFile(e.target.files[0]||null)} style={{fontSize:12,marginBottom:10}}/>
          <PBtn onClick={async()=>{if(!refundFile)return;setRefundUploading(true);const f=await readFile(refundFile,order.id);const cd=nowDate();await onUpdate({...order,cancelled:true,refundSlip:f,refundSlipDate:cd,cancelledReason:"Out of Stock — Customer Refunded",history:[...(order.history||[]),{step:order.step,date:cd,time:nowTime(),note:"Out of Stock — Refund slip uploaded, order cancelled",files:{refundSlip:f}}]});setRefundUploading(false);}} disabled={!refundFile||refundUploading} style={{width:"100%",justifyContent:"center"}}>{refundUploading?"Uploading…":"Upload Refund Slip & Cancel Order"}</PBtn>
        </>
        :<div style={{fontSize:12,color:C.textLight,fontStyle:"italic"}}>Waiting for admin to upload the refund slip and complete the cancellation.</div>}
    </div>;
  }

  // Blocks the normal "Confirm: Claim Released" panel entirely while a
  // rejection is unresolved — you can't release a claim that was just
  // rejected without resubmitting it first.
  if(nextDef.step===13&&order.merchantRejected&&!order.resubmittedDate&&canRejectByMerchant){
    return<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Merchant Rejected</div>
      <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>{fDate(order.merchantRejectedDate)} — {order.merchantRejectedRemark}</div>
      {!showResubmitPanel
        ?<PBtn onClick={()=>setShowResubmitPanel(true)} style={{width:"100%",justifyContent:"center"}}>{Ic.rotate} Resubmitted to Merchant</PBtn>
        :<div style={{borderTop:"1px solid #FECACA",paddingTop:10}}>
          <div style={{marginBottom:10}}><L req>Resubmitted Date</L><I type="date" value={resubmitDate} onChange={e=>setResubmitDate(e.target.value)} max={nowDate()} style={{width:"100%",boxSizing:"border-box"}}/></div>
          <div style={{marginBottom:12}}><L req>Consignment Note No.</L><I value={resubmitConsignmentNote} onChange={e=>setResubmitConsignmentNote(e.target.value)} placeholder="e.g. CN-123456" style={{width:"100%",boxSizing:"border-box"}}/></div>
          <div style={{display:"flex",gap:8}}>
            <GBtn onClick={()=>setShowResubmitPanel(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
            <PBtn onClick={async()=>{if(!resubmitDate||!resubmitConsignmentNote.trim()){alert("Resubmitted date and consignment note are both required.");return;}setSaving(true);await onUpdate({...order,resubmittedDate:resubmitDate,resubmittedConsignmentNote:resubmitConsignmentNote});setSaving(false);setShowResubmitPanel(false);}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.rotate} {saving?"Saving…":"Confirm Resubmission"}</PBtn>
          </div>
        </div>}
    </div>;
  }

  return<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <ActionBox icon={Ic.chevR} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
      {!branchOk?<div style={{fontSize:12,color:C.textLight,fontStyle:"italic",padding:"2px 0"}}>Waiting for admin to process this step.</div>:<>
        {nextDef.needsOrderDate&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Order Date</L><I type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></div>
          <div><L req>Supplier Name</L><I value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier name…" style={!supplierName.trim()?{borderColor:"#FECACA"}:{}}/></div>
          <div><L req>PO Number</L><I value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="PO number…" style={!poNumber.trim()?{borderColor:"#FECACA"}:{}}/></div>
          {isAdmin&&<div><L req>Purchaser Name</L><I value={purchaserName} onChange={e=>setPurchaserName(e.target.value)} placeholder="Purchaser name…" style={!purchaserName.trim()?{borderColor:"#FECACA"}:{}}/></div>}
          <div style={{gridColumn:"1/-1"}}>
            <L req>Purchase Proof</L>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,purchaseProof:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
            {files.purchaseProof&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{files.purchaseProof.name}</div>}
          </div>
        </div>}
        {nextDef.needsInvoiceNo&&isAdmin&&<>
          <div style={{marginBottom:12}}><L req>Sales Invoice Number</L><I value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
        </>}
        {step===8&&isShortPaymentPending(order)&&<div style={{marginBottom:12}}>
          <div style={{...lbl,marginBottom:8}}>Balance Payment Proof (Short Payment Correction)</div>
          <L req>Upload Balance Payment Proof</L>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,balancePaymentProof:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
          {files.balancePaymentProof&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{files.balancePaymentProof.name}</div>}
          <PBtn onClick={async()=>{if(!files.balancePaymentProof)return;setSaving(true);const f=await readFile(files.balancePaymentProof,order.id);const h={step:9,date:nowDate(),time:nowTime(),note:"Balance payment proof uploaded",shortPaymentProofUpload:true,files:{balancePaymentProof:f}};await onUpdate({...order,balancePaymentUploadedDate:nowDate(),history:[...(order.history||[]),h]});setSaving(false);setFiles(p=>({...p,balancePaymentProof:null}));}} disabled={!files.balancePaymentProof||saving} style={{width:"100%",justifyContent:"center",marginTop:8}}>{saving?"Saving…":"Submit Balance Payment Proof"}</PBtn>
        </div>}
        {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
          <div style={{...lbl,marginBottom:8}}>Verification Checklist</div>
          {(isCash?[[payment,setPayment,"Payment Proof verified"]]:[[collection,setCollection,"Phone Collection Proof verified"],[payment,setPayment,"Upfront Payment Proof verified"]]).map(([val,setter,label],i)=><div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,background:val?"#F0FDF4":C.surface,border:`1px solid ${val?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
            <div style={{width:18,height:18,borderRadius:4,background:val?C.navy:"#fff",border:`2px solid ${val?C.navy:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .15s"}}>{val&&Ic.check}</div>
            <span style={{fontSize:12,color:val?"#15803D":C.text,fontWeight:val?600:400}}>{label}</span>
          </div>)}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,margin:"10px 0"}}>
            <div><L req>{isCash?"Balance Payment Date":"Upfront Payment Date"}</L><I type="date" value={upfrontDate} onChange={e=>setUpfrontDate(e.target.value)}/></div>
            <div><L>Payment Method</L><SEL value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
            {!isCash&&<div style={{gridColumn:"1/-1"}}><L req>Payment Proof Amount (RM)</L><I type="number" value={paymentProofAmount} onChange={e=>setPaymentProofAmount(e.target.value)} placeholder="Actual amount per payment slip…"/></div>}
            {isCash?<div style={{gridColumn:"1/-1"}}><L>Total Due (auto: Retail − Deposit)</L><div style={{...inp,background:C.surface,color:C.textMid,fontWeight:600}}>{fRM(calcCashDue(order))}</div></div>:<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:4,whiteSpace:"nowrap"}}>Upfront 1 (Agreement + Stamping + Deposit)</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:C.textLight,fontSize:13,fontWeight:600}}><span>Amount</span><span>{fRM(upfront.total)}</span></div></div>}
            <div style={{gridColumn:"1/-1"}}>{isCash?<><L req>Balance Payment Amount (RM)</L><I type="number" value={upfrontMonthly} onChange={e=>setUpfrontMonthly(e.target.value)}/></>:<><div style={{fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:4,whiteSpace:"nowrap"}}>Upfront 2 (First Monthly Installment)</div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.surface,color:C.textMid,fontSize:13,fontWeight:600,cursor:"not-allowed"}}><span>Amount</span><span>{fRM(upfrontMonthly)}</span></div></>}</div>
            {!isCash&&<div style={{gridColumn:"1/-1"}}><L>Total Upfront Payment (RM)</L><div style={{...inp,background:C.navy,color:"#fff",fontWeight:800}}>{fRM(upfront.total+(parseFloat(upfrontMonthly)||0))}</div></div>}
            {!isCash&&(()=>{
              const expectedTotal=upfront.total+(parseFloat(upfrontMonthly)||0);
              const proof1=parseFloat(paymentProofAmount)||0;
              const proof2=isShortPaymentPending(order)?(parseFloat(secondPaymentAmount)||0):0;
              const totalProof=proof1+proof2;
              const hasEntry=paymentProofAmount.toString().trim()||(isShortPaymentPending(order)&&secondPaymentAmount.toString().trim());
              if(!hasEntry)return null;
              const matches=Math.abs(totalProof-expectedTotal)<=0.01;
              return<div style={{gridColumn:"1/-1",fontSize:11,fontWeight:700,color:matches?"#15803D":"#DC2626",padding:"6px 2px"}}>{matches?`Payment proof matches total upfront payment (${fRM(totalProof)})`:`Payment proof (${fRM(totalProof)}) does not match total upfront payment (${fRM(expectedTotal)}) — cannot confirm until this matches`}</div>;
            })()}
          </div>
          {isShortPaymentPending(order)&&<div style={{background:"#FFFBEB",borderRadius:9,padding:"12px 14px",border:"1px solid #FDE68A",marginBottom:12}}>
            <div style={{...lbl,marginBottom:8,color:"#92400E"}}>Second Payment Proof (Short Payment Correction)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><L req>{isCash?"2nd Balance Payment Date":"2nd Upfront Payment Date"}</L><I type="date" value={secondPaymentDate} onChange={e=>setSecondPaymentDate(e.target.value)}/></div>
              <div><L>Payment Method</L><SEL value={secondPayMethod} onChange={e=>setSecondPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
              <div style={{gridColumn:"1/-1"}}><L req>{isCash?"2nd Balance Payment Amount (RM)":"2nd Payment Proof Amount (RM)"}</L><I type="number" value={secondPaymentAmount} onChange={e=>setSecondPaymentAmount(e.target.value)} placeholder="Additional amount received…"/></div>
            </div>
          </div>}
          <div><L>Remark</L><I value={verRemark} onChange={e=>setVerRemark(e.target.value)} placeholder="Verification notes…"/></div>
        </div>}
        {nextDef.step===8&&!isCash&&<div style={{background:C.surface,borderRadius:9,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:12}}>
          <div style={{...lbl,marginBottom:8}}>Upfront Payment Breakdown</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",padding:"3px 0",borderBottom:`1px solid ${C.border}`}}><span>Description</span><span>Amount</span></div>
          {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>)}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:800}}><span>Upfront 1 (Subtotal — Agreement + Stamping + Deposit)</span><span>{fRM(upfront.total)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:800}}><span>Upfront 2 (First Monthly Installment)</span><span>{fRM(order.billingData?.monthlyInstallment||order.monthlyInstallment)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",borderTop:`2px solid ${C.navy}`,marginTop:6,fontWeight:800,color:C.navy}}><span>Total Upfront Payment Upon Collection</span><span>{fRM(upfront.total+(parseFloat(order.billingData?.monthlyInstallment||order.monthlyInstallment)||0))}</span></div>
        </div>}
        {nextDef.needsTransferNumbers&&branchOk&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Consignment Note Number</L><I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          <div><L req>Stock Transfer Number</L><I value={stockTransferNo} onChange={e=>setStockTransferNo(e.target.value)} placeholder="Stock transfer no…" style={!stockTransferNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
        </div>}
        {nextDef.needsClaimInfo&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Claim Sent Out to Merchant Date</L><I type="date" value={claimSentDate} onChange={e=>setClaimSentDate(e.target.value)}/></div>
          <div><L req>Consignment Note No.</L><I value={claimConsignmentNo} onChange={e=>setClaimConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!claimConsignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
        </div>}
        {nextDef.needsKnockOff&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Knock-off Date</L><I type="date" value={knockOffDate} onChange={e=>setKnockOffDate(e.target.value)}/></div>
          <div><L>Knock-off Amount (RM)</L><I type="number" value={knockOffAmount} onChange={e=>setKnockOffAmount(e.target.value)}/></div>
        </div>}
        {nextDef.needsFiles&&branchOk&&nextDef.needsFiles.filter(f=>!(isCash&&f.key==="collectionProof")).map(({key,label,optional,multiple})=>{
          const alreadyOnFile=!optional&&(order.history||[]).some(h=>h.step===nextDef.step&&h.files&&h.files[key]);
          return<div key={key} style={{marginBottom:12}}>
          <L req={!optional&&!alreadyOnFile}>{label}{optional?" (optional)":alreadyOnFile?" (already on file — re-upload only if there's a new one)":""}{multiple?" (multiple allowed)":""}</L>
          <input type="file" multiple={!!multiple} accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:multiple?[...(p[key]||[]),...Array.from(e.target.files)]:(e.target.files[0]||null)}))} style={{fontSize:11,width:"100%"}}/>
          {multiple?(files[key]||[]).length>0&&<div style={{marginTop:4,display:"flex",flexDirection:"column",gap:3}}>
            {files[key].map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:10,color:"#15803D",fontWeight:600,background:"#F0FDF4",padding:"3px 8px",borderRadius:5}}><span>{f.name}</span><button type="button" onClick={()=>setFiles(p=>({...p,[key]:p[key].filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12,fontWeight:700,padding:0}}>×</button></div>)}
          </div>:files[key]&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{files[key].name}</div>}
        </div>;})}
        {!nextDef.needsOrderDate&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&!nextDef.needsBillingForm&&!nextDef.needsClaimInfo&&!nextDef.needsKnockOff&&<div style={{marginBottom:12}}><L>Remark (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
        {nextDef.needsVerification&&!isAdmin?<div style={{fontSize:12,color:C.textLight,fontStyle:"italic",padding:"6px 0"}}>Uploaded proof will be reviewed by admin to complete verification.</div>:<PBtn onClick={advance} disabled={!ok()||saving} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":`Confirm: ${nextDef.label}`} {!saving&&Ic.chevR}</PBtn>}
        {nextDef.needsVerification&&isAdmin&&(!showShortPayment
          ?<DBtn onClick={()=>setShowShortPayment(true)} style={{width:"100%",justifyContent:"center",marginTop:8}}>{Ic.rotate} Short Payment</DBtn>
          :<div style={{marginTop:10}}>
            <div style={{marginBottom:8}}><L req>Reason / Remark</L><TX value={shortPayRemark} onChange={e=>setShortPayRemark(e.target.value)} rows={3} placeholder="e.g. Payment slip amount does not match Total Upfront Payment…" style={{borderColor:"#FECACA",resize:"none",width:"100%",boxSizing:"border-box",borderRadius:12}}/></div>
            <div style={{display:"flex",gap:8}}>
              <GBtn onClick={()=>setShowShortPayment(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
              <DBtn onClick={async()=>{if(!shortPayRemark.trim()){alert("Remark required.");return;}setSaving(true);const h={step:9,date:nowDate(),time:nowTime(),note:"Short Payment — Balance Payment Needed",verificationRemark:shortPayRemark,shortPayment:true};const ok=await onUpdate({...order,history:[...(order.history||[]),h]});setSaving(false);if(ok!==false){setShowShortPayment(false);setShortPayRemark("");alert("Short payment flagged. Branch can now upload the balance payment proof at Customer Collection.");}}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.rotate} {saving?"Saving…":"Confirm Short Payment"}</DBtn>
            </div>
          </div>
        )}
      </>}
    </ActionBox>
    {step===2&&isAdmin&&<DBtn onClick={async()=>{const reason=prompt("Reason for supplier cancellation (optional):")||"";if(!confirm("Mark this order as Supplier Cancelled and return it to New Order Request?"))return;setSaving(true);const cd=nowDate();const h={step:2,date:nowDate(),time:nowTime(),note:"Supplier Cancelled",cancelledDate:cd,remark:reason||undefined,reversedTo:1};await onUpdate({...order,step:1,history:[...(order.history||[]),h]});setSaving(false);}} style={{width:"100%",justifyContent:"center"}}>{Ic.x} Supplier Cancelled Order</DBtn>}
    {step===9&&isAdmin&&(!showShortPayment
      ?<DBtn onClick={()=>setShowShortPayment(true)} style={{width:"100%",justifyContent:"center"}}>{Ic.rotate} Short Payment</DBtn>
      :<div style={card}>
        <SecHdr icon={Ic.rotate}><span style={{color:"#DC2626"}}>Short Payment — Return to Collection</span></SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{marginBottom:12}}><L req>Reason / Remark</L><TX value={shortPayRemark} onChange={e=>setShortPayRemark(e.target.value)} rows={3} placeholder="Describe the shortfall…" style={{borderColor:"#FECACA",resize:"none",width:"100%",boxSizing:"border-box",borderRadius:12}}/></div>
          <div style={{display:"flex",gap:8}}>
            <GBtn onClick={()=>setShowShortPayment(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
            <DBtn onClick={async()=>{if(!shortPayRemark.trim()){alert("Remark required.");return;}setSaving(true);const h={step:9,date:nowDate(),time:nowTime(),note:"Short Payment — Balance Payment Needed",verificationRemark:shortPayRemark,shortPayment:true,reversedFrom:9};const ok=await onUpdate({...order,step:8,history:[...(order.history||[]),h]});setSaving(false);if(ok!==false){setShowShortPayment(false);setShortPayRemark("");alert("Order returned to Customer Collection. Branch can now upload the new payment slip.");}}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.rotate} {saving?"Saving…":"Confirm Short Payment"}</DBtn>
          </div>
        </div>
      </div>
    )}
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
    {isCash&&step===1&&!order.outOfStock&&<DBtn onClick={()=>{if(!window.confirm("Mark this order as out of stock? The customer's deposit will need to be refunded before it's cancelled."))return;onUpdate({...order,outOfStock:true,outOfStockDate:nowDate(),history:[...(order.history||[]),{step:order.step,date:nowDate(),time:nowTime(),note:"Marked Out of Stock"}]});}} style={{width:"100%",justifyContent:"center"}}>Out of Stock</DBtn>}
    {/* Merchant Rejected — only after Claim Submitted (step 12), before Claim
        Released. Doesn't advance order.step at all (stays at 12) so nothing
        elsewhere that keys off step numbers needs to change; it's tracked
        as a pure overlay (merchantRejected/merchantRejectedDate/Remark, then
        resubmittedDate/resubmittedConsignmentNote) that only these specific
        roles can see or act on. The "rejected, not yet resubmitted" case is
        handled entirely by the early return above (blocks Claim Released
        outright) — this only ever renders the initial Reject button, or the
        resolved read-only info once already resubmitted. */}
    {step===12&&canRejectByMerchant&&(order.merchantRejected
      ?<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#DC2626",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Merchant Rejected</div>
        <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>{fDate(order.merchantRejectedDate)} — {order.merchantRejectedRemark}</div>
        <div style={{borderTop:"1px solid #FECACA",paddingTop:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#15803D",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Resubmitted to Merchant</div>
          <div style={{fontSize:12,color:C.textMid}}>{fDate(order.resubmittedDate)} — Consignment Note: {order.resubmittedConsignmentNote}</div>
        </div>
      </div>
      :!showRejectPanel
        ?<DBtn onClick={()=>setShowRejectPanel(true)} style={{width:"100%",justifyContent:"center"}}>{Ic.x} Reject by Merchant</DBtn>
        :<div style={card}>
          <SecHdr icon={Ic.x}><span style={{color:"#DC2626"}}>Reject by Merchant</span></SecHdr>
          <div style={{padding:"14px 16px"}}>
            <div style={{marginBottom:12}}><L req>Reason for Rejection</L><TX value={rejectRemark} onChange={e=>setRejectRemark(e.target.value)} rows={3} placeholder="Reason the merchant gave for rejecting this claim…" style={{borderColor:"#FECACA",resize:"none",width:"100%",boxSizing:"border-box",borderRadius:12}}/></div>
            <div style={{display:"flex",gap:8}}>
              <GBtn onClick={()=>setShowRejectPanel(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
              <DBtn onClick={async()=>{if(!rejectRemark.trim()){alert("Reason required.");return;}setSaving(true);const rd=nowDate();await onUpdate({...order,merchantRejected:true,merchantRejectedDate:rd,merchantRejectedRemark:rejectRemark});setSaving(false);setShowRejectPanel(false);setRejectRemark("");}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.x} {saving?"Saving…":"Confirm Rejection"}</DBtn>
            </div>
          </div>
        </div>)}
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
      {[["Upfront Payment","upfront"],["Claim Sent","claim"],["Knock-off","knockoff"]].map(([label,type])=><div key={type}>
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
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin,allOrders,isReadOnly,orderPermissions,userBranch,email}){
  const [linkCopied,setLinkCopied]=useState(false);
  const [viewingField,setViewingField]=useState(null);
  const isSuperAdminOrder = isAdmin && (!orderPermissions || orderPermissions.adminSteps==="all");
  const isBillingRoleDetail = isAdmin && !!orderPermissions && orderPermissions.adminSteps!=="all" && orderPermissions.adminSteps.includes(7);
  const canSeeMerchantRejectionBadge = isSuperAdminOrder||isBillingRoleDetail;
  // True super admin means accessed WITHOUT any orderPermissions restriction
  // at all (the main dashboard), not just holding the "order admin" role.
  const isTrueSuperAdmin = isAdmin && !orderPermissions;
  // Purchase-role admin (or order admin / true super admin) — anyone who can
  // administer the Stock Order phase (steps 1-3).
  const canAdminStockOrder = !orderPermissions || orderPermissions.adminSteps==="all" || orderPermissions.adminSteps.includes(2);
  // Billing-role admin — signature check via step 7 (Billed), same approach
  // used everywhere else in this file to identify the billing role.
  const canAdminBilling = isAdmin && !!orderPermissions && orderPermissions.adminSteps!=="all" && orderPermissions.adminSteps.includes(7);
  // Who can add/edit the Ordered step's tracking number: true super admin,
  // or the Purchase / order-admin role. Branch/manager does NOT get this —
  // tracking number is Purchase's responsibility specifically.
  const canManageTracking = isTrueSuperAdmin || (isAdmin&&!!orderPermissions&&canAdminStockOrder);
  // Purchase-role admin AND billing-role admin both get full Edit access
  // (with their own field-level locks applied inside OrderForm), on top of
  // the existing super-admin-only access.
  const canEditOrder = isSuperAdminOrder || (isAdmin&&!!orderPermissions&&canAdminStockOrder) || canAdminBilling;
  // Billing user can also edit just the Phone Model / Item field, but only
  // while the order is still at step 2 (Ordered) — see the inline editor in
  // the Order Information panel below. Unlike tracking number, this DOES
  // still include the branch/manager viewer.
  const canEditPhoneModelAtOrdered = isTrueSuperAdmin || (!isAdmin&&!!userBranch) || (isAdmin&&!!orderPermissions&&canAdminStockOrder) || canAdminBilling;
  // What's actually about to be acted on is the NEXT pending step — that's
  // the one that matters here, not the current step. Checking both (as this
  // used to) created a loophole: a role that administers step 9 would also
  // get full access to step 10's action, just because step 9 happened to be
  // "current" right before it — even though step 10 isn't theirs to touch.
  // Falls back to the current step only when there's no next step (terminal).
  const forceViewOnly = orderPermissions && orderPermissions.adminSteps!=="all" && (()=>{
    const nextStepN=nextStepNum(order);
    const relevantStep=nextStepN!=null?nextStepN:order.step;
    return !orderPermissions.adminSteps.includes(relevantStep);
  })();
  const s=getStep(order.step),ph=getPhase(order.step),isCash=order.orderType==="cash";
  const everEditedFields=new Set((order.editLog||[]).flatMap(e=>e.fields||[]));
  const FieldEditedTag=({field})=><button onClick={()=>setViewingField(viewingField===field?null:field)} style={{marginLeft:5,fontSize:8,fontWeight:700,color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",padding:"1px 5px",borderRadius:3,verticalAlign:"middle",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edited</button>;
  const FieldLog=({field})=>viewingField===field&&<div style={{marginTop:4,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:6,padding:"6px 8px",display:"flex",flexDirection:"column",gap:3}}>
    {order.editLog.filter(e=>e.fields?.includes(field)).map((e,i)=><div key={i} style={{fontSize:10,color:"#92400E"}}>{fDate(e.date)} {e.time} by {e.by}: {e.fieldChanges?.[field]}</div>)}
  </div>;
  // Small inline copy button for admin — sits right beside a field's value,
  // same line, so scanning Order Information stays tidy.
  const CopyBtn=({value})=>{
    const [copied,setCopied]=useState(false);
    if(!isAdmin||!value||value==="—")return null;
    return<button onClick={()=>{navigator.clipboard?.writeText(String(value)).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),1500);}} title="Copy" style={{marginLeft:6,background:"none",border:"none",cursor:"pointer",padding:2,color:copied?"#15803D":C.textLight,display:"inline-flex",verticalAlign:"middle"}}>{copied?Ic.checkCircle:Ic.copy}</button>;
  };
  return<div className="fade-in">
    {/* Top bar */}
    <div className="detail-topbar">
      <div className="detail-topbar-back" style={{display:"flex",gap:6}}>
        <GBtn onClick={onBack}>{Ic.chevL} Back</GBtn>
        <GBtn onClick={async()=>{
          const url=`${window.location.origin}${window.location.pathname}?orderId=${order.id}${window.location.hash||"#orders"}`;
          try{await navigator.clipboard.writeText(url);}catch{
            // Clipboard API unavailable (older browser / non-HTTPS) — fall
            // back to the classic select+execCommand copy trick.
            const ta=document.createElement("textarea");ta.value=url;ta.style.position="fixed";ta.style.opacity="0";
            document.body.appendChild(ta);ta.select();
            try{document.execCommand("copy");}catch{}
            document.body.removeChild(ta);
          }
          setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);
        }}>{linkCopied?<>{Ic.checkCircle} Copied!</>:<>{Ic.share} Copy Link</>}</GBtn>
      </div>
      <div className="detail-topbar-title">
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:14,fontWeight:800,color:C.navy}}>{order.phoneModel}</span>
          {order.merchantRejected&&!order.knockOffDate&&canSeeMerchantRejectionBadge?(order.resubmittedDate
            ?<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:"#F0FDF4",color:"#15803D",border:"1px solid #BBF7D0",whiteSpace:"nowrap"}}>Resubmitted to Merchant</span>
            :<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",whiteSpace:"nowrap"}}>Merchant Rejected</span>
          ):<StepBadge order={order}/>}
          {order.stockStatus==="ready"&&<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>Ready Stock</span>}
          {isCash?<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>Cash</span>:<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>CCM</span>}
        </div>
        <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}{order.invoiceNo?` · Invoice: ${order.invoiceNo}`:""}</div>
      </div>
      {isSuperAdminOrder&&!isReadOnly&&<div className="detail-topbar-actions" style={{display:"flex",gap:6}}><GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn>{!order.cancelled&&order.step!==14&&<DBtn onClick={()=>{const reason=prompt("Reason for cancelling this order (optional):")||"";if(!confirm("Cancel this order? It will move out of active tracking and won't appear in any reports."))return;onUpdate({...order,cancelled:true,cancelledReason:reason||undefined,history:[...(order.history||[]),{step:order.step,date:nowDate(),time:nowTime(),note:"Order Cancelled",cancelledReason:reason||undefined}]});}}>{Ic.x} Cancel Order</DBtn>}<DBtn onClick={onDelete}>{Ic.trash} Delete</DBtn></div>}
      {!isSuperAdminOrder&&canEditOrder&&!isReadOnly&&<div className="detail-topbar-actions" style={{display:"flex",gap:6}}><GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn>{canAdminBilling&&!order.cancelled&&order.step!==14&&<DBtn onClick={()=>{const reason=prompt("Reason for cancelling this order (optional):")||"";if(!confirm("Cancel this order? It will move out of active tracking and won't appear in any reports."))return;onUpdate({...order,cancelled:true,cancelledReason:reason||undefined,history:[...(order.history||[]),{step:order.step,date:nowDate(),time:nowTime(),note:"Order Cancelled",cancelledReason:reason||undefined}]});}}>{Ic.x} Cancel Order</DBtn>}</div>}
    </div>

    {order.cancelled&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,color:"#DC2626"}}>{Ic.alertCircle}<div><div style={{fontWeight:700,fontSize:13}}>This order has been cancelled</div>{order.cancelledReason&&<div style={{fontSize:11,color:"#B91C1C",marginTop:2}}>{order.cancelledReason}</div>}</div></div>
      {isSuperAdminOrder&&!isReadOnly&&<GBtn onClick={()=>onUpdate({...order,cancelled:false,history:[...(order.history||[]),{step:order.step,date:nowDate(),time:nowTime(),note:"Reactivated"}]})}>Reactivate</GBtn>}
    </div>}

    {/* Phase progress card */}
    <div style={{...card,padding:"16px 20px",marginBottom:14}}>
      <PhaseBar step={order.step} order={order}/>
    </div>

    {/* Order info summary */}
    <div className="order-info-card" style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.fileText}>Order Information</SecHdr>
      <div className="order-info-grid" style={{padding:"6px 16px 10px"}}>
        <div style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Device Name</div>
          {canEditPhoneModelAtOrdered&&order.step===2?<PhoneModelField order={order} onUpdate={onUpdate}/>:<div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.phoneModel||"—"}{everEditedFields.has("phoneModel")&&<FieldEditedTag field="phoneModel"/>}<FieldLog field="phoneModel"/><CopyBtn value={order.phoneModel}/></div>}
        </div>
        {[["Customer Name",order.customerName,"customerName"],order.customerIC&&["Customer IC",order.customerIC,"customerIC"],order.customerHP&&["Customer HP",order.customerHP,"customerHP"],!isCash&&["Merchant",order.merchant,"merchant"],!isCash&&["Agreement No. / Case ID No.",order.agreementNumber,"agreementNumber"],!isCash&&["Merchant Approval Date",fDate(order.aeonApprovalDate),"aeonApprovalDate"],!isCash&&["Finance Price",fRM(order.financePrice),"financePrice"],!isCash&&order.tenure&&["CCM Tenure",`${order.tenure} Months`,"tenure"],!isCash&&["Agreement Fee",fRM(order.agreementFee),"agreementFee"],!isCash&&["Stamping Fee",fRM(order.stampingFee),"stampingFee"],["Deposit",fRM(order.deposit),"deposit"],!isCash&&order.monthlyInstallment&&["Monthly Installment",fRM(order.monthlyInstallment),"monthlyInstallment"],isCash&&["Retail Price",fRM(order.retailPrice),"retailPrice"],order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate),"depositPaymentDate"],order.invoiceNo&&["Invoice No.",order.invoiceNo,"invoiceNo"],order.pickUpBranch&&["Pick Up Branch",order.pickUpBranch,"pickUpBranch"],order.claimSentDate&&["Claim Sent",fDate(order.claimSentDate)],order.knockOffDate&&["Knock-off",fDate(order.knockOffDate)],order.knockOffAmount&&["Knock-off Amount",fRM(order.knockOffAmount)]].filter(Boolean).map(([l,v,k])=><div key={l} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>{l}</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{v||"—"}{k&&everEditedFields.has(k)&&<FieldEditedTag field={k}/>}{k&&<FieldLog field={k}/>}<CopyBtn value={v}/></div>
        </div>)}
        {order.customerEmail&&<div className="oi-full" style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Customer Email</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.customerEmail}{everEditedFields.has("customerEmail")&&<FieldEditedTag field="customerEmail"/>}<FieldLog field="customerEmail"/><CopyBtn value={order.customerEmail}/></div>
        </div>}
        {order.customerAddress&&<div className="oi-full" style={{padding:"7px 0",minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Address{(order.customerPostCode||order.customerCity)?` (${[order.customerPostCode,order.customerCity].filter(Boolean).join(", ")})`:""}</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.customerAddress}{(everEditedFields.has("customerAddress")||everEditedFields.has("customerPostCode")||everEditedFields.has("customerCity"))&&<FieldEditedTag field="customerAddress"/>}<FieldLog field="customerAddress"/><CopyBtn value={order.customerAddress}/></div>
        </div>}
      </div>
    </div>

    {order.jclDocuments&&<div style={{...card,marginBottom:16}}>
      <SecHdr icon={Ic.fileText}>JCL Documents</SecHdr>
      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:6}}>
        {[["applicationForm","Application Form"],["notice1","Notice 1"],["agreementJCLCopy","Agreement Form (JCL Copy)"],["agreementCustomerCopy","Agreement Form (Customer Copy)"],["creditAckForm","Credit Sales Acknowledge Form"]].map(([key,label])=>{
          const doc=order.jclDocuments[key];
          return<div key={key} style={{fontSize:12}}>
            <span style={{color:C.textMid,fontWeight:600}}>{label}: </span>
            {doc?(doc.url?<a href={doc.url} target="_blank" rel="noopener noreferrer" style={{color:C.blueBright,fontWeight:600}}>{doc.name}</a>:<span style={{color:C.textLight}}>Loading…</span>):<span style={{color:"#DC2626"}}>Not uploaded</span>}
          </div>;
        })}
      </div>
    </div>}



    {order.firstInstallmentKnockOffDate&&isSuperAdminOrder&&<div style={{...card,borderLeft:"3px solid #15803D",padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div style={{fontSize:12,color:C.textMid}}><b style={{color:"#15803D"}}>First Monthly Installment Knocked Off</b> — {fDate(order.firstInstallmentKnockOffDate)}</div>
      <GBtn onClick={()=>{if(window.confirm("Undo this knock-off? The order will show as pending again."))onUpdate({...order,firstInstallmentKnockOffDate:null});}} style={{fontSize:11,padding:"6px 12px",color:"#DC2626",borderColor:"#FECACA"}}>Undo</GBtn>
    </div>}

    {/* Two-col: timeline | action */}
    <div className="detail-grid">
      <div style={card}>
        <SecHdr icon={Ic.calendar}>Tracking Timeline</SecHdr>
        <div style={{padding:"14px 16px"}}><Timeline order={order} isAdmin={isAdmin} canManageTracking={canManageTracking} onUpdate={onUpdate} orderPermissions={orderPermissions} email={email}/></div>
      </div>
      <div>
        {order.cancelled?<div style={{...card,padding:"16px"}}>
          <div style={{fontSize:12,color:"#DC2626",fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>Order cancelled — no further action available.</div>
        </div>:isReadOnly?<div style={{...card,padding:"16px"}}>
          <div style={{fontSize:12,color:C.textLight,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>View only — actions disabled for this viewer.</div>
        </div>:<ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate} allOrders={allOrders} forceViewOnly={forceViewOnly} orderPermissions={orderPermissions}/>}
      </div>
    </div>
  </div>;
}

/* ── Order Form ───────────────────────────────────────────────────────── */
/* ── Form primitives (defined at module level to preserve focus) ──────── */
function FormField({label,req,children,span}){
  return<div style={{width:"100%",minWidth:0,...(span?{gridColumn:"1/-1"}:{})}}><L req={req}>{label}</L>{children}</div>;
}

/* ── Form section card ─────────────────────────────────────────────────── */
function FormCard({title,children}){
  return<div style={{...card,marginBottom:16}}>
    <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
      <div style={{fontSize:12,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
    </div>
    <div style={{padding:"20px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,minWidth:0}}>{children}</div>
  </div>;
}

function OrderForm({order,orders=[],branchMeta,onSave,onCancel,isAdmin,userBranch,srList,orderPermissions,email,onDirtyChange}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",customerIC:"",customerEmail:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",monthlyInstallment:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositPaymentMethod:"RHB",depositSlip:null,pickUpBranch:""};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));onDirtyChange&&onDirtyChange(true);};
  // SDK displays with a plain hyphen per request ("SDK-EC SDK"), unlike every
  // other branch which uses the standard "CODE — Full Name" format.
  const branchLabel=b=>`${b} — ${branchMeta[b]?.name||b}`;
  const isCash=f.orderType==="cash",isReady=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const REQUIRED=["phoneModel","customerName","salesAgentId","customerIC","customerEmail","customerHP","customerAddress","customerPostCode","customerCity",...(!order?["pickUpBranch"]:[]),...(isCash?["retailPrice","deposit","depositPaymentDate","depositPaymentMethod"]:["merchant","agreementNumber","aeonApprovalDate","financePrice","stampingFee","agreementFee","deposit","monthlyInstallment"])];
  const missing=REQUIRED.filter(k=>!f[k]?.toString().trim());
  const missingSlip=isCash&&!slipFile&&!f.depositSlip;
  // Duplicate Agreement No. / Case ID No. check — cancelled orders are
  // excluded since they're voided and the number is free to reuse; the
  // order currently being edited is excluded from matching itself.
  const duplicateAgreement=!isCash&&f.agreementNumber?.toString().trim()&&orders.some(o=>!o.cancelled&&o.id!==order?.id&&(o.agreementNumber||"").toString().trim().toLowerCase()===f.agreementNumber.toString().trim().toLowerCase());
  const submit=async()=>{
    if(missing.length||missingSlip){alert("Please fill in all required fields.");return;}
    if(duplicateAgreement){alert("This Agreement No. / Case ID No. is already used by another order. Please check and enter a unique number.");return;}
    const id=order?.id||Date.now().toString();
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile,id);
    const initStep=isReady?3:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    // Edit log — only for editing an EXISTING order (never for new-order
    // creation), same pattern as the Daily Sales Report's edit log: date,
    // time, who (by role), and a plain-English summary of what changed.
    let editLog=order?.editLog||[];
    if(order){
      const isSuperAdminEditor=isAdmin&&(!orderPermissions||orderPermissions.adminSteps==="all");
      // Prefer resolving the actual role from their login email, same as
      // Daily Sales Report — falls back to the coarser Super Admin/Admin
      // guess only if the email isn't recognized.
      const editorRole=resolveEditorRole(email,["billing","knockoff","purchase","stock","superAdmin"])||(isSuperAdminEditor?"Super Admin":"Admin");
      const FIELD_LABELS={phoneModel:"Device Name",branch:"Branch",merchant:"Merchant",agreementNumber:"Agreement No. / Case ID No.",invoiceNo:"Invoice Number",customerName:"Customer Name",customerIC:"Customer IC",customerEmail:"Customer Email",customerHP:"Customer HP",customerAddress:"Customer Address",customerPostCode:"Postcode",customerCity:"City",salesAgentId:"SR ID",salesAgentName:"SR Name",aeonApprovalDate:"Merchant Approval Date",financePrice:"Finance Price",deposit:"Deposit",stampingFee:"Stamping Fee",agreementFee:"Agreement Fee",monthlyInstallment:"Monthly Installment",retailPrice:"Retail Price",stockStatus:"Stock Status",orderType:"Order Type",depositPaymentDate:"Deposit Payment Date",depositPaymentMethod:"Deposit Payment Method",pickUpBranch:"Pick Up Branch"};
      const MONEY_FIELDS=new Set(["financePrice","deposit","stampingFee","agreementFee","monthlyInstallment","retailPrice"]);
      const DATE_FIELDS=new Set(["aeonApprovalDate","depositPaymentDate"]);
      const fmt=(k,v)=>{if(v==null||v==="")return"—";if(MONEY_FIELDS.has(k))return fRM(v);if(DATE_FIELDS.has(k))return fDate(v);return String(v);};
      const changedKeys=Object.keys(FIELD_LABELS).filter(k=>String(order[k]??"")!==String(f[k]??""));
      const fieldChanges=Object.fromEntries(changedKeys.map(k=>[k,`${fmt(k,order[k])} → ${fmt(k,f[k])}`]));
      const changes=changedKeys.map(k=>`${FIELD_LABELS[k]}: ${fieldChanges[k]}`).join("; ");
      if(changes)editLog=[...editLog,{date:nowDate(),time:nowTime(),by:editorRole,changes,fields:changedKeys,fieldChanges}];
      // If Monthly Installment gets edited after Collection Verified
      // already happened, the timeline's recorded payment amount would
      // otherwise sit there stale forever, out of step with the order's
      // actual current installment. Keep it in sync automatically rather
      // than relying on someone remembering to fix it by hand.
      if(changedKeys.includes("monthlyInstallment")&&Array.isArray(order.history)){
        const target=[...order.history].reverse().find(h=>h._rowId&&(h.secondPaymentAmount!==undefined&&h.secondPaymentAmount!==null));
        if(target)await updateHistoryRow(target._rowId,{secondPaymentAmount:parseFloat(f.monthlyInstallment)||0});
      }
    }
    onSave({...f,depositSlip,id,step:order?.step||initStep,history:order?.history||initHist,editLog});
  };
  // Field-level edit restrictions when editing an EXISTING order — only
  // applies to the restricted order-page roles; true super admin / order
  // admin, and new-order creation, are always unrestricted.
  const isSuperAdminForm=isAdmin&&(!orderPermissions||orderPermissions.adminSteps==="all");
  const isBillingRole=isAdmin&&!!orderPermissions&&orderPermissions.adminSteps!=="all"&&orderPermissions.adminSteps.includes(7);
  const isPurchaseRole=isAdmin&&!!orderPermissions&&orderPermissions.adminSteps!=="all"&&orderPermissions.adminSteps.includes(2);
  const isFieldLocked=k=>{
    if(!order||isSuperAdminForm)return false;
    if(isBillingRole)return["phoneModel","salesAgentId","pickUpBranch"].includes(k);
    if(isPurchaseRole)return!["phoneModel","pickUpBranch"].includes(k);
    return false;
  };
  const lockedStyle={background:C.surface,color:C.textMid,cursor:"not-allowed"};
  // row() helper — uses module-level FormField (no focus loss)
  const row=(k,l,t="text",req=false)=>(<FormField key={k} label={l} req={req}><I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} disabled={isFieldLocked(k)} style={{...(req&&missing.includes(k)?{borderColor:"#FECACA"}:{}),...(isFieldLocked(k)?lockedStyle:{})}}/></FormField>);
  return<div className="fade-in">
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
      <GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn>
      <div style={{fontSize:15,fontWeight:800,color:C.navy}}>{order?"Edit Order":"New Order Request"}</div>
    </div>
    <FormCard title="Order Type">
      <div>
        <L req>Stock Status</L>
        <div style={{display:"flex",gap:8,pointerEvents:isFieldLocked("stockStatus")?"none":"auto",opacity:isFieldLocked("stockStatus")?.5:1}}>
          {[["stock_request","Stock Request"],["ready","Ready Stock"]].map(([v,l])=><button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"12px 8px",borderRadius:10,border:`2px solid ${f.stockStatus===v?C.navy:C.border}`,background:f.stockStatus===v?C.navy:C.white,color:f.stockStatus===v?"#fff":C.textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
        {isReady&&<div style={{fontSize:10,color:"#15803D",marginTop:5,fontWeight:600}}>Will skip to Step 3 — Arrived HQ</div>}
      </div>
      <div>
        <L req>Order Type</L>
        <div style={{display:"flex",gap:8,pointerEvents:isFieldLocked("orderType")?"none":"auto",opacity:isFieldLocked("orderType")?.5:1}}>
          {[["ccm","CCM Order"],["cash","Cash Order"]].map(([v,l])=><button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"12px 8px",borderRadius:10,border:`2px solid ${f.orderType===v?C.navy:C.border}`,background:f.orderType===v?C.navy:C.white,color:f.orderType===v?"#fff":C.textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
      </div>
    </FormCard>
    <FormCard title="Basic Information">
      {row("phoneModel","Phone Model / Item","text",true)}
      {row("customerName","Customer Name","text",true)}
      <div><L req>Branch</L><SEL value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={(!isAdmin&&!!userBranch)||isFieldLocked("branch")} style={isFieldLocked("branch")?lockedStyle:{}}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{branchLabel(b)}</option>)}</SEL></div>
      <div>
        <L req={!order}>Pick Up Branch</L>
        <SEL value={f.pickUpBranch||""} onChange={e=>set("pickUpBranch",e.target.value)} disabled={isFieldLocked("pickUpBranch")} style={{...(isFieldLocked("pickUpBranch")?lockedStyle:{}),...(!order&&missing.includes("pickUpBranch")?{borderColor:"#FECACA"}:{})}}>
          <option value="">— Select Branch —</option>
          {PICKUP_BRANCH_OPTIONS.map(b=><option key={b} value={b}>{branchLabel(b)}</option>)}
        </SEL>
      </div>
      <div><L req>Sales Agent</L>{branchSRs.length>0?<SEL value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}} disabled={isFieldLocked("salesAgentId")} style={{...(missing.includes("salesAgentId")?{borderColor:"#FECACA"}:{}),...(isFieldLocked("salesAgentId")?lockedStyle:{})}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</SEL>:<I value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID" disabled={isFieldLocked("salesAgentId")} style={{...(missing.includes("salesAgentId")?{borderColor:"#FECACA"}:{}),...(isFieldLocked("salesAgentId")?lockedStyle:{})}}/>}</div>
    </FormCard>
    <FormCard title="Customer Details">
      {row("customerIC","Customer IC","text",true)}
      {row("customerEmail","Customer Email Address","email",true)}
      {row("customerHP","Customer HP No.","text",true)}
      {row("customerAddress","Address","text",true)}
      {row("customerPostCode","Postcode","text",true)}
      {row("customerCity","City","text",true)}
    </FormCard>
    {order&&(isSuperAdminForm||isBillingRole)&&<FormCard title="Invoice">
      {row("invoiceNo","Invoice Number","text")}
    </FormCard>}
    {!isCash&&<FormCard title="CCM / Financing Details">
      <div><L req>Merchant</L><SEL value={f.merchant} onChange={e=>set("merchant",e.target.value)} disabled={isFieldLocked("merchant")} style={isFieldLocked("merchant")?lockedStyle:{}}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
      {row("agreementNumber","Agreement No. / Case ID No.","text",true)}
      {duplicateAgreement&&<div style={{gridColumn:"1/-1",fontSize:11,color:"#DC2626",marginTop:-10}}>This Agreement No. / Case ID No. is already used by another order.</div>}
      {row("aeonApprovalDate","Merchant Approval Date","date",true)}
      {row("financePrice","Finance Price (RM)","number",true)}
      {row("stampingFee","Stamping Fee (RM)","number",true)}
      {row("agreementFee","Agreement Fee (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      {row("monthlyInstallment","Monthly Installment (RM)","number",true)}
    </FormCard>}
    {isCash&&<FormCard title="Cash Order Details">
      {row("retailPrice","Retail Price (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      <div><L req>Deposit Payment Method</L><SEL value={f.depositPaymentMethod||"RHB"} onChange={e=>set("depositPaymentMethod",e.target.value)} disabled={isFieldLocked("depositPaymentMethod")} style={isFieldLocked("depositPaymentMethod")?lockedStyle:{}}><option value="RHB">RHB</option><option value="PBB">PBB</option></SEL></div>
      {row("depositPaymentDate","Deposit Payment Date","date",true)}
      <div><L req>Deposit Payment Slip</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setSlipFile(e.target.files[0]||null);onDirtyChange&&onDirtyChange(true);}} disabled={isFieldLocked("depositSlip")} style={{fontSize:11,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{slipFile?.name||f.depositSlip?.name}</div>}{!slipFile&&!f.depositSlip&&<div style={{fontSize:10,color:"#DC2626",marginTop:3}}>Required</div>}</div>
    </FormCard>}
    {(missing.length>0||missingSlip)&&!order&&<div style={{padding:"9px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:8,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill all required fields to submit.</div>}
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><GBtn onClick={onCancel}>Cancel</GBtn><PBtn onClick={submit} disabled={!order&&(missing.length>0||missingSlip)}>{isReady?"Submit & Dispatch":"Submit Order Request"}</PBtn></div>
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
// A branch sees an order if it's THEIRS (branch column, from creation) or if
// their branch was picked as the pickup location AND the order has reached
// Dispatched to Branch (step 4+) — matches the OR filter listOrders() already
// applies at the DB level; this is the client-side equivalent for any place
// that still needs to re-check it in memory.
function visibleToBranch(o,userBranch){
  return !userBranch||o.branch===userBranch||(o.pickUpBranch===userBranch&&o.step>=4);
}

// Single source of truth for alert-type -> dot color, shared by both the
// list row's small indicator dot and (in spirit) the AlertBanner grouping
// below. Keeping this in one place is what stops the dot and the banner
// disagreeing about what a given alert type means.
function alertDotColor(type){
  if(type==="approval_expired")return"#DC2626";
  if(type==="approval_urgent"||type==="overdue_order")return"#B91C1C";
  if(type==="approval_warning")return"#B45309";
  if(type==="cash_balance_payment_overdue")return"#7C3AED";
  if(type==="merchant_rejected")return"#DC2626";
  if(type==="agreement_received_overdue")return"#B45309";
  return C.blue; // collection_proof_overdue
}
function getOrderAlerts(orders,userBranch=null){
  const myOrders=orders.filter(o=>o.step<14&&!o.cancelled&&visibleToBranch(o,userBranch));
  const alerts=[];
  myOrders.filter(o=>o.step===2&&o.orderDate).forEach(o=>{
    const days=daysSince(o.orderDate);
    if(days>=7)alerts.push({type:"overdue_order",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Ordered ${days} days ago — not yet arrived at HQ`});
  });
  // Merchant Rejected — fires from the day the admin clicked Reject by
  // Merchant, until it's resubmitted (admin has acted) or the claim is
  // actually released (knockOffDate set).
  myOrders.filter(o=>o.step===12&&o.merchantRejected&&!o.resubmittedDate&&!o.knockOffDate).forEach(o=>{
    const days=daysSince(o.merchantRejectedDate);
    alerts.push({type:"merchant_rejected",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Rejected by merchant ${days} day${days!==1?"s":""} ago — ${o.merchantRejectedRemark}`});
  });
  // Agreement Received by HQ — fires once an order has sat at step 11 for
  // more than 5 days without either being sent out to merchant (advances to
  // step 12) or returned to branch (reverts to step 10) — both of those
  // move o.step away from 11, which naturally clears this alert.
  myOrders.filter(o=>o.step===11&&o.stepDates?.["11"]?.date).forEach(o=>{
    const days=daysSince(o.stepDates["11"].date);
    if(days>5)alerts.push({type:"agreement_received_overdue",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Agreement Received by HQ ${days} days ago — not yet sent to merchant or returned to branch`});
  });
  myOrders.filter(o=>o.aeonApprovalDate&&o.step>=1&&o.step<=13).forEach(o=>{
    const days=daysSince(o.aeonApprovalDate);
    if(days>=91)alerts.push({type:"approval_expired",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval EXPIRED — ${days} days ago`});
    else if(days>=61)alerts.push({type:"approval_urgent",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval ${days} days ago — URGENT`});
    else if(days>=31)alerts.push({type:"approval_warning",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Approval ${days} days ago — action needed`});
  });
  myOrders.filter(o=>o.step<8&&o.step>=6).forEach(o=>{
    const billingDate=o.billingData?.billingDate;
    if(!billingDate)return;
    const days=daysSince(billingDate);
    if(days>=1)alerts.push({type:"collection_proof_overdue",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Billed ${days} day${days>1?"s":""} ago — collection & payment proof not yet uploaded`});
  });
  // Cash order balance payment slip — a separate 2-day-grace check from the
  // general collection proof alert above, since it's checking a different
  // file (balancePaymentProof, not paymentProof/collectionProof) and cash
  // orders get more grace before this one fires.
  myOrders.filter(o=>o.orderType==="cash"&&o.step<9&&o.step>=6&&!o.balancePaymentUploadedDate).forEach(o=>{
    const billingDate=o.billingData?.billingDate;
    if(!billingDate)return;
    const days=daysSince(billingDate);
    if(days>2)alerts.push({type:"cash_balance_payment_overdue",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Billed ${days} days ago — balance payment slip not yet uploaded (2-day limit passed)`});
  });
  return alerts;
}
function AlertBanner({alerts,isAdmin,isSophia,onClickOrder}){
  const isMobile=useIsMobile();
  if(!alerts.length)return null;
  const expired=alerts.filter(a=>a.type==="approval_expired");
  const urgent=alerts.filter(a=>a.type==="approval_urgent"||a.type==="overdue_order");
  const warning=alerts.filter(a=>a.type==="approval_warning");
  const collectionOverdue=alerts.filter(a=>a.type==="collection_proof_overdue");
  const cashBalanceOverdue=alerts.filter(a=>a.type==="cash_balance_payment_overdue");
  const merchantRejected=alerts.filter(a=>a.type==="merchant_rejected");
  const agreementReceivedOverdue=alerts.filter(a=>a.type==="agreement_received_overdue");
  // Approval Warning starts collapsed on the admin order page (there's
  // usually a lot of them, and admin has plenty else to look at) but
  // starts expanded on a branch's own view (a short, directly relevant
  // list they should see right away). Urgent Attention — and every other
  // alert block — has no collapse toggle at all, always fully expanded.
  const [warningExpanded,setWarningExpanded]=useState(!isAdmin);
  // Agreement Received by HQ starts collapsed specifically for Sophia —
  // everyone else still sees it always expanded, unchanged.
  const [agreementExpanded,setAgreementExpanded]=useState(!isSophia);
  const Block=({items,color,title,collapsible,expanded,onToggle})=>items.length>0&&<div style={{...card,borderLeft:`3px solid ${color}`,padding:"12px 14px",marginBottom:10}}>
    <div onClick={collapsible?onToggle:undefined} style={{display:"flex",alignItems:"center",gap:8,marginBottom:collapsible&&!expanded?0:9,cursor:collapsible?"pointer":"default",userSelect:collapsible?"none":"auto"}}>
      <span style={{color,flexShrink:0}}>{Ic.alertCircle}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>{title}</span>
      <span style={{fontSize:10,fontWeight:700,color,background:color+"15",padding:"1px 8px",borderRadius:20}}>{items.length}</span>
      {collapsible&&<span style={{marginLeft:"auto",color,transition:"transform .15s",transform:expanded?"rotate(180deg)":"none"}}>{Ic.chevDown}</span>}
    </div>
    {(!collapsible||expanded)&&items.map((a,i)=><div key={i} onClick={()=>onClickOrder&&onClickOrder(a.orderId)} style={{display:"flex",flexDirection:isMobile?"column":"row",justifyContent:"space-between",alignItems:isMobile?"flex-start":"center",gap:isMobile?3:10,padding:"8px 4px",borderTop:i>0?`1px solid ${C.border}`:"none",cursor:onClickOrder?"pointer":"default"}}>
      <div style={isMobile?{minWidth:0}:{minWidth:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
        <div style={{fontSize:12,fontWeight:700,color:C.text}}>{a.phoneModel}</div>
        <div style={{fontSize:11,color:C.textLight}}>{a.customerName} · {a.branch}</div>
      </div>
      <span style={{fontSize:11,color,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{a.msg}</span>
    </div>)}
  </div>;
  return<div style={{marginBottom:18}}>
    <Block items={expired} color="#DC2626" title="Approval Expired"/>
    <Block items={urgent} color="#B91C1C" title="Urgent Attention"/>
    <Block items={collectionOverdue} color="#B91C1C" title="Collection Proof Overdue"/>
    <Block items={cashBalanceOverdue} color="#7C3AED" title="Cash Balance Payment Slip Overdue"/>
    <Block items={merchantRejected} color="#DC2626" title="Merchant Rejected"/>
    <Block items={agreementReceivedOverdue} color="#B45309" title="Agreement Received by HQ — Not Yet Sent Out" collapsible expanded={agreementExpanded} onToggle={()=>setAgreementExpanded(p=>!p)}/>
    <Block items={warning} color="#B45309" title="Approval Warning" collapsible expanded={warningExpanded} onToggle={()=>setWarningExpanded(p=>!p)}/>
  </div>;
}

/* ── Batch Archive ────────────────────────────────────────────────────── */
function downloadRemovalReport(list){
  const dateStr=fDate(nowDate());
  const rows=list.map((o,i)=>{const claim=calcClaimAmount(o);return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${o.branch}</td><td>${o.agreementNumber||"—"}</td><td>${o.customerName}</td><td>${o.phoneModel}</td><td>RM ${claim.toFixed(2)}</td></tr>`;}).join("");
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Removed Completed Orders — ${dateStr}</title><style>body{font-family:Inter,sans-serif;margin:28px;color:#0A1628}h1{font-size:17px;font-weight:800;margin-bottom:2px}h2{font-size:12px;color:#8A96A8;margin:0 0 20px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0A1628;color:#fff;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em}td{padding:7px 10px;border-bottom:1px solid #E4EAF2}tr:nth-child(even) td{background:#F7F9FC}.footer{margin-top:16px;font-size:10px;color:#8A96A8}</style></head><body><h1>Removed Completed Orders Report</h1><h2>Removed on ${dateStr} · ${list.length} record${list.length!==1?"s":""} — this is the only remaining record of these orders</h2><table><thead><tr><th>#</th><th>Invoice No</th><th>Branch</th><th>Agreement No</th><th>Customer</th><th>Phone</th><th>Claim Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated ${new Date().toLocaleString("en-MY")} · EMAX Network Sdn Bhd</div></body></html>`;
  const w=window.open("","_blank");if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
}

function BatchArchive({orders,onDelete,onClose}){
  const completed=orders.filter(o=>o.step===14);
  const [sel,setSel]=useState(new Set());
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.trash} Remove Completed Orders</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {completed.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No completed orders yet.</div>:<>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Removing is permanent. A report of the removed invoice numbers downloads automatically before deletion, since this is the last record of them.</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{completed.length} completed</div>
            <button onClick={()=>setSel(sel.size===completed.length?new Set():new Set(completed.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===completed.length?"Deselect All":"Select All"}</button>
          </div>
          {completed.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#FEF2F2":C.surface,border:`1px solid ${sel.has(o.id)?"#FECACA":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#DC2626":"#fff",border:`2px solid ${sel.has(o.id)?"#DC2626":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1,fontSize:12,fontWeight:700,color:C.text}}>{o.invoiceNo||"—"}</div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <GBtn onClick={onClose}>Cancel</GBtn>
        <DBtn onClick={async()=>{if(!sel.size)return;if(!confirm(`Remove ${sel.size} completed order(s) permanently?`))return;const toRemove=completed.filter(o=>sel.has(o.id));downloadRemovalReport(toRemove);await onDelete([...sel]);onClose();}} disabled={!sel.size}>{Ic.trash} Remove {sel.size>0?`(${sel.size})`:""}</DBtn>
      </div>
    </div>
  </div>;
}

/* ── Bulk Dispatch to Branch ──────────────────────────────────────────── */
function BulkDispatch({orders,onSave,onClose}){
  const awaitingDispatch=orders.filter(o=>o.step===3);
  const branches=[...new Set(awaitingDispatch.map(o=>o.branch))];
  const [branch,setBranch]=useState(branches[0]||"");
  const pending=awaitingDispatch.filter(o=>o.branch===branch);
  const [sel,setSel]=useState(new Set());
  const [consignmentNo,setConsignmentNo]=useState("");
  const [stockTransferNo,setStockTransferNo]=useState("");
  const bothFilled=consignmentNo.trim()&&stockTransferNo.trim();
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.truck} Dispatch to Branch (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {awaitingDispatch.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No orders waiting to be dispatched.</div>:<>
          <div style={{marginBottom:12}}><L req>Branch</L><SEL value={branch} onChange={e=>{setBranch(e.target.value);setSel(new Set());}}>{branches.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Select the orders going out to {branch} in this batch — the same Consignment Note Number and Stock Transfer Number will be applied to all of them.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><L req>Consignment Note Number</L><I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
            <div><L req>Stock Transfer Number</L><I value={stockTransferNo} onChange={e=>setStockTransferNo(e.target.value)} placeholder="Stock transfer no…" style={!stockTransferNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{pending.length} pending in {branch}</div>
            <button onClick={()=>setSel(sel.size===pending.length?new Set():new Set(pending.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===pending.length&&pending.length>0?"Deselect All":"Select All"}</button>
          </div>
          {pending.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F5F3FF":C.surface,border:`1px solid ${sel.has(o.id)?"#DDD6FE":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#7C3AED":"#fff",border:`2px solid ${sel.has(o.id)?"#7C3AED":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:C.textLight}}>{o.branch}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!bothFilled&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in both the consignment note number and stock transfer number.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!sel.size||!bothFilled)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:4,consignmentNo,stockTransferNo,history:[{step:4,date:nowDate(),time:nowTime(),note:"Dispatched to Branch (bulk)",consignmentNo,stockTransferNo}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!sel.size||!bothFilled}>{Ic.truck} Dispatch ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Bulk Claim Sent ──────────────────────────────────────────────────── */
function BulkMarkCompleted({orders,onSave,onClose}){
  const pending=orders.filter(o=>!o.cancelled&&o.step===13);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [search,setSearch]=useState("");
  const list=pending.filter(o=>!search||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase())||(o.agreementNumber||"").toLowerCase().includes(search.toLowerCase())||o.customerName?.toLowerCase().includes(search.toLowerCase()));
  const canSubmit=sel.size>0&&date;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.checkCircle} Mark as Completed (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No orders awaiting completion.</div>:<>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Tick every "Claim Released" order to mark as completed together — the same completed date is applied to all of them.</div>
          <div style={{marginBottom:10}}><I placeholder="Search by invoice number, agreement number, or customer name…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{marginBottom:12}}><L req>Completed Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          {list.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>Invoice: {o.invoiceNo||"—"}</div><div style={{fontSize:10,color:C.textLight}}>{o.phoneModel} · {o.customerName} · Agreement: {o.agreementNumber||"—"}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!canSubmit&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the completed date to continue.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!canSubmit)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:14,stepDates:{...(o.stepDates||{}),14:{date,time:nowTime()}},history:[{step:14,date,time:nowTime(),note:"Completed and archived (bulk)"}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!canSubmit}>{Ic.checkCircle} Confirm ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

function BulkKnockOffInstallment({orders,onSave,onClose}){
  // Eligible: CCM orders whose first monthly installment has actually been
  // collected (payment verified at Collection Verified) and not already
  // knocked off. Uses the denormalized lastVerification snapshot rather than
  // a full history fetch — accurate for the normal single-verification case
  // this bulk tool is meant for.
  const pending=orders.filter(o=>!o.cancelled&&o.orderType!=="cash"&&o.lastVerification?.paymentChecked&&o.lastVerification?.monthlyInstallment&&!o.firstInstallmentKnockOffDate);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [search,setSearch]=useState("");
  const list=pending.filter(o=>!search||(o.agreementNumber||"").toLowerCase().includes(search.toLowerCase())||o.customerName?.toLowerCase().includes(search.toLowerCase())||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase()));
  const canSubmit=sel.size>0&&date;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.checkCircle} Knock Off First Monthly Installment (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No collected installments pending knock-off.</div>:<>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Tick every agreement whose first monthly installment was just paid to the merchant — the same knock-off date is applied to all of them.</div>
          <div style={{marginBottom:10}}><I placeholder="Search by agreement number, customer name, or invoice number…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{marginBottom:12}}><L req>Knock-off Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          {list.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>Agreement: {o.agreementNumber||"—"}</div><div style={{fontSize:10,color:C.textLight}}>{o.customerName} · Invoice: {o.invoiceNo||"—"} · {fRM(o.monthlyInstallment)}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!canSubmit&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the knock-off date to continue.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!canSubmit)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,firstInstallmentKnockOffDate:date,history:[{step:o.step,date:nowDate(),time:nowTime(),note:"First Monthly Installment Knocked Off (bulk)",firstInstallmentKnockOffDate:date}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!canSubmit}>{Ic.checkCircle} Confirm ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

function BulkAgreementReceived({orders,onSave,onClose}){
  const pending=orders.filter(o=>!o.cancelled&&o.step===10);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [search,setSearch]=useState("");
  const list=pending.filter(o=>!search||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase())||o.customerName?.toLowerCase().includes(search.toLowerCase()));
  const canSubmit=sel.size>0&&date;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.checkCircle} Set Agreement Received by HQ Date (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No orders awaiting Agreement Received by HQ.</div>:<>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Tick every agreement received by HQ on the same date — that date is applied to all of them.</div>
          <div style={{marginBottom:10}}><I placeholder="Search by invoice number or customer…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{marginBottom:12}}><L req>Agreement Received by HQ Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          {list.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>Invoice: {o.invoiceNo||"—"}</div><div style={{fontSize:10,color:C.textLight}}>{o.phoneModel} · {o.customerName} · {o.branch}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!canSubmit&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the date to continue.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!canSubmit)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:11,stepDates:{...(o.stepDates||{}),11:{date,time:nowTime()}},history:[{step:11,date,time:nowTime(),note:"Agreement Received by HQ (bulk)"}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!canSubmit}>{Ic.checkCircle} Confirm ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

function BulkClaimSent({orders,onSave,onClose}){
  const pending=orders.filter(o=>!o.cancelled&&o.step===11);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [search,setSearch]=useState("");
  const [consignmentNo,setConsignmentNo]=useState("");
  const list=pending.filter(o=>!search||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase())||o.customerName?.toLowerCase().includes(search.toLowerCase()));
  const canSubmit=sel.size>0&&date&&consignmentNo.trim();
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.checkCircle} Set Agreement Sent to Merchant Date (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No orders awaiting Claim Submitted.</div>:<>
          <div style={{fontSize:10,color:C.textLight,marginBottom:10}}>Tick every order going out together to the merchant in this batch — the same date and Consignment Note No. is applied to all of them.</div>
          <div style={{marginBottom:10}}><I placeholder="Search by invoice number or customer…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><L req>Claim Sent Out to Merchant Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div><L req>Consignment Note No.</L><I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          {list.map(o=><div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7,cursor:"pointer"}}>
            <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>Invoice: {o.invoiceNo||"—"}</div><div style={{fontSize:10,color:C.textLight}}>{o.phoneModel} · {o.customerName} · {o.branch}</div></div>
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!canSubmit&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the date and Consignment Note No. to continue.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!canSubmit)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:12,claimSentDate:date,consignmentNo,history:[{step:12,date:nowDate(),time:nowTime(),note:"Claim submitted to merchant (bulk)",claimSentDate:date,consignmentNo}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!canSubmit}>{Ic.checkCircle} Confirm ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Bulk Knock-off ────────────────────────────────────────────────────── */
function BulkKnockOff({orders,onSave,onClose}){
  const pending=orders.filter(o=>!o.cancelled&&o.step===12);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [amounts,setAmounts]=useState({});
  const [search,setSearch]=useState("");
  const list=pending.filter(o=>!search||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase())||(o.agreementNumber||"").toLowerCase().includes(search.toLowerCase()));
  const selectedList=pending.filter(o=>sel.has(o.id));
  const allAmountsFilled=selectedList.length>0&&selectedList.every(o=>parseFloat(amounts[o.id])>0);
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.calendar} Set Knock-off Date (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>×</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No invoices pending knock-off.</div>:<>
          <div style={{marginBottom:10}}><I placeholder="Search by invoice number or agreement number…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          <div style={{marginBottom:12}}><L req>Knock-off Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{...lbl,marginBottom:4}}>Same date applies to all selected — fill in each one's own knock-off amount</div>
          {list.map(o=><div key={o.id} style={{padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7}}>
            <div onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:sel.has(o.id)?8:0}}>
              <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:C.textLight}}>Invoice: {o.invoiceNo||"—"} · Agreement: {o.agreementNumber||"—"} · {o.branch}</div></div>
            </div>
            {sel.has(o.id)&&<div onClick={e=>e.stopPropagation()}><L req>Knock-off Amount (RM)</L><I type="number" value={amounts[o.id]||""} onChange={e=>setAmounts(p=>({...p,[o.id]:e.target.value}))} placeholder="0.00" style={!(parseFloat(amounts[o.id])>0)?{borderColor:"#FECACA"}:{}}/></div>}
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!allAmountsFilled&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the knock-off amount for every selected invoice.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!sel.size||!date||!allAmountsFilled)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:13,knockOffDate:date,knockOffAmount:amounts[o.id],history:[{step:13,date:nowDate(),time:nowTime(),note:"Claim Released (bulk)",knockOffDate:date,knockOffAmount:amounts[o.id]}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!sel.size||!date||!allAmountsFilled}>{Ic.calendar} Set Knock-off ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Main export ──────────────────────────────────────────────────────── */
/* ── Order list — compact rows, manually virtualized ─────────────────────
   Renders a fixed-height scroll viewport and mounts only the rows that
   fall in (or just outside) the visible range, tracked via scrollTop.
   This is what actually fixes scroll performance at hundreds of orders —
   the DOM never holds more than ~30-40 rows regardless of list size. */
function useIsMobile(){
  const [isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<=760);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<=760);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);
  return isMobile;
}

const OrderListVirtualized=memo(function OrderListVirtualized({orders,alertsByOrderId,onOpen,userBranch}){
  const isMobile=useIsMobile();
  const single={whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"};
  // Declared unconditionally (Rules of Hooks) even though only the desktop
  // virtualized branch below actually uses scroll position.
  const [scrollTop,setScrollTop]=useState(0);

  // Shared per-row field computation
  const rowFields=o=>{
    const s=getStep(o.step),mxS=maxStep(o);
    const alert=alertsByOrderId[o.id];
    const flagLabel=o.cancelled?"Cancelled":isPendingBranchAction(o)?"Pending Branch Action":isShortPaymentPending(o)?"Balance Payment Needed":o.step===14?"Completed":null;
    const flagColor=o.cancelled||isPendingBranchAction(o)||isShortPaymentPending(o)?"#DC2626":"#15803D";
    const ph=getPhase(o.step);
    const progressLabel=o.step===14?"Completed":ph?.label||"—";
    const progressColor=o.step===14?"#15803D":ph?.color||C.blue;
    // s.desc/s.who describe what already happened to REACH the current step
    // (e.g. step 1's desc is "Order submitted by branch" — the branch's own
    // completed action). What's actually pending right now is described by
    // the NEXT step's definition, not the current one.
    const nextStepN=nextStepNum(o);
    const nextDef=nextStepN?getStep(nextStepN):null;
    const whoText=nextDef?.who==="admin"?"Admin":(nextDef?.who==="branch"||nextDef?.who==="both")?"Branch":"";
    const detailText=(!o.cancelled&&o.step!==14&&nextDef&&whoText)?`Waiting for ${whoText} to process: ${nextDef.desc}`:s.desc;
    // Branch Order vs Pickup Order — only meaningful from a branch viewer's
    // own perspective (an order shows up in their list either because it's
    // theirs, or only because their branch is the customer's pickup point).
    const hasDifferentPickup=!!o.pickUpBranch&&o.pickUpBranch!==o.branch;
    return{s,mxS,alert,flagLabel,flagColor,progressLabel,progressColor,detailText,hasDifferentPickup};
  };

  // ── Mobile: no inner vertical scrollbox — the full list renders in normal
  // page flow (page itself scrolls), wrapped in a horizontally-scrollable
  // strip so columns can be swiped into view instead of wrapping/clipping. ──
  if(isMobile){
    const MIN_W=760;
    const PAD="0 14px";
    return<div style={{...card,padding:0,overflow:"hidden"}}>
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{minWidth:MIN_W}}>
          <div style={{display:"flex",alignItems:"center",padding:PAD,height:36,background:C.navy,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
            <div style={{width:8,flexShrink:0}}/>
            <div style={{flex:2.6,minWidth:0,marginLeft:10}}>Order</div>
            <div style={{width:150,flexShrink:0,marginLeft:14}}>Invoice No</div>
            <div style={{flex:1.4,minWidth:220,marginLeft:14}}>Status</div>
            <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto"}}>Updated</div>
          </div>
          {orders.map((o,idx)=>{
            const{alert,flagLabel,flagColor,hasDifferentPickup}=rowFields(o);
            const rowBg=idx%2===0?C.white:C.surface;
            return<div key={o.id} onClick={()=>onOpen(o)}
              style={{display:"flex",alignItems:"center",padding:`10px 14px`,borderBottom:`1px solid ${C.border}`,background:rowBg,cursor:"pointer"}}>
              <div title={alert?.msg||""} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:alert?alertDotColor(alert.type):"transparent"}}/>
              <div style={{flex:2.6,minWidth:0,marginLeft:10}}>
                <div style={{fontWeight:700,fontSize:12,color:C.text,...single}}>{o.phoneModel}</div>
                <div style={{fontSize:10,color:C.textLight,...single}}>{o.customerName} · {o.branch} · {o.salesAgentName||o.salesAgentId||"—"}</div>
              </div>
              <div style={{width:150,flexShrink:0,marginLeft:14}}>
                <MerchantBadge order={o}/>
                <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginTop:2}}>{o.invoiceNo||"—"}</div>
              </div>
              <div style={{flex:1.4,minWidth:220,marginLeft:14,alignSelf:"stretch",display:"flex",alignItems:"center"}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,rowGap:5}}>
                  {flagLabel&&<span style={{fontSize:9,fontWeight:700,color:flagColor,background:flagColor+"18",border:`1px solid ${flagColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{flagLabel}</span>}
                  {hasDifferentPickup&&<span style={{fontSize:9,fontWeight:700,color:"#B45309",background:"#B4530918",border:"1px solid #B4530940",padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>Pickup · {o.pickUpBranch}</span>}
                  <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.stockStatus==="ready"?"Ready Stock":"Stock Request"}</span>
                  <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.orderType==="cash"?"Cash Order":"CCM Order"}</span>
                </div>
              </div>
              <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto",fontSize:10,color:C.textLight,whiteSpace:"nowrap"}}>{o.lastHistoryDate?fDT(o.lastHistoryDate,o.lastHistoryTime):"—"}</div>
            </div>;
          })}
        </div>
      </div>
    </div>;
  }

  // ── Desktop: manually virtualized (fixed-height viewport, only visible
  // rows mounted) — this is what keeps scrolling smooth at hundreds of
  // orders. Columns share the available width via flex, no horizontal
  // scroll needed at normal desktop widths. ──
  const ROW_H=60;
  const HEADER_H=32;
  const VIEWPORT_H=620;
  const OVERSCAN=8;
  const total=orders.length;
  const bodyScrollTop=Math.max(0,scrollTop-HEADER_H);
  const bodyVisibleH=VIEWPORT_H-HEADER_H;
  const startIdx=Math.max(0,Math.floor(bodyScrollTop/ROW_H)-OVERSCAN);
  const endIdx=Math.min(total,Math.ceil((bodyScrollTop+bodyVisibleH)/ROW_H)+OVERSCAN);
  const visible=orders.slice(startIdx,endIdx);
  const PAD="0 12px";

  return<div style={{...card,padding:0,overflow:"hidden"}}>
    <div onScroll={e=>setScrollTop(e.currentTarget.scrollTop)} style={{height:VIEWPORT_H,overflow:"auto"}}>
      <div style={{position:"sticky",top:0,zIndex:2,height:HEADER_H,boxSizing:"border-box",display:"flex",alignItems:"center",padding:PAD,background:C.navy,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
        <div style={{width:8,flexShrink:0}}/>
        <div style={{flex:2.6,minWidth:0,marginLeft:10}}>Order</div>
        <div style={{width:150,flexShrink:0,marginLeft:14}}>Invoice No</div>
        <div style={{flex:1.4,minWidth:220,marginLeft:14}}>Status</div>
        <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto"}}>Updated</div>
      </div>
      <div style={{height:total*ROW_H,position:"relative"}}>
        {visible.map((o,i)=>{
          const idx=startIdx+i;
          const{alert,flagLabel,flagColor,hasDifferentPickup}=rowFields(o);
          const rowBg=idx%2===0?C.white:C.surface;
          return<div key={o.id} onClick={()=>onOpen(o)}
            style={{position:"absolute",top:idx*ROW_H,left:0,right:0,height:ROW_H,display:"flex",alignItems:"center",padding:PAD,borderBottom:`1px solid ${C.border}`,background:rowBg,cursor:"pointer",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.background="#EEF3FB";}}
            onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
            <div title={alert?.msg||""} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:alert?alertDotColor(alert.type):"transparent"}}/>
            <div style={{flex:2.6,minWidth:0,marginLeft:10}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text,...single}}>{o.phoneModel}</div>
              <div style={{fontSize:10,color:C.textLight,...single}}>{o.customerName} · {o.branch} · {o.salesAgentName||o.salesAgentId||"—"}</div>
            </div>
            <div style={{width:150,flexShrink:0,marginLeft:14,overflow:"hidden"}}>
              <MerchantBadge order={o}/>
              <div style={{fontSize:11,fontWeight:700,color:C.textMid,marginTop:2,...single}}>{o.invoiceNo||"—"}</div>
            </div>
            <div style={{flex:1.4,minWidth:220,marginLeft:14,overflow:"hidden"}}>
              <div style={{display:"flex",flexWrap:"nowrap",gap:4}}>
                {flagLabel&&<span style={{fontSize:9,fontWeight:700,color:flagColor,background:flagColor+"18",border:`1px solid ${flagColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{flagLabel}</span>}
                {hasDifferentPickup&&<span style={{fontSize:9,fontWeight:700,color:"#B45309",background:"#B4530918",border:"1px solid #B4530940",padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>Pickup · {o.pickUpBranch}</span>}
                <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.stockStatus==="ready"?"Ready Stock":"Stock Request"}</span>
                <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.orderType==="cash"?"Cash Order":"CCM Order"}</span>
              </div>
            </div>
            <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto",fontSize:10,color:C.textLight,whiteSpace:"nowrap"}}>{o.lastHistoryDate?fDT(o.lastHistoryDate,o.lastHistoryTime):"—"}</div>
          </div>;
        })}
      </div>
    </div>
  </div>;
});

export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[],isReadOnly=false,orderPermissions=null,email=null}){
  const isMobile=useIsMobile();
  const isSophia=(email||"").toLowerCase()===SOPHIA_EMAIL;
  // orderPermissions (when set) narrows a full isAdmin=true session down to
  // specific steps/reports for the restricted Order-page-only roles (billing,
  // knock-off, purchase, stock). null = legacy unrestricted behavior.
  const isSuperAdminOrder = isAdmin && (!orderPermissions || orderPermissions.adminSteps==="all");
  // Distinct from isSuperAdminOrder: true super admin means accessed WITHOUT
  // any orderPermissions restriction at all (i.e. the main dashboard), not
  // just holding the "order admin user" role. Remove Completed is destructive
  // enough that even "order admin user" shouldn't get it.
  const isTrueSuperAdmin = isAdmin && !orderPermissions;
  const canSeeStep = (step) => !orderPermissions || orderPermissions.visibleSteps==="all" || orderPermissions.visibleSteps.includes(step);
  // Branch viewers still see their own orders all the way through (via
  // canSeeStep above) — this only hides the Claim Submitted/Claim Released
  // summary cards specifically for them, since claims are HQ-only territory.
  const canSeeStepCard = (step) => {
    if(!isAdmin&&!!userBranch&&[12,13].includes(step))return false;
    return canSeeStep(step);
  };
  const canAdminStep = (step) => !orderPermissions || orderPermissions.adminSteps==="all" || orderPermissions.adminSteps.includes(step);
  const canSeeReport = (type) => !orderPermissions || orderPermissions.reports==="all" || orderPermissions.reports.includes(type);
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState(()=>sessionStorage.getItem("orderView")||"list");
  const [selected,setSelected]=useState(()=>{try{const s=sessionStorage.getItem("orderSelected");return s?JSON.parse(s):null;}catch{return null;}});
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [filterAgent,setFilterAgent]=useState("ALL");
  const [searchInput,setSearchInput]=useState("");
  const [search,setSearch]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setSearch(searchInput),200);return()=>clearTimeout(t);},[searchInput]);
  // Separate search, purely for the Payment Breakdown table at the bottom
  // of the page (Sophia only) — independent of the main order search above,
  // so the two don't interfere with each other.
  const [paymentSearchInput,setPaymentSearchInput]=useState("");
  const [paymentSearch,setPaymentSearch]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setPaymentSearch(paymentSearchInput),200);return()=>clearTimeout(t);},[paymentSearchInput]);
  const [showArchive,setShowArchive]=useState(false);
  const [showBulkDispatch,setShowBulkDispatch]=useState(false);
  const [showBulkAgreementReceived,setShowBulkAgreementReceived]=useState(false);
  const [showBulkKnockOffInstallment,setShowBulkKnockOffInstallment]=useState(false);
  const [showBulkMarkCompleted,setShowBulkMarkCompleted]=useState(false);
  const [showBulkClaimSent,setShowBulkClaimSent]=useState(false);
  const [showBulkKnockoff,setShowBulkKnockoff]=useState(false);
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [claimDate,setClaimDate]=useState(nowDate());
  const [knockOffReportDate,setKnockOffReportDate]=useState(nowDate());
  const [agreementReceivedReportDate,setAgreementReceivedReportDate]=useState(nowDate());
  const [firstInstallmentReportDate,setFirstInstallmentReportDate]=useState(nowDate());
  const [cashKnockoffReportDate,setCashKnockoffReportDate]=useState(nowDate());
  const [collectionOverdueReportDate,setCollectionOverdueReportDate]=useState(nowDate());
  const [purchaseClaimReportDate,setPurchaseClaimReportDate]=useState(nowDate());
  const [firstInstallmentKnockoffReportDate,setFirstInstallmentKnockoffReportDate]=useState(nowDate());
  const [upfront1KnockoffReportDate,setUpfront1KnockoffReportDate]=useState(nowDate());
  const [paymentCollectionReportDate,setPaymentCollectionReportDate]=useState(nowDate());
  const [expandedKnockoffReport,setExpandedKnockoffReport]=useState(null);
  const [reportsExpanded,setReportsExpanded]=useState(false);
  const [knockOffExpanded,setKnockOffExpanded]=useState(false);
  // Fully hydrated + signed order (header + history, with every {name,path}
  // Storage ref resolved to a short-lived signed URL) — fetched lazily, one
  // entry per order opened in Detail. The list/board never touches this.
  const [detailCache,setDetailCache]=useState({});
  // Headers only — no history, no files. This is the ONLY query the list/board
  // view needs, regardless of how many years of tracking events pile up.
  // Branch viewers pass userBranch so the filter happens in the DB query
  // itself, not after downloading every branch's headers.
  const refreshList=useCallback(()=>listOrders(userBranch).then(d=>{setOrders(d);setLoading(false);}),[userBranch]);
  useEffect(()=>{refreshList();},[refreshList]);

  const nav=useCallback((v,sel=null)=>{setView(v);setSelected(sel);sessionStorage.setItem("orderView",v);sessionStorage.setItem("orderSelected",sel?JSON.stringify(sel):"null");window.history.pushState({orderView:v,orderSelected:sel},"");},[]);
  const openOrder=useCallback(o=>nav("detail",o),[nav]);

  // Refs, not state — the popstate handler is set up once on mount (empty
  // deps below) so a plain state variable would be captured stale in that
  // closure forever; refs always read the current value. selectedRef
  // itself is declared further below (already used there for a different,
  // unrelated purpose) — reused here rather than duplicated.
  const viewRef=useRef(view);
  const formDirtyRef=useRef(false);
  useEffect(()=>{viewRef.current=view;},[view]);
  // Resets whenever the form is freshly entered, so a leftover dirty flag
  // from a previous New Order/Edit session doesn't wrongly warn on a form
  // the person hasn't touched yet.
  useEffect(()=>{if(view==="form")formDirtyRef.current=false;},[view]);

  // Browser back/forward button support — additive on top of the existing
  // visible Back button, not a replacement for it. On mount, the current
  // view becomes the baseline history entry (via replaceState, not
  // pushState, so this doesn't add an extra step) — this way the very
  // first back press from a freshly-loaded page goes to whatever page was
  // open before this one, not some undefined in-between state. From then
  // on, every nav() call above pushes a new entry, and this listens for
  // the browser's own back/forward action to restore the matching view.
  useEffect(()=>{
    window.history.replaceState({orderView:view,orderSelected:selected},"");
    const onPopState=e=>{
      if(viewRef.current==="form"&&formDirtyRef.current){
        const leave=window.confirm("You have unsaved changes. Are you sure you want to leave without saving?");
        if(!leave){
          // Browser already moved back one step — push the form state
          // straight back on top to undo that, since the person chose to
          // stay.
          window.history.pushState({orderView:"form",orderSelected:selectedRef.current},"");
          return;
        }
        formDirtyRef.current=false;
      }
      if(e.state&&"orderView" in e.state){
        setView(e.state.orderView);
        setSelected(e.state.orderSelected);
        sessionStorage.setItem("orderView",e.state.orderView);
        sessionStorage.setItem("orderSelected",e.state.orderSelected?JSON.stringify(e.state.orderSelected):"null");
      }
    };
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const hydrateOrder=useCallback(async id=>{
    const [header,hist]=await Promise.all([getOrder(id),getOrderHistory(id)]);
    const signed=await signOrderFiles({...(header||{}),history:hist});
    setDetailCache(p=>({...p,[id]:signed}));
    return signed;
  },[]);

  // Full timeline + signed file links are fetched once per order, on demand,
  // only when its Detail page is opened — never as part of the list/board load.
  useEffect(()=>{
    if(view==="detail"&&selected&&!detailCache[selected.id])hydrateOrder(selected.id);
  },[view,selected,detailCache,hydrateOrder]);

  // Shared link support — "?orderId=..." in the URL (from the Copy Link
  // button on an order's detail page) opens straight to that order, for
  // whoever opens it (their own access rights/branch filtering still apply
  // as normal — this only handles navigation, not permissions). Runs once
  // on mount; the query param is left in place so refreshing keeps you here.
  useEffect(()=>{
    const orderId=new URLSearchParams(window.location.search).get("orderId");
    if(!orderId)return;
    getOrder(orderId).then(header=>{
      // Same access rules as the normal list — a shared link doesn't grant
      // any access the recipient wouldn't already have on their own.
      if(header&&visibleToBranch(header,userBranch)&&canSeeStep(header.step)){
        nav("detail",header);
      }else{
        alert("You don't have access to this order, or the link is no longer valid.");
      }
    }).catch(()=>alert("Couldn't open that order — the link may be invalid."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Live updates — whenever anyone (any branch, any device) changes an order
  // or its history, everyone viewing this page picks it up automatically,
  // no manual refresh needed. Debounced slightly so a burst of changes (e.g.
  // a bulk action touching many orders) doesn't refetch on every single row.
  const selectedRef=useRef(selected);
  useEffect(()=>{selectedRef.current=selected;},[selected]);
  useEffect(()=>{
    let refreshTimer=null;
    const scheduleRefresh=()=>{
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(()=>{refreshList();},400);
    };
    const channel=supabase.channel("orders-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},payload=>{
        scheduleRefresh();
        const changedOrderId=payload.new?.id||payload.old?.id;
        if(changedOrderId&&selectedRef.current&&String(changedOrderId)===String(selectedRef.current.id)){
          hydrateOrder(changedOrderId);
        }
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"order_history"},payload=>{
        scheduleRefresh();
        const changedOrderId=payload.new?.order_id||payload.old?.order_id;
        if(changedOrderId&&selectedRef.current&&String(changedOrderId)===String(selectedRef.current.id)){
          hydrateOrder(changedOrderId);
        }
      })
      .subscribe();
    return()=>{clearTimeout(refreshTimer);supabase.removeChannel(channel);};
  },[refreshList,hydrateOrder]);

  // o = full order object (header fields + its complete, already-appended history array).
  // Diffs against what we last knew about this one order and writes ONLY the new
  // history row(s) + this order's own header row — never touches any other order.
  const saveOrder=async o=>{
    const oldFull=detailCache[o.id];
    const isNewOrder=!oldFull;
    const result=await reconcile(oldFull?[oldFull]:[],[o]);
    if(!result.ok){
      alert("Save failed — your changes were NOT saved. This usually happens when an uploaded file is too large. Please try a smaller file (compress the photo or PDF) and try again.");
      return false;
    }
    const signed=await hydrateOrder(o.id);
    const{history:_h,...headerOnly}=signed;
    setOrders(p=>p.some(x=>x.id===headerOnly.id)?p.map(x=>x.id===headerOnly.id?headerOnly:x):[headerOnly,...p]);
    nav("detail",signed);
    return true;
  };
  const deleteOrder=async id=>{
    if(!confirm("Delete this order?"))return;
    const result=await apiDeleteOrder(id);
    if(!result?.ok){alert("Delete failed. Please try again.");return;}
    setOrders(p=>p.filter(x=>x.id!==id));
    setDetailCache(p=>{const n={...p};delete n[id];return n;});
    nav("list");
  };
  // Bulk actions build only the CHANGED subset (header fields + the single new
  // history entry each) — reconcile() then writes just those rows, and we
  // refresh the (lightweight, header-only) list once afterwards.
  const bulkSave=async newSubset=>{
    const oldSubset=newSubset.map(o=>orders.find(x=>x.id===o.id)).filter(Boolean);
    const result=await reconcile(oldSubset,newSubset);
    if(!result.ok){alert("Bulk update failed — please try again.");return false;}
    await refreshList();
    return true;
  };
  const bulkDelete=async ids=>{
    const result=await apiDeleteOrders(ids);
    if(!result?.ok){alert("Delete failed — please try again.");return false;}
    await refreshList();
    return true;
  };

  const activeOrders=useMemo(()=>orders.filter(o=>o.step!==14&&!o.cancelled&&visibleToBranch(o,userBranch)&&canSeeStep(o.step)),[orders,userBranch,orderPermissions]);
  const completedOrders=useMemo(()=>orders.filter(o=>o.step===14&&!o.cancelled&&visibleToBranch(o,userBranch)&&canSeeStep(o.step)),[orders,userBranch,orderPermissions]);
  const cancelledOrders=useMemo(()=>orders.filter(o=>o.cancelled&&visibleToBranch(o,userBranch)&&canSeeStep(o.step)),[orders,userBranch,orderPermissions]);
  const agentOptions=useMemo(()=>[...new Set(orders.filter(o=>visibleToBranch(o,userBranch)&&canSeeStep(o.step)).map(o=>o.salesAgentName||o.salesAgentId).filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[orders,userBranch,orderPermissions]);
  const viewingCompleted=filterPhase==="completed";
  const viewingCancelled=filterPhase==="cancelled";
  const viewingMerchantRejected=filterPhase==="merchantRejected";
  const filtered=useMemo(()=>(viewingCancelled?cancelledOrders:viewingCompleted?completedOrders:activeOrders).filter(o=>((viewingCompleted||viewingCancelled)||(viewingMerchantRejected?(o.step===12&&o.merchantRejected&&!o.resubmittedDate&&!o.knockOffDate):(filterPhase==="all"||o.step===filterPhase)))&&(filterBranch==="ALL"||o.branch===filterBranch)&&(filterAgent==="ALL"||(o.salesAgentName||o.salesAgentId||"—")===filterAgent)&&(!search||[o.customerName,o.phoneModel,o.agreementNumber,o.invoiceNo].some(v=>v?.toString().toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>b.id-a.id),[viewingCompleted,viewingCancelled,viewingMerchantRejected,completedOrders,cancelledOrders,activeOrders,filterPhase,filterBranch,filterAgent,search]);
  // Separate from the main order list above on purpose — the regular list
  // stays predictable for everyone (only matches customer/model/agreement/
  // invoice, same as always), while this handles the Sophia-only payment-
  // detail search (amount/date/remark) that feeds the Payment Breakdown
  // table exclusively, using its OWN separate search box (paymentSearch,
  // not the main search above) so the two never interfere with each other.
  const paymentSearchResults=useMemo(()=>{
    if(!isSophia||!paymentSearch)return[];
    return(viewingCancelled?cancelledOrders:viewingCompleted?completedOrders:activeOrders).filter(o=>{
      // Only orders with an actual, real payment on record — a cash
      // deposit, or a genuine Collection Verified event. Without this, an
      // order that's never even reached Collection Verified would still
      // show calcUpfront(o)'s EXPECTED Upfront 1 amount (computed straight
      // from the order's own fields, always available regardless of
      // verification status) next to an empty/0 Upfront 2 — looking like
      // a broken combined total instead of correctly showing nothing at
      // all for a payment that was never actually collected yet.
      const hasRealPayment=o.orderType==="cash"?!!o.depositPaymentDate:!!o.lastVerification?.upfrontPaymentDate;
      if(!hasRealPayment)return false;
      return((viewingCompleted||viewingCancelled)||(viewingMerchantRejected?(o.step===12&&o.merchantRejected&&!o.resubmittedDate&&!o.knockOffDate):(filterPhase==="all"||o.step===filterPhase)))&&(filterBranch==="ALL"||o.branch===filterBranch)&&(filterAgent==="ALL"||(o.salesAgentName||o.salesAgentId||"—")===filterAgent)&&[o.customerName,o.phoneModel,o.agreementNumber,o.invoiceNo,o.lastVerification?.paymentProofAmount,o.lastVerification?.secondPaymentAmount,o.lastVerification?.totalUpfrontPayment,o.lastVerification?.monthlyInstallment,o.orderType!=="cash"&&calcUpfront(o).total,o.lastVerification?.upfrontPaymentDate,o.lastVerification?.upfrontPaymentDate&&fDate(o.lastVerification.upfrontPaymentDate),o.lastVerification?.verificationRemark].some(v=>v?.toString().toLowerCase().includes(paymentSearch.toLowerCase()));
    });
  },[viewingCompleted,viewingCancelled,viewingMerchantRejected,completedOrders,cancelledOrders,activeOrders,filterPhase,filterBranch,filterAgent,paymentSearch,isSophia]);
  const stepCounts=useMemo(()=>STEPS.filter(s=>s.step!==14).reduce((acc,s)=>{acc[s.step]=activeOrders.filter(o=>o.step===s.step).length;return acc;},{}),[activeOrders]);
  const merchantRejectedCount=useMemo(()=>activeOrders.filter(o=>o.step===12&&o.merchantRejected&&!o.resubmittedDate&&!o.knockOffDate).length,[activeOrders]);
  // Step cards grouped by phase (Stock Order, Stock Transfer, Billing, etc.)
  // for the redesigned Order Tracking cards — each phase only appears if it
  // has at least one step visible to this role.
  const groupedPhases=useMemo(()=>PHASES.map(ph=>({...ph,steps:STEPS.filter(s=>s.phase===ph.id&&s.step!==14&&canSeeStepCard(s.step))})).filter(g=>g.steps.length>0),[orderPermissions,userBranch,isAdmin]);
  const completedCount=orders.filter(o=>o.step===14&&visibleToBranch(o,userBranch)).length;
  const alerts=useMemo(()=>{
    const all=getOrderAlerts(activeOrders,userBranch);
    const canSeeMerchantRejected=isSuperAdminOrder||canAdminStep(7);
    return canSeeMerchantRejected?all:all.filter(a=>a.type!=="merchant_rejected");
  },[activeOrders,userBranch,isSuperAdminOrder,orderPermissions]);
  const alertsByOrderId=useMemo(()=>{const m={};alerts.forEach(a=>{if(!m[a.orderId])m[a.orderId]=a;});return m;},[alerts]);

  if(loading)return<div style={{padding:60,textAlign:"center",color:C.textLight,fontSize:13}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=detailCache[selected.id];
    if(!live)return<div style={{padding:60,textAlign:"center",color:C.textLight,fontSize:13}}>Loading order…</div>;
    return<><OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} isReadOnly={isReadOnly} orderPermissions={orderPermissions} userBranch={userBranch} email={email} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);nav("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>nav("list")} allOrders={activeOrders}/>{showArchive&&<BatchArchive orders={orders} onDelete={bulkDelete} onClose={()=>setShowArchive(false)}/>}</>;
  }
  if(view==="form")return<OrderForm order={editOrder} orders={orders} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} orderPermissions={orderPermissions} email={email} onDirtyChange={d=>{formDirtyRef.current=d;}} onSave={async o=>{await saveOrder(o);formDirtyRef.current=false;setEditOrder(null);}} onCancel={()=>{nav(editOrder?"detail":"list",editOrder||selected);setEditOrder(null);}}/>;

  return<div className="fade-in">
    {showArchive&&<BatchArchive orders={orders} onDelete={bulkDelete} onClose={()=>setShowArchive(false)}/>}
    {showBulkDispatch&&<BulkDispatch orders={orders} onSave={bulkSave} onClose={()=>setShowBulkDispatch(false)}/>}
    {showBulkAgreementReceived&&<BulkAgreementReceived orders={orders} onSave={bulkSave} onClose={()=>setShowBulkAgreementReceived(false)}/>}
    {showBulkKnockOffInstallment&&<BulkKnockOffInstallment orders={orders} onSave={bulkSave} onClose={()=>setShowBulkKnockOffInstallment(false)}/>}
    {showBulkMarkCompleted&&<BulkMarkCompleted orders={orders} onSave={bulkSave} onClose={()=>setShowBulkMarkCompleted(false)}/>}
    {showBulkClaimSent&&<BulkClaimSent orders={orders} onSave={bulkSave} onClose={()=>setShowBulkClaimSent(false)}/>}
    {showBulkKnockoff&&<BulkKnockOff orders={orders} onSave={bulkSave} onClose={()=>setShowBulkKnockoff(false)}/>}

    {/* Page header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:19,fontWeight:800,color:C.navy,letterSpacing:"-0.01em"}}>Order Tracking</div>
        <div style={{fontSize:12,color:C.textLight,marginTop:4}}>{activeOrders.length} active · {completedCount} completed</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {isAdmin&&!isReadOnly&&canAdminStep(4)&&orders.some(o=>o.step===3)&&<GBtn onClick={()=>setShowBulkDispatch(true)}>{Ic.truck} Dispatch to Branch</GBtn>}
        {isAdmin&&!isReadOnly&&canAdminStep(11)&&orders.some(o=>!o.cancelled&&o.step===10)&&<GBtn onClick={()=>setShowBulkAgreementReceived(true)}>{Ic.checkCircle} Set Agreement Received by HQ Date</GBtn>}
        {isAdmin&&!isReadOnly&&canSeeReport("firstInstallmentKnockoff")&&orders.some(o=>!o.cancelled&&o.orderType!=="cash"&&o.lastVerification?.paymentChecked&&o.lastVerification?.monthlyInstallment&&!o.firstInstallmentKnockOffDate)&&<GBtn onClick={()=>setShowBulkKnockOffInstallment(true)}>{Ic.checkCircle} Knock Off First Monthly Installment</GBtn>}
        {isAdmin&&!isReadOnly&&canAdminStep(12)&&orders.some(o=>!o.cancelled&&o.step===11)&&<GBtn onClick={()=>setShowBulkClaimSent(true)}>{Ic.checkCircle} Set Agreement Sent to Merchant Date</GBtn>}
        {isAdmin&&!isReadOnly&&canAdminStep(13)&&orders.some(o=>!o.cancelled&&o.step===12)&&<GBtn onClick={()=>setShowBulkKnockoff(true)}>{Ic.calendar} Set Knock-off Date</GBtn>}
        {isSuperAdminOrder&&!isReadOnly&&orders.some(o=>!o.cancelled&&o.step===13)&&<GBtn onClick={()=>setShowBulkMarkCompleted(true)}>{Ic.checkCircle} Mark as Completed</GBtn>}
        {isTrueSuperAdmin&&!isReadOnly&&completedCount>0&&<GBtn onClick={()=>setShowArchive(true)}>{Ic.trash} Remove Completed ({completedCount})</GBtn>}
        {(isSuperAdminOrder||!isAdmin)&&!isReadOnly&&<PBtn onClick={()=>{setEditOrder(null);nav("form");}}>{Ic.plus} New Order</PBtn>}
      </div>
    </div>

    {/* Alerts */}
    <AlertBanner alerts={alerts} isAdmin={isAdmin} isSophia={isSophia} onClickOrder={id=>{const o=activeOrders.find(x=>x.id===id);if(o)nav("detail",o);}}/>

    {(()=>{
      const outOfStockUnacked=cancelledOrders.filter(o=>o.outOfStock&&!(o.outOfStockAckAdmin&&o.outOfStockAckBranch));
      if(!outOfStockUnacked.length)return null;
      return<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Out of Stock — Order Cancelled</div>
        {outOfStockUnacked.map(o=><div key={o.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div onClick={()=>nav("detail",o)} style={{fontSize:12,color:C.text,cursor:"pointer",textDecoration:"underline",textDecorationColor:"transparent"}} onMouseEnter={e=>e.currentTarget.style.textDecorationColor=C.text} onMouseLeave={e=>e.currentTarget.style.textDecorationColor="transparent"}>{o.customerName} — {o.phoneModel} — {o.branch} — refunded {fDate(o.refundSlipDate)}</div>
          <div style={{display:"flex",gap:6}}>
            {isAdmin&&!o.outOfStockAckAdmin&&<GBtn onClick={()=>bulkSave([{...o,outOfStockAckAdmin:nowDate()}])} style={{fontSize:11,padding:"6px 12px"}}>Acknowledge (Admin)</GBtn>}
            {(!isAdmin||userBranch===o.branch)&&!o.outOfStockAckBranch&&<GBtn onClick={()=>bulkSave([{...o,outOfStockAckBranch:nowDate()}])} style={{fontSize:11,padding:"6px 12px"}}>Acknowledge (Branch)</GBtn>}
          </div>
        </div>)}
      </div>;
    })()}

    {/* Step progress cards — grouped by phase. Mobile: cards connected by a
        colored rail per phase (echoes the physical hand-off of stock/
        paperwork moving through that phase). Desktop: a clean even grid per
        phase with a colored top edge, no connecting rail (a phase's steps
        read left-to-right as a row on a wide screen, so no rail is needed
        for the sequence to still be legible). */}
    <div style={{marginBottom:20}}>
      <div style={isMobile?undefined:{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:18,alignItems:"start",marginBottom:20}}>{/* fixed 2 phases per row on desktop */}
      {groupedPhases.map(ph=>{
        const phaseTotal=ph.steps.reduce((sum,s)=>sum+(stepCounts[s.step]||0),0);
        return isMobile?(
          <div key={ph.id} style={{marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:11}}>
              <div style={{width:4,height:16,borderRadius:2,background:ph.color}}/>
              <div style={{fontSize:13.5,fontWeight:800,color:C.navy}}>{ph.label}</div>
              <div style={{marginLeft:"auto",fontSize:11.5,fontWeight:700,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 9px",borderRadius:20}}>{phaseTotal} order{phaseTotal!==1?"s":""}</div>
            </div>
            <div style={{position:"relative",paddingLeft:22}}>
              <div style={{position:"absolute",left:5,top:8,bottom:8,width:2,borderRadius:2,background:ph.bg}}/>
              {ph.steps.map((s,i)=>{
                const count=stepCounts[s.step]||0,active=filterPhase===s.step;
                return<Fragment key={s.step}>
                  <div style={{position:"relative",marginBottom:i===ph.steps.length-1?0:10}}>
                    <div onClick={()=>setFilterPhase(active?"all":s.step)} style={{...card,padding:"13px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",border:`1px solid ${active?ph.color:C.border}`,boxShadow:active?`0 0 0 1.5px ${ph.color}, 0 6px 16px rgba(10,22,40,.09)`:card.boxShadow,transition:"all .12s"}}>
                      <div style={{width:38,height:38,borderRadius:10,background:ph.bg,color:ph.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{PHASE_ICONS[ph.id]}</div>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.label}</div>
                        <div style={{fontSize:22,fontWeight:800,color:count?C.navy:"#C3CCDA",lineHeight:1}}>{count}</div>
                      </div>
                    </div>
                  </div>
                  {ph.id==="claimed"&&s.step===12&&(isSuperAdminOrder||canAdminStep(7))&&<div style={{position:"relative",marginBottom:10}}>
                    <div onClick={()=>setFilterPhase(filterPhase==="merchantRejected"?"all":"merchantRejected")} style={{...card,padding:"13px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",border:`1px solid ${filterPhase==="merchantRejected"?"#DC2626":C.border}`,boxShadow:filterPhase==="merchantRejected"?"0 0 0 1.5px #DC2626, 0 6px 16px rgba(10,22,40,.09)":card.boxShadow}}>
                      <div style={{width:38,height:38,borderRadius:10,background:merchantRejectedCount>0?"#FEF2F2":C.surface,color:merchantRejectedCount>0?"#DC2626":C.textLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{Ic.alertCircle}</div>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3,whiteSpace:"nowrap"}}>Merchant Rejected</div>
                        <div style={{fontSize:22,fontWeight:800,color:merchantRejectedCount>0?"#DC2626":"#C3CCDA",lineHeight:1}}>{merchantRejectedCount}</div>
                      </div>
                    </div>
                  </div>}
                </Fragment>;
              })}
            </div>
          </div>
        ):(
          <div key={ph.id}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
              <div style={{width:4,height:15,borderRadius:2,background:ph.color}}/>
              <div style={{fontSize:13,fontWeight:800,color:C.navy}}>{ph.label}</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textLight,background:C.white,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:20}}>{phaseTotal} order{phaseTotal!==1?"s":""}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
              {ph.steps.map(s=>{
                const count=stepCounts[s.step]||0,active=filterPhase===s.step;
                return<Fragment key={s.step}>
                  <div onClick={()=>setFilterPhase(active?"all":s.step)} style={{...card,border:`1px solid ${active?ph.color:C.border}`,borderTop:`3px solid ${ph.color}`,padding:"12px 14px 11px",display:"flex",flexDirection:"column",gap:9,cursor:"pointer",boxShadow:active?`0 0 0 1.5px ${ph.color}, 0 6px 16px rgba(10,22,40,.08)`:card.boxShadow,transition:"all .12s"}}>
                    <div style={{width:30,height:30,borderRadius:8,background:ph.bg,color:ph.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{PHASE_ICONS[ph.id]}</div>
                    <div>
                      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3}}>{s.label}</div>
                      <div style={{fontSize:21,fontWeight:800,color:count?C.navy:"#C3CCDA",lineHeight:1}}>{count}</div>
                    </div>
                  </div>
                  {ph.id==="claimed"&&s.step===12&&(isSuperAdminOrder||canAdminStep(7))&&<div onClick={()=>setFilterPhase(filterPhase==="merchantRejected"?"all":"merchantRejected")} style={{...card,border:`1px solid ${filterPhase==="merchantRejected"?"#DC2626":C.border}`,borderTop:"3px solid #DC2626",padding:"12px 14px 11px",display:"flex",flexDirection:"column",gap:9,cursor:"pointer",boxShadow:filterPhase==="merchantRejected"?"0 0 0 1.5px #DC2626, 0 6px 16px rgba(10,22,40,.08)":card.boxShadow,transition:"all .12s"}}>
                    <div style={{width:30,height:30,borderRadius:8,background:merchantRejectedCount>0?"#FEF2F2":C.surface,color:merchantRejectedCount>0?"#DC2626":C.textLight,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.alertCircle}</div>
                    <div>
                      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3}}>Merchant Rejected</div>
                      <div style={{fontSize:21,fontWeight:800,color:merchantRejectedCount>0?"#DC2626":"#C3CCDA",lineHeight:1}}>{merchantRejectedCount}</div>
                    </div>
                  </div>}
                </Fragment>;
              })}
            </div>
          </div>
        );
      })}
      </div>

      {/* Terminal states (Completed / Cancelled) — outside the phase flow,
          so kept visually separate as flat pill rows rather than grid cards. */}
      {isSuperAdminOrder&&<div style={{display:"flex",flexDirection:isMobile?"column":"row",gap:isMobile?10:14}}>
        <div onClick={()=>setFilterPhase(viewingCompleted?"all":"completed")} style={{...card,border:`1px solid ${viewingCompleted?"#15803D":C.border}`,boxShadow:viewingCompleted?`0 0 0 1.5px #15803D, 0 4px 12px rgba(10,22,40,.08)`:card.boxShadow,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"all .12s",flex:isMobile?"none":"0 0 240px"}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#F0FDF4",color:"#15803D",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{Ic.checkCircle}</div>
          <div><div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Completed</div><div style={{fontSize:20,fontWeight:800,color:C.navy,lineHeight:1}}>{completedCount}</div></div>
        </div>
        <div onClick={()=>setFilterPhase(viewingCancelled?"all":"cancelled")} style={{...card,border:`1px solid ${viewingCancelled?"#DC2626":C.border}`,boxShadow:viewingCancelled?`0 0 0 1.5px #DC2626, 0 4px 12px rgba(10,22,40,.08)`:card.boxShadow,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"all .12s",flex:isMobile?"none":"0 0 240px"}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#F1F3F7",color:C.textLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{Ic.x}</div>
          <div><div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Cancelled</div><div style={{fontSize:20,fontWeight:800,color:C.navy,lineHeight:1}}>{cancelledOrders.length}</div></div>
        </div>
      </div>}
    </div>

    {/* Search + filter */}
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <I placeholder={isSophia?"Search customer, model, agreement, invoice, amount, date, remark…":"Search customer, model, agreement, invoice…"} value={searchInput} onChange={e=>setSearchInput(e.target.value)} style={{flex:2,minWidth:160}}/>
      {isAdmin&&<SEL value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</SEL>}
      {agentOptions.length>0&&<SEL value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{flex:1,minWidth:140}}><option value="ALL">All Agents</option>{agentOptions.map(a=><option key={a} value={a}>{a}</option>)}</SEL>}
    </div>

    {/* Order list — compact rows in a fixed-height virtualized viewport.
        Only the rows actually in view (plus a small overscan buffer) are
        ever mounted, so scroll performance doesn't degrade as the order
        count grows into the hundreds. */}
    {filtered.length===0
      ?<div style={{...card,padding:"44px 20px",textAlign:"center",color:C.textLight,fontSize:13}}>{search||filterPhase!=="all"||filterBranch!=="ALL"||filterAgent!=="ALL"?"No orders match your filter.":"No orders yet. Click New Order to get started."}</div>
      :<OrderListVirtualized orders={filtered} alertsByOrderId={alertsByOrderId} onOpen={openOrder} userBranch={userBranch}/>
    }

    {/* Report downloads — admin only, footer */}
    {(()=>{
      const allReports=[["First Monthly Installment","firstInstallment",firstInstallmentReportDate,setFirstInstallmentReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["First Monthly Installment Knock Off","firstInstallmentKnockoff",firstInstallmentKnockoffReportDate,setFirstInstallmentKnockoffReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["Upfront 1 Payment Knock Off","upfront1Knockoff",upfront1KnockoffReportDate,setUpfront1KnockoffReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],...(isSophia?[["Payment Collection Overview","paymentCollection",paymentCollectionReportDate,setPaymentCollectionReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)]]:[]),["Agreement Received by HQ","agreementReceived",agreementReceivedReportDate,setAgreementReceivedReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["Claim Submitted to Merchant","claim",claimDate,setClaimDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["Claim Released - Knock Off","knockoff",knockOffReportDate,setKnockOffReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["Cash Order Knock Off (Deposit + Balance Payment)","cashKnockoff",cashKnockoffReportDate,setCashKnockoffReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)],["Purchase Claim","purchaseClaim",purchaseClaimReportDate,setPurchaseClaimReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)]];
      const visibleReports=allReports.filter(([,type])=>canSeeReport(type));
      if(!isAdmin||isReadOnly||!visibleReports.length)return null;
      return<div style={{...card,marginTop:12}}>
      <div onClick={()=>setReportsExpanded(p=>!p)} style={{cursor:"pointer",userSelect:"none",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{color:"rgba(255,255,255,.85)"}}>{Ic.download}</span><span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Reports</span></div>
          <span style={{color:"rgba(255,255,255,.85)",transition:"transform .15s",transform:reportsExpanded?"rotate(180deg)":"none"}}>{Ic.chevDown}</span>
        </div>
      </div>
      {reportsExpanded&&<div style={{padding:"0 16px 16px",borderTop:`1px solid ${C.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginTop:14}}>
          {/* Knock Off checklists moved to their own standalone section below */}
          {visibleReports.map(([label,type,date,setDate,src])=>
            <MerchantReportCard key={type} label={label} type={type} date={date} setDate={setDate} src={src} isMobile={isMobile}/>
          )}
        </div>
      </div>}
    </div>;
    })()}

    {/* Knock Off — its own bar, separate from Reports. Reconciliation
        checklists ("I've matched this against my own accounting/bank
        records"), tracked with dedicated date fields so they never collide
        with the Claim Released step's own knockOffDate. Only for the
        Knock-off role (or super admin) — these are their action items
        regardless of which printable reports still exist. */}
    {(isSuperAdminOrder||canSeeReport("knockoff"))&&(()=>{
      const upfront1Pending=orders.filter(o=>!o.cancelled&&o.orderType!=="cash"&&parseFloat(o.lastVerification?.paymentProofAmount)>0&&!(o.upfront1KnockOffDate&&o.upfront1KnockOff2Date));
      const upfront2Pending=orders.filter(o=>!o.cancelled&&o.orderType!=="cash"&&parseFloat(o.lastVerification?.secondPaymentAmount)>0&&!o.upfront2KnockOffDate);
      const claimPending=orders.filter(o=>!o.cancelled&&o.knockOffDate&&!o.claimReportKnockOffDate);
      const depositPending=orders.filter(o=>!o.cancelled&&o.orderType==="cash"&&o.depositPaymentDate&&!o.cashDepositKnockOffDate);
      const balancePending=orders.filter(o=>!o.cancelled&&o.orderType==="cash"&&parseFloat(o.lastVerification?.monthlyInstallment)>0&&!o.cashBalanceKnockOffDate);
      const totalPending=upfront1Pending.length+upfront2Pending.length+claimPending.length+depositPending.length+balancePending.length;
      if(!totalPending)return null;
      // Small colored pill for an amount — badge style, so different amount
      // types (Upfront 1 vs Upfront 2, etc.) are easy to tell apart at a glance.
      const AmtBadge=({label,value,bg,fg})=><span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:bg,color:fg,whiteSpace:"nowrap"}}>{label}: RM {value.toFixed(2)}</span>;
      // buttons: array of {label,onClick,done} — each shown independently
      // with its own done state; the row itself only leaves the pending
      // list once every button in the row is done (handled by each
      // checklist's own pending filter above).
      const Row=({order,meta,amounts,remark,buttons})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 11px",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          {order&&<div style={{marginBottom:4}}><MerchantBadge order={order}/></div>}
          {meta&&<div style={{fontSize:10,color:C.textLight,marginBottom:5}}>{meta}</div>}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:remark?5:0}}>{amounts}</div>
          {remark&&<div style={{fontSize:11,color:C.textMid}}>Remark: {remark}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          {buttons.map((b,i)=><button key={i} onClick={b.onClick} disabled={b.done} style={{fontSize:10,fontWeight:700,color:b.done?"#15803D":C.blueBright,background:b.done?"#F0FDF4":"#EFF6FF",border:`1px solid ${b.done?"#BBF7D0":C.border}`,borderRadius:6,padding:"4px 9px",cursor:b.done?"default":"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>{b.label}</button>)}
        </div>
      </div>;
      const Checklist=({checklistKey,title,items,rowRenderer})=>{
        if(!items.length)return null;
        const open=expandedKnockoffReport===checklistKey;
        return<div style={{border:`1px solid ${C.border}`,borderRadius:10,background:C.surface,padding:"10px 14px"}}>
          <div onClick={()=>setExpandedKnockoffReport(open?null:checklistKey)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
            <span style={{fontSize:11,fontWeight:700,color:C.text}}>{title} — {items.length} pending</span>
            <span style={{fontSize:11,color:C.blueBright,fontWeight:700}}>{open?"Hide ▲":"Show ▼"}</span>
          </div>
          {open&&<div style={{marginTop:8,maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
            {items.map(o=>rowRenderer(o))}
          </div>}
        </div>;
      };
      return<div style={{...card,marginTop:12}}>
        <div onClick={()=>setKnockOffExpanded(p=>!p)} style={{cursor:"pointer",userSelect:"none",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <span style={{color:"rgba(255,255,255,.85)"}}>{Ic.checkCircle}</span>
              <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Knock Off</span>
              <span style={{fontSize:10,fontWeight:700,color:"#fff",background:"rgba(255,255,255,.15)",padding:"1px 8px",borderRadius:20}}>{totalPending}</span>
            </div>
            <span style={{color:"rgba(255,255,255,.85)",transition:"transform .15s",transform:knockOffExpanded?"rotate(180deg)":"none"}}>{Ic.chevDown}</span>
          </div>
        </div>
        {knockOffExpanded&&<div style={{padding:"14px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:10}}>
          <Checklist checklistKey="upfront1" title="Upfront 1 Knock Off (CCM Order)" items={upfront1Pending} rowRenderer={o=>{
            const h=o.lastVerification;
            return<Row key={o.id} order={o} buttons={[
              {label:"K/O 1",done:!!o.upfront1KnockOffDate,onClick:()=>bulkSave([{...o,upfront1KnockOffDate:nowDate()}])},
              {label:"K/O 2",done:!!o.upfront1KnockOff2Date,onClick:()=>bulkSave([{...o,upfront1KnockOff2Date:nowDate()}])},
            ]} meta={`Invoice: ${o.invoiceNo||"—"} · Agreement: ${o.agreementNumber||"—"}`} amounts={<>
              <AmtBadge label="Upfront 1" value={calcUpfront(o).total} bg="#EFF6FF" fg="#1D4ED8"/>
              <AmtBadge label="Upfront 2" value={parseFloat(h?.monthlyInstallment??o.monthlyInstallment)||0} bg="#F5F0FF" fg="#7C3AED"/>
            </>} remark={h?.verificationRemark}/>;
          }}/>
          <Checklist checklistKey="upfront2" title="Upfront 2 Knock Off (CCM Order)" items={upfront2Pending} rowRenderer={o=>{
            const h=o.lastVerification;
            return<Row key={o.id} order={o} buttons={[{label:"Knock Off",done:false,onClick:()=>bulkSave([{...o,upfront2KnockOffDate:nowDate()}])}]}
              meta={[o.invoiceNo||"—",o.agreementNumber||"—",o.merchant||"—",h?.secondPaymentDate?`2nd Upfront Date: ${fDate(h.secondPaymentDate)}`:null,h?.secondPayMethod?`Method: ${h.secondPayMethod}`:null].filter(Boolean).join(" · ")}
              amounts={<AmtBadge label="2nd Payment Proof" value={parseFloat(h?.secondPaymentAmount)||0} bg="#F5F0FF" fg="#7C3AED"/>}/>;
          }}/>
          <Checklist checklistKey="knockoff" title="Claim Released Knock Off (CCM Order)" items={claimPending} rowRenderer={o=>
            <Row key={o.id} order={o} buttons={[{label:"Knock Off",done:false,onClick:()=>bulkSave([{...o,claimReportKnockOffDate:nowDate()}])}]}
              meta={[o.invoiceNo||"—",o.agreementNumber||"—"].filter(Boolean).join(" · ")}
              amounts={<AmtBadge label="Amount" value={parseFloat(o.knockOffAmount)||0} bg="#F0FDF4" fg="#15803D"/>}/>
          }/>
          <Checklist checklistKey="deposit" title="Deposit Knock Off (Cash Order)" items={depositPending} rowRenderer={o=>
            <Row key={o.id} order={o} buttons={[{label:"Knock Off",done:false,onClick:()=>bulkSave([{...o,cashDepositKnockOffDate:nowDate()}])}]}
              meta={[o.invoiceNo||"—",o.customerName||"—",o.phoneModel||"—",o.branch||"—",`Deposit Date: ${fDate(o.depositPaymentDate)}`,o.depositPaymentMethod?`Method: ${o.depositPaymentMethod}`:null].filter(Boolean).join(" · ")}
              amounts={<AmtBadge label="Deposit" value={parseFloat(o.deposit)||0} bg="#EFF6FF" fg="#1D4ED8"/>}/>
          }/>
          <Checklist checklistKey="balance" title="Balance Payment Knock Off (Cash Order)" items={balancePending} rowRenderer={o=>{
            const h=o.lastVerification;
            return<Row key={o.id} order={o} buttons={[{label:"Knock Off",done:false,onClick:()=>bulkSave([{...o,cashBalanceKnockOffDate:nowDate()}])}]}
              meta={[o.invoiceNo||"—",h?.upfrontPaymentDate?`Balance Date: ${fDate(h.upfrontPaymentDate)}`:null,h?.paymentMethod?`Method: ${h.paymentMethod}`:null].filter(Boolean).join(" · ")}
              amounts={<AmtBadge label="Amount" value={parseFloat(h?.monthlyInstallment)||0} bg="#FFFBEB" fg="#B45309"/>}/>;
          }}/>
        </div>}
      </div>;
    })()}

    {/* Payment Breakdown — Sophia only, own separate search box entirely
        independent of the main order search above. Placed at the very
        bottom of the page since it's a distinct, specialized lookup tool
        rather than part of the normal order-browsing flow. Only shows
        orders with an actual, real payment on record (a cash deposit, or
        a genuine Collection Verified event) — otherwise an order that's
        never even reached Collection Verified would show calcUpfront(o)'s
        EXPECTED Upfront 1 amount (always available from the order's own
        fields, regardless of verification status) next to an empty
        Upfront 2, which looks like a broken combined total rather than
        correctly showing nothing for a payment that hasn't happened yet. */}
    {isSophia&&<div style={{...card,marginTop:20}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Payment Breakdown</div>
      <div style={{padding:"14px 16px",borderBottom:paymentSearch&&paymentSearchResults.length>0?`1px solid ${C.border}`:"none"}}>
        <I placeholder="Search by amount, date, remark, customer, invoice…" value={paymentSearchInput} onChange={e=>setPaymentSearchInput(e.target.value)} style={{width:"100%"}}/>
      </div>
      {paymentSearch&&paymentSearchResults.length===0&&<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:13}}>No payment records match.</div>}
      {paymentSearch&&paymentSearchResults.length>0&&<div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{background:C.surface}}>
          <th style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Invoice No</th>
          <th style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Customer</th>
          <th style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Type</th>
          <th style={{padding:"7px 12px",textAlign:"right",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Deposit / Upfront 1</th>
          <th style={{padding:"7px 12px",textAlign:"right",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Date</th>
          <th style={{padding:"7px 12px",textAlign:"right",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Balance / Upfront 2</th>
          <th style={{padding:"7px 12px",textAlign:"right",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Date</th>
          <th style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase"}}>Remark</th>
        </tr></thead>
        <tbody>{paymentSearchResults.map((o,i)=>{
          const isCashOrder=o.orderType==="cash";
          // Upfront 1 = Agreement + Stamping + Deposit, computed straight
          // from the order itself (calcUpfront) — matches the app's own
          // proven Upfront 1 Knock Off report. Upfront 2 = monthlyInstallment
          // — falls back to the order's own field if the verification
          // snapshot's copy is missing, since monthlyInstallment is a
          // REQUIRED field at CCM order creation and should always be
          // reliably set there even if the snapshot wasn't. Dates use
          // upfrontPaymentDate — the date admin manually sets as the
          // actual payment date — not .date, the automatic timestamp of
          // when admin responded to that step.
          const amt1=isCashOrder?(parseFloat(o.deposit)||0):calcUpfront(o).total;
          const date1=isCashOrder?o.depositPaymentDate:o.lastVerification?.upfrontPaymentDate;
          const amt2=parseFloat(o.lastVerification?.monthlyInstallment||o.monthlyInstallment)||0;
          const date2=o.lastVerification?.upfrontPaymentDate;
          return<tr key={o.id} onClick={()=>openOrder(o)} style={{borderTop:i>0?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
            <td style={{padding:"7px 12px",fontWeight:700,color:C.text}}>{o.invoiceNo||"—"}</td>
            <td style={{padding:"7px 12px",color:C.textMid}}>{o.customerName||"—"}</td>
            <td style={{padding:"7px 12px"}}><MerchantBadge order={o}/></td>
            <td style={{padding:"7px 12px",textAlign:"right"}}>{amt1?fRM(amt1):"—"}</td>
            <td style={{padding:"7px 12px",textAlign:"right",color:C.textLight,fontSize:11}}>{date1?fDate(date1):"—"}</td>
            <td style={{padding:"7px 12px",textAlign:"right"}}>{amt2?fRM(amt2):"—"}</td>
            <td style={{padding:"7px 12px",textAlign:"right",color:C.textLight,fontSize:11}}>{date2?fDate(date2):"—"}</td>
            <td style={{padding:"7px 12px",color:C.textLight,fontSize:11}}>{o.lastVerification?.verificationRemark||"—"}</td>
          </tr>;
        })}</tbody>
      </table>
      </div>}
    </div>}
  </div>;
}
