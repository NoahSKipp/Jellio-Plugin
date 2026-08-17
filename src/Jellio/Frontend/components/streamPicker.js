// Pre-playback stream picker, real feedback asked for it directly:
// hitting Play used to negotiate PlaybackInfo against whichever source
// GetPlaybackMediaSources defaulted to and start playing that one
// straight away, no chance to look at what else Gelato resolved before
// committing. Visual structure ported from NuvioWeb's own real
// css/components.css (.series-stream-overlay/-panel/-left/-right/-list/
// -card, read before writing this, not guessed at): a dim backdrop of
// the item's own art behind a floating glass panel, poster info on one
// side, a scrollable card list on the other. Data shape is this
// runtime's own though, not ported: NuvioWeb's own cards describe a raw
// Stremio stream from a specific addon (addon icon, seeders, per-addon
// filter chips), where every one of Jellio's own options is already a
// real Jellyfin MediaSourceInfo Gelato resolved server side, the same
// object components/../screens/player.js's own mid-playback Sources
// menu already lists, so this reuses that file's own real field
// choices (sourceLabel below) rather than inventing a second way to
// describe the same data.
import { getMediaSources, getImageUrl } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';
import { findRememberedSource, rememberSourceChoice } from '../runtime/streamMemory.js';

const OVERLAY_ID = 'jellioStreamPicker';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeStreamPicker();
}

export function closeStreamPicker() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
  document.removeEventListener('keydown', handleKeydown);
}

// A source's own rich Name (Decorators/MediaSourceManagerDecorator.cs's
// own GetVersionInfo: the stream's own scraper name, plus description
// on a second line when there is one) is already the closest thing to
// a real quality/source label Gelato hands back, resolution and size
// are real fields on the same MediaSourceInfo (its own Video
// MediaStream's Height, its own Size in bytes) rather than parsed back
// out of that free text.
function sourceResolutionLabel(source) {
  const streams = source.MediaStreams || [];
  const video = streams.filter(function (stream) {
    return stream.Type === 'Video';
  })[0];
  if (!video || !video.Height) return '';
  if (video.Height >= 2000) return '4K';
  return video.Height + 'p';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  return Math.round(bytes / (1024 * 1024)) + ' MB';
}

export function sourceLabel(source) {
  const name = (source.Name || '').split('\n')[0] || 'Source';
  const details = [sourceResolutionLabel(source), formatFileSize(source.Size)]
    .filter(Boolean)
    .join(' · ');
  return details ? name + ' (' + details + ')' : name;
}

function sourceDescription(source) {
  return (source.Name || '').split('\n').slice(1).join(' ').trim();
}

function playHash(itemId, mediaSourceId) {
  return '#/play?id=' + itemId + (mediaSourceId ? '&mediaSourceId=' + mediaSourceId : '');
}

function buildSourceCard(item, source) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'jellio-stream-picker-card';

  card.appendChild(el('div', 'jellio-stream-picker-card-title', (source.Name || '').split('\n')[0] || 'Source'));

  const description = sourceDescription(source);
  if (description) {
    card.appendChild(el('div', 'jellio-stream-picker-card-desc', description));
  }

  const tags = [sourceResolutionLabel(source), formatFileSize(source.Size), source.Container]
    .filter(Boolean)
    .map(function (tag) {
      return String(tag).toUpperCase();
    });
  if (tags.length) {
    const tagRow = el('div', 'jellio-stream-picker-card-tags');
    tags.forEach(function (tag) {
      tagRow.appendChild(el('span', 'jellio-stream-picker-card-tag', tag));
    });
    card.appendChild(tagRow);
  }

  card.addEventListener('click', function () {
    closeStreamPicker();
    rememberSourceChoice(item, source);
    navigateTo(playHash(item.Id, source.Id));
  });

  return card;
}

