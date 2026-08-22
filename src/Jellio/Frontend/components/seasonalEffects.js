// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals, not installed as
// that plugin directly: its own real script patches index.html the same
// way this codebase's own IndexHtmlPatchService does, so both could
// coexist, but its own "hide during video playback" check reads native
// jellyfin-web's own .videoPlayerContainer/dashboardDocument, neither of
// which this runtime's own screens ever produce, since screens/player.js
// owns a real player of its own rather than reskinning a native one.
// A small Jellio-owned component instead, hidden during this runtime's
// own real player route the same way components/mobileNav.js and
// components/sidebar.js already are (css/app.css's own real
// .jellio-root-fullscreen rule), not the native selectors the original
// plugin depends on.
//
// Server side, admin controlled config, not a client only localStorage
// toggle this used to carry: Controllers/ConfigController.cs's own
// GetConfig endpoint is the one real source, applies to every user on
// this server the same way, confirmed against Moonfin-Client/Plugin's
// own real server side settings surface before choosing this shape
// rather than guessed, and the same real shape a future native client
// (an Android TV app, say) could read from too. Per user overrides may
// layer on top of this later; nothing here forecloses that.
//
// Every falling/rising theme below (winter, autumn, spring, summer,
// halloween) shares one real particle engine: each particle is a plain
// span with a CSS animation the browser runs entirely on the
// compositor, the exact real lesson this session's own mobile nav pill
// already paid for (css/app.css's own header on .jellio-mobile-nav-label
// documents the same real hard-cut-under-load failure a JS
// requestAnimationFrame loop driving per-frame style writes would risk
// here again). Only New Year's fireworks and Friday the 13th need their
// own real per-theme code, real canvas particle bursts and a real CSS
// flicker respectively, neither expressible as a falling span.
import { getJellioConfig } from '../runtime/api.js';

// Real priority when more than one real range matches at once (Halloween
// week sitting inside Autumn's own much wider window, New Year's own
// week sitting inside winter's): a rare, specific occasion before a
// wide ambient season, so only one real particle system ever renders
// at a time rather than stacking unrelated ones over each other.
// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// SeasonalRules ordering: birthday/eid/resurrection/nightsky/matrix/
// frost have no real fixed calendar window there either (a personal
// occasion, a lunar Islamic date, a movable Orthodox one, or just a
// generic mood board with no real date tied to it at all), off by
// default here for the same real reason, sitting ahead of the wide
// ambient seasons so an admin who does turn one on deliberately still
// sees it over top of whatever season would otherwise be active.
const THEME_ORDER = [
  'friday13',
  'birthday',
  'eid',
  'resurrection',
  'hearts',
  'carnival',
  'oscar',
  'filmnoir',
  'starwars',
  'eurovision',
  'earthday',
  'cherryblossom',
  'pride',
  'oktoberfest',
  'spooky',
  'halloween',
  'newyear',
  'christmas',
  'snowflakes',
  'nightsky',
  'matrix',
  'frost',
  'winter',
  'autumn',
  'summer',
  'spring',
];

// A day-of-year range comparison that wraps New Year's, the same real
// problem the server's own December to January windows (winter, New
// Year) both have: a plain start <= now <= end fails the moment the
// range crosses into a new calendar year.
function inRange(month, day, range) {
  if (!range) return false;
  const now = month * 100 + day;
  const start = range.StartMonth * 100 + range.StartDay;
  const end = range.EndMonth * 100 + range.EndDay;
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end;
}

function isFriday13(date) {
  return date.getDate() === 13 && date.getDay() === 5;
}

