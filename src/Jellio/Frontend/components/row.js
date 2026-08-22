// One card row, shared by screens/home.js and screens/library.js
// (previously identical copies in both, real duplication rather than
// two rows that happen to look alike). Hover revealed scroll arrows,
// components/scrollArrows.js's own shared attachScrollArrows() (real
// feedback asked for more animation "where it fits", a horizontally
// scrolling row with no visible way to move it except a mouse drag or
// a trackpad swipe was the plainest gap), also reused now by
// screens/detail.js's own season tabs and episode track, the same real
// gap this file solved once already.
import { buildCard } from './card.js';
import { attachScrollArrows } from './scrollArrows.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Icon plus uppercase text, no pill background, next to the row's own
// title: same real shape Harbor's own TrendingBadge uses on its anime
// hero (a lucide icon, no background), reused here at the row rather
// than the per card level, one real collection is either a Trending on
// AniList catalog or it is not, nothing per card to say otherwise.
function buildBadge(badge) {
  const wrap = el('span', 'jellio-row-badge');
  const icon = el('span', 'material-icons ' + badge.icon);
  icon.setAttribute('aria-hidden', 'true');
  wrap.appendChild(icon);
  wrap.appendChild(el('span', null, badge.text));
  return wrap;
}

export function buildRow(title, items, cardOptions, badge) {
  if (!items || !items.length) return null;

  const section = el('section', 'jellio-row');
  const titleRow = el('div', 'jellio-row-title-wrap');
  titleRow.appendChild(el('h2', 'jellio-row-title', title));
  if (badge) titleRow.appendChild(buildBadge(badge));
  section.appendChild(titleRow);

  const trackWrap = el('div', 'jellio-row-track-wrap');
  const track = el('div', 'jellio-row-track');
  items.forEach(function (item) {
    track.appendChild(buildCard(item, cardOptions));
  });

  trackWrap.appendChild(track);
  section.appendChild(trackWrap);
  attachScrollArrows(trackWrap, track);

  return section;
}
