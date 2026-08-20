// Metadata view for one item: backdrop, title, overview, genres, cast.
// Play opens components/streamPicker.js's own picker first when there
// is real more than one source to choose from (that same file falls
// straight through to #/play, real playback, PlaybackInfo negotiation
// plus a bare <video> element, see screens/player.js's own header for
// why that needed no access to jellyfin-web's own playbackManager at
// all, when there is not).
import { getItemDetails, getImageUrl, getSeasons, getEpisodes } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';
import { openStreamPicker } from '../components/streamPicker.js';
import { renderLoading, renderRetry } from '../components/networkState.js';
import { describeNetworkFailure } from '../runtime/network.js';
import { toggleWatched, toggleWatchlist } from '../components/cardOptionsMenu.js';

// A failed item lookup used to just console.warn and return, leaving
// root exactly as blank as root.textContent = '' left it: a series's
// own episode card navigates straight here, so a reader clicking an
// episode saw nothing happen at all, same silent failure shape found
// and fixed on the search screen, the boot splash and the player
// screen's own three negotiation failures. A real message plus a real
// way back is the same fix again here, now a real Retry too
// (components/networkState.js's own renderRetry()) rather than only
// Back to Home: on a bad connection the same lookup often just needs
// asking again, not a trip back to a whole different screen first.
function renderDetailError(root, message, onRetry) {
  renderRetry(root, message, onRetry, { onBack: function () { navigateTo('#/home'); }, backLabel: 'Back to Home' });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}


function buildEpisodeCard(episode) {
  const card = el('div', 'jellio-episode-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', episode.Name || '');
  const thumbTag =
    (episode.ImageTags && episode.ImageTags.Primary) ||
    (episode.ParentThumbImageTag && episode.ParentThumbImageTag);
  const thumb = el('div', 'jellio-episode-thumb');
  if (thumbTag) {
    thumb.style.backgroundImage =
      'url(' + getImageUrl(episode.Id, 'Primary', { tag: thumbTag, maxWidth: 500 }) + ')';
  }
  if (episode.IndexNumber != null) {
    thumb.appendChild(el('span', 'jellio-episode-badge', 'E' + episode.IndexNumber));
  }
  card.appendChild(thumb);
  card.appendChild(el('div', 'jellio-episode-title', episode.Name || ''));
  if (episode.Overview) {
    card.appendChild(el('div', 'jellio-episode-overview', episode.Overview));
  }
  card.addEventListener('click', function () {
    navigateTo('#/item?id=' + episode.Id);
  });
  card.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigateTo('#/item?id=' + episode.Id);
    }
  });
  return card;
}

// Season tabs plus the current season's own episode track, appended in
// place once seasons resolve rather than blocking the rest of the screen
// on a series with a lot of them. Real endpoints, GET /Shows/{id}/Seasons
// and GET /Shows/{id}/Episodes, the dedicated show hierarchy API.
async function buildSeasonsSection(seriesId) {
  let seasons;
  try {
    seasons = await getSeasons(seriesId);
  } catch (err) {
    console.warn('Jellio: could not load seasons', err);
    return null;
  }
  if (!seasons.length) return null;

  const section = el('section', 'jellio-detail-seasons');
  section.appendChild(el('h2', 'jellio-row-title', 'Episodes'));

  const tabs = el('div', 'jellio-season-tabs');
  tabs.setAttribute('role', 'tablist');
  const track = el('div', 'jellio-episode-track');
  section.appendChild(tabs);
  section.appendChild(track);

  function selectSeason(season, tabButton) {
    Array.prototype.forEach.call(tabs.children, function (child) {
      child.classList.remove('jellio-season-tab-selected');
      child.setAttribute('aria-selected', 'false');
    });
    tabButton.classList.add('jellio-season-tab-selected');
    tabButton.setAttribute('aria-selected', 'true');
    track.textContent = '';
    getEpisodes(seriesId, season.Id)
      .then(function (episodes) {
        episodes.forEach(function (episode) {
          track.appendChild(buildEpisodeCard(episode));
        });
      })
      .catch(function (err) {
        console.warn('Jellio: could not load episodes', err);
      });
  }

  seasons.forEach(function (season, index) {
    const tab = el('button', 'jellio-season-tab', season.Name || '');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.addEventListener('click', function () {
      selectSeason(season, tab);
    });
    tabs.appendChild(tab);
    if (index === 0) selectSeason(season, tab);
  });

  return section;
}

