-- Newsletter sign-ups with double opt-in (required in Germany): an address counts only after the
-- confirmation link is clicked. Only the server service_role key may read or write it.
create table if not exists public.newsletter_subscribers (
  email text primary key check (length(email) <= 254),
  token_hash text,
  locale text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
create index if not exists newsletter_subscribers_token_hash on public.newsletter_subscribers(token_hash) where token_hash is not null;
