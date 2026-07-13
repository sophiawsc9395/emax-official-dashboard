import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];

const STEPS=[
  {step:1,label:"Order Submitted",icon:"📋",desc:"New order request submitted by branch.",who:"branch"},
  {step:2,label:"Order Placed",icon:"🛒",desc:"Purchase order placed with supplier.",who:"admin",needsRemark:true},
  {step:3,label:"Arrived at HQ",icon:"🏢",desc:"Item received at headquarters.",who:"admin"},
  {step:4,label:"Dispatched to Branch",icon:"🚚",desc:"Item dispatched from HQ to branch.",who:"admin",needsFile:true,fileLabel:"Consignment Note"},
  {step:5,label:"Arrived at Branch",icon:"📦",desc:"Branch confirms receipt of item.",who:"branch"},
  {step:6,label:"Billing Requested",icon:"💳",desc:"Branch requests billing/financing process.",who:"branch"},
  {step:7,label:"Billing Completed",icon:"🧾",desc:"Billing completed successfully.",who:"admin",needsFile:true,fileLabel:"Invoice",needsInvoiceNo:true},
  {step:8,label:"Customer Collected",icon:"🤝",desc:"Customer collects item and payment received.",who:"admin",needsFile:true,fileLabel:"Collection & Payment Proof"},
  {step:9,label:"Agreement at HQ",icon:"📄",desc:"Original signed agreement received by HQ.",who:"admin"},
  {step:10,label:"Sent for Claim",icon:"📬",desc:"Documents verified and claim submitted.",who:"admin"},
  {step:11,label:"Claim Released",icon:"✅",desc:"Claim has been released.",who:"admin",needsFile:true,fileLabel:"Claim Document",needsClaimDate:true},
];

const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const today=()=>new Date().toISOString().split("T")[0];
const getStep=n=>STEPS.find(s=>s.step===n)||STEPS[0];

// Generate short order ID
const shortId=id=>id?("ORD-"+String(id).slice(-6).toUpperCase()):"";

function ProgressBar({currentStep}){
  const pct=Math.round(((currentStep-1)/10)*100);
  return(
    <div style={{marginBottom:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:10,color:"#8A96A8",fontWeight:600}}>PROGRESS</span>
        <span style={{fontSize:11,fontWeight:800,color:currentStep===11?"#15803D":"#0A1628"}}>{pct}%</span>
      </div>
      <div style={{height:6,background:"#E4EAF2",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:currentStep===11?"#15803D":"#0A1628",borderRadius:3,transition:"width .4s ease"}}/>
      </div>
    </div>
  );
}

