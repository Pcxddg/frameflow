import { useState, type ReactNode } from 'react';
import { Tv, BarChart3, Layout, Plus, Check, X, Film, Youtube, Clapperboard, Trash2, MoreVertical } from 'lucide-react';
import type { Board } from '../types';

interface Props {
  boards: Board[];
  currentUserId: string | null;
  onSelect: (boardId: string, targetView: 'board' | 'dashboard') => void;
  onCreateBoard: (title: string) => Promise<void>;
  onDeleteBoard: (boardId: string) => Promise<void>;
}

export function ChannelHome({
  boards,
  currentUserId,
  onSelect,
  onCreateBoard,
  onDeleteBoard,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await onCreateBoard(newTitle.trim());
    setNewTitle('');
    setIsCreating(false);
  };

  const handleDelete = async (boardId: string) => {
    setIsDeleting(true);
    try {
      await onDeleteBoard(boardId);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
      setMenuOpenId(null);
    }
  };

  const showEmptyState = boards.length === 0 && !isCreating;

  return (
    <div className="ff-scrollbar h-full overflow-y-auto" style={{ background: `var(--ff-bg-subtle)` }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Tv size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: `var(--ff-text-primary)` }}>Tus Canales</h1>
              <p className="text-sm" style={{ color: `var(--ff-text-tertiary)` }}>
                {boards.length === 0
                  ? 'Crea tu primer canal o espera a que te compartan uno por email'
                  : `${boards.length} canal${boards.length !== 1 ? 'es' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {showEmptyState && (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: `var(--ff-border-medium)`, background: `var(--ff-surface-solid)` }}>
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
              <Clapperboard size={32} className="text-blue-500" />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: `var(--ff-text-primary)` }}>Bienvenido a FrameFlow</h2>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: `var(--ff-text-tertiary)` }}>
              Organiza tu produccion de videos de YouTube con tableros Kanban, guias de equipo y analytics por canal. Si alguien comparte un canal contigo, aparecera aqui automaticamente cuando entres con ese mismo email.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus size={18} />
              Crear mi primer canal
            </button>
          </div>
        )}

        {(boards.length > 0 || isCreating) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => {
              const cardCount = Object.keys(b.cards || {}).length;
              const lastListId = b.lists?.[b.lists.length - 1]?.id;
              const publishedCount = lastListId
                ? Object.values(b.cards || {}).filter((c) => c.listId === lastListId).length
                : 0;
              const inProgress = cardCount - publishedCount;
              const hasYT = !!b.youtubeChannelUrl;
              const memberCount = b.members?.length || 1;
              const isOwner = currentUserId === b.ownerId;
              const isMenuOpen = menuOpenId === b.id;
              const isConfirming = confirmDeleteId === b.id;

              return (
                <div
                  key={b.id}
                  className="rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg hover:scale-[1.01] group relative"
                  style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}
                >
                  <div className="relative h-24 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 p-4 flex items-end">
                    <div className="absolute inset-0 bg-black/10" />

                    {isOwner && (
                      <div className="absolute top-2 right-2 z-10">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : b.id); setConfirmDeleteId(null); }}
                          className="w-7 h-7 rounded-lg bg-black/20 hover:bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {isMenuOpen && (
                          <div
                            className="absolute right-0 top-9 w-44 rounded-xl shadow-xl border overflow-hidden z-20"
                            style={{ background: `var(--ff-surface-solid)`, borderColor: `var(--ff-border)` }}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(b.id); setMenuOpenId(null); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
                            >
                              <Trash2 size={13} />
                              Eliminar canal
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="relative flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-lg font-bold border border-white/20 shadow-lg">
                        {b.title.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-base leading-tight truncate max-w-[180px]">{b.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {hasYT && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-white/80 bg-white/15 px-1.5 py-0.5 rounded-full">
                              <Youtube size={10} /> YouTube
                            </span>
                          )}
                          <span className="text-[10px] text-white/70 font-medium">
                            {memberCount} miembro{memberCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isConfirming ? (
                    <div className="p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <Trash2 size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold" style={{ color: `var(--ff-danger-text, var(--ff-text-primary))` }}>
                            Eliminar "{b.title}"?
                          </p>
                          <p className="text-xs mt-1" style={{ color: `var(--ff-text-tertiary)` }}>
                            Se eliminaran todas las tarjetas, checklists y configuracion. No se puede deshacer.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void handleDelete(b.id)}
                          disabled={isDeleting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-60"
                        >
                          {isDeleting ? (
                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          {isDeleting ? 'Eliminando...' : 'Si, eliminar'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeleting}
                          className="px-4 py-2.5 text-xs font-medium rounded-xl transition-colors"
                          style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)` }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <StatBox icon={<Film size={13} />} value={cardCount} label="Videos" />
                        <StatBox icon={<Clapperboard size={13} />} value={inProgress} label="En progreso" />
                        <StatBox icon={<Check size={13} />} value={publishedCount} label="Publicados" />
                      </div>

                      {b.workflowConfig && (
                        <div className="flex gap-1.5 flex-wrap mb-4">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-tertiary)` }}>
                            {b.workflowConfig.cadence} video{b.workflowConfig.cadence > 1 ? 's' : ''}/sem
                          </span>
                          {b.workflowConfig.roles.map((r) => (
                            <span key={r} className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${
                              r === 'creador' ? 'bg-blue-500' : r === 'editor' ? 'bg-orange-500' : 'bg-emerald-500'
                            }`}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => onSelect(b.id, 'board')}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 hover:shadow-md"
                          style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-primary)`, border: `1px solid var(--ff-border)` }}
                        >
                          <Layout size={14} />
                          Tablero
                        </button>
                        <button
                          onClick={() => onSelect(b.id, 'dashboard')}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-all duration-200 hover:shadow-md shadow-blue-500/10"
                        >
                          <BarChart3 size={14} />
                          Dashboard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isCreating ? (
              <div
                className="rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3"
                style={{ borderColor: `var(--ff-primary)`, background: `color-mix(in srgb, var(--ff-primary) 3%, var(--ff-surface-solid))` }}
              >
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Tv size={24} className="text-blue-600" />
                </div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Nombre del canal..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewTitle('');
                    }
                  }}
                  className="w-full text-center text-sm font-semibold px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/20"
                  style={{ background: `var(--ff-input-bg)`, borderColor: `var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCreate()}
                    disabled={!newTitle.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check size={14} /> Crear
                  </button>
                  <button
                    onClick={() => { setIsCreating(false); setNewTitle(''); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:bg-gray-100"
                    style={{ color: `var(--ff-text-secondary)` }}
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01] min-h-[200px] group"
                style={{ borderColor: `var(--ff-border-medium)`, background: `var(--ff-surface-solid)` }}
              >
                <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  <Plus size={24} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <span className="text-sm font-semibold" style={{ color: `var(--ff-text-tertiary)` }}>Nuevo Canal</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="text-center p-2.5 rounded-xl" style={{ background: `var(--ff-bg-subtle)` }}>
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color: `var(--ff-text-tertiary)` }}>
        {icon}
      </div>
      <p className="text-lg font-bold" style={{ color: `var(--ff-text-primary)` }}>{value}</p>
      <p className="text-[10px] font-medium" style={{ color: `var(--ff-text-tertiary)` }}>{label}</p>
    </div>
  );
}
