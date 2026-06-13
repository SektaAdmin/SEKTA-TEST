-- =============================================================================
-- integrity_checks_idor.sql
-- IDOR regression guard for get_session_balance_after / get_session_balances_running
--
-- What:  7 assertions (A1–A5 attack vectors, B1–B2 legitimate access) that
--        verify the NULL-bypass gate introduced in 20260613_fix_idor_null_bypass_gates.sql
--        has not been regressed by a CREATE OR REPLACE or schema drift.
--
-- When to run:
--   • After any migration that touches get_session_balance_after,
--     get_session_balances_running, auth_role(), or current_client_id().
--   • As part of a periodic prod health-check (weekly / post-deploy).
--   • Read-only: no writes, no test users created, safe against live traffic.
--
-- How to run (Supabase MCP or psql):
--   psql $DATABASE_URL -f scripts/integrity_checks_idor.sql
--
-- If a check FAILS:
--   • "ATTACK VECTOR OPEN" → an attacker can read another client's session
--     balance without being that client.  Redeploy the gate migration
--     20260613_fix_idor_null_bypass_gates.sql immediately.
--   • "LEGITIMATE ACCESS BROKEN" → real clients can no longer read their own
--     balance; the cabinet schedule and visits screens will be broken.
--     Check recent CREATE OR REPLACE on the two functions.
--
-- Prerequisites:
--   • Run as a role that has EXECUTE on both functions and can call
--     set_config() (postgres or service_role).
--   • Requires at least one client row with sessions_balance > 0 and a linked
--     auth.users row (otherwise B1/B2 will report 0 rows, which is still PASS
--     for the gate — adjust the threshold comment accordingly).
-- =============================================================================

DO $$
DECLARE
  v_victim_client_id  uuid;
  v_victim_auth_uid   uuid;
  v_foreign_uid       uuid := gen_random_uuid();  -- attacker: uid with no clients row
  v_rows              int;
  v_ok                boolean;
