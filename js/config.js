// ============================================================
// EDIT THESE TWO VALUES ONLY.
// Get them from: Supabase Dashboard → Project Settings → API
// ============================================================
const SUPABASE_URL = "https://zposbzejybeougfhebkq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwb3NiemVqeWJlb3VnZmhlYmtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjU2MjcsImV4cCI6MjEwNDQ0MTYyN30.MgX1C4bJQBcpTq4WBSTous4NNaUIr2cLQf_zMYlQD2w";

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
