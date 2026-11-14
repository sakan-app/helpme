-- Paid orders are sent to CJ Dropshipping. Each order line keeps the CJ variant id chosen at checkout,
-- and the order keeps CJ's order, payment and tracking state.
alter table public.order_items add column if not exists cj_vid text;

alter table public.orders add column if not exists supplier_order_id text;
alter table public.orders add column if not exists supplier_shipment_id text;
alter table public.orders add column if not exists supplier_logistic text;
alter table public.orders add column if not exists supplier_error text;
alter table public.orders add column if not exists supplier_cost_usd numeric(12,2);
alter table public.orders add column if not exists supplier_paid_at timestamptz;
alter table public.orders add column if not exists supplier_checked_at timestamptz;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_carrier text;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','pending_review','paid','sent_to_supplier','processing','shipped','cancelled','refunded'));
create index if not exists orders_supplier_waiting on public.orders(status, created_at) where status in ('paid', 'sent_to_supplier');
