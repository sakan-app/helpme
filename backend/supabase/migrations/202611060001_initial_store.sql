create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  title text not null,
  category text not null,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'EUR',
  image_url text,
  sku text unique,
  supplier text,
  inventory integer not null default 0 check (inventory >= 0),
  variants jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
drop policy if exists "Active products are public" on public.products;
create policy "Active products are public" on public.products
  for select to anon, authenticated using (active = true);

create table if not exists public.wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.wishlist_items enable row level security;
drop policy if exists "Users manage their own wishlist" on public.wishlist_items;
create policy "Users manage their own wishlist" on public.wishlist_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','paid','processing','shipped','cancelled','refunded')),
  currency text not null default 'EUR',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
drop policy if exists "Customers read their own orders" on public.orders;
create policy "Customers read their own orders" on public.orders
  for select to authenticated using (auth.uid() = user_id);
-- No browser insert/update policy: only a verified server-side payment flow may create/change orders.

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_title text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  selected_size text,
  selected_color text
);
alter table public.order_items enable row level security;
drop policy if exists "Customers read their own order items" on public.order_items;
create policy "Customers read their own order items" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

insert into public.products (id,title,category,description,price,currency,inventory,active,variants)
values
 ('leggings','Performance Leggings','Sportbekleidung','High-waist, blickdichte Stretch-Leggings mit angenehmem Halt.',68.00,'EUR',0,true,'{"sizes":["XS","S","M","L","XL"],"colors":["Schwarz","Sand","Olive"]}'),
 ('tote','City Leather Tote','Taschen','Strukturierte Alltagstasche aus pflanzlich gegerbtem Leder.',210.00,'EUR',0,true,'{"sizes":["One Size"],"colors":["Cognac","Schwarz","Creme"]}'),
 ('watch','Noir Chronograph','Uhren','Matter Chronograph mit Saphirglas und Edelstahlgehäuse.',349.00,'EUR',0,true,'{"sizes":["One Size"],"colors":["Schwarz","Silber"]}'),
 ('gift','Signature Discovery Box','Geschenke','Vier Miniaturdüfte in einer hochwertigen Geschenkbox.',89.00,'EUR',0,true,'{"sizes":["One Size"],"colors":["Signature"]}')
on conflict (id) do update set
 title=excluded.title, category=excluded.category, description=excluded.description,
 price=excluded.price, currency=excluded.currency, variants=excluded.variants,
 updated_at=now();