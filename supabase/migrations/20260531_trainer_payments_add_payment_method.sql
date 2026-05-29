ALTER TABLE trainer_payments
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'fop', 'personal_card'));
