import {useState,useEffect,useRef} from "react";
import {listCustomers,getPaymentsForCustomers,saveCustomer} from "./storage/rtoApi.js";
import {formatMYPhone} from "./OrderTab.jsx";

const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const MNTHS_SHORT=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function genSchedule(customer){
  const{autoDebitMonth,autoDebitYear,tenure,monthlyInstallment}=customer;
  if(!autoDebitMonth||!autoDebitYear||!tenure||!monthlyInstallment)return[];
  const schedule=[];
  let m=parseInt(autoDebitMonth),y=parseInt(autoDebitYear);
  for(let i=0;i<parseInt(tenure);i++){
    const key=`${y}-${String(m).padStart(2,"0")}`;
    schedule.push({key,label:`${MNTHS_SHORT[m-1]} ${y}`,amount:parseFloat(monthlyInstallment)||0});
    m++;if(m>12){m=1;y++;}
  }
  return schedule;
}

// Effective amount actually received for one schedule entry: the full
// amount if that month is marked paid, otherwise whatever's been recorded
// via partial payments so far (0 if none). Mirrors RTOTab.jsx's helper.
function amountReceivedFor(s,payData){
  if(payData?.paid)return payData?.amount||s.amount;
  return(payData?.partialPayments||[]).reduce((sum,p)=>sum+(parseFloat(p.amount)||0),0);
}

/* ── Shared design tokens — identical to the admin dashboard's RTO/Order
   pages, so the Boss viewer's Portfolio Summary renders the same as the
   dashboard's own "View Portfolio Summary". ───────────────────────────── */
