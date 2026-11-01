/**
 * The proposal, on the screen of the one being asked: the question, a YES
 * button that keeps growing… and a No button that swims away like a fish
 * whenever anyone tries to press it (the same physics as the date app's "No").
 * Then a celebration — on both screens.
 */
const TAUNTS = [
  'Ooh, so close! 😯',
  'Nope. Not today. 😌',
  'That button is on my side 😼',
  'But the other button is so much cuter! 🥰',
  'One tiny click and it’s forever 💍',
  'Look at the other button, it’s so cute! 🥰',
  'Try the big one instead 👉',
  'Are you sure you want to pick that one? 🤔',
  'The YES is the right choice, I promise 🫶',
  'Hey, the other button is lonely 😢',
  'Are you sure you want that one? 🤨',
  'Destiny says YES 💫',
  'The other button loves you more 💗',
  'Just one more click and it’s forever! 🥰',
  'Maybe the other button is more your style? 😏',
  'Okay, this is getting funny 😂',
  'Deep down you know the answer is YES 💖',
  'The other button is cheering for you 📣',
  'The YES is getting huge for a reason 🙃',
  'Wait, don’t you want to see what happens next? 👀',
  'Very tempting, but the other button is even more tempting 😏',
  'I can see your finger trembling 👆',
  'The YES is right there, all cozy 🛋️',
  'Come on, one little yes? 🌷',
  'Quick, before it grows even bigger! 🐘',
  'The YES is waiting for you patiently ⏳',
];

const MORE = [
  'You can do it! I believe in you 💪',
  'Your finger is no match for it 👆',
  'It’s getting faster... 💨',
  'It swims away, doesn’t it? 🌊',
  'You can’t catch that one with your hands 🎣',
  'Slippery little thing, isn’t it? 🫧',
  'Plot twist: it can’t be clicked 🎬',
  'Even my mouse gave up 🖱️',
  'It has trust issues 😅',
  'Zero out of ∞ catches 🏆',
  'That one’s just decoration 🎀',
  'It practiced all week for this 🏃',
  'You can try, but it won’t work 😎',
  'Every time you try, it gets faster ⚡',
  'You’re making it dizzy 😵‍💫',
  'It’s a professional escape artist 🎩',
  'Physics says no, hearts say yes 💘',
  'I put googly eyes on it, look 👀',
  'It’s shy, be gentle 🥺',
  'Your patience is adorable, though 🥰',
  'Fine, keep trying — I’ll wait 🍵',
  'Rumour says it’s ticklish 🤭',
  'It has a black belt in dodging 🥋',
  'Still not it 🙈',
  'It runs on stubbornness ⚡',
  'Nice try! Truly. 👏',
];

export class Proposal {
  constructor(el) {
    this.el = el;
    this.card = el.querySelector('.proposal-card');
    this.yesBtn = el.querySelector('.proposal-yes');
    this.noBtn = el.querySelector('.proposal-no');
    this.slot = el.querySelector('.proposal-slot');
    this.taunt = el.querySelector('.proposal-taunt');
    this.yay = el.querySelector('.proposal-yay');
    this.onYes = () => {}; // (dodges)
    this.isOpen = false;
    this.#bind();
  }

  /** Ask: { question, from (name), yes, no }. */
  open({ question, from, yes, no }) {
    this.el.querySelector('.proposal-question').textContent = question;
    this.el.querySelector('.proposal-from').textContent = from ? `${from} is asking you… 💍` : '💍';
    this.yesBtn.textContent = yes;
    this.noBtn.textContent = no;
    this.yay.hidden = true;
    this.card.hidden = false;
    this.noBtn.hidden = false;
    this.attempts = 0;
    this.lastLine = '';
    this.taunt.replaceChildren();
    this.yesBtn.style.transform = '';
    this.yesBtn.style.boxShadow = '';
    this.baseW = 0;
    Object.assign(this.st, { vx: 0, vy: 0, agility: 1, parked: true, wobble: 0 });
    this.el.hidden = false;
    this.isOpen = true;
    requestAnimationFrame(() => {
      this.el.classList.add('show');
      this.#park();
    });
    this.#loop();
  }

  /** They got up without waiting for the answer. */
  close() {
    this.isOpen = false;
    this.el.classList.remove('show');
    setTimeout(() => !this.isOpen && (this.el.hidden = true), 400);
  }

