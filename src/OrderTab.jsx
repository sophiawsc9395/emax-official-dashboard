import {useState,useEffect,useRef,useMemo,useCallback} from "react";
import {listOrders,getOrderHistory,getOrder,reconcile,deleteOrder as apiDeleteOrder,deleteOrders as apiDeleteOrders,uploadOrderFile,signOrderFiles} from "./storage/ordersApi.js";

const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];
const PAYMENT_METHODS=["RHB","Public Bank"];

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
  {step:2,label:"Ordered",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsOrderDate:true,needsRemark:true},
  {step:3,label:"Arrived HQ",desc:"Item received at HQ.",who:"admin",phase:"stock",needsFiles:[{key:"claimToPurchaser",label:"Claim Release to Purchaser File"}]},
  {step:4,label:"Dispatched to Branch",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsTransferNumbers:true},
  {step:5,label:"Arrived Branch",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",desc:"Submit billing request form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",desc:"Customer collects device and payment received.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Phone Collection Proof",multiple:true},{key:"paymentProof",label:"Payment Proof"},{key:"balancePaymentProof",label:"Additional Balance Payment Proof",optional:true}]},
  {step:9,label:"Collection Verified",desc:"HQ verifies collection and upfront payment.",who:"admin",phase:"billing",needsVerification:true},
  {step:10,label:"Agreement Submission by Branch",desc:"Branch completes agreement checklist.",who:"both",phase:"agreement_hq",needsChecklist:true},
  {step:11,label:"Agreement Received by HQ",desc:"HQ receives original signed agreement.",who:"admin",phase:"unclaimed",canReverse:true},
  {step:12,label:"Claim Submitted",desc:"Claim submitted to merchant.",who:"admin",phase:"claimed"},
  {step:13,label:"Claim Released",desc:"Claim released by merchant. Enter knock-off date and amount.",who:"admin",phase:"claimed"},
  {step:14,label:"Completed",desc:"Order completed and archived.",who:"admin",phase:"claimed"},
];
const CHECKLIST_ITEMS=["Aeon Application Form (3 pages)","Invoice","Result List","Notice 1 — Application (2 pages × 2 sets)","Notice 2 — Approval (8 pages)","Agreement (16 pages)","IC Copy","AutoDebit Form (Personal Account)","Bank Proof (Personal Account)"];
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

// Returns the "next" step number for a given order
function nextStepNum(order){
  const isCash=order.orderType==="cash";
  const isReady=order.stockStatus==="ready";
  const cur=order.step;
  if(isCash){
    const seq=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,14]; // 14=completed for cash
    const idx=seq.indexOf(cur);
    return idx>=0&&idx<seq.length-1?seq[idx+1]:null;
  }
  const seq=[1,...(isReady?[]:[2,3]),4,5,6,7,8,9,10,11,12,13];
  const idx=seq.indexOf(cur);
  return idx>=0&&idx<seq.length-1?seq[idx+1]:null;
}

