// Supabase client for the CKH portal.
// Loaded via the CDN UMD build (see the <script> tag added to every page,
// right before this file), which exposes a global `supabase` object with
// `.createClient()`. We create ONE shared client here as `window.sb`.

const SUPABASE_URL = 'https://uihyoelzilsnizuyrgoj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpaHlvZWx6aWxzbml6dXlyZ29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMTc5NzAsImV4cCI6MjA5OTc5Mzk3MH0.tj7FJO3CnOJbzytphZjQVqILL3VZMCBZ5fOuTtXZUfI';

// `supabase` here is the global from the CDN script tag (@supabase/supabase-js).
// `sb` is OUR app's client instance — used everywhere else in js/db.js.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,     // keeps the session in the browser across reloads/tabs
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
