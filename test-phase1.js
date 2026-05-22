const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Test 1: ClientModal validation
    console.log('\n=== TEST 1: /clients → "Новий клієнт" → empty validation ===');
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');

    const newClientBtn = await page.locator('text=Новий клієнт').first();
    if (await newClientBtn.isVisible()) {
      await newClientBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const submitBtn = await page.locator('button:has-text("Зберегти")').first();
      await submitBtn.click();
      await page.waitForTimeout(500);

      const errors = await page.locator('[class*="error"], [role="alert"], [class*="validation"]').allTextContents();
      console.log('✓ Validation errors found:', errors.length > 0 ? 'YES' : 'NO');
      if (errors.length > 0) console.log('  Sample:', errors[0].substring(0, 50));
    } else {
      console.log('⚠ "Новий клієнт" button not found');
    }

    // Test 2: TicketModal validation
    console.log('\n=== TEST 2: /settings?tab=tickets → "Новий абонемент" → empty validation ===');
    await page.goto('http://localhost:3000/settings?tab=tickets');
    await page.waitForLoadState('networkidle');

    const newTicketBtn = await page.locator('text=Новий абонемент').first();
    if (await newTicketBtn.isVisible()) {
      await newTicketBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const submitBtn2 = await page.locator('button:has-text("Зберегти")').first();
      await submitBtn2.click();
      await page.waitForTimeout(500);

      const errors2 = await page.locator('[class*="error"], [role="alert"], [class*="validation"]').allTextContents();
      console.log('✓ Validation errors found:', errors2.length > 0 ? 'YES' : 'NO');
      if (errors2.length > 0) console.log('  Sample:', errors2[0].substring(0, 50));
    } else {
      console.log('⚠ "Новий абонемент" button not found');
    }

    // Test 3: TrainerModal validation
    console.log('\n=== TEST 3: /settings?tab=trainers → "Новий тренер" → empty name ===');
    await page.goto('http://localhost:3000/settings?tab=trainers');
    await page.waitForLoadState('networkidle');

    const newTrainerBtn = await page.locator('text=Новий тренер').first();
    if (await newTrainerBtn.isVisible()) {
      await newTrainerBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const submitBtn3 = await page.locator('button:has-text("Зберегти")').first();
      await submitBtn3.click();
      await page.waitForTimeout(500);

      const errors3 = await page.locator('[class*="error"], [role="alert"], [class*="validation"]').allTextContents();
      console.log('✓ Validation errors found:', errors3.length > 0 ? 'YES' : 'NO');
      if (errors3.length > 0) console.log('  Sample:', errors3[0].substring(0, 50));
    } else {
      console.log('⚠ "Новий тренер" button not found');
    }

    // Test 4: Empty state /clients
    console.log('\n=== TEST 4: /clients → empty state message ===');
    await page.goto('http://localhost:3000/clients');
    await page.waitForLoadState('networkidle');

    const emptyMsg = await page.locator('text=Клієнтів ще немає').isVisible().catch(() => false);
    console.log('✓ Empty state "Клієнтів ще немає" visible:', emptyMsg ? 'YES' : 'NO');

    // Test 5: Empty state /sales
    console.log('\n=== TEST 5: /sales → empty state message ===');
    await page.goto('http://localhost:3000/sales');
    await page.waitForLoadState('networkidle');

    const emptyFilterMsg = await page.locator('text=За вашим фільтром нічого не знайдено').isVisible().catch(() => false);
    const emptyMsg2 = await page.locator('text=Продажів немає').isVisible().catch(() => false);
    console.log('✓ Empty filter/sales message visible:', emptyFilterMsg || emptyMsg2 ? 'YES' : 'NO');

    console.log('\n✅ All tests completed');
  } catch (err) {
    console.error('❌ Test error:', err.message);
  } finally {
    await browser.close();
  }
})();
