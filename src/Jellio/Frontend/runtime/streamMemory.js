// Remembers a picked stream so the picker does not have to be re-answered
// every time. Plain localStorage, same reasoning screens/player.js's own
// subtitle style already uses: this is purely a display preference, no
// server round trip earns its keep for it.
//
// A movie's own MediaSourceInfo Id is stable across repeat plays of that
// exact item (Gelato resolves the same item id to the same source list
// each time), so a movie is remembered by that Id directly, an exact
// match or nothing.
//
// An episode's own Id is not: each episode gets its own freshly resolved
// source list, so the Id picked on S01E01 never appears again on S01E02.
// What does carry over is the release itself, its group and resolution
// tag both sit in the same place across a season (Series.Name.SxxExx.
// Episode.Title.Quality.Tags-GROUP, the season/episode and per episode
// title are the only parts that change). So an episode is remembered by
// that tail signature instead, matched against whichever fresh source in
// the next episode's list carries the same one.
const ENABLED_KEY = 'jellioRememberStream';
const CHOICES_KEY = 'jellioRememberedSources';

export function isRememberEnabled() {
  const raw = window.localStorage.getItem(ENABLED_KEY);
  return raw === null ? true : raw === 'true';
}

export function setRememberEnabled(enabled) {
  window.localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

function readChoices() {
  try {
    const raw = window.localStorage.getItem(CHOICES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function writeChoices(choices) {
  window.localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
}

// The release group is the token after the last hyphen in a scene style
// name (BluRay.x264-PL3X), the one part of the tail a season keeps
// completely fixed release to release. Paired with resolution rather
// than used alone: two different groups' 1080p and 4K encodes of the
// same episode both still hit the same last-hyphen token if either one
// happens to share a group with something else picked before, and the
// pairing is what tells those apart.
export function sourceSignature(source) {
  const name = (source.Name || '').split('\n')[0] || '';
  const afterHyphen = name.split('-');
  const group = afterHyphen.length > 1 ? afterHyphen[afterHyphen.length - 1].trim() : '';
  const streams = source.MediaStreams || [];
  const video = streams.filter(function (stream) {
    return stream.Type === 'Video';
  })[0];
  const resolution = video && video.Height ? String(video.Height) : '';
  if (!group && !resolution) return '';
  return group.toLowerCase() + '|' + resolution;
}

// null return means "not a rememberable item" (a Series itself has no
// stream of its own, and anything with neither an episode's SeriesId nor
// its own Id has nothing to key a choice on).
function scopeFor(item) {
  if (!item || !item.Id) return null;
  if (item.Type === 'Episode' && item.SeriesId) {
    return { key: 'series:' + item.SeriesId, byId: false };
  }
  if (item.Type === 'Episode') return null;
  if (item.Type === 'Series') return null;
  return { key: 'item:' + item.Id, byId: true };
}

export function rememberSourceChoice(item, source) {
  if (!isRememberEnabled()) return;
  const scope = scopeFor(item);
  if (!scope) return;
  const value = scope.byId ? source.Id : sourceSignature(source);
  if (!value) return;
  const choices = readChoices();
  choices[scope.key] = value;
  writeChoices(choices);
}

// undefined return covers every "no usable memory" case the same way
// (disabled, nothing remembered yet, remembered value no longer present
// in this fetch) so callers can treat them all as one fall through to
// showing the picker rather than juggling three different empty states.
export function findRememberedSource(item, sources) {
  if (!isRememberEnabled()) return undefined;
  const scope = scopeFor(item);
  if (!scope) return undefined;
  const choices = readChoices();
  const remembered = choices[scope.key];
  if (!remembered) return undefined;
  if (scope.byId) {
    return sources.filter(function (source) {
      return source.Id === remembered;
    })[0];
  }
  return sources.filter(function (source) {
    return sourceSignature(source) === remembered;
  })[0];
}
