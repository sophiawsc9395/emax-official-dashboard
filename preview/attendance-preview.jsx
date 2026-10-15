/**
 * ATTENDANCE — UI PREVIEW ONLY (mock data, nothing wired to Supabase yet)
 * =========================================================================
 * This is a click-through layout preview so Sophia can review the design
 * before the real page gets built. All data below (branches, SR/BM roster,
 * business hours, attendance records) is fake and resets on refresh —
 * nothing here is saved anywhere.
 *
 * WHAT THIS COVERS, per the brief (latest round, confirmed by Sophia):
 *  - emaxhr fills in daily clock-in / clock-out time for every Branch
 *    Manager and SR, for every branch, month by month.
 *  - System auto-calculates lateness in minutes against that branch's
 *    Business Hours. More than 10 minutes late = "Late".
 *  - Early Out (clocking out before Business Hours end) counts the SAME
 *    as a late toward the payout tiers. A day with EITHER a late-in or
 *    an early-out is one "issue" for that day (both on the same day
 *    still only counts once).
 *  - Commission payout drops per ISSUE count in the month (late + early
 *    out combined): 0 issues = 100%, 1st = 80%, 2nd = 50%, 3rd+ = 0%.
 *  - Instead of clock in/out, Sophia or emaxhr can instead mark a day as
 *    Sick Leave, Annual Leave, Replacement Leave, Full Day Unpaid Leave,
 *    Half Day Unpaid Leave, Off Day, or Public Holiday. Any of these is
 *    NOT an issue and never touches the payout tiers — it's simply not
 *    an attendance day.
 *  - Sophia edits each branch's Business Hours, which is what lateness
 *    and early-out are both checked against.
 *  - A person who is Branch Manager of more than one branch (e.g.
 *    SUHAIDI at Emax CKS and Emax ITCC) is shown as the same person —
 *    a small "Also manages: ..." note ties the cards together — never
 *    as a new, unrelated card per branch. Their attendance record still
 *    stays separate per branch, since their hours/history can differ
 *    branch to branch.
 *  - A day with nothing entered yet shows as "Not filled" and is never
 *    counted as an issue — it just means nobody has gotten to it yet.
 *  - emaxhr or Sophia can add a staff member directly on this page for
 *    attendance-tracking purposes only — clearly separate from, and NOT
 *    tied to, the monthly commission/report roster kept elsewhere.
 *  - emaxhr fills attendance in as one table (staff down the side, days
 *    across the top, click a cell to fill in), the same shape as the
 *    monthly report table — not a grid of separate day-buttons.
 *  - Branch accounts see only their own branch's roster with commission
 *    payout % on every card (no branch-wide average, no summary card).
 *  - Boon Theng and Wingfei can browse EVERY branch/outlet, one at a
 *    time (same read-only view a branch account gets, with a picker).
 *  - Clicking a person's card (branch account, or Boon Theng/Wingfei)
 *    opens the exact day-by-day record emaxhr filled in — clock in,
 *    clock out, and the computed late/early-out/leave status for every
 *    day — so there's no dispute over what time was recorded.
 *  - No admin/boss/manager "all branches" summary tab — removed per
 *    Sophia's request; branch-level detail is reached from Branch View.
 *  - Dojo Papar, Espace, and Mini Impian don't earn sales commission, so
 *    they never show a payout % — just the plain attendance summary
 *    (present / late / early out / leave / not filled).
 *  - Both emaxhr and Sophia have an Attendance Summary sub-tab: the same
 *    shape as the Attendance Table (staff down the side, pick a branch/
 *    outlet with the same tabs), with a Working Days column plus one
 *    column per leave type — AL, SL, RL, UPL, Off Day, Public Holiday —
 *    and a Total Leave column (UPL = full-day + half-day Unpaid Leave,
 *    half day = 0.5). Sophia's tab also keeps Business Hours & Staff;
 *    emaxhr's tab is the Attendance Table plus this Attendance Summary.
 *  - Three more outlets — Dojo, Mini Impian, Espace — are tracked the
 *    same way as the retail branches: managed (filled in / staff added)
 *    by emaxhr and Sophia, and browsable read-only by Boon Theng and
 *    Wingfei. They show up as an "Other Outlets" group everywhere a
 *    branch is picked (Fill In, Business Hours, Branch View, Summary),
 *    rather than as separate top-level page tabs — flag this if you
 *    pictured literally separate tabs instead, easy to change either way.
 *  - A branch-by-branch Summary table for Admin/Boss/Manager/emaxhr —
 *    one row per branch/outlet, no digging into individual days needed.
 *  - Data starts October 2026 — the month picker doesn't go earlier.
 */
import {useState} from "react";
import ReactDOM from "react-dom/client";

/* ── Design tokens — matches the rest of the dashboard ───────────────── */
const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8",green:"#15803D",amber:"#B45309",red:"#DC2626"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:C.red}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const SEL=props=><select {...props} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 16px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const SecHdr=({icon,children})=><div style={{display:"flex",alignItems:"center",gap:7,padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:"rgba(255,255,255,.85)"}}>{icon}</span>}{children}</div>;

const Ic={
  clock:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  cog:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  users:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  chevL:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  check:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  chart:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  plus:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};

