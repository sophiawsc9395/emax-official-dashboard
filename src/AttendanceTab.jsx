/**
 * Attendance — ported from preview/attendance-preview.jsx (approved by
 * Sophia over many rounds — see that file's header for the full behavior
 * spec). This is the real, Supabase-wired version: no mock data, no local
 * seed roster — everything comes from the real `srList` / `branchMeta`
 * props (same ones every other tab in this app already receives) plus
 * this tab's own storage for attendance records, business hours, and
 * attendance-only staff.
 *
 * Props (all optional except where noted):
 *   branchMeta      — the REAL branchMeta object (all retail branches),
 *                      same shape App.jsx/BossViewer/BranchViewer already
 *                      load from Supabase (name, manager, managerId, ...).
 *   srList          — the REAL, company-wide SR list (every branch, not
 *                      just one) — same DEFAULT_SR-shaped array every
 *                      other tab uses.
 *   isAdmin         — true = can fill in attendance / add staff (emaxhr
 *                      or Sophia). false = read-only.
 *   canManageHours  — true only for Sophia — shows the extra
 *                      "Business Hours & Staff" sub-tab. No effect if
 *                      isAdmin is false.
 *   userBranch      — set to a branch code to lock the view to ONE branch
 *                      with no branch picker (a real branch login). Leave
 *                      null for HR/Sophia/cross-branch views.
 *   allowBranchSwitch — when isAdmin is false and userBranch is null, this
 *                      controls whether a branch picker is shown (Boon
 *                      Theng / Wingfei) vs a single fixed branch.
 *   email           — current signed-in email, for attribution only.
 *
 * Storage (Supabase-backed via storage/index.js loadData/saveData, same
 * key-value convention as the rest of the app):
 *   emax_v5_attendance_${year}_${month}  — {personId:{day:entry}}
 *   emax_v5_business_hours               — {branchCode:{start,end}}
 *   emax_v5_attendance_extra_staff       — {branchCode:[{id,name,role,branch}]}
 */
import {useState,useEffect,useMemo} from "react";
import {loadData,saveData} from "./storage/index.js";

/* ── Design tokens — same constants every other tab file in this project
   defines locally (see WarrantyTab.jsx / ChaileaseTab.jsx / StockWriteOffTab.jsx). */
const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8",green:"#15803D",amber:"#B45309",red:"#DC2626"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};
const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:C.red}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const SEL=props=><select {...props} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 16px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;

