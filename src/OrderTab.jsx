import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];

// Phase grouping
const PHASES=[
  {id:"stock",label:"Stock Order",color:"#1E6FDB",bg:"#EFF6FF",steps:[1,2,3]},
  {id:"transfer",label:"Stock Transfer",color:"#7C3AED",bg:"#F5F3FF",steps:[3,4,5]},
  {id:"billing",label:"Billing",color:"#D97706",bg:"#FFFBEB",steps:[5,6,7,8]},
  {id:"claim",label:"Claim",color:"#15803D",bg:"#F0FDF4",steps:[9,10,11,12]},
];

const STEPS=[
  {step:1,label:"New Order Request",icon:"📋",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",icon:"🛒",desc:"Purchase order placed with supplier.",who:"admin",needsRemark:true,phase:"stock"},
  {step:3,label:"Arrived HQ",icon:"🏢",desc:"Item received at HQ.",who:"admin",phase:"stock"},
  {step:4,label:"Dispatched to Branch",icon:"🚚",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",icon:"📦",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",icon:"💳",desc:"Branch submits billing request form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",icon:"🧾",desc:"Admin completes billing with invoice.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection & Payment",icon:"🤝",desc:"Customer collects device.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Customer Collection Proof"},{key:"paymentProof",label:"Upfront Payment Proof"}]},
  {step:9,label:"Phone Collection & Payment Verified",icon:"✔️",desc:"HQ verifies collection and payment.",who:"admin",phase:"claim",needsVerification:true},
  {step:10,label:"Agreement Checklist by Branch",icon:"📝",desc:"Branch ticks agreement checklist.",who:"branch",phase:"claim",needsChecklist:true},
  {step:11,label:"Agreement Arrived HQ",icon:"📄",desc:"HQ receives original agreement.",who:"admin",phase:"claim",canReverse:true},
  {step:12,label:"Checked & Sent for Claim",icon:"✅",desc:"HQ submits claim.",who:"admin",phase:"claim",needsFiles:[{key:"claimRef",label:"Claim Submission Reference",optional:true}]},
];

const CHECKLIST_ITEMS=[
  "Aeon Application Form — 3 pages",
  "Invoice",
  "Result List",
  "Notice 1 (Application) — 2 pages × 2 sets",
  "Notice 2 (Approval) — 8 pages",
  "Agreement — 16 pages",
  "IC Copy",
  "AutoDebit Form (Personal Account)",
  "Bank Proof (Personal Account)",
];

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const now=()=>{const d=new Date();return d.toISOString().split("T")[0];};
const nowTime=()=>{const d=new Date();return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};
const fDateTime=(date,time)=>{if(!date)return"—";return time?`${fDate(date)} ${time}`:fDate(date);};
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";
const getPhase=step=>PHASES.find(p=>p.steps.includes(step));

// Upfront payment breakdown
const calcUpfront=(order)=>{
  const agFee=parseFloat(order.agreementFee)||0;
  const stampFee=parseFloat(order.stampingFee)||0;
  const deposit=parseFloat(order.deposit)||0;
  const monthly=parseFloat(order.billingData?.monthlyInstallment)||0;
  return{agFee,stampFee,deposit,monthly,total:agFee+stampFee+deposit+monthly};
};

/* ─── Phase Badge ──────────────────────────────────────────────────────── */
function PhaseBadge({step}){
  const phase=getPhase(step);
  if(!phase)return null;
  return<span style={{display:"inline-block",padding:"2px 9px",borderRadius:4,fontSize:9,fontWeight:700,background:phase.bg,color:phase.color,textTransform:"uppercase",letterSpacing:"0.06em",border:`1px solid ${phase.color}30`}}>{phase.label}</span>;
}