// A picker with nothing real to pick between is not worth showing at
// all, same reasoning screens/player.js's own mid-playback Sources
// button already uses for a one-option list: straight to Play instead,
// same as before this existed.
//
// forceShow skips both that check and the remembered match below it:
// screens/detail.js's own Change Stream button passes it, the one real
// way back to this list once a remembered choice would otherwise keep
// skipping straight past it, same reasoning the in-player Sources menu
// already exists for once playback has actually started.
export async function openStreamPicker(item, options) {
  const forceShow = !!(options && options.forceShow);
  closeStreamPicker();

  let sources = [];
  try {
    sources = await getMediaSources(item.Id);
  } catch (err) {
    console.warn('Jellio: could not load sources for the stream picker', err);
  }

  if (!forceShow && sources.length <= 1) {
    navigateTo(playHash(item.Id, sources[0] && sources[0].Id));
    return;
  }

  if (!forceShow) {
    const remembered = findRememberedSource(item, sources);
    if (remembered) {
      navigateTo(playHash(item.Id, remembered.Id));
      return;
    }
  }

  const overlay = el('div', 'jellio-stream-picker-overlay');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Choose a stream');
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeStreamPicker();
  });
  document.addEventListener('keydown', handleKeydown);

  const backdropTag = item.BackdropImageTags && item.BackdropImageTags[0];
  const posterTag = item.ImageTags && item.ImageTags.Primary;
  if (backdropTag) {
    overlay.style.backgroundImage = "url('" + getImageUrl(item.Id, 'Backdrop', { tag: backdropTag, maxWidth: 1600 }) + "')";
  } else if (posterTag) {
    overlay.style.backgroundImage = "url('" + getImageUrl(item.Id, 'Primary', { tag: posterTag, maxWidth: 1600 }) + "')";
  }

  overlay.appendChild(el('div', 'jellio-stream-picker-dim'));

  const panel = el('div', 'jellio-stream-picker-panel');

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jellio-stream-picker-close';
  closeButton.setAttribute('aria-label', 'Close');
  const closeIcon = el('span', 'material-icons close');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeButton.appendChild(closeIcon);
  closeButton.addEventListener('click', closeStreamPicker);
  panel.appendChild(closeButton);

  const left = el('div', 'jellio-stream-picker-left');
  if (posterTag) {
    const poster = el('div', 'jellio-stream-picker-poster');
    poster.style.backgroundImage = "url('" + getImageUrl(item.Id, 'Primary', { tag: posterTag, maxWidth: 400 }) + "')";
    left.appendChild(poster);
  }

  // Its own wrapper rather than left's own direct children: the mobile
  // breakpoint below sits the poster and this text block side by side
  // in a row, but the text itself (series name, episode code, episode
  // title) still needs to read top to bottom either way, and a flat
  // row of siblings cannot do both at once.
  const leftText = el('div', 'jellio-stream-picker-left-text');
  const isEpisode = item.Type === 'Episode' && !!item.SeriesName;
  leftText.appendChild(el('div', 'jellio-stream-picker-heading', isEpisode ? item.SeriesName : item.Name || ''));
  if (isEpisode) {
    const hasSeason = typeof item.ParentIndexNumber === 'number';
    const hasEpisode = typeof item.IndexNumber === 'number';
    const code = hasSeason && hasEpisode ? 'S' + item.ParentIndexNumber + ' E' + item.IndexNumber : '';
    if (code) leftText.appendChild(el('div', 'jellio-stream-picker-episode', code));
    leftText.appendChild(el('div', 'jellio-stream-picker-episode-title', item.Name || ''));
  }
  left.appendChild(leftText);
  panel.appendChild(left);

  const right = el('div', 'jellio-stream-picker-right');
  right.appendChild(el('div', 'jellio-stream-picker-count', sources.length + ' streams found'));
  const list = el('div', 'jellio-stream-picker-list');
  sources.forEach(function (source) {
    list.appendChild(buildSourceCard(item, source));
  });
  right.appendChild(list);
  panel.appendChild(right);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
