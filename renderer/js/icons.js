'use strict';

// SmallFirm Solution — monochrome line-icon set (Feather-style).
// Each entry is the inner markup of a 24x24 viewBox SVG drawn with currentColor.

const ICON_PATHS = {
  home: '<path d="M3 10.6 12 3l9 7.6"/><path d="M5.6 9.4V20h12.8V9.4"/><path d="M10 20v-5h4v5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  invoice: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  cart: '<path d="M3 4h2l2.3 10.6a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.6L21 7H6"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17.5" cy="19.5" r="1.3"/>',
  wallet: '<path d="M3 7.5h18V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 7.5 5.5 4.5h11L19 7.5"/><path d="M16.5 13.5h2"/>',
  box: '<path d="M21 8.2 12 3.4 3 8.2v7.6l9 4.8 9-4.8z"/><path d="M3 8.2l9 4.8 9-4.8"/><path d="M12 13v7.6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 19.2v-.9A4.1 4.1 0 0 1 6.9 14.2h4.2a4.1 4.1 0 0 1 4.1 4.1v.9"/><path d="M16.6 5.3a3.2 3.2 0 0 1 0 5.6"/><path d="M18.4 14.6a4.1 4.1 0 0 1 2.8 3.9v.7"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>',
  tag: '<path d="M20.6 13.4 12.4 21.6a1.4 1.4 0 0 1-2 0L2.8 14a1.4 1.4 0 0 1-.4-1V4.4A1.4 1.4 0 0 1 3.8 3h8.6a1.4 1.4 0 0 1 1 .4l7.2 7.2a1.4 1.4 0 0 1 0 2z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  truck: '<path d="M3 6.5h11v9H3z"/><path d="M14 9.5h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  clipboard: '<path d="M9 4.5h6v2.6H9z"/><path d="M15 5.8h2.2A1.8 1.8 0 0 1 19 7.6v11.6A1.8 1.8 0 0 1 17.2 21H6.8A1.8 1.8 0 0 1 5 19.2V7.6a1.8 1.8 0 0 1 1.8-1.8H9"/><path d="M9 12h6M9 16h4"/>',
  rotate: '<path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2"/><path d="M3 4.2v5h5"/>',
  card: '<path d="M2.5 7h19v10.5h-19z"/><path d="M2.5 11h19"/><path d="M6 14.5h3"/>',
  arrowDown: '<path d="M12 3.5v13"/><path d="M6.5 11 12 16.5 17.5 11"/><path d="M4 20.5h16"/>',
  arrowUp: '<path d="M12 20.5v-13"/><path d="M6.5 13 12 7.5 17.5 13"/><path d="M4 3.5h16"/>',
  coins: '<ellipse cx="12" cy="6.6" rx="7" ry="3.1"/><path d="M5 6.6v4.2c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V6.6"/><path d="M5 10.8v4.2c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1v-4.2"/>',
  building: '<path d="M4 21V6.5L12 3l8 3.5V21"/><path d="M9 21v-4h6v4"/><path d="M8.5 10h2M13.5 10h2M8.5 13.5h2M13.5 13.5h2"/>',
  shield: '<path d="M12 3 20 6v6c0 4.6-3.3 7.8-8 9-4.7-1.2-8-4.4-8-9V6z"/><path d="M9 12.2l2.1 2.1L15.2 10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevronRight: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevronDown: '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
  more: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01"/>',
  camera: '<path d="M3 8.5h3.2L8 6h8l1.8 2.5H21V19H3z"/><circle cx="12" cy="13" r="3.4"/>',
  barcode: '<path d="M3 6v12M6.5 6v12M10 6v12M13.5 6v12M17 6v12M20.5 6v12"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2.5v2.5H14zM18.5 18.5H21V21h-2.5zM14 20.5h1M20.5 14h.01"/>',
  printer: '<path d="M7 9V3.5h10V9"/><path d="M5 9h14a2 2 0 0 1 2 2v5h-4v4.5H7V16H3v-5a2 2 0 0 1 2-2z"/><path d="M7 16h10"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 9.5v5M12 17.5h.01"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  book: '<path d="M4 4.5h6.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H4z"/><path d="M20 4.5h-6.5A2.5 2.5 0 0 0 11 7v13a2 2 0 0 1 2-2h7z"/>',
  calendar: '<path d="M4 6.5h16V20H4z"/><path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5 18.5 9.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
  eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'
};

// legacy emoji → icon, so existing call sites keep working
const EMOJI_TO_ICON = {
  '🏠': 'home', '🗂️': 'list', '🧾': 'invoice', '📝': 'invoice', '📄': 'invoice',
  '📦': 'box', '🚚': 'truck', '↩️': 'rotate', '📋': 'clipboard', '🛒': 'cart',
  '💸': 'wallet', '💰': 'coins', '🏦': 'wallet', '💳': 'card', '⬇️': 'arrowDown',
  '⬆️': 'arrowUp', '👥': 'users', '🏷️': 'tag', '📊': 'chart', '⚙️': 'settings',
  '🏢': 'building', '🛟': 'shield', '⚠️': 'alert', '📒': 'book', '📅': 'calendar',
  '🔍': 'search', '📷': 'camera', '🖨️': 'printer', '💵': 'coins', '📉': 'chart',
  '📈': 'chart', '✅': 'check'
};

function iconSvg(name, size = 16, extraClass = '') {
  const key = ICON_PATHS[name] ? name : (EMOJI_TO_ICON[name] || null);
  if (!key) return '';
  const body = ICON_PATHS[key];
  return `<svg class="ic ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function iconEl(name, size = 16, extraClass = '') {
  const span = document.createElement('span');
  span.className = 'ic-wrap';
  span.innerHTML = iconSvg(name, size, extraClass);
  return span.firstChild || span;
}

function hasIcon(name) { return !!ICON_PATHS[name] || !!EMOJI_TO_ICON[name]; }
