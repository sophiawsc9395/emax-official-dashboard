import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];

const STEPS=[
  {step:1,label:"New Order Request",icon:"📋",desc:"New order submitted by branch.",who:"branch"},
  {step:2,label:"Ordered",icon:"🛒",desc:"Purchase order placed with supplier.",who:"admin",needsRemark:true},
  {step:3,label:"Arrived HQ",icon:"🏢",desc:"Item received at HQ.",who:"admin"},
  {step:4,label:"Transferring to Branch",icon:"🚚",desc:"Item dispatched from HQ to branch.",who:"admin",needsFiles:[{key:"consignment",label:"Consignment Note"},{key:"stockTransfer",label:"Stock Transfer PDF"}]},
  {step:5,label:"Arrived Branch",icon:"📦",desc:"Branch confirms receipt.",who:"branch"},
  {step:6,label:"Billing Request",icon:"💳",desc:"Branch submits billing request form.",who:"branch",needsBillingForm:true},
  {step:7,label:"Billed",icon:"🧾",desc:"Billing completed by admin.",who:"admin"},
  {step:8,label:"Customer Collection & Payment",icon:"🤝",desc:"Customer collects device and payment confirmed.",who:"admin",needsFiles:[{key:"collectionProof",label:"Customer Collection Proof"},{key:"paymentProof",label:"Upfront Payment Proof"}]},
  {step:9,label:"Checked Phone Collection & Upfront Payment",icon:"✔️",desc:"HQ verifies phone collection and upfront payment proof.",who:"admin",needsVerification:true},
  {step:10,label:"Agreement Checklist by Branch",icon:"📝",desc:"Branch completes agreement checklist and confirms documents.",who:"branch",needsChecklist:true},
  {step:11,label:"Agreement Arrived HQ",icon:"📄",desc:"HQ receives original signed agreement and documents.",who:"admin",canReverse:true},
  {step:12,label:"Checked & Sent for Claim",icon:"✅",desc:"HQ reviews documents and submits claim.",who:"admin",needsFiles:[{key:"claimRef",label:"Claim Submission Reference (optional)",optional:true}]},
];

const CHECKLIST_ITEMS=["Customer IC (copy)","Customer Agreement (signed)","Customer Payment Slip","Device Serial Number Photo","Free Gift Serial No. Photo","Result Listing","Agreement Form"];

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const today=()=>new Date().toISOString().split("T")[0];
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";

/* ─── Progress Bar ─────────────────────────────────────────────────────── */
function ProgressBar({currentStep}){
  const pct=Math.round(((currentStep-1)/11)*100);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Progress</span>
        <span style={{fontSize:11,fontWeight:800,color:currentStep===12?"#86EFAC":"#fff"}}>{pct}%</span>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,.15)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:currentStep===12?"#4ADE80":"#FFD500",borderRadius:3,transition:"width .4s ease"}}/>
      </div>
    </div>
  );
}

