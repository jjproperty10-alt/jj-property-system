# JJ Property 10 — Setup Guide

## Overview

**Stack:** Next.js 14 · Supabase (PostgreSQL + Auth) · Tailwind CSS · Vercel

**Security:**
- All data in Supabase with Row Level Security (RLS)
- HTTPS enforced
- 2FA available via Supabase Auth
- Each user role sees only what they're allowed to

---

## Step 1 — Create Supabase Project

1. Go to https://supabase.com and sign up (free)
2. Click **New Project**
3. Choose a strong database password — save it securely
4. Region: choose closest to Cyprus (e.g. eu-west-1)
5. Wait ~2 minutes for project to initialize

---

## Step 2 — Run the Database Schema

1. In Supabase, go to **SQL Editor**
2. Open the file `supabase/schema.sql` from this project
3. Paste the entire contents into the SQL Editor
4. Click **Run**
5. You should see "Success. No rows returned."

---

## Step 3 — Import Your Data

1. Install Python dependencies:
   ```bash
   pip install openpyxl supabase python-dotenv
   ```

2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` with your Supabase values:
   - `SUPABASE_URL` → from Supabase: Settings → API → Project URL
   - `SUPABASE_SERVICE_KEY` → from Settings → API → service_role key (secret!)
   - `EXCEL_PATH` → full path to your General.xlsx

4. Run the import:
   ```bash
   python scripts/import_data.py
   ```

5. You should see all 2,061 transactions imported.

---

## Step 4 — Set Up Users

1. In Supabase, go to **Authentication → Users**
2. Click **Invite User** for each person:
   - yossiazizi1@gmail.com → role: super_admin
   - [Yaacov's email] → role: partner_admin
   - [Anastasia's email] → role: airbnb_manager / rental_manager

3. After each user signs up, run this SQL to assign their role:
   ```sql
   INSERT INTO user_profiles (id, name, role)
   SELECT id, 'Yossi', 'super_admin'
   FROM auth.users
   WHERE email = 'yossiazizi1@gmail.com';
   ```

---

## Step 5 — Deploy the App

### Option A: Vercel (Recommended — free, fast, secure)

1. Install Node.js from https://nodejs.org (LTS version)
2. Install the project:
   ```bash
   npm install
   ```
3. Push to GitHub (create a free private repo)
4. Go to https://vercel.com → Import your GitHub repo
5. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
6. Click **Deploy**
7. Your app is live at `https://your-project.vercel.app`

### Option B: Run locally

```bash
cp .env.example .env.local
# Fill in your values
npm install
npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
jj-property-system/
  supabase/
    schema.sql          ← Database tables, views, security policies
  scripts/
    import_data.py      ← One-time data import from Excel
  src/
    app/
      page.tsx          ← CEO Dashboard
      transactions/
        page.tsx        ← Transaction list with filters
        new/page.tsx    ← Quick entry form (10 seconds)
      properties/
        page.tsx        ← Property cards with P&L
    lib/
      supabase.ts       ← Database client
    types/
      index.ts          ← All TypeScript types + category lists
```

---

## Pages Built (Phase 0)

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Cash positions, recent transactions, owner balances, alerts |
| Transactions | `/transactions` | Full list with filters (date, category, property, search) |
| New Transaction | `/transactions/new` | Fast entry form — 10 second target |
| Properties | `/properties` | All properties with financial summary cards |

---

## Next Phases (to build)

- Rental contracts management
- Airbnb reservations
- Renovation project tracking
- Owner balance reports
- PDF report generation (Hebrew + English)
- Duplicate detection alerts
- Hostaway API integration
- Bank CSV reconciliation

---

## Security Notes

- Never share your `SUPABASE_SERVICE_KEY` — it bypasses all security
- The anon key (`NEXT_PUBLIC_*`) is safe to expose in the browser
- Enable 2FA for your Supabase account
- Set a strong password on your Supabase project
- Vercel HTTPS is automatic and forced

---

## Support

This system was built for JJ Property 10.
All source code is yours to own, modify, and extend.
