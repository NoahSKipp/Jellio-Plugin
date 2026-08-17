// Metadata view for one item: backdrop, title, overview, genres, cast.
// Play opens components/streamPicker.js's own picker first when there
// is real more than one source to choose from (that same file falls
// straight through to #/play, real playback, PlaybackInfo negotiation
// plus a bare <video> element, see screens/player.js's own header for
// why that needed no access to jellyfin-web's own playbackManager at
// all, when there is not).
import { getItemDetails, getImageUrl, getSeasons, getEpisodes, setFavorite } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';
import { openStreamPicker } from '../components/streamPicker.js';

// A failed item lookup used to just console.warn and return, leaving
// root exactly as blank as root.textContent = '' left it: a series's
// own episode card navigates straight here, so a reader clicking an
// episode saw nothing happen at all, same silent failure shape found
// and fixed on the search screen, the boot splash and the player
// screen's own three negotiation failures. A real message plus a real
// way back is the same fix again here.
function renderDetailError(root, message) {
  root.textContent = '';
  const wrap = el('div', 'jellio-detail-error');
  wrap.appendChild(el('p', 'jellio-service-empty', message));
  const back = el('button', 'jellio-detail-error-back', 'Back to Home');
  back.type = 'button';
  back.addEventListener('click', function () {
    navigateTo('#/home');
  });
  wrap.appendChild(back);
  root.appendChild(wrap);
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
    renderDetailError(root, 'Nothing to show.');
    return;
  }

  let item;
  try {
    item = await getItemDetails(itemId);
  } catch (err) {
    console.warn('Jellio: could not load item details', err);
    renderDetailError(root, 'Could not load this title. Check your connection and try again.');
    return;
  }

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

  const backdropTag = item.BackdropImageTags && item.BackdropImageTags[0];
  const hero = el('div', 'jellio-detail-hero');
  if (backdropTag) {
    hero.style.backgroundImage =
      'url(' + getImageUrl(canonicalId, 'Backdrop', { tag: backdropTag, maxWidth: 1600 }) + ')';
  }

  const heroContent = el('div', 'jellio-detail-hero-content');
  heroContent.appendChild(el('h1', 'jellio-detail-title', item.Name || ''));

  const meta = el('div', 'jellio-detail-meta');
  if (item.ProductionYear) meta.appendChild(el('span', null, String(item.ProductionYear)));
  if (item.OfficialRating) meta.appendChild(el('span', null, item.OfficialRating));
  if (item.CommunityRating) meta.appendChild(el('span', null, item.CommunityRating.toFixed(1) + ' ★'));
  heroContent.appendChild(meta);

  if (item.Genres && item.Genres.length) {
    const genres = el('div', 'jellio-detail-genres', item.Genres.join(', '));
    heroContent.appendChild(genres);
  }

  const actions = el('div', 'jellio-detail-actions');

  // A series has no video of its own, only its episodes do (each already
  // opens this same screen at its own item id, with its own working Play
  // button), so this one is skipped entirely here rather than pointing at
  // nothing playable.
  if (item.Type !== 'Series') {
    const playButton = el('button', 'jellio-detail-play', 'Play');
    playButton.type = 'button';
    playButton.addEventListener('click', function () {
      openStreamPicker(item);
    });
    actions.appendChild(playButton);

    // Play alone already reopens the picker on its own whenever there
    // is real more than one source and "remember my stream choice" is
    // off; this exists for when it is on, real feedback asked for a
    // way back to the picker from here specifically without going
    // through Settings, for a remembered choice that stopped working.
    // forceChoice: true skips only that remembered shortcut, a title
    // with one real source still has nothing to change to either way.
    const changeStreamButton = el('button', 'jellio-detail-change-stream', 'Change Stream');
    changeStreamButton.type = 'button';
    changeStreamButton.addEventListener('click', function () {
      openStreamPicker(item, { forceChoice: true });
    });
    actions.appendChild(changeStreamButton);
  }

  const isFavorite = !!(item.UserData && item.UserData.IsFavorite);
  const favoriteButton = el(
    'button',
    'jellio-detail-favorite' + (isFavorite ? ' jellio-detail-favorite-active' : ''),
    isFavorite ? 'In Favorites' : 'Add to Favorites',
  );
  favoriteButton.type = 'button';
  favoriteButton.addEventListener('click', function () {
    const nextState = !favoriteButton.classList.contains('jellio-detail-favorite-active');
    favoriteButton.disabled = true;
    setFavorite(canonicalId, nextState)
      .then(function (userData) {
        const active = !!(userData && userData.IsFavorite);
        favoriteButton.classList.toggle('jellio-detail-favorite-active', active);
        favoriteButton.textContent = active ? 'In Favorites' : 'Add to Favorites';
      })
      .catch(function (err) {
        console.warn('Jellio: could not update favorite state', err);
      })
      .finally(function () {
        favoriteButton.disabled = false;
      });
  });
  actions.appendChild(favoriteButton);

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
