/**
 * Stock Transfer — Stock role (order.html), Sophia, and Manager can create
 * a transfer record: fill in a Ref No, upload a PDF, pick From/To branch
 * and a date. Every branch involved (both sender and receiver) can see the
 * record, but only the receiving branch can click "Received".
 *
 * Once Received, nothing happens automatically. Whoever can create
 * transfers (Stock role / Sophia / Manager) reviews it and clicks
 * "Acknowledge" when ready — that removes it from the live list, but the
 * record itself stays in storage permanently (marked acknowledged) so it
 * still shows up in historical monthly reports. Both branch and admin can
 * download a monthly report; branch's report only covers transfers
 * involving their own branch, admin's covers everything.
 */
import {useState,useEffect,useRef} from "react";
import {loadData,saveData,supabase} from "./storage/index.js";
import {uploadOrderFile,signFileUrl} from "./storage/ordersApi.js";

const KEY="emax_v5_stock_transfers";
const BRANCHES=["HQ","KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM"];

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const nowDate=()=>new Date().toISOString().split("T")[0];
const nowStamp=()=>{const d=new Date();return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}, ${d.toLocaleTimeString("en-MY",{hour:"numeric",minute:"2-digit"})}`;};
const fDate=(s)=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};

function SecHdr({children}){
  return<div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</div>;
}
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{padding:"8px 16px",borderRadius:8,border:"none",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",fontWeight:700,fontSize:12,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.textMid,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const badge=(status)=>status==="pending"
  ?{bg:"#FFFBEB",fg:"#B45309",border:"#FDE68A",label:"Pending"}
  :{bg:"#F0FDF4",fg:"#15803D",border:"#BBF7D0",label:"Received"};
const Ic={
  download:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  chevDown:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
};

function downloadMonthlyReport(transfers,branchMeta,month,scopeBranch){
  const filtered=transfers
    .filter(t=>t.date&&t.date.slice(0,7)===month&&(!scopeBranch||t.from===scopeBranch||t.to===scopeBranch))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const monthLabel=new Date(month+"-01").toLocaleDateString("en-MY",{month:"long",year:"numeric"});
  const branchLabel=(id)=>branchMeta[id]?.name?`${branchMeta[id].name} (${id})`:id;
  const titleSuffix=scopeBranch?` — ${branchLabel(scopeBranch)}`:"";
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html><head><title>Stock Transfer Report — ${monthLabel}${titleSuffix}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,system-ui,sans-serif;}body{padding:24px;}
  h2{font-size:15px;font-weight:800;color:#0A1628;margin-bottom:2px;}.period{font-size:11px;color:#8A96A8;margin-bottom:16px;}
  table{border-collapse:collapse;width:100%;font-size:12px;}
  th{background:#0A1628;color:rgba(255,255,255,.8);padding:9px 14px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:left;}
  td{padding:8px 14px;border-bottom:1px solid #E4EAF2;}
  @page{size:A4;margin:12mm;}</style></head><body>
  <h2>Stock Transfer Report${titleSuffix} — EMAX NETWORK SDN BHD</h2>
  <div class="period">Month: ${monthLabel} · ${filtered.length} transfer${filtered.length!==1?"s":""}</div>
  <table><thead><tr><th>Ref No</th><th>From</th><th>To</th><th>Transfer Date</th><th>Status</th><th>Received</th></tr></thead>
  <tbody>${filtered.map(t=>`<tr><td>${t.refNo||"—"}</td><td>${branchLabel(t.from)}</td><td>${branchLabel(t.to)}</td><td>${fDate(t.date)}</td><td>${t.status==="pending"?"Pending":"Received"}</td><td>${t.receivedAt||"—"}</td></tr>`).join("")}</tbody></table>
  </body></html>`);
  w.document.close();setTimeout(()=>w.print(),400);
}

