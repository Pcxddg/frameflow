import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { createPortal } from 'react-dom';
import { ChevronDown, Pause, Play, RotateCcw, Settings2, X } from 'lucide-react';
import type { TeleprompterLineHeightMode, TeleprompterPrefs } from './card-modal/types';

interface TeleprompterOverlayProps {
  script: string;
  onClose: () => void;
  initialPrefs?: Partial<TeleprompterPrefs>;
  sourceLabel?: string;
}

const STORAGE_KEY = 'ff-teleprompter-prefs';

const DEFAULT_PREFS: TeleprompterPrefs = {
  speed: 1.8,
  fontScale: 36,
  textWidth: 780,
  lineHeightMode: 'balanced',
};

const FONT_PRESETS = [
  { label: 'Pequeno', value: 28 },
  { label: 'Medio', value: 36 },
  { label: 'Grande', value: 48 },
  { label: 'Gigante', value: 60 },
] as const;

const WIDTH_PRESETS = [
  { label: 'Estrecho', value: 620 },
  { label: 'Medio', value: 780 },
  { label: 'Amplio', value: 960 },
] as const;

const LINE_HEIGHT_OPTIONS: Array<{ label: string; value: TeleprompterLineHeightMode }> = [
  { label: 'Compacto', value: 'tight' },
  { label: 'Equilibrado', value: 'balanced' },
  { label: 'Aireado', value: 'airy' },
];

