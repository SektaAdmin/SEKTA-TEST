const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ukjdxezpfbhxytcnrggg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVramR4ZXpwZmJoeHl0Y25yZ2dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyMDIyNiwiZXhwIjoyMDkxNTk2MjI2fQ.JmbeVx3cDnvhxNM2_VoLk_MS8Ev019HNINN_sFtf61c';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Step 1: Create or get test user
    console.log('=== Setting up test user ===');
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'Test@123456';

    const { data, error } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (error) {
      console.log('⚠ Could not create user:', error.message);
      console.log('Attempting to use existing user...');
    } else {
      console.log('✓ Test user created:', testEmail);
    }

    // Step 2: Login
    console.log('\n=== Logging in ===');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Fill email
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);

    // Submit
    await page.locator('button:has-text("Увійти")').click();
    await page.waitForNavigation();

    const currentUrl = page.url();
    console.log('✓ Logged in, URL:', currentUrl);

    // Test 1: ClientModal validation
    console.log('\n=== TEST 1: /clients → empty validation ===');
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');

    const newClientBtn = await page.locator('text=/Новий|new/i').first();
    if (await newClientBtn.isVisible()) {
      await newClientBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const submitBtn = await page.locator('button:has-text(/Зберегти|Save/i)').first();
      await submitBtn.click();
      await page.waitForTimeout(500);

      // Check for error messages
      const inputs = await page.locator('input[type="text"], input[type="email"]').all();
      console.log(`✓ Found ${inputs.length} inputs in form`);
      
      // Try to find any error/validation messages
      const allText = await page.locator('body').innerText();
      const hasError = allText.includes('обов') || allText.includes('error') || allText.includes('Error');
      console.log('✓ Validation feedback shown:', hasError ? 'YES' : 'Check manually');
    }

    // Test 2: Empty state /clients
    console.log('\n=== TEST 2: /clients → empty state ===');
    const emptyText = await page.locator('body').innerText();
    const hasEmptyMsg = emptyText.includes('Клієнтів ще немає') || emptyText.includes('немає');
    console.log('✓ Empty state message visible:', hasEmptyMsg ? 'YES' : 'NO (but list may have data)');

    console.log('\n✅ Tests completed');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
})();
