// Settings, this runtime's own screen, the sidebar's Settings link's
// own real destination (components/navShared.js's own SETTINGS_LINK,
// #/account). A category sidebar (Account/Playback/Sessions/About)
// switches which of this file's own section builders below render into
// the content pane, one category at a time, real feedback that this
// page belonged in real defined groups on its own screen rather than
// one long flat column of every section stacked in a row (see
// buildAccountCategory's own header for why these four rather than a
// blind copy of some other real reference's own category names).
// Covers only what has a real, confirmed endpoint and a clear place in
// one of them, the same discipline every other screen in this codebase
// already follows. Remember my stream choice is the one real exception
// to "a confirmed endpoint": components/streamPicker.js's own
// preference has no server side concept at all, client only, same as
// screens/player.js's own subtitle style.
import {
  getCurrentUser,
  updateUserPassword,
  getSleepTimerStatus,
  cancelSleepTimer,
  updateLanguagePreferences,
  isQuickConnectEnabled,
  authorizeQuickConnect,
} from '../runtime/api.js';
import { logout } from '../runtime/auth.js';
import { openAvatarPicker } from '../components/avatarPicker.js';
import { refreshProfileAvatar } from '../components/navShared.js';
import { isRememberStreamEnabled, setRememberStreamEnabled } from '../components/streamPicker.js';
import { navigateTo } from '../runtime/router.js';
import { LANGUAGE_OPTIONS, languageName } from '../runtime/languages.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildPasswordSection() {
  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'Change password'));

  const form = document.createElement('form');
  form.className = 'jellio-settings-form';

  const current = document.createElement('input');
  current.type = 'password';
  current.placeholder = 'Current password';
  current.autocomplete = 'current-password';
  current.className = 'jellio-settings-input';

  const next = document.createElement('input');
  next.type = 'password';
  next.placeholder = 'New password';
  next.autocomplete = 'new-password';
  next.className = 'jellio-settings-input';

  const confirm = document.createElement('input');
  confirm.type = 'password';
  confirm.placeholder = 'Confirm new password';
  confirm.autocomplete = 'new-password';
  confirm.className = 'jellio-settings-input';

  const status = el('p', 'jellio-settings-status');

  const submit = el('button', 'jellio-settings-button', 'Update password');
  submit.type = 'submit';

  form.appendChild(current);
  form.appendChild(next);
  form.appendChild(confirm);
  form.appendChild(status);
  form.appendChild(submit);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!next.value || next.value !== confirm.value) {
      status.textContent = 'New passwords do not match.';
      return;
    }
    submit.disabled = true;
    status.textContent = 'Updating…';
    updateUserPassword(current.value, next.value)
      .then(function () {
        status.textContent = 'Password updated.';
        form.reset();
      })
      .catch(function (err) {
        console.warn('Jellio: could not update password', err);
        status.textContent = 'Could not update password. Check your current password.';
      })
      .finally(function () {
        submit.disabled = false;
      });
  });

  section.appendChild(form);
  return section;
}

// components/streamPicker.js's own real gate: on, a picker with a
// remembered choice for that title skips straight to it instead of
// asking again; off, every title with real more than one source asks
// every time, same as before this setting existed. screens/detail.js's
// own Change Stream button is the way back in either case, real
// feedback asked for both together rather than only one.
function buildPlaybackSection() {
  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'Playback'));

  const row = document.createElement('label');
  row.className = 'jellio-settings-toggle-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'jellio-settings-toggle-input';
  checkbox.checked = isRememberStreamEnabled();
  checkbox.addEventListener('change', function () {
    setRememberStreamEnabled(checkbox.checked);
  });
  row.appendChild(checkbox);
  row.appendChild(el('span', 'jellio-settings-toggle-track'));
  row.appendChild(el('span', 'jellio-settings-toggle-label', 'Remember my stream choice'));
  section.appendChild(row);

  section.appendChild(
    el(
      'p',
      'jellio-settings-status',
      'Skip the stream picker on a repeat play once you have chosen a stream for a title, remembered for 4 days. Use Change Stream on that title’s own page if a remembered one stops working.',
    ),
  );

  return section;
}