/* ── Leave / day-type options (used instead of clock in/out) ─────────── */
const LEAVE_TYPES=[
  {code:"AL",label:"Annual Leave",color:"#2C5AA0"},
  {code:"AH",label:"Annual Leave (Half Day)",color:"#6A9BD8"},
  {code:"SL",label:"Sick Leave",color:"#B45309"},
  {code:"RL",label:"Replacement Leave",color:"#0E7490"},
  {code:"UL",label:"Unpaid Leave (Full Day)",color:"#DC2626"},
  {code:"UH",label:"Unpaid Leave (Half Day)",color:"#EA580C"},
  {code:"OFF",label:"Off Day",color:"#6B7280"},
  {code:"PH",label:"Public Holiday",color:"#7C3AED"},
];
// Half-day leave codes — the working day is a standard 7.5 hours, so a
// half day is ~4 hours off. Whatever clock-in/out is filled for the other
// half is never checked against Business Hours (no late / early-out),
// and the day counts as 0.5 toward that leave type and 0.5 as a working
// day (see monthStatsFor / leaveBreakdownFor).
const HALF_DAY_LEAVE_CODES=["AH","UH"];
const leaveMeta=code=>LEAVE_TYPES.find(l=>l.code===code);

/* ── Mock data (preview only) ────────────────────────────────────────── */
// Retail branches (no "group" = retail)
const RETAIL_BRANCHES=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM"];
// Three additional outlets, tracked the same way — grouped as "Other Outlets"
// everywhere a branch is picked (see file header note on tabs vs grouping).
const ENTITY_BRANCHES=["DOJO","MINI_IMPIAN","ESPACE"];
const BRANCHES=[...RETAIL_BRANCHES,...ENTITY_BRANCHES];
const BRANCH_META={
  KM:{name:"Emax Kota Marudu",manager:"SUHAINIZAM"},
  T1:{name:"Emax Tuaran 1",manager:"REX WENMIN"},
  TW2:{name:"Emax Tawau 2",manager:"TONY YONG"},
  TW1:{name:"Emax Tawau 1",manager:"MAX SIEW"},
  LD:{name:"Emax Lahad Datu",manager:"SHAHRUL"},
  KB:{name:"Emax Kota Belud",manager:"MAHADI"},
  T5:{name:"Emax CKS",manager:"SUHAIDI"},
  ITCC:{name:"Emax ITCC",manager:"SUHAIDI"},
  TENOM:{name:"Emax Tenom",manager:"AZIQIL"},
  DOJO:{name:"Dojo Papar",group:"entity"},
  MINI_IMPIAN:{name:"Mini Impian",group:"entity"},
  ESPACE:{name:"Espace",group:"entity"},
};
const isEntityBranch=b=>BRANCH_META[b].group==="entity";
const MOCK_SR=[
  {id:"sr_km1",canon:"NURUL AIN",type:"Online",branch:"KM"},
  {id:"sr_km2",canon:"FARID AZMI",type:"Offline",branch:"KM"},
  {id:"sr_t11",canon:"CHONG WEI LIANG",type:"Online",branch:"T1"},
  {id:"sr_tw21",canon:"SITI NORAIN",type:"Offline",branch:"TW2"},
  {id:"sr_ld1",canon:"AZMAN JAAFAR",type:"Online",branch:"LD"},
];
const MOCK_ENTITY_STAFF=[
  {id:"dojo1",canon:"AIDIL HAKIM",role:"Instructor",branch:"DOJO"},
  {id:"dojo2",canon:"NURSYAFIQAH",role:"Front Desk",branch:"DOJO"},
  {id:"mi1",canon:"CHEW LI PEI",role:"Caregiver",branch:"MINI_IMPIAN"},
  {id:"mi2",canon:"ROSLINA",role:"Caregiver",branch:"MINI_IMPIAN"},
  {id:"es1",canon:"DANIEL WONG",role:"Barista",branch:"ESPACE"},
  {id:"es2",canon:"PUTRI AMIRA",role:"Barista",branch:"ESPACE"},
];
const ALL_STAFF=[
  ...MOCK_SR.map(sr=>({id:sr.id,canon:sr.canon,role:`${sr.type} SR`,branch:sr.branch})),
  ...MOCK_ENTITY_STAFF,
];
// A manager who runs more than one branch (e.g. SUHAIDI at Emax CKS and
// Emax ITCC) is one real person, not a new card per branch — this looks
// up which OTHER branches share the same manager name, so the UI can
// label it as the same person instead of duplicating their identity.
function otherBranchesManagedBy(name,currentBranch){
  return BRANCHES.filter(b=>b!==currentBranch&&BRANCH_META[b].manager===name);
}
function rosterFor(branch){
  const meta=BRANCH_META[branch];
  const people=[];
  // The attendance record itself (clock in/out, leave) still stays
  // per-branch — a manager can have different hours/history at each
  // branch they run — only the identity shown is shared.
  if(meta.manager)people.push({id:`BM_${branch}`,name:meta.manager,role:"Branch Manager",branch,alsoManages:otherBranchesManagedBy(meta.manager,branch)});
  ALL_STAFF.filter(s=>s.branch===branch).forEach(s=>people.push({id:s.id,name:s.canon,role:s.role,branch}));
  return people;
}
// Roster + any staff added on this page for attendance-tracking only.
function combinedRoster(branch,extraStaff){
  return[...rosterFor(branch),...(extraStaff[branch]||[])];
}
const ALL_PEOPLE=BRANCHES.flatMap(rosterFor);

const [FIRST_YEAR,FIRST_MONTH]=[2026,10]; // October 2026 — data starts here, month picker won't go earlier
const MONTH_NAMES=["","January","February","March","April","May","June","July","August","September","October","November","December"];
const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
const minutesOf=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m;};
const fmtMinutes=n=>{const h=Math.floor(n/60),m=n%60;return h>0?`${h}h ${m}m`:`${m}m`;};

