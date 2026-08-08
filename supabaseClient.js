// Requires the Supabase JS CDN script (loaded in index.html/dashboard.html)
// and js/config.js to be loaded first.
const { createClient } = supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
