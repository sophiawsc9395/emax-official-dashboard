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
import {useState,useEffect,useMemo,useRef,Fragment} from "react";
import {loadData,saveData} from "./storage/index.js";
import {uploadOrderFile,signFileUrl,removeOrderFile} from "./storage/ordersApi.js";
import {resolveEditorRole} from "./auth/orderRoles.js";

const DAILY_SALES_KEY="emax_v5_daily_sales";
const BANKS=["PBB","AGRO","RHB"];
// HQ and EC SDK aren't real selling branches (HQ doesn't sell, SDK is a
// pickup-only location) — excluded from every branch list in this tab only.
const dailySalesBranches=branchMeta=>Object.keys(branchMeta||{}).filter(b=>b!=="HQ"&&b!=="SDK");

const C={navy:"#0A1628",navyMid:"#0F2040",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const yesterday=()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().split("T")[0];};
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
  if(!report.cashSales)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>No Cash — N/A</span>;
  if(!getSlips(report).length){
    const late=daysSince(report.submittedAt)>=1;
    return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:late?"#FEF2F2":"#FFFBEB",color:late?"#DC2626":"#B45309"}}>{late?"Bank-in Overdue":"Awaiting Bank-in"}</span>;
  }
  if(report.shortPayment&&!report.secondPaymentVerifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#FFFBEB",color:"#B45309"}}>{report.balancePaymentSlip?"Awaiting 2nd Payment Entry":"Short Payment — Awaiting Balance Slip"}</span>;
  if(report.shortPayment&&report.secondPaymentVerifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Verified (Short Payment Resolved)</span>;
  if(!report.verifiedAt)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#EFF6FF",color:"#1D4ED8"}}>Awaiting Verification</span>;
  return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Verified</span>;
}

function BatchSubmitForm({branchMeta,reports,isAdmin,canSubmit,canVerify,email,onSavedAll,onSaved,onDelete,existingKeys}){
  const branches=dailySalesBranches(branchMeta);
  const [date,setDate]=useState(yesterday());
  const empty=()=>Object.fromEntries(branches.map(b=>[b,{totalSales:"",debit:"",credit:"",rhbQr:"",cashSales:"",remark:""}]));
  const [rows,setRows]=useState(empty());
  const [saving,setSaving]=useState(false);
  const [editingBranch,setEditingBranch]=useState(null);
  const [viewingFieldLog,setViewingFieldLog]=useState(null);
  // Reset the form's inputs whenever the date changes, so numbers from one
  // day don't accidentally get submitted for another.
  useEffect(()=>{setRows(empty());setEditingBranch(null);setViewingFieldLog(null);// eslint-disable-next-line react-hooks/exhaustive-deps
  },[date]);
  const setField=(b,k,v)=>setRows(p=>({...p,[b]:{...p[b],[k]:v}}));
  const reportFor=b=>reports.find(r=>r.id===`${b}_${date}`);
  const alreadySubmitted=b=>existingKeys.has(`${b}_${date}`);
  const filledCount=branches.filter(b=>!alreadySubmitted(b)&&rows[b].cashSales!=="").length;
  const submitAll=async()=>{
    setSaving(true);
    const toSave=branches.filter(b=>!alreadySubmitted(b)&&rows[b].cashSales!=="").map(b=>{
      const debit=parseFloat(rows[b].debit)||0,credit=parseFloat(rows[b].credit)||0,rhbQr=parseFloat(rows[b].rhbQr)||0,cashSales=parseFloat(rows[b].cashSales)||0;
      return{
        id:`${b}_${date}`,branch:b,date,
        totalSales:debit+credit+rhbQr+cashSales,debit,credit,rhbQr,cashSales,remark:rows[b].remark||undefined,
        submittedAt:nowDate(),submittedTime:nowTime(),editLog:[],
        bankInSlip:null,bankInUploadedAt:null,
        verifiedBy:null,verifiedAt:null,paymentMethod:null,actualPaymentDate:null,actualAmountReceived:null,
        shortPayment:false,shortPaymentRemark:null,shortPaymentAt:null,
        balancePaymentSlip:null,balancePaymentUploadedAt:null,
        secondPaymentAmount:null,secondPaymentDate:null,secondPaymentMethod:null,secondPaymentVerifiedAt:null,
      };
    });
    await onSavedAll(toSave);
    setSaving(false);
    setRows(empty());
  };
  return<div style={{...card,padding:"14px 16px",marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text}}>{canSubmit?"Submit Daily Sales Report — All Branches":"Daily Sales Report — All Branches"}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <L req>Date</L><I type="date" value={date} onChange={e=>setDate(e.target.value)} max={nowDate()} style={{width:"auto"}}/>
      </div>
    </div>
    <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:860}}>
      <thead><tr style={{background:C.surface}}>
        {["Branch","Total Sales (Auto)","Debit","Credit","RHB QR","Cash Sales *","Remark","Submitted / Actions"].map(h=>(
          <th key={h} style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
        ))}
      </tr></thead>
      <tbody>{branches.map(b=>{
        const done=alreadySubmitted(b);
        const r=done?reportFor(b):null;
        // Super admin can edit/delete any report regardless of verified
        // status; Billing role (canSubmit, non-admin) can only edit
        // unverified ones. Delete is super-admin-only, full stop.
        const canEditThis=r&&(r.verifiedAt?isAdmin:canSubmit);
        const canDeleteThis=r&&isAdmin;
        // Attribute by whichever functional role is actually relevant to
        // this edit, not the person's overall highest privilege — someone
        // like Sophia or boontheng2004 holds Super Admin *alongside*
        // Billing/Knock-off, so without this a routine sales-figure
        // correction would misleadingly log as "Super Admin" instead of
        // "Billing", which is really what the action is.
        // Prefer resolving the actual role from their login email — this
        // correctly distinguishes, say, emaxbilling@gmail.com from
        // Sophia (who holds Billing alongside Super Admin) — falling back
        // to the capability-based guess only if the email isn't recognized.
        const editorRole=resolveEditorRole(email,["billing","knockoff","superAdmin"])||(canSubmit?"Billing":canVerify?"Knock-off":isAdmin?"Super Admin":"Viewer");
        const editing=editingBranch===b;
        const everEditedFields=new Set((r?.editLog||[]).flatMap(e=>e.fields||[]));
        const fieldLogKey=k=>`${b}_${k}`;
        const FieldEditedTag=({field})=><button onClick={()=>setViewingFieldLog(viewingFieldLog===fieldLogKey(field)?null:fieldLogKey(field))} style={{marginLeft:4,fontSize:7,fontWeight:700,color:"#B45309",background:"#FFFBEB",border:"1px solid #FDE68A",padding:"1px 4px",borderRadius:3,verticalAlign:"middle",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Edited</button>;
        const FieldLog=({field})=>viewingFieldLog===fieldLogKey(field)&&<div style={{marginTop:4,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:6,padding:"6px 8px",display:"flex",flexDirection:"column",gap:3}}>
          {r.editLog.filter(e=>e.fields?.includes(field)).map((e,i)=><div key={i} style={{fontSize:10,color:"#92400E",whiteSpace:"nowrap"}}>{fDate(e.date)} {e.time} by {e.by}: {e.fieldChanges?.[field]}</div>)}
        </div>;
        return<Fragment key={b}>
          <tr style={{borderBottom:editing?"none":`1px solid ${C.border}`,background:done?C.surface:"#fff"}}>
            <td style={{padding:"6px 8px",fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>
              {branchMeta[b]?.name||b}
            </td>
            {["totalSales","debit","credit","rhbQr","cashSales"].map(k=>{
              const autoTotal=(parseFloat(rows[b].debit)||0)+(parseFloat(rows[b].credit)||0)+(parseFloat(rows[b].rhbQr)||0)+(parseFloat(rows[b].cashSales)||0);
              return<td key={k} style={{padding:"4px 6px"}}>
                {done
                  ?<>
                    <span style={{fontSize:12,color:C.textMid,fontWeight:600,whiteSpace:"nowrap"}}>{fRM(r[k])}{everEditedFields.has(k)&&<FieldEditedTag field={k}/>}</span>
                    <FieldLog field={k}/>
                  </>
                  :canSubmit
                    ?(k==="totalSales"
                      ?<span style={{fontSize:12,color:C.textMid,fontWeight:700,whiteSpace:"nowrap"}}>{fRM(autoTotal)}</span>
                      :<input type="number" step="0.01" value={rows[b][k]} onChange={e=>setField(b,k,e.target.value)} placeholder="0.00" style={{width:90,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif"}}/>)
                    :<span style={{fontSize:12,color:C.textLight}}>—</span>}
              </td>;
            })}
            <td style={{padding:"4px 6px"}}>
              {done
                ?<>
                  <span style={{fontSize:11,color:C.textLight}}>{r.remark||"—"}{everEditedFields.has("remark")&&<FieldEditedTag field="remark"/>}</span>
                  <FieldLog field="remark"/>
                </>
                :canSubmit
                  ?<input value={rows[b].remark} onChange={e=>setField(b,"remark",e.target.value)} placeholder="Optional" style={{width:130,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
                  :<span style={{fontSize:11,color:C.textLight}}>—</span>}
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
            </td>
          </tr>}
        </Fragment>;
      })}</tbody>
    </table>
    </div>
    {canSubmit&&<div style={{display:"flex",alignItems:"center",gap:10,marginTop:12}}>
      <PBtn onClick={submitAll} disabled={!filledCount||saving}>{saving?"Saving…":`Submit ${filledCount||""} Report${filledCount!==1?"s":""}`}</PBtn>
    </div>}
  </div>;
}

// A report's slips may still be on the old single bankInSlip field (older
// data) and/or the new bankInSlips array — this always returns the full
// combined list so nothing from before this change gets lost.
const getSlips=r=>{
  const slips=[...(r.bankInSlips||[])];
  if(r.bankInSlip&&!slips.some(s=>s.path===r.bankInSlip.path))slips.unshift(r.bankInSlip);
  return slips;
};
// Same idea for verification — multiple payment entries (different methods,
// summing to the total) live in paymentEntries; older single-entry reports
// fall back to the legacy paymentMethod/actualPaymentDate/actualAmountReceived.
const getPaymentEntries=r=>{
  if(r.paymentEntries&&r.paymentEntries.length)return r.paymentEntries;
  if(r.paymentMethod)return[{method:r.paymentMethod,date:r.actualPaymentDate,amount:r.actualAmountReceived}];
  return[];
};
const totalVerifiedAmount=r=>getPaymentEntries(r).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);

function UploadSlipBox({report,onSaved}){
  const [file,setFile]=useState(null);
  const [saving,setSaving]=useState(false);
  const slips=getSlips(report);
  const upload=async()=>{
    if(!file)return;
    setSaving(true);
    const f=await readSlipFile(file,`dailysales_${report.branch}_${report.date}`);
    await onSaved({...report,bankInSlips:[...slips,f],bankInSlip:null,bankInUploadedAt:report.bankInUploadedAt||nowDate()});
    setSaving(false);
  };
  const removeSlip=async(idx)=>{
    if(!window.confirm("Remove this bank-in slip?"))return;
    const target=slips[idx];
    if(target?.path)await removeOrderFile(target.path);
    const next=slips.filter((_,i)=>i!==idx);
    await onSaved({...report,bankInSlips:next,bankInSlip:null});
  };
  return<div>
    {slips.length>0&&<div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
      {slips.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
        <span style={{color:C.textLight}}>Slip {i+1}: {s.name}</span>
        <button onClick={()=>removeSlip(i)} style={{fontSize:10,color:"#DC2626",background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",padding:0}}>Remove</button>
      </div>)}
    </div>}
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:11}}/>
      <PBtn onClick={upload} disabled={!file||saving} style={{padding:"7px 12px",fontSize:11}}>{saving?"Uploading…":slips.length?"Add Another Slip":"Upload Bank-in Slip"}</PBtn>
    </div>
  </div>;
}

function VerifyBox({report,onSaved}){
  const [entries,setEntries]=useState(()=>{
    const existing=getPaymentEntries(report);
    return existing.length?existing.map(e=>({method:e.method||BANKS[0],date:e.date||nowDate(),amount:e.amount!=null?String(e.amount):""})):[{method:BANKS[0],date:nowDate(),amount:report.cashSales?String(report.cashSales):""}];
  });
  const [saving,setSaving]=useState(false);
  const total=entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const matches=Math.abs(total-(parseFloat(report.cashSales)||0))<0.005;
  const setEntry=(i,k,v)=>setEntries(p=>p.map((e,idx)=>idx===i?{...e,[k]:v}:e));
  const addEntry=()=>setEntries(p=>[...p,{method:BANKS[0],date:nowDate(),amount:""}]);
  const removeEntry=(i)=>setEntries(p=>p.filter((_,idx)=>idx!==i));
  const verify=async()=>{
    setSaving(true);
    const cleanEntries=entries.map(e=>({method:e.method,date:e.date,amount:parseFloat(e.amount)||0}));
    await onSaved({...report,verifiedBy:true,verifiedAt:nowDate(),paymentEntries:cleanEntries,
      // keep the legacy fields populated too (first entry), so anything
      // still reading the old single-value fields doesn't break
      paymentMethod:cleanEntries[0]?.method,actualPaymentDate:cleanEntries[0]?.date,actualAmountReceived:cleanEntries.reduce((s,e)=>s+e.amount,0)});
    setSaving(false);
  };
  return<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:8}}>
    {entries.map((e,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,alignItems:"end",marginBottom:8}}>
      <div><L>Payment Method</L><SEL value={e.method} onChange={ev=>setEntry(i,"method",ev.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
      <div><L>Actual Payment Date</L><I type="date" value={e.date} onChange={ev=>setEntry(i,"date",ev.target.value)} max={nowDate()}/></div>
      <div><L>Amount Received</L><I type="number" step="0.01" value={e.amount} onChange={ev=>setEntry(i,"amount",ev.target.value)}/></div>
      {entries.length>1&&<button onClick={()=>removeEntry(i)} style={{height:38,fontSize:10,color:"#DC2626",background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Remove</button>}
    </div>)}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
      <button onClick={addEntry} style={{fontSize:11,fontWeight:700,color:C.blueBright,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",padding:0}}>+ Add Another Payment</button>
      <span style={{fontSize:11,fontWeight:700,color:matches?"#15803D":"#B45309"}}>Total: {fRM(total)} {matches?"✓ matches Cash Sales":`(Cash Sales: ${fRM(report.cashSales)})`}</span>
    </div>
    <PBtn onClick={verify} disabled={saving} style={{marginTop:10,width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Verify"}</PBtn>
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
  const [debit,setDebit]=useState(String(report.debit??""));
  const [credit,setCredit]=useState(String(report.credit??""));
  const [rhbQr,setRhbQr]=useState(String(report.rhbQr??""));
  const [cashSales,setCashSales]=useState(String(report.cashSales??""));
  const [remark,setRemark]=useState(report.remark||"");
  const canEditVerification=isAdmin&&report.verifiedAt;
  // Every payment entry from the original verification is editable here now
  // — not just the first one — so a mistake in the 2nd (or 3rd...) payment
  // of a multi-payment verification can actually be corrected.
  const [entries,setEntries]=useState(()=>{
    const existing=getPaymentEntries(report);
    return existing.length?existing.map(e=>({method:e.method||BANKS[0],date:e.date||nowDate(),amount:e.amount!=null?String(e.amount):""})):[{method:BANKS[0],date:nowDate(),amount:""}];
  });
  const setEntry=(i,k,v)=>setEntries(p=>p.map((e,idx)=>idx===i?{...e,[k]:v}:e));
  const addEntry=()=>setEntries(p=>[...p,{method:BANKS[0],date:nowDate(),amount:""}]);
  const removeEntry=(i)=>setEntries(p=>p.filter((_,idx)=>idx!==i));
  const entriesTotal=entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const entriesMatch=Math.abs(entriesTotal-(parseFloat(cashSales)||0))<0.005;
  const [secondMethod,setSecondMethod]=useState(report.secondPaymentMethod||BANKS[0]);
  const [secondDate,setSecondDate]=useState(report.secondPaymentDate||nowDate());
  const [secondAmount,setSecondAmount]=useState(report.secondPaymentAmount!=null?String(report.secondPaymentAmount):"");
  const [saving,setSaving]=useState(false);
  const canEditSecondPayment=isAdmin&&report.secondPaymentVerifiedAt;
  const autoTotal=(parseFloat(debit)||0)+(parseFloat(credit)||0)+(parseFloat(rhbQr)||0)+(parseFloat(cashSales)||0);
  const save=async()=>{
    setSaving(true);
    const cleanEntries=canEditVerification?entries.map(e=>({method:e.method,date:e.date,amount:parseFloat(e.amount)||0})):null;
    const newVals={
      totalSales:autoTotal,debit:parseFloat(debit)||0,credit:parseFloat(credit)||0,
      rhbQr:parseFloat(rhbQr)||0,cashSales:parseFloat(cashSales)||0,remark:remark||undefined,
      ...(canEditVerification?{paymentEntries:cleanEntries,paymentMethod:cleanEntries[0]?.method,actualPaymentDate:cleanEntries[0]?.date,actualAmountReceived:cleanEntries.reduce((s,e)=>s+e.amount,0)}:{}),
      ...(canEditSecondPayment?{secondPaymentMethod:secondMethod,secondPaymentDate:secondDate,secondPaymentAmount:parseFloat(secondAmount)||0}:{}),
    };
    // Every edit is logged with date, time, who (by role), AND a summary of
    // what actually changed — so super admin can see not just how many
    // times a report was edited, but exactly what moved each time. Payment
    // entries are compared as a whole (not field-by-field) since they're a
    // list, not a single value.
    const FIELD_LABELS={totalSales:"Total Sales",debit:"Debit",credit:"Credit",rhbQr:"RHB QR",cashSales:"Cash Sales",remark:"Remark",paymentEntries:"Payment Entries",secondPaymentMethod:"2nd Payment Method",secondPaymentDate:"2nd Actual Payment Date",secondPaymentAmount:"2nd Actual Amount Received"};
    const MONEY_FIELDS=new Set(["totalSales","debit","credit","rhbQr","cashSales","secondPaymentAmount"]);
    const DATE_FIELDS=new Set(["secondPaymentDate"]);
    const fmtEntries=es=>es&&es.length?es.map(e=>`${e.method} ${fRM(e.amount)}`).join(" + "):"—";
    const fmt=(k,v)=>{if(k==="paymentEntries")return fmtEntries(v);if(v==null||v==="")return"—";if(MONEY_FIELDS.has(k))return fRM(v);if(DATE_FIELDS.has(k))return fDate(v);return String(v);};
    const compareKeys=Object.keys(newVals).filter(k=>k!=="paymentMethod"&&k!=="actualPaymentDate"&&k!=="actualAmountReceived");
    const changedKeys=compareKeys.filter(k=>k==="paymentEntries"?JSON.stringify(report.paymentEntries||[])!==JSON.stringify(newVals.paymentEntries||[]):String(report[k]??"")!==String(newVals[k]??""));
    const fieldChanges=Object.fromEntries(changedKeys.map(k=>[k,`${fmt(k,report[k])} → ${fmt(k,newVals[k])}`]));
    const changes=changedKeys.map(k=>`${FIELD_LABELS[k]||k}: ${fieldChanges[k]}`).join("; ");
    const logEntry={date:nowDate(),time:nowTime(),by:editorRole,changes:changes||"No changes",fields:changedKeys,fieldChanges};
    await onSaved({
      ...report,
      ...newVals,
      editLog:[...(report.editLog||[]),logEntry],
    });
    setSaving(false);
  };
  return<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginTop:8}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:canEditVerification?10:0}}>
      <div><L>Total Sales (Auto)</L><div style={{padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontWeight:700,color:C.textMid,background:C.surface}}>{fRM(autoTotal)}</div></div>
      <div><L>Debit</L><I type="number" step="0.01" value={debit} onChange={e=>setDebit(e.target.value)}/></div>
      <div><L>Credit</L><I type="number" step="0.01" value={credit} onChange={e=>setCredit(e.target.value)}/></div>
      <div><L>RHB QR</L><I type="number" step="0.01" value={rhbQr} onChange={e=>setRhbQr(e.target.value)}/></div>
      <div><L>Cash Sales</L><I type="number" step="0.01" value={cashSales} onChange={e=>setCashSales(e.target.value)}/></div>
      <div><L>Remark</L><I value={remark} onChange={e=>setRemark(e.target.value)}/></div>
    </div>
    {canEditVerification&&<div style={{marginBottom:canEditSecondPayment?10:0}}>
      {entries.map((e,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,alignItems:"end",marginBottom:8}}>
        <div><L>Payment Method {entries.length>1?i+1:""}</L><SEL value={e.method} onChange={ev=>setEntry(i,"method",ev.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
        <div><L>Actual Payment Date</L><I type="date" value={e.date} onChange={ev=>setEntry(i,"date",ev.target.value)} max={nowDate()}/></div>
        <div><L>Amount Received</L><I type="number" step="0.01" value={e.amount} onChange={ev=>setEntry(i,"amount",ev.target.value)}/></div>
        {entries.length>1&&<button onClick={()=>removeEntry(i)} style={{height:38,fontSize:10,color:"#DC2626",background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Remove</button>}
      </div>)}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <button onClick={addEntry} style={{fontSize:11,fontWeight:700,color:C.blueBright,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",padding:0}}>+ Add Another Payment</button>
        <span style={{fontSize:11,fontWeight:700,color:entriesMatch?"#15803D":"#B45309"}}>Total: {fRM(entriesTotal)} {entriesMatch?"✓ matches Cash Sales":`(Cash Sales: ${fRM(cashSales)})`}</span>
      </div>
    </div>}
    {canEditSecondPayment&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8}}>
      <div><L>2nd Payment Method</L><SEL value={secondMethod} onChange={e=>setSecondMethod(e.target.value)}>{BANKS.map(b=><option key={b} value={b}>{b}</option>)}</SEL></div>
      <div><L>2nd Actual Payment Date</L><I type="date" value={secondDate} onChange={e=>setSecondDate(e.target.value)} max={nowDate()}/></div>
      <div><L>2nd Actual Amount Received</L><I type="number" step="0.01" value={secondAmount} onChange={e=>setSecondAmount(e.target.value)}/></div>
    </div>}
    <div style={{display:"flex",gap:8,marginTop:10}}>
      <PBtn onClick={save} disabled={saving} style={{fontSize:11,padding:"7px 12px"}}>{saving?"Saving…":"Save Changes"}</PBtn>
      <GBtn onClick={onCancel} style={{fontSize:11,padding:"7px 12px"}}>Cancel</GBtn>
    </div>
  </div>;
}


function BranchMonthlyReport({branchMeta,userBranch,reports}){
  const [month,setMonth]=useState(yesterday().slice(0,7));
  const [y,m]=month.split("-").map(Number);
  const daysInMonth=new Date(y,m,0).getDate();
  const rows=Array.from({length:daysInMonth},(_,i)=>{
    const d=String(i+1).padStart(2,"0");
    const dateStr=`${month}-${d}`;
    const r=reports.find(x=>x.id===`${userBranch}_${dateStr}`);
    return{dateStr,r};
  });
  return<div style={{...card,marginBottom:14}}>
    <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Monthly Sales Report — {branchMeta[userBranch]?.name||userBranch}</span>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)} max={nowDate().slice(0,7)} style={{padding:"5px 9px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"Inter,sans-serif"}}/>
    </div>
    <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
      <thead><tr style={{background:C.surface}}>
        {["Date","Total Sales","Debit","Credit","RHB QR","Cash Sales","Remark","Status"].map(h=>(
          <th key={h} style={{padding:"6px 8px",fontSize:10,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"left",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
        ))}
      </tr></thead>
      <tbody>{rows.map(({dateStr,r})=>(
        <tr key={dateStr} style={{borderBottom:`1px solid ${C.border}`,background:r?"#fff":C.surface}}>
          <td style={{padding:"6px 8px",fontSize:12,fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{fDate(dateStr)}</td>
          {r?<>
            <td style={{padding:"6px 8px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(r.totalSales)}</td>
            <td style={{padding:"6px 8px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(r.debit)}</td>
            <td style={{padding:"6px 8px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(r.credit)}</td>
            <td style={{padding:"6px 8px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(r.rhbQr)}</td>
            <td style={{padding:"6px 8px",fontSize:12,color:C.textMid,whiteSpace:"nowrap"}}>{fRM(r.cashSales)}</td>
            <td style={{padding:"6px 8px",fontSize:11,color:C.textLight}}>{r.remark||"—"}</td>
            <td style={{padding:"6px 8px"}}><StatusBadge report={r}/></td>
          </>:<td colSpan={7} style={{padding:"6px 8px",fontSize:11,color:C.textLight}}>Not submitted yet</td>}
        </tr>
      ))}</tbody>
    </table>
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
  <tbody>${rows.map(r=>`<tr><td class="L">${branchMeta[r.branch]?.name||r.branch}</td><td class="L">${fDate(r.date)}</td><td class="L">${fDate(r.actualPaymentDate)}</td><td class="L">${getPaymentEntries(r).map(e=>e.method).join(" + ")||"—"}</td><td>${fRM(totalVerifiedAmount(r))}</td><td class="L">${r.remark||"—"}</td><td class="L">${r.shortPaymentRemark||"—"}</td><td>${r.secondPaymentAmount!=null?fRM(r.secondPaymentAmount):"—"}</td><td class="L">${fDate(r.secondPaymentDate)}</td><td class="L">${r.secondPaymentMethod||"—"}</td></tr>`).join("")}</tbody></table>
  </body></html>`);
  w.document.close();setTimeout(()=>w.print(),400);
}

export default function DailySalesTab({branchMeta,isAdmin,userBranch,canSubmit,canVerify,email}){
  const [reports,setReports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [slipUrls,setSlipUrls]=useState({});
  const [dateFilter,setDateFilter]=useState(yesterday());
  const [bankInReportBranch,setBankInReportBranch]=useState(userBranch||"");
  const [expandedVerify,setExpandedVerify]=useState(null);
  const [expandedShortPayment,setExpandedShortPayment]=useState(null);
  const [expandedVerificationEdit,setExpandedVerificationEdit]=useState(null);
  const [expandedResolvedDetails,setExpandedResolvedDetails]=useState(null);
  const verificationQueueRef=useRef(null);
  const jumpToReport=(r)=>{
    setDateFilter(r.date);
    setTimeout(()=>verificationQueueRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);
  };
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
    const affected=reports.filter(r=>r.date.slice(0,7)===month&&(getSlips(r).length||r.balancePaymentSlip));
    if(!affected.length)return;
    setCleaningUp(true);
    await Promise.all(affected.flatMap(r=>[
      ...getSlips(r).map(s=>s.path?removeOrderFile(s.path):null),
      r.balancePaymentSlip?.path?removeOrderFile(r.balancePaymentSlip.path):null,
    ].filter(Boolean)));
    const affectedIds=new Set(affected.map(r=>r.id));
    const next=reports.map(r=>affectedIds.has(r.id)?{...r,bankInSlip:null,bankInSlips:[],bankInUploadedAt:null,balancePaymentSlip:null,balancePaymentUploadedAt:null}:r);
    setReports(next);
    await saveData(DAILY_SALES_KEY,next);
    setCleaningUp(false);
  };

  useEffect(()=>{
    reports.forEach(r=>{
      getSlips(r).forEach(async(s,i)=>{
        const key=`${r.id}_slip${i}`;
        if(s.path&&!slipUrls[key]){
          const url=await signFileUrl(s.path);
          if(url)setSlipUrls(p=>({...p,[key]:url}));
        }
      });
    });
    reports.filter(r=>r.balancePaymentSlip?.path&&!slipUrls[r.id+"_balance"]).forEach(async r=>{
      const url=await signFileUrl(r.balancePaymentSlip.path);
      if(url)setSlipUrls(p=>({...p,[r.id+"_balance"]:url}));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[reports]);

  const existingKeys=useMemo(()=>new Set(reports.map(r=>r.id)),[reports]);
  const lastSubmittedDate=useMemo(()=>reports.length?reports.reduce((max,r)=>r.date>max?r.date:max,reports[0].date):null,[reports]);
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
  const lateAlerts=useMemo(()=>reports.filter(r=>r.cashSales>0&&!getSlips(r).length&&daysSince(r.submittedAt)>=1),[reports]);
  // Slip uploaded but knock-off/admin hasn't verified it yet — a different
  // problem from the branch being slow to upload (this one's on the HQ
  // side). Short-payment cases have their own dedicated tracking, so they're
  // excluded here to avoid double-counting the same report two ways.
  const unverifiedAlerts=useMemo(()=>reports.filter(r=>r.cashSales>0&&getSlips(r).length&&!r.verifiedAt&&!r.shortPayment&&daysSince(r.bankInUploadedAt)>=1),[reports]);
  const unverifiedAlertsByBranch=useMemo(()=>{
    const groups={};
    unverifiedAlerts.forEach(r=>{(groups[r.branch]=groups[r.branch]||[]).push(r);});
    return Object.keys(groups).sort((a,b)=>(branchMeta[a]?.name||a).localeCompare(branchMeta[b]?.name||b)).map(b=>[b,groups[b]]);
  },[unverifiedAlerts,branchMeta]);
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
  // Includes reports that already have a slip but aren't verified yet — so
  // the branch can still replace a mis-uploaded slip right up until the
  // knock-off actually verifies it.
  const myPending=useMemo(()=>userBranch?reports.filter(r=>r.branch===userBranch&&r.cashSales>0&&!r.verifiedAt&&!r.shortPayment):[],[reports,userBranch]);
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
      const affectedCount=reports.filter(r=>r.date.slice(0,7)===cleanupMonth&&(getSlips(r).length||r.balancePaymentSlip)).length;
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
    {/* Branch-facing reminder — upload/replace panel shown directly, no expand click needed */}
    {myPending.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Bank In Cash Sales</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 8px",borderRadius:20}}>{myPending.length}</span>
      </div>
      {myPending.map(r=>{
        const late=daysSince(r.submittedAt)>=1;
        const slips=getSlips(r);
        return<div key={r.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
          <div style={{fontSize:12,color:late?"#DC2626":C.text,fontWeight:600,marginBottom:6}}>
            {slips.length?`${slips.length} slip${slips.length>1?"s":""} uploaded for `:`Bank in ${fRM(r.cashSales)} for `}{fDate(r.date)}{late?` — ${daysSince(r.submittedAt)} day${daysSince(r.submittedAt)>1?"s":""} late`:""}
            {slips.length>0&&<span style={{color:C.textLight,fontWeight:500}}> — add another if you banked in across more than one transaction, or remove one below if it was a mistake</span>}
          </div>
          <UploadSlipBox report={r} onSaved={save}/>
        </div>;
      })}
    </div>}

    {/* Branch-facing reminder for short-payment balance slip */}
    {myBalancePending.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Balance Payment Needed</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"1px 8px",borderRadius:20}}>{myBalancePending.length}</span>
      </div>
      {myBalancePending.map(r=><div key={r.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
        <div style={{fontSize:12,color:"#B45309",fontWeight:600,marginBottom:6}}>{fDate(r.date)} — {r.shortPaymentRemark}</div>
        <UploadBalanceSlipBox report={r} onSaved={save}/>
      </div>)}
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

    {/* HQ-level — slip uploaded but not yet verified by knock-off/admin */}
    {!userBranch&&unverifiedAlerts.length>0&&<div style={{...card,borderLeft:"3px solid #1D4ED8",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Payment Slip Not Verified</span>
        <span style={{fontSize:10,fontWeight:700,color:"#1D4ED8",background:"#EFF6FF",padding:"1px 8px",borderRadius:20}}>{unverifiedAlerts.length}</span>
      </div>
      {unverifiedAlertsByBranch.map(([b,items])=>(
        <div key={b} style={{marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:3}}>{branchMeta[b]?.name||b}</div>
          {items.map(r=><div key={r.id} onClick={()=>jumpToReport(r)} style={{fontSize:12,color:"#1D4ED8",padding:"2px 0 2px 10px",cursor:"pointer",textDecoration:"underline",textDecorationColor:"transparent"}} onMouseEnter={e=>e.currentTarget.style.textDecorationColor="#1D4ED8"} onMouseLeave={e=>e.currentTarget.style.textDecorationColor="transparent"}>Report dated {fDate(r.date)}, slip uploaded {daysSince(r.bankInUploadedAt)} day{daysSince(r.bankInUploadedAt)>1?"s":""} ago — still not verified</div>)}
        </div>
      ))}
    </div>}

    {userBranch
      ?<BranchMonthlyReport branchMeta={branchMeta} userBranch={userBranch} reports={reports}/>
      :<BatchSubmitForm branchMeta={branchMeta} reports={reports} isAdmin={isAdmin} canSubmit={canSubmit} canVerify={canVerify} email={email} onSavedAll={saveAll} onSaved={save} onDelete={deleteReport} existingKeys={existingKeys}/>}

    {/* Monthly bank-in report — always one branch's full month, never every branch mixed together. Super admin only now — branch viewers no longer get this download. */}
    {isAdmin&&<div style={{...card,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:12,fontWeight:700,color:C.text}}>Daily Sales Bank-in Report</span>
      <SEL value={bankInReportBranch} onChange={e=>setBankInReportBranch(e.target.value)} style={{width:"auto",padding:"7px 9px",fontSize:12}}>
        <option value="">Choose a branch…</option>
        {dailySalesBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
      </SEL>
      <input type="month" value={exportMonth} onChange={e=>setExportMonth(e.target.value)} style={{padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontFamily:"Inter,sans-serif"}}/>
      <GBtn onClick={()=>downloadMonthlyBankInPDF(reports,branchMeta,exportMonth,bankInReportBranch)} disabled={!bankInReportBranch} style={{fontSize:11,padding:"7px 12px"}}>Download (PDF)</GBtn>
      <span style={{fontSize:10,color:C.textLight}}>One branch, one full month — sales date, bank-in date, method, amount.</span>
    </div>}

    {canSeeActionPanel&&<div ref={verificationQueueRef} style={{...card}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Verification Queue</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Date:</span>
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} max={nowDate()} style={{padding:"5px 9px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,fontSize:11,background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"Inter,sans-serif"}}/>
        </div>
      </div>
      {lastSubmittedDate&&<div style={{padding:"6px 16px",fontSize:10,color:C.textLight,borderBottom:`1px solid ${C.border}`}}>Last submitted sales date by admin: <b style={{color:C.textMid}}>{fDate(lastSubmittedDate)}</b></div>}
      {visible.length===0
        ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No reports for this date.</div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10,padding:"12px 16px"}}>{visible.map(r=>{
          const canUploadSlip=r.cashSales>0&&!r.verifiedAt&&isAdmin&&!userBranch;
          const canVerifyThis=r.cashSales>0&&getSlips(r).length>0&&!r.verifiedAt&&!r.shortPayment&&canVerify;
          // Short payment follow-up — Knock-off role (canVerify) or Super
          // Admin can flag it as soon as a bank-in slip is uploaded, an
          // alternative to Verify for when the slip amount is short.
          const canFlagShortPayment=r.cashSales>0&&canVerify&&getSlips(r).length>0&&!r.verifiedAt&&!r.shortPayment;
          const canKeyIn2ndPayment=canVerify&&r.shortPayment&&r.balancePaymentSlip&&!r.secondPaymentVerifiedAt;
          // Edit lives here too now, not just in the Daily Sales Report
          // table — no need to go hunt for the same report under a
          // different date picker just to fix a payment method mistake.
          // Edit here is super-admin-only — unlike the Daily Sales Report
          // table below, where Billing can still edit their own unverified
          // submissions.
          const canEditThis=isAdmin;
          const editorRole=resolveEditorRole(email,["billing","knockoff","purchase","stock","superAdmin"])||(canSubmit?"Billing":canVerify?"Knock-off":isAdmin?"Super Admin":"Viewer");
          const editingHere=expandedVerificationEdit===r.id;
          // Every row collapses to a compact card by default now (not just
          // resolved ones) — so a full day's worth of branches fits on
          // screen without heavy scrolling. Click "Details" to reveal the
          // slip link, verified info, and every action for that report.
          const detailsOpen=expandedResolvedDetails===r.id;
          return<div key={r.id} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",background:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{branchMeta[r.branch]?.name||r.branch}</div>
                <div style={{fontSize:10,color:C.textLight}}>{fDate(r.date)}</div>
              </div>
              <StatusBadge report={r}/>
            </div>
            <div style={{marginTop:6}}><span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#F0FDF4",color:"#15803D"}}>Cash: {fRM(r.cashSales)}</span></div>
            {r.shortPayment&&<div style={{fontSize:10,color:"#B45309",marginTop:4,fontWeight:600}}>Short Payment — {r.shortPaymentRemark}</div>}
            <button onClick={()=>setExpandedResolvedDetails(detailsOpen?null:r.id)} style={{marginTop:7,fontSize:10,fontWeight:700,color:C.blueBright,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",padding:0}}>{detailsOpen?"Hide Details ▲":"Details ▼"}</button>
            {detailsOpen&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
              {r.remark&&<div style={{fontSize:11,color:C.textLight,marginBottom:5}}>Remark: {r.remark}</div>}
              {r.verifiedAt&&<div style={{fontSize:11,color:"#15803D",marginBottom:3,fontWeight:600}}>Verified — {getPaymentEntries(r).map((e,i)=>`${e.method} · ${fDate(e.date)} · ${fRM(e.amount)}`).join(" + ")} = {fRM(totalVerifiedAmount(r))} received</div>}
              {r.secondPaymentVerifiedAt&&<div style={{fontSize:11,color:"#15803D",marginBottom:3,fontWeight:600}}>2nd Payment — {r.secondPaymentMethod} · {fDate(r.secondPaymentDate)} · {fRM(r.secondPaymentAmount)} received</div>}
              {getSlips(r).map((s,i)=><div key={i} style={{marginBottom:4}}>{slipUrls[`${r.id}_slip${i}`]?<a href={slipUrls[`${r.id}_slip${i}`]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.blueBright,fontWeight:600}}>View Bank-in Slip {getSlips(r).length>1?i+1:""}: {s.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading slip link…</span>}</div>)}
              {r.balancePaymentSlip&&<div style={{marginBottom:4}}>{slipUrls[r.id+"_balance"]?<a href={slipUrls[r.id+"_balance"]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#B45309",fontWeight:600}}>View Balance Payment Slip: {r.balancePaymentSlip.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading slip link…</span>}</div>}
              {canUploadSlip&&<div style={{marginTop:6}}><UploadSlipBox report={r} onSaved={save}/></div>}
              {canVerifyThis&&(expandedVerify===r.id
                ?<VerifyBox report={r} onSaved={async(u)=>{await save(u);setExpandedVerify(null);}}/>
                :<GBtn onClick={()=>setExpandedVerify(r.id)} style={{marginTop:6,fontSize:11,padding:"6px 12px"}}>Verify Bank-in</GBtn>)}
              {canFlagShortPayment&&(expandedShortPayment===r.id
                ?<ShortPaymentBox report={r} onSaved={async(u)=>{await save(u);setExpandedShortPayment(null);}} onCancel={()=>setExpandedShortPayment(null)}/>
                :<GBtn onClick={()=>setExpandedShortPayment(r.id)} style={{marginTop:6,marginLeft:6,fontSize:11,padding:"6px 12px",color:"#B45309",borderColor:"#FDE68A"}}>Short Payment</GBtn>)}
              {canKeyIn2ndPayment&&<SecondPaymentBox report={r} onSaved={save}/>}
              {canEditThis&&!editingHere&&<GBtn onClick={()=>setExpandedVerificationEdit(r.id)} style={{marginTop:6,marginLeft:6,fontSize:11,padding:"6px 12px"}}>Edit</GBtn>}
              {canEditThis&&editingHere&&<div style={{marginTop:8}}><EditBox report={r} isAdmin={isAdmin} editorRole={editorRole} onSaved={async(u)=>{await save(u);setExpandedVerificationEdit(null);}} onCancel={()=>setExpandedVerificationEdit(null)}/></div>}
            </div>}
          </div>;
        })}</div>}
    </div>}
  </div>;
}
