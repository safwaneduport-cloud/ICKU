import { useAuth } from '../../store/AuthContext.jsx';

const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? t : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${t}`;
}

// Render body with @mentions lightly highlighted (first word after @).
function renderBody(body, mine) {
  const parts = body.split(/(@[\p{L}][\p{L}0-9._-]*)/gu);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className={`rounded px-0.5 font-medium ${mine ? 'bg-white/25 text-white' : 'bg-pine-tint text-pine'}`}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

// Chat row, WhatsApp/Telegram style: my messages align right (pine bubble),
// others align left (white bubble) with their avatar + name.
export default function ChatMessage({ m, onOpenThread, onOpenProfile }) {
  const { user } = useAuth();
  const mine = user?.id === m.authorId;

  return (
    <div className={`group flex px-4 py-1 ${mine ? 'justify-end' : 'gap-2'}`}>
      {!mine && (
        <button
          onClick={() => onOpenProfile?.(m.authorId)}
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg bg-pine text-[11px] font-semibold text-white"
          title="View profile"
        >
          {initials(m.author)}
        </button>
      )}

      <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 px-1">
          {!mine && (
            <button onClick={() => onOpenProfile?.(m.authorId)} className="text-sm font-semibold text-ink hover:underline">
              {m.author}
            </button>
          )}
          <span className="text-[11px] text-ink-soft">{fmtTime(m.at)}</span>
        </div>

        <div className={`mt-0.5 rounded-2xl px-3 py-2 ${mine ? 'rounded-tr-sm bg-pine text-white' : 'rounded-tl-sm border border-line bg-white text-ink'}`}>
          {m.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{renderBody(m.body, mine)}</p>}

          {/* attachments */}
          {m.attachments?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {m.attachments.map((a, i) =>
                a.kind === 'image' ? (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer">
                    <img src={a.url} alt={a.name} className="max-h-48 rounded-lg object-cover" />
                  </a>
                ) : (
                  <a key={i} href={a.url} download={a.name}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${mine ? 'bg-white/15 text-white hover:bg-white/25' : 'border border-line bg-paper text-pine hover:border-pine'}`}>
                    <span>📎</span><span className="max-w-[180px] truncate">{a.name}</span>
                  </a>
                )
              )}
            </div>
          )}
        </div>

        {/* thread affordance (top-level messages only) */}
        {onOpenThread && m.replyCount !== undefined && (
          m.replyCount > 0 ? (
            <button onClick={() => onOpenThread(m)} className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-steel hover:underline">
              💬 {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
              {m.lastReplyAt && <span className="text-ink-soft">· last {fmtTime(m.lastReplyAt)}</span>}
            </button>
          ) : (
            <button onClick={() => onOpenThread(m)} className="mt-0.5 px-1 text-xs text-ink-soft opacity-0 transition group-hover:opacity-100 hover:text-pine hover:underline">
              Reply in thread
            </button>
          )
        )}
      </div>
    </div>
  );
}
