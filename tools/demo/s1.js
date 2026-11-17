// Scene 2: Ada hums ₦5,000 for suya and picks Tolu, the closest phone.
const { record } = require('./lib');
record('send-hum', 'ada', async (c) => {
  await c.wait(3000);
  c.mark('home');
  await c.btn('Hum', { exact: true }).click(); await c.wait(1300);
  for (const d of ['5', '0', '0', '0']) { await c.key(d).click(); await c.wait(330); }
  await c.wait(500);
  await c.page.getByPlaceholder(/Suya/).click();
  await c.page.keyboard.type('Suya and drinks', { delay: 70 }); await c.wait(700);
  await c.btn(/Hum it/).click(); c.mark('humming');
  await c.vis(c.page.getByText(/phones caught/)).waitFor(); c.mark('caught');
  await c.wait(2600);
  await c.btn(/phones caught/).click(); c.mark('choose'); await c.wait(3000);
  await c.vis(c.page.getByText('Tolu Adebayo')).click(); await c.wait(1400);
  await c.btn(/Pay Tolu/).click(); c.mark('shapes'); await c.wait(3800);
  await c.btn(/Confirm with fingerprint/).click(); c.mark('confirm');
  await c.vis(c.page.getByText('Hummed.')).waitFor(); c.mark('hummed');
  await c.wait(3500);
}, { tail: 600 });
