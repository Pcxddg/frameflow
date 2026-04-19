import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, X, Users, Film, Zap, Globe, Trash2, GripVertical, Pencil, Check, AlertTriangle, BarChart3, Palette, Plus, CalendarClock, UserPlus, Clapperboard, Shield, Eye } from 'lucide-react';
import { BoardSeoConfig, WorkflowConfig } from '../types';
import { mergeWorkflowConfig, getWorkflowDescription } from '../lib/workflowPlans';
import { resolveBoardSeoConfig } from '../lib/videoSeoConfig';
import { saveBoardSnapshot } from '../lib/supabase/frameflow';
import { useBoard } from '../store';
import { useTheme, THEME_META, Theme } from '../useTheme';
import { v4 as uuidv4 } from 'uuid';

interface BoardSettingsProps {
  hideTrigger?: boolean;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function BoardSettings({ hideTrigger = false, isOpen: controlledIsOpen, onOpenChange }: BoardSettingsProps) {
  const { board, user, removeMember, deleteBoard, updateBoardMeta } = useBoard();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editNiche, setEditNiche] = useState('');
  const [defaultType, setDefaultType] = useState<'long' | 'short' | ''>('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListTitle, setEditingListTitle] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'workflow' | 'columns' | 'danger'>('general');
  const [editYoutubeUrl, setEditYoutubeUrl] = useState('');
  const [wfCadence, setWfCadence] = useState(1);
  const [wfShorts, setWfShorts] = useState(2);
  const [wfRoles, setWfRoles] = useState<WorkflowConfig['roles']>(['creador', 'editor']);
  const [wfEditorLevel, setWfEditorLevel] = useState<'full' | 'basic'>('full');
  const [wfAssistantLevel, setWfAssistantLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [seoConfig, setSeoConfig] = useState<BoardSeoConfig>(() => resolveBoardSeoConfig());
  const { theme, setTheme } = useTheme();
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = (nextIsOpen: boolean) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(nextIsOpen);
    }
    onOpenChange?.(nextIsOpen);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!board) return null;

  const isOwner = user?.uid === board.ownerId;

