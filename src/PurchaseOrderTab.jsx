/**
 * Purchase Order — New Request → Submitted → Pending Purchase → Purchased.
 *
 * Every CCM/Financing order marked "Stock Request" enters at New Request
 * automatically the moment it's created (step 1). Purchase fills in
 * supplier price quotes and submits; Boon Theng/Sophia (the approver)
 * reviews the top 3 cheapest and either proceeds as-is or leaves a remark
 * naming a different supplier/price to follow; Purchase then actually buys
 * and confirms with the same detail form (and file upload) this page has
 * always used — which both marks this workflow done AND writes those same
 * details straight into the order's own Step 2 ("Confirm: Ordered") in
 * Order Tracking, so nothing needs to be re-entered there separately.
 *
 * All workflow fields (poStage, poPrices, remarks, etc.) live directly on
 * the order object itself now, not in a separate supplementary blob store
 * — that's what makes this page genuinely live: the same Supabase Realtime
 * subscription on the orders table that already powers Order Tracking's
 * live updates covers every field here too, so a quote Purchase submits
 * shows up for the approver, and a remark the approver leaves shows up for
 * Purchase, without either of them needing to refresh.
 *
 * Two fixed daily deadlines (Mon–Fri), one on Saturday, none on Sunday:
 *   Session 1 — due by 12:00pm.
 *   Session 2 — due by 5:30pm (weekdays only, not Saturday).
 * Nothing is due on Sunday — anything from Saturday afternoon onward
 * through Sunday rolls into Monday's Session 1. This only governs when a
 * New Request becomes overdue for having quotes submitted — once
 * submitted, the deadline no longer applies.
 */
import {useState,useEffect,useMemo,useRef} from "react";
import {supabase} from "./storage/index.js";
import {listStockRequestOrders,getOrder,reconcile,uploadOrderFile,getHistoryForOrders} from "./storage/ordersApi.js";

const SUPPLIERS=[
  {key:"shopee",label:"Shopee"},{key:"lazada",label:"Lazada"},{key:"tiktok",label:"TikTok"},
  {key:"genicom",label:"Genicom"},{key:"vct",label:"VCT"},{key:"yk",label:"YK"},
  {key:"a1",label:"A1"},{key:"zitron",label:"Zitron"},{key:"ewt",label:"EWT"},
];

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8",green:"#15803D",amber:"#B45309",red:"#DC2626"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)"};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const localDateStr=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");return`${y}-${m}-${dd}`;};

// Same weekend-aware boundary walk as before: Sunday has no sessions at
// all, Saturday only has Session 1 (no 5:30pm session), every other day
// has both. Walks forward from the given timestamp and returns the first
// valid deadline at or after it.
function getOpenSessionFrom(ts){
  const base=new Date(ts);base.setHours(0,0,0,0);
  const boundaries=[];
  for(let offset=0;offset<=9;offset++){
    const day=new Date(base);day.setDate(day.getDate()+offset);
    const wd=day.getDay(); // 0=Sun..6=Sat
    if(wd===0)continue;
    const s1=new Date(day);s1.setHours(12,0,0,0);
    boundaries.push({session:1,deadline:s1});
    if(wd!==6){
      const s2=new Date(day);s2.setHours(17,30,0,0);
      boundaries.push({session:2,deadline:s2});
    }
  }
  boundaries.sort((a,b)=>a.deadline-b.deadline);
  return boundaries.find(b=>ts<=b.deadline)||boundaries[boundaries.length-1];
}
function overdueDuration(deadline){
  const totalMinutes=Math.floor((new Date()-deadline)/60000);
  if(totalMinutes<60)return`${totalMinutes} min`;
  const h=Math.floor(totalMinutes/60),m=totalMinutes%60;
  return m>0?`${h}h ${m}m`:`${h}h`;
}
function fDateTime(d){
  const dd=String(d.getDate()).padStart(2,"0"),mm=String(d.getMonth()+1).padStart(2,"0"),yyyy=d.getFullYear();
  const time=d.toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit",hour12:false});
  return`${dd}/${mm}/${yyyy} ${time}`;
}
// Formats the separate date ("YYYY-MM-DD") + time ("HH:MM") strings stored
// alongside an action (e.g. poProceedDate/poProceedTime) into the same
// DD/MM/YYYY HH:MM display used everywhere else on this page.
function fStampDateTime(date,time){
  if(!date)return"—";
  const[y,m,d]=date.split("-");
  return`${d}/${m}/${y}${time?` ${time}`:""}`;
}
// Order ids are Date.now().toString() at creation — this is the order's
// real creation timestamp, no separate field needed.
const createdAtOf=order=>new Date(parseInt(order.id,10)||Date.now());

function poStageOf(order){
  if(order.step>=2)return"purchased";
  return order.poStage||"new";
}
function quotesFromOrder(order){
  const list=SUPPLIERS.filter(s=>parseFloat(order.poPrices?.[s.key])>0).map(s=>({supplier:s.label,price:parseFloat(order.poPrices[s.key])}));
  if(order.poOtherSupplier?.trim()&&parseFloat(order.poOtherPrice)>0)list.push({supplier:order.poOtherSupplier.trim(),price:parseFloat(order.poOtherPrice)});
  return list;
}
function topN(quotes,n){return[...quotes].sort((a,b)=>a.price-b.price).slice(0,n);}
function isOverdue(order){
  if(poStageOf(order)!=="new")return false;
  return new Date()>getOpenSessionFrom(createdAtOf(order)).deadline;
}

