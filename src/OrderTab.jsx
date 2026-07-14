import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];

const PHASES=[
  {id:"stock",label:"Stock Order",icon:"📦",steps:[1,2,3],color:"#4B5563"},
  {id:"transfer",label:"Stock Transfer",icon:"🚚",steps:[4,5],color:"#7C3AED"},
  {id:"billing",label:"Billing",icon:"💳",steps:[6,7,8],color:"#B45309"},
  {id:"claim",label:"Claim",icon:"✅",steps:[9,10,11,12],color:"#15803D"},
];

const STEPS=[
  {step:1,label:"New Order Request",icon:"📋",desc:"Order submitted by branch.",who:"branch",phase:"stock"},
  {step:2,label:"Ordered",icon:"🛒",desc:"Purchase order placed with supplier.",who:"admin",phase:"stock",needsRemark:true},
  {step:3,label:"Arrived HQ",icon:"🏢",desc:"Item received at HQ.",who:"admin",phase:"stock"},
  {step:4,label:"Dispatched to Branch",icon:"🚚",desc:"Item dispatched from HQ.",who:"admin",phase:"transfer",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",icon:"📦",desc:"Branch confirms receipt.",who:"branch",phase:"transfer"},
  {step:6,label:"Billing Request",icon:"💳",desc:"Branch submits billing form.",who:"branch",phase:"billing",needsBillingForm:true},
  {step:7,label:"Billed",icon:"🧾",desc:"Admin completes billing.",who:"admin",phase:"billing",needsInvoiceNo:true,needsFiles:[{key:"invoice",label:"Sales Invoice PDF"}]},
  {step:8,label:"Customer Collection",icon:"🤝",desc:"Customer collects device.",who:"admin",phase:"billing",needsFiles:[{key:"collectionProof",label:"Collection Proof"},{key:"paymentProof",label:"Payment Proof"}]},
  {step:9,label:"Collection Verified",icon:"✔️",desc:"HQ verifies collection & payment.",who:"admin",phase:"claim",needsVerification:true},
  {step:10,label:"Agreement Checklist",icon:"📝",desc:"Branch completes agreement checklist.",who:"branch",phase:"claim",needsChecklist:true},
  {step:11,label:"Agreement at HQ",icon:"📄",desc:"HQ receives original agreement.",who:"admin",phase:"claim",canReverse:true},
  {step:12,label:"Claim Released",icon:"✅",desc:"Claim submitted and released.",who:"admin",phase:"claim",needsFiles:[{key:"claimRef",label:"Claim Reference",optional:true}]},
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

/* ── Tiny helpers ─────────────────────────────────────────────────────── */
const Lbl=({children,req})=><div style={{fontSize:11,fontWeight:600,color:"#6B7280",marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</div>;
const Inp=({...p})=><input style={{width:"100%",padding:"8px 10px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:13,background:"#fff",fontFamily:"Inter,sans-serif",boxSizing:"border-box",...p.style}} {...p}/>;
const Sel=({children,...p})=><select style={{width:"100%",padding:"8px 10px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:13,background:"#fff",fontFamily:"Inter,sans-serif",boxSizing:"border-box",...p.style}} {...p}>{children}</select>;
const Txt=({...p})=><textarea style={{width:"100%",padding:"8px 10px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:13,background:"#fff",fontFamily:"Inter,sans-serif",resize:"vertical",boxSizing:"border-box",...p.style}} {...p}/>;
const Card=({children,style})=><div style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",padding:20,...style}}>{children}</div>;
const Divider=()=><div style={{height:1,background:"#F3F4F6",margin:"16px 0"}}/>;
const SectionTitle=({children})=><div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>{children}</div>;

/* ── Status Pill ──────────────────────────────────────────────────────── */
function StepPill({step,size="sm"}){
  const s=getStep(step);
  const phase=getPhase(step);
  const color=phase?.color||"#6B7280";
  const sz=size==="lg"?{fontSize:12,padding:"4px 14px"}:{fontSize:10,padding:"2px 10px"};
  return<span style={{display:"inline-flex",alignItems:"center",gap:4,borderRadius:20,background:`${color}12`,color,fontWeight:600,whiteSpace:"nowrap",border:`1px solid ${color}30`,...sz}}><span>{s.icon}</span><span>{s.label}</span></span>;
}

/* ── Progress Steps (horizontal) ─────────────────────────────────────── */
function PhaseProgress({currentStep}){
  return(
    <div style={{display:"flex",gap:0,alignItems:"center",marginBottom:24}}>
      {PHASES.map((ph,i)=>{
        const maxStep=Math.max(...ph.steps);
        const minStep=Math.min(...ph.steps);
        const done=currentStep>maxStep;
        const active=ph.steps.includes(currentStep);
        const pct=active?Math.round(((currentStep-minStep)/(maxStep-minStep+1))*100):0;
        return(
          <div key={ph.id} style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:done?"#0A1628":active?"#0A1628":"#F3F4F6",border:`2px solid ${done||active?"#0A1628":"#E5E7EB"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>
                {done?<span style={{color:"#fff",fontWeight:800,fontSize:11}}>✓</span>:<span style={{fontSize:14}}>{ph.icon}</span>}
              </div>
              {i<PHASES.length-1&&<div style={{flex:1,height:2,background:done?"#0A1628":"#E5E7EB",margin:"0 4px"}}/>}
            </div>
            <div style={{paddingLeft:2}}>
              <div style={{fontSize:10,fontWeight:600,color:active?"#0A1628":"#9CA3AF"}}>{ph.label}</div>
              {active&&<div style={{fontSize:9,color:"#9CA3AF"}}>Step {currentStep}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Vertical Timeline ────────────────────────────────────────────────── */
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
            {showPh&&<div style={{fontSize:10,fontWeight:700,color:ph.color,textTransform:"uppercase",letterSpacing:"0.07em",padding:"10px 0 6px 52px",borderBottom:`1px solid ${ph.color}20`,marginBottom:6,marginTop:i>0?10:0}}>{ph.icon} {ph.label}</div>}
            <div style={{display:"flex",gap:0,position:"relative"}}>
              {i<STEPS.length-1&&<div style={{position:"absolute",left:14,top:30,width:1,height:"calc(100% + 2px)",background:done?"#D1D5DB":"#F3F4F6",zIndex:0}}/>}
              <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:done?"#111827":active?"#111827":"#F9FAFB",border:`1.5px solid ${done?"#111827":active?"#111827":"#E5E7EB"}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:12,marginTop:1,fontSize:done?11:13,color:done?"#fff":"inherit",fontWeight:800,transition:"all .2s",flexShrink:0}}>
                {done?"✓":active?s.icon:<span style={{fontSize:9,color:"#9CA3AF",fontWeight:600}}>{s.step}</span>}
              </div>
              <div style={{flex:1,paddingBottom:i<STEPS.length-1?14:0,paddingTop:2}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:done||active?600:400,color:done?"#111827":active?"#111827":"#9CA3AF"}}>{s.label}</span>
                  {active&&<span style={{fontSize:10,fontWeight:700,background:"#FEF3C7",color:"#92400E",padding:"1px 8px",borderRadius:20,border:"1px solid #FDE68A"}}>Current</span>}
                  {hist?.date&&<span style={{fontSize:10,color:"#9CA3AF"}}>{fDT(hist.date,hist.time)}</span>}
                </div>
                {!done&&active&&<div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{s.desc}</div>}
                {hist&&(hist.remark||hist.invoiceNo||hist.returnRemark||hist.files||hist.collectionChecked!==undefined||hist.checklistItems)&&(
                  <div style={{marginTop:6,background:"#F9FAFB",borderRadius:7,padding:"8px 12px",border:"1px solid #F3F4F6",fontSize:12,color:"#374151"}}>
                    {hist.remark&&<div style={{marginBottom:3}}>💬 {hist.remark}</div>}
                    {hist.invoiceNo&&<div style={{marginBottom:3,color:"#1D4ED8"}}>🧾 Invoice: {hist.invoiceNo}</div>}
                    {hist.returnRemark&&<div style={{marginBottom:3,color:"#DC2626"}}>↩ {hist.returnRemark}</div>}
                    {hist.issueItems?.length>0&&<div style={{marginBottom:3,color:"#DC2626",fontSize:11}}>Issues: {hist.issueItems.join(" · ")}</div>}
                    {hist.collectionChecked!==undefined&&<div style={{fontSize:11,marginBottom:1,color:hist.collectionChecked?"#15803D":"#DC2626"}}>{hist.collectionChecked?"✓":"✗"} Collection proof verified</div>}
                    {hist.paymentChecked!==undefined&&<div style={{fontSize:11,color:hist.paymentChecked?"#15803D":"#DC2626"}}>{hist.paymentChecked?"✓":"✗"} Payment proof verified</div>}
                    {hist.checklistItems&&<div style={{fontSize:11,marginBottom:3}}>📝 {hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} checklist items</div>}
                    {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&(
                      <a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#1D4ED8",textDecoration:"none",background:"#EFF6FF",padding:"2px 8px",borderRadius:4,fontWeight:500,marginRight:4,marginTop:3}}>📎 {f.name}</a>
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
  const [f,setF]=useState(order.billingData||{billingDate:nowDate(),billingTime:nowTime(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",monthlyInstallment:""});
  const [fls,setFls]=useState({deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const setFl=(k,v)=>setFls(p=>({...p,[k]:v}));
  const [saving,setSaving]=useState(false);
  const submit=async()=>{
    if(!f.customerFullName||!f.customerIC||!f.imeiSerial){alert("Customer name, IC and IMEI required.");return;}
    setSaving(true);
    const data={...f};
    for(const[k,file] of Object.entries(fls))if(file)data[k]=await readFile(file);
    onSubmit(data);
    setSaving(false);
  };
  const row2=style=>({gridColumn:"span 2",...style});
  return(
    <Card style={{marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:4}}>Billing Request Form</div>
      <div style={{fontSize:12,color:"#6B7280",marginBottom:20}}>Complete all required fields before submitting</div>
      <SectionTitle>Billing Info</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <div><Lbl>Billing Date</Lbl><Inp type="date" value={f.billingDate} onChange={e=>set("billingDate",e.target.value)}/></div>
        <div><Lbl>Billing Time</Lbl><Inp type="time" value={f.billingTime} onChange={e=>set("billingTime",e.target.value)}/></div>
      </div>
      <SectionTitle>Customer Details</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <div><Lbl req>Customer Full Name</Lbl><Inp value={f.customerFullName} onChange={e=>set("customerFullName",e.target.value)}/></div>
        <div><Lbl req>Customer IC Number</Lbl><Inp value={f.customerIC} onChange={e=>set("customerIC",e.target.value)}/></div>
        <div><Lbl>HP Number</Lbl><Inp value={f.customerHP} onChange={e=>set("customerHP",e.target.value)}/></div>
        <div><Lbl>Email</Lbl><Inp type="email" value={f.customerEmail} onChange={e=>set("customerEmail",e.target.value)}/></div>
        <div style={row2()}><Lbl>Address</Lbl><Inp value={f.customerAddress} onChange={e=>set("customerAddress",e.target.value)}/></div>
        <div><Lbl>Post Code</Lbl><Inp value={f.customerPostCode} onChange={e=>set("customerPostCode",e.target.value)}/></div>
        <div><Lbl>City</Lbl><Inp value={f.customerCity} onChange={e=>set("customerCity",e.target.value)}/></div>
      </div>
      <SectionTitle>Item Details</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        <div><Lbl>Item Code</Lbl><Inp value={f.itemCode} onChange={e=>set("itemCode",e.target.value)}/></div>
        <div><Lbl req>IMEI / Serial Number</Lbl><Inp value={f.imeiSerial} onChange={e=>set("imeiSerial",e.target.value)}/></div>
        <div><Lbl>Free Gift Item Code</Lbl><Inp value={f.freeGiftItemCode} onChange={e=>set("freeGiftItemCode",e.target.value)}/></div>
        <div><Lbl>Free Gift Item Name</Lbl><Inp value={f.freeGiftItemName} onChange={e=>set("freeGiftItemName",e.target.value)}/></div>
        <div><Lbl>Cash Price on Result Listing (RM)</Lbl><Inp type="number" value={f.cashPriceOnListing} onChange={e=>set("cashPriceOnListing",e.target.value)}/></div>
        <div><Lbl>Monthly Installment (RM)</Lbl><Inp type="number" value={f.monthlyInstallment} onChange={e=>set("monthlyInstallment",e.target.value)}/></div>
      </div>
      <SectionTitle>Uploads</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
        {[["deviceSerialImg","Device Serial No. Image","*"],["freeGiftSerialImg","Free Gift Serial No. Image",""],["resultListFile","Result Listing File","*"],["agreementFile","Agreement File","*"]].map(([k,l,req])=>(
          <div key={k}>
            <Lbl req={req==="*"}>{l}</Lbl>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFl(k,e.target.files[0]||null)} style={{fontSize:12,width:"100%"}}/>
            {(fls[k]||f[k])&&<div style={{fontSize:11,color:"#15803D",marginTop:3}}>✓ {fls[k]?.name||f[k]?.name}</div>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{padding:"8px 20px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{padding:"8px 20px",background:"#111827",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"Submit Billing Request"}</button>
      </div>
    </Card>
  );
}

/* ── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel,issueItems=[]}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false,issue:issueItems.includes(name)})));
  const toggle=i=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x));
  const allChecked=items.every(x=>x.checked);
  return(
    <Card style={{marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:700,color:"#111827",marginBottom:4}}>Agreement Checklist</div>
      <div style={{fontSize:12,color:"#6B7280",marginBottom:20}}>Tick all items before sending documents to HQ</div>
      {items.map((item,i)=>(
        <div key={i} onClick={()=>toggle(i)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:8,background:item.issue&&!item.checked?"#FEF2F2":item.checked?"#F0FDF4":"#F9FAFB",border:`1px solid ${item.issue&&!item.checked?"#FCA5A5":item.checked?"#BBF7D0":"#E5E7EB"}`,marginBottom:8,cursor:"pointer",transition:"all .15s"}}>
          <div style={{width:20,height:20,borderRadius:4,background:item.checked?"#111827":"#fff",border:`2px solid ${item.checked?"#111827":item.issue?"#EF4444":"#D1D5DB"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {item.checked&&<span style={{fontSize:11,color:"#fff",fontWeight:900,lineHeight:1}}>✓</span>}
          </div>
          <span style={{fontSize:13,fontWeight:item.checked?500:400,color:item.issue&&!item.checked?"#DC2626":item.checked?"#15803D":"#374151"}}>{item.name}{item.issue&&!item.checked&&<span style={{fontSize:11,marginLeft:6,color:"#DC2626",fontWeight:600}}>⚠ Flagged</span>}</span>
        </div>
      ))}
      {!allChecked&&<div style={{padding:"10px 14px",background:"#FFFBEB",borderRadius:7,border:"1px solid #FDE68A",fontSize:12,color:"#92400E",marginTop:4,marginBottom:16}}>All items must be ticked before you can proceed.</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
        <button onClick={onCancel} style={{padding:"8px 20px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
        <button onClick={()=>allChecked&&onSubmit(items)} disabled={!allChecked} style={{padding:"8px 20px",background:allChecked?"#111827":"#E5E7EB",color:allChecked?"#fff":"#9CA3AF",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:allChecked?"pointer":"default",fontFamily:"Inter,sans-serif"}}>Submit Checklist</button>
      </div>
    </Card>
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
  const [saving,setSaving]=useState(false);
  const [showBilling,setShowBilling]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturn,setShowReturn]=useState(false);
  const [returnRemark,setReturnRemark]=useState("");
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(n=>({name:n,issue:false})));

  if(step===12)return<div style={{background:"#F0FDF4",borderRadius:10,padding:"18px 20px",border:"1px solid #BBF7D0",display:"flex",alignItems:"center",gap:14}}><span style={{fontSize:28}}>🎉</span><div><div style={{fontSize:15,fontWeight:700,color:"#15803D"}}>Order Complete</div><div style={{fontSize:12,color:"#166534",marginTop:2}}>All 12 steps done. Claim released.</div></div></div>;
  if(!nextDef)return null;

  const branchOk=isAdmin||[5,6,10].includes(nextDef.step);

  if(nextDef.step===6&&!isAdmin){
    if(showBilling)return<BillingForm order={order} onCancel={()=>setShowBilling(false)} onSubmit={async d=>{setSaving(true);const h={step:6,date:nowDate(),time:nowTime(),note:"Billing Request",billingData:d};await onUpdate({...order,step:6,billingData:d,history:[...(order.history||[]),h]});setSaving(false);setShowBilling(false);}}/>;
    return<ActionCard icon="💳" title="Billing Request" desc="Fill in the billing form to advance."><Btn onClick={()=>setShowBilling(true)}>Fill Billing Request Form →</Btn></ActionCard>;
  }
  if(nextDef.step===10&&!isAdmin){
    const lastReturn=(order.history||[]).filter(h=>h.issueItems).slice(-1)[0];
    if(showChecklist)return<ChecklistForm issueItems={lastReturn?.issueItems||[]} onCancel={()=>setShowChecklist(false)} onSubmit={async items=>{setSaving(true);const h={step:10,date:nowDate(),time:nowTime(),note:"Checklist Completed",checklistItems:items};await onUpdate({...order,step:10,checklistItems:items,history:[...(order.history||[]),h]});setSaving(false);setShowChecklist(false);}}/>;
    return<ActionCard icon="📝" title="Agreement Checklist" desc="Complete checklist before sending to HQ."><Btn onClick={()=>setShowChecklist(true)}>Open Checklist →</Btn></ActionCard>;
  }

  const advance=async()=>{
    setSaving(true);
    const rf={};for(const[k,f] of Object.entries(files))if(f)rf[k]=await readFile(f);
    const h={step:nextDef.step,date:nowDate(),time:nowTime(),note:nextDef.label,remark:remark||undefined,invoiceNo:invoiceNo||undefined,files:Object.keys(rf).length?rf:undefined,...(nextDef.needsVerification?{collectionChecked:collection,paymentChecked:payment}:{})};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),h]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    if(nextDef.needsInvoiceNo)updated.invoiceNo=invoiceNo;
    await onUpdate(updated);setSaving(false);setRemark("");setInvoiceNo("");setFiles({});
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
      <ActionCard icon={nextDef.icon} title={`Next: ${nextDef.label}`} desc={nextDef.desc}>
        {!branchOk&&<div style={{fontSize:12,color:"#9CA3AF",fontStyle:"italic"}}>⏳ Waiting for admin action.</div>}
        {branchOk&&<>
          {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}><Lbl req>Admin Remark — Supplier / ETA / Order Ref</Lbl><Txt value={remark} onChange={e=>setRemark(e.target.value)} rows={3} placeholder="Supplier, ETA, order details…"/></div>}
          {nextDef.needsInvoiceNo&&isAdmin&&<>
            <div style={{marginBottom:12}}><Lbl req>Sales Invoice Number</Lbl><Inp value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2026-0001"/></div>
            {upfront&&<div style={{background:"#F9FAFB",borderRadius:8,padding:"12px 14px",border:"1px solid #F3F4F6",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Upfront Payment Breakdown</div>
              {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d],["1st Monthly Installment",upfront.m]].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:"1px solid #F3F4F6",color:"#374151"}}><span>{l}</span><span style={{fontWeight:500}}>{fRM(v)}</span></div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"8px 0 0",fontWeight:700,color:"#111827"}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
            </div>}
          </>}
          {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
            {[[collection,setCollection,"Customer Collection Proof verified"],[payment,setPayment,"Upfront Payment Proof verified"]].map(([val,setter,label],i)=>(
              <div key={i} onClick={()=>setter(!val)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,background:val?"#F0FDF4":"#F9FAFB",border:`1px solid ${val?"#BBF7D0":"#E5E7EB"}`,marginBottom:8,cursor:"pointer"}}>
                <div style={{width:20,height:20,borderRadius:4,background:val?"#111827":"#fff",border:`2px solid ${val?"#111827":"#D1D5DB"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{val&&<span style={{fontSize:11,color:"#fff",fontWeight:900}}>✓</span>}</div>
                <span style={{fontSize:13,color:val?"#15803D":"#374151",fontWeight:val?500:400}}>{label}</span>
              </div>
            ))}
          </div>}
          {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.map(({key,label,optional})=>(
            <div key={key} style={{marginBottom:12}}>
              <Lbl req={!optional}>{label}{optional&&" (optional)"}</Lbl>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:12,width:"100%"}}/>
              {files[key]&&<div style={{fontSize:11,color:"#15803D",marginTop:3}}>✓ {files[key].name}</div>}
            </div>
          ))}
          {!nextDef.needsRemark&&!nextDef.needsVerification&&!nextDef.needsFiles&&!nextDef.needsInvoiceNo&&<div style={{marginBottom:12}}><Lbl>Remark (optional)</Lbl><Inp value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>}
          <Btn onClick={advance} disabled={!ok()||saving} dark={ok()&&!saving}>{saving?"Saving…":`Confirm: ${nextDef.label} →`}</Btn>
        </>}
      </ActionCard>
      {step===11&&isAdmin&&(!showReturn
        ?<button onClick={()=>setShowReturn(true)} style={{width:"100%",padding:"10px 0",background:"#FEF2F2",color:"#DC2626",border:"1px solid #FCA5A5",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>↩ Return Agreement to Branch</button>
        :<Card>
          <div style={{fontSize:14,fontWeight:700,color:"#DC2626",marginBottom:12}}>Return Agreement to Branch</div>
          <div style={{marginBottom:12}}><Lbl req>Return Remark</Lbl><Txt value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} placeholder="Reason for return…" style={{borderColor:"#FCA5A5"}}/></div>
          <div style={{fontSize:11,fontWeight:600,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Mark Problematic Items</div>
          {returnItems.map((item,i)=>(
            <div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,background:item.issue?"#FEF2F2":"#F9FAFB",border:`1px solid ${item.issue?"#FCA5A5":"#E5E7EB"}`,marginBottom:5,cursor:"pointer"}}>
              <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#DC2626":"#fff",border:`2px solid ${item.issue?"#DC2626":"#D1D5DB"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{item.issue&&<span style={{fontSize:9,color:"#fff",fontWeight:900}}>✗</span>}</div>
              <span style={{fontSize:12,color:item.issue?"#DC2626":"#374151"}}>{item.name}</span>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={()=>setShowReturn(false)} style={{flex:1,padding:"8px 0",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
            <button onClick={async()=>{if(!returnRemark.trim()){alert("Remark required.");return;}setSaving(true);const issues=returnItems.filter(x=>x.issue).map(x=>x.name);const h={step:10,date:nowDate(),time:nowTime(),note:"Returned — Issues",returnRemark,issueItems:issues,reversedFrom:11};await onUpdate({...order,step:10,history:[...(order.history||[]),h]});setSaving(false);setShowReturn(false);setReturnRemark("");}} disabled={saving} style={{flex:2,padding:"8px 0",background:"#DC2626",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"↩ Return to Branch"}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ActionCard({icon,title,desc,children}){
  return(
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:desc?4:12}}>
        <span style={{fontSize:22}}>{icon}</span>
        <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{title}</div>
      </div>
      {desc&&<div style={{fontSize:12,color:"#6B7280",marginBottom:14,paddingLeft:32}}>{desc}</div>}
      {children}
    </Card>
  );
}
function Btn({children,onClick,disabled,dark=true}){
  return<button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"10px 0",background:dark&&!disabled?"#111827":"#F3F4F6",color:dark&&!disabled?"#fff":"#9CA3AF",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s"}}>{children}</button>;
}

/* ── Order Detail View ────────────────────────────────────────────────── */
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin}){
  const s=getStep(order.step);
  const isCash=order.orderType==="cash";
  const upfront=order.billingData&&order.step>=7?calcUpfront(order):null;
  return(
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      {/* Back + header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{padding:"6px 14px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← Back</button>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:600,color:"#111827"}}>{order.phoneModel}</span>
            <span style={{fontSize:11,color:"#9CA3AF"}}>{shortId(order.id)}</span>
            <StepPill step={order.step}/>
            <span style={{fontSize:11,background:order.stockStatus==="ready"?"#FEF9C3":"#F3F4F6",color:order.stockStatus==="ready"?"#92400E":"#6B7280",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{order.stockStatus==="ready"?"⚡ Ready Stock":"📋 Stock Request"}</span>
            {isCash&&<span style={{fontSize:11,background:"#F0FDF4",color:"#15803D",padding:"2px 8px",borderRadius:20,fontWeight:600}}>💵 Cash</span>}
          </div>
          <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
        </div>
        {isAdmin&&<div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={onEdit} style={{padding:"6px 14px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit</button>
          <button onClick={onDelete} style={{padding:"6px 14px",background:"#FEF2F2",color:"#DC2626",border:"1px solid #FCA5A5",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Delete</button>
        </div>}
      </div>

      {/* Phase progress */}
      <Card style={{marginBottom:16}}>
        <PhaseProgress currentStep={order.step}/>
        <div style={{background:"#F9FAFB",borderRadius:8,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>{s.icon}</span>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:"#111827"}}>Step {order.step} of 12 — {s.label}</div>
            <div style={{fontSize:12,color:"#6B7280"}}>{s.desc}</div>
          </div>
        </div>
      </Card>

      {/* Two-col */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        {/* Left col */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Order info */}
          <Card>
            <SectionTitle>Order Information</SectionTitle>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
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
                <div key={l}><div style={{fontSize:11,color:"#9CA3AF",marginBottom:2}}>{l}</div><div style={{fontSize:13,fontWeight:500,color:"#111827"}}>{v}</div></div>
              ))}
            </div>
            {order.adminRemark&&<><Divider/><div style={{fontSize:11,color:"#9CA3AF",marginBottom:3}}>Admin Remark</div><div style={{fontSize:13,color:"#374151",background:"#FFFBEB",padding:"8px 10px",borderRadius:6,border:"1px solid #FDE68A"}}>{order.adminRemark}</div></>}
          </Card>

          {/* Upfront breakdown */}
          {upfront&&<Card>
            <SectionTitle>Upfront Payment</SectionTitle>
            {[["Agreement Fee",upfront.a],["Stamping Fee",upfront.s],["Deposit",upfront.d],["1st Monthly Installment",upfront.m]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"5px 0",borderBottom:"1px solid #F3F4F6",color:"#374151"}}><span>{l}</span><span style={{fontWeight:500}}>{fRM(v)}</span></div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,padding:"8px 0 0",fontWeight:700,color:"#111827"}}><span>Total Upfront</span><span>{fRM(upfront.total)}</span></div>
          </Card>}

          {/* Billing details */}
          {order.billingData&&<Card>
            <SectionTitle>Billing Details</SectionTitle>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["Billing Date",fDT(order.billingData.billingDate,order.billingData.billingTime)],["Customer IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Monthly",fRM(order.billingData.monthlyInstallment)]].filter(([,v])=>v&&v!=="RM 0.00").map(([l,v])=>(
                <div key={l}><div style={{fontSize:11,color:"#9CA3AF",marginBottom:1}}>{l}</div><div style={{fontSize:13,fontWeight:500,color:"#111827"}}>{v}</div></div>
              ))}
            </div>
          </Card>}

          {/* Checklist */}
          {order.checklistItems&&<Card>
            <SectionTitle>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length})</SectionTitle>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {order.checklistItems.map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:item.checked?"#F0FDF4":"#FEF2F2",fontSize:12}}>
                  <span style={{color:item.checked?"#15803D":"#DC2626",fontWeight:700,fontSize:13}}>{item.checked?"✓":"✗"}</span>
                  <span style={{color:item.checked?"#15803D":"#DC2626"}}>{item.name}</span>
                </div>
              ))}
            </div>
          </Card>}
        </div>

        {/* Right col */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Action panel */}
          <div>
            <SectionTitle>Required Action</SectionTitle>
            <ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate}/>
          </div>
          {/* Timeline */}
          <Card>
            <SectionTitle>Tracking Timeline</SectionTitle>
            <Timeline order={order}/>
          </Card>
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
  const submit=async()=>{
    if(!f.phoneModel||!f.customerName){alert("Phone model and customer name required.");return;}
    let depositSlip=f.depositSlip||null;
    if(slipFile)depositSlip=await readFile(slipFile);
    const initStep=isReady?4:1;
    const initHist=isReady?[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"},{step:2,date:nowDate(),time:nowTime(),note:"Ready stock"},{step:3,date:nowDate(),time:nowTime(),note:"Arrived HQ"},{step:4,date:nowDate(),time:nowTime(),note:"Dispatching"}]:[{step:1,date:nowDate(),time:nowTime(),note:"Submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHist});
  };
  return(
    <div style={{maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onCancel} style={{padding:"6px 14px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← Back</button>
        <div style={{fontSize:16,fontWeight:700,color:"#111827"}}>{order?"Edit Order":"New Order Request"}</div>
      </div>
      <Card style={{marginBottom:16}}>
        <SectionTitle>Order Type</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:0}}>
          <div>
            <Lbl req>Stock Status</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["stock_request","📋 Stock Request"],["ready","⚡ Ready Stock"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"10px 0",borderRadius:8,border:`2px solid ${f.stockStatus===v?"#111827":"#E5E7EB"}`,background:f.stockStatus===v?"#111827":"#fff",color:f.stockStatus===v?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
            {isReady&&<div style={{fontSize:11,color:"#059669",marginTop:6}}>⚡ Will skip to Step 4 — Dispatching</div>}
          </div>
          <div>
            <Lbl req>Order Type</Lbl>
            <div style={{display:"flex",gap:8}}>
              {[["ccm","🏦 CCM Order"],["cash","💵 Cash Order"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"10px 0",borderRadius:8,border:`2px solid ${f.orderType===v?"#111827":"#E5E7EB"}`,background:f.orderType===v?"#111827":"#fff",color:f.orderType===v?"#fff":"#6B7280",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <Card style={{marginBottom:16}}>
        <SectionTitle>Basic Info</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl req>Phone Model / Item</Lbl><Inp value={f.phoneModel} onChange={e=>set("phoneModel",e.target.value)}/></div>
          <div><Lbl req>Customer Name</Lbl><Inp value={f.customerName} onChange={e=>set("customerName",e.target.value)}/></div>
          <div><Lbl>Branch</Lbl><Sel value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</Sel></div>
          <div><Lbl>Sales Agent</Lbl>
            {branchSRs.length>0
              ?<Sel value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</Sel>
              :<Inp value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder="Agent ID"/>
            }
          </div>
        </div>
      </Card>
      {!isCash&&<Card style={{marginBottom:16}}>
        <SectionTitle>CCM / Financing Details</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Merchant</Lbl><Sel value={f.merchant} onChange={e=>set("merchant",e.target.value)}>{MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}</Sel></div>
          <div><Lbl>Agreement No.</Lbl><Inp value={f.agreementNumber} onChange={e=>set("agreementNumber",e.target.value)}/></div>
          <div><Lbl>Aeon Approval Date</Lbl><Inp type="date" value={f.aeonApprovalDate} onChange={e=>set("aeonApprovalDate",e.target.value)}/></div>
          <div><Lbl>Finance Price (RM)</Lbl><Inp type="number" value={f.financePrice} onChange={e=>set("financePrice",e.target.value)}/></div>
          <div><Lbl>Stamping Fee (RM)</Lbl><Inp type="number" value={f.stampingFee} onChange={e=>set("stampingFee",e.target.value)}/></div>
          <div><Lbl>Agreement Fee (RM)</Lbl><Inp type="number" value={f.agreementFee} onChange={e=>set("agreementFee",e.target.value)}/></div>
          <div><Lbl>Deposit (RM)</Lbl><Inp type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)}/></div>
        </div>
      </Card>}
      {isCash&&<Card style={{marginBottom:16}}>
        <SectionTitle>Cash Order Details</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><Lbl>Retail Price (RM)</Lbl><Inp type="number" value={f.retailPrice} onChange={e=>set("retailPrice",e.target.value)}/></div>
          <div><Lbl>Deposit (RM)</Lbl><Inp type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)}/></div>
          <div><Lbl>Deposit Payment Date</Lbl><Inp type="date" value={f.depositPaymentDate} onChange={e=>set("depositPaymentDate",e.target.value)}/></div>
          <div><Lbl>Deposit Payment Slip</Lbl><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%"}}/>{(slipFile||f.depositSlip)&&<div style={{fontSize:11,color:"#15803D",marginTop:3}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}</div>
        </div>
      </Card>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onCancel} style={{padding:"10px 24px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Cancel</button>
        <button onClick={submit} style={{padding:"10px 24px",background:"#111827",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{order?"Save Changes":isReady?"⚡ Submit & Dispatch":"Submit Order Request"}</button>
      </div>
    </div>
  );
}

/* ── Order List (main view) ───────────────────────────────────────────── */
export default function OrderTab({branchMeta,isAdmin=true,userBranch=null,srList=[]}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list");
  const [selected,setSelected]=useState(null);
  const [editOrder,setEditOrder]=useState(null);
  const [filterPhase,setFilterPhase]=useState("all");
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);
  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];await save(list);setSelected(o);setView("detail");};
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));setView("list");setSelected(null);};

  const myOrders=orders.filter(o=>!userBranch||o.branch===userBranch);
  const filtered=myOrders.filter(o=>
    (filterPhase==="all"||getPhase(o.step)?.id===filterPhase)&&
    (filterBranch==="ALL"||o.branch===filterBranch)&&
    (!search||[o.customerName,o.phoneModel,o.agreementNumber].some(v=>v?.toLowerCase().includes(search.toLowerCase())))
  ).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:60,textAlign:"center",color:"#9CA3AF",fontSize:14}}>Loading orders…</div>;

  if(view==="detail"&&selected){
    const live=orders.find(o=>o.id===selected.id)||selected;
    return<OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin} onUpdate={saveOrder} onEdit={()=>{setEditOrder(live);setView("form");}} onDelete={()=>deleteOrder(live.id)} onBack={()=>{setView("list");setSelected(null);}}/>;
  }
  if(view==="form")return<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{setView(editOrder?"detail":"list");setEditOrder(null);}}/>;

  // Stats
  const stats=PHASES.map(ph=>({...ph,count:myOrders.filter(o=>ph.steps.includes(o.step)).length}));
  const totalActive=myOrders.filter(o=>o.step<12).length;

  return(
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      {/* Page header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:"#111827",marginBottom:4}}>Order Tracking</div>
          <div style={{fontSize:13,color:"#6B7280"}}>{myOrders.length} total · {totalActive} active orders</div>
        </div>
        <button onClick={()=>{setEditOrder(null);setView("form");}} style={{padding:"10px 20px",background:"#111827",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>+ New Order</button>
      </div>

      {/* Phase overview cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {stats.map(ph=>(
          <div key={ph.id} onClick={()=>setFilterPhase(filterPhase===ph.id?"all":ph.id)} style={{background:"#fff",borderRadius:10,border:`2px solid ${filterPhase===ph.id?"#111827":"#E5E7EB"}`,padding:"16px 18px",cursor:"pointer",transition:"border-color .15s"}}>
            <div style={{fontSize:22,marginBottom:8}}>{ph.icon}</div>
            <div style={{fontSize:26,fontWeight:700,color:"#111827",marginBottom:2}}>{ph.count}</div>
            <div style={{fontSize:12,color:"#6B7280"}}>{ph.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <Inp placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:200,fontSize:13}}/>
        {isAdmin&&<Sel value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:130,fontSize:13}}><option value="ALL">All Branches</option>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}</Sel>}
      </div>

      {/* Order list */}
      {filtered.length===0
        ?<Card style={{textAlign:"center",padding:"48px 20px",color:"#9CA3AF",fontSize:14}}>{search||filterPhase!=="all"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click + New Order to get started."}</Card>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
          {filtered.map(o=>{
            const s=getStep(o.step);
            const ph=getPhase(o.step);
            const pct=Math.round(((o.step-1)/11)*100);
            const lastHist=(o.history||[]).slice(-1)[0];
            return(
              <div key={o.id} onClick={()=>{setSelected(o);setView("detail");}} style={{background:"#fff",borderRadius:10,border:"1px solid #E5E7EB",cursor:"pointer",overflow:"hidden",transition:"box-shadow .15s,border-color .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.06)";e.currentTarget.style.borderColor="#D1D5DB";}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";e.currentTarget.style.borderColor="#E5E7EB";}}>
                {/* Progress strip */}
                <div style={{height:3,background:"#F3F4F6"}}><div style={{height:"100%",width:`${pct}%`,background:o.step===12?"#15803D":"#111827",transition:"width .3s"}}/></div>
                <div style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:"#111827",marginBottom:2}}>{o.phoneModel}</div>
                      <div style={{fontSize:12,color:"#6B7280"}}>{o.customerName}</div>
                    </div>
                    <span style={{fontSize:18}}>{s.icon}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:"#9CA3AF",background:"#F9FAFB",padding:"1px 7px",borderRadius:4,border:"1px solid #F3F4F6"}}>{shortId(o.id)}</span>
                    {ph&&<span style={{fontSize:10,fontWeight:600,color:ph.color}}>{ph.label}</span>}
                    {o.stockStatus==="ready"&&<span style={{fontSize:10,background:"#FEF9C3",color:"#92400E",padding:"1px 7px",borderRadius:4,fontWeight:600}}>⚡ Ready</span>}
                    {o.orderType==="cash"&&<span style={{fontSize:10,background:"#F0FDF4",color:"#15803D",padding:"1px 7px",borderRadius:4,fontWeight:600}}>💵 Cash</span>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:ph?.color||"#6B7280",fontWeight:600}}>Step {o.step}/12 · {s.label}</div>
                    <div style={{fontSize:11,color:"#9CA3AF"}}>{pct}%</div>
                  </div>
                  {lastHist?.date&&<div style={{fontSize:10,color:"#9CA3AF",marginTop:4}}>Last update: {fDT(lastHist.date,lastHist.time)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}