/* ─── Tracking Timeline ────────────────────────────────────────────────── */
function TrackingTimeline({order}){
  const current=order.step;
  return(
    <div>
      {STEPS.map((s,i)=>{
        const done=current>s.step;
        const active=current===s.step;
        const hist=(order.history||[]).find(h=>h.step===s.step);
        return(
          <div key={s.step} style={{display:"flex",gap:0,position:"relative"}}>
            {i<STEPS.length-1&&<div style={{position:"absolute",left:19,top:40,width:2,height:"calc(100% - 8px)",background:done?"#0A1628":"#E4EAF2",zIndex:0}}/>}
            <div style={{flexShrink:0,width:40,height:40,borderRadius:"50%",background:done?"#0A1628":active?"#162B52":"#F7F9FC",border:`2px solid ${done?"#0A1628":active?"#0A1628":"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:done?13:15,color:done?"#fff":"inherit",fontWeight:800,zIndex:1,marginRight:14,transition:"all .3s"}}>
              {done?"✓":active?s.icon:<span style={{fontSize:9,fontWeight:700,color:"#CBD5E1"}}>{s.step}</span>}
            </div>
            <div style={{flex:1,paddingBottom:i<STEPS.length-1?16:0,paddingTop:3}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:done||active?700:400,fontSize:12,color:done?"#0A1628":active?"#0A1628":"#9CA3AF"}}>{s.label}</span>
                {active&&<span style={{background:"#0A1628",color:"#FFD500",padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:700}}>CURRENT</span>}
                {done&&hist?.date&&<span style={{fontSize:10,color:"#8A96A8"}}>{fDate(hist.date)}</span>}
              </div>
              {hist&&(hist.remark||hist.files||hist.verificationRemark||hist.checklistItems||hist.returnRemark)&&(
                <div style={{marginTop:5,background:"#F7F9FC",borderRadius:7,padding:"7px 10px",border:"1px solid #E4EAF2"}}>
                  {hist.remark&&<div style={{fontSize:11,color:"#374151",marginBottom:3}}>💬 {hist.remark}</div>}
                  {hist.verificationRemark&&<div style={{fontSize:11,color:"#374151",marginBottom:3}}>🔍 {hist.verificationRemark}</div>}
                  {hist.returnRemark&&<div style={{fontSize:11,color:"#B91C1C",marginBottom:3}}>↩ Returned: {hist.returnRemark}</div>}
                  {hist.checklistItems&&<div style={{fontSize:11,color:"#374151",marginBottom:3}}>📝 Checklist: {hist.checklistItems.filter(x=>x.checked).length}/{hist.checklistItems.length} items</div>}
                  {hist.files&&Object.entries(hist.files).map(([k,f])=>f&&(
                    <a key={k} href={f.data} download={f.name} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"#1E6FDB",textDecoration:"none",background:"#EFF6FF",padding:"2px 8px",borderRadius:4,fontWeight:600,marginRight:4,marginBottom:2}}>📎 {f.name}</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Billing Form ─────────────────────────────────────────────────────── */
function BillingForm({onSubmit,onCancel,existing}){
  const empty={billingDate:today(),customerFullName:"",customerIC:"",customerHP:"",customerAddress:"",customerPostCode:"",customerCity:"",customerEmail:"",itemCode:"",imeiSerial:"",freeGiftItemCode:"",freeGiftItemName:"",cashPriceOnListing:"",deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null};
  const [f,setF]=useState(existing||empty);
  const [files,setFiles]=useState({deviceSerialImg:null,freeGiftSerialImg:null,resultListFile:null,agreementFile:null});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const readFile=file=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:file.name,data:r.result});r.readAsDataURL(file);});
  const submit=async()=>{
    if(!f.customerFullName||!f.customerIC||!f.imeiSerial){alert("Customer name, IC and IMEI/Serial are required.");return;}
    const resolved={...f};
    for(const[k,file] of Object.entries(files)){if(file)resolved[k]=await readFile(file);}
    onSubmit(resolved);
  };
  const fields=[
    ["billingDate","Billing Date","date"],["customerFullName","Customer Full Name","text"],
    ["customerIC","Customer IC Number","text"],["customerHP","Customer HP Number","text"],
    ["customerAddress","Customer Address","text"],["customerPostCode","Post Code","text"],
    ["customerCity","City","text"],["customerEmail","Customer Email","email"],
    ["itemCode","Item Code","text"],["imeiSerial","IMEI / Serial Number","text"],
    ["freeGiftItemCode","Free Gift Item Code (if any)","text"],["freeGiftItemName","Free Gift Item Name (if any)","text"],
    ["cashPriceOnListing","Cash Price on Result Listing (RM)","number"],
  ];
  const fileFields=[
    ["deviceSerialImg","Device Serial No. Image"],["freeGiftSerialImg","Free Gift Serial No. Image (if any)"],
    ["resultListFile","Result Listing File"],["agreementFile","Agreement File"],
  ];
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
      <div style={{background:"#0A1628",padding:"12px 18px"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>💳 Billing Request Form</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Complete all required fields before submitting</div>
      </div>
      <div style={{padding:18}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
          {fields.map(([k,l,t])=>(
            <div key={k} style={k==="customerAddress"?{gridColumn:"1/-1"}:{}}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}{["customerFullName","customerIC","imeiSerial"].includes(k)&&<span style={{color:"#B91C1C"}}> *</span>}</label>
              <input className="input" type={t} value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12,marginBottom:16}}>
          {fileFields.map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[k]:e.target.files[0]||null}))} style={{fontSize:11,width:"100%"}}/>
              {(files[k]||f[k])&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>✓ {files[k]?.name||f[k]?.name}</div>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{padding:"9px 22px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Submit Billing Request</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Checklist Form ───────────────────────────────────────────────────── */
function ChecklistForm({onSubmit,onCancel}){
  const [items,setItems]=useState(CHECKLIST_ITEMS.map(name=>({name,checked:false})));
  const toggle=i=>setItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x));
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:12}}>
      <div style={{background:"#0A1628",padding:"12px 18px"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>📝 Agreement Checklist</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:1}}>Tick all items included before sending to HQ</div>
      </div>
      <div style={{padding:16}}>
        {items.map((item,i)=>(
          <div key={i} onClick={()=>toggle(i)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,background:item.checked?"#F0FDF4":"#F7F9FC",border:`1px solid ${item.checked?"#BBF7D0":"#E4EAF2"}`,marginBottom:8,cursor:"pointer"}}>
            <div style={{width:20,height:20,borderRadius:4,background:item.checked?"#15803D":"#fff",border:`2px solid ${item.checked?"#15803D":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {item.checked&&<span style={{fontSize:12,color:"#fff",fontWeight:800}}>✓</span>}
            </div>
            <span style={{fontSize:13,color:item.checked?"#15803D":"#374151",fontWeight:item.checked?600:400}}>{item.name}</span>
          </div>
        ))}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={()=>onSubmit(items)} style={{padding:"9px 22px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Submit Checklist</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Action Panel ─────────────────────────────────────────────────────── */
function ActionPanel({order,isAdmin,onUpdate}){
  const nextDef=order.step<12?getStep(order.step+1):null;
  const currentDef=getStep(order.step);
  const [remark,setRemark]=useState("");
  const [verificationRemark,setVerificationRemark]=useState("");
  const [returnRemark,setReturnRemark]=useState("");
  const [files,setFiles]=useState({});
  const [saving,setSaving]=useState(false);
  const [showBillingForm,setShowBillingForm]=useState(false);
  const [showChecklist,setShowChecklist]=useState(false);
  const [showReturnForm,setShowReturnForm]=useState(false);
  const [returnItems,setReturnItems]=useState(CHECKLIST_ITEMS.map(name=>({name,issue:false})));

  if(!nextDef&&order.step===12)return(
    <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:24}}>🎉</span>
      <div><div style={{fontWeight:800,fontSize:14,color:"#15803D"}}>Order Complete</div><div style={{fontSize:12,color:"#166534",marginTop:2}}>Claim submitted. All steps done.</div></div>
    </div>
  );

  if(!nextDef)return null;
  const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:f.name,data:r.result});r.readAsDataURL(f);});
  const branchCanAdvance=isAdmin||[5,6,10].includes(nextDef.step);

  // Step 6: billing form handled separately
  if(nextDef.step===6&&!isAdmin){
    if(showBillingForm)return<BillingForm onCancel={()=>setShowBillingForm(false)} onSubmit={async(billingData)=>{
      setSaving(true);
      const hist={step:6,date:today(),note:"Billing Request",billingData};
      const updated={...order,step:6,billingData,history:[...(order.history||[]),hist]};
      await onUpdate(updated);setSaving(false);setShowBillingForm(false);
    }}/>;
    return(
      <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
        <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>💳</span>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>Next: Billing Request</div><div style={{fontSize:11,color:"#6B7280"}}>Submit billing request form to proceed.</div></div>
        </div>
        <div style={{padding:"14px 16px"}}>
          <button onClick={()=>setShowBillingForm(true)} style={{width:"100%",padding:"11px 0",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Fill Billing Request Form →</button>
        </div>
      </div>
    );
  }

  // Step 10: checklist form
  if(nextDef.step===10&&!isAdmin){
    if(showChecklist)return<ChecklistForm onCancel={()=>setShowChecklist(false)} onSubmit={async(checklistItems)=>{
      setSaving(true);
      const hist={step:10,date:today(),note:"Agreement Checklist Completed",checklistItems};
      const updated={...order,step:10,checklistItems,history:[...(order.history||[]),hist]};
      await onUpdate(updated);setSaving(false);setShowChecklist(false);
    }}/>;
    return(
      <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
        <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📝</span>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>Next: Agreement Checklist</div><div style={{fontSize:11,color:"#6B7280"}}>Complete checklist before sending documents to HQ.</div></div>
        </div>
        <div style={{padding:"14px 16px"}}>
          <button onClick={()=>setShowChecklist(true)} style={{width:"100%",padding:"11px 0",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Complete Agreement Checklist →</button>
        </div>
      </div>
    );
  }

  const advance=async()=>{
    setSaving(true);
    const resolvedFiles={};
    for(const[k,f] of Object.entries(files)){if(f)resolvedFiles[k]=await readFile(f);}
    const hist={step:nextDef.step,date:today(),note:nextDef.label,remark:remark||undefined,verificationRemark:verificationRemark||undefined,files:Object.keys(resolvedFiles).length?resolvedFiles:undefined};
    const updated={...order,step:nextDef.step,history:[...(order.history||[]),hist]};
    if(nextDef.step===2&&remark)updated.adminRemark=remark;
    await onUpdate(updated);setSaving(false);setRemark("");setVerificationRemark("");setFiles({});
  };

  const canSubmit=()=>{
    if(!branchCanAdvance)return false;
    if(nextDef.needsRemark&&isAdmin&&!remark.trim())return false;
    if(nextDef.needsFiles){
      const required=nextDef.needsFiles.filter(f=>!f.optional);
      if(isAdmin&&required.some(f=>!files[f.key]))return false;
    }
    return true;
  };

  // Step 11: can reverse to step 10
  const reverseToChecklist=async()=>{
    if(!returnRemark.trim()){alert("Please write a return remark.");return;}
    setSaving(true);
    const issueItems=returnItems.filter(x=>x.issue).map(x=>x.name);
    const hist={step:10,date:today(),note:"Returned to Branch — Agreement Issues",returnRemark,issueItems,reversedFrom:11};
    const updated={...order,step:10,history:[...(order.history||[]),hist]};
    await onUpdate(updated);setSaving(false);setShowReturnForm(false);setReturnRemark("");
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
        <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>{nextDef.icon}</span>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>Next: {nextDef.label}</div><div style={{fontSize:11,color:"#6B7280"}}>{nextDef.desc}</div></div>
        </div>
        <div style={{padding:"14px 16px"}}>
          {!branchCanAdvance&&<div style={{fontSize:12,color:"#8A96A8",fontStyle:"italic"}}>⏳ Waiting for admin to process this step.</div>}
          {branchCanAdvance&&<>
            {nextDef.needsRemark&&isAdmin&&<div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Admin Remark — Supplier / Order Details / ETA <span style={{color:"#B91C1C"}}>*</span></label>
              <textarea className="input" value={remark} onChange={e=>setRemark(e.target.value)} rows={3} style={{fontSize:12,resize:"vertical"}} placeholder="Supplier, ETA, order ref…"/>
            </div>}
            {nextDef.needsVerification&&isAdmin&&<div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Verification Remark (phone collection + upfront payment confirmed)</label>
              <textarea className="input" value={verificationRemark} onChange={e=>setVerificationRemark(e.target.value)} rows={2} style={{fontSize:12,resize:"vertical"}} placeholder="Confirm phone collected and upfront payment verified…"/>
            </div>}
            {nextDef.needsFiles&&isAdmin&&nextDef.needsFiles.map(({key,label,optional})=>(
              <div key={key} style={{marginBottom:12}}>
                <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload {label} {!optional&&<span style={{color:"#B91C1C"}}>*</span>}{optional&&<span style={{color:"#8A96A8"}}> (optional)</span>}</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:12,width:"100%"}}/>
                {files[key]&&<div style={{fontSize:11,color:"#15803D",marginTop:3}}>✓ {files[key].name}</div>}
              </div>
            ))}
            {!nextDef.needsRemark&&!nextDef.needsVerification&&!nextDef.needsFiles&&<div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Remark (optional)</label>
              <input className="input" value={remark} onChange={e=>setRemark(e.target.value)} style={{fontSize:12}} placeholder="Optional note…"/>
            </div>}
            <button onClick={advance} disabled={!canSubmit()||saving} style={{width:"100%",padding:"11px 0",background:canSubmit()&&!saving?"#0A1628":"#E4EAF2",color:canSubmit()&&!saving?"#fff":"#8A96A8",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:canSubmit()&&!saving?"pointer":"default",fontFamily:"Inter,sans-serif"}}>
              {saving?"Saving…":`Confirm: ${nextDef.label} →`}
            </button>
          </>}
        </div>
      </div>

      {/* Step 11: reverse to step 10 */}
      {order.step===11&&isAdmin&&<>
        {!showReturnForm?<button onClick={()=>setShowReturnForm(true)} style={{width:"100%",padding:"9px 0",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>↩ Return to Branch (Agreement Issues)</button>:
        <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontWeight:700,fontSize:13,color:"#B91C1C",marginBottom:10}}>↩ Return Agreement to Branch</div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Return Remark <span style={{color:"#B91C1C"}}>*</span></label>
            <textarea className="input" value={returnRemark} onChange={e=>setReturnRemark(e.target.value)} rows={2} style={{fontSize:12,resize:"vertical",borderColor:"#FECACA"}} placeholder="Reason for returning…"/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Mark problematic checklist items</label>
            {returnItems.map((item,i)=>(
              <div key={i} onClick={()=>setReturnItems(p=>p.map((x,j)=>j===i?{...x,issue:!x.issue}:x))} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:item.issue?"#FEE2E2":"#fff",border:`1px solid ${item.issue?"#FECACA":"#E4EAF2"}`,marginBottom:4,cursor:"pointer"}}>
                <div style={{width:16,height:16,borderRadius:3,background:item.issue?"#B91C1C":"#fff",border:`2px solid ${item.issue?"#B91C1C":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {item.issue&&<span style={{fontSize:10,color:"#fff",fontWeight:800}}>✗</span>}
                </div>
                <span style={{fontSize:12,color:item.issue?"#B91C1C":"#374151"}}>{item.name}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowReturnForm(false)} className="btn btn-ghost" style={{flex:1}}>Cancel</button>
            <button onClick={reverseToChecklist} disabled={saving} style={{flex:2,padding:"9px 0",background:"#B91C1C",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{saving?"Saving…":"↩ Return to Branch"}</button>
          </div>
        </div>}
      </>}
    </div>
  );
}

/* ─── Order Detail ─────────────────────────────────────────────────────── */
function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin}){
  const step=getStep(order.step);
  const isCash=order.orderType==="cash";
  const isReadyStock=order.stockStatus==="ready";
  return(
    <div>
      {/* Header card */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"20px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap"}}>
                <span style={{fontSize:9,color:"rgba(255,255,255,.4)",background:"rgba(255,255,255,.08)",padding:"2px 8px",borderRadius:4}}>{shortId(order.id)}</span>
                <span style={{fontSize:9,fontWeight:700,color:"#FFD500",background:"rgba(255,213,0,.15)",padding:"2px 8px",borderRadius:4}}>{isReadyStock?"⚡ READY STOCK":"📋 STOCK REQUEST"}</span>
                {isCash&&<span style={{fontSize:9,fontWeight:700,color:"#86EFAC",background:"rgba(134,239,172,.15)",padding:"2px 8px",borderRadius:4}}>💵 CASH ORDER</span>}
                {!isCash&&<span style={{fontSize:9,fontWeight:700,color:"#93C5FD",background:"rgba(147,197,253,.15)",padding:"2px 8px",borderRadius:4}}>🏦 CCM ORDER</span>}
              </div>
              <div style={{fontWeight:900,fontSize:18,color:"#fff",lineHeight:1.2}}>{order.phoneModel}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:4}}>{order.customerName} · {order.branch} · {order.salesAgentName||order.salesAgentId||"—"}</div>
            </div>
            <button onClick={onBack} style={{padding:"6px 12px",background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.7)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>← Back</button>
          </div>
          <ProgressBar currentStep={order.step}/>
        </div>
        {/* Status banner */}
        <div style={{padding:"12px 20px",background:order.step===12?"#F0FDF4":"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{step.icon}</span>
          <div>
            <div style={{fontWeight:800,fontSize:13,color:order.step===12?"#15803D":"#0A1628"}}>Step {order.step} of 12 — {step.label}</div>
            <div style={{fontSize:11,color:"#6B7280"}}>{step.desc}</div>
          </div>
        </div>
        {/* Fields grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))"}}>
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
        {/* Billing data summary */}
        {order.billingData&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#F0F4FA"}}>
          <div style={{fontSize:9,color:"#1E6FDB",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Billing Details</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:6}}>
            {[["IC",order.billingData.customerIC],["HP",order.billingData.customerHP],["Email",order.billingData.customerEmail],["IMEI",order.billingData.imeiSerial],["Item Code",order.billingData.itemCode],["Cash Price",fRM(order.billingData.cashPriceOnListing)],["Billing Date",fDate(order.billingData.billingDate)]].map(([l,v])=>v&&(
              <div key={l}>
                <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</div>
                <div style={{fontSize:11,fontWeight:600,color:"#0A1628"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>}
        {/* Checklist summary */}
        {order.checklistItems&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#F0FDF4"}}>
          <div style={{fontSize:9,color:"#15803D",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Agreement Checklist ({order.checklistItems.filter(x=>x.checked).length}/{order.checklistItems.length} items)</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {order.checklistItems.map((item,i)=>(
              <span key={i} style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:item.checked?"#DCFCE7":"#FEF2F2",color:item.checked?"#15803D":"#B91C1C",fontWeight:600}}>
                {item.checked?"✓":"✗"} {item.name}
              </span>
            ))}
          </div>
        </div>}
        {isAdmin&&<div style={{padding:"10px 16px",display:"flex",gap:8}}>
          <button onClick={onEdit} style={{padding:"6px 16px",background:"#F7F9FC",color:"#0A1628",border:"1px solid #E4EAF2",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit Order</button>
          <button onClick={onDelete} style={{padding:"6px 16px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Delete</button>
        </div>}
      </div>
      {/* Two-col layout */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",padding:"16px 20px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>Tracking Timeline</div>
          <TrackingTimeline order={order}/>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Required Action</div>
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
  const slipRef=useRef(null);
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
    const initHistory=isReadyStock?[
      {step:1,date:today(),note:"Order submitted"},
      {step:2,date:today(),note:"Ready stock — order placed"},
      {step:3,date:today(),note:"Ready stock — arrived HQ"},
      {step:4,date:today(),note:"Ready stock — dispatching to branch"},
    ]:[{step:1,date:today(),note:"Order submitted"}];
    onSave({...f,depositSlip,id:order?.id||Date.now().toString(),step:order?.step||initStep,history:order?.history||initHistory});
  };
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
      <div style={{background:"#0A1628",padding:"14px 20px"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{order?"Edit Order":"New Order Request"}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Fill in all order details</div>
      </div>
      <div style={{padding:20}}>
        {/* Stock & Order type toggles */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16,padding:"14px 16px",background:"#F7F9FC",borderRadius:10,border:"1px solid #E4EAF2"}}>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Stock Status <span style={{color:"#B91C1C"}}>*</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["stock_request","📋 Stock Request"],["ready","⚡ Ready Stock"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("stockStatus",v)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${f.stockStatus===v?"#0A1628":"#E4EAF2"}`,background:f.stockStatus===v?"#0A1628":"#fff",color:f.stockStatus===v?"#fff":"#4A5568",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
            {isReadyStock&&<div style={{fontSize:10,color:"#059669",marginTop:5,fontWeight:600}}>⚡ Skips to Step 4 on submit</div>}
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Order Type <span style={{color:"#B91C1C"}}>*</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["ccm","🏦 CCM"],["cash","💵 Cash"]].map(([v,l])=>(
                <button key={v} onClick={()=>set("orderType",v)} style={{flex:1,padding:"8px 4px",borderRadius:8,border:`2px solid ${f.orderType===v?"#0A1628":"#E4EAF2"}`,background:f.orderType===v?"#0A1628":"#fff",color:f.orderType===v?"#fff":"#4A5568",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        {/* Core fields */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
          {[["phoneModel","Phone Model / Item","text"],["customerName","Customer Name","text"]].map(([k,l,t])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l} <span style={{color:"#B91C1C"}}>*</span></label>
              <input className="input" type={t} value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
            <select className="input select" value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch} style={{fontSize:12}}>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sales Agent</label>
            {branchSRs.length>0
              ?<select className="input select" value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}} style={{fontSize:12}}>
                <option value="">— Select SR —</option>
                {branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}
              </select>
              :<input className="input" value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} style={{fontSize:12}} placeholder="Agent ID"/>
            }
          </div>
        </div>
        {/* CCM fields */}
        {!isCash&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:16,padding:"14px 16px",background:"#F0F4FA",borderRadius:10,border:"1px solid #E4EAF2"}}>
          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#1E6FDB",textTransform:"uppercase",letterSpacing:"0.06em"}}>🏦 CCM / Financing Details</div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Merchant</label>
            <select className="input select" value={f.merchant} onChange={e=>set("merchant",e.target.value)} style={{fontSize:12}}>
              {MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {[["agreementNumber","Agreement No."],["financePrice","Finance Price (RM)"],["stampingFee","Stamping Fee (RM)"],["agreementFee","Agreement Fee (RM)"]].map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
              <input className="input" type={k.includes("Price")||k.includes("Fee")?"number":"text"} value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Aeon Approval Date</label>
            <input className="input" type="date" value={f.aeonApprovalDate} onChange={e=>set("aeonApprovalDate",e.target.value)} style={{fontSize:12}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit (RM)</label>
            <input className="input" type="number" value={f.deposit} onChange={e=>set("deposit",e.target.value)} style={{fontSize:12}}/>
          </div>
        </div>}
        {/* Cash fields */}
        {isCash&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:16,padding:"14px 16px",background:"#F0FDF4",borderRadius:10,border:"1px solid #BBF7D0"}}>
          <div style={{gridColumn:"1/-1",fontSize:10,fontWeight:700,color:"#15803D",textTransform:"uppercase",letterSpacing:"0.06em"}}>💵 Cash Order Details</div>
          {[["retailPrice","Retail Price (RM)"],["deposit","Deposit (RM)"]].map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
              <input className="input" type="number" value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit Payment Date</label>
            <input className="input" type="date" value={f.depositPaymentDate} onChange={e=>set("depositPaymentDate",e.target.value)} style={{fontSize:12}}/>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Deposit Payment Slip</label>
            <input ref={slipRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setSlipFile(e.target.files[0]||null)} style={{fontSize:12}}/>
            {(slipFile||f.depositSlip)&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>✓ {slipFile?.name||f.depositSlip?.name}</div>}
          </div>
        </div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{padding:"10px 24px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
            {order?"Save Changes":isReadyStock?"⚡ Submit & Dispatch":"Submit Order Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Export ──────────────────────────────────────────────────────── */
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
  if(view==="form"){
    return<div className="fade-in"><OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} srList={srList} onSave={async o=>{await saveOrder(o);setEditOrder(null);}} onCancel={()=>{setView(editOrder?"detail":"list");setEditOrder(null);}}/></div>;
  }

  const statCounts=STEPS.reduce((acc,s)=>{acc[s.step]=orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step===s.step).length;return acc;},{});

  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:900,color:"#0A1628",margin:0}}>Order Tracking</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:3}}>{filtered.length} order{filtered.length!==1?"s":""} · {orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step<12).length} active</div>
        </div>
        <button onClick={()=>{setEditOrder(null);setView("form");}} style={{padding:"9px 20px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>+ New Order</button>
      </div>
      {/* Step filter pills */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,paddingBottom:2}}>
        <button onClick={()=>setFilterStep("ALL")} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep==="ALL"?"#0A1628":"#F3F4F6",color:filterStep==="ALL"?"#fff":"#6B7280",whiteSpace:"nowrap"}}>All ({orders.filter(o=>!userBranch||o.branch===userBranch).length})</button>
        {STEPS.map(s=>statCounts[s.step]>0&&(
          <button key={s.step} onClick={()=>setFilterStep(String(s.step))} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep===String(s.step)?"#0A1628":"#F3F4F6",color:filterStep===String(s.step)?"#fff":"#4B5563",whiteSpace:"nowrap"}}>
            {s.icon} {s.label} ({statCounts[s.step]})
          </button>
        ))}
      </div>
      {/* Search + filter */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <input className="input" placeholder="Search customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:180,fontSize:12}}/>
        {isAdmin&&<select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120,fontSize:12,padding:"6px 24px 6px 8px"}}>
          <option value="ALL">All Branches</option>
          {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
        </select>}
      </div>
      {/* Order cards */}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#8A96A8",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #E4EAF2"}}>
        {search||filterStep!=="ALL"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click + New Order to get started."}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {filtered.map(o=>{
          const s=getStep(o.step);
          const pct=Math.round(((o.step-1)/11)*100);
          return(
            <div key={o.id} onClick={()=>{setSelectedOrder(o);setView("detail");}} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",cursor:"pointer",overflow:"hidden",transition:"box-shadow .15s,border-color .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#0A1628";e.currentTarget.style.boxShadow="0 4px 16px rgba(10,22,40,.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E4EAF2";e.currentTarget.style.boxShadow="none";}}>
              <div style={{background:o.step===12?"linear-gradient(135deg,#14532D,#166534)":"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
                      <span style={{fontSize:8,color:"rgba(255,255,255,.35)",background:"rgba(255,255,255,.07)",padding:"1px 6px",borderRadius:3}}>{shortId(o.id)}</span>
                      {o.stockStatus==="ready"&&<span style={{fontSize:8,fontWeight:700,color:"#FFD500",background:"rgba(255,213,0,.15)",padding:"1px 6px",borderRadius:3}}>⚡ READY</span>}
                      {o.orderType==="cash"&&<span style={{fontSize:8,fontWeight:700,color:"#86EFAC",background:"rgba(134,239,172,.15)",padding:"1px 6px",borderRadius:3}}>💵 CASH</span>}
                    </div>
                    <div style={{fontWeight:800,fontSize:14,color:"#fff",lineHeight:1.2}}>{o.phoneModel}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>{o.branch} · {o.merchant||"Cash"}</div>
                  </div>
                  <span style={{fontSize:20}}>{s.icon}</span>
                </div>
              </div>
              <div style={{height:3,background:"#E4EAF2"}}>
                <div style={{height:"100%",width:`${pct}%`,background:o.step===12?"#15803D":"#1E6FDB"}}/>
              </div>
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
