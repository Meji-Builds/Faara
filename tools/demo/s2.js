// Scene 3: Tolu's phone on Home catches the hum, gets picked, matches shapes, is paid.
// pick/settle are tuned so Tolu's screens land with Ada's (see clips/send-hum.json).
const { record } = require('./lib');
const pick = process.env.PICK || 7600; const settle = process.env.SETTLE || 6000;
record('receive-hum', `tolu&pick=${pick}&settle=${settle}`, async (c) => {
  await c.wait(5000); c.mark('home');
  await c.go('/receive?token=K7Q2M9X4TB&channel=sound&distanceCm=22'); c.mark('caught');
  await c.vis(c.page.getByText('You were picked')).waitFor({ timeout: 60000 }); c.mark('shapes');
  await c.vis(c.page.getByText('Hummed.')).waitFor({ timeout: 60000 }); c.mark('hummed');
  await c.wait(4000);
}, { tail: 600 });
