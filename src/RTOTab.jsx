import {useState,useEffect,useRef,useMemo} from "react";
import {listCustomers,getCustomerPayments,getPaymentsForCustomers,saveCustomer as apiSaveCustomer,deleteCustomer as apiDeleteCustomer,updatePayment as apiUpdatePayment} from "./storage/rtoApi.js";

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

/* ── Shared design tokens — matching the Order Tracking page ───────────── */
const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",yellow:"#FFD500",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const inp={display:"block",width:"100%",padding:"9px 12px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:12,fontFamily:"Inter,sans-serif",color:C.text,outline:"none",background:C.white,boxSizing:"border-box",minWidth:0};
const lbl={fontSize:10,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:4};
const Ic={
  download:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12"y1="15"x2="12"y2="3"/></svg>,
  chevL:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  plus:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.4"strokeLinecap="round"><line x1="12"y1="5"x2="12"y2="19"/><line x1="5"y1="12"x2="19"y2="12"/></svg>,
  trash:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  edit:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  users:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9"cy="7"r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  card:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="1"y="4"width="22"height="16"rx="2"/><line x1="1"y1="10"x2="23"y2="10"/></svg>,
  cal:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect x="3"y="4"width="18"height="18"rx="2"/><line x1="16"y1="2"x2="16"y2="6"/><line x1="8"y1="2"x2="8"y2="6"/><line x1="3"y1="10"x2="21"y2="10"/></svg>,
  alertCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><circle cx="12"cy="12"r="10"/><line x1="12"y1="8"x2="12"y2="12"/><line x1="12"y1="16"x2="12.01"y2="16"/></svg>,
  checkCircle:<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  chevDown:<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
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
function GBtn({children,onClick,style={}}){
  return<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 16px",background:C.white,color:C.textMid,border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",...style}}>{children}</button>;
}
function DBtn({children,onClick,disabled,style={}}){
  return<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 16px",background:"#FEF2F2",color:"#DC2626",border:"1.5px solid #FECACA",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",opacity:disabled?.5:1,fontFamily:"Inter,sans-serif",transition:"all .15s",...style}}>{children}</button>;
}
function L({children,req}){return<label style={lbl}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;}
function I(p){return<input {...p} style={{...inp,...p.style}}/>;}
function SEL({children,...p}){return<select {...p} style={{...inp,cursor:"pointer",...p.style}}>{children}</select>;}
function InfoCell({label,value,color}){return<div style={{minWidth:0}}><div style={lbl}>{label}</div><div style={{fontSize:12,fontWeight:700,color:color||C.text,wordBreak:"break-word"}}>{value}</div></div>;}

