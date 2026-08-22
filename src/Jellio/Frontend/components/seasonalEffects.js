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
const THEME_ORDER = ['friday13', 'newyear', 'halloween', 'winter', 'autumn', 'summer', 'spring'];

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

// One shared span-per-particle engine: glyphs drift down (or up, for
// summer's own bubbles) purely on a CSS animation, JS only ever sets
// each particle's own starting position, size and animation timing
// once, never touches it again after that.
function buildDrift(container, opts) {
  const count = opts.count;
  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.className = 'jellio-seasonal-particle';
    span.textContent = opts.glyphs[Math.floor(Math.random() * opts.glyphs.length)];
    span.style.left = rand(0, 100) + 'vw';
    span.style.fontSize = rand(opts.minSize, opts.maxSize) + 'px';
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
