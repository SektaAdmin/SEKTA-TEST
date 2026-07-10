#!/usr/bin/env bash
# Geist-прескан: механічний пошук розбіжностей із дизайн-системою БЕЗ участі агента.
#
#   bash scripts/geist/audit-page.sh <шлях...> [-o звіт.md]
#     <шлях> — директорія сторінки (app/audit) та/або окремі .tsx/.module.css
#     -o     — записати звіт у файл (без -o — stdout)
#
#   bash scripts/geist/audit-page.sh usages <cssКлас>
#     — де клас використовується по всьому app/ + components/ + lib/ (для безпечного видалення)
#
# Джерело мапінгів: app/globals.css + конвенції шапки docs/geist-migration.md.
# Скрипт НЕ вирішує «навмисно raw чи ні» — це тріаж оркестратора/migrator-а;
# він лише збирає всі кандидати в один компактний звіт із точними file:line.
# set -e свідомо БЕЗ pipefail: проміжні grep-фільтри легітимно повертають 1 на «нічого не знайдено»
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# ── підкоманда usages ────────────────────────────────────────────────────────
if [ "${1:-}" = "usages" ]; then
  cls="${2:?usages: вкажи імʼя класу}"
  grep -rnE --include='*.tsx' --include='*.ts' --include='*.css' \
    "(styles\.${cls}\b|\[[\"']${cls}[\"']\]|\.${cls}[^A-Za-z0-9_-]|[\"' ]${cls}[\"' ])" \
    app components lib 2>/dev/null || echo "0 збігів — клас ніде не використовується"
  exit 0
fi

# ── аргументи ────────────────────────────────────────────────────────────────
OUT=""; PATHS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    *)  PATHS+=("$1"); shift ;;
  esac
done
[ ${#PATHS[@]} -gt 0 ] || { echo "usage: audit-page.sh <шлях...> [-o звіт.md]" >&2; exit 1; }

# ── збір файлів: директорії розгортаємо, для .tsx довантажуємо їх *.module.css ─
FILES=()
for p in "${PATHS[@]}"; do
  if [ -d "$p" ]; then
    while IFS= read -r f; do FILES+=("$f"); done \
      < <(find "$p" -type f \( -name '*.tsx' -o -name '*.module.css' \) | sort)
  elif [ -f "$p" ]; then
    FILES+=("$p")
    case "$p" in *.tsx)
      while IFS= read -r imp; do
        resolved="$(cd "$(dirname "$p")" && cd "$(dirname "$imp")" 2>/dev/null && pwd)/$(basename "$imp")"
        if [ -f "$resolved" ]; then FILES+=("${resolved#"$ROOT"/}"); fi
      done < <(grep -oE "from ['\"][^'\"]*\.module\.css" "$p" | sed "s/from ['\"]//") ;;
    esac
  else
    echo "⚠️ не знайдено: $p" >&2
  fi
done
# унікалізація зі збереженням порядку
FILES=($(printf '%s\n' "${FILES[@]}" | awk '!seen[$0]++'))
CSS=();  TSX=()
for f in "${FILES[@]}"; do case "$f" in *.css) CSS+=("$f");; *.tsx) TSX+=("$f");; esac; done

TOTAL=0; MECH=0
REPORT="$(mktemp)"
say() { printf '%s\n' "$*" >>"$REPORT"; }

# emit <заголовок> <механічне:так/ні> ; рядки знахідок зі stdin
emit() {
  local title="$1" mech="$2" lines
  lines="$(cat)"; [ -n "$lines" ] || return 0
  local n; n=$(printf '%s\n' "$lines" | wc -l | tr -d ' ')
  TOTAL=$((TOTAL+n))
  if [ "$mech" = "так" ]; then MECH=$((MECH+n)); fi
  say ""; say "## $title — $n (механічне: $mech)"
  printf '%s\n' "$lines" >>"$REPORT"
}
# grep без падіння на «нічого не знайдено», зрізаємо коментар-рядки CSS
g() { grep -nHE "$1" "${@:2}" 2>/dev/null | grep -vE ':[0-9]+: *(/\*|\*)' || true; }
trim() { sed -E 's/:[[:space:]]+/: /; s/^(.{160}).*/\1…/' ; }

# ── шапка ────────────────────────────────────────────────────────────────────
say "# Geist-прескан — $(date +%Y-%m-%d)"
say ""
say "Файли: ${FILES[*]}"
say ""
say "> Навмисно raw (конвенції трекера — такі пункти НЕ правити, лише підтвердити при тріажі):"
say "> мікро-типографіка календарних сіток (10/11px); індикаторні акценти «зараз/сьогодні» на --danger;"
say "> swipe-анімації зі своїм easing; динамічні inline-стилі позиціювання; .paymentTabs;"
say "> skeleton-ширини (розмірні px); hero-numbers поза шкалою (26/22px, прецедент .msMetricAlert);"
say "> заливки/бордери/іконки — raw --success/--danger/--warning коректно, -text лише для тексту ≤18px."

