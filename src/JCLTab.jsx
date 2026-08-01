/**
 * JCL Applications — Branch submits customer details for JCL merchant
 * financing → Admin/Manager submits to JCL → JCL may request follow-up
 * (branch must respond before it can move forward) → Admin marks
 * Approved/Rejected by JCL. On Approval, a new CCM order is automatically
 * created on the Order page, on behalf of the branch, pre-filled with the
 * application's customer/device/finance details.
 *
 * UI follows the same list → click-to-detail pattern as the Order page:
 * KPI cards, branch/agent filters, search, "+ New Application" button, and
 * clicking a row opens full detail + tracking timeline + action panel,
 * instead of an inline expand arrow.
 *
 * Storage: same simple key-value table pattern as Daily Sales Report, so
 * this ships without any manual Supabase schema migration.
 */
import {useState,useEffect,useMemo} from "react";
import {loadData,saveData} from "./storage/index.js";
import {uploadOrderFile,signFileUrl,reconcile} from "./storage/ordersApi.js";

const JCL_KEY="emax_v5_jcl_applications";

const STEPS=[
  {step:1,label:"New Application",color:"#1D4ED8",bg:"#EFF6FF"},
  {step:2,label:"Submitted to JCL",color:"#7C3AED",bg:"#F5F0FF"},
  {step:3,label:"Follow-Up Required",color:"#B45309",bg:"#FFFBEB"},
  {step:4,label:"Approved by JCL",color:"#15803D",bg:"#F0FDF4"},
  {step:5,label:"Rejected by JCL",color:"#DC2626",bg:"#FEF2F2"},
];
const stepDef=n=>STEPS.find(s=>s.step===n)||STEPS[0];

const Ic={
  chevL:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  share:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  edit:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  plus:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  fileText:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  share2:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  alertCircle:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  checkCircle:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  x:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  copy:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
};
const STEP_ICONS={1:Ic.fileText,2:Ic.share2,3:Ic.alertCircle,4:Ic.checkCircle,5:Ic.x};
const SHORT_LABELS={1:"New App",2:"Submitted",3:"Follow-Up",4:"Approved",5:"Rejected"};

function ProgressBar({step}){
  const pct=Math.round(((Math.min(step,5)-1)/4)*100);
  const cur=stepDef(step);
  return<div style={{...card,padding:"16px 18px",marginBottom:14}}>
    <div style={{display:"flex",width:"100%"}}>
      {STEPS.map((s,i)=>{
        const done=step>s.step,active=step===s.step;
        return<div key={s.step} style={{flex:i<STEPS.length-1?1:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
          <div style={{display:"flex",alignItems:"center",width:"100%"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:done?C.navy:active?C.blueBright:"#E4EAF2",border:`2px solid ${done?C.navy:active?C.blueBright:"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .2s"}}>
              {done?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{i+1}</span>}
            </div>
            {i<STEPS.length-1&&<div style={{flex:1,height:2,background:done?C.navy:"#E4EAF2",margin:"0 3px",transition:"background .3s"}}/>}
          </div>
          <div style={{marginTop:5,paddingLeft:1}}>
            <div style={{fontSize:9,fontWeight:700,color:active?C.blue:done?C.textMid:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",lineHeight:1.2,whiteSpace:"nowrap"}}>{SHORT_LABELS[s.step]}</div>
          </div>
        </div>;
      })}
    </div>
    <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden",marginTop:10}}>
      <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.blue},${C.blueBright})`,borderRadius:2,transition:"width .5s cubic-bezier(.4,0,.2,1)"}}/>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.textLight}}>
      <span>Step {step} of 5{cur?` — ${cur.label}`:""}</span><span style={{fontWeight:700,color:C.blue}}>{pct}%</span>
    </div>
  </div>;
}

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};
const daysSince=d=>{if(!d)return 0;const then=new Date(d+"T00:00:00"),now=new Date();now.setHours(0,0,0,0);return Math.round((now-then)/86400000);};
const sellingBranches=bm=>Object.keys(bm||{}).filter(b=>b!=="SDK");

const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const TX=props=><textarea {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",resize:"vertical",...(props.style||{})}}/>;
const SEL=props=><select {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const PBtn=({children,disabled,...p})=><button disabled={disabled} {...p} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"9px 18px",background:disabled?"#E4EAF2":`linear-gradient(135deg,${C.blue},${C.blueBright})`,color:disabled?C.textLight:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:disabled?"default":"pointer",fontFamily:"Inter,sans-serif",boxShadow:disabled?"none":"0 2px 8px rgba(27,63,114,.35)",transition:"all .15s",...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",...(p.style||{})}}>{children}</button>;
const DBtnLocal=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"9px 16px",background:"transparent",color:"#DC2626",border:"1px solid rgba(220,38,38,.3)",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:p.disabled?.5:1,...(p.style||{})}}>{children}</button>;

function StepBadge({step}){
  const d=stepDef(step);
  return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:d.bg,color:d.color,whiteSpace:"nowrap"}}>{d.label}</span>;
}

function readAppFile(f,syntheticId){
  return new Promise((res,rej)=>{
    if(!f.type||!f.type.startsWith("image/")){uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);return;}
    const img=new Image();
    const url=URL.createObjectURL(f);
    img.onload=()=>{
      const MAX=1600;
      let{width:w,height:h}=img;
      if(w>MAX||h>MAX){const s=MAX/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
      const canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      canvas.toBlob(blob=>{
        URL.revokeObjectURL(url);
        if(!blob){rej(new Error("Image compression failed"));return;}
        uploadOrderFile(syntheticId,blob,f.name).then(res).catch(rej);
      },"image/jpeg",0.82);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);uploadOrderFile(syntheticId,f,f.name).then(res).catch(rej);};
    img.src=url;
  });
}

const DOC_FIELDS=[
  {key:"icFrontFile",label:"IC Front"},
  {key:"icBackFile",label:"IC Back"},
  {key:"salarySlipFile",label:"Latest Salary Slip"},
  {key:"epfStatementFile",label:"EPF Statement"},
  {key:"bankStatementFile",label:"Latest Bank Statement"},
];

