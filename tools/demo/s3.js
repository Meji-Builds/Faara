// Scene 4: send without being nearby, by Faara number (no leading 0) and by username.
const { record } = require('./lib');
record('send-username', 'ada', async (c) => {
  await c.wait(2500);
  await c.btn('Send', { exact: true }).click(); c.mark('send'); await c.wait(1200);
  const to = c.page.getByPlaceholder('Username or phone number');
  await to.click(); await c.page.keyboard.type('805 765 4321', { delay: 90 }); c.mark('phone');
  await c.vis(c.page.getByText('@tolu.a')).waitFor(); await c.wait(1800);
  await to.fill(''); await c.wait(400);
  await c.page.keyboard.type('tolu.a', { delay: 110 }); c.mark('username');
  await c.vis(c.page.getByText('@tolu.a')).waitFor(); await c.wait(1200);
  await c.page.getByPlaceholder('5,000').click(); await c.page.keyboard.type('12000', { delay: 120 });
  await c.page.getByPlaceholder('Rent share').click(); await c.page.keyboard.type('Rent share', { delay: 70 });
  await c.wait(600);
  await c.btn(/Review/).click(); c.mark('review'); await c.wait(2200);
  await c.btn(/Confirm with fingerprint/).click(); c.mark('confirm');
  await c.vis(c.page.getByText('Sent.')).waitFor(); c.mark('sent'); await c.wait(3200);
  await c.btn('Receipt').click(); c.mark('receipt'); await c.wait(3500);
  await c.page.mouse.wheel(0, 400); await c.wait(1500);
});
