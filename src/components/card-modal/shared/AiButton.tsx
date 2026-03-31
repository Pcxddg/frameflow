import { Sparkles, Loader2 } from 'lucide-react';

interface AiButtonProps {
  onClick: () => void;
  loading: boolean;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function AiButton({ onClick, loading, label, disabled, className = '' }: AiButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-all hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {label}
    </button>
  );
}
