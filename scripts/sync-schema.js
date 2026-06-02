#!/usr/bin/env node

/**
 * Регенерує types/database.types.ts з продакшн-схеми Supabase через
 * Management API (той самий генератор, що й Supabase MCP / CLI).
 *
 * Потрібно:
 *   - NEXT_PUBLIC_SUPABASE_URL у .env.local (звідки беремо project-ref)
 *   - SUPABASE_ACCESS_TOKEN в оточенні (НЕ комітимо; особистий токен з
 *     https://supabase.com/dashboard/account/tokens)
 *
 * Запуск: npm run sync:schema
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const token = process.env.SUPABASE_ACCESS_TOKEN

if (!url) {
  console.error('❌ Немає NEXT_PUBLIC_SUPABASE_URL у .env.local')
  process.exit(1)
}
if (!token) {
  console.error('❌ Немає SUPABASE_ACCESS_TOKEN в оточенні.')
  console.error('   Створи особистий токен: https://supabase.com/dashboard/account/tokens')
  console.error('   і експортуй: export SUPABASE_ACCESS_TOKEN=sbp_...')
  process.exit(1)
}

// https://<ref>.supabase.co → <ref>
const ref = url.split('//')[1]?.split('.')[0]
if (!ref) {
  console.error(`❌ Не вдалося витягти project-ref з URL: ${url}`)
  process.exit(1)
}

const OUT = path.join(__dirname, '..', 'types', 'database.types.ts')
const API = `https://api.supabase.com/v1/projects/${ref}/types/typescript`

;(async () => {
  console.log(`🔄 Регенерую типи зі схеми (project ${ref})...`)

  const res = await fetch(API, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`❌ Management API ${res.status}: ${body.slice(0, 300)}`)
    process.exit(1)
  }

  const json = await res.json()
  const types = json.types
  if (typeof types !== 'string' || !types.includes('export type Database')) {
    console.error('❌ Несподівана відповідь API (немає поля "types").')
    process.exit(1)
  }

  fs.writeFileSync(OUT, types.endsWith('\n') ? types : types + '\n')
  console.log(`✅ Записано ${path.relative(process.cwd(), OUT)} (${types.length} символів)`)
})().catch((err) => {
  console.error('❌ Помилка:', err.message)
  process.exit(1)
})
