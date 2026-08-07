# Ledger — Payroll Admin App

A small, self-hosted payroll system: manage employees, run payroll for a
period, and generate payslip PDFs. Admin-only login (no public sign-up).
Frontend is plain HTML/CSS/JS, backend is Supabase (Postgres + Auth),
hosted for free on Vercel.

## Stack
- **Frontend:** static HTML/CSS/JS (no build step)
- **Backend:** Supabase (Postgres database + Auth)
- **Hosting:** Vercel, deployed from GitHub

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once it's created, open **SQL Editor** → **New query**, paste the
   contents of [`sql/schema.sql`](sql/schema.sql), and click **Run**.
   This creates the `employees`, `payroll_runs`, and `payslips` tables
   with Row Level Security enabled.
3. Go to **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key
4. Open `js/config.js` in this project and paste them in:
   ```js
   window.SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   window.SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```

## 2. Lock down sign-ups and create your admin login

This app is **admin-only** — there's no public registration form, and
you should disable Supabase's public sign-up too so nobody can register
themselves:

1. **Authentication → Providers → Email** → turn **Allow new users to
   sign up** OFF.
2. **Authentication → Users → Add user** → create yourself (and anyone
   else who needs access) with an email + password directly. That's
   the only way accounts get created.

You can add or remove admins any time from that same screen.

## 3. Run it locally (optional)

No build step needed. Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `index.html`, sign in with the admin account you created.

## 4. Push to GitHub

```bash
cd payroll-app
git init
git add .
git commit -m "Initial payroll app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

> `js/config.js` contains your Supabase **anon** key, which is safe to
> commit — it's a public key by design, and your data is protected by
> the RLS policies in `sql/schema.sql`, not by keeping this key secret.
> Never put your Supabase **service_role** key anywhere in this project.

## 5. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Import the GitHub repo you just pushed.
3. Framework preset: choose **Other** (it's a static site, no build
   command needed). Leave the output directory as the repo root.
4. Click **Deploy**. Vercel gives you a URL like
   `your-project.vercel.app` — that's your live payroll app.

Every time you push to `main`, Vercel redeploys automatically.

---

## How it works

- **Employees tab** — add/edit employee records: base salary, a
  per-period bonus, tax %, pension %, and any flat deductions. Split
  into **Active** / **Archived** sub-tabs.
- **Onboarding** — every employee has a **hire date**. As soon as you
  add them, they're automatically included in payroll from that month
  onward. Nothing else to toggle.
- **Offboarding** — click **Mark exited** on an active employee and
  pick their last working date. They're still paid for that final
  month, then automatically archived and excluded from every payroll
  run after it. Click **Reinstate** on an archived employee to undo
  this.
- **Run payroll tab** — pick a month, click **Preview** to see the
  calculated payslips for every employee eligible that period, then
  **Run payroll** to save them permanently. Each period can only be
  run once.
- **History tab** — every past run, with a payslip list per employee
  and a **PDF** button to download an individual payslip.

### If you already deployed the original schema

Run [`sql/migration_add_hire_exit_dates.sql`](sql/migration_add_hire_exit_dates.sql)
in the Supabase SQL Editor — it swaps the old `active` column for
`hire_date`/`exit_date` without losing data. New setups just use
`schema.sql` and can skip this file.

**Pay calculation:**
```
gross = base_salary + bonus
tax = gross × tax_rate%
pension = gross × pension_rate%
net = gross − tax − pension − other_deductions
```

## Security notes

- Access is gated by Supabase Auth — only accounts you create manually
  can log in.
- Row Level Security policies restrict all database access to
  signed-in (`authenticated`) users only.
- This is intentionally single-role (admin) with no employee
  self-service login. If you later want employees to log in and see
  only their own payslips, that needs additional RLS policies scoped
  by user ID — ask and this can be extended.
