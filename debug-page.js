const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ukjdxezpfbhxytcnrggg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramR4ZXpwZmJoeHl0Y25yZ2dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyMDIyNiwiZXhwIjoyMDkxNTk2MjI2fQ.JmbeVx3cDnvhxNM2_VoLk_MS8Ev019HNINN_sFtf61c';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Login
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Test@123456';

    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    await page.goto('http://localhost:3000/login');
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);
    await page.locator('button:has-text("Увійти")').click();
    await page.waitForNavigation();

    // Go to /clients
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get page content
    const html = await page.content();
    console.log('=== Page HTML (first 2000 chars) ===');
    console.log(html.substring(0, 2000));
    
    console.log('\n=== Looking for buttons ===');
    const buttons = await page.locator('button').allTextContents();
    console.log('All buttons:', buttons.join(' | '));

    console.log('\n=== Looking for text "Клієнт" ===');
    const hasClient = await page.locator('text=/клієнт/i').isVisible().catch(() => false);
    console.log('Found "клієнт":', hasClient);

    console.log('\n=== All visible text on page ===');
    const text = await page.locator('body').innerText();
    console.log(text.substring(0, 500));
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
})();
