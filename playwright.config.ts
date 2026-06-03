import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// Креди тестового юзера + Supabase env читаються з .env.local (НЕ комітити).
// Потрібні: E2E_EMAIL, E2E_PASSWORD (додає користувач вручну).
loadEnv({ path: '.env.local' })

const BASE_URL = 'http://localhost:3000'
const AUTH_FILE = 'e2e/.auth/state.json'

export default defineConfig({
  testDir: './e2e',
  // global-setup логіниться один раз і зберігає cookies у AUTH_FILE
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    storageState: AUTH_FILE,   // усі тести стартують залогіненими
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Піднімає твій dev-сервер автоматично; reuse якщо вже запущений (щоб не воювати з .next, [[feedback_build_dev_next_cache]])
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
