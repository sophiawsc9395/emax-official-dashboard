import {useState,useEffect,useRef} from "react";
import {loadData,saveData} from "./storage/index.js";

const ORDER_KEY="emax_v5_orders";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MERCHANTS=["Aeon","JCL","Chailease"];
const STATUSES=[
  {step:1,label:"New Order Request",color:"#6B7280",bg:"#F3F4F6",desc:"New order submitted by branch."},
  {step:2,label:"Ordered",color:"#1E6FDB",bg:"#EFF6FF",desc:"Purchase order placed."},
  {step:3,label:"Arrived HQ",color:"#0891B2",bg:"#ECFEFF",desc:"Item received at HQ."},
  {step:4,label:"Transferring to Branch",color:"#7C3AED",bg:"#F5F3FF",desc:"Item dispatched from HQ to branch."},
  {step:5,label:"Arrived Branch",color:"#059669",bg:"#ECFDF5",desc:"Branch confirms receipt."},
  {step:6,label:"Billing Request",color:"#D97706",bg:"#FFFBEB",desc:"Branch requests billing/financing."},
  {step:7,label:"Billed",color:"#DC2626",bg:"#FEF2F2",desc:"Billing completed by admin."},
  {step:8,label:"Customer Collection & Payment",color:"#7C3AED",bg:"#F5F3FF",desc:"Customer collects item."},
  {step:9,label:"Agreement Arrived HQ",color:"#0891B2",bg:"#ECFEFF",desc:"Original signed agreement received."},
  {step:10,label:"Checked & Sent for Claim",color:"#1E6FDB",bg:"#EFF6FF",desc:"HQ verifies and submits claim."},
  {step:11,label:"Claim Released",color:"#15803D",bg:"#F0FDF4",desc:"Claim released."},
];
const fRM=(n=0)=>"RM "+((parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}));
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const today=()=>new Date().toISOString().split("T")[0];
const getStatus=step=>STATUSES.find(s=>s.step===step)||STATUSES[0];

function StatusBadge({step}){
  const s=getStatus(step);
  return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,background:s.bg,color:s.color,whiteSpace:"nowrap"}}>Step {step}: {s.label}</span>;
}

