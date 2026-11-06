-- Atomic order finalization and gap-free yearly invoice numbering for Helpmey.
-- A counter update and order update happen in the same transaction; rollback does not consume a number.
create table if not exists public.invoice_counters (
  invoice_year integer primary key,
  last_number bigint not null default 0 check (last_number >= 0)
);
alter table public.invoice_counters enable row level security;
revoke all on public.invoice_counters from anon, authenticated;

alter table public.orders add column if not exists invoice_number text;
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists billing_address jsonb;
alter table public.orders add column if not exists invoice_sent_at timestamptz;
create unique index if not exists orders_invoice_number_unique on public.orders(invoice_number) where invoice_number is not null;
create unique index if not exists orders_payment_reference_unique on public.orders(payment_reference) where payment_reference is not null;

create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_provider text,
  p_payment_reference text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_shipping_address jsonb default null,
  p_billing_address jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_year integer := extract(year from now() at time zone 'Europe/Berlin')::integer;
  v_number bigint;
  v_invoice text;
begin
  if p_provider not in ('stripe','paypal') then
    raise exception 'Unsupported payment provider';
  end if;
  if p_payment_reference is null or length(p_payment_reference) > 200 then
    raise exception 'Invalid payment reference';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if v_order.invoice_number is not null then
    if v_order.payment_reference <> p_payment_reference then
      raise exception 'Order already finalized with a different payment reference';
    end if;
    return jsonb_build_object('order_id', v_order.id, 'invoice_number', v_order.invoice_number, 'already_finalized', true);
  end if;

  insert into public.invoice_counters(invoice_year,last_number)
    values(v_year,1)
    on conflict(invoice_year) do update
      set last_number = public.invoice_counters.last_number + 1
    returning last_number into v_number;
  v_invoice := 'HM-' || v_year::text || '-' || lpad(v_number::text,5,'0');

  update public.orders set
    invoice_number = v_invoice,
    payment_provider = p_provider,
    payment_reference = p_payment_reference,
    customer_name = left(coalesce(p_customer_name,''),160),
    customer_email = left(coalesce(p_customer_email,''),254),
    customer_phone = left(coalesce(p_customer_phone,''),40),
    shipping_address = p_shipping_address,
    billing_address = p_billing_address,
    status = case when coalesce(risk_score,0) >= 40 then 'pending_review' else 'paid' end,
    updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id',p_order_id,'invoice_number',v_invoice,'already_finalized',false);
end;
$$;

revoke all on function public.finalize_paid_order(uuid,text,text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_paid_order(uuid,text,text,text,text,text,jsonb,jsonb) to service_role;
