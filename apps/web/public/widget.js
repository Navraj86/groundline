/*!
 * Groundline chat widget loader.
 *
 *   <script src="https://YOUR-GROUNDLINE-HOST/widget.js" data-groundline-key="wk_..." async></script>
 *
 * Adds a chat button to the page. The chat itself runs in an iframe served by Groundline,
 * so it never touches the host page's DOM, cookies or storage.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || window.__groundlineWidget) return;
  var key = script.getAttribute("data-groundline-key");
  if (!key) {
    console.warn("[Groundline] Missing data-groundline-key on the widget script tag.");
    return;
  }
  window.__groundlineWidget = true;

  var origin = new URL(script.src).origin;
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var open = false;
  var frame = null;

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Open chat");
  button.style.cssText = [
    "position:fixed", "bottom:20px", position + ":20px", "z-index:2147483646",
    "width:56px", "height:56px", "border-radius:50%", "border:0", "cursor:pointer",
    "background:#18181b", "color:#fff", "box-shadow:0 8px 24px rgba(0,0,0,.2)",
    "display:flex", "align-items:center", "justify-content:center", "transition:transform .15s ease",
  ].join(";");
  var chatIcon =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var closeIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  button.innerHTML = chatIcon;
  button.onmouseenter = function () { button.style.transform = "scale(1.06)"; };
  button.onmouseleave = function () { button.style.transform = "scale(1)"; };

  function createFrame() {
    frame = document.createElement("iframe");
    frame.src = origin + "/widget/" + encodeURIComponent(key);
    frame.title = "Support chat";
    frame.allow = "clipboard-write";
    frame.style.cssText = [
      "position:fixed", "z-index:2147483647", "border:0", "background:#fff",
      "box-shadow:0 16px 48px rgba(0,0,0,.24)", "display:none",
    ].join(";");
    layout();
    document.body.appendChild(frame);
  }

  function layout() {
    if (!frame) return;
    var small = window.innerWidth < 480;
    var s = frame.style;
    if (small) {
      s.inset = "0"; s.width = "100%"; s.height = "100%"; s.borderRadius = "0";
    } else {
      s.inset = "auto"; s.bottom = "88px"; s[position] = "20px";
      s.width = "380px"; s.height = "min(640px, calc(100vh - 120px))"; s.borderRadius = "16px";
    }
  }

  function toggle(next) {
    open = typeof next === "boolean" ? next : !open;
    if (open && !frame) createFrame();
    if (frame) frame.style.display = open ? "block" : "none";
    button.innerHTML = open ? closeIcon : chatIcon;
    button.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", function () { toggle(); });
  window.addEventListener("resize", layout);
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.type !== "groundline:close") return;
    toggle(false);
  });

  // Match the button to the assistant's brand color.
  fetch(origin + "/api/widget/" + encodeURIComponent(key))
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (config) {
      if (config && /^#[0-9a-fA-F]{6}$/.test(config.brandColor)) button.style.background = config.brandColor;
    })
    .catch(function () {});

  function mount() { document.body.appendChild(button); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
