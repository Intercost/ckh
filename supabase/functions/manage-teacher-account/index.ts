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
// CORS - required for requests from browser origins (e.g. Vercel).
// This function handles PRIVILEGED account operations (create/reset/delete
// teacher accounts), so unlike a public form endpoint, it should not accept
// requests from arbitrary origins with '*'. Set ALLOWED_ORIGINS as a
// comma-separated list of your real production domain(s):
//   supabase secrets set ALLOWED_ORIGINS=https://ckhschool.com,https://www.ckhschool.com
// localhost is always allowed too, for local development.
// If ALLOWED_ORIGINS is not set, this falls back to reflecting the request's
// own origin (still safer than '*', but you should set the secret above
// before going live).
// ---------------------------------------------------------------------------
const CONFIGURED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'];

function corsHeadersFor(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get('Origin') ?? '';
  const allowList = [...CONFIGURED_ORIGINS, ...DEV_ORIGINS];
  const allowOrigin = allowList.includes(requestOrigin) ? requestOrigin : (CONFIGURED_ORIGINS[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Vary': 'Origin',
  };
}

// Cryptographically random temp password: 14 chars mixing upper/lower/
// digits/symbols. Replaces the old `Ckh-####` pattern, which only had
// 9,000 possible combinations and was brute-forceable in seconds.
function generateTempPassword(): string {
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';       // no I/O (visual ambiguity)
  const LOWER = 'abcdefghijkmnpqrstuvwxyz';        // no l/o
  const DIGITS = '23456789';                       // no 0/1
  const SYMBOLS = '!@#$%^&*-_+=';
  const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

  const pick = (charset: string) => charset[crypto.getRandomValues(new Uint32Array(1))[0] % charset.length];

  // Guarantee at least one of each character class, then fill the rest
  // randomly, then shuffle so the guaranteed characters aren't always in
  // the same positions.
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: 10 }, () => pick(ALL));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function jsonResponseBase(body: unknown, status = 200, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

Deno.serve(async (req) => {
  const CORS_HEADERS = corsHeadersFor(req);
  // Local wrapper so every response below automatically carries the right
  // CORS headers for the calling origin, without editing every call site.
  const jsonResponse = (body: unknown, status = 200) =>
    jsonResponseBase(body, status, CORS_HEADERS);

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
