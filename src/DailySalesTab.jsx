/**
 * Daily Sales Report — Biller submits per branch per day -> Branch banks in
 * the cash and uploads the slip -> Knock-off Admin verifies.
 *
 * Storage: reuses the existing simple loadData/saveData key-value table
 * (same one RTO's Boss snapshot and branch metadata already use) rather than
 * a new relational table, so this ships without any manual Supabase schema
 * migration. Bank-in slips are uploaded to the same `order-files` Storage
 * bucket the rest of the app already uses (uploadOrderFile is purely
 * path-based, no foreign-key tie to a real order, so this is safe reuse) —
 * keyed under a synthetic `dailysales_{branch}_{date}` id instead of a real
 * order id.
 */
import {useState,useEffect,useMemo} from "react";
import {loadData,saveData} from "./storage/index.js";
import {uploadOrderFile,signFileUrl} from "./storage/ordersApi.js";
import * as XLSX from "xlsx";

const DAILY_SALES_KEY="emax_v5_daily_sales";
const BANKS=["PBB","AGRO","RHB"];

const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const daysSince=dateStr=>{if(!dateStr)return 0;const[y,m,d]=dateStr.split("-").map(Number);const then=new Date(y,m-1,d);const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());return Math.floor((today-then)/(1000*60*60*24));};

function readSlipFile(f,syntheticId){
  return new Promise((res,rej)=>{
    if(!f.type||!f.type.startsWith("image/")){uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);return;}
    const img=new Image();
    const url=URL.createObjectURL(f);
    img.onload=()=>{
      const MAX=1600;
      let{width:w,height:h}=img;
      if(w>MAX||h>MAX){const s=MAX/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
      const canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      canvas.toBlob(blob=>{
        URL.revokeObjectURL(url);
        if(!blob){rej(new Error("Image compression failed"));return;}
        uploadOrderFile(syntheticId,blob,f.name).then(res).catch(rej);
      },"image/jpeg",0.82);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);};
    img.src=url;
  });
}

const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const SEL=props=><select {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,background:C.blueBright,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:p.disabled?.5:1,...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,background:"#fff",color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

function StatusBadge({report}){
  if(!report.bankInSlip){
    const late=daysSince(report.date)>=1;
    return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:late?"#FEF2F2":"#FFFBEB",color:late?"#DC2626":"#B45309"}}>{late?"Bank-in Overdue":"Awaiting Bank-in"}</span>;
  }
  if(!report.verifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#EFF6FF",color:"#1D4ED8"}}>Awaiting Verification</span>;
  return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Verified</span>;
}

function SubmitForm({branchMeta,userBranch,onSaved,existingBranches}){
  const branches=Object.keys(branchMeta||{});
  const [branch,setBranch]=useState(userBranch||branches[0]||"");
  const [date,setDate]=useState(nowDate());
  const [totalSales,setTotalSales]=useState("");
  const [debit,setDebit]=useState("");
  const [credit,setCredit]=useState("");
  const [rhbQr,setRhbQr]=useState("");
  const [cashSales,setCashSales]=useState("");
  const [remark,setRemark]=useState("");
  const [saving,setSaving]=useState(false);
  const alreadyExists=existingBranches.has(`${branch}_${date}`);
  const submit=async()=>{
    if(!branch||!date||alreadyExists)return;
    setSaving(true);
    const report={
      id:`${branch}_${date}`,branch,date,
      totalSales:parseFloat(totalSales)||0,debit:parseFloat(debit)||0,credit:parseFloat(credit)||0,
      rhbQr:parseFloat(rhbQr)||0,cashSales:parseFloat(cashSales)||0,remark:remark||undefined,
      submittedAt:nowDate(),
      bankInSlip:null,bankInUploadedAt:null,
      verifiedBy:null,verifiedAt:null,paymentMethod:null,actualPaymentDate:null,actualAmountReceived:null,
    };
    await onSaved(report);
    setSaving(false);
    setTotalSales("");setDebit("");setCredit("");setRhbQr("");setCashSales("");setRemark("");
  };
  return<div style={{...card,padding:"14px 16px",marginBottom:14}}>
    <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Submit Daily Sales Report</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:10}}>
      <div><L req>Branch</L>{userBranch?<I value={branchMeta[userBranch]?.name||userBranch} disabled/>:<SEL value={branch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}</SEL>}</div>
      <div><L req>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)} max={nowDate()}/></div>
      <div><L req>Total Sales</L><I type="number" step="0.01" value={totalSales} onChange={e=>setTotalSales(e.target.value)} placeholder="0.00"/></div>
      <div><L>Debit</L><I type="number" step="0.01" value={debit} onChange={e=>setDebit(e.target.value)} placeholder="0.00"/></div>
      <div><L>Credit</L><I type="number" step="0.01" value={credit} onChange={e=>setCredit(e.target.value)} placeholder="0.00"/></div>
      <div><L>RHB QR</L><I type="number" step="0.01" value={rhbQr} onChange={e=>setRhbQr(e.target.value)} placeholder="0.00"/></div>
      <div><L req>Cash Sales</L><I type="number" step="0.01" value={cashSales} onChange={e=>setCashSales(e.target.value)} placeholder="0.00"/></div>
    </div>
    <div style={{marginBottom:12}}><L>Remark</L><I value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Optional note…"/></div>
    {alreadyExists&&<div style={{fontSize:11,color:"#DC2626",marginBottom:10,fontWeight:600}}>A report for this branch and date already exists — pick a different date.</div>}
    <PBtn onClick={submit} disabled={!branch||!date||!totalSales||!cashSales||alreadyExists||saving}>{saving?"Saving…":"Submit Report"}</PBtn>
  </div>;
}

