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
import { makeRowTitleClickable } from './rowListModal.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function buildRow(title, items, cardOptions) {
  if (!items || !items.length) return null;

  const section = el('section', 'jellio-row');
  const titleEl = el('h2', 'jellio-row-title', title);
  section.appendChild(titleEl);
  makeRowTitleClickable(titleEl, title, items);

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
