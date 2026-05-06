CREATE OR REPLACE FUNCTION check_class_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_capacity integer;
  v_active_count integer;
BEGIN
  IF NEW.status != 'enrolled' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity FROM classes WHERE id = NEW.class_id;

  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM enrollments
  WHERE class_id = NEW.class_id
    AND status IN ('enrolled', 'attended')
    AND id != NEW.id;

  IF v_active_count >= v_capacity THEN
    RAISE EXCEPTION 'capacity_exceeded: class is full (% / %)', v_active_count, v_capacity;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_class_capacity
  BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION check_class_capacity();