if [ ${#CSS[@]} -gt 0 ]; then
  # 1. Хардкоди кольорів
  emit "Хардкоди кольорів (hex/rgba/hsl)" "ні" <<< "$(g '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "${CSS[@]}" | trim \
    | sed 's/$/   → токен із globals.css (--bg-*\/--text*\/--border*\/--success\/--danger\/--warning…)/')"

  # 2. Типографіка: px у шкалі → точний токен
  emit "font-size у шкалі → токен" "так" <<< "$(
    for map in "12:--fs-xs" "13:--fs-sm" "14:--fs-base" "16:--fs-md" "20:--fs-lg" "24:--fs-xl" "32:--fs-2xl"; do
      px="${map%%:*}"; tok="${map##*:}"
      g "font-size: *${px}px" "${CSS[@]}" | trim | sed "s/$/   → var(${tok})/"
    done)"

  # 3. Типографіка поза шкалою
  emit "font-size поза шкалою" "ні" <<< "$(g 'font-size: *[0-9]+px' "${CSS[@]}" | grep -vE 'font-size: *(12|13|14|16|20|24|32)px' | trim \
    | sed 's/$/   → поза шкалою: можливо навмисно raw (див. шапку) — тріаж/')"

  # 4. Рухи
  emit "transition/animation 0.1–0.15s" "так" <<< "$(g '(transition|animation)[^;]*0\.(1|12|15)s' "${CSS[@]}" | grep -v 'var(--motion' | trim \
    | sed 's/$/   → var(--motion-fast) (easing ВЖЕ всередині токена — «ease» не дописувати)/')"
  emit "transition/animation 0.18–0.2s" "ні" <<< "$(g '(transition|animation)[^;]*0\.(18|2)s' "${CSS[@]}" | grep -v 'var(--motion' | trim \
    | sed 's/$/   → var(--motion-standard), АЛЕ swipe-анімації зі своїм easing — навмисно raw/')"

  # 5. Радіуси
  emit "border-radius px → токен" "так" <<< "$(
    for map in "4:--radius-xs" "6:--radius-sm" "12:--radius" "999:--radius-full"; do
      px="${map%%:*}"; tok="${map##*:}"
      g "border-radius: *${px}px" "${CSS[@]}" | trim | sed "s/$/   → var(${tok})/"
    done)"

  # 6. !important
  emit "!important" "ні" <<< "$(g '!important' "${CSS[@]}" | trim \
    | sed 's/$/   → рескоуп `.обгортка :global(.data-table) .клас` (урок Етапу I, НЕ до снаги haiku)/')"

  # 7. Семантичний текст raw
  emit "raw --success/--danger/--warning як color" "ні" <<< "$(g 'color: *var\(--(success|danger|warning)\)' "${CSS[@]}" | trim \
    | sed 's/$/   → якщо це ТЕКСТ ≤18px — var(--…-text); іконки\/бордери\/>18px — лишити raw/')"

  # 8. Локальні skeleton/shimmer
  emit "локальний skeleton/shimmer" "так" <<< "$(g '@keyframes *[A-Za-z]*([Ss]kel|[Ss]himmer|[Pp]ulse)' "${CSS[@]}" | trim \
    | sed 's/$/   → видалити, використати глобальний .skeleton-bone/')"

  # 9. Потенційно мертві класи (визначені в module.css, не знайдені в .tsx набору)
  emit "потенційно мертві CSS-класи" "ні" <<< "$(
    for css in "${CSS[@]}"; do
      for cls in $(grep -oE '^\s*\.[a-zA-Z][a-zA-Z0-9_]+' "$css" | tr -d ' .' | sort -u); do
        if [ ${#TSX[@]} -gt 0 ] && ! grep -qE "\.${cls}\b|[\"']${cls}[\"']" "${TSX[@]}" 2>/dev/null \
           && ! grep -qE "composes:.*\b${cls}\b|:global\(\.${cls}\)" "$css"; then
          echo "$css: .$cls   → кандидат dead CSS; перед видаленням: audit-page.sh usages $cls"
        fi
      done
    done)"
fi

if [ ${#TSX[@]} -gt 0 ]; then
  # 10. Inline-стилі
  emit "inline style у TSX" "ні" <<< "$(g 'style=\{\{' "${TSX[@]}" | trim \
    | sed 's/$/   → статичне — у CSS-модуль; динамічне позиціювання — навмисно raw/')"

  # 11. Хардкоди кольорів у TSX
  emit "hex/rgba у TSX" "ні" <<< "$(g "(#[0-9a-fA-F]{6}\b|rgba?\()" "${TSX[@]}" | trim \
    | sed 's/$/   → токен або клас/')"

  # 12. Не-українські літери (ы/э/ъ/ё відсутні в українській)
  emit "російські літери в TSX" "так" <<< "$(g '[ыэъёЫЭЪЁ]' "${TSX[@]}" | trim \
    | sed 's/$/   → UI-тексти тільки українською/')"

  # 13. Таблиці повз .data-table
  emit "<table> без .data-table" "ні" <<< "$(g '<table' "${TSX[@]}" | grep -v 'data-table' | trim \
    | sed 's/$/   → глобальні .data-table-wrap \/ .data-table/')"
fi

say ""
say "## Підсумок: $TOTAL знахідок, з них суто механічних: $MECH"
say "Список повністю механічний: $([ "$TOTAL" -eq "$MECH" ] && echo так || echo ні)."
say "Поза цим звітом лишається СТРУКТУРНИЙ рівень (дублювання Geist-примітивів, DOM-контракт,"
say "обхід ModalShell/FormField/badges.ts) — його оцінює migrator читанням файлів вище."

if [ -n "$OUT" ]; then mv "$REPORT" "$OUT"; echo "звіт → $OUT ($TOTAL знахідок)"; else cat "$REPORT"; rm -f "$REPORT"; fi
