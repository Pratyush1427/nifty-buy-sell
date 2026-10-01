import Avatar, { PRESETS } from './Avatar';

/** Choose a built-in avatar, or the Google photo when the account has one. */
export default function AvatarPicker({ value, onChange, name, googlePhoto }) {
  const options = [...(googlePhoto ? [{ key: 'google', show: googlePhoto }] : []), ...PRESETS.map((_, i) => ({ key: `preset:${i}`, show: `preset:${i}` }))];
  const selected = (o) => value === o.key || (o.key === 'google' && value === googlePhoto);
  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Avatar">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={selected(o)}
          aria-label={o.key === 'google' ? 'Google photo' : `Style ${o.key.split(':')[1] * 1 + 1}`}
          className="avatar-option"
          onClick={() => onChange(o.key)}
        >
          <Avatar avatar={o.show} name={name} size={38} />
        </button>
      ))}
    </div>
  );
}