export default function StockTransferTab({canCreate=false,userBranch=null,branchMeta={},email=null}){
  const[transfers,setTransfers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showForm,setShowForm]=useState(false);
  const[refNo,setRefNo]=useState("");
  const[fromBranch,setFromBranch]=useState(BRANCHES[0]);
  const[toBranch,setToBranch]=useState(BRANCHES[1]);
  const[transferDate,setTransferDate]=useState(nowDate());
  const[file,setFile]=useState(null);
  const[uploading,setUploading]=useState(false);
  const[fileUrls,setFileUrls]=useState({});
  const[reportMonth,setReportMonth]=useState(nowDate().slice(0,7));
  const[reportsExpanded,setReportsExpanded]=useState(false);

  const load=async()=>{
    const data=(await loadData(KEY))||[];
    setTransfers(data);
    setLoading(false);
  };

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    const channel=supabase.channel("stock-transfer-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_storage",filter:`key=eq.${KEY}`},load)
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const save=async(next)=>{
    setTransfers(next);
    await saveData(KEY,next);
  };

  const addTransfer=async()=>{
    if(!file||!refNo.trim()||fromBranch===toBranch)return;
    setUploading(true);
    try{
      const id=`transfer_${Date.now()}`;
      const uploaded=await uploadOrderFile(id,file,file.name);
      const record={
        id,refNo:refNo.trim(),from:fromBranch,to:toBranch,date:transferDate,
        file:{name:uploaded.name,path:uploaded.path},
        status:"pending",uploadedAt:nowStamp(),
      };
      await save([record,...transfers]);
      setShowForm(false);
      setFile(null);
      setRefNo("");
    }catch(e){
      alert("Upload failed — please try again.");
    }
    setUploading(false);
  };

  const markReceived=async(id)=>{
    const next=transfers.map(t=>t.id===id?{...t,status:"received",receivedAt:nowStamp(),receivedAtMs:Date.now()}:t);
    await save(next);
  };

  // Removes the record from the live list, but keeps it in storage
  // permanently — still counted in historical monthly reports going
  // forward, just no longer cluttering the active view.
  const acknowledge=async(id)=>{
    if(!window.confirm("Acknowledge this transfer? It will be removed from this list but stays available in monthly reports."))return;
    const next=transfers.map(t=>t.id===id?{...t,acknowledged:true,acknowledgedAt:nowStamp()}:t);
    await save(next);
  };

  const openFile=async(path)=>{
    if(fileUrls[path]){window.open(fileUrls[path],"_blank");return;}
    const url=await signFileUrl(path);
    if(!url){alert("Couldn't open this file.");return;}
    setFileUrls(p=>({...p,[path]:url}));
    window.open(url,"_blank");
  };

  // Live list — admin sees everything not yet acknowledged; a branch sees
  // only transfers it's involved in (as sender or receiver), also not yet
  // acknowledged. Acknowledged records still exist, they're just not
  // shown here — the monthly report below reads from the full unfiltered
  // list, acknowledged or not.
  const involved=canCreate?transfers:transfers.filter(t=>t.from===userBranch||t.to===userBranch);
  const visible=involved.filter(t=>!t.acknowledged);

  const branchLabel=(id)=>branchMeta[id]?.name?`${branchMeta[id].name} (${id})`:id;

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {canCreate&&!showForm&&<div style={{marginBottom:10}}><PBtn onClick={()=>setShowForm(true)} style={{background:C.navy,boxShadow:"0 2px 8px rgba(10,22,40,.35)"}}>+ New Transfer</PBtn></div>}

    {canCreate&&showForm&&<div style={{...card,marginBottom:14}}>
      <SecHdr>New Transfer</SecHdr>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:10,maxWidth:420}}>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Stock Transfer Ref No</label>
          <input type="text" value={refNo} onChange={e=>setRefNo(e.target.value)} placeholder="e.g. ST-2026-0093" style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>From Branch</label>
            <select value={fromBranch} onChange={e=>setFromBranch(e.target.value)} style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif"}}>
              {BRANCHES.map(b=><option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>To Branch</label>
            <select value={toBranch} onChange={e=>setToBranch(e.target.value)} style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"Inter,sans-serif"}}>
              {BRANCHES.map(b=><option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </div>
        </div>
        {fromBranch===toBranch&&<div style={{fontSize:11,color:"#DC2626"}}>From and To branch can't be the same.</div>}
        <div>
          <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Transfer Date</label>
          <input type="date" value={transferDate} onChange={e=>setTransferDate(e.target.value)} style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Transfer PDF</label>
          <input type="file" accept=".pdf" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:12,width:"100%"}}/>
          {file&&<div style={{fontSize:10,color:"#15803D",marginTop:3,fontWeight:600}}>{file.name}</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <PBtn onClick={addTransfer} disabled={!file||!refNo.trim()||fromBranch===toBranch||uploading}>{uploading?"Uploading…":"Upload Transfer"}</PBtn>
          <GBtn onClick={()=>{setShowForm(false);setFile(null);setRefNo("");}} disabled={uploading}>Cancel</GBtn>
        </div>
      </div>
    </div>}

    <div style={{...card}}>
      <SecHdr>Stock Transfer</SecHdr>
      <div>
        {visible.length===0
          ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No transfers to show.</div>
          :visible.map((t,i)=>{
            const b=badge(t.status);
            const canReceive=t.status==="pending"&&(canCreate?false:t.to===userBranch);
            const canAcknowledge=canCreate&&t.status==="received";
            return<div key={t.id} style={{padding:"12px 16px",borderBottom:i<visible.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:4}}>
                <div>
                  <div style={{fontSize:10,color:C.textLight,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.04em"}}>{t.refNo}</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginTop:2}}>{branchLabel(t.from)} → {branchLabel(t.to)}</div>
                  <div style={{fontSize:10,color:C.textLight,marginTop:2}}>Transfer date: {fDate(t.date)}</div>
                </div>
                <span style={{fontSize:10,fontWeight:700,color:b.fg,background:b.bg,border:`1px solid ${b.border}`,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap"}}>{b.label}</span>
              </div>
              <div style={{fontSize:11.5,marginBottom:4}}>
                <a href="#" onClick={e=>{e.preventDefault();openFile(t.file.path);}} style={{color:C.blueBright,textDecoration:"none"}}>{t.file.name}</a>
              </div>
              <div style={{fontSize:10,color:C.textLight}}>
                Uploaded {t.uploadedAt}
                {t.receivedAt&&<span style={{color:"#15803D"}}> · Received {t.receivedAt}</span>}
              </div>
              {(canReceive||canAcknowledge)&&<div style={{marginTop:8,display:"flex",gap:8}}>
                {canReceive&&<PBtn onClick={()=>markReceived(t.id)}>Mark as Received</PBtn>}
                {canAcknowledge&&<PBtn onClick={()=>acknowledge(t.id)}>Acknowledge</PBtn>}
              </div>}
            </div>;
          })}
      </div>
    </div>

    <div style={{...card,marginTop:12}}>
      <div onClick={()=>setReportsExpanded(p=>!p)} style={{cursor:"pointer",userSelect:"none",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{color:"rgba(255,255,255,.85)"}}>{Ic.download}</span><span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>Reports</span></div>
          <span style={{color:"rgba(255,255,255,.85)",transition:"transform .15s",transform:reportsExpanded?"rotate(180deg)":"none"}}>{Ic.chevDown}</span>
        </div>
      </div>
      {reportsExpanded&&<div style={{padding:16,borderTop:`1px solid ${C.border}`}}>
        <div style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",background:C.surface,display:"flex",flexDirection:"column",maxWidth:280}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:10}}>Stock Transfer Report</div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10,fontWeight:700,color:C.textMid,display:"block",marginBottom:3,textTransform:"uppercase"}}>Month</label>
            <input type="month" value={reportMonth} onChange={e=>setReportMonth(e.target.value)} style={{width:"100%",padding:"8px 10px",border:`1.5px solid ${C.border}`,borderRadius:7,fontSize:12,boxSizing:"border-box",fontFamily:"Inter,sans-serif"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:"auto"}}>
            <PBtn onClick={()=>downloadMonthlyReport(transfers,branchMeta,reportMonth,canCreate?null:userBranch)} style={{padding:"9px 12px",width:38,height:38,justifyContent:"center",flexShrink:0}}>{Ic.download}</PBtn>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
