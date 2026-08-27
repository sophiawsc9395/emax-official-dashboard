import {useState,useEffect,useMemo,Fragment} from "react";
import {listOrders} from "./storage/ordersApi.js";

const STEP_LABELS={1:"New Order Request",2:"Ordered",3:"Arrived HQ",4:"Dispatched to Branch",5:"Arrived Branch"};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const fDate=(d)=>{if(!d)return"—";const dt=new Date(d);if(isNaN(dt))return"—";return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});};
const signed=(n)=>n>=0?"+"+fRM(n):fRM(Math.abs(n));

// Desktop: real <table>, same TH/TD styling as BranchPerfTable (untouched,
// unaffected by any of this - kept purely visually consistent on desktop).
// Mobile (<640px): a dedicated card layout instead of reusing the table's
// horizontal-scroll behavior - every value gets its own clear label rather
// than relying on column position/alignment, which is what made narrow
// table cells hard to read in the first place.
const TH=(e={})=>({padding:"10px 10px",fontWeight:700,fontSize:10,background:"#0A1628",color:"rgba(255,255,255,.75)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"right",whiteSpace:"nowrap",...e});
const TD=(e={})=>({padding:"9px 10px",fontSize:12,borderBottom:"1px solid rgba(228,234,242,.7)",...e});

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

  const emptyMsg="Nothing outstanding — every order before Billing Request has Actual Purchase Price on file, or none are in progress right now.";

  return<div style={{background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #E4EAF2",boxShadow:"0 2px 8px rgba(10,22,40,.06)"}}>
    <style>{`
      .ept-desktop{display:block;}
      .ept-mobile{display:none;}
      @media (max-width:640px){
        .ept-desktop{display:none;}
        .ept-mobile{display:block;}
      }
      .ept-card{border-bottom:1px solid #E4EAF2;}
      .ept-card:last-child{border-bottom:none;}
      .ept-branch-head{display:flex;justifyContent:space-between;align-items:flex-start;gap:10px;padding:14px 16px;cursor:pointer;}
      .ept-branch-head:active{background:#F7F9FC;}
      .ept-order-card{padding:12px 16px 12px 30px;background:#FAFBFD;border-top:1px solid #E4EAF2;}
      .ept-stat-label{font-size:9px;color:#8A96A8;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;}
      .ept-stat-value{font-size:13px;color:#0A1628;font-weight:700;margin-top:1px;}
    `}</style>
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
      ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>{emptyMsg}</div>
      :<>
        {/* Desktop: table, identical styling to Branch Performance */}
        <div className="ept-desktop" style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:480}}>
            <thead><tr>
              <th style={TH({textAlign:"left"})}>Branch</th>
              <th style={TH()}>Orders</th>
              <th style={TH()}>Expected Profit</th>
            </tr></thead>
            <tbody>
              {byBranch.branches.map(b=>{
                const branchOrders=byBranch.groups[b];
                const branchTotal=branchOrders.reduce((s,o)=>s+o.expectedProfit,0);
                const open=expandedBranches.has(b);
                return<Fragment key={b}>
                  <tr className="shine-row" style={{background:"#fff",cursor:"pointer"}} onClick={()=>toggleBranch(b)}>
                    <td style={{...TD({textAlign:"left"})}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{display:"inline-block",transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10,flexShrink:0}}>▶</span>
                        <div>
                          <div style={{fontWeight:700,color:"#0A1628",fontSize:12,textTransform:"uppercase"}}>{branchMeta?.[b]?.name||b}</div>
                          <div style={{fontSize:10,color:"#5A6472",marginTop:1}}>{branchMeta?.[b]?.manager}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568"}}>{branchOrders.length}</span></td>
                    <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontWeight:700}}>{signed(branchTotal)}</span></td>
                  </tr>
                  {open&&branchOrders.map(o=><tr key={o.id} className="shine-row" style={{background:"#FAFBFD",cursor:"pointer"}} onClick={e=>{e.stopPropagation();onOrderClick?.(o.id);}}>
                    <td colSpan={2} style={{...TD({textAlign:"left"})}}>
                      <div style={{paddingLeft:18,fontSize:12,fontWeight:600,color:"#0A1628"}}>{o.phoneModel||"—"}</div>
                      <div style={{paddingLeft:18,fontSize:10,color:"#8A96A8",marginTop:2}}>
                        {STEP_LABELS[o.step]}{o.stepDates?.[o.step]?.date?` (${fDate(o.stepDates[o.step].date)})`:""}
                        {o.orderType!=="cash"&&<> · Merchant Approval: {fDate(o.aeonApprovalDate)}</>}
                      </div>
                    </td>
                    <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontWeight:600}}>{signed(o.expectedProfit)}</span></td>
                  </tr>)}
                </Fragment>;
              })}
            </tbody>
            <tfoot><tr style={{background:"#0A1628",fontSize:11}}>
              <td style={{padding:"9px 10px",fontWeight:600,color:"rgba(255,255,255,.6)",whiteSpace:"nowrap"}}>Total</td>
              <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{list.length}</span></td>
              <td style={{padding:"9px 10px",textAlign:"right",whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,.6)"}}>{signed(grandTotal)}</span></td>
            </tr></tfoot>
          </table>
        </div>

        {/* Mobile: dedicated card layout - every value labeled, nothing
            relying on column position to be understood */}
        <div className="ept-mobile">
          {byBranch.branches.map(b=>{
            const branchOrders=byBranch.groups[b];
            const branchTotal=branchOrders.reduce((s,o)=>s+o.expectedProfit,0);
            const open=expandedBranches.has(b);
            return<div className="ept-card" key={b}>
              <div className="ept-branch-head" onClick={()=>toggleBranch(b)}>
                <div style={{display:"flex",alignItems:"flex-start",gap:8,minWidth:0}}>
                  <span style={{display:"inline-block",marginTop:3,transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10,flexShrink:0}}>▶</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,color:"#0A1628",fontSize:13,textTransform:"uppercase"}}>{branchMeta?.[b]?.name||b}</div>
                    <div style={{fontSize:11,color:"#5A6472",marginTop:1}}>{branchMeta?.[b]?.manager}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:16,flexShrink:0}}>
                  <div style={{textAlign:"right"}}>
                    <div className="ept-stat-label">Orders</div>
                    <div className="ept-stat-value">{branchOrders.length}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="ept-stat-label">Profit</div>
                    <div className="ept-stat-value">{signed(branchTotal)}</div>
                  </div>
                </div>
              </div>
              {open&&branchOrders.map(o=><div key={o.id} className="ept-order-card" onClick={()=>onOrderClick?.(o.id)}>
                <div style={{fontSize:13,fontWeight:700,color:"#0A1628",marginBottom:6}}>{o.phoneModel||"—"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <div>
                    <div className="ept-stat-label">Current Step</div>
                    <div style={{fontSize:12,color:"#4A5568",marginTop:1}}>{STEP_LABELS[o.step]}{o.stepDates?.[o.step]?.date?` (${fDate(o.stepDates[o.step].date)})`:""}</div>
                  </div>
                  {o.orderType!=="cash"&&<div>
                    <div className="ept-stat-label">Merchant Approval</div>
                    <div style={{fontSize:12,color:"#4A5568",marginTop:1}}>{fDate(o.aeonApprovalDate)}</div>
                  </div>}
                  <div>
                    <div className="ept-stat-label">Expected Profit</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0A1628",marginTop:1}}>{signed(o.expectedProfit)}</div>
                  </div>
                </div>
              </div>)}
            </div>;
          })}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:"#0A1628"}}>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)"}}>Total ({list.length})</div>
            <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{signed(grandTotal)}</div>
          </div>
        </div>
      </>}
  </div>;
}
