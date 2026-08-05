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
import {useState,useEffect,useMemo,useRef} from "react";
import {loadData,saveData,supabase} from "./storage/index.js";
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
const getDisplayPrice=e=>e.orderType==="cash"?(e.retailPrice||0):(e.financePrice||0);
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
      financePrice:order.financePrice||0,retailPrice:order.retailPrice||0,orderType:order.orderType||"ccm",branch:order.branch||"",
      editLog:order.editLog||[],
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
    if(!list.some(e=>String(e.orderId)===String(orderId)))return;
    await saveData(PO_KEY,list.filter(e=>String(e.orderId)!==String(orderId)));
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
  const[actualPrice,setActualPrice]=useState("");
  const[poNumber,setPoNumber]=useState("");
  const[purchaserName,setPurchaserName]=useState("");
  const[proofFile,setProofFile]=useState(null);
  const[saving,setSaving]=useState(false);
  const missing=!orderDate||!supplierName.trim()||!actualPrice.toString().trim()||!poNumber.trim()||!purchaserName.trim()||!proofFile;
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
          <div><L req>Actual Purchase Price (RM)</L><I type="number" step="0.01" value={actualPrice} onChange={e=>setActualPrice(e.target.value)} placeholder="0.00"/></div>
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
          await onConfirm({orderDate,supplierName,actualPrice,poNumber,purchaserName,proofFile});
          setSaving(false);
        }}>{saving?"Saving…":"Confirm Ordered"}</PBtn>
      </div>
    </div>
  </div>;
}

