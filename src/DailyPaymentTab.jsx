/**
 * Daily Payment — Knock-off role uploads invoices (payment proof) on a
 * daily basis, each with a Payee Name and a short description.
 * Multiple uploads per day are expected (one per bank/payee), not just one.
 *
 * Workflow: Upload (Pending) → Sophia downloads it, keys it into Autocount
 * herself outside this app, then marks it Completed → Knock-off sees that
 * confirmation and marks it Printed once the physical copy is done.
 *
 * Visible only on knockoff.html — both emaxknockoff@gmail.com and Sophia
 * can reach it there, distinguished by email for who can do which action
 * (only Sophia marks Completed, only Knock-off marks Printed).
 */
import {useState,useEffect} from "react";
import {loadData,saveData} from "./storage/index.js";
import {uploadOrderFile,signFileUrl} from "./storage/ordersApi.js";

export const KEY="emax_v5_daily_payment";
const SOPHIA_EMAIL="sophiawsc9395@gmail.com";
// Emax keeps the original, un-suffixed key so all existing data stays
// exactly where it already is — the other 3 companies are new tabs, so
// they start fresh under their own keys.
export const COMPANIES=[{key:"emax",label:"Emax"},{key:"dojo",label:"Dojo"},{key:"espace",label:"Espace"},{key:"miniImpian",label:"Mini Impian"}];
export const keyFor=company=>company==="emax"?KEY:`${KEY}_${company}`;

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const nowDate=()=>new Date().toISOString().split("T")[0];
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const nowStamp=()=>{const d=new Date();return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};

const statusMeta={
  requested:{label:"Requested",bg:"#F5F0FF",fg:"#7C3AED",border:"#DDD6FE"},
  pending:{label:"Pending",bg:"#FFFBEB",fg:"#B45309",border:"#FDE68A"},
  rejected:{label:"Needs Re-upload",bg:"#FEF2F2",fg:"#DC2626",border:"#FECACA"},
  completed:{label:"Completed",bg:"#EFF6FF",fg:"#1E6FDB",border:"#BFDBFE"},
  printed:{label:"Printed",bg:"#F0FDF4",fg:"#15803D",border:"#BBF7D0"},
};