// Seed a bit of fake attendance so the preview isn't empty — a mix of
// on-time, late, early-out, one 3rd-issue case, and a couple of leave days.
function seedAttendance(){
  const rec={};
  ALL_PEOPLE.forEach(p=>{rec[p.id]={};});
  const set=(id,day,inT,outT)=>{rec[id][day]={in:inT,out:outT};};
  const setLeave=(id,day,code)=>{rec[id][day]={leave:code};};
  set(`BM_KM`,1,"09:28","18:35");
  set(`BM_KM`,2,"09:52","18:30"); // late (grace is 10 min past 09:30 = 09:40)
  set(`BM_KM`,3,"09:31","18:00"); // early out
  set("sr_km1",1,"09:35","18:32");
  set("sr_km1",2,"09:51","18:40"); // issue #1 (late)
  set("sr_km1",3,"10:05","18:15"); // issue #2 (late + early out, same day = still 1 issue)
  set("sr_km1",4,"09:59","18:33"); // issue #3 -> 0%
  set("sr_km2",1,"09:29","18:31");
  setLeave("sr_km2",5,"AL");
  setLeave("sr_km2",6,"OFF");
  set("sr_t11",1,"09:30","18:30");
  set("sr_t11",2,"09:41","18:31"); // issue #1 (late)
  setLeave("sr_t11",8,"PH");
  set("sr_tw21",1,"09:20","18:20"); // issue #1 (early out)
  setLeave("dojo1",1,"SL");
  set("dojo2",1,"09:05","18:05");
  set("es1",1,"08:55","17:58");
  setLeave("mi1",2,"RL");
  return rec;
}

const seedBusinessHours=()=>Object.fromEntries(BRANCHES.map(b=>[b,{start:"09:30",end:"18:30"}]));

/* ── Lateness / early-out / leave / payout logic ─────────────────────── */
const GRACE_MINUTES=10;
function dayStatus(entry,hours){
  if(!entry)return{filled:false};
  if(entry.leave){
    const meta=leaveMeta(entry.leave);
    return{filled:true,isLeave:true,leaveCode:entry.leave,leaveLabel:meta?meta.label:entry.leave,isLate:false,isEarlyOut:false,isIssue:false};
  }
  if(!entry.in)return{filled:false};
  const inM=minutesOf(entry.in),startM=minutesOf(hours.start),endM=minutesOf(hours.end);
  const lateBy=inM-startM;
  const isLate=lateBy>GRACE_MINUTES;
  const outM=entry.out?minutesOf(entry.out):null;
  const isEarlyOut=outM!==null&&outM<endM;
  // A day counts as one "issue" whether it's late, early-out, or both —
  // it's the day that failed Business Hours, not each flag on it.
  const isIssue=isLate||isEarlyOut;
  return{filled:true,isLeave:false,isLate,lateBy:isLate?lateBy:0,isEarlyOut,earlyBy:isEarlyOut?endM-outM:0,isIssue};
}
function monthStatsFor(personId,attendance,hours,year,month){
  const days=daysInMonth(year,month);
  let present=0,late=0,earlyOut=0,issues=0,notFilled=0,leaveDays=0;
  for(let d=1;d<=days;d++){
    const st=dayStatus(attendance[personId]?.[d],hours);
    if(!st.filled){notFilled++;continue;}
    if(st.isLeave){
      // A half-day leave (Annual or Unpaid) counts as half a working day too.
      if(HALF_DAY_LEAVE_CODES.includes(st.leaveCode)){leaveDays+=0.5;present+=0.5;}
      else leaveDays++;
      continue;
    }
    present++;
    if(st.isLate)late++;
    if(st.isEarlyOut)earlyOut++;
    if(st.isIssue)issues++;
  }
  return{present,late,earlyOut,issues,notFilled,leaveDays};
}
// Per-leave-type day counts for one person in a month — used for the
// company/branch UPL/AL/SL/RL totals Sophia sees.
function leaveBreakdownFor(personId,attendance,year,month){
  const days=daysInMonth(year,month);
  const counts={AL:0,AH:0,SL:0,RL:0,UL:0,UH:0,OFF:0,PH:0};
  for(let d=1;d<=days;d++){
    const entry=attendance[personId]?.[d];
    if(entry&&entry.leave&&counts[entry.leave]!==undefined)counts[entry.leave]++;
  }
  return counts;
}
function payoutPctFor(issueCount){
  if(issueCount>=3)return 0;
  if(issueCount===2)return 50;
  if(issueCount===1)return 80;
  return 100;
}
const payoutColor=pct=>pct===100?C.green:pct===80?C.amber:pct===50?"#C2410C":C.red;

/* ── Branch/outlet picker — one button per branch, grouped Retail vs
   Other Outlets, instead of a dropdown. Pass the current branch code as
   `value` and a setter as `onChange` (no event object). ─────────────── */
