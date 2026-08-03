/**
 * Daily Purchase Order — every new CCM/Financing order submitted with
 * "Stock Request" chosen auto-lands here (see addToPurchaseOrderList,
 * called from OrderTab.jsx's order-creation flow). Purchaser compares
 * supplier prices, picks one, and clicks "Ordered" — which both marks this
 * entry done AND writes the same details straight into the underlying
 * order's own Step 2 ("Confirm: Ordered") in Order Tracking, so it doesn't
 * need to be re-entered there separately.
 *
 * Two fixed daily sessions (Mon–Fri), one on Saturday, none on Sunday:
 *   Session 1 — opens 8:30am, covers submissions from y'day 3:30pm to
 *               today 8:30am, due by 12:00pm.
 *   Session 2 — opens 3:30pm, covers today 8:30am–3:30pm, due by 5:30pm.
 * Saturday only gets Session 1 (its window stretches back to Friday
 * 3:30pm). Nothing lands on Sunday — anything from Saturday afternoon
 * onward through Sunday rolls into Monday's Session 1.
 */
import {useState,useEffect,useMemo} from "react";
import * as XLSX from "xlsx";
import {loadData,saveData} from "./storage/index.js";
import {listOrders,getOrder,getOrderHistory,reconcile,uploadOrderFile,signFileUrl} from "./storage/ordersApi.js";

const PO_KEY="emax_v5_purchase_orders";

const SUPPLIERS=[
  {key:"shopee",label:"Shopee"},{key:"lazada",label:"Lazada"},{key:"tiktok",label:"TikTok"},
  {key:"genicom",label:"Genicom"},{key:"vct",label:"VCT"},{key:"yk",label:"YK"},
  {key:"a1",label:"A1"},{key:"zitron",label:"Zitron"},{key:"ewt",label:"EWT"},
];

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const localDateStr=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");return`${y}-${m}-${dd}`;};

// Which {date, session} a given moment belongs to, per the Sat/Sun rules
// described above. Walks forward from a wide window of candidate session
// cutoffs and picks the first one this timestamp falls on-or-before.
function getSessionForTimestamp(ts){
  const base=new Date(ts);base.setHours(0,0,0,0);
  const boundaries=[];
  for(let offset=-3;offset<=7;offset++){
    const day=new Date(base);day.setDate(day.getDate()+offset);
    const wd=day.getDay(); // 0=Sun..6=Sat
    if(wd===0)continue;
    const s1=new Date(day);s1.setHours(8,30,0,0);
    boundaries.push({date:localDateStr(day),session:1,cutoff:s1});
    if(wd!==6){
      const s2=new Date(day);s2.setHours(15,30,0,0);
      boundaries.push({date:localDateStr(day),session:2,cutoff:s2});
    }
  }
  boundaries.sort((a,b)=>a.cutoff-b.cutoff);
  for(const b of boundaries)if(ts<=b.cutoff)return{date:b.date,session:b.session};
  return{date:localDateStr(base),session:1};
}
function getSessionDeadline(dateStr,session){
  const[y,m,d]=dateStr.split("-").map(Number);
  const dl=new Date(y,m-1,d);
  if(session===1)dl.setHours(12,0,0,0);else dl.setHours(17,30,0,0);
  return dl;
}
function getSessionOpenTime(dateStr,session){
  const[y,m,d]=dateStr.split("-").map(Number);
  const op=new Date(y,m-1,d);
  if(session===1)op.setHours(8,30,0,0);else op.setHours(15,30,0,0);
  return op;
}

// Called from OrderTab.jsx right after a new order is created with
// stockStatus==="stock_request" — auto-adds it to today's (or the
// appropriate) purchase order session.
export async function addToPurchaseOrderList(order,atTimestamp=null){
  try{
    const list=(await loadData(PO_KEY))||[];
    const now=atTimestamp?new Date(atTimestamp):new Date();
    const{date,session}=getSessionForTimestamp(now);
    const entry={
      id:`po_${order.id}`,orderId:order.id,
      deviceName:order.phoneModel||"",agreementNo:order.agreementNumber||"",
      financePrice:order.financePrice||0,branch:order.branch||"",
      prices:{},remark:"",ordered:false,
      sessionDate:date,session,createdAt:now.toISOString(),
    };
    await saveData(PO_KEY,[...list.filter(e=>e.orderId!==order.id),entry]);
  }catch(e){console.error("addToPurchaseOrderList failed:",e);}
}

