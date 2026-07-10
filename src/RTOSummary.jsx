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
    totalCost:analytics.reduce((s,c)=>s+c.cost,0),
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
    <div style={{fontFamily:"Inter,-apple-system,sans-serif"}}>
      {/* Top bar */}
      <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#0A1628",margin:0}}>RTO Portfolio Summary</h2>
          <div style={{fontSize:11,color:"#8A96A8",marginTop:2}}>As at {today} · {totals.customers} customers</div>
        </div>
        <button onClick={downloadPhoto} style={{padding:"8px 18px",background:"#0A1628",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>📷 Download as Photo</button>
      </div>

      <div ref={summaryRef} style={{background:"#fff",border:"1px solid #E4EAF2",borderRadius:12,overflow:"hidden"}}>
        {/* Header strip */}
        <div style={{background:"#0A1628",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4}}>EMAX NETWORK SDN BHD — RENT TO OWN</div>
            <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>Portfolio Summary</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>As at {today}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:4}}>Status</div>
            <div style={{fontSize:13,fontWeight:700,color:totals.overdueCount>0?"#FCA5A5":"#86EFAC"}}>{totals.overdueCount>0?`${totals.overdueCount} Overdue`:"All On Track"}</div>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",borderBottom:"1px solid #E4EAF2"}}>
          {[
            ["Total Customers",   totals.customers+" pax"],
            ["Active",            (totals.customers-totals.completeCount)+" pax"],
            ["Completed",         totals.completeCount+" pax"],
            ["Total Contract",    fRM(totals.totalContract)],
            ["Total Cost",        fRM(totals.totalCost)],
            ["Total Received",    fRM(totals.totalReceived)],
            ["Outstanding",       fRM(totals.totalOutstanding)],
            ["Portfolio P&L",     fRM(totals.totalPL)],
          ].map(([l,v],i)=>(
            <div key={l} style={{padding:"14px 16px",borderRight:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{l}</div>
              <div style={{fontWeight:800,fontSize:13,color:
                l==="Outstanding"&&totals.totalOutstanding>0?"#B91C1C":
                l==="Portfolio P&L"?totals.totalPL>=0?"#15803D":"#B91C1C":
                "#0A1628"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Section label helper */}
        {/* Overdue */}
        {overdueCustomers.length>0&&<>
          <div style={{padding:"10px 20px",background:"#F7F9FC",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:3,height:14,background:"#B91C1C",borderRadius:2}}/>
            <span style={{fontSize:10,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.08em"}}>Overdue Payments — {overdueCustomers.length} customer{overdueCustomers.length>1?"s":""}</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F7F9FC",borderBottom:"1px solid #E4EAF2"}}>
              {["Customer","Phone","Branch","Overdue Months","Amount Overdue","Outstanding","Remark"].map(h=>(
                <th key={h} style={{padding:"8px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueCustomers.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:i%2===0?"#fff":"#FAFBFC"}}>
                <td style={{padding:"9px 14px"}}>
                  <div style={{fontWeight:700,color:"#0A1628",fontSize:12}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#8A96A8"}}>{c.memberId}</div>
                </td>
                <td style={{padding:"9px 14px",fontSize:11,color:"#4A5568"}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                <td style={{padding:"9px 14px"}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {c.overdue.map(s=>(
                      <span key={s.key} style={{background:"#FEF2F2",color:"#B91C1C",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:600,border:"1px solid #FECACA"}}>{s.label}</span>
                    ))}
                  </div>
                </td>
                <td style={{padding:"9px 14px",fontWeight:700,color:"#B91C1C",fontSize:12}}>{fRM(c.overdue.reduce((s,sl)=>s+sl.amount,0))}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:"#4A5568"}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:"#8A96A8"}}>{c.overdue.length===1?"1 month — follow up":`${c.overdue.length} months — urgent`}</td>
              </tr>
            ))}</tbody>
          </table>
        </>}

        {/* Due This Month */}
        {analytics.filter(c=>c.currentDue).length>0&&(()=>{
          const dueCusts=analytics.filter(c=>c.currentDue);
          const totalDue=dueCusts.reduce((s,c)=>s+c.currentDue.amount,0);
          return <>
            <div style={{padding:"10px 20px",background:"#F7F9FC",borderTop:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:14,background:"#1E6FDB",borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.08em"}}>Due This Month — {MONTHS[now.getMonth()]} {now.getFullYear()} · {dueCusts.length} customer{dueCusts.length>1?"s":""}</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#F7F9FC",borderBottom:"1px solid #E4EAF2"}}>
                {["Customer","Phone","Branch","Member ID","Amount Due"].map(h=>(
                  <th key={h} style={{padding:"8px 14px",textAlign:h==="Amount Due"?"right":"left",fontWeight:700,fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {dueCusts.map((c,i)=>(
                  <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:i%2===0?"#fff":"#FAFBFC"}}>
                    <td style={{padding:"9px 14px",fontWeight:700,color:"#0A1628"}}>{c.name}</td>
                    <td style={{padding:"9px 14px",fontSize:11,color:"#4A5568"}}>{c.contactNumber||"—"}</td>
                    <td style={{padding:"9px 14px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                    <td style={{padding:"9px 14px",fontSize:11,color:"#8A96A8"}}>{c.memberId}</td>
                    <td style={{padding:"9px 14px",fontWeight:700,color:"#0A1628",textAlign:"right"}}>{fRM(c.currentDue.amount)}</td>
                  </tr>
                ))}
                <tr style={{borderTop:"2px solid #E4EAF2",background:"#F7F9FC"}}>
                  <td colSpan={4} style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:"#0A1628"}}>Total Due This Month</td>
                  <td style={{padding:"9px 14px",fontWeight:800,fontSize:13,color:"#0A1628",textAlign:"right"}}>{fRM(totalDue)}</td>
                </tr>
              </tbody>
            </table>
          </>;
        })()}

        {/* All Customers */}
        <div style={{padding:"10px 20px",background:"#F7F9FC",borderTop:"1px solid #E4EAF2",borderBottom:"1px solid #E4EAF2",display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:3,height:14,background:"#0A1628",borderRadius:2}}/>
          <span style={{fontSize:10,fontWeight:800,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.08em"}}>All Customers Payment Analysis</span>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:"#F7F9FC",borderBottom:"1px solid #E4EAF2"}}>
            {["#","Customer","Branch","Contract","Received","Outstanding","P&L","Progress","Status"].map(h=>(
              <th key={h} style={{padding:"8px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {analytics.map((c,i)=>{
              const pct=c.schedule.length?Math.round(c.paidCount/c.schedule.length*100):0;
              const status=c.isComplete?"Completed":c.overdue.length>0?`${c.overdue.length} Overdue`:"Active";
              return(
                <tr key={c.id} style={{borderBottom:"1px solid #F0F2F5",background:i%2===0?"#fff":"#FAFBFC"}}>
                  <td style={{padding:"9px 14px",color:"#8A96A8",fontSize:10}}>{i+1}</td>
                  <td style={{padding:"9px 14px"}}>
                    <div style={{fontWeight:700,color:"#0A1628"}}>{c.name}</div>
                    <div style={{fontSize:10,color:"#8A96A8"}}>{c.memberId} · {c.contactNumber}</div>
                  </td>
                  <td style={{padding:"9px 14px",fontSize:11,color:"#4A5568"}}>{c.branch}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:"#0A1628"}}>{fRM(c.totalContract)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:"#0A1628"}}>{fRM(c.totalReceived)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:c.outstanding>0?"#B91C1C":"#15803D",fontWeight:600}}>{fRM(c.outstanding)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:c.pl>=0?"#15803D":"#B91C1C",fontWeight:600}}>{fRM(c.pl)}</td>
                  <td style={{padding:"9px 14px",minWidth:100}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{flex:1,height:4,background:"#E4EAF2",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",background:"#0A1628",width:`${pct}%`,borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:10,color:"#8A96A8",whiteSpace:"nowrap"}}>{c.paidCount}/{c.schedule.length}</span>
                    </div>
                  </td>
                  <td style={{padding:"9px 14px"}}>
                    <span style={{padding:"3px 9px",borderRadius:4,fontSize:10,fontWeight:700,
                      background:c.isComplete?"#F0FDF4":c.overdue.length>0?"#FEF2F2":"#EFF6FF",
                      color:c.isComplete?"#15803D":c.overdue.length>0?"#B91C1C":"#1E6FDB",
                      border:`1px solid ${c.isComplete?"#BBF7D0":c.overdue.length>0?"#FECACA":"#BFDBFE"}`
                    }}>{status}</span>
                  </td>
                </tr>
              );
            })}
            <tr style={{borderTop:"2px solid #E4EAF2",background:"#F7F9FC"}}>
              <td colSpan={2} style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:"#0A1628"}}>TOTAL ({analytics.length})</td>
              <td style={{padding:"9px 14px"}}/>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:"#0A1628"}}>{fRM(totals.totalContract)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:"#0A1628"}}>{fRM(totals.totalReceived)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:totals.totalOutstanding>0?"#B91C1C":"#15803D"}}>{fRM(totals.totalOutstanding)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:totals.totalPL>=0?"#15803D":"#B91C1C"}}>{fRM(totals.totalPL)}</td>
              <td colSpan={2}/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function RTOSummary({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{loadData(RTO_KEY).then(d=>{setCustomers(d||[]);setLoading(false);});},[]);
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontFamily:"Inter,sans-serif"}}>Loading RTO data…</div>;
  return <RTOSummaryInner customers={customers} branchMeta={branchMeta}/>;
}
