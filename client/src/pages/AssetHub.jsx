import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAssetAccess } from '../api/assethub.api.js';
import Setup from '../features/assethub/Setup.jsx';
import RegisterTab from '../features/assethub/RegisterTab.jsx';
import CreateHub from '../features/assethub/CreateHub.jsx';
import ApprovalsTab from '../features/assethub/ApprovalsTab.jsx';

// Sub-screens land phase by phase; placeholders name what's coming.
const TABS = [
  ['register', 'Register', null],
  ['create', 'Create', null],
  ['approvals', 'Approvals', null],
  ['verification', 'Verification', 'Phase 5 — count-based & item-based physical verification'],
  ['reports', 'Reports', 'Phase 6 — register, movement, disposal, audit-trail reports'],
  ['setup', 'Setup', null],
];

export default function AssetHub() {
  const access = useQuery({ queryKey: ['assetAccess'], queryFn: getAssetAccess, retry: false });
  const isAdmin = access.data?.isAssetAdmin;
  const [tab, setTab] = useState('register');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl font-bold text-pine">AssetHub</h1>
        <p className="text-sm text-ink-soft">The company's fixed asset register — every asset, where it is, who's responsible, what it's worth.</p>
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
        {TABS.filter(([id]) => id !== 'setup' || isAdmin).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === id ? 'bg-pine text-white' : 'text-ink-soft hover:text-pine'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'setup' && isAdmin ? <Setup />
        : tab === 'register' ? <RegisterTab />
        : tab === 'create' ? <CreateHub onCreated={() => setTab('register')} />
        : tab === 'approvals' ? <ApprovalsTab />
        : <ComingSoon tab={TABS.find(([id]) => id === tab)} isAdmin={isAdmin} onSetup={() => setTab('setup')} />}
    </div>
  );
}

function ComingSoon({ tab, isAdmin, onSetup }) {
  const [, label, desc] = tab || [];
  return (
    <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center">
      <div className="text-4xl">🏗️</div>
      <h2 className="mt-2 font-serif text-xl font-semibold text-pine">{label} is on its way</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{desc}</p>
      {isAdmin && (
        <p className="mt-4 text-sm text-ink-soft">
          Meanwhile, get the foundations ready in{' '}
          <button onClick={onSetup} className="font-medium text-pine hover:underline">Setup</button>
          {' '}— categories, locations, vendors, approval matrix and roles.
        </p>
      )}
    </div>
  );
}