// Real fields, UserDto.Configuration.AudioLanguagePreference/
// SubtitleLanguagePreference (confirmed against UserConfiguration.cs
// before writing this): Jellyfin's own PlaybackInfo negotiation
// already reads these server side to pick a MediaSource's own real
// DefaultAudioStreamIndex/DefaultSubtitleStreamIndex, so saving a
// choice here is the whole fix, nothing else in this codebase needs to
// change for it to take effect on the next real stream negotiated.
function buildLanguageSection(user) {
  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'Language'));

  const configuration = (user && user.Configuration) || {};
  const status = el(
    'p',
    'jellio-settings-status',
    'Used automatically when Jellyfin picks a stream’s default audio and subtitle track.',
  );

  function buildSelect(labelText, currentCode) {
    const field = el('div', 'jellio-settings-field');
    field.appendChild(el('label', 'jellio-settings-field-label', labelText));
    const select = document.createElement('select');
    select.className = 'jellio-settings-input';
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'No preference';
    select.appendChild(noneOption);
    LANGUAGE_OPTIONS.forEach(function (option) {
      const opt = document.createElement('option');
      opt.value = option.code;
      opt.textContent = option.name;
      select.appendChild(opt);
    });
    // A saved code might be the alternate ISO form this canonical
    // option list does not itself carry (deu rather than ger, for a
    // preference set from some other real Jellyfin client): matched by
    // real name, the one thing both forms actually agree on, rather
    // than left looking unset.
    const matched = LANGUAGE_OPTIONS.find(function (option) {
      return option.code === (currentCode || '').toLowerCase() || option.name === languageName(currentCode);
    });
    select.value = matched ? matched.code : '';
    field.appendChild(select);
    return { field: field, select: select };
  }

  const audio = buildSelect('Default audio language', configuration.AudioLanguagePreference);
  const subtitle = buildSelect('Default subtitle language', configuration.SubtitleLanguagePreference);

  function handleChange() {
    audio.select.disabled = true;
    subtitle.select.disabled = true;
    status.textContent = 'Saving…';
    updateLanguagePreferences(audio.select.value, subtitle.select.value)
      .then(function () {
        status.textContent = 'Saved, takes effect the next time you start playback.';
      })
      .catch(function (err) {
        console.warn('Jellio: could not update language preferences', err);
        status.textContent = 'Could not save language preferences.';
      })
      .finally(function () {
        audio.select.disabled = false;
        subtitle.select.disabled = false;
      });
  }
  audio.select.addEventListener('change', handleChange);
  subtitle.select.addEventListener('change', handleChange);

  section.appendChild(audio.field);
  section.appendChild(subtitle.field);
  section.appendChild(status);
  return section;
}

// Real endpoint pair, GET /QuickConnect/Enabled + POST /QuickConnect/
// Authorize: no section at all when the server admin has turned the
// whole real feature off, same reasoning every other self hiding
// section in this screen already uses (buildSleepTimerSection above
// included).
async function buildQuickConnectSection() {
  let enabled = false;
  try {
    enabled = await isQuickConnectEnabled();
  } catch (err) {
    console.warn('Jellio: could not check Quick Connect availability', err);
  }
  if (!enabled) return null;

  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'Quick Connect'));

  const form = document.createElement('form');
  form.className = 'jellio-settings-form';

  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'Code shown on the other device';
  codeInput.autocomplete = 'off';
  codeInput.className = 'jellio-settings-input';
  codeInput.maxLength = 6;

  const status = el('p', 'jellio-settings-status');
  const submit = el('button', 'jellio-settings-button', 'Approve');
  submit.type = 'submit';

  form.appendChild(codeInput);
  form.appendChild(status);
  form.appendChild(submit);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;
    submit.disabled = true;
    status.textContent = 'Approving…';
    authorizeQuickConnect(code)
      .then(function (authorized) {
        status.textContent = authorized ? 'Device approved.' : 'That code was not recognized.';
        if (authorized) form.reset();
      })
      .catch(function (err) {
        console.warn('Jellio: could not authorize Quick Connect', err);
        status.textContent = 'Could not approve that code.';
      })
      .finally(function () {
        submit.disabled = false;
      });
  });

  section.appendChild(form);
  return section;
}

