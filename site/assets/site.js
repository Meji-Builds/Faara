// Faara website behaviour: the phone menu, the scroll sequence, and the interactive demo.

// Menu: the Faara bars open the links on phones; a link, Escape or a tap outside closes them.
(function () {
  const nav = document.querySelector('.nav');
  const button = nav && nav.querySelector('.menu');
  if (!nav || !button) return;
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  button.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav
    .querySelectorAll('.nav-links a')
    .forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('open') && !nav.contains(event.target)) setOpen(false);
  });
})();

// Scroll sequence: as the section scrolls past, the phones come together, hum and pay.
(function () {
  const track = document.querySelector('.story-track');
  const stage = document.querySelector('.story-stage');
  if (!track || !stage) return;
  const left = stage.querySelector('.s-left');
  const right = stage.querySelector('.s-right');
  const scene = stage.querySelector('.story-scene');
  const dots = [...stage.querySelectorAll('.story-dots i')];
  const bounds = [0.12, 0.34, 0.56, 0.78];
  const clamp = (n) => Math.min(1, Math.max(0, n));
  const ease = (t) => t * t * (3 - 2 * t);
  let queued = false;

  const update = () => {
    queued = false;
    const rect = track.getBoundingClientRect();
    const travel = track.offsetHeight - stage.offsetHeight;
    const progress = clamp(-rect.top / Math.max(1, travel));
    const step = bounds.filter((b) => progress >= b).length;
    stage.dataset.stage = String(step);
    dots.forEach((dot, i) => dot.classList.toggle('on', i <= step));

    // Apart at the start, side by side (just not touching) by the time they hum.
    const together = ease(clamp((progress - 0.04) / 0.28));
    const phoneWidth = left.offsetWidth;
    // Far enough apart to read as two people, never past the edge of the screen.
    const apart = Math.min(scene.offsetWidth / 2 - phoneWidth / 2 - 4, phoneWidth * 1.6);
    const close = phoneWidth / 2 + 6;
    const x = apart + (close - apart) * together;
    const r = 12 - 8 * together;
    left.style.setProperty('--x', `${-x}px`);
    left.style.setProperty('--r', `${-r}deg`);
    right.style.setProperty('--x', `${x}px`);
    right.style.setProperty('--r', `${r}deg`);
  };

  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
})();

// Interactive demo: a simulation only; nothing here talks to Faara.
(function () {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const pay = document.getElementById('pay');
  const offline = document.getElementById('offline');
  const senderStatus = document.getElementById('sender-status');
  const receiverStatus = document.getElementById('receiver-status');
  const receiverAmount = document.getElementById('receiver-amount');
  const stepFour = document.getElementById('step-four');
  const steps = [...document.querySelectorAll('#steps li')];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let running = false;
  let received = 0;

  const activate = (n) =>
    steps.forEach((li) => li.classList.toggle('active', Number(li.dataset.step) <= n));

  offline.addEventListener('change', () => {
    stage.classList.toggle('offline', offline.checked);
    stepFour.textContent = offline.checked
      ? 'Ada approves. Her phone hands over a signed payment that Mama Tolu’s phone checks on the spot. It settles when either phone is back online.'
      : 'Ada approves with her fingerprint or PIN and the money arrives instantly.';
  });

  pay.addEventListener('click', async () => {
    if (running) return;
    running = true;
    pay.disabled = true;
    const noNetwork = offline.checked;
    activate(1);
    senderStatus.textContent = 'Humming';
    receiverStatus.textContent = 'Listening';
    await wait(500);
    activate(2);
    stage.classList.add('humming');
    await wait(1600);
    activate(3);
    senderStatus.textContent = 'Same shapes on both phones';
    receiverStatus.textContent = 'Ada is paying you';
    await wait(1400);
    activate(4);
    stage.classList.remove('humming');
    received += 5000;
    receiverAmount.textContent = `₦${received.toLocaleString('en-NG')}`;
    if (noNetwork) {
      senderStatus.innerHTML = '<span class="done">Paid offline</span>';
      receiverStatus.innerHTML = '<span class="done">Checked.</span> Settles when online';
    } else {
      senderStatus.innerHTML = '<span class="done">Paid</span>';
      receiverStatus.innerHTML = '<span class="done">₦5,000 received</span>';
    }
    await wait(2600);
    senderStatus.textContent = 'for jollof rice';
    receiverStatus.textContent = 'Ready to receive';
    pay.textContent = 'Pay again';
    pay.disabled = false;
    running = false;
  });

  // Ask Faara: a few phrases and what the app fills in for them.
  const phrases = [
    {
      lang: 'English',
      said: 'Send Tolu 5k for the fabric',
      filled: 'Payment to Tolu Adebayo · ₦5,000 · “fabric”. Check and approve.',
    },
    {
      lang: 'Pidgin',
      said: 'Send 5k give Richard for garri',
      filled: 'Payment to Richard · ₦5,000 · “garri”. Check am and approve.',
    },
    {
      lang: 'Yorùbá',
      said: 'Fi ẹgbẹ̀rún márùn-ún ránṣẹ́ sí Tolu',
      filled: 'Ìsanwó sí Tolu · ₦5,000. Ṣàyẹ̀wò kí o sì fọwọ́ sí i.',
    },
    {
      lang: 'Hausa',
      said: 'Aika wa Tolu naira dubu biyar',
      filled: 'Biyan Tolu · ₦5,000. Duba ka amince.',
    },
    {
      lang: 'Igbo',
      said: 'Zigara Tolu puku naira ise',
      filled: 'Ịkwụ Tolu ụgwọ · ₦5,000. Lelee ma kwado ya.',
    },
    {
      lang: 'Savings',
      said: 'Save 30% of everything I receive',
      filled: 'New rule: move 30% of money you receive into dollars. Approve to turn it on.',
    },
  ];
  const chips = document.getElementById('chips');
  const said = document.getElementById('said');
  const filled = document.getElementById('filled');
  phrases.forEach((phrase) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = phrase.lang;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', 'true');
      said.textContent = `“${phrase.said}”`;
      filled.textContent = phrase.filled;
    });
    chips.appendChild(chip);
  });
})();