// Real, singular "what's active right now" against
// ConfigController.cs's own real response shape
// ({ SeasonalEffectsEnabled, SeasonalEffects: { <key>: { Enabled, Range } } }).
export function activeSeasonalTheme(date, config) {
  if (!config || !config.SeasonalEffectsEnabled) return null;
  const effects = config.SeasonalEffects || {};
  const month = date.getMonth() + 1;
  const day = date.getDate();

  for (let i = 0; i < THEME_ORDER.length; i++) {
    const key = THEME_ORDER[i];
    const effect = effects[key];
    if (!effect || !effect.Enabled) continue;
    const active = key === 'friday13' ? isFriday13(date) : inRange(month, day, effect.Range);
    if (active) return key;
  }
  return null;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// One shared span-per-particle engine: glyphs (or, for earthday's own
// real coloured petals, a plain circle with no glyph at all) drift
// down (or up, for summer's/hearts' own rising ones) purely on a CSS
// animation, JS only ever sets each particle's own starting position,
// size and animation timing once, never touches it again after that.
// opts.glow ports CodeDevMLH/Jellyfin-Seasonals' own real per-theme
// text-shadow glow (spooky's own SpookyGlowSize, eurovision's own
// EurovisionGlowSize) as one shared CSS class rather than a second
// bespoke engine for what both real themes already build the same way.
function buildDrift(container, opts) {
  const count = opts.count;
  const isDot = opts.shape === 'dot';
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.className = 'jellio-seasonal-particle' + (opts.glow ? ' jellio-seasonal-particle-glow' : '');
    if (isDot) {
      span.classList.add('jellio-seasonal-particle-dot');
      span.style.background = opts.colors[Math.floor(Math.random() * opts.colors.length)];
      const size = rand(opts.minSize, opts.maxSize);
      span.style.width = size + 'px';
      span.style.height = size + 'px';
    } else {
      span.textContent = opts.glyphs[Math.floor(Math.random() * opts.glyphs.length)];
      span.style.fontSize = rand(opts.minSize, opts.maxSize) + 'px';
    }
    span.style.left = rand(0, 100) + 'vw';
    span.style.opacity = String(rand(opts.minOpacity, opts.maxOpacity));
    span.style.animationDuration = rand(opts.minDuration, opts.maxDuration) + 's';
    span.style.animationDelay = '-' + rand(0, opts.maxDuration) + 's';
    span.style.setProperty('--jellio-seasonal-sway', rand(-40, 40) + 'px');
    span.classList.add(opts.direction === 'up' ? 'jellio-seasonal-particle-rise' : 'jellio-seasonal-particle-fall');
    container.appendChild(span);
  }
}

const DRIFT_THEMES = {
  winter: { glyphs: ['❄'], count: 60, minSize: 10, maxSize: 22, minOpacity: 0.5, maxOpacity: 0.95, minDuration: 8, maxDuration: 16, direction: 'down' },
  autumn: { glyphs: ['🍂', '🍁'], count: 40, minSize: 14, maxSize: 24, minOpacity: 0.6, maxOpacity: 1, minDuration: 7, maxDuration: 14, direction: 'down' },
  spring: { glyphs: ['🌸', '🌷'], count: 35, minSize: 12, maxSize: 20, minOpacity: 0.6, maxOpacity: 1, minDuration: 9, maxDuration: 17, direction: 'down' },
  summer: { glyphs: ['✨'], count: 30, minSize: 8, maxSize: 16, minOpacity: 0.4, maxOpacity: 0.85, minDuration: 10, maxDuration: 18, direction: 'up' },
  halloween: { glyphs: ['🦇', '🎃'], count: 30, minSize: 16, maxSize: 26, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 15, direction: 'down' },
  hearts: { glyphs: ['❤️', '💕', '💞', '💓', '💗', '💖'], count: 25, minSize: 14, maxSize: 24, minOpacity: 0.6, maxOpacity: 1, minDuration: 12, maxDuration: 18, direction: 'up' },
  cherryblossom: { glyphs: ['🌸'], count: 25, minSize: 14, maxSize: 22, minOpacity: 0.6, maxOpacity: 1, minDuration: 9, maxDuration: 16, direction: 'down' },
  eid: { glyphs: ['🏮', '🌙', '⭐', '✨'], count: 12, minSize: 16, maxSize: 26, minOpacity: 0.6, maxOpacity: 1, minDuration: 10, maxDuration: 17, direction: 'down' },
  christmas: { glyphs: ['❆', '🎁', '❄️', '🎅', '🎊'], count: 30, minSize: 14, maxSize: 24, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 16, direction: 'down' },
  oktoberfest: { glyphs: ['🥨', '🍺', '🍻'], count: 25, minSize: 16, maxSize: 26, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 15, direction: 'down' },
  eurovision: { glyphs: ['♪', '♫', '♬', '♭', '♮', '♯'], count: 25, minSize: 14, maxSize: 22, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 15, direction: 'down', glow: true },
  earthday: { shape: 'dot', colors: ['#FF69B4', '#FFD700', '#87CEFA', '#FF4500', '#BA55D3', '#FFA500', '#FF1493'], count: 45, minSize: 6, maxSize: 12, minOpacity: 0.6, maxOpacity: 1, minDuration: 9, maxDuration: 16, direction: 'down' },
  pride: { glyphs: ['❤️', '🧡', '💛', '💚', '💙', '💜'], count: 20, minSize: 16, maxSize: 24, minOpacity: 0.6, maxOpacity: 1, minDuration: 10, maxDuration: 15, direction: 'up' },
  resurrection: { glyphs: ['✝️', '🕊️', '🌿'], count: 12, minSize: 18, maxSize: 28, minOpacity: 0.6, maxOpacity: 1, minDuration: 10, maxDuration: 17, direction: 'down' },
  snowflakes: { glyphs: ['❅', '❆'], count: 25, minSize: 12, maxSize: 22, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 16, direction: 'down' },
  birthday: { glyphs: ['🎈', '🎉', '🎊'], count: 12, minSize: 20, maxSize: 30, minOpacity: 0.7, maxOpacity: 1, minDuration: 11, maxDuration: 17, direction: 'up' },
  spooky: { glyphs: ['👻', '🦇', '🎃'], count: 25, minSize: 18, maxSize: 28, minOpacity: 0.6, maxOpacity: 1, minDuration: 8, maxDuration: 15, direction: 'down', glow: true },
};

