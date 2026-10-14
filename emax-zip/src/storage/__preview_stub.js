// Stub replacing src/storage/index.js for the preview build — no network,
// returns realistic sample data so the Attendance UI renders with content.
const SAMPLE_HOURS = { TW1: { start: "09:30", end: "18:30" } };
const SAMPLE_EXTRA = {};
const SAMPLE_ATTENDANCE = {
  "BM_TW1": { // branch manager sample — 1 late day this month = 80% payout
    1: { in: "09:35", out: "18:30" },
    2: { in: "09:50", out: "18:25" }, // late by 10min+ -> issue
    3: { leave: "AL" },
    4: { in: "09:28", out: "18:30" },
  },
  "SR_SAMPLE_1": { // 0 issues -> 100%
    1: { in: "09:25", out: "18:30" },
    2: { in: "09:29", out: "18:31" },
    3: { in: "09:20", out: "18:35" },
  },
  "SR_SAMPLE_2": { // 3 issues -> 0%
    1: { in: "10:05", out: "18:20" },
    2: { in: "10:15", out: "18:00" },
    3: { in: "09:50", out: "17:50" },
    4: { in: "09:25", out: "18:30" },
  },
};
export async function loadData(key) {
  if (key === "emax_v5_business_hours") return SAMPLE_HOURS;
  if (key === "emax_v5_attendance_extra_staff") return SAMPLE_EXTRA;
  if (key.startsWith("emax_v5_attendance_")) return SAMPLE_ATTENDANCE;
  return null;
}
export async function saveData(key, value) { return { ok: true }; }
export const supabase = {};
export const storage = { async get(){return null;}, async set(){}, async delete(){}, async list(){return {keys:[]};} };
