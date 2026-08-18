// Real playback: PlaybackInfo negotiation, a bare <video> element, and
// real session reporting, the same mechanism JMSFusion's own player uses
// (confirmed against its real source before writing any of this), not
// jellyfin-web's own playbackManager, which this runtime cannot reach.
// Also owns a pause screen overlay (Jellyfin-PauseScreen's technique), an
// up next episode preview (no native jellyfin-web up next dialog to
// reskin the way the original Jellio codebase's own InPlayer Episode
// Preview slice could, that dialog only exists inside jellyfin-web's own
// player bundle, unreachable from a runtime with its own <video>
// element, so this is a real overlay built from scratch instead), and a
// skip intro/credits button, a soft dependency on the community Intro
// Skipper plugin's own real REST API (confirmed against its source
// before writing this, see runtime/api.js's own getIntroSkipperSegments)
// rather than jellyfin-web's own player chrome hooks, unreachable here
// for the same reason as everything else in this file.
import {
  getItemDetails,
  getPlaybackInfo,
  getMediaSources,
  buildStreamUrl,
  canBrowserDirectPlay,
  reportPlaybackStart,
  reportPlaybackProgress,
  reportPlaybackStopped,
  startSleepTimer,
  cancelSleepTimer,
  getSleepTimerStatus,
  getImageUrl,
  getSubtitleStreams,
  buildSubtitleUrl,
  getNextEpisode,
  getIntroSkipperSegments,
  TICKS_PER_SECOND,
} from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';
import { invalidateHomeSections } from './home.js';
import { sourceLabel } from '../components/streamPicker.js';

const PROGRESS_REPORT_MS = 5000;
const SLEEP_TIMER_OPTIONS = [15, 30, 45, 60, 90];
const SUBTITLE_STYLE_KEY = 'jellioSubtitleStyle';
const SUBTITLE_SIZES = [
  { value: 'small', label: 'Small', rem: 1 },
  { value: 'medium', label: 'Medium', rem: 1.3 },
  { value: 'large', label: 'Large', rem: 1.7 },
  { value: 'xlarge', label: 'Extra large', rem: 2.1 },
];
const SUBTITLE_BACKGROUNDS = [
  { value: 'none', label: 'None', color: 'transparent' },
  { value: 'semi', label: 'Semi', color: 'rgb(0 0 0 / 0.5)' },
  { value: 'solid', label: 'Solid', color: 'rgb(0 0 0 / 0.9)' },
];
const DEFAULT_SUBTITLE_STYLE = { size: 'medium', background: 'semi' };

// Persisted the same way this runtime persists anything client only
// (avatar picker's own preset choice, sleep timer's own real server
// side state aside): plain localStorage, no server round trip for a
// display preference nothing server side needs to know about.
function loadSubtitleStyle() {
  try {
    const raw = window.localStorage.getItem(SUBTITLE_STYLE_KEY);
    if (!raw) return Object.assign({}, DEFAULT_SUBTITLE_STYLE);
    const parsed = JSON.parse(raw);
    return {
      size: SUBTITLE_SIZES.some((s) => s.value === parsed.size) ? parsed.size : DEFAULT_SUBTITLE_STYLE.size,
      background: SUBTITLE_BACKGROUNDS.some((b) => b.value === parsed.background)
        ? parsed.background
        : DEFAULT_SUBTITLE_STYLE.background,
    };
  } catch (err) {
    return Object.assign({}, DEFAULT_SUBTITLE_STYLE);
  }
}

function saveSubtitleStyle(style) {
  try {
    window.localStorage.setItem(SUBTITLE_STYLE_KEY, JSON.stringify(style));
  } catch (err) {
    // A private/full storage quota is not worth surfacing here, the
    // style still applies for the rest of this playback session.
  }
}

// ::cue only takes the values this runtime's own stylesheet sets on it
// (css/app.css's own .jellio-player-video::cue rule reads these same
// two custom properties), inherited down from whatever sets them on
// the video element itself, real behaviour every Chromium/Firefox
// WebVTT renderer already gives a custom property, not something this
// runtime is guessing works.
function applySubtitleStyle(video, style) {
  const size = SUBTITLE_SIZES.filter((s) => s.value === style.size)[0] || SUBTITLE_SIZES[1];
  const background = SUBTITLE_BACKGROUNDS.filter((b) => b.value === style.background)[0] || SUBTITLE_BACKGROUNDS[1];
  video.style.setProperty('--jellio-subtitle-size', size.rem + 'rem');
  video.style.setProperty('--jellio-subtitle-bg', background.color);
}

