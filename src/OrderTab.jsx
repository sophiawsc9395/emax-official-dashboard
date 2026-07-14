import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];
const PAYMENT_METHODS=["RHB","Public Bank"];

// Phases: step ranges as requested
const PHASES=[
  {id:"stock",label:"Stock Order",steps:[1,2,3],color:"#1E6FDB"},
  {id:"transfer",label:"Stock Transfer",steps:[4,5],color:"#7C3AED"},
  {id:"billing",label:"Billing",steps:[6,7,8],color:"#B45309"},
  {id:"agreement_hq",label:"Agreement → HQ",steps:[9,10],color:"#0891B2"},
  {id:"unclaimed",label:"Unclaimed",steps:[11],color:"#DC2626"},
  {id:"claimed",label:"Claimed",steps:[12],color:"#15803D"},
];

const STEPS=[
  {step:1,label:"New Order Request",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsRemark:true},
  {step:3,label:"Arrived HQ",desc:"Item received at HQ.",who:"admin",phase:"stock"},
  {step:4,label:"Dispatched to Branch",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",desc:"Branch submits billing form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",desc:"Customer collects device and payment received.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Collection Proof"},{key:"paymentProof",label:"Payment Proof"}]},
  {step:9,label:"Collection Verified",desc:"HQ verifies collection and upfront payment.",who:"admin",phase:"agreement_hq",needsVerification:true},
  {step:10,label:"Agreement Checklist",desc:"Branch completes agreement checklist.",who:"both",phase:"agreement_hq",needsChecklist:true},
  {step:11,label:"Agreement at HQ",desc:"HQ receives original signed agreement.",who:"admin",phase:"unclaimed",canReverse:true},
  {step:12,label:"Claimed",desc:"Claim released. Fill knock-off date.",who:"admin",phase:"claimed",needsKnockOff:true,needsFiles:[{key:"claimRef",label:"Claim Reference",optional:true}]},
  {step:13,label:"Completed",desc:"Order completed and archived.",who:"admin",phase:"claimed"},
];

const CHECKLIST_ITEMS=["Aeon Application Form (3 pages)","Invoice","Result List","Notice 1 — Application (2 pages × 2 sets)","Notice 2 — Approval (8 pages)","Agreement (16 pages)","IC Copy","AutoDebit Form (Personal Account)","Bank Proof (Personal Account)"];

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

// ── SVG Icons ──────────────────────────────────────────────────────────────
const Ic={
  box:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  truck:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  card:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  file:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  checkCircle:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  alert:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  plus:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  arrowL:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  arrowR:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  edit:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  rotate:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>,
  download:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  check:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  cash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  clipboard:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  calendar:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  ready:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
};

const PHASE_ICONS={stock:Ic.box,transfer:Ic.truck,billing:Ic.card,agreement_hq:Ic.file,unclaimed:Ic.alert,claimed:Ic.checkCircle};

// ── Shared styles ──────────────────────────────────────────────────────────
const T={navy:"#0A1628",blue:"#1E6FDB",grey:"#8A96A8",border:"#E4EAF2",bg:"#F7F9FC",white:"#fff"};
const inpStyle={width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif",background:T.white,boxSizing:"border-box",color:T.navy,outline:"none"};
const lblStyle={fontSize:10,fontWeight:700,color:T.grey,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"};
const cardSt={background:T.white,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"};

function L({children,req}){return<label style={lblStyle}>{children}{req&&<span style={{color:"#B91C1C"}}> *</span>}</label>;}
function I(p){return<input style={{...inpStyle,...p.style}} {...p}/>;}
function S({children,...p}){return<select style={{...inpStyle,...p.style}} {...p}>{children}</select>;}
function TX(p){return<textarea style={{...inpStyle,resize:"vertical",...p.style}} {...p}/>;}
function CardHdr({children,color}){return<div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg,fontSize:11,fontWeight:700,color:color||T.navy,textTransform:"uppercase",letterSpacing:"0.06em",display:"flex",alignItems:"center",gap:6}}>{children}</div>;}
function PBtn({children,onClick,disabled,style={},danger=false}){return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 16px",background:danger?"#B91C1C":disabled?"#E4EAF2":T.navy,color:danger||(!disabled)?"#fff":"#8A96A8",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap",...style}}>{children}</button>;}
function GBtn({children,onClick,style={}}){return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:T.bg,color:T.navy,border:`1px solid ${T.border}`,borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;}
function InfoRow({label,value}){return<div><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{label}</div><div style={{fontSize:12,fontWeight:600,color:T.navy}}>{value}</div></div>;}

// ── Phase Progress Bar ─────────────────────────────────────────────────────
function PhaseBar({currentStep}){
  const activePh=getPhase(currentStep);
  const totalSteps=12;
  const pct=Math.round(((Math.min(currentStep,12)-1)/(totalSteps-1))*100);
  return(
    <div>
      <div style={{display:"flex",alignItems:"flex-start",gap:0,marginBottom:14}}>
        {PHASES.filter(p=>p.id!=="claimed"?true:true).map((ph,i)=>{
          const maxS=Math.max(...ph.steps);
          const done=currentStep>maxS;
          const active=ph.steps.includes(currentStep);
          const phColor=ph.color;
          return(
            <div key={ph.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start",minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",width:"100%"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:done||active?phColor:"#F7F9FC",border:`2px solid ${done||active?phColor:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:done||active?"#fff":T.grey,fontSize:10}}>
                  {done?Ic.check:PHASE_ICONS[ph.id]}
                </div>
                {i<PHASES.length-1&&<div style={{flex:1,height:2,background:done?phColor:T.border,margin:"0 3px"}}/>}
              </div>
              <div style={{marginTop:5,paddingLeft:0,maxWidth:"100%"}}>
                <div style={{fontSize:9,fontWeight:700,color:active?phColor:done?"#4A5568":"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.04em",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{height:4,background:T.border,borderRadius:2,overflow:"hidden",marginBottom:4}}>
        <div style={{height:"100%",width:`${pct}%`,background:activePh?.color||T.navy,borderRadius:2,transition:"width .4s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.grey}}>
        <span>Step {currentStep} of 12</span><span>{pct}% complete</span>
      </div>
    </div>
  );
}

// ── Step Pill ──────────────────────────────────────────────────────────────
function StepPill({step,size="sm"}){
  const ph=getPhase(step);
  const s=getStep(step);
  const color=ph?.color||T.grey;
  return<span style={{display:"inline-block",padding:size==="lg"?"4px 12px":"2px 8px",borderRadius:4,fontSize:size==="lg"?12:10,fontWeight:700,background:`${color}15`,color,border:`1px solid ${color}30`,whiteSpace:"nowrap"}}>{s.label}</span>;
}

// ── Tracking Timeline ──────────────────────────────────────────────────────
function Timeline({order}){
  const current=order.step;
  let lastPhase=null;
  return(
    <div>
      {STEPS.filter(s=>s.step<=12).map((s,i)=>{
        const done=current>s.step;
        const active=current===s.step;
        const hist=(order.history||[]).find(h=>h.step===s.step);
        const ph=getPhase(s.step);
        const showPh=ph&&ph.id!==lastPhase;
        if(ph)lastPhase=ph.id;
        const phColor=ph?.color||T.grey;
        return(
          <div key={s.step}>
            {showPh&&<div style={{fontSize:9,fontWeight:800,color:phColor,textTransform:"uppercase",letterSpacing:"0.08em",padding:"8px 0 5px 36px",marginBottom:4,marginTop:i>0?10:0,borderBottom:`1px solid ${phColor}20`,display:"flex",alignItems:"center",gap:5}}><span style={{color:phColor}}>{PHASE_ICONS[ph.id]}</span>{ph.label}</div>}
            <div style={{display:"flex",position:"relative"}}>
              {i<STEPS.filter(s=>s.step<=12).length-1&&<div style={{position:"absolute",left:12,top:26,width:1,height:"calc(100% + 2px)",background:done?phColor+"40":T.border,zIndex:0}}/>}
              <div style={{flexShrink:0,width:24,height:24,borderRadius:"50%",background:done?phColor:active?phColor:"#F7F9FC",border:`2px solid ${done||active?phColor:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:10,marginTop:1,color:done||active?"#fff":T.grey,flexShrink:0}}>
                {done?Ic.check:active?<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700}}>{s.step}</span>}
              </div>
              <div style={{flex:1,paddingBottom:i<STEPS.filter(s=>s.step<=12).length-1?12:0,paddingTop:2}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:done||active?600:400,color:done||active?T.navy:"#9CA3AF"}}>{s.label}</span>
                  {active&&<span style={{background:"#FEF9C3",color:"#92400E",padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:700,border:"1px solid #FDE68A"}}>Current</span>}
                  {hist?.date&&<span style={{fontSize:10,color:T.grey}}>{fDT(hist.date,hist.time)}</span>}
                </div>
                {hist&&<div style={{marginTop:4,background:T.bg,borderRadius:6,padding:"6px 10px",border:`1px solid ${T.border}`,fontSize:11,color:"#374151"}}>
                  {hist.remark&&<div style={{marginBottom:2}}>💬 {hist.remark}</div>}
                  {hist.invoiceNo&&<div style={{marginBottom:2,color:T.blue,fontWeight:600}}>Invoice: {hist.invoiceNo}</div>}
                  {hist.knockOffDate&&<div style={{marginBottom:2,color:"#15803D",fontWeight:600}}>Knock-off: {fDate(hist.knockOffDate)}</div>}
                  {hist.verificationRemark&&<div style={{marginBottom:2}}>Note: {hist.verificationRemark}</div>}
                  {hist.upfrontPaymentDate&&<div style={{marginBottom:2,color:T.blue}}>Payment Date: {fDate(hist.upfrontPaymentDate)}</div>}
                  {hist.paymentMethod&&<div style={{marginBottom:2}}>Method: {hist.paymentMethod}</div>}
                  {hist.returnRemark&&<div style={{marginBottom:2,color:"#B91C1C",fontWeight:600}}>Returned: {hist.returnRemark}</div>}
                  {hist.issueItems?.length>0&&<div style={{marginBottom:2,color:"#B91C1C",fontSize:10}}>Issues: {hist.issueItems.join(" · ")}</div>}
                  {hist.checklistItems&&<div style={{fontSize:10}}>{hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items</div>}
                  {hist.collectionChecked!==undefined&&<div style={{fontSize:10,color:hist.collectionChecked?"#15803D":"#B91C1C"}}>{hist.collectionChecked?"✓":"✗"} Collection · {hist.paymentChecked?"✓":"✗"} Payment verified</div>}
                  {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&(
                    <a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:T.blue,textDecoration:"none",background:"#EFF6FF",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:2}}>{Ic.download} {f.name}</a>
                  ))}
                </div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Billing Form ───────────────────────────────────────────────────────────
function BillingForm({order,onSubmit,onCancel}){
  const [f,setF]=useState(order.billingData||{billingDate:nowDate(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",monthlyInstallment:""});
  const [fls,setFls]=useState({deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const REQUIRED=["billingDate","customerFullName","customerIC","customerHP","customerEmail","customerAddress","customerPostCode","customerCity","itemCode","imeiSerial","cashPriceOnListing","monthlyInstallment"];
  const canSubmit=REQUIRED.every(k=>f[k]?.toString().trim());
  const submit=async()=>{if(!canSubmit)return;setSaving(true);const data={...f};for(const[k,file] of Object.entries(fls))if(file)data[k]=await readFile(file);onSubmit(data);setSaving(false);};
  const fd=(k,l,t="text",req=false,span=false)=>(
    <div key={k} style={span?{gridColumn:"1/-1"}:{}}>
      <L req={req}>{l}</L>
      <I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&!f[k]?.toString().trim()?{borderColor:"#FECACA"}:{}}/>
    </div>
  );
  return(
    <div style={{...cardSt,marginBottom:16}}>
      <div style={{background:T.navy,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Billing Request Form</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>All marked fields required</div></div>
      <div style={{padding:18}}>
        <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,borderBottom:`1px solid ${T.border}`,paddingBottom:6}}>Billing Info</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>{fd("billingDate","Billing Date","date",true)}<div/></div>
        <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,borderBottom:`1px solid ${T.border}`,paddingBottom:6}}>Customer Details</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {fd("customerFullName","Customer Full Name","text",true)}{fd("customerIC","Customer IC No.","text",true)}{fd("customerHP","HP Number","tel",true)}{fd("customerEmail","Email","email",true)}{fd("customerAddress","Address","text",true,true)}{fd("customerPostCode","Post Code","text",true)}{fd("customerCity","City","text",true)}
        </div>
        <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,borderBottom:`1px solid ${T.border}`,paddingBottom:6}}>Item Details</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {fd("itemCode","Item Code","text",true)}{fd("imeiSerial","IMEI / Serial No.","text",true)}{fd("freeGiftItemCode","Free Gift Item Code (if any)")}{fd("freeGiftItemName","Free Gift Item Name (if any)")}{fd("cashPriceOnListing","Cash Price on Result Listing (RM)","number",true)}{fd("monthlyInstallment","Monthly Installment (RM)","number",true)}
        </div>
        <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,borderBottom:`1px solid ${T.border}`,paddingBottom:6}}>File Uploads</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image",false],["resultListFile","Result Listing File",true],["agreementFile","Agreement File",true]].map(([k,l,req])=>(
            <div key={k}><L req={req}>{l}</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFls(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>{(fls[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2,fontWeight:600}}>✓ {fls[k]?.name||f[k]?.name}</div>}</div>
          ))}
        </div>
        {!canSubmit&&<div style={{padding:"8px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:7,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alert} Fill all required fields before submitting.</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <GBtn onClick={onCancel}>{Ic.arrowL} Back</GBtn>
          <PBtn onClick={submit} disabled={!canSubmit||saving}>{saving?"Saving…":"Submit Billing Request"} {Ic.arrowR}</PBtn>
        </div>
      </div>
    </div>
  );
}

// ── Checklist Form ─────────────────────────────────────────────────────────
function ChecklistForm({onSubmit,onCancel,issueItems=[]}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const allChecked=items.every(x=>x.checked);
  return(
    <div style={{...cardSt,marginBottom:16}}>
      <div style={{background:T.navy,padding:"14px 18px"}}><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Agreement Checklist</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Tick all items before sending to HQ</div></div>
      <div style={{padding:16}}>
        {items.map((item,i)=>(
          <div key={i} onClick={()=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x))} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":T.bg,border:`1px solid ${item.issue&&!item.checked?"#FECACA":item.checked?"#BBF7D0":T.border}`,marginBottom:8,cursor:"pointer",transition:"all .15s"}}>
            <div style={{width:18,height:18,borderRadius:4,background:item.checked?T.navy:"#fff",border:`2px solid ${item.checked?T.navy:item.issue?"#EF4444":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{item.checked&&Ic.check}</div>
            <span style={{fontSize:12,fontWeight:item.checked?600:400,color:item.issue&&!item.checked?"#B91C1C":item.checked?"#15803D":"#374151"}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:10,marginLeft:7,color:"#B91C1C",fontWeight:700}}>⚠ Flagged</span>}</span>
          </div>
        ))}
        {!allChecked&&<div style={{padding:"8px 12px",background:"#FFFBEB",borderRadius:7,border:"1px solid #FDE68A",fontSize:11,color:"#92400E",marginTop:4,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alert} All items must be ticked to proceed.</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
          <GBtn onClick={onCancel}>{Ic.arrowL} Back</GBtn>
          <PBtn onClick={()=>allChecked&&onSubmit(items)} disabled={!allChecked}>Submit Checklist</PBtn>
        </div>
      </div>
    </div>
  );
}

// ── Download Upfront Report ────────────────────────────────────────────────
function downloadUpfrontReport(orders,dateFilter){
  const verified=orders.filter(o=>{
    const h=(o.history||[]).find(h=>h.step===9);
    return h&&(!dateFilter||h.upfrontPaymentDate===dateFilter);
  });
  if(!verified.length){alert("No verified records for this date.");return;}
  const rows=verified.map(o=>{
    const h=(o.history||[]).find(h=>h.step===9);
    const up=calcUpfront(o);
    const monthly=parseFloat(o.billingData?.monthlyInstallment)||0;
    return{
      orderId:shortId(o.id),
      phoneModel:o.phoneModel,
      customerName:o.customerName,
      branch:o.branch,
      paymentDate:fDate(h.upfrontPaymentDate),
      monthly:monthly,
      totalDue:up.total,
      paymentMethod:h.paymentMethod||"—",
      remark:h.verificationRemark||"—",
    };
  });
  // Build HTML report
  const totalMonthly=rows.reduce((s,r)=>s+r.monthly,0);
  const totalDue=rows.reduce((s,r)=>s+r.totalDue,0);
  const dateStr=dateFilter?fDate(dateFilter):"All Dates";
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Upfront Payment Report — ${dateStr}</title>
  <style>body{font-family:Inter,sans-serif;margin:32px;color:#0A1628}h1{font-size:18px;font-weight:800;margin-bottom:4px}h2{font-size:13px;font-weight:400;color:#8A96A8;margin:0 0 24px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0A1628;color:#fff;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}td{padding:8px 12px;border-bottom:1px solid #E4EAF2}tr:nth-child(even) td{background:#F7F9FC}.total td{font-weight:700;background:#0A1628;color:#fff}.footer{margin-top:20px;font-size:11px;color:#8A96A8}@media print{body{margin:16px}}</style></head>
  <body><h1>Upfront Payment Report</h1><h2>${dateStr} · ${rows.length} record${rows.length!==1?"s":""}</h2>
  <table><thead><tr><th>#</th><th>Order ID</th><th>Customer</th><th>Branch</th><th>Phone</th><th>Payment Date</th><th>1st Monthly (RM)</th><th>Total Due (RM)</th><th>Method</th><th>Remark</th></tr></thead>
  <tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.orderId}</td><td>${r.customerName}</td><td>${r.branch}</td><td>${r.phoneModel}</td><td>${r.paymentDate}</td><td>${r.monthly.toFixed(2)}</td><td>${r.totalDue.toFixed(2)}</td><td>${r.paymentMethod}</td><td>${r.remark}</td></tr>`).join("")}
  <tr class="total"><td colspan="6">TOTAL (${rows.length} records)</td><td>${totalMonthly.toFixed(2)}</td><td>${totalDue.toFixed(2)}</td><td colspan="2"></td></tr></tbody></table>
  <div class="footer">Generated: ${new Date().toLocaleString("en-MY")} · EMAX Network Sdn Bhd</div></body></html>`;
  const w=window.open("","_blank");
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
}

// ── Action Panel ───────────────────────────────────────────────────────────
function ActionPanel({order,isAdmin,onUpdate,allOrders}){
  const step=order.step;
  const nextDef=step<12?getStep(step+1):null;
  const [remark,setRemark]=useState("");
  const [invoiceNo,setInvoiceNo]=useState("");
  const [knockOffDate,setKnockOffDate]=useState(nowDate());
  const [files,setFiles]=useState({});
  const [collection,setCollection]=useState(false);
  const [payment,setPayment]=useState(false);
  const [verRemark,setVerRemark]=useState("");
  const [upfrontDate,setUpfrontDate]=useState(nowDate());
  const [upfrontMonthly,setUpfrontMonthly]=useState(order.billingData?.monthlyInstallment||"");
  const [payMethod,setPayMethod]=useState(PAYMENT_METHODS[0]);
  const [reportDate,setReportDate]=useState(nowDate());
  const [saving,setSaving]=useState(false);
  const [showBilling,setShowBilling]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(n=>({name:n,issue:false})));

  const upfront=calcUpfront(order);
  const totalDue=upfront.total;

  if(step===12){
    // Step 12: claimed — show knock-off date + advance to 13 (archive)
    return(
      <div style={{...cardSt}}>
        <CardHdr color="#15803D">{Ic.checkCircle} Claimed — Enter Knock-Off Date</CardHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{padding:"10px 14px",background:"#F0FDF4",borderRadius:8,border:"1px solid #BBF7D0",marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
            {Ic.checkCircle}<div style={{fontSize:12,color:"#15803D",fontWeight:600}}>Claim released. Record the knock-off date to complete.</div>
          </div>
          {order.knockOffDate
            ?<div style={{fontSize:12,color:T.navy,marginBottom:12}}><span style={{color:T.grey,fontWeight:600}}>Knock-off Date: </span>{fDate(order.knockOffDate)}</div>
            :<div style={{marginBottom:12}}><L req>Knock-off Date</L><I type="date" value={knockOffDate} onChange={e=>setKnockOffDate(e.target.value)}/></div>
          }
          {!order.knockOffDate&&<PBtn onClick={async()=>{setSaving(true);const h={step:12,date:nowDate(),time:nowTime(),note:"Knock-off date recorded",knockOffDate};await onUpdate({...order,knockOffDate,history:[...(order.history||[]),h]});setSaving(false);}} disabled={saving||!knockOffDate} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Save Knock-off Date"}</PBtn>}
          {order.knockOffDate&&isAdmin&&<PBtn onClick={async()=>{if(!confirm("Move to Completed and remove from active list?"))return;setSaving(true);const h={step:13,date:nowDate(),time:nowTime(),note:"Order completed and archived"};await onUpdate({...order,step:13,history:[...(order.history||[]),h]});setSaving(false);}} danger style={{width:"100%",justifyContent:"center",marginTop:8}}>{Ic.trash} Mark as Completed (Remove)</PBtn>}
        </div>
      </div>
    );
  }

  if(step===13)return<div style={{background:"#F0FDF4",borderRadius:10,padding:"16px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:10}}>{Ic.checkCircle}<div><div style={{fontWeight:700,fontSize:14,color:"#15803D"}}>Order Completed</div><div style={{fontSize:11,color:"#166534",marginTop:2}}>Knock-off: {fDate(order.knockOffDate)}</div></div></div>;

  if(!nextDef)return null;
  const branchOk=isAdmin||[5,6,10].includes(nextDef.step);

  if(nextDef.step===6&&!isAdmin){
    if(showBilling)return<BillingForm order={order} onCancel={()=>setShowBilling(false)} onSubmit={async d=>{setSaving(true);const h={step:6,date:nowDate(),time:nowTime(),note:"Billing Request",billingData:d};await onUpdate({...order,step:6,billingData:d,history:[...(order.history||[]),h]});setSaving(false);setShowBilling(false);}}/>;
    return<ActionItem icon={Ic.clipboard} title="Billing Request" desc="Complete the billing form to advance."><PBtn onClick={()=>setShowBilling(true)} style={{width:"100%",justifyContent:"center"}}>Open Billing Form {Ic.arrowR}</PBtn></ActionItem>;
  }
  if(nextDef.step===10){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    if(showChecklist)return<ChecklistForm issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async items=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items};await onUpdate({...order,step:10,checklistItems:items,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<ActionItem icon={Ic.clipboard} title="Agreement Checklist" desc="Complete the checklist before sending to HQ."><PBtn onClick={()=>setShowChecklist(true)} style={{width:"100%",justifyContent:"center"}}>Open Checklist {Ic.arrowR}</PBtn></ActionItem>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};for(const[k,f] of Object.entries(files))if(f)rf[k]=await readFile(f);
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,files:Object.keys(rf).length?rf:undefined,
      ...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment,verificationRemark:verRemark||undefined,upfrontPaymentDate:upfrontDate,monthlyInstallment:upfrontMonthly,totalDue,paymentMethod:payMethod}:{}),
    };
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    await onUpdate(updated);setSaving(false);setRemark("");setInvoiceNo("");setFiles({});
  };
  const ok=()=>{
    if(!branchOk)return false;
    if(nextDef.needsRemark&&isAdmin&&!remark.trim())return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsFiles){const req=(nextDef.needsFiles||[]).filter(f=>!f.optional);if(isAdmin&&req.some(f=>!files[f.key]))return false;}
    return true;
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <ActionItem icon={Ic.arrowR} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
        {!branchOk
          ?<div style={{fontSize:12,color:T.grey,fontStyle:"italic"}}>Waiting for admin to process this step.</div>
          :<>
            {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}><L req>Admin Remark — Supplier / ETA / Order Details</L><TX value={remark} onChange={e=>setRemark(e.target.value)} rows={3} placeholder="Supplier details, ETA, order reference…"/></div>}
            {nextDef.needsInvoiceNo&&isAdmin&&<>
              <div style={{marginBottom:12}}><L req>Sales Invoice Number</L><I value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
              <div style={{background:T.bg,borderRadius:8,padding:"12px 14px",border:`1px solid ${T.border}`,marginBottom:12}}>
                <div style={{...lblStyle,marginBottom:8}}>Customer Upfront Payment Breakdown</div>
                {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${T.border}`,color:"#374151"}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:T.navy}}><span>Total Upfront</span><span>{fRM(totalDue)}</span></div>
              </div>
            </>}
            {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
              <div style={{marginBottom:10}}>
                <div style={{...lblStyle,marginBottom:8}}>Verification</div>
                {[[collection,setCollection,"Customer Collection Proof verified"],[payment,setPayment,"Upfront Payment Proof verified"]].map(([val,setter,label],i)=>(
                  <div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:7,background:val?"#F0FDF4":T.bg,border:`1px solid ${val?"#BBF7D0":T.border}`,marginBottom:7,cursor:"pointer"}}>
                    <div style={{width:18,height:18,borderRadius:4,background:val?T.navy:"#fff",border:`2px solid ${val?T.navy:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{val&&Ic.check}</div>
                    <span style={{fontSize:12,color:val?"#15803D":T.navy,fontWeight:val?600:400}}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><L req>Upfront Payment Date</L><I type="date" value={upfrontDate} onChange={e=>setUpfrontDate(e.target.value)}/></div>
                <div><L>Payment Method</L><S value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</S></div>
                <div><L>1st Monthly Installment (RM)</L><I type="number" value={upfrontMonthly} onChange={e=>setUpfrontMonthly(e.target.value)} placeholder={order.billingData?.monthlyInstallment||""}/></div>
                <div><L>Total Due (RM)</L><div style={{...inpStyle,background:T.bg,color:T.grey}}>{fRM(totalDue)}</div></div>
              </div>
              <div><L>Remark</L><I value={verRemark} onChange={e=>setVerRemark(e.target.value)} placeholder="Verification notes…"/></div>
            </div>}
            {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.map(({key,label,optional})=>(
              <div key={key} style={{marginBottom:12}}><L req={!optional}>{label}{optional?" (optional)":""}</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>{files[key]&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {files[key].name}</div>}</div>
            ))}
            {!nextDef.needsRemark&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&<div style={{marginBottom:12}}><L>Remark (optional)</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
            <PBtn onClick={advance} disabled={!ok()||saving} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":`Confirm: ${nextDef.label}`} {!saving&&Ic.arrowR}</PBtn>
          </>}
      </ActionItem>

      {/* Download upfront report (step 9 confirmed — show on step 9+) */}
      {step>=9&&isAdmin&&<div style={{...cardSt}}>
        <CardHdr>{Ic.download} Download Upfront Payment Report</CardHdr>
        <div style={{padding:"12px 16px",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:140}}><L>Filter by Payment Date</L><I type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></div>
          <div style={{display:"flex",gap:6,marginTop:14}}>
            <PBtn onClick={()=>downloadUpfrontReport(allOrders||[],reportDate)}>{Ic.download} By Date</PBtn>
            <GBtn onClick={()=>downloadUpfrontReport(allOrders||[],"")}>{Ic.download} All</GBtn>
          </div>
        </div>
      </div>}

      {/* Return to branch (step 11) */}
      {step===11&&isAdmin&&(!showReturn
        ?<button onClick={()=>setShowReturn(true)} style={{width:"100%",padding:"9px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{Ic.rotate} Return Agreement to Branch</button>
        :<div style={cardSt}>
          <CardHdr color="#B91C1C">{Ic.rotate} Return Agreement to Branch</CardHdr>
          <div style={{padding:"14px 16px"}}>
            <div style={{marginBottom:12}}><L req>Return Remark</L><TX value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} placeholder="Reason…" style={{borderColor:"#FECACA"}}/></div>
            <div style={{...lblStyle,marginBottom:8}}>Mark Problematic Items</div>
            {returnItems.map((item,i)=>(
              <div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,background:item.issue?"#FEF2F2":T.bg,border:`1px solid ${item.issue?"#FECACA":T.border}`,marginBottom:5,cursor:"pointer"}}>
                <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#B91C1C":"#fff",border:`2px solid ${item.issue?"#B91C1C":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{item.issue&&Ic.x}</div>
                <span style={{fontSize:12,color:item.issue?"#B91C1C":"#374151"}}>{item.name}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <GBtn onClick={()=>setShowReturn(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GBtn>
              <PBtn danger onClick={async()=>{if(!returnRemark.trim()){alert("Remark required.");return;}setSaving(true);const issues=returnItems.filter(x=>x.issue).map(x=>x.name);const h={step:10,date:nowDate(),time:nowTime(),note:"Returned — Issues",returnRemark,issueItems:issues,reversedFrom:11};await onUpdate({...order,step:10,history:[...(order.history||[]),h]});setSaving(false);setShowReturn(false);setReturnRemark("");}} disabled={saving} style={{flex:2,justifyContent:"center"}}>{Ic.rotate} {saving?"Saving…":"Return to Branch"}</PBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItem({icon,title,desc,children}){
  return(
    <div style={cardSt}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,background:T.bg,display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:T.navy,flexShrink:0}}>{icon}</span>
        <div><div style={{fontWeight:700,fontSize:13,color:T.navy}}>{title}</div>{desc&&<div style={{fontSize:11,color:T.grey,marginTop:1}}>{desc}</div>}</div>
      </div>
      <div style={{padding:"14px 16px"}}>{children}</div>
    </div>
  );
}

// ── Order Detail ───────────────────────────────────────────────────────────
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin,allOrders}){
  const s=getStep(order.step);
  const ph=getPhase(order.step);
  const isCash=order.orderType==="cash";
  const upfront=order.billingData&&order.step>=7?calcUpfront(order):null;
  return(
    <div>
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <GBtn onClick={onBack}>{Ic.arrowL} Back</GBtn>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:700,color:T.navy}}>{order.phoneModel}</span>
            <span style={{fontSize:10,color:T.grey,background:T.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${T.border}`}}>{shortId(order.id)}</span>
            <StepPill step={order.step}/>
          </div>
          <div style={{fontSize:11,color:T.grey,marginTop:2}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
        </div>
        {isAdmin&&<div style={{display:"flex",gap:6}}><GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn><button onClick={onDelete} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"7px 12px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{Ic.trash} Delete</button></div>}
      </div>

      {/* Phase progress card */}
      <div style={{...cardSt,padding:"16px 18px",marginBottom:14}}>
        <PhaseBar currentStep={order.step}/>
        <div style={{marginTop:12,background:T.bg,borderRadius:7,padding:"9px 12px",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:ph?.color||T.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0,fontSize:12}}>{order.step===13?Ic.check:PHASE_ICONS[ph?.id]||Ic.arrowR}</div>
          <div><div style={{fontWeight:700,fontSize:12,color:T.navy}}>Step {order.step} — {s.label}</div><div style={{fontSize:11,color:T.grey}}>{s.desc}</div></div>
        </div>
      </div>

      {/* Order info card */}
      <div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Order Information</CardHdr>
        <div style={{padding:"14px 16px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10}}>
            {[!isCash&&["Merchant",order.merchant||"—"],!isCash&&["Agreement No.",order.agreementNumber||"—"],!isCash&&["Approval Date",fDate(order.aeonApprovalDate)],!isCash&&["Finance Price",fRM(order.financePrice)],!isCash&&["Stamping Fee",fRM(order.stampingFee)],!isCash&&["Agreement Fee",fRM(order.agreementFee)],isCash&&["Retail Price",fRM(order.retailPrice)],["Deposit",fRM(order.deposit)],order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate)],order.invoiceNo&&["Invoice No.",order.invoiceNo],order.knockOffDate&&["Knock-off Date",fDate(order.knockOffDate)]].filter(Boolean).map(([l,v])=>(
              <InfoRow key={l} label={l} value={v}/>
            ))}
          </div>
          {order.adminRemark&&<><div style={{height:1,background:T.border,margin:"12px 0"}}/><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Admin Remark</div><div style={{fontSize:12,color:"#374151",background:"#FFFBEB",padding:"8px 10px",borderRadius:6,border:"1px solid #FDE68A"}}>{order.adminRemark}</div></>}
        </div>
      </div>

      {/* Upfront breakdown */}
      {upfront&&<div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Upfront Payment Breakdown</CardHdr>
        <div style={{padding:"12px 16px"}}>
          {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${T.border}`,color:"#374151"}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>
          ))}
          {order.billingData?.monthlyInstallment&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${T.border}`,color:"#374151"}}><span>1st Monthly Installment</span><span style={{fontWeight:600}}>{fRM(order.billingData.monthlyInstallment)}</span></div>}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:T.navy}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
        </div>
      </div>}

      {/* Billing details */}
      {order.billingData&&<div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Billing Details</CardHdr>
        <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
          {[["Billing Date",fDate(order.billingData.billingDate)],["Customer IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Monthly",fRM(order.billingData.monthlyInstallment)]].filter(([,v])=>v&&v!=="RM 0.00").map(([l,v])=><InfoRow key={l} label={l} value={v}/>)}
          {order.billingData.customerAddress&&<div style={{gridColumn:"1/-1"}}><InfoRow label="Address" value={`${order.billingData.customerAddress}, ${order.billingData.customerPostCode} ${order.billingData.customerCity}`}/></div>}
        </div>
      </div>}

      {/* Checklist */}
      {order.checklistItems&&<div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length})</CardHdr>
        <div style={{padding:"10px 14px"}}>
          {order.checklistItems.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:5,background:item.checked?"#F0FDF4":"#FEF2F2",marginBottom:4}}>
              <span style={{color:item.checked?"#15803D":"#B91C1C",fontSize:11}}>{item.checked?Ic.check:Ic.x}</span>
              <span style={{fontSize:11,color:item.checked?"#15803D":"#B91C1C"}}>{item.name}</span>
            </div>
          ))}
        </div>
      </div>}

      {/* Two-col: timeline + action */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
        <div style={cardSt}>
          <CardHdr>Tracking Timeline</CardHdr>
          <div style={{padding:"14px 16px"}}><Timeline order={order}/></div>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Required Action</div>
          <ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate} allOrders={allOrders}/>
        </div>
      </div>
    </div>
  );
}

// ── Order Form ─────────────────────────────────────────────────────────────
function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch,srList}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositSlip:null};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCash=f.orderType==="cash";
  const isReady=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const REQUIRED_ALWAYS=["phoneModel","customerName"];
  const REQUIRED_CCM=["financePrice","stampingFee","agreementFee","deposit"];
  const REQUIRED_CASH=["retailPrice","deposit"];
  const allReq=[...REQUIRED_ALWAYS,...(isCash?REQUIRED_CASH:REQUIRED_CCM)];
  const missing=allReq.filter(k=>!f[k]?.toString().trim());
  const submit=async()=>{
    if(missing.length>0){alert("Please fill in all required fields.");return;}
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile);
    const initStep=isReady?4:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"},{step:4,date:nowDate(),time:nowTime(),note:"Dispatching"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHist});
  };
  const inp=(k,l,t="text",req=false,span=false)=>(
    <div key={k} style={span?{gridColumn:"1/-1"}:{}}>
      <L req={req}>{l}</L>
      <I type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={req&&missing.includes(k)?{borderColor:"#FECACA"}:{}}/>
    </div>
  );
  const Sec=({title})=><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em",gridColumn:"1/-1",borderBottom:`1px solid ${T.border}`,paddingBottom:6,marginTop:4}}>{title}</div>;
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <GBtn onClick={onCancel}>{Ic.arrowL} Back</GBtn>
        <div style={{fontSize:15,fontWeight:700,color:T.navy}}>{order?"Edit Order":"New Order Request"}</div>
      </div>
      <div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Order Type</CardHdr>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <L req>Stock Status</L>
            <div style={{display:"flex",gap:8}}>
              {[["stock_request","Stock Request"],["ready","Ready Stock"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"9px 6px",borderRadius:7,border:`2px solid ${f.stockStatus===v?T.navy:T.border}`,background:f.stockStatus===v?T.navy:T.white,color:f.stockStatus===v?"#fff":T.grey,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
            {isReady&&<div style={{fontSize:10,color:"#15803D",marginTop:5,fontWeight:600}}>Will skip to Step 4 on submit</div>}
          </div>
          <div>
            <L req>Order Type</L>
            <div style={{display:"flex",gap:8}}>
              {[["ccm","CCM Order"],["cash","Cash Order"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"9px 6px",borderRadius:7,border:`2px solid ${f.orderType===v?T.navy:T.border}`,background:f.orderType===v?T.navy:T.white,color:f.orderType===v?"#fff":T.grey,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{...cardSt,marginBottom:14}}>
        <CardHdr>Order Details</CardHdr>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {inp("phoneModel","Phone Model / Item","text",true)}
          {inp("customerName","Customer Name","text",true)}
          <div><L>Branch</L><S value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</S></div>
          <div><L>Sales Agent</L>{branchSRs.length>0?<S value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</S>:<I value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID"/>}</div>
          {!isCash&&<>
            <Sec title="CCM / Financing"/>
            <div><L>Merchant</L><S value={f.merchant} onChange={e=>set("merchant",e.target.value)}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</S></div>
            {inp("agreementNumber","Agreement No.")}
            {inp("aeonApprovalDate","Aeon Approval Date","date")}
            {inp("financePrice","Finance Price (RM)","number",true)}
            {inp("stampingFee","Stamping Fee (RM)","number",true)}
            {inp("agreementFee","Agreement Fee (RM)","number",true)}
            {inp("deposit","Deposit (RM)","number",true)}
          </>}
          {isCash&&<>
            <Sec title="Cash Order"/>
            {inp("retailPrice","Retail Price (RM)","number",true)}
            {inp("deposit","Deposit (RM)","number",true)}
            {inp("depositPaymentDate","Deposit Payment Date","date")}
            <div><L>Deposit Payment Slip</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}</div>
          </>}
        </div>
      </div>
      {missing.length>0&&!order&&<div style={{padding:"9px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:7,fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Ic.alert} Fill all required fields to submit.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <GBtn onClick={onCancel}>Cancel</GBtn>
        <PBtn onClick={submit} disabled={!order&&missing.length>0}>{isReady?"Submit & Dispatch":"Submit Order Request"}</PBtn>
      </div>
    </div>
  );
}

// ── Batch Archive ──────────────────────────────────────────────────────────
function BatchArchive({orders,onSave,onClose}){
  const completed=orders.filter(o=>o.step===13);
  const [sel,setSel]=useState(new Set());
  const toggleAll=()=>setSel(sel.size===completed.length?new Set():new Set(completed.map(o=>o.id)));
  const del=async()=>{
    if(!sel.size)return;
    if(!confirm(`Remove ${sel.size} completed order(s) permanently?`))return;
    await onSave(orders.filter(o=>!sel.has(o.id)));
    onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{...cardSt,width:"90%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{background:T.navy,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{Ic.trash} Remove Completed Orders</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:18}}>✕</button>
        </div>
        <div style={{padding:16,overflowY:"auto",flex:1}}>
          {completed.length===0?<div style={{textAlign:"center",padding:24,color:T.grey,fontSize:13}}>No completed orders yet.</div>:<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:12,color:T.grey}}>{completed.length} completed order(s)</div>
              <button onClick={toggleAll} style={{fontSize:11,color:T.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{sel.size===completed.length?"Deselect All":"Select All"}</button>
            </div>
            {completed.map(o=>(
              <div key={o.id} onClick={()=>setSel(p=>{const n=new Set(p);n.has(o.id)?n.delete(o.id):n.add(o.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:sel.has(o.id)?"#FEF2F2":T.bg,border:`1px solid ${sel.has(o.id)?"#FECACA":T.border}`,marginBottom:7,cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:4,background:sel.has(o.id)?"#B91C1C":"#fff",border:`2px solid ${sel.has(o.id)?"#B91C1C":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{sel.has(o.id)&&Ic.check}</div>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:T.navy}}>{o.phoneModel} · {o.customerName}</div><div style={{fontSize:10,color:T.grey}}>{shortId(o.id)} · {o.branch} · Knock-off: {fDate(o.knockOffDate)}</div></div>
              </div>
            ))}
          </>}
        </div>
        <div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <GBtn onClick={onClose}>Cancel</GBtn>
          <PBtn danger onClick={del} disabled={!sel.size}>{Ic.trash} Remove {sel.size>0?`(${sel.size})`:""}</PBtn>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[]}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState(()=>sessionStorage.getItem("orderView")||"list");
  const [selected,setSelected]=useState(()=>{try{const s=sessionStorage.getItem("orderSelected");return s?JSON.parse(s):null;}catch{return null;}});
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");
  const [showArchive,setShowArchive]=useState(false);

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);

  const nav=(v,sel=null)=>{setView(v);setSelected(sel);sessionStorage.setItem("orderView",v);sessionStorage.setItem("orderSelected",sel?JSON.stringify(sel):"null");};
  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];await save(list);nav("detail",o);};
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));nav("list");};

  // Active orders (not step 13)
  const activeOrders=orders.filter(o=>o.step!==13&&(!userBranch||o.branch===userBranch));
  const filtered=activeOrders.filter(o=>(filterPhase==="all"||getPhase(o.step)?.id===filterPhase)&&(filterBranch==="ALL"||o.branch===filterBranch)&&(!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:60,textAlign:"center",color:T.grey,fontSize:14}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=orders.find(o=>o.id===selected.id)||selected;
    return<><OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);nav("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>nav("list")} allOrders={activeOrders}/>{showArchive&&<BatchArchive orders={orders} onSave={async l=>{await save(l);}} onClose={()=>setShowArchive(false)}/>}</>;
  }
  if(view==="form")return<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{nav(editOrder?"detail":"list",editOrder||selected);setEditOrder(null);}}/>;

  const phaseCounts=PHASES.reduce((acc,ph)=>{acc[ph.id]=activeOrders.filter(o=>ph.steps.includes(o.step)).length;return acc;},{});
  const completedCount=orders.filter(o=>o.step===13&&(!userBranch||o.branch===userBranch)).length;

  return(
    <div>
      {showArchive&&<BatchArchive orders={orders} onSave={async l=>{await save(l);}} onClose={()=>setShowArchive(false)}/>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:T.navy}}>Order Tracking</div>
          <div style={{fontSize:11,color:T.grey,marginTop:2}}>{activeOrders.length} active · {completedCount} completed</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {isAdmin&&completedCount>0&&<GBtn onClick={()=>setShowArchive(true)}>{Ic.trash} Remove Completed ({completedCount})</GBtn>}
          <PBtn onClick={()=>{setEditOrder(null);nav("form");}}>{Ic.plus} New Order</PBtn>
        </div>
      </div>

      {/* Phase KPI cards — 2 per row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        {PHASES.map(ph=>{
          const count=phaseCounts[ph.id]||0;
          const active=filterPhase===ph.id;
          return(
            <div key={ph.id} onClick={()=>setFilterPhase(active?"all":ph.id)} style={{...cardSt,padding:"12px 14px",cursor:"pointer",borderColor:active?ph.color:T.border,borderWidth:active?2:1,transition:"all .15s",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:8,background:active?ph.color:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:active?"#fff":ph.color,flexShrink:0,transition:"all .15s"}}>{PHASE_ICONS[ph.id]}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
                <div style={{fontSize:22,fontWeight:800,color:active?ph.color:T.navy,lineHeight:1}}>{count}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + filter */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <I placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:160}}/>
        {isAdmin&&<S value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</S>}
      </div>

      {/* Order cards */}
      {filtered.length===0
        ?<div style={{...cardSt,padding:"44px 20px",textAlign:"center",color:T.grey,fontSize:13}}>{search||filterPhase!=="all"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click New Order to get started."}</div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
          {filtered.map(o=>{
            const s=getStep(o.step);
            const ph=getPhase(o.step);
            const pct=Math.round(((Math.min(o.step,12)-1)/11)*100);
            const phColor=ph?.color||T.grey;
            const lastHist=(o.history||[]).slice(-1)[0];
            return(
              <div key={o.id} onClick={()=>nav("detail",o)} style={{...cardSt,cursor:"pointer",transition:"box-shadow .15s,border-color .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 14px rgba(10,22,40,.07)";e.currentTarget.style.borderColor="#C4CDD8";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=T.border;}}>
                {/* Progress strip */}
                <div style={{height:3,background:T.border}}><div style={{height:"100%",width:`${pct}%`,background:phColor,transition:"width .3s"}}/></div>
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.navy,marginBottom:1}}>{o.phoneModel}</div>
                      <div style={{fontSize:11,color:T.grey}}>{o.customerName}</div>
                    </div>
                    <span style={{fontSize:9,color:T.grey,background:T.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{shortId(o.id)}</span>
                  </div>
                  <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                    {ph&&<span style={{fontSize:9,fontWeight:700,color:phColor,background:`${phColor}12`,padding:"2px 7px",borderRadius:3,border:`1px solid ${phColor}30`}}>{ph.label}</span>}
                    {o.stockStatus==="ready"&&<span style={{fontSize:9,fontWeight:600,color:T.blue,background:"#EFF6FF",padding:"2px 7px",borderRadius:3,border:"1px solid #BFDBFE"}}>Ready Stock</span>}
                    {o.orderType==="cash"&&<span style={{fontSize:9,fontWeight:600,color:"#15803D",background:"#F0FDF4",padding:"2px 7px",borderRadius:3,border:"1px solid #BBF7D0"}}>Cash</span>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:700,color:phColor}}>Step {o.step}/12 · {s.label}</span>
                    <span style={{fontSize:10,color:T.grey}}>{pct}%</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{flex:1,height:3,background:T.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:phColor,borderRadius:2}}/></div>
                    <span style={{fontSize:9,color:T.grey,flexShrink:0}}>{o.salesAgentName||o.salesAgentId||"—"}</span>
                  </div>
                  {lastHist?.date&&<div style={{fontSize:10,color:T.grey,marginTop:5}}>Updated {fDT(lastHist.date,lastHist.time)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