function SecHdr({children}){
  return<div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</div>;
}
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{padding:"6px 14px",borderRadius:7,border:"none",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",fontWeight:700,fontSize:11,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:"#fff",color:C.textMid,fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

export default function DailyPaymentTab({email}){
  const [company,setCompany]=useState("emax");
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showUpload,setShowUpload]=useState(false);
  const [payeeName,setPayeeName]=useState("");
  const [description,setDescription]=useState("");
  const [file,setFile]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [fileUrls,setFileUrls]=useState({});
  const [showHistory,setShowHistory]=useState(false);
  const [selected,setSelected]=useState({});
  const [completingId,setCompletingId]=useState(null);
  const [refNoInput,setRefNoInput]=useState("");
  const [rejectingId,setRejectingId]=useState(null);
  const [rejectReasonInput,setRejectReasonInput]=useState("");
  const [showRequest,setShowRequest]=useState(false);
  const [requestPayee,setRequestPayee]=useState("");
  const [requestDescription,setRequestDescription]=useState("");
  const [fulfillingId,setFulfillingId]=useState(null);
  const [fulfillFile,setFulfillFile]=useState(null);
  const [fulfilling,setFulfilling]=useState(false);

  const isSophia=(email||"").toLowerCase()===SOPHIA_EMAIL;

  useEffect(()=>{
    setLoading(true);
    setSelected({});
    setCompletingId(null);setRefNoInput("");
    setRejectingId(null);setRejectReasonInput("");
    setShowRequest(false);setRequestPayee("");setRequestDescription("");
    setFulfillingId(null);setFulfillFile(null);
    (async()=>{
      const list=(await loadData(keyFor(company)))||[];
      setEntries(list);
      setLoading(false);
    })();
  },[company]);

  const save=async(next)=>{setEntries(next);await saveData(keyFor(company),next);};

  const addEntry=async()=>{
    if(!file||!payeeName.trim()||!description.trim())return;
    setUploading(true);
    const id=`dp_${company}_${Date.now()}`;
    const uploaded=await uploadOrderFile(id,file,file.name);
    const entry={
      id,date:nowDate(),file:uploaded,payeeName:payeeName.trim(),description:description.trim(),
      status:"pending",uploadedAt:nowStamp(),completedAt:null,printedAt:null,
    };
    await save([entry,...entries]);
    setPayeeName("");setDescription("");setFile(null);setShowUpload(false);
    setUploading(false);
  };

  const markCompleted=async(id,refNo)=>{
    await save(entries.map(e=>e.id!==id?e:{...e,status:"completed",completedAt:nowStamp(),refNo:refNo.trim()}));
    setCompletingId(null);setRefNoInput("");
  };
  const markPrinted=async(id)=>{
    await save(entries.map(e=>e.id!==id?e:{...e,status:"printed",printedAt:nowStamp()}));
  };

  const rejectEntry=async(id,reason)=>{
    await save(entries.map(e=>e.id!==id?e:{...e,status:"rejected",rejectReason:reason.trim(),rejectedAt:nowStamp()}));
    setRejectingId(null);setRejectReasonInput("");
  };

  const requestFile=async()=>{
    if(!requestPayee.trim()||!requestDescription.trim())return;
    const id=`dp_${company}_${Date.now()}`;
    const entry={
      id,date:nowDate(),file:null,payeeName:requestPayee.trim(),description:requestDescription.trim(),
      status:"requested",requestedAt:nowStamp(),uploadedAt:null,completedAt:null,printedAt:null,
    };
    await save([entry,...entries]);
    setRequestPayee("");setRequestDescription("");setShowRequest(false);
  };

  // Shared by both "re-upload after rejection" and "fulfill a file request" —
  // both cases end the same way: a file gets uploaded and the entry moves
  // to Pending for Sophia to review, whether it's a correction or a
  // first-time fulfillment.
  const uploadForEntry=async(id)=>{
    if(!fulfillFile)return;
    setFulfilling(true);
    const uploaded=await uploadOrderFile(id,fulfillFile,fulfillFile.name);
    await save(entries.map(e=>e.id!==id?e:{...e,file:uploaded,status:"pending",uploadedAt:nowStamp()}));
    setFulfillingId(null);setFulfillFile(null);setFulfilling(false);
  };

  const toggleSelected=(id)=>setSelected(p=>({...p,[id]:!p[id]}));
  const selectedCount=Object.values(selected).filter(Boolean).length;
  const deleteSelected=async()=>{
    if(!selectedCount)return;
    if(!window.confirm(`Permanently delete ${selectedCount} payment record${selectedCount>1?"s":""}? This can't be undone.`))return;
    const idsToDelete=new Set(Object.keys(selected).filter(id=>selected[id]));
    await save(entries.filter(e=>!idsToDelete.has(e.id)));
    setSelected({});
  };

  const openFile=async(path)=>{
    if(fileUrls[path]){window.open(fileUrls[path],"_blank");return;}
    const signed=await signFileUrl(path);
    if(signed){setFileUrls(p=>({...p,[path]:signed}));window.open(signed,"_blank");}
  };

  const tabBar=<div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
    {COMPANIES.map(c=><button key={c.key} onClick={()=>setCompany(c.key)} style={{padding:"7px 16px",borderRadius:8,border:`1.5px solid ${company===c.key?C.blue:C.border}`,background:company===c.key?C.blue:"#fff",color:company===c.key?"#fff":C.textMid,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{c.label}</button>)}
  </div>;

  if(loading)return<div>{tabBar}<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div></div>;

  const renderRow=(e,i,list)=>{
    const sm=statusMeta[e.status];
    const needsUploadFromKnockOff=e.status==="rejected"||e.status==="requested";
    return<div key={e.id} style={{padding:"12px 16px",borderBottom:i<list.length-1?`1px solid ${C.border}`:"none",display:"flex",gap:10}}>
      {isSophia&&<input type="checkbox" checked={!!selected[e.id]} onChange={()=>toggleSelected(e.id)} style={{marginTop:3,cursor:"pointer"}}/>}
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:4}}>
          <div>
            <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{fDate(e.date)}</div>
            <div style={{fontSize:13,fontWeight:700,marginTop:2}}>
              {e.file
                ?<a href="#" onClick={ev=>{ev.preventDefault();openFile(e.file.path);}} style={{color:C.blueBright,textDecoration:"none"}}>{e.file.name}</a>
                :<span style={{color:C.textLight,fontStyle:"italic"}}>No file yet</span>}
            </div>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:sm.fg,background:sm.bg,border:`1px solid ${sm.border}`,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{sm.label}</span>
        </div>
        <div style={{fontSize:12,color:C.textMid,marginBottom:2}}><strong style={{color:C.text}}>Payee:</strong> {e.payeeName}</div>
        <div style={{fontSize:12,color:C.textMid,marginBottom:6}}><strong style={{color:C.text}}>Description:</strong> {e.description||e.purchase}</div>
        {e.status==="requested"
          ?<div style={{fontSize:10.5,color:"#7C3AED"}}>Requested by Sophia {e.requestedAt}</div>
          :<div style={{fontSize:10.5,color:C.textLight}}>Uploaded {e.uploadedAt}</div>}
        {e.rejectReason&&<div style={{fontSize:10.5,color:"#DC2626",marginTop:2}}>Rejected {e.rejectedAt} — {e.rejectReason}</div>}
        {e.completedAt&&<div style={{fontSize:10.5,color:"#1E6FDB",marginTop:2}}>Sophia marked completed — keyed into Autocount {e.completedAt}{e.refNo&&` · Ref No. ${e.refNo}`}</div>}
        {e.printedAt&&<div style={{fontSize:10.5,color:"#15803D",marginTop:2}}>Printed {e.printedAt}</div>}
        {isSophia&&completingId===e.id
          ?<div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input autoFocus value={refNoInput} onChange={ev=>setRefNoInput(ev.target.value)} onKeyDown={ev=>{if(ev.key==="Enter")markCompleted(e.id,refNoInput);}} placeholder="Ref No. (optional)…" style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,width:180}}/>
            <PBtn onClick={()=>markCompleted(e.id,refNoInput)}>Confirm</PBtn>
            <GBtn onClick={()=>{setCompletingId(null);setRefNoInput("");}}>Cancel</GBtn>
          </div>
          :isSophia&&rejectingId===e.id
          ?<div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input autoFocus value={rejectReasonInput} onChange={ev=>setRejectReasonInput(ev.target.value)} onKeyDown={ev=>{if(ev.key==="Enter"&&rejectReasonInput.trim())rejectEntry(e.id,rejectReasonInput);}} placeholder="Reason for rejection…" style={{padding:"6px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,width:220}}/>
            <PBtn onClick={()=>rejectEntry(e.id,rejectReasonInput)} disabled={!rejectReasonInput.trim()} style={{background:"linear-gradient(135deg,#DC2626,#B91C1C)"}}>Confirm Reject</PBtn>
            <GBtn onClick={()=>{setRejectingId(null);setRejectReasonInput("");}}>Cancel</GBtn>
          </div>
          :!isSophia&&needsUploadFromKnockOff&&fulfillingId===e.id
          ?<div style={{marginTop:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={ev=>setFulfillFile(ev.target.files[0]||null)} style={{fontSize:12}}/>
            <PBtn onClick={()=>uploadForEntry(e.id)} disabled={!fulfillFile||fulfilling}>{fulfilling?"Uploading…":"Upload"}</PBtn>
            <GBtn onClick={()=>{setFulfillingId(null);setFulfillFile(null);}} disabled={fulfilling}>Cancel</GBtn>
          </div>
          :<div style={{marginTop:8,display:"flex",gap:8}}>
            {isSophia&&e.status==="pending"&&<PBtn onClick={()=>{setCompletingId(e.id);setRefNoInput("");}}>Mark Completed</PBtn>}
            {isSophia&&e.status==="pending"&&<GBtn onClick={()=>{setRejectingId(e.id);setRejectReasonInput("");}} style={{color:"#DC2626",borderColor:"#FECACA"}}>Reject</GBtn>}
            {!isSophia&&e.status==="completed"&&<PBtn onClick={()=>markPrinted(e.id)}>Mark Printed</PBtn>}
            {!isSophia&&needsUploadFromKnockOff&&<PBtn onClick={()=>{setFulfillingId(e.id);setFulfillFile(null);}}>{e.status==="rejected"?"Re-upload":"Upload File"}</PBtn>}
          </div>}
      </div>
    </div>;
  };

  const activeEntries=entries.filter(e=>e.status!=="printed");
  const historyEntries=entries.filter(e=>e.status==="printed");

  return<div>
    {tabBar}
    <div style={{...card}}>
      <SecHdr>Daily Payment — {COMPANIES.find(c=>c.key===company)?.label}</SecHdr>

      {!isSophia&&<div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
        {!showUpload
          ?<PBtn onClick={()=>setShowUpload(true)}>+ Upload Today's Invoice</PBtn>
          :<div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:420}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Invoice File</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%"}}/>
              {file&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{file.name}</div>}
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Payee Name</label>
              <input value={payeeName} onChange={e=>setPayeeName(e.target.value)} placeholder="Who was paid…" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Description</label>
              <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short description…" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <PBtn onClick={addEntry} disabled={!file||!payeeName.trim()||!description.trim()||uploading}>{uploading?"Uploading…":"Upload"}</PBtn>
              <GBtn onClick={()=>{setShowUpload(false);setFile(null);setPayeeName("");setDescription("");}} disabled={uploading}>Cancel</GBtn>
            </div>
          </div>}
      </div>}

      {isSophia&&<div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
        {!showRequest
          ?<PBtn onClick={()=>setShowRequest(true)}>+ Request File</PBtn>
          :<div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:420}}>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Payee Name</label>
              <input value={requestPayee} onChange={e=>setRequestPayee(e.target.value)} placeholder="Who is this payment for…" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>What file do you need</label>
              <input value={requestDescription} onChange={e=>setRequestDescription(e.target.value)} placeholder="Describe what Knock-off should upload…" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <PBtn onClick={requestFile} disabled={!requestPayee.trim()||!requestDescription.trim()}>Send Request</PBtn>
              <GBtn onClick={()=>{setShowRequest(false);setRequestPayee("");setRequestDescription("");}}>Cancel</GBtn>
            </div>
          </div>}
      </div>}

      {isSophia&&selectedCount>0&&<div style={{padding:"10px 16px",background:"#FEF2F2",borderBottom:"1px solid #FECACA",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:11,color:"#B91C1C",fontWeight:600}}>{selectedCount} selected</span>
        <PBtn onClick={deleteSelected} style={{background:"linear-gradient(135deg,#DC2626,#B91C1C)"}}>Delete Selected</PBtn>
        <GBtn onClick={()=>setSelected({})}>Clear Selection</GBtn>
      </div>}

      <div>
        {activeEntries.length===0
          ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No invoices in progress.</div>
          :activeEntries.map((e,i)=>renderRow(e,i,activeEntries))}
      </div>
    </div>

    {isSophia&&<div style={{...card,marginTop:14}}>
      <button onClick={()=>setShowHistory(p=>!p)} style={{width:"100%",padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>History — Printed ({historyEntries.length})</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>{showHistory?"Hide":"Show"}</span>
      </button>
      {showHistory&&<div>
        {historyEntries.length===0
          ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>Nothing printed yet.</div>
          :historyEntries.map((e,i)=>renderRow(e,i,historyEntries))}
      </div>}
    </div>}
  </div>;
}
