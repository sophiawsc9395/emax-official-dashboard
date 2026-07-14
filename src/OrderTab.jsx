import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];

const PHASES=[
  {id:"stock",label:"Stock Order",steps:[1,2,3]},
  {id:"transfer",label:"Stock Transfer",steps:[4,5]},
  {id:"billing",label:"Billing",steps:[6,7,8]},
  {id:"claim",label:"Claim",steps:[9,10,11,12]},
];

const STEPS=[
  {step:1,label:"New Order Request",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsRemark:true},
  {step:3,label:"Arrived HQ",desc:"Item received at HQ.",who:"admin",phase:"stock"},
  {step:4,label:"Dispatched to Branch",desc:"Item dispatched from HQ to branch.",who:"admin",phase:"transfer",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",desc:"Branch confirms receipt of item.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",desc:"Branch submits billing request form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",desc:"Customer collects device and payment confirmed.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Collection Proof"},{key:"paymentProof",label:"Payment Proof"}]},
  {step:9,label:"Collection Verified",desc:"HQ verifies collection and upfront payment.",who:"admin",phase:"claim",needsVerification:true},
  {step:10,label:"Agreement Checklist",desc:"Branch completes agreement checklist.",who:"both",phase:"claim",needsChecklist:true},
  {step:11,label:"Agreement at HQ",desc:"HQ receives original signed agreement.",who:"admin",phase:"claim",canReverse:true},
  {step:12,label:"Claim Released",desc:"HQ reviews and releases claim.",who:"admin",phase:"claim",needsFiles:[{key:"claimRef",label:"Claim Reference",optional:true}]},
];

const CHECKLIST_ITEMS=[
  "Aeon Application Form (3 pages)",
  "Invoice",
  "Result List",
  "Notice 1 — Application (2 pages × 2 sets)",
  "Notice 2 — Approval (8 pages)",
  "Agreement (16 pages)",
  "IC Copy",
  "AutoDebit Form (Personal Account)",
  "Bank Proof (Personal Account)",
];

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>{const d=new Date();return`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
const fDT=(date,time)=>date?(time?`${fDate(date)} ${time}`:fDate(date)):"—";
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];
const getPhase=step=>PHASES.find(p=>p.steps.includes(step));
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";
const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:f.name,data:r.result});r.readAsDataURL(f);});
const calcUpfront=o=>{const a=parseFloat(o.agreementFee)||0,s=parseFloat(o.stampingFee)||0,d=parseFloat(o.deposit)||0,m=parseFloat(o.billingData?.monthlyInstallment)||0;return{a,s,d,m,total:a+s+d+m};};

/* ── SVG Icons (no emoji) ─────────────────────────────────────────────── */
const Icon={
  box:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  truck:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  card:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  check:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  plus:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  arrow:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  arrowL:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  file:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  clipboard:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  user:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  alert:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  edit:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  rotate:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>,
  download:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  ready:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  cash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
};

const PHASE_ICONS={stock:Icon.box,transfer:Icon.truck,billing:Icon.card,claim:Icon.check};

/* ── Shared styles ────────────────────────────────────────────────────── */
const T={navy:"#0A1628",navyLight:"#162B52",blue:"#1E6FDB",grey:"#8A96A8",border:"#E4EAF2",bg:"#F7F9FC",white:"#fff"};
const inputStyle={width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif",background:T.white,boxSizing:"border-box",color:T.navy,outline:"none"};
const labelStyle={fontSize:10,fontWeight:700,color:T.grey,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"};
const cardStyle={background:T.white,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"};

function Lbl({children,req}){return<label style={labelStyle}>{children}{req&&<span style={{color:"#B91C1C"}}> *</span>}</label>;}
function Inp(p){return<input style={{...inputStyle,...p.style}} {...p}/>;}
function Sel({children,...p}){return<select style={{...inputStyle,...p.style}} {...p}>{children}</select>;}
function Txt(p){return<textarea style={{...inputStyle,resize:"vertical",...p.style}} {...p}/>;}
function Divider(){return<div style={{height:1,background:T.border,margin:"14px 0"}}/>;}
function SecHdr({children}){return<div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>{children}</div>;}
function PrimaryBtn({children,onClick,disabled,style={}}){
  return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":T.navy,color:disabled?"#8A96A8":"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;
}
function GhostBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:T.bg,color:T.navy,border:`1px solid ${T.border}`,borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;
}
function DangerBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...style}}>{children}</button>;
}

/* ── Phase Progress Bar ───────────────────────────────────────────────── */
function PhaseProgress({currentStep}){
  return(
    <div style={{display:"flex",alignItems:"flex-start",gap:0,marginBottom:20}}>
      {PHASES.map((ph,i)=>{
        const maxS=Math.max(...ph.steps),minS=Math.min(...ph.steps);
        const done=currentStep>maxS;
        const active=ph.steps.includes(currentStep);
        const lineColor=done?"#0A1628":"#E4EAF2";
        return(
          <div key={ph.id} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
            <div style={{display:"flex",alignItems:"center",width:"100%"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:done||active?"#0A1628":"#F7F9FC",border:`2px solid ${done||active?"#0A1628":"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:done||active?"#fff":T.grey}}>
                {done?<span style={{fontSize:11,fontWeight:800}}>{Icon.check}</span>:PHASE_ICONS[ph.id]}
              </div>
              {i<PHASES.length-1&&<div style={{flex:1,height:2,background:lineColor,margin:"0 6px"}}/>}
            </div>
            <div style={{marginTop:6,paddingLeft:2}}>
              <div style={{fontSize:10,fontWeight:700,color:active?"#0A1628":done?"#4A5568":"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>{ph.label}</div>
              {active&&<div style={{fontSize:9,color:T.grey,marginTop:1}}>Step {currentStep}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Step Pill ────────────────────────────────────────────────────────── */
function StepPill({step}){
  const s=getStep(step);
  const ph=getPhase(step);
  const colors={stock:["#EFF6FF","#1E6FDB"],transfer:["#F5F3FF","#7C3AED"],billing:["#FFFBEB","#B45309"],claim:["#F0FDF4","#15803D"]};
  const [bg,fg]=colors[ph?.id]||["#F3F4F6","#4A5568"];
  return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:10,fontWeight:700,background:bg,color:fg,whiteSpace:"nowrap"}}>{s.label}</span>;
}

/* ── Tracking Timeline ────────────────────────────────────────────────── */
function Timeline({order}){
  const current=order.step;
  let lastPhase=null;
  return(
    <div>
      {STEPS.map((s,i)=>{
        const done=current>s.step;
        const active=current===s.step;
        const hist=(order.history||[]).find(h=>h.step===s.step);
        const ph=getPhase(s.step);
        const showPh=ph&&ph.id!==lastPhase;
        if(ph)lastPhase=ph.id;
        return(
          <div key={s.step}>
            {showPh&&<div style={{fontSize:9,fontWeight:800,color:T.grey,textTransform:"uppercase",letterSpacing:"0.08em",padding:"8px 0 5px 40px",marginBottom:4,marginTop:i>0?8:0,borderBottom:`1px solid ${T.border}`}}>{ph.label}</div>}
            <div style={{display:"flex",position:"relative",gap:0}}>
              {i<STEPS.length-1&&<div style={{position:"absolute",left:13,top:28,width:1,height:"calc(100% - 4px)",background:done?"#0A1628":"#E4EAF2",zIndex:0}}/>}
              <div style={{flexShrink:0,width:26,height:26,borderRadius:"50%",background:done?"#0A1628":active?"#0A1628":"#F7F9FC",border:`2px solid ${done?"#0A1628":active?"#0A1628":"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:12,marginTop:1,color:done||active?"#fff":T.grey,transition:"all .2s",flexShrink:0}}>
                {done?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                :active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>
                :<span style={{fontSize:9,fontWeight:700}}>{s.step}</span>}
              </div>
              <div style={{flex:1,paddingBottom:i<STEPS.length-1?12:0,paddingTop:2}}>
                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:done||active?600:400,color:done?"#0A1628":active?"#0A1628":"#9CA3AF"}}>{s.label}</span>
                  {active&&<span style={{background:"#FEF9C3",color:"#92400E",padding:"1px 7px",borderRadius:3,fontSize:9,fontWeight:700,border:"1px solid #FDE68A"}}>Current</span>}
                  {hist?.date&&<span style={{fontSize:10,color:T.grey}}>{fDT(hist.date,hist.time)}</span>}
                </div>
                {hist&&(hist.remark||hist.invoiceNo||hist.returnRemark||hist.files||hist.collectionChecked!==undefined||hist.checklistItems||hist.verificationRemark)&&(
                  <div style={{marginTop:5,background:T.bg,borderRadius:7,padding:"7px 10px",border:`1px solid ${T.border}`,fontSize:11,color:"#374151"}}>
                    {hist.remark&&<div style={{marginBottom:2}}>Remark: {hist.remark}</div>}
                    {hist.invoiceNo&&<div style={{marginBottom:2,color:"#1E6FDB",fontWeight:600}}>Invoice No: {hist.invoiceNo}</div>}
                    {hist.verificationRemark&&<div style={{marginBottom:2}}>Note: {hist.verificationRemark}</div>}
                    {hist.returnRemark&&<div style={{marginBottom:2,color:"#B91C1C",fontWeight:600}}>Returned: {hist.returnRemark}</div>}
                    {hist.issueItems?.length>0&&<div style={{marginBottom:2,color:"#B91C1C"}}>Issues: {hist.issueItems.join(" · ")}</div>}
                    {hist.collectionChecked!==undefined&&<div style={{fontSize:10,color:hist.collectionChecked?"#15803D":"#B91C1C"}}>{hist.collectionChecked?"✓":"✗"} Collection verified · {hist.paymentChecked?"✓":"✗"} Payment verified</div>}
                    {hist.checklistItems&&<div style={{fontSize:10}}>{hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items completed</div>}
                    {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&(
                      <a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,color:"#1E6FDB",textDecoration:"none",background:"#EFF6FF",padding:"2px 7px",borderRadius:4,fontWeight:600,marginRight:4,marginTop:3}}>{Icon.download} {f.name}</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Billing Form ─────────────────────────────────────────────────────── */
function BillingForm({order,onSubmit,onCancel}){
  const [f,setF]=useState(order.billingData||{billingDate:nowDate(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",monthlyInstallment:""});
  const [fls,setFls]=useState({deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const REQUIRED=["billingDate","customerFullName","customerIC","customerHP","customerEmail","customerAddress","customerPostCode","customerCity","itemCode","imeiSerial","cashPriceOnListing","monthlyInstallment"];
  const canSubmit=REQUIRED.every(k=>f[k]?.toString().trim());
  const submit=async()=>{
    if(!canSubmit){alert("Please fill in all required fields.");return;}
    setSaving(true);
    const data={...f};
    for(const[k,file] of Object.entries(fls))if(file)data[k]=await readFile(file);
    onSubmit(data);setSaving(false);
  };
  const field=(k,l,t="text",req=false,span=false)=>(
    <div key={k} style={span?{gridColumn:"1/-1"}:{}}>
      <Lbl req={req}>{l}</Lbl>
      <Inp type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)}/>
    </div>
  );
  return(
    <div style={{...cardStyle,marginBottom:16}}>
      <div style={{background:T.navy,padding:"14px 18px"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Billing Request Form</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:2}}>All required fields must be completed</div>
      </div>
      <div style={{padding:18}}>
        <SecHdr>Billing Info</SecHdr>
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:16}}>
          {field("billingDate","Billing Date","date",true)}
        </div>
        <SecHdr>Customer Details</SecHdr>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {field("customerFullName","Customer Full Name","text",true)}
          {field("customerIC","Customer IC Number","text",true)}
          {field("customerHP","HP Number","tel",true)}
          {field("customerEmail","Email","email",true)}
          {field("customerAddress","Address","text",true,true)}
          {field("customerPostCode","Post Code","text",true)}
          {field("customerCity","City","text",true)}
        </div>
        <SecHdr>Item Details</SecHdr>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {field("itemCode","Item Code","text",true)}
          {field("imeiSerial","IMEI / Serial Number","text",true)}
          {field("freeGiftItemCode","Free Gift Item Code (if any)","text",false)}
          {field("freeGiftItemName","Free Gift Item Name (if any)","text",false)}
          {field("cashPriceOnListing","Cash Price on Result Listing (RM)","number",true)}
          {field("monthlyInstallment","Monthly Installment (RM)","number",true)}
        </div>
        <SecHdr>File Uploads</SecHdr>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {[["deviceSerialImg","Device Serial No. Image",true],["freeGiftSerialImg","Free Gift Serial No. Image (if any)",false],["resultListFile","Result Listing File",true],["agreementFile","Agreement File",true]].map(([k,l,req])=>(
            <div key={k}><Lbl req={req}>{l}</Lbl>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFls(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
              {(fls[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2,fontWeight:600}}>Attached: {fls[k]?.name||f[k]?.name}</div>}
            </div>
          ))}
        </div>
        {!canSubmit&&<div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:7,padding:"8px 12px",fontSize:11,color:"#92400E",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Icon.alert} All required fields must be completed before submitting.</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={!canSubmit||saving}>{saving?"Saving…":"Submit Billing Request"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel,issueItems=[]}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const allChecked=items.every(x=>x.checked);
  return(
    <div style={{...cardStyle,marginBottom:16}}>
      <div style={{background:T.navy,padding:"14px 18px"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Agreement Checklist</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:2}}>Tick all items before sending documents to HQ</div>
      </div>
      <div style={{padding:16}}>
        {items.map((item,i)=>(
          <div key={i} onClick={()=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x))} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":T.bg,border:`1px solid ${item.issue&&!item.checked?"#FECACA":item.checked?"#BBF7D0":T.border}`,marginBottom:8,cursor:"pointer",transition:"all .15s"}}>
            <div style={{width:18,height:18,borderRadius:4,background:item.checked?T.navy:"#fff",border:`2px solid ${item.checked?T.navy:item.issue?"#EF4444":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s",color:"#fff"}}>
              {item.checked&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <span style={{fontSize:12,fontWeight:item.checked?600:400,color:item.issue&&!item.checked?"#B91C1C":item.checked?"#15803D":"#374151"}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:10,marginLeft:7,color:"#B91C1C",fontWeight:700}}>Flagged by HQ</span>}</span>
          </div>
        ))}
        {!allChecked&&<div style={{padding:"8px 12px",background:"#FFFBEB",borderRadius:7,border:"1px solid #FDE68A",fontSize:11,color:"#92400E",marginTop:4,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>{Icon.alert} All items must be ticked to proceed.</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <PrimaryBtn onClick={()=>allChecked&&onSubmit(items)} disabled={!allChecked}>Submit Checklist</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Action Panel ─────────────────────────────────────────────────────── */
function ActionPanel({order,isAdmin,onUpdate}){
  const step=order.step;
  const nextDef=step<12?getStep(step+1):null;
  const [remark,setRemark]=useState("");
  const [invoiceNo,setInvoiceNo]=useState("");
  const [files,setFiles]=useState({});
  const [collection,setCollection]=useState(false);
  const [payment,setPayment]=useState(false);
  const [verRemark,setVerRemark]=useState("");
  const [saving,setSaving]=useState(false);
  const [showBilling,setShowBilling]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(n=>({name:n,issue:false})));

  if(step===12)return(
    <div style={{background:"#F0FDF4",borderRadius:10,padding:"16px 18px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:12}}>
      <div style={{width:36,height:36,borderRadius:"50%",background:"#15803D",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div><div style={{fontWeight:700,fontSize:14,color:"#15803D"}}>Order Complete</div><div style={{fontSize:12,color:"#166534",marginTop:2}}>All 12 steps done. Claim released.</div></div>
    </div>
  );
  if(!nextDef)return null;

  // Branch can advance step 5, 6, 10
  const branchOk=isAdmin||[5,6,10].includes(nextDef.step);
  // Step 6: billing form
  if(nextDef.step===6&&!isAdmin){
    if(showBilling)return<BillingForm order={order} onCancel={()=>setShowBilling(false)} onSubmit={async d=>{setSaving(true);const h={step:6,date:nowDate(),time:nowTime(),note:"Billing Request",billingData:d};await onUpdate({...order,step:6,billingData:d,history:[...(order.history||[]),h]});setSaving(false);setShowBilling(false);}}/>;
    return<ActionCard icon={Icon.clipboard} title="Billing Request" desc="Complete the billing form to advance this order."><PrimaryBtn onClick={()=>setShowBilling(true)} style={{width:"100%",justifyContent:"center"}}>Open Billing Request Form {Icon.arrow}</PrimaryBtn></ActionCard>;
  }
  // Step 10: checklist — BOTH admin and branch can advance
  if(nextDef.step===10){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    if(showChecklist)return<ChecklistForm issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async items=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items};await onUpdate({...order,step:10,checklistItems:items,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<ActionCard icon={Icon.clipboard} title="Agreement Checklist" desc="Complete the agreement checklist before sending to HQ."><PrimaryBtn onClick={()=>setShowChecklist(true)} style={{width:"100%",justifyContent:"center"}}>Open Agreement Checklist {Icon.arrow}</PrimaryBtn></ActionCard>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};for(const[k,f] of Object.entries(files))if(f)rf[k]=await readFile(f);
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,verificationRemark:verRemark||undefined,files:Object.keys(rf).length?rf:undefined,...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment}:{})};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    await onUpdate(updated);setSaving(false);setRemark("");setInvoiceNo("");setFiles({});setVerRemark("");setCollection(false);setPayment(false);
  };
  const ok=()=>{
    if(!branchOk)return false;
    if(nextDef.needsRemark&&isAdmin&&!remark.trim())return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsFiles){const req=nextDef.needsFiles.filter(f=>!f.optional);if(isAdmin&&req.some(f=>!files[f.key]))return false;}
    return true;
  };
  const upfront=order.billingData?calcUpfront(order):null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <ActionCard icon={Icon.arrow} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
        {!branchOk
          ?<div style={{fontSize:12,color:T.grey,fontStyle:"italic",padding:"4px 0"}}>Waiting for admin to process this step.</div>
          :<>
            {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}><Lbl req>Admin Remark — Supplier / ETA / Order Details</Lbl><Txt value={remark} onChange={e=>setRemark(e.target.value)} rows={3} placeholder="Supplier details, ETA, order reference…"/></div>}
            {nextDef.needsInvoiceNo&&isAdmin&&<>
              <div style={{marginBottom:12}}><Lbl req>Sales Invoice Number</Lbl><Inp value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
              {upfront&&<div style={{background:T.bg,borderRadius:8,padding:"12px 14px",border:`1px solid ${T.border}`,marginBottom:12}}>
                <div style={{...labelStyle,marginBottom:8}}>Upfront Payment Breakdown</div>
                {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d],["1st Monthly Installment",upfront.m]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${T.border}`,color:"#374151"}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:T.navy}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
              </div>}
            </>}
            {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
              <div style={{...labelStyle,marginBottom:8}}>Verification Checklist</div>
              {[[collection,setCollection,"Customer Collection Proof verified"],[payment,setPayment,"Upfront Payment Proof verified"]].map(([val,setter,label],i)=>(
                <div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:val?"#F0FDF4":T.bg,border:`1px solid ${val?"#BBF7D0":T.border}`,marginBottom:8,cursor:"pointer"}}>
                  <div style={{width:18,height:18,borderRadius:4,background:val?T.navy:"#fff",border:`2px solid ${val?T.navy:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>
                    {val&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span style={{fontSize:12,color:val?"#15803D":T.navy,fontWeight:val?600:400}}>{label}</span>
                </div>
              ))}
              <div style={{marginTop:8}}><Lbl>Remark (optional)</Lbl><Inp value={verRemark} onChange={e=>setVerRemark(e.target.value)} placeholder="Verification notes…"/></div>
            </div>}
            {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.map(({key,label,optional})=>(
              <div key={key} style={{marginBottom:12}}>
                <Lbl req={!optional}>{label}{optional?" (optional)":""}</Lbl>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
                {files[key]&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>Attached: {files[key].name}</div>}
              </div>
            ))}
            {!nextDef.needsRemark&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&<div style={{marginBottom:12}}><Lbl>Remark (optional)</Lbl><Inp value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
            <PrimaryBtn onClick={advance} disabled={!ok()||saving} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":`Confirm: ${nextDef.label}`} {!saving&&Icon.arrow}</PrimaryBtn>
          </>}
      </ActionCard>

      {/* Reverse step 11 → 10 */}
      {step===11&&isAdmin&&(!showReturn
        ?<DangerBtn onClick={()=>setShowReturn(true)} style={{width:"100%",justifyContent:"center"}}>{Icon.rotate} Return Agreement to Branch</DangerBtn>
        :<div style={{...cardStyle}}>
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:13,color:"#B91C1C"}}>Return Agreement to Branch</div>
          <div style={{padding:16}}>
            <div style={{marginBottom:12}}><Lbl req>Return Remark</Lbl><Txt value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} placeholder="Reason for returning…" style={{borderColor:"#FECACA"}}/></div>
            <div style={{...labelStyle,marginBottom:8}}>Mark Problematic Items</div>
            {returnItems.map((item,i)=>(
              <div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,background:item.issue?"#FEF2F2":T.bg,border:`1px solid ${item.issue?"#FECACA":T.border}`,marginBottom:5,cursor:"pointer"}}>
                <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#B91C1C":"#fff",border:`2px solid ${item.issue?"#B91C1C":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>
                  {item.issue&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                </div>
                <span style={{fontSize:12,color:item.issue?"#B91C1C":"#374151"}}>{item.name}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <GhostBtn onClick={()=>setShowReturn(false)} style={{flex:1,justifyContent:"center"}}>Cancel</GhostBtn>
              <button onClick={async()=>{if(!returnRemark.trim()){alert("Remark required.");return;}setSaving(true);const issues=returnItems.filter(x=>x.issue).map(x=>x.name);const h={step:10,date:nowDate(),time:nowTime(),note:"Returned — Issues",returnRemark,issueItems:issues,reversedFrom:11};await onUpdate({...order,step:10,history:[...(order.history||[]),h]});setSaving(false);setShowReturn(false);setReturnRemark("");}} disabled={saving} style={{flex:2,padding:"8px 0",background:"#B91C1C",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>{Icon.rotate} {saving?"Saving…":"Return to Branch"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCard({icon,title,desc,children}){
  return(
    <div style={cardStyle}>
      <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg,display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:T.navy}}>{icon}</span>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:T.navy}}>{title}</div>
          {desc&&<div style={{fontSize:11,color:T.grey,marginTop:1}}>{desc}</div>}
        </div>
      </div>
      <div style={{padding:"14px 16px"}}>{children}</div>
    </div>
  );
}

/* ── Order Detail ─────────────────────────────────────────────────────── */
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin}){
  const s=getStep(order.step);
  const isCash=order.orderType==="cash";
  const upfront=order.billingData&&order.step>=7?calcUpfront(order):null;
  return(
    <div>
      {/* Top nav bar */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18,flexWrap:"wrap"}}>
        <GhostBtn onClick={onBack}>{Icon.arrowL} Back</GhostBtn>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:700,color:T.navy}}>{order.phoneModel}</span>
            <span style={{fontSize:10,color:T.grey,background:T.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${T.border}`}}>{shortId(order.id)}</span>
            <StepPill step={order.step}/>
            <span style={{fontSize:10,fontWeight:600,color:T.grey,background:T.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${T.border}`,display:"inline-flex",alignItems:"center",gap:4}}>{order.stockStatus==="ready"?<>{Icon.ready} Ready Stock</>:"Stock Request"}</span>
            {isCash&&<span style={{fontSize:10,fontWeight:600,color:"#15803D",background:"#F0FDF4",padding:"2px 7px",borderRadius:4,border:"1px solid #BBF7D0",display:"inline-flex",alignItems:"center",gap:4}}>{Icon.cash} Cash</span>}
          </div>
          <div style={{fontSize:11,color:T.grey,marginTop:2}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
        </div>
        {isAdmin&&<div style={{display:"flex",gap:8}}>
          <GhostBtn onClick={onEdit}>{Icon.edit} Edit</GhostBtn>
          <DangerBtn onClick={onDelete}>{Icon.trash} Delete</DangerBtn>
        </div>}
      </div>

      {/* Phase progress */}
      <div style={{...cardStyle,padding:"16px 20px",marginBottom:16}}>
        <PhaseProgress currentStep={order.step}/>
        <div style={{background:T.bg,borderRadius:8,padding:"10px 14px",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:order.step===12?"#F0FDF4":T.navy,border:`2px solid ${order.step===12?"#BBF7D0":T.navy}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:order.step===12?"#15803D":"#fff"}}>
            {order.step===12?<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:<div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:order.step===12?"#15803D":T.navy}}>Step {order.step} of 12 — {s.label}</div>
            <div style={{fontSize:11,color:T.grey}}>{s.desc}</div>
          </div>
        </div>
      </div>

      {/* Two-column layout: left=timeline, right=info+action */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        {/* Left: tracking timeline */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={cardStyle}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Tracking Timeline</div></div>
            <div style={{padding:"14px 16px"}}><Timeline order={order}/></div>
          </div>
        </div>
        {/* Right: order info + action */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={cardStyle}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Order Information</div></div>
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[!isCash&&["Merchant",order.merchant||"—"],!isCash&&["Agreement No.",order.agreementNumber||"—"],!isCash&&["Approval Date",fDate(order.aeonApprovalDate)],!isCash&&["Finance Price",fRM(order.financePrice)],!isCash&&["Stamping Fee",fRM(order.stampingFee)],!isCash&&["Agreement Fee",fRM(order.agreementFee)],isCash&&["Retail Price",fRM(order.retailPrice)],["Deposit",fRM(order.deposit)],order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate)],order.invoiceNo&&["Invoice No.",order.invoiceNo]].filter(Boolean).map(([l,v])=>(
                  <div key={l}><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:600,color:T.navy}}>{v}</div></div>
                ))}
              </div>
              {order.adminRemark&&<><Divider/><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Admin Remark</div><div style={{fontSize:12,color:"#374151",background:"#FFFBEB",padding:"8px 10px",borderRadius:6,border:"1px solid #FDE68A"}}>{order.adminRemark}</div></>}
            </div>
          </div>
          {upfront&&<div style={cardStyle}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Upfront Payment Breakdown</div></div>
            <div style={{padding:"14px 16px"}}>
              {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d],["1st Monthly Installment",upfront.m]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${T.border}`,color:"#374151"}}><span>{l}</span><span style={{fontWeight:600}}>{fRM(v)}</span></div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:T.navy}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
            </div>
          </div>}
          {order.billingData&&<div style={cardStyle}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Billing Details</div></div>
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["Billing Date",fDate(order.billingData.billingDate)],["Customer IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Monthly",fRM(order.billingData.monthlyInstallment)]].filter(([,v])=>v&&v!=="RM 0.00").map(([l,v])=>(
                  <div key={l}><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{l}</div><div style={{fontSize:12,fontWeight:600,color:T.navy}}>{v}</div></div>
                ))}
              </div>
              {order.billingData.customerAddress&&<><Divider/><div style={{fontSize:9,color:T.grey,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Address</div><div style={{fontSize:12,color:"#374151"}}>{order.billingData.customerAddress}, {order.billingData.customerPostCode} {order.billingData.customerCity}</div></>}
            </div>
          </div>}
          {order.checklistItems&&<div style={cardStyle}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length})</div></div>
            <div style={{padding:"10px 14px"}}>
              {order.checklistItems.map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:5,background:item.checked?"#F0FDF4":"#FEF2F2",marginBottom:5}}>
                  <span style={{color:item.checked?"#15803D":"#B91C1C",fontWeight:700,fontSize:12,flexShrink:0}}>{item.checked?"✓":"✗"}</span>
                  <span style={{fontSize:11,color:item.checked?"#15803D":"#B91C1C"}}>{item.name}</span>
                </div>
              ))}
            </div>
          </div>}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Required Action</div>
            <ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate}/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Order Form ───────────────────────────────────────────────────────── */
function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch,srList}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositSlip:null};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCash=f.orderType==="cash";
  const isReady=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const requiredFields=["phoneModel","customerName"];
  const requiredCCM=["merchant","financePrice","stampingFee","agreementFee","deposit"];
  const requiredCash=["retailPrice","deposit"];
  const allRequired=[...requiredFields,...(isCash?requiredCash:requiredCCM)];
  const missingFields=allRequired.filter(k=>!f[k]?.toString().trim());
  const submit=async()=>{
    if(missingFields.length>0){alert(`Please fill in all required fields:\n${missingFields.map(k=>({phoneModel:"Phone Model",customerName:"Customer Name",merchant:"Merchant",financePrice:"Finance Price",stampingFee:"Stamping Fee",agreementFee:"Agreement Fee",deposit:"Deposit",retailPrice:"Retail Price"})[k]||k).join("\n")}`);return;}
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile);
    const initStep=isReady?4:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"},{step:4,date:nowDate(),time:nowTime(),note:"Dispatching"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHist});
  };
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
        <GhostBtn onClick={onCancel}>{Icon.arrowL} Back</GhostBtn>
        <div style={{fontSize:15,fontWeight:700,color:T.navy}}>{order?"Edit Order":"New Order Request"}</div>
      </div>
      {/* Order type card */}
      <div style={{...cardStyle,marginBottom:14}}>
        <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Order Type</div></div>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <Lbl req>Stock Status</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["stock_request","Stock Request"],["ready","Ready Stock"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"9px 8px",borderRadius:7,border:`2px solid ${f.stockStatus===v?T.navy:T.border}`,background:f.stockStatus===v?T.navy:T.white,color:f.stockStatus===v?"#fff":T.grey,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>{f.stockStatus===v&&l==="Ready Stock"&&<span style={{color:"#FFD500"}}>{Icon.ready}</span>}{l}</button>
              ))}
            </div>
            {isReady&&<div style={{fontSize:10,color:"#15803D",marginTop:5,fontWeight:600}}>Will advance to Step 4 on submit</div>}
          </div>
          <div>
            <Lbl req>Order Type</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["ccm","CCM Order"],["cash","Cash Order"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"9px 8px",borderRadius:7,border:`2px solid ${f.orderType===v?T.navy:T.border}`,background:f.orderType===v?T.navy:T.white,color:f.orderType===v?"#fff":T.grey,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>{f.orderType===v&&v==="cash"&&Icon.cash}{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Basic info */}
      <div style={{...cardStyle,marginBottom:14}}>
        <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Basic Information</div></div>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl req>Phone Model / Item</Lbl><Inp value={f.phoneModel} onChange={e=>set("phoneModel",e.target.value)} style={{borderColor:!f.phoneModel&&missingFields.includes("phoneModel")?"#FECACA":""}}/></div>
          <div><Lbl req>Customer Name</Lbl><Inp value={f.customerName} onChange={e=>set("customerName",e.target.value)} style={{borderColor:!f.customerName&&missingFields.includes("customerName")?"#FECACA":""}}/></div>
          <div><Lbl>Branch</Lbl><Sel value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</Sel></div>
          <div><Lbl>Sales Agent</Lbl>{branchSRs.length>0?<Sel value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</Sel>:<Inp value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID"/>}</div>
        </div>
      </div>
      {/* CCM */}
      {!isCash&&<div style={{...cardStyle,marginBottom:14}}>
        <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>CCM / Financing Details</div></div>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Merchant</Lbl><Sel value={f.merchant} onChange={e=>set("merchant",e.target.value)}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</Sel></div>
          <div><Lbl>Agreement No.</Lbl><Inp value={f.agreementNumber} onChange={e=>set("agreementNumber",e.target.value)}/></div>
          <div><Lbl>Aeon Approval Date</Lbl><Inp type="date" value={f.aeonApprovalDate} onChange={e=>set("aeonApprovalDate",e.target.value)}/></div>
          <div><Lbl req>Finance Price (RM)</Lbl><Inp type="number" value={f.financePrice} onChange={e=>set("financePrice",e.target.value)} style={{borderColor:!f.financePrice&&missingFields.includes("financePrice")?"#FECACA":""}}/></div>
          <div><Lbl req>Stamping Fee (RM)</Lbl><Inp type="number" value={f.stampingFee} onChange={e=>set("stampingFee",e.target.value)}/></div>
          <div><Lbl req>Agreement Fee (RM)</Lbl><Inp type="number" value={f.agreementFee} onChange={e=>set("agreementFee",e.target.value)}/></div>
          <div><Lbl req>Deposit (RM)</Lbl><Inp type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)}/></div>
        </div>
      </div>}
      {/* Cash */}
      {isCash&&<div style={{...cardStyle,marginBottom:14}}>
        <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}><div style={{fontSize:11,fontWeight:700,color:T.navy,textTransform:"uppercase",letterSpacing:"0.06em"}}>Cash Order Details</div></div>
        <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Retail Price (RM)</Lbl><Inp type="number" value={f.retailPrice} onChange={e=>set("retailPrice",e.target.value)}/></div>
          <div><Lbl req>Deposit (RM)</Lbl><Inp type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)}/></div>
          <div><Lbl>Deposit Payment Date</Lbl><Inp type="date" value={f.depositPaymentDate} onChange={e=>set("depositPaymentDate",e.target.value)}/></div>
          <div><Lbl>Deposit Payment Slip</Lbl><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>Attached: {slipFile?.name||f.depositSlip?.name}</div>}</div>
        </div>
      </div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
        {missingFields.length>0&&!order&&<div style={{padding:"8px 12px",background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:7,fontSize:11,color:"#92400E",display:"flex",alignItems:"center",gap:6,marginBottom:10}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Fill all required fields to submit.</div>}
        <PrimaryBtn onClick={submit} disabled={!order&&missingFields.length>0}>{isReady?"Submit & Dispatch":"Submit Order Request"}</PrimaryBtn>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[]}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState(()=>{const h=sessionStorage.getItem("orderView")||"list";return h;});
  const [selected,setSelected]=useState(()=>{try{const s=sessionStorage.getItem("orderSelected");return s?JSON.parse(s):null;}catch{return null;}});
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);

  // Persist view + selected in sessionStorage so refresh stays on same page
  const nav=(v,sel=null)=>{setView(v);setSelected(sel);sessionStorage.setItem("orderView",v);sessionStorage.setItem("orderSelected",sel?JSON.stringify(sel):"null");};

  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];await save(list);nav("detail",o);};
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));nav("list");};

  const myOrders=orders.filter(o=>!userBranch||o.branch===userBranch);
  const filtered=myOrders.filter(o=>(filterPhase==="all"||getPhase(o.step)?.id===filterPhase)&&(filterBranch==="ALL"||o.branch===filterBranch)&&(!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:60,textAlign:"center",color:T.grey,fontSize:14}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=orders.find(o=>o.id===selected.id)||selected;
    return<OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);nav("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>nav("list")}/>;
  }
  if(view==="form")return<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{nav(editOrder?"detail":"list",editOrder||selected);setEditOrder(null);}}/>;

  const stats=PHASES.map(ph=>({...ph,count:myOrders.filter(o=>ph.steps.includes(o.step)).length}));

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:T.navy}}>Order Tracking</div>
          <div style={{fontSize:11,color:T.grey,marginTop:2}}>{myOrders.length} total · {myOrders.filter(o=>o.step<12).length} active</div>
        </div>
        <PrimaryBtn onClick={()=>{setEditOrder(null);nav("form");}} style={{gap:6}}>{Icon.plus} New Order</PrimaryBtn>
      </div>

      {/* Phase stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:20}}>
        {stats.map(ph=>(
          <div key={ph.id} onClick={()=>setFilterPhase(filterPhase===ph.id?"all":ph.id)} style={{...cardStyle,padding:"12px 14px",cursor:"pointer",borderColor:filterPhase===ph.id?T.navy:T.border,borderWidth:filterPhase===ph.id?2:1,transition:"all .15s",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,borderRadius:8,background:filterPhase===ph.id?T.navy:T.bg,display:"flex",alignItems:"center",justifyContent:"center",color:filterPhase===ph.id?"#fff":T.navy,flexShrink:0}}>{PHASE_ICONS[ph.id]}</div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:11,fontWeight:700,color:T.grey,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
              <div style={{fontSize:22,fontWeight:800,color:T.navy,lineHeight:1}}>{ph.count}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <Inp placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:180}}/>
        {isAdmin&&<Sel value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:130}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</Sel>}
      </div>

      {/* Order grid */}
      {filtered.length===0
        ?<div style={{...cardStyle,padding:"48px 20px",textAlign:"center",color:T.grey,fontSize:13}}>{search||filterPhase!=="all"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click New Order to get started."}</div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>
          {filtered.map(o=>{
            const s=getStep(o.step);
            const ph=getPhase(o.step);
            const pct=Math.round(((o.step-1)/11)*100);
            const phColors={stock:T.blue,transfer:"#7C3AED",billing:"#B45309",claim:"#15803D"};
            const phColor=phColors[ph?.id]||T.grey;
            const lastHist=(o.history||[]).slice(-1)[0];
            return(
              <div key={o.id} onClick={()=>nav("detail",o)} style={{...cardStyle,cursor:"pointer",transition:"box-shadow .15s,border-color .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(10,22,40,.08)";e.currentTarget.style.borderColor="#C4CDD8";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor=T.border;}}>
                {/* Progress strip */}
                <div style={{height:3,background:T.border,borderRadius:"10px 10px 0 0",overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:o.step===12?"#15803D":T.navy,borderRadius:"10px 10px 0 0",transition:"width .3s"}}/></div>
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:T.navy,marginBottom:2}}>{o.phoneModel}</div>
                      <div style={{fontSize:11,color:T.grey}}>{o.customerName}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:9,color:T.grey,background:T.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${T.border}`,marginBottom:4}}>{shortId(o.id)}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8,flexWrap:"wrap"}}>
                    {ph&&<span style={{fontSize:9,fontWeight:700,color:phColor,background:`${phColor}12`,padding:"1px 7px",borderRadius:3,border:`1px solid ${phColor}30`}}>{ph.label}</span>}
                    {o.stockStatus==="ready"&&<span style={{fontSize:9,fontWeight:600,color:"#1E6FDB",background:"#EFF6FF",padding:"1px 7px",borderRadius:3,border:"1px solid #BFDBFE",display:"inline-flex",alignItems:"center",gap:3}}>{Icon.ready} Ready</span>}
                    {o.orderType==="cash"&&<span style={{fontSize:9,fontWeight:600,color:"#15803D",background:"#F0FDF4",padding:"1px 7px",borderRadius:3,border:"1px solid #BBF7D0",display:"inline-flex",alignItems:"center",gap:3}}>{Icon.cash} Cash</span>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:lastHist?.date?6:0}}>
                    <span style={{fontSize:10,fontWeight:700,color:phColor}}>Step {o.step}/12 · {s.label}</span>
                    <span style={{fontSize:10,color:T.grey}}>{pct}%</span>
                  </div>
                  {lastHist?.date&&<div style={{fontSize:10,color:T.grey}}>Updated {fDT(lastHist.date,lastHist.time)}</div>}
                  <div style={{marginTop:8,display:"flex",alignItems:"center",gap:6}}>
                    <div style={{flex:1,height:4,background:T.border,borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:o.step===12?"#15803D":T.navy,borderRadius:2}}/>
                    </div>
                    <span style={{fontSize:9,color:T.grey,fontWeight:600}}>{o.salesAgentName||o.salesAgentId||"—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
