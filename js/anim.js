/* ══════════════════════════════════════════════════════════════
   Rita & Rabih — motion engine

   Replaces WOW.js with an IntersectionObserver-based reveal. WOW was
   configured with mobile:false, so on phones the whole site arrived with no
   animation at all; this runs everywhere and costs one observer.

   It also splits the plain-text headings into words and hands out staggered
   delays, so the CSS in css/anim.css has something to key off. Both stay in
   step through the --reveal-delay and --word-index custom properties.

   This file executes while the document is still parsing, which is before
   jQuery's ready handler fires — so the .wow classes are converted and
   stripped before script.js ever calls wow.init() and finds nothing to do.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Adopt the existing .wow markup ───────────────────────── */

  var DIRECTIONS = {
    fadeInLeft: "left",
    fadeInRight: "right",
    fadeInUp: "up",
    fadeInDown: "up",
    fadeIn: "fade",
  };

  Array.prototype.forEach.call(document.querySelectorAll(".wow"), function (el) {
    var direction = "up";
    Object.keys(DIRECTIONS).forEach(function (name) {
      if (el.classList.contains(name)) {
        direction = DIRECTIONS[name];
        el.classList.remove(name);
      }
    });

    el.classList.remove("wow");
    el.setAttribute("data-reveal", direction);

    var delay = el.getAttribute("data-wow-delay");
    if (delay) el.style.setProperty("--reveal-delay", delay);
  });

  // Sections that were never marked up for WOW still deserve a reveal.
  Array.prototype.forEach.call(
    document.querySelectorAll(".zz-photo:not([data-reveal])"),
    function (el, i) {
      el.setAttribute("data-reveal", "up");
      el.style.setProperty("--reveal-delay", i * 150 + "ms");
    }
  );

  /* ── Headings arrive a word at a time ─────────────────────── */

  // Only headings that are plain text — the couple's names have their own
  // letter-spacing settle and are deliberately left whole.
  var SPLIT_HEADINGS = [
    ".zz-head h2",
    ".contact-form-two .title",
    "#rsvp .content-column .content-box .title",
    ".registry-title",
  ].join(", ");

  Array.prototype.forEach.call(
    document.querySelectorAll(SPLIT_HEADINGS),
    function (heading) {
      var words = heading.textContent.trim().split(/\s+/);
      if (words.length < 2) return;

      heading.textContent = "";
      words.forEach(function (word, i) {
        var span = document.createElement("span");
        span.className = "word";
        span.style.setProperty("--word-index", i);
        span.textContent = word;
        heading.appendChild(span);
        // A real space between the inline-blocks, so the line still wraps and
        // still reads as words to a screen reader.
        if (i < words.length - 1) {
          heading.appendChild(document.createTextNode(" "));
        }
      });
      heading.setAttribute("data-words", "");
    }
  );

  /* ── Stagger groups of siblings ───────────────────────────── */

  function stagger(selector, step, base) {
    Array.prototype.forEach.call(
      document.querySelectorAll(selector),
      function (el, i) {
        el.style.setProperty("--reveal-delay", base + i * step + "ms");
      }
    );
  }

  // The detail cards used to carry hand-written data-wow-delay values that fell
  // out of order as cards were added and removed. Index them instead.
  stagger(".zz-boxes .zz-box", 200, 0);

  // The liste de mariage rows were never marked up for WOW at all.
  Array.prototype.forEach.call(
    document.querySelectorAll(".registry-row"),
    function (row, i) {
      row.setAttribute("data-reveal", "up");
      row.style.setProperty("--reveal-delay", 160 + i * 120 + "ms");
    }
  );

  /* ── The reveal observer ──────────────────────────────────── */

  function revealNow(el) {
    el.classList.add("is-revealed");
    // A flourish inside a revealed block draws itself as it arrives.
    Array.prototype.forEach.call(
      el.querySelectorAll(".flourish-divider"),
      function (f) {
        f.classList.add("is-drawn");
      }
    );
    if (el.classList.contains("flourish-divider")) el.classList.add("is-drawn");
  }

  var targets = document.querySelectorAll("[data-reveal], .flourish-divider");

  function startObserving() {
    if (reduced || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(targets, revealNow);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          revealNow(entry.target);
          observer.unobserve(entry.target);
        });
      },
      // Trips a little earlier than it used to: the reveals are long enough now
      // that a late trigger leaves them still moving once they're read.
      { rootMargin: "0px 0px -3% 0px", threshold: 0.05 }
    );

    Array.prototype.forEach.call(targets, function (el) {
      observer.observe(el);
    });
  }

  // The envelope covers the hero, so anything above the fold would otherwise
  // finish revealing behind it and be already in place when the flap lifts.
  // Hold the observer until openEnvelope() marks the body as revealed.
  var overlay = document.getElementById("envelope-overlay");

  if (!overlay || document.body.classList.contains("revealed")) {
    startObserving();
  } else {
    var started = false;
    var begin = function () {
      if (started) return;
      started = true;
      watcher.disconnect();
      clearTimeout(safety);
      startObserving();
    };

    var watcher = new MutationObserver(function () {
      if (document.body.classList.contains("revealed")) begin();
    });
    watcher.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // If the envelope never opens — a script error, a stuck overlay — the page
    // must not stay blank. Reveal everything anyway after a generous wait.
    var safety = setTimeout(begin, 20000);
  }

  /* ── Zigzag parallax + reading progress ───────────────────── */

  var photos = Array.prototype.slice.call(document.querySelectorAll(".zz-photo"));

  var progress = document.createElement("div");
  progress.className = "read-progress";
  document.body.appendChild(progress);

  var ticking = false;

  function onFrame() {
    ticking = false;

    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    var ratio = scrollable > 0 ? window.pageYOffset / scrollable : 0;
    progress.style.transform = "scaleX(" + Math.min(1, Math.max(0, ratio)) + ")";

    if (reduced || !photos.length) return;

    // Each photo drifts against the scroll at its own rate, so the row breathes
    // rather than moving as one block. Alternating sign keeps the zigzag reading.
    var track = photos[0].parentNode;
    var mid = track.getBoundingClientRect().top + track.offsetHeight / 2;
    var offset = (window.innerHeight / 2 - mid) / window.innerHeight;

    photos.forEach(function (photo, i) {
      var rate = (i % 2 === 0 ? 1 : -1) * (14 + (i % 3) * 8);
      photo.style.setProperty("--drift", (offset * rate).toFixed(2) + "px");
    });
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onFrame);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  schedule();

  /* ── Envelope bypass ──────────────────────────────────────── */

  // The hero copy animates off body.revealed, which openEnvelope() sets. If the
  // overlay is missing for any reason, mark the body so the hero still animates.
  if (!document.getElementById("envelope-overlay")) {
    document.body.classList.add("no-envelope");
  }
})();
