-- Rate-limit counters for hosts without Upstash Redis (for example Cloudflare Workers).
-- Only the server service_role key may touch them; browsers have no access.
create table if not exists public.rate_limit_counters (
  key text primary key,
  hits integer not null check (hits >= 0),
  expires_at timestamptz not null
);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer)
returns table(request_count integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
  v_expires timestamptz;
begin
  if p_key is null or length(p_key) > 200 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate-limit request';
  end if;

  insert into public.rate_limit_counters as c (key, hits, expires_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    hits = case when c.expires_at <= now() then 1 else c.hits + 1 end,
    expires_at = case when c.expires_at <= now() then now() + make_interval(secs => p_window_seconds) else c.expires_at end
  returning c.hits, c.expires_at into v_hits, v_expires;

  -- Occasionally drop counters that expired more than a day ago.
  if random() < 0.01 then
    delete from public.rate_limit_counters where expires_at < now() - interval '1 day';
  end if;

  request_count := v_hits;
  retry_after := greatest(1, ceil(extract(epoch from (v_expires - now())))::integer);
  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

-- The gift box sample was not in any storefront department.
update public.products set category = 'Luxusparfüms', updated_at = now()
  where id = 'gift' and category = 'Geschenke';
