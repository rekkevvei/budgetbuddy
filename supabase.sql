-- BUDGET BUDDY DATABASE
-- Run this entire file in Supabase SQL Editor.
-- Row Level Security ensures users can only access their own rows.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  monthly_allowance numeric(12,2) not null default 14000,
  starting_savings numeric(12,2) not null default 25000,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  account text not null check (account in ('allowance','savings')),
  category text not null default 'Other',
  description text,
  transaction_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, month, category)
);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_budgets enable row level security;

drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own rows"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "transactions own rows" on public.transactions;
create policy "transactions own rows"
on public.transactions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "budgets own rows" on public.monthly_budgets;
create policy "budgets own rows"
on public.monthly_budgets for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Automatically create a profile when a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Optional: if your account already exists and the trigger was created after signup,
-- run this once while logged in through the app is NOT possible in SQL Editor because
-- auth.uid() is unavailable there. The app's settings upsert will create the profile.
