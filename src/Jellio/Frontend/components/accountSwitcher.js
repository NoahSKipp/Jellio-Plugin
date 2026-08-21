// Quick profile switcher, opened from the sidebar/mobile nav's own Profile
// button. Real feedback: Profile and Settings both just navigated to the
// same #/account screen, no real second job of its own. Real reference,
// per the project's own CLAUDE.md: JMSFusion/MonWUI's own account switcher.
// screens/login.js already builds this exact "who's watching" grid (remembered
// users, public users, add tile) for the signed-out case; this overlay reuses
// its same real CSS (.jellio-login-profile*) rather than a second visual
// language, laid out as a small floating panel instead of a full screen since
// switching mid-browse should not need leaving the page first.
import {
  getCurrentUser as getSessionUser,
  getRememberedUsers,
  getPublicUsers,
  quickSignIn,
  authenticateByName,
  logout,
} from '../runtime/auth.js';
import { getUserImageUrl } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';

const OVERLAY_ID = 'jellioAccountSwitcher';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function handleKeydown(event) {
  if (event.key === 'Escape') closeAccountSwitcher();
}

function handleOutsideClick(event) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay && event.target === overlay) closeAccountSwitcher();
}

export function closeAccountSwitcher() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
  document.removeEventListener('keydown', handleKeydown);
}

// Every other user this device knows about switches by reloading rather
// than trying to hot-swap every screen's own already-fetched state: a
// profile switch is not something any screen here was ever built to
// react to live (runtime/api.js's own cache is keyed off the signed in
// user for some calls, not all), and logout() already sets the same real
// precedent for "a session change reloads" elsewhere in this runtime.
function switchToUser(button, promiseFactory, status) {
  button.disabled = true;
  promiseFactory()
    .then(function () {
      window.location.reload();
    })
    .catch(function (err) {
      console.warn('Jellio: could not switch profile', err);
      button.disabled = false;
      if (status) status.textContent = 'Could not switch to that profile.';
    });
}

function buildProfileTile(userId, name, imageTag, onClick) {
  const wrap = el('div', 'jellio-login-profile');
  const avatarWrap = el('div', 'jellio-login-profile-avatar-wrap');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'jellio-login-profile-avatar';
  avatar.setAttribute('aria-label', 'Switch to ' + (name || ''));
  if (imageTag) {
    avatar.style.backgroundImage = "url('" + getUserImageUrl(userId, imageTag, { maxWidth: 300 }) + "')";
  } else {
    const icon = el('span', 'material-icons person jellio-login-profile-icon');
    icon.setAttribute('aria-hidden', 'true');
    avatar.appendChild(icon);
  }
  avatar.addEventListener('click', function () {
    onClick(avatar);
  });

  avatarWrap.appendChild(avatar);
  wrap.appendChild(avatarWrap);
  wrap.appendChild(el('span', 'jellio-login-profile-name', name || ''));
  return wrap;
}

function buildAddTile() {
  const wrap = el('div', 'jellio-login-profile');
  const avatarWrap = el('div', 'jellio-login-profile-avatar-wrap');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'jellio-login-profile-avatar jellio-login-profile-avatar-add';
  avatar.setAttribute('aria-label', 'Sign in as another user');
  const icon = el('span', 'material-icons add');
  icon.setAttribute('aria-hidden', 'true');
  avatar.appendChild(icon);
  // No manual credential form lives in this overlay: screens/login.js's
  // own picker already has one, and reaching it needs signing the
  // current profile out first regardless (the login screen only ever
  // renders while unauthenticated, app.js's own real route guard), same
  // as picking "add account" on most every other real client.
  avatar.addEventListener('click', function () {
    closeAccountSwitcher();
    logout();
  });

  avatarWrap.appendChild(avatar);
  wrap.appendChild(avatarWrap);
  wrap.appendChild(el('span', 'jellio-login-profile-name', 'Other user'));
  return wrap;
}

export async function openAccountSwitcher() {
  closeAccountSwitcher();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'jellio-avatar-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Switch profile');
  overlay.addEventListener('click', handleOutsideClick);
  document.addEventListener('keydown', handleKeydown);

  const panel = document.createElement('div');
  panel.className = 'jellio-avatar-picker-panel';

  const current = getSessionUser();
  const currentId = current && current.Id;

  const header = el('div', 'jellio-account-switcher-current');
  const currentAvatar = el('div', 'jellio-account-switcher-avatar');
  if (current && current.PrimaryImageTag) {
    currentAvatar.style.backgroundImage =
      "url('" + getUserImageUrl(current.Id, current.PrimaryImageTag, { maxWidth: 200 }) + "')";
  } else {
    const icon = el('span', 'material-icons person');
    icon.setAttribute('aria-hidden', 'true');
    currentAvatar.appendChild(icon);
  }
  header.appendChild(currentAvatar);

  const info = el('div', 'jellio-account-switcher-current-info');
  info.appendChild(el('div', 'jellio-account-switcher-current-name', (current && current.Name) || 'Signed in'));
  const actions = el('div', 'jellio-account-switcher-current-actions');
  const manage = el('button', 'jellio-settings-button', 'Manage Account');
  manage.type = 'button';
  manage.addEventListener('click', function () {
    closeAccountSwitcher();
    navigateTo('#/account');
  });
  actions.appendChild(manage);
  const signOut = el('button', 'jellio-settings-button jellio-settings-button-danger', 'Sign out');
  signOut.type = 'button';
  signOut.addEventListener('click', function () {
    logout();
  });
  actions.appendChild(signOut);
  info.appendChild(actions);
  header.appendChild(info);
  panel.appendChild(header);

  panel.appendChild(el('h2', 'jellio-avatar-picker-title', 'Switch Profile'));

  const grid = el('div', 'jellio-login-profile-grid');
  panel.appendChild(grid);

  const status = el('p', 'jellio-avatar-picker-status', '');
  panel.appendChild(status);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const remembered = getRememberedUsers();
  let publicUsers = [];
  try {
    publicUsers = await getPublicUsers();
  } catch (err) {
    // The remembered list below still works without it.
  }

  Object.keys(remembered).forEach(function (userId) {
    if (userId === currentId) return;
    const entry = remembered[userId];
    grid.appendChild(
      buildProfileTile(userId, entry.name, entry.primaryImageTag, function (button) {
        switchToUser(
          button,
          function () {
            return quickSignIn(userId);
          },
          status,
        );
      }),
    );
  });

  publicUsers
    .filter(function (user) {
      return user && user.Id && user.Id !== currentId && !remembered[user.Id];
    })
    .forEach(function (user) {
      const hasPassword = user.HasPassword !== false && user.HasConfiguredPassword !== false;
      grid.appendChild(
        buildProfileTile(user.Id, user.Name, user.PrimaryImageTag, function (button) {
          if (hasPassword) {
            closeAccountSwitcher();
            logout();
            return;
          }
          switchToUser(
            button,
            function () {
              return authenticateByName(user.Name || '', '');
            },
            status,
          );
        }),
      );
    });

  grid.appendChild(buildAddTile());

  const first = grid.querySelector('button');
  if (first) first.focus();
}
