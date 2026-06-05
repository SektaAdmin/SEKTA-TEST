const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  // Кешуємо лише кабінет клієнта (/client/*) — адмін-панель PWA не потрібна
  scope: '/client',
  // Стратегія: NetworkFirst для HTML (завжди свіжі дані), CacheFirst для статики
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  // SW реєструється лише на /client/*
  register: true,
  skipWaiting: true,
  workboxOptions: {
    // HTML-сторінки: спочатку мережа, fallback кеш (до 10 сторінок, 24 год)
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/[^/]+\/client(\/.*)?$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'sekta-client-pages',
          expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
          networkTimeoutSeconds: 3,
        },
      },
      {
        // JS/CSS/шрифти: CacheFirst — майже не змінюються між деплоями
        urlPattern: /\/_next\/static\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'sekta-static',
          expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        // Google Fonts / Nunito Sans
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'sekta-fonts',
          expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withPWA(nextConfig)
