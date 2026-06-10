-- Self-запис клієнта: для довгого заняття (duration_min >= 120) проставити
-- hours_attended = [1,2], щоб auto_close списав 2 сесії (як в адмінському флоу),
-- а не 1 (через NULL). Клієнт записується на ВСЕ заняття, тож бере обидві години.
-- Решта логіки незмінна.
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
$function$;