const Ic={
  check:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  plus:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  edit:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
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
// Half-day leave codes — a half day counts as 0.5 toward that leave type
// AND 0.5 toward Working Days, and is never checked against Business Hours
// (no late / early-out possible on a half-day leave entry).
const HALF_DAY_LEAVE_CODES=["AH","UH"];
const leaveMeta=code=>LEAVE_TYPES.find(l=>l.code===code);

/* ── Branch groups. RETAIL_BRANCHES mirrors the real BRANCH_ORDER used
   elsewhere in the app (KM..HQ — SDK is a hidden/legacy branch and is
   deliberately left out, same as it's excluded from Branch Performance
   everywhere else). ENTITY_BRANCHES are the three additional outlets that
   don't earn sales commission and have no SR/BM roster of their own — every
   person tracked there is added directly on this page via "Add Staff". ── */
const RETAIL_BRANCHES=["KM","T1","TW2","TW1","LD","KB","T5","ITCC","TENOM","HQ"];
const ENTITY_BRANCHES=["DOJO","MINI_IMPIAN","ESPACE"];
const BRANCHES=[...RETAIL_BRANCHES,...ENTITY_BRANCHES];
const ENTITY_BRANCH_META={
  DOJO:{name:"Dojo Papar",group:"entity"},
  MINI_IMPIAN:{name:"Mini Impian",group:"entity"},
  ESPACE:{name:"Espace",group:"entity"},
};
const isEntityBranch=(b,meta)=>meta[b]?.group==="entity";
// HQ stays a real retail/commission branch everywhere else in the app (its
// actual commission/target calculations are untouched) and still shows its
// normal Business Hours / lateness tracking here — but per Sophia's request
// the Attendance page itself shows no payout %/column for HQ, same as the
// entity outlets. Scoped to this display only, so it's kept separate from
// isEntityBranch rather than folded into it.
const NO_PAYOUT_BRANCHES=["HQ"];
const hidesPayout=(b,meta)=>isEntityBranch(b,meta)||NO_PAYOUT_BRANCHES.includes(b);

const ATTENDANCE_HOURS_KEY="emax_v5_business_hours";
const ATTENDANCE_EXTRA_STAFF_KEY="emax_v5_attendance_extra_staff";
const attendanceKeyFor=(year,month)=>`emax_v5_attendance_${year}_${month}`;
const seedBusinessHours=()=>Object.fromEntries(BRANCHES.map(b=>[b,{start:"09:30",end:"18:30"}]));

const [FIRST_YEAR,FIRST_MONTH]=[2026,10]; // October 2026 — data starts here, month picker won't go earlier
const MONTH_NAMES=["","January","February","March","April","May","June","July","August","September","October","November","December"];
const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
const minutesOf=t=>{if(!t)return null;const[h,m]=t.split(":").map(Number);return h*60+m;};
const fmtMinutes=n=>{const h=Math.floor(n/60),m=n%60;return h>0?`${h}h ${m}m`:`${m}m`;};

/* ── Identity: a person who is Branch Manager of more than one branch
   (e.g. SUHAIDI at Emax CKS and Emax ITCC) is the same real person, tied
   together for display via the same managerId field branchMeta[branch]
   .managerId already carries (the same field the just-shipped BM-identity
   fix uses for reward/ranking). Falls back to matching the manager NAME
   when one side hasn't had a managerId set yet, so this still behaves
   sensibly on data that predates that field being filled in everywhere. ── */
function otherBranchesManagedBy(branch,meta){
  const m=meta[branch]||{};
  if(!m.manager)return[];
  return RETAIL_BRANCHES.filter(b=>{
    if(b===branch)return false;
    const m2=meta[b]||{};
    if(!m2.manager)return false;
    if(m.managerId&&m2.managerId)return m.managerId===m2.managerId;
    return m.manager===m2.manager;
  });
}
// HQ is a retail/commission branch everywhere else in the app (payout,
// targets, branch grouping all stay untouched), but per Sophia's explicit
// request its Attendance roster is NOT auto-populated from branchMeta's
// manager or from srList — it starts empty, same as the manual-add-only
// entity outlets, and staff only appear once Sophia/emaxhr add them via
// "Add Staff". This is purely a roster-population rule, so it lives here
// rather than in isEntityBranch (which still governs payout display and
// must keep treating HQ as a normal commission branch).
const MANUAL_ROSTER_ONLY_BRANCHES=["HQ"];
// Attendance records themselves stay per-branch (like employment/status
// history does) — a manager can have different hours/history at each
// branch they run — keyed BM_<branch>, never by managerId. Identity is
// only shared for DISPLAY (the "Also manages" note), not for the record.
// Directors who hold a Branch Manager slot in the data (for their branch's
// own commission/monthly-report/target tracking, which this list must never
// touch) but are not regular staff and should never appear on the
// Attendance page or in the Reward Point Ranking — per Sophia: "Max siew
// and EC (both director) no need attendance, point reward." Matched by
// name, case-insensitively, wherever a roster/ranking entry's display name
// comes from — a manager name or an SR canon name. Keep this in sync by
// hand with the matching list in App.jsx (the two files don't share a
// lookup module for this one narrow case).
const DIRECTOR_EXCLUDED_NAMES=["MAX SIEW","EC"];
const isDirectorExcluded=name=>DIRECTOR_EXCLUDED_NAMES.includes((name||"").trim().toUpperCase());
function rosterFor(branch,meta,srList){
  if(MANUAL_ROSTER_ONLY_BRANCHES.includes(branch))return[];
  const m=meta[branch]||{};
  const people=[];
  if(m.manager&&!isDirectorExcluded(m.manager))people.push({id:`BM_${branch}`,name:m.manager,role:"Branch Manager",branch,alsoManages:otherBranchesManagedBy(branch,meta)});
  srList.filter(s=>s.branch===branch&&!isDirectorExcluded(s.canon)).forEach(s=>people.push({id:s.id,name:s.canon,role:`${s.type} SR`,branch}));
  return people;
}
// Attendance-only staff (added via "Add Staff") can be deactivated instead
// of hard-deleted, so their past recorded days stay reviewable. A person is
// active unless explicitly flagged otherwise (so pre-existing records with
// no `active` field at all are treated as active — backward compatible).
const isActiveStaff=p=>p.active!==false;
const personHasDataInMonth=(person,attendance)=>!!(attendance[person.id]&&Object.keys(attendance[person.id]).length>0);
// ONE shared roster-building helper, used by every surface that lists staff
// (fill-in table, summary table, business-hours staff list, read-only
// branch view) so the active/inactive rule never has to be re-implemented
// per screen. A deactivated attendance-only person is hidden from the
// roster for the month being viewed UNLESS `showInactive` is on, or unless
// they already have recorded attendance data for that specific month (so
// a month where they were still active stays intact and reviewable even
// after they're deactivated later). Extra-staff entries are tagged
// `isExtra:true` here so callers can offer edit/deactivate controls only
// on the ones that support it (never on real SR/BM roster entries).
function combinedRoster(branch,meta,srList,extraStaff,attendance={},showInactive=false){
  const base=rosterFor(branch,meta,srList);
  const extras=(extraStaff[branch]||[])
    .filter(p=>isActiveStaff(p)||showInactive||personHasDataInMonth(p,attendance))
    .map(p=>({...p,isExtra:true}));
  return[...base,...extras];
}

/* ── Lateness / early-out / leave / payout logic (unchanged from preview) ── */
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

/* ── Branch/outlet picker — row of pill buttons, grouped Retail vs Other
   Outlets, instead of a dropdown. ─────────────────────────────────────── */
function BranchTabs({value,onChange,meta}){
  const rowStyle={display:"flex",flexWrap:"wrap",gap:6};
  const btnStyle=b=>({padding:"6px 13px",borderRadius:20,border:`1px solid ${value===b?C.navy:C.border}`,background:value===b?C.navy:"#fff",color:value===b?"#fff":C.textMid,fontSize:11.5,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"});
  return<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div>
      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Retail Branches</div>
      <div style={rowStyle}>{RETAIL_BRANCHES.map(b=><button key={b} onClick={()=>onChange(b)} style={btnStyle(b)}>{meta[b]?.name||b}</button>)}</div>
    </div>
    <div>
      <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Other Outlets</div>
      <div style={rowStyle}>{ENTITY_BRANCHES.map(b=><button key={b} onClick={()=>onChange(b)} style={btnStyle(b)}>{meta[b]?.name||b}</button>)}</div>
    </div>
  </div>;
}

/* ── Add Staff modal — attendance-record only, not tied to the monthly
   commission/report roster (srList) kept elsewhere. `existingNames` (already
   trimmed+lowercased) guards against accidental exact-duplicate entries,
   and `roleOptions` feeds a <datalist> of roles already used at this branch
   so previously-typed roles get suggested (typos like "Offlin SR" become
   less likely) while still allowing any free-text role. ─────────────── */
function AddStaffModal({branch,meta,existingNames=[],roleOptions=[],onAdd,onClose}){
  const[name,setName]=useState("");
  const[role,setRole]=useState("");
  const canSave=name.trim()&&role.trim();
  const roleListId=`attendance-roles-${branch}`;
  const handleAdd=()=>{
    const trimmedName=name.trim(),trimmedRole=role.trim();
    if(!trimmedName||!trimmedRole)return;
    if(existingNames.includes(trimmedName.toLowerCase())){
      if(!confirm(`A staff member named "${trimmedName}" already exists at this branch. Add anyway?`))return;
    }
    onAdd({id:`extra_${branch}_${Date.now()}`,name:trimmedName,role:trimmedRole,branch});
    onClose();
  };
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:380}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>Add Staff — {meta[branch]?.name||branch}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:18}}>
        <div style={{marginBottom:12}}><L req>Name</L><I value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. JASON LIM"/></div>
        <div style={{marginBottom:14}}>
          <L req>Role</L>
          <I value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Offline SR, Instructor..." list={roleOptions.length>0?roleListId:undefined}/>
          {roleOptions.length>0&&<datalist id={roleListId}>{roleOptions.map(r=><option key={r} value={r}/>)}</datalist>}
        </div>
        <div style={{fontSize:10.5,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",marginBottom:14}}>Added here for attendance tracking only — this does not add them to the monthly commission/report roster kept elsewhere.</div>
        <div style={{display:"flex",gap:8}}>
          <PBtn disabled={!canSave} onClick={handleAdd} style={{flex:1}}>{Ic.check} Add Staff</PBtn>
          <GBtn onClick={onClose}>Cancel</GBtn>
        </div>
      </div>
    </div>
  </div>;
}

/* ── Edit an existing attendance-only staff member's name/role. Never used
   for real SR/BM roster entries (those come from srList/branchMeta, edited
   elsewhere in the app). ─────────────────────────────────────────────── */
function EditStaffModal({person,meta,roleOptions=[],onSave,onClose}){
  const[name,setName]=useState(person.name);
  const[role,setRole]=useState(person.role);
  const canSave=name.trim()&&role.trim();
  const roleListId=`attendance-roles-edit-${person.id}`;
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:380}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>Edit Staff — {meta[person.branch]?.name||person.branch}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:18}}>
        <div style={{marginBottom:12}}><L req>Name</L><I value={name} onChange={e=>setName(e.target.value)}/></div>
        <div style={{marginBottom:14}}>
          <L req>Role</L>
          <I value={role} onChange={e=>setRole(e.target.value)} list={roleOptions.length>0?roleListId:undefined}/>
          {roleOptions.length>0&&<datalist id={roleListId}>{roleOptions.map(r=><option key={r} value={r}/>)}</datalist>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <PBtn disabled={!canSave} onClick={()=>{onSave({name:name.trim(),role:role.trim()});onClose();}} style={{flex:1}}>{Ic.check} Save Changes</PBtn>
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
  // A day being filled in for the FIRST time (entry was empty) never needs
  // confirmation — only overwriting an already-filled day with something
  // different does, since that's the destructive case (previous record is
  // gone with no undo once saved).
  const isUnchanged=entry&&(type==="WORKED"
    ?(!entry.leave&&entry.in===inT&&(entry.out||null)===(outT||null))
    :entry.leave===type);
  const handleSave=()=>{
    const newEntry=type==="WORKED"?{in:inT,out:outT||null}:{leave:type};
    if(entry&&!isUnchanged){
      if(!confirm(`${day} ${monthLabel} for ${person.name} is already filled in. Saving will overwrite the existing record. Continue?`))return;
    }
    onSave(day,newEntry);
    onClose();
  };
  const handleClear=()=>{
    if(!confirm(`Clear the attendance record for ${person.name} on ${day} ${monthLabel}? This cannot be undone.`))return;
    onSave(day,null);
    onClose();
  };
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"90%",maxWidth:380}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{person.name} · {day} {monthLabel}</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.7)",borderRadius:7,padding:"4px 10px",cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:18}}>
        <div style={{marginBottom:12}}>
          <L>Day Type</L>
          <SEL value={type} onChange={e=>setType(e.target.value)}>
            <option value="WORKED">Worked (clock in / out)</option>
            {LEAVE_TYPES.map(l=><option key={l.code} value={l.code}>{l.label}{HALF_DAY_LEAVE_CODES.includes(l.code)?" — counts as 0.5 day":""}</option>)}
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
          {entry&&<GBtn onClick={handleClear}>Clear</GBtn>}
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

