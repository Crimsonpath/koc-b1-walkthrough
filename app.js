/* B1 Ground Floor — click-to-load stream embed.
   - Nothing streams until the viewer clicks "Start here": each start opens a
     cloud GPU session, so the iframe is never created on page load.
   - No tracking, no cookies, no network requests of its own.
   - The password prompt is drawn by Streampixel inside the frame; this page
     never sees or stores the password. */
(function () {
  'use strict';

  var STREAM_ORIGIN = 'https://share.streampixel.io';
  // Same condition as the wide layout in styles.css. The height test keeps large
  // iPhones held sideways (430-440 px tall) on the phone layout.
  var wide = window.matchMedia('(min-width: 900px) and (min-height: 560px)');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var intro = document.getElementById('intro');
  var wrap = document.getElementById('stage-wrap');
  var stage = document.getElementById('stage');
  var start = document.getElementById('stage-start');
  var tools = document.getElementById('stage-tools');
  var status = document.getElementById('stage-status');
  var fullBtn = document.getElementById('stage-fullscreen');
  var endBtn = document.getElementById('stage-end');
  if (!intro || !wrap || !stage || !start || !tools || !status || !endBtn) return;

  var streamUrl;
  try { streamUrl = new URL(start.href); } catch (e) { return; }
  if (streamUrl.origin !== STREAM_ORIGIN) return;

  var frame = null;
  var heardFromStream = false;

  var MESSAGES = {
    authenticating: 'Checking access…',
    showPassword: 'Enter the password you received separately.',
    hidePassword: 'Connecting…',
    connecting: 'Connecting…',
    finalising: 'Almost ready…',
    loadingComplete: 'Live. Click the view, then use W A S D to walk and drag to look.',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected. Press End session, then Start here to reconnect.',
    afkWarning: 'Still there? Move or click in the view to keep the session open.',
    afkAbort: 'Live. Click the view, then use W A S D to walk and drag to look.',
    restricted: 'Access is restricted right now (address not allowed, or the project is paused).',
    unavailable: 'The walkthrough is unavailable right now. Please try again later.'
  };

  function setStatus(text) { status.textContent = text; }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function canFullscreen() {
    return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  }

  function quietly(result) {
    if (result && typeof result.catch === 'function') result.catch(function () {});
  }

  function enterFullscreen() {
    var request = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!request) return;
    try { quietly(request.call(stage)); } catch (e) { /* not allowed here */ }
  }

  function exitFullscreen() {
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return;
    try { quietly(exit.call(document)); } catch (e) { /* already out */ }
  }

  function focusFrame() {
    if (frame) {
      try { frame.focus(); } catch (e) { /* ignore */ }
    }
  }

  function openStream(byPointer) {
    if (frame) return;
    heardFromStream = false;

    frame = document.createElement('iframe');
    frame.className = 'stage-frame';
    frame.title = 'B1 Ground Floor live walkthrough';
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';   // Streampixel checks the page address for its allow-list
    frame.addEventListener('load', function () {
      if (!heardFromStream) setStatus('Follow the prompts in the view.');
    });
    frame.src = streamUrl.href;

    start.hidden = true;
    stage.appendChild(frame);
    intro.classList.add('is-live');
    tools.hidden = false;
    if (fullBtn) fullBtn.hidden = !canFullscreen();
    setStatus('Connecting…');

    // Keyboard users keep focus on the page controls (the stream captures Tab once focused).
    if (byPointer) focusFrame();
    wrap.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  }

  // Removing the iframe closes the connection, which ends the cloud session.
  function endStream(restoreFocus) {
    if (!frame) return;
    if (fullscreenElement() === stage) exitFullscreen();
    frame.remove();
    frame = null;

    tools.hidden = true;
    intro.classList.remove('is-live');
    start.hidden = false;
    setStatus('');
    if (restoreFocus) start.focus();
  }

  start.addEventListener('click', function (event) {
    // Let modified clicks (new tab/window) and narrow screens follow the link.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!wide.matches) return;
    event.preventDefault();
    openStream(event.detail > 0);
  });

  // If the screen becomes narrow (window snapped, tablet rotated), end the embedded
  // session rather than leave a paid cloud session running out of sight.
  function onWideChange(e) { if (!e.matches) endStream(false); }
  if (wide.addEventListener) wide.addEventListener('change', onWideChange);
  else if (wide.addListener) wide.addListener(onWideChange);

  endBtn.addEventListener('click', function () { endStream(true); });

  if (fullBtn) {
    fullBtn.addEventListener('click', function () {
      enterFullscreen();
      focusFrame();
    });
  }

  function onFullscreenChange() {
    if (fullscreenElement() === stage) focusFrame();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // Opening the walkthrough in its own tab ends the embedded one,
  // so only one cloud session runs at a time.
  Array.prototype.forEach.call(document.querySelectorAll('[data-open-stream]'), function (link) {
    link.addEventListener('click', function () {
      if (frame) window.setTimeout(function () { endStream(false); }, 0);
    });
  });

  // Leaving the page ends the session and resets the placeholder
  // if the browser later restores this page from its back/forward cache.
  window.addEventListener('pagehide', function () { endStream(false); });

  // Status updates posted by the Streampixel player: {type: 'stream-state', value}.
  window.addEventListener('message', function (event) {
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.origin !== STREAM_ORIGIN) return;

    var data = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || typeof data !== 'object' || data.type !== 'stream-state') return;

    var value = String(data.value);
    var queue = /^queue-(\d+)$/.exec(value);
    if (queue) {
      heardFromStream = true;
      setStatus('Waiting for a free server: number ' + queue[1] + ' in the queue.');
      return;
    }
    if (Object.prototype.hasOwnProperty.call(MESSAGES, value)) {
      heardFromStream = true;
      setStatus(MESSAGES[value]);
    }
  });
})();
