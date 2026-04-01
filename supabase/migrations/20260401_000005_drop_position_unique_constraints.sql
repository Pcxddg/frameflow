-- Drop UNIQUE position constraints that block bulk upserts.
-- The RPC functions (ff_apply_list_order, ff_move_card, etc.) already
-- enforce correct ordering via advisory locks + two-pass negative/positive
-- strategy.  The btree indexes remain for query performance.

ALTER TABLE public.lists DROP CONSTRAINT IF EXISTS lists_board_id_position_key;
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_list_id_position_key;
ALTER TABLE public.checklists DROP CONSTRAINT IF EXISTS checklists_card_id_position_key;
ALTER TABLE public.checklist_items DROP CONSTRAINT IF EXISTS checklist_items_checklist_id_position_key;
ALTER TABLE public.production_stages DROP CONSTRAINT IF EXISTS production_stages_card_id_position_key;

-- production_stages had no separate btree index — the unique constraint
-- was providing it.  Create an explicit one.
CREATE INDEX IF NOT EXISTS idx_production_stages_card_position
  ON public.production_stages(card_id, position);
