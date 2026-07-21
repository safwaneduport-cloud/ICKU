import { useState } from 'react';

// A curated, searchable emoji set — no external library (CSP-safe). Each entry
// is [emoji, keywords]. Covers the common reactions plus a broad everyday set.
const EMOJI = [
  ['😀', 'grin happy'], ['😄', 'happy smile'], ['😁', 'beam'], ['😆', 'laugh'], ['😅', 'sweat laugh'], ['🤣', 'rofl'], ['😂', 'joy laughing tears'],
  ['🙂', 'smile'], ['🙃', 'upside down'], ['😉', 'wink'], ['😊', 'blush'], ['😇', 'angel innocent'],
  ['🥰', 'love adore'], ['😍', 'heart eyes love'], ['🤩', 'star struck'], ['😘', 'kiss'], ['😚', 'kiss'],
  ['😋', 'yum tasty'], ['😛', 'tongue'], ['😜', 'wink tongue'], ['🤪', 'zany goofy'], ['😝', 'tongue'], ['🤑', 'money mouth'],
  ['🤗', 'hug'], ['🤭', 'oops giggle'], ['🤫', 'shh quiet'], ['🤔', 'think hmm'], ['🤐', 'zip'], ['🤨', 'raised eyebrow skeptical'], ['😐', 'neutral'],
  ['😑', 'expressionless'], ['😶', 'no mouth speechless'], ['😏', 'smirk'], ['😒', 'unamused'], ['🙄', 'roll eyes'],
  ['😬', 'grimace awkward'], ['😌', 'relieved calm'], ['😔', 'pensive sad'], ['😪', 'sleepy'], ['😴', 'sleep zzz'], ['😷', 'mask sick'],
  ['🤒', 'sick ill'], ['🤕', 'hurt bandage'], ['🥳', 'party celebrate'], ['🥺', 'pleading puppy'], ['😎', 'cool sunglasses'], ['🤓', 'nerd geek'],
  ['😕', 'confused'], ['😟', 'worried'], ['🙁', 'frown'], ['😮', 'wow open mouth'], ['😲', 'astonished shocked'],
  ['😳', 'flushed embarrassed'], ['🥵', 'hot'], ['🥶', 'cold freezing'], ['😱', 'scream'], ['😨', 'fear'], ['😰', 'anxious'],
  ['😥', 'sad'], ['😢', 'cry tear'], ['😭', 'sob crying'], ['😤', 'triumph huff'], ['😠', 'angry'], ['😡', 'rage mad'], ['🤬', 'swear cursing'],
  ['👍', 'thumbsup yes like approve good'], ['👎', 'thumbsdown no dislike'], ['👌', 'ok perfect'], ['✌️', 'peace victory'], ['🤞', 'fingers crossed luck'],
  ['🤝', 'handshake deal agree'], ['👏', 'clap applause'], ['🙌', 'raise hands praise'], ['🙏', 'pray thanks please'], ['💪', 'muscle strong'],
  ['👋', 'wave hi hello bye'], ['🤙', 'call shaka'], ['👆', 'point up'], ['👇', 'point down'], ['👉', 'point right'], ['👈', 'point left'], ['✋', 'stop hand raised'],
  ['❤️', 'heart love red'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'],
  ['💜', 'purple heart'], ['🖤', 'black heart'], ['🤍', 'white heart'], ['💔', 'broken heart'], ['💯', 'hundred perfect'],
  ['✅', 'check done yes tick complete'], ['❌', 'cross no wrong'], ['⭐', 'star'], ['🌟', 'glowing star'], ['🔥', 'fire lit hot'],
  ['🎉', 'party tada celebrate hooray'], ['🎊', 'confetti'], ['🎈', 'balloon'], ['🎁', 'gift present'], ['🏆', 'trophy win award'],
  ['👀', 'eyes look watching'], ['🧠', 'brain smart'], ['💡', 'idea bulb light'], ['⚡', 'zap fast lightning'], ['💥', 'boom collision'], ['✨', 'sparkle magic'],
  ['🚀', 'rocket launch ship'], ['📌', 'pin'], ['📎', 'clip attach'], ['📝', 'note memo write'], ['📅', 'calendar date'],
  ['⏰', 'alarm time clock'], ['✔️', 'check mark'], ['❓', 'question'], ['❗', 'exclaim important'], ['⚠️', 'warning caution'], ['🚨', 'alert siren'],
  ['☕', 'coffee break'], ['🍕', 'pizza food'], ['🎯', 'target goal bullseye'], ['💰', 'money bag cash'], ['📈', 'chart up growth'], ['📉', 'chart down'],
];

// A searchable emoji grid. `onPick(emoji)` fires on selection.
export default function EmojiPicker({ onPick }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query ? EMOJI.filter(([, kw]) => kw.includes(query)) : EMOJI;
  return (
    <div className="w-60 rounded-lg border border-line bg-white p-2 shadow-lg">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji…"
        className="mb-2 w-full rounded border border-line px-2 py-1 text-sm outline-none focus:border-pine" />
      <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto">
        {list.map(([e], i) => (
          <button key={i} type="button" onClick={() => onPick(e)} title={e} className="rounded p-1 text-lg leading-none hover:bg-paper">{e}</button>
        ))}
        {list.length === 0 && <p className="col-span-8 py-3 text-center text-xs text-ink-soft">No match</p>}
      </div>
    </div>
  );
}