// Max step for progress calculation
function maxStep(order){
  return order.orderType==="cash"?9:13;
}

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
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
function Timeline({order,isAdmin}){
  const cur=order.step;
  const isReady=order.stockStatus==="ready";
  const visSteps=getVisibleSteps(order);
  let lastPh=null;
  const renderEntry=(hist,s,isLatest)=><div style={{marginTop:4,background:C.surface,borderRadius:7,padding:"6px 10px",border:`1px solid ${C.border}`,fontSize:11,color:C.textMid}}>
    {hist.date&&<div style={{marginBottom:3,fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em"}}>{isLatest?"Latest — ":""}{fDT(hist.date,hist.time)}</div>}
    {hist.orderDate&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Order Date: {fDate(hist.orderDate)}{hist.supplierName?` · ${hist.supplierName}`:""}</div>}
    {hist.poNumber&&<div style={{marginBottom:2,color:C.textMid}}>PO Number: {hist.poNumber}</div>}
    {isAdmin&&hist.purchaserName&&<div style={{marginBottom:2,color:C.textMid}}>Purchaser: {hist.purchaserName}</div>}
    {hist.cancelledDate&&<div style={{marginBottom:2,color:"#DC2626",fontWeight:700}}>Supplier Cancelled — {fDate(hist.cancelledDate)}{hist.reversedTo?` · Returned to ${getStep(hist.reversedTo)?.label||"New Order Request"}`:""}</div>}
    {hist.remark&&<div style={{marginBottom:2,color:C.textMid}}>Remark: {hist.remark}</div>}
    {hist.invoiceNo&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Invoice: {hist.invoiceNo}</div>}
    {hist.consignmentNo&&<div style={{marginBottom:2,color:C.textMid}}>Consignment Note No.: {hist.consignmentNo}</div>}
    {hist.stockTransferNo&&<div style={{marginBottom:2,color:C.textMid}}>Stock Transfer No.: {hist.stockTransferNo}</div>}
    {hist.claimSentDate&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Claim Sent: {fDate(hist.claimSentDate)}</div>}
    {hist.knockOffDate&&<div style={{marginBottom:2,color:C.textMid,fontWeight:600}}>Knock-off: {fDate(hist.knockOffDate)}</div>}
    {hist.knockOffAmount&&<div style={{marginBottom:2,color:C.textMid,fontWeight:600}}>Knock-off Amount: {fRM(hist.knockOffAmount)}</div>}
    {hist.shortPayment&&<div style={{marginBottom:2,color:"#DC2626",fontWeight:700}}>Short Payment — Balance Payment Needed</div>}
    {hist.verificationRemark&&<div style={{marginBottom:2,color:C.textMid}}>Note: {hist.verificationRemark}</div>}
    {hist.upfrontPaymentDate&&<div style={{marginBottom:2,color:C.textMid}}>{order.orderType==="cash"?"Balance Payment Date":"Upfront Payment Date"}: {fDate(hist.upfrontPaymentDate)} · {hist.paymentMethod}</div>}
    {hist.paymentProofAmount&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Payment Proof Amount (Actual Receipt): {fRM(hist.paymentProofAmount)}</div>}
    {hist.secondPaymentDate&&<div style={{marginBottom:2,color:"#92400E",fontWeight:600}}>2nd {order.orderType==="cash"?"Balance":"Upfront"} Payment: {fDate(hist.secondPaymentDate)} · {hist.secondPayMethod} · {fRM(hist.secondPaymentAmount)}</div>}
    {hist.monthlyInstallment&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>{order.orderType==="cash"?`Balance Payment Amount: ${fRM(hist.monthlyInstallment)}`:`Upfront 2 (First Monthly Installment): ${fRM(hist.monthlyInstallment)}`}</div>}
    {hist.totalDue!==undefined&&<div style={{marginBottom:2,color:C.textMid}}>{order.orderType==="cash"?`Total Due: ${fRM(hist.totalDue)}`:`Upfront 1 (Subtotal): ${fRM(hist.totalDue)}`}</div>}
    {hist.totalUpfrontPayment!==undefined&&<div style={{marginBottom:2,color:C.navy,fontWeight:800}}>Total Upfront Payment: {fRM(hist.totalUpfrontPayment)}</div>}
    {hist.returnRemark&&<div style={{marginBottom:2,color:C.navy,fontWeight:600}}>Returned: {hist.returnRemark}</div>}
    {hist.billingData&&<div style={{marginTop:6}}><BillingDetailsCard billingData={hist.billingData} isCash={order.orderType==="cash"} title="Billing Request Details"/></div>}
    {s.step===8&&order.orderType!=="cash"&&!hist.shortPaymentProofUpload&&<div style={{marginTop:6,background:C.white,borderRadius:7,padding:"8px 10px",border:`1px solid ${C.border}`}}>
      <div style={{fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Upfront Payment Breakdown</div>
      {(()=>{const up=calcUpfront(order);const monthly=parseFloat(order.billingData?.monthlyInstallment)||0;return<>
        {[["Agreement Fee",up.a],["Stamping Fee",up.s],["Deposit",up.d]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.textMid}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>)}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:700}}><span>Upfront 1 (Subtotal)</span><span>{fRM(up.total)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 0",borderBottom:`1px solid ${C.border}`,color:C.navy,fontWeight:700}}><span>Upfront 2 (First Monthly Installment)</span><span>{fRM(monthly)}</span></div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0 0",borderTop:`2px solid ${C.navy}`,marginTop:4,color:C.navy,fontWeight:800}}><span>Total Upfront Payment Upon Collection</span><span>{fRM(up.total+monthly)}</span></div>
      </>;})()}
    </div>}
    {hist.issueItems?.length>0&&<div style={{marginBottom:2,color:C.textMid,fontSize:10}}>Issues: {hist.issueItems.join(" · ")}</div>}
    {hist.checklistItems&&<div style={{fontSize:10,color:C.textMid}}>{hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items</div>}
    {hist.agreementConsignmentNo&&<div style={{marginTop:2,color:C.navy,fontWeight:600,fontSize:11}}>Consignment Note No.: {hist.agreementConsignmentNo}</div>}
    {hist.collectionChecked!==undefined&&<div style={{fontSize:10,color:C.textMid}}>{order.orderType!=="cash"&&<>{hist.collectionChecked?"✓":"✗"} Phone Collection · </>}{hist.paymentChecked?"✓":"✗"} Payment verified</div>}
    {hist.files&&Object.entries(hist.files).filter(([k])=>isAdmin||k!=="claimToPurchaser").flatMap(([k,f])=>f?(Array.isArray(f)?f.map((ff,i)=>[k,ff]):[[k,f]]):[]).map(([k,f],i)=>f&&<a key={k+i} href={f.url||f.data} target={f.url?"_blank":undefined} rel={f.url?"noopener noreferrer":undefined} download={f.url?undefined:f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:C.blue,textDecoration:"none",background:"#EEF1F7",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} {FILE_LABELS[k]?`${FILE_LABELS[k]}: `:""}{f.name}</a>)}
    {s.step===1&&order.orderType==="cash"&&order.depositSlip&&<a href={order.depositSlip.url||order.depositSlip.data} target={order.depositSlip.url?"_blank":undefined} rel={order.depositSlip.url?"noopener noreferrer":undefined} download={order.depositSlip.url?undefined:order.depositSlip.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:C.blue,textDecoration:"none",background:"#EEF1F7",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} Deposit Payment Slip — {order.depositSlip.name}</a>}
  </div>;
  return<div>{visSteps.map((s,i)=>{
    const isAutoReady=isReady&&s.step===2;
    const done=cur>s.step||isAutoReady;
    const active=cur===s.step&&!isAutoReady;
    const histEntries=(order.history||[]).filter(h=>h.step===s.step);
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
          {histEntries.map((hist,hi)=><div key={hi}>{renderEntry(hist,s,hi===histEntries.length-1&&histEntries.length>1)}</div>)}
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
  const missing=REQUIRED.filter(k=>!f[k]?.toString().trim());
  const submit=async()=>{if(missing.length)return;setSaving(true);const data={...f};for(const[k,file] of Object.entries(fls))if(file)data[k]=await readFile(file,order.id);onSubmit(data);setSaving(false);};
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
        <span style={{fontSize:12,fontWeight:item.checked?600:400,color:item.issue&&!item.checked?"#DC2626":item.checked?"#15803D":C.textMid}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:10,marginLeft:7,fontWeight:700,color:"#DC2626"}}> ⚠ Flagged</span>}</span>
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
function downloadReport(orders,type,dateFilter,merchantFilter){
  const isClaim=type==="claim";
  const isKnockoff=type==="knockoff";
  const isCompleted=type==="completed";
  const isAgreementReceived=type==="agreementReceived";
  orders=merchantFilter&&merchantFilter!=="all"?orders.filter(o=>o.merchant===merchantFilter):orders;
  const filtered=orders.filter(o=>{
    if(isAgreementReceived){const d=o.stepDates?.["11"]?.date;return o.step===11&&(!dateFilter||d===dateFilter);}
    if(isCompleted){const d=o.stepDates?.["14"]?.date;return o.step===14&&(!dateFilter||d===dateFilter);}
    if(isKnockoff) return o.knockOffDate&&(!dateFilter||o.knockOffDate===dateFilter);
    if(isClaim) return o.claimSentDate&&(!dateFilter||o.claimSentDate===dateFilter)&&o.step>=12;
    const h=o.lastVerification;
    return h&&h.upfrontPaymentDate&&(!dateFilter||h.upfrontPaymentDate===dateFilter);
  }).sort((a,b)=>(a.invoiceNo||"").localeCompare(b.invoiceNo||""));
  if(!filtered.length){alert(`No records found${dateFilter?` for ${fDate(dateFilter)}`:""}.`);return;}
  const dateStr=dateFilter?fDate(dateFilter):"All Dates";
  let rows="",total1=0,total2=0,total3=0;
  if(isAgreementReceived){
    rows=filtered.map((o,i)=>{const due=calcAmountDueByMerchant(o);total1+=due;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${o.merchant||"—"}</td><td>RM ${due.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="7"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isCompleted){
    rows=filtered.map((o,i)=>{const ka=parseFloat(o.knockOffAmount)||0;const h=o.stepDates?.["14"];total1+=ka;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${o.merchant||"—"}</td><td>${fDate(o.claimSentDate)}</td><td>${fDate(o.knockOffDate)}</td><td>RM ${ka.toFixed(2)}</td><td>${fDT(h?.date,h?.time)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="9"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td></td></tr>`;
  } else if(isKnockoff){
    rows=filtered.map((o,i)=>{const ka=parseFloat(o.knockOffAmount)||0;total1+=ka;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${o.merchant||"—"}</td><td>${fDate(o.knockOffDate)}</td><td>RM ${ka.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="8"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else if(isClaim){
    rows=filtered.map((o,i)=>{const due=calcAmountDueByMerchant(o);total1+=due;return`<tr><td>${i+1}</td><td>${fDate(o.claimSentDate)}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${o.merchant||"—"}</td><td>RM ${due.toFixed(2)}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="8"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td></tr>`;
  } else {
    rows=filtered.map((o,i)=>{const h=o.lastVerification;const up=calcUpfront(o);const monthly=parseFloat(o.billingData?.monthlyInstallment||o.monthlyInstallment)||0;const actualReceipt=(parseFloat(h?.paymentProofAmount)||0)+(parseFloat(h?.secondPaymentAmount)||0);total1+=up.total;total2+=monthly;total3+=actualReceipt;return`<tr><td>${i+1}</td><td><b>${o.invoiceNo||"—"}</b></td><td>${shortId(o.id)}</td><td>${o.customerName}</td><td>${o.branch}</td><td>${o.phoneModel}</td><td>${fDate(h?.upfrontPaymentDate)}</td><td>RM ${up.total.toFixed(2)}</td><td>RM ${monthly.toFixed(2)}</td><td>RM ${(up.total+monthly).toFixed(2)}</td><td>RM ${actualReceipt.toFixed(2)}</td><td>${h?.paymentMethod||"—"}</td><td>${h?.verificationRemark||"—"}</td></tr>`;}).join("");
    rows+=`<tr class="tot"><td colspan="7"><b>TOTAL (${filtered.length})</b></td><td><b>RM ${total1.toFixed(2)}</b></td><td><b>RM ${total2.toFixed(2)}</b></td><td><b>RM ${(total1+total2).toFixed(2)}</b></td><td><b>RM ${total3.toFixed(2)}</b></td><td colspan="2"></td></tr>`;
  }
  const title=isAgreementReceived?"Agreement Received by HQ Report":isCompleted?"Completed Orders Report":isKnockoff?"Claim Released - Knock Off Report":isClaim?"Claim Submitted Report":"Upfront Payment Report";
  const heads=isAgreementReceived?"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Merchant</th><th>Amount Due by Merchant</th>":isCompleted?"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Merchant</th><th>Claim Sent Date</th><th>Knock-off Date</th><th>Knock-off Amount</th><th>Completed On</th>":isKnockoff?"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Merchant</th><th>Knock-off Date</th><th>Knock-off Amount</th>":isClaim?"<th>#</th><th>Date</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Merchant</th><th>Amount Due by Merchant</th>":"<th>#</th><th>Invoice No</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Payment Date</th><th>Upfront 1 (Agreement+Stamping+Deposit)</th><th>Upfront 2 (1st Monthly Installment)</th><th>Total Upfront Payment Upon Collection</th><th>Actual Receipt Amount</th><th>Method</th><th>Remark</th>";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — ${dateStr}</title><style>body{font-family:Inter,sans-serif;margin:28px;color:#0A1628}h1{font-size:17px;font-weight:800;margin-bottom:2px}h2{font-size:12px;color:#8A96A8;margin:0 0 20px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#0A1628;color:#fff;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em}td{padding:7px 10px;border-bottom:1px solid #E4EAF2}tr:nth-child(even) td{background:#F7F9FC}.tot td{background:#0A1628;color:#fff;font-size:12px}.footer{margin-top:16px;font-size:10px;color:#8A96A8}</style></head><body><h1>${title}</h1><h2>${dateStr} · ${filtered.length} record${filtered.length!==1?"s":""}</h2><table><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated ${new Date().toLocaleString("en-MY")} · EMAX Network Sdn Bhd</div></body></html>`;
  const w=window.open("","_blank");if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
}

/* ── Action Panel ─────────────────────────────────────────────────────── */
function BillingDetailsCard({billingData:bd,isCash,title="Billing Request Details (as submitted)"}){
  if(!bd)return null;
  const rows=[["Billing Date",fDate(bd.billingDate)],["Customer Name",bd.customerFullName],["Customer IC",bd.customerIC],["HP Number",bd.customerHP],["Item Code",bd.itemCode],["IMEI / Serial No.",bd.imeiSerial],bd.agreementNumber&&["Agreement Number",bd.agreementNumber],!isCash&&["Cash Price on Listing",fRM(bd.cashPriceOnListing)],!isCash&&["Monthly Installment",fRM(bd.monthlyInstallment)],bd.agreementFee&&["Agreement Fee",fRM(bd.agreementFee)],bd.stampingFee&&["Stamping Fee",fRM(bd.stampingFee)],bd.deposit&&["Deposit",fRM(bd.deposit)]].filter(Boolean);
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

function ActionPanel({order,isAdmin,onUpdate,allOrders}){
  const step=order.step;
  const isCash=order.orderType==="cash";
  const nextStepN=nextStepNum(order);
  const nextDef=nextStepN?getStep(nextStepN):null;
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
  const [upfrontMonthly,setUpfrontMonthly]=useState(order.billingData?.monthlyInstallment||order.monthlyInstallment||"");
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
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(n=>({name:n,issue:false})));
  const [showShortPayment,setShowShortPayment]=useState(false);
  const [shortPayRemark,setShortPayRemark]=useState("");
  const upfront=calcUpfront(order);

  if(step===4&&!order.consignmentNo&&!order.stockTransferNo){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.truck}>Dispatched to Branch</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{background:"#F0FDF4",borderRadius:8,padding:"10px 12px",border:"1px solid #BBF7D0",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#15803D",fontWeight:600}}>{Ic.checkCircle} Ready stock order — fill in the Consignment Note No. and Stock Transfer No. for this dispatch.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><L req>Consignment Note Number</L><I value={consignmentNo} onChange={e=>setConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!consignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
            <div><L req>Stock Transfer Number</L><I value={stockTransferNo} onChange={e=>setStockTransferNo(e.target.value)} placeholder="Stock transfer no…" style={!stockTransferNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          </div>
          <PBtn onClick={async()=>{if(!consignmentNo.trim()||!stockTransferNo.trim()){alert("Please fill in both numbers.");return;}setSaving(true);const h={step:4,date:nowDate(),time:nowTime(),note:"Dispatch details recorded",consignmentNo,stockTransferNo};await onUpdate({...order,consignmentNo,stockTransferNo,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||!consignmentNo.trim()||!stockTransferNo.trim()} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Save Dispatch Details"}</PBtn>
        </div>
      </div>
    </div>;
  }

  if(step===12&&!isCash){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.checkCircle}>Claim Submitted</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{background:"#F0FDF4",borderRadius:8,padding:"10px 12px",border:"1px solid #BBF7D0",marginBottom:14,display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#15803D",fontWeight:600}}>{Ic.checkCircle} Record the claim sent date and consignment note number to proceed to Claim Released.</div>
          <div style={{marginBottom:10}}><L req>Claim Sent Out to Merchant Date</L><I type="date" value={claimSentDate} onChange={e=>setClaimSentDate(e.target.value)}/></div>
          <div style={{marginBottom:12}}><L req>Consignment Note No.</L><I value={claimConsignmentNo} onChange={e=>setClaimConsignmentNo(e.target.value)} placeholder="Consignment note no…" style={!claimConsignmentNo.trim()?{borderColor:"#FECACA"}:{}}/></div>
          <PBtn onClick={async()=>{setSaving(true);const h={step:12,date:nowDate(),time:nowTime(),note:"Claim submitted to merchant",claimSentDate,consignmentNo:claimConsignmentNo};await onUpdate({...order,step:13,claimSentDate,claimConsignmentNo,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||!claimSentDate||!claimConsignmentNo.trim()} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Confirm Claim Submitted"} {!saving&&Ic.chevR}</PBtn>
        </div>
      </div>
    </div>;
  }
  if(step===13&&!isCash){
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={card}>
        <SecHdr icon={Ic.checkCircle}>Claim Released</SecHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{fontSize:12,marginBottom:10}}><span style={{color:C.textLight,fontWeight:600}}>Claim Sent: </span>{fDate(order.claimSentDate)}</div>
          {order.knockOffDate?<div style={{fontSize:12,marginBottom:8}}><span style={{color:C.textLight,fontWeight:600}}>Knock-off Date: </span>{fDate(order.knockOffDate)}</div>:<div style={{marginBottom:10}}><L req>Knock-off Date</L><I type="date" value={knockOffDate} onChange={e=>setKnockOffDate(e.target.value)}/></div>}
          {order.knockOffAmount?<div style={{fontSize:12,marginBottom:12}}><span style={{color:C.textLight,fontWeight:600}}>Knock-off Amount: </span>{fRM(order.knockOffAmount)}</div>:<div style={{marginBottom:12}}><L>Knock-off Amount (RM)</L><I type="number" value={knockOffAmount} onChange={e=>setKnockOffAmount(e.target.value)}/></div>}
          {!order.knockOffDate&&<PBtn onClick={async()=>{setSaving(true);const h={step:13,date:nowDate(),time:nowTime(),note:"Knock-off recorded",knockOffDate,knockOffAmount:knockOffAmount||undefined};await onUpdate({...order,knockOffDate,knockOffAmount:knockOffAmount||undefined,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||!knockOffDate} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Save Knock-off"}</PBtn>}
          {order.knockOffDate&&isAdmin&&<><Divider/><DBtn onClick={async()=>{if(!confirm("Move to Completed?"))return;setSaving(true);const h={step:14,date:nowDate(),time:nowTime(),note:"Completed and archived"};await onUpdate({...order,step:14,history:[...(order.history||[]),h]});setSaving(false);}} style={{width:"100%",justifyContent:"center"}}>{Ic.trash} Mark as Completed</DBtn></>}
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
    if(showChecklist)return<ChecklistForm issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async(items,consignmentNo)=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items,agreementConsignmentNo:consignmentNo};await onUpdate({...order,step:10,checklistItems:items,agreementConsignmentNo:consignmentNo,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<div style={{display:"flex",flexDirection:"column",gap:12}}>
      {pending&&<div style={{...card}}>
        <SecHdr icon={Ic.alertCircle}><span style={{color:"#DC2626"}}>Rejected by HQ</span></SecHdr>
        <div style={{padding:"14px 16px"}}>
          {lastReturn.returnRemark&&<div style={{marginBottom:10,fontSize:12,color:"#78350F",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 12px"}}><b>Remark:</b> {lastReturn.returnRemark}</div>}
          {lastChecklist&&<div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {lastChecklist.checklistItems.map((item,i)=>{const failed=lastReturn.issueItems?.includes(item.name);return<span key={i} style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:failed?"#FEF2F2":"#F0FDF4",color:failed?"#DC2626":"#15803D",fontWeight:600,border:`1px solid ${failed?"#FECACA":"#BBF7D0"}`}}>{failed?"✗":"✓"} {item.name}{failed?" ⚠ Flagged":""}</span>;})}
          </div>}
        </div>
      </div>}
      <ActionBox icon={Ic.clipboard} title="Agreement Checklist" desc="Complete checklist before sending to HQ."><PBtn onClick={()=>setShowChecklist(true)} style={{width:"100%",justifyContent:"center"}}>Open Checklist {Ic.chevR}</PBtn></ActionBox>
    </div>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};for(const[k,f] of Object.entries(files)){if(!f)continue;rf[k]=Array.isArray(f)?await Promise.all(f.map(x=>readFile(x,order.id))):await readFile(f,order.id);}
    const totalBytes=Object.values(rf).reduce((sum,fl)=>sum+(Array.isArray(fl)?fl.reduce((s2,x)=>s2+(x?.data?.length||0),0):(fl?.data?.length||0)),0);
    if(totalBytes>4*1024*1024){
      alert("One or more of these files is too large to save (even after compression). Please use a smaller file — for PDFs, try re-exporting or scanning at a lower resolution — then try again.");
      setSaving(false);
      return;
    }
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,orderDate:nextDef.needsOrderDate?orderDate:undefined,supplierName:nextDef.needsOrderDate&&supplierName?supplierName:undefined,poNumber:nextDef.needsOrderDate&&poNumber?poNumber:undefined,purchaserName:nextDef.needsOrderDate&&purchaserName?purchaserName:undefined,consignmentNo:nextDef.needsTransferNumbers?consignmentNo:undefined,stockTransferNo:nextDef.needsTransferNumbers?stockTransferNo:undefined,files:Object.keys(rf).length?rf:undefined,...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment,verificationRemark:verRemark||undefined,upfrontPaymentDate:upfrontDate,monthlyInstallment:upfrontMonthly,paymentProofAmount:!isCash?paymentProofAmount:undefined,totalDue:isCash?calcCashDue(order):upfront.total,totalUpfrontPayment:isCash?undefined:upfront.total+(parseFloat(upfrontMonthly)||0),paymentMethod:payMethod,...(isShortPaymentPending(order)?{secondPaymentDate,secondPayMethod,secondPaymentAmount}:{})}:{})};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(isCash&&nextDef.step===14){updated.step=14;}
    if(nextDef.needsOrderDate){updated.orderDate=orderDate;if(supplierName)updated.supplierName=supplierName;if(poNumber)updated.poNumber=poNumber;if(purchaserName)updated.purchaserName=purchaserName;}
    if(nextDef.needsTransferNumbers){updated.consignmentNo=consignmentNo;updated.stockTransferNo=stockTransferNo;}
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    const ok=await onUpdate(updated);setSaving(false);if(ok!==false){setRemark("");setInvoiceNo("");setFiles({});setVerRemark("");setCollection(false);setPayment(false);setPoNumber("");setPurchaserName("");setConsignmentNo("");setStockTransferNo("");}
  };
  const ok=()=>{
    if(!branchOk)return false;
    if(nextDef.needsOrderDate&&isAdmin&&(!orderDate||!supplierName.trim()||!poNumber.trim()||!purchaserName.trim()))return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsTransferNumbers&&branchOk&&(!consignmentNo.trim()||!stockTransferNo.trim()))return false;
    if(nextDef.needsVerification&&!isAdmin)return false;
    if(nextDef.needsVerification&&isAdmin){
      if(!isCash&&!paymentProofAmount.toString().trim())return false;
      if(isCash&&!upfrontMonthly.toString().trim())return false;
      if(isShortPaymentPending(order)&&(!secondPaymentDate||!secondPaymentAmount.toString().trim()))return false;
    }
    if(nextDef.needsFiles){const priorFiles=new Set((order.history||[]).filter(h=>h.step===nextDef.step).flatMap(h=>Object.keys(h.files||{})));const req=(nextDef.needsFiles||[]).filter(f=>!f.optional&&!(isCash&&f.key==="collectionProof")&&!priorFiles.has(f.key));if(branchOk&&req.some(f=>f.multiple?!(files[f.key]?.length):!files[f.key]))return false;}
    return true;
  };

  return<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <ActionBox icon={Ic.chevR} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
      {!branchOk?<div style={{fontSize:12,color:C.textLight,fontStyle:"italic",padding:"2px 0"}}>Waiting for admin to process this step.</div>:<>
        {nextDef.needsOrderDate&&isAdmin&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><L req>Order Date</L><I type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></div>
          <div><L req>Supplier Name</L><I value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier name…" style={!supplierName.trim()?{borderColor:"#FECACA"}:{}}/></div>
          <div><L req>PO Number</L><I value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="PO number…" style={!poNumber.trim()?{borderColor:"#FECACA"}:{}}/></div>
          {isAdmin&&<div><L req>Purchaser Name</L><I value={purchaserName} onChange={e=>setPurchaserName(e.target.value)} placeholder="Purchaser name…" style={!purchaserName.trim()?{borderColor:"#FECACA"}:{}}/></div>}
        </div>}
        {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}><L>Remark / ETA / Order Details (optional)</L><TX value={remark} onChange={e=>setRemark(e.target.value)} rows={5} placeholder="ETA, order reference, notes…" style={{borderRadius:12,resize:"none",width:"100%",boxSizing:"border-box"}}/></div>}
        {nextDef.needsInvoiceNo&&isAdmin&&<>
          <div style={{marginBottom:12}}><L req>Sales Invoice Number</L><I value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
        </>}
        {step===8&&isShortPaymentPending(order)&&<div style={{marginBottom:12}}>
          <div style={{...lbl,marginBottom:8}}>Balance Payment Proof (Short Payment Correction)</div>
          <L req>Upload Balance Payment Proof</L>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,balancePaymentProof:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
          {files.balancePaymentProof&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {files.balancePaymentProof.name}</div>}
          <PBtn onClick={async()=>{if(!files.balancePaymentProof)return;setSaving(true);const f=await readFile(files.balancePaymentProof,order.id);const h={step:9,date:nowDate(),time:nowTime(),note:"Balance payment proof uploaded",shortPaymentProofUpload:true,files:{balancePaymentProof:f}};await onUpdate({...order,history:[...(order.history||[]),h]});setSaving(false);setFiles(p=>({...p,balancePaymentProof:null}));}} disabled={!files.balancePaymentProof||saving} style={{width:"100%",justifyContent:"center",marginTop:8}}>{saving?"Saving…":"Submit Balance Payment Proof"}</PBtn>
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
        {nextDef.step===8&&isAdmin&&!isCash&&<div style={{background:C.surface,borderRadius:9,padding:"12px 14px",border:`1px solid ${C.border}`,marginBottom:12}}>
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
        {nextDef.needsFiles&&branchOk&&nextDef.needsFiles.filter(f=>!(isCash&&f.key==="collectionProof")).map(({key,label,optional,multiple})=>{
          const alreadyOnFile=!optional&&(order.history||[]).some(h=>h.step===nextDef.step&&h.files&&h.files[key]);
          return<div key={key} style={{marginBottom:12}}>
          <L req={!optional&&!alreadyOnFile}>{label}{optional?" (optional)":alreadyOnFile?" (already on file — re-upload only if there's a new one)":""}{multiple?" (multiple allowed)":""}</L>
          <input type="file" multiple={!!multiple} accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:multiple?[...(p[key]||[]),...Array.from(e.target.files)]:(e.target.files[0]||null)}))} style={{fontSize:11,width:"100%"}}/>
          {multiple?(files[key]||[]).length>0&&<div style={{marginTop:4,display:"flex",flexDirection:"column",gap:3}}>
            {files[key].map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:10,color:"#15803D",fontWeight:600,background:"#F0FDF4",padding:"3px 8px",borderRadius:5}}><span>✓ {f.name}</span><button type="button" onClick={()=>setFiles(p=>({...p,[key]:p[key].filter((_,j)=>j!==i)}))} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:12,fontWeight:700,padding:0}}>✕</button></div>)}
          </div>:files[key]&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {files[key].name}</div>}
        </div>;})}
        {!nextDef.needsOrderDate&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&!nextDef.needsBillingForm&&<div style={{marginBottom:12}}><L>Remark (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
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
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin,allOrders,isReadOnly}){
  const s=getStep(order.step),ph=getPhase(order.step),isCash=order.orderType==="cash";
  return<div className="fade-in">
    {/* Top bar */}
    <div className="detail-topbar">
      <div className="detail-topbar-back"><GBtn onClick={onBack}>{Ic.chevL} Back</GBtn></div>
      <div className="detail-topbar-title">
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:14,fontWeight:800,color:C.navy}}>{order.phoneModel}</span>
          <StepBadge order={order}/>
          {order.stockStatus==="ready"&&<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>Ready Stock</span>}
          {isCash?<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>Cash</span>:<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,padding:"2px 8px",borderRadius:4,border:`1px solid ${C.border}`}}>CCM</span>}
        </div>
        <div style={{fontSize:11,color:C.textLight,marginTop:3}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
      </div>
      {isAdmin&&!isReadOnly&&<div className="detail-topbar-actions" style={{display:"flex",gap:6}}><GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn><DBtn onClick={onDelete}>{Ic.trash} Delete</DBtn></div>}
    </div>

    {order.cancelled&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,color:"#DC2626"}}>{Ic.alertCircle}<div><div style={{fontWeight:700,fontSize:13}}>This order has been cancelled</div>{order.cancelledReason&&<div style={{fontSize:11,color:"#B91C1C",marginTop:2}}>{order.cancelledReason}</div>}</div></div>
      {isAdmin&&!isReadOnly&&<GBtn onClick={()=>onUpdate({...order,cancelled:false,history:[...(order.history||[]),{step:order.step,date:nowDate(),time:nowTime(),note:"Reactivated"}]})}>Reactivate</GBtn>}
    </div>}

    {/* Phase progress card */}
    <div style={{...card,padding:"16px 20px",marginBottom:14}}>
      <PhaseBar step={order.step} order={order}/>
    </div>

    {/* Order info summary */}
    <div className="order-info-card" style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.fileText}>Order Information</SecHdr>
      <div className="order-info-grid" style={{padding:"6px 16px 10px"}}>
        {[["Customer Name",order.customerName],order.customerIC&&["Customer IC",order.customerIC],["Device Name",order.phoneModel],order.customerHP&&["Customer HP",order.customerHP],!isCash&&["Merchant",order.merchant],!isCash&&["Agreement No.",order.agreementNumber],!isCash&&["Approval Date",fDate(order.aeonApprovalDate)],!isCash&&["Finance Price",fRM(order.financePrice)],!isCash&&["Agreement Fee",fRM(order.agreementFee)],!isCash&&["Stamping Fee",fRM(order.stampingFee)],["Deposit",fRM(order.deposit)],!isCash&&order.monthlyInstallment&&["Monthly Installment",fRM(order.monthlyInstallment)],isCash&&["Retail Price",fRM(order.retailPrice)],order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate)],order.invoiceNo&&["Invoice No.",order.invoiceNo],order.orderDate&&["Order Date",fDate(order.orderDate)],order.supplierName&&["Supplier",isAdmin?order.supplierName:"—"],order.poNumber&&["PO Number",order.poNumber],order.purchaserName&&["Purchaser Name",isAdmin?order.purchaserName:"—"],order.consignmentNo&&["Consignment Note No.",order.consignmentNo],order.stockTransferNo&&["Stock Transfer No.",order.stockTransferNo],order.claimSentDate&&["Claim Sent",fDate(order.claimSentDate)],order.knockOffDate&&["Knock-off",fDate(order.knockOffDate)],order.knockOffAmount&&["Knock-off Amount",fRM(order.knockOffAmount)]].filter(Boolean).map(([l,v])=><div key={l} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>{l}</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{v||"—"}</div>
        </div>)}
        {order.customerEmail&&<div className="oi-full" style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Customer Email</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.customerEmail}</div>
        </div>}
        {order.customerAddress&&<div className="oi-full" style={{padding:"7px 0",minWidth:0}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Address{(order.customerPostCode||order.customerCity)?` (${[order.customerPostCode,order.customerCity].filter(Boolean).join(", ")})`:""}</div>
          <div className="oi-value" style={{fontSize:12,color:C.text,fontWeight:600}}>{order.customerAddress}</div>
        </div>}
      </div>
      {order.adminRemark&&<div style={{padding:"8px 16px",borderTop:`1px solid ${C.border}`,background:"#FFFBEB"}}><div style={{fontSize:10,color:"#92400E",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Admin Remark</div><div style={{fontSize:12,color:"#78350F"}}>{order.adminRemark}</div></div>}
    </div>



    {/* Two-col: timeline | action */}
    <div className="detail-grid">
      <div style={card}>
        <SecHdr icon={Ic.calendar}>Tracking Timeline</SecHdr>
        <div style={{padding:"14px 16px"}}><Timeline order={order} isAdmin={isAdmin}/></div>
      </div>
      <div>
        {order.cancelled?<div style={{...card,padding:"16px"}}>
          <div style={{fontSize:12,color:"#DC2626",fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>Order cancelled — no further action available.</div>
        </div>:isReadOnly?<div style={{...card,padding:"16px"}}>
          <div style={{fontSize:12,color:C.textLight,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>View only — actions disabled for this viewer.</div>
        </div>:<ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate} allOrders={allOrders}/>}
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

function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch,srList}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",customerIC:"",customerEmail:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",monthlyInstallment:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositSlip:null};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCash=f.orderType==="cash",isReady=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const REQUIRED=["phoneModel","customerName","salesAgentId","customerIC","customerEmail","customerHP","customerAddress","customerPostCode","customerCity",...(isCash?["retailPrice","deposit","depositPaymentDate"]:["merchant","agreementNumber","aeonApprovalDate","financePrice","stampingFee","agreementFee","deposit","monthlyInstallment"])];
  const missing=REQUIRED.filter(k=>!f[k]?.toString().trim());
  const missingSlip=isCash&&!slipFile&&!f.depositSlip;
  const submit=async()=>{
    if(missing.length||missingSlip){alert("Please fill in all required fields.");return;}
    const id=order?.id||Date.now().toString();
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile,id);
    const initStep=isReady?3:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    onSave({...f,depositSlip,id,step:order?.step||initStep,history:order?.history||initHist});
  };
  // row() helper — uses module-level FormField (no focus loss)
  const row=(k,l,t="text",req=false)=>(<FormField key={k} label={l} req={req}><I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&missing.includes(k)?{borderColor:"#FECACA"}:{}}/></FormField>);
  return<div className="fade-in">
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
      <GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn>
      <div style={{fontSize:15,fontWeight:800,color:C.navy}}>{order?"Edit Order":"New Order Request"}</div>
    </div>
    <FormCard title="Order Type">
      <div>
        <L req>Stock Status</L>
        <div style={{display:"flex",gap:8}}>
          {[["stock_request","Stock Request"],["ready","Ready Stock"]].map(([v,l])=><button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"12px 8px",borderRadius:10,border:`2px solid ${f.stockStatus===v?C.navy:C.border}`,background:f.stockStatus===v?C.navy:C.white,color:f.stockStatus===v?"#fff":C.textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
        {isReady&&<div style={{fontSize:10,color:"#15803D",marginTop:5,fontWeight:600}}>Will skip to Step 3 — Arrived HQ</div>}
      </div>
      <div>
        <L req>Order Type</L>
        <div style={{display:"flex",gap:8}}>
          {[["ccm","CCM Order"],["cash","Cash Order"]].map(([v,l])=><button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"12px 8px",borderRadius:10,border:`2px solid ${f.orderType===v?C.navy:C.border}`,background:f.orderType===v?C.navy:C.white,color:f.orderType===v?"#fff":C.textMid,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{l}</button>)}
        </div>
      </div>
    </FormCard>
    <FormCard title="Basic Information">
      {row("phoneModel","Phone Model / Item","text",true)}
      {row("customerName","Customer Name","text",true)}
      <div><L req>Branch</L><SEL value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</SEL></div>
      <div><L req>Sales Agent</L>{branchSRs.length>0?<SEL value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}} style={missing.includes("salesAgentId")?{borderColor:"#FECACA"}:{}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</SEL>:<I value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID" style={missing.includes("salesAgentId")?{borderColor:"#FECACA"}:{}}/>}</div>
    </FormCard>
    <FormCard title="Customer Details">
      {row("customerIC","Customer IC","text",true)}
      {row("customerEmail","Customer Email Address","email",true)}
      {row("customerHP","Customer HP No.","text",true)}
      {row("customerAddress","Address","text",true)}
      {row("customerPostCode","Postcode","text",true)}
      {row("customerCity","City","text",true)}
    </FormCard>
    {!isCash&&<FormCard title="CCM / Financing Details">
      <div><L req>Merchant</L><SEL value={f.merchant} onChange={e=>set("merchant",e.target.value)}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
      {row("agreementNumber","Agreement No.","text",true)}
      {row("aeonApprovalDate","Aeon Approval Date","date",true)}
      {row("financePrice","Finance Price (RM)","number",true)}
      {row("stampingFee","Stamping Fee (RM)","number",true)}
      {row("agreementFee","Agreement Fee (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      {row("monthlyInstallment","Monthly Installment (RM)","number",true)}
    </FormCard>}
    {isCash&&<FormCard title="Cash Order Details">
      {row("retailPrice","Retail Price (RM)","number",true)}
      {row("deposit","Deposit (RM)","number",true)}
      {row("depositPaymentDate","Deposit Payment Date","date",true)}
      <div><L req>Deposit Payment Slip</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}{!slipFile&&!f.depositSlip&&<div style={{fontSize:10,color:"#DC2626",marginTop:3}}>Required</div>}</div>
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
function getOrderAlerts(orders,userBranch=null){
  const myOrders=orders.filter(o=>o.step<14&&(!userBranch||o.branch===userBranch));
  const alerts=[];
  myOrders.filter(o=>o.step===2&&o.orderDate).forEach(o=>{
    const days=daysSince(o.orderDate);
    if(days>=7)alerts.push({type:"overdue_order",orderId:o.id,phoneModel:o.phoneModel,customerName:o.customerName,branch:o.branch,days,msg:`Ordered ${days} days ago — not yet arrived at HQ`});
  });
  myOrders.filter(o=>o.aeonApprovalDate&&o.step>=1&&o.step<=13).forEach(o=>{
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
  const Block=({items,color,title})=>items.length>0&&<div style={{...card,borderLeft:`3px solid ${color}`,padding:"12px 14px",marginBottom:10}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
      <span style={{color,flexShrink:0}}>{Ic.alertCircle}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>{title}</span>
      <span style={{fontSize:10,fontWeight:700,color,background:color+"15",padding:"1px 8px",borderRadius:20}}>{items.length}</span>
    </div>
    {items.map((a,i)=><div key={i} onClick={()=>onClickOrder&&onClickOrder(a.orderId)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 4px",borderTop:i>0?`1px solid ${C.border}`:"none",cursor:onClickOrder?"pointer":"default"}}>
      <div style={{minWidth:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}><span style={{fontSize:12,fontWeight:700,color:C.text}}>{a.phoneModel}</span><span style={{fontSize:11,color:C.textLight,marginLeft:8}}>{a.customerName} · {a.branch}</span></div>
      <span style={{fontSize:11,color,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{a.msg}</span>
    </div>)}
  </div>;
  return<div style={{marginBottom:18}}>
    <Block items={expired} color="#DC2626" title="Approval Expired"/>
    <Block items={urgent} color="#B91C1C" title="Urgent Attention"/>
    <Block items={warning} color="#B45309" title="Approval Warning"/>
  </div>;
}

/* ── Batch Archive ────────────────────────────────────────────────────── */
function BatchArchive({orders,onDelete,onClose}){
  const completed=orders.filter(o=>o.step===14);
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
        <DBtn onClick={async()=>{if(!sel.size)return;if(!confirm(`Remove ${sel.size} completed order(s) permanently?`))return;await onDelete([...sel]);onClose();}} disabled={!sel.size}>{Ic.trash} Remove {sel.size>0?`(${sel.size})`:""}</DBtn>
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
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>✕</button>
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
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:C.textLight}}>{shortId(o.id)}</div></div>
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
function BulkClaimSent({orders,onSave,onClose}){
  const pending=orders.filter(o=>o.step===12);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [search,setSearch]=useState("");
  const [consignmentNos,setConsignmentNos]=useState({});
  const list=pending.filter(o=>!search||(o.invoiceNo||"").toLowerCase().includes(search.toLowerCase()));
  const selectedList=pending.filter(o=>sel.has(o.id));
  const allNotesFilled=selectedList.length>0&&selectedList.every(o=>(consignmentNos[o.id]||"").trim());
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.checkCircle} Set Claim Sent Date (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {pending.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No orders awaiting claim.</div>:<>
          <div style={{marginBottom:10}}><I placeholder="Search by invoice number…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{list.length} shown</div>
            <button onClick={()=>setSel(sel.size===list.length?new Set():new Set(list.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===list.length&&list.length>0?"Deselect All":"Select All Shown"}</button>
          </div>
          <div style={{marginBottom:12}}><L req>Claim Sent Out to Merchant Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          {list.map(o=><div key={o.id} style={{padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7}}>
            <div onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:sel.has(o.id)?8:0}}>
              <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>Invoice: {o.invoiceNo||"—"}</div><div style={{fontSize:10,color:C.textLight}}>{o.phoneModel} · {o.customerName} · {shortId(o.id)} · {o.branch}</div></div>
            </div>
            {sel.has(o.id)&&<div onClick={e=>e.stopPropagation()}><L req>Consignment Note No.</L><I value={consignmentNos[o.id]||""} onChange={e=>setConsignmentNos(p=>({...p,[o.id]:e.target.value}))} placeholder="Consignment note no…" style={!(consignmentNos[o.id]||"").trim()?{borderColor:"#FECACA"}:{}}/></div>}
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!allNotesFilled&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the consignment note number for every selected order.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!sel.size||!date||!allNotesFilled)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,step:13,claimSentDate:date,claimConsignmentNo:consignmentNos[o.id],history:[{step:12,date:nowDate(),time:nowTime(),note:"Claim sent out to merchant (bulk)",claimSentDate:date,consignmentNo:consignmentNos[o.id]}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!sel.size||!date||!allNotesFilled}>{Ic.checkCircle} Set Claim Sent ({sel.size})</PBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Bulk Knock-off ────────────────────────────────────────────────────── */
function BulkKnockOff({orders,onSave,onClose}){
  const released=orders.filter(o=>o.step===13&&!o.knockOffDate);
  const [sel,setSel]=useState(new Set());
  const [date,setDate]=useState(nowDate());
  const [amounts,setAmounts]=useState({});
  const selectedList=released.filter(o=>sel.has(o.id));
  const allAmountsFilled=selectedList.length>0&&selectedList.every(o=>parseFloat(amounts[o.id])>0);
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:560,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"12px 12px 0 0"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",display:"flex",alignItems:"center",gap:8}}>{Ic.calendar} Set Knock-off Date (Bulk)</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:14}}>✕</button>
      </div>
      <div style={{padding:16,overflowY:"auto",flex:1}}>
        {released.length===0?<div style={{textAlign:"center",padding:24,color:C.textLight,fontSize:13}}>No invoices pending knock-off.</div>:<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.textLight}}>{released.length} pending</div>
            <button onClick={()=>setSel(sel.size===released.length?new Set():new Set(released.map(o=>o.id)))} style={{fontSize:11,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===released.length?"Deselect All":"Select All"}</button>
          </div>
          <div style={{marginBottom:12}}><L req>Knock-off Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div style={{...lbl,marginBottom:4}}>Select invoices and fill in the knock-off amount for each</div>
          {released.map(o=><div key={o.id} style={{padding:"10px 12px",borderRadius:9,background:sel.has(o.id)?"#F0FDF4":C.surface,border:`1px solid ${sel.has(o.id)?"#BBF7D0":C.border}`,marginBottom:7}}>
            <div onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:sel.has(o.id)?8:0}}>
              <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#15803D":"#fff",border:`2px solid ${sel.has(o.id)?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
              <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:C.textLight}}>{shortId(o.id)} · {o.branch} · Invoice: {o.invoiceNo||"—"}</div></div>
            </div>
            {sel.has(o.id)&&<div onClick={e=>e.stopPropagation()}><L req>Knock-off Amount (RM)</L><I type="number" value={amounts[o.id]||""} onChange={e=>setAmounts(p=>({...p,[o.id]:e.target.value}))} placeholder="0.00" style={!(parseFloat(amounts[o.id])>0)?{borderColor:"#FECACA"}:{}}/></div>}
          </div>)}
        </>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:8}}>
        {sel.size>0&&!allAmountsFilled&&<div style={{fontSize:11,color:"#DC2626",display:"flex",alignItems:"center",gap:6}}>{Ic.alertCircle} Fill in the knock-off amount for every selected invoice.</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn onClick={async()=>{if(!sel.size||!date||!allAmountsFilled)return;const changed=orders.filter(o=>sel.has(o.id)).map(o=>({...o,knockOffDate:date,knockOffAmount:amounts[o.id],history:[{step:13,date:nowDate(),time:nowTime(),note:"Knock-off date set (bulk)",knockOffDate:date,knockOffAmount:amounts[o.id]}]}));const ok=await onSave(changed);if(ok)onClose();}} disabled={!sel.size||!date||!allAmountsFilled}>{Ic.calendar} Set Knock-off ({sel.size})</PBtn>
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

function OrderListVirtualized({orders,alertsByOrderId,onOpen}){
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
    const showWho=!o.cancelled&&o.step!==14;
    const whoLabel=s.who==="admin"?"Pending Admin Action":s.who==="branch"?"Pending Branch Action":s.who==="both"?"Pending Branch & Admin Action":"";
    const detailText=showWho&&whoLabel?`${whoLabel} — ${s.desc}`:s.desc;
    return{s,mxS,alert,flagLabel,flagColor,progressLabel,progressColor,detailText};
  };

  // ── Mobile: no inner vertical scrollbox — the full list renders in normal
  // page flow (page itself scrolls), wrapped in a horizontally-scrollable
  // strip so columns can be swiped into view instead of wrapping/clipping. ──
  if(isMobile){
    const MIN_W=780;
    const PAD="0 14px";
    return<div style={{...card,padding:0,overflow:"hidden"}}>
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{minWidth:MIN_W}}>
          <div style={{display:"flex",alignItems:"center",padding:PAD,height:36,background:C.navy,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
            <div style={{width:8,flexShrink:0}}/>
            <div style={{flex:2,minWidth:0,marginLeft:10}}>Order</div>
            <div style={{flex:2,minWidth:0,marginLeft:14}}>Status</div>
            <div style={{flex:2.4,minWidth:0,marginLeft:20}}>Step</div>
            <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto"}}>Updated</div>
          </div>
          {orders.map((o,idx)=>{
            const{s,mxS,alert,flagLabel,flagColor,progressLabel,progressColor,detailText}=rowFields(o);
            const rowBg=idx%2===0?C.white:C.surface;
            return<div key={o.id} onClick={()=>onOpen(o)}
              style={{display:"flex",alignItems:"center",padding:`10px 14px`,borderBottom:`1px solid ${C.border}`,background:rowBg,cursor:"pointer"}}>
              <div title={alert?.msg||""} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:alert?(alert.type==="approval_expired"?"#DC2626":alert.type==="approval_urgent"?"#B91C1C":"#F59E0B"):"transparent"}}/>
              <div style={{flex:2,minWidth:0,marginLeft:10}}>
                <div style={{fontWeight:700,fontSize:12,color:C.text,...single}}>{o.phoneModel}</div>
                <div style={{fontSize:10,color:C.textLight,...single}}>{o.customerName} · {o.branch} · {o.salesAgentName||o.salesAgentId||"—"}</div>
              </div>
              <div style={{flex:2,minWidth:0,marginLeft:14}}>
                <div><span style={{fontSize:9,fontWeight:700,color:progressColor,background:progressColor+"18",border:`1px solid ${progressColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{progressLabel}</span></div>
                <div style={{display:"flex",flexWrap:"nowrap",gap:4,marginTop:4}}>
                  {flagLabel&&<span style={{fontSize:9,fontWeight:700,color:flagColor,background:flagColor+"18",border:`1px solid ${flagColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{flagLabel}</span>}
                  <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.stockStatus==="ready"?"Ready Stock":"Stock Request"}</span>
                  <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.orderType==="cash"?"Cash Order":"CCM Order"}</span>
                </div>
              </div>
              <div style={{flex:2.4,minWidth:0,marginLeft:20}}>
                <div style={{fontSize:11,fontWeight:600,color:C.textMid,...single}}>Step {o.step}/{mxS} · {s.label}</div>
                <div style={{fontSize:10,color:C.textLight,marginTop:3,...single}}>{detailText}</div>
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
        <div style={{flex:2,minWidth:0,marginLeft:10}}>Order</div>
        <div style={{flex:2.2,minWidth:0,marginLeft:14}}>Status</div>
        <div style={{flex:2.6,minWidth:0,marginLeft:36}}>Step</div>
        <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto"}}>Updated</div>
      </div>
      <div style={{height:total*ROW_H,position:"relative"}}>
        {visible.map((o,i)=>{
          const idx=startIdx+i;
          const{s,mxS,alert,flagLabel,flagColor,progressLabel,progressColor,detailText}=rowFields(o);
          const rowBg=idx%2===0?C.white:C.surface;
          return<div key={o.id} onClick={()=>onOpen(o)}
            style={{position:"absolute",top:idx*ROW_H,left:0,right:0,height:ROW_H,display:"flex",alignItems:"center",padding:PAD,borderBottom:`1px solid ${C.border}`,background:rowBg,cursor:"pointer",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.background="#EEF3FB";}}
            onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
            <div title={alert?.msg||""} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:alert?(alert.type==="approval_expired"?"#DC2626":alert.type==="approval_urgent"?"#B91C1C":"#F59E0B"):"transparent"}}/>
            <div style={{flex:2,minWidth:0,marginLeft:10}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text,...single}}>{o.phoneModel}</div>
              <div style={{fontSize:10,color:C.textLight,...single}}>{o.customerName} · {o.branch} · {o.salesAgentName||o.salesAgentId||"—"}</div>
            </div>
            <div style={{flex:2.2,minWidth:0,marginLeft:14,overflow:"hidden"}}>
              <div><span style={{fontSize:9,fontWeight:700,color:progressColor,background:progressColor+"18",border:`1px solid ${progressColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{progressLabel}</span></div>
              <div style={{display:"flex",flexWrap:"nowrap",gap:4,marginTop:4}}>
                {flagLabel&&<span style={{fontSize:9,fontWeight:700,color:flagColor,background:flagColor+"18",border:`1px solid ${flagColor}40`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{flagLabel}</span>}
                <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.stockStatus==="ready"?"Ready Stock":"Stock Request"}</span>
                <span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap",flexShrink:0}}>{o.orderType==="cash"?"Cash Order":"CCM Order"}</span>
              </div>
            </div>
            <div style={{flex:2.6,minWidth:0,marginLeft:36,overflow:"hidden"}}>
              <div style={{fontSize:11,fontWeight:600,color:C.textMid,...single}}>Step {o.step}/{mxS} · {s.label}</div>
              <div style={{fontSize:10,color:C.textLight,marginTop:3,...single}}>{detailText}</div>
            </div>
            <div style={{width:92,flexShrink:0,textAlign:"right",marginLeft:"auto",fontSize:10,color:C.textLight,whiteSpace:"nowrap"}}>{o.lastHistoryDate?fDT(o.lastHistoryDate,o.lastHistoryTime):"—"}</div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[],isReadOnly=false}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState(()=>sessionStorage.getItem("orderView")||"list");
  const [selected,setSelected]=useState(()=>{try{const s=sessionStorage.getItem("orderSelected");return s?JSON.parse(s):null;}catch{return null;}});
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [searchInput,setSearchInput]=useState("");
  const [search,setSearch]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setSearch(searchInput),200);return()=>clearTimeout(t);},[searchInput]);
  const [showArchive,setShowArchive]=useState(false);
  const [showBulkDispatch,setShowBulkDispatch]=useState(false);
  const [showBulkClaimSent,setShowBulkClaimSent]=useState(false);
  const [showBulkKnockoff,setShowBulkKnockoff]=useState(false);
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [claimDate,setClaimDate]=useState(nowDate());
  const [knockOffReportDate,setKnockOffReportDate]=useState(nowDate());
  const [completedReportDate,setCompletedReportDate]=useState(nowDate());
  const [agreementReceivedReportDate,setAgreementReceivedReportDate]=useState(nowDate());
  const [reportMerchant,setReportMerchant]=useState("all");
  const [reportsExpanded,setReportsExpanded]=useState(false);
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

  const nav=(v,sel=null)=>{setView(v);setSelected(sel);sessionStorage.setItem("orderView",v);sessionStorage.setItem("orderSelected",sel?JSON.stringify(sel):"null");};

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

  // o = full order object (header fields + its complete, already-appended history array).
  // Diffs against what we last knew about this one order and writes ONLY the new
  // history row(s) + this order's own header row — never touches any other order.
  const saveOrder=async o=>{
    const oldFull=detailCache[o.id];
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

  const activeOrders=useMemo(()=>orders.filter(o=>o.step!==14&&(!userBranch||o.branch===userBranch)),[orders,userBranch]);
  const completedOrders=useMemo(()=>orders.filter(o=>o.step===14&&(!userBranch||o.branch===userBranch)),[orders,userBranch]);
  const viewingCompleted=filterPhase==="completed";
  const filtered=useMemo(()=>(viewingCompleted?completedOrders:activeOrders).filter(o=>(viewingCompleted||filterPhase==="all"||getPhase(o.step)?.id===filterPhase)&&(filterBranch==="ALL"||o.branch===filterBranch)&&(!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>b.id-a.id),[viewingCompleted,completedOrders,activeOrders,filterPhase,filterBranch,search]);
  const phaseCounts=useMemo(()=>PHASES.reduce((acc,ph)=>{acc[ph.id]=activeOrders.filter(o=>ph.steps.includes(o.step)).length;return acc;},{}),[activeOrders]);
  const completedCount=orders.filter(o=>o.step===14&&(!userBranch||o.branch===userBranch)).length;
  const alerts=useMemo(()=>getOrderAlerts(activeOrders,userBranch),[activeOrders,userBranch]);
  const alertsByOrderId=useMemo(()=>{const m={};alerts.forEach(a=>{if(!m[a.orderId])m[a.orderId]=a;});return m;},[alerts]);

  if(loading)return<div style={{padding:60,textAlign:"center",color:C.textLight,fontSize:13}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=detailCache[selected.id];
    if(!live)return<div style={{padding:60,textAlign:"center",color:C.textLight,fontSize:13}}>Loading order…</div>;
    return<><OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} isReadOnly={isReadOnly} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);nav("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>nav("list")} allOrders={activeOrders}/>{showArchive&&<BatchArchive orders={orders} onDelete={bulkDelete} onClose={()=>setShowArchive(false)}/>}</>;
  }
  if(view==="form")return<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{nav(editOrder?"detail":"list",editOrder||selected);setEditOrder(null);}}/>;

  return<div className="fade-in">
    {showArchive&&<BatchArchive orders={orders} onDelete={bulkDelete} onClose={()=>setShowArchive(false)}/>}
    {showBulkDispatch&&<BulkDispatch orders={orders} onSave={bulkSave} onClose={()=>setShowBulkDispatch(false)}/>}
    {showBulkClaimSent&&<BulkClaimSent orders={orders} onSave={bulkSave} onClose={()=>setShowBulkClaimSent(false)}/>}
    {showBulkKnockoff&&<BulkKnockOff orders={orders} onSave={bulkSave} onClose={()=>setShowBulkKnockoff(false)}/>}

    {/* Page header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:19,fontWeight:800,color:C.navy,letterSpacing:"-0.01em"}}>Order Tracking</div>
        <div style={{fontSize:12,color:C.textLight,marginTop:4}}>{activeOrders.length} active · {completedCount} completed</div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {isAdmin&&!isReadOnly&&orders.some(o=>o.step===3)&&<GBtn onClick={()=>setShowBulkDispatch(true)}>{Ic.truck} Dispatch to Branch</GBtn>}
        {isAdmin&&!isReadOnly&&orders.some(o=>o.step===12)&&<GBtn onClick={()=>setShowBulkClaimSent(true)}>{Ic.checkCircle} Set Claim Sent Date</GBtn>}
        {isAdmin&&!isReadOnly&&orders.some(o=>o.step===13&&!o.knockOffDate)&&<GBtn onClick={()=>setShowBulkKnockoff(true)}>{Ic.calendar} Set Knock-off Date</GBtn>}
        {isAdmin&&!isReadOnly&&completedCount>0&&<GBtn onClick={()=>setShowArchive(true)}>{Ic.trash} Remove Completed ({completedCount})</GBtn>}
        {!isReadOnly&&<PBtn onClick={()=>{setEditOrder(null);nav("form");}}>{Ic.plus} New Order</PBtn>}
      </div>
    </div>

    {/* Alerts */}
    <AlertBanner alerts={alerts} onClickOrder={id=>{const o=activeOrders.find(x=>x.id===id);if(o)nav("detail",o);}}/>

    {/* Phase KPI cards — 2×2 grid */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
      {PHASES.map(ph=>{
        const count=phaseCounts[ph.id]||0,active=filterPhase===ph.id;
        return<div key={ph.id} onClick={()=>setFilterPhase(active?"all":ph.id)} style={{...card,padding:0,overflow:"hidden",cursor:"pointer",border:`1px solid ${active?ph.color:C.border}`,boxShadow:active?`0 0 0 1px ${ph.color}, 0 1px 3px rgba(10,22,40,.06)`:card.boxShadow,transition:"all .15s"}}>
          <div style={{height:3,background:active?ph.color:"transparent",transition:"background .15s"}}/>
          <div style={{padding:"13px 16px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:34,height:34,borderRadius:8,background:active?ph.color:C.surface,border:active?"none":`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:active?"#fff":C.textMid,flexShrink:0,transition:"all .15s"}}>{PHASE_ICONS[ph.id]}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
              <div style={{fontSize:23,fontWeight:800,color:C.navy,lineHeight:1}}>{count}</div>
            </div>
          </div>
        </div>;
      })}
      {isAdmin&&<div onClick={()=>setFilterPhase(viewingCompleted?"all":"completed")} style={{...card,padding:0,overflow:"hidden",cursor:"pointer",border:`1px solid ${viewingCompleted?"#15803D":C.border}`,boxShadow:viewingCompleted?`0 0 0 1px #15803D, 0 1px 3px rgba(10,22,40,.06)`:card.boxShadow,transition:"all .15s",gridColumn:"1/-1"}}>
        <div style={{height:3,background:viewingCompleted?"#15803D":"transparent",transition:"background .15s"}}/>
        <div style={{padding:"13px 16px",display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,borderRadius:8,background:viewingCompleted?"#15803D":C.surface,border:viewingCompleted?"none":`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:viewingCompleted?"#fff":C.textMid,flexShrink:0,transition:"all .15s"}}>{Ic.checkCircle}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Completed</div>
            <div style={{fontSize:23,fontWeight:800,color:C.navy,lineHeight:1}}>{completedCount}</div>
          </div>
        </div>
      </div>}
    </div>

    {/* Search + filter */}
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <I placeholder="Search customer, model, agreement…" value={searchInput} onChange={e=>setSearchInput(e.target.value)} style={{flex:2,minWidth:160}}/>
      {isAdmin&&<SEL value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</SEL>}
    </div>

    {/* Order list — compact rows in a fixed-height virtualized viewport.
        Only the rows actually in view (plus a small overscan buffer) are
        ever mounted, so scroll performance doesn't degrade as the order
        count grows into the hundreds. */}
    {filtered.length===0
      ?<div style={{...card,padding:"44px 20px",textAlign:"center",color:C.textLight,fontSize:13}}>{search||filterPhase!=="all"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click New Order to get started."}</div>
      :<OrderListVirtualized orders={filtered} alertsByOrderId={alertsByOrderId} onOpen={o=>nav("detail",o)}/>
    }

    {/* Report downloads — admin only, footer */}
    {isAdmin&&!isReadOnly&&<div style={{...card,marginTop:12}}>
      <div onClick={()=>setReportsExpanded(p=>!p)} style={{cursor:"pointer",userSelect:"none",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{color:"rgba(255,255,255,.85)"}}>{Ic.download}</span><span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Reports</span></div>
          <span style={{color:"rgba(255,255,255,.85)",transition:"transform .15s",transform:reportsExpanded?"rotate(180deg)":"none"}}>{Ic.chevDown}</span>
        </div>
      </div>
      {reportsExpanded&&<div style={{padding:"0 16px 16px",borderTop:`1px solid ${C.border}`}}>
        <div style={{padding:"14px 0 4px",maxWidth:260}}><L>Merchant</L><SEL value={reportMerchant} onChange={e=>setReportMerchant(e.target.value)}><option value="all">All Merchants</option>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</SEL></div>
        <div style={{display:"flex",flexDirection:"column"}}>
          {[["Upfront Payment","upfront",upfrontDate,setUpfrontDate,activeOrders],["Agreement Received by HQ","agreementReceived",agreementReceivedReportDate,setAgreementReceivedReportDate,activeOrders],["Claim Submitted","claim",claimDate,setClaimDate,activeOrders],["Claim Released - Knock Off","knockoff",knockOffReportDate,setKnockOffReportDate,activeOrders],["Completed","completed",completedReportDate,setCompletedReportDate,orders.filter(o=>!userBranch||o.branch===userBranch)]].map(([label,type,date,setDate,src],i)=><div key={type} style={{display:"flex",alignItems:"flex-end",gap:10,padding:"12px 0",borderTop:i>0?`1px solid ${C.border}`:"none",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:140,fontSize:12,fontWeight:700,color:C.text}}>{label} Report</div>
            <div style={{flex:1,minWidth:130}}><L>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <PBtn onClick={()=>downloadReport(src,type,date,reportMerchant)} style={{padding:"8px 10px",flexShrink:0}}>{Ic.download}</PBtn>
            <button onClick={()=>downloadReport(src,type,"",reportMerchant)} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline",flexShrink:0}}>All dates</button>
          </div>)}
        </div>
      </div>}
    </div>}
  </div>;
}
