const { chromium } = require('playwright');
const fs = require('fs');
exports.record = async (name, persona, fn, opts = {}) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    recordVideo: { dir: `clips/${name}`, size: { width: 780, height: 1688 } },
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => {
    window.addEventListener('pointerdown', (e) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${e.clientX - 26}px;top:${e.clientY - 26}px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.7);pointer-events:none;z-index:99999;transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.4);opacity:1`;
      document.body.appendChild(d);
      requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = 'scale(1.25)'; d.style.opacity = '0'; }));
      setTimeout(() => d.remove(), 600);
    }, true);
  });
  const ctl = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    btn: (name, o = {}) => page.getByRole('button', { name, ...o }).first(),
    key: (k) => page.locator(`[aria-label="${k}"]`).first(),
    show: async (l) => console.log(`[${name}] ${l}`, new URL(page.url()).pathname, JSON.stringify(await page.getByRole('button').allInnerTexts())),
    go: async (path) => { await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path); },
  };
  await page.goto(`http://localhost:8081/?as=${persona}`);
  try { await fn(ctl); } catch (e) { console.log('ERR', name, String(e).slice(0, 300)); }
  await ctl.wait(opts.tail ?? 1200);
  const v = page.video();
  await ctx.close(); await browser.close();
  const out = `clips/${name}.webm`;
  fs.copyFileSync(await v.path(), out);
  console.log(name, 'saved', out, errs.join('|').slice(0, 200) || 'no errors');
};
