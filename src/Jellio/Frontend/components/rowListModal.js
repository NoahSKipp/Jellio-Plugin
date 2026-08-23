// A row's own title, made clickable: real feedback was that scrolling
// all the way across a long row (a studio hub's own "Series on
// Netflix", easily 20+ deep) by drag or arrow-click alone is tedious,
// and the horizontal track itself gives no sense of how much further
// there is to go. Reuses components/groupWatch.js's own real modal
// shell (.jellio-avatar-picker-overlay/-panel/-title, the same
// close/Escape/click-outside behaviour) rather than a second dialog
// language, with a plain vertical list inside: every item in the row,
// at a glance, one click through to it.
import { getImageUrl } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';

const OVERLAY_ID = 'jellioRowListModal';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeRowListModal();
}

export function closeRowListModal() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
  document.removeEventListener('keydown', handleKeydown);
}

function itemSubtitle(item) {
  const bits = [];
  if (item.ProductionYear) bits.push(String(item.ProductionYear));
  if (item.Type === 'Series' || item.Type === 'Season') bits.push('Series');
  return bits.join(' · ');
}

// items: real Jellyfin item objects (the same shape every row already
// renders cards from). onSelect defaults to this runtime's own real
// item navigation; screens/service.js and components/row.js both just
// take that default, nothing about a studio hub or a home/library row
// needs a different one.
export function openRowListModal(title, items, onSelect) {
  closeRowListModal();

  const select = onSelect || function (item) { navigateTo('#/item?id=' + item.Id); };

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'jellio-avatar-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeRowListModal();
  });
  document.addEventListener('keydown', handleKeydown);

  const panel = document.createElement('div');
  panel.className = 'jellio-avatar-picker-panel jellio-row-list-panel';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jellio-group-watch-close';
  closeButton.setAttribute('aria-label', 'Close');
  const closeIcon = el('span', 'material-icons close');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeButton.appendChild(closeIcon);
  closeButton.addEventListener('click', closeRowListModal);
  panel.appendChild(closeButton);

  panel.appendChild(el('h2', 'jellio-avatar-picker-title', title));

  const list = el('div', 'jellio-row-list');
  items.forEach(function (item) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'jellio-row-list-item';

    const tag = item.ImageTags && item.ImageTags.Primary;
    if (tag) {
      const img = document.createElement('img');
      img.className = 'jellio-row-list-item-image';
      img.src = getImageUrl(item.Id, 'Primary', { tag: tag, maxWidth: 160 });
      img.alt = '';
      img.loading = 'lazy';
      row.appendChild(img);
    } else {
      row.appendChild(el('div', 'jellio-row-list-item-image jellio-row-list-item-image-empty'));
    }

    const info = el('div', 'jellio-row-list-item-info');
    info.appendChild(el('div', 'jellio-row-list-item-title', item.Name || ''));
    const subtitle = itemSubtitle(item);
    if (subtitle) info.appendChild(el('div', 'jellio-row-list-item-subtitle', subtitle));
    row.appendChild(info);

    row.appendChild(el('span', 'material-icons jellio-row-list-item-chevron', 'chevron_right'));

    row.addEventListener('click', function () {
      closeRowListModal();
      select(item);
    });
    list.appendChild(row);
  });
  panel.appendChild(list);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

// Wires a row's own <h2 class="jellio-row-title"> up to open the list
// above: a chevron appended after the existing title text (el()'s own
// textContent assignment elsewhere leaves room for this, never wipes
// it back out), the whole heading made a real button rather than only
// the small chevron being clickable.
export function makeRowTitleClickable(titleEl, title, items, onSelect) {
  if (!items || !items.length) return;
  titleEl.classList.add('jellio-row-title-clickable');
  titleEl.setAttribute('role', 'button');
  titleEl.tabIndex = 0;
  titleEl.setAttribute('aria-label', 'Browse all of ' + title);
  titleEl.appendChild(el('span', 'material-icons jellio-row-title-chevron', 'chevron_right'));

  function open() {
    openRowListModal(title, items, onSelect);
  }
  titleEl.addEventListener('click', open);
  titleEl.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}