// Keeps a Purchase Order entry's "ordered" status in sync regardless of
// which path actually completed Step 2 — this page's own Ordered button,
// or Order Tracking's "Confirm: Ordered" panel directly. Called from
// OrderTab.jsx's saveOrder on every save, so an order marked Ordered from
// Order Tracking stops showing as Pending here too, without the purchaser
// having to do anything twice.
export async function syncPurchaseOrderEntry(order){
  try{
    if(order.step<2)return;
    const list=(await loadData(PO_KEY))||[];
    const entry=list.find(e=>e.orderId===order.id);
    if(!entry||entry.ordered)return;
    const updated=list.map(e=>e.orderId!==order.id?e:{
      ...e,ordered:true,orderedAt:new Date().toISOString(),
      orderDate:order.orderDate,supplierName:order.supplierName,poNumber:order.poNumber,purchaserName:order.purchaserName,
    });
    await saveData(PO_KEY,updated);
  }catch(e){console.error("syncPurchaseOrderEntry failed:",e);}
}

// Called from OrderTab.jsx whenever an order is deleted or marked
// cancelled — there's nothing left to purchase for it, so it shouldn't
// keep sitting on this page as a pending (or even an already-ordered)
// row.
export async function removeFromPurchaseOrderList(orderId){
  try{
    const list=(await loadData(PO_KEY))||[];
    if(!list.some(e=>e.orderId===orderId))return;
    await saveData(PO_KEY,list.filter(e=>e.orderId!==orderId));
  }catch(e){console.error("removeFromPurchaseOrderList failed:",e);}
}

const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":"0 2px 8px rgba(27,63,114,.35)",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

function SecHdr({children}){
  return<div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</div>;
}

