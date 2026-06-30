# EMAX NETWORK — Sales Performance Dashboard

## Project Structure

```
emax-dashboard/
├── index.html                  ← Admin dashboard
├── boss.html                   ← Boss viewer (all branches)
├── branch-KM.html              ← EMAX Kota Marudu viewer
├── branch-T1.html              ← EMAX Tuaran viewer
├── branch-TW2.html             ← EMAX Tawau 2 viewer
├── branch-TW1.html             ← EMAX Tawau 1 viewer
├── branch-LD.html              ← EMAX Lahad Datu viewer
├── branch-KB.html              ← EMAX Kota Belud viewer
├── branch-T5.html              ← EMAX CKS viewer
├── branch-ITCC.html            ← EMAX ITCC viewer
├── branch-TENOM.html           ← EMAX Tenom viewer
├── branch-HQ.html              ← EMAX HQ viewer
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                ← Admin app entry
    ├── boss-main.jsx           ← Boss viewer entry
    ├── branch-KM-main.jsx      ← Branch entry points...
    ├── App.jsx                 ← Main admin dashboard
    ├── storage/
    │   └── index.js            ← localStorage adapter
    └── pages/
        └── viewers/
            ├── BossViewer.jsx
            ├── BranchKMViewer.jsx
            ├── BranchT1Viewer.jsx
            └── ... (all 10 branches)
```

## Quick Start

```bash
npm install
npm run dev
```

Then open:
- `http://localhost:5173/` — Admin dashboard
- `http://localhost:5173/boss.html` — Boss viewer (all branches)
- `http://localhost:5173/branch-KM.html` — Kota Marudu viewer
- `http://localhost:5173/branch-T1.html` — Tuaran viewer
- (etc. for all branches)

## Build for Production

```bash
npm run build
```

Output goes to `dist/`. Deploy the entire `dist/` folder to any static host.

## Deploy Options

### Netlify (recommended — free)
1. Run `npm run build`
2. Drag the `dist/` folder to https://app.netlify.com/drop
3. Each HTML file becomes a separate URL automatically

### Vercel
```bash
npm install -g vercel
vercel
```

### Nginx / Apache
Copy `dist/` contents to your web root. All routes are static files — no server config needed.

## Data Storage

All data is stored in **localStorage** in the browser. This means:
- Data is stored per-browser on the device where the admin runs the dashboard
- Viewer links read from the **same browser's localStorage** — so viewers must be opened on the same device, OR you switch to a backend (see below)

## Upgrading to a Shared Backend

To share data across devices, replace `src/storage/index.js` with a backend adapter.

### Supabase example:
```js
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const storage = {
  async get(key) {
    const { data } = await supabase.from('storage').select('value').eq('key', key).single()
    return data ? { key, value: data.value } : null
  },
  async set(key, value) {
    await supabase.from('storage').upsert({ key, value })
    return { key, value }
  }
}
```

Create a table in Supabase:
```sql
create table storage (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
alter table storage enable row level security;
create policy "public read" on storage for select using (true);
create policy "public write" on storage for all using (true);
```

## URL Summary (after deploy)

| Link | Who uses it |
|------|------------|
| `/` | Admin (upload, edit, all features) |
| `/boss.html` | Director / CEO — all branches |
| `/branch-KM.html` | Kota Marudu BM & SR |
| `/branch-T1.html` | Tuaran BM & SR |
| `/branch-TW2.html` | Tawau 2 BM & SR |
| `/branch-TW1.html` | Tawau 1 BM & SR |
| `/branch-LD.html` | Lahad Datu BM & SR |
| `/branch-KB.html` | Kota Belud BM & SR |
| `/branch-T5.html` | CKS BM & SR |
| `/branch-ITCC.html` | ITCC BM & SR |
| `/branch-TENOM.html` | Tenom BM & SR |
| `/branch-HQ.html` | HQ BM & SR |