function BranchTabs({value,onChange}){
  const rowStyle={display:"flex",flexWrap:"wrap",gap:6};
  const btnStyle=b=>({padding:"6px 13px",borderRadius:20,border:`1px solid ${value===b?C.navy:C.border}`,background:value===b?C.navy:"#fff",color:value===b?"#fff":C.textMid,fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"});
  return<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div>
      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Retail Branches</div>
      <div style={rowStyle}>{RETAIL_BRANCHES.map(b=><button key={b} onClick={()=>onChange(b)} style={btnStyle(b)}>{BRANCH_META[b].name}</button>)}</div>
    </div>
    <div>
      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Other Outlets</div>
      <div style={rowStyle}>{ENTITY_BRANCHES.map(b=><button key={b} onClick={()=>onChange(b)} style={btnStyle(b)}>{BRANCH_META[b].name}</button>)}</div>
    </div>
  </div>;
}

/* ── Add Staff modal — attendance-record only, not tied to the monthly
   commission/report roster kept elsewhere. Usable by emaxhr or Sophia. ── */
function AddStaffModal({branch,onAdd,onClose}){
  const[name,setName]=useState("");
  const[role,setRole]=useState("");
  const canSave=name.trim()&&role.trim();
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:380}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>Add Staff — {BRANCH_META[branch].name}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:18}}>
        <div style={{marginBottom:12}}><L req>Name</L><I value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. JASON LIM"/></div>
        <div style={{marginBottom:14}}><L req>Role</L><I value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Offline SR, Instructor..."/></div>
        <div style={{fontSize:10.5,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",marginBottom:14}}>Added here for attendance tracking only — this does not add them to the monthly commission/report roster kept elsewhere.</div>
        <div style={{display:"flex",gap:8}}>
          <PBtn disabled={!canSave} onClick={()=>{onAdd({id:`extra_${branch}_${Date.now()}`,name:name.trim(),role:role.trim(),branch});onClose();}} style={{flex:1}}>{Ic.check} Add Staff</PBtn>
          <GBtn onClick={onClose}>Cancel</GBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Clock-in/out (or leave) edit modal (emaxhr / Sophia fills this in) ── */
function DayEditModal({person,day,monthLabel,entry,hours,onSave,onClose}){
  const[type,setType]=useState(entry?.leave?entry.leave:"WORKED");
  const[inT,setInT]=useState(entry?.in||"");
  const[outT,setOutT]=useState(entry?.out||"");
  const preview=type==="WORKED"?dayStatus({in:inT,out:outT},hours):null;
  const canSave=type==="WORKED"?!!inT:true;
  const handleSave=()=>{
    if(type==="WORKED")onSave(day,{in:inT,out:outT||null});
    else onSave(day,{leave:type});
    onClose();
  };
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:380}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{person.name} · Day {day}, {monthLabel}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:18}}>
        <div style={{marginBottom:12}}>
          <L>Day Type</L>
          <SEL value={type} onChange={e=>setType(e.target.value)}>
            <option value="WORKED">Worked (clock in / out)</option>
            {LEAVE_TYPES.map(l=><option key={l.code} value={l.code}>{l.label}</option>)}
          </SEL>
        </div>
        {type==="WORKED"?<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><L req>Clock In</L><I type="time" value={inT} onChange={e=>setInT(e.target.value)}/></div>
            <div><L>Clock Out</L><I type="time" value={outT} onChange={e=>setOutT(e.target.value)}/></div>
          </div>
          <div style={{fontSize:11,color:C.textLight,marginBottom:12}}>Business Hours: {hours.start} – {hours.end} · grace {GRACE_MINUTES} min</div>
          {preview.filled&&<div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
            {preview.isLate
              ?<div style={{fontSize:11,fontWeight:700,color:C.red,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"6px 10px"}}>Late by {fmtMinutes(preview.lateBy)}</div>
              :<div style={{fontSize:11,fontWeight:700,color:C.green,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:6,padding:"6px 10px"}}>On time</div>}
            {preview.isEarlyOut&&<div style={{fontSize:11,fontWeight:700,color:C.amber,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:6,padding:"6px 10px"}}>Early Out by {fmtMinutes(preview.earlyBy)}</div>}
          </div>}
        </>:<div style={{fontSize:11.5,fontWeight:600,color:leaveMeta(type).color,background:leaveMeta(type).color+"12",border:`1px solid ${leaveMeta(type).color}40`,borderRadius:6,padding:"8px 10px",marginBottom:14}}>Marked as {leaveMeta(type).label} — no clock-in/out needed. Never counted as late, early-out, or an issue, and won't reduce commission payout.</div>}
        <div style={{display:"flex",gap:8}}>
          <PBtn disabled={!canSave} onClick={handleSave} style={{flex:1}}>{Ic.check} Save</PBtn>
          {entry&&<GBtn onClick={()=>{onSave(day,null);onClose();}}>Clear</GBtn>}
          <GBtn onClick={onClose}>Cancel</GBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Small legend for the day-grid colors, shown under each roster ──── */
function DayLegend(){
  return<div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:10,color:C.textLight,marginTop:10,paddingTop:10,borderTop:`1px dashed ${C.border}`}}>
    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:3,background:"#F0FDF4",border:"1px solid #BBF7D0"}}/>On time</span>
    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:3,background:"#FEF2F2",border:"1px solid #FECACA"}}/>Issue (late/early out)</span>
    {LEAVE_TYPES.map(l=><span key={l.code} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:3,background:l.color+"18",border:`1px solid ${l.color}55`}}/>{l.code} = {l.label}</span>)}
  </div>;
}

/* ── emaxhr view: fill in daily clock in/out (or leave) per branch, laid
   out as one table — a row per staff member, a column per day — the same
   shape as the monthly report table, instead of a grid of day-buttons. ── */