/* ── Small UI atoms (same as before) ─────────────────────────────────── */
const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:C.red}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":"0 2px 8px rgba(27,63,114,.35)",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

const Ic={
  box:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  fileText:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  truck:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  checkCircle:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
};
const STAGES=[
  {key:"new",label:"New Request",color:C.textLight,bg:C.surface,icon:Ic.box},
  {key:"submitted",label:"Submitted",color:"#1D4ED8",bg:"#EFF6FF",icon:Ic.fileText},
  {key:"pending_purchase",label:"Pending Purchase",color:C.amber,bg:"#FEF3C7",icon:Ic.truck},
  {key:"purchased",label:"Purchased",color:C.green,bg:"#F0FDF4",icon:Ic.checkCircle},
];

function useIsMobile(){
  const[isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<=760);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<=760);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);
  return isMobile;
}

function QuoteChips({quotes}){
  if(!quotes.length)return<span style={{fontSize:11,color:C.textLight}}>—</span>;
  return<div style={{display:"flex",flexWrap:"wrap"}}>
    {quotes.map((q,i)=><span key={i} style={{display:"inline-block",background:"#fff",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 8px",marginRight:5,marginTop:3,fontSize:10,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{i+1}. {q.supplier} — {fRM(q.price)}</span>)}
  </div>;
}
function BaselineCells({order,includeDevice=true,includeCreatedAt=true,includeAgreementNo=true,includeFinancePrice=true}){
  return<>
    {includeDevice&&<td style={{padding:"10px",verticalAlign:"top"}}>
      <div style={{fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:"nowrap"}}>{order.phoneModel||"—"}</div>
      <div style={{fontSize:10.5,color:C.textLight,marginTop:2}}>{order.customerName} · {order.branch}</div>
    </td>}
    {includeCreatedAt&&<td style={{padding:"10px",color:C.textMid,whiteSpace:"nowrap",verticalAlign:"top",fontSize:11.5}}>{fDateTime(createdAtOf(order))}</td>}
    {includeAgreementNo&&<td style={{padding:"10px",color:C.textMid,whiteSpace:"nowrap",verticalAlign:"top"}}>{order.agreementNumber||<span style={{fontSize:9.5,fontWeight:700,color:C.textMid,background:C.surface,border:`1px solid ${C.border}`,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>Cash Order</span>}</td>}
    {includeFinancePrice&&<td style={{padding:"10px",color:C.textMid,whiteSpace:"nowrap",verticalAlign:"top"}}>{fRM(order.financePrice||order.retailPrice)}</td>}
  </>;
}

/* ── Mark as Purchased modal (same fields/behaviour as the old "Confirm
   Ordered" form) ────────────────────────────────────────────────────── */
function OrderedForm({order,targetLabel,targetValue,onClose,onConfirm}){
  const[orderDate,setOrderDate]=useState(nowDate());
  const[supplierName,setSupplierName]=useState("");
  const[actualPrice,setActualPrice]=useState("");
  const[poNumber,setPoNumber]=useState("");
  const[platformOrderId,setPlatformOrderId]=useState("");
  const[purchaserName,setPurchaserName]=useState("");
  const[proofFile,setProofFile]=useState(null);
  const[saving,setSaving]=useState(false);
  const missing=!orderDate||!supplierName.trim()||!actualPrice.toString().trim()||!poNumber.trim()||!platformOrderId.trim()||!purchaserName.trim()||!proofFile;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:800,color:C.navy}}>Mark as Purchased</div>
        <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{order.phoneModel} — {order.customerName}</div>
      </div>
      <div style={{padding:"16px 20px"}}>
        <div style={{background:C.surface,borderRadius:8,padding:"8px 10px",marginBottom:12}}>
          <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:700}}>{targetLabel}</div>
          <div style={{fontSize:12.5,color:C.text,marginTop:2}}>{targetValue}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><L req>Order Date</L><I type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></div>
          <div><L req>Supplier Name</L><I value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier…"/></div>
          <div><L req>Actual Purchase Price (RM)</L><I type="number" step="0.01" value={actualPrice} onChange={e=>setActualPrice(e.target.value)} placeholder="0.00"/></div>
          <div><L req>PO Number</L><I value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="PO number…"/></div>
          <div><L req>Order ID</L><I value={platformOrderId} onChange={e=>setPlatformOrderId(e.target.value)} placeholder="Order ID…"/></div>
          <div><L req>Purchaser Name</L><I value={purchaserName} onChange={e=>setPurchaserName(e.target.value)} placeholder="Your name…"/></div>
        </div>
        <L req>Purchase Proof</L>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setProofFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%",marginBottom:4}}/>
        {proofFile&&<div style={{fontSize:11,color:C.green,fontWeight:600}}>{proofFile.name}</div>}
        <div style={{fontSize:10,color:C.textLight,marginTop:10}}>This fills in the same details on this order's own Step 2 in Order Tracking — no need to enter them again there.</div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 20px",borderTop:`1px solid ${C.border}`}}>
        <GBtn onClick={onClose} disabled={saving}>Cancel</GBtn>
        <PBtn disabled={missing||saving} onClick={async()=>{
          setSaving(true);
          await onConfirm({orderDate,supplierName,actualPrice,poNumber,platformOrderId,purchaserName,proofFile});
          setSaving(false);
        }}>{saving?"Saving…":"Confirm Purchased"}</PBtn>
      </div>
    </div>
  </div>;
}

/* ── Request Cancel Order modal (unchanged behaviour) ────────────────── */
function RequestCancelForm({order,onClose,onConfirm}){
  const[reason,setReason]=useState("");
  const[file,setFile]=useState(null);
  const[saving,setSaving]=useState(false);
  const missing=!reason.trim()||!file;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:800,color:C.red}}>Request Cancel Order</div>
        <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{order.phoneModel} — {order.customerName}</div>
      </div>
      <div style={{padding:"16px 20px"}}>
        <div style={{marginBottom:12}}>
          <L req>Reason for Cancellation</L>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this order being cancelled?" rows={3} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
        </div>
        <L req>Cancellation Form</L>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%",marginBottom:4}}/>
        {file&&<div style={{fontSize:11,color:C.green,fontWeight:600}}>{file.name}</div>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 20px",borderTop:`1px solid ${C.border}`}}>
        <GBtn onClick={onClose} disabled={saving}>Cancel</GBtn>
        <PBtn disabled={missing||saving} onClick={async()=>{
          setSaving(true);
          const ok=await onConfirm({order,reason:reason.trim(),file});
          setSaving(false);
          if(ok)onClose();
        }} style={{background:C.red}}>{saving?"Sending…":"Send Request"}</PBtn>
      </div>
    </div>
  </div>;
}

/* ── Stage tables ─────────────────────────────────────────────────────── */
function NewRequestRow({order,role,onSubmitQuotes,onRequestCancel,onSavePendingRemark}){
  const[prices,setPrices]=useState(order.poPrices||{});
  const[otherSupplier,setOtherSupplier]=useState(order.poOtherSupplier||"");
  const[otherPrice,setOtherPrice]=useState(order.poOtherPrice||"");
  const[purchaserRemark,setPurchaserRemark]=useState(order.poPurchaserRemark||"");
  const[pendingRemark,setPendingRemark]=useState(order.poPendingRemark||"");
  const[savingPendingRemark,setSavingPendingRemark]=useState(false);
  useEffect(()=>{setPendingRemark(order.poPendingRemark||"");},[order.poPendingRemark]);
  const canEdit=role==="purchase";
  const canSubmit=SUPPLIERS.some(s=>parseFloat(prices[s.key])>0)||(otherSupplier.trim()&&parseFloat(otherPrice)>0);
  return<tr style={{borderTop:`1px solid ${C.border}`}}>
    <BaselineCells order={order} includeCreatedAt={false} includeAgreementNo={false} includeFinancePrice={false}/>
    <td style={{padding:"10px",verticalAlign:"top"}}>
      {isOverdue(order)?<span style={{display:"inline-block",fontSize:9.5,fontWeight:700,color:C.red,background:"#FEF2F2",border:`1px solid ${C.red}`,borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>Overdue — {overdueDuration(getOpenSessionFrom(createdAtOf(order)).deadline)}</span>:<span style={{fontSize:10.5,color:C.textLight}}>—</span>}
    </td>
    <td style={{padding:"10px",minWidth:170,verticalAlign:"top"}}>
      {canEdit?<div style={{display:"flex",flexDirection:"column",gap:4}}>
        <textarea rows={2} value={pendingRemark} onChange={e=>setPendingRemark(e.target.value)} placeholder="e.g. waiting on stock confirmation" style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        {pendingRemark!==(order.poPendingRemark||"")&&<button disabled={savingPendingRemark} onClick={async()=>{setSavingPendingRemark(true);await onSavePendingRemark(order,pendingRemark.trim());setSavingPendingRemark(false);}} style={{padding:"5px 10px",borderRadius:6,border:"none",fontWeight:700,fontSize:10.5,background:C.navy,color:"#fff",cursor:"pointer",alignSelf:"flex-start"}}>{savingPendingRemark?"Saving…":"Save"}</button>}
      </div>:<div style={{fontSize:11,color:C.textMid}}>{order.poPendingRemark||"—"}</div>}
    </td>
    <BaselineCells order={order} includeDevice={false}/>
    {SUPPLIERS.map(s=><td key={s.key} style={{padding:"4px 6px",verticalAlign:"top"}}>
      {canEdit?<input type="number" value={prices[s.key]||""} onChange={e=>setPrices(p=>({...p,[s.key]:e.target.value}))} placeholder="0.00" style={{width:78,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
        :<div style={{width:78,padding:"5px 6px",fontSize:11,color:C.textMid}}>{order.poPrices?.[s.key]?fRM(order.poPrices[s.key]):"—"}</div>}
    </td>)}
    <td style={{padding:"4px 6px",verticalAlign:"top"}}>
      {canEdit?<div style={{display:"flex",flexDirection:"column",gap:3}}>
        <input placeholder="Supplier" value={otherSupplier} onChange={e=>setOtherSupplier(e.target.value)} style={{width:90,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
        <input type="number" placeholder="0.00" value={otherPrice} onChange={e=>setOtherPrice(e.target.value)} style={{width:90,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}/>
      </div>:<div style={{fontSize:11,color:C.textMid}}>{order.poOtherSupplier?`${order.poOtherSupplier} — ${fRM(order.poOtherPrice)}`:"—"}</div>}
    </td>
    <td style={{padding:"10px",minWidth:180,verticalAlign:"top"}}>
      {canEdit?<textarea rows={2} value={purchaserRemark} onChange={e=>setPurchaserRemark(e.target.value)} placeholder="Optional notes (stock, delivery time, etc.)" style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        :<div style={{fontSize:11,color:C.textMid}}>{order.poPurchaserRemark||"—"}</div>}
    </td>
    <td style={{padding:"10px",verticalAlign:"top"}}>
      {role==="purchase"?<div style={{display:"flex",flexDirection:"column",gap:6}}>
        <button disabled={!canSubmit} onClick={()=>onSubmitQuotes(order,{prices,otherSupplier,otherPrice,purchaserRemark})} style={{padding:"7px 12px",borderRadius:7,border:"none",fontWeight:700,fontSize:11,whiteSpace:"nowrap",background:canSubmit?C.navy:C.border,color:canSubmit?"#fff":C.textLight,cursor:canSubmit?"pointer":"default"}}>Submit Quotes</button>
        {!order.pendingCancelRequest?<button onClick={()=>onRequestCancel(order)} style={{padding:"7px 12px",borderRadius:7,border:"none",fontWeight:700,fontSize:11,whiteSpace:"nowrap",background:C.red,color:"#fff",cursor:"pointer"}}>Request Cancel Order</button>
          :<div style={{fontSize:10,fontWeight:700,color:C.amber,whiteSpace:"nowrap"}}>Cancellation Requested — pending approver</div>}
      </div>:<span style={{fontSize:10.5,color:C.textLight,fontStyle:"italic"}}>Waiting on Purchase</span>}
    </td>
  </tr>;
}
function NewRequestTable({orders,role,onSubmitQuotes,onRequestCancel,onSavePendingRemark}){
  return<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1500}}>
    <thead><tr style={{background:C.surface}}>
      {["Device / Customer","Overdue","Pending Remark","Order Creation Date","Agreement No.","Finance Price",...SUPPLIERS.map(s=>s.label),"Other","Remark by Purchaser","Action"].map(h=>
        <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
    </tr></thead>
    <tbody>{orders.map(o=><NewRequestRow key={o.id} order={o} role={role} onSubmitQuotes={onSubmitQuotes} onRequestCancel={onRequestCancel} onSavePendingRemark={onSavePendingRemark}/>)}</tbody>
  </table>;
}

function SubmittedPurchaseRow({order}){
  return<tr style={{borderTop:`1px solid ${C.border}`}}>
    <BaselineCells order={order}/>
    {SUPPLIERS.map(s=><td key={s.key} style={{padding:"5px 6px",verticalAlign:"top",fontSize:11,color:C.textMid,whiteSpace:"nowrap"}}>{order.poPrices?.[s.key]?fRM(order.poPrices[s.key]):"—"}</td>)}
    <td style={{padding:"10px",verticalAlign:"top",fontSize:11,color:C.textMid,whiteSpace:"nowrap"}}>{order.poOtherSupplier?`${order.poOtherSupplier} — ${fRM(order.poOtherPrice)}`:"—"}</td>
    <td style={{padding:"10px",minWidth:160,verticalAlign:"top",color:C.textMid,fontSize:11}}>{order.poPurchaserRemark||"—"}</td>
    <td style={{padding:"10px",minWidth:200,verticalAlign:"top",color:C.textMid,fontSize:11}}>{order.poApproverRemark||"—"}</td>
    <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}><span style={{fontSize:10.5,color:C.textLight,fontStyle:"italic"}}>Waiting on Approver</span></td>
  </tr>;
}
// Approver's card, shared between mobile and desktop table row — same
// fields either way, just arranged differently.
function ApproverCard({order,onProceed}){
  const[approverRemark,setApproverRemark]=useState(order.poApproverRemark||"");
  const top3=topN(quotesFromOrder(order),3);
  return<div style={{...card,padding:"12px 14px",marginBottom:10}}>
    <div style={{fontWeight:700,color:C.text,fontSize:13}}>{order.phoneModel||"—"}</div>
    <div style={{fontSize:11,color:C.textLight,marginTop:2,marginBottom:8}}>{order.customerName} · {order.branch} · {fRM(order.financePrice||order.retailPrice)}{!order.agreementNumber&&" · Cash Order"}</div>
    <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700,marginBottom:4}}>Top 3 Cheapest Supplier</div>
    <QuoteChips quotes={top3}/>
    {order.poPurchaserRemark&&<div style={{marginTop:8}}>
      <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700,marginBottom:2}}>Remark by Purchaser</div>
      <div style={{fontSize:12,color:C.textMid}}>{order.poPurchaserRemark}</div>
    </div>}
    <div style={{marginTop:10}}>
      <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700,marginBottom:4}}>Remark by Approver</div>
      <textarea rows={2} value={approverRemark} onChange={e=>setApproverRemark(e.target.value)} placeholder="Optional — e.g. found a lower price elsewhere" style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
    </div>
    <button onClick={()=>onProceed(order,approverRemark.trim())} style={{marginTop:10,width:"100%",padding:"9px 0",borderRadius:8,border:"none",fontWeight:700,fontSize:12,background:C.navy,color:"#fff",cursor:"pointer"}}>Proceed</button>
  </div>;
}
function ApproverRow({order,onProceed}){
  const[approverRemark,setApproverRemark]=useState(order.poApproverRemark||"");
  const top3=topN(quotesFromOrder(order),3);
  return<tr style={{borderTop:`1px solid ${C.border}`}}>
    <BaselineCells order={order} includeCreatedAt={false} includeAgreementNo={false}/>
    <td style={{padding:"10px",minWidth:220,verticalAlign:"top"}}><QuoteChips quotes={top3}/></td>
    <td style={{padding:"10px",minWidth:160,verticalAlign:"top",color:C.textMid,fontSize:11}}>{order.poPurchaserRemark||"—"}</td>
    <td style={{padding:"10px",minWidth:200,verticalAlign:"top"}}>
      <textarea rows={2} value={approverRemark} onChange={e=>setApproverRemark(e.target.value)} placeholder="Optional — e.g. found a lower price elsewhere" style={{width:"100%",padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
    </td>
    <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}>
      <button onClick={()=>onProceed(order,approverRemark.trim())} style={{padding:"7px 12px",borderRadius:7,border:"none",fontWeight:700,fontSize:11,background:C.navy,color:"#fff",cursor:"pointer"}}>Proceed</button>
    </td>
  </tr>;
}
function SubmittedTable({orders,role,isMobile,onProceed}){
  if(role==="purchase"){
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1500}}>
      <thead><tr style={{background:C.surface}}>
        {["Device / Customer","Order Creation Date","Agreement No.","Finance Price",...SUPPLIERS.map(s=>s.label),"Other","Remark by Purchaser","Remark by Approver","Action"].map(h=>
          <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
      </tr></thead>
      <tbody>{orders.map(o=><SubmittedPurchaseRow key={o.id} order={o}/>)}</tbody>
    </table>;
  }
  if(isMobile)return<div>{orders.map(o=><ApproverCard key={o.id} order={o} onProceed={onProceed}/>)}</div>;
  return<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1100}}>
    <thead><tr style={{background:C.surface}}>
      {["Device / Customer","Finance Price","Top 3 Cheapest Supplier","Remark by Purchaser","Remark by Approver","Action"].map(h=>
        <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
    </tr></thead>
    <tbody>{orders.map(o=><ApproverRow key={o.id} order={o} onProceed={onProceed}/>)}</tbody>
  </table>;
}

function PendingPurchaseTable({orders,role,onOpenPurchaseModal}){
  return<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
    <thead><tr style={{background:C.surface}}>
      {["Device / Customer","Order Creation Date","Agreement No.","Finance Price","Remark by Approver / Cheapest Supplier","Proceed Date/Time","Action"].map(h=>
        <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
    </tr></thead>
    <tbody>{orders.map(order=>{
      const top1=topN(quotesFromOrder(order),1)[0];
      const hasRemark=!!order.poApproverRemark;
      const label=hasRemark?"Remark by Approver":"Cheapest Supplier";
      const value=hasRemark?order.poApproverRemark:(top1?`${top1.supplier} — ${fRM(top1.price)}`:"—");
      return<tr key={order.id} style={{borderTop:`1px solid ${C.border}`}}>
        <BaselineCells order={order}/>
        <td style={{padding:"10px",minWidth:240,verticalAlign:"top"}}>
          <div style={{background:C.surface,borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700}}>{label}</div>
            <div style={{fontSize:12,color:C.text,marginTop:2}}>{value}</div>
          </div>
        </td>
        <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap",color:C.textMid,fontSize:11.5}}>{fStampDateTime(order.poProceedDate,order.poProceedTime)}</td>
        <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}>
          {role==="purchase"?<button onClick={()=>onOpenPurchaseModal(order,label,value)} style={{padding:"7px 12px",borderRadius:7,border:"none",fontWeight:700,fontSize:11,background:C.amber,color:"#fff",cursor:"pointer"}}>Mark as Purchased</button>
            :<span style={{fontSize:10.5,color:C.textLight,fontStyle:"italic"}}>Waiting on Purchase</span>}
        </td>
      </tr>;
    })}</tbody>
  </table>;
}

function PurchasedTable({orders,role,canDelete,isMobile,onBulkDismiss}){
  if(role!=="approver"){
    const headers=["Device / Customer","Order Creation Date","Agreement No.","PO Number","Actual Purchase Price","Remark by Approver / Cheapest Supplier"];
    return<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:900}}>
      <thead><tr style={{background:C.surface}}>
        {headers.map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
      </tr></thead>
      <tbody>{orders.map(order=><PurchasedRow key={order.id} order={order} includeBaseline/>)}</tbody>
    </table>;
  }
  // Approver's view — grouped by the actual purchase date (day by day),
  // each day collapsible with its own bulk "Delete" button (Sophia only —
  // Boon Theng sees the same grouped view but without the button).
  const groups={};
  orders.forEach(o=>{
    const key=o.orderDate||"unknown";
    (groups[key]=groups[key]||[]).push(o);
  });
  const dayKeys=Object.keys(groups).sort().reverse();
  const dayLabel=k=>{
    if(k==="unknown")return"Date unknown";
    const[y,m,d]=k.split("-");
    return new Date(Number(y),Number(m)-1,Number(d)).toLocaleDateString("en-MY",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  };
  return<div>
    {dayKeys.map(dk=>{
      const dayOrders=groups[dk];
      return<DayGroup key={dk} label={dayLabel(dk)} orders={dayOrders} canDelete={canDelete} isMobile={isMobile} onBulkDismiss={()=>onBulkDismiss(dayOrders.map(o=>o.id))}/>;
    })}
  </div>;
}
function PurchasedCard({order}){
  const top1=topN(quotesFromOrder(order),1)[0];
  const hasRemark=!!order.poApproverRemark;
  const label=hasRemark?"Remark by Approver":"Cheapest Supplier";
  const value=hasRemark?order.poApproverRemark:(top1?`${top1.supplier} — ${fRM(top1.price)}`:"—");
  const actualPrice=parseFloat(order.purchaseProof?.actualPrice??order.actualPrice)||0;
  const overBudget=top1&&actualPrice>top1.price;
  return<div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`}}>
    <div style={{fontWeight:700,color:C.text,fontSize:12.5}}>{order.phoneModel||"—"}</div>
    <div style={{fontSize:10.5,color:C.textLight,marginTop:2,marginBottom:8}}>{order.customerName} · {order.branch} · PO {order.poNumber||"—"}</div>
    <div style={{display:"flex",gap:8}}>
      <div style={{flex:1,background:overBudget?"#FEF2F2":"#F0FDF4",borderRadius:8,padding:"6px 8px"}}>
        <div style={{fontSize:13,fontWeight:700,color:overBudget?C.red:C.green}}>{fRM(actualPrice)}</div>
        <div style={{fontSize:9.5,color:C.textLight,marginTop:1}}>{order.supplierName||"—"}</div>
      </div>
      <div style={{flex:1,background:C.surface,borderRadius:8,padding:"6px 8px"}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700}}>{label}</div>
        <div style={{fontSize:12,color:C.text,marginTop:2}}>{value}</div>
      </div>
    </div>
  </div>;
}
function DayGroup({label,orders,canDelete,isMobile,onBulkDismiss}){
  const[expanded,setExpanded]=useState(true);
  return<div style={{...card,marginBottom:10,overflow:"hidden"}}>
    <div onClick={()=>setExpanded(p=>!p)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",cursor:"pointer",userSelect:"none",background:C.surface,flexWrap:"wrap"}}>
      <span style={{color:C.textMid,transition:"transform .15s",transform:expanded?"rotate(180deg)":"none",fontSize:11}}>▼</span>
      <span style={{fontSize:12.5,fontWeight:700,color:C.text}}>{label}</span>
      <span style={{fontSize:10,fontWeight:700,color:C.green,background:"#F0FDF4",padding:"1px 8px",borderRadius:20}}>{orders.length}</span>
      {canDelete&&<button onClick={e=>{e.stopPropagation();if(!confirm(`Remove all ${orders.length} order(s) purchased on ${label} from this list? This only hides them from Purchase Order — nothing changes in Order Tracking.`))return;onBulkDismiss();}} style={{marginLeft:"auto",fontSize:10.5,fontWeight:700,color:C.red,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"3px 9px",cursor:"pointer"}}>Delete All ({orders.length})</button>}
    </div>
    {expanded&&(isMobile?<div>{orders.map(order=><PurchasedCard key={order.id} order={order}/>)}</div>:
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{background:"#fff"}}>
          {["Device / Customer","PO Number","Actual Purchase Price","Remark by Approver / Cheapest Supplier"].map(h=>
            <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>)}
        </tr></thead>
        <tbody>{orders.map(order=><PurchasedRow key={order.id} order={order}/>)}</tbody>
      </table>)}
  </div>;
}
function PurchasedRow({order,includeBaseline}){
  const top1=topN(quotesFromOrder(order),1)[0];
  const hasRemark=!!order.poApproverRemark;
  const label=hasRemark?"Remark by Approver":"Cheapest Supplier";
  const value=hasRemark?order.poApproverRemark:(top1?`${top1.supplier} — ${fRM(top1.price)}`:"—");
  const actualPrice=parseFloat(order.purchaseProof?.actualPrice??order.actualPrice)||0;
  const overBudget=top1&&actualPrice>top1.price;
  return<tr style={{borderTop:`1px solid ${C.border}`}}>
    {includeBaseline?<BaselineCells order={order} includeFinancePrice={false}/>:<td style={{padding:"10px",verticalAlign:"top"}}>
      <div style={{fontWeight:700,color:C.text,fontSize:12.5,whiteSpace:"nowrap"}}>{order.phoneModel||"—"}</div>
      <div style={{fontSize:10.5,color:C.textLight,marginTop:2}}>{order.customerName} · {order.branch}</div>
    </td>}
    <td style={{padding:"10px",color:C.textMid,whiteSpace:"nowrap",verticalAlign:"top"}}>{order.poNumber||"—"}</td>
    <td style={{padding:"10px",minWidth:120,verticalAlign:"top"}}>
      <div style={{background:overBudget?"#FEF2F2":"#F0FDF4",borderRadius:8,padding:"6px 8px",display:"inline-block"}}>
        <div style={{fontSize:13,fontWeight:700,color:overBudget?C.red:C.green}}>{fRM(actualPrice)}</div>
        <div style={{fontSize:9.5,color:C.textLight,marginTop:1}}>{order.supplierName||"—"}</div>
      </div>
    </td>
    <td style={{padding:"10px",minWidth:240,verticalAlign:"top"}}>
      <div style={{background:C.surface,borderRadius:8,padding:"8px 10px"}}>
        <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.03em",fontWeight:700}}>{label}</div>
        <div style={{fontSize:12,color:C.text,marginTop:2}}>{value}</div>
      </div>
    </td>
  </tr>;
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function PurchaseOrderTab({branchMeta,isAdmin,email}){
  const myEmail=(email||"").toLowerCase();
  const isPurchaseUser=myEmail==="emaxpurchase@gmail.com";
  const isApproverUser=["boontheng2004@gmail.com","sophiawsc9395@gmail.com"].includes(myEmail);
  const isSophia=myEmail==="sophiawsc9395@gmail.com";
  // Column-set/detail-level role — anyone other than Purchase gets the
  // simpler approver-style view (read-only unless they're also one of the
  // two actual approver accounts, see canAct checks in each action below).
  const role=isPurchaseUser?"purchase":"approver";
  const canRequestCancel=isPurchaseUser||isSophia;

  const[orders,setOrders]=useState([]);
  const[loading,setLoading]=useState(true);
  const isMobile=useIsMobile();
  const[stage,setStage]=useState("new");
  const[purchasingOrder,setPurchasingOrder]=useState(null);
  const[purchasingTarget,setPurchasingTarget]=useState({label:"",value:""});
  const[cancellingOrder,setCancellingOrder]=useState(null);

  const refresh=async()=>{
    const fresh=await listStockRequestOrders();
    setOrders(fresh);
    return fresh;
  };
  useEffect(()=>{(async()=>{await refresh();setLoading(false);})();},[]);

  // Live updates — every workflow field lives directly on the order row
  // now, so the same realtime subscription that keeps Order Tracking live
  // covers this page too: a quote Purchase submits, a remark the approver
  // leaves, a Mark as Purchased confirmation — all show up here for
  // whoever else has this page open, without a manual refresh.
  useEffect(()=>{
    let refreshTimer;
    const scheduleRefresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refresh();},400);};
    const channel=supabase.channel("purchase-order-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},scheduleRefresh)
      .subscribe();
    return()=>{clearTimeout(refreshTimer);supabase.removeChannel(channel);};
  },[]);
  useEffect(()=>{
    const onVisible=()=>{if(document.visibilityState==="visible")refresh();};
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  const submitQuotes=async(order,{prices,otherSupplier,otherPrice,purchaserRemark})=>{
    const fresh=await getOrder(order.id);
    if(!fresh){alert("Could not find this order — it may have been deleted.");return;}
    const result=await reconcile([fresh],[{...fresh,poStage:"submitted",poPrices:prices,poOtherSupplier:otherSupplier,poOtherPrice:otherPrice,poPurchaserRemark:purchaserRemark,
      history:[...(fresh.history||[]),{step:fresh.step,date:nowDate(),time:nowTime(),note:`Supplier quotes submitted by ${email}`,skipStepDate:true}]}]);
    if(!result.ok){alert("This didn't save — please check your connection and try again.");return;}
    await refresh();
  };
  const savePendingRemark=async(order,remark)=>{
    const fresh=await getOrder(order.id);
    if(!fresh){alert("Could not find this order — it may have been deleted.");return;}
    const result=await reconcile([fresh],[{...fresh,poPendingRemark:remark}]);
    if(!result.ok){alert("This didn't save — please check your connection and try again.");return;}
    await refresh();
  };
  const proceed=async(order,approverRemark)=>{
    const fresh=await getOrder(order.id);
    if(!fresh){alert("Could not find this order — it may have been deleted.");return;}
    const result=await reconcile([fresh],[{...fresh,poStage:"pending_purchase",poApproverRemark:approverRemark,poProceedDate:nowDate(),poProceedTime:nowTime(),
      history:[...(fresh.history||[]),{step:fresh.step,date:nowDate(),time:nowTime(),note:approverRemark?`Proceed to purchase — ${email}: ${approverRemark}`:`Proceed to purchase — ${email}, follow lowest quote`,skipStepDate:true}]}]);
    if(!result.ok){alert("This didn't save — please check your connection and try again.");return;}
    await refresh();
  };
  const markPurchased=async({orderDate,supplierName,actualPrice,poNumber,platformOrderId,purchaserName,proofFile})=>{
    const fresh=await getOrder(purchasingOrder.id);
    if(!fresh){alert("Could not find this order — it may have been deleted.");setPurchasingOrder(null);return;}
    const purchaseProof=await uploadOrderFile(fresh.id,proofFile,proofFile.name);
    const nextStep=Math.max(fresh.step,2);
    const result=await reconcile([fresh],[{...fresh,step:nextStep,orderDate,supplierName,actualPrice:parseFloat(actualPrice)||0,poNumber,platformOrderId,purchaserName,purchaseProof,
      stepDates:{...(fresh.stepDates||{}),2:{date:nowDate(),time:nowTime()}},
      history:[...(fresh.history||[]),{step:2,date:orderDate,time:nowTime(),orderDate,supplierName,actualPrice:parseFloat(actualPrice)||0,poNumber,platformOrderId,purchaserName,purchaseProof}]}]);
    if(!result.ok){alert("This didn't save — please check your connection and try again.");return;}
    setPurchasingOrder(null);
    await refresh();
  };
  const requestCancelOrder=async({order,reason,file})=>{
    const fresh=await getOrder(order.id);
    if(!fresh){alert("Could not find the underlying order — it may have been deleted.");return false;}
    if(fresh.pendingCancelRequest){alert("A cancellation request is already pending admin approval for this order.");return false;}
    const cancellationForm=await uploadOrderFile(order.id,file,file.name);
    const result=await reconcile([fresh],[{...fresh,pendingCancelRequest:{requestedBy:email,requestedDate:nowDate(),requestedTime:nowTime(),reason,cancellationForm},
      history:[...(fresh.history||[]),{step:fresh.step,date:nowDate(),time:nowTime(),note:`Cancellation requested by ${email}: ${reason}`,skipStepDate:true}]}]);
    if(!result.ok){alert("This didn't save — please check your connection and try again.");return false;}
    await refresh();
    return true;
  };
  // Only hides the order from THIS page's Purchased list — never a real
  // delete. The order itself, its full history, and everything about it
  // in Order Tracking stays completely untouched; this just sets a flag
  // this page's own Purchased query filters out from here on.
  const dismissPurchased=async ids=>{
    const list=Array.isArray(ids)?ids:[ids];
    for(const id of list){
      const fresh=await getOrder(id);
      if(!fresh)continue;
      await reconcile([fresh],[{...fresh,poHiddenFromList:true}]);
    }
    await refresh();
  };

  const staged=useMemo(()=>orders.filter(o=>!o.cancelled&&!o.pendingCancelRequest&&!o.poHiddenFromList).map(o=>({...o,_stage:poStageOf(o)})),[orders]);
  const stageOrders=staged.filter(o=>o._stage===stage);
  const activeStage=STAGES.find(s=>s.key===stage);

  // One-time backfill for orders that reached Pending Purchase before the
  // Proceed Date/Time column existed — their timestamp already lives in
  // the order's history log (the "Proceed to purchase" entry written when
  // the approver clicked Proceed), it just was never copied onto the order
  // row itself. Pull it from history once per order and save it there, so
  // the column shows real data for old orders too instead of "—" forever.
  // backfillAttempted guards against retrying every realtime refresh for
  // an order with no matching history entry to find.
  const backfillAttempted=useRef(new Set());
  useEffect(()=>{
    const missing=staged.filter(o=>o._stage==="pending_purchase"&&!o.poProceedDate&&!backfillAttempted.current.has(o.id));
    if(!missing.length)return;
    missing.forEach(o=>backfillAttempted.current.add(o.id));
    (async()=>{
      const historyById=await getHistoryForOrders(missing.map(o=>o.id));
      let changed=false;
      for(const o of missing){
        const hist=historyById[o.id]||historyById[String(o.id)]||[];
        const entry=[...hist].reverse().find(h=>typeof h.note==="string"&&h.note.startsWith("Proceed to purchase"));
        if(!entry)continue;
        const fresh=await getOrder(o.id);
        if(!fresh)continue;
        const result=await reconcile([fresh],[{...fresh,poProceedDate:entry.date,poProceedTime:entry.time}]);
        if(result.ok)changed=true;
      }
      if(changed)await refresh();
    })();
  },[staged]);

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div style={{fontFamily:"Inter, -apple-system, sans-serif",background:C.surface,minHeight:"100vh"}}>
    <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{fontSize:16,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.05em"}}>Purchase Order</div>
        <span style={{fontSize:9.5,fontWeight:700,color:"#4ADE80",background:"rgba(74,222,128,.15)",border:"1px solid rgba(74,222,128,.4)",borderRadius:20,padding:"2px 8px",letterSpacing:"0.04em"}}>● LIVE</span>
      </div>
    </div>

    <div style={{padding:20}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:20,maxWidth:800}}>
        {STAGES.map(s=>{
          const count=staged.filter(o=>o._stage===s.key).length;
          const active=stage===s.key;
          return<div key={s.key} onClick={()=>setStage(s.key)} style={{...card,border:`1px solid ${active?s.color:C.border}`,borderTop:`3px solid ${s.color}`,padding:"12px 14px 11px",display:"flex",flexDirection:"column",gap:9,cursor:"pointer",boxShadow:active?`0 0 0 1.5px ${s.color}, 0 6px 16px rgba(10,22,40,.08)`:card.boxShadow}}>
            <div style={{width:30,height:30,borderRadius:8,background:s.bg,color:s.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{s.icon}</div>
            <div>
              <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",marginBottom:3}}>{s.label}</div>
              <div style={{fontSize:21,fontWeight:800,color:count?C.navy:"#C3CCDA",lineHeight:1}}>{count}</div>
            </div>
          </div>;
        })}
      </div>

      <div style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
          <div style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{activeStage.label} ({stageOrders.length})</div>
        </div>
        <div style={{overflowX:"auto"}}>
          {stageOrders.length===0?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No orders here.</div>
            :stage==="new"?<NewRequestTable orders={stageOrders} role={role} onSubmitQuotes={submitQuotes} onRequestCancel={canRequestCancel?setCancellingOrder:()=>{}} onSavePendingRemark={savePendingRemark}/>
            :stage==="submitted"?<SubmittedTable orders={stageOrders} role={role} isMobile={isMobile} onProceed={proceed}/>
            :stage==="pending_purchase"?<PendingPurchaseTable orders={stageOrders} role={role} onOpenPurchaseModal={(o,l,v)=>{setPurchasingOrder(o);setPurchasingTarget({label:l,value:v});}}/>
            :<PurchasedTable orders={stageOrders} role={isSophia||myEmail==="boontheng2004@gmail.com"?"approver":role} canDelete={isSophia} isMobile={isMobile} onBulkDismiss={dismissPurchased}/>}
        </div>
      </div>
    </div>

    {purchasingOrder&&<OrderedForm order={purchasingOrder} targetLabel={purchasingTarget.label} targetValue={purchasingTarget.value} onClose={()=>setPurchasingOrder(null)} onConfirm={markPurchased}/>}
    {cancellingOrder&&<RequestCancelForm order={cancellingOrder} onClose={()=>setCancellingOrder(null)} onConfirm={requestCancelOrder}/>}
  </div>;
}
