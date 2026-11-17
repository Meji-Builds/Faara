// Scene 8: Ada's Faara code; Tolu opens the pay link and lands on Send, already addressed.
const { record } = require('./lib');
record('faara-code', 'ada', async (c) => {
  await c.wait(2500);
  await c.page.getByRole('tab', { name: /Profile/ }).or(c.vis(c.page.getByText('Profile', { exact: true }))).first().click();
  c.mark('profile'); await c.wait(3500);
});
record('pay-link', 'tolu', async (c) => {
  await c.wait(4800);
  await c.go('/pay/ada.ok'); c.mark('link'); await c.wait(3500);
});