  /** The celebration: a big ring, `title` and `text`. Closes by itself (or with a tap). */
  celebrate(title, text) {
    this.isOpen = false;
    this.card.hidden = true;
    this.noBtn.hidden = true;
    this.yay.querySelector('h2').textContent = title;
    this.yay.querySelector('p').textContent = text;
    this.yay.hidden = false;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('show'));
    this.#confetti();
    clearTimeout(this.yayTimer);
    this.yayTimer = setTimeout(() => this.#endCelebration(), 7000);
  }

  #endCelebration() {
    this.el.classList.remove('show');
    setTimeout(() => {
      if (!this.isOpen) this.el.hidden = true;
      this.yay.hidden = true;
    }, 450);
  }

  // ── The swimming No button ─────────────────────────────────────────
  st = { x: 0, y: 0, vx: 0, vy: 0, agility: 1, parked: true, phase: Math.random() * 100, wobble: 0 };
  pointer = { x: -9999, y: -9999, active: false };
  lastAttempt = -1000;
  lastNear = 0;

  #size() {
    return { w: this.noBtn.offsetWidth, h: this.noBtn.offsetHeight };
  }

  #park() {
    if (!this.st.parked) return;
    const r = this.slot.getBoundingClientRect();
    const s = this.#size();
    this.st.x = r.left + (r.width - s.w) / 2;
    this.st.y = r.top + (r.height - s.h) / 2;
    this.#draw();
  }

  #draw() {
    const tilt = Math.max(-14, Math.min(14, this.st.vx * 0.035)) + this.st.wobble;
    this.noBtn.style.transform = `translate(${this.st.x}px, ${this.st.y}px) rotate(${tilt}deg)`;
  }

  #clamp() {
    const s = this.#size();
    const pad = 6;
    const maxX = innerWidth - s.w - pad;
    const maxY = innerHeight - s.h - pad;
    const st = this.st;
    if (st.x < pad) {
      st.x = pad;
      st.vx = Math.abs(st.vx) * 0.85;
    }
    if (st.y < pad) {
      st.y = pad;
      st.vy = Math.abs(st.vy) * 0.85;
    }
    if (st.x > maxX) {
      st.x = maxX;
      st.vx = -Math.abs(st.vx) * 0.85;
    }
    if (st.y > maxY) {
      st.y = maxY;
      st.vy = -Math.abs(st.vy) * 0.85;
    }
  }

  /** A real click/tap on it, or a very close call (pointerdown and click both fire for one tap: debounce). */
  #attempt(strong) {
    const now = performance.now();
    if (now - this.lastAttempt < 220) return;
    this.lastAttempt = now;
    this.attempts++;
    this.st.agility = Math.min(4.6, this.st.agility + (strong ? 0.32 : 0.16));
    this.st.parked = false;
    this.#growYes();
    this.#say(this.#nextTaunt(this.attempts));
  }

  #flee(px, py, power) {
    const s = this.#size();
    const st = this.st;
    const dx = st.x + s.w / 2 - px;
    const dy = st.y + s.h / 2 - py;
    const d = Math.hypot(dx, dy) || 1;
    // Dart away, with a sideways kick so it curves like a fish.
    const ux = dx / d;
    const uy = dy / d;
    const kick = power * st.agility;
    st.vx += ux * kick - uy * kick * 0.45;
    st.vy += uy * kick + ux * kick * 0.45;
    st.wobble = (Math.random() - 0.5) * 26;
  }

  #loop() {
    let last = performance.now();
    const tick = (now) => {
      if (!this.isOpen) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = this.st;
      if (!st.parked) {
        const s = this.#size();
        const cx = st.x + s.w / 2;
        const cy = st.y + s.h / 2;
        // Pushed away by the pointer when it gets close.
        if (this.pointer.active) {
          const dx = cx - this.pointer.x;
          const dy = cy - this.pointer.y;
          const d = Math.hypot(dx, dy) || 1;
          const radius = 150 + 26 * st.agility;
          if (d < radius) {
            const force = (1 - d / radius) * (1500 + 900 * st.agility);
            st.vx += (dx / d) * force * dt;
            st.vy += (dy / d) * force * dt;
            st.wobble = Math.sin(now / 45) * (4 + st.agility * 3);
            if (d < 46 && now - this.lastNear > 700) {
              this.lastNear = now;
              this.#attempt(false);
              this.#flee(this.pointer.x, this.pointer.y, 260);
            }
          }
        }
        // Lazy swimming when nobody is chasing it…
        st.phase += dt * (0.7 + st.agility * 0.25);
        st.vx += Math.cos(st.phase * 1.7) * 26 * dt * st.agility;
        st.vy += Math.sin(st.phase * 2.3) * 26 * dt * st.agility;
        // …around a slowly wandering home spot, so it never parks on the YES.
        const homeX = innerWidth * (0.5 + 0.33 * Math.cos(st.phase * 0.6));
        const homeY = innerHeight * (0.5 + 0.31 * Math.sin(st.phase * 0.47));
        st.vx += (homeX - cx) * 0.55 * dt;
        st.vy += (homeY - cy) * 0.55 * dt;
        // Drag and a speed limit.
        const drag = Math.pow(0.14, dt);
        st.vx *= drag;
        st.vy *= drag;
        const sp = Math.hypot(st.vx, st.vy);
        const max = 420 + 340 * st.agility;
        if (sp > max) {
          st.vx = (st.vx / sp) * max;
          st.vy = (st.vy / sp) * max;
        }
        st.x += st.vx * dt;
        st.y += st.vy * dt;
        st.wobble *= Math.pow(0.02, dt);
        this.#clamp();
        this.#draw();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  #growYes() {
    const yes = this.yesBtn;
    if (!this.baseW) this.baseW = yes.offsetWidth;
    // Logarithmic growth: fast at first, then a gentle, endless swell.
    let scale = 1 + 0.62 * Math.log(1 + this.attempts);
    scale = Math.min(scale, (innerWidth * 0.92) / this.baseW, (innerHeight * 0.55) / yes.offsetHeight);
    yes.style.transform = `scale(${scale})`;
    yes.style.boxShadow = `0 ${10 + this.attempts}px ${30 + this.attempts * 3}px rgba(215, 90, 150, 0.3), inset 0 -4px 0 rgba(0, 0, 0, 0.12)`;
  }

  #say(text) {
    if (text === this.lastLine) return;
    this.lastLine = text;
    const current = this.taunt.querySelector('.line:not(.out)');
    this.taunt.querySelectorAll('.line.out').forEach((n) => n.remove());
    if (current) {
      current.classList.add('out');
      setTimeout(() => current.remove(), 260);
    }
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = text;
    this.taunt.append(line);
  }

  /** The first few in order, then a shuffle forever. */
  #nextTaunt(n) {
    if (n - 1 < TAUNTS.length) return TAUNTS[n - 1];
    const pool = MORE.filter((t) => t !== this.lastLine);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  #bind() {
    addEventListener('pointermove', (e) => {
      if (!this.isOpen) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
      if (this.st.parked) {
        const r = this.noBtn.getBoundingClientRect();
        const near = e.clientX > r.left - 110 && e.clientX < r.right + 110 && e.clientY > r.top - 110 && e.clientY < r.bottom + 110;
        if (near) {
          this.st.parked = false;
          this.#flee(e.clientX, e.clientY, 300);
        }
      }
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
    }, { passive: true });
    // Touch users never hover: bail out the instant a finger lands on it.
    this.noBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.#attempt(true);
      this.#flee(e.clientX, e.clientY, 480);
    });
    this.noBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.#attempt(true);
      this.#flee(e.clientX || this.st.x, e.clientY || this.st.y, 520);
    });
    addEventListener('resize', () => (this.st.parked ? this.#park() : this.#clamp()));
    this.yesBtn.addEventListener('click', () => {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.onYes(this.attempts);
    });
    this.yay.addEventListener('click', () => this.#endCelebration());
  }

  /** Hearts and rings raining down behind the celebration. */
  #confetti() {
    const box = this.el.querySelector('.proposal-confetti');
    box.replaceChildren();
    const bits = ['💖', '💍', '✨', '💕', '🥂', '💗'];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('i');
      s.textContent = bits[i % bits.length];
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDelay = `${Math.random() * 2.5}s`;
      s.style.fontSize = `${1 + Math.random() * 1.6}rem`;
      box.append(s);
    }
  }
}
