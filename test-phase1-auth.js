const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('=== Checking login ===');
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    const loginForm = await page.locator('text=Увійти').isVisible().catch(() => false);
    console.log('Login form visible:', loginForm);

    if (loginForm) {
      console.log('⚠ App requires authentication. Test skipped.');
    } else {
      console.log('✓ User is authenticated');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
})();
