// Supabase Edge Function: manage-teacher-account
//
// Handles the privileged parts of teacher account management that the
// browser can never be trusted to do directly with the anon key:
// creating an auth user, resetting a password, or deleting an account.
// Only an authenticated admin may call this - it re-checks that on
// every request using the caller's own JWT before touching anything.
//
// Deploy with:
//   supabase functions deploy manage-teacher-account
//
// Required secrets (set once):
//   supabase secrets set SUPABASE_URL=https://uihyoelzilsnizuyrgoj.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your service role key, from Project Settings > API>
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are also
// auto-injected by the Supabase platform into every Edge Function, so in
// most projects you don't need to set these manually at all.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// CORS headers - required for requests from browser origins (e.g. Vercel).
// The OPTIONS preflight must be answered before the browser will send the
// real POST, and every real response must echo these headers back too.
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function generateTempPassword(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Ckh-${num}`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight - browsers send this before every cross-origin POST.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';

  // Client scoped to the CALLER's own JWT - used only to verify identity
  // and role, respecting normal RLS (an admin can always read their own
  // profile row).
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller) {
    return jsonResponse({ success: false, message: 'Not signed in' }, 401);
  }

  const { data: callerProfile, error: profileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single();

  if (profileErr || !callerProfile || callerProfile.role !== 'admin') {
    return jsonResponse({ success: false, message: 'Admin access required' }, 403);
  }

  // Privileged client - only used AFTER the admin check above passes.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, message: 'Invalid request body' }, 400);
  }

  const action = body.action as string;

  try {
    if (action === 'create') {
      const { name, email, phone, subjects } = body as {
        name: string; email: string; phone?: string; subjects?: string[];
      };
      if (!name || !email) {
        return jsonResponse({ success: false, message: 'Name and email are required' }, 400);
      }

      const tempPassword = generateTempPassword();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role: 'teacher',
          name,
          phone: phone || null,
          subjects: subjects || []
        }
      });

      if (error) {
        return jsonResponse({ success: false, message: error.message }, 400);
      }

      return jsonResponse({
        success: true,
        tempPassword,
        teacher: { id: data.user!.id, name, email, phone: phone || null, subjects: subjects || [] }
      });
    }

    if (action === 'reset_password') {
      const { teacherId } = body as { teacherId: string };
      if (!teacherId) {
        return jsonResponse({ success: false, message: 'teacherId is required' }, 400);
      }

      const { data: profile, error: profileFetchErr } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', teacherId)
        .single();
      if (profileFetchErr || !profile) {
        return jsonResponse({ success: false, message: 'Teacher not found' }, 404);
      }

      const tempPassword = generateTempPassword();
      const { error } = await adminClient.auth.admin.updateUserById(teacherId, { password: tempPassword });
      if (error) {
        return jsonResponse({ success: false, message: error.message }, 400);
      }

      return jsonResponse({
        success: true,
        tempPassword,
        teacher: { id: profile.id, name: profile.name, email: profile.email, phone: profile.phone, subjects: profile.subjects }
      });
    }

    // ------------------------------------------------------------------
    // reset_password_for_user - reset password for ANY user (student or
    // teacher) by userId. Used by the admin "Password retrieval" tool.
    // ------------------------------------------------------------------
    if (action === 'reset_password_for_user') {
      const { userId } = body as { userId: string };
      if (!userId) {
        return jsonResponse({ success: false, message: 'userId is required' }, 400);
      }

      const { data: profile, error: profileFetchErr } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profileFetchErr || !profile) {
        return jsonResponse({ success: false, message: 'User not found' }, 404);
      }

      const tempPassword = generateTempPassword();
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: tempPassword });
      if (error) {
        return jsonResponse({ success: false, message: error.message }, 400);
      }

      return jsonResponse({
        success: true,
        tempPassword,
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          role: profile.role,
          subjects: profile.subjects
        }
      });
    }

    if (action === 'remove') {
      const { teacherId } = body as { teacherId: string };
      if (!teacherId) {
        return jsonResponse({ success: false, message: 'teacherId is required' }, 400);
      }
      const { error } = await adminClient.auth.admin.deleteUser(teacherId);
      if (error) {
        return jsonResponse({ success: false, message: error.message }, 400);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, message: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ success: false, message: (err as Error).message || 'Unexpected error' }, 500);
  }
});
