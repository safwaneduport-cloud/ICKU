// One avatar everywhere in Messages: the person's uploaded photo if they have
// one, otherwise a coloured square with their initials. The colour is derived
// from the user id, so it's stable and distinct per person (Slack-style).
const COLORS = [
  '#7C3AED', '#2563EB', '#0891B2', '#059669', '#65A30D', '#CA8A04',
  '#EA580C', '#DC2626', '#DB2777', '#9333EA', '#4F46E5', '#0D9488',
  '#B45309', '#BE123C', '#1D4ED8', '#15803D',
];

function hashIndex(str = '', mod) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

const initialsOf = (n = '') =>
  n.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function Avatar({ id, name, photoUrl, size = 36, rounded = 'rounded-lg', onClick, className = '', title }) {
  const dim = { width: size, height: size };
  const base = `shrink-0 ${rounded} ${onClick ? 'cursor-pointer' : ''} ${className}`;

  if (photoUrl) {
    return (
      <img src={photoUrl} alt={name || ''} title={title ?? name} onClick={onClick}
        style={dim} className={`${base} object-cover`} />
    );
  }
  const color = COLORS[hashIndex(id || name || '', COLORS.length)];
  return (
    <span onClick={onClick} title={title ?? name} style={{ ...dim, background: color }}
      className={`${base} flex items-center justify-center font-semibold text-white`}>
      <span style={{ fontSize: Math.round(size * 0.4) }}>{initialsOf(name)}</span>
    </span>
  );
}
