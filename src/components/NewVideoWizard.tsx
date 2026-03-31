import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Lightbulb, Sparkles, Target, Wand2, X } from 'lucide-react';
import { useBoard } from '../store';
import { useIsMobile } from '../hooks/useIsMobile';
import { getAiErrorMessage } from '../lib/gemini';
import { generateBriefSuggestions, generateVideoSeedDraft, type VideoSeedDraft, type VideoSeedSection } from '../lib/videoFlowAi';

interface NewVideoWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;

function getDefaultPublishAtInput() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(18, 0, 0, 0);
  return new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function parseLines(text: string) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function uniqueSections(sections: VideoSeedSection[]) {
  return Array.from(new Set(sections));
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>
      {children}
    </span>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-12 w-full rounded-2xl px-4 py-3 text-sm outline-none ${props.className || ''}`}
      style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)', ...(props.style || {}) }}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-2xl px-4 py-3 text-sm outline-none resize-none ${props.className || ''}`}
      style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)', ...(props.style || {}) }}
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-h-12 w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none ${props.className || ''}`}
      style={{ background: 'var(--ff-input-bg)', color: 'var(--ff-text-primary)', border: '1px solid var(--ff-input-border)', ...(props.style || {}) }}
    />
  );
}

const wizardPrimarySoftButtonStyle = {
  background: 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))',
  border: '1px solid color-mix(in srgb, var(--ff-primary) 18%, var(--ff-border))',
  color: 'var(--ff-primary)',
};

const wizardErrorNoticeStyle = {
  borderColor: 'var(--ff-danger-border)',
  background: 'var(--ff-danger-bg)',
  color: 'var(--ff-danger-text)',
};

function StepCard({
  active,
  done,
  kicker,
  title,
  description,
  icon,
  mobile,
  compact = false,
}: {
  active: boolean;
  done: boolean;
  kicker: string;
  title: string;
  description: string;
  icon: ReactNode;
  mobile: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.4rem] border ${mobile ? 'min-w-[180px] snap-start p-3.5' : compact ? 'p-3' : 'p-4'}`}
      style={{
        borderColor: active ? 'color-mix(in srgb, var(--ff-primary) 30%, var(--ff-border))' : 'var(--ff-border)',
        background: active ? 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))' : 'var(--ff-surface-solid)',
        boxShadow: active ? 'var(--ff-shadow-sm)' : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center rounded-2xl ${compact ? 'h-8 w-8' : 'h-9 w-9'}`} style={{ background: done || active ? 'color-mix(in srgb, var(--ff-primary) 16%, transparent)' : 'var(--ff-bg-subtle)' }}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: active ? 'var(--ff-primary)' : 'var(--ff-text-tertiary)' }}>{kicker}</p>
          <p className={`mt-1 font-bold ${compact ? 'text-[13px]' : 'text-sm'}`} style={{ color: 'var(--ff-text-primary)' }}>{title}</p>
        </div>
      </div>
      {!mobile && !compact && <p className="mt-3 text-xs leading-5" style={{ color: 'var(--ff-text-secondary)' }}>{description}</p>}
    </div>
  );
}

function RegenerableBlock({
  label,
  description,
  loading,
  onRegenerate,
  children,
}: {
  label: string;
  description: string;
  loading: boolean;
  onRegenerate: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.35rem] border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-solid)' }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{label}</p>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>{description}</p>
        </div>
        <button onClick={onRegenerate} disabled={loading} className="rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-50" style={wizardPrimarySoftButtonStyle}>
          {loading ? 'Regenerando...' : 'Regenerar'}
        </button>
      </div>
      {children}
    </div>
  );
}

export function NewVideoWizard({ isOpen, onClose }: NewVideoWizardProps) {
  const { createVideoFromFlow } = useBoard();
  const isMobile = useIsMobile();
  const [step, setStep] = useState<WizardStep>(0);
  const [idea, setIdea] = useState('');
  const [audience, setAudience] = useState('');
  const [question, setQuestion] = useState('');
  const [promise, setPromise] = useState('');
  const [tone, setTone] = useState('');
  const [creatorNotes, setCreatorNotes] = useState('');
  const [contentType, setContentType] = useState<'long' | 'short'>('long');
  const [publishAt, setPublishAt] = useState(getDefaultPublishAtInput());
  const [aiPackage, setAiPackage] = useState<VideoSeedDraft | null>(null);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewTitleAlternatives, setReviewTitleAlternatives] = useState('');
  const [reviewHook, setReviewHook] = useState('');
  const [reviewResearchSummary, setReviewResearchSummary] = useState('');
  const [reviewOpenQuestions, setReviewOpenQuestions] = useState('');
  const [reviewScriptBase, setReviewScriptBase] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<'package' | VideoSeedSection | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [regeneratedSections, setRegeneratedSections] = useState<VideoSeedSection[]>([]);
  const [isSuggestingBrief, setIsSuggestingBrief] = useState(false);
  const [briefSuggestionError, setBriefSuggestionError] = useState<string | null>(null);
  const [hasSuggestedBrief, setHasSuggestedBrief] = useState(false);

  const resetState = useCallback(() => {
    setStep(0);
    setIdea('');
    setAudience('');
    setQuestion('');
    setPromise('');
    setTone('');
    setCreatorNotes('');
    setContentType('long');
    setPublishAt(getDefaultPublishAtInput());
    setAiPackage(null);
    setReviewTitle('');
    setReviewTitleAlternatives('');
    setReviewHook('');
    setReviewResearchSummary('');
    setReviewOpenQuestions('');
    setReviewScriptBase('');
    setIsGenerating(false);
    setGeneratingSection(null);
    setAiError(null);
    setRegeneratedSections([]);
    setIsSuggestingBrief(false);
    setBriefSuggestionError(null);
    setHasSuggestedBrief(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetState();
  }, [isOpen, resetState]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const intakeInput = useMemo(() => ({
    idea: idea.trim(),
    audience: audience.trim(),
    question: question.trim(),
    promise: promise.trim(),
    tone: tone.trim(),
    creatorNotes: creatorNotes.trim(),
  }), [audience, creatorNotes, idea, promise, question, tone]);

  const applyDraftToReview = useCallback((draft: VideoSeedDraft) => {
    setReviewTitle(draft.title || idea.trim());
    setReviewTitleAlternatives(draft.titleAlternatives.join('\n'));
    setReviewHook(draft.hook);
    setReviewResearchSummary(draft.researchSummary);
    setReviewOpenQuestions(draft.openQuestions.join('\n'));
    setReviewScriptBase(draft.scriptBase);
  }, [idea]);

  const applyBriefSuggestionDraft = useCallback((
    draft: {
      audience: string;
      question: string;
      promise: string;
      tone: string;
      creatorNotes: string;
    },
    force = false
  ) => {
    if (force || !audience.trim()) setAudience(draft.audience);
    if (force || !question.trim()) setQuestion(draft.question);
    if (force || !promise.trim()) setPromise(draft.promise);
    if (force || !tone.trim()) setTone(draft.tone);
    if (force || !creatorNotes.trim()) setCreatorNotes(draft.creatorNotes);
  }, [audience, creatorNotes, promise, question, tone]);

  const handleSuggestBrief = useCallback(async (force = false) => {
    if (!idea.trim()) return;
    setIsSuggestingBrief(true);
    setBriefSuggestionError(null);
    try {
      const draft = await generateBriefSuggestions(intakeInput);
      applyBriefSuggestionDraft(draft, force);
      setHasSuggestedBrief(true);
    } catch (error) {
      setBriefSuggestionError(getAiErrorMessage(error, 'No se pudieron sugerir las respuestas del brief. Puedes seguir manualmente.'));
    } finally {
      setIsSuggestingBrief(false);
    }
  }, [applyBriefSuggestionDraft, idea, intakeInput]);

  useEffect(() => {
    const allBriefFieldsEmpty = !audience.trim() && !question.trim() && !promise.trim() && !tone.trim() && !creatorNotes.trim();
    if (step !== 1 || !idea.trim() || hasSuggestedBrief || !allBriefFieldsEmpty) return;
    void handleSuggestBrief(false);
  }, [audience, creatorNotes, handleSuggestBrief, hasSuggestedBrief, idea, promise, question, step, tone]);

  const handleGeneratePackage = useCallback(async () => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    setGeneratingSection('package');
    setAiError(null);
    try {
      const draft = await generateVideoSeedDraft(intakeInput, 'package');
      setAiPackage(draft);
      applyDraftToReview(draft);
    } catch (error) {
      setAiError(getAiErrorMessage(error, 'No se pudo generar el paquete base con IA. Puedes seguir y crear la tarjeta manualmente.'));
    } finally {
      setIsGenerating(false);
      setGeneratingSection(null);
    }
  }, [applyDraftToReview, idea, intakeInput]);

  const handleRegenerateSection = useCallback(async (section: VideoSeedSection) => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    setGeneratingSection(section);
    setAiError(null);
    try {
      const partial = await generateVideoSeedDraft(intakeInput, section);
      setAiPackage((previous) => ({
        title: section === 'title' ? partial.title : previous?.title || reviewTitle || idea.trim(),
        titleAlternatives: section === 'title' ? partial.titleAlternatives : previous?.titleAlternatives || parseLines(reviewTitleAlternatives),
        hook: section === 'hook' ? partial.hook : previous?.hook || reviewHook,
        researchSummary: section === 'research' ? partial.researchSummary : previous?.researchSummary || reviewResearchSummary,
        openQuestions: section === 'research' ? partial.openQuestions : previous?.openQuestions || parseLines(reviewOpenQuestions),
        scriptBase: section === 'script' ? partial.scriptBase : previous?.scriptBase || reviewScriptBase,
      }));

      if (section === 'title') {
        setReviewTitle(partial.title || idea.trim());
        setReviewTitleAlternatives(partial.titleAlternatives.join('\n'));
      } else if (section === 'hook') {
        setReviewHook(partial.hook);
      } else if (section === 'research') {
        setReviewResearchSummary(partial.researchSummary);
        setReviewOpenQuestions(partial.openQuestions.join('\n'));
      } else {
        setReviewScriptBase(partial.scriptBase);
      }

      setRegeneratedSections((previous) => uniqueSections([...previous, section]));
    } catch (error) {
      setAiError(getAiErrorMessage(error, 'No se pudo regenerar esta seccion ahora mismo. Puedes editarla a mano y seguir.'));
    } finally {
      setIsGenerating(false);
      setGeneratingSection(null);
    }
  }, [idea, intakeInput, reviewHook, reviewOpenQuestions, reviewResearchSummary, reviewScriptBase, reviewTitle, reviewTitleAlternatives]);

  const steps = useMemo(() => ([
    { id: 0, kicker: 'Paso 1', title: 'Idea base', icon: <Lightbulb size={16} className="text-amber-600" />, description: 'El intake humano cierra la etapa de idea.' },
    { id: 1, kicker: 'Paso 2', title: 'Preguntas clave', icon: <Target size={16} className="text-emerald-600" />, description: 'Este brief alimenta al equipo y a la IA.' },
    { id: 2, kicker: 'Paso 3', title: 'Generar con IA', icon: <Sparkles size={16} className="text-indigo-600" />, description: 'La IA empieza, pero no completa etapas.' },
    { id: 3, kicker: 'Paso 4', title: 'Revisar y crear', icon: <CheckCircle2 size={16} className="text-blue-600" />, description: 'Aceptas, corriges y recien ahi creamos el video.' },
  ]), []);

  if (!isOpen || typeof document === 'undefined') return null;

  const canGoNext = step === 0 ? !!idea.trim() : step === 3 ? !!reviewTitle.trim() && !!publishAt : true;

  const handleNext = () => {
    if (step === 2 && !reviewTitle.trim()) setReviewTitle(idea.trim());
    if (!canGoNext) return;
    setStep((previous) => Math.min(previous + 1, 3) as WizardStep);
  };

  const handleCreate = () => {
    if (!idea.trim() || !reviewTitle.trim() || !publishAt) return;
    const parsedPublishAt = new Date(publishAt);
    createVideoFromFlow({
      idea: idea.trim(),
      title: reviewTitle.trim(),
      publishAt: Number.isNaN(parsedPublishAt.getTime()) ? new Date().toISOString() : parsedPublishAt.toISOString(),
      audience: audience.trim(),
      question: question.trim(),
      promise: promise.trim(),
      tone: tone.trim(),
      creatorNotes: creatorNotes.trim(),
      researchSummary: reviewResearchSummary.trim(),
      openQuestions: parseLines(reviewOpenQuestions),
      titleAlternatives: reviewTitleAlternatives.trim(),
      hook: reviewHook.trim(),
      scriptBase: reviewScriptBase.trim(),
      usedAI: !!aiPackage,
      regeneratedSections,
      contentType,
    });
    onClose();
  };

  const wizard = (
    <div className={`fixed inset-0 z-50 flex justify-center ${isMobile ? 'items-stretch p-0' : 'items-center p-4'}`} onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={`relative w-full overflow-hidden ff-scale-in ${isMobile ? 'h-[100dvh] max-h-[100dvh] rounded-none border-0 max-w-none' : 'border max-w-[1120px] rounded-[2rem]'}`}
        style={{
          background: 'var(--ff-surface-solid)',
          borderColor: 'var(--ff-border)',
          boxShadow: '0 32px 80px -42px rgba(15, 23, 42, 0.45)',
          ...(isMobile ? {} : { height: 'min(92dvh, 860px)' }),
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full flex-col" style={isMobile ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}>
          <div className={`shrink-0 flex items-start justify-between gap-4 border-b ${isMobile ? 'px-4 py-4' : 'px-5 py-3.5'}`} style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--ff-primary) 12%, transparent)', color: 'var(--ff-primary)' }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Nuevo video guiado</p>
                  <h2 className={`mt-1 font-black ${isMobile ? 'text-lg' : 'text-xl'}`} style={{ color: 'var(--ff-text-primary)' }}>Idea first + IA asistida</h2>
                </div>
              </div>
              <p className={`mt-2 ${isMobile ? 'max-w-none text-xs leading-5' : 'max-w-3xl text-[13px] leading-5'}`} style={{ color: 'var(--ff-text-secondary)' }}>
                {isMobile
                  ? 'Partimos de la idea, sembramos borradores con IA y el flujo real sigue mandando.'
                  : 'Arrancamos desde la idea, sembramos borradores con IA y la Guia sigue obedeciendo el productionFlow real, no el texto generado.'}
              </p>
            </div>
            <button onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--ff-surface-muted)', color: 'var(--ff-text-secondary)' }}>
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
            <aside className={`${isMobile ? 'border-b px-4 py-3' : 'shrink-0 border-b px-5 py-3'}`} style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-muted)' }}>
              <div className={`${isMobile ? 'flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar' : 'grid grid-cols-4 gap-2'}`}>
                {steps.map((item) => (
                  <StepCard
                    key={item.id}
                    active={step === item.id}
                    done={step > item.id}
                    kicker={item.kicker}
                    title={item.title}
                    description={item.description}
                    icon={item.icon}
                    mobile={isMobile}
                    compact={!isMobile}
                  />
                ))}
              </div>
            </aside>

            <div className="ff-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className={`mx-auto w-full ${isMobile ? 'space-y-5 p-4 pb-6' : 'max-w-5xl space-y-4 p-5 lg:px-6 lg:py-5'}`}>
                {step === 0 && (
                  <section className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Idea base</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>Define la tesis del video</h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                        Este paso es trabajo humano real. Por eso la etapa Idea quedara completada y la Guia te empujara a Investigacion como siguiente paso operativo.
                      </p>
                    </div>
                    <label className="block">
                      <FieldLabel>Idea principal</FieldLabel>
                      <TextArea value={idea} onChange={(event) => setIdea(event.target.value)} autoFocus rows={5} placeholder="Ej: Quiero demostrar si una PS2 realmente es menos potente que un telefono actual y en que sentido la comparacion suele estar mal planteada." />
                    </label>
                  </section>
                )}

                {step === 1 && (
                  <section className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Brief operativo</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>Responde las preguntas clave</h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                        Con la idea base ya te sugerimos la mayor parte del brief. Tu aqui mas bien corriges, afinas o reemplazas lo que no te convenza.
                      </p>
                    </div>
                    <div className="rounded-[1.35rem] border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold" style={{ color: 'var(--ff-text-primary)' }}>Sugerencias desde la idea</p>
                          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                            Audiencia, tono, pregunta, promesa y notas pueden nacer ya sugeridas para que no tengas que llenar todo a mano.
                          </p>
                        </div>
                        <button onClick={() => void handleSuggestBrief(true)} disabled={isSuggestingBrief || !idea.trim()} className={`rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${isMobile ? 'w-full text-center' : ''}`} style={wizardPrimarySoftButtonStyle}>
                          {isSuggestingBrief ? 'Sugiriendo...' : hasSuggestedBrief ? 'Actualizar sugerencias' : 'Sugerir ahora'}
                        </button>
                      </div>
                      {briefSuggestionError && (
                        <div className="mt-3 rounded-2xl border px-4 py-3 text-sm" style={wizardErrorNoticeStyle}>
                          {briefSuggestionError}
                        </div>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block"><FieldLabel>Audiencia</FieldLabel><TextInput value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Curiosos, gamers nostalgicos, publico tech..." /></label>
                      <label className="block"><FieldLabel>Tono</FieldLabel><TextInput value={tone} onChange={(event) => setTone(event.target.value)} placeholder="Comparativo, polemico, tecnico simple..." /></label>
                    </div>
                    <label className="block"><FieldLabel>Pregunta exacta</FieldLabel><TextInput value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Que pregunta exacta respondera este video?" /></label>
                    <label className="block"><FieldLabel>Promesa del video</FieldLabel><TextInput value={promise} onChange={(event) => setPromise(event.target.value)} placeholder="Que va a demostrar o resolver este video?" /></label>
                    <label className="block"><FieldLabel>Notas del creador</FieldLabel><TextArea value={creatorNotes} onChange={(event) => setCreatorNotes(event.target.value)} rows={4} placeholder="Referencias, dudas, ejemplos, pruebas visuales, decisiones..." /></label>
                    <label className="block">
                      <FieldLabel>Tipo de contenido</FieldLabel>
                      <Select value={contentType} onChange={(event) => setContentType(event.target.value as 'long' | 'short')}>
                        <option value="long">Video largo principal</option>
                        <option value="short">Short</option>
                      </Select>
                    </label>
                  </section>
                )}

                {step === 2 && (
                  <section className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Generar con IA</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>Siembra sin completar etapas</h3>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                        La IA solo deja borradores listos para validar. No se cerraran automaticamente title_hook ni script.
                      </p>
                    </div>
                    <div className="rounded-[1.6rem] border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm leading-6" style={{ color: 'var(--ff-text-secondary)' }}>
                          Generaremos: titulo recomendado, alternativas, hook, resumen de investigacion, preguntas abiertas y escaleta base.
                        </p>
                        <button onClick={() => void handleGeneratePackage()} disabled={isGenerating || !idea.trim()} className={`flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${isMobile ? 'w-full justify-center' : ''}`} style={{ background: 'linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))' }}>
                          <Wand2 size={15} />
                          {generatingSection === 'package' ? 'Generando...' : aiPackage ? 'Volver a generar' : 'Generar con IA'}
                        </button>
                      </div>
                      {aiError && <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={wizardErrorNoticeStyle}>{aiError}</div>}
                      {aiPackage && (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <PreviewCard title="Titulo recomendado" body={aiPackage.title || 'Sin sugerencia'} />
                          <PreviewCard title="Hook" body={aiPackage.hook || 'Sin sugerencia'} />
                          <PreviewCard title="Investigacion resumida" body={aiPackage.researchSummary || 'Sin sugerencia'} />
                          <PreviewCard title="Escaleta base" body={aiPackage.scriptBase || 'Sin sugerencia'} preserve />
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {step === 3 && (
                  <section className="space-y-5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ff-text-tertiary)' }}>Revision final</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: 'var(--ff-text-primary)' }}>Edita y crea</h3>
                    </div>
                    {aiPackage && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => applyDraftToReview(aiPackage)} className={`rounded-full px-4 py-2 text-xs font-semibold ${isMobile ? 'w-full text-center' : ''}`} style={wizardPrimarySoftButtonStyle}>
                          Aceptar todo desde IA
                        </button>
                        <span className="text-xs" style={{ color: 'var(--ff-text-tertiary)' }}>La IA empieza, no completa.</span>
                      </div>
                    )}
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-4">
                        <label className="block"><FieldLabel>Titulo final provisional</FieldLabel><TextInput value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} placeholder="Titulo que entrara a la tarjeta" /></label>
                        <RegenerableBlock label="Alternativas de titulo" description="Una por linea." loading={generatingSection === 'title'} onRegenerate={() => void handleRegenerateSection('title')}><TextArea rows={6} value={reviewTitleAlternatives} onChange={(event) => setReviewTitleAlternatives(event.target.value)} /></RegenerableBlock>
                        <RegenerableBlock label="Hook" description="Sembrado, no aprobado automaticamente." loading={generatingSection === 'hook'} onRegenerate={() => void handleRegenerateSection('hook')}><TextArea rows={4} value={reviewHook} onChange={(event) => setReviewHook(event.target.value)} /></RegenerableBlock>
                      </div>
                      <div className="space-y-4">
                        <RegenerableBlock label="Resumen de investigacion" description="Borrador inicial para research." loading={generatingSection === 'research'} onRegenerate={() => void handleRegenerateSection('research')}><TextArea rows={5} value={reviewResearchSummary} onChange={(event) => setReviewResearchSummary(event.target.value)} /></RegenerableBlock>
                        <label className="block"><FieldLabel>Preguntas abiertas</FieldLabel><TextArea rows={4} value={reviewOpenQuestions} onChange={(event) => setReviewOpenQuestions(event.target.value)} placeholder="Una por linea" /></label>
                        <RegenerableBlock label="Escaleta / guion base" description="La etapa script seguira abierta hasta validacion humana." loading={generatingSection === 'script'} onRegenerate={() => void handleRegenerateSection('script')}><TextArea rows={7} value={reviewScriptBase} onChange={(event) => setReviewScriptBase(event.target.value)} /></RegenerableBlock>
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),260px]">
                      <label className="block"><FieldLabel>Fecha y hora de publicacion</FieldLabel><TextInput type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} /></label>
                      <div className="rounded-[1.35rem] border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-raised)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>Estado inicial</p>
                        <ul className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--ff-text-primary)' }}>
                          <li>Idea: done por este intake.</li>
                          <li>Research: in progress.</li>
                          <li>Title / Hook y Script: borrador IA listo, pendiente de validacion.</li>
                        </ul>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>

          <div
            className={`border-t ${isMobile ? 'px-4 pt-3' : 'px-5 py-4'}`}
            style={{
              borderColor: 'var(--ff-border)',
              background: 'var(--ff-surface-solid)',
              paddingBottom: isMobile ? 'calc(0.9rem + env(safe-area-inset-bottom))' : undefined,
            }}
          >
            {isMobile ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>
                    Paso {step + 1} de {steps.length}
                  </span>
                  <div className="flex items-center gap-2">
                    {steps.map((item) => (
                      <span key={item.id} className="h-2.5 rounded-full transition-all" style={{ width: step === item.id ? 28 : 10, background: step >= item.id ? 'var(--ff-primary)' : 'var(--ff-border-medium)' }} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={step === 0 ? onClose : () => setStep((previous) => Math.max(previous - 1, 0) as WizardStep)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-primary)' }}>
                    <ArrowLeft size={15} />
                    {step === 0 ? 'Cerrar' : 'Volver'}
                  </button>

                  {step < 3 ? (
                    <button onClick={handleNext} disabled={!canGoNext} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))' }}>
                      {step === 2 ? 'Revisar' : 'Siguiente'}
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button onClick={handleCreate} disabled={!reviewTitle.trim() || !publishAt || !idea.trim()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))' }}>
                      Crear video
                      <Sparkles size={15} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button onClick={step === 0 ? onClose : () => setStep((previous) => Math.max(previous - 1, 0) as WizardStep)} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold" style={{ background: 'var(--ff-bg-subtle)', color: 'var(--ff-text-primary)' }}>
                  <ArrowLeft size={15} />
                  {step === 0 ? 'Cerrar' : 'Volver'}
                </button>

                <div className="flex items-center gap-2">
                  {steps.map((item) => (
                    <span key={item.id} className="h-2.5 rounded-full transition-all" style={{ width: step === item.id ? 28 : 10, background: step >= item.id ? 'var(--ff-primary)' : 'var(--ff-border-medium)' }} />
                  ))}
                </div>

                {step < 3 ? (
                  <button onClick={handleNext} disabled={!canGoNext} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))' }}>
                    {step === 2 ? 'Revisar y continuar' : 'Siguiente'}
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button onClick={handleCreate} disabled={!reviewTitle.trim() || !publishAt || !idea.trim()} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))' }}>
                    Crear video guiado
                    <Sparkles size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(wizard, document.body);
}

function PreviewCard({ title, body, preserve }: { title: string; body: string; preserve?: boolean }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--ff-border)', background: 'var(--ff-surface-solid)' }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--ff-text-tertiary)' }}>{title}</p>
      <p className={`mt-2 text-sm ${preserve ? 'whitespace-pre-wrap' : ''}`} style={{ color: 'var(--ff-text-primary)' }}>{body}</p>
    </div>
  );
}

