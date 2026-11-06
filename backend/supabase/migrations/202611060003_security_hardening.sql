-- Customer-owned data is isolated by auth.uid(); privileged payment processing uses service_role only.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 25),
  selected_size text,
  selected_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, product_id, selected_size, selected_color)
);
alter table public.cart_items enable row level security;
drop policy if exists "Users manage their own cart" on public.cart_items;
create policy "Users manage their own cart" on public.cart_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.orders add column if not exists risk_score integer not null default 0 check (risk_score between 0 and 100);
alter table public.orders add column if not exists risk_flags jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists payment_metadata_ciphertext text;
alter table public.orders add column if not exists billing_country text;
alter table public.orders add column if not exists shipping_country text;
alter table public.orders add column if not exists billing_postal_code text;
alter table public.orders add column if not exists shipping_postal_code text;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','pending_review','paid','processing','shipped','cancelled','refunded'));

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe','paypal','klarna')),
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  unique(provider, event_id)
);
alter table public.payment_webhook_events enable row level security;
-- Deliberately no anon/authenticated policies: only the server service-role key can claim webhook events.

-- Explicitly remove browser write access to financial records. Payment handlers use service_role after verification.
drop policy if exists "Customers insert their own orders" on public.orders;
drop policy if exists "Customers update their own orders" on public.orders;
drop policy if exists "Customers insert their own order items" on public.order_items;
drop policy if exists "Customers update their own order items" on public.order_items;
