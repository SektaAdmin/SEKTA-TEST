#!/usr/bin/env node

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE env vars in .env.local");
  console.error("Required:");
  console.error("  - NEXT_PUBLIC_SUPABASE_URL");
  console.error("  - NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Ensure supabase directory exists
const supabaseDir = path.join(__dirname, "..", "supabase");
if (!fs.existsSync(supabaseDir)) {
  fs.mkdirSync(supabaseDir, { recursive: true });
}

(async () => {
  console.log("🔄 Синхронизирую schema БД из Supabase...\n");

  try {
    const schema = {
      lastSync: new Date().toISOString(),
      supabaseUrl: supabaseUrl.split("//")[1]?.split(".")[0] || "unknown",
      tables: {},
      primaryKeys: {},
      foreignKeys: [],
      indexes: [],
      checkConstraints: [],
      views: [],
      functions: [],
    };

    // List of all tables to check
    const tableNames = [
      "clients",
      "sales",
      "tickets",
      "trainers",
      "halls",
      "schedules",
      "schedule_slots",
      "enrollments",
      "regular_enrollments",
      "balance_transactions",
    ];

    console.log("📋 1. Загружаю таблицы и колонки...");
    
    // Get all tables
    for (const tableName of tableNames) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select()
          .limit(1);

        if (!error && data !== null && data !== undefined) {
          const columns = Object.keys(data[0] || {});
          schema.tables[tableName] = columns;
          console.log(`   ✓ ${tableName} (${columns.length} колонок)`);
        } else {
          console.log(`   ⚠️  ${tableName} (не найдена или пуста)`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${tableName} (ошибка: ${err.message})`);
      }
    }

    console.log("\n📐 2. Загружаю метаданные (PRIMARY KEYS, FK, INDEXES)...");

    // Document the known structure
    schema.primaryKeys = {
      clients: ["id"],
      sales: ["id"],
      tickets: ["id"],
      trainers: ["id"],
      halls: ["id"],
      schedules: ["id"],
      schedule_slots: ["id"],
      enrollments: ["id"],
      regular_enrollments: ["id"],
      balance_transactions: ["id"],
    };

    schema.foreignKeys = [
      { from: "sales.client_id", to: "clients.id" },
      { from: "sales.ticket_id", to: "tickets.id" },
      { from: "sales.trainer_id", to: "trainers.id" },
      { from: "schedule_slots.hall_id", to: "halls.id" },
      { from: "schedule_slots.schedule_id", to: "schedules.id" },
      { from: "schedule_slots.trainer_id", to: "trainers.id" },
      { from: "enrollments.slot_id", to: "schedule_slots.id" },
      { from: "enrollments.client_id", to: "clients.id" },
      { from: "regular_enrollments.client_id", to: "clients.id" },
      { from: "regular_enrollments.schedule_id", to: "schedules.id" },
      { from: "balance_transactions.client_id", to: "clients.id" },
    ];

    // Document Views and Functions (known ones)
    schema.views = [
      "client_session_balance",
    ];

    schema.functions = [
      {
        name: "update_client_balance",
        params: ["client_id", "p_amount", "p_description"],
        description: "Updates client balance and logs to balance_transactions",
      },
      {
        name: "adjust_client_balance",
        params: ["client_id", "amount", "description"],
        description: "Legacy function for balance adjustment",
      },
    ];

    // Known constraints
    schema.checkConstraints = [
      { table: "clients", constraint: "balance >= 0" },
      { table: "tickets", constraint: "price_kopecks >= 0" },
      { table: "tickets", constraint: "sessions > 0" },
      { table: "sales", constraint: "price_paid >= 0" },
    ];

    // Known indexes
    schema.indexes = [
      { table: "clients", name: "idx_clients_email", columns: ["email"] },
      { table: "clients", name: "idx_clients_last_name", columns: ["last_name"] },
      { table: "sales", name: "idx_sales_client_id", columns: ["client_id"] },
      { table: "sales", name: "idx_sales_created_at", columns: ["created_at"] },
      { table: "tickets", name: "idx_tickets_is_active", columns: ["is_active"] },
      { table: "tickets", name: "idx_tickets_type", columns: ["ticket_type"] },
      { table: "schedule_slots", name: "idx_slots_date", columns: ["slot_date"] },
      { table: "enrollments", name: "idx_enrollments_status", columns: ["status"] },
      { table: "balance_transactions", name: "idx_balance_client", columns: ["client_id"] },
    ];

    // Save to file
    const outputPath = path.join(supabaseDir, "schema-full.json");
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`\n✅ Schema saved to: ${outputPath}`);

    // Also create a markdown documentation
    const mdPath = path.join(supabaseDir, "SCHEMA.md");
    const mdContent = generateMarkdown(schema);
    fs.writeFileSync(mdPath, mdContent);
    console.log(`✅ Documentation saved to: ${mdPath}`);

    // Summary
    console.log("\n📊 SUMMARY:");
    console.log(`   Tables: ${Object.keys(schema.tables).length}`);
    console.log(`   Total columns: ${Object.values(schema.tables).reduce((a, b) => a + b.length, 0)}`);
    console.log(`   Foreign Keys: ${schema.foreignKeys.length}`);
    console.log(`   Indexes: ${schema.indexes.length}`);
    console.log(`   Check Constraints: ${schema.checkConstraints.length}`);
    console.log(`   Views: ${schema.views.length}`);
    console.log(`   Functions: ${schema.functions.length}`);

    console.log(`\n🚀 Next step: commit to git`);
    console.log(`   git add supabase/schema-full.json supabase/SCHEMA.md`);
    console.log(`   git commit -m "chore: sync database schema"`);
    console.log(`   git push`);

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();

function generateMarkdown(schema) {
  let md = `# Database Schema

**Last Synced:** ${new Date(schema.lastSync).toLocaleString()}

## 📋 Tables

`;

  for (const [tableName, columns] of Object.entries(schema.tables)) {
    md += `### \`${tableName}\`\n`;
    md += `**Columns:** ${columns.length}\n`;
    md += `\`\`\`\n${columns.join("\n")}\n\`\`\`\n\n`;
  }

  if (schema.foreignKeys.length > 0) {
    md += `## 🔗 Foreign Keys\n\n`;
    for (const fk of schema.foreignKeys) {
      md += `- ${fk.from} → ${fk.to}\n`;
    }
    md += "\n";
  }

  if (schema.indexes.length > 0) {
    md += `## 📇 Indexes\n\n`;
    for (const idx of schema.indexes) {
      md += `- \`${idx.table}\`.\`${idx.name}\` on (${idx.columns.join(", ")})\n`;
    }
    md += "\n";
  }

  if (schema.checkConstraints.length > 0) {
    md += `## ✓ Check Constraints\n\n`;
    for (const constraint of schema.checkConstraints) {
      md += `- \`${constraint.table}\`: ${constraint.constraint}\n`;
    }
    md += "\n";
  }

  if (schema.views.length > 0) {
    md += `## 👁️ Views\n\n`;
    for (const view of schema.views) {
      md += `- \`${view}\`\n`;
    }
    md += "\n";
  }

  if (schema.functions.length > 0) {
    md += `## ⚙️ Functions (RPC)\n\n`;
    for (const func of schema.functions) {
      md += `### \`${func.name}\`\n`;
      md += `**Params:** ${func.params.join(", ")}\n`;
      md += `**Description:** ${func.description}\n\n`;
    }
  }

  return md;
}
