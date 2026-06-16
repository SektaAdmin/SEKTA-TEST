-- Sequence для номерів квитанцій (1, 2, 3...)
CREATE SEQUENCE IF NOT EXISTS sales_receipt_number_seq;

-- Додаємо колонки до sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS receipt_number   integer DEFAULT nextval('sales_receipt_number_seq'),
  ADD COLUMN IF NOT EXISTS receipt_url      text,
  ADD COLUMN IF NOT EXISTS session_balance_snapshot jsonb;

-- Унікальний індекс на receipt_number
CREATE UNIQUE INDEX IF NOT EXISTS sales_receipt_number_key ON sales(receipt_number);
