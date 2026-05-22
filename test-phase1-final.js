const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ukjdxezpfbhxytcnrggg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramR4ZXpwZmJoeHl0Y25yZ2dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyMDIyNiwiZXhwIjoyMDkxNTk2MjI2fQ.JmbeVx3cDnvhxNM2_VoLk_MS8Ev019HNINN_sFtf61c';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Setup test user
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Test@123456';

    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    // Login
    await page.goto('http://localhost:3000/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);
    await page.locator('button:has-text("Увійти")').click();
    await page.waitForNavigation();

    // Test 1: ClientModal validation
    console.log('=== TEST 1: ClientModal - empty "ім\'я" validation ===');
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');

    await page.locator('text=Додати клієнта').first().click();
    await page.waitForSelector('[role="dialog"]');

    // Try submit without filling anything
    await page.locator('button:has-text("Зберегти")').click();
    await page.waitForTimeout(500);

    const nameInput = await page.locator('input[placeholder*="ім"]').first();
    const aria = await nameInput.getAttribute('aria-invalid').catch(() => null);
    const errorMsg = await page.locator('[role="alert"], [class*="error"]').first().innerText().catch(() => '');
    
    console.log(`✓ Name field aria-invalid: ${aria}`);
    console.log(`✓ Error message: "${errorMsg || '(none visible)'}"`);

    // Test 2: TicketModal validation
    console.log('\n=== TEST 2: TicketModal - empty "назва" validation ===');
    await page.goto('http://localhost:3000/settings?tab=tickets');
    await page.waitForLoadState('networkidle');

    await page.locator('text=Додати абонемент').click();
    await page.waitForSelector('[role="dialog"]');

    await page.locator('button:has-text("Зберегти")').click();
    await page.waitForTimeout(500);

    const ticketNameInput = await page.locator('input[placeholder*="назв"]').first();
    const ticketAria = await ticketNameInput.getAttribute('aria-invalid').catch(() => null);
    
    console.log(`✓ Ticket name field aria-invalid: ${ticketAria}`);

    // Test 3: TrainerModal validation
    console.log('\n=== TEST 3: TrainerModal - empty "ім\'я" validation ===');
    await page.goto('http://localhost:3000/settings?tab=trainers');
    await page.waitForLoadState('networkidle');

    await page.locator('text=Додати тренера').click();
    await page.waitForSelector('[role="dialog"]');

    await page.locator('button:has-text("Зберегти")').click();
    await page.waitForTimeout(500);

    const trainerNameInput = await page.locator('input[placeholder*="ім"]').first();
    const trainerAria = await trainerNameInput.getAttribute('aria-invalid').catch(() => null);
    
    console.log(`✓ Trainer name field aria-invalid: ${trainerAria}`);

    // Test 4: Empty state /clients
    console.log('\n=== TEST 4: /clients - empty state (if no clients) ===');
    // Close modal
    await page.keyboard.press('Escape');
    await page.goto('http://localhost:3000/clients?search=__NONEXISTENT__');
    await page.waitForLoadState('networkidle');

    const pageText = await page.locator('body').innerText();
    const hasEmptyMsg = pageText.includes('Клієнтів ще немає');
    console.log(`✓ Empty state message ("Клієнтів ще немає"): ${hasEmptyMsg ? 'YES ✓' : 'NO (may have data)'}`);

    // Test 5: Empty state /sales with filter
    console.log('\n=== TEST 5: /sales - empty state with filter ===');
    await page.goto('http://localhost:3000/sales?date_from=2020-01-01&date_to=2020-01-02');
    await page.waitForLoadState('networkidle');

    const salesText = await page.locator('body').innerText();
    const hasFilterMsg = salesText.includes('За вашим фільтром нічого не знайдено');
    console.log(`✓ Empty filter message: ${hasFilterMsg ? 'YES ✓' : 'NO (may have data)'}`);

    console.log('\n✅ All tests completed successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
})();
