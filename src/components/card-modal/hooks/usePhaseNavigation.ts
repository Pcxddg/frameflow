import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelId } from '../types';
import { PANEL_ORDER } from '../constants';

export function usePhaseNavigation(initialPanel: PanelId) {
  const panelRefs = useRef<Record<PanelId, HTMLDivElement | null>>({
    idea: null, title: null, script: null, thumbnail: null, editing: null, publish: null, postpub: null,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedPanels, setExpandedPanels] = useState<Set<PanelId>>(() => new Set([initialPanel]));
  const [activePanel, setActivePanel] = useState<PanelId>(initialPanel);
  const [showAll, setShowAll] = useState(false);
  const didInitialScroll = useRef(false);

  const setPanelRef = useCallback((id: PanelId, el: HTMLDivElement | null) => {
    panelRefs.current[id] = el;
  }, []);

  const togglePanel = useCallback((id: PanelId) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActivePanel(id);
  }, []);

  const expandPanel = useCallback((id: PanelId) => {
    setExpandedPanels(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setActivePanel(id);
    const el = panelRefs.current[id];
    if (el) {
      window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, []);

  const toggleShowAll = useCallback(() => {
    setShowAll(prev => {
      const next = !prev;
      if (next) {
        setExpandedPanels(new Set(PANEL_ORDER));
      } else {
        setExpandedPanels(new Set([activePanel]));
      }
      return next;
    });
  }, [activePanel]);

  // Scroll-spy: update activePanel based on scroll position
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root) return;

    const update = () => {
      const rootTop = root.getBoundingClientRect().top;
      let best: PanelId = activePanel;
      for (const id of PANEL_ORDER) {
        const el = panelRefs.current[id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top - rootTop;
        if (top <= 140) best = id;
      }
      setActivePanel(prev => (prev === best ? prev : best));
    };

    root.addEventListener('scroll', update, { passive: true });
    return () => root.removeEventListener('scroll', update);
  }, [activePanel]);

  // Initial scroll (once)
  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    const el = panelRefs.current[initialPanel];
    if (el) {
      window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    scrollContainerRef,
    expandedPanels,
    activePanel,
    showAll,
    setPanelRef,
    togglePanel,
    expandPanel,
    toggleShowAll,
    isPanelExpanded: (id: PanelId) => expandedPanels.has(id),
  };
}
