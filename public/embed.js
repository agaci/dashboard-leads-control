/**
 * YourBox Widget Embed — v1
 *
 * Usage:
 *   <script src="https://leads.comgo.pt/embed.js"
 *           data-ybw-client="YOUR_CLIENT_ID"></script>
 *
 * Optional attributes:
 *   data-ybw-base   — override the base URL (default: https://leads.comgo.pt)
 *   data-ybw-width  — iframe width (default: 100%)
 */
(function () {
  'use strict';

  var s = document.currentScript;
  if (!s) {
    var all = document.querySelectorAll('script[data-ybw-client]');
    s = all[all.length - 1];
  }
  if (!s) return;

  var clientId = s.getAttribute('data-ybw-client');
  if (!clientId) { console.warn('[YBW] data-ybw-client is required'); return; }

  var base  = (s.getAttribute('data-ybw-base')  || 'https://leads.comgo.pt').replace(/\/$/, '');
  var width = s.getAttribute('data-ybw-width') || '100%';

  var iframe = document.createElement('iframe');
  iframe.src = base + '/widget.html?clientId=' + encodeURIComponent(clientId);
  iframe.id  = 'ybw-' + clientId;
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('frameborder', '0');
  iframe.style.cssText = 'width:' + width + ';border:none;display:block;overflow:hidden;transition:height 0.25s ease;';
  iframe.style.height  = '640px'; // fallback before first resize message

  s.parentNode.insertBefore(iframe, s.nextSibling);

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'ybw-resize') return;
    if (e.data.clientId !== clientId) return;
    iframe.style.height = (e.data.height + 24) + 'px';
  });
})();
