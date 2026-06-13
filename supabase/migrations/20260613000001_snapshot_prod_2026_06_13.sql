-- ═══════════════════════════════════════════════════════════════════════════
-- SNAPSHOT PROD 2026-06-13 — drift закрито
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Це КНАПШОТ живої схеми prod на 2026-06-13 — нова точка відліку для міграцій.
-- Історія міграційних файлів дрейфувала від реального стану БД (84 у БД vs 35
-- у репо), тож тут зафіксовано фактичний стан prod як єдине джерело правди.
--
-- Згенеровано через Supabase MCP (read-only SELECT-и проти живої БД).
-- `supabase db pull` / `db dump` були недоступні: дрейф історії міграцій +
-- відсутність Docker у середовищі. Тому DDL зібрано запитами до каталогу
-- (pg_constraint / pg_indexes / pg_policies / information_schema / pg_proc).
--
-- ⚠️ Це REFERENCE-снапшот, НЕ призначений для повторного програвання поверх
-- наявної prod-БД. Він idempotent-ish (CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION), але ADD CONSTRAINT / CREATE POLICY / CREATE
-- TRIGGER не захищені від «вже існує» — replay на чистій БД, не поверх живої.
-- Призначення: канонічний опис схеми, від якого стартують НОВІ міграції.
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ════ TABLES ════
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.balance_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  amount numeric NOT NULL,
  transaction_type character varying(50) NOT NULL,
  related_sale_id uuid,
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  description text,
  reason text,
  created_by uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  reversed_at timestamp with time zone,
  reversed_by uuid,
  reversal_reason text
);

CREATE TABLE IF NOT EXISTS public.class_series (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_type text NOT NULL,
  trainer_id uuid,
  hall_id uuid,
  title text,
  notes text,
  capacity integer,
  duration_min integer NOT NULL DEFAULT 60,
  day_of_week smallint NOT NULL,
  time_of_day time without time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text NOT NULL DEFAULT 'series'::text
);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trainer_id uuid,
  hall_id uuid,
  ticket_type text NOT NULL,
  title text,
  starts_at timestamp with time zone NOT NULL,
  duration_min integer NOT NULL DEFAULT 60,
  capacity integer,
  is_cancelled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  series_id uuid,
  choreo_stage text
);

CREATE TABLE IF NOT EXISTS public.client_contacts (
  client_id uuid NOT NULL,
  phone text,
  instagram_username text,
  telegram_username text
);

CREATE TABLE IF NOT EXISTS public.client_session_balances (
  client_id uuid NOT NULL,
  ticket_type text NOT NULL,
  sessions_balance integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  balance integer NOT NULL DEFAULT 0,
  credit_limit numeric DEFAULT 10000,
  balance_updated_at timestamp with time zone DEFAULT now(),
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  client_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'enrolled'::text,
  sessions_used integer NOT NULL DEFAULT 0,
  sale_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  hours_attended integer[],
  cancelled_from_status text,
  cancellation_source text,
  cancelled_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.halls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  description text
);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  ticket_id uuid,
  trainer_id uuid,
  ticket_name text,
  ticket_price integer,
  sessions integer,
  price_paid integer NOT NULL,
  payment_method text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  amount_given integer NOT NULL,
  ticket_type text,
  cash_holder uuid
);

CREATE TABLE IF NOT EXISTS public.series_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  hours_attended integer[]
);

CREATE TABLE IF NOT EXISTS public.studio_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  amount integer NOT NULL,
  direction text NOT NULL,
  payment_method text NOT NULL,
  trainer_id uuid,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  cash_holder uuid
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ticket_type text NOT NULL,
  sessions integer NOT NULL,
  price integer NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trainer_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  calculated_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_type text NOT NULL DEFAULT 'final'::text,
  payment_method text NOT NULL DEFAULT 'cash'::text,
  cash_holder uuid
);

CREATE TABLE IF NOT EXISTS public.trainer_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trainer_id uuid,
  ticket_type text NOT NULL,
  trainer_rate numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  hall_id uuid,
  studio_rate numeric NOT NULL DEFAULT 0,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date
);

CREATE TABLE IF NOT EXISTS public.trainers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  instagram_username text,
  telegram_username text,
  user_id uuid,
  phone text,
  email text
);

CREATE TABLE IF NOT EXISTS public.training_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  short_label text
);

