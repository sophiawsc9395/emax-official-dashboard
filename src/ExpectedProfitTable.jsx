import {useState,useEffect,useMemo,Fragment} from "react";
import {listOrders} from "./storage/ordersApi.js";

const STEP_LABELS={1:"New Order Request",2:"Ordered",3:"Arrived HQ",4:"Dispatched to Branch",5:"Arrived Branch"};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const fDate=(d)=>{if(!d)return"—";const dt=new Date(d);if(isNaN(dt))return"—";return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});};
const signed=(n)=>n>=0?"+"+fRM(n):fRM(Math.abs(n));

// Mobile-responsive via CSS only - div-based flex rows that reflow to a
// stacked layout under 640px, rather than a <table> (which can't easily
// restructure itself at narrow widths). Self-contained: fetches its own
// order data lazily on mount, so any page can just drop this in.
export default function ExpectedProfitTable({branchMeta,onOrderClick}){
  const [orders,setOrders]=useState(null);
  useEffect(()=>{listOrders().then(setOrders);},[]);
  const [expandedBranches,setExpandedBranches]=useState(()=>new Set());
  const toggleBranch=(b)=>setExpandedBranches(prev=>{
    const next=new Set(prev);
    next.has(b)?next.delete(b):next.add(b);
    return next;
  });

  const list=useMemo(()=>{
    if(!orders)return[];
    return orders.filter(o=>{
      if(o.cancelled||!(o.step>=1&&o.step<=5))return false;
      const sellPrice=o.orderType==="cash"?o.retailPrice:o.financePrice;
      return parseFloat(sellPrice)>0&&parseFloat(o.actualPrice)>0;
    }).map(o=>{
      const sellPrice=parseFloat(o.orderType==="cash"?o.retailPrice:o.financePrice)||0;
      return{...o,expectedProfit:sellPrice-(parseFloat(o.actualPrice)||0)};
    }).sort((a,b)=>b.id-a.id);
  },[orders]);

  const byBranch=useMemo(()=>{
    const groups={};
    list.forEach(o=>{(groups[o.branch]||=[]).push(o);});
    const branches=Object.keys(groups).sort((a,b)=>
      groups[b].reduce((s,o)=>s+o.expectedProfit,0)-groups[a].reduce((s,o)=>s+o.expectedProfit,0)
    );
    return{groups,branches};
  },[list]);

  const grandTotal=list.reduce((s,o)=>s+o.expectedProfit,0);

  return<div>
    <style>{`
      .ept-row{display:flex;align-items:center;gap:10px;padding:10px;border-top:1px solid rgba(228,234,242,.7);cursor:pointer;}
      .ept-row:hover{background:#F7F9FC;}
      .ept-col-branch{flex:1;min-width:0;}
      .ept-col-orders{width:70px;text-align:right;flex-shrink:0;}
      .ept-col-profit{width:120px;text-align:right;flex-shrink:0;}
      .ept-order-row .ept-col-branch{padding-left:18px;}
      @media (max-width:640px){
        .ept-row{flex-wrap:wrap;}
        .ept-col-branch{flex-basis:100%;}
        .ept-col-orders{display:none;}
        .ept-col-profit{width:auto;text-align:left;margin-left:18px;}
        .ept-order-row .ept-col-branch{padding-left:0;}
      }
    `}</style>
    <div style={{background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #E4EAF2",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #E4EAF2",flexWrap:"wrap",gap:8}}>
        <div>
          <h3 style={{fontWeight:800,fontSize:14,color:"#0A1628",margin:0}}>Expected Profit by Branch</h3>
          <div style={{fontSize:11,color:"#5A6472",marginTop:2}}>{list.length} order{list.length===1?"":"s"} pending billing, across {byBranch.branches.length} branch{byBranch.branches.length===1?"":"es"}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"#5A6472"}}>Total Expected Profit</div>
          <div style={{fontWeight:700,fontSize:14,color:"#0A1628"}}>{signed(grandTotal)}</div>
        </div>
      </div>
      {orders===null
        ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>Loading…</div>
        :byBranch.branches.length===0
        ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>Nothing outstanding — every order before Billing Request has Actual Purchase Price on file, or none are in progress right now.</div>
        :<div>
          <div className="ept-row" style={{borderTop:"none",cursor:"default",background:"#F7F9FC",fontSize:10,fontWeight:700,color:"#8A96A8",textTransform:"uppercase",letterSpacing:"0.05em"}}>
            <div className="ept-col-branch">Branch</div>
            <div className="ept-col-orders">Orders</div>
            <div className="ept-col-profit">Expected Profit</div>
          </div>
          {byBranch.branches.map(b=>{
            const branchOrders=byBranch.groups[b];
            const branchTotal=branchOrders.reduce((s,o)=>s+o.expectedProfit,0);
            const open=expandedBranches.has(b);
            return<Fragment key={b}>
              <div className="ept-row" onClick={()=>toggleBranch(b)}>
                <div className="ept-col-branch" style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{display:"inline-block",transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10,flexShrink:0}}>▶</span>
                  <div>
                    <div style={{fontWeight:700,color:"#0A1628",fontSize:12,textTransform:"uppercase"}}>{branchMeta?.[b]?.name||b}</div>
                    <div style={{fontSize:10,color:"#5A6472",marginTop:1}}>{branchMeta?.[b]?.manager}</div>
                  </div>
                </div>
                <div className="ept-col-orders" style={{fontSize:12,color:"#4A5568"}}>{branchOrders.length}</div>
                <div className="ept-col-profit" style={{fontSize:12,fontWeight:700,color:"#4A5568"}}>{signed(branchTotal)}</div>
              </div>
              {open&&branchOrders.map(o=><div key={o.id} className="ept-row ept-order-row" style={{background:"#FAFBFD"}} onClick={e=>{e.stopPropagation();onOrderClick?.(o.id);}}>
                <div className="ept-col-branch">
                  <div style={{fontSize:12,color:"#0A1628"}}>{o.phoneModel||"—"}</div>
                  <div style={{fontSize:10,color:"#8A96A8",marginTop:1}}>{STEP_LABELS[o.step]}{o.stepDates?.[o.step]?.date?` (${fDate(o.stepDates[o.step].date)})`:""}</div>
                  {o.orderType!=="cash"&&<div style={{fontSize:10,color:"#8A96A8",marginTop:1}}>Merchant Approval: {fDate(o.aeonApprovalDate)}</div>}
                </div>
                <div className="ept-col-orders"></div>
                <div className="ept-col-profit" style={{fontSize:12,fontWeight:600,color:"#4A5568"}}>{signed(o.expectedProfit)}</div>
              </div>)}
            </Fragment>;
          })}
          <div className="ept-row" style={{cursor:"default",background:"#0A1628",fontSize:11}}>
            <div className="ept-col-branch" style={{fontWeight:600,color:"rgba(255,255,255,.6)"}}>Total</div>
            <div className="ept-col-orders" style={{color:"rgba(255,255,255,.6)"}}>{list.length}</div>
            <div className="ept-col-profit" style={{color:"rgba(255,255,255,.6)"}}>{signed(grandTotal)}</div>
          </div>
        </div>}
    </div>
  </div>;
}
