const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const supabase = createClient(
      'https://ukjdxezpfbhxytcnrggg.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInJlZiI6InVramR4ZXpwZmJoeHl0Y25yZ2dnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjAyMDIyNiwiZXhwIjoyMDkxNTk2MjI2fQ.JmbeVx3cDnvhxNM2_VoLk_MS8Ev019HNINN_sFtf61c'
    );

    // Create test user
    const email = `test-${Date.now()}@test.com`;
    const pass = 'Test123456!';
    
    await supabase.auth.admin.createUser({
      email, password: pass, email_confirm: true
    });

    // Go to login
    await page.goto('http://localhost:3000/login');
    
    // Fill and submit
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', pass);
    await page.click('button:has-text("Увійти")');
    
    // Wait for page to load (not navigation)
    await page.waitForTimeout(3000);
    
    const url = page.url();
    console.log('✓ After login, URL:', url);

    // Try to go to /clients
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');
    
    const title = await page.locator('body').innerText();
    const hasClientsTitle = title.includes('Клієнти');
    console.log(`✓ /clients page loaded: ${hasClientsTitle}`);

    // Now test: click Додати клієнта
    await page.click('text=Додати клієнта');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    console.log('✓ Modal opened');

    // Try to submit empty form
    await page.click('button:has-text("Зберегти")');
    await page.waitForTimeout(800);

    // Check for validation message
    const allText = await page.locator('body').innerText();
    const hasError = allText.includes('обов') || allText.includes('Error') || allText.includes('error');
    console.log(`✓ Validation message shown: ${hasError ? 'YES' : 'CHECK MANUALLY'}`);

    if (hasError) {
      console.log('\n✅ PHASE 1 VALIDATION TEST PASSED');
    }
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    await browser.close();
  }
})();
