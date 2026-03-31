/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Board } from './components/Board';
import { Chatbot } from './components/Chatbot';
import { TeamGuide } from './components/TeamGuide';
import { Dashboard } from './components/Dashboard';
import { FilterBar, ContentFilter, AssigneeFilter } from './components/FilterBar';
import { BoardSettings } from './components/BoardSettings';
import { BoardProvider, useBoard } from './store';
import { LogOut, Plus, LogIn, BarChart3, Layout, Users, Loader2, X, Trash2, UserPlus, Check, AlertCircle, ChevronDown, Tv, Home, Info, Menu, MessageSquare, Settings, Shield, Eye } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { ChannelHome } from './components/ChannelHome';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useIsMobile } from './hooks/useIsMobile';
import { getAuditRoleLabel, buildGuideSyncSnapshot } from './lib/optimizedVideoFlow';
import { dispatchOpenCardModal } from './lib/cardModalEvents';
import type { CardModalLocation } from './lib/cardModalEvents';
import { createPresenceController } from './lib/presence';
import { ThemeProvider } from './useTheme';
import type { BoardPresenceEvent, BoardPresenceMember, DesktopRailPanel, PresenceSurface } from './types';

type View = 'home' | 'board' | 'dashboard';
type MobileSheet = 'menu' | 'share' | 'chatbot' | 'boards' | null;

function getDesktopRailPanelKey(uid: string, boardId: string) {
  return `ff-desktop-rail:${uid}:${boardId}`;
}

function getPresenceSurfaceLabel(surface: PresenceSurface | null | undefined) {
  if (surface === 'guide') return 'en la guia';
  if (surface === 'dashboard') return 'en el dashboard';
  if (surface === 'board') return 'en el tablero';
  if (surface === 'channel_home') return 'en inicio';
  return 'en FrameFlow';
}

function formatPresenceTime(value?: string) {
  if (!value) return 'sin actividad';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'sin actividad';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));

  if (diffMinutes < 60) {
    return `hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `hace ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `hace ${diffDays} d`;
  }

  return new Date(value).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}

