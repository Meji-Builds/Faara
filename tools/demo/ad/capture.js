// Captures crisp (3x) stills of every app state the ad uses into clips/ad/shots/.
// Needs the demo build served on :8081 (see ../README.md).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'clips/ad/shots';
fs.mkdirSync(OUT, { recursive: true });

async function session(persona, fn) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })).newPage();
  const vis = (l) => l.locator('visible=true').first();
  const c = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    btn: (name, o = {}) => vis(page.getByRole('button', { name, ...o })),
    text: (t) => vis(page.getByText(t)),
    shot: async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); },
    go: (p) => page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, p),
  };
  await page.goto(`http://localhost:8081/?as=${persona}`);
  await c.wait(4500);
  try { await fn(c); } catch (e) { console.log('ERR', persona, String(e).slice(0, 300)); await c.shot(`zz-err-${persona}`); }
  await browser.close();
}

(async () => {
  await Promise.all([
    session('ada', async (c) => {
      await c.shot('ada-home');
      await c.btn('Hum', { exact: true }).click(); await c.wait(1200);
      for (const d of ['5', '0', '0', '0']) await c.page.locator(`[aria-label="${d}"]`).first().click();
      await c.page.getByPlaceholder(/Suya/).fill('Suya and drinks'); await c.wait(600);
      await c.shot('ada-amount');
      await c.btn(/Hum it/).click(); await c.wait(2500);
      await c.shot('ada-humming');
      await c.text(/phones caught/).waitFor(); await c.wait(1200);
      await c.shot('ada-caught');
      await c.btn(/phones caught/).click(); await c.wait(2500);
      await c.text('Tolu Adebayo').click(); await c.wait(1200);
      await c.shot('ada-choose');
      await c.btn(/Pay Tolu/).click(); await c.wait(2500);
      await c.shot('ada-shapes');
      await c.btn(/Confirm with fingerprint/).click();
      await c.text('Hummed.').waitFor(); await c.wait(2600);
      await c.shot('ada-hummed');
    }),
    session('tolu&pick=900&settle=1500', async (c) => {
      await c.shot('tolu-home');
      await c.go('/receive?token=K7Q2M9X4TB&channel=sound&distanceCm=22');
      await c.text('You were picked').waitFor(); await c.wait(1200);
      await c.shot('tolu-picked');
      await c.text('Hummed.').waitFor(); await c.wait(2600);
      await c.shot('tolu-hummed');
    }),
    session('ada', async (c) => {
      await c.btn('Send', { exact: true }).click(); await c.wait(1000);
      await c.page.getByPlaceholder('Username or phone number').fill('tolu.a');
      await c.text('@tolu.a').waitFor();
      await c.page.getByPlaceholder('5,000').fill('12000'); await c.page.getByPlaceholder('Rent share').fill('Rent share');
      await c.wait(800); await c.shot('send-user');
      await c.page.getByPlaceholder('Username or phone number').fill('805 765 4321'); await c.wait(1500);
      await c.shot('send-number');
      await c.btn(/Review/).click(); await c.wait(1500); await c.shot('send-review');
      await c.btn(/Confirm with fingerprint/).click(); await c.text('Sent.').waitFor(); await c.wait(2600);
      await c.shot('send-sent');
      await c.btn('Receipt').click(); await c.wait(2500); await c.shot('receipt');
    }),
    session('ada', async (c) => {
      await c.btn('Add money', { exact: true }).click(); await c.wait(1200);
      await c.btn('₦10,000').click(); await c.wait(800); await c.shot('add');
      await c.btn(/Add ₦/).click(); await c.text(/added$/).waitFor(); await c.wait(1500); await c.shot('add-done');
      await c.btn('Done').click(); await c.wait(2000); await c.shot('ada-home-after');
      await c.go('/profile'); await c.wait(2000); await c.shot('profile');
    }),
  ]);
})();
