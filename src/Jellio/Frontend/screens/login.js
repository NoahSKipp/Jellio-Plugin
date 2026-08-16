// This runtime's own login screen, a real replacement for native
// jellyfin-web's login page rather than an overlay injected on top of
// it. The original codebase's own version (js/loginProfiles.js, now
// removed there) had to inject into native's #loginPage DOM and finish
// with a full page reload so native's own ApiClient/ConnectionRequired
// boot cycle picked the new session up, and that reload is exactly what
// broke it: reload re-ran jellyfin-apiclient-javascript's own
// validateAuthentication(), which sends a bare legacy header a real
// deployment rejected, wiping the token and bouncing back to the very
// screen quick sign-in was meant to skip. This runtime has no such
// dependency: auth.js keeps its own session, independent of native
// ApiClient, so a successful sign in here only ever needs to call
// setSession and let app.js's own sync() pick it up, real endpoints
// only, no reload anywhere in the path.
import {
  authenticateByName,
  getRememberedUsers,
  forgetRememberedUser,
  quickSignIn,
  bypassLoginScreen,
  getPublicUsers,
} from '../runtime/auth.js';
import { getUserImageUrl } from '../runtime/api.js';
import { navigateTo } from '../runtime/router.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// The one real completion signal this screen can give: navigate to
// #/home (a real route, so its own hashchange fires app.js's sync()),
// and also poke the same jellio:session-captured event app.js already
// listens for, in case the hash was already #/home and never changed
// (the common case on first load, before any route has a real value
// yet, when a bare hash assignment of the same string is a no-op).
function completeSignIn() {
  navigateTo('#/home');
  document.dispatchEvent(new CustomEvent('jellio:session-captured'));
}

// Quick Connect and "forgot password" are real native login page
// features this screen does not reimplement (the public user grid
// below is, real feedback asked for it directly), so this stays
// reachable everywhere on the screen rather than only from the manual
// form: a remembered or public profile's own owner may still need one
// of those, not only someone with no profile visible at all.
function buildBypassLink() {
  const link = el('button', 'jellio-login-cancel', 'Use classic sign-in');
  link.type = 'button';
  link.addEventListener('click', function () {
    bypassLoginScreen();
    document.dispatchEvent(new CustomEvent('jellio:session-captured'));
  });
  return link;
}

function buildManualForm(options) {
  const opts = options || {};
  const form = document.createElement('form');
  form.className = 'jellio-login-form';

  const username = document.createElement('input');
  username.type = 'text';
  username.placeholder = 'Username';
  username.autocomplete = 'username';
  username.className = 'jellio-login-input';
  if (opts.username) username.value = opts.username;

  const password = document.createElement('input');
  password.type = 'password';
  password.placeholder = 'Password';
  password.autocomplete = 'current-password';
  password.className = 'jellio-login-input';

  const status = el('p', 'jellio-login-status', opts.message || '');

  const submit = el('button', 'jellio-login-submit', 'Sign in');
  submit.type = 'submit';

  form.appendChild(username);
  form.appendChild(password);
  form.appendChild(status);
  form.appendChild(submit);

  if (opts.onCancel) {
    const cancel = el('button', 'jellio-login-cancel', 'Back');
    cancel.type = 'button';
    cancel.addEventListener('click', opts.onCancel);
    form.appendChild(cancel);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!username.value || !password.value) {
      status.textContent = 'Enter a username and password.';
      return;
    }
    submit.disabled = true;
    status.textContent = 'Signing in…';
    authenticateByName(username.value, password.value)
      .then(function () {
        completeSignIn();
      })
      .catch(function (err) {
        console.warn('Jellio: sign in failed', err);
        status.textContent = err && err.status === 401 ? 'Wrong username or password.' : 'Could not sign in.';
        submit.disabled = false;
      });
  });

  window.requestAnimationFrame(function () {
    (opts.username ? password : username).focus();
  });

  return form;
}

