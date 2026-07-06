-- fix #3 з ревью ЗП (2026-07-06): перекриття періодів виплат.
--
-- «Виплачено за період» на /settings/salary/calculations = overlap-вибірка
-- (listTrainerPayments: period_start <= до AND period_end >= від). Дві фінальні
-- виплати з перекритими періодами → задвоєння/недооблік «До виплати» залежно від
-- обраного діапазону. Рішення власника: БД забороняє перекриття лише для
-- payment_type='final'; аванси вільні — аванс легітимно перекривається з
-- фінальною за той самий період (фінальна гасить залишок після авансу).
--
-- Перевірено 2026-07-07: перекритих фінальних на проді немає (попарний self-join → 0).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.trainer_payments
  ADD CONSTRAINT trainer_payments_final_no_overlap
  EXCLUDE USING gist (
    trainer_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  )
  WHERE (payment_type = 'final');