function FormField({label,req,children,span}){
  return<div style={{width:"100%",minWidth:0,...(span?{gridColumn:"1/-1"}:{})}}><L req={req}>{label}</L>{children}</div>;
}
function FormCard({title,children}){
  return<div style={{...card,marginBottom:16}}>
    <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
      <div style={{fontSize:12,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
    </div>
    <div style={{padding:"20px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:18,minWidth:0}}>{children}</div>
  </div>;
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
  const missing=[!f.memberId?.toString().trim(),!f.name?.toString().trim()];
  const row=(k,l,type="text",req=false)=><FormField key={k} label={l} req={req}><I value={f[k]} onChange={e=>set(k,e.target.value)} type={type} style={req&&!f[k]?.toString().trim()?{borderColor:"#FECACA"}:{}}/></FormField>;
  return(
    <div className="fade-in">
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn>
        <div style={{fontSize:15,fontWeight:800,color:C.navy}}>{initial?"Edit Rent-to-Own Customer":"New Rent-to-Own Customer"}</div>
      </div>

      <FormCard title="Customer Details">
        {row("memberId","Member ID",undefined,true)}
        {row("name","Customer Name",undefined,true)}
        {row("contactNumber","Contact Number")}
        <FormField label="Branch"><SEL value={f.branch} onChange={e=>set("branch",e.target.value)}>{BRANCH_ORDER.map(b=><option key={b} value={b}>{b} — {branchMeta[b]?.name||b}</option>)}</SEL></FormField>
        <FormField label="Sales Invoice Date"><I type="date" value={f.salesInvoiceDate} onChange={e=>set("salesInvoiceDate",e.target.value)}/></FormField>
      </FormCard>

      <FormCard title="Contract Details">
        <FormField label="Tenure (months)"><I type="number" min="1" value={f.tenure} onChange={e=>{
          const t=e.target.value;
          const tc=parseInt(t||0)*(parseFloat(f.monthlyInstallment)||0);
          setF(p=>({...p,tenure:t,agreementFee:"50",stampingFee:String(calcStampingFee(tc))}));
        }}/></FormField>
        <FormField label="Monthly Installment (RM)"><I type="number" value={f.monthlyInstallment} onChange={e=>{
          const m=e.target.value;
          const tc=(parseInt(f.tenure)||0)*(parseFloat(m)||0);
          setF(p=>({...p,monthlyInstallment:m,agreementFee:"50",stampingFee:String(calcStampingFee(tc))}));
        }}/></FormField>
        {row("financePrice","Finance Price (RM)","number")}
        <FormField label="Agreement Fee (RM)"><I value={f.agreementFee||"50"} readOnly style={{background:C.surface,color:C.textMid,cursor:"not-allowed"}}/><div style={{fontSize:10,color:C.textLight,marginTop:3}}>Fixed: RM 50.00</div></FormField>
        <FormField label="Stamping Fee (RM)"><I value={f.stampingFee} readOnly style={{background:C.surface,color:C.textMid,cursor:"not-allowed"}}/><div style={{fontSize:10,color:C.textLight,marginTop:3}}>Auto: based on total contract value</div></FormField>
        {row("cost","Cost (RM)","number")}
        <FormField label="Auto Debit Start">
          <div style={{display:"flex",gap:6}}>
            <SEL value={f.autoDebitMonth} onChange={e=>set("autoDebitMonth",e.target.value)} style={{flex:1}}>{MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m.slice(0,3)}</option>)}</SEL>
            <SEL value={f.autoDebitYear} onChange={e=>set("autoDebitYear",e.target.value)} style={{width:78}}>{[2024,2025,2026,2027,2028,2029,2030].map(y=><option key={y} value={y}>{y}</option>)}</SEL>
          </div>
        </FormField>
      </FormCard>

      <div style={{...card,marginBottom:16,overflow:"hidden"}}>
        <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
          <div style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Computed Summary</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))"}}>
          {[
            ["Branch Profit",fRM(branchProfit),branchProfit>=0?"#15803D":"#DC2626"],
            ["Total Contract Value",fRM(totalContract),C.text],
            ["Agreement Fee","RM 50.00",C.text],
            ["Stamping Fee",fRM(calcStampingFee(totalContract)),C.text],
          ].map(([l,v,c],i,arr)=>(
            <div key={l} style={{padding:"12px 14px",borderRight:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
              <InfoCell label={l} value={v} color={c}/>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <GBtn onClick={onCancel}>Cancel</GBtn>
        <PBtn onClick={()=>{if(missing.some(Boolean)){alert("Member ID and Name required.");return;}onSave({...f,id:initial?.id||Date.now().toString()});}}>{Ic.checkCircle} Save Customer</PBtn>
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
  const [scheduleOpen,setScheduleOpen]=useState(false);

  const downloadPhoto=async()=>{
    const el=summaryRef.current;if(!el)return;
    try{
      if(!window.html2canvas){
        await new Promise((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload=res;s.onerror=rej;document.head.appendChild(s);
        });
      }
      const canvas=await window.html2canvas(el,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false});
      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/png");
      a.download=`RTO_${customer.memberId}_${customer.name}.png`;
      a.click();
    }catch(e){alert("Download failed: "+e.message);}
  };

  return(
    <div>
      {/* Summary card */}
      <div ref={summaryRef} style={{...card,marginBottom:16}}>
        <SecHdr icon={Ic.card} right={<div style={{textAlign:"right"}}><div style={{fontSize:9,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:"0.05em"}}>Invoice Date</div><div style={{fontWeight:700,color:"#fff",fontSize:12}}>{fDate(customer.salesInvoiceDate)}</div></div>}>
          {customer.name} <span style={{color:"rgba(255,255,255,.5)",fontWeight:600,textTransform:"none",marginLeft:6}}>· {customer.memberId} · {customer.branch}</span>
        </SecHdr>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",borderBottom:`1px solid ${C.border}`}}>
          {[
            ["Finance Price",fRM(customer.financePrice),C.text],
            ["Agreement Fee",fRM(customer.agreementFee),C.text],
            ["Stamping Fee",fRM(customer.stampingFee),C.text],
            ["Cost",fRM(customer.cost),C.text],
            ["Branch Profit",fRM((parseFloat(customer.financePrice)||0)-(parseFloat(customer.cost)||0)),((parseFloat(customer.financePrice)||0)-(parseFloat(customer.cost)||0))>=0?"#15803D":"#DC2626"],
            ["Monthly Installment",fRM(customer.monthlyInstallment),C.blue],
            ["Tenure",`${customer.tenure} months`,C.text],
            ["Total Contract",fRM(totalContract),C.text],
          ].map(([l,v,c])=>(
            <div key={l} style={{padding:"10px 14px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
              <InfoCell label={l} value={v} color={c}/>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)"}}>
          {[
            ["Total Payment Received",fRM(totalReceived),"#15803D"],
            ["Outstanding Balance",fRM(outstanding),outstanding>0?"#DC2626":"#15803D"],
            ["Profit / Loss",fRM(pl),pl>=0?"#15803D":"#DC2626"],
          ].map(([l,v,c])=>(
            <div key={l} style={{padding:"12px 14px",borderRight:`1px solid ${C.border}`,background:l==="Profit / Loss"?(pl>=0?"#F0FDF4":"#FEF2F2"):C.surface}}>
              <div style={lbl}>{l}</div>
              <div style={{fontWeight:800,fontSize:14,color:c,marginTop:2}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Payment schedule table — collapsed by default so the customer
            detail panel stays compact; click to review the full history. */}
        <div onClick={()=>setScheduleOpen(p=>!p)} style={{cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 18px",borderTop:`1px solid ${C.border}`,background:C.surface}}>
          <span style={{fontSize:10,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.07em"}}>Payment Schedule — Auto Debit from {MONTHS[parseInt(customer.autoDebitMonth)-1]} {customer.autoDebitYear}</span>
          <span style={{color:C.textLight,transition:"transform .15s",transform:scheduleOpen?"rotate(180deg)":"none",flexShrink:0,marginLeft:10}}>{Ic.chevDown}</span>
        </div>
        {scheduleOpen&&<div style={{padding:"0 18px 14px"}}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.navy}}>
              {["#","Month","Amount","INV","Status","Payment Date"].map((h,i)=>(
                <th key={h} style={{padding:"9px 10px",textAlign:i===2?"right":i===3||i===4?"center":"left",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{schedule.map((s,i)=>{
              const paid=payments[s.key]?.paid;
              const paidDate=payments[s.key]?.date||"";
              return(
                <tr key={s.key} style={{borderBottom:`1px solid ${C.border}`,background:paid?"#F0FDF4":i%2===0?C.white:C.surface}}>
                  <td style={{padding:"7px 10px",color:C.textLight,fontSize:11}}>{i+1}</td>
                  <td style={{padding:"7px 10px",fontWeight:600,color:C.text}}>{s.label}</td>
                  <td style={{padding:"7px 10px",textAlign:"right",color:C.text}}>{fRM(s.amount)}</td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {payments[s.key]?.invOpened
                      ?<span style={{background:"#EEF1F7",color:C.blue,padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:700}}>✓ INV</span>
                      :<span style={{color:"#CBD5E1",fontSize:10}}>—</span>}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    {paid
                      ?<span style={{background:"#DCFCE7",color:"#15803D",padding:"2px 10px",borderRadius:4,fontSize:10,fontWeight:700}}>✓ Paid</span>
                      :<span style={{background:"#FEF9C3",color:"#854D0E",padding:"2px 10px",borderRadius:4,fontSize:10,fontWeight:700}}>Pending</span>}
                  </td>
                  <td style={{padding:"7px 10px",color:paid?"#15803D":C.textLight,fontSize:11,whiteSpace:"nowrap"}}>{paid?fDate(paidDate):"—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <PBtn onClick={downloadPhoto}>{Ic.download} Download Summary as Photo</PBtn>
      </div>
      {/* Payment marking */}
      <div style={{...card}}>
        <SecHdr icon={Ic.checkCircle}>Mark Payments</SecHdr>
        <div style={{padding:16,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
          {schedule.map((s,i)=>{
            const paid=payments[s.key]?.paid;
            const paidDate=payments[s.key]?.date||"";
            return(
              <div key={s.key} style={{background:paid?"#F0FDF4":C.surface,borderRadius:8,padding:"10px 12px",border:`1px solid ${paid?"#BBF7D0":C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:paid?6:0}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:12,color:C.text}}>{i+1}. {s.label}</span>
                    <span style={{marginLeft:8,fontSize:11,color:C.textLight}}>{fRM(s.amount)}</span>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{
                      const invOpened=!payments[s.key]?.invOpened;
                      onUpdate(s.key,{...payments[s.key],invOpened,amount:s.amount});
                    }} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:`1px solid ${payments[s.key]?.invOpened?"#93C5FD":C.border}`,borderRadius:6,background:payments[s.key]?.invOpened?"#EEF1F7":C.surface,color:payments[s.key]?.invOpened?C.blue:C.textLight,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      {payments[s.key]?.invOpened?"INV ✓":"INV"}
                    </button>
                    <button onClick={()=>{
                      const newPaid=!paid;
                      const newDate=newPaid?(paidDate||new Date().toISOString().split("T")[0]):"";
                      onUpdate(s.key,{...payments[s.key],paid:newPaid,amount:s.amount,date:newDate});
                    }} style={{padding:"3px 10px",fontSize:10,fontWeight:700,border:"none",borderRadius:6,background:paid?"#DC2626":"#15803D",color:"#fff",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      {paid?"Unmark":"Mark Paid"}
                    </button>
                  </div>
                </div>
                {paid&&<input type="date" value={paidDate} onChange={e=>onUpdate(s.key,{paid:true,amount:s.amount,date:e.target.value})} style={{...inp,fontSize:11,padding:"5px 8px",border:"1px solid #BBF7D0"}}/>}
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
  };

  const overdueCustomers=analytics.filter(c=>c.overdue.length>0).sort((a,b)=>b.overdue.length-a.overdue.length);

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
        <SecHdr icon={Ic.card} right={<div style={{textAlign:"right"}}><div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>Status</div><div style={{fontSize:12,fontWeight:700,color:totals.overdueCount>0?"#FCA5A5":"#86EFAC"}}>{totals.overdueCount>0?`${totals.overdueCount} Overdue`:"All On Track"}</div></div>}>
          Portfolio Summary — As at {today}
        </SecHdr>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",borderBottom:`1px solid ${C.border}`}}>
          {[
            ["Total Customers",totals.customers+" pax",C.text],
            ["Active",(totals.customers-totals.completeCount)+" pax",C.text],
            ["Completed",totals.completeCount+" pax",C.text],
            ["Total Contract",fRM(totals.totalContract),C.text],
            ["Total Cost",fRM(totals.totalCost),C.text],
            ["Total Received",fRM(totals.totalReceived),"#15803D"],
            ["Outstanding",fRM(totals.totalOutstanding),totals.totalOutstanding>0?"#DC2626":"#15803D"],
            ["Portfolio P&L",fRM(totals.totalPL),totals.totalPL>=0?"#15803D":"#DC2626"],
          ].map(([l,v,c])=>(
            <div key={l} style={{padding:"14px 16px",borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
              <InfoCell label={l} value={v} color={c}/>
            </div>
          ))}
        </div>

        {overdueCustomers.length>0&&<>
          <div style={{padding:"10px 16px",background:"#FEF2F2",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#DC2626"}}>{Ic.alertCircle}</span>
            <span style={{fontSize:10,fontWeight:800,color:"#DC2626",textTransform:"uppercase",letterSpacing:"0.08em"}}>Overdue — {overdueCustomers.length} customer{overdueCustomers.length>1?"s":""}</span>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.navy}}>
              {["Customer","Phone","Branch","Overdue Months","Overdue Amt","Outstanding","Note"].map(h=>(
                <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{overdueCustomers.map((c,i)=>(
              <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
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
                <td style={{padding:"9px 14px",fontWeight:700,color:"#DC2626",fontSize:12,whiteSpace:"nowrap"}}>{fRM(c.overdue.reduce((s,sl)=>s+sl.amount,0))}</td>
                <td style={{padding:"9px 14px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
                <td style={{padding:"9px 14px",fontSize:11,color:C.textLight,whiteSpace:"nowrap"}}>{c.overdue.length===1?"1 month — follow up":`${c.overdue.length} months — urgent`}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>}

        {analytics.filter(c=>c.currentDue).length>0&&(()=>{
          const dueCusts=analytics.filter(c=>c.currentDue);
          const totalDue=dueCusts.reduce((s,c)=>s+c.currentDue.amount,0);
          return <>
            <div style={{padding:"10px 16px",background:C.surface,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:14,background:C.blue,borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:800,color:C.navy,textTransform:"uppercase",letterSpacing:"0.08em"}}>Due This Month — {MONTHS[now.getMonth()]} {now.getFullYear()} · {dueCusts.length} customer{dueCusts.length>1?"s":""}</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:C.navy}}>
                {["Customer","Phone","Branch","Due Month","Amount Due","Outstanding","Note"].map(h=>(
                  <th key={h} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:10,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {dueCusts.map((c,i)=>(
                  <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
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
                  <td colSpan={4} style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:C.navy}}>Total Due This Month</td>
                  <td style={{padding:"9px 14px",fontWeight:800,fontSize:13,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totalDue)}</td>
                  <td colSpan={2}/>
                </tr>
              </tbody>
            </table></div>
          </>;
        })()}

        <div style={{padding:"10px 16px",background:C.surface,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:3,height:14,background:C.navy,borderRadius:2}}/>
          <span style={{fontSize:10,fontWeight:800,color:C.navy,textTransform:"uppercase",letterSpacing:"0.08em"}}>All Customers Payment Analysis</span>
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
                <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:C.surface}}>
                  <td style={{padding:"9px 14px",color:C.textLight,fontSize:10}}>{i+1}</td>
                  <td style={{padding:"9px 14px"}}>
                    <div style={{fontWeight:700,color:C.text}}>{c.name}</div>
                    <div style={{fontSize:10,color:C.textLight}}>{c.memberId} · {c.contactNumber}</div>
                  </td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.textMid}}>{c.branch}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.text,whiteSpace:"nowrap"}}>{fRM(c.totalContract)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:C.text,whiteSpace:"nowrap"}}>{fRM(c.totalReceived)}</td>
                  <td style={{padding:"9px 14px",fontSize:11,color:c.outstanding>0?"#DC2626":"#15803D",fontWeight:600,whiteSpace:"nowrap"}}>{fRM(c.outstanding)}</td>
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
              <td colSpan={2} style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:C.navy}}>TOTAL ({analytics.length})</td>
              <td style={{padding:"9px 14px"}}/>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totals.totalContract)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:C.navy,whiteSpace:"nowrap"}}>{fRM(totals.totalReceived)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:totals.totalOutstanding>0?"#DC2626":"#15803D",whiteSpace:"nowrap"}}>{fRM(totals.totalOutstanding)}</td>
              <td style={{padding:"9px 14px",fontWeight:800,fontSize:12,color:totals.totalPL>=0?"#15803D":"#DC2626",whiteSpace:"nowrap"}}>{fRM(totals.totalPL)}</td>
              <td colSpan={2}/>
            </tr>
          </tbody>
        </table></div>
      </div>
    </div>
  );
}


export default function RTOTab({branchMeta}){
  const [customers,setCustomers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // "list" | "summary"
  const [editCustomer,setEditCustomer]=useState(null);
  const [selectedId,setSelectedId]=useState(null);
  const [filterBranch,setFilterBranch]=useState("ALL");
  const [search,setSearch]=useState("");
  // Full {schedKey:{paid,amount,date,invOpened}} maps, fetched lazily — one
  // entry per customer whose detail panel has been opened. The list/cards
  // never touch this; paidCount/totalReceived are denormalized on the header.
  const [paymentsCache,setPaymentsCache]=useState({});
  // Full payments for EVERY customer, fetched once (batched, one query) only
  // when the Portfolio Summary view is opened — never on the list/board load.
  const [summaryCustomers,setSummaryCustomers]=useState(null);
  const [summaryLoading,setSummaryLoading]=useState(false);

  // Headers only — no payments. This is the ONLY query the customer list/
  // cards need, regardless of how many months of payment history pile up.
  const refreshList=()=>listCustomers().then(d=>{setCustomers(d);setLoading(false);});
  useEffect(()=>{refreshList();},[]);

  useEffect(()=>{
    if(selectedId&&!paymentsCache[selectedId]){
      getCustomerPayments(selectedId).then(p=>setPaymentsCache(prev=>({...prev,[selectedId]:p})));
    }
  },[selectedId,paymentsCache]);

  useEffect(()=>{
    if(view==="summary"&&!summaryCustomers&&!summaryLoading){
      setSummaryLoading(true);
      getPaymentsForCustomers(customers.map(c=>c.id)).then(byId=>{
        setSummaryCustomers(customers.map(c=>({...c,payments:byId[c.id]||{}})));
        setSummaryLoading(false);
      });
    }
  },[view,customers,summaryCustomers,summaryLoading]);

  const saveCustomer=async(c)=>{
    const result=await apiSaveCustomer(c);
    if(!result.ok){alert("Save failed — please try again.");return;}
    setCustomers(p=>p.some(x=>x.id===c.id)?p.map(x=>x.id===c.id?{...x,...c}:x):[...p,{...c,paidCount:0,totalReceived:0}]);
    setSummaryCustomers(null); // stale — refetch next time the summary is opened
    setView("list");setEditCustomer(null);
    if(!selectedId)setSelectedId(c.id);
  };

  const deleteCustomer=async(id)=>{
    if(!confirm("Remove this customer?"))return;
    const result=await apiDeleteCustomer(id);
    if(!result.ok){alert("Delete failed. Please try again.");return;}
    setCustomers(p=>p.filter(x=>x.id!==id));
    setPaymentsCache(p=>{const n={...p};delete n[id];return n;});
    setSummaryCustomers(null);
    if(selectedId===id)setSelectedId(null);
  };

  // Marks ONE scheduled month — writes a single rto_payments row plus this
  // customer's two denormalized aggregate columns. Never touches any other
  // customer's data, unlike the old blob save which rewrote everyone.
  const updatePayment=async(customerId,schedKey,payData)=>{
    const customer=customers.find(c=>c.id===customerId);
    const newPayments={...(paymentsCache[customerId]||{}),[schedKey]:payData};
    const schedule=genSchedule(customer);
    const paidCount=schedule.filter(s=>newPayments[s.key]?.paid).length;
    const totalReceived=schedule.filter(s=>newPayments[s.key]?.paid).reduce((sum,s)=>sum+(newPayments[s.key]?.amount||s.amount),0);
    const result=await apiUpdatePayment(customerId,schedKey,payData,{paidCount,totalReceived});
    if(!result.ok){alert("Save failed — please try again.");return;}
    setPaymentsCache(p=>({...p,[customerId]:newPayments}));
    setCustomers(p=>p.map(c=>c.id===customerId?{...c,paidCount,totalReceived}:c));
    setSummaryCustomers(null);
  };

  const filtered=customers.filter(c=>(filterBranch==="ALL"||c.branch===filterBranch)&&(!search||c.name.toLowerCase().includes(search.toLowerCase())||c.memberId.toLowerCase().includes(search.toLowerCase())));
  const selectedHeader=customers.find(c=>c.id===selectedId);
  const selectedPaymentsReady=selectedId&&paymentsCache[selectedId]!==undefined;
  const selected=selectedHeader&&selectedPaymentsReady?{...selectedHeader,payments:paymentsCache[selectedId]}:null;

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  if(view==="form")return<CustomerForm initial={editCustomer} branchMeta={branchMeta} onSave={saveCustomer} onCancel={()=>{setView("list");setEditCustomer(null);}}/>;

  return(
    <div className="fade-in">
      {/* Page header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.border}`,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:19,fontWeight:800,color:C.navy,letterSpacing:"-0.01em"}}>Rent-to-Own</div>
          <div style={{fontSize:12,color:C.textLight,marginTop:4}}>{customers.length} customer{customers.length===1?"":"s"} on record</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <GBtn onClick={()=>setView(view==="list"?"summary":"list")} style={view==="summary"?{background:C.navy,color:"#fff",border:`1.5px solid ${C.navy}`}:{}}>{view==="list"?"View Portfolio Summary":"Back to Customer List"}</GBtn>
        </div>
      </div>

      {view==="summary"&&(summaryCustomers?<RTOSummary customers={summaryCustomers} branchMeta={branchMeta}/>:<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading portfolio summary…</div>)}

      {view==="list"&&<div className="rto-grid">
        {/* Left: customer list */}
        <div>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <I placeholder="Search name / ID…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1}}/>
            <SEL value={filterBranch} onChange={e=>setFilterBranch(e.target.value)} style={{width:"auto"}}>
              <option value="ALL">All Branches</option>
              {BRANCH_ORDER.map(b=><option key={b} value={b}>{b}</option>)}
            </SEL>
          </div>
          <PBtn style={{width:"100%",justifyContent:"center",marginBottom:12}} onClick={()=>{setEditCustomer(null);setView("form");}}>{Ic.plus} Add New RTO Customer</PBtn>
          {filtered.length===0
            ?<div style={{...card,textAlign:"center",padding:"24px 16px",color:C.textLight,fontSize:12}}>No customers yet.</div>
            :<div style={{...card,padding:0,overflow:"hidden"}}>
              {/* Column header */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:C.navy,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.05em"}}>
                <div style={{flex:2,minWidth:0}}>Customer</div>
                <div style={{width:64,flexShrink:0}}>Branch</div>
                <div style={{width:76,flexShrink:0,textAlign:"right"}}>Progress</div>
                <div style={{width:76,flexShrink:0}}></div>
              </div>
              <div style={{maxHeight:620,overflowY:"auto"}}>
                {filtered.map((c,i)=>{
                  const schedule=genSchedule(c);
                  const paidCount=c.paidCount||0;
                  const totalReceived=c.totalReceived||0;
                  const totalContract=(parseInt(c.tenure)||0)*(parseFloat(c.monthlyInstallment)||0);
                  const outstanding=totalContract-totalReceived;
                  const isFullyPaid=outstanding<=0&&schedule.length>0;
                  const isSelected=selectedId===c.id;
                  const rowBg=isSelected?"#EEF3FB":i%2===0?C.white:C.surface;
                  return<div key={c.id} onClick={()=>setSelectedId(c.id)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${isSelected?C.blue:"transparent"}`,background:rowBg,cursor:"pointer"}}
                    onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#F5F8FC";}}
                    onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                    <div style={{flex:2,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                      <div style={{fontSize:10,color:C.textLight,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.memberId} · {outstanding>0?`${fRM(outstanding)} due`:"Fully Paid ✓"}</div>
                    </div>
                    <div style={{width:64,flexShrink:0,fontSize:10,color:C.textMid}}>{c.branch}</div>
                    <div style={{width:76,flexShrink:0,textAlign:"right"}}>
                      <span style={{fontSize:9,fontWeight:700,color:isFullyPaid?"#15803D":C.navy,background:isFullyPaid?"#F0FDF4":C.surface,border:`1px solid ${isFullyPaid?"#BBF7D0":C.border}`,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap"}}>{isFullyPaid?"Paid":`${paidCount}/${schedule.length}`}</span>
                    </div>
                    <div style={{width:76,flexShrink:0,display:"flex",gap:4,justifyContent:"flex-end"}}>
                      <button onClick={e=>{e.stopPropagation();setEditCustomer(c);setView("form");}} title="Edit" style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,color:C.textMid,cursor:"pointer"}}>{Ic.edit}</button>
                      <button onClick={e=>{e.stopPropagation();deleteCustomer(c.id);}} title="Remove" style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,color:"#DC2626",cursor:"pointer"}}>{Ic.trash}</button>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          }
        </div>

        {/* Right: detail */}
        <div>
          {selected&&<PaymentSchedule customer={selected} onUpdate={(key,data)=>updatePayment(selected.id,key,data)}/>}
          {!selected&&selectedId&&<div style={{...card,textAlign:"center",padding:"60px 20px",color:C.textLight,fontSize:13}}>Loading payment schedule…</div>}
          {!selected&&!selectedId&&<div style={{...card,textAlign:"center",padding:"60px 20px",color:C.textLight,fontSize:13}}>Select a customer to view their payment schedule and summary.</div>}
        </div>
      </div>}
    </div>
  );
}