/* ── Timeline ──────────────────────────────────────────────────────────── */
function Timeline({app}){
  const cur=app.step;
  return<div>{STEPS.map((s,i)=>{
    const done=cur>s.step;
    const active=cur===s.step;
    const histEntries=(app.history||[]).filter(h=>h.step===s.step);
    const isLast=i===STEPS.length-1;
    return<div key={s.step} style={{display:"flex",position:"relative"}}>
      {!isLast&&<div style={{position:"absolute",left:11,top:24,width:1,height:"calc(100% + 2px)",background:done?C.navy+"30":C.border,zIndex:0}}/>}
      <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:done?C.navy:active?C.blueBright:C.surface,border:`2px solid ${done?C.navy:active?C.blueBright:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1,marginRight:10,marginTop:1,color:"#fff"}}>
        {done?<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:active?<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{s.step}</span>}
      </div>
      <div style={{flex:1,paddingBottom:isLast?0:14,paddingTop:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:done||active?700:400,color:done||active?C.text:"#9CA3AF"}}>{s.label}</span>
          {active&&<span style={{background:C.surface,color:C.blueBright,padding:"1px 7px",borderRadius:4,fontSize:9,fontWeight:700,border:`1px solid ${C.border}`}}>Current</span>}
        </div>
        {histEntries.map((h,hi)=><div key={hi} style={{marginTop:4,background:C.surface,borderRadius:7,padding:"6px 10px",border:`1px solid ${C.border}`,fontSize:11,color:C.textMid}}>
          <div style={{marginBottom:3,fontSize:9,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em"}}>{fDate(h.date)} {h.time||""}</div>
          {h.note&&<div>{h.note}</div>}
        </div>)}
      </div>
    </div>;
  })}</div>;
}

function FormCard({title,children}){
  return<div style={{...card,marginBottom:16}}>
    <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
      <div style={{fontSize:12,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
    </div>
    <div style={{padding:"20px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:18,minWidth:0}}>{children}</div>
  </div>;
}
const TIMES=["Morning","Noon","Evening","Anytime"];
const RELATIONS=["Spouse","Sibling","Parent"];

const emptyApp=(branch="")=>({
  branch,customerName:"",phoneModel:"",financePrice:"",tenure:"12",salesAgentId:"",salesAgentName:"",
  customerIC:"",race:"Malay",gender:"Male",residencyStatus:"Bumiputera",maritalStatus:"Single",housingStatus:"Own Property",
  customerHP:"",customerEmail:"",address:"",postcode:"",city:"",lengthOfStay:"",bestTimeContact:"Anytime",
  bankName:"",bankAccountType:"Savings",bankAccountHolderName:"",bankAccountNumber:"",
  occupation:"",workDepartment:"",companyNatureOfBusiness:"",yearsOfService:"",monthsOfService:"",salaryDate:"",netSalary:"",employmentType:"Permanent",workLocation:"Malaysia",companyName:"",officeAddress:"",officePostcode:"",officeTel:"",
  ec1Name:"",ec1Relationship:"Spouse",ec1StayWith:"Yes",ec1Address:"",ec1ContactNumber:"",ec1BestTime:"Anytime",
  ec2Name:"",ec2Relationship:"Spouse",ec2StayWith:"Yes",ec2Address:"",ec2ContactNumber:"",ec2BestTime:"Anytime",
});

/* ── Application form — used for both New Application and Edit ─────────── */
function ApplicationForm({branchMeta,userBranch,isAdmin,srList,editingApp,onSaved,onCancel}){
  const [f,setF]=useState(()=>editingApp?{...emptyApp(),...editingApp}:emptyApp(userBranch||""));
  const [docs,setDocs]=useState(()=>{
    const d={};
    DOC_FIELDS.forEach(({key})=>{d[key]=editingApp?.[key]||null;});
    return d;
  });
  const [docFiles,setDocFiles]=useState({});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const formBranch=userBranch||f.branch;
  const branchSRs=(srList||[]).filter(s=>s.branch===formBranch);

  const required=[
    "branch","customerName","phoneModel","financePrice","tenure","salesAgentId",
    "customerIC","race","gender","residencyStatus","maritalStatus","housingStatus",
    "customerHP","customerEmail","address","postcode","city","lengthOfStay","bestTimeContact",
    "bankName","bankAccountType","bankAccountHolderName","bankAccountNumber",
    "occupation","workDepartment","companyNatureOfBusiness","yearsOfService","monthsOfService","salaryDate","netSalary","employmentType","workLocation","companyName","officeAddress","officePostcode","officeTel",
    "ec1Name","ec1Relationship","ec1StayWith","ec1Address","ec1ContactNumber","ec1BestTime",
    "ec2Name","ec2Relationship","ec2StayWith","ec2Address","ec2ContactNumber","ec2BestTime",
  ];
  const missing=required.filter(k=>!String(f[k]||"").trim());
  const missingDocs=DOC_FIELDS.filter(({key})=>!docs[key]&&!docFiles[key]);

  const submit=async()=>{
    if(missing.length||missingDocs.length){alert("Please fill in every field and upload every document before submitting.");return;}
    setSaving(true);
    const id=editingApp?.id||`jcl_${Date.now()}`;
    const uploadedDocs={};
    for(const{key} of DOC_FIELDS){
      if(docFiles[key])uploadedDocs[key]=await readAppFile(docFiles[key],`${id}_${key}`);
      else uploadedDocs[key]=docs[key];
    }
    const base=editingApp||{
      step:1,merchant:"JCL",
      submittedAt:nowDate(),submittedTime:nowTime(),
      submittedToJCLDate:null,followUpRemark:null,followUpRequestedDate:null,
      followUpResponseFiles:[],followUpRespondedDate:null,
      approvedDate:null,approvedRemark:null,rejectedDate:null,rejectedRemark:null,
      linkedOrderId:null,history:[{step:1,date:nowDate(),time:nowTime(),note:"New Application submitted"}],
    };
    const app={
      ...base,id,...f,financePrice:parseFloat(f.financePrice)||0,...uploadedDocs,
      history:editingApp?[...(editingApp.history||[]),{step:editingApp.step,date:nowDate(),time:nowTime(),note:"Application details edited"}]:base.history,
    };
    await onSaved(app);
    setSaving(false);
  };

  return<div className="fade-in">
    <div style={{marginBottom:10}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn></div>
    <div style={{...card,marginBottom:16,padding:0,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
        <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>{editingApp?"Edit Application":"New Application"}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2}}>{branchMeta[formBranch]?.name||formBranch||"Pick a branch below to get started"} · 8 sections — everything on this form is required</div>
      </div>
    </div>

    <FormCard title="Application & Device">
      {isAdmin&&<div><L req>Branch</L><SEL value={f.branch} onChange={e=>{set("branch",e.target.value);set("salesAgentId","");set("salesAgentName","");}}><option value="">— Select Branch —</option>{sellingBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}</SEL></div>}
      {!isAdmin&&<div><L>Branch</L><I value={branchMeta[userBranch]?.name||userBranch} disabled/></div>}
      <div><L req>Customer Name</L><I value={f.customerName} onChange={e=>set("customerName",e.target.value)} placeholder="e.g. Ahmad bin Ali"/></div>
      <div><L req>Phone Model / Item</L><I value={f.phoneModel} onChange={e=>set("phoneModel",e.target.value)} placeholder="e.g. iPhone 17 Pro 256GB"/></div>
      <div><L req>Finance Price (RM)</L><I type="number" step="0.01" value={f.financePrice} onChange={e=>set("financePrice",e.target.value)} placeholder="0.00"/></div>
      <div><L req>CCM Device Tenure</L><SEL value={f.tenure} onChange={e=>set("tenure",e.target.value)}><option value="12">12 Months</option><option value="24">24 Months</option><option value="36">36 Months</option></SEL></div>
      <div><L req>Sales Agent</L>{branchSRs.length>0
        ?<SEL value={f.salesAgentId} onChange={e=>{const sr=branchSRs.find(s=>s.id===e.target.value);set("salesAgentId",e.target.value);set("salesAgentName",sr?.canon||"");}} disabled={!formBranch}><option value="">— Select SR —</option>{branchSRs.map(s=><option key={s.id} value={s.id}>{s.canon} ({s.id})</option>)}</SEL>
        :<I value={f.salesAgentId} onChange={e=>set("salesAgentId",e.target.value)} placeholder={formBranch?"Agent ID":"Pick a branch first"} disabled={!formBranch}/>}
      </div>
    </FormCard>

    <FormCard title="Personal Details">
      <div><L req>Customer IC</L><I value={f.customerIC} onChange={e=>set("customerIC",e.target.value)} placeholder="e.g. 900101-12-3456"/></div>
      <div><L req>Race</L><SEL value={f.race} onChange={e=>set("race",e.target.value)}>{["Chinese","Indian","Malay","Other"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Gender</L><SEL value={f.gender} onChange={e=>set("gender",e.target.value)}>{["Male","Female"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Residency Status</L><SEL value={f.residencyStatus} onChange={e=>set("residencyStatus",e.target.value)}>{["Bumiputera","Non-Bumiputera"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Marital Status</L><SEL value={f.maritalStatus} onChange={e=>set("maritalStatus",e.target.value)}>{["Single","Married","Widowed","Divorced"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Housing Status</L><SEL value={f.housingStatus} onChange={e=>set("housingStatus",e.target.value)}>{["Company's Apartment","Parent's Property","Renting","Own Property","Family's Property"].map(x=><option key={x}>{x}</option>)}</SEL></div>
    </FormCard>

    <FormCard title="Contact & Address">
      <div><L req>Customer HP No.</L><I value={f.customerHP} onChange={e=>set("customerHP",e.target.value)} placeholder="e.g. 0121234567"/></div>
      <div><L req>Customer Email Address</L><I type="email" value={f.customerEmail} onChange={e=>set("customerEmail",e.target.value)} placeholder="e.g. ahmad@email.com"/></div>
      <div><L req>Length of Stay</L><I value={f.lengthOfStay} onChange={e=>set("lengthOfStay",e.target.value)} placeholder="e.g. 3 years"/></div>
      <div><L req>Postcode</L><I value={f.postcode} onChange={e=>set("postcode",e.target.value)} placeholder="e.g. 88000"/></div>
      <div><L req>City</L><I value={f.city} onChange={e=>set("city",e.target.value)} placeholder="e.g. Kota Kinabalu"/></div>
      <div><L req>Best Time to Contact Applicant</L><SEL value={f.bestTimeContact} onChange={e=>set("bestTimeContact",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div style={{gridColumn:"1/-1"}}><L req>Address</L><TX rows={2} value={f.address} onChange={e=>set("address",e.target.value)} placeholder="Full residential address"/></div>
    </FormCard>

    <FormCard title="Bank Details">
      <div><L req>Bank Name</L><I value={f.bankName} onChange={e=>set("bankName",e.target.value)} placeholder="e.g. Maybank"/></div>
      <div><L req>Bank Account Type</L><SEL value={f.bankAccountType} onChange={e=>set("bankAccountType",e.target.value)}>{["Savings","Current"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Bank Account Holder Name</L><I value={f.bankAccountHolderName} onChange={e=>set("bankAccountHolderName",e.target.value)} placeholder="Must match customer's IC name"/></div>
      <div><L req>Bank Account Number</L><I value={f.bankAccountNumber} onChange={e=>set("bankAccountNumber",e.target.value)}/></div>
    </FormCard>

    <FormCard title="Employment & Income">
      <div><L req>Customer Occupation</L><I value={f.occupation} onChange={e=>set("occupation",e.target.value)} placeholder="e.g. Sales Executive"/></div>
      <div><L req>Customer Work Department</L><I value={f.workDepartment} onChange={e=>set("workDepartment",e.target.value)} placeholder="e.g. Sales &amp; Marketing"/></div>
      <div><L req>Company Nature of Business</L><I value={f.companyNatureOfBusiness} onChange={e=>set("companyNatureOfBusiness",e.target.value)} placeholder="e.g. Retail, F&amp;B, Manufacturing"/></div>
      <div><L req>Years of Service</L><I type="number" value={f.yearsOfService} onChange={e=>set("yearsOfService",e.target.value)} placeholder="0"/></div>
      <div><L req>Months of Service</L><I type="number" value={f.monthsOfService} onChange={e=>set("monthsOfService",e.target.value)} placeholder="0"/></div>
      <div><L req>Salary Date</L><I value={f.salaryDate} onChange={e=>set("salaryDate",e.target.value)} placeholder="e.g. 25th"/></div>
      <div><L req>Net Salary (RM)</L><I type="number" step="0.01" value={f.netSalary} onChange={e=>set("netSalary",e.target.value)} placeholder="0.00"/></div>
      <div><L req>Employment Type</L><SEL value={f.employmentType} onChange={e=>set("employmentType",e.target.value)}>{["Commission","Contract","Permanent","Probation","Self-Employment","Retirement"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Work Location</L><SEL value={f.workLocation} onChange={e=>set("workLocation",e.target.value)}>{["Malaysia","Singapore"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Company Name</L><I value={f.companyName} onChange={e=>set("companyName",e.target.value)}/></div>
      <div><L req>Office Postcode</L><I value={f.officePostcode} onChange={e=>set("officePostcode",e.target.value)} placeholder="e.g. 88000"/></div>
      <div><L req>Office Tel No.</L><I value={f.officeTel} onChange={e=>set("officeTel",e.target.value)} placeholder="e.g. 088123456"/></div>
      <div style={{gridColumn:"1/-1"}}><L req>Office Address</L><TX rows={2} value={f.officeAddress} onChange={e=>set("officeAddress",e.target.value)}/></div>
    </FormCard>

    <FormCard title="Document Uploads">
      {DOC_FIELDS.map(({key,label})=><div key={key}>
        <L req>{label}</L>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setDocFiles(p=>({...p,[key]:e.target.files[0]||null}))} style={{fontSize:11}}/>
        {docFiles[key]?<div style={{fontSize:10,color:"#15803D",marginTop:3}}>New file selected: {docFiles[key].name}</div>
          :docs[key]?<div style={{fontSize:10,color:C.textLight,marginTop:3}}>On file: {docs[key].name}</div>:null}
      </div>)}
    </FormCard>

    <FormCard title="Emergency Contact #1">
      <div><L req>Name</L><I value={f.ec1Name} onChange={e=>set("ec1Name",e.target.value)} placeholder="Full name"/></div>
      <div><L req>Relationship</L><SEL value={f.ec1Relationship} onChange={e=>set("ec1Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec1StayWith} onChange={e=>set("ec1StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec1ContactNumber} onChange={e=>set("ec1ContactNumber",e.target.value)} placeholder="e.g. 0121234567"/></div>
      <div><L req>Best Time to Contact</L><SEL value={f.ec1BestTime} onChange={e=>set("ec1BestTime",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div style={{gridColumn:"1/-1"}}><L req>Address</L><TX rows={2} value={f.ec1Address} onChange={e=>set("ec1Address",e.target.value)}/></div>
    </FormCard>

    <FormCard title="Emergency Contact #2">
      <div><L req>Name</L><I value={f.ec2Name} onChange={e=>set("ec2Name",e.target.value)} placeholder="Full name"/></div>
      <div><L req>Relationship</L><SEL value={f.ec2Relationship} onChange={e=>set("ec2Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec2StayWith} onChange={e=>set("ec2StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec2ContactNumber} onChange={e=>set("ec2ContactNumber",e.target.value)} placeholder="e.g. 0121234567"/></div>
      <div><L req>Best Time to Contact</L><SEL value={f.ec2BestTime} onChange={e=>set("ec2BestTime",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div style={{gridColumn:"1/-1"}}><L req>Address</L><TX rows={2} value={f.ec2Address} onChange={e=>set("ec2Address",e.target.value)}/></div>
    </FormCard>

    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
      <GBtn onClick={onCancel}>Cancel</GBtn>
      <PBtn onClick={submit} disabled={saving}>{saving?"Submitting…":editingApp?"Save Changes":"Submit Application"}</PBtn>
    </div>
  </div>;
}

/* ── Follow-up response (branch) ──────────────────────────────────────── */
function FollowUpResponseBox({app,onSaved}){
  const [file,setFile]=useState(null);
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const respond=async()=>{
    setSaving(true);
    let f=null;
    if(file)f=await readAppFile(file,`jcl_${app.id}_followup`);
    const files=[...(app.followUpResponseFiles||[])];
    if(f)files.push(f);
    await onSaved({...app,followUpResponseFiles:files,followUpRespondedDate:nowDate(),step:2,
      history:[...(app.history||[]),{step:2,date:nowDate(),time:nowTime(),note:`Branch responded to follow-up${note?": "+note:""}`}]});
    setSaving(false);
  };
  return<div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:10,marginTop:8}}>
    <div style={{fontSize:12,fontWeight:700,color:"#B45309",marginBottom:6}}>JCL Requested Follow-Up</div>
    <div style={{fontSize:12,color:C.textMid,marginBottom:8}}>{app.followUpRemark}</div>
    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0]||null)} style={{fontSize:11,marginBottom:8}}/>
    <I value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note back to admin…" style={{marginBottom:8}}/>
    <PBtn onClick={respond} disabled={saving} style={{background:"#B45309"}}>{saving?"Submitting…":"Submit Response"}</PBtn>
  </div>;
}

/* ── Admin action panel ───────────────────────────────────────────────── */
function AdminActions({app,onSaved,onCreateOrder}){
  const [showFollowUp,setShowFollowUp]=useState(false);
  const [followUpRemark,setFollowUpRemark]=useState("");
  const [showApprove,setShowApprove]=useState(false);
  const [approvedRemark,setApprovedRemark]=useState("");
  const [showReject,setShowReject]=useState(false);
  const [rejectedRemark,setRejectedRemark]=useState("");
  const [saving,setSaving]=useState(false);

  const submitToJCL=async()=>{
    setSaving(true);
    await onSaved({...app,step:2,submittedToJCLDate:nowDate(),
      history:[...(app.history||[]),{step:2,date:nowDate(),time:nowTime(),note:"Submitted to JCL"}]});
    setSaving(false);
  };
  const requestFollowUp=async()=>{
    if(!followUpRemark.trim()){alert("Remark required.");return;}
    setSaving(true);
    await onSaved({...app,step:3,followUpRemark,followUpRequestedDate:nowDate(),followUpRespondedDate:null,
      history:[...(app.history||[]),{step:3,date:nowDate(),time:nowTime(),note:`Follow-up requested: ${followUpRemark}`}]});
    setSaving(false);setShowFollowUp(false);setFollowUpRemark("");
  };
  const approve=async()=>{
    setSaving(true);
    const updated={...app,step:4,approvedDate:nowDate(),approvedRemark,
      history:[...(app.history||[]),{step:4,date:nowDate(),time:nowTime(),note:`Approved by JCL${approvedRemark?": "+approvedRemark:""}`}]};
    const orderId=await onCreateOrder(updated);
    await onSaved({...updated,linkedOrderId:orderId});
    setSaving(false);setShowApprove(false);
  };
  const reject=async()=>{
    if(!rejectedRemark.trim()){alert("Reason required.");return;}
    setSaving(true);
    await onSaved({...app,step:5,rejectedDate:nowDate(),rejectedRemark,
      history:[...(app.history||[]),{step:5,date:nowDate(),time:nowTime(),note:`Rejected by JCL: ${rejectedRemark}`}]});
    setSaving(false);setShowReject(false);
  };

  if(app.step===4)return<ActionBox title="Approved by JCL">
    <div style={{fontSize:12,color:"#15803D",fontWeight:600}}>Approved {fDate(app.approvedDate)}{app.linkedOrderId?" — order created on Order page":""}{app.approvedRemark?` — ${app.approvedRemark}`:""}</div>
  </ActionBox>;
  if(app.step===5)return<ActionBox title="Rejected by JCL">
    <div style={{fontSize:12,color:"#DC2626",fontWeight:600}}>Rejected {fDate(app.rejectedDate)} — {app.rejectedRemark}</div>
  </ActionBox>;

  if(app.step===3&&!app.followUpRespondedDate)return<ActionBox title="Follow-Up Required" desc={`What JCL needs: ${app.followUpRemark}`}>
    <div style={{fontSize:12,color:"#B45309"}}>Waiting on branch to respond to this follow-up request.</div>
  </ActionBox>;

  if(app.step===1)return<ActionBox title="Next: Submit to JCL" desc="New application ready to be submitted to JCL for review.">
    <PBtn onClick={submitToJCL} disabled={saving} style={{width:"100%",justifyContent:"center"}}>{saving?"Saving…":"Submit to JCL"}</PBtn>
  </ActionBox>;

  // step 2, or step 3 with a branch response already in — either way it's
  // sitting with JCL awaiting a decision.
  return<ActionBox title="Next: JCL Decision" desc="Waiting for JCL to approve, reject, or request more information on this application.">
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {!showFollowUp&&!showApprove&&!showReject?<>
          <GBtn onClick={()=>setShowFollowUp(true)} style={{fontSize:12,color:"#B45309",borderColor:"#FDE68A"}}>Request Follow-Up</GBtn>
          <PBtn onClick={()=>setShowApprove(true)} style={{fontSize:12,background:"#15803D",boxShadow:"none"}}>Approved by JCL</PBtn>
          <GBtn onClick={()=>setShowReject(true)} style={{fontSize:12,color:"#DC2626",borderColor:"#FECACA"}}>Rejected by JCL</GBtn>
        </>:null}
      </div>
    {showFollowUp&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L req>Follow-Up Remark (what JCL needs)</L>
      <TX rows={2} value={followUpRemark} onChange={e=>setFollowUpRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowFollowUp(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <PBtn onClick={requestFollowUp} disabled={saving} style={{fontSize:11,padding:"6px 12px",background:"#B45309",boxShadow:"none"}}>{saving?"Saving…":"Confirm"}</PBtn>
      </div>
    </div>}
    {showApprove&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L>Remark (optional)</L>
      <I value={approvedRemark} onChange={e=>setApprovedRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{fontSize:10,color:C.textLight,marginBottom:8}}>This will automatically create a new CCM order on the Order page, pre-filled with this application's details.</div>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowApprove(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <PBtn onClick={approve} disabled={saving} style={{fontSize:11,padding:"6px 12px",background:"#15803D",boxShadow:"none"}}>{saving?"Saving…":"Confirm Approval"}</PBtn>
      </div>
    </div>}
    {showReject&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L req>Rejection Reason</L>
      <TX rows={2} value={rejectedRemark} onChange={e=>setRejectedRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowReject(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <DBtnLocal onClick={reject} disabled={saving}>{Ic.x} {saving?"Saving…":"Confirm Rejection"}</DBtnLocal>
      </div>
    </div>}
    </div>
  </ActionBox>;
}

/* ── Detail view — click a row to get here, same idea as the Order page ─ */
function DetailSecHdr({icon,children}){
  return<div style={{display:"flex",alignItems:"center",gap:7,padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>{icon&&<span style={{color:"rgba(255,255,255,.85)"}}>{icon}</span>}{children}</div>;
}
function ActionBox({icon,title,desc,children}){
  return<div style={card}>
    <DetailSecHdr icon={icon}>{title}</DetailSecHdr>
    {desc&&<div style={{padding:"8px 16px",fontSize:11,color:C.textMid,background:C.surface,borderBottom:`1px solid ${C.border}`}}>{desc}</div>}
    <div style={{padding:"14px 16px"}}>{children}</div>
  </div>;
}
function ApplicationDetail({app,branchMeta,isAdmin,canDelete,onBack,onSaved,onDelete,onEdit,onCreateOrder,fileUrls}){
  const copyField=(v)=>{if(!v)return;navigator.clipboard?.writeText(String(v)).catch(()=>{});};
  const [copiedField,setCopiedField]=useState(null);
  const InfoCell=({label,value,full})=><div style={{gridColumn:full?"1/-1":"auto",padding:"10px 16px",borderBottom:`1px solid ${C.border}`,minWidth:0}}>
    <div style={{fontSize:9,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600,marginBottom:3}}>{label}</div>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{fontSize:13,color:C.text,fontWeight:600,wordBreak:"break-word",minWidth:0}}>{value||"—"}</div>
      {value&&<button onClick={()=>{copyField(value);setCopiedField(label);setTimeout(()=>setCopiedField(null),1500);}} title="Copy" style={{flexShrink:0,background:"none",border:"none",cursor:"pointer",padding:2,color:copiedField===label?"#15803D":C.textLight,display:"flex"}}>{copiedField===label?Ic.checkCircle:Ic.copy}</button>}
    </div>
  </div>;
  const Grid=({children})=><div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>{children}</div>;
  const [linkCopied,setLinkCopied]=useState(false);
  const copyLink=async()=>{
    const url=`${window.location.origin}${window.location.pathname}?jclId=${app.id}${window.location.hash||"#jclApplications"}`;
    try{await navigator.clipboard.writeText(url);}catch{
      const ta=document.createElement("textarea");ta.value=url;ta.style.position="fixed";ta.style.opacity="0";
      document.body.appendChild(ta);ta.select();
      try{document.execCommand("copy");}catch{}
      document.body.removeChild(ta);
    }
    setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);
  };
  return<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:6}}>
        <GBtn onClick={onBack}>{Ic.chevL} Back</GBtn>
        <GBtn onClick={copyLink}>{linkCopied?<>{Ic.checkCircle} Copied!</>:<>{Ic.share} Copy Link</>}</GBtn>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <StepBadge step={app.step}/>
        {isAdmin&&<GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn>}
        {canDelete&&<DBtnLocal onClick={onDelete}>{Ic.trash} Delete</DBtnLocal>}
      </div>
    </div>

    <div style={{...card,padding:"16px 18px",marginBottom:14}}>
      <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:2}}>{app.customerName}</div>
      <div style={{fontSize:11,color:C.textLight}}>{branchMeta[app.branch]?.name||app.branch} · Submitted {fDate(app.submittedAt)}</div>
    </div>

    <ProgressBar step={app.step}/>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Application &amp; Device</DetailSecHdr>
      <Grid>
        <InfoCell label="Phone Model / Item" value={app.phoneModel}/>
        <InfoCell label="Finance Price" value={fRM(app.financePrice)}/>
        <InfoCell label="Tenure" value={`${app.tenure} Months`}/>
        <InfoCell label="Sales Agent" value={app.salesAgentName?`${app.salesAgentName} (${app.salesAgentId})`:app.salesAgentId}/>
      </Grid>
      <div style={{height:12}}/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Personal Details</DetailSecHdr>
      <Grid>
        <InfoCell label="Customer Full Name" value={app.customerName}/>
        <InfoCell label="Customer IC" value={app.customerIC}/>
        <InfoCell label="Race" value={app.race}/>
        <InfoCell label="Gender" value={app.gender}/>
        <InfoCell label="Residency Status" value={app.residencyStatus}/>
        <InfoCell label="Marital Status" value={app.maritalStatus}/>
        <InfoCell label="Housing Status" value={app.housingStatus}/>
      </Grid>
      <div style={{height:12}}/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Contact &amp; Address</DetailSecHdr>
      <Grid>
        <InfoCell label="Customer HP" value={app.customerHP}/>
        <InfoCell label="Length of Stay" value={app.lengthOfStay}/>
        <InfoCell label="Postcode" value={app.postcode}/>
        <InfoCell label="City" value={app.city}/>
        <InfoCell label="Best Time to Contact" value={app.bestTimeContact}/>
      </Grid>
      <InfoCell label="Customer Email" value={app.customerEmail} full/>
      <InfoCell label="Address" value={app.address} full/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Bank Details</DetailSecHdr>
      <Grid>
        <InfoCell label="Bank Name" value={app.bankName}/>
        <InfoCell label="Account Type" value={app.bankAccountType}/>
        <InfoCell label="Account Holder" value={app.bankAccountHolderName}/>
        <InfoCell label="Account Number" value={app.bankAccountNumber}/>
      </Grid>
      <div style={{height:12}}/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Employment &amp; Income</DetailSecHdr>
      <Grid>
        <InfoCell label="Occupation" value={app.occupation}/>
        <InfoCell label="Work Department" value={app.workDepartment}/>
        <InfoCell label="Nature of Business" value={app.companyNatureOfBusiness}/>
        <InfoCell label="Years / Months of Service" value={`${app.yearsOfService||0}y ${app.monthsOfService||0}m`}/>
        <InfoCell label="Salary Date" value={app.salaryDate}/>
        <InfoCell label="Net Salary" value={fRM(app.netSalary)}/>
        <InfoCell label="Employment Type" value={app.employmentType}/>
        <InfoCell label="Work Location" value={app.workLocation}/>
        <InfoCell label="Company Name" value={app.companyName}/>
        <InfoCell label="Office Postcode" value={app.officePostcode}/>
        <InfoCell label="Office Tel" value={app.officeTel}/>
      </Grid>
      <InfoCell label="Office Address" value={app.officeAddress} full/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Documents</DetailSecHdr>
      <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:6}}>
        {DOC_FIELDS.map(({key,label})=>{
          const doc=app[key];
          return<div key={key} style={{fontSize:12}}>
            <span style={{color:C.textMid,fontWeight:600}}>{label}: </span>
            {doc?(fileUrls[`${app.id}_${key}`]?<a href={fileUrls[`${app.id}_${key}`]} target="_blank" rel="noopener noreferrer" style={{color:C.blueBright,fontWeight:600}}>{doc.name}</a>:<span style={{color:C.textLight}}>Loading…</span>):<span style={{color:"#DC2626"}}>Not uploaded</span>}
          </div>;
        })}
      </div>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Emergency Contact #1</DetailSecHdr>
      <Grid>
        <InfoCell label="Name" value={app.ec1Name}/><InfoCell label="Relationship" value={app.ec1Relationship}/>
        <InfoCell label="Stay With Applicant?" value={app.ec1StayWith}/><InfoCell label="Contact Number" value={app.ec1ContactNumber}/>
        <InfoCell label="Best Time to Contact" value={app.ec1BestTime}/>
      </Grid>
      <InfoCell label="Address" value={app.ec1Address} full/>
    </div>

    <div style={{...card,marginBottom:14}}>
      <DetailSecHdr>Emergency Contact #2</DetailSecHdr>
      <Grid>
        <InfoCell label="Name" value={app.ec2Name}/><InfoCell label="Relationship" value={app.ec2Relationship}/>
        <InfoCell label="Stay With Applicant?" value={app.ec2StayWith}/><InfoCell label="Contact Number" value={app.ec2ContactNumber}/>
        <InfoCell label="Best Time to Contact" value={app.ec2BestTime}/>
      </Grid>
      <InfoCell label="Address" value={app.ec2Address} full/>
    </div>

    <div className="detail-grid">
      <div style={card}>
        <DetailSecHdr icon={Ic.fileText}>Tracking Timeline</DetailSecHdr>
        <div style={{padding:"14px 16px"}}><Timeline app={app}/></div>
      </div>
      <div>
        {isAdmin&&<AdminActions app={app} onSaved={onSaved} onCreateOrder={onCreateOrder}/>}
        {!isAdmin&&app.step===3&&!app.followUpRespondedDate&&<FollowUpResponseBox app={app} onSaved={onSaved}/>}
        {!isAdmin&&!(app.step===3&&!app.followUpRespondedDate)&&<ActionBox title="Action">
          <div style={{fontSize:12,color:C.textLight}}>No action needed from your side right now — admin handles the rest of this application.</div>
        </ActionBox>}
      </div>
    </div>
  </div>;
}

export default function JCLTab({branchMeta,isAdmin,userBranch,srList=[],email=null}){
  const [apps,setApps]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // list | form | detail
  const [selectedId,setSelectedId]=useState(null);
  const [editingApp,setEditingApp]=useState(null);
  const [branchFilter,setBranchFilter]=useState("all");
  const [agentFilter,setAgentFilter]=useState("all");
  const [stepFilter,setStepFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [fileUrls,setFileUrls]=useState({});

  useEffect(()=>{loadData(JCL_KEY).then(d=>{setApps(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  // Shared link support — "?jclId=..." in the URL (from the Copy Link
  // button on an application's detail page) opens straight to it, for
  // whoever opens it (their own access rights/branch filtering still apply
  // as normal — this only handles navigation, not permissions).
  useEffect(()=>{
    if(loading)return;
    const jclId=new URLSearchParams(window.location.search).get("jclId");
    if(!jclId)return;
    const app=apps.find(a=>a.id===jclId);
    if(app&&(!userBranch||app.branch===userBranch)){
      setView("detail");setSelectedId(jclId);
    }else if(app){
      alert("You don't have access to this application.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading]);

  const save=async(updated)=>{
    const next=[...apps.filter(a=>a.id!==updated.id),updated].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
    setApps(next);
    await saveData(JCL_KEY,next);
  };

  const deleteApp=async(id)=>{
    if(!window.confirm("Delete this application permanently? This cannot be undone."))return;
    const next=apps.filter(a=>a.id!==id);
    setApps(next);
    await saveData(JCL_KEY,next);
    setView("list");setSelectedId(null);
  };

  // Approval auto-creates a CCM order on the Order page, on behalf of the
  // branch, pre-filled from the application. Starts at step 1 (New Order
  // Request) like any normal order, so the rest of the existing pipeline
  // (stock, delivery, billing…) still applies from there.
  const createOrderFromApp=async(app)=>{
    const id=Date.now().toString();
    const order={
      id,step:1,orderType:"ccm",stockStatus:"stock_request",branch:app.branch,merchant:"JCL",
      phoneModel:app.phoneModel,customerName:app.customerName,customerIC:app.customerIC,
      customerHP:app.customerHP,customerEmail:app.customerEmail,customerAddress:app.address,
      customerPostCode:app.postcode,customerCity:app.city,
      financePrice:app.financePrice,salesAgentId:app.salesAgentId,salesAgentName:app.salesAgentName,
      history:[{step:1,date:nowDate(),time:nowTime(),note:`Submitted — auto-created from approved JCL Application (${app.id})`}],
    };
    const result=await reconcile([],[order]);
    return result.ok?id:null;
  };

  useEffect(()=>{
    apps.forEach(a=>{
      DOC_FIELDS.forEach(async({key})=>{
        const doc=a[key];
        const fkey=`${a.id}_${key}`;
        if(doc?.path&&!fileUrls[fkey]){
          const url=await signFileUrl(doc.path);
          if(url)setFileUrls(p=>({...p,[fkey]:url}));
        }
      });
      (a.followUpResponseFiles||[]).forEach(async(f,i)=>{
        const key=`${a.id}_followup${i}`;
        if(f.path&&!fileUrls[key]){
          const url=await signFileUrl(f.path);
          if(url)setFileUrls(p=>({...p,[key]:url}));
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[apps]);

  const scoped=useMemo(()=>{
    let list=apps;
    if(userBranch)list=list.filter(a=>a.branch===userBranch);
    else if(branchFilter!=="all")list=list.filter(a=>a.branch===branchFilter);
    if(agentFilter!=="all")list=list.filter(a=>(a.salesAgentName||a.salesAgentId||"—")===agentFilter);
    return list;
  },[apps,userBranch,branchFilter,agentFilter]);

  const stepCounts=useMemo(()=>STEPS.reduce((acc,s)=>{acc[s.step]=scoped.filter(a=>a.step===s.step).length;return acc;},{}),[scoped]);

  const visible=useMemo(()=>{
    let list=stepFilter==="all"?scoped:scoped.filter(a=>a.step===stepFilter);
    if(search.trim()){
      const q=search.trim().toLowerCase();
      list=list.filter(a=>[a.customerName,a.customerIC].some(v=>v?.toLowerCase().includes(q)));
    }
    return list;
  },[scoped,stepFilter,search]);

  const agentOptions=useMemo(()=>{
    const set=new Set(scoped.map(a=>a.salesAgentName||a.salesAgentId).filter(Boolean));
    return Array.from(set).sort();
  },[scoped]);

  const needsBranchAction=useMemo(()=>userBranch?apps.filter(a=>a.branch===userBranch&&a.step===3&&!a.followUpRespondedDate):[],[apps,userBranch]);

  // Alert — admin hasn't submitted to JCL within 1 day of the branch's New
  // Application. Clears itself the moment it actually gets submitted
  // (step moves to 2), so it only ever nags about the ones still sitting.
  const overdueSubmissions=useMemo(()=>isAdmin?apps.filter(a=>a.step===1&&daysSince(a.submittedAt)>=1):[],[apps,isAdmin]);

  const selectedApp=useMemo(()=>apps.find(a=>a.id===selectedId)||null,[apps,selectedId]);

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  if(view==="form")return<ApplicationForm branchMeta={branchMeta} userBranch={userBranch} isAdmin={isAdmin} srList={srList} editingApp={editingApp}
    onSaved={async(app)=>{await save(app);setView("detail");setSelectedId(app.id);setEditingApp(null);}}
    onCancel={()=>{setView(editingApp?"detail":"list");setEditingApp(null);}}/>;

  const isSuperAdmin=(email||"").toLowerCase()==="sophiawsc9395@gmail.com";

  if(view==="detail"&&selectedApp)return<ApplicationDetail app={selectedApp} branchMeta={branchMeta} isAdmin={isAdmin} canDelete={isSuperAdmin} fileUrls={fileUrls}
    onBack={()=>{setView("list");setSelectedId(null);}}
    onSaved={save}
    onDelete={()=>deleteApp(selectedApp.id)}
    onEdit={()=>{setEditingApp(selectedApp);setView("form");}}
    onCreateOrder={createOrderFromApp}/>;

  return<div>
    {overdueSubmissions.length>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Not Yet Submitted to JCL</div>
      {overdueSubmissions.map(a=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{fontSize:12,color:"#DC2626",padding:"3px 0",cursor:"pointer"}}>{a.customerName} — {branchMeta[a.branch]?.name||a.branch} — submitted {daysSince(a.submittedAt)} day{daysSince(a.submittedAt)>1?"s":""} ago, still not sent to JCL</div>)}
    </div>}

    {needsBranchAction.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Follow-Up Needed From You</div>
      {needsBranchAction.map(a=><div key={a.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
        <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{a.customerName} — {a.phoneModel}</div>
        <FollowUpResponseBox app={a} onSaved={save}/>
      </div>)}
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
      {STEPS.map(s=>{
        const active=stepFilter===s.step;
        const count=stepCounts[s.step]||0;
        return<div key={s.step} onClick={()=>setStepFilter(active?"all":s.step)} style={{...card,border:`1px solid ${active?s.color:C.border}`,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",boxShadow:active?`0 0 0 1.5px ${s.color}, 0 6px 16px rgba(10,22,40,.08)`:card.boxShadow}}>
          <div style={{width:38,height:38,borderRadius:10,background:s.bg,color:s.color,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{STEP_ICONS[s.step]}</div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:800,color:count?C.text:"#C3CCDA",lineHeight:1}}>{count}</div>
          </div>
        </div>;
      })}
    </div>

    {(isAdmin||userBranch)&&<div style={{marginBottom:10}}><PBtn onClick={()=>{setEditingApp(null);setView("form");}} style={{background:C.navy,boxShadow:"0 2px 8px rgba(10,22,40,.35)"}}>{Ic.plus} New Application</PBtn></div>}

    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <I value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by customer name or IC…" style={{flex:2,minWidth:160}}/>
      {!userBranch&&<SEL value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} style={{flex:1,minWidth:120}}>
        <option value="all">All Branches</option>
        {sellingBranches(branchMeta).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
      </SEL>}
      <SEL value={agentFilter} onChange={e=>setAgentFilter(e.target.value)} style={{flex:1,minWidth:140}}>
        <option value="all">All Agents</option>
        {agentOptions.map(a=><option key={a} value={a}>{a}</option>)}
      </SEL>
    </div>

    <div style={{...card}}>
      <DetailSecHdr>Applications</DetailSecHdr>
      {visible.length===0
        ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No applications found.</div>
        :<div>{visible.map(a=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>{a.customerName} <span style={{fontWeight:500,color:C.textLight,fontSize:11}}>· {branchMeta[a.branch]?.name||a.branch} · {fDate(a.submittedAt)}</span></div>
              <div style={{fontSize:11,color:C.textMid,marginTop:3}}>{a.phoneModel} · {fRM(a.financePrice)} · IC {a.customerIC} · {a.customerHP} · Agent: {a.salesAgentName||a.salesAgentId||"—"}</div>
            </div>
            <StepBadge step={a.step}/>
          </div>
        </div>)}</div>}
    </div>
  </div>;
}