-- ════════════════════════════════════════════════════════════════════════════
-- ════ PRIMARY KEYS / UNIQUE / CHECK / FOREIGN KEYS ════
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.balance_transactions ADD CONSTRAINT balance_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.class_series ADD CONSTRAINT class_series_pkey PRIMARY KEY (id);
ALTER TABLE public.classes ADD CONSTRAINT classes_pkey PRIMARY KEY (id);
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_pkey PRIMARY KEY (client_id);
ALTER TABLE public.client_session_balances ADD CONSTRAINT client_session_balances_pkey PRIMARY KEY (client_id, ticket_type);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.halls ADD CONSTRAINT halls_pkey PRIMARY KEY (id);
ALTER TABLE public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id);
ALTER TABLE public.series_clients ADD CONSTRAINT series_clients_pkey PRIMARY KEY (id);
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.tickets ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
ALTER TABLE public.trainer_payments ADD CONSTRAINT trainer_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.trainer_rates ADD CONSTRAINT trainer_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.trainers ADD CONSTRAINT trainers_pkey PRIMARY KEY (id);
ALTER TABLE public.training_types ADD CONSTRAINT training_types_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_key UNIQUE (user_id);
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_class_id_client_id_key UNIQUE (class_id, client_id);
ALTER TABLE public.series_clients ADD CONSTRAINT series_clients_series_id_client_id_key UNIQUE (series_id, client_id);
ALTER TABLE public.training_types ADD CONSTRAINT training_types_code_key UNIQUE (code);
ALTER TABLE public.balance_transactions ADD CONSTRAINT check_amount_not_zero CHECK ((amount <> (0)::numeric));
ALTER TABLE public.balance_transactions ADD CONSTRAINT check_balance_consistency CHECK ((((amount > (0)::numeric) AND (balance_after = (balance_before + amount))) OR ((amount < (0)::numeric) AND (balance_after = (balance_before + amount)))));
ALTER TABLE public.class_series ADD CONSTRAINT class_series_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public.class_series ADD CONSTRAINT class_series_type_check CHECK ((type = ANY (ARRAY['template'::text, 'series'::text])));
ALTER TABLE public.classes ADD CONSTRAINT classes_capacity_check CHECK (((capacity IS NULL) OR (capacity > 0)));
ALTER TABLE public.classes ADD CONSTRAINT classes_duration_min_check CHECK ((duration_min > 0));
ALTER TABLE public.clients ADD CONSTRAINT check_balance_within_credit_limit CHECK (((balance)::numeric >= (- credit_limit)));
ALTER TABLE public.clients ADD CONSTRAINT clients_credit_limit_check CHECK ((credit_limit >= (0)::numeric));
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_cancellation_source_check CHECK ((cancellation_source = ANY (ARRAY['self'::text, 'staff_manual'::text, 'class_cancelled'::text, 'auto_close'::text])));
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_sessions_used_check CHECK ((sessions_used >= 0));
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['enrolled'::text, 'attended'::text, 'cancelled'::text, 'noshow'::text, 'waitlist'::text])));
ALTER TABLE public.halls ADD CONSTRAINT halls_capacity_check CHECK ((capacity > 0));
ALTER TABLE public.halls ADD CONSTRAINT halls_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
ALTER TABLE public.sales ADD CONSTRAINT sales_amount_given_check CHECK ((amount_given >= 0));
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'fop'::text, 'personal_card'::text, 'deposit'::text])));
ALTER TABLE public.sales ADD CONSTRAINT sales_price_paid_check CHECK ((price_paid >= 0));
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_amount_check CHECK ((amount > 0));
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_direction_check CHECK ((direction = ANY (ARRAY['expense'::text, 'income'::text])));
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'fop'::text, 'personal_card'::text])));
ALTER TABLE public.tickets ADD CONSTRAINT tickets_price_kopecks_check CHECK ((price >= 0));
ALTER TABLE public.tickets ADD CONSTRAINT tickets_sessions_check CHECK ((sessions > 0));
ALTER TABLE public.trainer_payments ADD CONSTRAINT trainer_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'fop'::text, 'personal_card'::text])));
ALTER TABLE public.trainer_payments ADD CONSTRAINT trainer_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['advance'::text, 'final'::text])));
ALTER TABLE public.trainer_rates ADD CONSTRAINT trainer_rates_rate_check CHECK ((trainer_rate >= (0)::numeric));
ALTER TABLE public.trainer_rates ADD CONSTRAINT trainer_rates_studio_rate_check CHECK ((studio_rate >= (0)::numeric));
ALTER TABLE public.trainers ADD CONSTRAINT trainers_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
ALTER TABLE public.training_types ADD CONSTRAINT training_types_code_check CHECK ((length(TRIM(BOTH FROM code)) > 0));
ALTER TABLE public.training_types ADD CONSTRAINT training_types_label_check CHECK ((length(TRIM(BOTH FROM label)) > 0));
ALTER TABLE public.balance_transactions ADD CONSTRAINT balance_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
ALTER TABLE public.balance_transactions ADD CONSTRAINT balance_transactions_related_sale_id_fkey FOREIGN KEY (related_sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.class_series ADD CONSTRAINT class_series_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE SET NULL;
ALTER TABLE public.class_series ADD CONSTRAINT class_series_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD CONSTRAINT classes_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD CONSTRAINT classes_series_id_fkey FOREIGN KEY (series_id) REFERENCES class_series(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD CONSTRAINT classes_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_session_balances ADD CONSTRAINT client_session_balances_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_cash_holder_fkey FOREIGN KEY (cash_holder) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.sales ADD CONSTRAINT sales_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id);
ALTER TABLE public.sales ADD CONSTRAINT sales_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id);
ALTER TABLE public.series_clients ADD CONSTRAINT series_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.series_clients ADD CONSTRAINT series_clients_series_id_fkey FOREIGN KEY (series_id) REFERENCES class_series(id) ON DELETE CASCADE;
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_cash_holder_fkey FOREIGN KEY (cash_holder) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.studio_expenses ADD CONSTRAINT studio_expenses_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.trainer_payments ADD CONSTRAINT trainer_payments_cash_holder_fkey FOREIGN KEY (cash_holder) REFERENCES trainers(id) ON DELETE SET NULL;
ALTER TABLE public.trainer_payments ADD CONSTRAINT trainer_payments_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE public.trainer_rates ADD CONSTRAINT trainer_rates_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE SET NULL;
ALTER TABLE public.trainer_rates ADD CONSTRAINT trainer_rates_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE;
ALTER TABLE public.trainers ADD CONSTRAINT trainers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- ════ INDEXES ════
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_balance_transactions_client ON public.balance_transactions USING btree (client_id, created_at DESC);
CREATE INDEX idx_balance_transactions_sale ON public.balance_transactions USING btree (related_sale_id) WHERE (related_sale_id IS NOT NULL);
CREATE INDEX idx_class_series_hall_id ON public.class_series USING btree (hall_id);
CREATE INDEX idx_class_series_trainer_id ON public.class_series USING btree (trainer_id);
CREATE INDEX idx_classes_series_id ON public.classes USING btree (series_id);
CREATE INDEX idx_classes_starts_at ON public.classes USING btree (starts_at);
CREATE INDEX idx_classes_ticket_type ON public.classes USING btree (ticket_type);
CREATE UNIQUE INDEX uq_classes_series_date ON public.classes USING btree (series_id, date((starts_at AT TIME ZONE 'Europe/Kyiv'::text))) WHERE (series_id IS NOT NULL);
CREATE INDEX idx_client_contacts_phone ON public.client_contacts USING btree (phone);
CREATE INDEX idx_csb_client ON public.client_session_balances USING btree (client_id);
CREATE INDEX idx_clients_balance ON public.clients USING btree (balance);
CREATE INDEX idx_clients_last_name_trgm ON public.clients USING gin (last_name gin_trgm_ops);
CREATE UNIQUE INDEX uq_clients_user_id ON public.clients USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_enrollments_class_id ON public.enrollments USING btree (class_id, status);
CREATE INDEX idx_enrollments_client_id ON public.enrollments USING btree (client_id);
CREATE INDEX idx_enrollments_sale_id ON public.enrollments USING btree (sale_id) WHERE (sale_id IS NOT NULL);
CREATE INDEX idx_sales_client_id ON public.sales USING btree (client_id);
CREATE INDEX idx_sales_created_at ON public.sales USING btree (created_at);
CREATE INDEX idx_series_clients_client_id ON public.series_clients USING btree (client_id);
CREATE INDEX idx_studio_expenses_cash_holder ON public.studio_expenses USING btree (cash_holder);
CREATE INDEX idx_studio_expenses_trainer_id ON public.studio_expenses USING btree (trainer_id);
CREATE INDEX idx_tickets_is_active ON public.tickets USING btree (is_active);
CREATE INDEX idx_trainer_payments_trainer_id ON public.trainer_payments USING btree (trainer_id);
CREATE INDEX idx_trainer_rates_hall_id ON public.trainer_rates USING btree (hall_id);
CREATE INDEX idx_trainer_rates_trainer_id ON public.trainer_rates USING btree (trainer_id);
CREATE UNIQUE INDEX trainer_rates_active_unique ON public.trainer_rates USING btree (COALESCE((trainer_id)::text, ''::text), ticket_type, COALESCE((hall_id)::text, ''::text)) WHERE (valid_to IS NULL);
CREATE UNIQUE INDEX trainers_email_key ON public.trainers USING btree (lower(email)) WHERE (email IS NOT NULL);
CREATE UNIQUE INDEX trainers_phone_key ON public.trainers USING btree (phone) WHERE (phone IS NOT NULL);
CREATE UNIQUE INDEX trainers_user_id_key ON public.trainers USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX uq_trainers_user_id ON public.trainers USING btree (user_id) WHERE (user_id IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- ════ FUNCTIONS ════
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auth_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
    'client'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.auto_close_classes()
 RETURNS TABLE(closed_count integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer := 0;
  v_enrollment RECORD;
BEGIN
  FOR v_enrollment IN
    SELECT e.id, e.hours_attended
    FROM enrollments e
    JOIN classes c ON e.class_id = c.id
    WHERE c.starts_at <= now()
      AND c.is_cancelled = false
      AND e.status = 'enrolled'
  LOOP
    -- Списуємо стільки сесій, скільки годин проставлено в чекбоксі заздалегідь
    -- (hours_attended: [1,2]=2 сесії, [1]/[2]=1, NULL=звичайне годинне=1).
    PERFORM mark_attendance(
      v_enrollment.id,
      COALESCE(array_length(v_enrollment.hours_attended, 1), 1)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_trainer_salary(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(ticket_type text, sessions_total integer, rate numeric, amount numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH attended AS (
    SELECT
      c.ticket_type,
      SUM(
        CASE
          WHEN e.status = 'attended' THEN e.sessions_used
          WHEN e.status = 'noshow'   THEN c.duration_min / 60
        END
      )::int AS sessions_total
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.status IN ('attended', 'noshow')
      AND c.trainer_id = p_trainer_id
      AND c.starts_at >= p_start
      AND c.starts_at <= p_end
    GROUP BY c.ticket_type
  ),
  rates AS (
    SELECT
      a.ticket_type,
      a.sessions_total,
      COALESCE(
        (SELECT r.rate FROM trainer_rates r
         WHERE r.trainer_id = p_trainer_id AND r.ticket_type = a.ticket_type),
        (SELECT r.rate FROM trainer_rates r
         WHERE r.trainer_id IS NULL AND r.ticket_type = a.ticket_type)
      ) AS rate
    FROM attended a
  )
  SELECT ticket_type, sessions_total, rate, (sessions_total * COALESCE(rate, 0)) AS amount
  FROM rates
$function$
;

CREATE OR REPLACE FUNCTION public.calc_trainer_salary_v2(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(class_id uuid, starts_at timestamp with time zone, ticket_type text, hall_name text, duration_min integer, client_id uuid, client_name text, enrollment_status text, trainer_amount numeric, studio_amount numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id, c.starts_at, c.ticket_type, h.name, c.duration_min,
    cl.id,
    TRIM(COALESCE(cl.first_name || ' ' || cl.last_name, cl.first_name, cl.last_name, '—')),
    e.status,
    COALESCE((
      SELECT tr.trainer_rate * (c.duration_min::numeric / 60)
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY (tr.trainer_id IS NOT NULL) DESC, (tr.hall_id IS NOT NULL) DESC
      LIMIT 1
    ), 0),
    COALESCE((
      SELECT tr.studio_rate * (c.duration_min::numeric / 60)
      FROM trainer_rates tr
      WHERE tr.ticket_type = c.ticket_type
        AND (tr.trainer_id = p_trainer_id OR tr.trainer_id IS NULL)
        AND (tr.hall_id = c.hall_id OR tr.hall_id IS NULL)
        AND tr.valid_from <= c.starts_at::date
        AND (tr.valid_to IS NULL OR tr.valid_to >= c.starts_at::date)
      ORDER BY (tr.trainer_id IS NOT NULL) DESC, (tr.hall_id IS NOT NULL) DESC
      LIMIT 1
    ), 0)
  FROM enrollments e
  JOIN classes c ON c.id = e.class_id
  LEFT JOIN halls h ON h.id = c.hall_id
  JOIN clients cl ON cl.id = e.client_id
  WHERE c.trainer_id = p_trainer_id
    AND c.starts_at BETWEEN p_start AND p_end
    AND e.status IN ('attended', 'noshow')
  ORDER BY c.starts_at, c.id, cl.last_name, cl.first_name;
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_enrollment()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    public.auth_role() IN ('owner','admin')
    OR current_setting('app.trusted_call', true) = 'on'
    OR (
      nullif(current_setting('request.jwt.claims', true), '') IS NULL
      AND current_user NOT IN ('anon', 'authenticated')
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid)
 RETURNS TABLE(success boolean, restored_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.enrollments
  WHERE class_id = p_class_id
    AND status IN ('attended', 'noshow')
    AND sessions_used > 0;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  SELECT e.client_id, c.ticket_type, e.sessions_used
  FROM public.enrollments e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.class_id = p_class_id
    AND e.status IN ('attended', 'noshow')
    AND e.sessions_used > 0
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET cancelled_from_status   = status,
      status                  = 'cancelled',
      sessions_used           = 0,
      cancellation_source     = 'class_cancelled',
      cancelled_at            = now(),
      updated_at              = now()
  WHERE class_id = p_class_id
    AND status IN ('attended', 'noshow', 'enrolled');

  UPDATE public.classes SET is_cancelled = true WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_count, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancellation_deadline(p_starts_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH local AS (
    SELECT (p_starts_at AT TIME ZONE 'Europe/Kyiv') AS ts
  )
  SELECT CASE
    WHEN EXTRACT(HOUR FROM local.ts) < 14
      THEN ((date_trunc('day', local.ts) - interval '1 day' + interval '19 hours')
            AT TIME ZONE 'Europe/Kyiv')
    ELSE p_starts_at - interval '6 hours'
  END
  FROM local;
$function$
;

CREATE OR REPLACE FUNCTION public.change_enrollment_status(p_enrollment_id uuid, p_new_status text, p_force_no_charge boolean DEFAULT false, p_sessions_used integer DEFAULT NULL::integer)
 RETURNS TABLE(success boolean, charged boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
  v_charge     integer := 0;
  v_source     text;
  v_cancelled_at timestamptz;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  IF p_new_status NOT IN ('enrolled', 'attended', 'noshow', 'cancelled', 'waitlist') THEN
    RETURN QUERY SELECT false, false, 'Невідомий статус'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'Запис не знайдено'::text; RETURN;
  END IF;

  IF v_enrollment.status = p_new_status THEN
    RETURN QUERY SELECT true, (v_enrollment.sessions_used > 0), NULL::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  v_charge := COALESCE(
    p_sessions_used,
    NULLIF(v_enrollment.sessions_used, 0),
    array_length(v_enrollment.hours_attended, 1),
    1
  );

  IF p_new_status = 'attended' THEN
    IF v_class.is_cancelled THEN
      RETURN QUERY SELECT false, false, 'Заняття скасовано'::text; RETURN;
    END IF;
  ELSIF p_new_status = 'noshow' THEN
    IF p_force_no_charge THEN v_charge := 0; END IF;
  ELSIF p_new_status = 'cancelled' THEN
    IF p_force_no_charge OR now() <= public.cancellation_deadline(v_class.starts_at) THEN
      v_charge := 0;
    END IF;
  ELSE
    v_charge := 0;
  END IF;

  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  IF v_charge > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, -v_charge)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance - v_charge;
  END IF;

  IF p_new_status = 'cancelled' THEN
    v_source := 'staff_manual';
    v_cancelled_at := now();
  ELSE
    v_source := NULL;
    v_cancelled_at := NULL;
  END IF;

  UPDATE public.enrollments
  SET status              = p_new_status,
      sessions_used       = v_charge,
      cancellation_source = v_source,
      cancelled_at        = v_cancelled_at,
      updated_at          = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, (v_charge > 0), NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, false, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_class_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    NEW.status := 'waitlist';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_class_conflicts(p_starts_at timestamp with time zone, p_duration_min integer, p_hall_id uuid DEFAULT NULL::uuid, p_trainer_id uuid DEFAULT NULL::uuid, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conflict_type text, class_id uuid, starts_at timestamp with time zone, title text, ticket_type text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    CASE
      WHEN c.hall_id = p_hall_id AND p_hall_id IS NOT NULL THEN 'hall'
      ELSE 'trainer'
    END AS conflict_type,
    c.id,
    c.starts_at,
    c.title,
    c.ticket_type
  FROM classes c
  WHERE c.is_cancelled = false
    AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
    AND c.starts_at < (p_starts_at + (p_duration_min || ' minutes')::interval)
    AND (c.starts_at + (c.duration_min || ' minutes')::interval) > p_starts_at
    AND (
      (p_hall_id IS NOT NULL AND c.hall_id = p_hall_id)
      OR
      (p_trainer_id IS NOT NULL AND c.trainer_id = p_trainer_id)
    )
  LIMIT 5;
$function$
;

CREATE OR REPLACE FUNCTION public.check_client_conflict(p_client_id uuid, p_class_id uuid)
 RETURNS TABLE(conflict_class_id uuid, starts_at timestamp with time zone, ticket_type text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    c.id,
    c.starts_at,
    c.ticket_type
  FROM enrollments e
  JOIN classes c ON c.id = e.class_id
  JOIN classes target ON target.id = p_class_id
  WHERE e.client_id = p_client_id
    AND e.status IN ('enrolled', 'attended')
    AND c.is_cancelled = false
    AND c.id != p_class_id
    AND c.starts_at < (target.starts_at + (target.duration_min || ' minutes')::interval)
    AND (c.starts_at + (c.duration_min || ' minutes')::interval) > target.starts_at
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.class_availability(p_class_ids uuid[])
 RETURNS TABLE(class_id uuid, active_count integer, waitlist_count integer, capacity integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id,
         coalesce(count(e.id) filter (where e.status in ('enrolled','attended')), 0)::int,
         coalesce(count(e.id) filter (where e.status = 'waitlist'), 0)::int,
         c.capacity
  from public.classes c
  left join public.enrollments e on e.class_id = c.id
  where c.id = any(p_class_ids)
  group by c.id, c.capacity;
$function$
;

CREATE OR REPLACE FUNCTION public.client_cancel(p_enrollment_id uuid)
 RETURNS TABLE(success boolean, charged boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
  v_owner_id  uuid;
  v_res       record;
BEGIN
  IF auth_role() <> 'client' THEN
    RETURN QUERY SELECT false, false, 'Доступно лише клієнту'::text; RETURN;
  END IF;

  v_client_id := current_client_id();
  IF v_client_id IS NULL THEN
    RETURN QUERY SELECT false, false, 'Кабінет не привʼязано до клієнта'::text; RETURN;
  END IF;

  SELECT client_id INTO v_owner_id FROM public.enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_owner_id <> v_client_id THEN
    RETURN QUERY SELECT false, false, 'Це не ваш запис'::text; RETURN;
  END IF;

  PERFORM set_config('app.trusted_call', 'on', true);

  SELECT * INTO v_res
  FROM public.change_enrollment_status(p_enrollment_id, 'cancelled', false, null);

  -- Проставляємо source після change_enrollment_status (який ставить staff_manual за замовчуванням)
  UPDATE public.enrollments
  SET cancellation_source = 'self'
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT v_res.success, v_res.charged, v_res.error_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.client_enroll(p_class_id uuid)
 RETURNS TABLE(success boolean, enrollment_id uuid, enrolled_status text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client_id   uuid;
  v_class       public.classes%rowtype;
  v_balance     integer;
  v_enroll_id   uuid;
  v_status      text;
  v_active_cnt  integer;
  v_waitlist_cnt integer;
  v_target      text;
  v_hours       integer[];
begin
  if auth_role() <> 'client' then
    return query select false, null::uuid, null::text, 'Доступно лише клієнту'::text; return;
  end if;

  v_client_id := current_client_id();
  if v_client_id is null then
    return query select false, null::uuid, null::text, 'Кабінет не привʼязано до клієнта'::text; return;
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    return query select false, null::uuid, null::text, 'Заняття не знайдено'::text; return;
  end if;
  if v_class.is_cancelled then
    return query select false, null::uuid, null::text, 'Заняття скасовано'::text; return;
  end if;
  if v_class.starts_at <= now() then
    return query select false, null::uuid, null::text, 'Заняття вже почалось'::text; return;
  end if;

  -- є оплачені заняття потрібного типу? (не пускаємо в мінус)
  select sessions_balance into v_balance
  from public.client_session_balances
  where client_id = v_client_id and ticket_type = v_class.ticket_type;

  if coalesce(v_balance, 0) <= 0 then
    return query select false, null::uuid, null::text, 'no_sessions'::text; return;
  end if;

  -- конфлікт у часі з іншим записом
  if exists (select 1 from public.check_client_conflict(v_client_id, p_class_id)) then
    return query select false, null::uuid, null::text, 'conflict'::text; return;
  end if;

  -- дубль (вже записаний на це заняття активно)
  if exists (
    select 1 from public.enrollments
    where class_id = p_class_id and client_id = v_client_id
      and status in ('enrolled', 'attended', 'waitlist')
  ) then
    return query select false, null::uuid, null::text, 'duplicate'::text; return;
  end if;

  -- Справедливість черги (лише для self-запису клієнта): у резерв, якщо місць немає
  -- АБО в черзі вже хтось стоїть (новий не перестрибує тих, хто чекає). Інакше enrolled.
  -- capacity NULL = без обмеження → завжди enrolled (якщо черги нема).
  select count(*) into v_active_cnt
  from public.enrollments
  where class_id = p_class_id and status in ('enrolled', 'attended');

  select count(*) into v_waitlist_cnt
  from public.enrollments
  where class_id = p_class_id and status = 'waitlist';

  if v_waitlist_cnt > 0
     or (v_class.capacity is not null and v_active_cnt >= v_class.capacity) then
    v_target := 'waitlist';
  else
    v_target := 'enrolled';
  end if;

  -- Двогодинне заняття → клієнт бере обидві години (hours_attended=[1,2]),
  -- щоб auto_close списав 2 сесії. Годинне → NULL (= 1 сесія).
  if v_class.duration_min >= 120 then
    v_hours := ARRAY[1, 2];
  else
    v_hours := null;
  end if;

  -- Вставляємо явно обчислений статус. Тригер check_class_capacity спрацьовує лише на
  -- 'enrolled' і лише понижує до 'waitlist' при повному залі — тож для 'waitlist' він
  -- no-op, для 'enrolled' лишається запобіжником від гонки.
  insert into public.enrollments (class_id, client_id, status, hours_attended)
  values (p_class_id, v_client_id, v_target, v_hours)
  returning id, status into v_enroll_id, v_status;

  return query select true, v_enroll_id, v_status, null::text;

exception
  when others then
    return query select false, null::uuid, null::text, sqlerrm;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_sale(p_client_id uuid, p_ticket_id uuid DEFAULT NULL::uuid, p_trainer_id uuid DEFAULT NULL::uuid, p_cash_holder uuid DEFAULT NULL::uuid, p_price_paid integer DEFAULT 0, p_amount_given integer DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_notes text DEFAULT ''::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(success boolean, sale_id uuid, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale_id      uuid;
  v_ticket_name  text    := NULL;
  v_ticket_price integer := 0;
  v_sessions     integer := 0;
  v_ticket_type  text    := NULL;
  v_amount       numeric;
  v_tx_type      varchar;
  v_description  text;
  v_bal_result   RECORD;
BEGIN
  IF p_ticket_id IS NOT NULL THEN
    SELECT name, price, sessions, ticket_type
      INTO v_ticket_name, v_ticket_price, v_sessions, v_ticket_type
      FROM tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::uuid, 'Абонемент не знайдено'::text;
      RETURN;
    END IF;
  END IF;

  INSERT INTO sales (
    client_id, ticket_id, trainer_id, cash_holder,
    ticket_name, ticket_price, sessions, ticket_type,
    price_paid, amount_given, payment_method, notes, created_at
  ) VALUES (
    p_client_id, p_ticket_id, p_trainer_id, p_cash_holder,
    v_ticket_name, v_ticket_price, v_sessions, v_ticket_type,
    p_price_paid, p_amount_given, p_payment_method, COALESCE(p_notes, ''),
    COALESCE(p_created_at, now())
  ) RETURNING id INTO v_sale_id;

  IF p_ticket_id IS NOT NULL AND v_sessions > 0 AND v_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (p_client_id, v_ticket_type, v_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  IF p_ticket_id IS NULL THEN
    v_amount      := p_amount_given;
    v_tx_type     := 'deposit_topup';
    v_description := 'Поповнення депозиту';
  ELSE
    v_amount      := p_amount_given - p_price_paid;
    v_tx_type     := 'purchase';
    v_description := 'Покупка ' || COALESCE(v_ticket_name, '');
  END IF;

  IF v_amount <> 0 THEN
    SELECT * INTO v_bal_result
    FROM update_client_balance(p_client_id, v_amount, v_tx_type, v_description, v_sale_id, NULL);

    IF NOT v_bal_result.success THEN
      RAISE EXCEPTION '%', v_bal_result.error_message;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_sale_id, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::uuid, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from clients where user_id = auth.uid() limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.current_trainer_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select id from trainers where user_id = auth.uid() limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_class(p_class_id uuid)
 RETURNS TABLE(success boolean, restored_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_class    public.classes%ROWTYPE;
  v_restored integer := 0;
  r          record;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 0, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text; RETURN;
  END IF;

  -- Повернути списані сесії всім, у кого sessions_used > 0 (агрегат по клієнту).
  FOR r IN
    SELECT client_id, SUM(sessions_used) AS total
    FROM public.enrollments
    WHERE class_id = p_class_id AND sessions_used > 0
    GROUP BY client_id
  LOOP
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (r.client_id, v_class.ticket_type, r.total)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
    v_restored := v_restored + 1;
  END LOOP;

  -- CASCADE (enrollments_class_id_fkey ON DELETE CASCADE) знесе записи.
  DELETE FROM public.classes WHERE id = p_class_id;

  RETURN QUERY SELECT true, v_restored, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_enrollment(p_enrollment_id uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  -- Повернути списані сесії перед видаленням.
  IF v_enrollment.sessions_used > 0 THEN
    INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
    ON CONFLICT (client_id, ticket_type)
    DO UPDATE SET sessions_balance =
      public.client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  DELETE FROM public.enrollments WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_sale(p_sale_id uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id    uuid;
  v_amount_given integer;
  v_price_paid   integer;
  v_sessions     integer;
  v_ticket_type  text;
  v_delta        numeric;
  v_ok           boolean;
  v_err          text;
BEGIN
  SELECT client_id, amount_given, price_paid, sessions, ticket_type
  INTO v_client_id, v_amount_given, v_price_paid, v_sessions, v_ticket_type
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Продажу не знайдено'::text;
    RETURN;
  END IF;

  -- Повертаємо куплені сесії (знімаємо з балансу)
  IF COALESCE(v_sessions, 0) > 0 AND v_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_client_id, v_ticket_type, -v_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- Повертаємо гроші (delta = amount_given - price_paid)
  v_delta := v_amount_given - v_price_paid;
  IF v_delta <> 0 THEN
    SELECT t.success, t.error_message
    INTO v_ok, v_err
    FROM public.update_client_balance(
      v_client_id, -v_delta,
      'admin_adjustment'::varchar,
      'Скасування продажи'::text,
      p_sale_id, NULL::text
    ) t;

    IF NOT v_ok THEN
      RETURN QUERY SELECT false, v_err;
      RETURN;
    END IF;
  END IF;

  DELETE FROM sales WHERE id = p_sale_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_week(p_start_date date, p_weeks integer DEFAULT 1)
 RETURNS TABLE(classes_created integer, enrollments_created integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_series record;
  v_week_offset int;
  v_week_start date;
  v_class_date date;
  v_class_id uuid;
  v_classes_created int := 0;
  v_enrollments_created int := 0;
  v_count int;
BEGIN
  FOR v_week_offset IN 0..(p_weeks - 1) LOOP
    v_week_start := p_start_date + (v_week_offset * 7);

    FOR v_series IN SELECT * FROM class_series WHERE type = 'template' LOOP
      v_class_id := NULL;

      v_class_date := v_week_start + ((v_series.day_of_week - EXTRACT(DOW FROM v_week_start)::int + 7) % 7);

      INSERT INTO classes (series_id, trainer_id, hall_id, ticket_type, title, starts_at, duration_min, capacity, notes)
      VALUES (
        v_series.id,
        v_series.trainer_id,
        v_series.hall_id,
        v_series.ticket_type,
        v_series.title,
        (v_class_date::text || ' ' || v_series.time_of_day::text)::timestamp AT TIME ZONE 'Europe/Kyiv',
        v_series.duration_min,
        v_series.capacity,
        v_series.notes
      )
      ON CONFLICT (series_id, (date(starts_at AT TIME ZONE 'Europe/Kyiv'::text))) WHERE series_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_class_id;

      IF v_class_id IS NOT NULL THEN
        v_classes_created := v_classes_created + 1;

        INSERT INTO enrollments (class_id, client_id, status, sessions_used, hours_attended)
        SELECT v_class_id, sc.client_id, 'enrolled', 0, sc.hours_attended
        FROM series_clients sc
        WHERE sc.series_id = v_series.id
        ON CONFLICT (class_id, client_id) DO NOTHING;

        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_enrollments_created := v_enrollments_created + v_count;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_classes_created, v_enrollments_created;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_session_balance_after(p_client_ids uuid[], p_ticket_type text, p_at timestamp with time zone)
 RETURNS TABLE(client_id uuid, balance_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Доступ: owner/admin/trainer бачать будь-кого; client — лише себе.
  IF auth_role() = 'client' THEN
    IF array_length(p_client_ids, 1) != 1
       OR p_client_ids[1] != current_client_id() THEN
      RAISE EXCEPTION 'access denied';
    END IF;
  END IF;

  RETURN QUERY
  WITH all_enrollments AS (
    SELECT
      e.client_id,
      e.sessions_used,
      e.hours_attended,
      e.status,
      c.starts_at
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.client_id = ANY(p_client_ids)
      AND c.ticket_type = p_ticket_type
      AND e.status IN ('enrolled', 'attended', 'noshow', 'waitlist')
  ),
  raw_balances AS (
    SELECT
      csb.client_id,
      COALESCE(csb.sessions_balance, 0) AS raw
    FROM client_session_balances csb
    WHERE csb.client_id = ANY(p_client_ids)
      AND csb.ticket_type = p_ticket_type
  ),
  -- cost = sessions_used якщо вже списано, інакше hours_attended.length ?? 1
  costs AS (
    SELECT
      ae.client_id,
      ae.starts_at,
      CASE
        WHEN ae.sessions_used > 0 THEN ae.sessions_used
        WHEN ae.hours_attended IS NOT NULL AND array_length(ae.hours_attended, 1) > 0
          THEN array_length(ae.hours_attended, 1)
        ELSE 1
      END AS cost,
      ae.sessions_used
    FROM all_enrollments ae
  ),
  per_client AS (
    SELECT
      c2.client_id,
      -- initialBalance = raw + sum(sessions_used) — відновлюємо баланс до нуля записів
      COALESCE(rb.raw, 0) + COALESCE(SUM(c2.sessions_used), 0) AS initial_balance,
      -- usedUpTo = sum(cost) для записів зі starts_at <= p_at
      COALESCE(SUM(CASE WHEN c2.starts_at <= p_at THEN c2.cost ELSE 0 END), 0) AS used_up_to
    FROM costs c2
    LEFT JOIN raw_balances rb ON rb.client_id = c2.client_id
    GROUP BY c2.client_id, rb.raw
  )
  SELECT
    pc.client_id,
    (pc.initial_balance - pc.used_up_to)::int AS balance_after
  FROM per_client pc;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_session_balances_running(p_client_id uuid, p_from timestamp with time zone)
 RETURNS TABLE(enrollment_id uuid, balance_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Доступ: owner/admin/trainer бачать будь-кого; client — лише себе.
  IF auth_role() = 'client' AND p_client_id != current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH upcoming AS (
    SELECT
      e.id            AS enrollment_id,
      c.ticket_type,
      c.starts_at,
      c.is_cancelled,
      CASE
        WHEN c.is_cancelled THEN 0
        ELSE COALESCE(array_length(e.hours_attended, 1), 1)
      END AS cost
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.client_id = p_client_id
      AND e.status IN ('enrolled', 'waitlist')
      AND c.starts_at >= p_from
  ),
  start_balance AS (
    SELECT ticket_type, COALESCE(sessions_balance, 0) AS raw
    FROM client_session_balances
    WHERE client_id = p_client_id
  ),
  running AS (
    SELECT
      u.enrollment_id,
      u.ticket_type,
      u.is_cancelled,
      -- кумулятивна сума вартостей у хронології в межах типу (включно з поточним)
      SUM(u.cost) OVER (
        PARTITION BY u.ticket_type
        ORDER BY u.starts_at, u.enrollment_id
        ROWS UNBOUNDED PRECEDING
      ) AS used_cumulative
    FROM upcoming u
  )
  SELECT
    r.enrollment_id,
    (COALESCE(sb.raw, 0) - r.used_cumulative)::int AS balance_after
  FROM running r
  LEFT JOIN start_balance sb ON sb.ticket_type = r.ticket_type;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_session_debtors_for_date(p_date date)
 RETURNS TABLE(time_str text, start_min integer, hall text, trainer text, short_label text, clients jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Тільки staff (owner/admin/trainer). Client не має доступу до чужих даних.
  IF auth_role() NOT IN ('owner', 'admin', 'trainer') THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH day_classes AS (
    SELECT
      c.id,
      c.ticket_type,
      c.starts_at,
      to_char(c.starts_at AT TIME ZONE 'Europe/Kyiv', 'HH24:MI') AS time_str,
      EXTRACT(HOUR   FROM c.starts_at AT TIME ZONE 'Europe/Kyiv')::int * 60 +
      EXTRACT(MINUTE FROM c.starts_at AT TIME ZONE 'Europe/Kyiv')::int AS start_min,
      COALESCE(h.name, '—') AS hall,
      COALESCE(tr.name, '—') AS trainer,
      tt.short_label
    FROM classes c
    LEFT JOIN halls    h  ON h.id  = c.hall_id
    LEFT JOIN trainers tr ON tr.id = c.trainer_id
    LEFT JOIN training_types tt ON tt.code = c.ticket_type
    WHERE c.starts_at >= (p_date::timestamptz AT TIME ZONE 'Europe/Kyiv')
      AND c.starts_at <  (p_date::timestamptz AT TIME ZONE 'Europe/Kyiv') + interval '1 day'
      AND c.is_cancelled = false
  ),
  debtors AS (
    SELECT
      dc.id          AS class_id,
      dc.time_str,
      dc.start_min,
      dc.hall,
      dc.trainer,
      dc.short_label,
      cl.first_name,
      cl.last_name,
      -- effectiveSessionBalance: enrolled ще не списано → віднімаємо вартість
      CASE
        WHEN e.sessions_used > 0 THEN csb.sessions_balance
        WHEN e.status = 'enrolled' THEN
          csb.sessions_balance - COALESCE(array_length(e.hours_attended, 1), 1)
        ELSE csb.sessions_balance
      END AS balance_eff
    FROM day_classes dc
    JOIN enrollments e ON e.class_id = dc.id
      AND e.status IN ('enrolled', 'attended', 'noshow')
    JOIN clients cl ON cl.id = e.client_id
    LEFT JOIN client_session_balances csb
      ON csb.client_id = e.client_id
      AND csb.ticket_type = dc.ticket_type
    WHERE
      CASE
        WHEN e.sessions_used > 0 THEN csb.sessions_balance
        WHEN e.status = 'enrolled' THEN
          COALESCE(csb.sessions_balance, 0) - COALESCE(array_length(e.hours_attended, 1), 1)
        ELSE COALESCE(csb.sessions_balance, 0)
      END < 0
  )
  SELECT
    d.time_str,
    d.start_min,
    d.hall,
    d.trainer,
    d.short_label,
    jsonb_agg(
      jsonb_build_object(
        'name',    trim(concat(d.first_name, ' ', d.last_name)),
        'balance', d.balance_eff
      )
      ORDER BY d.last_name, d.first_name
    ) AS clients
  FROM debtors d
  GROUP BY d.class_id, d.time_str, d.start_min, d.hall, d.trainer, d.short_label
  ORDER BY d.start_min, d.hall;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.mark_attendance(p_enrollment_id uuid, p_sessions_used integer DEFAULT 1)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment  public.enrollments%ROWTYPE;
  v_class       public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment
  FROM public.enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;

  IF v_enrollment.status = 'attended' THEN
    RETURN QUERY SELECT false, 'Відвідування вже зафіксовано'::text; RETURN;
  END IF;

  IF v_enrollment.status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'Запис скасовано'::text; RETURN;
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  IF v_class.is_cancelled THEN
    RETURN QUERY SELECT false, 'Заняття скасовано'::text; RETURN;
  END IF;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, -p_sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance - p_sessions_used;

  UPDATE public.enrollments
  SET status = 'attended',
      sessions_used = p_sessions_used,
      updated_at = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone_ua(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  digits text;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;
  digits := regexp_replace(p_phone, '\D', '', 'g');

  -- 380XXXXXXXXX (12 цифр) → як є
  IF length(digits) = 12 AND left(digits, 3) = '380' THEN
    RETURN '+' || digits;
  END IF;
  -- 0XXXXXXXXX (10 цифр, локальний) → +380XXXXXXXXX
  IF length(digits) = 10 AND left(digits, 1) = '0' THEN
    RETURN '+380' || substr(digits, 2);
  END IF;
  -- інакше — некоректний для нашого ринку
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_class(p_class_id uuid)
 RETURNS TABLE(success boolean, restored_count integer, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_class RECORD;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_class FROM classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Заняття не знайдено'::text;
    RETURN;
  END IF;

  UPDATE classes SET is_cancelled = false WHERE id = p_class_id;

  -- Restore attendance-marked enrollments with their sessions
  UPDATE enrollments
  SET status = 'attended', sessions_used =
      CASE
        WHEN duration_min >= 120 THEN array_length(hours_attended, 1)
        ELSE 1
      END
  WHERE class_id = p_class_id AND status = 'cancelled' AND sessions_used > 0
  RETURNING 1 INTO v_count;

  UPDATE enrollments
  SET status = 'cancelled', sessions_used = 0
  WHERE class_id = p_class_id AND status = 'cancelled' AND sessions_used = 0;

  RETURN QUERY SELECT true, v_count, NULL::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_attendance(p_enrollment_id uuid)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enrollment public.enrollments%ROWTYPE;
  v_class      public.classes%ROWTYPE;
BEGIN
  IF NOT public.can_manage_enrollment() THEN
    RETURN QUERY SELECT false, 'Доступно лише персоналу'::text; RETURN;
  END IF;

  SELECT * INTO v_enrollment FROM public.enrollments WHERE id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Запис не знайдено'::text; RETURN;
  END IF;
  IF v_enrollment.status <> 'attended' THEN
    RETURN QUERY SELECT false, 'Відвідування не зафіксовано'::text; RETURN;
  END IF;
  SELECT * INTO v_class FROM public.classes WHERE id = v_enrollment.class_id;

  INSERT INTO public.client_session_balances (client_id, ticket_type, sessions_balance)
  VALUES (v_enrollment.client_id, v_class.ticket_type, v_enrollment.sessions_used)
  ON CONFLICT (client_id, ticket_type)
  DO UPDATE SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;

  UPDATE public.enrollments
  SET status              = 'cancelled',
      sessions_used       = 0,
      cancellation_source = 'staff_manual',
      cancelled_at        = now(),
      updated_at          = now()
  WHERE id = p_enrollment_id;

  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.update_client_balance(p_client_id uuid, p_amount numeric, p_transaction_type character varying, p_description text, p_related_sale_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, new_balance integer, transaction_id uuid, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client RECORD;
  v_transaction_id uuid;
BEGIN
  SELECT * INTO v_client FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, NULL::uuid, 'Клієнта не знайдено'::text;
    RETURN;
  END IF;

  IF v_client.balance + p_amount < -v_client.credit_limit THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid,
      'Перевищено ліміт кредиту'::text;
    RETURN;
  END IF;

  UPDATE clients SET balance = balance + p_amount WHERE id = p_client_id;

  INSERT INTO balance_transactions (
    client_id, amount, transaction_type, description, related_sale_id, reason,
    balance_before, balance_after, created_at
  ) VALUES (
    p_client_id, p_amount, p_transaction_type, p_description, p_related_sale_id, p_reason,
    v_client.balance, v_client.balance + p_amount, now()
  ) RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, (v_client.balance + p_amount)::integer, v_transaction_id, NULL::text;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, v_client.balance, NULL::uuid, SQLERRM;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_sale(p_sale_id uuid, p_client_id uuid, p_ticket_id uuid, p_trainer_id uuid, p_cash_holder uuid DEFAULT NULL::uuid, p_ticket_name text DEFAULT NULL::text, p_ticket_price integer DEFAULT 0, p_sessions integer DEFAULT 0, p_ticket_type text DEFAULT NULL::text, p_price_paid integer DEFAULT 0, p_amount_given integer DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_notes text DEFAULT ''::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_client_id    uuid;
  v_old_amount_given integer;
  v_old_price_paid   integer;
  v_old_sessions     integer;
  v_old_ticket_type  text;
  v_old_delta        numeric;
  v_new_delta        numeric;
  v_correction       numeric;
  v_ok               boolean;
  v_err              text;
BEGIN
  SELECT client_id, amount_given, price_paid, sessions, ticket_type
  INTO v_old_client_id, v_old_amount_given, v_old_price_paid, v_old_sessions, v_old_ticket_type
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Продажу не знайдено'::text;
    RETURN;
  END IF;

  v_old_delta := v_old_amount_given - v_old_price_paid;
  v_new_delta := p_amount_given - p_price_paid;

  IF v_old_client_id = p_client_id THEN
    v_correction := v_new_delta - v_old_delta;
    IF v_correction <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        p_client_id, v_correction, 'adjustment', 'Редагування продажи', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
  ELSE
    IF v_old_delta <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        v_old_client_id, -v_old_delta, 'refund', 'Скасування продажи (зміна клієнта)', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
    IF v_new_delta <> 0 THEN
      SELECT t.success, t.error_message INTO v_ok, v_err
      FROM public.update_client_balance(
        p_client_id, v_new_delta, 'purchase', 'Передача продажи (зміна клієнта)', p_sale_id, NULL
      ) t;
      IF NOT v_ok THEN RETURN QUERY SELECT false, v_err; RETURN; END IF;
    END IF;
  END IF;

  -- Reverse old sessions
  IF COALESCE(v_old_sessions, 0) > 0 AND v_old_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (v_old_client_id, v_old_ticket_type, -v_old_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  -- Apply new sessions
  IF COALESCE(p_sessions, 0) > 0 AND p_ticket_type IS NOT NULL THEN
    INSERT INTO client_session_balances (client_id, ticket_type, sessions_balance)
    VALUES (p_client_id, p_ticket_type, p_sessions)
    ON CONFLICT (client_id, ticket_type) DO UPDATE
      SET sessions_balance = client_session_balances.sessions_balance + EXCLUDED.sessions_balance;
  END IF;

  UPDATE sales SET
    client_id      = p_client_id,
    ticket_id      = p_ticket_id,
    trainer_id     = p_trainer_id,
    cash_holder    = p_cash_holder,
    ticket_name    = p_ticket_name,
    ticket_price   = p_ticket_price,
    sessions       = p_sessions,
    ticket_type    = p_ticket_type,
    price_paid     = p_price_paid,
    amount_given   = p_amount_given,
    payment_method = p_payment_method,
    notes          = p_notes,
    created_at     = COALESCE(p_created_at, created_at)
  WHERE id = p_sale_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_training_type_sort_orders(p_ids uuid[], p_orders integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth_role() NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'access denied: owner/admin only';
  END IF;

  FOR i IN 1 .. array_length(p_ids, 1) LOOP
    UPDATE training_types SET sort_order = p_orders[i] WHERE id = p_ids[i];
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

-- ════════════════════════════════════════════════════════════════════════════
-- ════ TRIGGERS ════
-- ════════════════════════════════════════════════════════════════════════════

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER enforce_class_capacity BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION check_class_capacity();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trainers_updated_at BEFORE UPDATE ON public.trainers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- ════ RLS ENABLE + POLICIES ════
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_session_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_select_own ON public.balance_transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id = current_client_id()));
CREATE POLICY owner_admin_all ON public.balance_transactions AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY owner_admin_all ON public.class_series AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY client_select ON public.classes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'client'::text));
CREATE POLICY owner_admin_all ON public.classes AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_delete_own ON public.classes AS PERMISSIVE FOR DELETE TO authenticated USING (((auth_role() = 'trainer'::text) AND (trainer_id = current_trainer_id())));
CREATE POLICY trainer_insert_own ON public.classes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth_role() = 'trainer'::text) AND (trainer_id = current_trainer_id())));
CREATE POLICY trainer_select ON public.classes AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'trainer'::text));
CREATE POLICY trainer_update_own ON public.classes AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth_role() = 'trainer'::text) AND (trainer_id = current_trainer_id()))) WITH CHECK (((auth_role() = 'trainer'::text) AND (trainer_id = current_trainer_id())));
CREATE POLICY client_select_own ON public.client_contacts AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id = current_client_id()));
CREATE POLICY owner_admin_all ON public.client_contacts AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY client_select_own ON public.client_session_balances AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id = current_client_id()));
CREATE POLICY owner_admin_all ON public.client_session_balances AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_select ON public.client_session_balances AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'trainer'::text));
CREATE POLICY client_select_own ON public.clients AS PERMISSIVE FOR SELECT TO authenticated USING ((id = current_client_id()));
CREATE POLICY owner_admin_all ON public.clients AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_select ON public.clients AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'trainer'::text));
CREATE POLICY client_select_own ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id = current_client_id()));
CREATE POLICY owner_admin_all ON public.enrollments AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_delete_own ON public.enrollments AS PERMISSIVE FOR DELETE TO authenticated USING (((auth_role() = 'trainer'::text) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.trainer_id = current_trainer_id()))))));
CREATE POLICY trainer_insert_own ON public.enrollments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth_role() = 'trainer'::text) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.trainer_id = current_trainer_id()))))));
CREATE POLICY trainer_select ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'trainer'::text));
CREATE POLICY trainer_update_own ON public.enrollments AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth_role() = 'trainer'::text) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.trainer_id = current_trainer_id())))))) WITH CHECK (((auth_role() = 'trainer'::text) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.trainer_id = current_trainer_id()))))));
CREATE POLICY owner_all ON public.halls AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = 'owner'::text)) WITH CHECK ((auth_role() = 'owner'::text));
CREATE POLICY staff_ref_select ON public.halls AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = ANY (ARRAY['admin'::text, 'trainer'::text, 'client'::text])));
CREATE POLICY client_select_own ON public.sales AS PERMISSIVE FOR SELECT TO authenticated USING ((client_id = current_client_id()));
CREATE POLICY owner_admin_all ON public.sales AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY owner_admin_all ON public.series_clients AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_select ON public.series_clients AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = 'trainer'::text));
CREATE POLICY owner_admin_all ON public.studio_expenses AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY owner_all ON public.tickets AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = 'owner'::text)) WITH CHECK ((auth_role() = 'owner'::text));
CREATE POLICY staff_ref_select ON public.tickets AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = ANY (ARRAY['admin'::text, 'trainer'::text, 'client'::text])));
CREATE POLICY owner_all ON public.trainer_payments AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = 'owner'::text)) WITH CHECK ((auth_role() = 'owner'::text));
CREATE POLICY trainer_select_own ON public.trainer_payments AS PERMISSIVE FOR SELECT TO authenticated USING (((auth_role() = 'trainer'::text) AND (trainer_id = current_trainer_id())));
CREATE POLICY owner_all ON public.trainer_rates AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = 'owner'::text)) WITH CHECK ((auth_role() = 'owner'::text));
CREATE POLICY trainer_select_own ON public.trainer_rates AS PERMISSIVE FOR SELECT TO authenticated USING (((auth_role() = 'trainer'::text) AND ((trainer_id = current_trainer_id()) OR (trainer_id IS NULL))));
CREATE POLICY owner_admin_all ON public.trainers AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((auth_role() = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY trainer_client_select ON public.trainers AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = ANY (ARRAY['trainer'::text, 'client'::text])));
CREATE POLICY owner_all ON public.training_types AS PERMISSIVE FOR ALL TO authenticated USING ((auth_role() = 'owner'::text)) WITH CHECK ((auth_role() = 'owner'::text));
CREATE POLICY staff_ref_select ON public.training_types AS PERMISSIVE FOR SELECT TO authenticated USING ((auth_role() = ANY (ARRAY['admin'::text, 'trainer'::text, 'client'::text])));