function TrackingTimeline({order}){
  const current=order.step;
  return(
    <div style={{padding:"0 0 8px"}}>
      {STEPS.map((s,i)=>{
        const done=current>s.step;
        const active=current===s.step;
        const hist=(order.history||[]).find(h=>h.step===s.step);
        return(
          <div key={s.step} style={{display:"flex",gap:0,position:"relative"}}>
            {/* Connector line */}
            {i<STEPS.length-1&&<div style={{position:"absolute",left:19,top:40,width:2,height:"calc(100% - 8px)",background:done?"#0A1628":"#E4EAF2",zIndex:0}}/>}
            {/* Icon circle */}
            <div style={{flexShrink:0,width:40,height:40,borderRadius:"50%",background:done?"#0A1628":active?"#162B52":"#F7F9FC",border:`2px solid ${done?"#0A1628":active?"#0A1628":"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,zIndex:1,marginRight:14,transition:"all .3s"}}>
              {done?"✓":active?s.icon:<span style={{fontSize:11,fontWeight:800,color:"#CBD5E1"}}>{s.step}</span>}
            </div>
            {/* Content */}
            <div style={{flex:1,paddingBottom:i<STEPS.length-1?20:0,paddingTop:2}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:done||active?700:500,fontSize:13,color:done?"#0A1628":active?"#0A1628":"#9CA3AF"}}>{s.label}</span>
                {active&&<span style={{background:"#0A1628",color:"#FFD500",padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>CURRENT</span>}
                {done&&hist?.date&&<span style={{fontSize:10,color:"#8A96A8"}}>{fDate(hist.date)}</span>}
              </div>
              {(done||active)&&<div style={{fontSize:11,color:"#6B7280",marginTop:2}}>{s.desc}</div>}
              {/* History details */}
              {hist&&(hist.remark||hist.attachment||hist.invoiceNo||hist.claimDate)&&(
                <div style={{marginTop:6,background:"#F7F9FC",borderRadius:8,padding:"8px 12px",border:"1px solid #E4EAF2"}}>
                  {hist.remark&&<div style={{fontSize:11,color:"#374151",marginBottom:hist.attachment?4:0}}>💬 {hist.remark}</div>}
                  {hist.invoiceNo&&<div style={{fontSize:11,color:"#1E6FDB",marginBottom:hist.attachment?4:0}}>🧾 Invoice: {hist.invoiceNo}</div>}
                  {hist.claimDate&&<div style={{fontSize:11,color:"#15803D",marginBottom:hist.attachment?4:0}}>📅 Claim Released: {fDate(hist.claimDate)}</div>}
                  {hist.attachment&&<a href={hist.attachment.data} download={hist.attachment.name} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"#1E6FDB",textDecoration:"none",background:"#EFF6FF",padding:"3px 10px",borderRadius:4,fontWeight:600}}>📎 {hist.attachment.name}</a>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionPanel({order,isAdmin,onUpdate}){
  const nextStep=order.step<11?getStep(order.step+1):null;
  const [remark,setRemark]=useState("");
  const [file,setFile]=useState(null);
  const [invoiceNo,setInvoiceNo]=useState("");
  const [claimDate,setClaimDate]=useState(today());
  const [saving,setSaving]=useState(false);
  const fileRef=useRef(null);

  if(!nextStep)return(
    <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"16px 18px",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:24}}>🎉</span>
      <div>
        <div style={{fontWeight:800,fontSize:14,color:"#15803D"}}>Order Complete</div>
        <div style={{fontSize:12,color:"#166534",marginTop:2}}>Claim has been released. All steps completed.</div>
      </div>
    </div>
  );

  const branchCanAdvance=isAdmin||[5,6].includes(nextStep.step);
  const readFile=f=>new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(f);});

  const canSubmit=()=>{
    if(!branchCanAdvance)return false;
    if(nextStep.needsRemark&&isAdmin&&!remark.trim())return false;
    if(nextStep.needsFile&&isAdmin&&!file)return false;
    if(nextStep.needsInvoiceNo&&isAdmin&&!invoiceNo.trim())return false;
    return true;
  };

  const advance=async()=>{
    if(!canSubmit())return;
    setSaving(true);
    let attachment=null;
    if(file)attachment={name:file.name,data:await readFile(file)};
    const hist={step:nextStep.step,date:today(),note:nextStep.label,remark:remark||undefined,attachment:attachment||undefined,invoiceNo:invoiceNo||undefined,claimDate:nextStep.needsClaimDate?claimDate:undefined};
    const updated={...order,step:nextStep.step,history:[...(order.history||[]),hist]};
    if(nextStep.needsInvoiceNo&&invoiceNo)updated.invoiceNo=invoiceNo;
    if(nextStep.step===2&&remark)updated.adminRemark=remark;
    if(nextStep.needsClaimDate)updated.claimDate=claimDate;
    await onUpdate(updated);
    setSaving(false);
    setRemark("");setFile(null);setInvoiceNo("");
    if(fileRef.current)fileRef.current.value="";
  };

  return(
    <div style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:10,overflow:"hidden"}}>
      <div style={{background:"#F7F9FC",padding:"12px 16px",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>{nextStep.icon}</span>
        <div>
          <div style={{fontWeight:800,fontSize:13,color:"#0A1628"}}>Next: {nextStep.label}</div>
          <div style={{fontSize:11,color:"#6B7280"}}>{nextStep.desc}</div>
        </div>
      </div>
      <div style={{padding:"14px 16px"}}>
        {!branchCanAdvance&&<div style={{fontSize:12,color:"#8A96A8",fontStyle:"italic",padding:"8px 0"}}>⏳ Waiting for admin action on this step.</div>}
        {branchCanAdvance&&<>
          {nextStep.needsRemark&&isAdmin&&<div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Admin Remark — Supplier / Order Details / ETA <span style={{color:"#B91C1C"}}>*</span></label>
            <textarea className="input" value={remark} onChange={e=>setRemark(e.target.value)} rows={3} style={{fontSize:12,resize:"vertical"}} placeholder="Enter supplier details, ETA, order reference…"/>
          </div>}
          {nextStep.needsInvoiceNo&&isAdmin&&<div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sales Invoice Number <span style={{color:"#B91C1C"}}>*</span></label>
            <input className="input" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} style={{fontSize:12}} placeholder="e.g. INV-2026-0001"/>
          </div>}
          {nextStep.needsFile&&isAdmin&&<div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload {nextStep.fileLabel} <span style={{color:"#B91C1C"}}>*</span></label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setFile(e.target.files[0]||null);}} style={{fontSize:12,width:"100%"}}/>
            {file&&<div style={{fontSize:11,color:"#15803D",marginTop:4}}>✓ {file.name}</div>}
          </div>}
          {nextStep.needsClaimDate&&isAdmin&&<div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Claim Release Date <span style={{color:"#B91C1C"}}>*</span></label>
            <input className="input" type="date" value={claimDate} onChange={e=>setClaimDate(e.target.value)} style={{fontSize:12}}/>
          </div>}
          {!nextStep.needsRemark&&!nextStep.needsFile&&!nextStep.needsInvoiceNo&&<div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Remark (optional)</label>
            <input className="input" value={remark} onChange={e=>setRemark(e.target.value)} style={{fontSize:12}} placeholder="Optional note…"/>
          </div>}
          <button onClick={advance} disabled={!canSubmit()||saving} style={{width:"100%",padding:"11px 0",background:canSubmit()&&!saving?"#0A1628":"#E4EAF2",color:canSubmit()&&!saving?"#fff":"#8A96A8",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:canSubmit()&&!saving?"pointer":"default",fontFamily:"Inter,sans-serif",transition:"background .15s"}}>
            {saving?"Saving…":`Confirm: ${nextStep.label} →`}
          </button>
        </>}
      </div>
    </div>
  );
}

function OrderDetail({order,branchMeta,onUpdate,onEdit,onDelete,onBack,isAdmin}){
  const step=getStep(order.step);
  return(
    <div>
      {/* Tracking header card */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"20px 20px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>{shortId(order.id)}</div>
              <div style={{fontWeight:900,fontSize:18,color:"#fff",lineHeight:1.2}}>{order.phoneModel}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:4}}>{order.customerName} · {order.branch} · {order.merchant}</div>
            </div>
            <button onClick={onBack} style={{padding:"6px 12px",background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.7)",border:"1px solid rgba(255,255,255,.2)",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>← Back</button>
          </div>
          <ProgressBar currentStep={order.step}/>
        </div>
        {/* Current status banner */}
        <div style={{padding:"12px 20px",background:order.step===11?"#F0FDF4":"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>{step.icon}</span>
          <div>
            <div style={{fontWeight:800,fontSize:13,color:order.step===11?"#15803D":"#0A1628"}}>Step {order.step} of 11 — {step.label}</div>
            <div style={{fontSize:11,color:"#6B7280"}}>{step.desc}</div>
          </div>
        </div>
        {/* Order fields */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))"}}>
          {[
            ["Agreement No.",order.agreementNumber||"—"],
            ["Sales Agent",order.salesAgentId||"—"],
            ["Approval Date",fDate(order.aeonApprovalDate)],
            ["Finance Price",fRM(order.financePrice)],
            ["Deposit",fRM(order.deposit)],
            ["Stamping Fee",fRM(order.stampingFee)],
            ["Agreement Fee",fRM(order.agreementFee)],
            ...(order.invoiceNo?[["Invoice No.",order.invoiceNo]]:[]),
            ...(order.claimDate?[["Claim Date",fDate(order.claimDate)]]:[]),
          ].map(([l,v])=>(
            <div key={l} style={{padding:"10px 16px",borderRight:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{l}</div>
              <div style={{fontWeight:700,fontSize:12,color:"#0A1628",whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Admin remark */}
        {order.adminRemark&&<div style={{padding:"10px 16px",borderBottom:"1px solid #E4EAF2",background:"#FFFBEB"}}>
          <div style={{fontSize:10,color:"#92400E",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Admin Remark</div>
          <div style={{fontSize:12,color:"#78350F"}}>{order.adminRemark}</div>
        </div>}
        {/* Admin actions */}
        {isAdmin&&<div style={{padding:"10px 16px",display:"flex",gap:8}}>
          <button onClick={onEdit} style={{padding:"6px 16px",background:"#F7F9FC",color:"#0A1628",border:"1px solid #E4EAF2",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit Order</button>
          <button onClick={onDelete} style={{padding:"6px 16px",background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA",borderRadius:7,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Delete</button>
        </div>}
      </div>

      {/* Two column: tracking + action */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>
        {/* Tracking timeline */}
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",padding:"16px 20px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:16}}>Tracking Timeline</div>
          <TrackingTimeline order={order}/>
        </div>
        {/* Action panel */}
        <div>
          <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Required Action</div>
          <ActionPanel order={order} isAdmin={isAdmin} onUpdate={onUpdate}/>
        </div>
      </div>
    </div>
  );
}

function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:""};
  const [f,setF]=useState(order?{...order}:empty);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
      <div style={{background:"#0A1628",padding:"14px 20px"}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{order?"Edit Order":"New Order Request"}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Fill in all order details below</div>
      </div>
      <div style={{padding:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
          {[["phoneModel","Phone Model / Item ✱"],["customerName","Customer Name ✱"],["agreementNumber","Agreement Number"],["salesAgentId","Sales Agent ID"]].map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
              <input className="input" value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
            <select className="input select" value={f.branch} onChange={e=>set("branch",e.target.value)} disabled={!isAdmin&&!!userBranch} style={{fontSize:12}}>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Merchant</label>
            <select className="input select" value={f.merchant} onChange={e=>set("merchant",e.target.value)} style={{fontSize:12}}>
              {MERCHANTS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Aeon Approval Date</label>
            <input className="input" type="date" value={f.aeonApprovalDate} onChange={e=>set("aeonApprovalDate",e.target.value)} style={{fontSize:12}}/>
          </div>
          {[["financePrice","Finance Price (RM)"],["deposit","Deposit (RM)"],["stampingFee","Stamping Fee (RM)"],["agreementFee","Agreement Fee (RM)"]].map(([k,l])=>(
            <div key={k}>
              <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
              <input className="input" type="number" value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-success" onClick={()=>{if(!f.phoneModel||!f.customerName){alert("Phone model and customer name are required.");return;}onSave({...f,id:order?.id||Date.now().toString(),step:order?.step||1,history:order?.history||[{step:1,date:today(),note:"Order submitted"}]});}}>
            {order?"Save Changes":"Submit Order Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrderTab({branchMeta,isAdmin=true,userBranch=null}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // list | detail | form
  const [selectedOrder,setSelectedOrder]=useState(null);
  const [editOrder,setEditOrder]=useState(null);
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [filterStep,setFilterStep]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);

  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};

  const saveOrder=async o=>{
    const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];
    await save(list);
    // Refresh selected
    setSelectedOrder(o);
    setView("detail");
  };

  const deleteOrder=async id=>{
    if(!confirm("Delete this order? This cannot be undone."))return;
    await save(orders.filter(x=>x.id!==id));
    setView("list");setSelectedOrder(null);
  };

  const filtered=orders.filter(o=>
    (filterBranch==="ALL"||o.branch===filterBranch)&&
    (filterStep==="ALL"||o.step===parseInt(filterStep))&&
    (!userBranch||o.branch===userBranch)&&
    (!search||[o.customerName,o.phoneModel,o.agreementNumber,o.customerName].some(v=>v?.toLowerCase().includes(search.toLowerCase())))
  ).sort((a,b)=>b.id-a.id);

  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8"}}>Loading orders…</div>;

  // Detail view
  if(view==="detail"&&selectedOrder){
    const live=orders.find(o=>o.id===selectedOrder.id)||selectedOrder;
    return(
      <div className="fade-in">
        <OrderDetail order={live} branchMeta={branchMeta} isAdmin={isAdmin}
          onUpdate={async o=>{await saveOrder(o);}}
          onEdit={()=>{setEditOrder(live);setView("form");}}
          onDelete={()=>deleteOrder(live.id)}
          onBack={()=>{setView("list");setSelectedOrder(null);}}/>
      </div>
    );
  }

  // Form view
  if(view==="form"){
    return(
      <div className="fade-in">
        <OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch}
          onSave={async o=>{await saveOrder(o);setEditOrder(null);}}
          onCancel={()=>{setView(editOrder?"detail":"list");setEditOrder(null);}}/>
      </div>
    );
  }

  // List view
  const statCounts=STEPS.reduce((acc,s)=>{acc[s.step]=orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step===s.step).length;return acc;},{});

  return(
    <div className="fade-in">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:900,color:"#0A1628",margin:0}}>Order Tracking</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:3}}>{filtered.length} order{filtered.length!==1?"s":""} · {orders.filter(o=>(!userBranch||o.branch===userBranch)&&o.step<11).length} active</div>
        </div>
        <button onClick={()=>{setEditOrder(null);setView("form");}} style={{padding:"9px 20px",background:"#0A1628",color:"#FFD500",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>+ New Order</button>
      </div>

      {/* Step summary pills */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16,overflowX:"auto",paddingBottom:4}}>
        <button onClick={()=>setFilterStep("ALL")} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep==="ALL"?"#0A1628":"#F3F4F6",color:filterStep==="ALL"?"#fff":"#6B7280",whiteSpace:"nowrap"}}>All ({orders.filter(o=>(!userBranch||o.branch===userBranch)).length})</button>
        {STEPS.map(s=>statCounts[s.step]>0&&(
          <button key={s.step} onClick={()=>setFilterStep(String(s.step))} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",fontWeight:600,fontSize:11,background:filterStep===String(s.step)?"#0A1628":"#F3F4F6",color:filterStep===String(s.step)?"#fff":"#4B5563",whiteSpace:"nowrap"}}>
            {s.icon} {s.label} ({statCounts[s.step]})
          </button>
        ))}
      </div>

      {/* Search + branch filter */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <input className="input" placeholder="Search order, customer, model, agreement…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:2,minWidth:200,fontSize:12}}/>
        {isAdmin&&<select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,minWidth:120,fontSize:12,padding:"6px 24px 6px 8px"}}>
          <option value="ALL">All Branches</option>
          {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
        </select>}
      </div>

      {/* Order list */}
      {filtered.length===0&&<div style={{textAlign:"center",padding:"48px 20px",color:"#8A96A8",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #E4EAF2"}}>
        {search||filterStep!=="ALL"||filterBranch!=="ALL"?"No orders match your filter.":"No orders yet. Click + New Order to submit one."}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:12}}>
        {filtered.map(o=>{
          const s=getStep(o.step);
          const pct=Math.round(((o.step-1)/10)*100);
          return(
            <div key={o.id} onClick={()=>{setSelectedOrder(o);setView("detail");}} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",cursor:"pointer",transition:"box-shadow .15s,border-color .15s",overflow:"hidden"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#0A1628";e.currentTarget.style.boxShadow="0 4px 16px rgba(10,22,40,.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#E4EAF2";e.currentTarget.style.boxShadow="none";}}>
              {/* Card header */}
              <div style={{background:o.step===11?"linear-gradient(135deg,#14532D,#166534)":"linear-gradient(135deg,#0A1628,#162B52)",padding:"12px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.4)",marginBottom:3}}>{shortId(o.id)}</div>
                    <div style={{fontWeight:800,fontSize:14,color:"#fff",lineHeight:1.2}}>{o.phoneModel}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:3}}>{o.branch} · {o.merchant}</div>
                  </div>
                  <span style={{fontSize:20}}>{s.icon}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{height:3,background:"#E4EAF2"}}>
                <div style={{height:"100%",width:`${pct}%`,background:o.step===11?"#15803D":"#1E6FDB",transition:"width .3s"}}/>
              </div>
              {/* Card body */}
              <div style={{padding:"10px 14px"}}>
                <div style={{fontWeight:600,fontSize:12,color:"#0A1628",marginBottom:2}}>{o.customerName}</div>
                <div style={{fontSize:10,color:"#8A96A8",marginBottom:8}}>{o.agreementNumber||"No agreement no."} · {o.salesAgentId||"No agent"}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{background:o.step===11?"#F0FDF4":"#F7F9FC",border:`1px solid ${o.step===11?"#BBF7D0":"#E4EAF2"}`,borderRadius:5,padding:"3px 8px",fontSize:10,fontWeight:700,color:o.step===11?"#15803D":"#0A1628",whiteSpace:"nowrap"}}>Step {o.step}/11 · {s.label}</div>
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
