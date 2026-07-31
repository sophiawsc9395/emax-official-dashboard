/**
 * JCL Applications — Branch submits customer details for JCL merchant
 * financing → Admin/Manager submits to JCL → JCL may request follow-up
 * (branch must respond before it can move forward) → Admin marks
 * Approved/Rejected by JCL. On Approval, a new CCM order is automatically
 * created on the Order page, on behalf of the branch, pre-filled with the
 * application's customer/device/finance details.
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

const C={navy:"#0A1628",navyLight:"#162B52",blue:"#1B3F72",blueBright:"#2C5AA0",white:"#fff",surface:"#F7F9FC",border:"#E4EAF2",text:"#0A1628",textMid:"#4A5568",textLight:"#8A96A8"};
const card={background:C.white,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)",overflow:"hidden"};

const nowDate=()=>new Date().toISOString().split("T")[0];
const nowTime=()=>new Date().toTimeString().slice(0,5);
const fDate=s=>{if(!s)return"—";const[y,m,d]=s.split("-");return`${d}/${m}/${y}`;};
const fRM=(n=0)=>{const v=parseFloat(n)||0;return"RM "+v.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});};

const L=({children,req})=><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textMid,marginBottom:4}}>{children}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>;
const I=props=><input {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",...(props.style||{})}}/>;
const TX=props=><textarea {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",boxSizing:"border-box",resize:"vertical",...(props.style||{})}}/>;
const PBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,background:C.blueBright,color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:p.disabled?.5:1,...(p.style||{})}}>{children}</button>;
const GBtn=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,background:"#fff",color:C.text,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",...(p.style||{})}}>{children}</button>;
const SEL=props=><select {...props} style={{width:"100%",padding:"9px 11px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"Inter,sans-serif",background:"#fff",boxSizing:"border-box",...(props.style||{})}}/>;
const DBtnLocal=({children,...p})=><button {...p} style={{display:"inline-flex",alignItems:"center",gap:6,background:"#DC2626",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:p.disabled?.5:1}}>{children}</button>;

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

/* ── New Application form (branch) ────────────────────────────────────── */
const emptyApp=()=>({
  customerName:"",phoneModel:"",financePrice:"",tenure:"12",salesAgentName:"",
  customerIC:"",race:"Malay",gender:"Male",residencyStatus:"Bumiputera",maritalStatus:"Single",housingStatus:"Own Property",
  customerHP:"",customerEmail:"",address:"",postcode:"",city:"",lengthOfStay:"",bestTimeContact:"Anytime",
  bankName:"",bankAccountType:"Savings",bankAccountHolderName:"",bankAccountNumber:"",
  occupation:"",workDepartment:"",companyNatureOfBusiness:"",yearsOfService:"",monthsOfService:"",salaryDate:"",netSalary:"",employmentType:"Permanent",workLocation:"Malaysia",companyName:"",officeAddress:"",officePostcode:"",officeTel:"",
  ec1Name:"",ec1Relationship:"Spouse",ec1StayWith:"Yes",ec1Address:"",ec1ContactNumber:"",ec1BestTime:"Anytime",
  ec2Name:"",ec2Relationship:"Spouse",ec2StayWith:"Yes",ec2Address:"",ec2ContactNumber:"",ec2BestTime:"Anytime",
});
const Section=({title,children})=><div style={{marginBottom:18}}>
  <div style={{fontSize:11,fontWeight:700,color:C.blueBright,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10,paddingBottom:6,borderBottom:`2px solid ${C.border}`}}>{title}</div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>{children}</div>
</div>;
const TIMES=["Morning","Noon","Evening","Anytime"];
const RELATIONS=["Spouse","Sibling","Parent"];

