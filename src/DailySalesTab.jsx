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

const DAILY_SALES_KEY="emax_v5_daily_sales";
const BANKS=["PBB","AGRO","RHB"];
// HQ and EC SDK aren't real selling branches (HQ doesn't sell, SDK is a
// pickup-only location) — excluded from every branch list in this tab only.
const dailySalesBranches=branchMeta=>Object.keys(branchMeta||{}).filter(b=>b!=="HQ"&&b!=="SDK");

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

function BatchSubmitForm({branchMeta,onSavedAll,existingKeys}){
  const branches=dailySalesBranches(branchMeta);
  const [date,setDate]=useState(nowDate());
  const empty=()=>Object.fromEntries(branches.map(b=>[b,{totalSales:"",debit:"",credit:"",rhbQr:"",cashSales:"",remark:""}]));
  const [rows,setRows]=useState(empty());
  const [saving,setSaving]=useState(false);
  // Reset the form's inputs whenever the date changes, so numbers from one
  // day don't accidentally get submitted for another.
  useEffect(()=>{setRows(empty());// eslint-disable-next-line react-hooks/exhaustive-deps
  },[date]);
  const setField=(b,k,v)=>setRows(p=>({...p,[b]:{...p[b],[k]:v}}));
  const alreadySubmitted=b=>existingKeys.has(`${b}_${date}`);
  const filledCount=branches.filter(b=>!alreadySubmitted(b)&&rows[b].totalSales!=="").length;
  const submitAll=async()=>{
    setSaving(true);
    const toSave=branches.filter(b=>!alreadySubmitted(b)&&rows[b].totalSales!=="").map(b=>({
      id:`${b}_${date}`,branch:b,date,
      totalSales:parseFloat(rows[b].totalSales)||0,debit:parseFloat(rows[b].debit)||0,credit:parseFloat(rows[b].credit)||0,
      rhbQr:parseFloat(rows[b].rhbQr)||0,cashSales:parseFloat(rows[b].cashSales)||0,remark:rows[b].remark||undefined,
      submittedAt:nowDate(),
      bankInSlip:null,bankInUploadedAt:null,
      verifiedBy:null,verifiedAt:null,paymentMethod:null,actualPaymentDate:null,actualAmountReceived:null,
    }));
    await onSavedAll(toSave);
    setSaving(false);
    setRows(empty());
  };
  return<div style={{...card,padding:"14px 16px",marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text}}>Submit Daily Sales Report — All Branches</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <L req>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)} max={nowDate()} style={{width:"auto"}}/>
      </div>
    </div>
    <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
      <thead><tr style={{background:C.surface}}>
        {["Branch","Total Sales *","Debit","Credit","RHB QR","Cash Sales *","Remark"].map(h=>(
          <th key={h} style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
        ))}
      </tr></thead>
      <tbody>{branches.map(b=>{
        const done=alreadySubmitted(b);
        return<tr key={b} style={{borderBottom:`1px solid ${C.border}`,background:done?C.surface:"#fff"}}>
          <td style={{padding:"6px 8px",fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{branchMeta[b]?.name||b}</td>
          {["totalSales","debit","credit","rhbQr","cashSales"].map(k=>(
            <td key={k} style={{padding:"4px 6px"}}><input type="number" step="0.01" disabled={done} value={rows[b][k]} onChange={e=>setField(b,k,e.target.value)} placeholder={done?"—":"0.00"} style={{width:90,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif",background:done?C.surface:"#fff"}}/></td>
          ))}
          <td style={{padding:"4px 6px"}}><input disabled={done} value={rows[b].remark} onChange={e=>setField(b,"remark",e.target.value)} placeholder={done?"Already submitted":"Optional"} style={{width:130,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif",background:done?C.surface:"#fff"}}/></td>
        </tr>;
      })}</tbody>
    </table>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12}}>
      <PBtn onClick={submitAll} disabled={!filledCount||saving}>{saving?"Saving…":`Submit ${filledCount||""} Report${filledCount!==1?"s":""}`}</PBtn>
      <span style={{fontSize:11,color:C.textLight}}>Branches already submitted for this date are greyed out — fill in the rest and submit together.</span>
    </div>
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

function downloadMonthlyBankInPDF(reports,branchMeta,month){
  const rows=reports
    .filter(r=>r.verifiedAt&&r.date.slice(0,7)===month)
    .sort((a,b)=>a.branch.localeCompare(b.branch)||a.date.localeCompare(b.date));
  const monthLabel=new Date(month+"-01").toLocaleDateString("en-MY",{month:"long",year:"numeric"});
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><title>Daily Sales Bank-in Report — ${monthLabel}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,system-ui,sans-serif;}body{padding:24px;}
  h2{font-size:15px;font-weight:800;color:#0A1628;margin-bottom:2px;}.period{font-size:11px;color:#8A96A8;margin-bottom:16px;}
  table{border-collapse:collapse;width:100%;font-size:12px;}
  th{background:#0A1628;color:rgba(255,255,255,.8);padding:9px 14px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:right;}
  th.L{text-align:left;}td{padding:8px 14px;border-bottom:1px solid #E4EAF2;text-align:right;}td.L{text-align:left;font-weight:700;}
  @page{size:A4;margin:12mm;}</style></head><body>
  <h2>Daily Sales Bank-in Report — EMAX NETWORK SDN BHD</h2>
  <div class="period">Month: ${monthLabel} · ${rows.length} verified report${rows.length!==1?"s":""}</div>
  <table><thead><tr><th class="L">Branch</th><th class="L">Sales Date</th><th class="L">Bank-in Date</th><th class="L">Payment Method</th><th>Actual Bank-in Amount</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td class="L">${branchMeta[r.branch]?.name||r.branch}</td><td class="L">${fDate(r.date)}</td><td class="L">${fDate(r.actualPaymentDate)}</td><td class="L">${r.paymentMethod||"—"}</td><td>${fRM(r.actualAmountReceived)}</td></tr>`).join("")}</tbody></table>
  </body></html>`);
  w.document.close();setTimeout(()=>w.print(),400);
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
  const saveAll=async(newReports)=>{
    if(!newReports.length)return;
    const newIds=new Set(newReports.map(r=>r.id));
    const next=[...reports.filter(r=>!newIds.has(r.id)),...newReports].sort((a,b)=>b.date.localeCompare(a.date)||a.branch.localeCompare(b.branch));
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

    {canSubmit&&<BatchSubmitForm branchMeta={branchMeta} onSavedAll={saveAll} existingKeys={existingKeys}/>}

    {/* Super admin — monthly bank-in report across every branch */}
    {isAdmin&&<div style={{...card,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:12,fontWeight:700,color:C.text}}>Monthly Bank-in Report</span>
      <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} style={{padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
      <GBtn onClick={()=>downloadMonthlyBankInPDF(reports,branchMeta,exportMonth)} style={{fontSize:11,padding:"7px 12px"}}>Download (PDF)</GBtn>
      <span style={{fontSize:10,color:C.textLight}}>Every branch's verified bank-in — sales date, bank-in date, method, amount.</span>
    </div>}

    <div style={{...card}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Daily Sales Reports</span>
        {!userBranch&&<SEL value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} style={{width:"auto",padding:"5px 9px",fontSize:11}}>
          <option value="all">All Branches</option>
          {dailySalesBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
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
