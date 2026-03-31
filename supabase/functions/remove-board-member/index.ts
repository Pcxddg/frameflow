import { serve } from 'jsr:@std/http@1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, requireUser } from '../_shared/auth.ts';

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(request);
    const admin = createAdminClient();
    const { boardId, email } = await request.json();

    if (!boardId || typeof boardId !== 'string' || !email || typeof email !== 'string') {
      return jsonResponse({ error: 'boardId y email son obligatorios.' }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    if ((user.email || '').toLowerCase() === normalizedEmail) {
      return jsonResponse({ error: 'No puedes eliminarte a ti mismo con esta funcion.' }, 400);
    }

    const { data: ownerMember, error: ownerError } = await admin
      .from('board_members')
      .select('role')
      .eq('board_id', boardId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownerError) throw ownerError;
    if (!ownerMember || ownerMember.role !== 'owner') {
      return jsonResponse({ error: 'Solo el owner puede eliminar miembros.' }, 403);
    }

    const { error } = await admin
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('email_lowercase', normalizedEmail);

    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Missing bearer token|Auth session missing/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});

