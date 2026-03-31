import { ExternalLink, FolderOpen } from 'lucide-react';

interface DriveLinkFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editing: boolean;
  readOnly?: boolean;
}

function isDriveUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'drive.google.com' || host === 'docs.google.com';
  } catch {
    return false;
  }
}

export function DriveLinkField({
  label,
  value,
  onChange,
  placeholder = 'https://drive.google.com/...',
  editing,
  readOnly = false,
}: DriveLinkFieldProps) {
  if (editing && !readOnly && onChange) {
    return (
      <label className="block">
        <span
          className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: 'var(--ff-text-tertiary)' }}
        >
          {label}
        </span>
        <div className="relative">
          <FolderOpen
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--ff-text-tertiary)' }}
          />
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-[1.1rem] py-3 pl-10 pr-4 text-sm outline-none"
            style={{
              background: 'var(--ff-input-bg)',
              color: 'var(--ff-text-primary)',
              border: '1px solid var(--ff-input-border)',
            }}
          />
        </div>
      </label>
    );
  }

  if (!value) return null;

  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-80"
      style={{
        color: isDriveUrl(value) ? 'var(--ff-primary)' : 'var(--ff-text-secondary)',
        borderColor: 'var(--ff-border)',
        background: 'var(--ff-surface-raised)',
      }}
    >
      <FolderOpen size={13} />
      {label}
      <ExternalLink size={11} />
    </a>
  );
}
