'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pull-to-refresh для внутрішнього скрол-контейнера кабінету (`.scroll`).
 *
 * Кабінет — PWA standalone, html/body мають overflow:hidden, увесь скрол —
 * всередині переданого контейнера. Нативного браузерного pull тут нема, тож
 * жест ні з чим системним не конфліктує. Вертикальна вісь — горизонтальні
 * свайпи тижня/дня (schedule) не зачіпаються: жест активується лише коли
 * вертикальне зміщення домінує над горизонтальним.
 *
 * Тягне `onRefresh` (зазвичай той самий `refetch`, що й refetchOnVisible).
 * Спрацьовує ТІЛЬКИ від самого верху (scrollTop<=0) і лише після порогу —
 * щоб інерційний доскрол до верху не зчитувався як pull.
 *
 * Відчуття «як нативний bounce»: під час тяги — прогресивний опір (що далі,
 * то тугіше, без лінійного «їде за пальцем»), на відпускання — `releasing`
 * вмикає CSS-transition, тож індикатор плавно пружинить назад, а не щолкає.
 *
 * @param scrollRef    реф на скрол-контейнер
 * @param onRefresh    що викликати на відпускання після порогу (може бути async)
 * @returns { pull, refreshing, releasing } — пікселі відтягування, прапор
 *          активного оновлення і прапор «пружинить назад» (для CSS-transition)
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement>,
  onRefresh: () => void | Promise<void>,
) {
  const THRESHOLD = 64       // px відтягування для запуску
  const MAX_PULL = 110       // стеля візуального відтягування (асимптота опору)

  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [releasing, setReleasing] = useState(false)  // true → CSS пружинить висоту

  // Прогресивний (нелінійний) опір як у нативного overscroll: близько до верху
  // індикатор іде майже за пальцем, далі асимптотично загальмовує до MAX_PULL.
  // d — «сирий» dy пальця; повертаємо фактичну висоту відтягування.
  function resist(d: number) {
    return (1 - 1 / (d / MAX_PULL + 1)) * MAX_PULL
  }

  // Тримаємо колбек у ref — щоб слухачі не пересоздавались на кожен рендер.
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const startYRef = useRef(0)
  const startXRef = useRef(0)
  const activeRef = useRef(false)     // жест визнано вертикальним pull-ом
  const decidedRef = useRef(false)    // напрямок уже визначено для цього дотику
  const refreshingRef = useRef(false)
  refreshingRef.current = refreshing

  // Поточний pull у ref — touchend замикає актуальне значення без re-bind.
  const pullRef = useRef(0)
  pullRef.current = pull

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      // Старт лише від самого верху і не під час активного оновлення.
      if (refreshingRef.current || el!.scrollTop > 0) return
      const t = e.touches[0]
      startYRef.current = t.clientY
      startXRef.current = t.clientX
      activeRef.current = false
      decidedRef.current = false
      // Палець знову на склі — вимикаємо пружину, щоб тяга йшла 1:1, без лагу.
      setReleasing(false)
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return
      const t = e.touches[0]
      const dy = t.clientY - startYRef.current
      const dx = t.clientX - startXRef.current

      // Визначаємо напрямок один раз: тягнемо вниз і вертикаль домінує.
      if (!decidedRef.current) {
        if (dy <= 0) return                       // вгору/вбік — не наш жест
        if (Math.abs(dy) < 6) return              // ще замало руху для рішення
        decidedRef.current = true
        activeRef.current = Math.abs(dy) > Math.abs(dx) && el!.scrollTop <= 0
      }
      if (!activeRef.current) return

      // Гасимо нативний bounce/скрол поки тягнемо індикатор.
      if (e.cancelable) e.preventDefault()
      setPull(resist(dy))
    }

    async function onTouchEnd() {
      if (!activeRef.current) return
      activeRef.current = false
      // Пружимо назад/у позицію спінера через CSS-transition.
      setReleasing(true)
      const reached = pullRef.current >= THRESHOLD
      if (reached) {
        setRefreshing(true)
        setPull(THRESHOLD)
        try {
          await onRefreshRef.current()
        } finally {
          setRefreshing(false)
          setPull(0)
        }
      } else {
        setPull(0)
      }
    }

    // touchmove має бути passive:false, щоб preventDefault працював на iOS.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef])

  return { pull, refreshing, releasing }
}