function isPresenceCurrentlyOnline(presence?: BoardPresenceMember | null) {
  if (!presence?.lastHeartbeatAt) return false;
  const timestamp = new Date(presence.lastHeartbeatAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < 75_000;
}

function getPresenceMeta(presence?: BoardPresenceMember | null) {
  const isOnline = isPresenceCurrentlyOnline(presence);

  if (!presence) {
    return {
      label: 'Nunca ha entrado',
      detail: 'Tiene acceso, pero aun no registra actividad en FrameFlow.',
      dot: 'bg-slate-300',
      badge: 'bg-slate-100 text-slate-700',
    };
  }

  if (isOnline && presence.isActiveInThisBoard) {
    return {
      label: 'En linea ahora',
      detail: `Activo en este canal${presence.activeSurface ? ` · ${getPresenceSurfaceLabel(presence.activeSurface)}` : ''}`,
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (isOnline) {
    return {
      label: 'En FrameFlow',
      detail: `Online ${getPresenceSurfaceLabel(presence.activeSurface)}`,
      dot: 'bg-sky-500',
      badge: 'bg-sky-100 text-sky-700',
    };
  }

  return {
    label: 'Offline',
    detail: `Ultima vez ${formatPresenceTime(presence.lastSeenAt)}`,
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700',
  };
}

function getPresenceEventCopy(event: BoardPresenceEvent) {
  if (event.type === 'entered_board') return 'entro al canal';
  if (event.type === 'left_board') return 'salio del canal';
  if (event.type === 'came_online') return 'entro a FrameFlow';
  return 'se desconecto';
}

function getPresenceInitial(displayName?: string, email?: string) {
  const source = (displayName || email || '').trim();
  const match = source.match(/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/);
  return (match?.[0] || '?').toUpperCase();
}

function AppContent() {
  const googleAuthEnabled = String(import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED ?? 'true').toLowerCase() !== 'false';
  const authPathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isAuthCallbackRoute = authPathname === '/auth/callback';
  const {
    user,
    isAuthReady,
    signIn,
    signOut,
    boards,
    board,
    currentBoardId,
    readNotice,
    currentUserRole,
    canEditBoard,
    canInviteMembers,
    isBoardOwner,
    boardPresenceMembers,
    boardPresenceEvents,
    onlineMemberCount,
    setCurrentBoardId,
    createBoard,
    inviteMember,
    removeMember,
    deleteBoard,
    saveState,
  } = useBoard();
  const isMobile = useIsMobile();
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'editor' | 'viewer'>('editor');
  const [shareSection, setShareSection] = useState<'invite' | 'members'>('invite');
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sharingMsg, setSharingMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<string | null>(null);
  const [memberRemovalLoading, setMemberRemovalLoading] = useState(false);
  const [view, setView] = useState<View>('home');
  const hasAutoNavigated = useRef(false);
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [desktopRailPanel, setDesktopRailPanel] = useState<DesktopRailPanel>(null);
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');

  useEffect(() => {
    if (!hasAutoNavigated.current && view === 'home' && board && currentBoardId) {
      hasAutoNavigated.current = true;
      setView('board');
    }
  }, [board, currentBoardId, view]);

  useEffect(() => {
    if (!isAuthReady || !user || typeof window === 'undefined') return;

    const currentUrl = new URL(window.location.href);
    const hasAuthParams = currentUrl.searchParams.has('code')
      || currentUrl.searchParams.has('error')
      || currentUrl.hash.includes('access_token')
      || currentUrl.hash.includes('refresh_token');

    if (currentUrl.pathname !== '/auth/callback' && !hasAuthParams) return;

    window.history.replaceState({}, document.title, '/');
  }, [isAuthReady, user]);


  useEffect(() => {
    if (!isMobile) {
      setMobileSheet(null);
      return;
    }

  }, [isMobile]);

  useEffect(() => {
    if (board) return;

    setSharingMsg(null);
    setNewMemberEmail('');
    setMemberPendingRemoval(null);
    setMemberRemovalLoading(false);
    setIsGuideOpen(false);
    setIsSettingsOpen(false);
    setIsChatbotOpen(false);
    setDesktopRailPanel(null);
    setMobileSheet((previous) => (previous === 'share' || previous === 'chatbot' ? null : previous));
  }, [board]);

  useEffect(() => {
    if (canEditBoard) return;

    setMemberPendingRemoval(null);
    setDesktopRailPanel((previous) => (previous === 'share' ? null : previous));
    setMobileSheet((previous) => (previous === 'share' ? null : previous));
  }, [canEditBoard]);

  useEffect(() => {
    if (canEditBoard) return;

    setIsSettingsOpen(false);
    setIsChatbotOpen(false);
    setDesktopRailPanel((previous) => (previous === 'settings' || previous === 'chatbot' ? null : previous));
    setMobileSheet((previous) => (previous === 'chatbot' ? null : previous));
  }, [canEditBoard]);

  useEffect(() => {
    if (isMobile || !user || !board) return;

    const stored = localStorage.getItem(getDesktopRailPanelKey(user.uid, board.id));
    if (stored === 'share' || stored === 'guide' || stored === 'settings' || stored === 'chatbot') {
      setDesktopRailPanel(stored);
      return;
    }

    setDesktopRailPanel(null);
  }, [board?.id, isMobile, user?.uid]);

  useEffect(() => {
    if (isMobile || !user || !board) return;

    if (desktopRailPanel) {
      localStorage.setItem(getDesktopRailPanelKey(user.uid, board.id), desktopRailPanel);
      return;
    }

    localStorage.removeItem(getDesktopRailPanelKey(user.uid, board.id));
  }, [board?.id, desktopRailPanel, isMobile, user?.uid]);

  const resetShareState = () => {
    setSharingMsg(null);
    setNewMemberEmail('');
    setNewMemberRole('editor');
    setShareSection(canInviteMembers ? 'invite' : 'members');
  };

  const closeSharePanel = () => {
    setSharingMsg(null);
    if (isMobile) {
      setMobileSheet(null);
      return;
    }
    setDesktopRailPanel(null);
  };

  const openPresencePanel = () => {
    resetShareState();
    setShareSection('members');
    if (isMobile) {
      setMobileSheet('share');
      return;
    }
    setDesktopRailPanel('share');
  };

  const toggleDesktopRailPanel = (panel: Exclude<DesktopRailPanel, null>) => {
    setDesktopRailPanel((previous) => previous === panel ? null : panel);
  };

  const handleConfirmMemberRemoval = async () => {
    if (!memberPendingRemoval || memberRemovalLoading) return;

    setMemberRemovalLoading(true);
    try {
      await removeMember(memberPendingRemoval);
      setSharingMsg({ ok: true, text: `${memberPendingRemoval} removido del tablero` });
      setMemberPendingRemoval(null);
    } catch (_error) {
      setSharingMsg({ ok: false, text: 'No se pudo quitar el acceso. Intenta otra vez.' });
    } finally {
      setMemberRemovalLoading(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newBoardTitle.trim()) {
      await createBoard(newBoardTitle.trim());
      setNewBoardTitle('');
      setIsCreatingBoard(false);
      if (isMobile) {
        setMobileSheet(null);
        setView('board');
      }
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim() || sharingLoading || !canInviteMembers) return;
    setSharingLoading(true);
    setSharingMsg(null);
    const email = newMemberEmail.trim();
    const result = await inviteMember(email, newMemberRole);
    setSharingLoading(false);
    if (result.ok) {
      const roleLabel = newMemberRole === 'viewer' ? 'solo lectura' : 'permiso de edicion';
      setSharingMsg({
        ok: true,
        text: `Acceso concedido a ${email} con ${roleLabel}. Si aun no tiene cuenta, el canal le aparecera cuando entre con ese mismo correo.`,
      });
      setNewMemberEmail('');
      setNewMemberRole('editor');
      setShareSection('members');
    } else {
      setSharingMsg({ ok: false, text: result.error || 'Error desconocido' });
    }
  };

  const handleMobileNav = (target: 'home' | 'board' | 'dashboard' | 'guide' | 'more') => {
    if (target === 'more') {
      setMobileSheet('menu');
      return;
    }

    if (target === 'guide') {
      if (!board) return;
      setIsGuideOpen(true);
      return;
    }

    setMobileSheet(null);
    setIsGuideOpen(false);
    setView(target);
  };

  const handleRequestOpenCardFromGuide = (cardId: string, location: CardModalLocation = { section: 'today', focus: 'next_action' }) => {
    setView('board');
    setIsGuideOpen(false);
    setDesktopRailPanel((previous) => (previous === 'guide' ? null : previous));
    setMobileSheet(null);

    window.setTimeout(() => {
      dispatchOpenCardModal({ cardId, location });
    }, 80);
  };

  const currentRoleLabel = currentUserRole === 'viewer' ? 'Solo lectura' : currentUserRole === 'editor' ? 'Puede editar' : currentUserRole === 'owner' ? 'Propietario' : null;
  const railGuideAlertToneStyle = (severity: 'critical' | 'warning' | 'info') => (
    severity === 'critical'
      ? {
          card: {
            borderColor: 'var(--ff-danger-border)',
            background: 'color-mix(in srgb, var(--ff-danger-bg) 72%, var(--ff-surface-solid))',
          },
          badge: {
            background: 'var(--ff-danger-bg)',
            color: 'var(--ff-danger-text)',
            border: '1px solid var(--ff-danger-border)',
          },
        }
      : severity === 'warning'
        ? {
            card: {
              borderColor: 'var(--ff-warning-border)',
              background: 'color-mix(in srgb, var(--ff-warning-bg) 72%, var(--ff-surface-solid))',
            },
            badge: {
              background: 'var(--ff-warning-bg)',
              color: 'var(--ff-warning-text)',
              border: '1px solid var(--ff-warning-border)',
            },
          }
        : {
            card: {
              borderColor: 'var(--ff-border)',
              background: 'var(--ff-surface-raised)',
            },
            badge: {
              background: 'var(--ff-info-bg)',
              color: 'var(--ff-info-text)',
              border: '1px solid var(--ff-info-border)',
            },
          }
  );
  const railGuideStatusChipStyle = {
    background: 'var(--ff-surface-solid)',
    color: 'var(--ff-text-secondary)',
    border: '1px solid var(--ff-border)',
  };
  const railGuideWarningChipStyle = {
    background: 'var(--ff-warning-bg)',
    color: 'var(--ff-warning-text)',
    border: '1px solid var(--ff-warning-border)',
  };
  const railGuideDangerChipStyle = {
    background: 'var(--ff-danger-bg)',
    color: 'var(--ff-danger-text)',
    border: '1px solid var(--ff-danger-border)',
  };
  const railGuideInfoChipStyle = {
    background: 'color-mix(in srgb, var(--ff-primary) 14%, var(--ff-surface-solid))',
    color: 'var(--ff-primary)',
    border: '1px solid color-mix(in srgb, var(--ff-primary) 20%, var(--ff-border))',
  };
  const guideSnapshot = board
    ? buildGuideSyncSnapshot(board, board.workflowConfig?.cadence || 1, board.workflowConfig?.activeVideoIds || [])
    : null;
  const guideSummaries = guideSnapshot?.focusCards || [];
  const guideOverdueCount = guideSnapshot?.overdueCount || 0;
  const guideBlockedCount = guideSnapshot?.blockedCount || 0;
  const guidePublishReadyCount = guideSnapshot?.publishReadyCount || 0;
  const guideAlertCount = guideSnapshot ? guideSnapshot.alertCounts.critical + guideSnapshot.alertCounts.warning : 0;
  const activePresenceSurface: PresenceSurface = isGuideOpen || desktopRailPanel === 'guide'
    ? 'guide'
    : view === 'dashboard'
      ? 'dashboard'
      : view === 'board'
        ? 'board'
        : 'channel_home';
  const activePresenceBoardId = view === 'home' ? null : currentBoardId;
  const presenceControllerRef = useRef<ReturnType<typeof createPresenceController> | null>(null);
  const currentUserEmailLowercase = user?.emailLowercase || '';
  const presenceByEmail = useMemo(() => new Map(boardPresenceMembers.map((item) => [item.emailLowercase, item])), [boardPresenceMembers]);
  const currentUserPresence = user ? presenceByEmail.get(user.emailLowercase) || null : null;
  const currentUserIsActiveInBoard = !!currentUserPresence?.isActiveInThisBoard && isPresenceCurrentlyOnline(currentUserPresence);
  const railOnlineMembers = useMemo(
    () => boardPresenceMembers
      .filter((member) =>
        member.isActiveInThisBoard &&
        isPresenceCurrentlyOnline(member) &&
        member.emailLowercase !== currentUserEmailLowercase
      )
      .sort((left, right) => {
        const leftTime = new Date(left.lastHeartbeatAt || left.updatedAt || 0).getTime();
        const rightTime = new Date(right.lastHeartbeatAt || right.updatedAt || 0).getTime();
        return rightTime - leftTime;
      }),
    [boardPresenceMembers, currentUserEmailLowercase]
  );
  const railPresenceMembers = useMemo(() => {
    const nextMembers: BoardPresenceMember[] = [];
    const seenEmails = new Set<string>();

    if (currentUserPresence && currentUserIsActiveInBoard) {
      nextMembers.push(currentUserPresence);
      seenEmails.add(currentUserPresence.emailLowercase);
    }

    railOnlineMembers.forEach((member) => {
      if (seenEmails.has(member.emailLowercase)) return;
      nextMembers.push(member);
      seenEmails.add(member.emailLowercase);
    });

    return nextMembers;
  }, [currentUserIsActiveInBoard, currentUserPresence, railOnlineMembers]);
  const railVisibleMembers = railPresenceMembers.slice(0, 3);
  const railOverflowCount = Math.max(0, railPresenceMembers.length - railVisibleMembers.length);


  useEffect(() => {
    if (!user) {
      const controller = presenceControllerRef.current;
      presenceControllerRef.current = null;
      if (controller) {
        void controller.stop();
      }
      return;
    }

    const controller = createPresenceController(user, {
      activeBoardId: activePresenceBoardId,
      activeSurface: activePresenceSurface,
      memberBoardIds: boards.map((item) => item.id),
    });

    presenceControllerRef.current = controller;

    return () => {
      presenceControllerRef.current = null;
      void controller.stop();
    };
  }, [user?.uid]);

  useEffect(() => {
    presenceControllerRef.current?.updateContext({
      activeBoardId: activePresenceBoardId,
      activeSurface: activePresenceSurface,
      memberBoardIds: boards.map((item) => item.id),
    });
  }, [activePresenceBoardId, activePresenceSurface, boards]);

  if (!isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-200 border-t-blue-600"></div>
          {isAuthCallbackRoute && (
            <p className="text-sm font-medium text-slate-600">
              Conectando tu sesion de Google...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 font-sans">
        <div className="ff-scale-in bg-white/90 backdrop-blur-xl p-8 rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] max-w-sm w-full text-center border border-white/50">
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">FrameFlow</h1>
          <p className="text-gray-500 mb-8 text-sm">Inicia sesion para colaborar con tu equipo en tiempo real.</p>
          <button
            onClick={async () => {
              if (!googleAuthEnabled) {
                setLoginError('Google login sigue desactivado en Supabase Pos. Primero hay que activarlo en Auth > Providers > Google.');
                return;
              }
              setLoginError(null);
              setLoginLoading(true);
              try {
                await signIn();
              } catch (error) {
                const message = error instanceof Error ? error.message : 'No se pudo iniciar sesion con Google.';
                setLoginError(message);
              } finally {
                setLoginLoading(false);
              }
            }}
            disabled={loginLoading || !googleAuthEnabled}
            className="w-full flex items-center justify-center space-x-2 rounded-xl px-4 py-3 font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70"
            style={googleAuthEnabled
              ? undefined
              : {
                  background: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  color: 'white',
                }}
          >
            {loginLoading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            <span>
              {loginLoading
                ? 'Conectando...'
                : googleAuthEnabled
                ? 'Iniciar sesion con Google'
                : 'Google no disponible'}
            </span>
          </button>
          {!googleAuthEnabled && (
            <p className="mt-3 text-xs font-medium text-amber-700">
              El login de Google todavia no esta configurado en el proyecto Supabase `Pos`.
            </p>
          )}
          {loginError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-medium text-amber-800">
              {loginError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const sharePanelContent = (
    <>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
        <div className="min-w-0">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: `var(--ff-text-primary)` }}>
            <Users size={16} className="text-blue-600" />
            Compartir tablero
          </h3>
          {canEditBoard && (
            <p className="mt-1 text-[11px] font-medium" style={{ color: `var(--ff-text-tertiary)` }}>
              {onlineMemberCount > 0 ? `${onlineMemberCount} miembro${onlineMemberCount === 1 ? '' : 's'} online en este canal` : 'Sin miembros online en este canal ahora mismo'}
            </p>
          )}
        </div>
        <button
          onClick={closeSharePanel}
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl p-1" style={{ background: `var(--ff-bg-subtle)` }}>
          {[
            { id: 'invite' as const, label: canInviteMembers ? '1. Invitar' : '1. Acceso' },
            { id: 'members' as const, label: `2. Miembros (${board?.members.length || 0})` },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setShareSection(option.id)}
              className="min-h-10 rounded-[1rem] px-3 py-2 text-xs font-semibold transition-all"
              style={shareSection === option.id
                ? { background: `var(--ff-surface-solid)`, color: `var(--ff-text-primary)`, boxShadow: `var(--ff-shadow-sm)` }
                : { color: `var(--ff-text-tertiary)` }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {sharingMsg && (
        <div className="px-4 pt-3">
          <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs font-medium ${
            sharingMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {sharingMsg.ok ? <Check size={14} className="text-green-500 shrink-0 mt-px" /> : <AlertCircle size={14} className="text-red-500 shrink-0 mt-px" />}
            <span>{sharingMsg.text}</span>
          </div>
        </div>
      )}

      {shareSection === 'invite' ? (
        canInviteMembers ? (
          <form onSubmit={handleShareSubmit} className="p-4 space-y-4">
            <div className="rounded-2xl border p-3" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <label className="text-xs font-semibold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>Email del acceso</label>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  autoFocus
                  placeholder="nombre@email.com"
                  value={newMemberEmail}
                  onChange={(e) => { setNewMemberEmail(e.target.value); setSharingMsg(null); }}
                  className="flex-1 px-3 py-2.5 text-sm rounded-xl outline-none transition-all"
                  style={{ color: `var(--ff-text-primary)`, background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-input-border)` }}
                  disabled={sharingLoading}
                />
                <button
                  type="submit"
                  disabled={sharingLoading || !newMemberEmail.trim()}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {sharingLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Invitar
                </button>
              </div>
            </div>

            <div className="rounded-2xl border p-3" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <label className="text-xs font-semibold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>Permiso</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    value: 'editor' as const,
                    label: 'Puede editar',
                    desc: 'Edita y mueve tarjetas.',
                    icon: <Shield size={13} />,
                  },
                  {
                    value: 'viewer' as const,
                    label: 'Solo lectura',
                    desc: 'Ve tablero y dashboard.',
                    icon: <Eye size={13} />,
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setNewMemberRole(option.value)}
                    className="rounded-xl border px-3 py-3 text-left transition-all"
                    style={newMemberRole === option.value
                      ? { borderColor: `var(--ff-primary)`, background: `color-mix(in srgb, var(--ff-primary) 8%, transparent)` }
                      : { borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>
                      {option.icon}
                      {option.label}
                    </div>
                    <p className="text-[11px] mt-1 leading-5" style={{ color: `var(--ff-text-tertiary)` }}>{option.desc}</p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-2 leading-5" style={{ color: `var(--ff-text-tertiary)` }}>
                El acceso se concede al instante. Si aun no tiene cuenta, el canal aparecera cuando entre con ese mismo email.
              </p>
            </div>
          </form>
        ) : (
          <div className="p-4">
            <div className="rounded-xl border px-3 py-3 text-sm" style={{ background: `var(--ff-bg-subtle)`, borderColor: `var(--ff-border)`, color: `var(--ff-text-secondary)` }}>
              Tu rol actual es <span className="font-semibold" style={{ color: `var(--ff-text-primary)` }}>{currentRoleLabel || 'miembro'}</span>. Solo el propietario puede compartir o gestionar accesos.
            </div>
          </div>
        )
      ) : board ? (
        <div className={`ff-scrollbar p-4 overflow-y-auto space-y-4 ${isMobile ? 'max-h-[23rem]' : 'flex-1 min-h-0'}`}>
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label className="block text-xs font-semibold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>
                Miembros activos ({board.members.length})
              </label>
              <span className="text-[10px] font-medium" style={{ color: `var(--ff-text-tertiary)` }}>
                {canInviteMembers ? 'El propietario gestiona accesos' : 'Visible para owner y editor'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Online ahora</p>
                <p className="mt-1 text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{onlineMemberCount}</p>
              </div>
              <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Actividad reciente</p>
                <p className="mt-1 text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{boardPresenceEvents.length}</p>
              </div>
            </div>
            <div className="space-y-2">
              {board.members.map((email) => {
                const role = board.memberRoles?.[email] || (email === board.members[0] ? 'owner' : 'editor');
                const canRemove = isBoardOwner && role !== 'owner';
                const presence = presenceByEmail.get(email);
                const presenceMeta = getPresenceMeta(presence);
                const displayName = presence?.displayName?.trim() || email;
                const roleMeta = role === 'viewer'
                  ? { label: 'Solo lectura', icon: <Eye size={11} />, badge: 'bg-slate-100 text-slate-700' }
                  : role === 'editor'
                  ? { label: 'Puede editar', icon: <Shield size={11} />, badge: 'bg-orange-100 text-orange-700' }
                  : { label: 'Propietario', icon: <Shield size={11} />, badge: 'bg-blue-100 text-blue-700' };

                return (
                  <div key={email} className="flex items-start gap-2.5 rounded-xl border px-3 py-3 transition-colors group" style={{ color: `var(--ff-text-primary)`, borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 overflow-hidden ${
                      role === 'owner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : role === 'viewer' ? 'bg-slate-500' : 'bg-orange-500'
                    }`}>
                      {presence?.photoURL ? (
                        <img src={presence.photoURL} alt="" className="w-full h-full object-cover" />
                      ) : (
                        email.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold truncate" style={{ color: `var(--ff-text-primary)` }}>{displayName}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${presenceMeta.badge}`}>
                          <span className={`h-2 w-2 rounded-full ${presenceMeta.dot}`} />
                          {presenceMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: `var(--ff-text-tertiary)` }}>{email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-[10px] inline-flex items-center gap-1" style={{ color: `var(--ff-text-tertiary)` }}>
                          {roleMeta.icon}
                          {roleMeta.label}
                        </p>
                        <span className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>
                          {presenceMeta.detail}
                        </span>
                      </div>
                      {presence?.enteredAt && presence.isActiveInThisBoard && (
                        <p className="mt-1 text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>
                          En este canal desde {formatPresenceTime(presence.enteredAt)}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${roleMeta.badge}`}>
                      {roleMeta.label}
                    </span>
                    {canRemove && (
                      <button
                        onClick={() => {
                          setSharingMsg(null);
                          setMemberPendingRemoval(email);
                        }}
                        className={`p-1 rounded-md transition-all shrink-0 ${isMobile ? 'text-red-500 bg-red-50' : 'text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'}`}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: `1px solid var(--ff-border)` }}>
              <div>
                <p className="text-xs font-semibold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>Actividad reciente</p>
                <p className="text-[11px] mt-1" style={{ color: `var(--ff-text-secondary)` }}>Entradas, salidas y cambios de estado de este canal.</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold" style={{ color: `var(--ff-text-secondary)` }}>
                {boardPresenceEvents.length > 20 ? '20 visibles' : `${boardPresenceEvents.length} visibles`}
              </span>
            </div>
            <div className="space-y-1 p-3">
              {boardPresenceEvents.length > 0 ? boardPresenceEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: `var(--ff-surface-solid)` }}>
                  <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.type === 'entered_board' || event.type === 'came_online' ? '#10b981' : '#94a3b8' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: `var(--ff-text-primary)` }}>
                      {event.displayName || event.emailLowercase}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5" style={{ color: `var(--ff-text-secondary)` }}>
                      {getPresenceEventCopy(event)}
                      {event.surface ? ` · ${getPresenceSurfaceLabel(event.surface)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium" style={{ color: `var(--ff-text-tertiary)` }}>
                    {formatPresenceTime(event.at)}
                  </span>
                </div>
              )) : (
                <div className="rounded-xl px-3 py-3 text-sm leading-6" style={{ background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` }}>
                  Todavia no hay entradas ni salidas registradas en este canal.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-dashed px-4 py-4" style={{ borderColor: `var(--ff-border-medium)`, background: `var(--ff-bg-subtle)` }}>
            <p className="text-sm font-semibold" style={{ color: `var(--ff-text-secondary)` }}>Acceso inmediato por email</p>
            <p className="text-xs mt-1 leading-5" style={{ color: `var(--ff-text-tertiary)` }}>
              Si la persona aun no tiene cuenta, el canal aparecera automaticamente cuando inicie sesion con ese correo.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );

  const mobileSheetContent = mobileSheet === 'menu'
    ? (
      <div className="relative w-full rounded-t-[1.75rem] border-t p-4 ff-slide-up" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Mas</p>
            <h3 className="text-base font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>Herramientas del canal</h3>
          </div>
          <button onClick={() => setMobileSheet(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)` }}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {[
            canEditBoard ? { id: 'share', label: 'Compartir', icon: <Users size={16} />, action: () => { resetShareState(); setMobileSheet('share'); } } : null,
            canEditBoard ? { id: 'settings', label: 'Ajustes', icon: <Settings size={16} />, action: () => { setMobileSheet(null); setIsSettingsOpen(true); } } : null,
            canEditBoard ? { id: 'chatbot', label: 'Asistente', icon: <MessageSquare size={16} />, action: () => setMobileSheet('chatbot') } : null,
            { id: 'logout', label: 'Cerrar sesion', icon: <LogOut size={16} />, action: () => { setMobileSheet(null); void signOut(); } },
          ].filter(Boolean).map((item) => (
            <button
              key={item!.id}
              onClick={item!.action}
              className="w-full min-h-11 rounded-2xl px-4 py-3 text-left flex items-center gap-3 text-sm font-semibold"
              style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
            >
              {item!.icon}
              {item!.label}
            </button>
          ))}
        </div>
      </div>
    )
    : mobileSheet === 'share'
    ? (
      <div className="relative w-full h-[88vh] rounded-t-[1.75rem] border-t overflow-hidden ff-slide-up flex flex-col" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }} onClick={(event) => event.stopPropagation()}>
        {sharePanelContent}
      </div>
    )
    : mobileSheet === 'boards'
    ? (
      <div className="relative w-full rounded-t-[1.75rem] border-t overflow-hidden ff-slide-up" style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }} onClick={(event) => event.stopPropagation()}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Canales</p>
              <h3 className="text-base font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>Selecciona tu espacio</h3>
            </div>
            <button onClick={() => setMobileSheet(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-surface-solid)` }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="ff-scrollbar max-h-[60vh] overflow-y-auto py-1">
          {boards.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No hay canales todavia</p>
          )}
          {boards.map((item) => {
            const isActive = item.id === currentBoardId;
            const cardCount = Object.keys(item.cards || {}).length;
            return (
              <button
                key={item.id}
                onClick={() => { setCurrentBoardId(item.id); setMobileSheet(null); setView('board'); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                style={{ background: isActive ? `color-mix(in srgb, var(--ff-primary) 10%, transparent)` : 'transparent' }}
              >
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 ${
                  isActive ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm' : 'text-gray-500'
                }`} style={!isActive ? { background: `var(--ff-input-bg)`, color: `var(--ff-text-tertiary)` } : {}}>
                  {item.title.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-medium'}`} style={{ color: isActive ? `var(--ff-primary)` : `var(--ff-text-primary)` }}>
                    {item.title}
                  </p>
                  <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>
                    {cardCount} {cardCount === 1 ? 'video' : 'videos'} · {item.members?.length || 1} {(item.members?.length || 1) === 1 ? 'miembro' : 'miembros'}
                  </p>
                </div>
                {isActive && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="p-3" style={{ borderTop: `1px solid var(--ff-border)` }}>
          {isCreatingBoard ? (
            <form onSubmit={handleCreateBoard} className="space-y-2">
              <input
                type="text"
                autoFocus
                placeholder="Nombre del canal..."
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setIsCreatingBoard(false); }}
                className="w-full px-3 py-3 text-sm rounded-xl outline-none transition-all"
                style={{ color: `var(--ff-text-primary)`, background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)` }}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 min-h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">Crear canal</button>
                <button type="button" onClick={() => setIsCreatingBoard(false)} className="px-4 min-h-11 rounded-xl text-sm font-medium" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>Cancelar</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsCreatingBoard(true)}
              className="w-full min-h-11 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium text-blue-600 rounded-xl transition-all"
              style={{ background: `color-mix(in srgb, var(--ff-primary) 6%, transparent)` }}
            >
              <Plus size={16} />
              Nuevo canal
            </button>
          )}
        </div>
      </div>
    )
    : null;

  const mobileBottomNav = isMobile ? (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl"
      style={{
        background: `color-mix(in srgb, var(--ff-surface-solid) 90%, transparent)`,
        borderColor: `var(--ff-border)`,
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
    >
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {[
          { id: 'home', label: 'Inicio', icon: <Home size={18} />, active: view === 'home', disabled: false },
          { id: 'board', label: 'Tablero', icon: <Layout size={18} />, active: view === 'board', disabled: !board },
          { id: 'dashboard', label: 'Panel', icon: <BarChart3 size={18} />, active: view === 'dashboard', disabled: !board },
          { id: 'guide', label: 'Guia', icon: <Info size={18} />, active: isGuideOpen, disabled: !board, badge: guideAlertCount },
          { id: 'more', label: 'Mas', icon: <Menu size={18} />, active: mobileSheet === 'menu' || mobileSheet === 'share' || mobileSheet === 'chatbot' || isSettingsOpen, disabled: false },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => !item.disabled && handleMobileNav(item.id as 'home' | 'board' | 'dashboard' | 'guide' | 'more')}
            className={`min-h-11 rounded-2xl px-2 py-2 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            style={item.active ? { background: `color-mix(in srgb, var(--ff-primary) 12%, transparent)`, color: `var(--ff-primary)` } : { color: `var(--ff-text-tertiary)` }}
          >
            <span className="relative flex items-center justify-center">
              {item.icon}
              {!!item.badge && (
                <span className="absolute -right-2 -top-2 min-w-[1.1rem] rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const desktopRail = !isMobile && board && view !== 'home' ? (
    <aside
      className="hidden shrink-0 border-l lg:flex transition-all duration-300"
      style={{
        width: desktopRailPanel ? 484 : 68,
        borderColor: `var(--ff-border)`,
        background: `color-mix(in srgb, var(--ff-surface-solid) 95%, transparent)`,
      }}
    >
      <div className="flex h-full min-w-0 w-full">
        <div className="flex w-[68px] shrink-0 flex-col items-center gap-3 border-r px-2 py-4" style={{ borderColor: `var(--ff-border)` }}>
          {[
            canEditBoard ? { id: 'share' as const, label: 'Compartir', icon: <Users size={18} /> } : null,
            { id: 'guide' as const, label: 'Guia', icon: <Info size={18} />, badge: guideAlertCount },
            canEditBoard ? { id: 'settings' as const, label: 'Ajustes', icon: <Settings size={18} /> } : null,
            canEditBoard ? { id: 'chatbot' as const, label: 'Asistente', icon: <MessageSquare size={18} /> } : null,
          ].filter(Boolean).map((item) => {
            const isActive = desktopRailPanel === item!.id;
            return (
              <button
                key={item!.id}
                onClick={() => {
                  resetShareState();
                  toggleDesktopRailPanel(item!.id);
                }}
                className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1.5 rounded-[1.2rem] px-2 py-3 text-[10px] font-semibold transition-all"
                style={isActive
                  ? { background: `color-mix(in srgb, var(--ff-primary) 12%, transparent)`, color: `var(--ff-primary)` }
                  : { background: `var(--ff-bg-subtle)`, color: `var(--ff-text-tertiary)` }}
                title={item!.label}
              >
                <span className="relative flex items-center justify-center">
                  {item!.icon}
                  {!!item!.badge && (
                    <span className="absolute -right-2 -top-2 min-w-[1.1rem] rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                      {item!.badge > 9 ? '9+' : item!.badge}
                    </span>
                  )}
                </span>
                <span>{item!.label}</span>
              </button>
            );
          })}

          {canEditBoard && onlineMemberCount > 0 && railVisibleMembers.length > 0 && (
            <button
              type="button"
              onClick={openPresencePanel}
              className="mt-auto flex w-full flex-col items-center gap-2 rounded-[1.2rem] border px-1.5 py-2 transition-all hover:-translate-y-0.5"
              style={{
                borderColor: `color-mix(in srgb, #10b981 18%, var(--ff-border))`,
                background: `color-mix(in srgb, #10b981 7%, var(--ff-surface-solid))`,
                color: `var(--ff-text-secondary)`,
              }}
              title={`${onlineMemberCount} miembro${onlineMemberCount === 1 ? '' : 's'} online en este canal`}
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: `#059669` }}>
                Online
              </span>
              <div className="flex flex-col items-center gap-1.5">
                {railVisibleMembers.map((member) => (
                  <span
                    key={member.emailLowercase}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, #2563eb, #4f46e5)` }}
                    title={member.displayName || member.emailLowercase}
                  >
                    {member.photoURL ? (
                      <img src={member.photoURL} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      getPresenceInitial(member.displayName, member.emailLowercase)
                    )}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                  </span>
                ))}
              </div>
              {railOverflowCount > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `var(--ff-surface-solid)`, color: `#059669` }}>
                  +{railOverflowCount}
                </span>
              )}
            </button>
          )}
        </div>

        {desktopRailPanel && (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {desktopRailPanel === 'share' ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {sharePanelContent}
              </div>
            ) : desktopRailPanel === 'guide' ? (
              <div className="ff-scrollbar flex-1 overflow-y-auto p-5">
                <div className="rounded-[1.8rem] border p-5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Guia del equipo</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>Resumen operativo del rail</h3>
                    </div>
                    <button onClick={() => setDesktopRailPanel(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                      <X size={16} />
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6" style={{ color: `var(--ff-text-secondary)` }}>
                    La guia sigue al productionFlow real, elige sola los videos mas urgentes y avisa cuando hay trabajo vencido, bloqueado o pendiente de validacion.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Criticas', value: String(guideSnapshot?.alertCounts.critical || 0) },
                      { label: 'Warnings', value: String(guideSnapshot?.alertCounts.warning || 0) },
                      { label: 'Listas para publicar', value: String(guidePublishReadyCount) },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>{item.label}</p>
                        <p className="mt-2 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {guideSnapshot && guideAlertCount > 0 && (
                    <div className="mt-4 space-y-2">
                      {guideSnapshot.alerts.slice(0, 3).map((alert) => {
                        const tone = railGuideAlertToneStyle(alert.severity);
                        return (
                        <div
                          key={alert.id}
                          className="rounded-2xl border px-4 py-3"
                          style={tone.card}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={tone.badge}>
                              {alert.severity === 'critical' ? 'Critico' : alert.severity === 'warning' ? 'Atencion' : 'Info'}
                            </span>
                            <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{alert.cardTitle}</p>
                          </div>
                          <p className="mt-1 text-xs font-semibold" style={{ color: `var(--ff-text-primary)` }}>{alert.title}</p>
                          <p className="mt-1 text-[11px] leading-5" style={{ color: `var(--ff-text-secondary)` }}>{alert.description}</p>
                        </div>
                      )})}
                    </div>
                  )}
                  <div className="mt-4 space-y-3">
                    {guideSummaries.length > 0 ? guideSummaries.map((focusCard) => (
                      <div key={focusCard.card.id} className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-raised)` }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>{focusCard.card.title}</p>
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={focusCard.summary.overdueStages.length > 0 ? railGuideDangerChipStyle : railGuideStatusChipStyle}>
                            {focusCard.currentStage.label}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium" style={{ color: `var(--ff-text-secondary)` }}>
                          <span>Rol: {getAuditRoleLabel(focusCard.currentStage.ownerRole)}</span>
                          <span>{focusCard.checklistProgress.completedCount}/{focusCard.checklistProgress.totalCount || 0} checklist</span>
                          {focusCard.summary.isColumnMismatch && <span className="rounded-full px-2 py-1" style={railGuideWarningChipStyle}>Desalineado</span>}
                          {focusCard.summary.blockedStages.length > 0 && <span className="rounded-full px-2 py-1" style={railGuideDangerChipStyle}>Bloqueado</span>}
                          {focusCard.hasDraftPending && <span className="rounded-full px-2 py-1" style={railGuideInfoChipStyle}>Draft IA listo</span>}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-2xl border p-4 text-sm leading-6" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                        Todavia no hay flujos guiados activos para resumir aqui.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsChatbotOpen(false);
                      setIsGuideOpen(true);
                    }}
                    className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white"
                    style={{ background: `linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))` }}
                  >
                    <Info size={15} />
                    Abrir guia completa
                  </button>
                </div>
              </div>
            ) : desktopRailPanel === 'settings' ? (
              <div className="ff-scrollbar flex-1 overflow-y-auto p-5">
                <div className="rounded-[1.8rem] border p-5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Ajustes del canal</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>Configura sin tapar el tablero</h3>
                    </div>
                    <button onClick={() => setDesktopRailPanel(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Miembros</p>
                      <p className="mt-2 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>{board.members.length}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Columnas</p>
                      <p className="mt-2 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>{board.lists.length}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)` }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `var(--ff-text-tertiary)` }}>Cards</p>
                      <p className="mt-2 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>{Object.keys(board.cards).length}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6" style={{ color: `var(--ff-text-secondary)` }}>
                    Desde aquí podrás abrir la configuración completa para workflow, branding del canal, columnas y gestión avanzada.
                  </p>
                  <button
                    onClick={() => {
                      setIsGuideOpen(false);
                      setIsChatbotOpen(false);
                      setIsSettingsOpen(true);
                    }}
                    className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white"
                    style={{ background: `linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))` }}
                  >
                    <Settings size={15} />
                    Abrir ajustes completos
                  </button>
                </div>
              </div>
            ) : (
              <div className="ff-scrollbar flex-1 overflow-y-auto p-5">
                <div className="rounded-[1.8rem] border p-5" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>Asistente</p>
                      <h3 className="mt-1 text-lg font-black" style={{ color: `var(--ff-text-primary)` }}>Ayuda rápida en contexto</h3>
                    </div>
                    <button onClick={() => setDesktopRailPanel(null)} className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                      <X size={16} />
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6" style={{ color: `var(--ff-text-secondary)` }}>
                    Úsalo para destrabar títulos, guiones, SEO y próximas acciones sin perder de vista el tablero.
                  </p>
                  <div className="mt-4 space-y-3">
                    {[
                      'Resume el estado real de este tablero.',
                      'Ayúdame a preparar el próximo handoff.',
                      'Propón mejoras para el hook o el guion.',
                    ].map((prompt) => (
                      <div key={prompt} className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
                        {prompt}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setIsGuideOpen(false);
                      setIsSettingsOpen(false);
                      setIsChatbotOpen(true);
                    }}
                    className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white"
                    style={{ background: `linear-gradient(135deg, var(--ff-primary), color-mix(in srgb, var(--ff-primary) 72%, #4338ca))` }}
                  >
                    <MessageSquare size={15} />
                    Abrir asistente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  ) : null;

  return (
    <div className="h-screen flex flex-col font-sans overflow-x-hidden" style={{ background: `var(--ff-bg)` }}>
      <AppHeader
        user={user}
        boards={boards}
        currentBoardId={currentBoardId}
        board={board}
        view={view}
        setView={setView}
        setCurrentBoardId={setCurrentBoardId}
        canEditBoard={canEditBoard}
        currentUserRole={currentUserRole}
        onlineMemberCount={onlineMemberCount}
        boardPresenceMembers={boardPresenceMembers}
        saveState={saveState}
        isMobile={isMobile}
        onSignOut={signOut}
        onOpenNewVideo={() => window.dispatchEvent(new Event('ff-open-new-video'))}
        onOpenPresencePanel={openPresencePanel}
        onCreateBoard={createBoard}
        onMobileSelectBoards={() => setMobileSheet('boards')}
        onMobileGoHome={() => { setMobileSheet(null); setIsGuideOpen(false); }}
      />

      {readNotice && (
        <div
          className="shrink-0 border-b px-4 py-2.5 text-sm"
          style={{
            background: `var(--ff-warning-bg)`,
            borderColor: `var(--ff-warning-border)`,
            color: `var(--ff-warning-text)`,
          }}
        >
          <div className="mx-auto flex max-w-6xl items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{readNotice}</p>
          </div>
        </div>
      )}

      {isMobile && currentBoardId && view === 'board' && (
        <FilterBar
          contentFilter={contentFilter}
          assigneeFilter={assigneeFilter}
          onContentFilterChange={setContentFilter}
          onAssigneeFilterChange={setAssigneeFilter}
        />
      )}

      <main className="flex-1 overflow-hidden" style={isMobile ? { paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' } : undefined}>
        <div className="flex h-full overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden">
            {view === 'home' ? (
              currentBoardId && !board && !hasAutoNavigated.current ? (
                <div className="h-full flex items-center justify-center" style={{ background: `var(--ff-bg)` }}>
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-200 border-t-blue-600"></div>
                </div>
              ) : (
                <ChannelHome
                  boards={boards}
                  currentUserId={user?.uid ?? null}
                  onSelect={(boardId, targetView) => { setCurrentBoardId(boardId); setView(targetView); }}
                  onCreateBoard={async (title) => { await createBoard(title); setView('board'); }}
                  onDeleteBoard={deleteBoard}
                />
              )
            ) : currentBoardId ? (
              !board ? (
                <div className="h-full flex items-center justify-center" style={{ background: `var(--ff-bg)` }}>
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-200 border-t-blue-600"></div>
                </div>
              ) : view === 'dashboard' ? (
                <Dashboard key={currentBoardId} />
              ) : (
                <Board
                  key={currentBoardId}
                  contentFilter={contentFilter}
                  assigneeFilter={assigneeFilter}
                  onContentFilterChange={setContentFilter}
                  onAssigneeFilterChange={setAssigneeFilter}
                />
              )
            ) : (
              <ChannelHome
                boards={boards}
                currentUserId={user?.uid ?? null}
                onSelect={(boardId, targetView) => { setCurrentBoardId(boardId); setView(targetView); }}
                onCreateBoard={async (title) => { await createBoard(title); setView('board'); }}
                onDeleteBoard={deleteBoard}
              />
            )}
          </div>

          {desktopRail}
        </div>
      </main>

      {isMobile && mobileSheetContent && (
        <div className="fixed inset-0 z-40 flex items-end" onClick={() => setMobileSheet(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          {mobileSheetContent}
        </div>
      )}

      <TeamGuide
        hideTrigger
        isOpen={isGuideOpen}
        onOpenChange={setIsGuideOpen}
        onRequestOpenCard={handleRequestOpenCardFromGuide}
      />
      {canEditBoard && <BoardSettings hideTrigger isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} />}
      {canEditBoard && <Chatbot hideTrigger isOpen={isMobile ? mobileSheet === 'chatbot' : isChatbotOpen} onOpenChange={(nextOpen) => {
        if (isMobile) {
          setMobileSheet(nextOpen ? 'chatbot' : null);
          return;
        }
        setIsChatbotOpen(nextOpen);
      }} />}

      {memberPendingRemoval && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => !memberRemovalLoading && setMemberPendingRemoval(null)}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
          <div
            className="relative w-full rounded-t-[1.75rem] border-t p-5 ff-slide-up sm:max-w-md sm:rounded-3xl sm:border"
            style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, #ef4444 12%, transparent)`, color: `#dc2626` }}>
                <AlertCircle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: `var(--ff-text-tertiary)` }}>
                  Quitar acceso
                </p>
                <h3 className="text-base font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>
                  Confirma esta accion
                </h3>
                <p className="text-sm mt-2 leading-6" style={{ color: `var(--ff-text-secondary)` }}>
                  Vas a quitar a <span className="font-semibold" style={{ color: `var(--ff-text-primary)` }}>{memberPendingRemoval}</span> de este tablero. Las tarjetas no se borran, pero esa persona dejara de ver todo el contenido y la guia de este canal.
                </p>
              </div>
              <button
                onClick={() => !memberRemovalLoading && setMemberPendingRemoval(null)}
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}
                disabled={memberRemovalLoading}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl px-4 py-3 text-xs leading-5" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}>
              Solo el propietario puede hacer esto. Si luego quieres volver a dar acceso, tendras que invitar de nuevo a esta persona.
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setMemberPendingRemoval(null)}
                className="flex-1 min-h-11 rounded-2xl text-sm font-semibold"
                style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)` }}
                disabled={memberRemovalLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmMemberRemoval()}
                className="flex-1 min-h-11 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: memberRemovalLoading ? `#f87171` : `#dc2626` }}
                disabled={memberRemovalLoading}
              >
                {memberRemovalLoading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {memberRemovalLoading ? 'Quitando...' : 'Quitar acceso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mobileBottomNav}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BoardProvider>
        <AppContent />
      </BoardProvider>
    </ThemeProvider>
  );
}
