const { record } = require('./lib');
record('send-hum', 'ada', async (c) => {
  await c.wait(3500);
  await c.btn('Hum', { exact: true }).click(); await c.wait(1300);
  for (const d of ['5', '0', '0', '0']) { await c.key(d).click(); await c.wait(330); }
  await c.wait(500);
  await c.page.getByPlaceholder(/Suya/).click();
  await c.page.keyboard.type('Suya and drinks', { delay: 70 }); await c.wait(700);
  await c.btn(/Hum it/).click(); await c.wait(7200);
  await c.btn(/phones caught/).click(); await c.wait(3200);
  { const b = await c.page.getByText('Tolu Adebayo').first().boundingBox(); await c.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); } await c.wait(1400);
  await c.btn('Choose who gets paid').click(); await c.wait(3600);
  await c.show('confirm');
  await c.btn(/Confirm with fingerprint/).click(); await c.wait(900);
  await c.show('paying');
  await c.wait(3600);
  await c.show('success');
  await c.page.screenshot({ path: 'clips/send-success.png' });
  await c.wait(2500);
});
