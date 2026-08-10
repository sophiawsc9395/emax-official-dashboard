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

const KEY="emax_v5_daily_payment";
const SOPHIA_EMAIL="sophiawsc9395@gmail.com";

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const nowDate=()=>new Date().toISOString().split("T")[0];
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const nowStamp=()=>{const d=new Date();return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;};

const statusMeta={
  pending:{label:"Pending",bg:"#FFFBEB",fg:"#B45309",border:"#FDE68A"},
  completed:{label:"Completed",bg:"#EFF6FF",fg:"#1E6FDB",border:"#BFDBFE"},
  printed:{label:"Printed",bg:"#F0FDF4",fg:"#15803D",border:"#BBF7D0"},
};

function SecHdr({children}){
  return<div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</div>;
}
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{padding:"6px 14px",borderRadius:7,border:"none",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",fontWeight:700,fontSize:11,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.border}`,background:"#fff",color:C.textMid,fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

export default function DailyPaymentTab({email}){
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

  const isSophia=(email||"").toLowerCase()===SOPHIA_EMAIL;

  useEffect(()=>{
    (async()=>{
      const list=(await loadData(KEY))||[];
      setEntries(list);
      setLoading(false);
    })();
  },[]);

  const save=async(next)=>{setEntries(next);await saveData(KEY,next);};

  const addEntry=async()=>{
    if(!file||!payeeName.trim()||!description.trim())return;
    setUploading(true);
    const id=`dp_${Date.now()}`;
    const uploaded=await uploadOrderFile(id,file,file.name);
    const entry={
      id,date:nowDate(),file:uploaded,payeeName:payeeName.trim(),description:description.trim(),
      status:"pending",uploadedAt:nowStamp(),completedAt:null,printedAt:null,
    };
    await save([entry,...entries]);
    setPayeeName("");setDescription("");setFile(null);setShowUpload(false);
    setUploading(false);
  };

  const markCompleted=async(id)=>{
    await save(entries.map(e=>e.id!==id?e:{...e,status:"completed",completedAt:nowStamp()}));
  };
  const markPrinted=async(id)=>{
    await save(entries.map(e=>e.id!==id?e:{...e,status:"printed",printedAt:nowStamp()}));
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

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  const renderRow=(e,i,list)=>{
    const sm=statusMeta[e.status];
    return<div key={e.id} style={{padding:"12px 16px",borderBottom:i<list.length-1?`1px solid ${C.border}`:"none",display:"flex",gap:10}}>
      {isSophia&&<input type="checkbox" checked={!!selected[e.id]} onChange={()=>toggleSelected(e.id)} style={{marginTop:3,cursor:"pointer"}}/>}
      <div style={{flex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:4}}>
          <div>
            <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{fDate(e.date)}</div>
            <div style={{fontSize:13,fontWeight:700,marginTop:2}}>
              <a href="#" onClick={ev=>{ev.preventDefault();openFile(e.file.path);}} style={{color:C.blueBright,textDecoration:"none"}}>{e.file.name}</a>
            </div>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:sm.fg,background:sm.bg,border:`1px solid ${sm.border}`,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{sm.label}</span>
        </div>
        <div style={{fontSize:12,color:C.textMid,marginBottom:2}}><strong style={{color:C.text}}>Payee:</strong> {e.payeeName}</div>
        <div style={{fontSize:12,color:C.textMid,marginBottom:6}}><strong style={{color:C.text}}>Description:</strong> {e.description||e.purchase}</div>
        <div style={{fontSize:10.5,color:C.textLight}}>Uploaded {e.uploadedAt}</div>
        {e.completedAt&&<div style={{fontSize:10.5,color:"#1E6FDB",marginTop:2}}>Sophia marked completed — keyed into Autocount {e.completedAt}</div>}
        {e.printedAt&&<div style={{fontSize:10.5,color:"#15803D",marginTop:2}}>Printed {e.printedAt}</div>}
        <div style={{marginTop:8,display:"flex",gap:8}}>
          {isSophia&&e.status==="pending"&&<PBtn onClick={()=>markCompleted(e.id)}>Mark Completed</PBtn>}
          {!isSophia&&e.status==="completed"&&<PBtn onClick={()=>markPrinted(e.id)}>Mark Printed</PBtn>}
        </div>
      </div>
    </div>;
  };

  const activeEntries=entries.filter(e=>e.status!=="printed");
  const historyEntries=entries.filter(e=>e.status==="printed");

  return<div>
    <div style={{...card}}>
      <SecHdr>Daily Payment</SecHdr>

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
