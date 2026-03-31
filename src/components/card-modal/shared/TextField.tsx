interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
}

export function TextField({ label, value, onChange, placeholder, multiline = false, rows = 4, disabled = false }: TextFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-none rounded-[1.1rem] px-4 py-3 text-sm outline-none disabled:opacity-70"
          style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[1.1rem] px-4 py-3 text-sm outline-none disabled:opacity-70"
          style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)' }}
        />
      )}
    </label>
  );
}