// New Year's own real fireworks: a plain canvas particle burst, the one
// theme here that genuinely cannot be a CSS-only span (an expanding,
// fading ring of dots from a real random point needs real per-frame
// physics), kept small and bounded (one live burst at a time, a modest
// particle count) rather than anything close to a real fireworks show.
function buildFireworks(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'jellio-seasonal-fireworks-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let frameId = null;
  let bursts = [];
  const COLORS = ['#ff5e5e', '#ffd45e', '#5ecbff', '#8bff5e', '#ff8bf3'];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function spawnBurst() {
    const x = rand(width * 0.15, width * 0.85);
    const y = rand(height * 0.15, height * 0.55);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const particles = [];
    const count = 26;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = rand(1.5, 4);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
      });
    }
    bursts.push({ particles: particles, color: color });
  }

  let spawnTimer = window.setTimeout(function spawnLoop() {
    spawnBurst();
    spawnTimer = window.setTimeout(spawnLoop, rand(1500, 3200));
  }, rand(400, 1200));

  function tick() {
    ctx.clearRect(0, 0, width, height);
    bursts = bursts.filter(function (burst) {
      burst.particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.life -= 0.012;
      });
      ctx.fillStyle = burst.color;
      burst.particles.forEach(function (p) {
        if (p.life <= 0) return;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      return burst.particles.some(function (p) { return p.life > 0; });
    });
    frameId = window.requestAnimationFrame(tick);
  }
  tick();

  return function cleanup() {
    window.clearTimeout(spawnTimer);
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
  };
}

