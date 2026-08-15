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
  buildStreamUrl,
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
  if (!itemId) return undefined;

  let item;
  try {
    item = await getItemDetails(itemId);
  } catch (err) {
    console.warn('Jellio: could not load item for playback', err);
    return undefined;
  }

  const startTicks = (item.UserData && item.UserData.PlaybackPositionTicks) || 0;

  let playbackInfo;
  try {
    playbackInfo = await getPlaybackInfo(itemId, startTicks);
  } catch (err) {
    console.warn('Jellio: could not negotiate playback', err);
    return undefined;
  }

  const mediaSource = playbackInfo && playbackInfo.MediaSources && playbackInfo.MediaSources[0];
  if (!mediaSource) {
    console.warn('Jellio: no playable media source for', itemId);
    return undefined;
  }

  const streamUrl = buildStreamUrl(itemId, mediaSource, startTicks);

  const video = document.createElement('video');
  video.className = 'jellio-player-video';
  video.src = streamUrl;
  video.autoplay = true;
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
    if (video.paused) video.play();
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

  const subtitleStreams = getSubtitleStreams(mediaSource);
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

  if (subtitleStreams.length) {
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
    subtitleButton.addEventListener('click', function () {
      sleepMenu.classList.add('jellio-player-sleep-menu-hidden');
      sleepButton.setAttribute('aria-expanded', 'false');
      styleMenu.classList.add('jellio-player-sleep-menu-hidden');
      styleButton.setAttribute('aria-expanded', 'false');
      const nowHidden = subtitleMenu.classList.toggle('jellio-player-sleep-menu-hidden');
      subtitleButton.setAttribute('aria-expanded', String(!nowHidden));
    });
  } else {
    subtitleButton.disabled = true;
  }

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
    const nowHidden = styleMenu.classList.toggle('jellio-player-sleep-menu-hidden');
    styleButton.setAttribute('aria-expanded', String(!nowHidden));
  });

  controls.appendChild(backButton);
  controls.appendChild(title);
  controls.appendChild(seekRow);
  controls.appendChild(playPauseButton);
  controls.appendChild(subtitleButton);
  controls.appendChild(subtitleMenu);
  controls.appendChild(styleButton);
  controls.appendChild(styleMenu);
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
    video.currentTime = skipTargetSeconds;
  });

  getIntroSkipperSegments(itemId).then(function (result) {
    if (result && (result.Introduction || result.Credits)) skipSegments = result;
  });

  root.appendChild(video);
  root.appendChild(pauseOverlay);
  root.appendChild(skipButton);
  root.appendChild(controls);

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

  function currentPositionTicks() {
    return Math.round((video.currentTime || 0) * TICKS_PER_SECOND);
  }

  video.addEventListener('loadedmetadata', function () {
    if (startTicks > 0) {
      video.currentTime = startTicks / TICKS_PER_SECOND;
    }
    durationLabel.textContent = formatTime(video.duration);
  });

  video.addEventListener('timeupdate', function () {
    if (seeking) return;
    if (video.duration) {
      seekBar.value = String((video.currentTime / video.duration) * 100);
    }
    currentTimeLabel.textContent = formatTime(video.currentTime);

    if (!hasReportedStart) {
      hasReportedStart = true;
      reportPlaybackStart(itemId, mediaSource.Id, currentPositionTicks());
    }

    if (nextEpisode && !upNextDismissed && shouldShowUpNextNow(video.currentTime, video.duration)) {
      showUpNext();
    }

    const activeSegment = activeSkipSegment(video.currentTime);
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
    if (video.duration) {
      const target = (Number(seekBar.value) / 100) * video.duration;
      currentTimeLabel.textContent = formatTime(target);
    }
  });
  seekBar.addEventListener('change', function () {
    if (video.duration) {
      video.currentTime = (Number(seekBar.value) / 100) * video.duration;
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

  return function cleanup() {
    window.clearInterval(progressInterval);
    if (upNextCountdownInterval) window.clearInterval(upNextCountdownInterval);
    if (hasReportedStart) {
      reportPlaybackStopped(itemId, mediaSource.Id, currentPositionTicks());
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