function NewApplicationForm({branchMeta,userBranch,onSaved}){
  const [f,setF]=useState(emptyApp);
  const [icFiles,setIcFiles]=useState([]);
  const [incomeFiles,setIncomeFiles]=useState([]);
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const required=[
    "customerName","phoneModel","financePrice","tenure","salesAgentName",
    "customerIC","race","gender","residencyStatus","maritalStatus","housingStatus",
    "customerHP","customerEmail","address","postcode","city","lengthOfStay","bestTimeContact",
    "bankName","bankAccountType","bankAccountHolderName","bankAccountNumber",
    "occupation","workDepartment","companyNatureOfBusiness","yearsOfService","monthsOfService","salaryDate","netSalary","employmentType","workLocation","companyName","officeAddress","officePostcode","officeTel",
    "ec1Name","ec1Relationship","ec1StayWith","ec1Address","ec1ContactNumber","ec1BestTime",
    "ec2Name","ec2Relationship","ec2StayWith","ec2Address","ec2ContactNumber","ec2BestTime",
  ];
  const missing=required.filter(k=>!String(f[k]||"").trim());
  const submit=async()=>{
    if(missing.length||!icFiles.length||!incomeFiles.length){alert("Please fill in every field and upload both document sets before submitting.");return;}
    setSaving(true);
    const id=`jcl_${Date.now()}`;
    const icDocuments=await Promise.all(icFiles.map(file=>readAppFile(file,`${id}_ic`)));
    const incomeDocuments=await Promise.all(incomeFiles.map(file=>readAppFile(file,`${id}_income`)));
    const app={
      id,branch:userBranch,step:1,merchant:"JCL",
      ...f,financePrice:parseFloat(f.financePrice)||0,
      icDocuments,incomeDocuments,
      submittedAt:nowDate(),submittedTime:nowTime(),
      submittedToJCLDate:null,followUpRemark:null,followUpRequestedDate:null,
      followUpResponseFiles:[],followUpRespondedDate:null,
      approvedDate:null,approvedRemark:null,rejectedDate:null,rejectedRemark:null,
      linkedOrderId:null,history:[{step:1,date:nowDate(),time:nowTime(),note:"New Application submitted by branch"}],
    };
    await onSaved(app);
    setSaving(false);
    setF(emptyApp());setIcFiles([]);setIncomeFiles([]);
  };
  return<div style={{...card,padding:"16px 18px",marginBottom:14}}>
    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:16}}>New Application — {branchMeta[userBranch]?.name||userBranch}</div>

    <Section title="Application &amp; Device">
      <div><L req>Customer Name</L><I value={f.customerName} onChange={e=>set("customerName",e.target.value)}/></div>
      <div><L req>Phone Model / Item</L><I value={f.phoneModel} onChange={e=>set("phoneModel",e.target.value)}/></div>
      <div><L req>Finance Price (RM)</L><I type="number" step="0.01" value={f.financePrice} onChange={e=>set("financePrice",e.target.value)}/></div>
      <div><L req>CCM Device Tenure</L><SEL value={f.tenure} onChange={e=>set("tenure",e.target.value)}><option value="12">12 Months</option><option value="24">24 Months</option><option value="36">36 Months</option></SEL></div>
      <div><L req>Sales Agent</L><I value={f.salesAgentName} onChange={e=>set("salesAgentName",e.target.value)}/></div>
      <div><L>Branch</L><I value={branchMeta[userBranch]?.name||userBranch} disabled/></div>
    </Section>

    <Section title="Personal Details">
      <div><L req>Customer IC</L><I value={f.customerIC} onChange={e=>set("customerIC",e.target.value)}/></div>
      <div><L req>Race</L><SEL value={f.race} onChange={e=>set("race",e.target.value)}>{["Chinese","Indian","Malay","Other"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Gender</L><SEL value={f.gender} onChange={e=>set("gender",e.target.value)}>{["Male","Female"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Residency Status</L><SEL value={f.residencyStatus} onChange={e=>set("residencyStatus",e.target.value)}>{["Bumiputera","Non-Bumiputera"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Marital Status</L><SEL value={f.maritalStatus} onChange={e=>set("maritalStatus",e.target.value)}>{["Single","Married","Widowed","Divorced"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Housing Status</L><SEL value={f.housingStatus} onChange={e=>set("housingStatus",e.target.value)}>{["Company's Apartment","Parent's Property","Renting","Own Property","Family's Property"].map(x=><option key={x}>{x}</option>)}</SEL></div>
    </Section>

    <Section title="Contact &amp; Address">
      <div><L req>Customer HP No.</L><I value={f.customerHP} onChange={e=>set("customerHP",e.target.value)}/></div>
      <div><L req>Customer Email Address</L><I type="email" value={f.customerEmail} onChange={e=>set("customerEmail",e.target.value)}/></div>
      <div><L req>Length of Stay</L><I value={f.lengthOfStay} onChange={e=>set("lengthOfStay",e.target.value)} placeholder="e.g. 3 years"/></div>
      <div><L req>Postcode</L><I value={f.postcode} onChange={e=>set("postcode",e.target.value)}/></div>
      <div><L req>City</L><I value={f.city} onChange={e=>set("city",e.target.value)}/></div>
      <div><L req>Best Time to Contact Applicant</L><SEL value={f.bestTimeContact} onChange={e=>set("bestTimeContact",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
    </Section>
    <div style={{marginTop:-8,marginBottom:16}}><L req>Address</L><TX rows={2} value={f.address} onChange={e=>set("address",e.target.value)}/></div>

    <Section title="Bank Details">
      <div><L req>Bank Name</L><I value={f.bankName} onChange={e=>set("bankName",e.target.value)}/></div>
      <div><L req>Bank Account Type</L><SEL value={f.bankAccountType} onChange={e=>set("bankAccountType",e.target.value)}>{["Savings","Current"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Bank Account Holder Name</L><I value={f.bankAccountHolderName} onChange={e=>set("bankAccountHolderName",e.target.value)}/></div>
      <div><L req>Bank Account Number</L><I value={f.bankAccountNumber} onChange={e=>set("bankAccountNumber",e.target.value)}/></div>
    </Section>

    <Section title="Employment &amp; Income">
      <div><L req>Customer Occupation</L><I value={f.occupation} onChange={e=>set("occupation",e.target.value)}/></div>
      <div><L req>Customer Work Department</L><I value={f.workDepartment} onChange={e=>set("workDepartment",e.target.value)}/></div>
      <div><L req>Company Nature of Business</L><I value={f.companyNatureOfBusiness} onChange={e=>set("companyNatureOfBusiness",e.target.value)}/></div>
      <div><L req>Years of Service</L><I type="number" value={f.yearsOfService} onChange={e=>set("yearsOfService",e.target.value)}/></div>
      <div><L req>Months of Service</L><I type="number" value={f.monthsOfService} onChange={e=>set("monthsOfService",e.target.value)}/></div>
      <div><L req>Salary Date</L><I value={f.salaryDate} onChange={e=>set("salaryDate",e.target.value)} placeholder="e.g. 25th"/></div>
      <div><L req>Net Salary (RM)</L><I type="number" step="0.01" value={f.netSalary} onChange={e=>set("netSalary",e.target.value)}/></div>
      <div><L req>Employment Type</L><SEL value={f.employmentType} onChange={e=>set("employmentType",e.target.value)}>{["Commission","Contract","Permanent","Probation","Self-Employment","Retirement"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Work Location</L><SEL value={f.workLocation} onChange={e=>set("workLocation",e.target.value)}>{["Malaysia","Singapore"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Company Name</L><I value={f.companyName} onChange={e=>set("companyName",e.target.value)}/></div>
      <div><L req>Office Postcode</L><I value={f.officePostcode} onChange={e=>set("officePostcode",e.target.value)}/></div>
      <div><L req>Office Tel No.</L><I value={f.officeTel} onChange={e=>set("officeTel",e.target.value)}/></div>
    </Section>
    <div style={{marginTop:-8,marginBottom:16}}><L req>Office Address</L><TX rows={2} value={f.officeAddress} onChange={e=>set("officeAddress",e.target.value)}/></div>

    <Section title="Document Uploads">
      <div><L req>Customer IC — Front &amp; Back</L><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setIcFiles(Array.from(e.target.files||[]))} style={{fontSize:11}}/>{icFiles.length>0&&<div style={{fontSize:10,color:C.textLight,marginTop:3}}>{icFiles.length} file(s) selected</div>}</div>
      <div><L req>Salary Slip, EPF &amp; Bank Statement</L><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setIncomeFiles(Array.from(e.target.files||[]))} style={{fontSize:11}}/>{incomeFiles.length>0&&<div style={{fontSize:10,color:C.textLight,marginTop:3}}>{incomeFiles.length} file(s) selected</div>}</div>
    </Section>

    <Section title="Emergency Contact #1">
      <div><L req>Name</L><I value={f.ec1Name} onChange={e=>set("ec1Name",e.target.value)}/></div>
      <div><L req>Relationship</L><SEL value={f.ec1Relationship} onChange={e=>set("ec1Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec1StayWith} onChange={e=>set("ec1StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec1ContactNumber} onChange={e=>set("ec1ContactNumber",e.target.value)}/></div>
      <div><L req>Best Time to Contact</L><SEL value={f.ec1BestTime} onChange={e=>set("ec1BestTime",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
    </Section>
    <div style={{marginTop:-8,marginBottom:16}}><L req>Address</L><TX rows={2} value={f.ec1Address} onChange={e=>set("ec1Address",e.target.value)}/></div>

    <Section title="Emergency Contact #2">
      <div><L req>Name</L><I value={f.ec2Name} onChange={e=>set("ec2Name",e.target.value)}/></div>
      <div><L req>Relationship</L><SEL value={f.ec2Relationship} onChange={e=>set("ec2Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec2StayWith} onChange={e=>set("ec2StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec2ContactNumber} onChange={e=>set("ec2ContactNumber",e.target.value)}/></div>
      <div><L req>Best Time to Contact</L><SEL value={f.ec2BestTime} onChange={e=>set("ec2BestTime",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
    </Section>
    <div style={{marginBottom:16}}><L req>Address</L><TX rows={2} value={f.ec2Address} onChange={e=>set("ec2Address",e.target.value)}/></div>

    <PBtn onClick={submit} disabled={saving}>{saving?"Submitting…":"Submit Application"}</PBtn>
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

/* ── Admin action panel for one application ───────────────────────────── */
function AdminActions({app,branchMeta,onSaved,onCreateOrder}){
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

  if(app.step===4)return<div style={{fontSize:11,color:"#15803D",fontWeight:600}}>Approved {fDate(app.approvedDate)}{app.linkedOrderId?" — order created":""}{app.approvedRemark?` — ${app.approvedRemark}`:""}</div>;
  if(app.step===5)return<div style={{fontSize:11,color:"#DC2626",fontWeight:600}}>Rejected {fDate(app.rejectedDate)} — {app.rejectedRemark}</div>;

  return<div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
    {app.step===1&&<GBtn onClick={submitToJCL} disabled={saving} style={{fontSize:11,padding:"7px 12px"}}>{saving?"Saving…":"Submit to JCL"}</GBtn>}
    {app.step===3&&!app.followUpRespondedDate&&<div style={{fontSize:11,color:"#B45309"}}>Waiting on branch to respond to follow-up request.</div>}
    {(app.step===2||(app.step===3&&app.followUpRespondedDate))&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {!showFollowUp?<GBtn onClick={()=>setShowFollowUp(true)} style={{fontSize:11,padding:"7px 12px",color:"#B45309",borderColor:"#FDE68A"}}>Request Follow-Up</GBtn>:null}
      {!showApprove&&!showReject?<>
        <PBtn onClick={()=>setShowApprove(true)} style={{fontSize:11,padding:"7px 12px",background:"#15803D"}}>Approved by JCL</PBtn>
        <GBtn onClick={()=>setShowReject(true)} style={{fontSize:11,padding:"7px 12px",color:"#DC2626",borderColor:"#FECACA"}}>Rejected by JCL</GBtn>
      </>:null}
    </div>}
    {showFollowUp&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L req>Follow-Up Remark (what JCL needs)</L>
      <TX rows={2} value={followUpRemark} onChange={e=>setFollowUpRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowFollowUp(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <PBtn onClick={requestFollowUp} disabled={saving} style={{fontSize:11,padding:"6px 12px",background:"#B45309"}}>{saving?"Saving…":"Confirm"}</PBtn>
      </div>
    </div>}
    {showApprove&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L>Remark (optional)</L>
      <I value={approvedRemark} onChange={e=>setApprovedRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{fontSize:10,color:C.textLight,marginBottom:8}}>This will automatically create a new CCM order on the Order page, pre-filled with this application's details.</div>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowApprove(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <PBtn onClick={approve} disabled={saving} style={{fontSize:11,padding:"6px 12px",background:"#15803D"}}>{saving?"Saving…":"Confirm Approval"}</PBtn>
      </div>
    </div>}
    {showReject&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
      <L req>Rejection Reason</L>
      <TX rows={2} value={rejectedRemark} onChange={e=>setRejectedRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowReject(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <DBtnLocal onClick={reject} disabled={saving}>{saving?"Saving…":"Confirm Rejection"}</DBtnLocal>
      </div>
    </div>}
  </div>;
}

function Timeline({app}){
  const hist=app.history||[];
  if(!hist.length)return<div style={{fontSize:11,color:C.textLight}}>No history yet.</div>;
  return<div style={{display:"flex",flexDirection:"column",gap:8}}>
    {hist.map((h,i)=>{
      const d=stepDef(h.step);
      return<div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:d.color,marginTop:4,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text}}>{d.label} <span style={{fontWeight:500,color:C.textLight}}>· {fDate(h.date)} {h.time||""}</span></div>
          {h.note&&<div style={{fontSize:11,color:C.textMid,marginTop:1}}>{h.note}</div>}
        </div>
      </div>;
    })}
  </div>;
}

export default function JCLTab({branchMeta,isAdmin,userBranch}){
  const [apps,setApps]=useState([]);
  const [loading,setLoading]=useState(true);
  const [branchFilter,setBranchFilter]=useState("all");
  const [stepFilter,setStepFilter]=useState("all");
  const [expandedTimeline,setExpandedTimeline]=useState(null);
  const [fileUrls,setFileUrls]=useState({});

  useEffect(()=>{loadData(JCL_KEY).then(d=>{setApps(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  const save=async(updated)=>{
    const next=[...apps.filter(a=>a.id!==updated.id),updated].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
    setApps(next);
    await saveData(JCL_KEY,next);
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
      financePrice:app.financePrice,salesAgentName:app.salesAgentName,
      history:[{step:1,date:nowDate(),time:nowTime(),note:`Submitted — auto-created from approved JCL Application (${app.id})`}],
    };
    const result=await reconcile([],[order]);
    return result.ok?id:null;
  };

  useEffect(()=>{
    apps.forEach(a=>(a.followUpResponseFiles||[]).forEach(async(f,i)=>{
      const key=`${a.id}_followup${i}`;
      if(f.path&&!fileUrls[key]){
        const url=await signFileUrl(f.path);
        if(url)setFileUrls(p=>({...p,[key]:url}));
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[apps]);

  const scoped=useMemo(()=>{
    let list=apps;
    if(userBranch)list=list.filter(a=>a.branch===userBranch);
    else if(branchFilter!=="all")list=list.filter(a=>a.branch===branchFilter);
    return list;
  },[apps,userBranch,branchFilter]);

  const stepCounts=useMemo(()=>STEPS.reduce((acc,s)=>{acc[s.step]=scoped.filter(a=>a.step===s.step).length;return acc;},{}),[scoped]);

  const visible=useMemo(()=>{
    if(stepFilter==="all")return scoped;
    return scoped.filter(a=>a.step===stepFilter);
  },[scoped,stepFilter]);

  const needsBranchAction=useMemo(()=>userBranch?apps.filter(a=>a.branch===userBranch&&a.step===3&&!a.followUpRespondedDate):[],[apps,userBranch]);

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  return<div>
    {needsBranchAction.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Follow-Up Needed From You</div>
      {needsBranchAction.map(a=><div key={a.id} style={{borderTop:`1px solid ${C.border}`,padding:"8px 0"}}>
        <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:4}}>{a.customerName} — {a.phoneModel}</div>
        <FollowUpResponseBox app={a} onSaved={save}/>
      </div>)}
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:14}}>
      {STEPS.map(s=>{
        const active=stepFilter===s.step;
        const count=stepCounts[s.step]||0;
        return<div key={s.step} onClick={()=>setStepFilter(active?"all":s.step)} style={{...card,border:`1px solid ${active?s.color:C.border}`,borderTop:`3px solid ${s.color}`,padding:"11px 12px 10px",cursor:"pointer",boxShadow:active?`0 0 0 1.5px ${s.color}, 0 6px 16px rgba(10,22,40,.08)`:card.boxShadow}}>
          <div style={{fontSize:9.5,fontWeight:700,color:C.textLight,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.label}</div>
          <div style={{fontSize:21,fontWeight:800,color:count?s.color:"#C3CCDA",lineHeight:1}}>{count}</div>
        </div>;
      })}
    </div>

    {userBranch&&<NewApplicationForm branchMeta={branchMeta} userBranch={userBranch} onSaved={save}/>}

    <div style={{...card}}>
      <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>JCL Applications</span>
        {!userBranch&&<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)} style={{padding:"5px 9px",fontSize:11,borderRadius:6,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.06)",color:"#fff"}}>
          <option value="all">All Branches</option>
          {Object.keys(branchMeta||{}).map(b=><option key={b} value={b}>{branchMeta[b]?.name||b}</option>)}
        </select>}
      </div>
      {visible.length===0
        ?<div style={{padding:"30px 16px",textAlign:"center",color:C.textLight,fontSize:12}}>No applications yet.</div>
        :<div>{visible.map(a=>{
          const timelineOpen=expandedTimeline===a.id;
          return<div key={a.id} style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.text}}>{a.customerName} <span style={{fontWeight:500,color:C.textLight,fontSize:11}}>· {branchMeta[a.branch]?.name||a.branch} · {fDate(a.submittedAt)}</span></div>
              <div style={{fontSize:11,color:C.textMid,marginTop:3}}>{a.phoneModel} · {fRM(a.financePrice)} · IC {a.customerIC} · {a.customerHP}</div>
            </div>
            <StepBadge step={a.step}/>
          </div>
          {a.step===3&&<div style={{fontSize:11,color:"#B45309",marginTop:4,fontWeight:600}}>Follow-Up: {a.followUpRemark}{a.followUpRespondedDate?` — branch responded ${fDate(a.followUpRespondedDate)}`:""}</div>}
          {(a.followUpResponseFiles||[]).map((f,i)=><div key={i} style={{marginTop:4}}>{fileUrls[`${a.id}_followup${i}`]?<a href={fileUrls[`${a.id}_followup${i}`]} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.blueBright,fontWeight:600}}>View Follow-up File: {f.name}</a>:<span style={{fontSize:11,color:C.textLight}}>Loading…</span>}</div>)}
          <button onClick={()=>setExpandedTimeline(timelineOpen?null:a.id)} style={{marginTop:8,fontSize:11,fontWeight:700,color:C.blueBright,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",padding:0}}>{timelineOpen?"Hide Timeline ▲":"View Timeline ▼"}</button>
          {timelineOpen&&<div style={{marginTop:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px"}}><Timeline app={a}/></div>}
          {isAdmin&&<AdminActions app={a} branchMeta={branchMeta} onSaved={save} onCreateOrder={createOrderFromApp}/>}
        </div>;
        })}</div>}
    </div>
  </div>;
}