// Fallback only, when Intro Skipper has no Credits segment for this
// episode: 2 minutes before the end, NuvioWeb's own real default
// (js/ui/screens/player/playerNextEpisodeRules.js, MINUTES_BEFORE_END
// mode), not re-derived. Real credits segments below make this the
// less common path, not the whole rule.
const UPNEXT_FALLBACK_TRIGGER_SECONDS = 120;
const UPNEXT_COUNTDOWN_SECONDS = 15;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildUpNextOverlay(episode, onPlayNow, onDismiss) {
  const overlay = el('div', 'jellio-player-upnext jellio-player-upnext-hidden');

  const thumbTag = (episode.ImageTags && episode.ImageTags.Primary) || episode.ParentThumbImageTag;
  const thumb = el('div', 'jellio-player-upnext-thumb');
  if (thumbTag) {
    thumb.style.backgroundImage = 'url(' + getImageUrl(episode.Id, 'Primary', { tag: thumbTag, maxWidth: 400 }) + ')';
  }
  overlay.appendChild(thumb);

  const body = el('div', 'jellio-player-upnext-body');
  body.appendChild(el('div', 'jellio-player-upnext-eyebrow', 'Next Episode'));
  const epLabel =
    episode.IndexNumber != null && episode.ParentIndexNumber != null
      ? 'S' + episode.ParentIndexNumber + ' E' + episode.IndexNumber + ' · '
      : '';
  body.appendChild(el('div', 'jellio-player-upnext-title', epLabel + (episode.Name || '')));

  const actions = el('div', 'jellio-player-upnext-actions');
  const playButton = el('button', 'jellio-player-upnext-play', 'Play now');
  playButton.type = 'button';
  playButton.addEventListener('click', onPlayNow);
  const dismissButton = el('button', 'jellio-player-upnext-dismiss', 'Dismiss');
  dismissButton.type = 'button';
  dismissButton.setAttribute('aria-label', 'Dismiss next episode preview');
  dismissButton.addEventListener('click', onDismiss);
  actions.appendChild(playButton);
  actions.appendChild(dismissButton);
  body.appendChild(actions);
  overlay.appendChild(body);

  return { overlay: overlay, playButton: playButton };
}

// A real choice instead of always just seeking straight to the saved
// position, ported from Harbor's own player/resume-prompt.tsx idea:
// shown once, over the paused frame at that exact position (the video
// element is already seeked there by the time this appears, see
// renderPlayer's own loadedmetadata handler), Start Over is a real
// choice this runtime did not offer before rather than something to
// dig for elsewhere.
function buildResumePrompt(percent, onResume, onRestart) {
  const overlay = el('div', 'jellio-player-resume-overlay');
  const panel = el('div', 'jellio-player-resume-panel');
  panel.appendChild(el('div', 'jellio-player-resume-title', 'Resume playback?'));
  if (percent != null) {
    panel.appendChild(el('div', 'jellio-player-resume-subtitle', percent + '% watched'));
  }
  const actions = el('div', 'jellio-player-resume-actions');
  const resumeButton = el('button', 'jellio-player-resume-play', 'Resume');
  resumeButton.type = 'button';
  resumeButton.addEventListener('click', onResume);
  const restartButton = el('button', 'jellio-player-resume-restart', 'Start Over');
  restartButton.type = 'button';
  restartButton.addEventListener('click', onRestart);
  actions.appendChild(resumeButton);
  actions.appendChild(restartButton);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  return { overlay: overlay, resumeButton: resumeButton };
}

