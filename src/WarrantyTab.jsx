/**
 * Warranty — Branch submits a warranty request for a defective device →
 * Admin uploads the Stock Transfer File to mark it Received by HQ →
 * Admin uploads a Service Form to move it to Transfer to Service Center →
 * Admin writes a Consignment Note and uploads another Stock Transfer File
 * to move it to Return to Branch → Admin confirms Completed.
 *
 * UI follows the same list -> click-to-detail pattern as Order Tracking:
 * KPI cards, branch filter, search, "+ New Warranty Request" button, and
 * clicking a row opens full detail + tracking timeline + action panel.
 *
 * Storage: same simple key-value table pattern as JCL/Chailease
 * Applications, so this ships without any manual Supabase schema
 * migration.
 */
import {useState,useEffect,useRef} from "react";
import {loadData,saveData,supabase} from "./storage/index.js";
import {uploadOrderFile,signFileUrl} from "./storage/ordersApi.js";

export const WARRANTY_KEY="emax_v5_warranty_requests";
const STOCK_EMAIL="emaxstock@gmail.com";

const STEPS=[
  {step:1,label:"New Request",color:"#1D4ED8",bg:"#EFF6FF"},
  {step:2,label:"Received by HQ",color:"#7C3AED",bg:"#F5F0FF"},
  {step:3,label:"Transfer to Service Center",color:"#B45309",bg:"#FFFBEB"},
  {step:4,label:"Return to Branch",color:"#0891B2",bg:"#ECFEFF"},
  {step:5,label:"Completed",color:"#15803D",bg:"#F0FDF4"},
];
const stepDef=n=>STEPS.find(s=>s.step===n)||STEPS[0];

const Ic={
  chevL:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  chevR:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  trash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  plus:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  fileText:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  box:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  truck:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  rotate:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>,
  checkCircle:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
};
const STEP_ICONS={1:Ic.fileText,2:Ic.box,3:Ic.truck,4:Ic.rotate,5:Ic.checkCircle};

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const sellingBranches=bm=>Object.keys(bm||{}).filter(b=>b!=="SDK");

const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const TX=props=><textarea {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",resize:"vertical",...(props.style||{})}}/>;
const SEL=props=><select {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":"0 2px 8px rgba(27,63,114,.35)",transition:"all .15s",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",...(p.style||{})}}>{children}</button>;
const DBtnLocal=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"9px 16px",background:"transparent",color:"#DC2626",border:"1px solid rgba(220,38,38,.3)",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:p.disabled?.5:1,...(p.style||{})}}>{children}</button>;

function StepBadge({step}){
  const s=stepDef(step);
  return<span style={{fontSize:9,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{s.label}</span>;
}

// Navy gradient section header, matching Order Tracking's SecHdr exactly.
function SecHdr({icon,children}){
  return<div style={{display:"flex",alignItems:"center",gap:7,padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:"rgba(255,255,255,.85)"}}>{icon}</span>}{children}</div>;
}

function readAppFile(f,syntheticId){
  return new Promise((res,rej)=>{
    if(!f.type||!f.type.startsWith("image/")){uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);return;}
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
        uploadOrderFile(syntheticId,blob,f.name).then(res).catch(rej);
      },"image/jpeg",0.82);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);};
    img.src=url;
  });
}

