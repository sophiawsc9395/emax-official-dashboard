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
import {useState,useEffect,useMemo,Fragment} from "react";
import {loadData,saveData} from "./storage/index.js";
import {uploadOrderFile,signFileUrl,removeOrderFile} from "./storage/ordersApi.js";

const DAILY_SALES_KEY="emax_v5_daily_sales";
const BANKS=["PBB","AGRO","RHB"];
// HQ and EC SDK aren't real selling branches (HQ doesn't sell, SDK is a
// pickup-only location) — excluded from every branch list in this tab only.
const dailySalesBranches=branchMeta=>Object.keys(branchMeta||{}).filter(b=>b!=="HQ"&&b!=="SDK");

const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
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
    const late=daysSince(report.submittedAt)>=1;
    return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:late?"#FEF2F2":"#FFFBEB",color:late?"#DC2626":"#B45309"}}>{late?"Bank-in Overdue":"Awaiting Bank-in"}</span>;
  }
  if(report.shortPayment&&!report.secondPaymentVerifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#FFFBEB",color:"#B45309"}}>{report.balancePaymentSlip?"Awaiting 2nd Payment Entry":"Short Payment — Awaiting Balance Slip"}</span>;
  if(report.shortPayment&&report.secondPaymentVerifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Verified (Short Payment Resolved)</span>;
  if(!report.verifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#EFF6FF",color:"#1D4ED8"}}>Awaiting Verification</span>;
  return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Verified</span>;
}

function BatchSubmitForm({branchMeta,reports,isAdmin,canSubmit,onSavedAll,onSaved,onDelete,existingKeys}){
  const branches=dailySalesBranches(branchMeta);
  const [date,setDate]=useState(nowDate());
  const empty=()=>Object.fromEntries(branches.map(b=>[b,{totalSales:"",debit:"",credit:"",rhbQr:"",cashSales:"",remark:""}]));
  const [rows,setRows]=useState(empty());
  const [saving,setSaving]=useState(false);
  const [editingBranch,setEditingBranch]=useState(null);
  // Reset the form's inputs whenever the date changes, so numbers from one
  // day don't accidentally get submitted for another.
  useEffect(()=>{setRows(empty());setEditingBranch(null);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[date]);
  const setField=(b,k,v)=>setRows(p=>({...p,[b]:{...p[b],[k]:v}}));
  const reportFor=b=>reports.find(r=>r.id===`${b}_${date}`);
  const alreadySubmitted=b=>existingKeys.has(`${b}_${date}`);
  const filledCount=branches.filter(b=>!alreadySubmitted(b)&&rows[b].totalSales!=="").length;
  const submitAll=async()=>{
    setSaving(true);
    const toSave=branches.filter(b=>!alreadySubmitted(b)&&rows[b].totalSales!=="").map(b=>({
      id:`${b}_${date}`,branch:b,date,
      totalSales:parseFloat(rows[b].totalSales)||0,debit:parseFloat(rows[b].debit)||0,credit:parseFloat(rows[b].credit)||0,
      rhbQr:parseFloat(rows[b].rhbQr)||0,cashSales:parseFloat(rows[b].cashSales)||0,remark:rows[b].remark||undefined,
      submittedAt:nowDate(),submittedTime:nowTime(),editLog:[],
      bankInSlip:null,bankInUploadedAt:null,
      verifiedBy:null,verifiedAt:null,paymentMethod:null,actualPaymentDate:null,actualAmountReceived:null,
      shortPayment:false,shortPaymentRemark:null,shortPaymentAt:null,
      balancePaymentSlip:null,balancePaymentUploadedAt:null,
      secondPaymentAmount:null,secondPaymentDate:null,secondPaymentMethod:null,secondPaymentVerifiedAt:null,
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
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:860}}>
      <thead><tr style={{background:C.surface}}>
        {["Branch","Total Sales *","Debit","Credit","RHB QR","Cash Sales *","Remark","Submitted / Actions"].map(h=>(
          <th key={h} style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
        ))}
      </tr></thead>
      <tbody>{branches.map(b=>{
        const done=alreadySubmitted(b);
        const r=done?reportFor(b):null;
        const editCount=r?.editLog?.length||0;
        // Super admin can edit/delete any report regardless of verified
        // status; Billing role (canSubmit, non-admin) can only edit
        // unverified ones. Delete is super-admin-only, full stop.
        const canEditThis=r&&(r.verifiedAt?isAdmin:canSubmit);
        const canDeleteThis=r&&isAdmin;
        const editorRole=isAdmin?"Super Admin":canSubmit?"Billing":"Viewer";
        const editing=editingBranch===b;
        return<Fragment key={b}>
          <tr style={{borderBottom:editing?"none":`1px solid ${C.border}`,background:done?C.surface:"#fff"}}>
            <td style={{padding:"6px 8px",fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>
              {branchMeta[b]?.name||b}
              {editCount>0&&<span style={{marginLeft:6,fontSize:8,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 6px",borderRadius:20}}>Edited ×{editCount}</span>}
            </td>
            {["totalSales","debit","credit","rhbQr","cashSales"].map(k=>(
              <td key={k} style={{padding:"4px 6px"}}>
                {done
                  ?<span style={{fontSize:12,color:C.textMid,fontWeight:600,whiteSpace:"nowrap"}}>{fRM(r[k])}</span>
                  :<input type="number" step="0.01" value={rows[b][k]} onChange={e=>setField(b,k,e.target.value)} placeholder="0.00" style={{width:90,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif"}}/>}
              </td>
            ))}
            <td style={{padding:"4px 6px"}}>
              {done
                ?<span style={{fontSize:11,color:C.textLight}}>{r.remark||"—"}</span>
                :<input value={rows[b].remark} onChange={e=>setField(b,"remark",e.target.value)} placeholder="Optional" style={{width:130,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif"}}/>}
            </td>
            <td style={{padding:"4px 6px"}}>
              {done&&<>
                <div style={{fontSize:9,color:C.textLight,marginBottom:4,whiteSpace:"nowrap"}}>Submitted {fDate(r.submittedAt)}{r.submittedTime?` ${r.submittedTime}`:""}</div>
                <div style={{display:"flex",gap:4}}>
                  {canEditThis&&<button onClick={()=>setEditingBranch(editing?null:b)} style={{fontSize:9,fontWeight:700,color:C.blueBright,background:"#EFF6FF",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 7px",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>{editing?"Cancel":"Edit"}</button>}
                  {canDeleteThis&&<button onClick={()=>{if(window.confirm(`Delete the ${fDate(date)} report for ${branchMeta[b]?.name||b}? This cannot be undone.`))onDelete(r.id);}} style={{fontSize:9,fontWeight:700,color:"#DC2626",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:5,padding:"3px 7px",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>Delete</button>}
                </div>
              </>}
            </td>
          </tr>
          {editing&&r&&<tr style={{borderBottom:`1px solid ${C.border}`}}>
            <td colSpan={8} style={{padding:"0 8px 12px"}}>
              <EditBox report={r} isAdmin={isAdmin} editorRole={editorRole} onSaved={async(u)=>{await onSaved(u);setEditingBranch(null);}} onCancel={()=>setEditingBranch(null)}/>
              {editCount>0&&<div style={{fontSize:10,color:"#B45309",marginTop:6}}>
                {r.editLog.map((e,i)=><div key={i}>Edited by {e.by} — {fDate(e.date)} at {e.time}</div>)}
              </div>}
            </td>
          </tr>}
        </Fragment>;
      })}</tbody>
    </table>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12}}>
      <PBtn onClick={submitAll} disabled={!filledCount||saving}>{saving?"Saving…":`Submit ${filledCount||""} Report${filledCount!==1?"s":""}`}</PBtn>
      <span style={{fontSize:11,color:C.textLight}}>Branches already submitted for this date show their figures and actions instead — fill in the rest and submit together.</span>
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

function ShortPaymentBox({report,onSaved,onCancel}){
  const [remark,setRemark]=useState("");
  const [saving,setSaving]=useState(false);
  const flag=async()=>{
    if(!remark.trim())return;
    setSaving(true);
    await onSaved({...report,shortPayment:true,shortPaymentRemark:remark,shortPaymentAt:nowDate()});
    setSaving(false);
  };
  return<div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:10,marginTop:8}}>
    <L req>Remark to branch — what's short and what's needed</L>
    <textarea value={remark} onChange={e=>setRemark(e.target.value)} rows={2} placeholder="e.g. RM50 short — please upload balance payment slip" style={{width:"100%",padding:"9px 11px",border:"1px solid #FDE68A",borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",resize:"vertical"}}/>
    <div style={{display:"flex",gap:8,marginTop:8}}>
      <PBtn onClick={flag} disabled={!remark.trim()||saving} style={{fontSize:11,padding:"7px 12px",background:"#B45309"}}>{saving?"Saving…":"Flag Short Payment"}</PBtn>
      <GBtn onClick={onCancel} style={{fontSize:11,padding:"7px 12px"}}>Cancel</GBtn>
    </div>
  </div>;
}

function UploadBalanceSlipBox({report,onSaved}){
  const [file,setFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const upload=async()=>{
    if(!file)return;
    setSaving(true);
    const f=await readSlipFile(file,`dailysales_balance_${report.branch}_${report.date}`);
    await onSaved({...report,balancePaymentSlip:f,balancePaymentUploadedAt:nowDate()});
    setSaving(false);
  };
  return<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:11}}/>
    <PBtn onClick={upload} disabled={!file||saving} style={{padding:"7px 12px",fontSize:11,background:"#B45309"}}>{saving?"Uploading…":"Upload Balance Payment Slip"}</PBtn>
  </div>;
}

function SecondPaymentBox({report,onSaved}){
  // Setting secondPaymentVerifiedAt is what finally resolves a short-payment
  // report and lets it drop out of the "needs action" list.
  const [method,setMethod]=useState(BANKS[0]);
  const [pDate,setPDate]=useState(nowDate());
  const [amount,setAmount]=useState("");
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    await onSaved({...report,secondPaymentAmount:parseFloat(amount)||0,secondPaymentDate:pDate,secondPaymentMethod:method,secondPaymentVerifiedAt:nowDate()});
    setSaving(false);
  };
  return<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,alignItems:"end",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:8}}>
    <div><L>2nd Payment Method</L><SEL value={method} onChange={e=>setMethod(e.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
    <div><L>2nd Actual Payment Date</L><I type="date" value={pDate} onChange={e=>setPDate(e.target.value)} max={nowDate()}/></div>
    <div><L>2nd Actual Amount Received</L><I type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
    <PBtn onClick={save} disabled={!amount||saving} style={{height:38,justifyContent:"center"}}>{saving?"Saving…":"Save 2nd Payment"}</PBtn>
  </div>;
}


function EditBox({report,isAdmin,editorRole,onSaved,onCancel}){
  const [totalSales,setTotalSales]=useState(String(report.totalSales??""));
  const [debit,setDebit]=useState(String(report.debit??""));
  const [credit,setCredit]=useState(String(report.credit??""));
  const [rhbQr,setRhbQr]=useState(String(report.rhbQr??""));
  const [cashSales,setCashSales]=useState(String(report.cashSales??""));
  const [remark,setRemark]=useState(report.remark||"");
  const [method,setMethod]=useState(report.paymentMethod||BANKS[0]);
  const [actualDate,setActualDate]=useState(report.actualPaymentDate||nowDate());
  const [amount,setAmount]=useState(report.actualAmountReceived!=null?String(report.actualAmountReceived):"");
  const [saving,setSaving]=useState(false);
  const canEditVerification=isAdmin&&report.verifiedAt;
  const save=async()=>{
    setSaving(true);
    // Every edit is logged — date, time, and who (by role) — so super admin
    // can see how many times a report was edited, and Billing edits flag the
    // report as changed so the branch notices the figures moved.
    const logEntry={date:nowDate(),time:nowTime(),by:editorRole};
    await onSaved({
      ...report,
      totalSales:parseFloat(totalSales)||0,debit:parseFloat(debit)||0,credit:parseFloat(credit)||0,
      rhbQr:parseFloat(rhbQr)||0,cashSales:parseFloat(cashSales)||0,remark:remark||undefined,
      ...(canEditVerification?{paymentMethod:method,actualPaymentDate:actualDate,actualAmountReceived:parseFloat(amount)||0}:{}),
      editLog:[...(report.editLog||[]),logEntry],
    });
    setSaving(false);
  };
  return<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:8}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:canEditVerification?10:0}}>
      <div><L>Total Sales</L><I type="number" step="0.01" value={totalSales} onChange={e=>setTotalSales(e.target.value)}/></div>
      <div><L>Debit</L><I type="number" step="0.01" value={debit} onChange={e=>setDebit(e.target.value)}/></div>
      <div><L>Credit</L><I type="number" step="0.01" value={credit} onChange={e=>setCredit(e.target.value)}/></div>
      <div><L>RHB QR</L><I type="number" step="0.01" value={rhbQr} onChange={e=>setRhbQr(e.target.value)}/></div>
      <div><L>Cash Sales</L><I type="number" step="0.01" value={cashSales} onChange={e=>setCashSales(e.target.value)}/></div>
      <div><L>Remark</L><I value={remark} onChange={e=>setRemark(e.target.value)}/></div>
    </div>
    {canEditVerification&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8}}>
      <div><L>Payment Method</L><SEL value={method} onChange={e=>setMethod(e.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
      <div><L>Actual Payment Date</L><I type="date" value={actualDate} onChange={e=>setActualDate(e.target.value)} max={nowDate()}/></div>
      <div><L>Actual Amount Received</L><I type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
    </div>}
    <div style={{display:"flex",gap:8,marginTop:10}}>
      <PBtn onClick={save} disabled={saving} style={{fontSize:11,padding:"7px 12px"}}>{saving?"Saving…":"Save Changes"}</PBtn>
      <GBtn onClick={onCancel} style={{fontSize:11,padding:"7px 12px"}}>Cancel</GBtn>
    </div>
  </div>;
}


function downloadMonthlyBankInPDF(reports,branchMeta,month,scopeBranch){
  const rows=reports
    .filter(r=>r.verifiedAt&&r.date.slice(0,7)===month&&(!scopeBranch||r.branch===scopeBranch))
    .sort((a,b)=>a.branch.localeCompare(b.branch)||a.date.localeCompare(b.date));
  const monthLabel=new Date(month+"-01").toLocaleDateString("en-MY",{month:"long",year:"numeric"});
  const titleSuffix=scopeBranch?` — ${branchMeta[scopeBranch]?.name||scopeBranch}`:"";
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><title>Daily Sales Bank-in Report — ${monthLabel}${titleSuffix}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,system-ui,sans-serif;}body{padding:24px;}
  h2{font-size:15px;font-weight:800;color:#0A1628;margin-bottom:2px;}.period{font-size:11px;color:#8A96A8;margin-bottom:16px;}
  table{border-collapse:collapse;width:100%;font-size:12px;}
  th{background:#0A1628;color:rgba(255,255,255,.8);padding:9px 14px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:right;}
  th.L{text-align:left;}td{padding:8px 14px;border-bottom:1px solid #E4EAF2;text-align:right;}td.L{text-align:left;font-weight:700;}
  @page{size:A4;margin:12mm;}</style></head><body>
  <h2>Daily Sales Bank-in Report${titleSuffix} — EMAX NETWORK SDN BHD</h2>
  <div class="period">Month: ${monthLabel} · ${rows.length} verified report${rows.length!==1?"s":""}</div>
  <table><thead><tr><th class="L">Branch</th><th class="L">Sales Date</th><th class="L">Bank-in Date</th><th class="L">Payment Method</th><th>Actual Bank-in Amount</th><th class="L">Remark</th><th class="L">Short Payment Remark</th><th>2nd Actual Amount Received</th><th class="L">2nd Actual Payment Date</th><th class="L">2nd Payment Method</th></tr></thead>
  <tbody>${rows.map(r=>`<tr><td class="L">${branchMeta[r.branch]?.name||r.branch}</td><td class="L">${fDate(r.date)}</td><td class="L">${fDate(r.actualPaymentDate)}</td><td class="L">${r.paymentMethod||"—"}</td><td>${fRM(r.actualAmountReceived)}</td><td class="L">${r.remark||"—"}</td><td class="L">${r.shortPaymentRemark||"—"}</td><td>${r.secondPaymentAmount!=null?fRM(r.secondPaymentAmount):"—"}</td><td class="L">${fDate(r.secondPaymentDate)}</td><td class="L">${r.secondPaymentMethod||"—"}</td></tr>`).join("")}</tbody></table>
  </body></html>`);
  w.document.close();setTimeout(()=>w.print(),400);
}

export default function DailySalesTab({branchMeta,isAdmin,userBranch,canSubmit,canVerify}){
  const [reports,setReports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [slipUrls,setSlipUrls]=useState({});
  const [dateFilter,setDateFilter]=useState(nowDate());
  const [bankInReportBranch,setBankInReportBranch]=useState(userBranch||"");
  const [expandedBalanceReminder,setExpandedBalanceReminder]=useState(null);
  const [expandedVerify,setExpandedVerify]=useState(null);
  const [expandedShortPayment,setExpandedShortPayment]=useState(null);
  const [expandedReminder,setExpandedReminder]=useState(null);
  const [exportMonth,setExportMonth]=useState(nowDate().slice(0,7));
  const [cleanupMonth,setCleanupMonth]=useState(nowDate().slice(0,7));
  const [showBulkDelete,setShowBulkDelete]=useState(false);
  const [cleaningUp,setCleaningUp]=useState(false);

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
  const deleteReport=async(id)=>{
    const next=reports.filter(r=>r.id!==id);
    setReports(next);
    await saveData(DAILY_SALES_KEY,next);
  };
  // Bulk cleanup — removes the uploaded slip FILES (bank-in + balance
  // payment) for every report in a chosen month, freeing up Storage space.
  // The underlying report itself (sales figures, verification status) is
  // left untouched — only the file attachments are cleared.
  const bulkDeleteSlipsForMonth=async(month)=>{
    const affected=reports.filter(r=>r.date.slice(0,7)===month&&(r.bankInSlip||r.balancePaymentSlip));
    if(!affected.length)return;
    setCleaningUp(true);
    await Promise.all(affected.flatMap(r=>[
      r.bankInSlip?.path?removeOrderFile(r.bankInSlip.path):null,
      r.balancePaymentSlip?.path?removeOrderFile(r.balancePaymentSlip.path):null,
    ].filter(Boolean)));
    const affectedIds=new Set(affected.map(r=>r.id));
    const next=reports.map(r=>affectedIds.has(r.id)?{...r,bankInSlip:null,bankInUploadedAt:null,balancePaymentSlip:null,balancePaymentUploadedAt:null}:r);
    setReports(next);
    await saveData(DAILY_SALES_KEY,next);
    setCleaningUp(false);
  };

  useEffect(()=>{
    reports.filter(r=>r.bankInSlip?.path&&!slipUrls[r.id]).forEach(async r=>{
      const url=await signFileUrl(r.bankInSlip.path);
      if(url)setSlipUrls(p=>({...p,[r.id]:url}));
    });
    reports.filter(r=>r.balancePaymentSlip?.path&&!slipUrls[r.id+"_balance"]).forEach(async r=>{
      const url=await signFileUrl(r.balancePaymentSlip.path);
      if(url)setSlipUrls(p=>({...p,[r.id+"_balance"]:url}));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[reports]);

  const existingKeys=useMemo(()=>new Set(reports.map(r=>r.id)),[reports]);
  // The verification queue is now a single-day, all-branches snapshot: pick
  // a date, see everyone's report for that day, verified or not. No branch
  // filter needed since seeing every branch side-by-side for one day is the
  // point (that's what makes it a useful daily cross-check).
  const visible=useMemo(()=>{
    if(!dateFilter)return[];
    let list=reports.filter(r=>r.date===dateFilter);
    if(userBranch)list=list.filter(r=>r.branch===userBranch);
    return list;
  },[reports,dateFilter,userBranch]);

  // Late bank-in alert — based on when the report was SUBMITTED (admin's
  // update), not the sales date it's reporting on. A report entered today
  // for last week's sales isn't "already late" the moment it's saved.
  const lateAlerts=useMemo(()=>reports.filter(r=>!r.bankInSlip&&daysSince(r.submittedAt)>=1),[reports]);
  // Grouped branch-by-branch for the HQ view, instead of one flat mixed list.
  const lateAlertsByBranch=useMemo(()=>{
    const groups={};
    lateAlerts.forEach(r=>{(groups[r.branch]=groups[r.branch]||[]).push(r);});
    return Object.keys(groups).sort((a,b)=>(branchMeta[a]?.name||a).localeCompare(branchMeta[b]?.name||b)).map(b=>[b,groups[b]]);
  },[lateAlerts,branchMeta]);
  // Branch-facing reminder — every one of THIS branch's own reports still
  // awaiting bank-in, not just the late ones (so it doubles as a same-day
  // nudge, not only an overdue warning). Clicking a card reveals the upload
  // box inline instead of it always being visible in the list below.
  const myPending=useMemo(()=>userBranch?reports.filter(r=>r.branch===userBranch&&!r.bankInSlip):[],[reports,userBranch]);
  // Branch-facing reminder for short-payment follow-up — same clickable
  // pattern as the bank-in reminder, since the main action panel below is
  // hidden from branch viewers now (Boss/Manager Viewer, super admin, and
  // Knock-off are the only ones who see that panel).
  const myBalancePending=useMemo(()=>userBranch?reports.filter(r=>r.branch===userBranch&&r.shortPayment&&!r.balancePaymentSlip):[],[reports,userBranch]);
  // The main action panel (verify / short-payment / edit / delete) is only
  // relevant to Boss Viewer, Manager Viewer, super admin, and Knock-off —
  // branch viewers get their own reminder cards instead.
  const canSeeActionPanel=!userBranch;

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {/* Super admin only — a single compact button up top; the month picker
        and confirm only appear once clicked, instead of a permanent card
        taking up space in the middle of the page. */}
    {isAdmin&&(()=>{
      const affectedCount=reports.filter(r=>r.date.slice(0,7)===cleanupMonth&&(r.bankInSlip||r.balancePaymentSlip)).length;
      return<div style={{marginBottom:14}}>
        {!showBulkDelete
          ?<GBtn onClick={()=>setShowBulkDelete(true)} style={{fontSize:11,padding:"7px 12px",color:"#DC2626",borderColor:"#FECACA"}}>Bulk Delete Bank-in Slips</GBtn>
          :<div style={{...card,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",borderLeft:"3px solid #DC2626"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.text}}>Bulk Delete Bank-in Slips</span>
            <input type="month" value={cleanupMonth} onChange={e=>setCleanupMonth(e.target.value)} style={{padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
            <GBtn onClick={()=>{if(window.confirm(`Delete all ${affectedCount} uploaded bank-in/balance slip file${affectedCount!==1?"s":""} for every branch in this month? The sales figures and verification status stay — only the uploaded files are removed. This cannot be undone.`))bulkDeleteSlipsForMonth(cleanupMonth);}} disabled={!affectedCount||cleaningUp} style={{fontSize:11,padding:"7px 12px",color:"#DC2626",borderColor:"#FECACA"}}>{cleaningUp?"Deleting…":`Delete ${affectedCount||""} Slip${affectedCount!==1?"s":""}`}</GBtn>
            <GBtn onClick={()=>setShowBulkDelete(false)} style={{fontSize:11,padding:"7px 12px"}}>Cancel</GBtn>
            <span style={{fontSize:10,color:C.textLight}}>Removes uploaded slip files for every branch this month — sales figures and verified status are kept.</span>
          </div>}
      </div>;
    })()}
    {/* Branch-facing reminder — clickable, expands to the upload box */}
    {myPending.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Bank In Cash Sales</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 8px",borderRadius:20}}>{myPending.length}</span>
      </div>
      {myPending.map(r=>{
        const late=daysSince(r.submittedAt)>=1;
        const open=expandedReminder===r.id;
        return<div key={r.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
          <div onClick={()=>setExpandedReminder(open?null:r.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,cursor:"pointer"}}>
            <span style={{fontSize:12,color:late?"#DC2626":C.text,fontWeight:600}}>Bank in {fRM(r.cashSales)} for {fDate(r.date)}{late?` — ${daysSince(r.submittedAt)} day${daysSince(r.submittedAt)>1?"s":""} late`:""}</span>
            <span style={{fontSize:11,color:C.blueBright,fontWeight:700}}>{open?"Close ▲":"Upload ▼"}</span>
          </div>
          {open&&<div style={{marginTop:8}}><UploadSlipBox report={r} onSaved={async(u)=>{await save(u);setExpandedReminder(null);}}/></div>}
        </div>;
      })}
    </div>}

    {/* Branch-facing reminder for short-payment balance slip */}
    {myBalancePending.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Balance Payment Needed</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 8px",borderRadius:20}}>{myBalancePending.length}</span>
      </div>
      {myBalancePending.map(r=>{
        const open=expandedBalanceReminder===r.id;
        return<div key={r.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
          <div onClick={()=>setExpandedBalanceReminder(open?null:r.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,cursor:"pointer"}}>
            <span style={{fontSize:12,color:"#B45309",fontWeight:600}}>{fDate(r.date)} — {r.shortPaymentRemark}</span>
            <span style={{fontSize:11,color:C.blueBright,fontWeight:700}}>{open?"Close ▲":"Upload ▼"}</span>
          </div>
          {open&&<div style={{marginTop:8}}><UploadBalanceSlipBox report={r} onSaved={async(u)=>{await save(u);setExpandedBalanceReminder(null);}}/></div>}
        </div>;
      })}
    </div>}

    {/* HQ-level overdue summary across all branches — branch users get the reminder above instead */}
    {!userBranch&&lateAlerts.length>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Bank-in Slip Overdue</span>
        <span style={{fontSize:10,fontWeight:700,color:"#DC2626",background:"#FEF2F226",padding:"1px 8px",borderRadius:20}}>{lateAlerts.length}</span>
      </div>
      {lateAlertsByBranch.map(([b,items])=>(
        <div key={b} style={{marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:3}}>{branchMeta[b]?.name||b}</div>
          {items.map(r=><div key={r.id} style={{fontSize:12,color:"#DC2626",padding:"2px 0 2px 10px"}}>Report dated {fDate(r.date)}, slip still not uploaded ({daysSince(r.submittedAt)} day{daysSince(r.submittedAt)>1?"s":""} since submitted)</div>)}
        </div>
      ))}
    </div>}

    {canSubmit&&<BatchSubmitForm branchMeta={branchMeta} reports={reports} isAdmin={isAdmin} canSubmit={canSubmit} onSavedAll={saveAll} onSaved={save} onDelete={deleteReport} existingKeys={existingKeys}/>}

    {/* Monthly bank-in report — always one branch's full month, never every branch mixed together */}
    {(isAdmin||userBranch)&&<div style={{...card,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:12,fontWeight:700,color:C.text}}>Daily Sales Bank-in Report</span>
      {!userBranch&&<SEL value={bankInReportBranch} onChange={e=>setBankInReportBranch(e.target.value)} style={{width:"auto",padding:"7px 9px",fontSize:12}}>
        <option value="">Choose a branch…</option>
        {dailySalesBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
      </SEL>}
      <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} style={{padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
      <GBtn onClick={()=>downloadMonthlyBankInPDF(reports,branchMeta,exportMonth,userBranch||bankInReportBranch)} disabled={!userBranch&&!bankInReportBranch} style={{fontSize:11,padding:"7px 12px"}}>Download (PDF)</GBtn>
      <span style={{fontSize:10,color:C.textLight}}>One branch, one full month — sales date, bank-in date, method, amount.</span>
    </div>}

    {canSeeActionPanel&&<div style={{...card}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Verification Queue</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Date:</span>
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} max={nowDate()} style={{padding:"5px 9px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"Inter,sans-serif"}}/>
        </div>
      </div>
      {visible.length===0
        ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No reports for this date.</div>
        :<div>{visible.map(r=>{
          const canUploadSlip=!r.bankInSlip&&isAdmin&&!userBranch;
          const canVerifyThis=r.bankInSlip&&!r.verifiedAt&&!r.shortPayment&&canVerify;
          // Short payment follow-up — knock-off can flag it as soon as a
          // bank-in slip is uploaded (an alternative to Verify, for when the
          // slip amount is less than expected), branch uploads the balance
          // slip, knock-off keys in the 2nd payment to finally resolve it.
          const canFlagShortPayment=canVerify&&r.bankInSlip&&!r.verifiedAt&&!r.shortPayment;
          const canKeyIn2ndPayment=canVerify&&r.shortPayment&&r.balancePaymentSlip&&!r.secondPaymentVerifiedAt;
          return<div key={r.id} style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:C.text}}>{branchMeta[r.branch]?.name||r.branch} <span style={{fontWeight:500,color:C.textLight,fontSize:11}}>· {fDate(r.date)}</span></div>
                <div style={{fontSize:11,color:C.textMid,marginTop:3}}>Total {fRM(r.totalSales)} · Debit {fRM(r.debit)} · Credit {fRM(r.credit)} · RHB QR {fRM(r.rhbQr)} · Cash {fRM(r.cashSales)}</div>
                {r.remark&&<div style={{fontSize:11,color:C.textLight,marginTop:2}}>Remark: {r.remark}</div>}
                {r.verifiedAt&&<div style={{fontSize:11,color:"#15803D",marginTop:3,fontWeight:600}}>Verified — {r.paymentMethod} · {fDate(r.actualPaymentDate)} · {fRM(r.actualAmountReceived)} received</div>}
                {r.shortPayment&&<div style={{fontSize:11,color:"#B45309",marginTop:3,fontWeight:600}}>Short Payment — {r.shortPaymentRemark}</div>}
                {r.secondPaymentVerifiedAt&&<div style={{fontSize:11,color:"#15803D",marginTop:3,fontWeight:600}}>2nd Payment — {r.secondPaymentMethod} · {fDate(r.secondPaymentDate)} · {fRM(r.secondPaymentAmount)} received</div>}
              </div>
              <StatusBadge report={r}/>
            </div>
            {r.bankInSlip&&<div style={{marginTop:6}}>{slipUrls[r.id]?<a href={slipUrls[r.id]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.blueBright,fontWeight:600}}>View Bank-in Slip: {r.bankInSlip.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading slip link…</span>}</div>}
            {r.balancePaymentSlip&&<div style={{marginTop:2}}>{slipUrls[r.id+"_balance"]?<a href={slipUrls[r.id+"_balance"]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#B45309",fontWeight:600}}>View Balance Payment Slip: {r.balancePaymentSlip.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading slip link…</span>}</div>}
            {canUploadSlip&&<div style={{marginTop:8}}><UploadSlipBox report={r} onSaved={save}/></div>}
            {canVerifyThis&&(expandedVerify===r.id
              ?<VerifyBox report={r} onSaved={async(u)=>{await save(u);setExpandedVerify(null);}}/>
              :<GBtn onClick={()=>setExpandedVerify(r.id)} style={{marginTop:8,fontSize:11,padding:"6px 12px"}}>Verify Bank-in</GBtn>)}
            {canFlagShortPayment&&(expandedShortPayment===r.id
              ?<ShortPaymentBox report={r} onSaved={async(u)=>{await save(u);setExpandedShortPayment(null);}} onCancel={()=>setExpandedShortPayment(null)}/>
              :<GBtn onClick={()=>setExpandedShortPayment(r.id)} style={{marginTop:8,marginLeft:8,fontSize:11,padding:"6px 12px",color:"#B45309",borderColor:"#FDE68A"}}>Short Payment</GBtn>)}
            {canKeyIn2ndPayment&&<SecondPaymentBox report={r} onSaved={save}/>}
          </div>;
        })}</div>}
    </div>}
  </div>;
}
