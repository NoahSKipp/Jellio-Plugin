// Group Watch, opened from the sidebar's own rail. Used to just forward
// a click at native jellyfin-web's own hidden .headerSyncButton (that
// header sits under display: none once this shell takes over, so its
// own real SyncPlay menu rendered small and pinned to a corner nothing
// visible actually anchors it to anymore, real feedback live). This is
// a real styled panel instead, driving the same real Jellyfin SyncPlay
// REST endpoints that menu already did (runtime/api.js's own
// getSyncPlayGroups/createSyncPlayGroup/joinSyncPlayGroup/
// leaveSyncPlayGroup), same real backend underneath either way.
//
// Real scope, stated plainly rather than left to look finished: this
// covers real group membership only, creating, joining, leaving,
// seeing who else is in one. Keeping actual playback position/state in
// lockstep once a reader is in a group is a separate, larger real
// feature real Jellyfin drives over the same WebSocket connection this
// runtime's own player has never opened at all (screens/player.js's
// own header explains why it runs a bare <video> element with none of
// native's own playbackManager wiring). Joining a group here does not
// yet make this runtime's own playback follow it.
import { getCurrentUser, getSyncPlayGroups, createSyncPlayGroup, joinSyncPlayGroup, leaveSyncPlayGroup } from '../runtime/api.js';

const OVERLAY_ID = 'jellioGroupWatch';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeGroupWatch();
}

export function closeGroupWatch() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
  document.removeEventListener('keydown', handleKeydown);
}

function groupSubtitle(group) {
  if (group.PlayingItemName) return 'Playing ' + group.PlayingItemName;
  return 'Idle';
}

export async function openGroupWatch() {
  closeGroupWatch();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'jellio-avatar-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Group Watch');
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeGroupWatch();
  });
  document.addEventListener('keydown', handleKeydown);

  const panel = document.createElement('div');
  panel.className = 'jellio-avatar-picker-panel jellio-group-watch-panel';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'jellio-group-watch-close';
  closeButton.setAttribute('aria-label', 'Close');
  const closeIcon = el('span', 'material-icons close');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeButton.appendChild(closeIcon);
  closeButton.addEventListener('click', closeGroupWatch);
  panel.appendChild(closeButton);

  panel.appendChild(el('h2', 'jellio-avatar-picker-title', 'Group Watch'));

  const list = el('div', 'jellio-group-watch-list');
  panel.appendChild(list);

  const createRow = el('div', 'jellio-group-watch-create');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'jellio-group-watch-input';
  nameInput.placeholder = 'New group name';
  nameInput.maxLength = 100;
  const createButton = el('button', 'jellio-settings-button', 'Start a group');
  createButton.type = 'button';
  createRow.appendChild(nameInput);
  createRow.appendChild(createButton);
  panel.appendChild(createRow);

  const status = el('p', 'jellio-avatar-picker-status', '');
  panel.appendChild(status);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let currentUserName = '';
  try {
    const user = await getCurrentUser();
    if (user && user.Name) currentUserName = user.Name;
  } catch (err) {
    // Membership highlighting below just quietly finds nothing, not
    // fatal to the rest of this panel.
  }

  async function refresh() {
    list.textContent = '';
    status.textContent = 'Loading groups…';
    let groups = [];
    try {
      groups = await getSyncPlayGroups();
    } catch (err) {
      console.warn('Jellio: could not load Group Watch groups', err);
      status.textContent = 'Could not load groups.';
      return;
    }
    status.textContent = '';

    if (!groups.length) {
      list.appendChild(el('p', 'jellio-service-empty', 'No groups yet. Start one below.'));
      return;
    }

    groups.forEach(function (group) {
      const participants = group.Participants || [];
      const isMember = currentUserName && participants.indexOf(currentUserName) !== -1;

      const row = el('div', 'jellio-group-watch-row' + (isMember ? ' jellio-group-watch-row-active' : ''));
      const info = el('div', 'jellio-group-watch-row-info');
      info.appendChild(el('div', 'jellio-group-watch-row-name', group.GroupName || 'Group Watch'));
      const meta = el('div', 'jellio-group-watch-row-meta');
      meta.appendChild(el('span', null, groupSubtitle(group)));
      meta.appendChild(el('span', null, participants.length + (participants.length === 1 ? ' person' : ' people')));
      info.appendChild(meta);
      row.appendChild(info);

      const actionButton = el('button', 'jellio-settings-button' + (isMember ? ' jellio-settings-button-danger' : ''), isMember ? 'Leave' : 'Join');
      actionButton.type = 'button';
      actionButton.addEventListener('click', function () {
        actionButton.disabled = true;
        const action = isMember ? leaveSyncPlayGroup() : joinSyncPlayGroup(group.GroupId);
        action
          .then(refresh)
          .catch(function (err) {
            console.warn('Jellio: could not update Group Watch membership', err);
            status.textContent = 'Could not ' + (isMember ? 'leave' : 'join') + ' that group.';
            actionButton.disabled = false;
          });
      });
      row.appendChild(actionButton);

      list.appendChild(row);
    });
  }

  createButton.addEventListener('click', function () {
    createButton.disabled = true;
    status.textContent = 'Starting group…';
    createSyncPlayGroup(nameInput.value.trim() || 'Group Watch')
      .then(function () {
        nameInput.value = '';
        return refresh();
      })
      .catch(function (err) {
        console.warn('Jellio: could not start Group Watch group', err);
        status.textContent = 'Could not start a group.';
      })
      .finally(function () {
        createButton.disabled = false;
      });
  });

  refresh();
}
