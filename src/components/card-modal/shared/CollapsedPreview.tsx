import { raisedPanelStyle, subtleButtonStyle } from '../hooks/useFlowStyles';

interface CollapsedPreviewProps {
  primary: string;
  secondary: string;
  chips?: string[];
}

export function CollapsedPreview({ primary, secondary, chips }: CollapsedPreviewProps) {
  return (
    <div className="rounded-[1.15rem] border p-4" style={raisedPanelStyle}>
      <p className="text-sm font-semibold leading-6" style={{ color: 'var(--ff-text-primary)' }}>{primary}</p>
      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{secondary}</p>
      {chips?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(chip => (
            <span key={chip} className="rounded-full px-3 py-1 text-[11px] font-semibold" style={subtleButtonStyle}>{chip}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
