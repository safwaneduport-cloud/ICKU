import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssetMasters, createCategory, updateCategory, createSubCategory, updateSubCategory,
  createSite, updateSite, createBuilding, updateBuilding, addRooms, updateRoom,
  createVendor, updateVendor, createGlCode, updateGlCode, replaceBands,
  getAssetRoles, addAssetRole, removeAssetRole,
} from '../../api/assethub.api.js';
import { getUsers } from '../../api/users.api.js';
import { groupByDept } from '../../lib/orgGroups.js';

const ROLES = ['OPERATIONS', 'BRANCH_MANAGER', 'FINANCE_EXECUTIVE', 'FINANCE_MANAGER', 'CFO', 'ASSET_ADMIN'];
const ROLE_LABEL = {
  OPERATIONS: 'Operations Staff', BRANCH_MANAGER: 'Branch Manager / Warden',
  FINANCE_EXECUTIVE: 'Finance Executive', FINANCE_MANAGER: 'Finance Manager',
  CFO: 'CFO', ASSET_ADMIN: 'System Admin',
};

const SECTIONS = [
  ['categories', 'Categories'], ['locations', 'Locations'], ['vendors', 'Vendors'],
  ['glcodes', 'GL Codes'], ['matrix', 'Approval Matrix'], ['roles', 'Roles'],
];

const inr = (n) => (n == null ? '∞' : `₹${Number(n).toLocaleString('en-IN')}`);

function ActivePill({ active }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${active ? 'bg-sage-tint text-sage' : 'bg-paper text-ink-soft'}`}>
      {active ? 'Active' : 'Retired'}
    </span>
  );
}

export default function Setup() {
  const [section, setSection] = useState('categories');
  return (
    <div className="flex gap-4">
      <aside className="w-52 shrink-0 rounded-2xl border border-line bg-white p-2">
        {SECTIONS.map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)}
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${section === id ? 'bg-pine text-white' : 'text-ink hover:bg-pine-tint'}`}>
            {label}
          </button>
        ))}
        <p className="px-3 pt-3 text-[11px] leading-snug text-ink-soft">
          Masters are retired, never deleted. Every change is logged.
        </p>
      </aside>
      <section className="min-w-0 flex-1">
        {section === 'categories' && <CategoriesPanel />}
        {section === 'locations' && <LocationsPanel />}
        {section === 'vendors' && <VendorsPanel />}
        {section === 'glcodes' && <GlPanel />}
        {section === 'matrix' && <MatrixPanel />}
        {section === 'roles' && <RolesPanel />}
      </section>
    </div>
  );
}

// shared hooks/helpers
function useMasters() {
  return useQuery({ queryKey: ['assetMasters'], queryFn: getAssetMasters, retry: false });
}
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['assetMasters'] });
}
const errMsg = (e) => e?.response?.data?.error?.message || 'Something went wrong';

