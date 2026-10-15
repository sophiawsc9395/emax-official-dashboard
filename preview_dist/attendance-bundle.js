(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // preview/attendance-preview.jsx
  var import_react = __require("react");
  var import_react_dom = __toESM(__require("react-dom"), 1);
  var C = { navy: "#0A1628", navyLight: "#162B52", blue: "#1B3F72", blueBright: "#2C5AA0", white: "#fff", surface: "#F7F9FC", border: "#E4EAF2", text: "#0A1628", textMid: "#4A5568", textLight: "#8A96A8", green: "#15803D", amber: "#B45309", red: "#DC2626" };
  var card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(10,22,40,.06),0 4px 12px rgba(10,22,40,.04)", overflow: "hidden" };
  var L = ({ children, req }) => /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: 11, fontWeight: 600, color: C.textMid, marginBottom: 4 } }, children, req && /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, " *"));
  var I = (props) => /* @__PURE__ */ React.createElement("input", { ...props, style: { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "Inter,sans-serif", boxSizing: "border-box", ...props.style || {} } });
  var SEL = (props) => /* @__PURE__ */ React.createElement("select", { ...props, style: { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "Inter,sans-serif", background: "#fff", boxSizing: "border-box", ...props.style || {} } });
  var PBtn = ({ children, disabled, ...p }) => /* @__PURE__ */ React.createElement("button", { disabled, ...p, style: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", background: disabled ? "#E4EAF2" : `linear-gradient(135deg,${C.blue},${C.blueBright})`, color: disabled ? C.textLight : "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: disabled ? "default" : "pointer", fontFamily: "Inter,sans-serif", ...p.style || {} } }, children);
  var GBtn = ({ children, ...p }) => /* @__PURE__ */ React.createElement("button", { ...p, style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "transparent", color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter,sans-serif", ...p.style || {} } }, children);
  var SecHdr = ({ icon, children }) => /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 7, padding: "11px 16px", background: `linear-gradient(135deg,${C.navy},${C.navyLight})`, fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.07em" } }, icon && /* @__PURE__ */ React.createElement("span", { style: { color: "rgba(255,255,255,.85)" } }, icon), children);
  var Ic = {
    clock: /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("polyline", { points: "12 6 12 12 16 14" })),
    cog: /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })),
    users: /* @__PURE__ */ React.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "7", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }), /* @__PURE__ */ React.createElement("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })),
    chevL: /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "15 18 9 12 15 6" })),
    check: /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "20 6 9 17 4 12" }))
  };
  var BRANCHES = ["KM", "T1", "TW2", "TW1", "LD", "KB", "T5", "ITCC", "TENOM"];
  var BRANCH_META = {
    KM: { name: "EMAX Kota Marudu", manager: "SUHAINIZAM" },
    T1: { name: "EMAX Tuaran 1", manager: "REX WENMIN" },
    TW2: { name: "EMAX Tawau 2", manager: "TONY YONG" },
    TW1: { name: "EMAX Tawau 1", manager: "MAX SIEW" },
    LD: { name: "EMAX Lahad Datu", manager: "SHAHRUL" },
    KB: { name: "EMAX Kota Belud", manager: "MAHADI" },
    T5: { name: "EMAX CKS", manager: "SUHAIDI" },
    ITCC: { name: "EMAX ITCC", manager: "SUHAIDI" },
    TENOM: { name: "EMAX Tenom", manager: "AZIQIL" }
  };
  var MOCK_SR = [
    { id: "sr_km1", canon: "NURUL AIN", type: "Online", branch: "KM" },
    { id: "sr_km2", canon: "FARID AZMI", type: "Offline", branch: "KM" },
    { id: "sr_t11", canon: "CHONG WEI LIANG", type: "Online", branch: "T1" },
    { id: "sr_tw21", canon: "SITI NORAIN", type: "Offline", branch: "TW2" },
    { id: "sr_ld1", canon: "AZMAN JAAFAR", type: "Online", branch: "LD" }
  ];
  function rosterFor(branch) {
    const people = [{ id: `BM_${branch}`, name: BRANCH_META[branch].manager, role: "Branch Manager", branch }];
    MOCK_SR.filter((sr) => sr.branch === branch).forEach((sr) => people.push({ id: sr.id, name: sr.canon, role: `${sr.type} SR`, branch }));
    return people;
  }
  var ALL_PEOPLE = BRANCHES.flatMap(rosterFor);
  var [FIRST_YEAR, FIRST_MONTH] = [2026, 10];
  var MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  var minutesOf = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  var fmtMinutes = (n) => {
    const h = Math.floor(n / 60), m = n % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  function seedAttendance() {
    const rec = {};
    ALL_PEOPLE.forEach((p) => {
      rec[p.id] = {};
    });
    const set = (id, day, inT, outT) => {
      rec[id][day] = { in: inT, out: outT };
    };
    set(`BM_KM`, 1, "09:28", "18:35");
    set(`BM_KM`, 2, "09:52", "18:30");
    set(`BM_KM`, 3, "09:31", "18:00");
    set("sr_km1", 1, "09:35", "18:32");
    set("sr_km1", 2, "09:51", "18:40");
    set("sr_km1", 3, "10:05", "18:31");
    set("sr_km1", 4, "09:59", "18:33");
    set("sr_km2", 1, "09:29", "18:31");
    set("sr_t11", 1, "09:30", "18:30");
    set("sr_t11", 2, "09:41", "18:31");
    set("sr_tw21", 1, "09:20", "18:29");
    return rec;
  }
  var seedBusinessHours = () => Object.fromEntries(BRANCHES.map((b) => [b, { start: "09:30", end: "18:30" }]));
  var GRACE_MINUTES = 10;
  function dayStatus(entry, hours) {
    if (!entry || !entry.in) return { filled: false };
    const inM = minutesOf(entry.in), startM = minutesOf(hours.start), endM = minutesOf(hours.end);
    const lateBy = inM - startM;
    const isLate = lateBy > GRACE_MINUTES;
    const outM = entry.out ? minutesOf(entry.out) : null;
    const isEarlyOut = outM !== null && outM < endM;
    return { filled: true, isLate, lateBy: isLate ? lateBy : 0, isEarlyOut, earlyBy: isEarlyOut ? endM - outM : 0 };
  }
  function monthLateCount(personId, attendance, hours, year, month) {
    const days = daysInMonth(year, month);
    let count = 0;
    for (let d = 1; d <= days; d++) {
      const st = dayStatus(attendance[personId]?.[d], hours);
      if (st.filled && st.isLate) count++;
    }
    return count;
  }
  function payoutPctFor(lateCount) {
    if (lateCount >= 3) return 0;
    if (lateCount === 2) return 50;
    if (lateCount === 1) return 80;
    return 100;
  }
  var payoutColor = (pct) => pct === 100 ? C.green : pct === 80 ? C.amber : pct === 50 ? "#C2410C" : C.red;
  function DayEditModal({ person, day, monthLabel, entry, hours, onSave, onClose }) {
    const [inT, setInT] = (0, import_react.useState)(entry?.in || "");
    const [outT, setOutT] = (0, import_react.useState)(entry?.out || "");
    const preview = dayStatus({ in: inT, out: outT }, hours);
    return /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(10,22,40,.65)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { ...card, width: "90%", maxWidth: 380 } }, /* @__PURE__ */ React.createElement("div", { style: { background: `linear-gradient(135deg,${C.navy},${C.navyLight})`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 800, fontSize: 13, color: "#fff" } }, person.name, " \xB7 Day ", day, ", ", monthLabel), /* @__PURE__ */ React.createElement("button", { onClick: onClose, style: { background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.7)", borderRadius: 7, padding: "4px 10px", cursor: "pointer" } }, "\xD7")), /* @__PURE__ */ React.createElement("div", { style: { padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(L, { req: true }, "Clock In"), /* @__PURE__ */ React.createElement(I, { type: "time", value: inT, onChange: (e) => setInT(e.target.value) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(L, null, "Clock Out"), /* @__PURE__ */ React.createElement(I, { type: "time", value: outT, onChange: (e) => setOutT(e.target.value) }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.textLight, marginBottom: 12 } }, "Business Hours: ", hours.start, " \u2013 ", hours.end, " \xB7 grace ", GRACE_MINUTES, " min"), preview.filled && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 } }, preview.isLate ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: C.red, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 10px" } }, "Late by ", fmtMinutes(preview.lateBy)) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: C.green, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, padding: "6px 10px" } }, "On time"), preview.isEarlyOut && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: C.amber, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, padding: "6px 10px" } }, "Early Out by ", fmtMinutes(preview.earlyBy))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(PBtn, { disabled: !inT, onClick: () => {
      onSave(day, { in: inT, out: outT || null });
      onClose();
    }, style: { flex: 1 } }, Ic.check, " Save"), /* @__PURE__ */ React.createElement(GBtn, { onClick: onClose }, "Cancel")))));
  }
  function HRFillInView({ year, month, attendance, setAttendance, hours }) {
    const [branch, setBranch] = (0, import_react.useState)(BRANCHES[0]);
    const [editing, setEditing] = (0, import_react.useState)(null);
    const roster = rosterFor(branch);
    const days = daysInMonth(year, month);
    const dayList = Array.from({ length: days }, (_, i) => i + 1);
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;
    const branchHours = hours[branch];
    const saveDay = (personId, day, entry) => {
      setAttendance((prev) => ({ ...prev, [personId]: { ...prev[personId] || {}, [day]: entry } }));
    };
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { minWidth: 180 } }, /* @__PURE__ */ React.createElement(L, null, "Branch"), /* @__PURE__ */ React.createElement(SEL, { value: branch, onChange: (e) => setBranch(e.target.value) }, BRANCHES.map((b) => /* @__PURE__ */ React.createElement("option", { key: b, value: b }, BRANCH_META[b].name)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.textLight, paddingBottom: 9 } }, "Business Hours: ", /* @__PURE__ */ React.createElement("b", { style: { color: C.text } }, branchHours.start, " \u2013 ", branchHours.end), " (edited by Sophia)")), roster.map((person) => {
      const lateCount = monthLateCount(person.id, attendance, branchHours, year, month);
      const pct = payoutPctFor(lateCount);
      return /* @__PURE__ */ React.createElement("div", { key: person.id, style: { ...card, marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: `1px solid ${C.border}` } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 13, color: C.text } }, person.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: C.textLight } }, person.role)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: C.textLight } }, lateCount, " late this month"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 800, color: payoutColor(pct), background: payoutColor(pct) + "15", padding: "3px 10px", borderRadius: 20 } }, pct, "% payout"))), /* @__PURE__ */ React.createElement("div", { style: { padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 6 } }, dayList.map((d) => {
        const entry = attendance[person.id]?.[d];
        const st = dayStatus(entry, branchHours);
        const bg = !st.filled ? C.surface : st.isLate ? "#FEF2F2" : "#F0FDF4";
        const bd = !st.filled ? C.border : st.isLate ? "#FECACA" : "#BBF7D0";
        const fg = !st.filled ? C.textLight : st.isLate ? C.red : C.green;
        return /* @__PURE__ */ React.createElement("button", { key: d, onClick: () => setEditing({ person, day: d }), title: st.filled ? `${entry.in} \u2013 ${entry.out || "\u2014"}` : "Not filled", style: { width: 34, height: 34, borderRadius: 7, border: `1px solid ${bd}`, background: bg, color: fg, fontSize: 10.5, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" } }, d, st.filled && st.isEarlyOut && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", top: -4, right: -4, width: 8, height: 8, borderRadius: "50%", background: C.amber, border: "1.5px solid #fff" } }));
      })));
    }), editing && /* @__PURE__ */ React.createElement(
      DayEditModal,
      {
        person: editing.person,
        day: editing.day,
        monthLabel,
        entry: attendance[editing.person.id]?.[editing.day],
        hours: branchHours,
        onSave: (day, entry) => saveDay(editing.person.id, day, entry),
        onClose: () => setEditing(null)
      }
    ));
  }
  function BusinessHoursView({ hours, setHours }) {
    const [draft, setDraft] = (0, import_react.useState)(hours);
    const dirty = JSON.stringify(draft) !== JSON.stringify(hours);
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.textMid, marginBottom: 14 } }, "Clock-in and clock-out are checked against each branch's own Business Hours below. Lateness and Early Out are both computed from these times."), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12, marginBottom: 16 } }, BRANCHES.map((b) => /* @__PURE__ */ React.createElement("div", { key: b, style: { ...card, padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 12.5, color: C.text, marginBottom: 10 } }, BRANCH_META[b].name), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(L, null, "Clock In"), /* @__PURE__ */ React.createElement(I, { type: "time", value: draft[b].start, onChange: (e) => setDraft((p) => ({ ...p, [b]: { ...p[b], start: e.target.value } })) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(L, null, "Clock Out"), /* @__PURE__ */ React.createElement(I, { type: "time", value: draft[b].end, onChange: (e) => setDraft((p) => ({ ...p, [b]: { ...p[b], end: e.target.value } })) })))))), /* @__PURE__ */ React.createElement(PBtn, { disabled: !dirty, onClick: () => setHours(draft) }, Ic.check, " Save Business Hours"));
  }
  function BranchView({ year, month, attendance, hours }) {
    const [branch, setBranch] = (0, import_react.useState)(BRANCHES[0]);
    const roster = rosterFor(branch);
    const branchHours = hours[branch];
    const days = daysInMonth(year, month);
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.textLight, marginBottom: 12, fontStyle: "italic" } }, "Preview note: in the real page, a branch account only ever sees its own branch \u2014 the selector below is just so you can click through every branch here."), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 240, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(L, null, "Branch (preview only)"), /* @__PURE__ */ React.createElement(SEL, { value: branch, onChange: (e) => setBranch(e.target.value) }, BRANCHES.map((b) => /* @__PURE__ */ React.createElement("option", { key: b, value: b }, BRANCH_META[b].name)))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 } }, roster.map((person) => {
      let present = 0, late = 0, earlyOut = 0, notFilled = 0;
      for (let d = 1; d <= days; d++) {
        const st = dayStatus(attendance[person.id]?.[d], branchHours);
        if (!st.filled) {
          notFilled++;
          continue;
        }
        present++;
        if (st.isLate) late++;
        if (st.isEarlyOut) earlyOut++;
      }
      const pct = payoutPctFor(late);
      return /* @__PURE__ */ React.createElement("div", { key: person.id, style: { ...card, padding: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 14, color: C.text } }, person.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.textLight, marginBottom: 12 } }, person.role), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 26, fontWeight: 800, color: payoutColor(pct), lineHeight: 1 } }, pct, "%"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: C.textLight, marginBottom: 12 } }, "Commission Payout"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, fontSize: 11, color: C.textMid, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", null, "Present: ", /* @__PURE__ */ React.createElement("b", { style: { color: C.text } }, present)), /* @__PURE__ */ React.createElement("span", { style: { color: late > 0 ? C.red : C.textMid } }, "Late: ", /* @__PURE__ */ React.createElement("b", null, late)), /* @__PURE__ */ React.createElement("span", { style: { color: earlyOut > 0 ? C.amber : C.textMid } }, "Early Out: ", /* @__PURE__ */ React.createElement("b", null, earlyOut)), /* @__PURE__ */ React.createElement("span", null, "Not filled: ", /* @__PURE__ */ React.createElement("b", null, notFilled))));
    })));
  }
  function AttendancePreview() {
    const [roleView, setRoleView] = (0, import_react.useState)("hr");
    const [year, setYear] = (0, import_react.useState)(FIRST_YEAR);
    const [month, setMonth] = (0, import_react.useState)(FIRST_MONTH);
    const [attendance, setAttendance] = (0, import_react.useState)(seedAttendance);
    const [hours, setHours] = (0, import_react.useState)(seedBusinessHours);
    const monthOptions = [];
    for (let y = FIRST_YEAR; y <= FIRST_YEAR + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === FIRST_YEAR && m < FIRST_MONTH) continue;
        monthOptions.push({ y, m });
      }
    }
    return /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "Inter,-apple-system,sans-serif", background: C.surface, minHeight: "100vh", padding: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1100, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 19, fontWeight: 800, color: C.navy } }, "Attendance"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.textLight, marginTop: 2 } }, "PREVIEW \u2014 mock data only, nothing is saved")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: 4 } }, [["hr", "emaxhr"], ["sophia", "Sophia"], ["branch", "Branch"]].map(([k, label]) => /* @__PURE__ */ React.createElement("button", { key: k, onClick: () => setRoleView(k), style: { padding: "7px 14px", borderRadius: 6, border: "none", background: roleView === k ? C.navy : "transparent", color: roleView === k ? "#fff" : C.textMid, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,sans-serif" } }, "Preview as ", label)))), roleView === "hr" && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 14, maxWidth: 220 } }, /* @__PURE__ */ React.createElement(L, null, "Month"), /* @__PURE__ */ React.createElement(SEL, { value: `${year}-${month}`, onChange: (e) => {
      const [y, m] = e.target.value.split("-").map(Number);
      setYear(y);
      setMonth(m);
    } }, monthOptions.map((o) => /* @__PURE__ */ React.createElement("option", { key: `${o.y}-${o.m}`, value: `${o.y}-${o.m}` }, MONTH_NAMES[o.m], " ", o.y)))), /* @__PURE__ */ React.createElement("div", { style: { ...card, padding: 0, overflow: "hidden", marginBottom: 16 } }, /* @__PURE__ */ React.createElement(SecHdr, { icon: roleView === "hr" ? Ic.clock : roleView === "sophia" ? Ic.cog : Ic.users }, roleView === "hr" ? `Fill In Attendance \u2014 ${MONTH_NAMES[month]} ${year}` : roleView === "sophia" ? "Business Hours (per branch)" : "Branch View \u2014 Commission Payout"), /* @__PURE__ */ React.createElement("div", { style: { padding: 18 } }, roleView === "hr" && /* @__PURE__ */ React.createElement(HRFillInView, { year, month, attendance, setAttendance, hours }), roleView === "sophia" && /* @__PURE__ */ React.createElement(BusinessHoursView, { hours, setHours }), roleView === "branch" && /* @__PURE__ */ React.createElement(BranchView, { year, month, attendance, hours }))), /* @__PURE__ */ React.createElement("div", { style: { ...card, padding: 16, fontSize: 11.5, color: C.textMid, lineHeight: 1.6 } }, /* @__PURE__ */ React.createElement("b", { style: { color: C.text } }, "How payout is calculated:"), " for the month being viewed, count how many days a person clocked in more than ", GRACE_MINUTES, " minutes after Business Hours start. 0 late = 100% commission payout, 1st late = 80%, 2nd late = 50%, 3rd (or more) late = 0%. Data starts from October 2026 \u2014 nothing before that is tracked.")));
  }
  import_react_dom.default.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(AttendancePreview, null));
})();
