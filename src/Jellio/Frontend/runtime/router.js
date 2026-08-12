// Real jellyfin-web navigation, not a raw hash assignment, ported from the
// original Jellio codebase's own persistentSidebar.js: window.Emby.Page
// (components/router/appRouter.js, exposed globally, confirmed real) is
// what every native link goes through, its show() records a real push.
// A bare `location.hash =` only fires the native hashchange event, and
// react-router's hash history treats any change it did not itself push
// through navigate() as a pop, indistinguishable from a real back press,
// which misbehaves on any route this runtime has not taken over yet.
// Falls back to the raw assignment only if the real router is not there.
export function navigateTo(hash) {
  if (window.Emby && window.Emby.Page && typeof window.Emby.Page.show === 'function') {
    window.Emby.Page.show(hash);
  } else {
    window.location.hash = hash;
  }
}

export function currentHash() {
  return window.location.hash || '#/home';
}

// Splits "#/movies?topParentId=X&collectionType=movies" into its path
// ("movies") and query params, the same shape every route this runtime
// owns needs to read its own arguments from.
export function parseRoute() {
  const hash = currentHash().replace(/^#\/?/, '');
  const [path, query] = hash.split('?');
  return { path: path || 'home', params: new URLSearchParams(query || '') };
}

const listeners = [];

export function onRouteChange(fn) {
  listeners.push(fn);
}

let scheduled = false;
function notify() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(function () {
    scheduled = false;
    listeners.forEach(function (fn) {
      fn(currentHash());
    });
  });
}

window.addEventListener('hashchange', notify);
window.addEventListener('popstate', notify);

// navigateTo's own real Emby.Page.show() call above lands on react-router's
// own history object (components/router/routerHistory.ts's own push(),
// confirmed real before writing this), which navigates through
// window.history.pushState()/replaceState(), never a bare hash
// assignment. pushState/replaceState never fire hashchange, only a
// user's own back/forward press or a direct location.hash write do, so
// every native-routed click this runtime hands off to Emby.Page.show()
// changed the address bar and never reached this router at all. Real
// bug, found live: Movies, Shows, Search, Favorites and every card's
// own click handler visibly changed the URL and rendered nothing.
// Patching both, the same technique any analytics script already uses
// to see SPA navigation it did not initiate itself, is the only way to
// hear a pushState call fire without owning the router that makes it.
['pushState', 'replaceState'].forEach(function (method) {
  const original = window.history[method];
  window.history[method] = function () {
    const result = original.apply(this, arguments);
    notify();
    return result;
  };
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', notify);
} else {
  notify();
}