function buildCastRow(people) {
  const cast = (people || []).filter(function (person) {
    return person.Type === 'Actor';
  });
  if (!cast.length) return null;

  const section = el('section', 'jellio-detail-cast');
  section.appendChild(el('h2', 'jellio-row-title', 'Cast'));
  const track = el('div', 'jellio-row-track');
  cast.slice(0, 20).forEach(function (person) {
    const card = el('div', 'jellio-cast-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', person.Name || '');
    if (person.PrimaryImageTag) {
      const img = el('img', 'jellio-cast-image');
      img.src = getImageUrl(person.Id, 'Primary', { tag: person.PrimaryImageTag, maxWidth: 200 });
      img.alt = person.Name || '';
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      card.appendChild(el('div', 'jellio-cast-image jellio-cast-image-empty'));
    }
    card.appendChild(el('div', 'jellio-cast-name', person.Name || ''));
    if (person.Role) card.appendChild(el('div', 'jellio-cast-role', person.Role));
    card.addEventListener('click', function () {
      navigateTo('#/person?id=' + person.Id);
    });
    card.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigateTo('#/person?id=' + person.Id);
      }
    });
    track.appendChild(card);
  });
  section.appendChild(track);
  return section;
}

export async function renderDetail(root, params) {
  root.textContent = '';
  root.className = 'jellio-content jellio-screen-detail';

  const itemId = params.get('id');
  if (!itemId) {
    renderDetailError(root, 'Nothing to show.', null);
    return;
  }

  // Shown the instant this screen starts fetching, not after: a card's
  // own click already navigates here synchronously (components/card.js's
  // own click handler), so the only thing standing between that tap and
  // something visible was this screen's own await below. On a slow
  // connection that gap used to just read as the tap doing nothing.
  renderLoading(root);

  let item;
  try {
    item = await getItemDetails(itemId);
  } catch (err) {
    console.warn('Jellio: could not load item details', err);
    renderDetailError(root, describeNetworkFailure('this title', err), function () {
      renderDetail(root, params);
    });
    return;
  }

  root.textContent = '';

  // A title reached straight from a search result carries a synthetic
  // placeholder id, not a real library one, confirmed against Gelato's
  // own real source: SearchActionFilter's own ConvertMetasToDtos sets
  // dto.Id to a Stremio URI hash and only saves the real metadata for
  // later insertion. The very first request under that id (this one)
  // is what actually triggers the insert, and the response above
  // already describes the real, canonical item, real id included, so
  // every request this screen makes from here on addresses that one
  // directly rather than the placeholder still sitting in params. The
  // original codebase's own canonicalItemId.js exists for the same
  // reason (its own header documents the same mechanism, several
  // follow up requests otherwise all racing the same in-progress
  // insert under the same placeholder).
  const canonicalId = item.Id || itemId;
  // toggleWatched/toggleWatchlist below (components/cardOptionsMenu.js's
  // own shared real state calls, the same ones the poster grid's own
  // inline actions already use) both read item.Id directly, never the
  // canonicalId fallback above: keeping the two in sync here means
  // every downstream real call this screen makes, shared helper or
  // not, addresses the one real canonical id consistently.
  item.Id = canonicalId;

  const backdropTag = item.BackdropImageTags && item.BackdropImageTags[0];
  const hero = el('div', 'jellio-detail-hero');
  if (backdropTag) {
    hero.style.backgroundImage =
      'url(' + getImageUrl(canonicalId, 'Backdrop', { tag: backdropTag, maxWidth: 1600 }) + ')';
  }

  const heroContent = el('div', 'jellio-detail-hero-content');

  // An episode reached from Up Next/Continue Watching (components/
  // card.js's own click handler hands off to this exact route for any
  // item, episodes included) used to land here with no way back to
  // its own series at all, real feedback live: SeriesId/SeriesName are
  // real default BaseItemDto fields on an Episode, already present on
  // every real response here with no extra Fields request needed
  // (components/card.js's own episodeSubtitle() already reads the same
  // two fields off the same kind of response), so this is a real link
  // back, not a second lookup.
  if (item.Type === 'Episode' && item.SeriesId && item.SeriesName) {
    const seriesLink = el('button', 'jellio-detail-series-link', item.SeriesName);
    seriesLink.type = 'button';
    seriesLink.addEventListener('click', function () {
      navigateTo('#/item?id=' + item.SeriesId);
    });
    heroContent.appendChild(seriesLink);
  }

  const hasEpisodeCode = typeof item.ParentIndexNumber === 'number' && typeof item.IndexNumber === 'number';
  const titleText =
    item.Type === 'Episode' && hasEpisodeCode
      ? 'S' + item.ParentIndexNumber + ' E' + item.IndexNumber + ' · ' + (item.Name || '')
      : item.Name || '';
  heroContent.appendChild(el('h1', 'jellio-detail-title', titleText));

  const meta = el('div', 'jellio-detail-meta');
  if (item.ProductionYear) meta.appendChild(el('span', null, String(item.ProductionYear)));
  if (item.OfficialRating) meta.appendChild(el('span', null, item.OfficialRating));
  if (item.CommunityRating) meta.appendChild(el('span', null, item.CommunityRating.toFixed(1) + ' ★'));
  heroContent.appendChild(meta);

  if (item.Genres && item.Genres.length) {
    const genres = el('div', 'jellio-detail-genres', item.Genres.join(', '));
    heroContent.appendChild(genres);
  }

  // Real feedback: three separate wide pill buttons (Play, Change
  // Stream, Add to Watchlist) wrapped onto two real lines at most
  // mobile widths, nothing like Nuvio's own real hero action row
  // (screenshots checked before writing this). Play stays the one wide
  // pill; Watchlist and Mark Watched are icon only circles the same
  // real size as More, matching that same real reference, with Change
  // Stream moved behind More instead of sitting out as its own wide
  // pill for a choice most titles here only have one real answer to
  // anyway (components/streamPicker.js's own openStreamPicker already
  // skips straight to Play for a single source title).
  const actions = el('div', 'jellio-detail-actions');

  // A series has no video of its own, only its episodes do (each already
  // opens this same screen at its own item id, with its own working Play
  // button), so Play/Change Stream are skipped entirely here rather than
  // pointing at nothing playable; Watchlist/Mark Watched still apply to
  // the series itself.
  if (item.Type !== 'Series') {
    const playButton = el('button', 'jellio-detail-play');
    playButton.type = 'button';
    playButton.appendChild(el('span', 'material-icons play_arrow'));
    playButton.appendChild(el('span', null, 'Play'));
    playButton.addEventListener('click', function () {
      openStreamPicker(item);
    });
    actions.appendChild(playButton);
  }

  const watchlistButton = el('button', 'jellio-detail-icon-action jellio-detail-icon-action-collapsible');
  watchlistButton.type = 'button';
  function paintWatchlist() {
    const active = !!(item.UserData && item.UserData.IsFavorite);
    watchlistButton.classList.toggle('jellio-detail-icon-action-active', active);
    watchlistButton.setAttribute('aria-label', active ? 'Remove from Watchlist' : 'Add to Watchlist');
    watchlistButton.textContent = '';
    watchlistButton.appendChild(el('span', 'material-icons ' + (active ? 'bookmark_added' : 'bookmark_add')));
  }
  paintWatchlist();
  watchlistButton.addEventListener('click', function (event) {
    event.stopPropagation();
    watchlistButton.disabled = true;
    toggleWatchlist(item)
      .then(paintWatchlist)
      .catch(function (err) {
        console.warn('Jellio: could not update watchlist state', err);
      })
      .finally(function () {
        watchlistButton.disabled = false;
      });
  });
  actions.appendChild(watchlistButton);

  const watchedButton = el('button', 'jellio-detail-icon-action jellio-detail-icon-action-collapsible');
  watchedButton.type = 'button';
  function paintWatched() {
    const active = !!(item.UserData && item.UserData.Played);
    watchedButton.classList.toggle('jellio-detail-icon-action-active', active);
    watchedButton.setAttribute('aria-label', active ? 'Mark as unwatched' : 'Mark as watched');
    watchedButton.textContent = '';
    watchedButton.appendChild(el('span', 'material-icons check'));
  }
  paintWatched();
  watchedButton.addEventListener('click', function (event) {
    event.stopPropagation();
    watchedButton.disabled = true;
    toggleWatched(item, {})
      .then(paintWatched)
      .catch(function (err) {
        console.warn('Jellio: could not update watched state', err);
      })
      .finally(function () {
        watchedButton.disabled = false;
      });
  });
  actions.appendChild(watchedButton);

  // Play alone already reopens components/streamPicker.js's own picker
  // whenever there is real more than one source and "remember my
  // stream choice" is off; this exists for when it is on, real
  // feedback asked for a way back to the picker specifically without
  // going through Settings, for a remembered choice that stopped
  // working. forceChoice: true skips only that remembered shortcut, a
  // title with one real source still has nothing to change to either
  // way. A series has no stream of its own to change (each episode has
  // its own), so this is skipped there the same as Play above.
  if (item.Type !== 'Series') {
    const changeStreamButton = el('button', 'jellio-detail-icon-action jellio-detail-icon-action-collapsible');
    changeStreamButton.type = 'button';
    changeStreamButton.setAttribute('aria-label', 'Change Stream');
    changeStreamButton.appendChild(el('span', 'material-icons sync_alt'));
    changeStreamButton.addEventListener('click', function (event) {
      event.stopPropagation();
      openStreamPicker(item, { forceChoice: true });
    });
    actions.appendChild(changeStreamButton);
  }

  // Real feedback: Watchlist, Mark Watched and Change Stream used to
  // sit there permanently, real Nuvio screenshots confirmed that is
  // not the real reference either, only Play and More show by default
  // there, the other three only appearing once More itself is actually
  // tapped, More's own colour (and its own three dots rotating flat)
  // flipping to show it is now the one selected. A second real tap on
  // More collapses it straight back, a plain real toggle, the same as
  // tapping anywhere else on the page; real feedback found a second
  // tap opening a whole separate Change Stream menu instead confusing,
  // Change Stream is a plain fourth button revealed alongside the
  // other two instead now.
  //
  // Real feedback, four times over: every real attempt at measuring or
  // pinning some other element's own width to cancel out More's own
  // real drift kept a real visible flash or a real residual jump one
  // way or another, transitions and synchronous layout reads never
  // actually behaving quite the way relying on them assumed. Given up
  // on cancelling real drift after the fact entirely: More
  // (css/app.css's own jellio-detail-icon-action-more) is now position:
  // absolute, right: 0 against .jellio-detail-actions' own real
  // position: relative, taken out of this row's own flex flow
  // altogether. Nothing Play or the other three do to their own real
  // widths can ever move an element that flexbox no longer has any
  // real say over the position of at all, the one real way to
  // guarantee this rather than trying to correct for it.
  const moreButton = el('button', 'jellio-detail-icon-action jellio-detail-icon-action-more');
  moreButton.type = 'button';
  moreButton.setAttribute('aria-label', 'More options');
  moreButton.appendChild(el('span', 'material-icons more_vert'));

  let actionsExpanded = false;
  function handleActionsOutsideClick(event) {
    if (!actions.contains(event.target)) collapseActions();
  }
  function collapseActions() {
    if (!actionsExpanded) return;
    actionsExpanded = false;
    actions.classList.remove('jellio-detail-actions-expanded');
    moreButton.classList.remove('jellio-detail-icon-action-active');
    document.removeEventListener('pointerdown', handleActionsOutsideClick, true);
  }
  function expandActions() {
    if (actionsExpanded) return;
    actionsExpanded = true;
    actions.classList.add('jellio-detail-actions-expanded');
    moreButton.classList.add('jellio-detail-icon-action-active');
    window.setTimeout(function () {
      document.addEventListener('pointerdown', handleActionsOutsideClick, true);
    }, 0);
  }
  moreButton.addEventListener('click', function (event) {
    event.stopPropagation();
    if (actionsExpanded) {
      collapseActions();
    } else {
      expandActions();
    }
  });
  actions.appendChild(moreButton);

  heroContent.appendChild(actions);

  hero.appendChild(heroContent);
  root.appendChild(hero);

  if (item.Overview) {
    root.appendChild(el('p', 'jellio-detail-overview', item.Overview));
  }

  if (item.Type === 'Series') {
    const seasonsSection = await buildSeasonsSection(canonicalId);
    if (seasonsSection) root.appendChild(seasonsSection);
  }

  const castRow = buildCastRow(item.People);
  if (castRow) root.appendChild(castRow);
}