function OrderForm({order,branchMeta,onSave,onCancel,isAdmin,userBranch}){
  const empty={phoneModel:"",branch:userBranch||"KM",merchant:"Aeon",agreementNumber:"",customerName:"",salesAgentId:"",aeonApprovalDate:"",financePrice:"",deposit:"",stampingFee:"",agreementFee:""};
  const [f,setF]=useState(order||empty);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",padding:20,marginBottom:20}}>
      <h3 style={{fontSize:14,fontWeight:800,color:"#0A1628",margin:"0 0 16px"}}>{order?"Edit Order":"New Order Request"}</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
        {[["phoneModel","Phone Model / Item"],["agreementNumber","Agreement Number"],["customerName","Customer Name"],["salesAgentId","Sales Agent ID"]].map(([k,l])=>(
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
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-success" onClick={()=>{if(!f.phoneModel||!f.customerName){alert("Phone model and customer name required.");return;}onSave({...f,id:order?.id||Date.now().toString(),step:order?.step||1,history:order?.history||[{step:1,date:today(),note:"Order submitted"}]});}}>
          {order?"Save Changes":"Submit Order"}
        </button>
      </div>
    </div>
  );
}

function WorkflowPanel({order,branchMeta,onUpdate,onClose,isAdmin}){
  const [remark,setRemark]=useState("");
  const [file,setFile]=useState(null);
  const [fileName,setFileName]=useState("");
  const [date,setDate]=useState(today());
  const [invoiceNo,setInvoiceNo]=useState("");
  const [claimDate,setClaimDate]=useState(today());
  const [saving,setSaving]=useState(false);
  const fileRef=useRef(null);

  const s=getStatus(order.step);
  const nextStep=order.step<11?getStatus(order.step+1):null;

  // Read file as base64
  const readFile=f=>new Promise(res=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.readAsDataURL(f);
  });

  const advance=async()=>{
    if(!nextStep)return;
    setSaving(true);
    let attachment=null;
    if(file){attachment={name:fileName,data:await readFile(file)};}
    const stepData={step:nextStep.step,date:today(),note:nextStep.label,remark:remark||undefined,attachment:attachment||undefined,invoiceNo:invoiceNo||undefined,claimDate:claimDate||undefined};
    const updated={...order,step:nextStep.step,history:[...(order.history||[]),stepData]};
    // Store extra fields at order level for quick access
    if(nextStep.step===7&&invoiceNo)updated.invoiceNo=invoiceNo;
    if(nextStep.step===2&&remark)updated.adminRemark=remark;
    if(nextStep.step===11)updated.claimDate=claimDate;
    await onUpdate(updated);
    setSaving(false);
    setRemark("");setFile(null);setFileName("");setInvoiceNo("");
  };

  // What does admin need to provide for next step?
  const needsRemark=nextStep&&nextStep.step===2;
  const needsConsignment=nextStep&&nextStep.step===4;
  const needsInvoice=nextStep&&nextStep.step===7;
  const needsCollection=nextStep&&nextStep.step===8;
  const needsClaimFile=nextStep&&nextStep.step===11;

  const canAdvance=isAdmin?
    (!needsRemark||remark.trim())&&(!needsConsignment||file)&&(!needsInvoice||(invoiceNo&&file))&&(!needsCollection||file)&&(!needsClaimFile||file):
    [5,6].includes(nextStep?.step); // branch can advance to step 5 (arrived) and step 6 (billing request)

  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:20}}>
      {/* Header */}
      <div style={{background:"#0A1628",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3}}>ORDER DETAILS</div>
          <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{order.phoneModel}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>{order.customerName} · {order.branch} · {order.merchant}</div>
        </div>
        <button onClick={onClose} style={{padding:"6px 14px",background:"rgba(255,255,255,.1)",color:"#fff",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>← Back</button>
      </div>

      {/* Order info grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",borderBottom:"1px solid #E4EAF2"}}>
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
          <div key={l} style={{padding:"10px 14px",borderRight:"1px solid #E4EAF2"}}>
            <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{l}</div>
            <div style={{fontWeight:700,fontSize:12,color:"#0A1628"}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Current status */}
      <div style={{padding:"14px 18px",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:12}}>
        <StatusBadge step={order.step}/>
        <div style={{fontSize:11,color:"#4A5568"}}>{s.desc}</div>
      </div>

      {/* Next action */}
      {nextStep&&<div style={{padding:"14px 18px",borderBottom:"1px solid #E4EAF2"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#0A1628",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>
          Next: Step {nextStep.step} — {nextStep.label}
        </div>
        {/* Admin remark (step 2) */}
        {needsRemark&&isAdmin&&<div style={{marginBottom:10}}>
          <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Admin Remark (required) — Supplier / Order Details / ETA</label>
          <textarea className="input" value={remark} onChange={e=>setRemark(e.target.value)} rows={3} style={{fontSize:12,resize:"vertical"}}/>
        </div>}
        {/* Consignment note upload (step 4) */}
        {needsConsignment&&isAdmin&&<div style={{marginBottom:10}}>
          <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload Consignment Note (required)</label>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setFile(e.target.files[0]);setFileName(e.target.files[0]?.name||"");}} style={{fontSize:12}}/>
        </div>}
        {/* Invoice + sales invoice number (step 7) */}
        {needsInvoice&&isAdmin&&<>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sales Invoice Number (required)</label>
            <input className="input" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} style={{fontSize:12}}/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload Invoice (required)</label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setFile(e.target.files[0]);setFileName(e.target.files[0]?.name||"");}} style={{fontSize:12}}/>
          </div>
        </>}
        {/* Collection & payment proof (step 8) */}
        {needsCollection&&isAdmin&&<div style={{marginBottom:10}}>
          <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload Collection & Payment Proof (required)</label>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setFile(e.target.files[0]);setFileName(e.target.files[0]?.name||"");}} style={{fontSize:12}}/>
        </div>}
        {/* Claim file + date (step 11) */}
        {needsClaimFile&&isAdmin&&<>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Upload Claim File (required)</label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setFile(e.target.files[0]);setFileName(e.target.files[0]?.name||"");}} style={{fontSize:12}}/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Claim Release Date</label>
            <input className="input" type="date" value={claimDate} onChange={e=>setClaimDate(e.target.value)} style={{fontSize:12}}/>
          </div>
        </>}
        {/* Optional remark for other steps */}
        {!needsRemark&&!needsInvoice&&!needsClaimFile&&<div style={{marginBottom:10}}>
          <label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Remark (optional)</label>
          <input className="input" value={remark} onChange={e=>setRemark(e.target.value)} style={{fontSize:12}}/>
        </div>}
        {(!isAdmin&&nextStep&&![5,6].includes(nextStep.step))?
          <div style={{fontSize:11,color:"#8A96A8",fontStyle:"italic"}}>Waiting for admin to advance this step.</div>:
          <button onClick={advance} disabled={!canAdvance||saving} style={{padding:"9px 24px",background:canAdvance?"#0A1628":"#E4EAF2",color:canAdvance?"#fff":"#8A96A8",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:canAdvance?"pointer":"default",fontFamily:"Inter,sans-serif"}}>
            {saving?"Saving…":`Advance to Step ${nextStep.step}: ${nextStep.label}`}
          </button>
        }
      </div>}
      {order.step===11&&<div style={{padding:"14px 18px",background:"#F0FDF4",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>✅</span>
        <div style={{fontWeight:700,fontSize:13,color:"#15803D"}}>Order complete — Claim Released {order.claimDate?`on ${fDate(order.claimDate)}`:""}</div>
      </div>}

      {/* History timeline */}
      <div style={{padding:"14px 18px"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>Workflow History</div>
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {(order.history||[]).slice().reverse().map((h,i)=>(
            <div key={i} style={{display:"flex",gap:12,paddingBottom:12,position:"relative"}}>
              <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:getStatus(h.step).bg,border:`2px solid ${getStatus(h.step).color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:getStatus(h.step).color,zIndex:1}}>{h.step}</div>
              {i<(order.history||[]).length-1&&<div style={{position:"absolute",left:13,top:28,width:2,height:"calc(100% - 8px)",background:"#E4EAF2"}}/>}
              <div style={{flex:1,paddingTop:4}}>
                <div style={{fontWeight:700,fontSize:12,color:"#0A1628"}}>{getStatus(h.step).label}</div>
                <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>{fDate(h.date)}</div>
                {h.remark&&<div style={{fontSize:11,color:"#4A5568",marginTop:4,background:"#F7F9FC",padding:"6px 10px",borderRadius:6,border:"1px solid #E4EAF2"}}>{h.remark}</div>}
                {h.invoiceNo&&<div style={{fontSize:11,color:"#1E6FDB",marginTop:4}}>Invoice: {h.invoiceNo}</div>}
                {h.attachment&&<a href={h.attachment.data} download={h.attachment.name} style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:4,fontSize:11,color:"#1E6FDB",textDecoration:"none",background:"#EFF6FF",padding:"4px 10px",borderRadius:5}}>📎 {h.attachment.name}</a>}
                {h.claimDate&&<div style={{fontSize:11,color:"#15803D",marginTop:4}}>Claim Date: {fDate(h.claimDate)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OrderTab({branchMeta,isAdmin=true,userBranch=null}){
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editOrder,setEditOrder]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [filterStep,setFilterStep]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{loadData(ORDER_KEY).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});},[]);

  const save=async list=>{setOrders(list);await saveData(ORDER_KEY,list);};
  const saveOrder=async o=>{
    const list=orders.find(x=>x.id===o.id)?orders.map(x=>x.id===o.id?o:x):[...orders,o];
    await save(list);setShowForm(false);setEditOrder(null);
    setSelectedId(o.id);
  };
  const deleteOrder=async id=>{if(!confirm("Delete this order?"))return;await save(orders.filter(x=>x.id!==id));if(selectedId===id)setSelectedId(null);};

  const filtered=orders.filter(o=>
    (filterBranch==="ALL"||o.branch===filterBranch)&&
    (filterStep==="ALL"||o.step===parseInt(filterStep))&&
    (!userBranch||o.branch===userBranch)&&
    (!search||o.customerName?.toLowerCase().includes(search.toLowerCase())||o.phoneModel?.toLowerCase().includes(search.toLowerCase())||o.agreementNumber?.toLowerCase().includes(search.toLowerCase()))
  ).sort((a,b)=>b.id-a.id);

  const selected=orders.find(o=>o.id===selectedId);

  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8"}}>Loading orders…</div>;

  return(
    <div className="fade-in">
      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20,alignItems:"start"}}>
        {/* Left: order list */}
        <div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <input className="input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,fontSize:12}}/>
          </div>
          {isAdmin&&<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{flex:1,fontSize:11,padding:"4px 20px 4px 6px"}}>
              <option value="ALL">All Branches</option>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
            <select className="input select" value={filterStep} onChange={e=>setFilterStep(e.target.value)} style={{flex:1,fontSize:11,padding:"4px 20px 4px 6px"}}>
              <option value="ALL">All Steps</option>
              {STATUSES.map(s=><option key={s.step} value={s.step}>Step {s.step}</option>)}
            </select>
          </div>}
          <button className="btn btn-success" style={{width:"100%",marginBottom:10,padding:"10px 0"}} onClick={()=>{setShowForm(true);setEditOrder(null);setSelectedId(null);}}>+ New Order Request</button>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {filtered.length===0&&<div style={{textAlign:"center",padding:24,color:"#8A96A8",fontSize:12}}>No orders found.</div>}
            {filtered.map(o=>{
              const s=getStatus(o.step);
              return(
                <div key={o.id} onClick={()=>setSelectedId(o.id)} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:`2px solid ${selectedId===o.id?"#0A1628":"#E4EAF2"}`,cursor:"pointer",transition:"border-color .15s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>{o.phoneModel}</div>
                    <StatusBadge step={o.step}/>
                  </div>
                  <div style={{fontSize:11,color:"#4A5568"}}>{o.customerName}</div>
                  <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>{o.branch} · {o.merchant} · {o.agreementNumber||"No agreement no."}</div>
                  {isAdmin&&<div style={{display:"flex",gap:6,marginTop:8}}>
                    <button onClick={e=>{e.stopPropagation();setEditOrder(o);setShowForm(true);}} style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:5,background:"#F7F9FC",color:"#4A5568",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit</button>
                    <button onClick={e=>{e.stopPropagation();deleteOrder(o.id);}} style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,border:"1px solid #FECACA",borderRadius:5,background:"#FEF2F2",color:"#B91C1C",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Delete</button>
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
        {/* Right: detail */}
        <div>
          {showForm&&<OrderForm order={editOrder} branchMeta={branchMeta} isAdmin={isAdmin} userBranch={userBranch} onSave={saveOrder} onCancel={()=>{setShowForm(false);setEditOrder(null);}}/>}
          {!showForm&&selected&&<WorkflowPanel order={selected} branchMeta={branchMeta} isAdmin={isAdmin} onUpdate={saveOrder} onClose={()=>setSelectedId(null)}/>}
          {!showForm&&!selected&&<div style={{textAlign:"center",padding:"60px 20px",color:"#8A96A8",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #E4EAF2"}}>Select an order to view workflow details.</div>}
        </div>
      </div>
    </div>
  );
}
