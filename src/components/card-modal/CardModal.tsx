import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import type { CardData } from '../../types';
import type { CardModalLocation, CardModalSectionId } from '../../lib/cardModalEvents';
import type { PanelId } from './types';

import { useCardDerived } from './hooks/useCardDerived';
import { useCardActions } from './hooks/useCardActions';
import { useCardAi } from './hooks/useCardAi';
import { usePhaseNavigation } from './hooks/usePhaseNavigation';

import { CardModalHeader } from './CardModalHeader';
import { CardModalPhaseNav } from './CardModalPhaseNav';
import { IdeaPanel } from './panels/IdeaPanel';
import { TitlePanel } from './panels/TitlePanel';
import { ScriptPanel } from './panels/ScriptPanel';
import { ThumbnailPanel } from './panels/ThumbnailPanel';
import { EditingPanel } from './panels/EditingPanel';
import { PublishPanel } from './panels/PublishPanel';
import { PostPubPanel } from './panels/PostPubPanel';

interface CardModalProps {
  card: CardData;
  onClose: () => void;
  initialSection?: CardModalSectionId;
  initialLocation?: CardModalLocation;
  readOnly?: boolean;
}

function resolveInitialPanel(section?: CardModalSectionId, location?: CardModalLocation, phasePanel?: PanelId): PanelId {
  if (location) {
    if (location.section === 'brief') return 'idea';
    if (location.section === 'package') return location.focus === 'thumbnail' ? 'thumbnail' : 'title';
    if (location.section === 'production') return location.focus === 'script' ? 'script' : 'editing';
    if (location.section === 'publish') return 'publish';
    if (location.section === 'today') return phasePanel || 'idea';
  }
  if (section === 'seo') return 'publish';
  if (section === 'checklists' || section === 'production') return 'editing';
  if (section === 'post' || section === 'monetization') return 'postpub';
  return phasePanel || 'idea';
}

export function CardModal({ card, onClose, initialSection = 'summary', initialLocation, readOnly = false }: CardModalProps) {
  const derived = useCardDerived(card, readOnly);
  const actions = useCardActions(card, readOnly);
  const ai = useCardAi(card, actions, readOnly);

  const initialPanel = resolveInitialPanel(initialSection, initialLocation, derived.phase.panel);
  const nav = usePhaseNavigation(initialPanel);

  const [headerOffset, setHeaderOffset] = useState<number>(() =>
    typeof document !== 'undefined' ? document.querySelector('header')?.getBoundingClientRect().height ?? 0 : 0
  );

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { body, documentElement } = document;
    const prevBody = body.style.overflow;
    const prevHtml = documentElement.style.overflow;
    const prevPad = body.style.paddingRight;
    const scrollbar = Math.max(0, window.innerWidth - documentElement.clientWidth);
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => { body.style.overflow = prevBody; documentElement.style.overflow = prevHtml; body.style.paddingRight = prevPad; };
  }, []);

  // Track header height
  useEffect(() => {
    const update = () => setHeaderOffset(document.querySelector('header')?.getBoundingClientRect().height ?? 0);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleSelectPanel = useCallback((id: PanelId) => {
    nav.expandPanel(id);
  }, [nav]);

  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-x-0 bottom-0 z-40 ff-fade-in sm:px-5 sm:pb-5" style={{ top: `${headerOffset}px` }} onClick={onClose}>
      <div
        className="ff-card-modal flex h-full w-full flex-col overflow-hidden shadow-xl ff-scale-in sm:rounded-[2.1rem] sm:border"
        style={{ background: 'var(--ff-surface-muted)', borderColor: 'var(--ff-border-medium)' }}
        onClick={e => e.stopPropagation()}
      >
        <CardModalHeader card={card} phase={derived.phase} actions={actions} ai={ai} readOnly={readOnly} onClose={onClose} />

        {ai.aiNotice && (
          <div className="flex items-center gap-2 px-5 py-2 shrink-0" style={{ background: 'var(--ff-warning-bg)', borderBottom: '1px solid var(--ff-warning-border)' }}>
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1 text-sm" style={{ color: 'var(--ff-warning-text)' }}>{ai.aiNotice}</span>
            <button onClick={ai.clearAiNotice} className="p-0.5" style={{ color: 'var(--ff-warning-text)' }}><X size={14} /></button>
          </div>
        )}

        {readOnly && (
          <div className="px-5 py-2 shrink-0" style={{ background: 'var(--ff-surface-raised)', borderBottom: '1px solid var(--ff-border)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--ff-text-secondary)' }}>
              Solo lectura. No puedes editar con tu rol actual.
            </span>
          </div>
        )}

        <CardModalPhaseNav
          activePanel={nav.activePanel}
          onSelectPanel={handleSelectPanel}
          showAll={nav.showAll}
          onToggleShowAll={nav.toggleShowAll}
          derived={derived}
        />

        <div ref={nav.scrollContainerRef} className="ff-scrollbar flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto max-w-4xl space-y-4">
            <IdeaPanel card={card} expanded={nav.isPanelExpanded('idea')} onToggle={() => nav.togglePanel('idea')} actions={actions} ai={ai} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('idea', el)} />
            <TitlePanel card={card} expanded={nav.isPanelExpanded('title')} onToggle={() => nav.togglePanel('title')} actions={actions} ai={ai} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('title', el)} />
            <ScriptPanel card={card} expanded={nav.isPanelExpanded('script')} onToggle={() => nav.togglePanel('script')} actions={actions} ai={ai} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('script', el)} />
            <ThumbnailPanel card={card} expanded={nav.isPanelExpanded('thumbnail')} onToggle={() => nav.togglePanel('thumbnail')} actions={actions} ai={ai} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('thumbnail', el)} />
            <EditingPanel card={card} expanded={nav.isPanelExpanded('editing')} onToggle={() => nav.togglePanel('editing')} actions={actions} derived={derived} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('editing', el)} />
            <PublishPanel card={card} expanded={nav.isPanelExpanded('publish')} onToggle={() => nav.togglePanel('publish')} actions={actions} ai={ai} derived={derived} readOnly={readOnly} setPanelRef={el => nav.setPanelRef('publish', el)} />
            <PostPubPanel card={card} expanded={nav.isPanelExpanded('postpub')} onToggle={() => nav.togglePanel('postpub')} actions={actions} derived={derived} readOnly={readOnly} onClose={onClose} setPanelRef={el => nav.setPanelRef('postpub', el)} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
