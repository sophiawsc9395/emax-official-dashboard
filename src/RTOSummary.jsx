import {useState,useEffect,useRef} from "react";
import {loadData} from "./storage/index.js";

const RTO_KEY="emax_v5_rto_customers";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
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

function RTOSummaryInner({customers,branchMeta}){
  const summaryRef=useRef(null);
  const now=new Date();
  const currentKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  // Compute per-customer analytics
  const analytics=customers.map(c=>{
    const schedule=genSchedule(c);
    const payments=c.payments||{};
    const totalContract=(parseInt(c.tenure)||0)*(parseFloat(c.monthlyInstallment)||0);
    const totalReceived=schedule.filter(s=>payments[s.key]?.paid).reduce((sum,s)=>sum+(payments[s.key]?.amount||s.amount),0);
    const outstanding=totalContract-totalReceived;
    const cost=parseFloat(c.cost)||0;
    const pl=-cost+totalReceived;
    const financePrice=parseFloat(c.financePrice)||0;
    const branchProfit=financePrice-cost;
    const paidCount=schedule.filter(s=>payments[s.key]?.paid).length;

    // Overdue: past months (before current) that are not paid
    const overdue=schedule.filter(s=>s.key<currentKey&&!payments[s.key]?.paid);
    // Current month due
    const currentDue=schedule.find(s=>s.key===currentKey&&!payments[s.key]?.paid);
    // Upcoming (future unpaid)
    const upcoming=schedule.filter(s=>s.key>currentKey&&!payments[s.key]?.paid);

    return{...c,schedule,totalContract,totalReceived,outstanding,cost,pl,branchProfit,paidCount,overdue,currentDue,upcoming,isComplete:outstanding<=0};
  });

  // Totals
  const totals={
    customers:analytics.length,
    totalContract:analytics.reduce((s,c)=>s+c.totalContract,0),
    totalReceived:analytics.reduce((s,c)=>s+c.totalReceived,0),
    totalOutstanding:analytics.reduce((s,c)=>s+c.outstanding,0),
    totalPL:analytics.reduce((s,c)=>s+c.pl,0),
    overdueCount:analytics.filter(c=>c.overdue.length>0).length,
    completeCount:analytics.filter(c=>c.isComplete).length,
  };

  const overdueCustomers=analytics.filter(c=>c.overdue.length>0).sort((a,b)=>b.overdue.length-a.overdue.length);
  const activeCustomers=analytics.filter(c=>!c.isComplete&&c.overdue.length===0);
  const completedCustomers=analytics.filter(c=>c.isComplete);

  const downloadPhoto=async()=>{
    const el=summaryRef.current;if(!el)return;
    try{
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
      await new Promise(r=>{script.onload=r;});
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
        <h2 style={{fontSize:16,fontWeight:800,color:"#0A1628",margin:0,flex:1}}>RTO Portfolio Summary</h2>
        <div style={{fontSize:11,color:"#8A96A8"}}>As at {today}</div>
        <button onClick={downloadPhoto} style={{padding:"8px 18px",background:"#0A1628",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>📷 Download as Photo</button>
      </div>

      <div ref={summaryRef} style={{background:"#fff",padding:24,borderRadius:16,border:"1px solid #E4EAF2"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",borderRadius:10,padding:"16px 20px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>EMAX NETWORK SDN BHD</div>
            <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>Rent-to-Own Portfolio Summary</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:3}}>As at {today} · {totals.customers} customers</div>
          </div>
          <div style={{textAlign:"right"}}>
            {totals.overdueCount>0&&<div style={{background:"#FEF2F2",color:"#B91C1C",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>⚠ {totals.overdueCount} Overdue</div>}
            {totals.overdueCount===0&&<div style={{background:"#F0FDF4",color:"#15803D",padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700}}>✓ No Overdue</div>}
          </div>
        </div>

        {/* KPI row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12,marginBottom:20}}>
          {[
            ["Total Customers",totals.customers+" customers","#0A1628"],
            ["Active",`${totals.customers-totals.completeCount} / ${totals.customers}`,"#1E6FDB"],
            ["Completed",totals.completeCount+" customers","#15803D"],
            ["Total Contract",fRM(totals.totalContract),"#0A1628"],
            ["Total Received",fRM(totals.totalReceived),"#15803D"],
            ["Outstanding",fRM(totals.totalOutstanding),totals.totalOutstanding>0?"#B91C1C":"#15803D"],
            ["Portfolio P&L",fRM(totals.totalPL),totals.totalPL>=0?"#15803D":"#B91C1C"],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"#F7F9FC",borderRadius:10,padding:"12px 14px",border:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>{l}</div>
              <div style={{fontWeight:800,fontSize:13,color:c,lineHeight:1.2}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Overdue section */}
        {overdueCustomers.length>0&&<>
          <div style={{fontSize:11,fontWeight:800,color:"#B91C1C",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,padding:"8px 12px",background:"#FEF2F2",borderRadius:8,border:"1px solid #FECACA",display:"flex",alignItems:"center",gap:8}}>
            <span>⚠</span><span>Overdue Payments ({overdueCustomers.length} customers)</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:20}}>
            <thead><tr style={{background:"#7F1D1D"}}>
              {["Customer","Phone","Branch","Overdue Months","Amount Overdue","Outstanding Bal","Action Required"].map(h=>(
                <th key={h} style={{padding:"8px 12px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:"left"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueCustomers.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #FEE2E2",background:i%2===0?"#FFF5F5":"#FEF2F2"}}>
                <td style={{padding:"8px 12px"}}>
                  <div style={{fontWeight:700,color:"#7F1D1D"}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#B91C1C"}}>{c.memberId}</div>
                </td>
                <td style={{padding:"8px 12px",color:"#B91C1C",fontSize:11}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"8px 12px",color:"#B91C1C",fontSize:11}}>{c.branch}</td>
                <td style={{padding:"8px 12px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {c.overdue.map(s=>(
                      <span key={s.key} style={{background:"#FEE2E2",color:"#991B1B",padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{s.label}</span>
                    ))}
                  </div>
                </td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#B91C1C"}}>{fRM(c.overdue.reduce((s,sl)=>s+sl.amount,0))}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#B91C1C"}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"8px 12px",fontSize:11,color:"#7F1D1D"}}>
                  {c.overdue.length===1?"1 month overdue — follow up":`${c.overdue.length} months overdue — urgent`}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </>}

        {/* All customers table */}
        <div style={{fontSize:11,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>All Customers Payment Analysis</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:20}}>
          <thead><tr style={{background:"#0A1628"}}>
            {["#","Customer","Branch","Contract","Received","Outstanding","P&L","Paid","Status"].map(h=>(
              <th key={h} style={{padding:"8px 10px",color:"rgba(255,255,255,.7)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:h==="#"?"center":"left"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{analytics.map((c,i)=>{
            const pct=c.schedule.length?Math.round(c.paidCount/c.schedule.length*100):0;
            const status=c.isComplete?"Completed":c.overdue.length>0?`${c.overdue.length} Overdue`:"Active";
            const statusColor=c.isComplete?"#15803D":c.overdue.length>0?"#B91C1C":"#1E6FDB";
            return(
              <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:c.overdue.length>0?"#FFF5F5":i%2===0?"#fff":"#FAFBFC"}}>
                <td style={{padding:"7px 10px",textAlign:"center",color:"#8A96A8",fontSize:10}}>{i+1}</td>
                <td style={{padding:"7px 10px"}}>
                  <div style={{fontWeight:700,color:"#0A1628"}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#8A96A8"}}>{c.memberId} · {c.contactNumber}</div>
                </td>
                <td style={{padding:"7px 10px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                <td style={{padding:"7px 10px",fontSize:11,color:"#0A1628"}}>{fRM(c.totalContract)}</td>
                <td style={{padding:"7px 10px",fontSize:11,color:"#15803D",fontWeight:600}}>{fRM(c.totalReceived)}</td>
                <td style={{padding:"7px 10px",fontSize:11,color:c.outstanding>0?"#B91C1C":"#15803D",fontWeight:600}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"7px 10px",fontSize:11,color:c.pl>=0?"#15803D":"#B91C1C",fontWeight:600}}>{fRM(c.pl)}</td>
                <td style={{padding:"7px 10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{flex:1,height:5,background:"#E4EAF2",borderRadius:3,overflow:"hidden",minWidth:40}}>
                      <div style={{height:"100%",background:c.overdue.length>0?"#B91C1C":"#1E6FDB",width:`${pct}%`,borderRadius:3}}/>
                    </div>
                    <span style={{fontSize:10,color:"#4A5568",whiteSpace:"nowrap"}}>{c.paidCount}/{c.schedule.length}</span>
                  </div>
                </td>
                <td style={{padding:"7px 10px"}}>
                  <span style={{background:c.isComplete?"#DCFCE7":c.overdue.length>0?"#FEE2E2":"#EFF6FF",color:statusColor,padding:"2px 8px",borderRadius:12,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{status}</span>
                </td>
              </tr>
            );
          })}
          {/* Totals row */}
          <tr style={{background:"#F0F4FA",borderTop:"2px solid #E4EAF2"}}>
            <td colSpan={3} style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#0A1628"}}>TOTAL ({analytics.length} customers)</td>
            <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#0A1628"}}>{fRM(totals.totalContract)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:"#15803D"}}>{fRM(totals.totalReceived)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:totals.totalOutstanding>0?"#B91C1C":"#15803D"}}>{fRM(totals.totalOutstanding)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,fontSize:11,color:totals.totalPL>=0?"#15803D":"#B91C1C"}}>{fRM(totals.totalPL)}</td>
            <td colSpan={2}></td>
          </tr>
          </tbody>
        </table>

        {/* Current month due — table list */}
        {analytics.filter(c=>c.currentDue).length>0&&<>
          <div style={{fontSize:11,fontWeight:800,color:"#854D0E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10,padding:"8px 12px",background:"#FFFBEB",borderRadius:8,border:"1px solid #FDE68A",display:"flex",alignItems:"center",gap:8}}>
            <span>📅</span><span>Due This Month — {MONTHS[now.getMonth()]} {now.getFullYear()} ({analytics.filter(c=>c.currentDue).length} customers)</span>
          </div>
          {(()=>{
            const dueCusts=analytics.filter(c=>c.currentDue);
            const totalDue=dueCusts.reduce((s,c)=>s+c.currentDue.amount,0);
            return <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:20}}>
            <thead><tr style={{background:"#92400E"}}>
              {["Customer","Phone","Branch","Member ID","Amount Due"].map(h=>(
                <th key={h} style={{padding:"8px 12px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:h==="Amount Due"?"right":"left"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{dueCusts.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #FDE68A",background:i%2===0?"#FFFBEB":"#FEF9C3"}}>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#92400E"}}>{c.name}</td>
                <td style={{padding:"8px 12px",color:"#92400E",fontSize:11}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"8px 12px",color:"#92400E",fontSize:11}}>{c.branch}</td>
                <td style={{padding:"8px 12px",color:"#B45309",fontSize:11}}>{c.memberId}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#92400E",textAlign:"right"}}>{fRM(c.currentDue.amount)}</td>
              </tr>
            ))}
            <tr style={{background:"#FEF3C7",borderTop:"2px solid #F59E0B"}}>
              <td colSpan={4} style={{padding:"8px 12px",fontWeight:800,fontSize:12,color:"#92400E"}}>TOTAL DUE THIS MONTH</td>
              <td style={{padding:"8px 12px",fontWeight:800,fontSize:13,color:"#92400E",textAlign:"right"}}>{fRM(totalDue)}</td>
            </tr>
            </tbody>
          </table>;
          })()}
        </>}


      </div>
    </div>
  );
}


export default function RTOSummary({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{loadData(RTO_KEY).then(d=>{setCustomers(d||[]);setLoading(false);});},[]);
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8"}}>Loading RTO data…</div>;
  return <RTOSummaryInner customers={customers} branchMeta={branchMeta}/>;
}