BEGIN

  -- -------------------------------------------------------------------------
  -- Resolve a real victim: a client with a linked cabinet and session balance.
  -- If none exists, attack checks still assert the gate fires; B1/B2 assert
  -- 0 rows (gate passes for non-existent data).
  -- -------------------------------------------------------------------------
  SELECT c.id, c.user_id
    INTO v_victim_client_id, v_victim_auth_uid
    FROM clients c
    JOIN client_session_balances csb ON csb.client_id = c.id
   WHERE c.user_id IS NOT NULL
     AND csb.sessions_balance > 0
   LIMIT 1;

  -- =========================================================================
  -- A1 — get_session_balance_after: attacker has no clients row (NULL client_id),
  --      passes a single valid victim uuid.  Gate must RAISE.
  -- =========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub',          v_foreign_uid,
        'role',         'authenticated',
        'app_metadata', json_build_object('role','client')
      )::text,
      true
    );
    -- current_client_id() = NULL because no clients.user_id = v_foreign_uid
    PERFORM get_session_balance_after(
      ARRAY[v_victim_client_id],
      now() - interval '30 days'
    );
    -- If we reach here the gate did NOT fire → regression
    RAISE EXCEPTION 'ASSERT FAILED A1: ATTACK VECTOR OPEN — get_session_balance_after did not block attacker with NULL current_client_id()';
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm ILIKE '%access denied%' THEN
        RAISE NOTICE 'A1 PASS: null-client attacker correctly blocked';
      ELSE
        RAISE EXCEPTION 'ASSERT FAILED A1 (unexpected error): %', sqlerrm;
      END IF;
  END;

  -- =========================================================================
  -- A2 — get_session_balance_after: NULL array argument (old array_length bypass).
  --      cardinality(NULL)=0 → must RAISE before any data access.
  -- =========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub',          v_foreign_uid,
        'role',         'authenticated',
        'app_metadata', json_build_object('role','client')
      )::text,
      true
    );
    PERFORM get_session_balance_after(
      NULL::uuid[],
      now() - interval '30 days'
    );
    RAISE EXCEPTION 'ASSERT FAILED A2: ATTACK VECTOR OPEN — get_session_balance_after accepted NULL array';
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm ILIKE '%access denied%' THEN
        RAISE NOTICE 'A2 PASS: NULL array correctly blocked';
      ELSE
        RAISE EXCEPTION 'ASSERT FAILED A2 (unexpected error): %', sqlerrm;
      END IF;
  END;

  -- =========================================================================
  -- A3 — get_session_balance_after: empty array ARRAY[]::uuid[].
  --      cardinality([])=0 ≠ 1 → must RAISE.
  -- =========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub',          v_foreign_uid,
        'role',         'authenticated',
        'app_metadata', json_build_object('role','client')
      )::text,
      true
    );
    PERFORM get_session_balance_after(
      ARRAY[]::uuid[],
      now() - interval '30 days'
    );
    RAISE EXCEPTION 'ASSERT FAILED A3: ATTACK VECTOR OPEN — get_session_balance_after accepted empty array';
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm ILIKE '%access denied%' THEN
        RAISE NOTICE 'A3 PASS: empty array correctly blocked';
      ELSE
        RAISE EXCEPTION 'ASSERT FAILED A3 (unexpected error): %', sqlerrm;
      END IF;
  END;

  -- =========================================================================
  -- A4 — get_session_balance_after: multi-id array (bypass cardinality=1 check).
  --      cardinality > 1 → must RAISE even if one id matches the caller.
  -- =========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub',          v_foreign_uid,
        'role',         'authenticated',
        'app_metadata', json_build_object('role','client')
      )::text,
      true
    );
    PERFORM get_session_balance_after(
      ARRAY[v_victim_client_id, gen_random_uuid()],
      now() - interval '30 days'
    );
    RAISE EXCEPTION 'ASSERT FAILED A4: ATTACK VECTOR OPEN — get_session_balance_after accepted multi-id array';
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm ILIKE '%access denied%' THEN
        RAISE NOTICE 'A4 PASS: multi-id array correctly blocked';
      ELSE
        RAISE EXCEPTION 'ASSERT FAILED A4 (unexpected error): %', sqlerrm;
      END IF;
  END;

  -- =========================================================================
  -- A5 — get_session_balances_running: attacker has no clients row,
  --      passes foreign client_id.  Gate must RAISE.
  -- =========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object(
        'sub',          v_foreign_uid,
        'role',         'authenticated',
        'app_metadata', json_build_object('role','client')
      )::text,
      true
    );
    PERFORM get_session_balances_running(
      v_victim_client_id,
      now() - interval '30 days'
    );
    RAISE EXCEPTION 'ASSERT FAILED A5: ATTACK VECTOR OPEN — get_session_balances_running did not block attacker with NULL current_client_id()';
  EXCEPTION
    WHEN OTHERS THEN
      IF sqlerrm ILIKE '%access denied%' THEN
        RAISE NOTICE 'A5 PASS: null-client attacker correctly blocked on get_session_balances_running';
      ELSE
        RAISE EXCEPTION 'ASSERT FAILED A5 (unexpected error): %', sqlerrm;
      END IF;
  END;

  -- =========================================================================
  -- B1 — get_session_balance_after: legitimate client reads own balance.
  --      Must NOT raise; must return >= 0 rows.
  -- =========================================================================
  IF v_victim_auth_uid IS NOT NULL THEN
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object(
          'sub',          v_victim_auth_uid,
          'role',         'authenticated',
          'app_metadata', json_build_object('role','client')
        )::text,
        true
      );
      SELECT count(*) INTO v_rows
        FROM get_session_balance_after(
          ARRAY[v_victim_client_id],
          now() - interval '30 days'
        );
      -- Any non-exception result is a pass (0 rows is valid if no classes in range)
      RAISE NOTICE 'B1 PASS: legitimate client read own balance — % row(s)', v_rows;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'ASSERT FAILED B1: LEGITIMATE ACCESS BROKEN — get_session_balance_after raised for valid owner: %', sqlerrm;
    END;
  ELSE
    RAISE NOTICE 'B1 SKIPPED: no linked client with sessions found; gate logic still covered by A1–A4';
  END IF;

  -- =========================================================================
  -- B2 — get_session_balances_running: legitimate client reads own running balance.
  --      Must NOT raise; must return >= 0 rows.
  -- =========================================================================
  IF v_victim_auth_uid IS NOT NULL THEN
    BEGIN
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object(
          'sub',          v_victim_auth_uid,
          'role',         'authenticated',
          'app_metadata', json_build_object('role','client')
        )::text,
        true
      );
      SELECT count(*) INTO v_rows
        FROM get_session_balances_running(
          v_victim_client_id,
          now() - interval '30 days'
        );
      RAISE NOTICE 'B2 PASS: legitimate client read own running balance — % row(s)', v_rows;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION 'ASSERT FAILED B2: LEGITIMATE ACCESS BROKEN — get_session_balances_running raised for valid owner: %', sqlerrm;
    END;
  ELSE
    RAISE NOTICE 'B2 SKIPPED: no linked client with sessions found; gate logic still covered by A5';
  END IF;

  -- =========================================================================
  -- Summary
  -- =========================================================================
  RAISE NOTICE '=== integrity_checks_idor.sql complete — all assertions passed ===';

END;
$$;
