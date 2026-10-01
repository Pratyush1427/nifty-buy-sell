// Built-in avatar styles (index matches `preset:N`), so nobody has to upload a photo.
export const PRESETS = [
  { bg: '#2563eb', glyph: '▲' },
  { bg: '#0f766e', glyph: '◆' },
  { bg: '#b45309', glyph: '●' },
  { bg: '#7c3aed', glyph: '★' },
  { bg: '#be123c', glyph: '♦' },
  { bg: '#15803d', glyph: '■' },
  { bg: '#0369a1', glyph: '✦' },
  { bg: '#475569', glyph: '◗' },
];

export default function Avatar({ avatar, name = '', size = 32 }) {
  const preset = /^preset:(\d+)$/.exec(avatar || '');
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (avatar && !preset) {
    // Google profile photo
    return <img className="avatar" src={avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" style={style} />;
  }
  const p = PRESETS[preset ? Number(preset[1]) % PRESETS.length : 0];
  const initial = (name.trim()[0] || '').toUpperCase();
  return (
    <span className="avatar" aria-hidden="true" style={{ ...style, background: p.bg }}>
      {initial || p.glyph}
    </span>
  );
}
