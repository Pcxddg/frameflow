import { serve } from 'jsr:@std/http@1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, requireUser } from '../_shared/auth.ts';

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(request);
    const admin = createAdminClient();
    const { invitationId } = await request.json();

    if (!invitationId || typeof invitationId !== 'string') {
      return jsonResponse({ error: 'invitationId es obligatorio.' }, 400);
    }

    const { data: invitation, error: invitationError } = await admin
      .from('invitations')
      .select('*')
      .eq('id', invitationId)
      .maybeSingle();

    if (invitationError) throw invitationError;
    if (!invitation) return jsonResponse({ error: 'Invitacion no encontrada.' }, 404);
    if (invitation.status !== 'pending') {
      return jsonResponse({ error: 'La invitacion ya no esta pendiente.' }, 409);
    }
    if ((user.email || '').toLowerCase() !== invitation.invitee_email_lowercase) {
      return jsonResponse({ error: 'Esta invitacion no corresponde a tu usuario.' }, 403);
    }

    const { error: memberError } = await admin.from('board_members').upsert({
      board_id: invitation.board_id,
      user_id: user.id,
      email_lowercase: invitation.invitee_email_lowercase,
      role: invitation.role,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'board_id,user_id' });
    if (memberError) throw memberError;

    const { error: updateError } = await admin.from('invitations').update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', invitationId);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true, boardId: invitation.board_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Missing bearer token|Auth session missing/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});

