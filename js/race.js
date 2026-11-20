// Race simulation and canvas drawing.
(function () {
  const SEG_TIME = 2.2; // seconds a race segment animates after each answer
  const PX = 2.4; // pixels per unit of distance
  const BASE = 100; // distance for a correct answer with power 1.0
  const MISS = 40; // distance for a miss with grip 1.0
  const STREAK_CAP = 4;

  const RIVAL_NAMES = ['Vega', 'Blaze', 'Kato', 'Nova', 'Rook', 'Juno', 'Axel', 'Zara'];
  const RIVAL_COLORS = [['#ffb020', '#9a6400'], ['#22d3ee', '#0e6f80'], ['#f472b6', '#8f2a63'], ['#a3e635', '#557a12']];

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class Race {
    constructor(canvas, { car, league, length }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.length = length;
      this.finish = length * 175 + 120;
      const names = RIVAL_NAMES.slice().sort(() => Math.random() - 0.5);
      this.cars = [
        { name: 'You', you: true, color: car.color, accent: car.accent, power: car.power, grip: car.grip, nitro: car.nitro, lane: 0 },
      ];
      for (let i = 0; i < 3; i++) {
        const [lo, hi] = league.rivalAcc;
        this.cars.push({
          name: names[i],
          you: false,
          color: RIVAL_COLORS[i][0],
          accent: RIVAL_COLORS[i][1],
          power: league.rivalPower * (0.97 + Math.random() * 0.06),
          grip: 1 + (league.rivalPower - 1) * 1.5,
          nitro: 4 + Math.round((league.rivalPower - 1) * 20),
          acc: lo + Math.random() * (hi - lo),
          lane: i + 1,
        });
      }
      // Shuffle lanes so you're not always on top.
      const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      this.cars.forEach((c, i) => {
        Object.assign(c, { lane: lanes[i], pos: 0, from: 0, to: 0, streak: 0, spin: 0, boost: 0, finished: false, finishTime: 0 });
      });
      this.player = this.cars.find((c) => c.you);
      this.segT = 1;
      this.phase = 'wait'; // wait | move | sprint | done
      this.time = 0;
      this.particles = [];
      this.camX = 0;
      this.onSprintDone = null;
      this._raf = null;
      this._last = 0;
      this.cdT = null;
    }

    gain(car, correct) {
      if (correct) {
        car.streak++;
        const bonus = Math.min(car.streak - 1, STREAK_CAP) * car.nitro;
        return BASE * car.power + bonus;
      }
      car.streak = 0;
      return MISS * car.grip;
    }

    /** Advance one segment. Returns the player's gain. */
    step(playerCorrect) {
      for (const c of this.cars) {
        const ok = c.you ? playerCorrect : Math.random() < c.acc;
        const g = this.gain(c, ok) + (c.you ? 0 : (Math.random() - 0.5) * 10);
        c.from = c.pos;
        c.to = c.to + g; // build on the target, even if the last segment is still animating
        c.spin = ok ? 0 : 1;
        c.boost = ok && c.streak >= 3 ? 1 : ok ? 0.5 : 0;
      }
      this.segT = 0;
      this.phase = 'move';
      return this.player.to - this.player.from;
    }

    standings() {
      return this.cars.slice().sort((a, b) => b.to - a.to);
    }

    place() {
      return this.standings().indexOf(this.player) + 1;
    }

    /** Final dash to the line; order is decided by distance already earned. */
    sprint(done) {
      this.phase = 'sprint';
      this.onSprintDone = done;
      const order = this.standings();
      const lead = order[0].to;
      order.forEach((c, i) => {
        c.from = c.pos;
        // Everyone crosses in order; gaps on the line reflect gaps on the track.
        c.sprintDur = 2.2 + Math.min(2.5, (lead - c.to) / 120) + i * 0.15;
        c.sprintT = 0;
        c.spin = 0;
        c.boost = 1;
      });
    }

    start() {
      const loop = (ts) => {
        const dt = Math.min(0.05, (ts - (this._last || ts)) / 1000);
        this._last = ts;
        this.update(dt);
        this.draw();
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }

    stop() {
      cancelAnimationFrame(this._raf);
    }

    /** Start lights: three reds, then green. Calls done() on GO. */
    countdown(done) {
      this.phase = 'countdown';
      this.cdT = 0;
      this.onGo = done;
    }

    update(dt) {
      this.time += dt;
      const before = this.player.pos;
      if (this.cdT != null && this.cdT < 4) this.cdT += dt;
      if (this.phase === 'countdown') {
        for (const c of this.cars) c.idle = Math.sin(this.time * 30 + c.lane) * 0.9;
        if (this.cdT >= 2.6) {
          this.phase = 'wait';
          const cb = this.onGo;
          this.onGo = null;
          if (cb) cb();
        }
      } else if (this.phase === 'move') {
        this.segT = Math.min(1, this.segT + dt / SEG_TIME);
        const e = ease(this.segT);
        for (const c of this.cars) c.pos = c.from + (c.to - c.from) * e;
        if (this.segT >= 1) this.phase = 'wait';
      } else if (this.phase === 'sprint') {
        let all = true;
        for (const c of this.cars) {
          c.sprintT = Math.min(1, c.sprintT + dt / c.sprintDur);
          c.pos = c.from + (this.finish + 140 - c.from) * (c.sprintT * c.sprintT * 0.4 + c.sprintT * 0.6);
          if (c.sprintT < 1) all = false;
        }
        if (all) {
          this.phase = 'done';
          const cb = this.onSprintDone;
          this.onSprintDone = null;
          if (cb) cb();
        }
      } else {
        // idle creep while you think, so the scene feels alive
        for (const c of this.cars) c.idle = Math.sin(this.time * 18 + c.lane) * 0.6;
      }
      // particles
      const moving = this.phase === 'move' || this.phase === 'sprint';
      for (const c of this.cars) {
        if (moving && (c.boost > 0.6 || (c.spin && this.segT < 0.7))) {
          this.particles.push({
            x: c.pos * PX - 30,
            lane: c.lane,
            dy: (Math.random() - 0.5) * 10,
            life: 1,
            kind: c.spin && this.phase === 'move' ? 'smoke' : 'fire',
          });
        }
      }
      for (const p of this.particles) p.life -= dt * 2.2;
      this.particles = this.particles.filter((p) => p.life > 0);
      // speedometer: idle around 40, real speed while moving
      const v = dt > 0 ? (this.player.pos - before) / dt : 0;
      const targetSpeed = 40 + v * 0.9 + (this.phase === 'countdown' ? Math.sin(this.time * 9) * 25 + 30 : 0);
      this.speed = (this.speed || 0) + (targetSpeed - (this.speed || 0)) * Math.min(1, dt * 5);
      // camera follows the player, eased
      const target = this.player.pos * PX - (this.canvas.clientWidth || this.canvas.width) * 0.38;
      if (!this._camInit) { this.camX = target; this._camInit = true; }
      this.camX += (target - this.camX) * Math.min(1, dt * 6);
    }

    laneY(lane) {
      const h = this.canvas.clientHeight || this.canvas.height;
      const top = h * 0.2, bottom = h * 0.92;
      return top + ((lane + 0.5) * (bottom - top)) / 4;
    }

    draw() {
      const { ctx, canvas } = this;
      const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
      const dpr = canvas.width / W;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const top = H * 0.2, bottom = H * 0.92;
      const cam = this.camX;

      // sky/grass
      ctx.fillStyle = '#1d6b3a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#195d32';
      for (let x = -((cam * 0.5) % 80); x < W; x += 80) ctx.fillRect(x, 0, 40, top - 8);
      // stands & distance boards
      for (let d = Math.floor(cam / PX / 100) * 100; d * PX - cam < W + 100; d += 100) {
        const x = d * PX - cam;
        if (d <= 0) continue;
        ctx.fillStyle = '#0f3d22';
        ctx.fillRect(x - 22, top - 34, 44, 22);
        ctx.fillStyle = '#d9f99d';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${d}m`, x, top - 18);
      }
      // road
      ctx.fillStyle = '#33373d';
      ctx.fillRect(0, top - 6, W, bottom - top + 12);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, top - 6, W, 4);
      ctx.fillRect(0, bottom + 2, W, 4);
      // lane dashes
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let l = 1; l < 4; l++) {
        const y = top + (l * (bottom - top)) / 4;
        for (let x = -(cam % 60); x < W; x += 60) ctx.fillRect(x, y - 1.5, 30, 3);
      }
      // start line
      const sx = 0 - cam;
      if (sx > -20 && sx < W) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + 40, top - 6, 6, bottom - top + 12);
      }
      // finish line
      const fx = this.finish * PX - cam;
      if (fx > -40 && fx < W + 40) {
        const sq = (bottom - top + 12) / 12;
        for (let r = 0; r < 12; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
            ctx.fillRect(fx + c * sq, top - 6 + r * sq, sq, sq);
          }
        }
      }
      // particles
      for (const p of this.particles) {
        const x = p.x - cam;
        const y = this.laneY(p.lane) + p.dy;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.kind === 'fire' ? (p.life > 0.6 ? '#ffd166' : '#ff6b35') : '#c7c9cc';
        ctx.beginPath();
        ctx.arc(x - (1 - p.life) * 40, y, (p.kind === 'fire' ? 5 : 9) * (1.3 - p.life * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // cars
      const carScale = Math.max(0.55, Math.min(1.2, (bottom - top) / 4 / 50));
      for (const c of this.cars) this.drawCar(c, c.pos * PX - cam + 40, this.laneY(c.lane) + (this.phase === 'wait' ? c.idle || 0 : 0), carScale);
      // minimap
      this.drawMinimap(W, top);
      this.drawGauge(W, H);
      if (this.cdT != null && this.cdT < 3.4) this.drawLights(W, H);
    }

    drawLights(W, H) {
      const { ctx } = this;
      const t = this.cdT;
      const go = t >= 2.4;
      const r = Math.min(22, H * 0.08);
      const gap = r * 2.6;
      const bx = W / 2 - gap - r - 14, by = H * 0.42 - r - 12;
      ctx.globalAlpha = t > 3 ? Math.max(0, 1 - (t - 3) / 0.4) : 1;
      ctx.fillStyle = '#0b0b0f';
      roundRect(ctx, bx, by, gap * 2 + r * 2 + 28, r * 2 + 24, 12);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const lit = go || t >= 0.4 + i * 0.7;
        ctx.beginPath();
        ctx.arc(W / 2 + (i - 1) * gap, H * 0.42, r, 0, Math.PI * 2);
        ctx.fillStyle = go ? '#22e06b' : lit ? '#ff2d2d' : '#2a1010';
        if (lit) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24; }
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (go) {
        ctx.font = `italic 900 ${Math.round(r * 2.2)}px "Russo One", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22e06b';
        ctx.fillText('GO!', W / 2, H * 0.42 + r * 3.6);
      }
      ctx.globalAlpha = 1;
    }

    drawGauge(W, H) {
      const { ctx } = this;
      const R = Math.max(30, Math.min(52, H * 0.17));
      const cx = W - R - 14, cy = H - R * 0.55 - 10;
      const max = 320;
      const v = Math.max(0, Math.min(max, this.speed || 0));
      const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
      ctx.fillStyle = 'rgba(8,10,16,0.82)';
      ctx.beginPath();
      ctx.arc(cx, cy, R + 8, Math.PI, 0);
      ctx.lineTo(cx + R + 8, cy + R * 0.5);
      ctx.lineTo(cx - R - 8, cy + R * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(4, R * 0.14);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2b2f3a';
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.stroke();
      const grad = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(1, '#ff2d2d');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * (v / max));
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `italic 900 ${Math.round(R * 0.5)}px "Russo One", system-ui, sans-serif`;
      ctx.fillText(String(Math.round(v)), cx, cy + R * 0.12);
      ctx.font = `700 ${Math.round(R * 0.2)}px system-ui, sans-serif`;
      ctx.fillStyle = '#9aa4b8';
      ctx.fillText('KM/H', cx, cy + R * 0.38);
      // nitro pips: one per streak step
      const n = Math.min(4, Math.max(0, this.player.streak - 1));
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < n ? '#38bdf8' : '#2b2f3a';
        ctx.fillRect(cx - R + i * (R * 0.5) + 2, cy - R - 16, R * 0.42, 5);
      }
    }

    drawCar(c, x, y, scale = 1) {
      const { ctx } = this;
      const L = 58, Wd = 28;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      if (this.phase === 'move' && c.spin) {
        const t = Math.min(1, this.segT / 0.75);
        ctx.rotate(ease(t) * Math.PI * 2);
      }
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-L / 2 + 3, -Wd / 2 + 4, L, Wd);
      // wheels
      ctx.fillStyle = '#111';
      for (const [wx, wy] of [[-L / 2 + 8, -Wd / 2 - 3], [L / 2 - 18, -Wd / 2 - 3], [-L / 2 + 8, Wd / 2 - 3], [L / 2 - 18, Wd / 2 - 3]]) {
        ctx.fillRect(wx, wy, 12, 6);
      }
      // body
      ctx.fillStyle = c.color;
      roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 8);
      ctx.fill();
      // stripe
      ctx.fillStyle = c.accent;
      ctx.fillRect(-L / 2 + 4, -3, L - 8, 6);
      // windshield
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      roundRect(ctx, 2, -Wd / 2 + 4, 13, Wd - 8, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(15,23,42,0.6)';
      roundRect(ctx, -L / 2 + 6, -Wd / 2 + 5, 8, Wd - 10, 2);
      ctx.fill();
      ctx.restore();
      // name tag
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = c.you ? 'YOU' : c.name;
      if (!label) return;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = c.you ? '#facc15' : 'rgba(0,0,0,0.55)';
      // tag sits behind the car so it never covers the next lane
      const tx = x - (L / 2) * scale - tw / 2 - 6;
      roundRect(ctx, tx - tw / 2, y - 8, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = c.you ? '#111' : '#fff';
      ctx.fillText(label, tx, y + 4);
    }

    drawMinimap(W, top) {
      const { ctx } = this;
      const pad = 16, y = 14, h = 10;
      const w = W - pad * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, pad, y, w, h, 5);
      ctx.fill();
      // checkered end
      ctx.fillStyle = '#fff';
      ctx.fillRect(pad + w - 4, y - 3, 4, h + 6);
      for (const c of this.cars) {
        const f = Math.min(1, c.pos / this.finish);
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(pad + f * (w - 6) + 3, y + h / 2, c.you ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        if (c.you) {
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw a car on a small canvas, used in the shop. */
  function drawCarPreview(canvas, car) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fake = Object.create(Race.prototype);
    fake.ctx = ctx;
    fake.phase = 'wait';
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 10);
    ctx.scale(1.6, 1.6);
    fake.drawCar.call(fake, { ...car, you: false, name: '' }, 0, 0);
    ctx.restore();
  }

  window.Race = Race;
  window.drawCarPreview = drawCarPreview;
})();
