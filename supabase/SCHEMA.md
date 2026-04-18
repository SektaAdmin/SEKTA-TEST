# Database Schema

**Last Synced:** 18.04.2026, 12:53:24

## 📋 Tables

### `clients`
**Columns:** 11
```
id
first_name
last_name
phone
instagram_username
created_at
updated_at
balance
telegram_username
credit_limit
balance_updated_at
```

### `sales`
**Columns:** 0
```

```

### `tickets`
**Columns:** 8
```
id
name
ticket_type
sessions
price
is_active
created_at
updated_at
```

### `trainers`
**Columns:** 7
```
id
name
is_active
created_at
updated_at
instagram_username
telegram_username
```

### `halls`
**Columns:** 6
```
id
name
capacity
is_active
created_at
description
```

### `schedules`
**Columns:** 15
```
id
title
schedule_type
trainer_id
hall_id
start_time
duration_minutes
max_capacity
reserve_slots
is_active
created_at
updated_at
day_of_week
sessions_cost
group_id
```

### `schedule_slots`
**Columns:** 0
```

```

### `enrollments`
**Columns:** 0
```

```

### `regular_enrollments`
**Columns:** 0
```

```

### `balance_transactions`
**Columns:** 14
```
id
client_id
amount
transaction_type
related_sale_id
balance_before
balance_after
description
reason
created_by
created_at
reversed_at
reversed_by
reversal_reason
```

## 🔗 Foreign Keys

- sales.client_id → clients.id
- sales.ticket_id → tickets.id
- sales.trainer_id → trainers.id
- schedule_slots.hall_id → halls.id
- schedule_slots.schedule_id → schedules.id
- schedule_slots.trainer_id → trainers.id
- enrollments.slot_id → schedule_slots.id
- enrollments.client_id → clients.id
- regular_enrollments.client_id → clients.id
- regular_enrollments.schedule_id → schedules.id
- balance_transactions.client_id → clients.id

## 📇 Indexes

- `clients`.`idx_clients_email` on (email)
- `clients`.`idx_clients_last_name` on (last_name)
- `sales`.`idx_sales_client_id` on (client_id)
- `sales`.`idx_sales_created_at` on (created_at)
- `tickets`.`idx_tickets_is_active` on (is_active)
- `tickets`.`idx_tickets_type` on (ticket_type)
- `schedule_slots`.`idx_slots_date` on (slot_date)
- `enrollments`.`idx_enrollments_status` on (status)
- `balance_transactions`.`idx_balance_client` on (client_id)

## ✓ Check Constraints

- `clients`: balance >= 0
- `tickets`: price_kopecks >= 0
- `tickets`: sessions > 0
- `sales`: price_paid >= 0

## 👁️ Views

- `client_session_balance`

## ⚙️ Functions (RPC)

### `update_client_balance`
**Params:** client_id, p_amount, p_description
**Description:** Updates client balance and logs to balance_transactions

### `adjust_client_balance`
**Params:** client_id, amount, description
**Description:** Legacy function for balance adjustment