export default function PurchaseOrderTab({branchMeta,isAdmin}){
  const[list,setList]=useState([]);
  const[loading,setLoading]=useState(true);
  const[savingPhoto,setSavingPhoto]=useState(false);
  const[viewDate,setViewDate]=useState(()=>getSessionForTimestamp(new Date()).date);
  const[viewSession,setViewSession]=useState(()=>getSessionForTimestamp(new Date()).session);
  const[orderedFor,setOrderedFor]=useState(null);
  const[expandedLog,setExpandedLog]=useState({});

  const runCatchUp=async()=>{
    try{
      const initial=(await loadData(PO_KEY))||[];
      const currentList=Array.isArray(initial)?initial:[];
      const allOrders=await listOrders(null);
      // IDs are normalized to strings on both sides before any comparison
      // — orderId here and order.id from the database should always match
      // as strings already, but comparing them directly (without forcing
      // the same type) is exactly the kind of thing that fails silently
      // if one side is ever a number instead of a string, so this removes
      // that possibility outright rather than trusting it never happens.
      const orderById=new Map(allOrders.map(o=>[String(o.id),o]));
      const existingIds=new Set(currentList.map(e=>String(e.orderId)));
      const missing=allOrders.filter(o=>o.step===1&&o.stockStatus==="stock_request"&&!existingIds.has(String(o.id)));
      const stale=currentList.filter(e=>{
        if(e.ordered)return false;
        const match=orderById.get(String(e.orderId));
        return!match||match.cancelled===true;
      });
      const needsBackfill=currentList.filter(e=>!e.ordered&&e.orderType===undefined&&orderById.has(String(e.orderId)));
      let changed=false;
      for(const o of missing){
        const hist=await getOrderHistory(o.id);
        const firstEntry=hist?.find(h=>h.step===1)||hist?.[0];
        const originalTimestamp=firstEntry?`${firstEntry.date}T${firstEntry.time||"09:00"}:00`:null;
        await addToPurchaseOrderList(o,originalTimestamp);
        changed=true;
      }
      if(needsBackfill.length){
        const afterAdd1=(await loadData(PO_KEY))||[];
        const patched=afterAdd1.map(e=>{
          if(!needsBackfill.some(n=>String(n.orderId)===String(e.orderId)))return e;
          const src=orderById.get(String(e.orderId));
          return{...e,orderType:src.orderType||"ccm",retailPrice:src.retailPrice||0,editLog:src.editLog||[]};
        });
        await saveData(PO_KEY,patched);
        changed=true;
      }
      if(stale.length){
        const staleIds=new Set(stale.map(e=>String(e.orderId)));
        const afterAdd=(await loadData(PO_KEY))||[];
        await saveData(PO_KEY,afterAdd.filter(e=>!staleIds.has(String(e.orderId))));
        changed=true;
      }
      if(changed){
        const refreshed=await loadData(PO_KEY);
        setList(Array.isArray(refreshed)?refreshed:[]);
      }
    }catch(e){console.error("Purchase order catch-up failed:",e);}
  };

  useEffect(()=>{
    (async()=>{
      const initial=(await loadData(PO_KEY))||[];
      setList(Array.isArray(initial)?initial:[]);
      setLoading(false);
      await runCatchUp();
    })();
  },[]);

  // Live removal — if an order gets cancelled or deleted anywhere else
  // (another tab, another person), this page hears about it immediately
  // via Supabase Realtime and drops it from view right away, instead of
  // only catching up the next time the page happens to reload.
  const listRef=useRef(list);
  useEffect(()=>{listRef.current=list;},[list]);
  useEffect(()=>{
    const channel=supabase.channel("purchase-order-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},async payload=>{
        const wasCancelled=payload.new?.cancelled===true;
        const wasDeleted=payload.eventType==="DELETE";
        const orderId=payload.new?.id||payload.old?.id;
        if(!orderId)return;
        if(wasCancelled||wasDeleted){
          setList(prev=>{
            const stillHasEntry=prev.some(e=>String(e.orderId)===String(orderId)&&!e.ordered);
            if(!stillHasEntry)return prev;
            removeFromPurchaseOrderList(orderId);
            return prev.filter(e=>String(e.orderId)!==String(orderId));
          });
          return;
        }
        // Any other update (device name, agreement no, prices, branch
        // corrected in Order Tracking) — keep the not-yet-ordered entry's
        // display fields in sync too, so an edit there shows up here
        // immediately instead of only on next page load. Refetches the
        // clean mapped order rather than picking through the raw payload,
        // since some fields live in direct columns and others in a JSONB
        // blob at the database level.
        const hasUnorderedEntry=listRef.current.some(e=>String(e.orderId)===String(orderId)&&!e.ordered);
        if(!hasUnorderedEntry)return;
        const fresh=await getOrder(orderId);
        if(!fresh)return;
        const applyFresh=e=>String(e.orderId)!==String(orderId)||e.ordered?e:{
          ...e,
          deviceName:fresh.phoneModel||e.deviceName,
          agreementNo:fresh.agreementNumber||e.agreementNo,
          financePrice:fresh.financePrice||0,
          retailPrice:fresh.retailPrice||0,
          orderType:fresh.orderType||e.orderType,
          branch:fresh.branch||e.branch,
          editLog:fresh.editLog||e.editLog||[],
        };
        setList(prev=>prev.map(applyFresh));
        const updated=(await loadData(PO_KEY))||[];
        await saveData(PO_KEY,updated.map(applyFresh));
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

  const save=async(next)=>{setList(next);await saveData(PO_KEY,next);};


  // A session key that sorts correctly across dates, so "earlier than
  // current" comparisons below are simple string comparisons.
  const sessionKey=(d,s)=>`${d}_${s}`;
  // Recomputed fresh on every render (not memoized) — this needs to track
  // real time as it passes while the page stays open. A page loaded before
  // 8:30am and left open past noon must correctly stop treating Session 1
  // as "current" once its window has actually closed, not keep it frozen
  // at whatever was true the moment the page first loaded.
  const currentSession=getSessionForTimestamp(new Date());
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
  // A softer bar than plain "not ordered" — the late alert only fires for
  // orders purchaser hasn't even acknowledged with a remark yet. Clicking
  // Ordered still isn't required to clear the alert, just some note on
  // progress/status, so it doesn't nag someone who's actively working an
  // order but hasn't finished confirming it.
  const unfilledCount=visible.filter(e=>!e.ordered&&!e.remark?.trim()).length;
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

  const confirmOrdered=async({orderDate,supplierName,actualPrice,poNumber,purchaserName,proofFile})=>{
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
    const updatedList=list.map(e=>e.id!==entry.id?e:{...e,ordered:true,orderedAt:new Date().toISOString(),orderDate,supplierName,actualPrice:parseFloat(actualPrice)||0,poNumber,purchaserName});
    await save(updatedList);
    setOrderedFor(null);
  };

  const getBestQuote=(entry)=>{
    const quotes=SUPPLIERS.map(s=>({label:s.label,price:parseFloat(entry.prices?.[s.key])||0})).filter(q=>q.price>0);
    if(!quotes.length)return"No quotes yet";
    const cheapest=quotes.reduce((a,b)=>a.price<b.price?a:b);
    return`${cheapest.label} — ${fRM(cheapest.price)}`;
  };

  const savePhoto=async()=>{
    setSavingPhoto(true);
    try{
      // Force a fresh check right now, at the exact moment of generating
      // the photo — don't trust whatever's already sitting in this page's
      // memory, no matter how long it's been open or whether the live
      // subscription has been connected the whole time. This is what
      // guarantees the photo can never show a cancelled/deleted order,
      // even on a page that's been left open for hours or days.
      await runCatchUp();
      const freshList=(await loadData(PO_KEY))||[];
      const freshOwnSession=freshList.filter(e=>e.sessionDate===viewDate&&e.session===viewSession);
      const freshCurrentSession=getSessionForTimestamp(new Date());
      const freshIsCurrentView=viewDate===freshCurrentSession.date&&viewSession===freshCurrentSession.session;
      const freshCarried=freshIsCurrentView?freshList.filter(e=>!e.ordered&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession)):[];
      const freshVisible=[...freshCarried,...freshOwnSession];
      if(!freshVisible.length){alert("Nothing in this session to save yet.");setSavingPhoto(false);return;}
      if(!window.html2canvas){
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=res;s.onerror=rej;document.head.appendChild(s);
        });
      }
      const orderedRows=freshVisible.filter(e=>e.ordered);
      const pendingRows=freshVisible.filter(e=>!e.ordered);
      const now=new Date();
      const stamp=`${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

      // Built entirely by hand rather than capturing the live editable
      // table — a purpose-made, narrow, single-column summary that fits
      // cleanly in one photo regardless of how many supplier columns the
      // live table has, and reads correctly since there are no <input>
      // elements involved (html2canvas doesn't reliably render those).
      const root=document.createElement("div");
      root.style.cssText="position:fixed;left:-9999px;top:0;width:720px;font-family:Inter,sans-serif;background:#fff;border-radius:14px;overflow:hidden;";

      const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

      const headerHtml=`
        <div style="padding:18px 20px;background:linear-gradient(135deg,${C.navy},${C.navyLight});">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.12em;">EMAX Network — Purchase Order Summary</div>
            ${freshIsCurrentView?'<span style="font-size:8.5px;font-weight:800;color:#0A1628;background:#4ADE80;border-radius:10px;padding:1px 8px;text-transform:uppercase;letter-spacing:.06em;">Live</span>':""}
          </div>
          <div style="font-size:17px;font-weight:800;color:#fff;">${fDate(viewDate)} · Session ${viewSession} ${freshIsCurrentView?"(Active)":"(Closed)"}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;">${orderedRows.length} ordered · ${pendingRows.length} still pending · snapshot taken ${stamp}</div>
        </div>
        ${freshIsCurrentView?`<div style="padding:8px 20px;background:#EFF6FF;border-bottom:1px solid ${C.border};font-size:10.5px;color:${C.blueBright};">This session is still open — prices and status may change after this snapshot. Due by ${viewSession===1?"12:00pm":"5:30pm"} today.</div>`:""}
      `;

      const secHdr=label=>`<div style="padding:10px 16px;background:linear-gradient(135deg,${C.navy},${C.navyLight});font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:.07em;">${label}</div>`;

      const orderedHtml=orderedRows.map((o,i)=>{
        const ownDeadline=getSessionDeadline(o.sessionDate,o.session);
        const wasLate=o.orderedAt&&new Date(o.orderedAt)>ownDeadline;
        return`
        <div style="padding:10px 20px;${i<orderedRows.length-1?`border-bottom:1px solid ${C.border};`:""}">
          <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:3px;">
            <div style="font-size:12.5px;font-weight:700;color:${C.text};">${escapeHtml(o.deviceName)}${wasLate?`<span style="font-size:8.5px;font-weight:700;color:#B45309;background:#FEF3C7;border-radius:10px;padding:1px 7px;margin-left:6px;">Completed Late</span>`:""}</div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="font-size:12px;font-weight:800;color:#15803D;">${fRM(o.actualPrice)}</div>
              <div style="font-size:8.5px;color:${C.textLight};text-transform:uppercase;letter-spacing:.04em;">Purchase Price</div>
            </div>
          </div>
          <div style="font-size:10.5px;color:${C.textLight};">${escapeHtml(branchMeta?.[o.branch]?.name||o.branch)} · ${escapeHtml(o.agreementNo||"—")}</div>
          <div style="font-size:10.5px;color:${C.textMid};margin-top:2px;">Supplier: <strong style="color:${C.text};">${escapeHtml(o.supplierName)}</strong> · PO ${escapeHtml(o.poNumber)} · ${escapeHtml(o.purchaserName)}</div>
        </div>
      `;}).join("");

      const pendingHtml=pendingRows.map((p,i)=>{
        const isOverdue=freshIsCurrentView&&sessionKey(p.sessionDate,p.session)<sessionKey(viewDate,viewSession);
        return`
        <div style="padding:10px 20px;background:#FFFBEB;${i<pendingRows.length-1?"border-bottom:1px solid #FDE68A;":""}">
          <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:3px;">
            <div style="font-size:12.5px;font-weight:700;color:${C.text};">${escapeHtml(p.deviceName)}${isOverdue?`<span style="font-size:8.5px;font-weight:700;color:#B45309;background:#FEF3C7;border-radius:10px;padding:1px 7px;margin-left:6px;">Overdue — since ${fDate(p.sessionDate)} Session ${p.session}</span>`:""}</div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="font-size:11px;font-weight:700;color:#B45309;">${fRM(getDisplayPrice(p))}</div>
              <div style="font-size:8.5px;color:${C.textLight};text-transform:uppercase;letter-spacing:.04em;">${p.orderType==="cash"?"Retail Price":"Finance Price"}</div>
            </div>
          </div>
          <div style="font-size:10.5px;color:${C.textLight};">${escapeHtml(branchMeta?.[p.branch]?.name||p.branch)} · ${escapeHtml(p.agreementNo||"—")}</div>
          <div style="font-size:10.5px;color:${C.textMid};margin-top:2px;">Best quote so far: <strong style="color:${C.text};">${getBestQuote(p)}</strong>${p.remark?" · "+escapeHtml(p.remark):""}</div>
        </div>
      `;}).join("");

      root.innerHTML=headerHtml
        +(orderedRows.length?secHdr(`Ordered (${orderedRows.length})`)+orderedHtml:"")
        +(pendingRows.length?secHdr(`Still Pending (${pendingRows.length})`)+pendingHtml:"");

      document.body.appendChild(root);
      const canvas=await window.html2canvas(root,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
      document.body.removeChild(root);

      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/png");
      a.download=`Purchase_Order_Summary_${viewDate}_Session${viewSession}.png`;
      a.click();
    }catch(e){alert("Save as Photo failed: "+e.message);}
    setSavingPhoto(false);
  };

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {!isViewingCurrentSession&&<div style={{...card,borderLeft:"3px solid #8A96A8",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:12,color:C.textMid}}>You're viewing a closed session — it's read-only from here. Anything still pending from this session has already carried forward into the current session, where it can be actioned.</div>
    </div>}
    {isPastDeadline&&unfilledCount>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Late Submission</div>
      <div style={{fontSize:12,color:"#DC2626"}}>Session {viewSession} ({fDate(viewDate)}) was due by {viewSession===1?"12:00pm":"5:30pm"} — {unfilledCount} order{unfilledCount>1?"s":""} still pending unfilled, {hoursLate.toFixed(1)} hour{hoursLate>=2?"s":""} late.</div>
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
      <GBtn onClick={savePhoto} disabled={savingPhoto||(isViewingCurrentSession&&unfilledCount>0)} title={isViewingCurrentSession&&unfilledCount>0?`Fill in a remark or click Ordered for every order first — ${unfilledCount} still untouched`:undefined}>{savingPhoto?"Saving…":"Save as Photo"}</GBtn>
    </div>
    {isViewingCurrentSession&&unfilledCount>0&&<div style={{fontSize:11,color:C.textLight,marginTop:-8,marginBottom:14}}>Save as Photo is locked until every order has a remark or is marked Ordered — {unfilledCount} still untouched.</div>}

    <div style={{...card}}>
      <SecHdr>Purchase Order — {fDate(viewDate)} · Session {viewSession} ({pendingCount} pending{carriedForwardCount>0?`, ${carriedForwardCount} overdue`:""})</SecHdr>
      <div style={{overflowX:"auto"}}>
        {visible.length===0
          ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No orders in this session.</div>
          :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1100}}>
            <thead><tr style={{background:C.surface}}>
              {["Device Name","Agreement No.","Finance Price / Retail Price","Branch",...SUPPLIERS.map(s=>s.label),"Remark",""].map(h=>
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
                  {e.editLog?.length>0&&<>
                    <button onClick={()=>setExpandedLog(p=>({...p,[e.id]:!p[e.id]}))} style={{display:"block",marginTop:3,fontSize:9,fontWeight:700,color:C.blueBright,background:"none",border:"none",cursor:"pointer",padding:0}}>
                      {expandedLog[e.id]?"Hide":"Show"} Edit Log ({e.editLog.length})
                    </button>
                    {expandedLog[e.id]&&<div style={{marginTop:4,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 8px",maxWidth:260}}>
                      {e.editLog.map((log,li)=><div key={li} style={{fontSize:9.5,color:C.textMid,marginBottom:li<e.editLog.length-1?4:0,whiteSpace:"normal"}}>
                        <span style={{color:C.textLight}}>{fDate(log.date)} {log.time} by {log.by}:</span> {log.changes}
                      </div>)}
                    </div>}
                  </>}
                </td>
                <td style={{padding:"8px 10px",color:C.textMid}}>{e.agreementNo||"—"}</td>
                <td style={{padding:"8px 10px",color:C.textMid,whiteSpace:"nowrap"}}>{fRM(getDisplayPrice(e))}</td>
                <td style={{padding:"8px 10px",color:C.textMid,whiteSpace:"nowrap"}}>{branchMeta?.[e.branch]?.name||e.branch}</td>
                {SUPPLIERS.map(s=><td key={s.key} style={{padding:"4px 6px"}}>
                  <input type="number" value={e.prices?.[s.key]||""} onChange={ev=>updatePrice(e.id,s.key,ev.target.value)} placeholder="0.00" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:80,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
                </td>)}
                <td style={{padding:"4px 6px"}}>
                  <input value={e.remark||""} onChange={ev=>updateRemark(e.id,ev.target.value)} placeholder="Remark…" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:220,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
                </td>
                <td style={{padding:"8px 10px"}}>
                  {e.ordered
                    ?<div>
                        <span style={{fontSize:10,fontWeight:700,color:"#15803D",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:20,padding:"3px 9px",whiteSpace:"nowrap"}}>Ordered</span>
                        {e.orderedAt&&new Date(e.orderedAt)>getSessionDeadline(e.sessionDate,e.session)&&<div style={{fontSize:9,fontWeight:700,color:"#B45309",marginTop:3}}>Completed Late</div>}
                      </div>
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