/* ─── Progress Bar ─────────────────────────────────────────────────────── */
function ProgressBar({currentStep}){
  const pct=Math.round(((currentStep-1)/11)*100);
  const phase=getPhase(currentStep);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{phase?.label||"Complete"}</span>
        <span style={{fontSize:11,fontWeight:800,color:currentStep===12?"#86EFAC":"#fff"}}>Step {currentStep}/12 · {pct}%</span>
      </div>
      <div style={{height:6,background:"rgba(255,255,255,.12)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:currentStep===12?"#4ADE80":"#FFD500",borderRadius:3,transition:"width .4s ease"}}/>
      </div>
      {/* Phase markers */}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        {PHASES.map(p=>{
          const phaseSteps=p.steps;
          const done=currentStep>Math.max(...phaseSteps);
          const active=phaseSteps.includes(currentStep);
          return<div key={p.id} style={{fontSize:9,color:done?"#FFD500":active?"rgba(255,255,255,.8)":"rgba(255,255,255,.25)",fontWeight:active?700:400}}>{p.label}</div>;
        })}
      </div>
    </div>
  );
}

/* ─── Tracking Timeline ────────────────────────────────────────────────── */
function TrackingTimeline({order}){
  const current=order.step;
  let lastPhase=null;
  return(
    <div>
      {STEPS.map((s,i)=>{
        const done=current>s.step;
        const active=current===s.step;
        const hist=(order.history||[]).find(h=>h.step===s.step);
        const phase=getPhase(s.step);
        const showPhaseHeader=phase&&phase.id!==lastPhase;
        if(phase)lastPhase=phase.id;
        return(
          <div key={s.step}>
            {showPhaseHeader&&<div style={{fontSize:9,fontWeight:800,color:phase.color,textTransform:"uppercase",letterSpacing:"0.08em",padding:"8px 0 6px",marginLeft:54,borderBottom:`1px solid ${phase.bg}`,marginBottom:6,marginTop:i>0?4:0}}>{phase.label} Phase</div>}
            <div style={{display:"flex",gap:0,position:"relative"}}>
              {i<STEPS.length-1&&<div style={{position:"absolute",left:19,top:40,width:2,height:"calc(100% - 8px)",background:done?"#0A1628":"#E4EAF2",zIndex:0}}/>}
              <div style={{flexShrink:0,width:40,height:40,borderRadius:"50%",background:done?"#0A1628":active?"#162B52":"#F7F9FC",border:`2px solid ${done?"#0A1628":active?"#FFD500":"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:done?13:15,color:done?"#fff":"inherit",fontWeight:800,zIndex:1,marginRight:14,transition:"all .3s"}}>
                {done?"✓":active?s.icon:<span style={{fontSize:9,fontWeight:700,color:"#CBD5E1"}}>{s.step}</span>}
              </div>
              <div style={{flex:1,paddingBottom:i<STEPS.length-1?14:0,paddingTop:3}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontWeight:done||active?700:400,fontSize:12,color:done?"#0A1628":active?"#0A1628":"#9CA3AF"}}>{s.label}</span>
                  {active&&<span style={{background:"#FFD500",color:"#0A1628",padding:"1px 7px",borderRadius:3,fontSize:9,fontWeight:800}}>CURRENT</span>}
                  {hist?.date&&<span style={{fontSize:10,color:"#8A96A8",whiteSpace:"nowrap"}}>{fDateTime(hist.date,hist.time)}</span>}
                </div>
                {hist&&<div style={{marginTop:5,background:"#F7F9FC",borderRadius:7,padding:"7px 10px",border:"1px solid #E4EAF2"}}>
                  {hist.remark&&<div style={{fontSize:11,color:"#374151",marginBottom:2}}>💬 {hist.remark}</div>}
                  {hist.invoiceNo&&<div style={{fontSize:11,color:"#1E6FDB",marginBottom:2}}>🧾 Invoice No: {hist.invoiceNo}</div>}
                  {hist.verificationRemark&&<div style={{fontSize:11,color:"#374151",marginBottom:2}}>🔍 {hist.verificationRemark}</div>}
                  {hist.collectionChecked!==undefined&&<div style={{fontSize:11,color:hist.collectionChecked?"#15803D":"#B91C1C",marginBottom:1}}>{hist.collectionChecked?"✓":"✗"} Collection Proof Verified</div>}
                  {hist.paymentChecked!==undefined&&<div style={{fontSize:11,color:hist.paymentChecked?"#15803D":"#B91C1C",marginBottom:1}}>{hist.paymentChecked?"✓":"✗"} Payment Proof Verified</div>}
                  {hist.returnRemark&&<div style={{fontSize:11,color:"#B91C1C",marginBottom:2}}>↩ Returned: {hist.returnRemark}</div>}
                  {hist.issueItems?.length>0&&<div style={{fontSize:11,color:"#B91C1C",marginBottom:2}}>Issues: {hist.issueItems.join(", ")}</div>}
                  {hist.checklistItems&&<div style={{fontSize:10,color:"#374151",marginBottom:2}}>📝 {hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items ✓</div>}
                  {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&(
                    <a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"#1E6FDB",textDecoration:"none",background:"#EFF6FF",padding:"2px 8px",borderRadius:4,fontWeight:600,marginRight:4,marginBottom:2}}>📎 {f.name}</a>
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

/* ─── Section Header ───────────────────────────────────────────────────── */
function SectionHdr({label}){
  return<div style={{fontSize:10,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.08em",padding:"10px 0 6px",borderBottom:"2px solid #E4EAF2",marginBottom:12}}>{label}</div>;
}

/* ─── Billing Form ─────────────────────────────────────────────────────── */
function BillingForm({onSubmit,onCancel,order}){
  const empty={billingDate:now(),billingTime:nowTime(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",monthlyInstallment:"",deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null};
  const [f,setF]=useState(order.billingData||empty);
  const [fileInputs,setFileInputs]=useState({deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const readFile=file=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:file.name,data:r.result});r.readAsDataURL(file);});
  const submit=async()=>{
    if(!f.customerFullName||!f.customerIC||!f.imeiSerial){alert("Customer name, IC and IMEI required.");return;}
    const data={...f};
    for(const[k,file] of Object.entries(fileInputs)){if(file)data[k]=await readFile(file);}
    onSubmit(data);
  };
  const textFields=[
    ["billingDate","Billing Date","date",""],["billingTime","Billing Time","time",""],
    ["customerFullName","Customer Full Name","text","*"],["customerIC","Customer IC No.","text","*"],
    ["customerHP","Customer HP No.","tel",""],["customerEmail","Customer Email","email",""],
    ["customerAddress","Customer Address","text","","1/-1"],
    ["customerPostCode","Post Code","text",""],["customerCity","City","text",""],
    ["itemCode","Item Code","text",""],["imeiSerial","IMEI / Serial No.","text","*"],
    ["freeGiftItemCode","Free Gift Item Code","text",""],["freeGiftItemName","Free Gift Item Name","text",""],
    ["cashPriceOnListing","Cash Price on Result Listing (RM)","number",""],
    ["monthlyInstallment","Monthly Installment (RM)","number",""],
  ];
  const fileFields=[
    ["deviceSerialImg","Device Serial No. Image","*"],
    ["freeGiftSerialImg","Free Gift Serial No. Image (if any)",""],
    ["resultListFile","Result Listing File","*"],
    ["agreementFile","Agreement File","*"],
  ];
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
      <div style={{background:"#0A1628",padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>💳</span>
        <div><div style={{fontWeight:800,fontSize:13,color:"#fff"}}>Billing Request Form</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Complete all required fields before submitting</div></div>
      </div>
      <div style={{padding:18}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10,marginBottom:14}}>
          {textFields.map(([k,l,t,req,col])=>(
            <div key={k} style={col?{gridColumn:col}:{}}>
              <label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}{req&&<span style={{color:"#B91C1C"}}> {req}</span>}</label>
              <input className="input" type={t} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
        </div>
        <SectionHdr label="File Uploads"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:10,marginBottom:16}}>
          {fileFields.map(([k,l,req])=>(
            <div key={k}>
              <label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}{req&&<span style={{color:"#B91C1C"}}> {req}</span>}</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFileInputs(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
              {(fileInputs[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>✓ {fileInputs[k]?.name||f[k]?.name}</div>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{padding:"9px 22px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Submit Billing Request →</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel,issueItems=[]}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const toggle=i=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x));
  const allChecked=items.every(x=>x.checked);
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:12}}>
      <div style={{background:"#0A1628",padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>📝</span>
        <div><div style={{fontWeight:800,fontSize:13,color:"#fff"}}>Agreement Checklist</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Tick all items before sending to HQ</div></div>
      </div>
      <div style={{padding:16}}>
        {items.map((item,i)=>(
          <div key={i} onClick={()=>toggle(i)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":"#F7F9FC",border:`1px solid ${item.issue&&!item.checked?"#FECACA":item.checked?"#BBF7D0":"#E4EAF2"}`,marginBottom:7,cursor:"pointer",transition:"all .15s"}}>
            <div style={{width:20,height:20,borderRadius:4,background:item.checked?"#15803D":"#fff",border:`2px solid ${item.checked?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
              {item.checked&&<span style={{fontSize:12,color:"#fff",fontWeight:900,lineHeight:1}}>✓</span>}
            </div>
            <span style={{fontSize:12,color:item.issue&&!item.checked?"#B91C1C":item.checked?"#15803D":"#374151",fontWeight:item.issue&&!item.checked?700:item.checked?600:400}}>{item.name}{item.issue&&!item.checked&&" ⚠ Flagged by HQ"}</span>
          </div>
        ))}
        {!allChecked&&<div style={{padding:"8px 12px",background:"#FFFBEB",borderRadius:7,border:"1px solid #FDE68A",fontSize:11,color:"#92400E",marginTop:8}}>⚠ All items must be ticked before proceeding.</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={()=>allChecked&&onSubmit(items)} disabled={!allChecked} style={{padding:"9px 22px",background:allChecked?"#0A1628":"#E4EAF2",color:allChecked?"#FFD500":"#8A96A8",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:allChecked?"pointer":"default",fontFamily:"Inter,sans-serif"}}>Submit Checklist →</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Action Panel ─────────────────────────────────────────────────────── */
function ActionPanel({order,isAdmin,onUpdate}){
  const step=order.step;
  const nextDef=step<12?getStep(step+1):null;
  const [remark,setRemark]=useState("");
  const [invoiceNo,setInvoiceNo]=useState("");
  const [files,setFiles]=useState({});
  const [collectionChecked,setCollectionChecked]=useState(false);
  const [paymentChecked,setPaymentChecked]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showBillingForm,setShowBillingForm]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturnForm,setShowReturnForm]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(name=>({name,issue:false})));

  if(step===12)return(
    <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:24}}>🎉</span>
      <div><div style={{fontWeight:800,fontSize:14,color:"#15803D"}}>Order Complete</div><div style={{fontSize:12,color:"#166534",marginTop:2}}>All 12 steps done. Claim submitted.</div></div>
    </div>
  );
  if(!nextDef)return null;

  const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:f.name,data:r.result});r.readAsDataURL(f);});
  const branchCanAdvance=isAdmin||[5,6,10].includes(nextDef.step);

  // Step 6: billing form
  if(nextDef.step===6&&!isAdmin){
    if(showBillingForm)return<BillingForm order={order} onCancel={()=>setShowBillingForm(false)} onSubmit={async(billingData)=>{
      setSaving(true);
      const hist={step:6,date:now(),time:nowTime(),note:"Billing Request Submitted",billingData};
      await onUpdate({...order,step:6,billingData,history:[...(order.history||[]),hist]});
      setSaving(false);setShowBillingForm(false);
    }}/>;
    return NextBtn("💳","Billing Request","Fill in billing form to proceed.",()=>setShowBillingForm(true),"Open Billing Request Form →");
  }
  // Step 10: checklist
  if(nextDef.step===10&&!isAdmin){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    const issueItems=lastReturn?.issueItems||[];
    if(showChecklist)return<ChecklistForm issueItems={issueItems} onCancel={()=>setShowChecklist(false)} onSubmit={async(checklistItems)=>{
      setSaving(true);
      const hist={step:10,date:now(),time:nowTime(),note:"Agreement Checklist Completed",checklistItems};
      await onUpdate({...order,step:10,checklistItems,history:[...(order.history||[]),hist]});
      setSaving(false);setShowChecklist(false);
    }}/>;
    return NextBtn("📝","Agreement Checklist","Complete agreement checklist before sending to HQ.",()=>setShowChecklist(true),"Open Agreement Checklist →");
  }

  const advance=async()=>{
    setSaving(true);
    const resolvedFiles={};
    for(const[k,f] of Object.entries(files)){if(f)resolvedFiles[k]=await readFile(f);}
    const hist={step:nextDef.step,date:now(),time:nowTime(),note:nextDef.label,
      remark:remark||undefined,invoiceNo:invoiceNo||undefined,
      files:Object.keys(resolvedFiles).length?resolvedFiles:undefined,
      ...(nextDef.needsVerification?{collectionChecked,paymentChecked}:{}),
    };
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),hist]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    await onUpdate(updated);
    setSaving(false);setRemark("");setInvoiceNo("");setFiles({});
  };

  const canSubmit=()=>{
    if(!branchCanAdvance)return false;
    if(nextDef.needsRemark&&isAdmin&&!remark.trim())return false;
    if(nextDef.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    if(nextDef.needsFiles){
      const required=(nextDef.needsFiles||[]).filter(f=>!f.optional);
      if(isAdmin&&required.some(f=>!files[f.key]))return false;
    }
    return true;
  };

  // Upfront payment breakdown for step 7
  const upfront=order.billingData?calcUpfront(order):null;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
        <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{nextDef.icon}</span>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>Next: {nextDef.label}</div><div style={{fontSize:11,color:"#6B7280"}}>{nextDef.desc}</div></div>
        </div>
        <div style={{padding:"14px 16px"}}>
          {!branchCanAdvance&&<div style={{fontSize:12,color:"#8A96A8",fontStyle:"italic",padding:"6px 0"}}>⏳ Waiting for admin to process this step.</div>}
          {branchCanAdvance&&<>
            {nextDef.needsRemark&&isAdmin&&<Field label="Admin Remark — Supplier / Order Details / ETA" required>
              <textarea className="input" value={remark} onChange={e=>setRemark(e.target.value)} rows={3} style={{fontSize:12,resize:"vertical"}} placeholder="Supplier, ETA, order ref…"/>
            </Field>}

            {/* Step 7: invoice + upfront breakdown */}
            {nextDef.needsInvoiceNo&&isAdmin&&<>
              <Field label="Sales Invoice Number" required>
                <input className="input" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} style={{fontSize:12}} placeholder="INV-2026-0001"/>
              </Field>
              {upfront&&<div style={{background:"#F7F9FC",borderRadius:8,padding:"12px 14px",border:"1px solid #E4EAF2",marginBottom:12}}>
                <div style={{fontSize:10,fontWeight:700,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Customer Upfront Payment Breakdown</div>
                {[["Agreement Fee",upfront.agFee],["Stamping Fee",upfront.stampFee],["Deposit",upfront.deposit],["1st Monthly Installment",upfront.monthly]].map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"1px solid #E4EAF2"}}>
                    <span style={{color:"#4A5568"}}>{l}</span><span style={{fontWeight:600,color:"#0A1628"}}>{fRM(v)}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0 0",fontWeight:800,color:"#0A1628"}}>
                  <span>Total Upfront</span><span>{fRM(upfront.total)}</span>
                </div>
              </div>}
            </>}

            {/* Step 9: verification checkboxes */}
            {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Verification Checklist</div>
              {[[collectionChecked,setCollectionChecked,"✓ Customer Collection Proof — verified uploaded and correct"],[paymentChecked,setPaymentChecked,"✓ Upfront Payment Proof — verified uploaded and correct"]].map(([val,setter,label],i)=>(
                <div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:val?"#F0FDF4":"#F7F9FC",border:`1px solid ${val?"#BBF7D0":"#E4EAF2"}`,marginBottom:7,cursor:"pointer"}}>
                  <div style={{width:20,height:20,borderRadius:4,background:val?"#15803D":"#fff",border:`2px solid ${val?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {val&&<span style={{fontSize:12,color:"#fff",fontWeight:900,lineHeight:1}}>✓</span>}
                  </div>
                  <span style={{fontSize:12,color:val?"#15803D":"#374151",fontWeight:val?600:400}}>{label}</span>
                </div>
              ))}
            </div>}

            {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.map(({key,label,optional})=>(
              <div key={key} style={{marginBottom:12}}>
                <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload {label} {!optional&&<span style={{color:"#B91C1C"}}>*</span>}{optional&&<span style={{color:"#8A96A8"}}> (optional)</span>}</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:12,width:"100%"}}/>
                {files[key]&&<div style={{fontSize:11,color:"#15803D",marginTop:3}}>✓ {files[key].name}</div>}
              </div>
            ))}
            {!nextDef.needsRemark&&!nextDef.needsInvoiceNo&&!nextDef.needsVerification&&!nextDef.needsFiles&&<div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Remark (optional)</label>
              <input className="input" value={remark} onChange={e=>setRemark(e.target.value)} style={{fontSize:12}} placeholder="Optional note…"/>
            </div>}
            <button onClick={advance} disabled={!canSubmit()||saving} style={{width:"100%",padding:"11px 0",background:canSubmit()&&!saving?"#0A1628":"#E4EAF2",color:canSubmit()&&!saving?"#FFD500":"#8A96A8",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:canSubmit()&&!saving?"pointer":"default",fontFamily:"Inter,sans-serif"}}>
              {saving?"Saving…":`Confirm: ${nextDef.label} →`}
            </button>
          </>}
        </div>
      </div>

      {/* Reverse step 11 → 10 */}
      {step===11&&isAdmin&&(!showReturnForm
        ?<button onClick={()=>setShowReturnForm(true)} style={{width:"100%",padding:"9px 0",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>↩ Return Agreement to Branch</button>
        :<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontWeight:800,fontSize:13,color:"#B91C1C",marginBottom:10}}>↩ Return Agreement to Branch</div>
          <Field label="Return Remark" required><textarea className="input" value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} style={{fontSize:12,resize:"vertical",borderColor:"#FECACA"}} placeholder="Reason…"/></Field>
          <div style={{fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:7}}>Mark Problematic Items</div>
          {returnItems.map((item,i)=>(
            <div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,background:item.issue?"#FEE2E2":"#fff",border:`1px solid ${item.issue?"#FECACA":"#E4EAF2"}`,marginBottom:5,cursor:"pointer"}}>
              <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#B91C1C":"#fff",border:`2px solid ${item.issue?"#B91C1C":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{item.issue&&<span style={{fontSize:10,color:"#fff",fontWeight:900}}>✗</span>}</div>
              <span style={{fontSize:12,color:item.issue?"#B91C1C":"#374151"}}>{item.name}</span>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <button onClick={()=>setShowReturnForm(false)} className="btn btn-ghost" style={{flex:1}}>Cancel</button>
            <button onClick={async()=>{if(!returnRemark.trim()){alert("Remark required.");return;}setSaving(true);const issueItems=returnItems.filter(x=>x.issue).map(x=>x.name);const hist={step:10,date:now(),time:nowTime(),note:"Returned — Agreement Issues",returnRemark,issueItems,reversedFrom:11};await onUpdate({...order,step:10,history:[...(order.history||[]),hist]});setSaving(false);setShowReturnForm(false);setReturnRemark("");}} disabled={saving} style={{flex:2,padding:"9px 0",background:"#B91C1C",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"↩ Return to Branch"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({label,required,children}){
  return(
    <div style={{marginBottom:12}}>
      <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}{required&&<span style={{color:"#B91C1C"}}> *</span>}</label>
      {children}
    </div>
  );
}
function NextBtn(icon,title,desc,onClick,btnLabel){
  return(
    <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
      <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>{icon}</span>
        <div><div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>{title}</div><div style={{fontSize:11,color:"#6B7280"}}>{desc}</div></div>
      </div>
      <div style={{padding:"14px 16px"}}><button onClick={onClick} style={{width:"100%",padding:"11px 0",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{btnLabel}</button></div>
    </div>
  );
}

/* ─── Order Detail ─────────────────────────────────────────────────────── */
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin}){
  const step=getStep(order.step);
  const isCash=order.orderType==="cash";
  const upfront=order.billingData&&order.step>=7?calcUpfront(order):null;
  return(
    <div>
      {/* Header */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"20px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontSize:9,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.07)",padding:"2px 8px",borderRadius:4}}>{shortId(order.id)}</span>
                <PhaseBadge step={order.step}/>
                <span style={{fontSize:9,fontWeight:700,color:"#FFD500",background:"rgba(255,213,0,.12)",padding:"2px 8px",borderRadius:4}}>{order.stockStatus==="ready"?"⚡ READY STOCK":"📋 STOCK REQUEST"}</span>
                {isCash&&<span style={{fontSize:9,fontWeight:700,color:"#86EFAC",background:"rgba(134,239,172,.12)",padding:"2px 8px",borderRadius:4}}>💵 CASH</span>}
                {!isCash&&<span style={{fontSize:9,fontWeight:700,color:"#93C5FD",background:"rgba(147,197,253,.12)",padding:"2px 8px",borderRadius:4}}>🏦 CCM</span>}
              </div>
              <div style={{fontWeight:900,fontSize:18,color:"#fff",lineHeight:1.2}}>{order.phoneModel}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:4}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
            </div>
            <button onClick={onBack} style={{padding:"6px 12px",background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.6)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>← Back</button>
          </div>
          <ProgressBar currentStep={order.step}/>
        </div>
        {/* Status */}
        <div style={{padding:"12px 20px",background:order.step===12?"#F0FDF4":"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{step.icon}</span>
          <div>
            <div style={{fontWeight:800,fontSize:13,color:order.step===12?"#15803D":"#0A1628"}}>Step {order.step} of 12 — {step.label}</div>
            <div style={{fontSize:11,color:"#6B7280"}}>{step.desc}</div>
          </div>
        </div>
        {/* Order fields */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))"}}>
          {[
            !isCash&&["Merchant",order.merchant||"—"],
            !isCash&&["Agreement No.",order.agreementNumber||"—"],
            !isCash&&["Approval Date",fDate(order.aeonApprovalDate)],
            !isCash&&["Finance Price",fRM(order.financePrice)],
            !isCash&&["Stamping Fee",fRM(order.stampingFee)],
            !isCash&&["Agreement Fee",fRM(order.agreementFee)],
            isCash&&["Retail Price",fRM(order.retailPrice)],
            ["Deposit",fRM(order.deposit)],
            order.depositPaymentDate&&["Deposit Date",fDate(order.depositPaymentDate)],
            order.invoiceNo&&["Invoice No.",order.invoiceNo],
          ].filter(Boolean).map(([l,v])=>(
            <div key={l} style={{padding:"9px 14px",borderRight:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,fontSize:11,color:"#0A1628",whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>
        {order.adminRemark&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#FFFBEB"}}>
          <div style={{fontSize:9,color:"#92400E",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>Admin Remark</div>
          <div style={{fontSize:12,color:"#78350F"}}>{order.adminRemark}</div>
        </div>}
        {/* Upfront breakdown */}
        {upfront&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#F0F4FA"}}>
          <div style={{fontSize:9,color:"#1E6FDB",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Upfront Payment Breakdown</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:4}}>
            {[["Agreement Fee",upfront.agFee],["Stamping Fee",upfront.stampFee],["Deposit",upfront.deposit],["1st Installment",upfront.monthly],["Total Upfront",upfront.total]].map(([l,v],i)=>(
              <div key={l} style={{padding:"5px 8px",background:i===4?"#0A1628":"#fff",borderRadius:5,border:`1px solid ${i===4?"#0A1628":"#E4EAF2"}`}}>
                <div style={{fontSize:9,color:i===4?"rgba(255,255,255,.5)":"#8A96A8"}}>{l}</div>
                <div style={{fontSize:11,fontWeight:i===4?800:600,color:i===4?"#FFD500":"#0A1628"}}>{fRM(v)}</div>
              </div>
            ))}
          </div>
        </div>}
        {/* Billing details */}
        {order.billingData&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2"}}>
          <div style={{fontSize:9,color:"#7C3AED",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Billing Details</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:4}}>
            {[["Billing Date",fDateTime(order.billingData.billingDate,order.billingData.billingTime)],["IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Monthly",fRM(order.billingData.monthlyInstallment)]].map(([l,v])=>v&&v!=="RM 0.00"&&(
              <div key={l}><div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase"}}>{l}</div><div style={{fontSize:11,fontWeight:600,color:"#0A1628"}}>{v}</div></div>
            ))}
          </div>
        </div>}
        {/* Checklist */}
        {order.checklistItems&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#F0FDF4"}}>
          <div style={{fontSize:9,color:"#15803D",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length})</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {order.checklistItems.map((item,i)=>(
              <span key={i} style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:item.checked?"#DCFCE7":"#FEE2E2",color:item.checked?"#15803D":"#B91C1C",fontWeight:600}}>{item.checked?"✓":"✗"} {item.name}</span>
            ))}
          </div>
        </div>}
        {isAdmin&&<div style={{padding:"10px 16px",display:"flex",gap:8}}>
          <button onClick={onEdit} style={{padding:"6px 16px",background:"#F7F9FC",color:"#0A1628",border:"1px solid #E4EAF2",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit Order</button>
          <button onClick={onDelete} style={{padding:"6px 16px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Delete</button>
        </div>}
      </div>
      {/* Two-col */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",padding:"16px 20px"}}>
          <SectionHdr label="Tracking Timeline"/>
          <TrackingTimeline order={order}/>
        </div>
        <div>
          <SectionHdr label="Required Action"/>
          <ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate}/>
        </div>
      </div>
    </div>
  );
}

/* ─── Order Form ───────────────────────────────────────────────────────── */
function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch,srList}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",salesAgentName:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:"",retailPrice:"",stockStatus:"stock_request",orderType:"ccm",depositPaymentDate:"",depositSlip:null};
  const [f,setF]=useState(order?{...order}:empty);
  const [slipFile,setSlipFile]=useState(null);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const isCash=f.orderType==="cash";
  const isReadyStock=f.stockStatus==="ready";
  const branchSRs=(srList||[]).filter(s=>s.branch===(userBranch||f.branch));
  const readFile=file=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:file.name,data:r.result});r.readAsDataURL(file);});
  const submit=async()=>{
    if(!f.phoneModel||!f.customerName){alert("Phone model and customer name required.");return;}
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip={name:slipFile.name,data:await readFile(slipFile)};
    const initStep=isReadyStock?4:1;
    const initHistory=isReadyStock?[{step:1,date:now(),time:nowTime(),note:"Submitted"},{step:2,date:now(),time:nowTime(),note:"Ready stock — ordered"},{step:3,date:now(),time:nowTime(),note:"Ready stock — arrived HQ"},{step:4,date:now(),time:nowTime(),note:"Ready stock — dispatching"}]:[{step:1,date:now(),time:nowTime(),note:"Order submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHistory});
  };
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
      <div style={{background:"#0A1628",padding:"14px 20px"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{order?"Edit Order":"New Order Request"}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Fill in all order details</div>
      </div>
      <div style={{padding:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16,padding:"14px 16px",background:"#F7F9FC",borderRadius:10,border:"1px solid #E4EAF2"}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Stock Status <span style={{color:"#B91C1C"}}>*</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["stock_request","📋 Stock Request"],["ready","⚡ Ready Stock"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${f.stockStatus===v?"#0A1628":"#E4EAF2"}`,background:f.stockStatus===v?"#0A1628":"#fff",color:f.stockStatus===v?"#FFD500":"#4A5568",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
            {isReadyStock&&<div style={{fontSize:10,color:"#059669",marginTop:5,fontWeight:600}}>⚡ Will skip to Step 4 on submit</div>}
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Order Type <span style={{color:"#B91C1C"}}>*</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["ccm","🏦 CCM Order"],["cash","💵 Cash Order"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${f.orderType===v?"#0A1628":"#E4EAF2"}`,background:f.orderType===v?"#0A1628":"#fff",color:f.orderType===v?"#FFD500":"#4A5568",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:12,marginBottom:16}}>
          {[["phoneModel","Phone Model / Item","text"],["customerName","Customer Name","text"]].map(([k,l,t])=>(
            <div key={k}><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l} <span style={{color:"#B91C1C"}}>*</span></label><input className="input" type={t} value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/></div>
          ))}
          <div>
            <label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
            <select className="input select" value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch} style={{fontSize:12}}>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sales Agent</label>
            {branchSRs.length>0
              ?<select className="input select" value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}} style={{fontSize:12}}>
                <option value="">— Select SR —</option>
                {branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}
              </select>
              :<input className="input" value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} style={{fontSize:12}} placeholder="Agent ID"/>
            }
          </div>
        </div>
        {!isCash&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:16,padding:"14px 16px",background:"#F0F4FA",borderRadius:10,border:"1px solid #DBEAFE"}}>
          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#1E6FDB",textTransform:"uppercase",letterSpacing:"0.06em"}}>🏦 CCM / Financing Details</div>
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Merchant</label><select className="input select" value={f.merchant} onChange={e=>set("merchant",e.target.value)} style={{fontSize:12}}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          {[["agreementNumber","Agreement No."],["financePrice","Finance Price (RM)"],["stampingFee","Stamping Fee (RM)"],["agreementFee","Agreement Fee (RM)"],["deposit","Deposit (RM)"]].map(([k,l])=>(
            <div key={k}><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label><input className="input" type={k.includes("Price")||k.includes("Fee")||k==="deposit"?"number":"text"} value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/></div>
          ))}
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Aeon Approval Date</label><input className="input" type="date" value={f.aeonApprovalDate} onChange={e=>set("aeonApprovalDate",e.target.value)} style={{fontSize:12}}/></div>
        </div>}
        {isCash&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:16,padding:"14px 16px",background:"#F0FDF4",borderRadius:10,border:"1px solid #BBF7D0"}}>
          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#15803D",textTransform:"uppercase",letterSpacing:"0.06em"}}>💵 Cash Order Details</div>
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Retail Price (RM)</label><input className="input" type="number" value={f.retailPrice} onChange={e=>set("retailPrice",e.target.value)} style={{fontSize:12}}/></div>
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit (RM)</label><input className="input" type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)} style={{fontSize:12}}/></div>
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit Payment Date</label><input className="input" type="date" value={f.depositPaymentDate} onChange={e=>set("depositPaymentDate",e.target.value)} style={{fontSize:12}}/></div>
          <div><label style={{fontSize:9,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit Slip</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:11}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}</div>
        </div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{padding:"10px 24px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{order?"Save Changes":isReadyStock?"⚡ Submit & Dispatch":"Submit Order Request"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────── */
export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[]}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list");
  const [selectedOrder,setSelectedOrder]=useState(null);
  const [editOrder,setEditOrder]=useState(null);
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [filterStep,setFilterStep]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);
  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];await save(list);setSelectedOrder(o);setView("detail");};
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));setView("list");setSelectedOrder(null);};

  const filtered=orders.filter(o=>
    (filterBranch==="ALL"||o.branch===filterBranch)&&
    (filterStep==="ALL"||o.step===parseInt(filterStep))&&
    (!userBranch||o.branch===userBranch)&&
    (!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))
  ).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8"}}>Loading orders…</div>;

  if(view==="detail"&&selectedOrder){
    const live=orders.find(o=>o.id===selectedOrder.id)||selectedOrder;
    return<div className="fade-in"><OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);setView("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>{setView("list");setSelectedOrder(null);}}/></div>;
  }
  if(view==="form")return<div className="fade-in"><OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{setView(editOrder?"detail":"list");setEditOrder(null);}}/></div>;

  const statCounts=STEPS.reduce((acc,s)=>{acc[s.step]=orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step===s.step).length;return acc;},{});

  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:900,color:"#0A1628",margin:0}}>Order Tracking</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:3}}>{filtered.length} order{filtered.length!==1?"s":""} · {orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step<12).length} active</div>
        </div>
        <button onClick={()=>{setEditOrder(null);setView("form");}} style={{padding:"9px 20px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>+ New Order</button>
      </div>
      {/* Phase filters */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {PHASES.map(p=>{
          const count=orders.filter(o=>(!userBranch||o.branch===userBranch)&&p.steps.includes(o.step)).length;
          const active=p.steps.some(s=>String(s)===filterStep);
          return count>0&&<div key={p.id} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:20,background:active?p.color:p.bg,cursor:"pointer",border:`1px solid ${p.color}40`}} onClick={()=>setFilterStep(active?"ALL":String(p.steps[0]))}>
            <span style={{fontSize:10,fontWeight:700,color:active?"#fff":p.color}}>{p.label} ({count})</span>
          </div>;
        })}
      </div>
      {/* Step pills */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        <button onClick={()=>setFilterStep("ALL")} style={{padding:"4px 11px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep==="ALL"?"#0A1628":"#F3F4F6",color:filterStep==="ALL"?"#fff":"#6B7280",whiteSpace:"nowrap"}}>All</button>
        {STEPS.map(s=>statCounts[s.step]>0&&(
          <button key={s.step} onClick={()=>setFilterStep(String(s.step))} style={{padding:"4px 11px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep===String(s.step)?"#0A1628":"#F3F4F6",color:filterStep===String(s.step)?"#fff":"#4B5563",whiteSpace:"nowrap"}}>
            {s.icon} Step {s.step} ({statCounts[s.step]})
          </button>
        ))}
      </div>
      {/* Search */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <input className="input" placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:180,fontSize:12}}/>
        {isAdmin&&<select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120,fontSize:12,padding:"6px 24px 6px 8px"}}>
          <option value="ALL">All Branches</option>
          {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
        </select>}
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#8A96A8",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #E4EAF2"}}>{search||filterStep!=="ALL"||filterBranch!=="ALL"?"No orders match.":"No orders yet. Click + New Order to get started."}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(o=>{
          const s=getStep(o.step);
          const pct=Math.round(((o.step-1)/11)*100);
          const phase=getPhase(o.step);
          return(
            <div key={o.id} onClick={()=>{setSelectedOrder(o);setView("detail");}} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",cursor:"pointer",overflow:"hidden",transition:"box-shadow .15s,border-color .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#0A1628";e.currentTarget.style.boxShadow="0 4px 16px rgba(10,22,40,.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E4EAF2";e.currentTarget.style.boxShadow="none";}}>
              <div style={{background:o.step===12?"linear-gradient(135deg,#14532D,#166534)":"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.07)",padding:"1px 6px",borderRadius:3}}>{shortId(o.id)}</span>
                      {phase&&<span style={{fontSize:8,fontWeight:700,padding:"1px 6px",borderRadius:3,background:phase.bg,color:phase.color}}>{phase.label}</span>}
                      {o.stockStatus==="ready"&&<span style={{fontSize:8,fontWeight:700,color:"#FFD500",background:"rgba(255,213,0,.15)",padding:"1px 6px",borderRadius:3}}>⚡</span>}
                      {o.orderType==="cash"&&<span style={{fontSize:8,fontWeight:700,color:"#86EFAC",background:"rgba(134,239,172,.15)",padding:"1px 6px",borderRadius:3}}>💵</span>}
                    </div>
                    <div style={{fontWeight:800,fontSize:14,color:"#fff",lineHeight:1.2}}>{o.phoneModel}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>{o.branch} · {o.merchant||"Cash"}</div>
                  </div>
                  <span style={{fontSize:20}}>{s.icon}</span>
                </div>
              </div>
              <div style={{height:3,background:"#E4EAF2"}}><div style={{height:"100%",width:`${pct}%`,background:o.step===12?"#15803D":"#1E6FDB"}}/></div>
              <div style={{padding:"10px 14px"}}>
                <div style={{fontWeight:600,fontSize:12,color:"#0A1628",marginBottom:2}}>{o.customerName}</div>
                <div style={{fontSize:10,color:"#8A96A8",marginBottom:8}}>{o.salesAgentName||o.salesAgentId||"No agent"}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{background:"#F7F9FC",border:"1px solid #E4EAF2",borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,color:"#0A1628",whiteSpace:"nowrap"}}>Step {o.step}/12 · {s.label}</div>
                  <div style={{fontSize:10,color:"#8A96A8"}}>{pct}%</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
