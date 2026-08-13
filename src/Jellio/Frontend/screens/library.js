// The library page a sidebar link opens onto. topParentId/parentId and
// collectionType come straight off the route's own query string (app.js's
// job to parse and pass along), the same two params the original Jellio
// codebase's own sidebar already builds into its library links.
//
// Hero carousel plus genre rows, ported from the original codebase's own
// libraryBrowse.js (discoverGenres/genreRows, real endpoints, same
// thresholds), rather than the flat grid this screen shipped with
// first: real feedback asked for the library pages to look like that
// version's own carousel-and-rows treatment, not a single grid.
import { getItem, getLibraryItems, itemTypesForKind, discoverGenres, getGenreItems } from '../runtime/api.js';
import { buildCard } from '../components/card.js';
import { buildHeroCarousel } from '../components/heroCarousel.js';

const GENRE_ROWS = 6;
const ROW_LIMIT = 20;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildRow(title, items) {
  if (!items || !items.length) return null;
  const section = el('section', 'jellio-row');
  section.appendChild(el('h2', 'jellio-row-title', title));
  const track = el('div', 'jellio-row-track');
  items.forEach(function (item) {
    track.appendChild(buildCard(item));
  });
  section.appendChild(track);
  return section;
}

export async function renderLibrary(root, params) {
  root.textContent = '';
  root.className = 'jellio-content jellio-screen-library';

  const parentId = params.get('topParentId') || params.get('parentId');
  const collectionType = params.get('collectionType') || '';

  // The sidebar's own virtual Anime entry (see components/sidebar.js)
  // points here because that is where Gelato actually puts AniList
  // titles: one global SeriesPath per series import, no separate Anime
  // CollectionType. No Jellyfin query can tell an anime Series apart
  // from any other inside the same TV library, same real constraint the
  // original codebase's own libraryBrowse.js documents, so anime still
  // gets only a relabelled flat grid, not rows a real query cannot back.
  const isAnime = params.get('jellioKind') === 'anime';

  if (!parentId) {
    root.textContent = '';
    return;
  }

  if (isAnime) {
    await renderFlatGrid(root, parentId, collectionType, 'Anime');
    return;
  }

  const itemType = itemTypesForKind(collectionType);

  const hero = buildHeroCarousel({ parentId, itemTypes: itemType });
  root.appendChild(hero.element);

  const header = el('header', 'jellio-library-header');
  const heading = el('h1', 'jellio-library-title');
  header.appendChild(heading);
  root.appendChild(header);

  const rows = el('div', 'jellio-rows');
  root.appendChild(rows);

  const [itemResult, latestResult] = await Promise.allSettled([
    getItem(parentId),
    getLibraryItems(parentId, collectionType, { limit: ROW_LIMIT, sortBy: 'DateCreated', sortOrder: 'Descending' }),
  ]);

  heading.textContent = itemResult.status === 'fulfilled' && itemResult.value ? itemResult.value.Name : '';

  if (latestResult.status === 'fulfilled') {
    const row = buildRow('Recently added', (latestResult.value && latestResult.value.Items) || []);
    if (row) rows.appendChild(row);
  }

  try {
    const genres = await discoverGenres(parentId, itemType, GENRE_ROWS);
    const genreItemLists = await Promise.allSettled(
      genres.map(function (genre) {
        return getGenreItems(parentId, itemType, genre, ROW_LIMIT);
      }),
    );
    genreItemLists.forEach(function (result, index) {
      if (result.status === 'fulfilled') {
        const row = buildRow(genres[index], result.value);
        if (row) rows.appendChild(row);
      }
    });
  } catch (err) {
    console.warn('Jellio: could not load genre rows', err);
  }

  return hero.destroy;
}

async function renderFlatGrid(root, parentId, collectionType, title) {
  const header = el('header', 'jellio-library-header');
  const heading = el('h1', 'jellio-library-title', title);
  header.appendChild(heading);
  root.appendChild(header);

  const grid = el('div', 'jellio-library-grid');
  root.appendChild(grid);

  try {
    const result = await getLibraryItems(parentId, collectionType);
    const items = (result && result.Items) || [];
    items.forEach(function (item) {
      grid.appendChild(buildCard(item));
    });
  } catch (err) {
    console.warn('Jellio: could not load library items', err);
  }
}