-- ════════════════════════════════════════════════════════════════════════════
-- ════ GRANTS (tables) ════
-- ════════════════════════════════════════════════════════════════════════════

GRANT TRUNCATE, DELETE, UPDATE, SELECT, INSERT, TRIGGER, REFERENCES ON public.balance_transactions TO anon;
GRANT UPDATE, INSERT, TRIGGER, DELETE, REFERENCES, TRUNCATE, SELECT ON public.balance_transactions TO authenticated;
GRANT SELECT ON public.class_series TO anon;
GRANT UPDATE, SELECT, INSERT, DELETE ON public.class_series TO authenticated;
GRANT DELETE, UPDATE, SELECT, INSERT ON public.classes TO anon;
GRANT SELECT, UPDATE, DELETE, INSERT ON public.classes TO authenticated;
GRANT INSERT, DELETE, UPDATE, SELECT ON public.client_contacts TO anon;
GRANT DELETE, UPDATE, SELECT, INSERT ON public.client_contacts TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.client_session_balances TO anon;
GRANT DELETE, UPDATE, SELECT, INSERT ON public.client_session_balances TO authenticated;
GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.clients TO anon;
GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.clients TO authenticated;
GRANT SELECT ON public.clients_negative_balance TO anon;
GRANT SELECT ON public.clients_negative_balance TO authenticated;
GRANT SELECT ON public.clients_with_contacts TO anon;
GRANT SELECT ON public.clients_with_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.enrollments TO authenticated;
GRANT SELECT, TRIGGER, INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.halls TO anon;
GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.halls TO authenticated;
GRANT SELECT ON public.sales TO anon;
GRANT SELECT, UPDATE, INSERT, DELETE ON public.sales TO authenticated;
GRANT UPDATE, SELECT, INSERT, DELETE ON public.series_clients TO anon;
GRANT INSERT, DELETE, UPDATE, SELECT ON public.series_clients TO authenticated;
GRANT SELECT, UPDATE, DELETE, INSERT ON public.studio_expenses TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE ON public.studio_expenses TO authenticated;
GRANT SELECT ON public.tickets TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.tickets TO authenticated;
GRANT DELETE, UPDATE, SELECT, INSERT ON public.trainer_payments TO anon;
GRANT DELETE, UPDATE, SELECT, INSERT ON public.trainer_payments TO authenticated;
GRANT UPDATE, DELETE, INSERT, SELECT ON public.trainer_rates TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.trainer_rates TO authenticated;
GRANT UPDATE, TRIGGER, REFERENCES, TRUNCATE, DELETE, SELECT, INSERT ON public.trainers TO anon;
GRANT SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT ON public.trainers TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.training_types TO anon;
GRANT SELECT, DELETE, INSERT, UPDATE ON public.training_types TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ════ FUNCTION EXECUTE GRANTS ════
-- ════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.calc_trainer_salary(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.calc_trainer_salary(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_trainer_salary_v2(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calc_trainer_salary_v2(p_trainer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_class_and_restore_sessions(p_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancellation_deadline(p_starts_at timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.cancellation_deadline(p_starts_at timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_enrollment_status(p_enrollment_id uuid, p_new_status text, p_force_no_charge boolean, p_sessions_used integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_class_conflicts(p_starts_at timestamp with time zone, p_duration_min integer, p_hall_id uuid, p_trainer_id uuid, p_exclude_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_class_conflicts(p_starts_at timestamp with time zone, p_duration_min integer, p_hall_id uuid, p_trainer_id uuid, p_exclude_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_client_conflict(p_client_id uuid, p_class_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_client_conflict(p_client_id uuid, p_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_availability(p_class_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel(p_enrollment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_enroll(p_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_trainer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class(p_class_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_enrollment(p_enrollment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_week(p_start_date date, p_weeks integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_week(p_start_date date, p_weeks integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_session_balance_after(p_client_ids uuid[], p_ticket_type text, p_at timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_balances_running(p_client_id uuid, p_from timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_debtors_for_date(p_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_attendance(p_enrollment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_training_type_sort_orders(p_ids uuid[], p_orders integer[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ════ VIEWS ════
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.clients_negative_balance AS  SELECT id,
    first_name,
    last_name,
    balance,
    credit_limit,
    balance_updated_at
   FROM clients
  WHERE (balance < 0)
  ORDER BY balance;
ALTER VIEW public.clients_negative_balance SET (security_invoker = true);

CREATE OR REPLACE VIEW public.clients_with_contacts AS  SELECT c.id,
    c.first_name,
    c.last_name,
    c.balance,
    c.credit_limit,
    c.balance_updated_at,
    c.created_at,
    c.updated_at,
    c.user_id,
    cc.phone,
    cc.instagram_username,
    cc.telegram_username
   FROM (clients c
     LEFT JOIN client_contacts cc ON ((cc.client_id = c.id)));
ALTER VIEW public.clients_with_contacts SET (security_invoker = true);

CREATE OR REPLACE VIEW public.v_client_balance_summary AS  SELECT id,
    first_name,
    last_name,
    balance,
    credit_limit,
    (credit_limit + (balance)::numeric) AS available_credit,
        CASE
            WHEN (balance > 0) THEN 'positive'::text
            WHEN (balance = 0) THEN 'zero'::text
            ELSE 'debt'::text
        END AS balance_status,
    balance_updated_at
   FROM clients c;

