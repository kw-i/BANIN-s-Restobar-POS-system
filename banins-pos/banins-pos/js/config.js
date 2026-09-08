// ============================================================
// EDIT THESE TWO VALUES ONLY.
// Get them from: Supabase Dashboard → Project Settings → API
// ============================================================
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// Shared Supabase client used by every page.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// A random per-browser id, just so rows carry a reference to which
// device created them. Not used for any sync/merge logic.
function getDeviceId() {
  let id = localStorage.getItem("banin_device_id");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("banin_device_id", id);
  }
  return id;
}
