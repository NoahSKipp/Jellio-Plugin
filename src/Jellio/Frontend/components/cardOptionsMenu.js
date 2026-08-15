// Quick actions on a poster card without leaving the row it lives in,
// ported in spirit from NuvioWeb's own posterOptionsMenu.js (its own
// screens open it on a held remote button, real Jellyfin.PlayedItems and
// FavoriteItems endpoints doing the actual state change either way,
// reimplemented for a mouse/keyboard/touch web target as a right click
// or a held pointer rather than a held focus key).
import { setPlayed, setFavorite } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';

const MENU_ID = 'jellioCardOptionsMenu';
const HOLD_MS = 500;

function closeMenu() {
  const existing = document.getElementById(MENU_ID);
  if (existing) existing.remove();
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('pointerdown', handleOutsideClick, true);
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeMenu();
}

function handleOutsideClick(event) {
  const menu = document.getElementById(MENU_ID);
  if (menu && !menu.contains(event.target)) closeMenu();
}

function buildOption(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'jellio-card-options-item';
  button.textContent = label;
  button.addEventListener('click', function () {
    closeMenu();
    onClick();
  });
  return button;
}

function positionMenu(menu, anchorRect) {
  const menuWidth = 220;
  let left = anchorRect.left;
  if (left + menuWidth > window.innerWidth - 16) {
    left = window.innerWidth - menuWidth - 16;
  }
  let top = anchorRect.bottom + 6;
  menu.style.left = Math.max(16, left) + 'px';
  menu.style.top = top + 'px';
}

export function openCardOptionsMenu(item, anchorRect, onChanged) {
  closeMenu();

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'jellio-card-options-menu';
  menu.setAttribute('role', 'menu');
  positionMenu(menu, anchorRect);

  menu.appendChild(
    buildOption('Go to details', function () {
      navigateTo('#/item?id=' + item.Id);
    }),
  );

  const userData = item.UserData || {};
  const isPlayed = !!userData.Played;
  const playedOption = buildOption(isPlayed ? 'Mark as unwatched' : 'Mark as watched', function () {
    setPlayed(item.Id, !isPlayed)
      .then(function (updated) {
        item.UserData = updated;
        if (onChanged) onChanged(item);
      })
      .catch(function (err) {
        console.warn('Jellio: could not update watched state', err);
      });
  });
  menu.appendChild(playedOption);

  const isFavorite = !!userData.IsFavorite;
  const favoriteOption = buildOption(
    isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
    function () {
      setFavorite(item.Id, !isFavorite)
        .then(function (updated) {
          item.UserData = updated;
          if (onChanged) onChanged(item);
        })
        .catch(function (err) {
          console.warn('Jellio: could not update favorite state', err);
        });
    },
  );
  menu.appendChild(favoriteOption);

  document.body.appendChild(menu);
  document.addEventListener('keydown', handleKeydown);
  // Registered as capturing rather than bubbling, and one tick late,
  // so the same pointerdown/contextmenu that just opened this menu does
  // not immediately close it again on its way through document.
  window.setTimeout(function () {
    document.addEventListener('pointerdown', handleOutsideClick, true);
  }, 0);

  const first = menu.querySelector('button');
  if (first) first.focus();
}

// Right click opens the menu directly; a held pointer (touch, or a
// mouse without a right button) mirrors that same held-remote-button
// gesture the original screens key off. A drag or a real click before
// HOLD_MS elapses cancels it, same as a normal press-and-release.
export function attachCardOptionsTrigger(card, item, onChanged) {
  card.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    openCardOptionsMenu(item, card.getBoundingClientRect(), onChanged);
  });

  let holdTimer = null;

  function cancelHold() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  card.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    cancelHold();
    holdTimer = window.setTimeout(function () {
      holdTimer = null;
      openCardOptionsMenu(item, card.getBoundingClientRect(), onChanged);
    }, HOLD_MS);
  });
  card.addEventListener('pointerup', cancelHold);
  card.addEventListener('pointerleave', cancelHold);
  card.addEventListener('pointercancel', cancelHold);
}