  const handleOpen = () => {
    setEditTitle(board.title);
    setEditNiche(board.nicheName || '');
    setDefaultType((board.defaultContentType as 'long' | 'short' | '') || '');
    setEditYoutubeUrl(board.youtubeChannelUrl || '');
    const wf = mergeWorkflowConfig(board.workflowConfig);
    const resolvedSeoConfig = resolveBoardSeoConfig(board.seoConfig);
    setWfCadence(wf.cadence);
    setWfShorts(wf.shortsPerWeek);
    setWfRoles([...wf.roles]);
    setWfEditorLevel(wf.editorLevel);
    setWfAssistantLevel(wf.assistantLevel || 'beginner');
    setSeoConfig(resolvedSeoConfig);
    setActiveTab('general');
    setIsConfirmingDelete(false);
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!board) return;
    try {
      await updateBoardMeta({
        title: editTitle.trim() || board.title,
        nicheName: editNiche.trim(),
        defaultContentType: defaultType,
        youtubeChannelUrl: editYoutubeUrl.trim(),
        seoConfig: {
          descriptionTemplate: seoConfig.descriptionTemplate.trim() || resolveBoardSeoConfig().descriptionTemplate,
          productUrl: seoConfig.productUrl.trim(),
          instagramUrl: seoConfig.instagramUrl.trim(),
          tiktokUrl: seoConfig.tiktokUrl.trim(),
          collabEmail: seoConfig.collabEmail.trim(),
        },
        workflowConfig: {
          ...mergeWorkflowConfig(board.workflowConfig),
          cadence: wfCadence,
          shortsPerWeek: wfShorts,
          roles: wfRoles,
          editorLevel: wfEditorLevel,
          assistantLevel: wfAssistantLevel,
        },
      });
    } catch (error) {
      console.error('Error saving board settings:', error);
    }
    setIsOpen(false);
  };

  const handleRenameList = async (listId: string) => {
    if (!editingListTitle.trim()) {
      setEditingListId(null);
      return;
    }
    const newLists = board.lists.map(l =>
      l.id === listId ? { ...l, title: editingListTitle.trim() } : l
    );
    try {
      await saveBoardSnapshot({ ...board, lists: newLists });
    } catch (error) {
      console.error('Error renaming list:', error);
    }
    setEditingListId(null);
  };

  const handleAddColumn = async () => {
    if (!newColumnTitle.trim()) return;
    const newList = { id: `list-${uuidv4()}`, title: newColumnTitle.trim(), cardIds: [] };
    const newLists = [...board.lists, newList];
    try {
      await saveBoardSnapshot({ ...board, lists: newLists });
    } catch (error) {
      console.error('Error adding column:', error);
    }
    setNewColumnTitle('');
    setIsAddingColumn(false);
  };

  const handleDeleteList = async (listId: string) => {
    const list = board.lists.find(l => l.id === listId);
    if (!list || list.cardIds.length > 0) return; // Only delete empty columns
    const newLists = board.lists.filter(l => l.id !== listId);
    try {
      await saveBoardSnapshot({ ...board, lists: newLists });
    } catch (error) {
      console.error('Error deleting column:', error);
    }
    setDeletingListId(null);
  };

  const handleMoveList = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= board.lists.length) return;
    const newLists = [...board.lists];
    [newLists[index], newLists[newIndex]] = [newLists[newIndex], newLists[index]];
    try {
      await saveBoardSnapshot({ ...board, lists: newLists });
    } catch (error) {
      console.error('Error reordering lists:', error);
    }
  };

  const handleDeleteBoard = async () => {
    if (!isOwner) return;
    await deleteBoard(board.id);
    setIsOpen(false);
  };

  // Stats
  const totalCards = Object.keys(board.cards).length;
  const longCards = Object.values(board.cards).filter(c => c.contentType === 'long').length;
  const shortCards = Object.values(board.cards).filter(c => c.contentType === 'short').length;
  const publishedCards = board.lists[board.lists.length - 1]?.cardIds.length || 0;
  const completedChecklists = Object.values(board.cards).reduce((acc, c) => {
    const total = c.checklists.reduce((a, cl) => a + cl.items.length, 0);
    const done = c.checklists.reduce((a, cl) => a + cl.items.filter(i => i.isCompleted).length, 0);
    return acc + (total > 0 && done === total ? 1 : 0);
  }, 0);

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'workflow' as const, label: 'Workflow' },
    { id: 'columns' as const, label: `Columnas (${board.lists.length})` },
    { id: 'danger' as const, label: 'Avanzado' },
  ];

  const toggleRole = (role: 'editor' | 'asistente') => {
    setWfRoles(prev => {
      if (prev.includes(role)) return prev.filter(r => r !== role);
      return [...prev, role];
    });
  };

  return (
    <>
      {!hideTrigger && (
        <button
          onClick={handleOpen}
          className="flex items-center space-x-1.5 bg-white/15 hover:bg-white/25 text-white px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
          title="Ajustes del Canal"
        >
          <Settings size={16} />
          <span className="hidden sm:inline">Ajustes</span>
        </button>
      )}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center overflow-hidden sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm ff-fade-in" onClick={() => setIsOpen(false)} />
          <div
            className="ff-board-settings relative w-full h-full sm:h-auto sm:max-w-lg overflow-hidden ff-scale-in flex flex-col rounded-none sm:rounded-2xl max-h-none sm:max-h-[85vh]"
            style={{ background: `var(--ff-modal-bg)`, boxShadow: `var(--ff-shadow-xl)` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 shrink-0" style={{ borderBottom: `1px solid var(--ff-border-medium)` }}>
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold" style={{ color: `var(--ff-text-primary)` }}>Ajustes del Canal</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-md transition-colors" style={{ color: `var(--ff-text-tertiary)` }}>
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-5 shrink-0" style={{ borderBottom: `1px solid var(--ff-border-medium)` }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px"
                  style={activeTab === tab.id
                    ? { color: `var(--ff-primary)`, borderColor: `var(--ff-primary)` }
                    : { color: `var(--ff-text-tertiary)`, borderColor: `transparent` }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="ff-scrollbar flex-1 overflow-y-auto p-5 space-y-5">

              {/* ═══ TAB: General ═══ */}
              {activeTab === 'general' && (
                <>
                  {/* Theme Picker */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-2.5 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                      <Palette size={13} />
                      Tema Visual
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(Object.keys(THEME_META) as Theme[]).map(t => {
                        const meta = THEME_META[t];
                        const isActive = theme === t;
                        return (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className="relative p-3 rounded-xl border-2 transition-all duration-200 text-left group"
                            style={isActive
                              ? {
                                  borderColor: `var(--ff-primary)`,
                                  boxShadow: `0 14px 32px -24px color-mix(in srgb, var(--ff-primary) 36%, black)`,
                                  transform: 'scale(1.02)',
                                  background: `color-mix(in srgb, var(--ff-primary) 6%, var(--ff-surface-solid))`,
                                }
                              : {
                                  borderColor: `var(--ff-border-medium)`,
                                  background: `var(--ff-surface-solid)`,
                                }}
                          >
                            {/* Mini preview */}
                            <div className="w-full aspect-[4/3] rounded-lg overflow-hidden mb-2.5 border shadow-sm" style={{ borderColor: meta.preview.outline }}>
                              {/* Header bar */}
                              <div className="h-[22%]" style={{ background: meta.preview.header }} />
                              {/* Body with 2 cards */}
                              <div className="h-[78%] flex items-center justify-center gap-1.5 px-2" style={{ background: meta.preview.bg }}>
                                <div className="w-1/2 h-[60%] rounded" style={{ background: meta.preview.card, border: `1px solid ${meta.preview.outline}` }} />
                                <div className="w-1/2 h-[60%] rounded" style={{ background: meta.preview.card, border: `1px solid ${meta.preview.outline}` }} />
                              </div>
                            </div>
                            {/* Label */}
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] font-bold" style={{ background: meta.preview.accent, color: '#fff' }}>{meta.icon}</span>
                              <div>
                                <p className="text-xs font-bold" style={{ color: `var(--ff-text-primary)` }}>{meta.label}</p>
                                <p className="text-[10px]" style={{ color: `var(--ff-text-secondary)` }}>{meta.description}</p>
                              </div>
                            </div>
                            {/* Active indicator */}
                            {isActive && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Nombre del Canal</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                      placeholder="Mi Canal de YouTube"
                    />
                  </div>

                  {/* Niche */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1.5 flex items-center gap-1" style={{ color: `var(--ff-text-tertiary)` }}>
                      <Globe size={12} />
                      Nicho / Oceano Azul
                    </label>
                    <input
                      type="text"
                      value={editNiche}
                      onChange={e => setEditNiche(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                      placeholder="Ej: Productividad + Programacion = Tech Habits"
                    />
                    <p className="text-[10px] mt-1" style={{ color: `var(--ff-text-tertiary)` }}>Cruza 2 nichos para crear tu Oceano Azul unico.</p>
                  </div>

                  {/* YouTube Channel URL */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1.5 flex items-center gap-1" style={{ color: `var(--ff-text-tertiary)` }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-red-500"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                      Canal de YouTube
                    </label>
                    <input
                      type="url"
                      value={editYoutubeUrl}
                      onChange={e => setEditYoutubeUrl(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                      placeholder="https://www.youtube.com/@tucanalaqui"
                    />
                    <p className="text-[10px] mt-1" style={{ color: `var(--ff-text-tertiary)` }}>Pega la URL de tu canal. El dashboard consultara YouTube a traves del backend seguro del proyecto.</p>
                  </div>

                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `var(--ff-border)`, background: `var(--ff-surface-solid)` }}>
                    <div>
                      <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Plantilla SEO del canal</label>
                      <textarea
                        value={seoConfig.descriptionTemplate}
                        onChange={e => setSeoConfig(prev => ({ ...prev, descriptionTemplate: e.target.value }))}
                        rows={9}
                        className="w-full resize-none rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                        placeholder="[DESCRIPCION SEO DEL VIDEO]..."
                      />
                      <p className="text-[10px] mt-1 leading-5" style={{ color: `var(--ff-text-tertiary)` }}>
                        Usa estos tokens: <code>{'{{descriptionBody}}'}</code>, <code>{'{{productUrl}}'}</code>, <code>{'{{instagramUrl}}'}</code>, <code>{'{{tiktokUrl}}'}</code>, <code>{'{{collabEmail}}'}</code>, <code>{'{{hashtags}}'}</code>.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Link del producto</label>
                        <input
                          type="url"
                          value={seoConfig.productUrl}
                          onChange={e => setSeoConfig(prev => ({ ...prev, productUrl: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Instagram</label>
                        <input
                          type="url"
                          value={seoConfig.instagramUrl}
                          onChange={e => setSeoConfig(prev => ({ ...prev, instagramUrl: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                          placeholder="https://www.instagram.com/..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>TikTok</label>
                        <input
                          type="url"
                          value={seoConfig.tiktokUrl}
                          onChange={e => setSeoConfig(prev => ({ ...prev, tiktokUrl: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                          placeholder="https://www.tiktok.com/@..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Correo de colaboraciones</label>
                        <input
                          type="email"
                          value={seoConfig.collabEmail}
                          onChange={e => setSeoConfig(prev => ({ ...prev, collabEmail: e.target.value }))}
                          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                          placeholder="correo@canal.com"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] leading-5" style={{ color: `var(--ff-text-tertiary)` }}>
                      Esta configuracion vive a nivel canal y la tarjeta guiada la usa para armar el borrador SEO final sin tocar tus presets legacy.
                    </p>
                  </div>

                  {/* Default content type */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-1.5" style={{ color: `var(--ff-text-tertiary)` }}>Tipo por Defecto (nuevas tarjetas)</label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid var(--ff-input-border)` }}>
                      {[
                        { value: '' as const, label: 'Sin definir', icon: null },
                        { value: 'long' as const, label: 'Video Largo', icon: <Film size={14} /> },
                        { value: 'short' as const, label: 'Short', icon: <Zap size={14} /> },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDefaultType(opt.value)}
                          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            defaultType === opt.value
                              ? 'bg-blue-600 text-white'
                              : ''
                          }`}
                          style={defaultType !== opt.value ? { background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` } : {}}
                        >
                          {opt.icon}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Members */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                      <Users size={12} />
                      Miembros activos ({board.members.length})
                    </label>
                    <div className="space-y-1.5">
                      {board.members.map((email, i) => {
                        const role = board.memberRoles?.[email] || (i === 0 ? 'owner' : 'editor');
                        const isMemberOwner = role === 'owner';
                        const canRemove = isOwner && !isMemberOwner;
                        const roleMeta = role === 'viewer'
                          ? { label: 'Solo lectura', icon: <Eye size={11} />, badge: 'bg-slate-100 text-slate-700', avatar: 'bg-slate-500' }
                          : role === 'editor'
                          ? { label: 'Puede editar', icon: <Shield size={11} />, badge: 'bg-orange-100 text-orange-700', avatar: 'bg-orange-500' }
                          : { label: 'Propietario', icon: <Shield size={11} />, badge: 'bg-blue-100 text-blue-700', avatar: 'bg-gradient-to-br from-blue-500 to-indigo-600' };
                        return (
                          <div key={email} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg text-sm group">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${roleMeta.avatar}`}>
                              {email.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-700 truncate block text-sm">{email}</span>
                              <span className="text-[10px] text-gray-400 inline-flex items-center gap-1">{roleMeta.icon}{roleMeta.label}</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${roleMeta.badge}`}>{roleMeta.label}</span>
                            {canRemove && (
                              <button
                                onClick={() => removeMember(email)}
                                className="text-gray-400 hover:text-red-500 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                title="Eliminar miembro"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-dashed px-3 py-4 text-sm" style={{ borderColor: `var(--ff-border)` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, var(--ff-primary) 12%, var(--ff-surface-solid))`, color: `var(--ff-primary)` }}>
                        <UserPlus size={14} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">Los accesos nuevos se activan al instante</p>
                        <p className="text-xs text-gray-500 mt-1 leading-5">
                          Comparte el canal desde el boton <span className="font-semibold">Compartir</span>. Si esa persona aun no tiene cuenta, el canal le aparecera automaticamente cuando entre con ese mismo email.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-3 flex items-center gap-1">
                      <BarChart3 size={11} />
                      Estadisticas del Canal
                    </p>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-xl font-bold text-gray-800">{totalCards}</p>
                        <p className="text-[10px] text-gray-500">Total</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-blue-600">{longCards}</p>
                        <p className="text-[10px] text-gray-500">Largos</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-purple-600">{shortCards}</p>
                        <p className="text-[10px] text-gray-500">Shorts</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-green-600">{publishedCards}</p>
                        <p className="text-[10px] text-gray-500">Publicados</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-bold text-gray-800">{board.lists.length}</p>
                        <p className="text-[10px] text-gray-500">Columnas</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-800">{board.members.length}</p>
                        <p className="text-[10px] text-gray-500">Miembros</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{completedChecklists}</p>
                        <p className="text-[10px] text-gray-500">Checklists OK</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ═══ TAB: Workflow ═══ */}
              {activeTab === 'workflow' && (
                <>
                  {/* Current config summary */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-3.5 text-white">
                    <p className="text-[10px] uppercase font-bold text-blue-200 mb-0.5">Configuracion actual</p>
                    <p className="text-sm font-bold">{getWorkflowDescription({ cadence: wfCadence, shortsPerWeek: wfShorts, roles: wfRoles, editorLevel: wfEditorLevel, assistantLevel: wfAssistantLevel })}</p>
                  </div>

                  {/* Cadence selector */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                      <Clapperboard size={13} />
                      Videos largos por semana
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 1, label: '1 video', desc: 'Ideal para empezar', emoji: '🎯' },
                        { value: 2, label: '2 videos', desc: 'Crecimiento acelerado', emoji: '🚀' },
                        { value: 3, label: '3 videos', desc: 'Modo maquina', emoji: '⚡' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setWfCadence(opt.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                            wfCadence === opt.value
                              ? 'border-blue-500 shadow-md shadow-blue-500/15 scale-[1.02]'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          style={wfCadence !== opt.value ? { background: `var(--ff-surface-solid)` } : { background: `color-mix(in srgb, var(--ff-primary) 5%, var(--ff-surface-solid))` }}
                        >
                          <span className="text-lg">{opt.emoji}</span>
                          <p className="text-sm font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>{opt.label}</p>
                          <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                    {wfCadence >= 2 && (
                      <p className="text-[10px] text-amber-600 mt-1.5 font-medium">
                        {wfCadence === 2 ? 'Recomendado: tener editor dedicado.' : 'Requiere equipo completo (Creador + Editor + Asistente).'}
                      </p>
                    )}
                  </div>

                  {/* Shorts per week */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                      <Zap size={13} />
                      Shorts por semana
                    </label>
                    <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid var(--ff-input-border)` }}>
                      {[0, 2, 3, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setWfShorts(n)}
                          className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                            wfShorts === n ? 'bg-purple-600 text-white' : ''
                          }`}
                          style={wfShorts !== n ? { background: `var(--ff-surface-solid)`, color: `var(--ff-text-secondary)` } : {}}
                        >
                          {n === 0 ? 'Ninguno' : n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Roles */}
                  <div>
                    <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                      <Users size={13} />
                      Roles del equipo
                    </label>
                    <div className="space-y-2">
                      {/* Creador - always active */}
                      <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-blue-500" style={{ background: `color-mix(in srgb, var(--ff-primary) 5%, var(--ff-surface-solid))` }}>
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">C</div>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Creador</p>
                          <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>Contenido, direccion creativa, publicacion</p>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Siempre activo</span>
                      </div>

                      {/* Editor toggle */}
                      <button
                        onClick={() => toggleRole('editor')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                          wfRoles.includes('editor') ? 'border-orange-400' : 'border-gray-200 opacity-60'
                        }`}
                        style={{ background: wfRoles.includes('editor') ? `color-mix(in srgb, var(--ff-primary) 8%, var(--ff-surface-solid))` : `var(--ff-surface-solid)` }}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${wfRoles.includes('editor') ? 'bg-orange-500' : 'bg-gray-300'}`}>E</div>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Editor</p>
                          <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>Post-produccion, edicion, entregables</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${wfRoles.includes('editor') ? 'bg-orange-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                          <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </button>

                      {/* Asistente toggle */}
                      <button
                        onClick={() => toggleRole('asistente')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                          wfRoles.includes('asistente') ? 'border-emerald-400' : 'border-gray-200 opacity-60'
                        }`}
                        style={{ background: wfRoles.includes('asistente') ? `color-mix(in srgb, var(--ff-success-text) 8%, var(--ff-surface-solid))` : `var(--ff-surface-solid)` }}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${wfRoles.includes('asistente') ? 'bg-emerald-500' : 'bg-gray-300'}`}>A</div>
                        <div className="flex-1">
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Asistente</p>
                          <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>Investigacion, miniaturas, redes, metadata</p>
                        </div>
                        <div className={`w-10 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${wfRoles.includes('asistente') ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                          <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                        </div>
                      </button>
                    </div>
                    {wfRoles.includes('asistente') && (
                      <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                        <p className="text-[10px] text-emerald-700 font-medium">Con Asistente activo, las tareas de investigacion, miniaturas, metadata y comentarios se redistribuyen automaticamente del Creador/Editor al Asistente.</p>
                      </div>
                    )}
                  </div>

                  {/* Editor level */}
                  {wfRoles.includes('editor') && (
                    <div>
                      <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                        <CalendarClock size={13} />
                        Nivel del Editor
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setWfEditorLevel('basic')}
                          className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                            wfEditorLevel === 'basic' ? 'border-orange-400 shadow-md shadow-orange-500/10' : 'border-gray-200'
                          }`}
                          style={wfEditorLevel !== 'basic' ? { background: `var(--ff-surface-solid)` } : { background: `color-mix(in srgb, var(--ff-primary) 8%, var(--ff-surface-solid))` }}
                        >
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Basico</p>
                          <p className="text-[10px] mt-0.5" style={{ color: `var(--ff-text-tertiary)` }}>Recibe brutos y edita. Solo ejecuta.</p>
                        </button>
                        <button
                          onClick={() => setWfEditorLevel('full')}
                          className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                            wfEditorLevel === 'full' ? 'border-orange-400 shadow-md shadow-orange-500/10' : 'border-gray-200'
                          }`}
                          style={wfEditorLevel !== 'full' ? { background: `var(--ff-surface-solid)` } : { background: `color-mix(in srgb, var(--ff-primary) 8%, var(--ff-surface-solid))` }}
                        >
                          <p className="text-sm font-bold" style={{ color: `var(--ff-text-primary)` }}>Completo</p>
                          <p className="text-[10px] mt-0.5" style={{ color: `var(--ff-text-tertiary)` }}>Edita, propone cortes, gestiona archivos, Shorts independientes.</p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Assistant level */}
                  {wfRoles.includes('asistente') && (
                    <div>
                      <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: `var(--ff-text-tertiary)` }}>
                        <UserPlus size={13} />
                        Nivel del Asistente
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'beginner' as const, label: 'Principiante', desc: 'Tareas simples y mecanicas', emoji: '🌱' },
                          { value: 'intermediate' as const, label: 'Intermedio', desc: 'Tareas con criterio propio', emoji: '📈' },
                          { value: 'advanced' as const, label: 'Avanzado', desc: 'Creativo, estrategico, autonomo', emoji: '⭐' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setWfAssistantLevel(opt.value)}
                            className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                              wfAssistantLevel === opt.value
                                ? 'border-emerald-400 shadow-md shadow-emerald-500/10 scale-[1.02]'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            style={wfAssistantLevel !== opt.value ? { background: `var(--ff-surface-solid)` } : { background: `color-mix(in srgb, var(--ff-success-text) 8%, var(--ff-surface-solid))` }}
                          >
                            <span className="text-lg">{opt.emoji}</span>
                            <p className="text-xs font-bold mt-1" style={{ color: `var(--ff-text-primary)` }}>{opt.label}</p>
                            <p className="text-[10px]" style={{ color: `var(--ff-text-tertiary)` }}>{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                        <p className="text-[10px] text-emerald-700 font-medium">
                          {wfAssistantLevel === 'beginner' && 'Principiante: organizar archivos, publicar en redes, responder comentarios, verificar metadata. Las tareas avanzadas (miniaturas, investigacion, reportes) quedan con el Creador/Editor.'}
                          {wfAssistantLevel === 'intermediate' && 'Intermedio: todo lo basico + investigar keywords, preparar metadata, buscar referencias visuales, programar redes.'}
                          {wfAssistantLevel === 'advanced' && 'Avanzado: todas las tareas de asistente, incluyendo diseñar miniaturas, investigar tendencias y generar reportes de metricas.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI recommendation */}
                  {wfCadence >= 3 && !wfRoles.includes('asistente') && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <p className="text-xs text-amber-800 font-medium flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                        Con 3 videos/semana se recomienda activar el rol de Asistente para distribuir la carga de trabajo.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ═══ TAB: Columnas ═══ */}
              {activeTab === 'columns' && (
                <>
                  <p className="text-xs" style={{ color: `var(--ff-text-tertiary)` }}>Renombra, reordena, agrega o elimina columnas de tu flujo de trabajo.</p>
                  <div className="space-y-1">
                    {board.lists.map((list, index) => (
                      <div key={list.id} className="flex items-center gap-2 rounded-lg px-3 py-2 group" style={{ background: `var(--ff-bg-subtle)` }}>
                        <GripVertical size={14} className="text-gray-300 shrink-0" />
                        <span className="text-[10px] font-bold w-5 shrink-0" style={{ color: `var(--ff-text-tertiary)` }}>{index + 1}</span>

                        {editingListId === list.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleRenameList(list.id); }}
                            className="flex-1 flex items-center gap-2"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={editingListTitle}
                              onChange={e => setEditingListTitle(e.target.value)}
                              onBlur={() => handleRenameList(list.id)}
                              onKeyDown={e => { if (e.key === 'Escape') setEditingListId(null); }}
                              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500/20"
                              style={{ background: `var(--ff-input-bg)`, color: `var(--ff-text-primary)` }}
                            />
                            <button type="submit" className="text-blue-600 hover:text-blue-700 p-0.5">
                              <Check size={14} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium truncate" style={{ color: `var(--ff-text-primary)` }}>{list.title}</span>
                            <span className="text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded-full" style={{ color: `var(--ff-text-tertiary)`, background: `var(--ff-input-bg)` }}>
                              {list.cardIds.length} {list.cardIds.length === 1 ? 'tarjeta' : 'tarjetas'}
                            </span>
                            <button
                              onClick={() => { setEditingListId(list.id); setEditingListTitle(list.title); }}
                              className="text-gray-400 hover:text-blue-600 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all shrink-0"
                              title="Renombrar"
                            >
                              <Pencil size={13} />
                            </button>
                            {/* Delete column (only if empty) */}
                            {list.cardIds.length === 0 ? (
                              deletingListId === list.id ? (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                  <button
                                    onClick={() => handleDeleteList(list.id)}
                                    className="text-[10px] text-red-600 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded font-semibold transition-colors"
                                  >
                                    Eliminar
                                  </button>
                                  <button
                                    onClick={() => setDeletingListId(null)}
                                    className="text-[10px] text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded transition-colors"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingListId(list.id)}
                                  className="text-gray-300 hover:text-red-500 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                  title="Eliminar columna vacia"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )
                            ) : null}
                          </>
                        )}

                        {/* Reorder arrows */}
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <button
                            onClick={() => handleMoveList(index, 'up')}
                            disabled={index === 0}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed p-px"
                            title="Mover arriba"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
                          </button>
                          <button
                            onClick={() => handleMoveList(index, 'down')}
                            disabled={index === board.lists.length - 1}
                            className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed p-px"
                            title="Mover abajo"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add new column */}
                  {isAddingColumn ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleAddColumn(); }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 border-2 border-dashed border-blue-300"
                      style={{ background: `color-mix(in srgb, var(--ff-primary) 5%, transparent)` }}
                    >
                      <Plus size={14} className="text-blue-500 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={newColumnTitle}
                        onChange={e => setNewColumnTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { setIsAddingColumn(false); setNewColumnTitle(''); } }}
                        placeholder="Nombre de la columna..."
                        className="flex-1 px-2 py-1 text-sm rounded-md outline-none focus:ring-2 focus:ring-blue-500/20"
                        style={{ background: `var(--ff-input-bg)`, border: `1px solid var(--ff-input-border)`, color: `var(--ff-text-primary)` }}
                      />
                      <button type="submit" disabled={!newColumnTitle.trim()} className="text-blue-600 hover:text-blue-700 p-1 disabled:opacity-30">
                        <Check size={16} />
                      </button>
                      <button type="button" onClick={() => { setIsAddingColumn(false); setNewColumnTitle(''); }} className="p-1" style={{ color: `var(--ff-text-tertiary)` }}>
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsAddingColumn(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed text-sm font-medium transition-all hover:border-blue-400 hover:text-blue-600"
                      style={{ borderColor: `var(--ff-border-medium)`, color: `var(--ff-text-tertiary)` }}
                    >
                      <Plus size={16} />
                      Agregar columna
                    </button>
                  )}
                </>
              )}

              {/* ═══ TAB: Avanzado / Danger ═══ */}
              {activeTab === 'danger' && (
                <>
                  {/* Board info */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase" style={{ color: `var(--ff-text-tertiary)` }}>Informacion del Tablero</label>
                    <div className="rounded-lg p-3 space-y-1.5 text-xs" style={{ background: `var(--ff-bg-subtle)`, color: `var(--ff-text-secondary)`, border: `1px solid var(--ff-border)` }}>
                      <div className="flex justify-between">
                        <span style={{ color: `var(--ff-text-tertiary)` }}>ID</span>
                        <span className="font-mono truncate ml-4 max-w-[200px]" style={{ color: `var(--ff-text-secondary)` }}>{board.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: `var(--ff-text-tertiary)` }}>Creado</span>
                        <span>{board.createdAt ? new Date(board.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Desconocido'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: `var(--ff-text-tertiary)` }}>Ultima actualizacion</span>
                        <span>{board.updatedAt ? new Date(board.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Desconocido'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: `var(--ff-text-tertiary)` }}>Propietario</span>
                        <span>{board.members[0] || 'Desconocido'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Delete board */}
                  {isOwner && (
                    <div className="rounded-xl p-4 space-y-3" style={{ border: `1px solid var(--ff-danger-border)`, background: `color-mix(in srgb, var(--ff-danger-bg) 78%, transparent)` }}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold" style={{ color: `var(--ff-danger-text)` }}>Eliminar Canal</h4>
                          <p className="text-xs mt-0.5" style={{ color: `var(--ff-danger-text)` }}>
                            Esta accion eliminara permanentemente el canal <strong>"{board.title}"</strong>, incluyendo todas sus tarjetas, checklists y configuracion. Esta accion no se puede deshacer.
                          </p>
                        </div>
                      </div>
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDeleteBoard}
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Trash2 size={14} />
                            Si, eliminar permanentemente
                          </button>
                          <button
                            onClick={() => setIsConfirmingDelete(false)}
                            className="px-4 py-2.5 text-sm rounded-lg font-medium transition-colors"
                            style={{ color: `var(--ff-text-secondary)`, background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-border-medium)` }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsConfirmingDelete(true)}
                          className="w-full py-2 text-sm font-medium rounded-lg transition-colors"
                          style={{ background: `var(--ff-surface-solid)`, border: `1px solid var(--ff-danger-border)`, color: `var(--ff-danger-text)` }}
                        >
                          Eliminar este canal...
                        </button>
                      )}
                    </div>
                  )}

                  {!isOwner && (
                    <div className="rounded-xl p-4" style={{ background: `var(--ff-warning-bg)`, border: `1px solid var(--ff-warning-border)` }}>
                      <p className="text-xs" style={{ color: `var(--ff-warning-text)` }}>Solo el propietario del canal puede eliminarlo o realizar acciones avanzadas.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 flex justify-end gap-2 shrink-0" style={{ borderTop: `1px solid var(--ff-border-medium)`, background: `var(--ff-modal-footer)` }}>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm rounded-lg transition-colors font-medium"
                style={{ color: `var(--ff-text-secondary)` }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 font-semibold"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
