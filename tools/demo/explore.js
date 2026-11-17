const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const show = async (label) => { await page.waitForTimeout(700); console.log('--', label, new URL(page.url()).pathname, JSON.stringify(await page.getByRole('button').allInnerTexts())); };
  await page.goto('http://localhost:8081/?as=ada'); await page.waitForTimeout(4500);
  await page.getByRole('button', { name: 'Hum', exact: true }).first().click(); await show('amount');
  for (const d of ['5','0','0','0']) await page.locator('[aria-label="'+d+'"]').first().click();
  await page.getByPlaceholder(/Suya/).fill('Suya and drinks'); await show('amount typed');
  await page.screenshot({ path: 'ex-amount.png' });
  await page.getByRole('button', { name: /Hum it/ }).click(); await page.waitForTimeout(6500); await show('humming');
  await page.screenshot({ path: 'ex-humming.png' });
  console.log(errs.join('\n') || 'no errors');
  await browser.close();
})();
