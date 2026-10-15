/* ============================================================
   dino.js — gra „Dinozaur”
   Skok nad kaktusami, rosnąca prędkość, rekord w pamięci.

   Użycie (z script.js):
     const gra = Gry.dino.create({ canvas, onScore, onState, sfx,
                                   getRecord, setRecord });
     gra.start(); gra.setPaused(true); gra.destroy();
   ============================================================ */
(function () {
  window.Gry = window.Gry || {};

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  const FIZ = {
    base: 380,     // prędkość startowa (px/s)
    max: 920,      // maksymalna prędkość
    accel: 9,      // przyspieszanie (px/s na sekundę)
    gravity: 3600, // grawitacja
    jump: -830,    // siła skoku
    fastFall: 2.1, // mnożnik grawitacji przy kucaniu w powietrzu
  };

  const DINO = { x: 64, w: 26, h: 38, duckW: 40, duckH: 20 };

  window.Gry.dino = {
    id: 'dino',
    tytul: 'Dinozaur',
    opis: 'Skacz nad kaktusami, przyspieszaj i bij własny rekord.',
    tag: 'Arcade',

    create({ canvas, onScore, onState, sfx, getRecord, setRecord }) {
      const ctx = canvas.getContext('2d');

      let W = 0, H = 0, dpr = 1, groundY = 0;
      let raf = 0, last = 0, paused = false;
      let running = false, over = false, destroyed = false;
      let speed = 0, score = 0, time = 0, spawnIn = 0, nextPoint = 100;
      let obstacles = [], clouds = [], pebbles = [];
      let colors = {};
      let lastScoreShown = 0;

      const player = { y: 0, vy: 0, duck: false, onGround: true };

      /* ---------- kolory pobierane z motywu strony ---------- */
      function readColors() {
        const cs = getComputedStyle(document.documentElement);
        colors = {
          dino: cs.getPropertyValue('--text').trim() || '#eaeef7',
          accent: cs.getPropertyValue('--accent').trim() || '#6366f1',
          ground: cs.getPropertyValue('--muted').trim() || '#98a2b8',
          cactus: '#22c55e',
        };
      }

      /* ---------- rozmiar planszy ---------- */
      function resize() {
        const rect = canvas.getBoundingClientRect();
        W = Math.max(260, Math.round(rect.width));
        H = Math.max(160, Math.round(rect.height));
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        groundY = H - 32;
        if (player.onGround) player.y = groundY;
        makePebbles();
      }

      function makePebbles() {
        pebbles = [];
        for (let i = 0; i < 14; i++) {
          pebbles.push({ x: rand(0, W), w: rand(3, 9), o: rand(4, 12), a: rand(0.25, 0.7) });
        }
      }

      function makeClouds() {
        clouds = [
          { x: W * 0.6, y: H * 0.22, s: 1 },
          { x: W * 1.1, y: H * 0.38, s: 0.75 },
        ];
      }

      /* ---------- rysowanie ---------- */
      function rr(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
        else ctx.rect(x, y, w, h);
        ctx.fill();
      }

      function drawGround() {
        ctx.fillStyle = colors.ground;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(0, groundY + 1, W, 2);
        ctx.globalAlpha = 1;
        pebbles.forEach((p) => {
          ctx.globalAlpha = p.a;
          ctx.fillRect(p.x, groundY + 6 + p.o, p.w, 2);
        });
        ctx.globalAlpha = 1;
      }

      function drawClouds() {
        ctx.fillStyle = colors.ground;
        clouds.forEach((c) => {
          ctx.globalAlpha = 0.28;
          rr(c.x, c.y, 46 * c.s, 9 * c.s, 5);
          rr(c.x + 12 * c.s, c.y - 6 * c.s, 30 * c.s, 9 * c.s, 5);
          ctx.globalAlpha = 1;
        });
      }

      function drawCactus(o) {
        ctx.fillStyle = colors.cactus;
        for (let i = 0; i < o.count; i++) {
          const x = o.x + i * (o.unitW + o.gap);
          const y = groundY - o.h;
          const ramię = o.big ? 8 : 6;
          rr(x + o.unitW / 2 - 4, y, 8, o.h, 3);                    // pień
          rr(x - 2, y + o.h * 0.32, 6, o.h * 0.34, 3);               // lewe ramię
          rr(x + o.unitW - 4, y + o.h * 0.22, 6, o.h * 0.4, 3);      // prawe ramię
          rr(x - 2, y + o.h * 0.32, ramię + 2, 5, 2);                // kolanko lewe
          rr(x + o.unitW - 4, y + o.h * 0.22 + o.h * 0.4 - 5, ramię + 2, 5, 2);
        }
      }

      function drawDino() {
        const ducking = player.duck && player.onGround;
        const h = ducking ? DINO.duckH : DINO.h;
        const w = ducking ? DINO.duckW : DINO.w;
        const x = DINO.x;
        const y = player.y - h;

        ctx.fillStyle = colors.dino;
        rr(x + 2, y + 6, w - 8, h - 8, 5);          // tułów
        rr(x + w - 15, y, 15, 13, 4);                // głowa
        rr(x - 7, y + 9, 9, 8, 3);                   // ogon
        rr(x + 1, y + h - 16, 7, 6, 3);              // przednia łapa

        // nogi — animacja biegu
        const bieg = player.onGround ? Math.floor(time * 14) % 2 : 0;
        const nogaY = player.y - 11;
        if (!player.onGround) {
          rr(x + 4, nogaY + 4, 6, 9, 3);
          rr(x + 13, nogaY + 4, 6, 9, 3);
        } else if (ducking) {
          rr(x + 3, nogaY + 4, 7, 9, 3);
          rr(x + 17, nogaY + 4, 7, 9, 3);
        } else {
          rr(x + 4, nogaY - (bieg ? 0 : 4), 6, 11 + (bieg ? 0 : 4), 3);
          rr(x + 13, nogaY - (bieg ? 4 : 0), 6, 11 + (bieg ? 4 : 0), 3);
        }

        // oko
        ctx.fillStyle = colors.accent;
        ctx.fillRect(x + w - 8, y + 4, 3, 3);
      }

      /* ---------- logika ---------- */
      function playerRect() {
        const ducking = player.duck && player.onGround;
        const h = ducking ? DINO.duckH : DINO.h;
        const w = ducking ? DINO.duckW : DINO.w;
        return { x: DINO.x + 4, y: player.y - h + 3, w: w - 10, h: h - 6 };
      }

      function kolizja(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      }

      function spawn() {
        const big = Math.random() < 0.35;
        const count = big ? (Math.random() < 0.35 ? 2 : 1) : randInt(1, 3);
        const unitW = big ? 24 : 17;
        const unitH = big ? 46 : 34;
        const gap = big ? 6 : 5;
        obstacles.push({
          x: W + 24,
          big, count, unitW, unitH, gap,
          w: unitW * count + gap * (count - 1),
          h: unitH,
        });
        spawnIn = speed * rand(0.5, 1.05) + 100;
      }

      function reset() {
        obstacles = [];
        clouds = [];
        makeClouds();
        makePebbles();
        speed = FIZ.base;
        score = 0;
        time = 0;
        spawnIn = 420;
        nextPoint = 100;
        over = false;
        player.y = groundY;
        player.vy = 0;
        player.duck = false;
        player.onGround = true;
        lastScoreShown = 0;
        onScore(0, getRecord());
      }

      function koniec() {
        over = true;
        running = false;
        const rekord = Math.max(getRecord(), Math.floor(score));
        setRecord(rekord);
        if (sfx) sfx.dead();
        onScore(Math.floor(score), rekord);
        onState('over', { wynik: Math.floor(score), rekord });
      }

      function symuluj(dt) {
        time += dt;
        speed = Math.min(FIZ.max, FIZ.base + time * FIZ.accel);

        // wynik
        score += dt * speed * 0.028;
        if (score >= nextPoint) {
          nextPoint += 100;
          if (sfx) sfx.point();
        }
        const widoczny = Math.floor(score);
        if (widoczny !== lastScoreShown) {
          lastScoreShown = widoczny;
          onScore(widoczny, Math.max(getRecord(), widoczny));
        }

        // fizyka dinozaura
        if (!player.onGround) {
          player.vy += FIZ.gravity * dt * (player.duck ? FIZ.fastFall : 1);
          player.y += player.vy * dt;
          if (player.y >= groundY) {
            player.y = groundY;
            player.vy = 0;
            player.onGround = true;
          }
        }

        // kaktusy
        spawnIn -= speed * dt;
        if (spawnIn <= 0) spawn();

        const pr = playerRect();
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          o.x -= speed * dt;
          if (o.x + o.w < -40) {
            obstacles.splice(i, 1);
            continue;
          }
          if (kolizja(pr, { x: o.x + 3, y: groundY - o.h + 3, w: o.w - 6, h: o.h - 4 })) {
            koniec();
            return;
          }
        }

        // chmury i kamyki
        clouds.forEach((c) => {
          c.x -= speed * 0.12 * dt;
          if (c.x < -80) {
            c.x = W + rand(40, 260);
            c.y = H * rand(0.15, 0.42);
            c.s = rand(0.7, 1.1);
          }
        });
        pebbles.forEach((p) => {
          p.x -= speed * dt;
          if (p.x < -12) {
            p.x = W + rand(0, 60);
            p.a = rand(0.25, 0.7);
          }
        });
      }

      function rysuj() {
        ctx.clearRect(0, 0, W, H);
        drawClouds();
        drawGround();
        obstacles.forEach(drawCactus);
        drawDino();
      }

      /* ---------- pętla ---------- */
      function loop(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(loop);
        if (!last) last = ts;
        let dt = (ts - last) / 1000;
        last = ts;
        if (dt > 0.05) dt = 0.05;
        if (running && !over && !paused) symuluj(dt);
        rysuj();
      }

      /* ---------- sterowanie ---------- */
      function skok() {
        if (paused) return;
        if (!running || over) {
          api.start();
          return;
        }
        if (player.onGround) {
          player.vy = FIZ.jump;
          player.onGround = false;
          if (sfx) sfx.jump();
        }
      }

      function naKlawisz(e) {
        if (paused) return;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          skok();
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          player.duck = true;
        }
      }

      function naKlawiszGora(e) {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') player.duck = false;
      }

      function naDotyk(e) {
        if (paused) return;
        e.preventDefault();
        skok();
      }

      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      window.addEventListener('keydown', naKlawisz);
      window.addEventListener('keyup', naKlawiszGora);
      canvas.addEventListener('pointerdown', naDotyk);
      readColors();
      resize();

      const api = {
        id: 'dino',
        start() {
          readColors();
          reset();
          running = true;
          over = false;
          last = 0;
          onState('playing');
        },
        setPaused(value) {
          paused = !!value;
          last = 0;
        },
        isRunning: () => running && !over,
        destroy() {
          destroyed = true;
          cancelAnimationFrame(raf);
          ro.disconnect();
          window.removeEventListener('keydown', naKlawisz);
          window.removeEventListener('keyup', naKlawiszGora);
          canvas.removeEventListener('pointerdown', naDotyk);
        },
      };

      // rysuj od razu stan „gotowy” (bez ruchu)
      player.y = groundY;
      onScore(0, getRecord());
      raf = requestAnimationFrame(loop);

      return api;
    },
  };
})();
