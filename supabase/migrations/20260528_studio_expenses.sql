CREATE TABLE studio_expenses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  amount         integer     NOT NULL CHECK (amount > 0),
  direction      text        NOT NULL CHECK (direction IN ('expense', 'income')),
  payment_method text        NOT NULL CHECK (payment_method IN ('cash', 'fop', 'personal_card')),
  trainer_id     uuid        REFERENCES trainers(id) ON DELETE SET NULL,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studio_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON studio_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON studio_expenses TO anon, authenticated;
