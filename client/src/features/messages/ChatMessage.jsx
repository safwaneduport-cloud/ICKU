const initials = (n = '') => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return sameDay ? t : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${t}`;
}

// Render body with @mentions lightly highlighted (first word after @).
function renderBody(body) {
  const parts = body.split(/(@[\p{L}][\p{L}0-9._-]*)/gu);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="rounded bg-pine-tint px-0.5 font-medium text-pine">{p}</span>
      : <span key={i}>{p}</span>
  );
}

export default function ChatMessage({ m, onOpenThread, onOpenProfile }) {
  return (
    <div className="group flex gap-3 px-4 py-1.5 hover:bg-paper/50">
      <button
        onClick={() => onOpenProfile?.(m.authorId)}
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg bg-pine text-[11px] font-semibold text-white"
        title="View profile"
      >
        {initials(m.author)}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <button onClick={() => onOpenProfile?.(m.authorId)} className="text-sm font-semibold text-ink hover:underline">
            {m.author}
          </button>
          <span className="text-[11px] text-ink-soft">{fmtTime(m.at)}</span>
        </div>

        {m.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{renderBody(m.body)}</p>}

        {/* attachments */}
        {m.attachments?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {m.attachments.map((a, i) =>
              a.kind === 'image' ? (
                <a key={i} href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={a.name} className="max-h-48 rounded-lg border border-line object-cover" />
                </a>
              ) : (
                <a key={i} href={a.url} download={a.name}
                  className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-pine hover:border-pine">
                  <span>📎</span><span className="max-w-[180px] truncate">{a.name}</span>
                </a>
              )
            )}
          </div>
        )}

        {/* thread affordance (top-level messages only) */}
        {onOpenThread && m.replyCount !== undefined && (
          m.replyCount > 0 ? (
            <button onClick={() => onOpenThread(m)} className="mt-1 flex items-center gap-1 rounded px-1 text-xs font-medium text-steel hover:underline">
              💬 {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
              {m.lastReplyAt && <span className="text-ink-soft">· last {fmtTime(m.lastReplyAt)}</span>}
            </button>
          ) : (
            <button onClick={() => onOpenThread(m)} className="mt-0.5 text-xs text-ink-soft opacity-0 transition group-hover:opacity-100 hover:text-pine hover:underline">
              Reply in thread
            </button>
          )
        )}
      </div>
    </div>
  );
}