function ProgressBar({step}){
  const pct=Math.round(((Math.min(step,5)-1)/4)*100);
  const cur=stepDef(step);
  return<div style={{...card,padding:"16px 18px",marginBottom:14}}>
    <div style={{display:"flex",width:"100%"}}>
      {STEPS.map((s,i)=>{
        const done=step>s.step,active=step===s.step;
        return<div key={s.step} style={{flex:i<STEPS.length-1?1:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
          <div style={{display:"flex",alignItems:"center",width:"100%"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:done?C.navy:active?C.blueBright:"#E4EAF2",border:`2px solid ${done?C.navy:active?C.blueBright:"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .2s"}}>
              {done?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{i+1}</span>}
            </div>
            {i<STEPS.length-1&&<div style={{flex:1,height:2,background:done?C.navy:"#E4EAF2",margin:"0 3px",transition:"background .3s"}}/>}
          </div>
          <div style={{marginTop:5,paddingLeft:1,maxWidth:110}}>
            <div style={{fontSize:9,fontWeight:700,color:active?C.blue:done?C.textMid:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",lineHeight:1.2}}>{s.label}</div>
          </div>
        </div>;
      })}
    </div>
    <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden",marginTop:10}}>
      <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.blueBright})`,borderRadius:2,transition:"width .5s cubic-bezier(.4,0,.2,1)"}}/>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.textLight}}>
      <span>Step {step} of 5{cur?` — ${cur.label}`:""}</span><span style={{fontWeight:700,color:C.blue}}>{pct}%</span>
    </div>
  </div>;
}

function Timeline({app}){
  const hist=app.history||[];
  return<div>{STEPS.map((s,i)=>{
    const done=app.step>s.step,active=app.step===s.step;
    const entries=hist.filter(h=>h.step===s.step);
    const isLast=i===STEPS.length-1;
    return<div key={s.step} style={{display:"flex",position:"relative"}}>
      {!isLast&&<div style={{position:"absolute",left:11,top:24,width:1,height:"calc(100% + 2px)",background:done?C.navy+"30":C.border,zIndex:0}}/>}
      <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:done?C.navy:active?C.blueBright:C.surface,border:`2px solid ${done?C.navy:active?C.blueBright:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:10,marginTop:1,color:"#fff"}}>
        {done?<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:active?<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{s.step}</span>}
      </div>
      <div style={{flex:1,paddingBottom:isLast?0:14,paddingTop:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:done||active?700:400,color:done||active?C.text:"#9CA3AF"}}>{s.label}</span>
          {active&&<span style={{background:C.surface,color:C.blueBright,padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:700,border:`1px solid ${C.border}`}}>Current</span>}
        </div>
        {entries.map((h,hi)=><div key={hi} style={{marginTop:4,background:C.surface,borderRadius:7,padding:"6px 10px",border:`1px solid ${C.border}`,fontSize:11,color:C.textMid}}>
          <div style={{marginBottom:3,fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em"}}>{fDate(h.date)} {h.time||""}</div>
          {h.note&&<div>{h.note}</div>}
        </div>)}
      </div>
    </div>;
  })}</div>;
}

const emptyForm=userBranch=>({
  branch:userBranch||"",deviceName:"",requestDate:nowDate(),imei:"",
  customerName:"",customerPhone:"",sendDate:"",
  invoiceFile:null,proofFile:null,
});

function RequestForm({branchMeta,userBranch,editingApp,onSaved,onCancel}){
  const isEdit=!!editingApp;
  const [f,setF]=useState(()=>isEdit?{...editingApp}:emptyForm(userBranch));
  const [invoiceFile,setInvoiceFile]=useState(null);
  const [proofFile,setProofFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const missing=!f.branch||!f.deviceName.trim()||!f.requestDate||!f.imei.trim()||!f.customerName.trim()||!f.customerPhone.trim()||!f.sendDate||(!isEdit&&!invoiceFile)||(!isEdit&&!proofFile);

  const submit=async()=>{
    if(missing)return;
    setSaving(true);
    const id=editingApp?.id||Date.now().toString();
    const[invoice,proof]=await Promise.all([
      invoiceFile?readAppFile(invoiceFile,`${id}_invoiceFile`):Promise.resolve(f.invoiceFile||null),
      proofFile?readAppFile(proofFile,`${id}_proofFile`):Promise.resolve(f.proofFile||null),
    ]);
    const now=nowDate(),time=nowTime();
    const app=isEdit
      ?{...editingApp,...f,invoiceFile:invoice,proofFile:proof}
      :{id,step:1,branch:f.branch,deviceName:f.deviceName,requestDate:f.requestDate,imei:f.imei,
        customerName:f.customerName,customerPhone:f.customerPhone,sendDate:f.sendDate,
        invoiceFile:invoice,proofFile:proof,
        submittedAt:now,submittedTime:time,
        stockTransferFile1:null,serviceForm:null,consignmentNote:"",stockTransferFile2:null,
        history:[{step:1,date:now,time,note:"New warranty request submitted by branch."}]};
    await onSaved(app);
    setSaving(false);
  };

  return<div>
    <GBtn onClick={onCancel} style={{marginBottom:14}}>{Ic.chevL} Back</GBtn>
    <div style={{...card,padding:20}}>
      <h2 style={{fontSize:16,fontWeight:800,color:C.navy,margin:"0 0 16px"}}>{isEdit?"Edit Warranty Request":"New Warranty Request"}</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div><L req>Branch</L>{userBranch?<I value={branchMeta[userBranch]?.name||userBranch} disabled/>:<SEL value={f.branch} onChange={e=>set("branch",e.target.value)}><option value="">Select branch…</option>{sellingBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}</SEL>}</div>
        <div><L req>Device Name</L><I value={f.deviceName} onChange={e=>set("deviceName",e.target.value)} placeholder="e.g. iPhone 15 Pro 256GB"/></div>
        <div><L req>Request Date</L><I type="date" value={f.requestDate} onChange={e=>set("requestDate",e.target.value)}/></div>
        <div><L req>IMEI Number</L><I value={f.imei} onChange={e=>set("imei",e.target.value)} placeholder="15-digit IMEI"/></div>
        <div><L req>Customer Name</L><I value={f.customerName} onChange={e=>set("customerName",e.target.value)} placeholder="Full name"/></div>
        <div><L req>Customer Phone Number</L><I value={f.customerPhone} onChange={e=>set("customerPhone",e.target.value)} placeholder="e.g. 012-3456789"/></div>
        <div><L req>Date of Sending Device Back to HQ</L><I type="date" value={f.sendDate} onChange={e=>set("sendDate",e.target.value)}/></div>
        <div style={{gridColumn:"1/-1"}}>
          <L req={!isEdit}>Upload Invoice{isEdit&&f.invoiceFile?" (already uploaded — choose a file to replace)":""}</L>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setInvoiceFile(e.target.files[0]||null)} style={{fontSize:12}}/>
          {invoiceFile&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{invoiceFile.name}</div>}
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <L req={!isEdit}>Upload Video or Photo Showing Defect / Problem{isEdit&&f.proofFile?" (already uploaded — choose a file to replace)":""}</L>
          <input type="file" accept="video/*,image/*" onChange={e=>setProofFile(e.target.files[0]||null)} style={{fontSize:12}}/>
          {proofFile&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{proofFile.name}</div>}
        </div>
      </div>
      <div style={{marginTop:20,display:"flex",gap:8}}>
        <PBtn onClick={submit} disabled={missing||saving}>{saving?"Saving…":isEdit?"Save Changes":"Submit Request"}</PBtn>
        <GBtn onClick={onCancel} disabled={saving}>Cancel</GBtn>
      </div>
    </div>
  </div>;
}

// No outer card/SecHdr here — this renders straight inside the Action
// Panel's own card+SecHdr wrapper in RequestDetail, avoiding a
// card-within-a-card.
function AdminStepActionsInner({app,email,onAdvance}){
  const [transferFile,setTransferFile]=useState(null);
  const [serviceForm,setServiceForm]=useState(null);
  const [consignmentNote,setConsignmentNote]=useState("");
  const [returnTransferFile,setReturnTransferFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const canUploadStockTransfer=["sophiawsc9395@gmail.com","boontheng2004@gmail.com",STOCK_EMAIL].includes((email||"").toLowerCase());


  if(app.step===1)return<div>
    <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>Upload the Stock Transfer File before this can move to Received by HQ.</div>
    <L req>Stock Transfer File</L>
    <input type="file" disabled={!canUploadStockTransfer} onChange={e=>setTransferFile(e.target.files[0]||null)} style={{fontSize:12}}/>
    {transferFile&&<div style={{fontSize:10,color:"#15803D",marginTop:6,fontWeight:600}}>{transferFile.name}</div>}
    <div style={{marginTop:12}}><PBtn disabled={!transferFile||saving} onClick={async()=>{
      setSaving(true);
      const file=await readAppFile(transferFile,`${app.id}_stockTransferFile1`);
      await onAdvance({...app,step:2,stockTransferFile1:file,history:[...app.history,{step:2,date:nowDate(),time:nowTime(),note:"Stock received at HQ."}]});
      setSaving(false);
    }}>{Ic.box} {saving?"Saving…":"Mark Received by HQ"}</PBtn></div>
  </div>;

  if(app.step===2)return<div>
    <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>Upload the Service Form before this can move to Transfer to Service Center.</div>
    <L req>Service Form</L>
    <input type="file" onChange={e=>setServiceForm(e.target.files[0]||null)} style={{fontSize:12}}/>
    {serviceForm&&<div style={{fontSize:10,color:"#15803D",marginTop:6,fontWeight:600}}>{serviceForm.name}</div>}
    <div style={{marginTop:12}}><PBtn disabled={!serviceForm||saving} onClick={async()=>{
      setSaving(true);
      const file=await readAppFile(serviceForm,`${app.id}_serviceForm`);
      await onAdvance({...app,step:3,serviceForm:file,history:[...app.history,{step:3,date:nowDate(),time:nowTime(),note:"Sent to authorized service center for repair."}]});
      setSaving(false);
    }}>{Ic.truck} {saving?"Saving…":"Transfer to Service Center"}</PBtn></div>
  </div>;

  if(app.step===3)return<div>
    <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>Write the Consignment Note and upload the Stock Transfer File before this can move to Return to Branch.</div>
    <L req>Consignment Note</L>
    <TX value={consignmentNote} onChange={e=>setConsignmentNote(e.target.value)} rows={3} style={{marginBottom:10}} placeholder="e.g. CN-88213, 1 unit, condition notes…"/>
    <L req>Stock Transfer File</L>
    <input type="file" disabled={!canUploadStockTransfer} onChange={e=>setReturnTransferFile(e.target.files[0]||null)} style={{fontSize:12}}/>
    {returnTransferFile&&<div style={{fontSize:10,color:"#15803D",marginTop:6,fontWeight:600}}>{returnTransferFile.name}</div>}
    <div style={{marginTop:12}}><PBtn disabled={!consignmentNote.trim()||!returnTransferFile||saving} onClick={async()=>{
      setSaving(true);
      const file=await readAppFile(returnTransferFile,`${app.id}_stockTransferFile2`);
      await onAdvance({...app,step:4,consignmentNote,stockTransferFile2:file,history:[...app.history,{step:4,date:nowDate(),time:nowTime(),note:`Repaired device sent back to branch. Consignment Note: ${consignmentNote}`}]});
      setSaving(false);
    }}>{Ic.rotate} {saving?"Saving…":"Return to Branch"}</PBtn></div>
  </div>;

  if(app.step===4)return<div>
    <div style={{fontSize:12,color:C.textMid,marginBottom:10}}>Confirm this warranty case is fully closed.</div>
    <PBtn disabled={saving} onClick={async()=>{
      setSaving(true);
      await onAdvance({...app,step:5,history:[...app.history,{step:5,date:nowDate(),time:nowTime(),note:"Returned to customer — case closed."}]});
      setSaving(false);
    }}>{Ic.checkCircle} {saving?"Saving…":"Mark Completed"}</PBtn>
  </div>;

  return null;
}

function DOC_FIELD_URL(app,key,fileUrls){return fileUrls[`${app.id}_${key}`];}

function RequestDetail({app,branchMeta,isAdmin,canEditDelete,email,fileUrls,onBack,onAdvance,onDelete,onEdit}){
  const openFile=url=>{if(url)window.open(url,"_blank");};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <GBtn onClick={onBack}>{Ic.chevL} Back</GBtn>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <StepBadge step={app.step}/>
        {(isAdmin||canEditDelete)&&<GBtn onClick={onEdit}>Edit</GBtn>}
        {canEditDelete&&<DBtnLocal onClick={onDelete}>{Ic.trash} Delete</DBtnLocal>}
      </div>
    </div>
    <ProgressBar step={app.step}/>

    {/* Warranty info summary - full width, above the timeline/action grid,
        matching Order Tracking's own "Order Information" card exactly. */}
    <div style={{...card,marginBottom:14}}>
      <SecHdr icon={Ic.fileText}>Warranty Information</SecHdr>
      <div style={{padding:"6px 16px 10px"}}>
        <div style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>Device Name</div>
          <div style={{fontSize:13,color:C.text,fontWeight:600}}>{app.deviceName}</div>
        </div>
        {[["Branch",branchMeta[app.branch]?.name||app.branch],["Customer Name",app.customerName],["Customer Phone",app.customerPhone],["Request Date",fDate(app.requestDate)],["IMEI Number",app.imei],["Date Sent Back to HQ",fDate(app.sendDate)]].map(([l,v])=><div key={l} style={{padding:"7px 0",borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:2}}>{l}</div>
          <div style={{fontSize:13,color:C.text,fontWeight:600}}>{v||"—"}</div>
        </div>)}
        <div style={{padding:"10px 0 0",display:"flex",gap:8,flexWrap:"wrap"}}>
          {app.invoiceFile&&<GBtn onClick={()=>openFile(DOC_FIELD_URL(app,"invoiceFile",fileUrls))}>{Ic.fileText} Invoice</GBtn>}
          {app.proofFile&&<GBtn onClick={()=>openFile(DOC_FIELD_URL(app,"proofFile",fileUrls))}>{Ic.fileText} Defect Proof</GBtn>}
          {app.stockTransferFile1&&<GBtn onClick={()=>openFile(DOC_FIELD_URL(app,"stockTransferFile1",fileUrls))}>{Ic.fileText} Stock Transfer File (Received)</GBtn>}
          {app.serviceForm&&<GBtn onClick={()=>openFile(DOC_FIELD_URL(app,"serviceForm",fileUrls))}>{Ic.fileText} Service Form</GBtn>}
          {app.stockTransferFile2&&<GBtn onClick={()=>openFile(DOC_FIELD_URL(app,"stockTransferFile2",fileUrls))}>{Ic.fileText} Stock Transfer File (Return)</GBtn>}
        </div>
        {app.consignmentNote&&<div style={{marginTop:10,padding:10,background:C.surface,borderRadius:8,fontSize:12,color:C.textMid}}><strong style={{color:C.text}}>Consignment Note:</strong> {app.consignmentNote}</div>}
      </div>
    </div>

    {/* Two-col: timeline | action - matching Order Tracking's exact
        layout, same navy SecHdr on both sides. */}
    <div className="detail-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
      <div style={card}>
        <SecHdr icon={Ic.fileText}>Tracking Timeline</SecHdr>
        <div style={{padding:"14px 16px"}}><Timeline app={app}/></div>
      </div>
      <div style={card}>
        <SecHdr icon={Ic.chevR}>{app.step<5?`Next: ${stepDef(app.step+1).label}`:"Status"}</SecHdr>
        <div style={{padding:16}}>
          {isAdmin&&app.step<5
            ?<AdminStepActionsInner app={app} email={email} onAdvance={onAdvance}/>
            :<div style={{fontSize:12,color:C.textLight,fontStyle:"italic",textAlign:"center",padding:"12px 0"}}>{app.step>=5?"Completed — no further action available.":"View only — actions disabled for this viewer."}</div>}
        </div>
      </div>
    </div>
  </div>;
}

export default function WarrantyTab({branchMeta={},isAdmin,userBranch,email=null}){
  const [apps,setApps]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // list | form | detail
  const [selectedId,setSelectedId]=useState(null);
  const [editingApp,setEditingApp]=useState(null);
  const [branchFilter,setBranchFilter]=useState("all");
  const [stepFilter,setStepFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [fileUrls,setFileUrls]=useState({});

  const isPopStateNav=useRef(false);
  const viewRef=useRef(view);
  const selectedIdRef=useRef(selectedId);
  useEffect(()=>{viewRef.current=view;},[view]);
  useEffect(()=>{selectedIdRef.current=selectedId;},[selectedId]);
  useEffect(()=>{
    window.history.replaceState({wtyView:view,wtySelectedId:selectedId},"");
    const onPopState=e=>{
      if(e.state&&"wtyView" in e.state){
        isPopStateNav.current=true;
        setView(e.state.wtyView);
        setSelectedId(e.state.wtySelectedId);
      }
    };
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(isPopStateNav.current){isPopStateNav.current=false;return;}
    window.history.pushState({wtyView:view,wtySelectedId:selectedId},"");
  },[view,selectedId]);

  useEffect(()=>{loadData(WARRANTY_KEY).then(d=>{setApps(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  useEffect(()=>{
    const channel=supabase.channel("warranty-requests-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_storage",filter:`key=eq.${WARRANTY_KEY}`},()=>{
        loadData(WARRANTY_KEY).then(d=>{if(Array.isArray(d))setApps(d);});
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

  useEffect(()=>{
    if(!apps.length)return;
    const DOC_FIELDS=["invoiceFile","proofFile","stockTransferFile1","serviceForm","stockTransferFile2"];
    (async()=>{
      const entries=await Promise.all(apps.flatMap(a=>DOC_FIELDS.map(async key=>{
        const meta=a[key];
        if(!meta?.path)return null;
        const url=await signFileUrl(meta.path);
        return[`${a.id}_${key}`,url];
      })));
      const next={};
      entries.forEach(e=>{if(e)next[e[0]]=e[1];});
      setFileUrls(next);
    })();
  },[apps]);

  const save=async(updated)=>{
    const latest=(await loadData(WARRANTY_KEY))||apps;
    const next=latest.some(a=>a.id===updated.id)?latest.map(a=>a.id===updated.id?updated:a):[...latest,updated];
    setApps(next);
    const result=await saveData(WARRANTY_KEY,next);
    if(!result.ok){
      setApps(latest);
      alert(`This didn't save — please check your connection and try again.${result.error?.message?`\n\n(${result.error.message})`:""}`);
      return;
    }
    setView("detail");setSelectedId(updated.id);setEditingApp(null);
  };

  const deleteApp=async(id)=>{
    if(!window.confirm("Delete this warranty request permanently? This cannot be undone."))return;
    const latest=(await loadData(WARRANTY_KEY))||apps;
    const next=latest.filter(a=>a.id!==id);
    setApps(next);
    const result=await saveData(WARRANTY_KEY,next);
    if(!result.ok){
      setApps(latest);
      alert("This didn't delete — please check your connection and try again.");
      return;
    }
    setView("list");setSelectedId(null);
  };

  const canEditDelete=["sophiawsc9395@gmail.com","boontheng2004@gmail.com","emaxwarranty@gmail.com"].includes((email||"").toLowerCase());
  const selectedApp=apps.find(a=>a.id===selectedId);

  if(view==="form")return<RequestForm branchMeta={branchMeta} userBranch={userBranch} editingApp={editingApp} onSaved={save} onCancel={()=>{setView(editingApp?"detail":"list");setEditingApp(null);}}/>;

  if(view==="detail"&&selectedApp)return<RequestDetail app={selectedApp} branchMeta={branchMeta} isAdmin={isAdmin} canEditDelete={canEditDelete} email={email} fileUrls={fileUrls}
    onBack={()=>{setView("list");setSelectedId(null);}}
    onAdvance={save}
    onDelete={()=>deleteApp(selectedApp.id)}
    onEdit={()=>{setEditingApp(selectedApp);setView("form");}}/>;

  const branchScoped=userBranch?apps.filter(a=>a.branch===userBranch):apps;
  const stepCounts=STEPS.reduce((acc,s)=>({...acc,[s.step]:branchScoped.filter(a=>a.step===s.step).length}),{});
  const visible=branchScoped.filter(a=>
    (stepFilter==="all"||a.step===stepFilter)&&
    (branchFilter==="all"||a.branch===branchFilter)&&
    (!search||[a.branch,a.deviceName,a.customerName,a.imei].some(v=>v?.toString().toLowerCase().includes(search.toLowerCase())))
  ).sort((a,b)=>Number(b.id)-Number(a.id));

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10}}>
      <div>
        <div style={{fontSize:19,fontWeight:800,color:C.navy,letterSpacing:"-0.01em"}}>Warranty</div>
        <div style={{fontSize:12,color:C.textLight,marginTop:4}}>{userBranch?branchMeta[userBranch]?.name||userBranch:"All branches"} · {branchScoped.length} request{branchScoped.length===1?"":"s"}</div>
      </div>
      <PBtn onClick={()=>{setEditingApp(null);setView("form");}}>{Ic.plus} New Warranty Request</PBtn>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:20}}>
      {STEPS.map(s=>{
        const active=stepFilter===s.step;
        const count=stepCounts[s.step]||0;
        return<div key={s.step} onClick={()=>setStepFilter(active?"all":s.step)} style={{...card,border:`1px solid ${active?s.color:C.border}`,borderTop:`3px solid ${s.color}`,padding:"12px 14px 11px",display:"flex",flexDirection:"column",gap:9,cursor:"pointer",boxShadow:active?`0 0 0 1.5px ${s.color}, 0 6px 16px rgba(10,22,40,.08)`:card.boxShadow,transition:"all .12s"}}>
          <div style={{width:30,height:30,borderRadius:8,background:s.bg,color:s.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{STEP_ICONS[s.step]}</div>
          <div>
            <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:3}}>{s.label}</div>
            <div style={{fontSize:21,fontWeight:800,color:count?C.navy:"#C3CCDA",lineHeight:1}}>{count}</div>
          </div>
        </div>;
      })}
    </div>

    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <I placeholder="Search branch, device name, customer name, or IMEI number…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:160}}/>
      {!userBranch&&<SEL value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} style={{flex:1,minWidth:120}}>
        <option value="all">All Branches</option>
        {sellingBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
      </SEL>}
    </div>

    <div className="wty-desktop" style={{...card,padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",padding:"9px 16px",background:C.navy,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
        <div style={{flex:2}}>Device Name</div>
        <div style={{width:90}}>Branch</div>
        <div style={{flex:1,minWidth:150}}>Step</div>
        <div style={{width:90,textAlign:"right"}}>Updated</div>
      </div>
      {loading
        ?<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>
        :visible.length===0
        ?<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>No warranty requests match.</div>
        :visible.map((a,i)=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{padding:"10px 16px",background:i%2===0?C.white:C.surface,borderTop:i>0?`1px solid ${C.border}`:"none",cursor:"pointer",display:"flex",alignItems:"center"}}>
          <div style={{flex:2,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:12,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.deviceName}</div>
            <div style={{fontSize:10,color:C.textLight,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.customerName} · IMEI {a.imei}</div>
          </div>
          <div style={{width:90,fontSize:11,fontWeight:700,color:C.textMid}}>{branchMeta[a.branch]?.name||a.branch}</div>
          <div style={{flex:1,minWidth:150}}><StepBadge step={a.step}/></div>
          <div style={{width:90,textAlign:"right",fontSize:10,color:C.textLight,whiteSpace:"nowrap"}}>{fDate(a.requestDate)}</div>
        </div>)}
    </div>

    <div className="wty-mobile">
      {loading
        ?<div style={{...card,padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>
        :visible.length===0
        ?<div style={{...card,padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>No warranty requests match.</div>
        :visible.map(a=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{...card,padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:13,color:C.text}}>{a.deviceName}</div>
            <StepBadge step={a.step}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <div><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700}}>Branch</div><div style={{fontSize:12,color:C.text,fontWeight:600,marginTop:1}}>{branchMeta[a.branch]?.name||a.branch}</div></div>
            <div><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700}}>Updated</div><div style={{fontSize:12,color:C.text,fontWeight:600,marginTop:1}}>{fDate(a.requestDate)}</div></div>
            <div style={{gridColumn:"1/-1"}}><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700}}>Customer</div><div style={{fontSize:12,color:C.text,fontWeight:600,marginTop:1}}>{a.customerName}</div></div>
            <div style={{gridColumn:"1/-1"}}><div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700}}>IMEI</div><div style={{fontSize:12,color:C.text,fontWeight:600,marginTop:1}}>{a.imei}</div></div>
          </div>
        </div>)}
    </div>

    <style>{`
      .wty-mobile{display:none;}
      @media (max-width:640px){
        .wty-desktop{display:none;}
        .wty-mobile{display:block;}
      }
    `}</style>
  </div>;
}
