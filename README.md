# Budget Buddy

A private personal budgeting web app built with React + Vite + Supabase.

## Features

- Email/password signup and login
- Each user's data is isolated with Supabase Row Level Security
- Starting savings and monthly allowance settings
- Money received automatically increases a balance
- Expenses automatically decrease a balance
- Separate Allowance and Savings accounts
- Monthly category budgets
- Monthly spending progress
- Transaction history
- Delete transactions
- Responsive desktop/mobile UI

## Run locally

1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env.local`.
5. Put your Supabase project URL and publishable/anon key in `.env.local`.
6. Run:

```bash
npm run dev
```

7. Open the local URL shown by Vite, usually `http://localhost:5173`.

## Supabase setup

Create a Supabase project, open SQL Editor, paste the contents of `supabase.sql`, and run it.

Then go to your project's API settings and copy:
- Project URL
- Publishable key (or anon key if your project still labels it that way)

Put them in `.env.local`.

## Important

Never put a Supabase `service_role` key in this project or in a browser-exposed environment variable. Only use the public/publishable/anon key.

## Deployment

Vercel is a simple option:

- Import this folder/repository.
- Build command: `npm run build`
- Output directory: `dist`
- Add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables.
- Deploy.

Then add your deployed URL to Supabase Authentication's URL configuration so email redirects work correctly.

## Starting numbers

The app defaults to:
- Monthly allowance: ₱14,000
- Starting savings: ₱25,000

You can change these in Settings.

Note: the current version treats the monthly allowance as a baseline added to every month. Money you manually add as an income transaction is added on top of that month's allowance. Savings starts from the starting savings value and changes only through savings transactions.