async function buildSleepTimerSection() {
  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'Sleep timer'));
  const status = el('p', 'jellio-settings-status', 'No active playback session.');
  section.appendChild(status);

  try {
    const result = await getSleepTimerStatus();
    if (result && result.Active) {
      status.textContent = 'A sleep timer is running.';
      const cancel = el('button', 'jellio-settings-button', 'Cancel timer');
      cancel.type = 'button';
      cancel.addEventListener('click', function () {
        cancel.disabled = true;
        cancelSleepTimer()
          .then(function () {
            status.textContent = 'Sleep timer cancelled.';
            cancel.remove();
          })
          .catch(function (err) {
            console.warn('Jellio: could not cancel sleep timer', err);
            cancel.disabled = false;
          });
      });
      section.appendChild(cancel);
    } else {
      status.textContent = 'No sleep timer is running.';
    }
  } catch (err) {
    console.warn('Jellio: could not load sleep timer status', err);
  }
  return section;
}

// Real feedback: this whole screen used to be one flat column, every
// section (Profile, Playback, Language, Change password, Sleep timer,
// Quick Connect, Sign out) stacked in a row a reader had to scroll
// past everything else to reach. Nuvio's own real Settings screen
// (screenshot checked before writing this) groups the same kind of
// content behind a category sidebar instead, one category's own
// section(s) visible at a time. Categories below are this app's own
// real equivalent grouping, not a blind copy of Nuvio's own four
// (Account/General/About/Advanced): Nuvio's Content & Discovery,
// Downloads and Integrations categories describe real settings this
// app has no equivalent of at all (no addon management, no offline
// downloads here), nothing to port for those without inventing a
// feature to go with it.
function buildAccountCategory(user) {
  const wrap = el('div', 'jellio-settings-category');

  const profile = el('section', 'jellio-settings-section');
  profile.appendChild(el('h2', 'jellio-settings-section-title', 'Profile'));
  if (user) {
    profile.appendChild(el('p', 'jellio-settings-status', 'Signed in as ' + user.Name));
  }

  // Real feedback: both buttons below used to be appended straight
  // into this plain section, no layout of their own at all beyond
  // .jellio-settings-button's own align-self (a no-op outside a real
  // flex parent), so they and the status line above them all just
  // stacked with real zero gap between them, reported live against a
  // real screenshot.
  const actions = el('div', 'jellio-settings-profile-actions');

  // Real feedback: this screen used to be the sidebar's own real
  // Settings destination, which used to just fall through to native
  // jellyfin-web on a dead route, real access to Plugins/Users/Server
  // settings landing on it by accident once native's own chrome
  // showed through. Fixing that route (components/navShared.js's own
  // SETTINGS_LINK) closed that accidental door along with the bug,
  // reported live as no longer being able to reach admin at all. Real
  // Jellyfin's own UserDto.Policy.IsAdministrator (populated for the
  // signed in user's own real record, confirmed against BaseItemDto
  // before writing this) is the one real gate every native admin link
  // already uses, matched here rather than showing this to every
  // reader. #/dashboard has no entry in app.js's own SCREENS table, so
  // navigating there leaves native jellyfin-web showing through
  // unreskinned, the same real fallback discipline every other
  // unmigrated route already gets.
  if (user && user.Policy && user.Policy.IsAdministrator) {
    const dashboardButton = el('button', 'jellio-settings-button', 'Open admin dashboard');
    dashboardButton.type = 'button';
    dashboardButton.addEventListener('click', function () {
      navigateTo('#/dashboard');
    });
    actions.appendChild(dashboardButton);
  }

  const avatarButton = el('button', 'jellio-settings-button', 'Change avatar');
  avatarButton.type = 'button';
  avatarButton.addEventListener('click', function () {
    // The sidebar's own avatar used to pick this up for free on the
    // next navigation's own full rebuild; it no longer rebuilds at
    // all past its first real render (components/sidebar.js's own
    // renderSidebar), so a changed avatar needs this live nudge or it
    // never appears until the next reload.
    openAvatarPicker(refreshProfileAvatar);
  });
  actions.appendChild(avatarButton);
  profile.appendChild(actions);
  wrap.appendChild(profile);

  wrap.appendChild(buildPasswordSection());

  const account = el('section', 'jellio-settings-section');
  const logoutButton = el('button', 'jellio-settings-button jellio-settings-button-danger', 'Sign out');
  logoutButton.type = 'button';
  logoutButton.addEventListener('click', function () {
    logout();
  });
  account.appendChild(logoutButton);
  wrap.appendChild(account);

  return wrap;
}

