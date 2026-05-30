-- Add cash_holder (who holds the cash) to cash transactions
-- cash_holder references trainers.id — will be extended to accounts table later

ALTER TABLE sales
  ADD COLUMN cash_holder uuid REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX idx_sales_cash_holder ON sales(cash_holder);

ALTER TABLE studio_expenses
  ADD COLUMN cash_holder uuid REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX idx_studio_expenses_cash_holder ON studio_expenses(cash_holder);

ALTER TABLE trainer_payments
  ADD COLUMN cash_holder uuid REFERENCES trainers(id) ON DELETE SET NULL;

CREATE INDEX idx_trainer_payments_cash_holder ON trainer_payments(cash_holder);
