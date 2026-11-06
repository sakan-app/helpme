-- Apply with your migration process, using a database migration role.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_unprocessed_idx
  ON stripe_webhook_events (received_at)
  WHERE processed_at IS NULL;