function buildPlaybackCategory(user) {
  const wrap = el('div', 'jellio-settings-category');
  wrap.appendChild(buildPlaybackSection());
  wrap.appendChild(buildLanguageSection(user));
  return wrap;
}

function buildSessionsCategory(sleepTimerSection, quickConnectSection) {
  const wrap = el('div', 'jellio-settings-category');
  wrap.appendChild(sleepTimerSection);
  if (quickConnectSection) wrap.appendChild(quickConnectSection);
  return wrap;
}

// app.js's own real script tag, the one IndexHtmlPatchService itself
// stamps a ?v= query string onto every release (confirmed against
// that file's own header, and against this exact query string live in
// this server's own served index.html): the one place this plugin's
// own real running version already lives on the page, read back here
// rather than adding a second endpoint just to ask the backend for
// what the page it already served says.
function jellioVersion() {
  const script = document.querySelector('script[src*="/Jellio/frontend/app.js"]');
  if (!script) return '';
  try {
    return new URL(script.src, window.location.origin).searchParams.get('v') || '';
  } catch (err) {
    return '';
  }
}

function buildAboutCategory() {
  const wrap = el('div', 'jellio-settings-category');
  const section = el('section', 'jellio-settings-section');
  section.appendChild(el('h2', 'jellio-settings-section-title', 'About'));
  const version = jellioVersion();
  section.appendChild(el('p', 'jellio-settings-status', version ? 'Jellio ' + version : 'Jellio'));
  wrap.appendChild(section);
  return wrap;
}

const CATEGORY_ICONS = {
  account: 'person',
  playback: 'play_circle',
  sessions: 'devices',
  about: 'info',
};

export async function renderSettings(root) {
  root.textContent = '';
  root.className = 'jellio-content jellio-screen-settings';

  const header = el('header', 'jellio-settings-header');
  header.appendChild(el('h1', 'jellio-settings-title', 'Settings'));
  root.appendChild(header);

  // buildSleepTimerSection/buildQuickConnectSection each own real
  // network round trip and neither one depends on the signed in
  // user's own data at all, so all three fire together here instead
  // of those two sections each waiting on the user fetch to even
  // start.
  const [userResult, sleepTimerSection, quickConnectSection] = await Promise.all([
    getCurrentUser().catch(function (err) {
      console.warn('Jellio: could not load current user', err);
      return null;
    }),
    buildSleepTimerSection(),
    buildQuickConnectSection(),
  ]);
  const user = userResult;

  const categories = [
    { id: 'account', label: 'Account', build: function () { return buildAccountCategory(user); } },
    { id: 'playback', label: 'Playback', build: function () { return buildPlaybackCategory(user); } },
    {
      id: 'sessions',
      label: 'Sessions',
      build: function () { return buildSessionsCategory(sleepTimerSection, quickConnectSection); },
    },
    { id: 'about', label: 'About', build: buildAboutCategory },
  ];

  const layout = el('div', 'jellio-settings-layout');
  const nav = el('nav', 'jellio-settings-nav');
  nav.setAttribute('role', 'tablist');
  const content = el('div', 'jellio-settings-content');
  layout.appendChild(nav);
  layout.appendChild(content);
  root.appendChild(layout);

  function selectCategory(category, button) {
    Array.prototype.forEach.call(nav.children, function (child) {
      child.classList.remove('jellio-settings-nav-item-active');
      child.setAttribute('aria-selected', 'false');
    });
    button.classList.add('jellio-settings-nav-item-active');
    button.setAttribute('aria-selected', 'true');
    content.textContent = '';
    content.appendChild(category.build());
  }

  categories.forEach(function (category, index) {
    const button = el('button', 'jellio-settings-nav-item');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.appendChild(el('span', 'material-icons jellio-settings-nav-icon ' + CATEGORY_ICONS[category.id]));
    button.appendChild(el('span', 'jellio-settings-nav-label', category.label));
    button.addEventListener('click', function () {
      selectCategory(category, button);
    });
    nav.appendChild(button);
    if (index === 0) selectCategory(category, button);
  });
}
