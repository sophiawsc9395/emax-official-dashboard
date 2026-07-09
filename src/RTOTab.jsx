import {useState,useEffect,useRef,useMemo} from "react";
import {loadData,saveData} from "./storage/index.js";

const RTO_KEY="emax_v5_rto_customers";
const BRANCH_ORDER=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const fDate=(s)=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const calcStampingFee=(totalContract)=>{
  const t=parseFloat(totalContract)||0;
  if(t<=1000)return 5;
  if(t<=2000)return 10;
  if(t<=3000)return 15;
  if(t<=4000)return 20;
  if(t<=5000)return 25;
  if(t<=6000)return 30;
  if(t<=7000)return 35;
  if(t<=8000)return 40;
  if(t<=9000)return 45;
  if(t<=10000)return 50;
  if(t<=11000)return 55;
  if(t<=12000)return 60;
  return 60;
};
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

function CustomerForm({initial,branchMeta,onSave,onCancel}){
  const empty={memberId:"",name:"",branch:"KM",monthlyInstallment:"",contactNumber:"",salesInvoiceDate:"",tenure:"",financePrice:"",agreementFee:"",stampingFee:"",cost:"",autoDebitMonth:"1",autoDebitYear:new Date().getFullYear().toString(),payments:{}};
  const [f,setF]=useState(initial||empty);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const cost=parseFloat(f.cost)||0;
  const financePrice=parseFloat(f.financePrice)||0;
  const branchProfit=financePrice-cost;
  const tenure=parseInt(f.tenure)||0;
  const monthly=parseFloat(f.monthlyInstallment)||0;
  const totalContract=tenure*monthly;
  return(
    <div style={{background:"#fff",borderRadius:16,padding:24,border:"1px solid #E4EAF2",marginBottom:20}}>
      <h3 style={{fontSize:14,fontWeight:800,color:"#0A1628",marginBottom:16}}>{initial?"Edit":"New"} Rent-to-Own Customer</h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
        {[["memberId","Member ID"],["name","Customer Name"],["contactNumber","Contact Number"]].map(([k,l])=>(
          <div key={k}><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{l}</label>
            <input className="input" value={f[k]} onChange={e=>set(k,e.target.value)} style={{fontSize:12}}/></div>
        ))}
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Branch</label>
          <select className="input select" value={f.branch} onChange={e=>set("branch",e.target.value)} style={{fontSize:12}}>
            {BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}
          </select></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Sales Invoice Date</label>
          <input className="input" type="date" value={f.salesInvoiceDate} onChange={e=>set("salesInvoiceDate",e.target.value)} style={{fontSize:12}}/></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Tenure (months)</label>
          <input className="input" type="number" min="1" value={f.tenure} onChange={e=>{
          const t=e.target.value;
          const tc=parseInt(t||0)*(parseFloat(f.monthlyInstallment)||0);
          setF(p=>({...p,tenure:t,agreementFee:"50",stampingFee:String(calcStampingFee(tc))}));
        }} style={{fontSize:12}}/></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Monthly Installment (RM)</label>
          <input className="input" type="number" value={f.monthlyInstallment} onChange={e=>{
          const m=e.target.value;
          const tc=(parseInt(f.tenure)||0)*(parseFloat(m)||0);
          setF(p=>({...p,monthlyInstallment:m,agreementFee:"50",stampingFee:String(calcStampingFee(tc))}));
        }} style={{fontSize:12}}/></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Finance Price (RM)</label>
          <input className="input" type="number" value={f.financePrice} onChange={e=>set("financePrice",e.target.value)} style={{fontSize:12}}/></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Agreement Fee (RM)</label>
          <input className="input" type="number" value={f.agreementFee||"50"} readOnly style={{fontSize:12,background:"#F0F4FA",color:"#4A5568"}}/>
          <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>Fixed: RM 50.00</div></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Stamping Fee (RM)</label>
          <input className="input" type="number" value={f.stampingFee} readOnly style={{fontSize:12,background:"#F0F4FA",color:"#4A5568"}}/>
          <div style={{fontSize:10,color:"#8A96A8",marginTop:2}}>Auto: based on total contract value</div></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Cost (RM)</label>
          <input className="input" type="number" value={f.cost} onChange={e=>set("cost",e.target.value)} style={{fontSize:12}}/></div>
        <div><label style={{fontSize:10,fontWeight:700,color:"#8A96A8",display:"block",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Auto Debit Start</label>
          <div style={{display:"flex",gap:6}}>
            <select className="input select" value={f.autoDebitMonth} onChange={e=>set("autoDebitMonth",e.target.value)} style={{fontSize:11,flex:1,padding:"4px 20px 4px 6px"}}>
              {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m.slice(0,3)}</option>)}
            </select>
            <select className="input select" value={f.autoDebitYear} onChange={e=>set("autoDebitYear",e.target.value)} style={{fontSize:11,width:72,padding:"4px 20px 4px 6px"}}>
              {[2024,2025,2026,2027,2028,2029,2030].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,background:"#F0F4FA",borderRadius:10,padding:14,marginBottom:16}}>
        <div><div style={{fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Branch Profit</div>
          <div style={{fontWeight:700,fontSize:13,color:branchProfit>=0?"#15803D":"#B91C1C"}}>{fRM(branchProfit)}</div></div>
        <div><div style={{fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Total Contract Value</div>
          <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>{fRM(totalContract)}</div></div>
        <div><div style={{fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Agreement Fee</div>
          <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>RM 50.00</div></div>
        <div><div style={{fontSize:10,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>Stamping Fee</div>
          <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>{fRM(calcStampingFee(totalContract))}</div></div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-success" onClick={()=>{if(!f.memberId||!f.name){alert("Member ID and Name required.");return;}onSave({...f,id:initial?.id||Date.now().toString()});}}>Save Customer</button>
      </div>
    </div>
  );
}

function PaymentSchedule({customer,onUpdate}){
  const schedule=genSchedule(customer);
  const payments=customer.payments||{};
  const totalReceived=schedule.filter(s=>payments[s.key]?.paid).reduce((sum,s)=>sum+(payments[s.key]?.amount||s.amount),0);
  const totalContract=(parseInt(customer.tenure)||0)*(parseFloat(customer.monthlyInstallment)||0);
  const outstanding=totalContract-totalReceived;
  const cost=parseFloat(customer.cost)||0;
  const pl=-cost+totalReceived;
  const summaryRef=useRef(null);

  const downloadPhoto=async()=>{
    const el=summaryRef.current;
    if(!el)return;
    const html2canvas=(await import("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js")).default;
    const canvas=await html2canvas(el,{scale:2,backgroundColor:"#ffffff",useCORS:true});
    const a=document.createElement("a");
    a.href=canvas.toDataURL("image/png");
    a.download=`RTO_${customer.memberId}_${customer.name}.png`;
    a.click();
  };

  return(
    <div>
      {/* Summary card */}
      <div ref={summaryRef} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",overflow:"hidden",marginBottom:16}}>
        <div style={{background:"linear-gradient(135deg,#0A1628,#162B52)",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>EMAX NETWORK — RENT TO OWN</div>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{customer.name}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>ID: {customer.memberId} · {customer.branch} · {customer.contactNumber}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>Invoice Date</div>
            <div style={{fontWeight:700,color:"#fff",fontSize:12}}>{fDate(customer.salesInvoiceDate)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:0,borderBottom:"1px solid #E4EAF2"}}>
          {[
            ["Finance Price",fRM(customer.financePrice),"#0A1628"],
            ["Agreement Fee",fRM(customer.agreementFee),"#0A1628"],
            ["Stamping Fee",fRM(customer.stampingFee),"#0A1628"],
            ["Cost",fRM(customer.cost),"#0A1628"],
            ["Branch Profit",fRM((parseFloat(customer.financePrice)||0)-(parseFloat(customer.cost)||0)),((parseFloat(customer.financePrice)||0)-(parseFloat(customer.cost)||0))>=0?"#15803D":"#B91C1C"],
            ["Monthly Installment",fRM(customer.monthlyInstallment),"#1E6FDB"],
            ["Tenure",`${customer.tenure} months`,"#0A1628"],
            ["Total Contract",fRM(totalContract),"#0A1628"],
          ].map(([l,v,c])=>(
            <div key={l} style={{padding:"10px 14px",borderRight:"1px solid #E4EAF2"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{l}</div>
              <div style={{fontWeight:700,fontSize:12,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0}}>
          {[
            ["Total Payment Received",fRM(totalReceived),"#15803D"],
            ["Outstanding Balance",fRM(outstanding),outstanding>0?"#B91C1C":"#15803D"],
            ["Profit / Loss",fRM(pl),pl>=0?"#15803D":"#B91C1C"],
          ].map(([l,v,c])=>(
            <div key={l} style={{padding:"12px 14px",borderRight:"1px solid #E4EAF2",background:l==="Profit / Loss"?pl>=0?"#F0FDF4":"#FEF2F2":"#F7F9FC"}}>
              <div style={{fontSize:9,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{l}</div>
              <div style={{fontWeight:800,fontSize:14,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Payment schedule table */}
        <div style={{padding:"14px 18px"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#0A1628",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Payment Schedule — Auto Debit from {MONTHS[parseInt(customer.autoDebitMonth)-1]} {customer.autoDebitYear}</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#F7F9FC"}}>
              <th style={{padding:"7px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>#</th>
              <th style={{padding:"7px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>Month</th>
              <th style={{padding:"7px 10px",textAlign:"right",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>Amount</th>
              <th style={{padding:"7px 10px",textAlign:"center",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>INV</th>
              <th style={{padding:"7px 10px",textAlign:"center",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>Status</th>
              <th style={{padding:"7px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1px solid #E4EAF2"}}>Payment Date</th>
            </tr></thead>
            <tbody>{schedule.map((s,i)=>{
              const paid=payments[s.key]?.paid;
              const paidDate=payments[s.key]?.date||"";
              return(
                <tr key={s.key} style={{borderBottom:"1px solid #F0F2F5",background:paid?"#F0FDF4":i%2===0?"#fff":"#FAFBFC"}}>
                  <td style={{padding:"7px 10px",color:"#8A96A8",fontSize:11}}>{i+1}</td>
                  <td style={{padding:"7px 10px",fontWeight:600,color:"#0A1628"}}>{s.label}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:"#0A1628"}}>{fRM(s.amount)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {payments[s.key]?.invOpened
                      ?<span style={{background:"#EFF6FF",color:"#1D4ED8",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>✓ INV</span>
                      :<span style={{color:"#CBD5E1",fontSize:10}}>—</span>}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {paid
                      ?<span style={{background:"#DCFCE7",color:"#15803D",padding:"2px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>✓ Paid</span>
                      :<span style={{background:"#FEF9C3",color:"#854D0E",padding:"2px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>Pending</span>}
                  </td>
                  <td style={{padding:"7px 10px",color:paid?"#15803D":"#8A96A8",fontSize:11}}>{paid?fDate(paidDate):"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:8,flexWrap:"wrap"}}>
        <button onClick={downloadPhoto} style={{padding:"8px 18px",background:"#0A1628",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>📷 Download Summary as Photo</button>
      </div>
      {/* Payment marking */}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAF2",padding:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#0A1628",marginBottom:12,textTransform:"uppercase",letterSpacing:"0.07em"}}>Mark Payments</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
          {schedule.map((s,i)=>{
            const paid=payments[s.key]?.paid;
            const paidDate=payments[s.key]?.date||"";
            return(
              <div key={s.key} style={{background:paid?"#F0FDF4":"#F7F9FC",borderRadius:8,padding:"10px 12px",border:`1px solid ${paid?"#BBF7D0":"#E4EAF2"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:paid?6:0}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:12,color:"#0A1628"}}>{i+1}. {s.label}</span>
                    <span style={{marginLeft:8,fontSize:11,color:"#8A96A8"}}>{fRM(s.amount)}</span>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{
                      const invOpened=!payments[s.key]?.invOpened;
                      onUpdate(s.key,{...payments[s.key],invOpened,amount:s.amount});
                    }} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:`1px solid ${payments[s.key]?.invOpened?"#93C5FD":"#E4EAF2"}`,borderRadius:6,background:payments[s.key]?.invOpened?"#EFF6FF":"#F7F9FC",color:payments[s.key]?.invOpened?"#1D4ED8":"#8A96A8",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      {payments[s.key]?.invOpened?"INV ✓":"INV"}
                    </button>
                    <button onClick={()=>{
                      const newPaid=!paid;
                      const newDate=newPaid?(paidDate||new Date().toISOString().split("T")[0]):"";
                      onUpdate(s.key,{...payments[s.key],paid:newPaid,amount:s.amount,date:newDate});
                    }} style={{padding:"3px 10px",fontSize:10,fontWeight:700,border:"none",borderRadius:6,background:paid?"#B91C1C":"#15803D",color:"#fff",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      {paid?"Unmark":"Mark Paid"}
                    </button>
                  </div>
                </div>
                {paid&&<input type="date" value={paidDate} onChange={e=>onUpdate(s.key,{paid:true,amount:s.amount,date:e.target.value})} style={{fontSize:11,padding:"3px 6px",border:"1px solid #BBF7D0",borderRadius:5,width:"100%",background:"#fff",fontFamily:"Inter,sans-serif"}}/>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function RTOSummary({customers,branchMeta}){
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
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:20}}>
            <thead><tr style={{background:"#92400E"}}>
              {["Customer","Phone","Branch","Member ID","Amount Due"].map(h=>(
                <th key={h} style={{padding:"8px 12px",color:"rgba(255,255,255,.8)",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em",textAlign:"left"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{analytics.filter(c=>c.currentDue).map((c,i)=>(
              <tr key={c.id} style={{borderBottom:"1px solid #FDE68A",background:i%2===0?"#FFFBEB":"#FEF9C3"}}>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#92400E"}}>{c.name}</td>
                <td style={{padding:"8px 12px",color:"#92400E",fontSize:11}}>{c.contactNumber||"—"}</td>
                <td style={{padding:"8px 12px",color:"#92400E",fontSize:11}}>{c.branch}</td>
                <td style={{padding:"8px 12px",color:"#B45309",fontSize:11}}>{c.memberId}</td>
                <td style={{padding:"8px 12px",fontWeight:700,color:"#92400E"}}>{fRM(c.currentDue.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </>}


      </div>
    </div>
  );
}

export default function RTOTab({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // "list" | "summary"
  const [showForm,setShowForm]=useState(false);
  const [editCustomer,setEditCustomer]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");

  useEffect(()=>{
    loadData(RTO_KEY).then(d=>{setCustomers(d||[]);setLoading(false);});
  },[]);

  const save=async(list)=>{setCustomers(list);await saveData(RTO_KEY,list);};

  const saveCustomer=async(c)=>{
    const list=customers.find(x=>x.id===c.id)?customers.map(x=>x.id===c.id?c:x):[...customers,c];
    await save(list);setShowForm(false);setEditCustomer(null);
    if(!selectedId)setSelectedId(c.id);
  };

  const deleteCustomer=async(id)=>{
    if(!confirm("Remove this customer?"))return;
    const list=customers.filter(x=>x.id!==id);
    await save(list);if(selectedId===id)setSelectedId(null);
  };

  const updatePayment=async(customerId,schedKey,payData)=>{
    const list=customers.map(c=>c.id===customerId?{...c,payments:{...c.payments,[schedKey]:payData}}:c);
    await save(list);
  };

  const filtered=customers.filter(c=>(filterBranch==="ALL"||c.branch===filterBranch)&&(!search||c.name.toLowerCase().includes(search.toLowerCase())||c.memberId.toLowerCase().includes(search.toLowerCase())));
  const selected=customers.find(c=>c.id===selectedId);

  if(loading)return<div style={{padding:40,textAlign:"center",color:"#8A96A8"}}>Loading…</div>;

  return(
    <div className="fade-in">
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <button onClick={()=>setView("list")} style={{padding:"7px 18px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"Inter,sans-serif",background:view==="list"?"#0A1628":"#F0F4FA",color:view==="list"?"#fff":"#4A5568"}}>Customer List</button>
        <button onClick={()=>setView("summary")} style={{padding:"7px 18px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"Inter,sans-serif",background:view==="summary"?"#0A1628":"#F0F4FA",color:view==="summary"?"#fff":"#4A5568"}}>Portfolio Summary</button>
      </div>
      {view==="summary"&&<RTOSummary customers={customers} branchMeta={branchMeta}/>}
      {view==="list"&&<div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20,alignItems:"start"}}>
      {/* Left: customer list */}
      <div>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input className="input" placeholder="Search name / ID…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,fontSize:12}}/>
          <select className="input select" value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{fontSize:12,padding:"6px 24px 6px 8px"}}>
            <option value="ALL">All Branches</option>
            {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <button className="btn btn-success" style={{width:"100%",marginBottom:12,padding:"10px 0"}} onClick={()=>{setShowForm(true);setEditCustomer(null);setSelectedId(null);}}>+ Add New RTO Customer</button>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"#8A96A8",fontSize:12}}>No customers yet.</div>}
          {filtered.map(c=>{
            const schedule=genSchedule(c);
            const paidCount=schedule.filter(s=>c.payments?.[s.key]?.paid).length;
            const totalReceived=schedule.filter(s=>c.payments?.[s.key]?.paid).reduce((sum,s)=>sum+(c.payments[s.key]?.amount||s.amount),0);
            const totalContract=(parseInt(c.tenure)||0)*(parseFloat(c.monthlyInstallment)||0);
            const outstanding=totalContract-totalReceived;
            const isSelected=selectedId===c.id;
            return(
              <div key={c.id} onClick={()=>setSelectedId(c.id)} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:`2px solid ${isSelected?"#1E6FDB":"#E4EAF2"}`,cursor:"pointer",transition:"border-color .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:"#0A1628"}}>{c.name}</div>
                    <div style={{fontSize:10,color:"#8A96A8"}}>{c.memberId} · {c.branch}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:outstanding>0?"#B91C1C":"#15803D",fontWeight:700}}>{outstanding>0?`RM ${outstanding.toLocaleString("en-MY",{maximumFractionDigits:0})} outstanding`:"Fully Paid ✓"}</div>
                    <div style={{fontSize:10,color:"#8A96A8"}}>{paidCount}/{schedule.length} paid</div>
                  </div>
                </div>
                <div style={{height:4,background:"#F0F2F5",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"#1E6FDB",width:`${schedule.length?paidCount/schedule.length*100:0}%`,transition:"width .3s",borderRadius:2}}/>
                </div>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={e=>{e.stopPropagation();setEditCustomer(c);setShowForm(true);}} style={{flex:1,padding:"4px 0",fontSize:10,fontWeight:700,border:"1px solid #E4EAF2",borderRadius:5,background:"#F7F9FC",color:"#4A5568",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edit</button>
                  <button onClick={e=>{e.stopPropagation();deleteCustomer(c.id);}} style={{flex:1,padding:"4px 0",fontSize:10,fontWeight:700,border:"1px solid #FECACA",borderRadius:5,background:"#FEF2F2",color:"#B91C1C",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div>
        {showForm&&<CustomerForm initial={editCustomer} branchMeta={branchMeta} onSave={saveCustomer} onCancel={()=>{setShowForm(false);setEditCustomer(null);}}/>}
        {!showForm&&selected&&<PaymentSchedule customer={selected} onUpdate={(key,data)=>updatePayment(selected.id,key,data)}/>}
        {!showForm&&!selected&&<div style={{textAlign:"center",padding:"60px 20px",color:"#8A96A8",fontSize:13,background:"#fff",borderRadius:12,border:"1px solid #E4EAF2"}}>Select a customer to view their payment schedule and summary.</div>}
      </div>
      </div>}
    </div>
  );
}