function readStoredPrefs() {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<TeleprompterPrefs>;
    return {
      speed: typeof parsed.speed === 'number' ? parsed.speed : DEFAULT_PREFS.speed,
      fontScale: typeof parsed.fontScale === 'number' ? parsed.fontScale : DEFAULT_PREFS.fontScale,
      textWidth: typeof parsed.textWidth === 'number' ? parsed.textWidth : DEFAULT_PREFS.textWidth,
      lineHeightMode: parsed.lineHeightMode || DEFAULT_PREFS.lineHeightMode,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function TeleprompterOverlay({
  script,
  onClose,
  initialPrefs,
  sourceLabel,
}: TeleprompterOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [prefs, setPrefs] = useState<TeleprompterPrefs>(() => ({
    ...readStoredPrefs(),
    ...(initialPrefs || {}),
  }));

  const lineHeight = useMemo(() => {
    if (prefs.lineHeightMode === 'tight') return 1.45;
    if (prefs.lineHeightMode === 'airy') return 1.9;
    return 1.65;
  }, [prefs.lineHeightMode]);

  const [canAutoScroll, setCanAutoScroll] = useState(false);

  const resetScroll = useCallback((pause = true) => {
    const element = containerRef.current;
    if (element) element.scrollTop = 0;
    if (pause) setPlaying(false);
  }, []);

  const updatePrefs = useCallback((next: Partial<TeleprompterPrefs>) => {
    setPrefs((previous) => ({ ...previous, ...next }));
  }, []);

  const refreshScrollableState = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    setCanAutoScroll(maxScrollTop > 6);
  }, []);

  useEffect(() => {
    refreshScrollableState();
  }, [refreshScrollableState, script, prefs.fontScale, prefs.textWidth, prefs.lineHeightMode]);

  useEffect(() => {
    window.addEventListener('resize', refreshScrollableState);
    return () => window.removeEventListener('resize', refreshScrollableState);
  }, [refreshScrollableState]);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }

    const element = containerRef.current;
    if (!element) {
      setPlaying(false);
      return undefined;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (maxScrollTop <= 6) {
      setPlaying(false);
      return undefined;
    }

    if (element.scrollTop >= maxScrollTop - 4) {
      element.scrollTop = 0;
    }

    const pixelsPerTick = Math.max(1.2, prefs.speed * 1.65);
    intervalRef.current = window.setInterval(() => {
      const current = containerRef.current;
      if (!current) {
        setPlaying(false);
        return;
      }
      const limit = Math.max(0, current.scrollHeight - current.clientHeight);
      if (limit <= 6) {
        setPlaying(false);
        return;
      }

      const nextTop = Math.min(limit, current.scrollTop + pixelsPerTick);
      current.scrollTop = nextTop;

      if (nextTop >= limit - 1) {
        setPlaying(false);
      }
    }, 16);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing, prefs.speed]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (playing) {
      refreshScrollableState();
    }
  }, [playing, refreshScrollableState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        setPlaying((previous) => !previous);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        updatePrefs({ speed: clamp(Number((prefs.speed + 0.2).toFixed(1)), 0.5, 6) });
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        updatePrefs({ speed: clamp(Number((prefs.speed - 0.2).toFixed(1)), 0.5, 6) });
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        updatePrefs({ fontScale: clamp(prefs.fontScale + 2, 24, 76) });
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        updatePrefs({ fontScale: clamp(prefs.fontScale - 2, 24, 76) });
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetScroll();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prefs.fontScale, prefs.speed, resetScroll, updatePrefs]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Teleprompter"
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-white/10 bg-black/30">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Teleprompter</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-white md:text-lg">Lectura guiada</h2>
                {sourceLabel && (
                  <span className="rounded-full border border-white/12 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                    {sourceLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying((previous) => !previous)}
                disabled={!canAutoScroll}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? 'Pausar' : 'Reproducir'}
              </button>
              <button
                type="button"
                onClick={() => resetScroll()}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                <RotateCcw size={14} />
                Reiniciar
              </button>
              <button
                type="button"
                onClick={() => setShowControls((previous) => !previous)}
                aria-expanded={showControls}
                aria-controls="teleprompter-settings"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                <Settings2 size={14} />
                Ajustes
                <ChevronDown size={14} className={`transition-transform ${showControls ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10"
              >
                <X size={14} />
                Cerrar
              </button>
            </div>
          </div>

          <div className="border-t border-white/8 px-4 py-2 md:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold">
                Velocidad {prefs.speed.toFixed(1)}x
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold">
                Tamano {Math.round(prefs.fontScale)} px
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold">
                Ancho {Math.round(prefs.textWidth)} px
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold">
                Espaciado {LINE_HEIGHT_OPTIONS.find((option) => option.value === prefs.lineHeightMode)?.label || 'Equilibrado'}
              </span>
              <span className="text-[11px] text-white/40">
                Espacio reproduce, flechas cambian velocidad, +/- cambia tamano y R reinicia.
              </span>
              {!canAutoScroll && (
                <span className="text-[11px] text-amber-300/80">
                  Este guion es demasiado corto para desplazarlo automaticamente.
                </span>
              )}
            </div>
          </div>

          {showControls && (
            <div id="teleprompter-settings" className="grid gap-3 border-t border-white/8 px-4 py-3 md:grid-cols-4 md:px-6">
              <label className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                  <span>Velocidad</span>
                  <span>{prefs.speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={prefs.speed}
                  onChange={(event) => updatePrefs({ speed: Number(event.target.value) })}
                  className="w-full accent-emerald-400"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                  <span>Tamano</span>
                  <span>{Math.round(prefs.fontScale)} px</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={76}
                  step={2}
                  value={prefs.fontScale}
                  onChange={(event) => updatePrefs({ fontScale: Number(event.target.value) })}
                  className="w-full accent-emerald-400"
                />
                <div className="flex flex-wrap gap-1.5">
                  {FONT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updatePrefs({ fontScale: preset.value })}
                      className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                  <span>Ancho</span>
                  <span>{Math.round(prefs.textWidth)} px</span>
                </div>
                <input
                  type="range"
                  min={520}
                  max={1120}
                  step={20}
                  value={prefs.textWidth}
                  onChange={(event) => updatePrefs({ textWidth: Number(event.target.value) })}
                  className="w-full accent-emerald-400"
                />
                <div className="flex flex-wrap gap-1.5">
                  {WIDTH_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updatePrefs({ textWidth: preset.value })}
                      className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Espaciado</div>
                <div className="flex flex-wrap gap-1.5">
                  {LINE_HEIGHT_OPTIONS.map((option) => {
                    const active = prefs.lineHeightMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updatePrefs({ lineHeightMode: option.value })}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={active
                          ? { borderColor: 'rgba(52, 211, 153, 0.45)', background: 'rgba(16, 185, 129, 0.16)', color: '#d1fae5' }
                          : { borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.72)' }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 lg:px-12" aria-label="Contenido del teleprompter">
          <div
            className="mx-auto prose prose-invert max-w-none prose-headings:text-white prose-p:text-white prose-li:text-white prose-strong:text-white"
            style={{
              maxWidth: `${prefs.textWidth}px`,
              fontSize: `${prefs.fontScale}px`,
              lineHeight,
            }}
          >
            <ReactMarkdown>{script}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