// Every failure below this point used to just console.warn and return
// undefined, leaving root exactly as blank as root.textContent = ''
// left it: picking a stream Gelato could no longer actually resolve
// (a dead debrid link, an expired scrape) read as playback simply not
// starting, no different from working correctly and just taking a
// moment, the same silent-failure shape already found and fixed on
// the search screen and the boot splash. A real message plus a real
// way back out of the dead route is the same fix again here.
function renderPlaybackError(root, itemId, message) {
  root.textContent = '';
  const wrap = el('div', 'jellio-player-error');
  wrap.appendChild(el('p', 'jellio-service-empty', message));
  const back = el('button', 'jellio-player-error-back', 'Back');
  back.type = 'button';
  back.addEventListener('click', function () {
    navigateTo(itemId ? '#/item?id=' + itemId : '#/home');
  });
  wrap.appendChild(back);
  root.appendChild(wrap);
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = function (n) {
    return n < 10 ? '0' + n : String(n);
  };
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

export async function renderPlayer(root, params) {
  root.textContent = '';
  root.className = 'jellio-content jellio-screen-player';

  const itemId = params.get('id');
  if (!itemId) {
    renderPlaybackError(root, null, 'Nothing to play.');
    return undefined;
  }

  let item;
  try {
    item = await getItemDetails(itemId);
  } catch (err) {
    console.warn('Jellio: could not load item for playback', err);
    renderPlaybackError(root, itemId, 'Could not load this title. Check your connection and try again.');
    return undefined;
  }

  const startTicks = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;

  // components/streamPicker.js's own real choice, when there was more
  // than one to choose from: negotiates that exact source instead of
  // whichever one GetPlaybackMediaSources would have defaulted to.
  // Absent on every other route that reaches here (a resumed Up Next
  // card, the hero's own Play button skipping the picker outright for
  // a one-source item), same default negotiation as before the picker
  // existed.
  const preferredMediaSourceId = params.get('mediaSourceId') || undefined;

  let playbackInfo;
  try {
    playbackInfo = await getPlaybackInfo(itemId, startTicks, preferredMediaSourceId);
  } catch (err) {
    console.warn('Jellio: could not negotiate playback', err);
    renderPlaybackError(root, itemId, 'Could not start playback. Check your connection and try again.');
    return undefined;
  }

  let mediaSource = playbackInfo && playbackInfo.MediaSources && playbackInfo.MediaSources[0];
  if (!mediaSource) {
    console.warn('Jellio: no playable media source for', itemId);
    renderPlaybackError(
      root,
      itemId,
      preferredMediaSourceId
        ? 'That stream is no longer available. Pick a different one.'
        : 'No playable stream was found for this title.',
    );
    return undefined;
  }

  const streamUrl = buildStreamUrl(itemId, mediaSource, startTicks);

  // A forced transcode (runtime/api.js's own canBrowserDirectPlay veto)
  // only ever encodes forward from the StartTimeTicks baked into
  // streamUrl above, nothing earlier exists in that output at all, so
  // video.currentTime === 0 there is really startTicks, not the title's
  // own real start. Direct play serves the whole file as is, so its own
  // currentTime already is the real position, offset 0. Real duration
  // comes from item.RunTimeTicks for the same reason: a live transcode
  // has no complete moov atom yet for video.duration to read.
  let streamIsTranscoded = !canBrowserDirectPlay(mediaSource);
  let streamOffsetTicks = streamIsTranscoded ? startTicks : 0;
  const durationSeconds = (item.RunTimeTicks || 0) / TICKS_PER_SECOND;

  // A real saved position asks first rather than always silently
  // seeking there: autoplay stays off until the reader actually picks
  // Resume or Start Over below, the paused frame at the saved position
  // showing through behind that choice instead of playback already
  // running underneath it.
  const hasResumePosition = startTicks > 0;

  const video = document.createElement('video');
  video.className = 'jellio-player-video';
  video.src = streamUrl;
  video.autoplay = !hasResumePosition;
  video.playsInline = true;

  let subtitleStyle = loadSubtitleStyle();
  applySubtitleStyle(video, subtitleStyle);

  const controls = el('div', 'jellio-player-controls');

  const backButton = el('button', 'jellio-player-back');
  backButton.type = 'button';
  backButton.setAttribute('aria-label', 'Back');
  const backIcon = el('span', 'material-icons arrow_back');
  backIcon.setAttribute('aria-hidden', 'true');
  backButton.appendChild(backIcon);
  backButton.addEventListener('click', function () {
    navigateTo('#/item?id=' + itemId);
  });

  const title = el('div', 'jellio-player-title', item.Name || '');

  const seekRow = el('div', 'jellio-player-seek-row');
  const currentTimeLabel = el('span', 'jellio-player-time', formatTime(startTicks / TICKS_PER_SECOND));
  const seekBar = document.createElement('input');
  seekBar.type = 'range';
  seekBar.className = 'jellio-player-seek';
  seekBar.min = '0';
  seekBar.max = '100';
  seekBar.value = '0';
  const durationLabel = el('span', 'jellio-player-time', '0:00');
  seekRow.appendChild(currentTimeLabel);
  seekRow.appendChild(seekBar);
  seekRow.appendChild(durationLabel);

  const playPauseButton = el('button', 'jellio-player-playpause');
  playPauseButton.type = 'button';
  playPauseButton.setAttribute('aria-label', 'Pause');
  const playPauseIcon = el('span', 'material-icons pause');
  playPauseIcon.setAttribute('aria-hidden', 'true');
  playPauseButton.appendChild(playPauseIcon);
  playPauseButton.addEventListener('click', function () {
    if (video.paused) attemptPlay();
    else video.pause();
  });

  seekBar.setAttribute('aria-label', 'Seek');

  const sleepButton = el('button', 'jellio-player-sleep');
  sleepButton.type = 'button';
  sleepButton.setAttribute('aria-label', 'Sleep timer');
  sleepButton.setAttribute('aria-haspopup', 'true');
  sleepButton.setAttribute('aria-expanded', 'false');
  const sleepIcon = el('span', 'material-icons bedtime');
  sleepIcon.setAttribute('aria-hidden', 'true');
  sleepButton.appendChild(sleepIcon);

  const sleepMenu = el('div', 'jellio-player-sleep-menu jellio-player-sleep-menu-hidden');
  const cancelOption = el('button', 'jellio-player-sleep-option', 'Cancel timer');
  cancelOption.type = 'button';
  cancelOption.addEventListener('click', function () {
    cancelSleepTimer().then(function () {
      sleepButton.classList.remove('jellio-player-sleep-active');
      sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
      sleepButton.setAttribute('aria-expanded', 'false');
    });
  });
  sleepMenu.appendChild(cancelOption);
  SLEEP_TIMER_OPTIONS.forEach(function (minutes) {
    const option = el('button', 'jellio-player-sleep-option', minutes + ' min');
    option.type = 'button';
    option.addEventListener('click', function () {
      startSleepTimer(minutes).then(function () {
        sleepButton.classList.add('jellio-player-sleep-active');
        sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
        sleepButton.setAttribute('aria-expanded', 'false');
      });
    });
    sleepMenu.appendChild(option);
  });

  sleepButton.addEventListener('click', function () {
    subtitleMenu.classList.add('jellio-player-sleep-menu-hidden');
    subtitleButton.setAttribute('aria-expanded', 'false');
    styleMenu.classList.add('jellio-player-sleep-menu-hidden');
    styleButton.setAttribute('aria-expanded', 'false');
    sourceMenu.classList.add('jellio-player-sleep-menu-hidden');
    sourceButton.setAttribute('aria-expanded', 'false');
    const nowHidden = sleepMenu.classList.toggle('jellio-player-sleep-menu-hidden');
    sleepButton.setAttribute('aria-expanded', String(!nowHidden));
  });

  getSleepTimerStatus()
    .then(function (status) {
      if (status && status.Active) sleepButton.classList.add('jellio-player-sleep-active');
    })
    .catch(function () {
      // No status yet is not an error worth surfacing here.
    });

  const subtitleButton = el('button', 'jellio-player-subtitles');
  subtitleButton.type = 'button';
  subtitleButton.setAttribute('aria-label', 'Subtitles');
  subtitleButton.setAttribute('aria-haspopup', 'true');
  subtitleButton.setAttribute('aria-expanded', 'false');
  const subtitleIcon = el('span', 'material-icons subtitles');
  subtitleIcon.setAttribute('aria-hidden', 'true');
  subtitleButton.appendChild(subtitleIcon);

  const subtitleMenu = el('div', 'jellio-player-sleep-menu jellio-player-sleep-menu-hidden');
  let activeTrack = null;

  function selectSubtitle(stream, optionButton) {
    if (activeTrack) {
      activeTrack.remove();
      activeTrack = null;
    }
    Array.prototype.forEach.call(subtitleMenu.children, function (child) {
      child.classList.remove('jellio-player-sleep-option-active');
    });
    if (optionButton) optionButton.classList.add('jellio-player-sleep-option-active');
    subtitleButton.classList.toggle('jellio-player-sleep-active', !!stream);
    if (!stream) {
      subtitleMenu.classList.add('jellio-player-sleep-menu-hidden');
      subtitleButton.setAttribute('aria-expanded', 'false');
      return;
    }
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = stream.DisplayTitle || stream.Language || 'Subtitle';
    track.srclang = stream.Language || '';
    track.src = buildSubtitleUrl(itemId, mediaSource.Id, stream);
    track.default = true;
    video.appendChild(track);
    activeTrack = track;
    track.addEventListener('load', function () {
      if (track.track) track.track.mode = 'showing';
    });
    subtitleMenu.classList.add('jellio-player-sleep-menu-hidden');
    subtitleButton.setAttribute('aria-expanded', 'false');
  }

  // Rebuildable rather than built once: a source switch below can hand
  // back a mediaSource with an entirely different subtitle track list
  // (a different scraped file has its own real embedded/external
  // tracks), so the menu has to reflect whichever mediaSource is
  // actually loaded right now, not the one playback started on.
  function rebuildSubtitleMenu() {
    subtitleMenu.textContent = '';
    const subtitleStreams = getSubtitleStreams(mediaSource);
    if (!subtitleStreams.length) {
      subtitleButton.disabled = true;
      return;
    }
    subtitleButton.disabled = false;
    const offOption = el('button', 'jellio-player-sleep-option jellio-player-sleep-option-active', 'Off');
    offOption.type = 'button';
    offOption.addEventListener('click', function () {
      selectSubtitle(null, offOption);
    });
    subtitleMenu.appendChild(offOption);
    subtitleStreams.forEach(function (stream) {
      const option = el('button', 'jellio-player-sleep-option', stream.DisplayTitle || stream.Language || 'Subtitle');
      option.type = 'button';
      option.addEventListener('click', function () {
        selectSubtitle(stream, option);
      });
      subtitleMenu.appendChild(option);
    });
  }

  subtitleButton.addEventListener('click', function () {
    sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
    sleepButton.setAttribute('aria-expanded', 'false');
    styleMenu.classList.add('jellio-player-sleep-menu-hidden');
    styleButton.setAttribute('aria-expanded', 'false');
    sourceMenu.classList.add('jellio-player-sleep-menu-hidden');
    sourceButton.setAttribute('aria-expanded', 'false');
    const nowHidden = subtitleMenu.classList.toggle('jellio-player-sleep-menu-hidden');
    subtitleButton.setAttribute('aria-expanded', String(!nowHidden));
  });

  rebuildSubtitleMenu();

  // A style preference rather than a per stream setting: it stays the
  // reader's own choice across whichever subtitle track, or item, they
  // pick next, same reasoning behind persisting it at all.
  const styleButton = el('button', 'jellio-player-subtitles');
  styleButton.type = 'button';
  styleButton.setAttribute('aria-label', 'Subtitle style');
  styleButton.setAttribute('aria-haspopup', 'true');
  styleButton.setAttribute('aria-expanded', 'false');
  const styleIcon = el('span', 'material-icons text_fields');
  styleIcon.setAttribute('aria-hidden', 'true');
  styleButton.appendChild(styleIcon);

  const styleMenu = el('div', 'jellio-player-style-menu jellio-player-sleep-menu-hidden');

  function buildStyleGroup(label, options, currentValue, onPick) {
    const group = el('div', 'jellio-player-style-group');
    group.appendChild(el('div', 'jellio-player-style-group-label', label));
    const optionRow = el('div', 'jellio-player-style-group-options');
    options.forEach(function (option) {
      const optionButton = el(
        'button',
        'jellio-player-sleep-option' + (option.value === currentValue ? ' jellio-player-sleep-option-active' : ''),
        option.label,
      );
      optionButton.type = 'button';
      optionButton.addEventListener('click', function () {
        onPick(option.value);
        Array.prototype.forEach.call(optionRow.children, function (child) {
          child.classList.remove('jellio-player-sleep-option-active');
        });
        optionButton.classList.add('jellio-player-sleep-option-active');
      });
      optionRow.appendChild(optionButton);
    });
    group.appendChild(optionRow);
    return group;
  }

  styleMenu.appendChild(
    buildStyleGroup('Size', SUBTITLE_SIZES, subtitleStyle.size, function (value) {
      subtitleStyle = Object.assign({}, subtitleStyle, { size: value });
      applySubtitleStyle(video, subtitleStyle);
      saveSubtitleStyle(subtitleStyle);
    }),
  );
  styleMenu.appendChild(
    buildStyleGroup('Background', SUBTITLE_BACKGROUNDS, subtitleStyle.background, function (value) {
      subtitleStyle = Object.assign({}, subtitleStyle, { background: value });
      applySubtitleStyle(video, subtitleStyle);
      saveSubtitleStyle(subtitleStyle);
    }),
  );

  styleButton.addEventListener('click', function () {
    sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
    sleepButton.setAttribute('aria-expanded', 'false');
    subtitleMenu.classList.add('jellio-player-sleep-menu-hidden');
    subtitleButton.setAttribute('aria-expanded', 'false');
    sourceMenu.classList.add('jellio-player-sleep-menu-hidden');
    sourceButton.setAttribute('aria-expanded', 'false');
    const nowHidden = styleMenu.classList.toggle('jellio-player-sleep-menu-hidden');
    styleButton.setAttribute('aria-expanded', String(!nowHidden));
  });

  // Every real alternate Gelato resolved for this item (Fields=
  // MediaSources on the item DTO, backed by GetStaticMediaSources, see
  // runtime/api.js's own getMediaSources header), not just the one
  // PlaybackInfo negotiated to start. Fetched in the background rather
  // than blocking playback on it: a picker with one real option in it
  // is not worth showing at all, so the button stays disabled until
  // there is something to switch to.
  const sourceButton = el('button', 'jellio-player-subtitles');
  sourceButton.type = 'button';
  sourceButton.disabled = true;
  sourceButton.setAttribute('aria-label', 'Sources');
  sourceButton.setAttribute('aria-haspopup', 'true');
  sourceButton.setAttribute('aria-expanded', 'false');
  const sourceIcon = el('span', 'material-icons hd');
  sourceIcon.setAttribute('aria-hidden', 'true');
  sourceButton.appendChild(sourceIcon);

  const sourceMenu = el('div', 'jellio-player-sleep-menu jellio-player-sleep-menu-hidden');
  let sourceOptions = [mediaSource];
  let switchingSource = false;

  // switchSource() below used to fail exactly as silently as the three
  // routes into this whole screen already fixed above: the old source
  // just kept playing (or sitting paused) with nothing telling the
  // reader the source they just picked did not actually take, reading
  // as switching streams simply not doing anything. A toast is enough
  // here, unlike those three: the player itself is not blank, there is
  // already a real screen worth keeping in front of the reader.
  let toastTimer = null;
  function showPlayerToast(message) {
    let toast = root.querySelector('.jellio-player-toast');
    if (!toast) {
      toast = el('div', 'jellio-player-toast');
      root.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('jellio-player-toast-visible');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('jellio-player-toast-visible');
    }, 4000);
  }

  // video.play() returns a promise that can reject (a still-loading
  // source, a browser autoplay policy, the source erroring out
  // server side) and nothing anywhere in this file was ever looking
  // at whether it did: the play/pause button, the resume prompt below,
  // all called it and moved on, so a rejection here read as clicking
  // Play and genuinely nothing happening, no different from the three
  // routes into this screen already fixed above for the same reason.
  function attemptPlay() {
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(function (err) {
        console.warn('Jellio: could not start playback', err);
        showPlayerToast('Could not start playback. Try pressing play again.');
      });
    }
  }

  // A forced transcode has no full file sitting on the server to seek
  // within, only whatever ffmpeg has produced so far starting from its
  // own StartTimeTicks, so reaching a new absolute position there means
  // asking the server for a fresh stream starting there instead of
  // moving video.currentTime, the same real reload switchSource() and
  // Start Over above already use for the same reason. Direct play
  // serves the whole file already, so a plain currentTime assignment
  // still works and stays instant.
  function seekToAbsoluteSeconds(targetSeconds) {
    if (streamIsTranscoded) {
      const targetTicks = Math.max(0, Math.round(targetSeconds * TICKS_PER_SECOND));
      const wasPlaying = !video.paused;
      streamOffsetTicks = targetTicks;
      video.src = buildStreamUrl(itemId, mediaSource, targetTicks);
      video.load();
      if (wasPlaying) attemptPlay();
    } else {
      video.currentTime = Math.max(0, targetSeconds);
    }
  }

  function rebuildSourceMenu() {
    sourceMenu.textContent = '';
    sourceOptions.forEach(function (source) {
      const option = el(
        'button',
        'jellio-player-sleep-option' + (source.Id === mediaSource.Id ? ' jellio-player-sleep-option-active' : ''),
        sourceLabel(source),
      );
      option.type = 'button';
      option.addEventListener('click', function () {
        sourceMenu.classList.add('jellio-player-sleep-menu-hidden');
        sourceButton.setAttribute('aria-expanded', 'false');
        if (source.Id !== mediaSource.Id) switchSource(source);
      });
      sourceMenu.appendChild(option);
    });
  }

  // Re-negotiates PlaybackInfo against the picked source at the exact
  // position playback is at right now, the same real POST every source
  // starts with, then swaps the <video> element's own src to match:
  // there is no in-place source swap on a live element, only a fresh
  // load, real behaviour every browser's own media element already has.
  async function switchSource(source) {
    if (switchingSource) return;
    switchingSource = true;
    const resumeTicks = currentPositionTicks();
    const wasPlaying = !video.paused;
    reportPlaybackStopped(itemId, mediaSource.Id, resumeTicks);
    try {
      const info = await getPlaybackInfo(itemId, resumeTicks, source.Id);
      const negotiated = info && info.MediaSources && info.MediaSources[0];
      if (!negotiated) {
        showPlayerToast('That stream is no longer available.');
        return;
      }
      mediaSource = negotiated;
      if (activeTrack) {
        activeTrack.remove();
        activeTrack = null;
      }
      hasReportedStart = false;
      streamIsTranscoded = !canBrowserDirectPlay(mediaSource);
      streamOffsetTicks = streamIsTranscoded ? resumeTicks : 0;
      video.src = buildStreamUrl(itemId, mediaSource, resumeTicks);
      video.load();
      if (wasPlaying) attemptPlay();
      rebuildSubtitleMenu();
      rebuildSourceMenu();
    } catch (err) {
      console.warn('Jellio: could not switch source', err);
      showPlayerToast('Could not switch streams. Check your connection and try again.');
    } finally {
      switchingSource = false;
    }
  }

  sourceButton.addEventListener('click', function () {
    sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
    sleepButton.setAttribute('aria-expanded', 'false');
    subtitleMenu.classList.add('jellio-player-sleep-menu-hidden');
    subtitleButton.setAttribute('aria-expanded', 'false');
    styleMenu.classList.add('jellio-player-sleep-menu-hidden');
    styleButton.setAttribute('aria-expanded', 'false');
    const nowHidden = sourceMenu.classList.toggle('jellio-player-sleep-menu-hidden');
    sourceButton.setAttribute('aria-expanded', String(!nowHidden));
  });

  getMediaSources(itemId)
    .then(function (sources) {
      if (sources.length > 1) {
        sourceOptions = sources;
        sourceButton.disabled = false;
        rebuildSourceMenu();
      }
    })
    .catch(function (err) {
      console.warn('Jellio: could not load alternate sources', err);
    });

  controls.appendChild(backButton);
  controls.appendChild(title);
  controls.appendChild(seekRow);
  controls.appendChild(playPauseButton);
  controls.appendChild(subtitleButton);
  controls.appendChild(subtitleMenu);
  controls.appendChild(styleButton);
  controls.appendChild(styleMenu);
  controls.appendChild(sourceButton);
  controls.appendChild(sourceMenu);
  controls.appendChild(sleepButton);
  controls.appendChild(sleepMenu);


  const pauseOverlay = el('div', 'jellio-player-pause-overlay');
  const backdropTag = item.BackdropImageTags && item.BackdropImageTags[0];
  if (backdropTag) {
    pauseOverlay.style.backgroundImage =
      'url(' + getImageUrl(itemId, 'Backdrop', { tag: backdropTag, maxWidth: 1600 }) + ')';
  }
  const pauseContent = el('div', 'jellio-player-pause-content');
  pauseContent.appendChild(el('div', 'jellio-player-pause-title', item.Name || ''));
  const pauseMeta = el('div', 'jellio-player-pause-meta');
  if (item.ProductionYear) pauseMeta.appendChild(el('span', null, String(item.ProductionYear)));
  if (item.OfficialRating) pauseMeta.appendChild(el('span', null, item.OfficialRating));
  pauseContent.appendChild(pauseMeta);
  if (item.Overview) {
    pauseContent.appendChild(el('p', 'jellio-player-pause-overview', item.Overview));
  }
  pauseOverlay.appendChild(pauseContent);

  const skipButton = el('button', 'jellio-player-skip jellio-player-skip-hidden', 'Skip Intro');
  skipButton.type = 'button';
  let skipSegments = null;
  let skipTargetSeconds = 0;

  function activeSkipSegment(currentTime) {
    if (!skipSegments) return null;
    const intro = skipSegments.Introduction;
    if (intro && intro.End > 0 && currentTime >= intro.Start && currentTime < intro.End) {
      return { label: 'Skip Intro', target: intro.End };
    }
    const credits = skipSegments.Credits;
    if (credits && credits.End > 0 && currentTime >= credits.Start && currentTime < credits.End) {
      return { label: 'Skip Credits', target: credits.End };
    }
    return null;
  }

  // Ported from NuvioWeb's own shouldShowNextEpisodeCard()
  // (js/ui/screens/player/playerNextEpisodeRules.js), not re-derived:
  // a real Credits segment (already fetched for the skip button above)
  // is what actually starts the outro, and showing the card there
  // reads as timed to the episode rather than to an arbitrary count
  // of seconds left. The fixed-seconds rule this used to run
  // unconditionally is now only the fallback for an episode Intro
  // Skipper has no segment data for at all.
  function shouldShowUpNextNow(currentTime, duration) {
    if (!duration) return false;
    const credits = skipSegments && skipSegments.Credits;
    if (credits && credits.End > 0 && credits.Start >= 0) {
      return currentTime >= credits.Start;
    }
    return duration - currentTime <= UPNEXT_FALLBACK_TRIGGER_SECONDS;
  }

  skipButton.addEventListener('click', function () {
    seekToAbsoluteSeconds(skipTargetSeconds);
  });

  getIntroSkipperSegments(itemId).then(function (result) {
    if (result && (result.Introduction || result.Credits)) skipSegments = result;
  });

  root.appendChild(video);
  root.appendChild(pauseOverlay);
  root.appendChild(skipButton);
  root.appendChild(controls);

  if (hasResumePosition) {
    const percent =
      item.UserData && item.UserData.PlayedPercentage != null
        ? Math.round(item.UserData.PlayedPercentage)
        : null;
    const resumePrompt = buildResumePrompt(
      percent,
      function () {
        resumePrompt.overlay.remove();
        attemptPlay();
      },
      function () {
        resumePrompt.overlay.remove();
        // video.currentTime = 0 alone used to just resume anyway,
        // reported live as clicking Start Over doing nothing: streamUrl
        // above was already built with this same real saved position
        // baked into it (buildStreamUrl's own StartTimeTicks), and for
        // anything routed through this runtime's own real forced
        // transcode fallback (runtime/api.js's own canBrowserDirectPlay,
        // routine on a scraped Gelato release), the server only ever
        // transcodes forward from that exact point on, nothing earlier
        // ever exists in that stream at all. Seeking to 0 on a stream
        // like that lands back on its own first available frame, the
        // saved position all over again, not the reader's own real
        // start of the title. Rebuilding the URL with a real 0 instead
        // asks the server for a real stream that actually starts there.
        hasReportedStart = false;
        streamOffsetTicks = 0;
        video.src = buildStreamUrl(itemId, mediaSource, 0);
        video.load();
        attemptPlay();
      },
    );
    root.appendChild(resumePrompt.overlay);
    resumePrompt.resumeButton.focus();
  }

  let nextEpisode = null;
  let upNextOverlay = null;
  let upNextPlayButton = null;
  let upNextShown = false;
  let upNextDismissed = false;
  let upNextCountdownInterval = null;
  let upNextCountdownRemaining = UPNEXT_COUNTDOWN_SECONDS;

  function playNextEpisode() {
    if (upNextCountdownInterval) {
      window.clearInterval(upNextCountdownInterval);
      upNextCountdownInterval = null;
    }
    if (nextEpisode) navigateTo('#/play?id=' + nextEpisode.Id);
  }

  function updateUpNextCountdown() {
    if (upNextPlayButton) upNextPlayButton.textContent = 'Play now (' + upNextCountdownRemaining + ')';
  }

  function showUpNext() {
    if (upNextShown || upNextDismissed || !upNextOverlay) return;
    upNextShown = true;
    upNextOverlay.classList.remove('jellio-player-upnext-hidden');
    upNextCountdownRemaining = UPNEXT_COUNTDOWN_SECONDS;
    updateUpNextCountdown();
    upNextCountdownInterval = window.setInterval(function () {
      upNextCountdownRemaining -= 1;
      updateUpNextCountdown();
      if (upNextCountdownRemaining <= 0) playNextEpisode();
    }, 1000);
  }

  function hideUpNext() {
    if (upNextCountdownInterval) {
      window.clearInterval(upNextCountdownInterval);
      upNextCountdownInterval = null;
    }
    upNextShown = false;
    if (upNextOverlay) upNextOverlay.classList.add('jellio-player-upnext-hidden');
  }

  function dismissUpNext() {
    hideUpNext();
    upNextDismissed = true;
  }

  if (item.Type === 'Episode') {
    getNextEpisode(item)
      .then(function (result) {
        if (!result) return;
        nextEpisode = result;
        const built = buildUpNextOverlay(result, playNextEpisode, dismissUpNext);
        upNextOverlay = built.overlay;
        upNextPlayButton = built.playButton;
        root.appendChild(upNextOverlay);
      })
      .catch(function (err) {
        console.warn('Jellio: could not resolve next episode', err);
      });
  }

  let hasReportedStart = false;
  let seeking = false;
  let lastReportedTicks = startTicks;
  // Set once cleanup() has actually run: removeAttribute('src') plus
  // load() below, on an element still holding the error listener, can
  // itself queue a second real error event on some browsers, arriving
  // after Back has already navigated this same root on to a different
  // screen. Without this, that late event still called
  // renderPlaybackError(root, ...) below and clobbered whatever had
  // since rendered into root, reported live as Back doing nothing (it
  // did navigate, this stale event just wrote right back over it).
  let screenTornDown = false;

  function currentPositionTicks() {
    return streamOffsetTicks + Math.round((video.currentTime || 0) * TICKS_PER_SECOND);
  }

  // A <video> element that fails to actually decode its own real src,
  // the browser's own generic broken-video placeholder painted over
  // whatever this screen had built around it, controls and all, with
  // nothing from this runtime itself saying why, reported live and
  // matching exactly what buildStreamUrl() above was doing wrong: a
  // Static direct play URL forced on a source getPlaybackInfo's own
  // real negotiation never actually said the browser could decode as
  // is. That real cause is fixed above, but a browser's own decode
  // failure is never fully preventable from here (a dead debrid link,
  // a codec still outside what this browser supports even
  // transcoded), so this stays regardless: before this screen ever
  // got a first real frame, the whole thing was dead already, same
  // treatment the three negotiation failures above already get: a
  // real message and a way back out rather than the browser's own
  // silent placeholder. After a first real frame did play, whatever
  // broke it after the fact gets the same toast switchSource()'s own
  // failures already use, the rest of this screen still being worth
  // keeping in front of the reader at that point.
  video.addEventListener('error', function () {
    if (screenTornDown) return;
    if (hasReportedStart) {
      showPlayerToast('Playback stopped unexpectedly. Try a different stream.');
      return;
    }
    cleanup();
    renderPlaybackError(
      root,
      itemId,
      'This stream could not be played. Try a different one from Change Stream.',
    );
  });

  video.addEventListener('loadedmetadata', function () {
    // streamUrl already starts encoding at startTicks server side for a
    // forced transcode (see streamOffsetTicks above), so seeking again
    // here would double the offset; only a direct play stream, the
    // whole file already sitting there, needs this real client side
    // seek to reach the saved position at all.
    if (startTicks > 0 && !streamIsTranscoded) {
      video.currentTime = startTicks / TICKS_PER_SECOND;
    }
    durationLabel.textContent = formatTime(durationSeconds);
  });

  video.addEventListener('timeupdate', function () {
    if (seeking) return;
    const positionSeconds = streamOffsetTicks / TICKS_PER_SECOND + (video.currentTime || 0);
    if (durationSeconds) {
      seekBar.value = String((positionSeconds / durationSeconds) * 100);
    }
    currentTimeLabel.textContent = formatTime(positionSeconds);

    if (!hasReportedStart) {
      hasReportedStart = true;
      reportPlaybackStart(itemId, mediaSource.Id, currentPositionTicks());
    }

    if (nextEpisode && !upNextDismissed && shouldShowUpNextNow(positionSeconds, durationSeconds)) {
      showUpNext();
    }

    const activeSegment = activeSkipSegment(positionSeconds);
    if (activeSegment) {
      skipTargetSeconds = activeSegment.target;
      skipButton.textContent = activeSegment.label;
      skipButton.classList.remove('jellio-player-skip-hidden');
    } else {
      skipButton.classList.add('jellio-player-skip-hidden');
    }
  });

  seekBar.addEventListener('input', function () {
    seeking = true;
    if (durationSeconds) {
      const target = (Number(seekBar.value) / 100) * durationSeconds;
      currentTimeLabel.textContent = formatTime(target);
    }
  });
  seekBar.addEventListener('change', function () {
    if (durationSeconds) {
      seekToAbsoluteSeconds((Number(seekBar.value) / 100) * durationSeconds);
    }
    seeking = false;
  });

  video.addEventListener('play', function () {
    playPauseIcon.className = 'material-icons pause';
    playPauseButton.setAttribute('aria-label', 'Pause');
    pauseOverlay.classList.remove('jellio-player-pause-overlay-visible');
  });
  video.addEventListener('pause', function () {
    playPauseIcon.className = 'material-icons play_arrow';
    playPauseButton.setAttribute('aria-label', 'Play');
    // Ending playback also fires pause, the overlay would just be in the
    // way of whatever screen comes next rather than useful here.
    if (hasReportedStart && !video.ended) {
      pauseOverlay.classList.add('jellio-player-pause-overlay-visible');
    }
  });

  const progressInterval = window.setInterval(function () {
    if (!hasReportedStart) return;
    lastReportedTicks = currentPositionTicks();
    reportPlaybackProgress(itemId, mediaSource.Id, lastReportedTicks, video.paused);
  }, PROGRESS_REPORT_MS);

  // A real function declaration, hoisted, rather than the plain arrow
  // this used to just return directly: the video's own error listener
  // above now calls this same real teardown itself on a dead first
  // load rather than duplicating what it already does, and needs to
  // reach it from earlier in this same function body.
  function cleanup() {
    if (screenTornDown) return;
    screenTornDown = true;
    window.clearInterval(progressInterval);
    if (upNextCountdownInterval) window.clearInterval(upNextCountdownInterval);
    if (hasReportedStart) {
      reportPlaybackStopped(itemId, mediaSource.Id, currentPositionTicks());
      // Up Next and Continue Watching are exactly the two home rows a
      // real playback session changes, so home's own preloaded sections
      // have to be re-derived the next time it's visited rather than
      // keep serving what was true before this session started.
      invalidateHomeSections();
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  return cleanup;
}
