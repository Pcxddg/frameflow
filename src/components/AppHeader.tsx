import { useState, useRef, useEffect, useCallback } from 'react';
import { Home, Tv, ChevronDown, Plus, Check, X, Layout, BarChart3, LogOut, Users } from 'lucide-react';
import type { Board, BoardPresenceMember, MemberRole } from '../types';

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

export interface AppHeaderProps {
  user: AppUser;
  boards: Board[];
  currentBoardId: string | null;
  board: Board | null;
  view: 'home' | 'board' | 'dashboard';
  setView: (v: 'home' | 'board' | 'dashboard') => void;
  setCurrentBoardId: (id: string) => void;
  canEditBoard: boolean;
  currentUserRole: MemberRole | null;
  onlineMemberCount: number;
  boardPresenceMembers: BoardPresenceMember[];
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  isMobile: boolean;
  onSignOut: () => void;
  onOpenNewVideo: () => void;
  onOpenPresencePanel: () => void;
  onCreateBoard: (title: string) => Promise<void>;
  // Mobile-specific
  onMobileSelectBoards?: () => void;
  onMobileGoHome?: () => void;
}

/* ── Style objects ──────────────────────────────────────── */

const shellStyle = {
  background: 'color-mix(in srgb, var(--ff-header-btn) 96%, transparent)',
  border: '1px solid var(--ff-header-border)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

const shellActiveStyle = {
  background: 'color-mix(in srgb, var(--ff-header-btn-hover) 96%, transparent)',
  border: '1px solid color-mix(in srgb, var(--ff-header-text) 14%, transparent)',
  boxShadow: '0 18px 28px -24px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const primaryActionStyle = {
  background: 'var(--ff-primary)',
  border: '1px solid var(--ff-primary-dark)',
  boxShadow: 'var(--ff-shadow-sm)',
  color: '#ffffff',
};

const mutedTextStyle = {
  color: 'color-mix(in srgb, var(--ff-header-text) 82%, transparent)',
};

/* ── Save state dot colors ─────────────────────────────── */

function getSaveDot(saveState: string): { color: string; pulse: boolean; title: string } | null {
  if (saveState === 'saving') return { color: 'bg-amber-400', pulse: true, title: 'Guardando...' };
  if (saveState === 'saved') return { color: 'bg-emerald-400', pulse: false, title: 'Guardado' };
  if (saveState === 'error') return { color: 'bg-red-500', pulse: false, title: 'Error al guardar' };
  return null;
}

function getRoleLabel(role: MemberRole | null): string | null {
  if (role === 'owner') return 'Propietario';
  if (role === 'editor') return 'Puede editar';
  if (role === 'viewer') return 'Solo lectura';
  return null;
}

function isPresenceOnline(p?: BoardPresenceMember | null): boolean {
  if (!p?.lastHeartbeatAt) return false;
  const ts = new Date(p.lastHeartbeatAt).getTime();
  return !Number.isNaN(ts) && Date.now() - ts < 75_000;
}

/* ── Component ─────────────────────────────────────────── */

export function AppHeader(props: AppHeaderProps) {
  return props.isMobile ? <MobileHeader {...props} /> : <DesktopHeader {...props} />;
}

/* ── Desktop ───────────────────────────────────────────── */

function DesktopHeader({
  user, boards, currentBoardId, board, view, setView, setCurrentBoardId,
  canEditBoard, currentUserRole, onlineMemberCount, boardPresenceMembers,
  saveState, onSignOut, onOpenNewVideo, onOpenPresencePanel, onCreateBoard,
}: AppHeaderProps) {
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const currentBoardTitle = boards.find(b => b.id === currentBoardId)?.title || board?.title || 'Seleccionar canal';
  const saveDot = getSaveDot(saveState);
  const roleLabel = getRoleLabel(currentUserRole);
  const onlineMembers = boardPresenceMembers.filter(m => isPresenceOnline(m));

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boardRef.current && !boardRef.current.contains(e.target as Node)) setBoardMenuOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreateBoard = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await onCreateBoard(newTitle.trim());
    setNewTitle('');
    setIsCreating(false);
    setBoardMenuOpen(false);
  }, [newTitle, onCreateBoard]);

  return (
    <header
      className="relative z-50 shrink-0 px-4 py-2.5 flex items-center gap-4"
      style={{
        background: 'var(--ff-header-from)',
        color: 'var(--ff-header-text)',
        borderBottom: '1px solid var(--ff-header-border)',
      }}
    >
      {/* ── ZONA IZQUIERDA: Logo + Canal ── */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-2 rounded-[1.15rem] px-3.5 py-2 text-sm font-bold transition-all duration-200 hover:bg-white/15"
          style={view === 'home' ? shellActiveStyle : shellStyle}
          title="Inicio"
        >
          <Home size={17} />
          <span className="hidden sm:inline">FrameFlow</span>
        </button>

        {view !== 'home' && (
          <div className="relative" ref={boardRef}>
            <button
              onClick={() => setBoardMenuOpen(!boardMenuOpen)}
              className="flex min-w-0 max-w-[240px] items-center gap-2 rounded-[1.15rem] px-3 py-2 text-sm font-semibold transition-all duration-200"
              style={boardMenuOpen ? shellActiveStyle : shellStyle}
            >
              <Tv size={14} className="shrink-0" style={mutedTextStyle} />
              <span className="truncate">{currentBoardTitle}</span>
              <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${boardMenuOpen ? 'rotate-180' : ''}`} style={mutedTextStyle} />
            </button>

            {boardMenuOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-xl z-50 overflow-hidden ff-scale-in" style={{ background: 'var(--ff-surface-solid)', border: '1px solid var(--ff-border-medium)', boxShadow: 'var(--ff-shadow-xl)' }}>
                <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--ff-border)', background: 'var(--ff-bg-subtle)' }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ff-text-tertiary)' }}>Tus canales</h3>
                </div>
                <div className="ff-scrollbar max-h-60 overflow-y-auto py-1">
                  {boards.length === 0 && (
                    <p className="py-6 text-center text-sm" style={{ color: 'var(--ff-text-secondary)' }}>No hay canales todavia</p>
                  )}
                  {boards.map(item => {
                    const isActive = item.id === currentBoardId;
                    const cardCount = Object.keys(item.cards || {}).length;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setCurrentBoardId(item.id); setBoardMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                        style={{ background: isActive ? 'color-mix(in srgb, var(--ff-primary) 10%, transparent)' : 'transparent' }}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                          style={isActive
                            ? { background: 'var(--ff-primary)', color: '#ffffff' }
                            : { background: 'var(--ff-input-bg)', color: 'var(--ff-text-tertiary)' }
                          }
                        >
                          {item.title.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${isActive ? 'font-semibold' : 'font-medium'}`} style={{ color: isActive ? 'var(--ff-primary)' : 'var(--ff-text-primary)' }}>
                            {item.title}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--ff-text-tertiary)' }}>
                            {cardCount} {cardCount === 1 ? 'video' : 'videos'} · {item.members?.length || 1} {(item.members?.length || 1) === 1 ? 'miembro' : 'miembros'}
                          </p>
                        </div>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--ff-primary)' }} />}
                      </button>
                    );
                  })}
                </div>
                <div className="p-2" style={{ borderTop: '1px solid var(--ff-border)' }}>
                  {isCreating ? (
                    <form onSubmit={handleCreateBoard} className="flex items-center gap-2 p-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nombre del canal..."
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setIsCreating(false); }}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg outline-none"
                        style={{ color: 'var(--ff-text-primary)', background: 'var(--ff-input-bg)', border: '1px solid var(--ff-input-border)' }}
                      />
                      <button type="submit" className="rounded-lg p-1.5 text-white" style={{ background: 'var(--ff-primary)' }}><Check size={16} /></button>
                      <button type="button" onClick={() => setIsCreating(false)} className="rounded-lg p-1.5" style={{ color: 'var(--ff-text-secondary)', background: 'var(--ff-bg-subtle)' }}><X size={16} /></button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                      style={{ color: 'var(--ff-primary)', background: 'color-mix(in srgb, var(--ff-primary) 10%, transparent)' }}
                    >
                      <Plus size={16} /> Nuevo Canal
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ZONA CENTRO: Tablero / Dashboard ── */}
      {board && view !== 'home' && (
        <div className="hidden sm:flex flex-1 justify-center">
          <div className="flex items-center rounded-[1.2rem] p-1" style={shellStyle}>
            {([
              { id: 'board' as const, label: 'Tablero', icon: <Layout size={16} /> },
              { id: 'dashboard' as const, label: 'Dashboard', icon: <BarChart3 size={16} /> },
            ]).map(option => (
              <button
                key={option.id}
                onClick={() => setView(option.id)}
                className={`flex items-center gap-1.5 rounded-[0.9rem] px-3 py-1.5 text-sm font-semibold transition-all duration-200 ${view === option.id ? '' : 'hover:bg-white/10'}`}
                style={view === option.id ? shellActiveStyle : mutedTextStyle}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ZONA DERECHA: Nuevo video + Avatar ── */}
      <div className="flex items-center gap-2.5">
        {board && view !== 'home' && canEditBoard && (
          <button
            onClick={onOpenNewVideo}
            className="hidden lg:flex items-center gap-2 rounded-[1.15rem] px-4 py-2 text-sm font-semibold shadow-sm"
            style={primaryActionStyle}
          >
            <Plus size={15} />
            Nuevo video
          </button>
        )}

        {/* Avatar with save dot + user dropdown */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="relative flex items-center gap-1.5 rounded-[1.15rem] pl-1.5 pr-2.5 py-1.5 transition-all duration-200"
            style={userMenuOpen ? shellActiveStyle : shellStyle}
            title={user.displayName || 'Usuario'}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden text-xs font-bold"
              style={{ background: 'color-mix(in srgb, var(--ff-primary) 18%, var(--ff-surface-solid))', border: '1px solid var(--ff-border)', color: 'var(--ff-primary)' }}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{user.displayName?.charAt(0).toUpperCase() || 'U'}</span>
              )}
            </div>

            {/* Save state dot */}
            {saveDot && (
              <span
                className={`absolute top-1 right-1.5 h-2.5 w-2.5 rounded-full border border-white/30 ${saveDot.color} ${saveDot.pulse ? 'animate-pulse' : ''}`}
                title={saveDot.title}
              />
            )}

            <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} style={mutedTextStyle} />
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 overflow-hidden ff-scale-in" style={{ background: 'var(--ff-surface-solid)', border: '1px solid var(--ff-border-medium)', boxShadow: 'var(--ff-shadow-xl)' }}>
              {/* User info */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--ff-border)', background: 'var(--ff-bg-subtle)' }}>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ff-text-primary)' }}>{user.displayName}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ff-text-tertiary)' }}>{user.email}</p>
              </div>

              {/* Role + presence — only when viewing a board */}
              {board && view !== 'home' && (
                <div className="px-4 py-2.5 space-y-2" style={{ borderBottom: '1px solid var(--ff-border)' }}>
                  {roleLabel && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ff-text-tertiary)' }}>Rol</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'color-mix(in srgb, var(--ff-primary) 12%, transparent)', color: 'var(--ff-primary)' }}>
                        {roleLabel}
                      </span>
                    </div>
                  )}

                  {onlineMemberCount > 0 && canEditBoard && (
                    <button
                      type="button"
                      onClick={() => { onOpenPresencePanel(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all hover:bg-black/5"
                      style={{ color: 'var(--ff-text-primary)' }}
                    >
                      <Users size={14} style={{ color: 'var(--ff-text-tertiary)' }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{onlineMemberCount} online</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {onlineMembers.slice(0, 4).map(m => (
                            <div
                              key={m.emailLowercase}
                              className="w-5 h-5 rounded-full overflow-hidden text-[8px] font-bold flex items-center justify-center"
                              style={{ background: 'var(--ff-bg-subtle)', border: '1px solid var(--ff-border)', color: 'var(--ff-text-tertiary)' }}
                              title={m.displayName}
                            >
                              {m.photoURL ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" /> : m.displayName?.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {onlineMembers.length > 4 && (
                            <span className="text-[10px]" style={{ color: 'var(--ff-text-tertiary)' }}>+{onlineMembers.length - 4}</span>
                          )}
                        </div>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    </button>
                  )}
                </div>
              )}

              {/* Sign out */}
              <div className="p-2">
                <button
                  onClick={() => { onSignOut(); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                  style={{ color: 'var(--ff-danger)' }}
                >
                  <LogOut size={16} />
                  Cerrar sesion
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── Mobile ────────────────────────────────────────────── */

function MobileHeader({
  user, board, view, setView, saveState,
  onMobileSelectBoards, onMobileGoHome,
}: AppHeaderProps) {
  const currentBoardTitle = board?.title || 'Seleccionar canal';
  const saveDot = getSaveDot(saveState);

  return (
    <header
      className="shrink-0 px-4 pb-3"
      style={{
        background: 'var(--ff-header-from)',
        color: 'var(--ff-header-text)',
        borderBottom: '1px solid var(--ff-header-border)',
        paddingTop: 'calc(0.9rem + env(safe-area-inset-top))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            onClick={() => { onMobileGoHome?.(); setView('home'); }}
            className="flex shrink-0 items-center gap-2 rounded-[1.15rem] px-3.5 py-2.5 text-sm font-bold"
            style={view === 'home' ? shellActiveStyle : shellStyle}
          >
            <Home size={16} />
            <span>FrameFlow</span>
          </button>

          {board && view !== 'home' && (
            <button
              onClick={onMobileSelectBoards}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[1.15rem] px-3.5 py-2.5 text-left"
              style={shellStyle}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Tv size={14} className="shrink-0" style={mutedTextStyle} />
                <span className="truncate text-sm font-semibold">{currentBoardTitle}</span>
              </div>
              <ChevronDown size={15} className="shrink-0" style={mutedTextStyle} />
            </button>
          )}
        </div>

        {/* Avatar with save dot */}
        <div className="relative shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
            style={{ background: 'color-mix(in srgb, var(--ff-header-btn) 92%, transparent)', border: '1px solid var(--ff-header-border)' }}
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{user.displayName?.charAt(0).toUpperCase() || 'U'}</span>
            )}
          </div>
          {saveDot && (
            <span
              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${saveDot.color} ${saveDot.pulse ? 'animate-pulse' : ''}`}
              style={{ borderColor: 'var(--ff-header-from)' }}
              title={saveDot.title}
            />
          )}
        </div>
      </div>
    </header>
  );
}
