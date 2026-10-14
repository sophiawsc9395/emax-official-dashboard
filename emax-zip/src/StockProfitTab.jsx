/**
 * Stock Profit Checker — Sophia uploads the "Stock Listing (Profit Margin)"
 * Excel export; it's parsed entirely in the browser (via SheetJS, already a
 * dependency of this project) and stored as structured, searchable data.
 * Every upload REPLACES the previous dataset entirely — no history kept,
 * by design. Search + Item Group filter is available to everyone (Sophia,
 * Boss, Manager, every branch); only Sophia can upload or remove the data.
 * Copying/selecting text and any export path is deliberately disabled for
 * everyone except Sophia, since this is sensitive cost/margin data.
 *
 * Source file layout (validated against a real export):
 *   Column B (index 1)  — Item Code
 *   Column F (index 5)  — Description
 *   Column K (index 10) — Cost
 *   Column N (index 13) — Price
 *   Column S (index 18) — Profit
 *   Column Z (index 25) — Profit % (stored as a decimal fraction, e.g.
 *                          0.3333 for 33.33% — multiplied by 100 on read)
 * A row starting with "Item Group :" in column A marks the start of a new
 * category — every item row that follows belongs to that group, until the
 * next "Item Group :" row changes it.
 */
import {useState,useEffect,useRef,useMemo} from "react";
import {loadData,saveData,supabase} from "./storage/index.js";
import * as XLSX from "xlsx";

