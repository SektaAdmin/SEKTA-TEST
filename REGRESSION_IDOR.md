# IDOR Regression Report — get_session_balance_after / get_session_balances_running

**Date:** 2026-06-13  
**Tested against:** production DB (read-only regression — no writes, no test users created)  
**Migrations verified:** `20260613_fix_idor_null_bypass_gates.sql` (supersedes `20260613_fix_idor_get_session_balance_after.sql`)

---

## Deployed function bodies confirmed

Both functions in prod contain the final `IS DISTINCT FROM` + explicit `IS NULL` gate:

```sql
-- get_session_balance_after
IF auth_role() = 'client' THEN
  IF current_client_id() IS NULL
     OR cardinality(p_client_ids) != 1
     OR p_client_ids[1] IS DISTINCT FROM current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;

-- get_session_balances_running
IF auth_role() = 'client' THEN
  IF current_client_id() IS NULL
     OR p_client_id IS DISTINCT FROM current_client_id() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
END IF;
```

---

## Test results

All tests run by simulating JWT claims via `set_config('request.jwt.claims', …)` inside a DO block, results written to a temp table, no production data modified.

**Victim used:** one real client with `sessions_balance > 0` (their `client_id` was the attack target).

### Attack scenarios (must block)

| Test | Scenario | Result |
|------|----------|--------|
| **A1** | `get_session_balance_after` — attacker has no `clients` row (`current_client_id()=NULL`), passes foreign `client_id` | ✅ **PASS** — `access denied` |
| **A2** | `get_session_balance_after` — `NULL` array argument (old `array_length(NULL)` bypass) | ✅ **PASS** — `access denied` |
| **A3** | `get_session_balance_after` — empty array `ARRAY[]::uuid[]` | ✅ **PASS** — `access denied` |
| **A4** | `get_session_balance_after` — multi-id array (bypass `cardinality=1` check) | ✅ **PASS** — `access denied` |
| **A5** | `get_session_balances_running` — attacker has no `clients` row, passes foreign `client_id` | ✅ **PASS** — `access denied` |

All 5 attack vectors raise `EXCEPTION 'access denied'` before any data is touched.

### Legitimate scenarios (must allow)

| Test | Scenario | Result |
|------|----------|--------|
| **B1** | `get_session_balance_after` — client requests own balance (JWT sub = their `auth.uid`) | ✅ **PASS** — 1 row returned |
| **B2** | `get_session_balances_running` — client requests own running balance | ✅ **PASS** — 6 rows returned |

No regressions in the happy path.

---

## Exposure assessment (read-only prod query)

| Metric | Count |
|--------|-------|
| Total clients in DB | 1,575 |
| Clients with active cabinet (linked `user_id`) | **1** |
| Trainers with active cabinet | 1 |
| Clients with active session balance data | **1** |

**Practical exposure before the fix:** Only 1 client account was linked to a cabinet at the time of patching. The exploitable population for the NULL-bypass vector (an attacker authenticated as `role=client` with no `clients` row — i.e. owner/admin/trainer accounts acting as client) could read the 1 client's session balance. No evidence of exploitation (no monitoring logs), and the session balance data is low-sensitivity (number of remaining classes by type, not financial data).

---

## Verdict

**Fix is complete and correct.** All attack vectors blocked. Legitimate access unaffected. No staging environment was needed — tests run entirely as read-only SQL assertions against the prod database with no test users created or data modified.
