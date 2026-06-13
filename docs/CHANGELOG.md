# CHANGELOG — помітні віхи

> **Канон історії — `git log`** (повний, з диффами). Сюди — лише **помітні** віхи рівня
> архітектури/схеми/безпеки, які варто бачити з пташиного польоту, без рознесення на кожен коміт.
> Не дублювати git, не вести changelog кожної правки. Дати — абсолютні. Найновіше згори.

## 2026-06-13 — Реорганізація документації

- Введено структуру `docs/`: живі тематичні документи (`ARCHITECTURE`, `DATABASE`, `SECURITY`,
  `CHANGELOG`, + наявні `FRONTEND`, `ROLES_PLAN`) — тонкі указівники на канон (`CLAUDE.md`,
  `types/database.types.ts`, міграції); `docs/archive/` для заморожених звітів; `docs/legacy/` для
  старих робочих документів (помічені `⚠️ LEGACY`).
- Правило синхронізації docs↔код → [CONTRIBUTING.md](CONTRIBUTING.md); чек дрейфу →
  [DRIFT_CHECK_PROMPT.md](DRIFT_CHECK_PROMPT.md).

## 2026-06-13 — Adversarial-аудит БД + фікси (10 знахідок)

- 10 знахідок аудиту фінансово-сесійної логіки → 10 закрито. Ключове: закрито IDOR NULL-bypass у
  `get_session_balances_running`/`get_session_balance_after`; salary v2 → `rate × sessions_used`;
  тригер реверсу сесій на bulk-delete; integer-guard у `update_client_balance`; advisory-lock проти
  гонки вмісткості в `client_enroll`.
- Заморожені звіти → [archive/adversarial-audit-2026-06-13/](archive/adversarial-audit-2026-06-13/).

## Раніше (стан, не журнал)

Перехід на рольову модель (owner/admin/trainer/client) + кабінети тренера й клієнта — завершено
(фази 0–5). Деталі й фактичний стан → [ROLES_PLAN.md](ROLES_PLAN.md). Повна історія — `git log`.