const KEY="emax_v5_stock_profit";
const SOPHIA_EMAIL="sophiawsc9395@gmail.com";

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const fRM=(n=0)=>"RM "+(parseFloat(n)||0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
const nowStamp=()=>{const d=new Date();return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}, ${d.toLocaleTimeString("en-MY",{hour:"numeric",minute:"2-digit"})}`;};

function SecHdr({children}){
  return<div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{children}</div>;
}
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{padding:"8px 16px",borderRadius:8,border:"none",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",fontWeight:700,fontSize:12,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.textMid,fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

// ── Excel parsing ──────────────────────────────────────────────────────
// Reads every row as a plain array (header:1, so no assumptions about
// column names — this report's own header row is split oddly across
// merged cells anyway), tracks the running "Item Group" as rows are
// walked in order, and pulls each item's fields from their fixed column
// positions, validated against a real export of this report.
function parseStockProfitWorkbook(arrayBuffer){
  const wb=XLSX.read(arrayBuffer,{type:"array"});
  const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true});

  const num=v=>{
    if(v===null||v===undefined||v==="")return 0;
    const n=typeof v==="number"?v:parseFloat(String(v).replace(/,/g,""));
    return isNaN(n)?0:n;
  };
  const str=v=>v===null||v===undefined?"":String(v).trim();

  const items=[];
  let currentGroup="";
  rows.forEach(row=>{
    if(!row||!row.length)return;
    const first=row[0];
    if(typeof first==="string"&&first.trim()==="Item Group :"){
      // Column index 3 is always a clean, short group code (e.g. "B/TOOTH",
      // "H/PHONE") — reliable across every group in the source file. The
      // later text in this row (originally also being pulled in) is
      // inconsistent: usually a fuller name, but for any group with only
      // one item it becomes that item's own description instead, which
      // produced doubled-looking and sometimes outright wrong labels.
      currentGroup=str(row[3]);
      return;
    }
    const code=row[1];
    // Skip the header row itself ("Item Code" literally in this column),
    // and any fully-empty row.
    if(code===null||code===undefined||code==="")return;
    if(typeof code==="string"&&code.trim()==="Item Code")return;
    const desc=str(row[5])||str(code);
    const cost=num(row[10]);
    const price=num(row[13]);
    // Profit and Profit% are no longer read from the file — always
    // computed from Cost and Price, so they can never drift out of sync
    // with whatever cost/price actually got imported.
    const profit=price-cost;
    const pct=price!==0?(profit/price)*100:0;
    items.push({
      code:str(code),
      desc,
      cost,
      price,
      profit,
      pct,
      group:currentGroup,
    });
  });
  return items;
}

export default function StockProfitTab({email}){
  const[data,setData]=useState(null); // {items, updatedAt, updatedBy}
  const[loading,setLoading]=useState(true);
  const[query,setQuery]=useState("");
  const[groupFilter,setGroupFilter]=useState("");
  const[sortKey,setSortKey]=useState(null); // "profit" | "pct" | null
  const[sortDir,setSortDir]=useState("desc");
  const[uploading,setUploading]=useState(false);
  const[uploadMsg,setUploadMsg]=useState(null);
  const fileRef=useRef(null);

  const isSophia=(email||"").toLowerCase()===SOPHIA_EMAIL;
  const[unlocked,setUnlocked]=useState(()=>sessionStorage.getItem("emax_stock_profit_unlocked")==="1");
  const[pwInput,setPwInput]=useState("");
  const[pwError,setPwError]=useState(false);

  useEffect(()=>{
    (async()=>{
      const d=await loadData(KEY);
      setData(d||null);
      setLoading(false);
    })();
  },[]);

  // Live update — if Sophia uploads a new file from another device/tab,
  // everyone else's page refreshes automatically without needing a reload.
  useEffect(()=>{
    const channel=supabase.channel("stock-profit-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_storage",filter:`key=eq.${KEY}`},async()=>{
        const d=await loadData(KEY);
        setData(d||null);
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

  const handleUpload=async(file)=>{
    if(!file||!isSophia)return;
    setUploading(true);setUploadMsg(null);
    try{
      const buf=await file.arrayBuffer();
      const items=parseStockProfitWorkbook(buf);
      if(!items.length)throw new Error("No items found in this file — please check it's the right export.");
      const zeroCount=items.filter(i=>i.cost===0&&i.price===0&&i.profit===0&&i.pct===0).length;
      const record={items,updatedAt:new Date().toISOString(),updatedAtDisplay:nowStamp(),updatedBy:"Sophia"};
      await saveData(KEY,record);
      setData(record);
      setUploadMsg(`Uploaded ${items.length} items across ${new Set(items.map(i=>i.group)).size} item groups successfully.${zeroCount?` ${zeroCount} item${zeroCount>1?"s":""} had no pricing figures in the file and show as RM 0.00 — usually free gifts/demo units with no cost or price listed, not a parsing error.`:""}`);
    }catch(e){
      setUploadMsg("Upload failed: "+e.message);
    }
    setUploading(false);
    if(fileRef.current)fileRef.current.value="";
  };

  const handleRemove=async()=>{
    if(!isSophia)return;
    if(!window.confirm("Remove the current Stock Profit data? Everyone will see an empty checker until a new file is uploaded."))return;
    await saveData(KEY,null);
    setData(null);
  };

  const handleRemoveGroup=async(group)=>{
    if(!isSophia||!data)return;
    const countInGroup=data.items.filter(i=>i.group===group).length;
    if(!window.confirm(`Remove all ${countInGroup} item${countInGroup!==1?"s":""} in "${group}"? The rest of the data stays untouched.`))return;
    const remaining=data.items.filter(i=>i.group!==group);
    const record={...data,items:remaining,updatedAt:new Date().toISOString(),updatedAtDisplay:nowStamp()};
    await saveData(KEY,record);
    setData(record);
    setGroupFilter("");
  };

  const items=data?.items||[];
  const groups=useMemo(()=>[...new Set(items.map(i=>i.group).filter(Boolean))].sort(),[items]);

  const toggleSort=(key)=>{
    if(sortKey===key){setSortDir(d=>d==="desc"?"asc":"desc");}
    else{setSortKey(key);setSortDir("desc");}
  };

  const results=useMemo(()=>{
    let r=items;
    if(query.trim()){
      const q=query.trim().toLowerCase();
      r=r.filter(it=>it.code.toLowerCase().includes(q)||it.desc.toLowerCase().includes(q));
    }
    if(groupFilter)r=r.filter(it=>it.group===groupFilter);
    if(sortKey){
      r=[...r].sort((a,b)=>sortDir==="desc"?b[sortKey]-a[sortKey]:a[sortKey]-b[sortKey]);
    }
    return r;
  },[items,query,groupFilter,sortKey,sortDir]);

  const shown=results;

  const SortArrow=({active,dir})=><span style={{marginLeft:4,fontSize:9,opacity:active?1:.3}}>{active?(dir==="desc"?"▼":"▲"):"▼"}</span>;

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  if(!unlocked)return<div style={{...card,maxWidth:360,margin:"60px auto",padding:"28px 24px",textAlign:"center"}}>
    <div style={{fontSize:15,fontWeight:800,color:C.navy,marginBottom:4}}>Stock Profit Checker</div>
    <div style={{fontSize:12,color:C.textLight,marginBottom:18}}>This page contains sensitive cost and margin data. Enter the password to continue.</div>
    <input
      type="password"
      value={pwInput}
      onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
      onKeyDown={e=>{
        if(e.key!=="Enter")return;
        if(pwInput==="coffee"){sessionStorage.setItem("emax_stock_profit_unlocked","1");setUnlocked(true);}
        else{setPwError(true);setPwInput("");}
      }}
      placeholder="Password"
      autoFocus
      style={{width:"100%",padding:"10px 14px",border:`1.5px solid ${pwError?"#DC2626":C.border}`,borderRadius:8,fontSize:13,boxSizing:"border-box",fontFamily:"Inter,sans-serif",textAlign:"center",marginBottom:10}}
    />
    {pwError&&<div style={{fontSize:11,color:"#DC2626",marginBottom:10}}>Incorrect password — please try again.</div>}
    <PBtn onClick={()=>{
      if(pwInput==="coffee"){sessionStorage.setItem("emax_stock_profit_unlocked","1");setUnlocked(true);}
      else{setPwError(true);setPwInput("");}
    }} style={{width:"100%"}}>Unlock</PBtn>
  </div>;

  return<div
    style={!isSophia?{userSelect:"none",WebkitUserSelect:"none",MozUserSelect:"none"}:{}}
    onContextMenu={!isSophia?e=>e.preventDefault():undefined}
    onCopy={!isSophia?e=>e.preventDefault():undefined}
  >
    <div style={{...card}}>
      <SecHdr>Stock Profit Checker</SecHdr>

      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:11,color:C.textLight}}>
          {data
            ?<>Last updated <strong style={{color:C.text}}>{data.updatedAtDisplay}</strong></>
            :"No data uploaded yet."}
        </div>
        {isSophia&&<div style={{display:"flex",gap:8}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleUpload(e.target.files[0])}/>
          <PBtn onClick={()=>fileRef.current?.click()} disabled={uploading}>{uploading?"Parsing…":"+ Upload New Excel File"}</PBtn>
          {data&&<GBtn onClick={handleRemove} style={{color:"#DC2626",borderColor:"#FECACA"}}>Remove Data</GBtn>}
        </div>}
      </div>

      {uploadMsg&&<div style={{padding:"10px 16px",fontSize:11.5,color:uploadMsg.startsWith("Upload failed")?"#DC2626":"#1E6FDB",background:uploadMsg.startsWith("Upload failed")?"#FEF2F2":"#EFF6FF",borderBottom:`1px solid ${C.border}`}}>{uploadMsg}</div>}

      {!data
        ?<div style={{padding:"40px 16px",textAlign:"center",color:C.textLight,fontSize:13}}>
          {isSophia?"Upload an Excel file to get started.":"No stock profit data has been uploaded yet."}
        </div>
        :<>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:8,flexWrap:"wrap"}}>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Search by item code or description…"
              style={{flex:"1 1 260px",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,boxSizing:"border-box",fontFamily:"Inter,sans-serif"}}
            />
            <select
              value={groupFilter}
              onChange={e=>setGroupFilter(e.target.value)}
              style={{padding:"10px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",minWidth:200}}
            >
              <option value="">All Item Groups</option>
              {groups.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
            {isSophia&&groupFilter&&<GBtn onClick={()=>handleRemoveGroup(groupFilter)} style={{color:"#DC2626",borderColor:"#FECACA"}}>Remove "{groupFilter}" Group</GBtn>}
          </div>
          <div style={{padding:"0 16px 12px",fontSize:10.5,color:C.textLight}}>
            {results.length} item{results.length!==1?"s":""}{query.trim()||groupFilter?" found":" total"}
          </div>
          <div style={{overflowX:"auto",maxHeight:560,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12.5,minWidth:640}}>
              <thead style={{position:"sticky",top:0,zIndex:1}}>
                <tr style={{background:C.surface}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`}}>Item Code</th>
                  <th style={{padding:"8px 12px",textAlign:"left",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`}}>Description</th>
                  <th style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`}}>Cost</th>
                  <th style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:10,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`}}>Price</th>
                  <th onClick={()=>toggleSort("profit")} style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:10,color:sortKey==="profit"?C.blueBright:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none"}}>Profit<SortArrow active={sortKey==="profit"} dir={sortDir}/></th>
                  <th onClick={()=>toggleSort("pct")} style={{padding:"8px 12px",textAlign:"right",fontWeight:700,fontSize:10,color:sortKey==="pct"?C.blueBright:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",background:C.surface,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none"}}>Profit %<SortArrow active={sortKey==="pct"} dir={sortDir}/></th>
                </tr>
              </thead>
              <tbody>
                {shown.length===0
                  ?<tr><td colSpan={6} style={{padding:"30px 16px",textAlign:"center",color:C.textLight}}>No items match{query.trim()?` "${query}"`:""}{groupFilter?` in "${groupFilter}"`:""}.</td></tr>
                  :shown.map((it,i)=>(
                    <tr key={it.code+i} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":C.surface}}>
                      <td style={{padding:"8px 12px",fontWeight:700,color:C.blueBright,whiteSpace:"nowrap"}}>{it.code}</td>
                      <td style={{padding:"8px 12px",color:C.text}}>{it.desc}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",color:C.textMid,whiteSpace:"nowrap"}}>{fRM(it.cost)}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",color:C.textMid,whiteSpace:"nowrap"}}>{fRM(it.price)}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:it.profit>=0?"#15803D":"#DC2626",whiteSpace:"nowrap"}}>{fRM(it.profit)}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:it.profit>=0?"#15803D":"#DC2626",whiteSpace:"nowrap"}}>{it.pct.toFixed(2)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>}
    </div>
  </div>;
}
