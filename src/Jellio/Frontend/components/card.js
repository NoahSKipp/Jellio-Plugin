// Shared item card, used by every screen that renders a poster grid or row
// (home's own rows, the library grid). One definition so a later visual
// change (a hover state, a progress bar) only has one place to happen.
import { getImageUrl } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';
import {
  attachCardOptionsTrigger,
  openCardOptionsMenu,
  toggleWatched,
  toggleWatchlist,
  animateCardRemoval,
} from './cardOptionsMenu.js';
import { openStreamPicker } from './streamPicker.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Rebuilds just the watched badge/progress bar over the poster image,
// its own function so the options menu's mark watched/unwatched action
// can refresh a card already on screen instead of needing a full row
// re-render for something this small.
function paintCardState(imageWrap, item) {
  const existingBadge = imageWrap.querySelector('.jellio-card-watched');
  if (existingBadge) existingBadge.remove();
  const existingProgress = imageWrap.querySelector('.jellio-card-progress');
  if (existingProgress) existingProgress.remove();

  const userData = item.UserData || {};
  if (userData.Played) {
    const badge = document.createElement('span');
    badge.className = 'jellio-card-watched material-icons check';
    badge.setAttribute('aria-hidden', 'true');
    imageWrap.appendChild(badge);
  } else if (userData.PlayedPercentage > 0) {
    const progress = document.createElement('div');
    progress.className = 'jellio-card-progress';
    const fill = document.createElement('div');
    fill.className = 'jellio-card-progress-fill';
    fill.style.width = Math.min(100, userData.PlayedPercentage) + '%';
    progress.appendChild(fill);
    imageWrap.appendChild(progress);
  }
}

// Up Next/Continue Watching hand this the same Episode item Jellyfin
// itself uses for the row: item.Name is only ever the episode's own
// title ("Chapter One"), the series it belongs to and where in it
// this episode sits are separate real fields on the same object
// (SeriesName, ParentIndexNumber, IndexNumber), already present on
// every real /Shows/NextUp and .../Items/Resume response without
// asking for extra Fields, real feedback was that a bare episode
// title with no series name gave no way to tell rows of unrelated
// shows apart at a glance.
function episodeSubtitle(item) {
  const hasSeason = typeof item.ParentIndexNumber === 'number';
  const hasEpisode = typeof item.IndexNumber === 'number';
  let code = '';
  if (hasSeason && hasEpisode) {
    code = 'S' + item.ParentIndexNumber + ' E' + item.IndexNumber;
  } else if (hasEpisode) {
    code = 'E' + item.IndexNumber;
  }
  if (code && item.Name) return code + ': ' + item.Name;
  return code || item.Name || '';
}

