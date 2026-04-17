const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log("🔄 Экспортирую схему БД...\n");

  try {
    const tableNames = ["clients", "tickets", "trainers", "sales"];
    const tables = {};

    for (const tableName of tableNames) {
      const { data, error } = await supabase
        .from(tableName)
        .select()
        .limit(1);

      if (!error && data !== null) {
        console.log(`✓ ${tableName} (${Object.keys(data[0] || {}).length} cols)`);
        tables[tableName] = Object.keys(data[0] || {});
      } else {
        console.log(`✗ ${tableName} (not found)`);
      }
    }

    const now = new Date().toISOString().split("T")[0];
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));

    let md = `# sekta-crm — Supabase CRM

## 📋 Проект
Фитнес/танцевальная студия

- **Stack**: Next.js ${pkg.dependencies.next?.replace("^", "")} + React 18
- **Backend**: Supabase PostgreSQL
- **Last Updated**: ${now}

---

## 🗄️ Database

### Таблицы

#### \`clients\` - Клиенты
Колонки: ${tables.clients?.join(", ") || "id, first_name, last_name, phone, instagram_username, balance, created_at, updated_at"}

#### \`tickets\` - Тарифы
Колонки: ${tables.tickets?.join(", ") || "id, name, ticket_type, sessions, price, is_active, created_at, updated_at"}

#### \`trainers\` - Тренеры
Колонки: ${tables.trainers?.join(", ") || "id, name, is_active, instagram_username, telegram_username, created_at, updated_at"}

#### \`sales\` - Продажи
Колонки: ${tables.sales?.join(", ") || "id, client_id, ticket_id, trainer_id, ticket_name, ticket_price, sessions, price_paid, payment_method, notes, created_at, updated_at"}

---

## 🔐 Security
✓ RLS enabled
✓ Auth via Supabase

---

## 📦 Dependencies
${Object.entries(pkg.dependencies).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

---

**Exported**: ${now}
`;

    fs.writeFileSync("CLAUDE.md", md);
    console.log("\n✅ CLAUDE.md updated!");

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
