// Scene 5: add money (card or bank transfer on Paystack's page); the balance goes up.
const { record } = require('./lib');
record('add-money', 'ada', async (c) => {
  await c.wait(2500); c.mark('home');
  await c.btn('Add money', { exact: true }).click(); c.mark('add'); await c.wait(1500);
  await c.btn('₦10,000').click(); await c.wait(1200);
  await c.btn(/Add ₦/).click(); c.mark('pay');
  await c.vis(c.page.getByText(/added$/)).waitFor(); c.mark('added');
  await c.wait(1500);
  await c.btn('Done').click(); c.mark('home2'); await c.wait(3000);
});