// Real feedback, the previous Jellio codebase's own real design intent
// carried forward but changed on purpose: a wide Play button sits next
// to a fixed More (three dot) button by default, Watchlist and Mark
// Watched only fading in between them on hover/focus. Play shrinking
// by exactly the same amount Watchlist+Mark Watched grow by (pure
// flexbox, no JS measuring) is what keeps More's own real screen
// position constant through that whole animation, the one real
// difference from that older codebase's own version, where the three
// dot button itself used to slide, real feedback called that
// disorienting to land a second real tap on.
function buildCardActions(item, card, imageWrap, options, onChanged) {
  const opts = options || {};
  const bar = el('div', 'jellio-card-actions');

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'jellio-card-action jellio-card-action-play';
  playButton.setAttribute('aria-label', 'Play');
  playButton.appendChild(el('span', 'material-icons play_arrow'));
  playButton.addEventListener('click', function (event) {
    event.stopPropagation();
    openStreamPicker(item);
  });

  const watchlistButton = document.createElement('button');
  watchlistButton.type = 'button';
  watchlistButton.className = 'jellio-card-action jellio-card-action-watchlist';
  function paintWatchlist() {
    const isWatchlisted = !!(item.UserData && item.UserData.IsFavorite);
    watchlistButton.classList.toggle('jellio-card-action-active', isWatchlisted);
    watchlistButton.setAttribute('aria-label', isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist');
    watchlistButton.textContent = '';
    watchlistButton.appendChild(el('span', 'material-icons ' + (isWatchlisted ? 'bookmark_added' : 'bookmark_add')));
  }
  paintWatchlist();
  watchlistButton.addEventListener('click', function (event) {
    event.stopPropagation();
    watchlistButton.disabled = true;
    toggleWatchlist(item, onChanged)
      .then(paintWatchlist)
      .catch(function (err) {
        console.warn('Jellio: could not update watchlist state', err);
      })
      .finally(function () {
        watchlistButton.disabled = false;
      });
  });

  const watchedButton = document.createElement('button');
  watchedButton.type = 'button';
  watchedButton.className = 'jellio-card-action jellio-card-action-watched';
  function paintWatched() {
    const isPlayed = !!(item.UserData && item.UserData.Played);
    watchedButton.classList.toggle('jellio-card-action-active', isPlayed);
    watchedButton.setAttribute('aria-label', isPlayed ? 'Mark as unwatched' : 'Mark as watched');
    watchedButton.textContent = '';
    watchedButton.appendChild(el('span', 'material-icons check'));
  }
  paintWatched();
  watchedButton.addEventListener('click', function (event) {
    event.stopPropagation();
    watchedButton.disabled = true;
    toggleWatched(
      item,
      Object.assign({}, opts, {
        onRemoved: function () {
          animateCardRemoval(card);
        },
      }),
      onChanged,
    )
      .then(function () {
        paintWatched();
        paintCardState(imageWrap, item);
      })
      .catch(function (err) {
        console.warn('Jellio: could not update watched state', err);
      })
      .finally(function () {
        watchedButton.disabled = false;
      });
  });

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'jellio-card-action jellio-card-action-more';
  moreButton.setAttribute('aria-label', 'More options');
  moreButton.appendChild(el('span', 'material-icons more_vert'));
  moreButton.addEventListener('click', function (event) {
    event.stopPropagation();
    openCardOptionsMenu(
      item,
      moreButton.getBoundingClientRect(),
      onChanged,
      Object.assign({}, opts, {
        onRemoved: function () {
          animateCardRemoval(card);
        },
      }),
    );
  });

  bar.appendChild(playButton);
  bar.appendChild(watchlistButton);
  bar.appendChild(watchedButton);
  bar.appendChild(moreButton);
  return bar;
}

export function buildCard(item, options) {
  const isEpisode = item.Type === 'Episode' && !!item.SeriesName;

  const card = document.createElement('div');
  card.className = 'jellio-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', isEpisode ? item.SeriesName + ' - ' + episodeSubtitle(item) : item.Name || '');

  const imageWrap = document.createElement('div');
  imageWrap.className = 'jellio-card-image-wrap';

  const imageTag = item.ImageTags && item.ImageTags.Primary;
  if (imageTag) {
    const img = document.createElement('img');
    img.className = 'jellio-card-image';
    // quality: 85 alongside the existing maxWidth: every card grid can
    // hold a hundred-plus of these at once, and a poster shrunk to
    // this real display size loses nothing visible at a JPEG quality
    // a shade under the server's own real default, real bytes saved on
    // every single one of them for it.
    img.src = getImageUrl(item.Id, 'Primary', { tag: imageTag, maxWidth: 400, quality: 85 });
    img.alt = item.Name || '';
    img.loading = 'lazy';
    imageWrap.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'jellio-card-image jellio-card-image-empty';
    imageWrap.appendChild(placeholder);
  }

  paintCardState(imageWrap, item);

  function handleChanged(updatedItem) {
    paintCardState(imageWrap, updatedItem);
  }
  imageWrap.appendChild(buildCardActions(item, card, imageWrap, options, handleChanged));

  card.appendChild(imageWrap);

  const title = document.createElement('div');
  title.className = 'jellio-card-title';
  title.textContent = isEpisode ? item.SeriesName : item.Name || '';
  card.appendChild(title);

  if (isEpisode) {
    const subtitle = document.createElement('div');
    subtitle.className = 'jellio-card-subtitle';
    subtitle.textContent = episodeSubtitle(item);
    card.appendChild(subtitle);
  }

  // #/item rather than native's own #/details: screens/detail.js's own
  // Play button hands off to the real #/details route for actual
  // playback (playbackManager.play() is a plain ES module export, never
  // reachable from here, see that file's own header), so this runtime's
  // own detail screen has to live at a route native does not already
  // own, or the two would collide on the same hash.
  card.addEventListener('click', function () {
    navigateTo('#/item?id=' + item.Id);
  });
  card.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateTo('#/item?id=' + item.Id);
    }
  });

  attachCardOptionsTrigger(
    card,
    item,
    handleChanged,
    options,
  );

  return card;
}
