-- Add telegram_username column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS telegram_username text;
