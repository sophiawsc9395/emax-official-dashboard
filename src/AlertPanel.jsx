/**
 * Shared alert panel — the same layout as the Order page alerts:
 * coloured left bar, title + count, a column header row, then aligned rows
 * (Order/Item | Days badge | Details | optional Action).
 * items: [{key,title,sub,days,detail,action,onClick}]
 *   detail / action may be strings or React nodes.
 */
import {useState,useEffect} from "react";

const C={navy:"#0A1628",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8",surface:"#F7F9FC"};
const card={background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
// Same first two column widths as the Order page alerts, so everything lines up.
export const ALERT_ORDER_COL="clamp(220px,26vw,320px)";
const alertIcon=<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

function useNarrow(){
  const [n,setN]=useState(typeof window!=="undefined"&&window.innerWidth<720);
  useEffect(()=>{const f=()=>setN(window.innerWidth<720);window.addEventListener("resize",f);return()=>window.removeEventListener("resize",f);},[]);
  return n;
}

export default function AlertPanel({title,color,items,detailHeader="Details",orderHeader="Order",actionHeader="Action"}){
  const narrow=useNarrow();
  if(!items||!items.length)return null;
  const hasAction=items.some(i=>i.action);
  const grid=`${ALERT_ORDER_COL} 84px minmax(0,1fr)${hasAction?" 130px":""}`;
  return<div style={{...card,borderLeft:`3px solid ${color}`,padding:"12px 14px",marginBottom:14,overflow:"visible"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
      <span style={{color,flexShrink:0}}>{alertIcon}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>{title}</span>
      <span style={{fontSize:10,fontWeight:700,color,background:color+"15",padding:"1px 8px",borderRadius:20}}>{items.length}</span>
    </div>
    {!narrow&&<div style={{display:"grid",gridTemplateColumns:grid,gap:16,padding:"8px 8px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
      {[orderHeader,"Days",detailHeader,...(hasAction?[actionHeader]:[])].map(h=><div key={h} style={{fontSize:10,fontWeight:700,color:C.textLight,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</div>)}
    </div>}
    {items.map((it,i)=>{
      const orderCell=<div style={{minWidth:0}}>
        <div style={{fontSize:12.5,fontWeight:700,color:C.text,...(narrow?{}:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"})}}>{it.title}</div>
        {it.sub&&<div style={{fontSize:11,color:C.textLight,...(narrow?{}:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"})}}>{it.sub}</div>}
      </div>;
      const badge=it.days!=null?<span style={{fontSize:11,fontWeight:700,color,background:color+"15",border:`1px solid ${color}30`,padding:"3px 9px",borderRadius:20,whiteSpace:"nowrap"}}>{it.days} day{it.days===1?"":"s"}</span>:<span style={{fontSize:11,color:C.textLight}}>—</span>;
      const detail=<div style={{fontSize:12,color:C.text,lineHeight:1.35,wordBreak:"break-word",minWidth:0}}>{it.detail}</div>;
      const click=it.onClick?{onClick:it.onClick,cursor:"pointer"}:{};
      return narrow
        ?<div key={it.key??i} onClick={it.onClick} style={{display:"flex",flexDirection:"column",gap:6,padding:"11px 4px",borderTop:`1px solid ${C.border}`,cursor:it.onClick?"pointer":"default"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>{orderCell}{it.days!=null&&badge}</div>{detail}{it.action}
        </div>
        :<div key={it.key??i} onClick={it.onClick} style={{display:"grid",gridTemplateColumns:grid,gap:16,alignItems:"center",padding:"11px 8px",borderTop:`1px solid ${C.border}`,cursor:click.cursor||"default"}}>
          {orderCell}<div>{badge}</div>{detail}{hasAction&&<div style={{display:"flex",justifyContent:"flex-end"}}>{it.action}</div>}
        </div>;
    })}
  </div>;
}