function UploadSlipBox({report,onSaved}){
  const [file,setFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const upload=async()=>{
    if(!file)return;
    setSaving(true);
    const f=await readSlipFile(file,`dailysales_${report.branch}_${report.date}`);
    await onSaved({...report,bankInSlip:f,bankInUploadedAt:nowDate()});
    setSaving(false);
  };
  return<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:11}}/>
    <PBtn onClick={upload} disabled={!file||saving} style={{padding:"7px 12px",fontSize:11}}>{saving?"Uploading…":"Upload Bank-in Slip"}</PBtn>
  </div>;
}

function VerifyBox({report,onSaved}){
  const [method,setMethod]=useState(BANKS[0]);
  const [actualDate,setActualDate]=useState(nowDate());
  const [amount,setAmount]=useState(report.cashSales?String(report.cashSales):"");
  const [saving,setSaving]=useState(false);
  const verify=async()=>{
    setSaving(true);
    await onSaved({...report,verifiedBy:true,verifiedAt:nowDate(),paymentMethod:method,actualPaymentDate:actualDate,actualAmountReceived:parseFloat(amount)||0});
    setSaving(false);
  };
  return<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,alignItems:"end",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:8}}>
    <div><L>Payment Method</L><SEL value={method} onChange={e=>setMethod(e.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
    <div><L>Actual Payment Date</L><I type="date" value={actualDate} onChange={e=>setActualDate(e.target.value)} max={nowDate()}/></div>
    <div><L>Actual Amount Received</L><I type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
    <PBtn onClick={verify} disabled={saving} style={{height:38,justifyContent:"center"}}>{saving?"Saving…":"Verify"}</PBtn>
  </div>;
}

function downloadMonthlyBankInExcel(reports,branchMeta,month){
  const rows=reports
    .filter(r=>r.verifiedAt&&r.date.slice(0,7)===month)
    .sort((a,b)=>a.branch.localeCompare(b.branch)||a.date.localeCompare(b.date))
    .map(r=>({
      "Branch":branchMeta[r.branch]?.name||r.branch,
      "Sales Date":fDate(r.date),
      "Bank-in Date":fDate(r.actualPaymentDate),
      "Payment Method":r.paymentMethod||"",
      "Actual Bank-in Amount":r.actualAmountReceived?parseFloat(r.actualAmountReceived):"",
    }));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws["!cols"]=[{wch:20},{wch:12},{wch:12},{wch:14},{wch:18}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Bank-in Report");
  XLSX.writeFile(wb,`Daily_Sales_BankIn_${month}.xlsx`);
}

export default function DailySalesTab({branchMeta,isAdmin,userBranch,canSubmit,canVerify}){
  const [reports,setReports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [slipUrls,setSlipUrls]=useState({});
  const [branchFilter,setBranchFilter]=useState(userBranch||"all");
  const [expandedVerify,setExpandedVerify]=useState(null);
  const [expandedReminder,setExpandedReminder]=useState(null);
  const [exportMonth,setExportMonth]=useState(nowDate().slice(0,7));

  useEffect(()=>{loadData(DAILY_SALES_KEY).then(d=>{setReports(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const save=async(updated)=>{
    const next=[...reports.filter(r=>r.id!==updated.id),updated].sort((a,b)=>b.date.localeCompare(a.date)||a.branch.localeCompare(b.branch));
    setReports(next);
    await saveData(DAILY_SALES_KEY,next);
  };

  useEffect(()=>{
    reports.filter(r=>r.bankInSlip?.path&&!slipUrls[r.id]).forEach(async r=>{
      const url=await signFileUrl(r.bankInSlip.path);
      if(url)setSlipUrls(p=>({...p,[r.id]:url}));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[reports]);

  const existingKeys=useMemo(()=>new Set(reports.map(r=>r.id)),[reports]);
  const visible=useMemo(()=>{
    let list=reports;
    if(userBranch)list=list.filter(r=>r.branch===userBranch);
    else if(branchFilter!=="all")list=list.filter(r=>r.branch===branchFilter);
    return list;
  },[reports,userBranch,branchFilter]);

  // Late bank-in alert — same day the report is posted, the slip is due;
  // 1+ day late triggers this.
  const lateAlerts=useMemo(()=>reports.filter(r=>!r.bankInSlip&&daysSince(r.date)>=1),[reports]);
  // Branch-facing reminder — every one of THIS branch's own reports still
  // awaiting bank-in, not just the late ones (so it doubles as a same-day
  // nudge, not only an overdue warning). Clicking a card reveals the upload
  // box inline instead of it always being visible in the list below.
  const myPending=useMemo(()=>userBranch?reports.filter(r=>r.branch===userBranch&&!r.bankInSlip):[],[reports,userBranch]);

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {/* Branch-facing reminder — clickable, expands to the upload box */}
    {myPending.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Bank In Cash Sales</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 8px",borderRadius:20}}>{myPending.length}</span>
      </div>
      {myPending.map(r=>{
        const late=daysSince(r.date)>=1;
        const open=expandedReminder===r.id;
        return<div key={r.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
          <div onClick={()=>setExpandedReminder(open?null:r.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,cursor:"pointer"}}>
            <span style={{fontSize:12,color:late?"#DC2626":C.text,fontWeight:600}}>Bank in {fRM(r.cashSales)} for {fDate(r.date)}{late?` — ${daysSince(r.date)} day${daysSince(r.date)>1?"s":""} late`:""}</span>
            <span style={{fontSize:11,color:C.blueBright,fontWeight:700}}>{open?"Close ▲":"Upload ▼"}</span>
          </div>
          {open&&<div style={{marginTop:8}}><UploadSlipBox report={r} onSaved={async(u)=>{await save(u);setExpandedReminder(null);}}/></div>}
        </div>;
      })}
    </div>}

    {/* HQ-level overdue summary across all branches — branch users get the reminder above instead */}
    {!userBranch&&lateAlerts.length>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Bank-in Slip Overdue</span>
        <span style={{fontSize:10,fontWeight:700,color:"#DC2626",background:"#FEF2F226",padding:"1px 8px",borderRadius:20}}>{lateAlerts.length}</span>
      </div>
      {lateAlerts.map(r=><div key={r.id} style={{fontSize:12,color:"#DC2626",padding:"3px 0"}}>{branchMeta[r.branch]?.name||r.branch} — report dated {fDate(r.date)}, slip still not uploaded ({daysSince(r.date)} day{daysSince(r.date)>1?"s":""} late)</div>)}
    </div>}

    {canSubmit&&<SubmitForm branchMeta={branchMeta} userBranch={userBranch} onSaved={save} existingBranches={existingKeys}/>}

    {/* Super admin — monthly bank-in report across every branch */}
    {isAdmin&&<div style={{...card,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:12,fontWeight:700,color:C.text}}>Monthly Bank-in Report</span>
      <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} style={{padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
      <GBtn onClick={()=>downloadMonthlyBankInExcel(reports,branchMeta,exportMonth)} style={{fontSize:11,padding:"7px 12px"}}>Download (Excel)</GBtn>
      <span style={{fontSize:10,color:C.textLight}}>Every branch's verified bank-in — sales date, bank-in date, method, amount.</span>
    </div>}

    <div style={{...card}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Daily Sales Reports</span>
        {!userBranch&&<SEL value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} style={{width:"auto",padding:"5px 9px",fontSize:11}}>
          <option value="all">All Branches</option>
          {Object.keys(branchMeta||{}).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
        </SEL>}
      </div>
      {visible.length===0
        ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No reports yet.</div>
        :<div>{visible.map(r=>{
          const canUploadSlip=!r.bankInSlip&&isAdmin&&!userBranch;
          const canVerifyThis=r.bankInSlip&&!r.verifiedAt&&canVerify;
          return<div key={r.id} style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{branchMeta[r.branch]?.name||r.branch} <span style={{fontWeight:500,color:C.textLight,fontSize:11}}>· {fDate(r.date)}</span></div>
                <div style={{fontSize:11,color:C.textMid,marginTop:3}}>Total {fRM(r.totalSales)} · Debit {fRM(r.debit)} · Credit {fRM(r.credit)} · RHB QR {fRM(r.rhbQr)} · Cash {fRM(r.cashSales)}</div>
                {r.remark&&<div style={{fontSize:11,color:C.textLight,marginTop:2}}>Remark: {r.remark}</div>}
                {r.verifiedAt&&<div style={{fontSize:11,color:"#15803D",marginTop:3,fontWeight:600}}>Verified — {r.paymentMethod} · {fDate(r.actualPaymentDate)} · {fRM(r.actualAmountReceived)} received</div>}
              </div>
              <StatusBadge report={r}/>
            </div>
            {r.bankInSlip&&<div style={{marginTop:6}}>{slipUrls[r.id]?<a href={slipUrls[r.id]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.blueBright,fontWeight:600}}>View Bank-in Slip: {r.bankInSlip.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading slip link…</span>}</div>}
            {canUploadSlip&&<div style={{marginTop:8}}><UploadSlipBox report={r} onSaved={save}/></div>}
            {canVerifyThis&&(expandedVerify===r.id
              ?<VerifyBox report={r} onSaved={async(u)=>{await save(u);setExpandedVerify(null);}}/>
              :<GBtn onClick={()=>setExpandedVerify(r.id)} style={{marginTop:8,fontSize:11,padding:"6px 12px"}}>Verify Bank-in</GBtn>)}
          </div>;
        })}</div>}
    </div>
  </div>;
}