function Panel({ title, sub, children }) {
  return (
    <div className="rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-serif text-lg font-semibold text-pine">{title}</h2>
        {sub && <p className="text-xs text-ink-soft">{sub}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Categories + Sub-categories ─────────────────────────────────────
function CategoriesPanel() {
  const masters = useMasters();
  const refresh = useRefresh();
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState('');
  const [nc, setNc] = useState({ code: '', name: '', defaultGlCodeId: '' });
  const [ns, setNs] = useState({ code: '', name: '', defaultGstRate: 18, defaultItcEligible: true, itcBlockReason: '' });

  const cats = masters.data?.categories || [];
  const gls = masters.data?.glCodes || [];
  const cat = cats.find((c) => c.id === sel) || cats[0];

  const addCat = useMutation({ mutationFn: () => createCategory({ ...nc, defaultGlCodeId: nc.defaultGlCodeId || null }), onSuccess: () => { setNc({ code: '', name: '', defaultGlCodeId: '' }); setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const patchCat = useMutation({ mutationFn: ({ id, p }) => updateCategory(id, p), onSuccess: () => { setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const addSub = useMutation({ mutationFn: () => createSubCategory({ ...ns, categoryId: cat.id, itcBlockReason: ns.defaultItcEligible ? '' : ns.itcBlockReason }), onSuccess: () => { setNs({ code: '', name: '', defaultGstRate: 18, defaultItcEligible: true, itcBlockReason: '' }); setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const patchSub = useMutation({ mutationFn: ({ id, p }) => updateSubCategory(id, p), onSuccess: () => { setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });

  return (
    <div className="space-y-4">
      <Panel title="Asset Categories" sub="Broad classes; the code appears in Asset IDs. Each carries a default GL ledger.">
        {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="py-1.5 pr-3">Code</th><th className="py-1.5 pr-3">Name</th><th className="py-1.5 pr-3">Default GL</th><th className="py-1.5 pr-3">Status</th><th /></tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} className={`border-t border-line/60 ${cat?.id === c.id ? 'bg-pine-tint/40' : ''}`}>
                <td className="py-2 pr-3 font-mono text-xs">{c.code}</td>
                <td className="py-2 pr-3">
                  <button onClick={() => setSel(c.id)} className="font-medium text-pine hover:underline">{c.name}</button>
                </td>
                <td className="py-2 pr-3">
                  <select value={c.defaultGlCodeId || ''} onChange={(e) => patchCat.mutate({ id: c.id, p: { defaultGlCodeId: e.target.value || null } })}
                    className="rounded border border-line px-2 py-1 text-xs">
                    <option value="">—</option>
                    {gls.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3"><ActivePill active={c.active} /></td>
                <td className="py-2 text-right">
                  <button onClick={() => patchCat.mutate({ id: c.id, p: { active: !c.active } })} className="text-xs text-ochre hover:underline">
                    {c.active ? 'Retire' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-2 pr-3"><input value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} placeholder="FUR" className="w-16 rounded border border-line px-2 py-1 text-xs uppercase" /></td>
              <td className="py-2 pr-3"><input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="New category…" className="w-full rounded border border-line px-2 py-1 text-sm" /></td>
              <td className="py-2 pr-3">
                <select value={nc.defaultGlCodeId} onChange={(e) => setNc({ ...nc, defaultGlCodeId: e.target.value })} className="rounded border border-line px-2 py-1 text-xs">
                  <option value="">—</option>
                  {gls.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}
                </select>
              </td>
              <td colSpan={2} className="py-2 text-right">
                <button onClick={() => addCat.mutate()} disabled={!nc.code.trim() || !nc.name.trim() || addCat.isPending}
                  className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </Panel>

      {cat && (
        <Panel title={`Sub-categories · ${cat.name}`} sub="Each carries the default GST rate and ITC eligibility that flow to assets.">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-soft">
              <tr><th className="py-1.5 pr-3">Code</th><th className="py-1.5 pr-3">Name</th><th className="py-1.5 pr-3">GST %</th><th className="py-1.5 pr-3">ITC</th><th className="py-1.5 pr-3">Block reason</th><th className="py-1.5 pr-3">Status</th><th /></tr>
            </thead>
            <tbody>
              {cat.subCategories.map((s) => (
                <tr key={s.id} className="border-t border-line/60">
                  <td className="py-2 pr-3 font-mono text-xs">{s.code}</td>
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3">
                    <input type="number" defaultValue={s.defaultGstRate} onBlur={(e) => Number(e.target.value) !== s.defaultGstRate && patchSub.mutate({ id: s.id, p: { defaultGstRate: e.target.value } })}
                      className="w-16 rounded border border-line px-2 py-1 text-xs" />
                  </td>
                  <td className="py-2 pr-3">
                    <button onClick={() => patchSub.mutate({ id: s.id, p: { defaultItcEligible: !s.defaultItcEligible } })}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${s.defaultItcEligible ? 'bg-sage-tint text-sage' : 'bg-brick/10 text-brick'}`}>
                      {s.defaultItcEligible ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    {!s.defaultItcEligible ? (
                      <input defaultValue={s.itcBlockReason || ''} placeholder="Blocked u/s 17(5)" onBlur={(e) => e.target.value !== (s.itcBlockReason || '') && patchSub.mutate({ id: s.id, p: { itcBlockReason: e.target.value } })}
                        className="w-full rounded border border-line px-2 py-1 text-xs" />
                    ) : <span className="text-xs text-ink-soft">—</span>}
                  </td>
                  <td className="py-2 pr-3"><ActivePill active={s.active} /></td>
                  <td className="py-2 text-right">
                    <button onClick={() => patchSub.mutate({ id: s.id, p: { active: !s.active } })} className="text-xs text-ochre hover:underline">
                      {s.active ? 'Retire' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line">
                <td className="py-2 pr-3"><input value={ns.code} onChange={(e) => setNs({ ...ns, code: e.target.value })} placeholder="BED" className="w-16 rounded border border-line px-2 py-1 text-xs uppercase" /></td>
                <td className="py-2 pr-3"><input value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} placeholder="New sub-category…" className="w-full rounded border border-line px-2 py-1 text-sm" /></td>
                <td className="py-2 pr-3"><input type="number" value={ns.defaultGstRate} onChange={(e) => setNs({ ...ns, defaultGstRate: e.target.value })} className="w-16 rounded border border-line px-2 py-1 text-xs" /></td>
                <td className="py-2 pr-3">
                  <button onClick={() => setNs({ ...ns, defaultItcEligible: !ns.defaultItcEligible })}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${ns.defaultItcEligible ? 'bg-sage-tint text-sage' : 'bg-brick/10 text-brick'}`}>
                    {ns.defaultItcEligible ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="py-2 pr-3">
                  {!ns.defaultItcEligible && <input value={ns.itcBlockReason} onChange={(e) => setNs({ ...ns, itcBlockReason: e.target.value })} placeholder="Reason…" className="w-full rounded border border-line px-2 py-1 text-xs" />}
                </td>
                <td colSpan={2} className="py-2 text-right">
                  <button onClick={() => addSub.mutate()} disabled={!ns.code.trim() || !ns.name.trim() || addSub.isPending}
                    className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Locations (Site → Building → Room) ──────────────────────────────
function LocationsPanel() {
  const masters = useMasters();
  const refresh = useRefresh();
  const [err, setErr] = useState('');
  const [siteSel, setSiteSel] = useState(null);
  const [bldgSel, setBldgSel] = useState(null);
  const [nSite, setNSite] = useState({ code: '', name: '' });
  const [nBldg, setNBldg] = useState({ code: '', name: '' });
  const [roomInput, setRoomInput] = useState('');

  const sites = masters.data?.sites || [];
  const site = sites.find((s) => s.id === siteSel) || sites[0];
  const bldg = site?.buildings.find((b) => b.id === bldgSel) || site?.buildings[0];

  const onErr = (e) => setErr(errMsg(e));
  const ok = () => { setErr(''); refresh(); };
  const addSiteMut = useMutation({ mutationFn: () => createSite(nSite), onSuccess: () => { setNSite({ code: '', name: '' }); ok(); }, onError: onErr });
  const patchSiteMut = useMutation({ mutationFn: ({ id, p }) => updateSite(id, p), onSuccess: ok, onError: onErr });
  const addBldgMut = useMutation({ mutationFn: () => createBuilding({ ...nBldg, siteId: site.id }), onSuccess: () => { setNBldg({ code: '', name: '' }); ok(); }, onError: onErr });
  const patchBldgMut = useMutation({ mutationFn: ({ id, p }) => updateBuilding(id, p), onSuccess: ok, onError: onErr });
  const addRoomsMut = useMutation({ mutationFn: () => addRooms({ buildingId: bldg.id, numbers: roomInput }), onSuccess: () => { setRoomInput(''); ok(); }, onError: onErr });
  const patchRoomMut = useMutation({ mutationFn: ({ id, p }) => updateRoom(id, p), onSuccess: ok, onError: onErr });

  return (
    <Panel title="Locations" sub="Three levels: Site → Building → Room. Rooms are optional (hostels mainly).">
      {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sites */}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Sites · {sites.length}</div>
          <div className="space-y-0.5">
            {sites.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${site?.id === s.id ? 'bg-pine-tint' : ''}`}>
                <button onClick={() => { setSiteSel(s.id); setBldgSel(null); }} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-pine">
                  <span className="font-mono text-xs text-ink-soft">{s.code}</span> {s.name}
                </button>
                {!s.active && <ActivePill active={false} />}
                <button onClick={() => patchSiteMut.mutate({ id: s.id, p: { active: !s.active } })} className="text-[11px] text-ochre hover:underline">{s.active ? 'Retire' : 'Restore'}</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <input value={nSite.code} onChange={(e) => setNSite({ ...nSite, code: e.target.value })} placeholder="SC" className="w-14 rounded border border-line px-2 py-1 text-xs uppercase" />
            <input value={nSite.name} onChange={(e) => setNSite({ ...nSite, name: e.target.value })} placeholder="New site…" className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm" />
            <button onClick={() => addSiteMut.mutate()} disabled={!nSite.code.trim() || !nSite.name.trim()} className="rounded bg-pine px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Add</button>
          </div>
        </div>

        {/* Buildings */}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Buildings {site ? `· ${site.name}` : ''}</div>
          {!site ? <p className="text-xs text-ink-soft">Select a site.</p> : (
            <>
              <div className="space-y-0.5">
                {site.buildings.map((b) => (
                  <div key={b.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${bldg?.id === b.id ? 'bg-pine-tint' : ''}`}>
                    <button onClick={() => setBldgSel(b.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:text-pine">
                      <span className="font-mono text-xs text-ink-soft">{b.code}</span> {b.name}
                    </button>
                    <span className="text-[11px] text-ink-soft">{b.rooms.length} rooms</span>
                    <button onClick={() => patchBldgMut.mutate({ id: b.id, p: { active: !b.active } })} className="text-[11px] text-ochre hover:underline">{b.active ? 'Retire' : 'Restore'}</button>
                  </div>
                ))}
                {site.buildings.length === 0 && <p className="text-xs text-ink-soft">No buildings yet.</p>}
              </div>
              <div className="mt-2 flex gap-1">
                <input value={nBldg.code} onChange={(e) => setNBldg({ ...nBldg, code: e.target.value })} placeholder="HSLA" className="w-16 rounded border border-line px-2 py-1 text-xs uppercase" />
                <input value={nBldg.name} onChange={(e) => setNBldg({ ...nBldg, name: e.target.value })} placeholder="New building…" className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm" />
                <button onClick={() => addBldgMut.mutate()} disabled={!nBldg.code.trim() || !nBldg.name.trim()} className="rounded bg-pine px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Add</button>
              </div>
            </>
          )}
        </div>

        {/* Rooms */}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Rooms {bldg ? `· ${bldg.name}` : ''}</div>
          {!bldg ? <p className="text-xs text-ink-soft">Select a building.</p> : (
            <>
              <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto">
                {bldg.rooms.map((r) => (
                  <button key={r.id} onClick={() => patchRoomMut.mutate({ id: r.id, p: { active: !r.active } })}
                    title={r.active ? 'Click to retire' : 'Click to restore'}
                    className={`rounded px-2 py-1 font-mono text-xs ${r.active ? 'bg-paper text-ink' : 'bg-brick/10 text-brick line-through'}`}>
                    {r.number}
                  </button>
                ))}
                {bldg.rooms.length === 0 && <p className="text-xs text-ink-soft">No rooms yet — rooms are optional.</p>}
              </div>
              <div className="mt-2 flex gap-1">
                <input value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder="101-110, 201" className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-sm" />
                <button onClick={() => addRoomsMut.mutate()} disabled={!roomInput.trim()} className="rounded bg-pine px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Add</button>
              </div>
              <p className="mt-1 text-[11px] text-ink-soft">Ranges allowed, e.g. “101-110, 201”.</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Vendors ──────────────────────────────────────────────────────────
function VendorsPanel() {
  const masters = useMasters();
  const refresh = useRefresh();
  const [err, setErr] = useState('');
  const [nv, setNv] = useState({ name: '', gstin: '', pan: '', contact: '' });
  const vendors = masters.data?.vendors || [];
  const add = useMutation({ mutationFn: () => createVendor(nv), onSuccess: () => { setNv({ name: '', gstin: '', pan: '', contact: '' }); setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const patch = useMutation({ mutationFn: ({ id, p }) => updateVendor(id, p), onSuccess: refresh, onError: (e) => setErr(errMsg(e)) });

  return (
    <Panel title="Vendors" sub="Basic vendor list. Operations can also add a vendor on the fly during asset entry.">
      {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-soft">
          <tr><th className="py-1.5 pr-3">Code</th><th className="py-1.5 pr-3">Name</th><th className="py-1.5 pr-3">GSTIN</th><th className="py-1.5 pr-3">PAN</th><th className="py-1.5 pr-3">Contact</th><th className="py-1.5 pr-3">Status</th><th /></tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className="border-t border-line/60">
              <td className="py-2 pr-3 font-mono text-xs">{v.code}</td>
              <td className="py-2 pr-3 font-medium">{v.name}</td>
              <td className="py-2 pr-3 font-mono text-xs">{v.gstin || '—'}</td>
              <td className="py-2 pr-3 font-mono text-xs">{v.pan || '—'}</td>
              <td className="py-2 pr-3 text-xs">{v.contact || '—'}</td>
              <td className="py-2 pr-3"><ActivePill active={v.active} /></td>
              <td className="py-2 text-right">
                <button onClick={() => patch.mutate({ id: v.id, p: { active: !v.active } })} className="text-xs text-ochre hover:underline">{v.active ? 'Retire' : 'Reactivate'}</button>
              </td>
            </tr>
          ))}
          {vendors.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-xs text-ink-soft">No vendors yet.</td></tr>}
          <tr className="border-t border-line">
            <td className="py-2 pr-3 text-xs text-ink-soft">auto</td>
            <td className="py-2 pr-3"><input value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} placeholder="Vendor name…" className="w-full rounded border border-line px-2 py-1 text-sm" /></td>
            <td className="py-2 pr-3"><input value={nv.gstin} onChange={(e) => setNv({ ...nv, gstin: e.target.value })} placeholder="GSTIN" className="w-full rounded border border-line px-2 py-1 text-xs" /></td>
            <td className="py-2 pr-3"><input value={nv.pan} onChange={(e) => setNv({ ...nv, pan: e.target.value })} placeholder="PAN" className="w-full rounded border border-line px-2 py-1 text-xs" /></td>
            <td className="py-2 pr-3"><input value={nv.contact} onChange={(e) => setNv({ ...nv, contact: e.target.value })} placeholder="Phone / email" className="w-full rounded border border-line px-2 py-1 text-xs" /></td>
            <td colSpan={2} className="py-2 text-right">
              <button onClick={() => add.mutate()} disabled={!nv.name.trim() || add.isPending} className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
  );
}

// ── GL Codes ─────────────────────────────────────────────────────────
function GlPanel() {
  const masters = useMasters();
  const refresh = useRefresh();
  const [err, setErr] = useState('');
  const [ng, setNg] = useState({ code: '', name: '' });
  const gls = masters.data?.glCodes || [];
  const add = useMutation({ mutationFn: () => createGlCode(ng), onSuccess: () => { setNg({ code: '', name: '' }); setErr(''); refresh(); }, onError: (e) => setErr(errMsg(e)) });
  const patch = useMutation({ mutationFn: ({ id, p }) => updateGlCode(id, p), onSuccess: refresh, onError: (e) => setErr(errMsg(e)) });

  return (
    <Panel title="GL Codes" sub="Finance-only ledger codes. Operations never sees these.">
      {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] max-w-xl text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-soft">
          <tr><th className="py-1.5 pr-3">Code</th><th className="py-1.5 pr-3">Ledger name</th><th className="py-1.5 pr-3">Status</th><th /></tr>
        </thead>
        <tbody>
          {gls.map((g) => (
            <tr key={g.id} className="border-t border-line/60">
              <td className="py-2 pr-3 font-mono text-xs">{g.code}</td>
              <td className="py-2 pr-3">{g.name}</td>
              <td className="py-2 pr-3"><ActivePill active={g.active} /></td>
              <td className="py-2 text-right">
                <button onClick={() => patch.mutate({ id: g.id, p: { active: !g.active } })} className="text-xs text-ochre hover:underline">{g.active ? 'Retire' : 'Reactivate'}</button>
              </td>
            </tr>
          ))}
          <tr className="border-t border-line">
            <td className="py-2 pr-3"><input value={ng.code} onChange={(e) => setNg({ ...ng, code: e.target.value })} placeholder="GL-1260" className="w-24 rounded border border-line px-2 py-1 text-xs uppercase" /></td>
            <td className="py-2 pr-3"><input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Ledger name…" className="w-full rounded border border-line px-2 py-1 text-sm" /></td>
            <td colSpan={2} className="py-2 text-right">
              <button onClick={() => add.mutate()} disabled={!ng.code.trim() || !ng.name.trim() || add.isPending} className="rounded-lg bg-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Add</button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </Panel>
  );
}

// ── Approval Matrix ──────────────────────────────────────────────────
function MatrixPanel() {
  const masters = useMasters();
  const refresh = useRefresh();
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState(null); // local editable copy
  const bands = draft ?? (masters.data?.bands || []).map((b) => ({ ...b }));

  const save = useMutation({
    mutationFn: () => replaceBands(bands),
    onSuccess: () => { setDraft(null); setErr(''); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });

  const edit = (i, patch) => {
    const next = bands.map((b, j) => (j === i ? { ...b, ...patch } : b));
    setDraft(next);
  };
  const toggleApprover = (i, role) => {
    const cur = bands[i].approvers || [];
    edit(i, { approvers: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] });
  };

  return (
    <Panel title="Approval Matrix" sub="Value bands decide who approves, in sequence. Disposals & write-offs always go Branch Manager → CFO.">
      {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}
      <div className="space-y-3">
        {bands.map((b, i) => (
          <div key={i} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-soft">From ₹</span>
              <input type="number" value={b.minValue} onChange={(e) => edit(i, { minValue: e.target.value })} className="w-28 rounded border border-line px-2 py-1 text-sm" />
              <span className="text-xs text-ink-soft">to ₹</span>
              <input type="number" value={b.maxValue ?? ''} placeholder="no cap" onChange={(e) => edit(i, { maxValue: e.target.value === '' ? null : e.target.value })} className="w-28 rounded border border-line px-2 py-1 text-sm" />
              <input value={b.label || ''} placeholder="Label" onChange={(e) => edit(i, { label: e.target.value })} className="w-36 rounded border border-line px-2 py-1 text-sm" />
              <button onClick={() => setDraft(bands.filter((_, j) => j !== i))} className="ml-auto text-xs text-brick hover:underline">Remove band</button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-soft">Approvers (in order):</span>
              {ROLES.filter((r) => r !== 'ASSET_ADMIN' && r !== 'OPERATIONS').map((r) => {
                const idx = (b.approvers || []).indexOf(r);
                return (
                  <button key={r} onClick={() => toggleApprover(i, r)}
                    className={`rounded-lg px-2 py-1 text-xs font-medium ${idx >= 0 ? 'bg-pine text-white' : 'bg-paper text-ink-soft hover:bg-pine-tint'}`}>
                    {idx >= 0 ? `${idx + 1}. ` : ''}{ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">{inr(Number(b.minValue) || 0)} – {inr(b.maxValue == null || b.maxValue === '' ? null : Number(b.maxValue))} → {(b.approvers || []).map((r) => ROLE_LABEL[r]).join(' → ') || '—'}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => setDraft([...bands, { minValue: 0, maxValue: null, approvers: [], label: '' }])} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-pine">+ Add band</button>
        <button onClick={() => save.mutate()} disabled={save.isPending || draft === null} className="rounded-lg bg-pine px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {save.isPending ? 'Saving…' : draft === null ? 'Saved' : 'Save matrix'}
        </button>
      </div>
    </Panel>
  );
}

// ── Roles ────────────────────────────────────────────────────────────
function RolesPanel() {
  const qc = useQueryClient();
  const masters = useMasters();
  const roles = useQuery({ queryKey: ['assetRoles'], queryFn: getAssetRoles, retry: false });
  const users = useQuery({ queryKey: ['users'], queryFn: getUsers, retry: false });
  const [err, setErr] = useState('');
  const [f, setF] = useState({ userId: '', role: 'OPERATIONS', siteId: '', buildingId: '' });

  const sites = masters.data?.sites || [];
  const site = sites.find((s) => s.id === f.siteId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['assetRoles'] });

  const add = useMutation({
    mutationFn: () => addAssetRole({ ...f, siteId: f.siteId || null, buildingId: f.buildingId || null }),
    onSuccess: () => { setF({ userId: '', role: 'OPERATIONS', siteId: '', buildingId: '' }); setErr(''); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const remove = useMutation({ mutationFn: (id) => removeAssetRole(id), onSuccess: refresh, onError: (e) => setErr(errMsg(e)) });

  return (
    <Panel title="Roles" sub="Who plays which AssetHub role. Scope a Branch Manager / Operations person to a site or building; leave blank for all.">
      {err && <p className="mb-2 rounded bg-brick/5 px-3 py-1.5 text-sm text-brick">{err}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-paper/40 p-3">
        <label className="block text-xs">
          <span className="text-ink-soft">Person</span>
          <select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} className="mt-0.5 block w-56 rounded border border-line bg-white px-2 py-1.5 text-sm">
            <option value="">Select…</option>
            {groupByDept(users.data || []).map(([dept, members]) => (
              <optgroup key={dept} label={dept}>
                {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-ink-soft">Role</span>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-0.5 block rounded border border-line bg-white px-2 py-1.5 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-ink-soft">Site (optional)</span>
          <select value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value, buildingId: '' })} className="mt-0.5 block rounded border border-line bg-white px-2 py-1.5 text-sm">
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-ink-soft">Building (optional)</span>
          <select value={f.buildingId} onChange={(e) => setF({ ...f, buildingId: e.target.value })} disabled={!site} className="mt-0.5 block rounded border border-line bg-white px-2 py-1.5 text-sm disabled:opacity-50">
            <option value="">All buildings</option>
            {(site?.buildings || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <button onClick={() => add.mutate()} disabled={!f.userId || add.isPending} className="rounded-lg bg-pine px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Assign</button>
      </div>

      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-ink-soft">
          <tr><th className="py-1.5 pr-3">Person</th><th className="py-1.5 pr-3">Role</th><th className="py-1.5 pr-3">Scope</th><th /></tr>
        </thead>
        <tbody>
          {(roles.data || []).map((r) => (
            <tr key={r.id} className="border-t border-line/60">
              <td className="py-2 pr-3 font-medium">{r.user.name} <span className="text-xs text-ink-soft">· {r.user.designation}</span></td>
              <td className="py-2 pr-3"><span className="rounded bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">{ROLE_LABEL[r.role] || r.role}</span></td>
              <td className="py-2 pr-3 text-xs text-ink-soft">{r.buildingName || r.siteName || 'Everywhere'}</td>
              <td className="py-2 text-right">
                <button onClick={() => remove.mutate(r.id)} className="text-xs text-brick hover:underline">Remove</button>
              </td>
            </tr>
          ))}
          {(roles.data || []).length === 0 && <tr><td colSpan={4} className="py-4 text-center text-xs text-ink-soft">No role assignments yet.</td></tr>}
        </tbody>
      </table>
    </Panel>
  );
}