/* ── Fill-in table: staff down the side, one column per day — the same
   shape as the monthly report table (emaxhr / Sophia only). ─────────── */
function HRFillInView({year,month,meta,srList,attendance,setAttendance,hours,extraStaff,onEditStaff,branch,setBranch,readOnly=false,daysReadOnly=false}){
  // readOnly = the whole grid is view-only (Boon Theng/Wingfei: no rename,
  // no day-cell editing). daysReadOnly = just the day-cell click-to-edit is
  // disabled (emaxhr/Sophia: editing now happens exclusively through "Fill
  // Attendance (List)", which is also where "Add Staff" now lives), but
  // rename stays fully working. readOnly implies day cells are
  // non-editable too, so callers only need to pass one or the other.
  const cellsLocked=readOnly||daysReadOnly;
  const[editing,setEditing]=useState(null); // {person, day}
  const[editingStaff,setEditingStaff]=useState(null); // attendance-only person being renamed/re-roled
  const[showInactive,setShowInactive]=useState(false);
  const roster=combinedRoster(branch,meta,srList,extraStaff,attendance,showInactive);
  const days=daysInMonth(year,month);
  const dayList=Array.from({length:days},(_,i)=>i+1);
  const monthLabel=`${MONTH_NAMES[month]} ${year}`;
  const branchHours=hours[branch]||{start:"09:30",end:"18:30"};
  const roleOptions=[...new Set(roster.map(p=>p.role).filter(Boolean))];

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
    <div style={{marginBottom:14}}><BranchTabs value={branch} onChange={setBranch} meta={meta}/></div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{fontSize:11,color:C.textLight}}>{isEntityBranch(branch,meta)?"No lateness rule shown for outlets by default.":<>Business Hours: <b style={{color:C.text}}>{branchHours.start} – {branchHours.end}</b></>}</div>
      <div style={{flex:1}}/>
      <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.textMid,cursor:"pointer"}}>
        <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>
        Show inactive staff
      </label>
    </div>

    {roster.length===0?<div style={{...card,padding:24,textAlign:"center",fontSize:12,color:C.textLight}}>No staff yet for {meta[branch]?.name||branch}. Use "Add Staff" on the Fill Attendance (List) tab to start tracking attendance here.</div>:
    <div style={{...card,overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%",fontFamily:"Inter,sans-serif"}}>
        <thead>
          <tr style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
            <th style={{...thStyle,position:"sticky",left:0,background:C.navy,textAlign:"left",padding:"7px 10px",minWidth:150,zIndex:2}}>Staff</th>
            {dayList.map(d=><th key={d} style={{...thStyle,minWidth:28}}>{d}</th>)}
            <th style={{...thStyle,minWidth:52}}>Issues</th>
            {!hidesPayout(branch,meta)&&<th style={{...thStyle,minWidth:64}}>Payout</th>}
          </tr>
        </thead>
        <tbody>
          {roster.map((person,ri)=>{
            const stats=monthStatsFor(person.id,attendance,branchHours,year,month);
            const pct=payoutPctFor(stats.issues);
            const inactive=person.isExtra&&!isActiveStaff(person);
            const rowBg=ri%2===0?"#fff":C.surface;
            return<tr key={person.id} style={inactive?{opacity:.55}:undefined}>
              <td style={{...tdBase,position:"sticky",left:0,background:rowBg,textAlign:"left",padding:"8px 10px",zIndex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.text}}>{person.name}</div>
                  {person.isExtra&&!readOnly&&<button onClick={()=>setEditingStaff(person)} title="Edit name/role" style={{background:"transparent",border:"none",color:C.textLight,cursor:"pointer",padding:2,display:"flex"}}>{Ic.edit}</button>}
                  {inactive&&<span style={{fontSize:8.5,fontWeight:700,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",textTransform:"uppercase"}}>Inactive</span>}
                </div>
                <div style={{fontSize:10,color:C.textLight}}>{person.role}</div>
                {person.alsoManages?.length>0&&<div style={{fontSize:9,color:C.blueBright,marginTop:1}}>Also at: {person.alsoManages.map(b=>meta[b]?.name||b).join(", ")}</div>}
              </td>
              {dayList.map(d=>{
                const entry=attendance[person.id]?.[d];
                const st=dayStatus(entry,branchHours);
                let bg=rowBg,fg=C.textLight,label="·";
                if(st.filled&&st.isLeave){const m=leaveMeta(st.leaveCode);bg=m.color+"18";fg=m.color;label=st.leaveCode;}
                else if(st.filled&&st.isIssue){bg="#FEF2F2";fg=C.red;label="!";}
                else if(st.filled){bg="#F0FDF4";fg=C.green;label="✓";}
                const title=st.filled?(st.isLeave?st.leaveLabel:`${entry.in} – ${entry.out||"—"}`):"Not filled";
                return<td key={d} style={{...tdBase,background:bg}}>
                  {cellsLocked
                    ?<div title={title} style={{width:"100%",height:30,display:"flex",alignItems:"center",justifyContent:"center",color:fg,fontSize:st.isLeave?9:11,fontWeight:700}}>{label}</div>
                    :<button onClick={()=>setEditing({person,day:d})} title={title+" — click to fill in"} style={{width:"100%",height:30,border:"none",background:"transparent",color:fg,fontSize:st.isLeave?9:11,fontWeight:700,cursor:"pointer"}}>{label}</button>}
                </td>;
              })}
              <td style={{...tdBase,background:rowBg,borderRight:hidesPayout(branch,meta)?"none":undefined,fontSize:12,fontWeight:700,color:stats.issues>0?C.red:C.textLight}}>{stats.issues}</td>
              {!hidesPayout(branch,meta)&&<td style={{...tdBase,background:rowBg,borderRight:"none"}}><span style={{fontSize:11,fontWeight:800,color:payoutColor(pct),background:payoutColor(pct)+"15",padding:"3px 9px",borderRadius:20,display:"inline-block"}}>{pct}%</span></td>}
            </tr>;
          })}
        </tbody>
      </table>
    </div>}
    <DayLegend/>

    {!cellsLocked&&editing&&<DayEditModal person={editing.person} day={editing.day} monthLabel={monthLabel} entry={attendance[editing.person.id]?.[editing.day]} hours={branchHours}
      onSave={(day,entry)=>saveDay(editing.person.id,day,entry)} onClose={()=>setEditing(null)}/>}
    {!readOnly&&editingStaff&&<EditStaffModal person={editingStaff} meta={meta} roleOptions={roleOptions} onSave={updates=>onEditStaff(branch,editingStaff.id,updates)} onClose={()=>setEditingStaff(null)}/>}
  </div>;
}

/* ── Fill-in LIST: an alternative to HRFillInView's wide grid, for filling
   in a whole branch's staff for ONE day at once — branch, then day, then
   every staff member's Day Type / Clock In / Clock Out inline in the row
   (no popup). Per Sophia: "choose day type from day type column as drop
   down list, and key in clock in clock out time directly, no need to pop
   out. click save all after key in all staff in same branch." Each row is
   a local, unsaved draft; nothing is written until "Save All" is pressed,
   which commits every changed row for this branch+day in one go (through
   the same persistedUpdate-wrapped setAttendance the rest of the file
   uses, so a failed save rolls the whole batch back and surfaces the usual
   red banner — nothing is ever left looking saved when it silently
   wasn't). Purely additive — the grid (HRFillInView) is untouched. ────── */
function HRFillInListView({year,month,meta,srList,attendance,setAttendance,hours,extraStaff,onAddStaff,branch,setBranch}){
  const roster=combinedRoster(branch,meta,srList,extraStaff,attendance,false);
  const roleOptions=[...new Set(roster.map(p=>p.role).filter(Boolean))];
  const[adding,setAdding]=useState(false);
  const days=daysInMonth(year,month);
  const dayList=Array.from({length:days},(_,i)=>i+1);
  const [day,setDay]=useState(1);
  // Keep the selected day valid if the month changes to one with fewer days.
  useEffect(()=>{
    if(day>days)setDay(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[days]);
  const monthLabel=`${MONTH_NAMES[month]} ${year}`;
  const branchHours=hours[branch]||{start:"09:30",end:"18:30"};

  // Entries as stored use {leave} or {in,out?}, with `out` sometimes simply
  // absent rather than null — normalize both sides the same way before ever
  // comparing "did this row actually change".
  const normalizeEntry=entry=>{
    if(!entry)return null;
    if(entry.leave)return{leave:entry.leave};
    return{in:entry.in,out:entry.out||null};
  };
  const draftFromEntry=entry=>{
    const n=normalizeEntry(entry);
    if(!n)return{type:"WORKED",in:"",out:""};
    if(n.leave)return{type:n.leave,in:"",out:""};
    return{type:"WORKED",in:n.in||"",out:n.out||""};
  };
  // One local draft per person, reset to whatever's already saved whenever
  // the branch or day changes — a fresh sheet for the newly-selected day.
  const [drafts,setDrafts]=useState({});
  useEffect(()=>{
    const seeded={};
    roster.forEach(p=>{seeded[p.id]=draftFromEntry(attendance[p.id]?.[day]);});
    setDrafts(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[branch,day]);
  const setRowDraft=(personId,patch)=>setDrafts(prev=>({...prev,[personId]:{...(prev[personId]||draftFromEntry(attendance[personId]?.[day])),...patch}}));

  // A row only ever contributes to Save All once it's a *complete* entry
  // that actually *differs* from what's already saved — an untouched row,
  // or a half-filled "Worked" row with no Clock In yet, is simply left
  // alone (never blanks out an existing record).
  const entryFromDraft=draft=>{
    if(draft.type==="WORKED"){
      if(!draft.in)return undefined; // incomplete — skip this row entirely
      return{in:draft.in,out:draft.out||null};
    }
    return{leave:draft.type};
  };
  const pendingChanges=roster.map(person=>{
    const draft=drafts[person.id]||draftFromEntry(attendance[person.id]?.[day]);
    const newEntry=entryFromDraft(draft);
    if(newEntry===undefined)return null;
    const original=normalizeEntry(attendance[person.id]?.[day]);
    if(JSON.stringify(newEntry)===JSON.stringify(original))return null;
    return{personId:person.id,name:person.name,newEntry,isOverwrite:!!original};
  }).filter(Boolean);

  const handleSaveAll=()=>{
    if(pendingChanges.length===0)return;
    const overwrites=pendingChanges.filter(c=>c.isOverwrite);
    if(overwrites.length>0){
      if(!confirm(`${overwrites.length} of these ${overwrites.length===1?"person":"people"} already ${overwrites.length===1?"has":"have"} an entry for ${day} ${monthLabel} that will be overwritten (${overwrites.map(c=>c.name).join(", ")}). Continue?`))return;
    }
    setAttendance(prev=>{
      const next={...prev};
      pendingChanges.forEach(c=>{next[c.personId]={...(next[c.personId]||{}),[day]:c.newEntry};});
      return next;
    });
  };

  const navBtn={padding:"7px 12px",borderRadius:6,border:`1px solid ${C.border}`,background:"#fff",color:C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"};
  const thStyle={textAlign:"left",padding:"8px 10px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`};
  const smallSelStyle={padding:"5px 6px",fontSize:11.5,minWidth:170};
  const smallTimeStyle={padding:"5px 6px",fontSize:11.5,width:92};

  return<div>
    <div style={{marginBottom:14}}><BranchTabs value={branch} onChange={setBranch} meta={meta}/></div>
    <div style={{marginBottom:14,display:"flex",alignItems:"flex-end",gap:8,flexWrap:"wrap"}}>
      <div style={{maxWidth:140}}>
        <L>Day</L>
        <SEL value={day} onChange={e=>setDay(Number(e.target.value))}>
          {dayList.map(d=><option key={d} value={d}>{d}</option>)}
        </SEL>
      </div>
      <button onClick={()=>setDay(d=>Math.max(1,d-1))} disabled={day<=1} style={{...navBtn,opacity:day<=1?.45:1,cursor:day<=1?"default":"pointer"}}>‹ Prev day</button>
      <button onClick={()=>setDay(d=>Math.min(days,d+1))} disabled={day>=days} style={{...navBtn,opacity:day>=days?.45:1,cursor:day>=days?"default":"pointer"}}>Next day ›</button>
      <div style={{flex:1}}/>
      <GBtn onClick={()=>setAdding(true)}>{Ic.plus} Add Staff</GBtn>
    </div>

    {roster.length===0?<div style={{...card,padding:24,textAlign:"center",fontSize:12,color:C.textLight}}>No staff yet for {meta[branch]?.name||branch}. Use "Add Staff" above to start tracking attendance here.</div>:
    <div style={{...card,overflow:"hidden"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{day} {monthLabel}</div>
          <div style={{fontSize:10.5,color:"rgba(255,255,255,.65)"}}>{meta[branch]?.name||branch} · pick a Day Type and key in times for each staff member, then Save All</div>
        </div>
        <PBtn disabled={pendingChanges.length===0} onClick={handleSaveAll}>{Ic.check} Save All{pendingChanges.length>0?` (${pendingChanges.length})`:""}</PBtn>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
          <thead><tr>
            <th style={thStyle}>Staff</th>
            <th style={thStyle}>Day Type</th>
            <th style={thStyle}>Clock In</th>
            <th style={thStyle}>Clock Out</th>
            <th style={thStyle}>Status</th>
          </tr></thead>
          <tbody>
            {roster.map(person=>{
              const draft=drafts[person.id]||draftFromEntry(attendance[person.id]?.[day]);
              const isWorked=draft.type==="WORKED";
              const newEntry=entryFromDraft(draft);
              const original=normalizeEntry(attendance[person.id]?.[day]);
              const isChanged=newEntry!==undefined&&JSON.stringify(newEntry)!==JSON.stringify(original);
              // Live preview grades whatever's actually complete right now —
              // the in-progress draft if it's ready, otherwise whatever's
              // already saved, so a half-filled row doesn't just show blank.
              const previewEntry=newEntry!==undefined?newEntry:(attendance[person.id]?.[day]||null);
              const st=dayStatus(previewEntry,branchHours);
              let statusEl;
              if(!st.filled)statusEl=<span style={{color:C.textLight}}>Not filled</span>;
              else if(st.isLeave)statusEl=<span style={{color:leaveMeta(st.leaveCode).color,fontWeight:700}}>{st.leaveLabel}</span>;
              else if(st.isLate&&st.isEarlyOut)statusEl=<span style={{color:C.red,fontWeight:700}}>Late {fmtMinutes(st.lateBy)} + Early Out {fmtMinutes(st.earlyBy)}</span>;
              else if(st.isLate)statusEl=<span style={{color:C.red,fontWeight:700}}>Late by {fmtMinutes(st.lateBy)}</span>;
              else if(st.isEarlyOut)statusEl=<span style={{color:C.amber,fontWeight:700}}>Early Out by {fmtMinutes(st.earlyBy)}</span>;
              else statusEl=<span style={{color:C.green,fontWeight:700}}>On time</span>;
              return<tr key={person.id} style={{background:isChanged?"#EFF6FF":"transparent"}}>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:700}}>
                  {person.name}
                  {person.isExtra&&!isActiveStaff(person)?<span style={{marginLeft:5,fontSize:8.5,fontWeight:700,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",textTransform:"uppercase"}}>Inactive</span>:null}
                  <div style={{fontSize:9.5,fontWeight:400,color:C.textLight}}>{person.role}</div>
                </td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`}}>
                  <SEL value={draft.type} onChange={e=>setRowDraft(person.id,{type:e.target.value})} style={smallSelStyle}>
                    <option value="WORKED">Worked (clock in / out)</option>
                    {LEAVE_TYPES.map(l=><option key={l.code} value={l.code}>{l.label}{HALF_DAY_LEAVE_CODES.includes(l.code)?" — 0.5 day":""}</option>)}
                  </SEL>
                </td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`}}>
                  <I type="time" disabled={!isWorked} value={draft.in} onChange={e=>setRowDraft(person.id,{in:e.target.value})} style={{...smallTimeStyle,opacity:isWorked?1:.4}}/>
                </td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`}}>
                  <I type="time" disabled={!isWorked} value={draft.out} onChange={e=>setRowDraft(person.id,{out:e.target.value})} style={{...smallTimeStyle,opacity:isWorked?1:.4}}/>
                </td>
                <td style={{padding:"7px 10px",borderBottom:`1px solid ${C.border}`}}>{statusEl}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>}
    <DayLegend/>

    {adding&&<AddStaffModal branch={branch} meta={meta} existingNames={roster.map(p=>p.name.trim().toLowerCase())} roleOptions={roleOptions} onAdd={p=>onAddStaff(branch,p)} onClose={()=>setAdding(false)}/>}
  </div>;
}

/* ── Sophia-only: edit each branch's Business Hours + add staff ──────── */
function BusinessHoursView({year,month,meta,srList=[],attendance={},hours,setHours,extraStaff,onAddStaff,onEditStaff,onSetStaffActive,onRemoveStaff}){
  const[draft,setDraft]=useState(hours);
  const[addingFor,setAddingFor]=useState(null);
  const[editingStaff,setEditingStaff]=useState(null);
  const monthLabel=`${MONTH_NAMES[month]} ${year}`;
  useEffect(()=>{setDraft(hours);},[hours]);
  const dirty=JSON.stringify(draft)!==JSON.stringify(hours);
  // Lateness/early-out are computed LIVE against current Business Hours
  // (never snapshotted at entry time) — so changing a branch's hours
  // silently re-grades every day already recorded there this month.
  // Warn before saving whenever that's actually about to happen.
  const branchHasAttendanceThisMonth=b=>combinedRoster(b,meta,srList,extraStaff)
    .some(p=>attendance[p.id]&&Object.keys(attendance[p.id]).length>0);
  const handleSaveHours=()=>{
    const changedBranches=BRANCHES.filter(b=>JSON.stringify(draft[b])!==JSON.stringify(hours[b]));
    const affected=changedBranches.filter(branchHasAttendanceThisMonth);
    if(affected.length>0){
      const names=affected.map(b=>meta[b]?.name||b).join(", ");
      if(!confirm(`Changing hours for ${names} will re-evaluate lateness/early-out for every day already recorded this month there — payout percentages may shift retroactively. Continue?`))return;
    }
    setHours(draft);
  };
  // The one place attendance-only staff are fully managed: edit name/role,
  // deactivate (keeps their history intact, just hides them from the
  // current/future fill-in table and Add Staff pickers), reactivate, or —
  // only when they have no recorded data for the month currently being
  // viewed — permanently remove. "No data" can only be checked against
  // whichever month is loaded right now (this app loads one month's
  // attendance at a time everywhere, not a full history in one shot), so
  // Remove is a deliberately narrow option; Deactivate is always the safe
  // default and is offered regardless of what data exists elsewhere.
  const renderCard=b=>{
    const staffList=extraStaff[b]||[];
    return<div key={b} style={{...card,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:12.5,color:C.text}}>{meta[b]?.name||b}</div>
        <button onClick={()=>setAddingFor(b)} title="Add staff (attendance only)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"3px 7px",cursor:"pointer",color:C.textMid,display:"flex",alignItems:"center"}}>{Ic.plus}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
        <div><L>Clock In</L><I type="time" value={draft[b]?.start||"09:30"} onChange={e=>setDraft(p=>({...p,[b]:{...p[b],start:e.target.value}}))}/></div>
        <div><L>Clock Out</L><I type="time" value={draft[b]?.end||"18:30"} onChange={e=>setDraft(p=>({...p,[b]:{...p[b],end:e.target.value}}))}/></div>
      </div>
      {staffList.length>0&&<div style={{marginTop:4,paddingTop:10,borderTop:`1px dashed ${C.border}`,display:"flex",flexDirection:"column",gap:7}}>
        <div style={{fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em"}}>Attendance-only staff</div>
        {staffList.map(s=>{
          const active=isActiveStaff(s);
          const hasData=personHasDataInMonth(s,attendance);
          return<div key={s.id} style={{display:"flex",alignItems:"center",gap:6,opacity:active?1:.6,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:90,fontSize:11}}>
              <span style={{fontWeight:600,color:C.text}}>{s.name}</span>
              <span style={{color:C.textLight}}> · {s.role}</span>
              {!active&&<span style={{marginLeft:5,fontSize:8.5,fontWeight:700,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",textTransform:"uppercase"}}>Inactive</span>}
            </div>
            <button onClick={()=>setEditingStaff(s)} title="Edit name/role" style={{background:"transparent",border:"none",color:C.textLight,cursor:"pointer",padding:2,display:"flex"}}>{Ic.edit}</button>
            <button onClick={()=>{
              if(active){
                if(confirm(`Deactivate ${s.name}? They'll stop appearing in the current/future Attendance Table and Add Staff pickers, but anything already recorded for them stays intact and reviewable (tick "Show inactive staff" to see them again). Continue?`))onSetStaffActive(b,s.id,false);
              }else{
                onSetStaffActive(b,s.id,true);
              }
            }} style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.textMid,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>{active?"Deactivate":"Reactivate"}</button>
            {!hasData&&<button onClick={()=>{if(confirm(`Permanently remove ${s.name}? They have no attendance recorded for ${monthLabel} (the app can only check the month you're currently viewing). If they might have data in another month, use Deactivate instead so that history is never lost. This cannot be undone. Continue?`))onRemoveStaff(b,s.id);}} title="Only available when they have no recorded attendance for the month currently shown" style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,border:"1px solid #FECACA",background:"transparent",color:C.red,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>Remove</button>}
          </div>;
        })}
      </div>}
    </div>;
  };
  return<div>
    <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Retail Branches</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:20}}>
      {RETAIL_BRANCHES.map(renderCard)}
    </div>
    <div style={{fontSize:10.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Other Outlets</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12,marginBottom:16}}>
      {ENTITY_BRANCHES.map(renderCard)}
    </div>
    <PBtn disabled={!dirty} onClick={handleSaveHours}>{Ic.check} Save Business Hours</PBtn>
    {addingFor&&<AddStaffModal branch={addingFor} meta={meta}
      existingNames={combinedRoster(addingFor,meta,srList,extraStaff).map(p=>p.name.trim().toLowerCase())}
      roleOptions={[...new Set(combinedRoster(addingFor,meta,srList,extraStaff).map(p=>p.role).filter(Boolean))]}
      onAdd={p=>onAddStaff(addingFor,p)} onClose={()=>setAddingFor(null)}/>}
    {editingStaff&&<EditStaffModal person={editingStaff} meta={meta}
      roleOptions={[...new Set(combinedRoster(editingStaff.branch,meta,srList,extraStaff).map(p=>p.role).filter(Boolean))]}
      onSave={updates=>onEditStaff(editingStaff.branch,editingStaff.id,updates)} onClose={()=>setEditingStaff(null)}/>}
  </div>;
}

/* ── Attendance Summary — same shape as the Attendance Table, with a
   Working Days column plus one column per leave type. UPL combines
   full-day Unpaid Leave (UL) with half-day Unpaid Leave (UH) at 0.5. ──── */
function AttendanceSummaryTable({year,month,meta,srList,attendance,hours,extraStaff,onEditStaff,branch,setBranch}){
  const[showInactive,setShowInactive]=useState(false);
  const[editingStaff,setEditingStaff]=useState(null);
  const roster=combinedRoster(branch,meta,srList,extraStaff,attendance,showInactive);
  const roleOptions=[...new Set(roster.map(p=>p.role).filter(Boolean))];
  const branchHours=hours[branch]||{start:"09:30",end:"18:30"};
  const fmt=n=>Number.isInteger(n)?n:n.toFixed(1);
  const thStyle={padding:"7px 8px",fontSize:9.5,fontWeight:700,color:"rgba(255,255,255,.8)",textTransform:"uppercase",letterSpacing:"0.04em",textAlign:"center",whiteSpace:"nowrap"};
  const tdBase={padding:"8px",textAlign:"center",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,fontSize:12,color:C.textMid};

  return<div>
    <div style={{marginBottom:14}}><BranchTabs value={branch} onChange={setBranch} meta={meta}/></div>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
      <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.textMid,cursor:"pointer"}}>
        <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>
        Show inactive staff
      </label>
    </div>
    {roster.length===0?<div style={{...card,padding:24,textAlign:"center",fontSize:12,color:C.textLight}}>No staff yet for {meta[branch]?.name||branch}.</div>:
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
            const inactive=person.isExtra&&!isActiveStaff(person);
            const rowBg=ri%2===0?"#fff":C.surface;
            return<tr key={person.id} style={inactive?{opacity:.55}:undefined}>
              <td style={{...tdBase,position:"sticky",left:0,background:rowBg,textAlign:"left",zIndex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.text}}>{person.name}</div>
                  {person.isExtra&&<button onClick={()=>setEditingStaff(person)} title="Edit name/role" style={{background:"transparent",border:"none",color:C.textLight,cursor:"pointer",padding:2,display:"flex"}}>{Ic.edit}</button>}
                  {inactive&&<span style={{fontSize:8.5,fontWeight:700,color:C.textLight,background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 5px",textTransform:"uppercase"}}>Inactive</span>}
                </div>
                <div style={{fontSize:10,color:C.textLight}}>{person.role}</div>
                {person.alsoManages?.length>0&&<div style={{fontSize:9,color:C.blueBright,marginTop:1}}>Also at: {person.alsoManages.map(b=>meta[b]?.name||b).join(", ")}</div>}
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
    </div>}
    {editingStaff&&<EditStaffModal person={editingStaff} meta={meta} roleOptions={roleOptions} onSave={updates=>onEditStaff(branch,editingStaff.id,updates)} onClose={()=>setEditingStaff(null)}/>}
  </div>;
}

/* ── Read-only day-by-day detail for ONE person. ──────────────────────── */
function PersonAttendanceDetailModal({person,meta,year,month,attendance,hours,onClose}){
  const days=daysInMonth(year,month);
  const dayList=Array.from({length:days},(_,i)=>i+1);
  const stats=monthStatsFor(person.id,attendance,hours,year,month);
  const pct=payoutPctFor(stats.issues);
  const entity=hidesPayout(person.branch,meta);
  return<div style={{position:"fixed",inset:0,background:"rgba(10,22,40,.65)",backdropFilter:"blur(4px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{...card,width:"95%",maxWidth:520,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{person.name}</div>
          <div style={{fontSize:10.5,color:"rgba(255,255,255,.65)"}}>{person.role} at {meta[person.branch]?.name||person.branch} · {MONTH_NAMES[month]} {year}</div>
          {person.alsoManages?.length>0&&<div style={{fontSize:10,color:"rgba(255,255,255,.55)",marginTop:2}}>Same person also manages: {person.alsoManages.map(b=>meta[b]?.name||b).join(", ")} (separate record there)</div>}
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
            <th style={{textAlign:"left",padding:"8px 4px",color:C.textLight,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.border}`}}>Status</th>
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

/* ── Read-only branch view — one branch's roster + payout %. Used both by
   a real branch account (locked to its own branch — no selector) and by
   Boon Theng/Wingfei (selector shown, browsing every branch/outlet). ──── */
function BranchView({year,month,meta,srList,attendance,hours,extraStaff,allowBranchSwitch,branch,setBranch}){
  const[viewing,setViewing]=useState(null); // person
  // Read-only surface — no "show inactive" toggle here (nothing to manage),
  // but a deactivated person with recorded data this month still shows so
  // the history stays reviewable, same rule as everywhere else.
  const roster=combinedRoster(branch,meta,srList,extraStaff,attendance,false);
  const branchHours=hours[branch]||{start:"09:30",end:"18:30"};
  const entity=hidesPayout(branch,meta);
  return<div>
    {allowBranchSwitch
      ?<div style={{marginBottom:16}}><BranchTabs value={branch} onChange={setBranch} meta={meta}/></div>
      :null}
    {roster.length===0?<div style={{...card,padding:24,textAlign:"center",fontSize:12,color:C.textLight}}>No attendance records yet for {meta[branch]?.name||branch}.</div>:
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14}}>
      {roster.map(person=>{
        const stats=monthStatsFor(person.id,attendance,branchHours,year,month);
        const pct=payoutPctFor(stats.issues);
        return<div key={person.id} onClick={()=>setViewing(person)} style={{...card,padding:16,cursor:"pointer"}}>
          <div style={{fontWeight:700,fontSize:14,color:C.text}}>{person.name}</div>
          <div style={{fontSize:11,color:C.textLight,marginBottom:person.alsoManages?.length>0?2:12}}>{person.role}</div>
          {person.alsoManages?.length>0&&<div style={{fontSize:9.5,color:C.blueBright,marginBottom:10}}>Also manages: {person.alsoManages.map(b=>meta[b]?.name||b).join(", ")}</div>}
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
    </div>}
    {viewing&&<PersonAttendanceDetailModal person={viewing} meta={meta} year={year} month={month} attendance={attendance} hours={branchHours} onClose={()=>setViewing(null)}/>}
  </div>;
}

/* ══════════════════════════════════════════════════════════════════════
   Root component — everything else in this file is an implementation
   detail of this one export.
   ══════════════════════════════════════════════════════════════════════ */
export default function AttendanceTab({branchMeta={},srList=[],isAdmin=false,canManageHours=false,userBranch=null,allowBranchSwitch=false,email=null}){
  const meta=useMemo(()=>({...ENTITY_BRANCH_META,...branchMeta}),[branchMeta]);
  const firstBranch=userBranch||RETAIL_BRANCHES[0];

  const [year,setYear]=useState(FIRST_YEAR);
  const [month,setMonth]=useState(FIRST_MONTH);
  const [branch,setBranchRaw]=useState(firstBranch);
  const setBranch=userBranch?()=>{}:setBranchRaw; // locked-branch views never switch
  const effectiveBranch=userBranch||branch;

  // Clicking into Attendance should land on the "Fill Attendance (List)"
  // workflow first for both emaxhr and Sophia (per Sophia's instruction),
  // regardless of the order the tab buttons are drawn in below. The
  // view-only cross-branch viewers (Boon Theng/Wingfei) have no "list" tab
  // at all, so they default to "table" (their first/leftmost tab) instead.
  const viewCross=!isAdmin&&allowBranchSwitch; // Boon Theng / Wingfei: view-only, multi-branch
  const [sub,setSub]=useState(isAdmin?"list":"cards"); // hours | list | table | summary | cards

  const [hours,setHours_]=useState(seedBusinessHours());
  const [extraStaff,setExtraStaff_]=useState({});
  const [attendance,setAttendance_]=useState({});
  const [loadingBase,setLoadingBase]=useState(true);
  const [loadingMonth,setLoadingMonth]=useState(true);

  // Business hours + attendance-only staff are month-independent — load once.
  useEffect(()=>{
    let cancelled=false;
    Promise.all([loadData(ATTENDANCE_HOURS_KEY),loadData(ATTENDANCE_EXTRA_STAFF_KEY)]).then(([h,es])=>{
      if(cancelled)return;
      setHours_({...seedBusinessHours(),...(h||{})});
      setExtraStaff_(es||{});
      setLoadingBase(false);
    });
    return()=>{cancelled=true;};
  },[]);

  // Attendance records are per year/month — reload whenever the picker changes.
  useEffect(()=>{
    let cancelled=false;
    setLoadingMonth(true);
    loadData(attendanceKeyFor(year,month)).then(a=>{
      if(cancelled)return;
      setAttendance_(a||{});
      setLoadingMonth(false);
    });
    return()=>{cancelled=true;};
  },[year,month]);

  // Save-failure feedback: every write below is optimistic (the UI updates
  // immediately), but if the actual Supabase write fails we roll the local
  // state back to what it was before the change and surface a clear banner
  // — so nothing is ever left LOOKING saved when it silently wasn't.
  const [saveError,setSaveError]=useState(null);
  const persistedUpdate=(setState,key,updater,label)=>{
    let prevSnapshot;
    setState(prev=>{
      prevSnapshot=prev;
      const next=typeof updater==="function"?updater(prev):updater;
      saveData(key,next).then(res=>{
        if(res&&res.ok===false)throw res.error||new Error("save failed");
        setSaveError(null);
      }).catch(err=>{
        console.error(`AttendanceTab: failed to save ${label}:`,err);
        setState(prevSnapshot); // roll back — the change never actually saved
        setSaveError(`Couldn't save ${label} — check your connection and try again.`);
      });
      return next;
    });
  };
  const setAttendance=updater=>persistedUpdate(setAttendance_,attendanceKeyFor(year,month),updater,"attendance");
  const setHours=updater=>persistedUpdate(setHours_,ATTENDANCE_HOURS_KEY,updater,"business hours");
  const addStaff=(b,person)=>persistedUpdate(setExtraStaff_,ATTENDANCE_EXTRA_STAFF_KEY,prev=>({...prev,[b]:[...(prev[b]||[]),person]}),"new staff member");
  const editStaff=(b,id,updates)=>persistedUpdate(setExtraStaff_,ATTENDANCE_EXTRA_STAFF_KEY,prev=>({...prev,[b]:(prev[b]||[]).map(p=>p.id===id?{...p,...updates}:p)}),"staff changes");
  const setStaffActive=(b,id,active)=>persistedUpdate(setExtraStaff_,ATTENDANCE_EXTRA_STAFF_KEY,prev=>({...prev,[b]:(prev[b]||[]).map(p=>p.id===id?{...p,active}:p)}),active?"staff reactivation":"staff deactivation");
  const removeStaffHard=(b,id)=>persistedUpdate(setExtraStaff_,ATTENDANCE_EXTRA_STAFF_KEY,prev=>({...prev,[b]:(prev[b]||[]).filter(p=>p.id!==id)}),"staff removal");

  const monthOptions=[];
  for(let y=FIRST_YEAR;y<=FIRST_YEAR+2;y++){
    for(let m=1;m<=12;m++){
      if(y===FIRST_YEAR&&m<FIRST_MONTH)continue;
      monthOptions.push({y,m});
    }
  }

  if(loadingBase||loadingMonth){
    return<div style={{...card,padding:32,textAlign:"center",fontSize:12,color:C.textLight}}>Loading attendance…</div>;
  }

  return<div>
    {saveError&&<div style={{display:"flex",alignItems:"center",gap:10,background:"#FEF2F2",border:"1px solid #FECACA",color:C.red,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,fontWeight:600}}>
      <span style={{flex:1}}>{saveError}</span>
      <button onClick={()=>setSaveError(null)} style={{background:"transparent",border:"none",color:C.red,cursor:"pointer",fontSize:13,fontWeight:700}}>×</button>
    </div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:16,fontWeight:800,color:C.navy}}>Attendance</div>
      {(isAdmin||viewCross)&&<div style={{display:"flex",gap:6,background:"#fff",border:`1px solid ${C.border}`,borderRadius:9,padding:4,flexWrap:"wrap"}}>
        {isAdmin?<>
          {canManageHours&&<button onClick={()=>setSub("hours")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="hours"?C.navy:"transparent",color:sub==="hours"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Business Hours & Staff</button>}
          <button onClick={()=>setSub("list")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="list"?C.navy:"transparent",color:sub==="list"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Fill Attendance (List)</button>
          <button onClick={()=>setSub("table")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="table"?C.navy:"transparent",color:sub==="table"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Attendance Table</button>
          <button onClick={()=>setSub("summary")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="summary"?C.navy:"transparent",color:sub==="summary"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Attendance Summary</button>
        </>:<>
          {/* Boon Theng / Wingfei — view-only, multi-branch: no Fill List (an editing
              feature) and Attendance Table is rendered read-only below.
              Branch Overview (the card grid) is first/default per Sophia. */}
          <button onClick={()=>setSub("cards")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="cards"?C.navy:"transparent",color:sub==="cards"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Branch Overview</button>
          <button onClick={()=>setSub("table")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="table"?C.navy:"transparent",color:sub==="table"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Attendance Table</button>
          <button onClick={()=>setSub("summary")} style={{padding:"7px 12px",borderRadius:6,border:"none",background:sub==="summary"?C.navy:"transparent",color:sub==="summary"?"#fff":C.textMid,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Attendance Summary</button>
        </>}
      </div>}
    </div>

    {(!isAdmin||sub!=="hours")&&<div style={{marginBottom:14,maxWidth:220}}>
      <L>Month</L>
      <SEL value={`${year}-${month}`} onChange={e=>{const[y,m]=e.target.value.split("-").map(Number);setYear(y);setMonth(m);}}>
        {monthOptions.map(o=><option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{MONTH_NAMES[o.m]} {o.y}</option>)}
      </SEL>
    </div>}

    {isAdmin?<>
      {sub==="hours"&&canManageHours&&<BusinessHoursView year={year} month={month} meta={meta} srList={srList} attendance={attendance} hours={hours} setHours={setHours} extraStaff={extraStaff} onAddStaff={addStaff} onEditStaff={editStaff} onSetStaffActive={setStaffActive} onRemoveStaff={removeStaffHard}/>}
      {sub==="list"&&<HRFillInListView year={year} month={month} meta={meta} srList={srList} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} onAddStaff={addStaff} branch={effectiveBranch} setBranch={setBranch}/>}
      {sub==="table"&&<HRFillInView daysReadOnly year={year} month={month} meta={meta} srList={srList} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} onEditStaff={editStaff} branch={effectiveBranch} setBranch={setBranch}/>}
      {sub==="summary"&&<AttendanceSummaryTable year={year} month={month} meta={meta} srList={srList} attendance={attendance} hours={hours} extraStaff={extraStaff} onEditStaff={editStaff} branch={effectiveBranch} setBranch={setBranch}/>}
    </>:viewCross?<>
      {/* Boon Theng / Wingfei: same grid/summary components emaxhr uses, but
          the grid is rendered read-only (no day-cell editing, no Add Staff,
          no staff rename) — no separate viewer-only re-implementation
          needed. Their old single card-grid view is kept too, as a third
          "Branch Overview" tab, since it was already read-only and still a
          fast at-a-glance view. */}
      {sub==="table"&&<HRFillInView readOnly year={year} month={month} meta={meta} srList={srList} attendance={attendance} setAttendance={setAttendance} hours={hours} extraStaff={extraStaff} branch={effectiveBranch} setBranch={setBranch}/>}
      {sub==="summary"&&<AttendanceSummaryTable year={year} month={month} meta={meta} srList={srList} attendance={attendance} hours={hours} extraStaff={extraStaff} onEditStaff={editStaff} branch={effectiveBranch} setBranch={setBranch}/>}
      {sub==="cards"&&<BranchView year={year} month={month} meta={meta} srList={srList} attendance={attendance} hours={hours} extraStaff={extraStaff} allowBranchSwitch={true} branch={effectiveBranch} setBranch={setBranch}/>}
    </>:<BranchView year={year} month={month} meta={meta} srList={srList} attendance={attendance} hours={hours} extraStaff={extraStaff} allowBranchSwitch={allowBranchSwitch&&!userBranch} branch={effectiveBranch} setBranch={setBranch}/>}
  </div>;
}
