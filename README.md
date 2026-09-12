# Banin's Restobar POS

A minimal, local-first point-of-sale system built around **tabs** instead of
fixed tables. Plain HTML/CSS/JS frontend, Supabase (Postgres + Auth) backend.

## How it works

- **Tabs, not tables.** Staff opens a tab (auto-named "Tab 1", "Tab 2"... —
  rename it anytime, e.g. to a customer's name), adds items from the menu,
  and closes it out when the bill is paid. Closed tabs become sales history.
- **No lag.** Every tap (new tab, add item, change quantity, close tab)
  updates the screen instantly from an in-memory local state. The write to
  Supabase happens in the background right after — you'll see a small
  "Syncing…" / "All synced" indicator in the corner, but it never blocks the UI.
- **Multi-device.** Every device talks to the same Supabase database. Devices
  don't need to sync with each other in real time — hit **Refresh** on the
  Tabs screen to pull in tabs opened/closed elsewhere. Each row also carries
  a `device_id` for reference (not used for any merge logic).
- **Reports.** Daily / weekly / monthly / yearly views: total sales, tabs
  closed, average tab, a period breakdown table, and the full list of closed
  tabs in range.

## File structure

```
banins-pos/
├── index.html        # login / signup
├── pos.html           # main screen — tabs grid + order modal
├── reports.html        # daily/weekly/monthly/yearly reports
├── schema.sql          # run once in Supabase SQL editor
├── css/style.css
└── js/
    ├── config.js       # <-- put your Supabase URL + anon key here
    ├── auth.js
    ├── pos.js
    └── reports.js
```

## Setup (about 10 minutes)

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New project (the free tier is
plenty for one restobar). Wait for it to finish provisioning.

### 2. Run the schema
Supabase Dashboard → **SQL Editor** → New query → paste the entire contents
of `schema.sql` → **Run**. This creates the `staff`, `menu_items`, `tabs`,
and `tab_items` tables, turns on Row Level Security, and seeds a starter
menu (edit or delete those sample rows any time — from the SQL editor, or
build a small "Menu" admin page later if you want one in-app).

### 3. Run the feature-update migrations
Run these two files, in order, the same way (SQL Editor → New query → paste → Run):
1. `feature_update.sql` — inventory stock, expenses table, tightens permissions so employees only see open tabs.
2. `feature_update_2.sql` — adds the sign-up approval workflow, tab notes, and staff activity tracking.

### 4. Make yourself an admin
By default every new signup is an **employee** (can only use the Tabs
screen). To promote an account to **admin** (sees Reports, Accounting,
Inventory too), run in the SQL Editor:
```sql
update public.staff set role = 'admin' where id =
  (select id from auth.users where email = 'you@example.com');
```

### 5. Turn off email confirmation (optional but recommended for a small team)
Dashboard → **Authentication → Providers → Email** → turn off "Confirm
email". Otherwise each new staff account has to click a confirmation email
before they can sign in.

### 4. Get your API keys
Dashboard → **Project Settings → API**. Copy the **Project URL** and the
**anon public** key into `js/config.js`:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```

### 5. Create staff accounts
Easiest: open `index.html` locally (or after hosting it), click "Create a
staff account" and sign up with an email/password for each staff member.
A `staff` row is created automatically. All signed-in staff can create,
edit, and close tabs.

### 6. Push to GitHub
```bash
cd banins-pos
git init
git add .
git commit -m "Banin's Restobar POS"
git branch -M main
git remote add origin https://github.com/<you>/banins-pos.git
git push -u origin main
```

### 7. Hosting
No build step is needed — it's static HTML/CSS/JS. Easiest free options:

- **GitHub Pages**: repo → Settings → Pages → deploy from `main` branch.
- **Netlify** or **Vercel**: "Import from GitHub", no build command needed,
  publish directory = repo root. Both have generous free tiers and give you
  automatic redeploys whenever you push.

Any of these work fine for a handful of devices (phones/tablets/POS
terminals) hitting the same site.

## Notes / things you may want to tweak later

- **Menu management** currently lives in the database (`menu_items` table).
  You can edit it directly in the Supabase Table Editor — no code changes
  needed to add/remove/reprice items.
- **RLS is intentionally simple**: any signed-in staff member can read/write
  everything. That fits "extremely simple" for a single small restobar. If
  you ever want per-role restrictions (e.g. only admins can delete tabs),
  that's a small change to the policies in `schema.sql`.
- **Offline resilience**: if a device loses internet mid-order, the order
  stays correct on that screen, but the background sync will fail silently
  until you refresh — worth keeping an eye on the sync indicator during a
  spotty connection.

## New: sign-up & approval workflow

Signing up now happens on its own page (`signup.html`) and asks for full
name, phone, email, and password. New accounts start **unapproved** — they
can create a login, but can't actually get into the app until an admin
approves them on the new **Employees** page (visible in the nav to admins
only). That page shows every employee's name, phone, role, whether they're
currently active (seen in the last 3 minutes), when they last signed in,
and a "View Activity" button listing tabs they've opened/closed with
timestamps.

**Important limitation:** approving someone just flips a flag in the
database — there's no automatic "you're approved!" email sent, because
sending email securely requires a backend with a private API key, which a
plain static site can't hold safely. For now, let the person know directly
(text, Slack, whatever) once you've approved them. If you want the
automatic email later, that's a small Supabase Edge Function away — happy
to help set that up if/when you want it.

To permanently remove an unwanted sign-up (not just leave it unapproved),
delete it from Supabase Dashboard → Authentication → Users, same as
you've done before.

## New: light/dark mode, change password, tab notes

Click your name in the top-right dropdown (replaces the old plain "Sign
out" link) for: change password, light/dark mode toggle, and sign out.
Theme choice is saved per-browser.

Every tab now has a **Notes** field anyone can see and edit — good for
"allergic to shellfish," "wants it extra spicy," that kind of thing.

## New: inventory & accounting behavior

- Stock counts now only go down when a tab is actually **paid out**, not
  while items are still sitting on an open tab — so cancelling an order no
  longer wrongly eats into inventory.
- Menu item names and prices are editable directly from the Inventory page.
