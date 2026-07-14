import { useState } from 'react';
import CreateTab from './CreateTab.jsx';
import BulkCreate from './BulkCreate.jsx';
import ImportLegacy from './ImportLegacy.jsx';
import AssignRooms from './AssignRooms.jsx';

const MODES = [
  ['individual', 'Individual'],
  ['bulk', 'Bulk create'],
  ['import', 'Import legacy'],
  ['rooms', 'Assign rooms'],
];

export default function CreateHub({ onCreated }) {
  const [mode, setMode] = useState('individual');
  return (
    <div className="space-y-4">
      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
        {MODES.map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === id ? 'bg-sage text-white' : 'text-ink-soft hover:text-pine'}`}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'individual' && <CreateTab onCreated={onCreated} />}
      {mode === 'bulk' && <BulkCreate onDone={onCreated} />}
      {mode === 'import' && <ImportLegacy />}
      {mode === 'rooms' && <AssignRooms />}
    </div>
  );
}