function buildFriday13(container) {
  container.appendChild(document.createElement('div')).className = 'jellio-seasonal-friday13-vignette';
  const cat = document.createElement('span');
  cat.className = 'jellio-seasonal-friday13-cat';
  cat.textContent = '🐈‍⬛';
  container.appendChild(cat);
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// matrix.js: a canvas code rain, real per-column trail objects each
// tracking their own head position/speed/character buffer, redrawn
// every real tick rather than a CSS animation, since a trail's own
// characters genuinely mutate frame to frame (that real plugin's own
// Trail.update() does the same real per-char mutation this ports).
function buildMatrix(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'jellio-seasonal-fireworks-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const chars = '0123456789'.split('');
  const fontSize = 18;
  let width = 0;
  let height = 0;
  let trails = [];
  let frameId = null;

  function makeTrail() {
    const cols = Math.max(1, Math.floor(width / fontSize));
    const trail = {
      x: Math.floor(rand(0, cols)),
      y: -Math.round(rand(0, 20)),
      speed: rand(0.5, 1),
      len: Math.floor(rand(10, 30)),
      chars: [],
    };
    for (let i = 0; i < trail.len; i++) {
      trail.chars.push(chars[Math.floor(Math.random() * chars.length)]);
    }
    return trail;
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const trailCount = 25;
  for (let i = 0; i < trailCount; i++) trails.push(makeTrail());

  function tick() {
    ctx.clearRect(0, 0, width, height);
    ctx.font = 'bold ' + fontSize + 'px monospace';
    ctx.textAlign = 'center';
    trails.forEach(function (t) {
      const oldY = Math.floor(t.y);
      t.y += t.speed;
      const newY = Math.floor(t.y);
      if (newY > oldY) {
        t.chars.unshift(chars[Math.floor(Math.random() * chars.length)]);
        t.chars.pop();
      }
      if (t.y - t.len > Math.ceil(height / fontSize)) {
        Object.assign(t, makeTrail());
      }
      const headY = Math.floor(t.y);
      for (let i = 0; i < t.len; i++) {
        const charY = headY - i;
        if (charY < 0 || charY * fontSize > height + fontSize) continue;
        const alpha = 1 - i / t.len;
        if (i === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
        } else if (i === 1) {
          ctx.fillStyle = 'rgba(150, 255, 150, ' + alpha + ')';
        } else {
          ctx.fillStyle = 'rgba(0, 255, 0, ' + alpha * 0.8 + ')';
        }
        ctx.fillText(t.chars[i], t.x * fontSize + fontSize / 2, charY * fontSize);
      }
    });
    frameId = window.requestAnimationFrame(tick);
  }
  tick();

  return function cleanup() {
    if (frameId) window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
  };
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// nightsky.js: a parallax starfield built from plain CSS box-shadow
// dots (three depth layers, each its own slow drift), plus a handful
// of real shooting stars that relaunch themselves on their own
// 'animationend', not a fixed loop.
function buildNightSky(container) {
  const glow = document.createElement('div');
  glow.className = 'jellio-seasonal-nightsky-glow';
  container.appendChild(glow);

  const starfield = document.createElement('div');
  starfield.className = 'jellio-seasonal-nightsky-starfield';
  [
    { size: 1, count: 150, duration: 200 },
    { size: 2, count: 50, duration: 150 },
    { size: 3, count: 20, duration: 100 },
  ].forEach(function (layer) {
    const shadows = [];
    for (let i = 0; i < layer.count; i++) {
      const x = rand(0, 100).toFixed(2);
      const y = rand(0, 100).toFixed(2);
      shadows.push(x + 'vw ' + y + 'vh #fff');
      shadows.push(x + 'vw ' + (Number(y) + 100).toFixed(2) + 'vh #fff');
    }
    const dot = document.createElement('div');
    dot.style.width = layer.size + 'px';
    dot.style.height = layer.size + 'px';
    dot.style.borderRadius = '50%';
    dot.style.boxShadow = shadows.join(', ');
    dot.style.animation = 'jellio-seasonal-nightsky-drift ' + layer.duration + 's linear infinite';
    starfield.appendChild(dot);
  });
  container.appendChild(starfield);

  const cleanupTimers = [];

  function spawnShootingStar(streak) {
    const angle = rand(15, 165);
    streak.style.setProperty('--jellio-shoot-angle', angle + 'deg');
    streak.style.left = rand(0, 100) + 'vw';
    streak.style.top = rand(0, 100) + 'vh';
    const distance = rand(20, 60);
    streak.style.setProperty('--jellio-shoot-distance', distance + 'vw');
    streak.style.width = distance * 0.25 + 'vw';
    streak.style.animation = 'none';
    void streak.offsetWidth;
    const delayMs = rand(2000, 17000);
    const timer = window.setTimeout(function () {
      if (!streak.isConnected) return;
      const flightTime = rand(2, 4.5);
      streak.style.animation = 'jellio-seasonal-nightsky-shoot ' + flightTime + 's linear forwards';
    }, delayMs);
    cleanupTimers.push(timer);
  }

  const shootingStarCount = window.matchMedia('(max-width: 768px)').matches ? 3 : 6;
  for (let i = 0; i < shootingStarCount; i++) {
    const streak = document.createElement('span');
    streak.className = 'jellio-seasonal-nightsky-shooting-star';
    streak.addEventListener('animationend', function () {
      spawnShootingStar(streak);
    });
    spawnShootingStar(streak);
    container.appendChild(streak);
  }

  return function cleanup() {
    cleanupTimers.forEach(window.clearTimeout);
  };
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// filmnoir.js: a pure CSS overlay, no particles at all, a sepia tint
// plus grain/scratch/vignette layers already fully expressed as real
// CSS animations, nothing here to drive per frame.
function buildFilmNoir(container) {
  container.appendChild(document.createElement('div')).className = 'jellio-seasonal-filmnoir-tint';
  const effects = document.createElement('div');
  effects.className = 'jellio-seasonal-filmnoir-effects';
  effects.appendChild(document.createElement('div')).className = 'jellio-seasonal-filmnoir-grain';
  effects.appendChild(document.createElement('div')).className = 'jellio-seasonal-filmnoir-scratches';
  effects.appendChild(document.createElement('div')).className = 'jellio-seasonal-filmnoir-vignette';
  container.appendChild(effects);
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// starwars.js: real hyperspace streaks radiating from a fixed center
// point, each one a plain span rotated to its own random angle with
// the real streak drawn by its own ::after in CSS.
function buildStarWars(container) {
  const center = document.createElement('div');
  center.className = 'jellio-seasonal-starwars-center';
  for (let i = 0; i < 60; i++) {
    const streak = document.createElement('span');
    streak.className = 'jellio-seasonal-starwars-streak';
    streak.style.transform = 'rotate(' + rand(0, 360) + 'deg)';
    streak.style.animationDelay = '-' + rand(0, 2) + 's';
    streak.style.animationDuration = rand(0.8, 2.3) + 's';
    center.appendChild(streak);
  }
  container.appendChild(center);
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// oscar.js: a red carpet strip, three sweeping spotlights and a real
// randomised camera flash loop (its own timer reschedules itself
// rather than a fixed interval, same real technique here).
function buildOscar(container) {
  container.appendChild(document.createElement('div')).className = 'jellio-seasonal-oscar-carpet';

  const spotlights = document.createElement('div');
  spotlights.className = 'jellio-seasonal-oscar-spotlights';
  for (let i = 0; i < 3; i++) {
    const spot = document.createElement('span');
    spot.className = 'jellio-seasonal-oscar-spotlight';
    spot.style.animationDelay = '-' + rand(0, 8) + 's';
    spot.style.left = 20 + i * 30 + '%';
    spotlights.appendChild(spot);
  }
  container.appendChild(spotlights);

  let flashTimer = null;
  function flashLoop() {
    if (!container.isConnected) return;
    const flash = document.createElement('span');
    flash.className = 'jellio-seasonal-oscar-flash';
    flash.style.left = rand(0, 100) + '%';
    flash.style.top = rand(0, 100) + '%';
    container.appendChild(flash);
    window.setTimeout(function () {
      flash.remove();
    }, 200);
    flashTimer = window.setTimeout(flashLoop, rand(200, 1500));
  }
  flashLoop();

  return function cleanup() {
    if (flashTimer) window.clearTimeout(flashTimer);
  };
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// frost.js: a simplified real vignette (that real plugin's own SVG
// feTurbulence displacement filter skipped here, an injected inline
// <svg><filter> id reference being real extra complexity this port
// isn't taking on for a corner effect), the real animated shimmer and
// creep-in kept as plain CSS.
function buildFrost(container) {
  container.appendChild(document.createElement('div')).className = 'jellio-seasonal-frost-layer';
}

// Ported in spirit from CodeDevMLH/Jellyfin-Seasonals' own real
// carnival.js: shaped, coloured confetti (circle/square/triangle/
// rect) that falls AND sways AND tumbles in 3D, three independent
// real CSS animations layered on three nested real elements (an outer
// fall wrapper, a middle sway wrapper, an inner flutter piece) rather
// than the one shared drift engine above, since that engine's own one
// combined transform keyframe has no real room left for a third,
// independent rotate3d on top of translate. Each piece really does
// respawn itself from the top on its own 'animationend', matching
// that real plugin's own real technique, instead of a fixed lifetime.
const CARNIVAL_COLORS = ['#fce18a', '#ff726d', '#b48def', '#f4306d', '#36c5f0', '#2ccc5d', '#e9b31d', '#9b59b6', '#3498db', '#e74c3c', '#1abc9c', '#f1c40f'];
const CARNIVAL_SHAPES = ['circle', 'square', 'triangle', 'rect'];

function spawnCarnivalPiece(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'jellio-seasonal-carnival-wrapper';
  const sway = document.createElement('div');
  sway.className = 'jellio-seasonal-carnival-sway';
  const piece = document.createElement('div');
  const shape = CARNIVAL_SHAPES[Math.floor(Math.random() * CARNIVAL_SHAPES.length)];
  piece.className = 'jellio-seasonal-carnival-piece jellio-seasonal-carnival-' + shape;
  piece.style.backgroundColor = CARNIVAL_COLORS[Math.floor(Math.random() * CARNIVAL_COLORS.length)];

  wrapper.style.left = rand(0, 100) + '%';
  const duration = rand(5, 10);
  wrapper.style.animationDuration = duration + 's';
  wrapper.style.animationDelay = '-' + rand(0, duration) + 's';

  const swayDuration = rand(3, 5);
  sway.style.animationDuration = swayDuration + 's';
  sway.style.animationDelay = '-' + rand(0, 5) + 's';
  sway.style.setProperty('--jellio-carnival-sway', rand(30, 100) * (Math.random() > 0.5 ? 1 : -1) + 'px');

  piece.style.animationDuration = rand(1, 3) + 's';
  piece.style.setProperty('--jellio-carnival-rot', rand(0, 360) * (Math.random() > 0.5 ? 1 : -1) + 'deg');

  sway.appendChild(piece);
  wrapper.appendChild(sway);
  wrapper.addEventListener('animationend', function (event) {
    if (event.animationName !== 'jellio-seasonal-carnival-fall') return;
    wrapper.remove();
    if (container.isConnected) spawnCarnivalPiece(container);
  });
  container.appendChild(wrapper);
}

function buildCarnival(container) {
  for (let i = 0; i < 60; i++) spawnCarnivalPiece(container);
}

let mountedContainer = null;
let activeCleanup = null;
let activeTheme = null;

function teardownTheme() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  if (mountedContainer) mountedContainer.textContent = '';
  activeTheme = null;
}

function applyTheme(theme) {
  if (theme === activeTheme) return;
  teardownTheme();
  if (!theme) return;
  activeTheme = theme;
  mountedContainer.dataset.jellioSeasonalTheme = theme;

  if (theme === 'newyear') {
    activeCleanup = buildFireworks(mountedContainer);
  } else if (theme === 'friday13') {
    buildFriday13(mountedContainer);
  } else if (theme === 'matrix') {
    activeCleanup = buildMatrix(mountedContainer);
  } else if (theme === 'nightsky') {
    activeCleanup = buildNightSky(mountedContainer);
  } else if (theme === 'filmnoir') {
    buildFilmNoir(mountedContainer);
  } else if (theme === 'starwars') {
    buildStarWars(mountedContainer);
  } else if (theme === 'oscar') {
    activeCleanup = buildOscar(mountedContainer);
  } else if (theme === 'frost') {
    buildFrost(mountedContainer);
  } else if (theme === 'carnival') {
    buildCarnival(mountedContainer);
  } else {
    buildDrift(mountedContainer, DRIFT_THEMES[theme]);
  }
}

// runtime/api.js's own getJellioConfig() caches this for a few minutes
// (SHORT_CACHE_TTL_MS), so a periodic real refetch here is cheap and
// picks up whatever an admin just changed in the plugin's own
// dashboard within a few minutes, no reload required, without this
// file polling the network on every single one of these ticks.
async function refresh() {
  if (!mountedContainer) return;
  let config;
  try {
    config = await getJellioConfig();
  } catch (err) {
    console.warn('Jellio: could not load seasonal effects config', err);
    return;
  }
  applyTheme(activeSeasonalTheme(new Date(), config));
}

// Called once from app.js, right where it already sets up the real
// root shell (idempotent the same way components/sidebar.js's own
// dataset marker keeps its own real one-time build from repeating on
// every ordinary navigation), appended as a real child of that same
// root rather than document.body: the sidebar and mobile nav mounts
// already hide during screens/player.js's own fullscreen route through
// a plain .jellio-root-fullscreen descendant rule in css/app.css, same
// real mechanism here, no separate hashchange listener or any other
// real coupling to this runtime's own router needed.
export function mountSeasonalEffects(root) {
  if (mountedContainer) return;
  mountedContainer = document.createElement('div');
  mountedContainer.className = 'jellio-seasonal-effects';
  root.appendChild(mountedContainer);
  refresh();
  // A reader who leaves this tab open across midnight (New Year's own
  // real edge case, or any other theme's own boundary), or across
  // whatever an admin just changed server side, still gets the right
  // real theme without a full reload.
  window.setInterval(refresh, 5 * 60 * 1000);
}
