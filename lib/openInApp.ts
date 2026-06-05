/**
 * Відкрити нативний застосунок за deep-link'ом (app-URL), із fallback на web-URL
 * у браузері, якщо застосунку немає. Вживають іконки контактів кабінету
 * (Instagram/Telegram) — щоб клік вів одразу в застосунок, а не в браузер.
 *
 * Як працює: ставимо location на app-URL. Якщо застосунок є — система забирає
 * фокус, вкладка йде в `hidden` (visibilitychange/pagehide) → fallback
 * скасовуємо. Якщо за timeout вкладка лишилась видимою — застосунку нема,
 * відкриваємо web-URL. Надійніше за чистий таймер (ловить реальний перехід).
 *
 * На десктопі app-URL зазвичай нічого не робить → одразу спрацює web fallback.
 */
export function openInApp(appUrl: string, webUrl: string, timeout = 1200): void {
  let fellBack = false
  const t = setTimeout(() => {
    if (fellBack) return
    fellBack = true
    cleanup()
    window.location.href = webUrl
  }, timeout)

  function onHide() {
    // Застосунок відкрився (вкладка втратила видимість) — скасовуємо fallback.
    if (document.visibilityState === 'hidden') {
      fellBack = true
      clearTimeout(t)
      cleanup()
    }
  }
  function cleanup() {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
  }

  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)

  window.location.href = appUrl
}
