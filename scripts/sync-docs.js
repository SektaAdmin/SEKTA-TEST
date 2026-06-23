#!/usr/bin/env node

/**
 * Синхронізує живі документи (docs/*.md + CLAUDE.md) з реальним станом коду/схеми/прод-БД.
 *
 * НЕ детермінований генератор: запускає Claude Code (headless `claude -p`) з промптом-аудитором
 * scripts/sync-docs.prompt.md. Claude читає код, grep'ає виклики, через Supabase MCP робить SELECT
 * по проду й ВИПРАВЛЯЄ розходження прямо у файлах, тримаючи телеграфний стиль. Нічого не комітить.
 *
 * Після прогону — перевір `git diff` і закомить сам (правило в docs/CONTRIBUTING.md).
 *
 * Потрібно:
 *   - встановлений `claude` CLI (Claude Code) у PATH
 *   - налаштований Supabase MCP (read-only), щоб промпт міг звіряти прод-стан
 *
 * Запуск: npm run sync:docs
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const PROMPT = path.join(__dirname, 'sync-docs.prompt.md')

if (!fs.existsSync(PROMPT)) {
  console.error(`❌ Немає промпта: ${path.relative(ROOT, PROMPT)}`)
  process.exit(1)
}

// claude у PATH?
const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' })
if (probe.error || probe.status !== 0) {
  console.error('❌ Не знайдено `claude` CLI (Claude Code) у PATH.')
  console.error('   Встанови: https://docs.claude.com/claude-code  і повтори.')
  process.exit(1)
}

const prompt = fs.readFileSync(PROMPT, 'utf8')

console.log('🔄 Синхронізую docs зі станом коду/схеми (Claude Code, read-only по проду)...')
console.log('   Це може зайняти кілька хвилин. Правки підуть прямо у файли — перевір `git diff`.\n')

// Headless-прогін. --permission-mode acceptEdits: дозволяємо Edit у файлах docs,
// але промпт сам забороняє записи в БД / коміти / пуш.
const res = spawnSync(
  'claude',
  ['-p', prompt, '--permission-mode', 'acceptEdits'],
  { cwd: ROOT, stdio: 'inherit' }
)

if (res.error) {
  console.error('\n❌ Помилка запуску claude:', res.error.message)
  process.exit(1)
}
if (res.status !== 0) {
  console.error(`\n❌ claude завершився з кодом ${res.status}.`)
  process.exit(res.status || 1)
}

console.log('\n✅ Готово. Перевір зміни: git diff -- docs CLAUDE.md')