/* ── Ordered confirmation form ───────────────────────────────────────── */
function OrderedForm({entry,onClose,onConfirm}){
  const[orderDate,setOrderDate]=useState(nowDate());
  const[supplierName,setSupplierName]=useState("");
  const[poNumber,setPoNumber]=useState("");
  const[purchaserName,setPurchaserName]=useState("");
  const[proofFile,setProofFile]=useState(null);
  const[saving,setSaving]=useState(false);
  const missing=!orderDate||!supplierName.trim()||!poNumber.trim()||!purchaserName.trim()||!proofFile;
  return<div className="modal-overlay" style={{position:"fixed",inset:0,background:"rgba(10,22,40,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"90vh",overflow:"auto"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:800,color:C.navy}}>Confirm Ordered</div>
        <div style={{fontSize:11,color:C.textLight,marginTop:2}}>{entry.deviceName} — {entry.agreementNo||"no agreement no."}</div>
      </div>
      <div style={{padding:"16px 20px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><L req>Order Date</L><I type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></div>
          <div><L req>Supplier Name</L><I value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="Supplier…"/></div>
          <div><L req>PO Number</L><I value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="PO number…"/></div>
          <div><L req>Purchaser Name</L><I value={purchaserName} onChange={e=>setPurchaserName(e.target.value)} placeholder="Your name…"/></div>
        </div>
        <L req>Purchase Proof</L>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setProofFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%",marginBottom:4}}/>
        {proofFile&&<div style={{fontSize:11,color:"#15803D",fontWeight:600}}>{proofFile.name}</div>}
        <div style={{fontSize:10,color:C.textLight,marginTop:10}}>This fills in the same details on this order's own Step 2 in Order Tracking — no need to enter them again there.</div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 20px",borderTop:`1px solid ${C.border}`}}>
        <GBtn onClick={onClose} disabled={saving}>Cancel</GBtn>
        <PBtn disabled={missing||saving} onClick={async()=>{
          setSaving(true);
          await onConfirm({orderDate,supplierName,poNumber,purchaserName,proofFile});
          setSaving(false);
        }}>{saving?"Saving…":"Confirm Ordered"}</PBtn>
      </div>
    </div>
  </div>;
}

export default function PurchaseOrderTab({branchMeta,isAdmin}){
  const[list,setList]=useState([]);
  const[loading,setLoading]=useState(true);
  const[viewDate,setViewDate]=useState(()=>getSessionForTimestamp(new Date()).date);
  const[viewSession,setViewSession]=useState(()=>getSessionForTimestamp(new Date()).session);
  const[orderedFor,setOrderedFor]=useState(null);

  useEffect(()=>{
    (async()=>{
      const initial=(await loadData(PO_KEY))||[];
      setList(Array.isArray(initial)?initial:[]);
      setLoading(false);
      // Quietly catch up on any Stock Request order that isn't here yet —
      // covers orders created before this page existed, or any that
      // somehow slipped through. Uses each order's own original submission
      // time (not "now"), so a genuinely old order shows up flagged as
      // overdue rather than looking freshly submitted.
      try{
        const allOrders=await listOrders(null);
        const orderById=new Map(allOrders.map(o=>[o.id,o]));
        const currentList=(Array.isArray(initial)?initial:[]);
        const existingIds=new Set(currentList.map(e=>e.orderId));
        const missing=allOrders.filter(o=>o.step===1&&o.stockStatus==="stock_request"&&!existingIds.has(o.id));
        // Self-heal — drop any not-yet-ordered entry whose underlying order
        // was deleted or cancelled since we last loaded. Deleting/cancelling
        // an order already tries to remove it from here directly, but this
        // catches it regardless (a tab left open from before the deletion,
        // a save that silently failed, etc.) — every time this page opens,
        // it reconciles itself against what's actually still there.
        const stale=currentList.filter(e=>!e.ordered&&(!orderById.has(e.orderId)||orderById.get(e.orderId).cancelled));
        if(missing.length||stale.length){
          for(const o of missing){
            const hist=await getOrderHistory(o.id);
            const firstEntry=hist?.find(h=>h.step===1)||hist?.[0];
            const originalTimestamp=firstEntry?`${firstEntry.date}T${firstEntry.time||"09:00"}:00`:null;
            await addToPurchaseOrderList(o,originalTimestamp);
          }
          if(stale.length){
            const staleIds=new Set(stale.map(e=>e.orderId));
            const afterAdd=(await loadData(PO_KEY))||[];
            await saveData(PO_KEY,afterAdd.filter(e=>!staleIds.has(e.orderId)));
          }
          const refreshed=await loadData(PO_KEY);
          setList(Array.isArray(refreshed)?refreshed:[]);
        }
      }catch(e){console.error("Purchase order catch-up failed:",e);}
    })();
  },[]);

  const save=async(next)=>{setList(next);await saveData(PO_KEY,next);};


  // A session key that sorts correctly across dates, so "earlier than
  // current" comparisons below are simple string comparisons.
  const sessionKey=(d,s)=>`${d}_${s}`;
  const currentSession=useMemo(()=>getSessionForTimestamp(new Date()),[]);
  const isViewingCurrentSession=viewDate===currentSession.date&&viewSession===currentSession.session;

  const visible=useMemo(()=>{
    const ownSession=list.filter(e=>e.sessionDate===viewDate&&e.session===viewSession);
    if(!isViewingCurrentSession)return ownSession; // browsing history — show exactly what belonged there
    // Viewing the current session — also pull in anything still pending
    // from an earlier session that never got ordered, so it doesn't just
    // sit forgotten back on a day nobody's looking at anymore.
    const carriedForward=list.filter(e=>!e.ordered&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession));
    return[...carriedForward,...ownSession];
  },[list,viewDate,viewSession,isViewingCurrentSession]);
  const pendingCount=visible.filter(e=>!e.ordered).length;
  const carriedForwardCount=useMemo(()=>isViewingCurrentSession?list.filter(e=>!e.ordered&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession)).length:0,[list,viewDate,viewSession,isViewingCurrentSession]);

  // Is Saturday's Session 2 or any Sunday session even a valid thing to
  // view? Kept selectable in the date/session pickers regardless (so past
  // records are still browsable), but the "current session" default and
  // the deadline alert never point at one.
  const deadline=getSessionDeadline(viewDate,viewSession);
  const openTime=getSessionOpenTime(viewDate,viewSession);
  const now=new Date();
  const isPastDeadline=now>deadline;
  const hoursLate=isPastDeadline?((now-deadline)/3600000):0;

  const updatePrice=(id,supplierKey,val)=>{
    const updated=list.map(e=>e.id!==id?e:{...e,prices:{...e.prices,[supplierKey]:val}});
    save(updated);
  };
  const updateRemark=(id,val)=>{
    const updated=list.map(e=>e.id!==id?e:{...e,remark:val});
    save(updated);
  };

  const confirmOrdered=async({orderDate,supplierName,poNumber,purchaserName,proofFile})=>{
    const entry=orderedFor;
    if(!entry)return;
    // Pull the order's current state (header + history) so reconcile()
    // only inserts the ONE new history entry, not the whole timeline again.
    const orderRow=await getOrder(entry.orderId);
    if(!orderRow){alert("Could not find the underlying order — it may have been deleted.");setOrderedFor(null);return;}
    const history=await getOrderHistory(entry.orderId);
    const proof=await uploadOrderFile(entry.orderId,proofFile,proofFile.name);
    const h={step:2,date:nowDate(),time:nowTime(),note:"Ordered",orderDate,supplierName,poNumber,purchaserName,files:{purchaseProof:proof}};
    const oldOrder={...orderRow,history};
    const newOrder={...orderRow,step:Math.max(orderRow.step,2),orderDate,supplierName,poNumber,purchaserName,history:[...history,h]};
    const result=await reconcile([oldOrder],[newOrder]);
    if(!result.ok){alert("Failed to update the order — please try again.");setOrderedFor(null);return;}
    const updatedList=list.map(e=>e.id!==entry.id?e:{...e,ordered:true,orderedAt:new Date().toISOString(),orderDate,supplierName,poNumber,purchaserName});
    await save(updatedList);
    setOrderedFor(null);
  };

  const exportExcel=()=>{
    const rows=visible.map(e=>{
      const row={
        "Device Name":e.deviceName,
        "Agreement No.":e.agreementNo||"—",
        "Finance Price":e.financePrice||0,
        "Branch":branchMeta?.[e.branch]?.name||e.branch,
      };
      SUPPLIERS.forEach(s=>{row[s.label]=e.prices?.[s.key]||0;});
      row["Remark"]=e.remark||"";
      row["Status"]=e.ordered?"Ordered":"Pending";
      if(!e.ordered&&isViewingCurrentSession&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession)){
        row["Status"]=`Overdue — since ${fDate(e.sessionDate)} Session ${e.session}`;
      }
      return row;
    });
    const ws=XLSX.utils.json_to_sheet(rows);
    ws["!cols"]=[{wch:32},{wch:16},{wch:13},{wch:16},...SUPPLIERS.map(()=>({wch:10})),{wch:20},{wch:30}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,`Session ${viewSession}`);
    XLSX.writeFile(wb,`Purchase_Order_${viewDate}_Session${viewSession}.xlsx`);
  };

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {!isViewingCurrentSession&&<div style={{...card,borderLeft:"3px solid #8A96A8",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:12,color:C.textMid}}>You're viewing a closed session — it's read-only from here. Anything still pending from this session has already carried forward into the current session, where it can be actioned.</div>
    </div>}
    {isPastDeadline&&pendingCount>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Late Submission</div>
      <div style={{fontSize:12,color:"#DC2626"}}>Session {viewSession} ({fDate(viewDate)}) was due by {viewSession===1?"12:00pm":"5:30pm"} — {pendingCount} order{pendingCount>1?"s":""} still pending, {hoursLate.toFixed(1)} hour{hoursLate>=2?"s":""} late.</div>
    </div>}

    <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <L>Date</L>
        <input type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)} style={{padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setViewSession(1)} style={{padding:"7px 14px",borderRadius:8,border:`1.5px solid ${viewSession===1?C.blueBright:C.border}`,background:viewSession===1?"#EFF6FF":"#fff",color:viewSession===1?C.blueBright:C.textMid,fontWeight:700,fontSize:12,cursor:"pointer"}}>Session 1 · Due 12:00pm</button>
        <button onClick={()=>setViewSession(2)} style={{padding:"7px 14px",borderRadius:8,border:`1.5px solid ${viewSession===2?C.blueBright:C.border}`,background:viewSession===2?"#EFF6FF":"#fff",color:viewSession===2?C.blueBright:C.textMid,fontWeight:700,fontSize:12,cursor:"pointer"}}>Session 2 · Due 5:30pm</button>
      </div>
      <div style={{flex:1}}/>
      <GBtn onClick={exportExcel}>Export to Excel</GBtn>
    </div>

    <div style={{...card}}>
      <SecHdr>Purchase Order — {fDate(viewDate)} · Session {viewSession} ({pendingCount} pending{carriedForwardCount>0?`, ${carriedForwardCount} overdue`:""})</SecHdr>
      <div style={{overflowX:"auto"}}>
        {visible.length===0
          ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No orders in this session.</div>
          :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1100}}>
            <thead><tr style={{background:C.surface}}>
              {["Device Name","Agreement No.","Finance Price","Branch",...SUPPLIERS.map(s=>s.label),"Remark",""].map(h=>
                <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
              )}
            </tr></thead>
            <tbody>{visible.map((e,i)=>{
              const isCarried=isViewingCurrentSession&&!e.ordered&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession);
              return(
              <tr key={e.id} style={{borderTop:`1px solid ${C.border}`,background:e.ordered?"#F0FDF4":isCarried?"#FFFBEB":(i%2===0?"#fff":C.surface)}}>
                <td style={{padding:"8px 10px",fontWeight:700,color:C.text}}>
                  <div style={{whiteSpace:"nowrap"}}>{e.deviceName}</div>
                  {isCarried&&<div style={{fontSize:9,fontWeight:700,color:"#B45309",background:"#FEF3C7",display:"inline-block",borderRadius:10,padding:"1px 7px",marginTop:3,whiteSpace:"nowrap"}}>Overdue — since {fDate(e.sessionDate)} Session {e.session}</div>}
                </td>
                <td style={{padding:"8px 10px",color:C.textMid}}>{e.agreementNo||"—"}</td>
                <td style={{padding:"8px 10px",color:C.textMid,whiteSpace:"nowrap"}}>{fRM(e.financePrice)}</td>
                <td style={{padding:"8px 10px",color:C.textMid,whiteSpace:"nowrap"}}>{branchMeta?.[e.branch]?.name||e.branch}</td>
                {SUPPLIERS.map(s=><td key={s.key} style={{padding:"4px 6px"}}>
                  <input type="number" value={e.prices?.[s.key]||""} onChange={ev=>updatePrice(e.id,s.key,ev.target.value)} placeholder="0.00" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:80,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
                </td>)}
                <td style={{padding:"4px 6px"}}>
                  <input value={e.remark||""} onChange={ev=>updateRemark(e.id,ev.target.value)} placeholder="Remark…" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:110,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
                </td>
                <td style={{padding:"8px 10px"}}>
                  {e.ordered
                    ?<span style={{fontSize:10,fontWeight:700,color:"#15803D",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>Ordered</span>
                    :isAdmin&&(isViewingCurrentSession
                      ?<button onClick={()=>setOrderedFor(e)} style={{padding:"6px 12px",borderRadius:7,border:"none",background:C.navy,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>Ordered</button>
                      :<span style={{fontSize:10,fontWeight:700,color:C.textLight,whiteSpace:"nowrap"}}>View only — switch to the current session to act</span>)}
                  {!e.ordered&&!isAdmin&&<span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>Pending</span>}
                </td>
              </tr>
              );})}</tbody>
          </table>}
      </div>
    </div>

    {orderedFor&&<OrderedForm entry={orderedFor} onClose={()=>setOrderedFor(null)} onConfirm={confirmOrdered}/>}
  </div>;
}
