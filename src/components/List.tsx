import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useBoard } from '../store';
import { List as ListType, CardData, BoardDensity, CardMetaMode } from '../types';
import { Card } from './Card';

interface ListProps {
  list: ListType;
  listIndex?: number;
  totalLists?: number;
  isActiveDesktop?: boolean;
  filterCard?: (card: CardData) => boolean;
  mobileMode?: boolean;
  canEdit?: boolean;
  onMoveRequest?: (card: CardData) => void;
  density?: BoardDensity;
  cardMetaMode?: CardMetaMode;
}

export function List({
  list,
  listIndex = 0,
  totalLists = 0,
  isActiveDesktop = false,
  filterCard,
  mobileMode = false,
  canEdit = true,
  onMoveRequest,
  density = 'comfortable',
  cardMetaMode = 'full',
}: ListProps) {
  const { board, addCard } = useBoard();
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  if (!board) return null;

  const visibleCards = list.cardIds
    .map((cardId) => board.cards[cardId])
    .filter((card): card is CardData => !!card && (!filterCard || filterCard(card)));

  const compactDesktop = !mobileMode && density === 'compact';
  const desktopColumnWidth = density === 'focus'
    ? 'sm:w-[17rem]'
    : density === 'compact'
    ? 'sm:w-[15.5rem]'
    : 'sm:w-[18.5rem]';
  const desktopColumnHeaderPadding = density === 'comfortable' ? 'p-3' : compactDesktop ? 'px-2.5 py-2.5' : 'px-3 py-3';
  const desktopColumnBodyPadding = density === 'comfortable' ? 'px-2.5 pb-2.5 space-y-2.5' : compactDesktop ? 'px-1.5 pb-1.5 space-y-1.5' : 'px-2 pb-2 space-y-1.5';
  const desktopFooterPadding = density === 'comfortable' ? 'p-2.5' : compactDesktop ? 'p-1.5' : 'p-2';
  const addCardLabel = compactDesktop ? 'Añadir' : 'Añadir tarjeta';

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (newCardTitle.trim()) {
      addCard(list.id, newCardTitle.trim());
      setNewCardTitle('');
      setIsAdding(false);
    }
  };

  const addCardBlock = !canEdit ? (
    <div className={`w-full text-sm font-medium rounded-xl ${mobileMode ? 'text-center p-3 min-h-11 border border-dashed' : 'p-2.5'}`} style={mobileMode ? { color: `var(--ff-text-tertiary)`, borderColor: `var(--ff-border-medium)`, background: `var(--ff-bg-subtle)` } : { color: `var(--ff-text-tertiary)` }}>
      Solo lectura
    </div>
  ) : isAdding ? (
    <form onSubmit={handleAddCard} className="p-3 rounded-xl" style={{ background: `var(--ff-card-bg)`, border: `1px solid var(--ff-border)`, boxShadow: `var(--ff-shadow-sm)` }}>
      <input
        type="text"
        autoFocus
        placeholder="Titulo de la tarjeta..."
        className="w-full p-2 text-sm outline-none bg-transparent"
        style={{ color: `var(--ff-text-primary)` }}
        value={newCardTitle}
        onChange={(e) => setNewCardTitle(e.target.value)}
        onBlur={() => {
          if (!newCardTitle.trim()) setIsAdding(false);
        }}
      />
      <div className="flex items-center mt-2.5 space-x-2">
        <button
          type="submit"
          className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200"
        >
          {'A\u00f1adir'}
        </button>
        <button
          type="button"
          onClick={() => setIsAdding(false)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
          style={{ color: `var(--ff-text-tertiary)` }}
        >
          Cancelar
        </button>
      </div>
    </form>
  ) : (
    <button
      onClick={() => setIsAdding(true)}
      className={`flex items-center w-full text-sm font-medium rounded-xl transition-all duration-200 hover:opacity-80 ${mobileMode ? 'justify-center p-3 min-h-11 border border-dashed' : density === 'comfortable' ? 'justify-center p-2.5 border border-dashed' : compactDesktop ? 'justify-center px-2.5 py-2 min-h-9 border border-dashed' : 'justify-center px-3 py-2 min-h-10 border border-dashed'}`}
      style={mobileMode ? { color: `var(--ff-primary)`, borderColor: `var(--ff-border-medium)`, background: `var(--ff-bg-subtle)` } : { color: `var(--ff-text-tertiary)`, borderColor: `var(--ff-border-medium)`, background: `var(--ff-bg-subtle)` }}
    >
      <Plus size={16} className="mr-1.5" />
      {addCardLabel}
    </button>
  );

  if (mobileMode) {
    return (
      <div className="flex flex-col rounded-[1.75rem] overflow-hidden" style={{ background: `var(--ff-column-bg)`, border: `1px solid var(--ff-column-border)`, boxShadow: `var(--ff-shadow-sm)` }}>
        <div className="p-3 border-b" style={{ borderColor: `var(--ff-border)` }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate" style={{ color: `var(--ff-text-primary)` }}>{list.title}</h2>
              <p className="text-[11px] mt-0.5" style={{ color: `var(--ff-text-tertiary)` }}>{visibleCards.length} visibles · {list.cardIds.length} totales</p>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full font-bold tabular-nums shrink-0" style={{ background: `var(--ff-border-medium)`, color: `var(--ff-text-tertiary)` }}>
              {visibleCards.length}
            </span>
          </div>
        </div>

        <div className="px-3 py-3 space-y-3">
          {visibleCards.length > 0 ? (
            visibleCards.map((card, index) => (
              <Card key={card.id} card={card} index={index} draggable={false} mobileMode canEdit={canEdit} onMoveRequest={onMoveRequest} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed px-4 py-8 text-center" style={{ borderColor: `var(--ff-border-medium)`, background: `var(--ff-bg-subtle)` }}>
              <p className="text-sm font-semibold" style={{ color: `var(--ff-text-secondary)` }}>Nada por aqui todavia</p>
              <p className="text-xs mt-1" style={{ color: `var(--ff-text-tertiary)` }}>Crea una tarjeta o ajusta los filtros para seguir trabajando.</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t" style={{ borderColor: `var(--ff-border)` }}>
          {addCardBlock}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col w-[calc(100vw-40px)] ${desktopColumnWidth} max-h-full rounded-[1.6rem] shrink-0 transition-all`}
      style={{
        background: `var(--ff-column-bg)`,
        border: isActiveDesktop ? `1px solid color-mix(in srgb, var(--ff-primary) 28%, var(--ff-column-border))` : `1px solid var(--ff-column-border)`,
        boxShadow: isActiveDesktop ? `var(--ff-shadow-md)` : `var(--ff-shadow-sm)`,
      }}
    >
      <div className={`${desktopColumnHeaderPadding} border-b font-semibold`} style={{ color: `var(--ff-text-secondary)`, borderColor: `var(--ff-border)` }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {!compactDesktop && (
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: isActiveDesktop ? `var(--ff-primary)` : `var(--ff-text-tertiary)` }}>
                {listIndex + 1} de {totalLists || '?'}
              </p>
            )}
            <h2 className={`${compactDesktop ? '' : 'mt-1 '}truncate text-sm font-bold`} style={{ color: `var(--ff-text-primary)` }}>{list.title}</h2>
            {!compactDesktop && (
              <p className="mt-1 text-[11px] font-medium" style={{ color: `var(--ff-text-secondary)` }}>
                {visibleCards.length} visibles · {list.cardIds.length} totales
              </p>
            )}
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full font-bold tabular-nums shrink-0" style={{ background: `var(--ff-border-medium)`, color: `var(--ff-text-tertiary)` }}>
            {visibleCards.length}
          </span>
        </div>
      </div>

      <Droppable droppableId={list.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`ff-scrollbar flex-1 overflow-y-auto ${desktopColumnBodyPadding} min-h-[10px] transition-colors duration-200 ${
              snapshot.isDraggingOver ? 'bg-blue-500/10' : ''
            }`}
          >
            {visibleCards.map((card, index) => (
              <Card key={card.id} card={card} index={index} draggable={canEdit} canEdit={canEdit} density={density} cardMetaMode={cardMetaMode} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <div className={desktopFooterPadding}>{addCardBlock}</div>
    </div>
  );
}

