/**
 * Статичні дані студії (конфіг, не доменні дані з БД). Вживає кабінет клієнта:
 * шапка, екран деталей запису (карта + контакти). Координати — з Google Maps
 * (короткий лінк mapsUrl резолвиться у точку lat/lng).
 */
export const STUDIO = {
  name: 'SEKTA',
  address: 'Дніпро, Будинок Побуту, вул. Короленко 3',
  telegram: 'Sekta_studio', // t.me/Sekta_studio (повідомлення студії)
  instagram: 'sekta.ua', // instagram.com/sekta.ua
  mapsUrl: 'https://maps.app.goo.gl/kMHR4BKexAm3gXUW6', // короткий лінк — відкрити в Maps
  lat: 48.4645137,
  lng: 35.0435998,
} as const

export const STUDIO_TELEGRAM_URL = `https://t.me/${STUDIO.telegram}`
export const STUDIO_INSTAGRAM_URL = `https://www.instagram.com/${STUDIO.instagram}`
