import {useState,useEffect,useMemo,Fragment} from "react";
import {listOrders} from "./storage/ordersApi.js";

const STEP_LABELS={1:"New Order Request",2:"Ordered",3:"Arrived HQ",4:"Dispatched to Branch",5:"Arrived Branch"};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const fDate=(d)=>{if(!d)return"—";const dt=new Date(d);if(isNaN(dt))return"—";return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});};
const signed=(n)=>n>=0?"+"+fRM(n):fRM(Math.abs(n));
const daysSince=(d)=>{if(!d)return null;const dt=new Date(d);if(isNaN(dt))return null;return Math.floor((Date.now()-dt.getTime())/86400000);};
// Under 3 days is normal turnaround; 3-6 is worth a glance; 7+ (with a ⚠)
// is the "sitting at the branch a long time and still not billed" case
// this whole Step view exists to surface.
const waitColor=(days)=>days===null?"#8A96A8":days>=7?"#DC2626":days>=3?"#B45309":"#4A5568";

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
  // Two independent grouping views over the exact same underlying orders —
  // Branch (original: which branch is sitting on the most unbilled profit)
  // and Step (which step orders are stuck at, and for how long — built
  // specifically to catch an order that's reached the branch a long time
  // ago and still hasn't been billed). Each keeps its own expanded-group
  // state so switching views and back doesn't lose what you had open.
  const [groupBy,setGroupBy]=useState("branch");
  const [expandedBranches,setExpandedBranches]=useState(()=>new Set());
  const [expandedSteps,setExpandedSteps]=useState(()=>new Set());
  const toggleBranch=(b)=>setExpandedBranches(prev=>{
    const next=new Set(prev);
    next.has(b)?next.delete(b):next.add(b);
    return next;
  });
  const toggleStep=(s)=>setExpandedSteps(prev=>{
    const next=new Set(prev);
    next.has(s)?next.delete(s):next.add(s);
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
      const reachedDate=o.stepDates?.[o.step]?.date||null;
      return{...o,expectedProfit:sellPrice-(parseFloat(o.actualPrice)||0),reachedDate,daysWaiting:daysSince(reachedDate)};
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

  const byStep=useMemo(()=>{
    const groups={};
    list.forEach(o=>{(groups[o.step]||=[]).push(o);});
    Object.values(groups).forEach(g=>g.sort((a,b)=>(b.daysWaiting??-1)-(a.daysWaiting??-1)));
    const steps=Object.keys(groups).map(Number).sort((a,b)=>a-b);
    return{groups,steps};
  },[list]);

  const grandTotal=list.reduce((s,o)=>s+o.expectedProfit,0);

  const emptyMsg="Nothing outstanding — every order before Billing Request has Actual Purchase Price on file, or none are in progress right now.";

  const groupCount=groupBy==="branch"?byBranch.branches.length:byStep.steps.length;
  const groupNoun=groupBy==="branch"?`branch${groupCount===1?"":"es"}`:`step${groupCount===1?"":"s"}`;

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
      .ept-branch-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:14px 16px;cursor:pointer;}
      .ept-branch-head:active{background:#F7F9FC;}
      .ept-order-card{padding:12px 16px 12px 30px;background:#FAFBFD;border-top:1px solid #E4EAF2;}
      .ept-stat-label{font-size:9px;color:#8A96A8;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;}
      .ept-stat-value{font-size:13px;color:#0A1628;font-weight:700;margin-top:1px;}
      .ept-toggle-btn{border:none;background:transparent;font-size:11px;font-weight:700;padding:6px 12px;border-radius:7px;cursor:pointer;color:#5A6472;}
      .ept-toggle-btn.active{background:#0A1628;color:#fff;}
    `}</style>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #E4EAF2",flexWrap:"wrap",gap:10}}>
      <div>
        <h3 style={{fontWeight:800,fontSize:14,color:"#0A1628",margin:0}}>Expected Profit by {groupBy==="branch"?"Branch":"Step"}</h3>
        <div style={{fontSize:11,color:"#5A6472",marginTop:2}}>{list.length} order{list.length===1?"":"s"} pending billing, across {groupCount} {groupNoun}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",background:"#F1F3F7",borderRadius:9,padding:3}}>
          <button className={`ept-toggle-btn${groupBy==="branch"?" active":""}`} onClick={()=>setGroupBy("branch")}>By Branch</button>
          <button className={`ept-toggle-btn${groupBy==="step"?" active":""}`} onClick={()=>setGroupBy("step")}>By Step</button>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"#5A6472"}}>Total Expected Profit</div>
          <div style={{fontWeight:700,fontSize:14,color:"#0A1628"}}>{signed(grandTotal)}</div>
        </div>
      </div>
    </div>

    {orders===null
      ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>Loading…</div>
      :groupCount===0
      ?<div style={{padding:40,textAlign:"center",color:"#8A96A8",fontSize:13}}>{emptyMsg}</div>
      :groupBy==="branch"?<>
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
                        {STEP_LABELS[o.step]}{o.reachedDate?` (${fDate(o.reachedDate)})`:""}
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
                    <div style={{fontSize:12,color:"#4A5568",marginTop:1}}>{STEP_LABELS[o.step]}{o.reachedDate?` (${fDate(o.reachedDate)})`:""}</div>
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
      </>:<>
        {/* Step view desktop: grouped by current step, longest-waiting order
            first within each group, with its own Reached Step On / Days
            Waiting columns — built to surface an order that's been sitting
            at the branch (or any step) a long time without moving. */}
        <div className="ept-desktop" style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:640}}>
            <thead><tr>
              <th style={TH({textAlign:"left"})}>Step</th>
              <th style={TH()}>Orders</th>
              <th style={TH()}>Expected Profit</th>
            </tr></thead>
            <tbody>
              {byStep.steps.map(s=>{
                const stepOrders=byStep.groups[s];
                const stepTotal=stepOrders.reduce((sum,o)=>sum+o.expectedProfit,0);
                const open=expandedSteps.has(s);
                const worstWait=Math.max(...stepOrders.map(o=>o.daysWaiting??-1));
                return<Fragment key={s}>
                  <tr className="shine-row" style={{background:"#fff",cursor:"pointer"}} onClick={()=>toggleStep(s)}>
                    <td style={{...TD({textAlign:"left"})}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{display:"inline-block",transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10,flexShrink:0}}>▶</span>
                        <div>
                          <div style={{fontWeight:700,color:"#0A1628",fontSize:12}}>{STEP_LABELS[s]}</div>
                          {worstWait>=3&&<div style={{fontSize:10,color:waitColor(worstWait),marginTop:1,fontWeight:600}}>Oldest waiting {worstWait} day{worstWait===1?"":"s"}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568"}}>{stepOrders.length}</span></td>
                    <td style={{...TD(),textAlign:"right"}}><span style={{color:"#4A5568",fontWeight:700}}>{signed(stepTotal)}</span></td>
                  </tr>
                  {open&&<tr>
                    <td colSpan={3} style={{padding:0,borderBottom:"1px solid rgba(228,234,242,.7)"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",background:"#FAFBFD"}}>
                        <thead><tr>
                          <th style={{...TH({textAlign:"left",background:"#F1F3F7",color:"#5A6472",fontSize:9}),paddingLeft:38}}>Device / Branch</th>
                          <th style={{...TH({background:"#F1F3F7",color:"#5A6472",fontSize:9})}}>Reached Step On</th>
                          <th style={{...TH({background:"#F1F3F7",color:"#5A6472",fontSize:9})}}>Days Waiting</th>
                          <th style={{...TH({background:"#F1F3F7",color:"#5A6472",fontSize:9})}}>Expected Profit</th>
                        </tr></thead>
                        <tbody>
                          {stepOrders.map(o=><tr key={o.id} className="shine-row" style={{cursor:"pointer"}} onClick={()=>onOrderClick?.(o.id)}>
                            <td style={{...TD({textAlign:"left"}),paddingLeft:38}}>
                              <div style={{fontWeight:600,color:"#0A1628"}}>{o.phoneModel||"—"}</div>
                              <div style={{fontSize:10,color:"#8A96A8",marginTop:1}}>{branchMeta?.[o.branch]?.name||o.branch}</div>
                            </td>
                            <td style={{...TD(),textAlign:"right",color:"#4A5568"}}>{fDate(o.reachedDate)}</td>
                            <td style={{...TD(),textAlign:"right"}}>
                              {o.daysWaiting===null?<span style={{color:"#8A96A8"}}>—</span>:
                                <span style={{fontWeight:700,color:waitColor(o.daysWaiting)}}>{o.daysWaiting} day{o.daysWaiting===1?"":"s"}{o.daysWaiting>=7&&" ⚠"}</span>}
                            </td>
                            <td style={{...TD(),textAlign:"right",color:"#4A5568",fontWeight:600}}>{signed(o.expectedProfit)}</td>
                          </tr>)}
                        </tbody>
                      </table>
                    </td>
                  </tr>}
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

        {/* Step view mobile */}
        <div className="ept-mobile">
          {byStep.steps.map(s=>{
            const stepOrders=byStep.groups[s];
            const stepTotal=stepOrders.reduce((sum,o)=>sum+o.expectedProfit,0);
            const open=expandedSteps.has(s);
            const worstWait=Math.max(...stepOrders.map(o=>o.daysWaiting??-1));
            return<div className="ept-card" key={s}>
              <div className="ept-branch-head" onClick={()=>toggleStep(s)}>
                <div style={{display:"flex",alignItems:"flex-start",gap:8,minWidth:0}}>
                  <span style={{display:"inline-block",marginTop:3,transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",color:"#8A96A8",fontSize:10,flexShrink:0}}>▶</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,color:"#0A1628",fontSize:13}}>{STEP_LABELS[s]}</div>
                    {worstWait>=3&&<div style={{fontSize:11,color:waitColor(worstWait),marginTop:1,fontWeight:600}}>Oldest waiting {worstWait} day{worstWait===1?"":"s"}</div>}
                  </div>
                </div>
                <div style={{display:"flex",gap:16,flexShrink:0}}>
                  <div style={{textAlign:"right"}}>
                    <div className="ept-stat-label">Orders</div>
                    <div className="ept-stat-value">{stepOrders.length}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="ept-stat-label">Profit</div>
                    <div className="ept-stat-value">{signed(stepTotal)}</div>
                  </div>
                </div>
              </div>
              {open&&stepOrders.map(o=><div key={o.id} className="ept-order-card" onClick={()=>onOrderClick?.(o.id)}>
                <div style={{fontSize:13,fontWeight:700,color:"#0A1628",marginBottom:6}}>{o.phoneModel||"—"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <div>
                    <div className="ept-stat-label">Branch</div>
                    <div style={{fontSize:12,color:"#4A5568",marginTop:1}}>{branchMeta?.[o.branch]?.name||o.branch}</div>
                  </div>
                  <div>
                    <div className="ept-stat-label">Reached Step On</div>
                    <div style={{fontSize:12,color:"#4A5568",marginTop:1}}>{fDate(o.reachedDate)}</div>
                  </div>
                  <div>
                    <div className="ept-stat-label">Days Waiting</div>
                    <div style={{fontSize:12,marginTop:1,fontWeight:700,color:waitColor(o.daysWaiting)}}>{o.daysWaiting===null?"—":`${o.daysWaiting} day${o.daysWaiting===1?"":"s"}${o.daysWaiting>=7?" ⚠":""}`}</div>
                  </div>
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
