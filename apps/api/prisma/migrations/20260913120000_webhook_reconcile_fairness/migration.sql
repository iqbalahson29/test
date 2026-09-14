-- Bounded retry scheduling for webhook callbacks that arrive before their send is recorded.
-- The sweeper previously always took the oldest 500 unreconciled rows, so a block of rows
-- that never acquire a delivery mapping starved every later event until retention removed
-- them. These columns let the sweep advance past a row without losing it.
ALTER TABLE "MailDeliveryEvent"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3),
  ADD COLUMN "quarantinedAt" TIMESTAMPTZ(3);

-- Existing unreconciled rows become immediately eligible under the new ordering.
UPDATE "MailDeliveryEvent" SET "nextAttemptAt" = "receivedAt" WHERE "reconciledAt" IS NULL;

-- The sweep's selection predicate: unreconciled, not quarantined, due now.
CREATE INDEX "MailDeliveryEvent_reconcile_queue_idx"
  ON "MailDeliveryEvent" ("nextAttemptAt")
  WHERE "reconciledAt" IS NULL AND "quarantinedAt" IS NULL;
