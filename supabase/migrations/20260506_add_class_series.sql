CREATE TABLE class_series (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type  text NOT NULL,
  trainer_id   uuid REFERENCES trainers(id) ON DELETE SET NULL,
  hall_id      uuid REFERENCES halls(id) ON DELETE SET NULL,
  title        text,
  notes        text,
  capacity     integer,
  duration_min integer NOT NULL DEFAULT 60,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_of_day  time NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE classes ADD COLUMN series_id uuid REFERENCES class_series(id) ON DELETE SET NULL;

CREATE INDEX idx_classes_series_id ON classes(series_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON class_series TO anon, authenticated;
