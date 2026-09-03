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
import {useState,useEffect,useMemo,useRef} from "react";
import {loadData,saveData,supabase} from "./storage/index.js";
import {uploadOrderFile,signFileUrl,reconcile} from "./storage/ordersApi.js";
import {CHAILEASE_KEY} from "./ChaileaseTab.jsx";

export const JCL_KEY="emax_v5_jcl_applications";

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
  check:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};
const STEP_ICONS={1:Ic.fileText,2:Ic.share2,3:Ic.alertCircle,4:Ic.checkCircle,5:Ic.x};
const SHORT_LABELS={1:"New App",2:"Submitted",3:"Follow-Up",4:"Approved",5:"Rejected"};

function ProgressBar({step,history=[]}){
  const pct=Math.round(((Math.min(step,5)-1)/4)*100);
  const cur=stepDef(step);
  const visibleSteps=STEPS.filter(s=>{
    const skippedInPast=step>s.step&&!history.some(h=>h.step===s.step);
    return!skippedInPast;
  });
  return<div style={{...card,padding:"16px 18px",marginBottom:14}}>
    <div style={{display:"flex",width:"100%"}}>
      {visibleSteps.map((s,i)=>{
        const done=step>s.step&&history.some(h=>h.step===s.step),active=step===s.step;
        return<div key={s.step} style={{flex:i<visibleSteps.length-1?1:"0 0 auto",display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
          <div style={{display:"flex",alignItems:"center",width:"100%"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:done?C.navy:active?C.blueBright:"#E4EAF2",border:`2px solid ${done?C.navy:active?C.blueBright:"#E4EAF2"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff",transition:"all .2s"}}>
              {done?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:active?<div style={{width:7,height:7,borderRadius:"50%",background:"#fff"}}/>:<span style={{fontSize:8,fontWeight:700,color:C.textLight}}>{i+1}</span>}
            </div>
            {i<visibleSteps.length-1&&<div style={{flex:1,height:2,background:done?C.navy:"#E4EAF2",margin:"0 3px",transition:"background .3s"}}/>}
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

function StepBadge({app,step}){
  if(app&&app.step===1&&app.amendmentRequestedDate&&!app.amendmentRespondedDate)return<span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:"#FFFBEB",color:"#B45309",whiteSpace:"nowrap"}}>Amendment Requested</span>;
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

// Loads jsPDF from CDN on demand.
let jsPdfLoadPromise=null;
function loadJsPdf(){
  if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
  if(jsPdfLoadPromise)return jsPdfLoadPromise;
  jsPdfLoadPromise=new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload=()=>res(window.jspdf.jsPDF);
    s.onerror=rej;
    document.head.appendChild(s);
  });
  return jsPdfLoadPromise;
}

// Loads PDF.js from CDN on demand — used to render an uploaded PDF's first
// page down to a canvas/image, so it can be merged the same way a photo
// would be, regardless of what file type the branch actually uploaded.
let pdfJsLoadPromise=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(pdfJsLoadPromise)return pdfJsLoadPromise;
  pdfJsLoadPromise=new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      res(window.pdfjsLib);
    };
    s.onerror=rej;
    document.head.appendChild(s);
  });
  return pdfJsLoadPromise;
}

// Loads JSZip from CDN on demand — same pattern as the loaders above. Used
// to bundle multiple documents into a single downloadable .zip.
let jsZipLoadPromise=null;
function loadJsZip(){
  if(window.JSZip)return Promise.resolve(window.JSZip);
  if(jsZipLoadPromise)return jsZipLoadPromise;
  jsZipLoadPromise=new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload=()=>res(window.JSZip);
    s.onerror=rej;
    document.head.appendChild(s);
  });
  return jsZipLoadPromise;
}

function loadImageEl(url){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>res(img);
    img.onerror=rej;
    img.src=url;
  });
}

// Renders a PDF file's first page to a canvas at a reasonably high
// resolution (2x scale, roughly print quality) so it can be embedded into
// the merged PDF the same way a photo would be.
async function renderPdfFirstPageToCanvas(url){
  const pdfjsLib=await loadPdfJs();
  const pdf=await pdfjsLib.getDocument(url).promise;
  const page=await pdf.getPage(1);
  const viewport=page.getViewport({scale:2});
  const canvas=document.createElement("canvas");
  canvas.width=viewport.width;
  canvas.height=viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
  return canvas;
}

// Merges the IC Front and IC Back photos into a single PDF document object
// — each one gets its own A4 page, scaled to fit while keeping its
// original aspect ratio (not stretched/distorted). Works no matter what
// file type was actually uploaded for each slot (PDF, PNG, JPG, JPEG) — a
// PDF upload's first page gets rendered to a canvas first via PDF.js, then
// handled identically to a photo from that point on. Returns the jsPDF
// document object itself (not yet saved/downloaded) plus which parts, if
// any, couldn't be included — reused by both the standalone "Download IC
// PDF" button and the bulk "Download All Documents" zip.
async function buildIcPdfDoc(frontUrl,frontName,backUrl,backName){
  const jsPDF=await loadJsPdf();
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const pageW=210,pageH=297,margin=10;
  let addedAny=false;
  let skipped=[];
  const addPhotoPage=async(url,name,label,isFirst)=>{
    if(!url){skipped.push(label);return;}
    try{
      const isPdf=/\.pdf$/i.test(name||"");
      const source=isPdf?await renderPdfFirstPageToCanvas(url):await loadImageEl(url);
      if(!isFirst)doc.addPage();
      const availW=pageW-margin*2,availH=pageH-margin*2-10;
      const scale=Math.min(availW/source.width,availH/source.height);
      const w=source.width*scale,h=source.height*scale;
      const x=(pageW-w)/2,y=margin+10;
      doc.setFontSize(11);
      doc.text(label,margin,margin+5);
      // A rendered PDF-page canvas is always embedded as PNG (lossless,
      // and canvas.toDataURL defaults to PNG); an actual photo upload
      // keeps its own real format so it isn't needlessly re-encoded.
      const fmt=isPdf?"PNG":(/\.png$/i.test(name||"")?"PNG":"JPEG");
      doc.addImage(source,fmt,x,y,w,h);
      addedAny=true;
    }catch(e){
      skipped.push(`${label} (couldn't load)`);
    }
  };
  await addPhotoPage(frontUrl,frontName,"IC Front",true);
  await addPhotoPage(backUrl,backName,"IC Back",!addedAny);
  return{doc,addedAny,skipped};
}

async function downloadIcPdf(frontUrl,frontName,backUrl,backName,customerName){
  const{doc,addedAny,skipped}=await buildIcPdfDoc(frontUrl,frontName,backUrl,backName);
  if(!addedAny)return{ok:false,skipped};
  doc.save(`${(customerName||"customer").replace(/[^a-zA-Z0-9]+/g,"_")}_IC.pdf`);
  return{ok:true,skipped};
}

// Bundles the IC Front + Back (merged into one PDF, reusing the exact
// same logic as the standalone IC download above), Latest Salary Slip,
// EPF Statement, and Latest Bank Statement into a single downloadable
// .zip — the other three documents are kept in whatever format they were
// actually uploaded in (no conversion needed, they're not being merged
// with anything). Zip file is named after the customer's full name.
async function downloadAllDocuments(app,fileUrls){
  const[JSZip,icResult]=await Promise.all([
    loadJsZip(),
    buildIcPdfDoc(fileUrls[`${app.id}_icFrontFile`],app.icFrontFile?.name,fileUrls[`${app.id}_icBackFile`],app.icBackFile?.name),
  ]);
  const zip=new JSZip();
  const skipped=icResult.skipped.map(s=>`IC: ${s}`);
  if(icResult.addedAny)zip.file("IC Front and Back.pdf",icResult.doc.output("blob"));
  else skipped.push("IC PDF (neither photo could be loaded)");

  const otherDocs=[
    {key:"salarySlipFile",label:"Latest Salary Slip"},
    {key:"epfStatementFile",label:"EPF Statement"},
    {key:"bankStatementFile",label:"Latest Bank Statement"},
  ];
  for(const{key,label} of otherDocs){
    const url=fileUrls[`${app.id}_${key}`];
    const fileMeta=app[key];
    if(!url||!fileMeta){skipped.push(`${label} (not uploaded)`);continue;}
    try{
      const res=await fetch(url);
      if(!res.ok)throw new Error("fetch failed");
      const blob=await res.blob();
      const ext=(fileMeta.name.match(/\.[a-zA-Z0-9]+$/)||[".pdf"])[0];
      zip.file(`${label}${ext}`,blob);
    }catch(e){
      skipped.push(`${label} (couldn't load)`);
    }
  }

  const zipBlob=await zip.generateAsync({type:"blob"});
  const url=URL.createObjectURL(zipBlob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`${(app.customerName||"customer").replace(/[^a-zA-Z0-9]+/g,"_")}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return{ok:true,skipped};
}

/* ── Timeline ──────────────────────────────────────────────────────────── */
function Timeline({app}){
  const cur=app.step;
  const hist=app.history||[];
  // A step only counts as genuinely completed if there's an actual history
  // entry recording it happened — not just because its step number is
  // lower than the current one. This workflow branches (step 2 "Submitted
  // to JCL" can jump straight to step 5 "Rejected", skipping 3 "Follow-Up
  // Required" and 4 "Approved" entirely). Steps that were definitively
  // skipped (already in the past, with no history evidence they ever
  // happened) are left out of the timeline entirely, rather than shown
  // grayed-out — otherwise a rejected application still looks like it
  // passed through Follow-Up and Approval first. Steps still ahead in an
  // in-progress application stay visible as pending, since their outcome
  // genuinely hasn't been decided yet.
  const visibleSteps=STEPS.filter(s=>{
    const skippedInPast=cur>s.step&&!hist.some(h=>h.step===s.step);
    return!skippedInPast;
  });
  return<div>{visibleSteps.map((s,i)=>{
    const done=cur>s.step&&hist.some(h=>h.step===s.step);
    const active=cur===s.step;
    const histEntries=hist.filter(h=>h.step===s.step);
    const isLast=i===visibleSteps.length-1;
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
function ApplicationForm({branchMeta,userBranch,isAdmin,srList,editingApp,onSaved,onCancel,onDirtyChange}){
  const [f,setF]=useState(()=>editingApp?{...emptyApp(),...editingApp}:emptyApp(userBranch||""));
  const [docs,setDocs]=useState(()=>{
    const d={};
    DOC_FIELDS.forEach(({key})=>{d[key]=editingApp?.[key]||null;});
    return d;
  });
  const [docFiles,setDocFiles]=useState({});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));onDirtyChange&&onDirtyChange(true);};
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
  const invalidHP=f.customerHP&&(f.customerHP.length<10||f.customerHP.length>11);
  const invalidEc1Contact=f.ec1ContactNumber&&(f.ec1ContactNumber.length<10||f.ec1ContactNumber.length>11);
  const invalidEc2Contact=f.ec2ContactNumber&&(f.ec2ContactNumber.length<10||f.ec2ContactNumber.length>11);
  const missingDocs=DOC_FIELDS.filter(({key})=>!docs[key]&&!docFiles[key]);
  // Detects the same file picked for two different document slots (e.g.
  // IC Front and IC Back accidentally set to the identical photo) — a
  // File object's name+size+lastModified together reliably identify "the
  // exact same file" without needing to read its actual contents.
  const duplicateDocKeys=useMemo(()=>{
    const entries=DOC_FIELDS.filter(({key})=>docFiles[key]).map(({key})=>({key,file:docFiles[key]}));
    const dupes=new Set();
    for(let i=0;i<entries.length;i++){
      for(let j=i+1;j<entries.length;j++){
        const a=entries[i].file,b=entries[j].file;
        if(a.name===b.name&&a.size===b.size&&a.lastModified===b.lastModified){
          dupes.add(entries[i].key);dupes.add(entries[j].key);
        }
      }
    }
    return dupes;
  },[docFiles]);

  const submit=async()=>{
    if(missing.length||missingDocs.length){alert("Please fill in every field and upload every document before submitting.");return;}
    if(invalidHP){alert("Customer HP No. must be 10 to 11 digits.");return;}
    if(invalidEc1Contact||invalidEc2Contact){alert("Emergency Contact Number(s) must be 10 to 11 digits.");return;}
    if(duplicateDocKeys.size>0){alert("The same file has been selected for more than one document slot. Please check each upload and select the correct, distinct file for each one.");return;}
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
      amendmentRemark:null,amendmentRequestedDate:null,amendmentRespondedDate:null,
      approvedDate:null,approvedRemark:null,rejectedDate:null,rejectedRemark:null,
      linkedOrderId:null,history:[{step:1,date:nowDate(),time:nowTime(),note:"New Application submitted"}],
    };
    // If this application had a pending amendment request (branch fixing
    // wrong details before admin ever submitted to JCL), resubmitting here
    // clears that pending state so it goes back to admin as a normal new
    // application, ready for Submit to JCL again.
    const hadPendingAmendment=editingApp?.amendmentRequestedDate&&!editingApp?.amendmentRespondedDate;
    const app={
      ...base,id,...f,financePrice:parseFloat(f.financePrice)||0,...uploadedDocs,
      ...(hadPendingAmendment?{amendmentRespondedDate:nowDate()}:{}),
      history:editingApp?[...(editingApp.history||[]),{step:editingApp.step,date:nowDate(),time:nowTime(),note:hadPendingAmendment?"Application corrected and resubmitted":"Application details edited"}]:base.history,
    };
    await onSaved(app);
    setSaving(false);
  };

  return<div className="fade-in">
    <div style={{marginBottom:10}}><GBtn onClick={onCancel}>{Ic.chevL} Back</GBtn></div>
    <div style={{...card,marginBottom:16,padding:0,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`}}>
        <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>{editingApp?"Edit JCL Application":"New JCL Application"}</div>
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
      <div><L req>Customer IC</L><I value={f.customerIC} onChange={e=>set("customerIC",e.target.value.replace(/\D/g,""))} placeholder="e.g. 900101123456" inputMode="numeric"/></div>
      <div><L req>Race</L><SEL value={f.race} onChange={e=>set("race",e.target.value)}>{["Chinese","Indian","Malay","Other"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Gender</L><SEL value={f.gender} onChange={e=>set("gender",e.target.value)}>{["Male","Female"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Residency Status</L><SEL value={f.residencyStatus} onChange={e=>set("residencyStatus",e.target.value)}>{["Bumiputera","Non-Bumiputera"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Marital Status</L><SEL value={f.maritalStatus} onChange={e=>set("maritalStatus",e.target.value)}>{["Single","Married","Widowed","Divorced"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Housing Status</L><SEL value={f.housingStatus} onChange={e=>set("housingStatus",e.target.value)}>{["Company's Apartment","Parent's Property","Renting","Own Property","Family's Property"].map(x=><option key={x}>{x}</option>)}</SEL></div>
    </FormCard>

    <FormCard title="Contact & Address">
      <div><L req>Customer HP No.</L><I value={f.customerHP} onChange={e=>set("customerHP",e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="e.g. 0121234567" inputMode="numeric"/>
        {invalidHP&&<div style={{fontSize:11,color:"#DC2626",marginTop:4}}>Must be 10 to 11 digits.</div>}
      </div>
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
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{setDocFiles(p=>({...p,[key]:e.target.files[0]||null}));onDirtyChange&&onDirtyChange(true);}} style={{fontSize:11}}/>
        {docFiles[key]?<div style={{fontSize:10,color:duplicateDocKeys.has(key)?"#DC2626":"#15803D",marginTop:3}}>New file selected: {docFiles[key].name}</div>
          :docs[key]?<div style={{fontSize:10,color:C.textLight,marginTop:3}}>On file: {docs[key].name}</div>:null}
        {duplicateDocKeys.has(key)&&<div style={{fontSize:10,color:"#DC2626",marginTop:2}}>Same file as another document below — please select the correct, distinct file.</div>}
      </div>)}
    </FormCard>

    <FormCard title="Emergency Contact #1">
      <div><L req>Name</L><I value={f.ec1Name} onChange={e=>set("ec1Name",e.target.value)} placeholder="Full name"/></div>
      <div><L req>Relationship</L><SEL value={f.ec1Relationship} onChange={e=>set("ec1Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec1StayWith} onChange={e=>set("ec1StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec1ContactNumber} onChange={e=>set("ec1ContactNumber",e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="e.g. 0121234567" inputMode="numeric"/>
        {invalidEc1Contact&&<div style={{fontSize:11,color:"#DC2626",marginTop:4}}>Must be 10 to 11 digits.</div>}
      </div>
      <div><L req>Best Time to Contact</L><SEL value={f.ec1BestTime} onChange={e=>set("ec1BestTime",e.target.value)}>{TIMES.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div style={{gridColumn:"1/-1"}}><L req>Address</L><TX rows={2} value={f.ec1Address} onChange={e=>set("ec1Address",e.target.value)}/></div>
    </FormCard>

    <FormCard title="Emergency Contact #2">
      <div><L req>Name</L><I value={f.ec2Name} onChange={e=>set("ec2Name",e.target.value)} placeholder="Full name"/></div>
      <div><L req>Relationship</L><SEL value={f.ec2Relationship} onChange={e=>set("ec2Relationship",e.target.value)}>{RELATIONS.map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Stay With Applicant?</L><SEL value={f.ec2StayWith} onChange={e=>set("ec2StayWith",e.target.value)}>{["Yes","No"].map(x=><option key={x}>{x}</option>)}</SEL></div>
      <div><L req>Contact Number</L><I value={f.ec2ContactNumber} onChange={e=>set("ec2ContactNumber",e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="e.g. 0121234567" inputMode="numeric"/>
        {invalidEc2Contact&&<div style={{fontSize:11,color:"#DC2626",marginTop:4}}>Must be 10 to 11 digits.</div>}
      </div>
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
  const [showAmendment,setShowAmendment]=useState(false);
  const [amendmentRemark,setAmendmentRemark]=useState("");
  const [showApprove,setShowApprove]=useState(false);
  const [approvedRemark,setApprovedRemark]=useState("");
  const [agreementNumber,setAgreementNumber]=useState(app.agreementNumber||"");
  const [merchantApprovalDate,setMerchantApprovalDate]=useState(app.merchantApprovalDate||nowDate());
  const [approveFinancePrice,setApproveFinancePrice]=useState(app.financePrice||"");
  const [agreementFee,setAgreementFee]=useState(app.agreementFee||"");
  const [stampingFee,setStampingFee]=useState(app.stampingFee||"");
  const [deposit,setDeposit]=useState(app.deposit||"");
  const [approveTenure,setApproveTenure]=useState(app.tenure||"12");
  const [monthlyInstallment,setMonthlyInstallment]=useState(app.monthlyInstallment||"");
  const [jclApplicationForm,setJclApplicationForm]=useState(null);
  const [jclNotice1,setJclNotice1]=useState(null);
  const [jclAgreementJCLCopy,setJclAgreementJCLCopy]=useState(null);
  const [jclAgreementCustomerCopy,setJclAgreementCustomerCopy]=useState(null);
  const [jclCreditAckForm,setJclCreditAckForm]=useState(null);
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
  const requestAmendment=async()=>{
    if(!amendmentRemark.trim()){alert("Remark required.");return;}
    setSaving(true);
    await onSaved({...app,amendmentRemark,amendmentRequestedDate:nowDate(),amendmentRespondedDate:null,
      history:[...(app.history||[]),{step:1,date:nowDate(),time:nowTime(),note:`Amendment requested: ${amendmentRemark}`}]});
    setSaving(false);setShowAmendment(false);setAmendmentRemark("");
  };
  const approveMissing=!agreementNumber.trim()||!merchantApprovalDate||!approveFinancePrice.toString().trim()||!agreementFee.toString().trim()||!stampingFee.toString().trim()||!deposit.toString().trim()||!approveTenure||!monthlyInstallment.toString().trim()||!jclApplicationForm||!jclNotice1||!jclAgreementJCLCopy||!jclAgreementCustomerCopy||!jclCreditAckForm;
  const approve=async()=>{
    if(approveMissing){alert("Please fill in every field and upload every document before approving — these are needed to create the order.");return;}
    setSaving(true);
    const[applicationForm,notice1,agreementJCLCopy,agreementCustomerCopy,creditAckForm]=await Promise.all([
      readAppFile(jclApplicationForm,`${app.id}_applicationForm`),
      readAppFile(jclNotice1,`${app.id}_notice1`),
      readAppFile(jclAgreementJCLCopy,`${app.id}_agreementJCLCopy`),
      readAppFile(jclAgreementCustomerCopy,`${app.id}_agreementCustomerCopy`),
      readAppFile(jclCreditAckForm,`${app.id}_creditAckForm`),
    ]);
    const jclDocuments={applicationForm,notice1,agreementJCLCopy,agreementCustomerCopy,creditAckForm};
    const updated={...app,step:4,approvedDate:nowDate(),approvedRemark,
      agreementNumber,merchantApprovalDate,financePrice:parseFloat(approveFinancePrice)||0,
      agreementFee:parseFloat(agreementFee)||0,stampingFee:parseFloat(stampingFee)||0,deposit:parseFloat(deposit)||0,
      tenure:approveTenure,monthlyInstallment:parseFloat(monthlyInstallment)||0,jclDocuments,
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

  if(app.step===1&&app.amendmentRequestedDate&&!app.amendmentRespondedDate)return<ActionBox title="Amendment Requested" desc={`What needs fixing: ${app.amendmentRemark}`}>
    <div style={{fontSize:12,color:"#B45309"}}>Waiting on branch to correct and resubmit this application.</div>
  </ActionBox>;

  if(app.step===1)return<ActionBox title="Next: Submit to JCL" desc="New application ready to be submitted to JCL for review.">
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {!showAmendment&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <PBtn onClick={submitToJCL} disabled={saving} style={{flex:1,justifyContent:"center"}}>{saving?"Saving…":"Submit to JCL"}</PBtn>
        <GBtn onClick={()=>setShowAmendment(true)} style={{fontSize:12,color:"#B45309",borderColor:"#FDE68A"}}>Request Amendment</GBtn>
      </div>}
      {showAmendment&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:10}}>
        <L req>Amendment Remark (what's wrong / needs fixing)</L>
        <TX rows={2} value={amendmentRemark} onChange={e=>setAmendmentRemark(e.target.value)} style={{marginBottom:8}}/>
        <div style={{display:"flex",gap:8}}>
          <GBtn onClick={()=>{setShowAmendment(false);setAmendmentRemark("");}} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
          <PBtn onClick={requestAmendment} disabled={saving} style={{fontSize:11,padding:"6px 12px",background:"#B45309",boxShadow:"none"}}>{saving?"Saving…":"Confirm"}</PBtn>
        </div>
      </div>}
    </div>
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
      <div style={{fontSize:11,fontWeight:700,color:C.blueBright,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Agreement Details (required to create the order)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><L req>Agreement No. / Case ID No.</L><I value={agreementNumber} onChange={e=>setAgreementNumber(e.target.value)}/></div>
        <div><L req>Merchant Approval Date</L><I type="date" value={merchantApprovalDate} onChange={e=>setMerchantApprovalDate(e.target.value)}/></div>
        <div><L req>Finance Price (RM)</L><I type="number" step="0.01" value={approveFinancePrice} onChange={e=>setApproveFinancePrice(e.target.value)}/></div>
        <div><L req>CCM Tenure</L><SEL value={approveTenure} onChange={e=>setApproveTenure(e.target.value)}><option value="12">12 Months</option><option value="24">24 Months</option><option value="36">36 Months</option></SEL></div>
        <div><L req>Agreement Fee (RM)</L><I type="number" step="0.01" value={agreementFee} onChange={e=>setAgreementFee(e.target.value)}/></div>
        <div><L req>Stamping Fee (RM)</L><I type="number" step="0.01" value={stampingFee} onChange={e=>setStampingFee(e.target.value)}/></div>
        <div><L req>Deposit (RM)</L><I type="number" step="0.01" value={deposit} onChange={e=>setDeposit(e.target.value)}/></div>
        <div><L req>Monthly Installment (RM)</L><I type="number" step="0.01" value={monthlyInstallment} onChange={e=>setMonthlyInstallment(e.target.value)}/></div>
      </div>
      <div style={{fontSize:11,fontWeight:700,color:C.blueBright,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Documents (required to create the order)</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><L req>Application Form</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setJclApplicationForm(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{jclApplicationForm&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>{jclApplicationForm.name}</div>}</div>
        <div><L req>Notice 1</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setJclNotice1(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{jclNotice1&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>{jclNotice1.name}</div>}</div>
        <div><L req>Agreement Form (JCL Copy)</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setJclAgreementJCLCopy(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{jclAgreementJCLCopy&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>{jclAgreementJCLCopy.name}</div>}</div>
        <div><L req>Agreement Form (Customer Copy)</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setJclAgreementCustomerCopy(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{jclAgreementCustomerCopy&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>{jclAgreementCustomerCopy.name}</div>}</div>
        <div style={{gridColumn:"1/-1"}}><L req>Credit Sales Acknowledge Form</L><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setJclCreditAckForm(e.target.files[0]||null)} style={{fontSize:11,width:"100%"}}/>{jclCreditAckForm&&<div style={{fontSize:10,color:"#15803D",marginTop:2}}>{jclCreditAckForm.name}</div>}</div>
      </div>
      <L>Remark (optional)</L>
      <I value={approvedRemark} onChange={e=>setApprovedRemark(e.target.value)} style={{marginBottom:8}}/>
      <div style={{fontSize:10,color:C.textLight,marginBottom:8}}>This will automatically create a new CCM order on the Order page, pre-filled with these details.</div>
      <div style={{display:"flex",gap:8}}>
        <GBtn onClick={()=>setShowApprove(false)} style={{fontSize:11,padding:"6px 12px"}}>Cancel</GBtn>
        <PBtn onClick={approve} disabled={saving||approveMissing} style={{fontSize:11,padding:"6px 12px",background:"#15803D",boxShadow:"none"}}>{saving?"Saving…":"Confirm Approval"}</PBtn>
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
function ApplicationDetail({app,branchMeta,isAdmin,canEditDelete,canDelete,onBack,onSaved,onDelete,onEdit,onCreateOrder,fileUrls}){
  const copyField=(v)=>{if(!v)return;navigator.clipboard?.writeText(String(v)).catch(()=>{});};
  const [copiedField,setCopiedField]=useState(null);
  const [mergingIcPdf,setMergingIcPdf]=useState(false);
  const [zippingAll,setZippingAll]=useState(false);
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
        <StepBadge app={app} step={app.step}/>
        {(isAdmin||canEditDelete)&&<GBtn onClick={onEdit}>{Ic.edit} Edit</GBtn>}
        {canDelete&&<DBtnLocal onClick={onDelete}>{Ic.trash} Delete</DBtnLocal>}
      </div>
    </div>

    <div style={{...card,padding:"16px 18px",marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:700,color:C.blue,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>JCL Application</div>
      <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:2}}>{app.customerName}</div>
      <div style={{fontSize:11,color:C.textLight}}>{branchMeta[app.branch]?.name||app.branch} · Submitted {fDate(app.submittedAt)}</div>
    </div>

    <ProgressBar step={app.step} history={app.history||[]}/>

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
        {isAdmin&&(app.icFrontFile||app.icBackFile)&&<div style={{marginTop:6}}>
          <GBtn onClick={async()=>{
            setMergingIcPdf(true);
            const result=await downloadIcPdf(
              fileUrls[`${app.id}_icFrontFile`],app.icFrontFile?.name,
              fileUrls[`${app.id}_icBackFile`],app.icBackFile?.name,
              app.customerName
            );
            setMergingIcPdf(false);
            if(!result.ok)alert("Couldn't create the PDF — neither IC photo could be loaded.");
            else if(result.skipped.length)alert(`PDF downloaded, but skipped: ${result.skipped.join(", ")}.`);
          }} disabled={mergingIcPdf}>{mergingIcPdf?"Preparing PDF…":"Download IC Front + Back as PDF"}</GBtn>
        </div>}
        {isAdmin&&<div style={{marginTop:6}}>
          <GBtn onClick={async()=>{
            setZippingAll(true);
            const result=await downloadAllDocuments(app,fileUrls);
            setZippingAll(false);
            if(result.skipped.length)alert(`Zip downloaded, but skipped: ${result.skipped.join(", ")}.`);
          }} disabled={zippingAll}>{zippingAll?"Preparing Zip…":"Download All Documents (Zip)"}</GBtn>
        </div>}
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
        {!isAdmin&&app.step===1&&app.amendmentRequestedDate&&!app.amendmentRespondedDate&&<ActionBox title="Amendment Requested" desc={`What needs fixing: ${app.amendmentRemark}`}>
          <div style={{fontSize:12,color:C.textMid,marginBottom:8}}>Please correct the application details, then save to resubmit.</div>
          <PBtn onClick={onEdit} style={{width:"100%",justifyContent:"center"}}>Edit Application</PBtn>
        </ActionBox>}
        {!isAdmin&&!(app.step===3&&!app.followUpRespondedDate)&&!(app.step===1&&app.amendmentRequestedDate&&!app.amendmentRespondedDate)&&<ActionBox title="Action">
          <div style={{fontSize:12,color:C.textLight}}>No action needed from your side right now — admin handles the rest of this application.</div>
        </ActionBox>}
      </div>
    </div>
  </div>;
}

export default function JCLTab({branchMeta,isAdmin,userBranch,srList=[],email=null}){
  const [apps,setApps]=useState([]);
  const [rejectedSel,setRejectedSel]=useState(()=>new Set());
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("list"); // list | form | detail
  const [selectedId,setSelectedId]=useState(null);
  const [editingApp,setEditingApp]=useState(null);
  // Browser back/forward button support — additive on top of the existing
  // visible Back button, not a replacement for it. Unlike a single central
  // nav() function, view/selectedId here get set directly from many
  // different places, so instead of touching every one of those call
  // sites, this just watches for any change and pushes a history entry
  // automatically. isPopStateNav guards against the restoration inside
  // the popstate handler itself triggering another push, which would
  // otherwise create a duplicate/looping entry.
  const isPopStateNav=useRef(false);
  // Refs, not state — the popstate handler is set up once on mount (empty
  // deps below) so a plain state variable would be captured stale in that
  // closure forever; refs always read the current value.
  const viewRef=useRef(view);
  const selectedIdRef=useRef(selectedId);
  const formDirtyRef=useRef(false);
  useEffect(()=>{viewRef.current=view;},[view]);
  useEffect(()=>{selectedIdRef.current=selectedId;},[selectedId]);
  // Resets whenever the form is freshly entered, so a leftover dirty flag
  // from a previous edit session doesn't wrongly warn on a form the person
  // hasn't touched yet.
  useEffect(()=>{if(view==="form")formDirtyRef.current=false;},[view]);
  useEffect(()=>{
    window.history.replaceState({jclView:view,jclSelectedId:selectedId},"");
    const onPopState=e=>{
      if(viewRef.current==="form"&&formDirtyRef.current){
        const leave=window.confirm("You have unsaved changes. Are you sure you want to leave without saving?");
        if(!leave){
          // Browser already moved back one step — push the form state
          // straight back on top to undo that, since the person chose to
          // stay. isPopStateNav prevents this push from being mistaken
          // for a real navigation by the effect below.
          isPopStateNav.current=true;
          window.history.pushState({jclView:"form",jclSelectedId:selectedIdRef.current},"");
          return;
        }
        formDirtyRef.current=false;
      }
      if(e.state&&"jclView" in e.state){
        isPopStateNav.current=true;
        setView(e.state.jclView);
        setSelectedId(e.state.jclSelectedId);
      }
    };
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(isPopStateNav.current){isPopStateNav.current=false;return;}
    window.history.pushState({jclView:view,jclSelectedId:selectedId},"");
  },[view,selectedId]);
  const [branchFilter,setBranchFilter]=useState("all");
  const [agentFilter,setAgentFilter]=useState("all");
  const [stepFilter,setStepFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [fileUrls,setFileUrls]=useState({});

  useEffect(()=>{loadData(JCL_KEY).then(d=>{setApps(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);

  // Keeps the displayed list current without needing a manual refresh —
  // complements the re-fetch-before-save fix in save()/deleteApp() below,
  // which is what actually prevents data loss; this just keeps what's
  // shown on screen from drifting stale in the meantime.
  useEffect(()=>{
    const channel=supabase.channel("jcl-applications-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_storage",filter:`key=eq.${JCL_KEY}`},()=>{
        loadData(JCL_KEY).then(d=>{if(Array.isArray(d))setApps(d);});
      })
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[]);

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
    // Re-fetch the latest data right before merging, rather than trusting
    // local React state — apps only loads once on page open with no live
    // sync, so a page left open for a while (very common for admin,
    // reviewing many applications) would have a stale copy that's missing
    // anything submitted by any branch since. Building the saved array
    // from that stale copy would silently overwrite and permanently erase
    // those in-between submissions — exactly the "new application keeps
    // going missing" symptom, since a fresh submission is the most likely
    // thing NOT yet in anyone else's stale local copy.
    const latest=(await loadData(JCL_KEY))||apps;
    const prevApp=latest.find(a=>a.id===updated.id);
    // Only fires the moment an application actually TRANSITIONS into
    // Rejected — not on every subsequent edit/save of an application that
    // was already sitting at step 5, which would otherwise create a fresh
    // Chailease duplicate every single time.
    const isFreshRejection=updated.step===5&&prevApp?.step!==5;
    const next=[...latest.filter(a=>a.id!==updated.id),updated].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
    setApps(next);
    const result=await saveData(JCL_KEY,next);
    if(!result.ok){
      // The database write actually failed — revert the optimistic update
      // so the screen doesn't keep showing a "successful" state that was
      // never really saved, and tell the person clearly so they know to
      // retry rather than assuming it went through.
      setApps(latest);
      alert("This didn't save — please check your connection and try again. If it keeps happening, let admin know.");
      return false;
    }
    if(isFreshRejection){
      const chaileaseApps=(await loadData(CHAILEASE_KEY))||[];
      const newId=`chailease_${Date.now()}`;
      // Full spread carries over every customer/device/employment/emergency-
      // contact field and every already-uploaded document, so the customer
      // doesn't have to redo any of that for the fallback application —
      // only the status-specific fields get reset to start a clean pipeline.
      const newApp={
        ...updated,
        id:newId,merchant:"Chailease",step:1,
        submittedAt:nowDate(),submittedTime:nowTime(),
        submittedToChaileaseDate:null,followUpRemark:null,followUpRequestedDate:null,
        followUpResponseFiles:[],followUpRespondedDate:null,
        approvedDate:null,approvedRemark:null,rejectedDate:null,rejectedRemark:null,
        linkedOrderId:null,
        // Snapshot (not a live lookup) of the originating JCL application's
        // full history, so the Chailease detail page can show one
        // continuous timeline spanning both applications - JCL New
        // Application through JCL Rejected, then straight into this
        // Chailease application's own steps. Snapshotting rather than
        // referencing keeps this working even if the original JCL
        // application is later edited or deleted.
        sourceJclId:updated.id,
        jclHistory:updated.history||[],
        history:[{step:1,date:nowDate(),time:nowTime(),note:`New Application auto-created after rejection by JCL`}],
      };
      const chaileaseResult=await saveData(CHAILEASE_KEY,[...chaileaseApps,newApp]);
      if(!chaileaseResult.ok)alert("The rejection was saved, but the automatic Chailease application couldn't be created — please create it manually.");
    }
  };

  const deleteApp=async(id)=>{
    if(!window.confirm("Delete this application permanently? This cannot be undone."))return;
    const latest=(await loadData(JCL_KEY))||apps;
    const next=latest.filter(a=>a.id!==id);
    setApps(next);
    const result=await saveData(JCL_KEY,next);
    if(!result.ok){
      setApps(latest);
      alert("This didn't delete — please check your connection and try again.");
      return;
    }
    setView("list");setSelectedId(null);
  };

  const deleteRejectedBulk=async(ids)=>{
    if(!ids.length)return;
    if(!window.confirm(`Permanently delete ${ids.length} rejected application(s)? This cannot be undone.`))return;
    const idSet=new Set(ids);
    const latest=(await loadData(JCL_KEY))||apps;
    const next=latest.filter(a=>!idSet.has(a.id));
    setApps(next);
    const result=await saveData(JCL_KEY,next);
    if(!result.ok){
      setApps(latest);
      alert("This didn't delete — please check your connection and try again.");
      return;
    }
    setRejectedSel(prev=>{const n=new Set(prev);ids.forEach(id=>n.delete(id));return n;});
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
      agreementNumber:app.agreementNumber,aeonApprovalDate:app.merchantApprovalDate,
      agreementFee:app.agreementFee,stampingFee:app.stampingFee,deposit:app.deposit,
      monthlyInstallment:app.monthlyInstallment,tenure:app.tenure,jclDocuments:app.jclDocuments,
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
  const needsAmendment=useMemo(()=>userBranch?apps.filter(a=>a.branch===userBranch&&a.step===1&&a.amendmentRequestedDate&&!a.amendmentRespondedDate):[],[apps,userBranch]);

  // Alert — admin hasn't submitted to JCL within 1 day of the branch's New
  // Application. Clears itself the moment it actually gets submitted
  // (step moves to 2), so it only ever nags about the ones still sitting.
  const overdueSubmissions=useMemo(()=>isAdmin?apps.filter(a=>a.step===1&&daysSince(a.submittedAt)>=1):[],[apps,isAdmin]);

  const selectedApp=useMemo(()=>apps.find(a=>a.id===selectedId)||null,[apps,selectedId]);

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.textLight,fontSize:13}}>Loading…</div>;

  if(view==="form")return<ApplicationForm branchMeta={branchMeta} userBranch={userBranch} isAdmin={isAdmin} srList={srList} editingApp={editingApp}
    onDirtyChange={d=>{formDirtyRef.current=d;}}
    onSaved={async(app)=>{const ok=await save(app);if(ok!==false){formDirtyRef.current=false;setView("detail");setSelectedId(app.id);setEditingApp(null);}}}
    onCancel={()=>{setView(editingApp?"detail":"list");setEditingApp(null);}}/>;

  const canEditDelete=["sophiawsc9395@gmail.com","boontheng2004@gmail.com"].includes((email||"").toLowerCase());
  const canBulkDelete=["sophiawsc9395@gmail.com","boontheng2004@gmail.com","emaxjcl@gmail.com"].includes((email||"").toLowerCase());

  if(view==="detail"&&selectedApp)return<ApplicationDetail app={selectedApp} branchMeta={branchMeta} isAdmin={isAdmin} canEditDelete={canEditDelete} canDelete={canEditDelete} fileUrls={fileUrls}
    onBack={()=>{setView("list");setSelectedId(null);}}
    onSaved={save}
    onDelete={()=>deleteApp(selectedApp.id)}
    onEdit={()=>{setEditingApp(selectedApp);setView("form");}}
    onCreateOrder={createOrderFromApp}/>;

  return<div>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:17,fontWeight:800,color:C.navy}}>JCL Application</div>
      <div style={{fontSize:11,color:C.textLight,marginTop:2}}>Customer financing applications submitted to JCL</div>
    </div>
    {overdueSubmissions.length>0&&<div style={{...card,borderLeft:"3px solid #DC2626",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
        <span style={{color:"#DC2626",flexShrink:0}}>{Ic.alertCircle}</span>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Not Yet Submitted to JCL</span>
        <span style={{fontSize:10,fontWeight:700,color:"#DC2626",background:"#DC262615",padding:"1px 8px",borderRadius:20}}>{overdueSubmissions.length}</span>
      </div>
      {overdueSubmissions.map((a,i)=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{display:"flex",flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 4px",borderTop:i>0?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
        <div style={{minWidth:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text}}>{a.customerName}</div>
          <div style={{fontSize:11,color:C.textLight}}>{branchMeta[a.branch]?.name||a.branch}</div>
        </div>
        <span style={{fontSize:11,color:"#DC2626",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Submitted {daysSince(a.submittedAt)} day{daysSince(a.submittedAt)>1?"s":""} ago</span>
      </div>)}
    </div>}

    {canBulkDelete&&(()=>{
      const rejectedApps=apps.filter(a=>a.step===5);
      if(!rejectedApps.length)return null;
      const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
      const groups={};
      rejectedApps.forEach(a=>{
        const key=(a.rejectedDate||"").slice(0,7)||"unknown";
        if(!groups[key])groups[key]={key,apps:[]};
        groups[key].apps.push(a);
      });
      const months=Object.values(groups).sort((a,b)=>{
        if(a.key==="unknown")return 1;
        if(b.key==="unknown")return-1;
        return b.key.localeCompare(a.key);
      });
      const monthLabel=(key)=>{
        if(key==="unknown")return"Date Unknown";
        const[y,m]=key.split("-");
        return`${MONTH_NAMES[parseInt(m,10)-1]} ${y}`;
      };
      const selectedApps=rejectedApps.filter(a=>rejectedSel.has(a.id));
      return<div style={{...card,marginBottom:14}}>
        <div style={{padding:"11px 16px",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontSize:11,fontWeight:700,color:"#fff",textTransform:"uppercase",letterSpacing:"0.07em"}}>
          Rejected Applications by Month ({rejectedApps.length})
        </div>
        <div style={{padding:"10px 14px"}}>
          {months.map(mo=>{
            const allSelected=mo.apps.length>0&&mo.apps.every(a=>rejectedSel.has(a.id));
            return<div key={mo.key} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 2px",borderBottom:`1px solid ${C.border}`,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:C.navy}}>{monthLabel(mo.key)} <span style={{fontWeight:400,color:C.textLight}}>({mo.apps.length})</span></span>
                <button onClick={()=>setRejectedSel(prev=>{
                  const n=new Set(prev);
                  if(allSelected)mo.apps.forEach(a=>n.delete(a.id));
                  else mo.apps.forEach(a=>n.add(a.id));
                  return n;
                })} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{allSelected?"Deselect Month":"Select Month"}</button>
              </div>
              {mo.apps.map(a=><div key={a.id} onClick={()=>setRejectedSel(prev=>{const n=new Set(prev);n.has(a.id)?n.delete(a.id):n.add(a.id);return n;})} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:8,background:rejectedSel.has(a.id)?"#FEF2F2":C.surface,border:`1px solid ${rejectedSel.has(a.id)?"#FECACA":C.border}`,marginBottom:7,cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:4,background:rejectedSel.has(a.id)?"#DC2626":"#fff",border:`2px solid ${rejectedSel.has(a.id)?"#DC2626":"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#fff"}}>{rejectedSel.has(a.id)&&Ic.check}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text}}>{a.customerName} <span style={{fontWeight:400,color:C.textLight}}>· {branchMeta[a.branch]?.name||a.branch}</span></div>
                  <div style={{fontSize:10,color:C.textLight}}>{a.phoneModel} · Rejected {fDate(a.rejectedDate)}</div>
                </div>
              </div>)}
            </div>;
          })}
        </div>
        <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}}>
          <DBtnLocal onClick={()=>deleteRejectedBulk([...rejectedSel])} disabled={!selectedApps.length}>{Ic.trash} Delete Selected {selectedApps.length>0?`(${selectedApps.length})`:""}</DBtnLocal>
        </div>
      </div>;
    })()}

    {needsBranchAction.length>0&&<div style={{...card,borderLeft:"3px solid #B45309",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
        <span style={{color:"#B45309",flexShrink:0}}>{Ic.alertCircle}</span>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Follow-Up Needed From You</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B45309",background:"#B4530915",padding:"1px 8px",borderRadius:20}}>{needsBranchAction.length}</span>
      </div>
      {needsBranchAction.map((a,i)=><div key={a.id} style={{borderTop:i>0?`1px solid ${C.border}`:"none",padding:"8px 4px"}}>
        <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>{a.customerName} · {a.phoneModel}</div>
        <FollowUpResponseBox app={a} onSaved={save}/>
      </div>)}
    </div>}

    {needsAmendment.length>0&&<div style={{...card,borderLeft:"3px solid #B91C1C",padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
        <span style={{color:"#B91C1C",flexShrink:0}}>{Ic.alertCircle}</span>
        <span style={{fontSize:11,fontWeight:700,color:C.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>Amendment Needed From You</span>
        <span style={{fontSize:10,fontWeight:700,color:"#B91C1C",background:"#B91C1C15",padding:"1px 8px",borderRadius:20}}>{needsAmendment.length}</span>
      </div>
      {needsAmendment.map((a,i)=><div key={a.id} onClick={()=>{setView("detail");setSelectedId(a.id);}} style={{display:"flex",flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 4px",borderTop:i>0?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
        <div style={{minWidth:0,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text}}>{a.customerName}</div>
          <div style={{fontSize:11,color:C.textLight}}>{a.phoneModel} · {branchMeta[a.branch]?.name||a.branch}</div>
        </div>
        <span style={{fontSize:11,color:"#B91C1C",fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{a.amendmentRemark}</span>
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
            <StepBadge app={a} step={a.step}/>
          </div>
        </div>)}</div>}
    </div>
  </div>;
}
