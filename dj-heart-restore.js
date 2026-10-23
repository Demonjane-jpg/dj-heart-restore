// DJ Heart Restore 1.0.1 — no dependencies, storage, servers, or telemetry.
// API references and compatibility notes are in README.md.
(() => {
  "use strict";
  const KEY = "__djHeartRestore";
  const VERSION = "1.0.1";
  window[KEY]?.dispose?.();

  let disposed = false, api, widget, button, style, poll, bootTimer;
  let uri = null, generation = 0, saved = null, checking = false;
  let readSerial = 0, refreshJob = null, refreshAgain = false;
  let libraryEvents, observer, mountTimer, eventTimer;
  let detachedSince = 0;
  let placementFallback = false;
  const pending = new Map();
  const removers = [];
  const OUTLINE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
  const FILLED = OUTLINE.replace('fill="none"', 'fill="currentColor"');

  function current() {
    const item = api?.Player?.data?.item;
    if (!item || !/^spotify:track:[A-Za-z0-9]{22}$/.test(item.uri || "")) return null;
    const m = item.metadata || {};
    if (item.isLocal || item.is_local || item.isPlayable === false || item.is_playable === false ||
        m.is_local === "true" || m.is_playable === "false" || m.is_unplayable === "true" ||
        m.is_advertisement === "true") return null;
    // Never infer the track from context_uri, queue entries, title text, or album URI.
    return item.uri;
  }

  function supported() {
    const lib = api?.Platform?.LibraryAPI;
    return lib && ["contains", "add", "remove"].every(k => typeof lib[k] === "function");
  }

  function render() {
    if (!button || disposed) return;
    const busy = !!uri && pending.has(uri);
    const disabled = !uri || !supported() || saved === null || checking || busy;
    const label = !uri ? "DJ Heart Restore: this item cannot be saved to Liked Songs" :
      !supported() ? "DJ Heart Restore: Spotify library API unavailable" :
      busy ? "Updating Liked Songs…" : saved === null || checking ? "Checking Liked Songs…" :
      saved ? "Remove from Liked Songs" : "Save to Liked Songs";
    const icon = saved === true ? FILLED : OUTLINE;
    if (widget) {
      if (widget.icon !== icon) widget.icon = icon;
      if (widget.label !== label) widget.label = label;
      widget.disabled = disabled;
      widget.active = saved === true;
    } else {
      if (button.innerHTML !== icon) button.innerHTML = icon;
      button.disabled = disabled;
      button.title = label;
    }
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(saved === true));
    button.removeAttribute("aria-checked");
    button.setAttribute("aria-busy", String(busy || checking));
    button.dataset.saved = String(saved === true);
    button.dataset.busy = String(busy || checking);
  }

  function observeTrack() {
    const next = current();
    if (next === uri) return false;
    uri = next;
    generation++;
    readSerial++;
    saved = null;
    checking = false;
    render();
    return true;
  }

  async function bounded(promise, ms = 5000) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Spotify library request timed out")), ms);
      })]);
    } finally { clearTimeout(timer); }
  }

  async function contains(target) {
    if (!supported()) throw new Error("Spotify library API unavailable");
    const value = await bounded(api.Platform.LibraryAPI.contains(target));
    if (!Array.isArray(value) || typeof value[0] !== "boolean") {
      throw new Error("Spotify returned an unknown saved-state response");
    }
    return value[0];
  }

  async function refresh() {
    if (disposed) return;
    observeTrack();
    if (refreshJob) { refreshAgain = true; return refreshJob; }
    if (!uri || pending.has(uri)) { render(); return; }
    const target = uri, epoch = generation, serial = ++readSerial;
    checking = saved === null;
    render();
    refreshJob = (async () => {
      try {
        const value = await contains(target);
        if (!disposed && current() === target && generation === epoch && serial === readSerial) saved = value;
      } catch (error) {
        // Background failures stay quiet. An unknown state disables writes until recovered.
        if (!disposed && generation === epoch && serial === readSerial) saved = null;
        console.debug("[DJ Heart Restore] Library check failed:", error.message);
      } finally {
        if (!disposed && generation === epoch && serial === readSerial) checking = false;
        render();
      }
    })();
    await refreshJob;
    refreshJob = null;
    if (refreshAgain && !disposed) { refreshAgain = false; void refresh(); }
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function click() {
    // A stale rendered button must never target a newly playing song.
    if (disposed || current() !== uri) { void refresh(); return; }
    const target = uri, epoch = generation;
    if (!target || saved === null || checking || !supported() || pending.has(target)) return;
    const operation = {};
    pending.set(target, operation);
    readSerial++;
    render();
    try {
      const before = await contains(target);
      if (disposed || current() !== target || generation !== epoch) return;
      const desired = !before;
      // setHeart in Spicetify 2.46.2 calls these exact methods but drops the Promise.
      // An explicit URI preserves track identity and lets us await and catch failures.
      // Never use toggleHeart after an await: it could act on a different track.
      const request = Promise.resolve(api.Platform.LibraryAPI[desired ? "add" : "remove"]({
        uris: [target], silent: true
      }));
      operation.request = request;
      operation.settled = false;
      request.then(() => { operation.settled = true; }, () => { operation.settled = true; });
      await bounded(request, 10000);
      let verified = false;
      for (const wait of [0, 200, 500, 1000, 1500]) {
        if (disposed) return;
        if (wait) await delay(wait);
        const actual = await contains(target);
        if (actual === desired) { verified = true; break; }
      }
      if (!verified) throw new Error("Spotify did not confirm the change to Liked Songs");
      if (!disposed && current() === target && generation === epoch) saved = desired;
    } catch (error) {
      if (!disposed) {
        console.error("[DJ Heart Restore]", error);
        if (current() === target && generation === epoch) saved = null;
        api.showNotification?.("DJ Heart Restore: could not verify Liked Songs. " + error.message, true);
      }
    } finally {
      // A timed-out write may still complete. Keep that URI locked until it settles.
      if (operation.request && !operation.settled) {
        operation.request.catch(() => {}).finally(() => {
          if (pending.get(target) === operation) pending.delete(target);
          if (!disposed) void refresh();
        });
      } else if (pending.get(target) === operation) pending.delete(target);
      if (!disposed) { observeTrack(); render(); void refresh(); }
    }
  }

  function ensureMounted() {
    if (disposed || !button) return;
    // Spotify 1.3.6 uses this semantic host; the 2.46.2 Widget API still waits
    // for the legacy mapped class. Keep its button/tooltip, repairing placement.
    const modernHost = document.querySelector('[data-testid="now-playing-widget-v2"]');
    if (modernHost && !modernHost.contains(button)) {
      modernHost.append(button);
      placementFallback = true;
      detachedSince = 0;
      return;
    }
    if (button.isConnected) { detachedSince = 0; return; }
    detachedSince ||= Date.now();
    // Let the supported Widget API mount first, including after React remounts.
    if (widget && Date.now() - detachedSince < 1500) return;
    const host = document.querySelector(".main-nowPlayingWidget-nowPlaying") ||
      document.querySelector('[data-testid="now-playing-widget"]') ||
      document.querySelector(".main-nowPlayingBar-left");
    if (host) host.append(button);
  }

  function scheduleRefresh() {
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => { if (!disposed) void refresh(); }, 120);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(bootTimer); clearTimeout(mountTimer); clearTimeout(eventTimer);
    clearInterval(poll);
    observer?.disconnect();
    for (const remove of removers) { try { remove(); } catch {} }
    widget?.deregister(); widget?.tippy?.destroy(); button?.remove(); style?.remove();
    window.removeEventListener("pagehide", dispose);
    if (window[KEY]?.dispose === dispose) delete window[KEY];
  }

  window[KEY] = {
    version: VERSION, dispose, refresh,
    getState: () => ({ uri, saved, checking, pending: pending.size,
      placement: widget ? "Spicetify.Playbar.Widget" : "player-bar fallback",
      mounted: !!button?.isConnected, placementFallback, libraryAvailable: !!supported() })
  };
  window.addEventListener("pagehide", dispose);

  function init() {
    if (disposed) return;
    api = window.Spicetify;
    if (!api?.Player?.addEventListener || !document.body) {
      bootTimer = setTimeout(init, 250);
      return;
    }
    style = document.createElement("style");
    style.id = "dj-heart-restore-style";
    style.textContent = `
      #dj-heart-restore { display:inline-flex!important; visibility:visible!important;
        align-items:center; justify-content:center; flex:0 0 32px; width:32px; height:32px;
        min-width:32px; padding:8px; margin:0 2px; border:0; border-radius:50%;
        background:transparent; color:var(--spice-subtext,#b3b3b3)!important;
        opacity:1!important; cursor:pointer; box-sizing:border-box; }
      #dj-heart-restore[data-saved="true"] { color:#1ed760!important; }
      #dj-heart-restore:not(:disabled):hover { color:var(--spice-text,#fff)!important; transform:scale(1.06); }
      #dj-heart-restore[data-saved="true"]:not(:disabled):hover { color:#3be477!important; }
      #dj-heart-restore:focus-visible { outline:2px solid var(--spice-text,#fff); outline-offset:1px; }
      #dj-heart-restore:disabled { cursor:default; }
      #dj-heart-restore[data-busy="true"] svg { opacity:.55; }
      #dj-heart-restore::before, #dj-heart-restore::after { display:none!important; }
      #dj-heart-restore svg { display:block; width:16px; height:16px; pointer-events:none; }
    `;
    document.head.append(style);
    if (typeof api.Playbar?.Widget === "function") {
      try { widget = new api.Playbar.Widget("Checking Liked Songs…", OUTLINE, () => void click(), true); }
      catch (error) { console.warn("[DJ Heart Restore] Widget unavailable:", error); }
    }
    button = widget?.element || document.createElement("button");
    if (!widget) button.addEventListener("click", click);
    button.id = "dj-heart-restore";
    button.type = "button";
    render();
    const songchange = () => { observeTrack(); void refresh(); ensureMounted(); };
    api.Player.addEventListener("songchange", songchange);
    api.Player.addEventListener("onplaypause", scheduleRefresh);
    removers.push(() => api.Player.removeEventListener("songchange", songchange),
      () => api.Player.removeEventListener("onplaypause", scheduleRefresh));
    // Platform APIs are internal; feature-detect these source-verified events.
    function bindLibraryEvents() {
      const events = api.Platform?.LibraryAPI?.getEvents?.();
      if (!events?.addListener || !events?.removeListener || libraryEvents === events) return;
      if (libraryEvents) return;
      libraryEvents = events;
      for (const name of ["update", "operation_complete"]) {
        events.addListener(name, scheduleRefresh);
        removers.push(() => events.removeListener(name, scheduleRefresh));
      }
      // Avoid update_item: contains() emits it, and add/remove emits optimistic state.
    }
    try { bindLibraryEvents(); } catch (error) { console.debug("[DJ Heart Restore] Events:", error.message); }
    observer = new MutationObserver(() => {
      if (!button.isConnected && !mountTimer) mountTimer = setTimeout(() => {
        mountTimer = null; ensureMounted();
      }, 1600);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    poll = setInterval(() => {
      if (disposed) return;
      try { bindLibraryEvents(); } catch {}
      ensureMounted(); void refresh();
    }, 2500);
    ensureMounted(); void refresh();
  }
  init();
})();
