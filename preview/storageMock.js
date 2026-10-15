/**
 * In-memory stand-in for src/storage/index.js, used ONLY by the standalone
 * preview bundle (preview/attendance-real-preview.jsx). The real
 * AttendanceTab.jsx is imported UNMODIFIED — this file is swapped in for
 * its `./storage/index.js` import by the preview's esbuild plugin
 * (preview/build-real-preview.mjs), so there's no live Supabase call and
 * no need for real env vars, but the component's own logic is 100% real.
 *
 * Pre-seeded with realistic sample data so every role view has something
 * to look at immediately: October 2026 attendance across every leave type
 * (including half-day AL/UPL), a couple of late/early-out days, one of the
 * three outlets with manually-added staff, and HQ left with NO attendance
 * entries and NO extra staff (its roster is manual-add-only per Sophia's
 * request — this demonstrates the empty state).
 */
const store = {};

// ── October 2026 attendance (emax_v5_attendance_2026_10) ────────────────
// Person ids match the real id shapes used elsewhere in the app:
//   Branch Manager -> BM_<branchCode>
//   Sales Rep      -> the SR's real id from DEFAULT_SR (e.g. EM0199)
//   Attendance-only extra staff -> extra_<branch>_<timestamp>
store["emax_v5_attendance_2026_10"] = {
  // T5 branch manager (SUHAIDI) — a mix of on-time, late, and one leave day.
  BM_T5: {
    1: { in: "09:28", out: "18:35" },
    2: { in: "09:52", out: "18:30" }, // late (>10 min grace)
    3: { in: "09:31", out: "18:00" }, // early out
    6: { leave: "AL" },
  },
  // ITCC — same person (SUHAIDI) also manages ITCC — separate record here,
  // demonstrating "Also manages" while keeping per-branch attendance.
  BM_ITCC: {
    1: { in: "09:31", out: "18:31" },
    2: { in: "09:35", out: "18:29" },
  },
  // T5 SR — issues building toward a payout drop.
  EM0199: {
    1: { in: "09:35", out: "18:32" },
    2: { in: "09:51", out: "18:40" }, // issue #1
    3: { in: "10:05", out: "18:15" }, // issue #2 (late + early out, still 1 issue)
    4: { in: "09:59", out: "18:33" }, // issue #3 -> 0% payout
  },
  EM0306: {
    1: { in: "09:29", out: "18:31" },
    5: { leave: "AH" },  // half-day Annual Leave
    6: { leave: "OFF" },
  },
  // Kota Marudu SR — sick leave + replacement leave + a public holiday.
  EM0285: {
    1: { in: "09:30", out: "18:30" },
    7: { leave: "SL" },
    8: { leave: "PH" },
  },
  EM0264: {
    1: { in: "09:41", out: "18:31" }, // issue (late)
    9: { leave: "RL" },
  },
  // Tuaran 1 SR — half-day Unpaid Leave.
  EM0033: {
    1: { in: "09:20", out: "18:20" }, // issue (early out)
    10: { leave: "UH" }, // half-day Unpaid Leave
  },
  EM0045: {
    2: { leave: "UL" }, // full-day Unpaid Leave
  },
};

// Deactivated extra-staff members also get an attendance record so the
// "deactivated but keeps history" case and the "deactivated with nothing
// this month" case are both demonstrable (see extra_staff below).
store["emax_v5_attendance_2026_10"]["extra_DOJO_1003"] = {
  1: { in: "10:02", out: "19:05" }, // late — still shows up under the deactivated staff's own history this month
  2: { in: "09:58", out: "19:00" },
};

// ── Attendance-only staff added via "Add Staff" (emax_v5_attendance_extra_staff) ──
// Dojo Papar (one of the 3 outlets) has staff added directly on the
// Attendance page — never in srList/branchMeta. HQ deliberately has NONE
// (manual-add-only, starts empty).
store["emax_v5_attendance_extra_staff"] = {
  DOJO: [
    // Active — demonstrates the Edit (pencil icon) flow on an attendance-only staff member.
    { id: "extra_DOJO_1001", name: "AIDIL HAKIM", role: "Instructor", branch: "DOJO", active: true },
    { id: "extra_DOJO_1002", name: "NURSYAFIQAH", role: "Front Desk", branch: "DOJO", active: true },
    // Deactivated, but HAS October data above — shows the "Show inactive
    // staff" toggle isn't needed just to review a month where they were
    // still active; their recorded days stay intact either way.
    { id: "extra_DOJO_1003", name: "ROSLI JEFFRY", role: "Instructor", branch: "DOJO", active: false },
    // Deactivated AND no attendance data at all this month — hidden by
    // default, only appears with "Show inactive staff" ticked on.
    { id: "extra_DOJO_1004", name: "WAN AZURA", role: "Front Desk", branch: "DOJO", active: false },
  ],
};

// Business hours (emax_v5_business_hours) — T5 pre-set slightly off the
// 09:30–18:30 default (opens/closes 30 min earlier) AND already has October
// attendance recorded above (BM_T5, EM0199, EM0306) — editing T5's hours
// here and saving will trigger the "this re-evaluates already-recorded
// days" warning. Every other branch stays on the default.
store["emax_v5_business_hours"] = {
  T5: { start: "09:00", end: "18:00" },
};

export async function loadData(key) {
  await new Promise(r => setTimeout(r, 120)); // small delay so loading states are visible
  return Object.prototype.hasOwnProperty.call(store, key) ? JSON.parse(JSON.stringify(store[key])) : null;
}

export async function saveData(key, value) {
  await new Promise(r => setTimeout(r, 80));
  if (value === null || value === undefined) { delete store[key]; return { ok: true }; }
  store[key] = JSON.parse(JSON.stringify(value));
  return { ok: true };
}

// Not used by AttendanceTab.jsx, but exported for parity in case anything
// else pulled in during bundling expects it.
export const supabase = null;