const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",yellow:"#FFD500",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const lbl={fontSize:10,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4};
const Ic={
  download:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12"y1="15"x2="12"y2="3"/></svg>,
  card:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="1"y="4"width="22"height="16"rx="2"/><line x1="1"y1="10"x2="23"y2="10"/></svg>,
  alertCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>,
  users:<svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9"cy="7"r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  checkCircle:<svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  wallet:<svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>,
  trendUp:<svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  coins:<svg width="15"height="15"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="8"cy="8"r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>,
  copy:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="9"y="9"width="13"height="13"rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
};
function SecHdr({icon,children,right}){
  return<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
    <div style={{display:"flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:"rgba(255,255,255,.85)"}}>{icon}</span>}{children}</div>
    {right&&<div>{right}</div>}
  </div>;
}
function PBtn({children,onClick,disabled,style={}}){
  return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:C.white,border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":`0 2px 8px rgba(27,63,114,.35)`,transition:"all .15s",...style}}>{children}</button>;
}
function StatTile({label,value,color,icon,accent}){
  return<div style={{...card,overflow:"visible",padding:"13px 15px",display:"flex",alignItems:"center",gap:11,borderTop:`3px solid ${accent||C.border}`}}>
    <div style={{width:32,height:32,borderRadius:9,background:accent?accent+"1A":C.surface,color:accent||C.textMid,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</div>
    <div style={{minWidth:0}}>
      <div style={lbl}>{label}</div>
      <div style={{fontSize:13.5,fontWeight:800,color:color||C.text,whiteSpace:"nowrap"}}>{value}</div>
    </div>
  </div>;
}

// RTO Monthly Payment Reminder To-Do — Boon Theng, emaxhr, and Sophia
// only. Standalone so it can render on its own (the consolidated "To Do
// List" page in App.jsx) as well as embedded in the full Portfolio
// Summary below. Every customer who's late shows up here EVERY day until
// they've caught up (there's no permanent dismissal the way the pickup
// reminder has) — "Mark as Reminded" only tracks that today's reminder
// went out, it doesn't remove them from the list.
//
// The reminder tier is based on how many months behind the customer
// actually is, not how many times they've been reminded:
//   Tier 1 — this month's payment is late (past the 15th, unpaid) but no
//            FULL month has been missed yet. Repeats daily at tier 1
//            until either paid, or the calendar rolls into next month
//            with this one still unpaid (which promotes it into
//            "overdue" below and becomes tier 2).
//   Tier 2 — exactly one full month overdue.
//   Tier 3 — two full months overdue.
//   Tier 4 — three or more full months overdue (stays at 4 for anything
//            beyond — there's no tier 5).
export function RTOLatePaymentTodoList({customers,branchMeta,email}){
  const [remindingId,setRemindingId]=useState(null);
  const [copiedId,setCopiedId]=useState(null);
  const [localCustomers,setLocalCustomers]=useState(customers);
  useEffect(()=>{setLocalCustomers(customers);},[customers]);
  const now=new Date();
  const currentKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const analytics=localCustomers.map(c=>{
    const schedule=genSchedule(c);
    const payments=c.payments||{};
    const overdue=schedule.filter(s=>s.key<currentKey&&!payments[s.key]?.paid);
    return{...c,schedule,payments,overdue};
  });
  const canSeeLatePaymentTodo=["boontheng2004@gmail.com","emaxhr@gmail.com","sophiawsc9395@gmail.com"].includes((email||"").toLowerCase());
  const isoToday=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const remindedToday=(c)=>(c.latePaymentReminders||[]).some(r=>r.date===isoToday);
  const currentMonthEntry=(c)=>c.schedule.find(s=>s.key===currentKey);
  const currentMonthLate=(c)=>{
    const entry=currentMonthEntry(c);
    return!!entry&&now.getDate()>15&&!c.payments?.[currentKey]?.paid;
  };
  const lateTier=(c)=>{
    if(c.overdue.length>=3)return 4;
    if(c.overdue.length===2)return 3;
    if(c.overdue.length===1)return 2;
    return 1;
  };
  const latePaymentCustomers=analytics.filter(c=>c.overdue.length>0||currentMonthLate(c)).sort((a,b)=>lateTier(b)-lateTier(a));
  const buildLatePaymentMessage=(c)=>{
    const tier=lateTier(c);
    const entry=currentMonthEntry(c);
    // Tier 1 customers have nothing in c.overdue yet (that only covers
    // fully-past months) — the amount owed is this month's own entry.
    const monthsList=tier===1?entry?.label:c.overdue.map(s=>s.label).join(", ");
    const totalOverdue=tier===1
      ?(entry?entry.amount-amountReceivedFor(entry,c.payments?.[currentKey]):0)
      :c.overdue.reduce((sum,s)=>sum+(s.amount-amountReceivedFor(s,c.payments?.[s.key])),0);
    const bankLine="EMAX NETWORK SDN BHD\nPublic Bank: 3217607733";
    if(tier===1)return`Hi ${c.name||"there"} 👋\n\nThis is a friendly reminder from EMAX NETWORK that your Rent-to-Own monthly installment of RM${totalOverdue.toFixed(2)} (${monthsList}) is now due.\n\nKindly make payment via bank transfer to:\n${bankLine}\n\nPlease send us the payment slip once done. Thank you!`;
    if(tier===2)return`Hi ${c.name||"there"},\n\nThis is our *SECOND reminder* regarding your overdue Rent-to-Own payment of RM${totalOverdue.toFixed(2)} (${monthsList}).\n\nPlease settle this as soon as possible via bank transfer to:\n${bankLine}\n\nKindly send proof of payment once transferred. We appreciate your prompt attention to this matter.`;
    if(tier===3)return`Hi ${c.name||"there"},\n\nThis is our *THIRD reminder* — your Rent-to-Own payment of RM${totalOverdue.toFixed(2)} (${monthsList}) remains unpaid.\n\nPlease be advised that continued non-payment may affect your credit score with Bank Negara Malaysia.\n\nKindly make payment immediately via bank transfer to:\n${bankLine}\n\nPlease send proof of payment once done.`;
    return`Hi ${c.name||"there"},\n\n*This is an URGENT reminder* — your Rent-to-Own payment of RM${totalOverdue.toFixed(2)} (${monthsList}) remains unpaid despite previous reminders.\n\nPlease be advised that continued non-payment may affect your credit score with Bank Negara Malaysia, and EMAX NETWORK reserves the right to repossess the device and lodge a police report if payment is not received.\n\nKindly make payment immediately via bank transfer to:\n${bankLine}\n\nPlease send proof of payment once done to avoid further action.`;
  };
  const copyText=(text)=>{
    const ta=document.createElement("textarea");
    ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
    document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy");}catch(e){}
    document.body.removeChild(ta);
  };
  const markReminded=async(c)=>{
    setRemindingId(c.id);
    const nowD=new Date();
    const timeStr=`${String(nowD.getHours()).padStart(2,"0")}:${String(nowD.getMinutes()).padStart(2,"0")}`;
    const nextLog=[...(c.latePaymentReminders||[]),{date:isoToday,time:timeStr}];
    const result=await saveCustomer({...c,latePaymentReminders:nextLog});
    if(result.ok)setLocalCustomers(p=>p.map(x=>x.id===c.id?{...x,latePaymentReminders:nextLog}:x));
    else alert("This didn't save — please check your connection and try again.");
    setRemindingId(null);
  };
  if(!canSeeLatePaymentTodo||!latePaymentCustomers.length)return null;
  return<div style={{...card}}>
    <SecHdr icon={Ic.alertCircle}>RTO Monthly Payment Reminder To-Do — {latePaymentCustomers.length} customer{latePaymentCustomers.length>1?"s":""}</SecHdr>
    <div style={{padding:14,display:"flex",flexDirection:"column",gap:12}}>
      {latePaymentCustomers.map(c=>{
        const tier=lateTier(c);
        const doneToday=remindedToday(c);
        const msg=buildLatePaymentMessage(c);
        const reminderLog=c.latePaymentReminders||[];
        const entry=currentMonthEntry(c);
        const monthsList=tier===1?entry?.label:c.overdue.map(s=>s.label).join(", ");
        const totalOverdue=tier===1
          ?(entry?entry.amount-amountReceivedFor(entry,c.payments?.[currentKey]):0)
          :c.overdue.reduce((sum,s)=>sum+(s.amount-amountReceivedFor(s,c.payments?.[s.key])),0);
        const phone=formatMYPhone(c.contactNumber);
        const tierColor=tier>=4?"#DC2626":tier===3?"#DC2626":tier===2?"#B45309":C.textLight;
        const tierLabel=["1st (due this month)","2nd (1 month overdue)","3rd (2 months overdue)","4th (3+ months overdue)"][tier-1];
        const emailSubject=`RTO Payment Reminder (${["1st","2nd","3rd","4th"][tier-1]}) — ${c.name||"Customer"} — EMAX NETWORK`;
        return<div key={c.id} style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:C.navy}}>{c.name} <span style={{fontWeight:400,color:C.textLight,fontSize:11}}>· {branchMeta?.[c.branch]?.name||c.branch}</span></div>
              <div style={{fontSize:11,color:C.textMid,marginTop:2}}>{tier===1?"Due":"Overdue"}: {monthsList} — {fRM(totalOverdue)}</div>
            </div>
            <div style={{fontSize:10,fontWeight:700,color:tierColor,whiteSpace:"nowrap"}}>{tierLabel}</div>
          </div>
          {reminderLog.length>0&&<div style={{padding:"8px 14px",background:C.surface,borderBottom:`1px solid ${C.border}`,fontSize:10.5,color:C.textLight}}>
            Reminder log: {reminderLog.map((r,i)=>`${r.date}${r.time?` ${r.time}`:""}`).join(" · ")}
          </div>}
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div>
              <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:700}}>Customer Phone</div>
              <div style={{fontSize:13,color:C.navy,fontWeight:600,marginTop:2}}>{phone||"—"}</div>
            </div>
            {phone&&<button title="Copy phone number" onClick={()=>{copyText(phone);setCopiedId(`p${c.id}`);setTimeout(()=>setCopiedId(p=>p===`p${c.id}`?null:p),1400);}} style={{border:`1px solid ${C.border}`,background:"#fff",color:C.navy,width:32,height:32,minWidth:32,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>{copiedId===`p${c.id}`?Ic.checkCircle:Ic.copy}</button>}
          </div>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:700}}>Customer Email</div>
              <div style={{fontSize:13,color:C.navy,fontWeight:600,marginTop:2,wordBreak:"break-all"}}>{c.email||"—"}</div>
              {/* In case they've blocked WhatsApp — same reminder, sent by email instead, with a subject line that's identifiable at a glance. */}
              {c.email&&<div style={{fontSize:10,color:C.textLight,marginTop:2}}>Subject: {emailSubject}</div>}
            </div>
            {c.email&&<div style={{display:"flex",gap:6,flexShrink:0}}>
              <button title="Copy email address" onClick={()=>{copyText(c.email);setCopiedId(`e${c.id}`);setTimeout(()=>setCopiedId(p=>p===`e${c.id}`?null:p),1400);}} style={{border:`1px solid ${C.border}`,background:"#fff",color:C.navy,width:32,height:32,minWidth:32,borderRadius:7,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{copiedId===`e${c.id}`?Ic.checkCircle:Ic.copy}</button>
              <button title="Copy email subject" onClick={()=>{copyText(emailSubject);setCopiedId(`s${c.id}`);setTimeout(()=>setCopiedId(p=>p===`s${c.id}`?null:p),1400);}} style={{border:`1px solid ${C.border}`,background:"#fff",color:C.navy,fontSize:10,fontWeight:600,padding:"0 8px",height:32,borderRadius:7,cursor:"pointer",whiteSpace:"nowrap"}}>{copiedId===`s${c.id}`?"Copied!":"Copy Subject"}</button>
            </div>}
          </div>
          <div style={{padding:"10px 14px",background:C.surface}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:700}}>{["1st","2nd","3rd","4th"][tier-1]} Reminder Message</div>
              <button onClick={()=>{copyText(msg);setCopiedId(`m${c.id}`);setTimeout(()=>setCopiedId(p=>p===`m${c.id}`?null:p),1400);}} style={{border:"none",background:C.navy,color:"#fff",fontSize:11,fontWeight:600,padding:"6px 10px",borderRadius:7,cursor:"pointer"}}>{copiedId===`m${c.id}`?"Copied!":"Copy Message"}</button>
            </div>
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:11.5,color:C.textMid,whiteSpace:"pre-wrap",lineHeight:1.6}}>{msg}</div>
          </div>
          <div style={{padding:"10px 14px",textAlign:"right"}}>
            {doneToday
              ?<span style={{fontSize:11,fontWeight:700,color:"#15803D"}}>{Ic.checkCircle} Reminded today</span>
              :<PBtn onClick={()=>markReminded(c)} disabled={remindingId===c.id} style={{fontSize:11,padding:"7px 14px"}}>{remindingId===c.id?"Saving…":"Mark as Reminded"}</PBtn>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

export function RTOSummaryInner({customers,branchMeta,email}){
  const summaryRef=useRef(null);
  const now=new Date();
  const currentKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const nextMonthDate=new Date(now.getFullYear(),now.getMonth()+1,1);
  const nextMonthKey=`${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth()+1).padStart(2,"0")}`;
  const nextMonthLabel=`${MONTHS[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`;

  const analytics=customers.map(c=>{
    const schedule=genSchedule(c);
    const payments=c.payments||{};
    const totalContract=(parseInt(c.tenure)||0)*(parseFloat(c.monthlyInstallment)||0);
    const totalReceived=schedule.reduce((sum,s)=>sum+amountReceivedFor(s,payments[s.key]),0);
    const outstanding=totalContract-totalReceived;
    const cost=parseFloat(c.cost)||0;
    const pl=-cost+totalReceived;
    const financePrice=parseFloat(c.financePrice)||0;
    const branchProfit=financePrice-cost;
    const paidCount=schedule.filter(s=>payments[s.key]?.paid).length;
    const overdue=schedule.filter(s=>s.key<currentKey&&!payments[s.key]?.paid);
    const currentDue=schedule.find(s=>s.key===currentKey&&!payments[s.key]?.paid);
    const upcoming=schedule.filter(s=>s.key>currentKey&&!payments[s.key]?.paid);
    return{...c,schedule,totalContract,totalReceived,outstanding,cost,pl,branchProfit,paidCount,overdue,currentDue,upcoming,isComplete:outstanding<=0};
  });

  const totals={
    customers:analytics.length,
    totalContract:analytics.reduce((s,c)=>s+c.totalContract,0),
    totalCost:analytics.reduce((s,c)=>s+c.cost,0),
    totalReceived:analytics.reduce((s,c)=>s+c.totalReceived,0),
    totalOutstanding:analytics.reduce((s,c)=>s+c.outstanding,0),
    totalPL:analytics.reduce((s,c)=>s+c.pl,0),
    overdueCount:analytics.filter(c=>c.overdue.length>0).length,
    completeCount:analytics.filter(c=>c.isComplete).length,
    // Next month's expected collection — each customer's scheduled
    // installment for next month specifically, summed across everyone who
    // actually has one due then (i.e. still within their tenure at that
    // point) AND hasn't already paid it in full early. Any partial payment
    // already received toward next month is subtracted, so this reflects
    // what's genuinely still outstanding, not the full scheduled amount.
    nextMonthEC:analytics.reduce((s,c)=>{
      const sched=c.schedule.find(x=>x.key===nextMonthKey);
      if(!sched)return s;
      const pay=c.payments?.[nextMonthKey];
      if(pay?.paid)return s;
      const already=amountReceivedFor(sched,pay);
      return s+Math.max(0,sched.amount-already);
    },0),
  };

  const overdueCustomers=analytics.filter(c=>c.overdue.length>0).sort((a,b)=>b.overdue.length-a.overdue.length);
  // Total overdue outstanding grouped by month, across every overdue
  // customer - a different cut of the same Overdue table above (that one
  // groups by customer, this groups by which month is owed).
  const overdueByMonth=(()=>{
    const groups={};
    overdueCustomers.forEach(c=>{
      c.overdue.forEach(s=>{
        const outstanding=s.amount-amountReceivedFor(s,c.payments?.[s.key]);
        if(!groups[s.key])groups[s.key]={key:s.key,label:s.label,total:0,customerCount:0};
        groups[s.key].total+=outstanding;
        groups[s.key].customerCount+=1;
      });
    });
    return Object.values(groups).sort((a,b)=>a.key.localeCompare(b.key));
  })();

  const downloadPhoto=async()=>{
    const el=summaryRef.current;if(!el)return;
    try{
      if(!window.html2canvas){
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=res;s.onerror=rej;
          document.head.appendChild(s);
        });
      }
      const canvas=await window.html2canvas(el,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/png");
      a.download=`RTO_Summary_${now.toISOString().split("T")[0]}.png`;
      a.click();
    }catch(e){alert("Download failed: "+e.message);}
  };

  const today=`${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;

  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:800,color:C.navy}}>RTO Portfolio Summary</div>
          <div style={{fontSize:11,color:C.textLight,marginTop:2}}>As at {today} · {totals.customers} customers</div>
        </div>
        <PBtn onClick={downloadPhoto}>{Ic.download} Download as Photo</PBtn>
      </div>

      <div ref={summaryRef} style={{...card}}>
        <style>{`.rtoRow:hover{background:#EEF3FA !important}`}</style>
        <SecHdr icon={Ic.card}>
          Portfolio Summary — As at {today}
        </SecHdr>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,padding:14,background:C.surface,borderBottom:`1px solid ${C.border}`}}>
          <StatTile label="Total Customers" value={totals.customers+" pax"} icon={Ic.users} accent={C.navy}/>
          <StatTile label="Active" value={(totals.customers-totals.completeCount)+" pax"} icon={Ic.users} accent={C.navy}/>
          <StatTile label="Completed" value={totals.completeCount+" pax"} icon={Ic.checkCircle} accent={C.navy}/>
          <StatTile label="Total Contract" value={fRM(totals.totalContract)} icon={Ic.card} accent={C.navy}/>
          <StatTile label="Total Cost" value={fRM(totals.totalCost)} icon={Ic.wallet} accent={C.navy}/>
          <StatTile label="Total Received" value={fRM(totals.totalReceived)} icon={Ic.coins} accent={C.navy}/>
          <StatTile label="Outstanding" value={fRM(totals.totalOutstanding)} icon={Ic.alertCircle} accent={C.navy}/>
          <StatTile label="Portfolio P&L" value={fRM(totals.totalPL)} color={totals.totalPL>=0?"#15803D":"#DC2626"} icon={Ic.trendUp} accent={C.navy}/>
          <StatTile label={`Next Month E/C (${nextMonthLabel})`} value={fRM(totals.nextMonthEC)} icon={Ic.coins} accent={C.navy}/>
        </div>

        {overdueCustomers.length>0&&<>
          <div style={{padding:"12px 16px",background:C.white,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:3,height:16,background:"#DC2626",borderRadius:2}}/>
            <span style={{fontSize:13,fontWeight:700,color:C.navy}}>Overdue — {overdueCustomers.length} customer{overdueCustomers.length>1?"s":""}</span>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.navy}}>
              {["Customer","Phone","Branch","Month(s)","Amount","Outstanding","Note"].map(h=>(
                <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueCustomers.map((c,i)=>(
              <tr key={c.id} className="rtoRow" style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
                <td style={{padding:"9px 14px"}}>
                  <div style={{fontWeight:700,color:C.text,fontSize:12}}>{c.name}</div>
                  <div style={{fontSize:10,color:C.textLight}}>{c.memberId}</div>
                </td>
                <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.branch}</td>
                <td style={{padding:"9px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {c.overdue.map(s=><span key={s.key} style={{background:"#FEF2F2",color:"#DC2626",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600,border:"1px solid #FECACA"}}>{s.label}</span>)}
                  </div>
                </td>
                <td style={{padding:"9px 14px",fontWeight:700,color:C.text,fontSize:12,whiteSpace:"nowrap"}}>{fRM(c.overdue.reduce((s,sl)=>s+(sl.amount-amountReceivedFor(sl,c.payments?.[sl.key])),0))}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:C.textLight,whiteSpace:"nowrap"}}>{c.overdue.length===1?"1 month — follow up":`${c.overdue.length} months — urgent`}</td>
              </tr>
            ))}
            <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
              <td colSpan={4} style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy}}>TOTAL — {overdueCustomers.length} customer{overdueCustomers.length>1?"s":""}</td>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy,whiteSpace:"nowrap"}}>{fRM(overdueCustomers.reduce((s,c)=>s+c.overdue.reduce((s2,sl)=>s2+(sl.amount-amountReceivedFor(sl,c.payments?.[sl.key])),0),0))}</td>
              <td colSpan={2}/>
            </tr>
            </tbody>
          </table></div>

          <div style={{padding:"12px 16px",background:C.white,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:3,height:16,background:"#DC2626",borderRadius:2}}/>
            <span style={{fontSize:13,fontWeight:700,color:C.navy}}>Total Overdue by Month</span>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.navy}}>
              {["Month","Customers Affected","Total Overdue"].map(h=>(
                <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueByMonth.map((m,i)=>(
              <tr key={m.key} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
                <td style={{padding:"9px 14px",fontWeight:700,color:C.text,fontSize:12}}>{m.label}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{m.customerCount}</td>
                <td style={{padding:"9px 14px",fontWeight:700,color:"#DC2626",fontSize:12,whiteSpace:"nowrap"}}>{fRM(m.total)}</td>
              </tr>
            ))}
            <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
              <td colSpan={2} style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy}}>TOTAL — {overdueByMonth.length} month{overdueByMonth.length>1?"s":""}</td>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy,whiteSpace:"nowrap"}}>{fRM(overdueByMonth.reduce((s,m)=>s+m.total,0))}</td>
            </tr>
            </tbody>
          </table></div>
        </>}

        {analytics.filter(c=>c.currentDue).length>0&&(()=>{
          const dueCusts=analytics.filter(c=>c.currentDue);
          const totalDue=dueCusts.reduce((s,c)=>s+c.currentDue.amount,0);
          return <>
            <div style={{padding:"12px 16px",background:C.white,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:9}}>
              <div style={{width:3,height:16,background:C.blue,borderRadius:2}}/>
              <span style={{fontSize:13,fontWeight:700,color:C.navy}}>Due This Month — {MONTHS[now.getMonth()]} {now.getFullYear()} · {dueCusts.length} customer{dueCusts.length>1?"s":""}</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.navy}}>
                {["Customer","Phone","Branch","Month(s)","Amount","Outstanding","Note"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {dueCusts.map((c,i)=>(
                  <tr key={c.id} className="rtoRow" style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
                    <td style={{padding:"9px 14px"}}>
                      <div style={{fontWeight:700,color:C.text,fontSize:12}}>{c.name}</div>
                      <div style={{fontSize:10,color:C.textLight}}>{c.memberId}</div>
                    </td>
                    <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.contactNumber||"—"}</td>
                    <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.branch}</td>
                    <td style={{padding:"9px 14px"}}>
                      <span style={{background:"#EEF1F7",color:C.blue,padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600,border:"1px solid #C7D2E3"}}>{c.currentDue.label}</span>
                    </td>
                    <td style={{padding:"9px 14px",fontWeight:700,color:C.text,fontSize:12,whiteSpace:"nowrap"}}>{fRM(c.currentDue.amount)}</td>
                    <td style={{padding:"9px 14px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
                    <td style={{padding:"9px 14px",fontSize:11,color:C.textLight,whiteSpace:"nowrap"}}>Due this month</td>
                  </tr>
                ))}
                <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
                  <td colSpan={4} style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy}}>TOTAL — {dueCusts.length} customer{dueCusts.length>1?"s":""}</td>
                  <td style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totalDue)}</td>
                  <td colSpan={2}/>
                </tr>
              </tbody>
            </table></div>
          </>;
        })()}

        <div style={{padding:"12px 16px",background:C.white,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:3,height:16,background:C.navy,borderRadius:2}}/>
          <span style={{fontSize:13,fontWeight:700,color:C.navy}}>All Customers Payment Analysis</span>
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:C.navy}}>
            {["#","Customer","Branch","Contract","Received","Outstanding","P&L","Progress","Status"].map(h=>(
              <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {analytics.map((c,i)=>{
              const pct=c.schedule.length?Math.round(c.paidCount/c.schedule.length*100):0;
              const status=c.isComplete?"Completed":c.overdue.length>0?`${c.overdue.length} Overdue`:"Active";
              return(
                <tr key={c.id} className="rtoRow" style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
                  <td style={{padding:"9px 14px",color:C.textLight,fontSize:10}}>{i+1}</td>
                  <td style={{padding:"9px 14px"}}>
                    <div style={{fontWeight:700,color:C.text}}>{c.name}</div>
                    <div style={{fontSize:10,color:C.textLight}}>{c.memberId} · {c.contactNumber}</div>
                  </td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.branch}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.text,whiteSpace:"nowrap"}}>{fRM(c.totalContract)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.text,whiteSpace:"nowrap"}}>{fRM(c.totalReceived)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.text,fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:c.pl>=0?"#15803D":"#DC2626",fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.pl)}</td>
                  <td style={{padding:"9px 14px",minWidth:100}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:C.navy,width:`${pct}%`,borderRadius:2}}/></div>
                      <span style={{fontSize:10,color:C.textLight,whiteSpace:"nowrap"}}>{c.paidCount}/{c.schedule.length}</span>
                    </div>
                  </td>
                  <td style={{padding:"9px 14px"}}>
                    <span style={{padding:"3px 9px",borderRadius:4,fontSize:10,fontWeight:700,whiteSpace:"nowrap",display:"inline-block",
                      background:c.isComplete?"#F0FDF4":c.overdue.length>0?"#FEF2F2":"#EEF1F7",
                      color:c.isComplete?"#15803D":c.overdue.length>0?"#DC2626":C.blue,
                      border:`1px solid ${c.isComplete?"#BBF7D0":c.overdue.length>0?"#FECACA":"#C7D2E3"}`
                    }}>{status}</span>
                  </td>
                </tr>
              );
            })}
            <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface}}>
              <td colSpan={2} style={{padding:"9px 14px",fontWeight:700,fontSize:12,color:C.navy}}>TOTAL ({analytics.length})</td>
              <td style={{padding:"9px 14px"}}/>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:11,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totals.totalContract)}</td>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:11,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totals.totalReceived)}</td>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:11,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totals.totalOutstanding)}</td>
              <td style={{padding:"9px 14px",fontWeight:700,fontSize:11,color:totals.totalPL>=0?"#15803D":"#DC2626",whiteSpace:"nowrap"}}>{fRM(totals.totalPL)}</td>
              <td colSpan={2}/>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

export default function RTOSummary({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    listCustomers().then(async headers=>{
      const paymentsById=await getPaymentsForCustomers(headers.map(c=>c.id));
      setCustomers(headers.map(c=>({...c,payments:paymentsById[c.id]||{}})));
      setLoading(false);
    });
  },[]);
  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontFamily:"Inter,sans-serif",fontSize:13}}>Loading RTO data…</div>;
  return <RTOSummaryInner customers={customers} branchMeta={branchMeta}/>;
}
