/**
 * Daily Purchase Order — every CCM/Financing order with "Stock Request"
 * chosen shows up here automatically. Purchaser compares supplier prices,
 * picks one, and clicks "Ordered" — which both marks this entry done AND
 * writes the same details straight into the underlying order's own Step 2
 * ("Confirm: Ordered") in Order Tracking, so it doesn't need to be
 * re-entered there separately.
 *
 * IMPORTANT — data model: this page does NOT keep its own persisted list of
 * "which orders belong here". That was the earlier design, and it was the
 * source of a recurring, hard-to-kill bug — a cancelled or deleted order
 * would keep showing up because the saved copy never reliably heard about
 * the change through every possible path (missed realtime events,
 * backgrounded tabs, stale page sessions). Instead, the list of WHICH
 * orders appear is now always computed FRESH, directly from the real
 * orders table, every single time this page loads or refreshes — filtering
 * out anything cancelled at that exact moment. A cancelled order is
 * therefore structurally incapable of appearing here, since it's never
 * even a candidate. Only the extra, purchase-specific fields that don't
 * exist on the order itself (supplier price quotes, remark, ordered
 * status, actual purchase price, which session it was first seen in) are
 * kept in a small separate store, keyed by order id, purely for
 * supplementary display — never as the source of truth for whether
 * something shows at all.
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
import {listOrders,getOrder,getOrderHistory,reconcile,uploadOrderFile} from "./storage/ordersApi.js";

const SUPP_KEY="emax_v5_purchase_order_supp"; // supplementary data only, keyed by orderId

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
const sessionKey=(d,s)=>`${d}_${s}`;

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

// The one and only place that decides which orders appear on this page,
// and what their supplementary purchase-specific fields are. Called fresh
// every time — on load, on any relevant realtime event, when the tab
// regains focus, and right before generating a photo. Because it always
// starts from a live query of the real orders table, a cancelled or
// deleted order is never even a candidate — there's no separate cached
// list that could drift out of sync with reality.
async function buildLiveList(){
  const allOrders=await listOrders(null);
  const supp=(await loadData(SUPP_KEY))||{};
  // An order still at Step 1 is always relevant — it genuinely needs
  // purchasing. Once it's moved past Step 1, it only belongs here if this
  // page has already been tracking it (i.e. it has a supplementary record
  // from a previous run). Without that second condition, literally every
  // Stock Request order that ever existed — including ones that finished
  // being purchased months ago, long before this page tracked anything —
  // gets swept in on the very first load and shows up already marked
  // Ordered, which is exactly what's confusing here: a huge historical
  // backlog appearing out of nowhere, not anything that actually happened
  // through this page's own workflow.
  // One-time (well, run-whenever-needed) cleanup for contamination left
  // behind before the fix above existed. That earlier version swept every
  // Stock Request order into the supplementary store regardless of step,
  // which means a huge number of historical orders already have a
  // supplementary record sitting there — and the "already tracked" check
  // above would keep matching all of them forever otherwise, since it
  // just checks whether a record exists, not why it was created. An entry
  // with no prices entered, no remark, and never explicitly marked
  // ordered through this page's own form has no genuine purchaser
  // interaction behind it — it's leftover contamination, not real
  // tracked data — so if its order has already moved past Step 1, it
  // gets pruned here rather than being treated as legitimately tracked.
  const orderById=new Map(allOrders.map(o=>[String(o.id),o]));
  const prunedSupp={};
  let pruned=false;
  for(const[key,rec]of Object.entries(supp)){
    const ord=orderById.get(key);
    const hasNoInteraction=!rec.ordered&&!Object.keys(rec.prices||{}).length&&!rec.remark?.trim();
    if(ord&&ord.step>1&&hasNoInteraction){pruned=true;continue;}
    prunedSupp[key]=rec;
  }
  if(pruned)await saveData(SUPP_KEY,prunedSupp);
  const candidates=allOrders.filter(o=>o.stockStatus==="stock_request"&&!o.cancelled&&(o.step===1||!!prunedSupp[String(o.id)]));
  const nextSupp={...prunedSupp};
  let suppChanged=false;
  for(const o of candidates){
    const key=String(o.id);
    if(!nextSupp[key]){
      // First time this order has ever been seen here — assign its
      // session based on when it was ACTUALLY first submitted, not "now",
      // so a genuinely old order shows up correctly flagged as overdue
      // rather than looking freshly submitted.
      let ts=new Date();
      try{
        const hist=await getOrderHistory(o.id);
        const firstEntry=hist?.find(h=>h.step===1)||hist?.[0];
        if(firstEntry)ts=new Date(`${firstEntry.date}T${firstEntry.time||"09:00"}:00`);
      }catch(e){/* fall back to now if history fetch fails */}
      const{date,session}=getSessionForTimestamp(ts);
      nextSupp[key]={prices:{},remark:"",ordered:false,sessionDate:date,session,createdAt:ts.toISOString()};
      suppChanged=true;
    }
  }
  if(suppChanged)await saveData(SUPP_KEY,nextSupp);
  return candidates.map(o=>{
    const supp=nextSupp[String(o.id)]||{};
    // An order that has genuinely progressed past Step 1 (New Order
    // Request) has already been ordered, full stop — regardless of
    // whether that happened by clicking Ordered on this page, or by
    // completing Step 2 directly in Order Tracking. Inferring this from
    // the order's own step means it can never silently disagree with
    // reality just because the supplementary flag was never explicitly
    // set through this page's own button.
    const orderedByStep=o.step>=2;
    return{
      id:`po_${o.id}`,orderId:String(o.id),
      deviceName:o.phoneModel||"",agreementNo:o.agreementNumber||"",
      financePrice:o.financePrice||0,retailPrice:o.retailPrice||0,orderType:o.orderType||"ccm",
      branch:o.branch||"",editLog:o.editLog||[],
      ...supp,
      ordered:supp.ordered||orderedByStep,
      // If it was ordered via Order Tracking directly rather than this
      // page's own form, these fields live on the order itself instead of
      // in the supplementary store — fall back to them so the details
      // still show correctly either way.
      orderDate:supp.orderDate||o.orderDate,
      supplierName:supp.supplierName||o.supplierName,
      poNumber:supp.poNumber||o.poNumber,
      purchaserName:supp.purchaserName||o.purchaserName,
      orderedAt:supp.orderedAt||(orderedByStep&&!supp.ordered?new Date().toISOString():supp.orderedAt),
    };
  });
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

  const refresh=async()=>{
    const fresh=await buildLiveList();
    setList(fresh);
    return fresh;
  };

  useEffect(()=>{
    (async()=>{
      await refresh();
      setLoading(false);
    })();
  },[]);

  // Live update — any change to the orders table (cancelled, deleted,
  // device name edited, price corrected, a brand new Stock Request order
  // submitted) triggers a full fresh rebuild of the list straight from the
  // orders table. No surgical patching of specific fields — a complete
  // rebuild is simpler and structurally can't drift, since it always
  // starts from the same live query used everywhere else on this page.
  useEffect(()=>{
    const channel=supabase.channel("purchase-order-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>{refresh();})
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

  // Belt-and-suspenders on top of the live subscription — a browser tab
  // that's been backgrounded for a while can have its realtime connection
  // silently drop and miss events entirely (this happens on mobile
  // especially, where backgrounded tabs get suspended). Refreshing every
  // time this tab becomes visible again means a stale cancelled/deleted
  // order can't survive more than a glance away and back, without
  // requiring anyone to remember to manually reload the page.
  useEffect(()=>{
    const onVisible=()=>{if(document.visibilityState==="visible")refresh();};
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[]);

  // Recomputed fresh on every render (not memoized) — this needs to track
  // real time as it passes while the page stays open. A page loaded before
  // 8:30am and left open past noon must correctly stop treating Session 1
  // as "current" once its window has actually closed, not keep it frozen
  // at whatever was true the moment the page first loaded.
  const currentSession=getSessionForTimestamp(new Date());
  const isViewingCurrentSession=viewDate===currentSession.date&&viewSession===currentSession.session;

  // Which session an entry belongs to for VIEWING purposes — a pending
  // order belongs to whichever session it was originally submitted in.
  // But an ORDERED one belongs to whichever session it was actually
  // resolved in (based on when it was marked ordered), not necessarily
  // where it started — otherwise an order submitted last week and only
  // just marked ordered today would never show up in today's "Ordered"
  // section, permanently stuck showing under a session that's long closed.
  const viewSessionOf=(e)=>{
    if(!e.ordered||!e.orderedAt)return{date:e.sessionDate,session:e.session};
    return getSessionForTimestamp(new Date(e.orderedAt));
  };
  const visible=useMemo(()=>{
    const ownSession=list.filter(e=>{const s=viewSessionOf(e);return s.date===viewDate&&s.session===viewSession;});
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

  const deadline=getSessionDeadline(viewDate,viewSession);
  const now=new Date();
  const isPastDeadline=now>deadline;
  const hoursLate=isPastDeadline?((now-deadline)/3600000):0;

  const patchSupplementary=async(orderId,patch)=>{
    setList(prev=>prev.map(e=>e.orderId!==orderId?e:{...e,...patch}));
    const supp=(await loadData(SUPP_KEY))||{};
    await saveData(SUPP_KEY,{...supp,[orderId]:{...supp[orderId],...patch}});
  };
  const updatePrice=(orderId,supplierKey,val)=>{
    const entry=list.find(e=>e.orderId===orderId);
    patchSupplementary(orderId,{prices:{...entry?.prices,[supplierKey]:val}});
  };
  const updateRemark=(orderId,val)=>patchSupplementary(orderId,{remark:val});

  const getTopQuotes=(entry)=>{
    const quotes=SUPPLIERS.map(s=>({label:s.label,price:parseFloat(entry.prices?.[s.key])||0})).filter(q=>q.price>0);
    return quotes.sort((a,b)=>a.price-b.price).slice(0,3);
  };

  const confirmOrdered=async({orderDate,supplierName,actualPrice,poNumber,purchaserName,proofFile})=>{
    const entry=orderedFor;
    if(!entry)return;
    const orderRow=await getOrder(entry.orderId);
    if(!orderRow){alert("Could not find the underlying order — it may have been deleted.");setOrderedFor(null);await refresh();return;}
    const history=await getOrderHistory(entry.orderId);
    const proof=await uploadOrderFile(entry.orderId,proofFile,proofFile.name);
    const h={step:2,date:nowDate(),time:nowTime(),note:"Ordered",orderDate,supplierName,poNumber,purchaserName,files:{purchaseProof:proof}};
    const oldOrder={...orderRow,history};
    const newOrder={...orderRow,step:Math.max(orderRow.step,2),orderDate,supplierName,poNumber,purchaserName,history:[...history,h]};
    const result=await reconcile([oldOrder],[newOrder]);
    if(!result.ok){alert("Failed to update the order — please try again.");setOrderedFor(null);return;}
    await patchSupplementary(entry.orderId,{ordered:true,orderedAt:new Date().toISOString(),orderDate,supplierName,actualPrice:parseFloat(actualPrice)||0,poNumber,purchaserName});
    setOrderedFor(null);
  };

  const savePhoto=async()=>{
    setSavingPhoto(true);
    try{
      // Force a fresh rebuild right now, at the exact moment of generating
      // the photo — this is the same live query used everywhere else on
      // this page, so the photo is guaranteed to reflect true current
      // reality, never a cancelled or deleted order, regardless of how
      // long the page has been open.
      const freshList=await refresh();
      const freshOwnSession=freshList.filter(e=>{const s=viewSessionOf(e);return s.date===viewDate&&s.session===viewSession;});
      const freshCurrentSession=getSessionForTimestamp(new Date());
      const freshIsCurrentView=viewDate===freshCurrentSession.date&&viewSession===freshCurrentSession.session;
      // Anything still pending right now that was originally submitted on
      // or before the session being photographed genuinely WAS still
      // outstanding as of that session's own deadline — the photo should
      // show that honestly, not just whatever happened to be freshly
      // submitted in that exact window. This applies to any session being
      // photographed, current or past, not just the live one — a photo
      // of yesterday's Session 2 should show every order still pending as
      // of yesterday 5:30pm, including backlog carried in from even
      // earlier sessions, regardless of whether it's since moved on to
      // being tracked under today's live session instead.
      const freshCarried=freshList.filter(e=>!e.ordered&&sessionKey(e.sessionDate,e.session)<sessionKey(viewDate,viewSession));
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
        return`
        <div style="padding:10px 20px;${i<orderedRows.length-1?`border-bottom:1px solid ${C.border};`:""}">
          <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:3px;">
            <div style="font-size:12.5px;font-weight:700;color:${C.text};">${escapeHtml(o.deviceName)}</div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="font-size:15px;font-weight:800;color:#15803D;">${fRM(o.actualPrice)}</div>
              <div style="font-size:8.5px;color:${C.textLight};text-transform:uppercase;letter-spacing:.04em;">Purchase Price</div>
            </div>
          </div>
          <div style="font-size:10.5px;color:${C.textLight};">${escapeHtml(branchMeta?.[o.branch]?.name||o.branch)} · ${escapeHtml(o.agreementNo||"—")}</div>
          <div style="font-size:10.5px;color:${C.textMid};margin-top:2px;">Supplier: <strong style="color:${C.text};">${escapeHtml(o.supplierName)}</strong> · PO ${escapeHtml(o.poNumber)} · ${escapeHtml(o.purchaserName)}</div>
        </div>
      `;}).join("");

      const pendingHtml=pendingRows.map((p,i)=>{
        const isOverdue=sessionKey(p.sessionDate,p.session)<sessionKey(viewDate,viewSession);
        const topQuotes=getTopQuotes(p);
        const quotesHtml=topQuotes.length
          ?topQuotes.map((q,qi)=>`<span style="display:inline-block;background:#fff;border:1px solid ${C.border};border-radius:6px;padding:3px 8px;margin-right:5px;margin-top:3px;font-size:10px;font-weight:700;color:${C.text};white-space:nowrap;">${qi+1}. ${escapeHtml(q.label)} — ${fRM(q.price)}</span>`).join("")
          :`<span style="font-size:10.5px;color:${C.textLight};font-style:italic;">No quotes yet</span>`;
        return`
        <div style="padding:10px 20px;background:#FFFBEB;${i<pendingRows.length-1?"border-bottom:1px solid #FDE68A;":""}">
          <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:3px;">
            <div style="font-size:12.5px;font-weight:700;color:${C.text};">${escapeHtml(p.deviceName)}${isOverdue?`<span style="font-size:8.5px;font-weight:700;color:#B45309;background:#FEF3C7;border-radius:10px;padding:1px 7px;margin-left:6px;">Overdue — since ${fDate(p.sessionDate)} Session ${p.session}</span>`:""}</div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="font-size:15px;font-weight:800;color:#B45309;">${fRM(getDisplayPrice(p))}</div>
              <div style="font-size:8.5px;color:${C.textLight};text-transform:uppercase;letter-spacing:.04em;">${p.orderType==="cash"?"Retail Price":"Finance Price"}</div>
            </div>
          </div>
          <div style="font-size:10.5px;color:${C.textLight};margin-bottom:5px;">${escapeHtml(branchMeta?.[p.branch]?.name||p.branch)} · ${escapeHtml(p.agreementNo||"—")}</div>
          <div style="margin-bottom:${p.remark?4:0}px;">${quotesHtml}</div>
          ${p.remark?`<div style="font-size:10.5px;color:${C.textMid};">Remark: ${escapeHtml(p.remark)}</div>`:""}
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
      <GBtn onClick={savePhoto} disabled={savingPhoto||unfilledCount>0} title={unfilledCount>0?`Fill in a remark or click Ordered for every order first — ${unfilledCount} still untouched`:undefined}>{savingPhoto?"Saving…":"Save as Photo"}</GBtn>
    </div>
    {unfilledCount>0&&<div style={{fontSize:11,color:C.textLight,marginTop:-8,marginBottom:14}}>Save as Photo is locked until every order has a remark or is marked Ordered — {unfilledCount} still untouched.</div>}

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
                  <input type="number" value={e.prices?.[s.key]||""} onChange={ev=>updatePrice(e.orderId,s.key,ev.target.value)} placeholder="0.00" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:80,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
                </td>)}
                <td style={{padding:"4px 6px"}}>
                  <input value={e.remark||""} onChange={ev=>updateRemark(e.orderId,ev.target.value)} placeholder="Remark…" disabled={e.ordered||!isViewingCurrentSession}
                    style={{width:220,padding:"5px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:"Inter,sans-serif"}}/>
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