// Real feedback asked for the profile tiles to enter one after another
// rather than all at once, "like in the Nuvio app". Nuvio's own real
// source was not reachable to confirm the exact timing (checked
// NuvioWeb, the project's own primary reference per CLAUDE.md; its
// "who's watching" screen, js/core/profile/profileSelectionScreen.js,
// carries no such per tile stagger to port), so this is a standard
// staggered grid entrance built directly rather than a port, index
// order matching left to right, top to bottom reading order, capped
// (STAGGER_STEP_MS * STAGGER_MAX below) so a long remembered list does
// not leave the last tile waiting a full second to appear.
const STAGGER_STEP_MS = 55;
const STAGGER_MAX = 10;

function applyStagger(wrap, index) {
  wrap.style.setProperty('--jellio-stagger-delay', Math.min(index, STAGGER_MAX) * STAGGER_STEP_MS + 'ms');
}

function buildProfileTile(userId, entry, index, onForgotten, onFailed) {
  const wrap = el('div', 'jellio-login-profile');
  applyStagger(wrap, index);

  const avatarWrap = el('div', 'jellio-login-profile-avatar-wrap');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'jellio-login-profile-avatar';
  avatar.setAttribute('aria-label', 'Sign in as ' + (entry.name || ''));

  if (entry.primaryImageTag) {
    avatar.style.backgroundImage = "url('" + getUserImageUrl(userId, entry.primaryImageTag, { maxWidth: 300 }) + "')";
  } else {
    const icon = el('span', 'material-icons person jellio-login-profile-icon');
    icon.setAttribute('aria-hidden', 'true');
    avatar.appendChild(icon);
  }

  avatar.addEventListener('click', function () {
    avatar.disabled = true;
    quickSignIn(userId)
      .then(function () {
        completeSignIn();
      })
      .catch(function (err) {
        console.warn('Jellio: quick sign-in failed', err);
        avatar.disabled = false;
        onFailed(entry.name || '');
      });
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'jellio-login-profile-remove';
  remove.setAttribute('aria-label', 'Forget this profile');
  remove.textContent = '×';
  remove.addEventListener('click', function (event) {
    event.stopPropagation();
    forgetRememberedUser(userId);
    onForgotten();
  });

  avatarWrap.appendChild(avatar);
  avatarWrap.appendChild(remove);

  const name = el('span', 'jellio-login-profile-name', entry.name || '');

  wrap.appendChild(avatarWrap);
  wrap.appendChild(name);
  return wrap;
}

// A user visible here has never necessarily signed in on this device
// before (getPublicUsers() in runtime/auth.js only mirrors a real
// admin's own "Display this user on the login screen" toggle, server
// side), so there is no remembered AccessToken to reuse the way
// quickSignIn() does for a tile in the other list. HasPassword is a
// real, if formally obsolete, UserDto field jellyfin-web's own login
// page still checks the same way before deciding whether a password
// is even worth asking for; AuthenticateByName with an empty Pw is
// the same real request a passwordless account's own native sign in
// already sends. Either path ends by calling setSession, which
// rememberUser()s this same profile on the way, so the very next
// visit finds it in the other list instead, with a real quick sign-in
// token this time.
function buildPublicUserTile(user, index, onNeedsPassword) {
  const wrap = el('div', 'jellio-login-profile');
  applyStagger(wrap, index);

  const avatarWrap = el('div', 'jellio-login-profile-avatar-wrap');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'jellio-login-profile-avatar';
  avatar.setAttribute('aria-label', 'Sign in as ' + (user.Name || ''));

  if (user.PrimaryImageTag) {
    avatar.style.backgroundImage =
      "url('" + getUserImageUrl(user.Id, user.PrimaryImageTag, { maxWidth: 300 }) + "')";
  } else {
    const icon = el('span', 'material-icons person jellio-login-profile-icon');
    icon.setAttribute('aria-hidden', 'true');
    avatar.appendChild(icon);
  }

  const hasPassword = user.HasPassword !== false && user.HasConfiguredPassword !== false;

  avatar.addEventListener('click', function () {
    if (!hasPassword) {
      avatar.disabled = true;
      authenticateByName(user.Name || '', '')
        .then(function () {
          completeSignIn();
        })
        .catch(function () {
          avatar.disabled = false;
          onNeedsPassword(user.Name || '');
        });
      return;
    }
    onNeedsPassword(user.Name || '');
  });

  avatarWrap.appendChild(avatar);

  const name = el('span', 'jellio-login-profile-name', user.Name || '');

  wrap.appendChild(avatarWrap);
  wrap.appendChild(name);
  return wrap;
}

function buildAddTile(index, onClick) {
  const wrap = el('div', 'jellio-login-profile');
  applyStagger(wrap, index);
  const avatarWrap = el('div', 'jellio-login-profile-avatar-wrap');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'jellio-login-profile-avatar jellio-login-profile-avatar-add';
  avatar.setAttribute('aria-label', 'Sign in as another user');
  const icon = el('span', 'material-icons add');
  icon.setAttribute('aria-hidden', 'true');
  avatar.appendChild(icon);
  avatar.addEventListener('click', onClick);

  avatarWrap.appendChild(avatar);
  wrap.appendChild(avatarWrap);
  wrap.appendChild(el('span', 'jellio-login-profile-name', 'Other user'));
  return wrap;
}

// Remembered wins on overlap: that entry carries a real AccessToken
// (quickSignIn, one click, no password redone), where a public-only
// listing for the same real user has never signed in on this device
// and could only ever offer the slower authenticateByName path below.
function publicOnlyUsers(remembered, publicUsers) {
  return publicUsers.filter(function (user) {
    return user && user.Id && !remembered[user.Id];
  });
}

function renderProfilePicker(container, remembered, publicUsers) {
  container.textContent = '';

  function rerender() {
    renderProfilePicker(container, getRememberedUsers(), publicUsers);
  }

  function showManual(prefillName, message) {
    container.textContent = '';
    container.appendChild(el('h1', 'jellio-login-heading', 'Sign in'));
    container.appendChild(
      buildManualForm({
        username: prefillName,
        message: message,
        onCancel: Object.keys(remembered).length || publicOnly.length ? rerender : null,
      }),
    );
    container.appendChild(buildBypassLink());
  }

  const rememberedIds = Object.keys(remembered);
  const publicOnly = publicOnlyUsers(remembered, publicUsers);

  if (!rememberedIds.length && !publicOnly.length) {
    showManual('', '');
    return;
  }

  container.appendChild(el('h1', 'jellio-login-heading', 'Who’s watching?'));
  const grid = el('div', 'jellio-login-profile-grid');
  let index = 0;

  rememberedIds.forEach(function (userId) {
    grid.appendChild(
      buildProfileTile(
        userId,
        remembered[userId],
        index++,
        rerender,
        function (name) {
          showManual(name, 'That saved sign-in no longer works. Sign in again.');
        },
      ),
    );
  });

  publicOnly.forEach(function (user) {
    grid.appendChild(
      buildPublicUserTile(user, index++, function (name) {
        showManual(name, '');
      }),
    );
  });

  grid.appendChild(
    buildAddTile(index, function () {
      showManual('', '');
    }),
  );

  container.appendChild(grid);
  container.appendChild(buildBypassLink());
}

export async function renderLogin(root) {
  root.textContent = '';
  root.className = 'jellio-content jellio-screen-login';

  const screen = el('div', 'jellio-login-screen');
  root.appendChild(screen);

  let publicUsers = [];
  try {
    publicUsers = await getPublicUsers();
  } catch (err) {
    // A device that has signed in here before still gets the
    // remembered list, real endpoint or not.
  }

  renderProfilePicker(screen, getRememberedUsers(), publicUsers);
}