function HRFillInView({year,month,attendance,setAttendance,hours,extraStaff,onAddStaff}){
  const[branch,setBranch]=useState(BRANCHES[0]);
  const[editing,setEditing]=useState(null); // {person, day}
  const[adding,setAdding]=useState(false);
  const roster=combinedRoster(branch,extraStaff);
  const days=daysInMonth(year,month);
  const dayList=Array.from({length:days},(_,i)=>i+1);
  const monthLabel=`${MONTH_NAMES[month]} ${year}`;
  const branchHours=hours[branch];

  const saveDay=(personId,day,entry)=>{
    setAttendance(prev=>{
      const personRec={...(prev[personId]||{})};
      if(entry===null)delete personRec[day];
      else personRec[day]=entry;
      return{...prev,[personId]:personRec};
    });
  };

  const thStyle={padding:"7px 6px",fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.8)",textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"center",whiteSpace:"nowrap"};
  const tdBase={padding:0,textAlign:"center",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`};

  return<div>
    <div style={{marginBottom:14}}><BranchTabs value={branch} onChange={setBranch}/></div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{fontSize:11,color:C.textLight}}>{isEntityBranch(branch)?"No lateness rule shown for outlets by default.":<>Business Hours: <b style={{color:C.text}}>{branchHours.start} – {branchHours.end}</b></>}</div>
      <div style={{flex:1}}/>
      <GBtn onClick={()=>setAdding(true)}>{Ic.plus} Add Staff</GBtn>
    </div>

    <div style={{...card,overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Inter,sans-serif"}}>
        <thead>
          <tr style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
            <th style={{...thStyle,position:"sticky",left:0,background:C.navy,textAlign:"left",padding:"7px 10px",minWidth:150,zIndex:2}}>Staff</th>
            {dayList.map(d=><th key={d} style={{...thStyle,minWidth:28}}>{d}</th>)}
            <th style={{...thStyle,minWidth:52}}>Issues</th>
            <th style={{...thStyle,minWidth:52}}>Leave</th>
            <th style={{...thStyle,minWidth:64}}>Payout</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((person,ri)=>{
            const stats=monthStatsFor(person.id,attendance,branchHours,year,month);
            const pct=payoutPctFor(stats.issues);
            const rowBg=ri%2===0?"#fff":C.surface;
            return<tr key={person.id}>
              <td style={{...tdBase,position:"sticky",left:0,background:rowBg,textAlign:"left",padding:"8px 10px",zIndex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:C.text}}>{person.name}</div>
                <div style={{fontSize:10,color:C.textLight}}>{person.role}</div>
                {person.alsoManages?.length>0&&<div style={{fontSize:9,color:C.blueBright,marginTop:1}}>Also at: {person.alsoManages.map(b=>BRANCH_META[b].name).join(", ")}</div>}
              </td>
              {dayList.map(d=>{
                const entry=attendance[person.id]?.[d];
                const st=dayStatus(entry,branchHours);
                let bg=rowBg,fg=C.textLight,label="·";
                if(st.filled&&st.isLeave){const m=leaveMeta(st.leaveCode);bg=m.color+"18";fg=m.color;label=st.leaveCode;}
                else if(st.filled&&st.isIssue){bg="#FEF2F2";fg=C.red;label="!";}
                else if(st.filled){bg="#F0FDF4";fg=C.green;label="✓";}
                const title=st.filled?(st.isLeave?st.leaveLabel:`${entry.in} – ${entry.out||"—"}`):"Not filled — click to fill in";
                return<td key={d} style={{...tdBase,background:bg}}>
                  <button onClick={()=>setEditing({person,day:d})} title={title} style={{width:"100%",height:30,border:"none",background:"transparent",color:fg,fontSize:st.isLeave?9:11,fontWeight:700,cursor:"pointer"}}>{label}</button>
                </td>;
              })}
              <td style={{...tdBase,background:rowBg,fontSize:12,fontWeight:700,color:stats.issues>0?C.red:C.textLight}}>{stats.issues}</td>
              <td style={{...tdBase,background:rowBg,fontSize:12,color:C.textMid}}>{stats.leaveDays}</td>
              <td style={{...tdBase,background:rowBg,borderRight:"none"}}>{isEntityBranch(branch)?<span style={{fontSize:11,color:C.textLight}}>—</span>:<span style={{fontSize:11,fontWeight:800,color:payoutColor(pct),background:payoutColor(pct)+"15",padding:"3px 9px",borderRadius:20,display:"inline-block"}}>{pct}%</span>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <DayLegend/>

    {editing&&<DayEditModal person={editing.person} day={editing.day} monthLabel={monthLabel} entry={attendance[editing.person.id]?.[editing.day]} hours={branchHours}
      onSave={(day,entry)=>saveDay(editing.person.id,day,entry)} onClose={()=>setEditing(null)}/>}
    {adding&&<AddStaffModal branch={branch} onAdd={p=>onAddStaff(branch,p)} onClose={()=>setAdding(false)}/>}
  </div>;
}

/* ── Sophia view: edit each branch's Business Hours + add staff ──────── */
function BusinessHoursView({hours,setHours,extraStaff,onAddStaff}){
  const[draft,setDraft]=useState(hours);
  const[addingFor,setAddingFor]=useState(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(hours);
  const renderCard=b=><div key={b} style={{...card,padding:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
      <div style={{fontWeight:700,fontSize:12.5,color:C.text}}>{BRANCH_META[b].name}</div>
      <button onClick={()=>setAddingFor(b)} title="Add staff (attendance only)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 7px",cursor:"pointer",color:C.textMid,display:"flex",alignItems:"center"}}>{Ic.plus}</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
      <div><L>Clock In</L><I type="time" value={draft[b].start} onChange={e=>setDraft(p=>({...p,[b]:{...p[b],start:e.target.value}}))}/></div>
      <div><L>Clock Out</L><I type="time" value={draft[b].end} onChange={e=>setDraft(p=>({...p,[b]:{...p[b],end:e.target.value}}))}/></div>
    </div>
    {(extraStaff[b]||[]).length>0&&<div style={{fontSize:10,color:C.textLight}}>+{extraStaff[b].length} added here: {extraStaff[b].map(s=>s.name).join(", ")}</div>}
  </div>;
  return<div>
    <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Retail Branches</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:20}}>
      {RETAIL_BRANCHES.map(renderCard)}
    </div>
    <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Other Outlets</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:16}}>
      {ENTITY_BRANCHES.map(renderCard)}
    </div>
    <PBtn disabled={!dirty} onClick={()=>setHours(draft)}>{Ic.check} Save Business Hours</PBtn>
    {addingFor&&<AddStaffModal branch={addingFor} onAdd={p=>onAddStaff(addingFor,p)} onClose={()=>setAddingFor(null)}/>}
  </div>;
}

/* ── Attendance Summary — same shape as the Attendance Table (staff down
   the side, one column per leave type), so Sophia and emaxhr can both
   see each staff member's Working Days plus how many AL/SL/RL/UPL/Off/
   Public Holiday days they've taken this month. UPL combines full-day
   Unpaid Leave (UL) with half-day Unpaid Leave (UH) counted as 0.5. ──── */
function AttendanceSummaryTable({year,month,attendance,hours,extraStaff}){
  const[branch,setBranch]=useState(BRANCHES[0]);
  const roster=combinedRoster(branch,extraStaff);
  const branchHours=hours[branch];
  const fmt=n=>Number.isInteger(n)?n:n.toFixed(1);
  const thStyle={padding:"7px 8px",fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.8)",textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"center",whiteSpace:"nowrap"};
  const tdBase={padding:"8px",textAlign:"center",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,fontSize:12,color:C.textMid};

  return<div>
    <div style={{marginBottom:14}}><BranchTabs value={branch} onChange={setBranch}/></div>
    <div style={{...card,overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Inter,sans-serif"}}>
        <thead>
          <tr style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
            <th style={{...thStyle,position:"sticky",left:0,background:C.navy,textAlign:"left",padding:"7px 10px",minWidth:150,zIndex:2}}>Staff</th>
            <th style={{...thStyle,minWidth:70}}>Working Days</th>
            <th style={{...thStyle,minWidth:56}}>AL</th>
            <th style={{...thStyle,minWidth:56}}>SL</th>
            <th style={{...thStyle,minWidth:56}}>RL</th>
            <th style={{...thStyle,minWidth:56}}>UPL</th>
            <th style={{...thStyle,minWidth:56}}>Off</th>
            <th style={{...thStyle,minWidth:56}}>PH</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((person,ri)=>{
            const stats=monthStatsFor(person.id,attendance,branchHours,year,month);
            const c=leaveBreakdownFor(person.id,attendance,year,month);
            const al=c.AL+0.5*c.AH;
            const upl=c.UL+0.5*c.UH;
            const rowBg=ri%2===0?"#fff":C.surface;
            return<tr key={person.id}>
              <td style={{...tdBase,position:"sticky",left:0,background:rowBg,textAlign:"left",zIndex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:C.text}}>{person.name}</div>
                <div style={{fontSize:10,color:C.textLight}}>{person.role}</div>
                {person.alsoManages?.length>0&&<div style={{fontSize:9,color:C.blueBright,marginTop:1}}>Also at: {person.alsoManages.map(b=>BRANCH_META[b].name).join(", ")}</div>}
              </td>
              <td style={{...tdBase,background:rowBg,fontWeight:800,color:C.text}}>{fmt(stats.present)}</td>
              <td style={{...tdBase,background:rowBg,color:al>0?leaveMeta("AL").color:C.textLight,fontWeight:al>0?700:400}}>{fmt(al)}</td>
              <td style={{...tdBase,background:rowBg,color:c.SL>0?leaveMeta("SL").color:C.textLight,fontWeight:c.SL>0?700:400}}>{c.SL}</td>
              <td style={{...tdBase,background:rowBg,color:c.RL>0?leaveMeta("RL").color:C.textLight,fontWeight:c.RL>0?700:400}}>{c.RL}</td>
              <td style={{...tdBase,background:rowBg,color:upl>0?leaveMeta("UL").color:C.textLight,fontWeight:upl>0?700:400}}>{fmt(upl)}</td>
              <td style={{...tdBase,background:rowBg,color:c.OFF>0?leaveMeta("OFF").color:C.textLight,fontWeight:c.OFF>0?700:400}}>{c.OFF}</td>
              <td style={{...tdBase,background:rowBg,borderRight:"none",color:c.PH>0?leaveMeta("PH").color:C.textLight,fontWeight:c.PH>0?700:400}}>{c.PH}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

/* ── emaxhr's tab: the Attendance Table plus the Leave Summary, switchable
   with sub-tabs (business hours stay Sophia-only). ────────────────────── */
function HRRoleView({year,month,attendance,setAttendance,hours,extraStaff,onAddStaff}){
  const[sub,setSub]=useState("table"); // table | summary
  const SUBS=[["table","Attendance Table"],["summary","Attendance Summary"]];
  return<div>
    <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
      {SUBS.map(([k,label])=><button key={k} onClick={()=>setSub(k)} style={{padding:"7px 12px",borderRadius:6,border:`1px solid ${C.border}`,background:sub===k?C.navy:"#fff",color:sub===k?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{label}</button>)}
    </div>
    {sub==="table"&&<HRFillInView year={year} month={month} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} onAddStaff={onAddStaff}/>}
    {sub==="summary"&&<AttendanceSummaryTable year={year} month={month} attendance={attendance} hours={hours} extraStaff={extraStaff}/>}
  </div>;
}

/* ── Sophia's tab: Business Hours & Staff, the same Attendance Table
   emaxhr fills in, and the same Leave Summary — switchable with sub-tabs. */
function SophiaView({year,month,attendance,setAttendance,hours,setHours,extraStaff,onAddStaff}){
  const[sub,setSub]=useState("hours"); // hours | table | summary
  const SUBS=[["hours","Business Hours & Staff"],["table","Attendance Table"],["summary","Attendance Summary"]];
  return<div>
    <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
      {SUBS.map(([k,label])=><button key={k} onClick={()=>setSub(k)} style={{padding:"7px 12px",borderRadius:6,border:`1px solid ${C.border}`,background:sub===k?C.navy:"#fff",color:sub===k?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{label}</button>)}
    </div>
    {sub==="hours"&&<BusinessHoursView hours={hours} setHours={setHours} extraStaff={extraStaff} onAddStaff={onAddStaff}/>}
    {sub==="table"&&<HRFillInView year={year} month={month} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} onAddStaff={onAddStaff}/>}
    {sub==="summary"&&<AttendanceSummaryTable year={year} month={month} attendance={attendance} hours={hours} extraStaff={extraStaff}/>}
  </div>;
}

/* ── Read-only day-by-day detail for ONE person — shows exactly what
   emaxhr filled in, in the same "monthly report card" shape branches
   already know, so there's no dispute over what time was recorded. ──── */
function PersonAttendanceDetailModal({person,year,month,attendance,hours,onClose}){
  const days=daysInMonth(year,month);
  const dayList=Array.from({length:days},(_,i)=>i+1);
  const stats=monthStatsFor(person.id,attendance,hours,year,month);
  const pct=payoutPctFor(stats.issues);
  const entity=isEntityBranch(person.branch);
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"95%",maxWidth:520,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{person.name}</div>
          <div style={{fontSize:10.5,color:"rgba(255,255,255,.65)"}}>{person.role} at {BRANCH_META[person.branch].name} · {MONTH_NAMES[month]} {year}</div>
          {person.alsoManages?.length>0&&<div style={{fontSize:10,color:"rgba(255,255,255,.55)",marginTop:2}}>Same person also manages: {person.alsoManages.map(b=>BRANCH_META[b].name).join(", ")} (separate record there)</div>}
        </div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
        {entity
          ?<div style={{fontSize:12.5,fontWeight:700,color:C.textMid}}>Attendance Summary <span style={{fontWeight:500,color:C.textLight}}>({stats.issues} late/early-out day{stats.issues===1?"":"s"} this month)</span></div>
          :<>
            <div style={{fontSize:22,fontWeight:800,color:payoutColor(pct)}}>{pct}%</div>
            <div style={{fontSize:10.5,color:C.textLight}}>Commission Payout<br/>({stats.issues} issue{stats.issues===1?"":"s"} this month)</div>
          </>}
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:C.textMid}}>Present: <b>{stats.present}</b> · Leave/Off: <b>{stats.leaveDays}</b> · Not filled: <b>{stats.notFilled}</b></div>
      </div>
      <div style={{overflowY:"auto",padding:"0 18px"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
          <thead><tr style={{position:"sticky",top:0,background:"#fff"}}>
            <th style={{textAlign:"left",padding:"8px 4px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`}}>Day</th>
            <th style={{textAlign:"left",padding:"8px 4px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`}}>Clock In</th>
            <th style={{textAlign:"left",padding:"8px 4px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`}}>Clock Out</th>
            <th style={{textAlign:"left",padding:"8px 4px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`}}>Status (as filled by emaxhr)</th>
          </tr></thead>
          <tbody>
            {dayList.map(d=>{
              const entry=attendance[person.id]?.[d];
              const st=dayStatus(entry,hours);
              let statusEl;
              if(!st.filled)statusEl=<span style={{color:C.textLight}}>Not filled</span>;
              else if(st.isLeave)statusEl=<span style={{color:leaveMeta(st.leaveCode).color,fontWeight:700}}>{st.leaveLabel}</span>;
              else if(st.isLate&&st.isEarlyOut)statusEl=<span style={{color:C.red,fontWeight:700}}>Late {fmtMinutes(st.lateBy)} + Early Out {fmtMinutes(st.earlyBy)}</span>;
              else if(st.isLate)statusEl=<span style={{color:C.red,fontWeight:700}}>Late by {fmtMinutes(st.lateBy)}</span>;
              else if(st.isEarlyOut)statusEl=<span style={{color:C.amber,fontWeight:700}}>Early Out by {fmtMinutes(st.earlyBy)}</span>;
              else statusEl=<span style={{color:C.green,fontWeight:700}}>On time</span>;
              return<tr key={d} style={{background:st.filled&&st.isIssue?"#FEF2F2":"transparent"}}>
                <td style={{padding:"6px 4px",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:700}}>{d}</td>
                <td style={{padding:"6px 4px",borderBottom:`1px solid ${C.border}`,color:C.textMid}}>{st.filled&&!st.isLeave?entry.in:"—"}</td>
                <td style={{padding:"6px 4px",borderBottom:`1px solid ${C.border}`,color:C.textMid}}>{st.filled&&!st.isLeave?(entry.out||"—"):"—"}</td>
                <td style={{padding:"6px 4px",borderBottom:`1px solid ${C.border}`}}>{statusEl}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div style={{padding:"12px 18px"}}><GBtn onClick={onClose} style={{width:"100%",justifyContent:"center"}}>Close</GBtn></div>
    </div>
  </div>;
}

/* ── Branch view: read-only, one branch's roster + payout %. Used both by
   a real branch account (locked to its own branch — no selector) and by
   Boon Theng/Wingfei (selector shown, since they browse every branch/
   outlet one at a time). Click a card to see exactly what emaxhr filled
   in, day by day — so there's no dispute over a lateness record. ─────── */
function BranchView({year,month,attendance,hours,extraStaff,allowBranchSwitch}){
  const[branch,setBranch]=useState(BRANCHES[0]);
  const[viewing,setViewing]=useState(null); // person
  const roster=combinedRoster(branch,extraStaff);
  const branchHours=hours[branch];
  const entity=isEntityBranch(branch);
  return<div>
    {allowBranchSwitch
      ?<div style={{marginBottom:16}}><BranchTabs value={branch} onChange={setBranch}/></div>
      :<div style={{fontSize:11,color:C.textLight,marginBottom:12,fontStyle:"italic"}}>A real branch login is auto-scoped to its own branch — this preview shows {BRANCH_META[branch].name} as an example.</div>}
    <div style={{fontSize:10.5,color:C.textLight,marginBottom:12}}>Click a card to see the exact clock-in/out (or leave) emaxhr recorded for every day.</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>
      {roster.map(person=>{
        const stats=monthStatsFor(person.id,attendance,branchHours,year,month);
        const pct=payoutPctFor(stats.issues);
        return<div key={person.id} onClick={()=>setViewing(person)} style={{...card,padding:16,cursor:"pointer"}}>
          <div style={{fontWeight:700,fontSize:14,color:C.text}}>{person.name}</div>
          <div style={{fontSize:11,color:C.textLight,marginBottom:person.alsoManages?.length>0?2:12}}>{person.role}</div>
          {person.alsoManages?.length>0&&<div style={{fontSize:9.5,color:C.blueBright,marginBottom:10}}>Also manages: {person.alsoManages.map(b=>BRANCH_META[b].name).join(", ")}</div>}
          {entity
            ?<div style={{fontSize:11,fontWeight:700,color:C.textMid,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>Attendance Summary</div>
            :<>
              <div style={{fontSize:26,fontWeight:800,color:payoutColor(pct),lineHeight:1}}>{pct}%</div>
              <div style={{fontSize:10.5,color:C.textLight,marginBottom:12}}>Commission Payout</div>
            </>}
          <div style={{display:"flex",gap:10,fontSize:11,color:C.textMid,flexWrap:"wrap"}}>
            <span>Present: <b style={{color:C.text}}>{stats.present}</b></span>
            <span style={{color:stats.late>0?C.red:C.textMid}}>Late: <b>{stats.late}</b></span>
            <span style={{color:stats.earlyOut>0?C.amber:C.textMid}}>Early Out: <b>{stats.earlyOut}</b></span>
            <span>Leave/Off: <b>{stats.leaveDays}</b></span>
            <span>Not filled: <b>{stats.notFilled}</b></span>
          </div>
          <div style={{fontSize:10,color:C.blueBright,fontWeight:700,marginTop:10}}>View day-by-day record →</div>
        </div>;
      })}
    </div>
    {viewing&&<PersonAttendanceDetailModal person={viewing} year={year} month={month} attendance={attendance} hours={branchHours} onClose={()=>setViewing(null)}/>}
  </div>;
}

/* ── Root preview shell — role switcher lets you click through every view ── */
function AttendancePreview(){
  const[roleView,setRoleView]=useState("hr"); // hr | sophia | branchOwn | crossBranch
  const[year,setYear]=useState(FIRST_YEAR);
  const[month,setMonth]=useState(FIRST_MONTH);
  const[attendance,setAttendance]=useState(seedAttendance);
  const[hours,setHours]=useState(seedBusinessHours);
  const[extraStaff,setExtraStaff]=useState({}); // {branch:[{id,name,role,branch}]} — attendance-only staff

  const addStaff=(branch,person)=>setExtraStaff(prev=>({...prev,[branch]:[...(prev[branch]||[]),person]}));

  const monthOptions=[];
  for(let y=FIRST_YEAR;y<=FIRST_YEAR+1;y++){
    for(let m=1;m<=12;m++){
      if(y===FIRST_YEAR&&m<FIRST_MONTH)continue;
      monthOptions.push({y,m});
    }
  }

  const TABS=[
    ["hr","emaxhr"],
    ["sophia","Sophia"],
    ["branchOwn","Branch Account"],
    ["crossBranch","Boon Theng / Wingfei"],
  ];
  const needsMonthPicker=true; // Sophia's tab now includes the Attendance Table and Leave Summary, both month-scoped

  return<div style={{fontFamily:"Inter,-apple-system,sans-serif",background:C.surface,minHeight:"100vh",padding:20}}>
    <div style={{maxWidth:1180,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:19,fontWeight:800,color:C.navy}}>Attendance</div>
          <div style={{fontSize:11,color:C.textLight,marginTop:2}}>PREVIEW — mock data only, nothing is saved</div>
        </div>
        <div style={{display:"flex",gap:6,background:"#fff",border:`1px solid ${C.border}`,borderRadius:9,padding:4,flexWrap:"wrap"}}>
          {TABS.map(([k,label])=>
            <button key={k} onClick={()=>setRoleView(k)} style={{padding:"7px 12px",borderRadius:6,border:"none",background:roleView===k?C.navy:"transparent",color:roleView===k?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>Preview: {label}</button>)}
        </div>
      </div>

      {needsMonthPicker&&<div style={{marginBottom:14,maxWidth:220}}>
        <L>Month</L>
        <SEL value={`${year}-${month}`} onChange={e=>{const[y,m]=e.target.value.split("-").map(Number);setYear(y);setMonth(m);}}>
          {monthOptions.map(o=><option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{MONTH_NAMES[o.m]} {o.y}</option>)}
        </SEL>
      </div>}

      <div style={{...card,padding:0,overflow:"hidden",marginBottom:16}}>
        <SecHdr icon={roleView==="hr"?Ic.clock:roleView==="sophia"?Ic.cog:Ic.users}>
          {roleView==="hr"?`emaxhr — Attendance — ${MONTH_NAMES[month]} ${year}`
            :roleView==="sophia"?`Sophia — Manage Attendance — ${MONTH_NAMES[month]} ${year}`
            :roleView==="branchOwn"?`Branch View — ${MONTH_NAMES[month]} ${year}`
            :`Branch-by-Branch View — ${MONTH_NAMES[month]} ${year}`}
        </SecHdr>
        <div style={{padding:18}}>
          {roleView==="hr"&&<HRRoleView year={year} month={month} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} onAddStaff={addStaff}/>}
          {roleView==="sophia"&&<SophiaView year={year} month={month} attendance={attendance} setAttendance={setAttendance} hours={hours} setHours={setHours} extraStaff={extraStaff} onAddStaff={addStaff}/>}
          {roleView==="branchOwn"&&<BranchView year={year} month={month} attendance={attendance} hours={hours} extraStaff={extraStaff} allowBranchSwitch={false}/>}
          {roleView==="crossBranch"&&<BranchView year={year} month={month} attendance={attendance} hours={hours} extraStaff={extraStaff} allowBranchSwitch={true}/>}
        </div>
      </div>
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<AttendancePreview/>);
