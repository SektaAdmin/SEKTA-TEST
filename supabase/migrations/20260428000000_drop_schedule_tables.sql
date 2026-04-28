-- Drop booking/schedule system (not needed for MVP)
-- Removes: schedules, schedule_slots, enrollments, regular_enrollments
-- and dependent views: client_session_balance, clients_negative_sessions
-- Also removes legacy adjust_client_balance function

DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS regular_enrollments CASCADE;
DROP TABLE IF EXISTS schedule_slots CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;

DROP FUNCTION IF EXISTS adjust_client_balance(uuid, integer, text);
