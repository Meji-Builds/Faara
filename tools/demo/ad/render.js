// Renders the ad timeline (index.html) frame by frame.
//   node tools/demo/ad/render.js                  -> clips/ad/ad-video.mp4 (silent, 30 fps)
//   node tools/demo/ad/render.js --stills 1,5.5   -> clips/ad/still-<t>.png
// Needs the repo served over HTTP on :8090 (CSS masks don't load from file://).
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const FPS = 30;
const URL = 'http://localhost:8090/tools/demo/ad/index.html';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e)));
  await page.goto(URL);
  await page.evaluate(() => window.ready);
  const si = process.argv.indexOf('--stills');
  if (si > 0) {
    for (const t of process.argv[si + 1].split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t);
      await page.screenshot({ path: `clips/ad/still-${t}.png` });
    }
    await browser.close();
    return;
  }
  const dur = await page.evaluate(() => window.DURATION);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'clips/ad/ad-video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log('clips/ad/ad-video.mp4');
})();
