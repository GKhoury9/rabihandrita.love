/* ══════════════════════════════════════════════════════════════
   Rita & Rabih — invitation logic
   Port of the original index.php server-side rendering to the browser,
   so the site can be deployed as static files on Netlify.

   Invitation link shape:
     ?from=rita&guests=2

     from   → rita | rabih — whose side invited this guest. Rita's guests see
              the liste de mariage; Rabih's do not.
     guests → 1..20, renders that many guest-name inputs on the RSVP form

   Every guest is invited to the same ceremony, reception and dinner, so all of
   those are plain markup in index.html rather than something rendered here.
   Missing or unrecognised values keep the page intact.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var MIN_GUESTS = 1;
  var MAX_GUESTS = 20;

  var params = new URLSearchParams(window.location.search);

  function param(key) {
    var value = params.get(key);
    return value === null ? "" : value.trim();
  }

  // Whose side the invitation came from. Only Rita's guests are shown the
  // liste de mariage, and only on an explicit ?from=rita — a missing or
  // unrecognised value keeps it hidden, so a stray link never asks anyone
  // for a contribution.
  var from = param("from").toLowerCase();
  var isFromRita = from === "rita";
  var isFromRabih = from === "rabih";
  var showRegistry = isFromRita;

  // Guest count: sanitise to digits, then range-check, mirroring the PHP filter.
  var guestsRaw = param("guests").replace(/[^0-9]/g, "");
  var guests = guestsRaw === "" ? 0 : parseInt(guestsRaw, 10);
  var guestsValid = guests >= MIN_GUESTS && guests <= MAX_GUESTS;
  var guestText = guests ? guests + " Guest" + (guests > 1 ? "s" : "") : "";

  /* ── Fill the celebration panel ───────────────────────────── */

  function $(selector) {
    return document.querySelector(selector);
  }

  function reveal(selector) {
    var el = $(selector);
    if (el) el.hidden = false;
  }

  if (showRegistry) reveal("[data-registry]");

  /* ── RSVP form ────────────────────────────────────────────── */

  var form = document.getElementById("contact-form");

  if (form) {
    var display = form.querySelector('input[name="guests_display"]');
    var hiddenGuests = form.querySelector('input[name="guests"]');
    var fieldHost = form.querySelector("[data-guest-fields]");

    if (hiddenGuests) hiddenGuests.value = guests ? String(guests) : "";

    // Matching the original PHP: the value is filled in whenever a count was
    // passed, but only an in-range count locks the field and becomes the
    // placeholder. An out-of-range count stays editable.
    if (display && guestText) display.value = guestText;
    if (display && guestsValid) {
      display.placeholder = guestText;
      display.readOnly = true;
    }

    // Pass the invitation's own parameter through with the submission, so the
    // dashboard can tell which side each guest was invited by.
    var side = form.querySelector('input[name="invite_from"]');
    if (side) side.value = isFromRita ? "rita" : isFromRabih ? "rabih" : "";

    // One named input per expected guest, matching the PHP loop's column widths.
    if (guestsValid && fieldHost) {
      var columnClass = guests % 2 === 0 ? "col-lg-6" : "col-lg-12";
      var markup = "";
      for (var i = 1; i <= guests; i++) {
        markup +=
          '<div class="form-group guest-field ' +
          columnClass +
          '" style="--guest-index: ' +
          i +
          '">' +
          '<div class="input-outer">' +
          '<input type="text" name="guest' +
          i +
          '" placeholder="Guest ' +
          i +
          '" required />' +
          "</div></div>";
      }
      // The host div is display:contents so the injected columns sit directly
      // in the surrounding bootstrap row.
      fieldHost.innerHTML = markup;
    }

    var feedback = form.querySelector("[data-form-feedback]");
    var button = form.querySelector('button[type="submit"]');
    var buttonLabel = button ? button.innerHTML : "";

    function say(message, kind) {
      if (!feedback) return;
      feedback.textContent = message;
      feedback.className = "form-feedback is-" + kind;
      feedback.hidden = false;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (typeof form.reportValidity === "function" && !form.reportValidity()) {
        return;
      }

      var data = new FormData(form);

      // Display-only mirror of the guest count; `guests` carries the real value.
      data.delete("guests_display");

      // Collapse the individual guest inputs into one readable line as well, so
      // the dashboard and the notification email both read naturally.
      var names = [];
      for (var n = 1; n <= MAX_GUESTS; n++) {
        var value = data.get("guest" + n);
        if (value && String(value).trim()) names.push(String(value).trim());
      }
      data.set("guest_names", names.join(", "));

      if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="btn-title">Sending&hellip;</span>';
      }
      say("Sending your reply…", "pending");

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);

          // No inline success message: the reply is confirmed on thankyou.html,
          // which words it differently for a yes and a no. The answer rides
          // along so that page knows which to show.
          var answer = String(data.get("rsvp") || "").toLowerCase();
          var going = answer.indexOf("accept") === 0 ? "accept" : "decline";
          window.location.href = "/thankyou.html?rsvp=" + going;
        })
        .catch(function () {
          say(
            "Something went wrong sending your RSVP. Please try again, or reach out to us directly.",
            "error"
          );
          if (button) {
            button.disabled = false;
            button.innerHTML = buttonLabel;
          }
        });
    });
  }

  /* ── Background music ─────────────────────────────────────── */

  var audio = document.getElementById("background-music");

  function playMusic() {
    if (!audio) return;
    audio.volume = 0.2;
    var attempt = audio.play();
    // Browsers reject autoplay until the visitor interacts; the rejection is
    // expected and harmless, the envelope tap below succeeds.
    if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
  }

  // Nothing is bound while the <audio> element is commented out of index.html,
  // so the page isn't running a mousemove handler that can only return early.
  // Restoring the element restores the behaviour, with no change needed here.
  if (audio) {
    playMusic();
    document.body.addEventListener("mousemove", playMusic);
    document.body.addEventListener("touchstart", playMusic, { passive: true });
  }

  /* ── Envelope opening screen ──────────────────────────────── */

  window.openEnvelope = function openEnvelope() {
    var overlay = document.getElementById("envelope-overlay");
    var envelope = document.getElementById("envelope");
    if (!overlay) return;

    // Play the opening animation on the envelope, then fade the whole screen away.
    if (envelope) envelope.classList.add("opening");
    playMusic();

    // The hero video has been looping behind the envelope. Restart it so it
    // opens on its first frame — and because this runs on a real tap, it also
    // covers the case where autoplay was refused on load.
    var hero = document.querySelector(".hero-photo-frame video");
    if (hero) {
      try {
        hero.currentTime = 0;
      } catch (error) {
        /* not seekable yet — it will simply keep playing from where it is */
      }
      var playing = hero.play();
      if (playing && typeof playing.catch === "function") playing.catch(function () {});
    }

    // Once the flap has lifted, dissolve the envelope and reveal the site.
    // Timings track the CSS: seal 0.5s, flap 0.14s + 0.8s, body dissolve from
    // 0.78s. Keep the two in step if either changes.
    setTimeout(function () {
      document.body.classList.add("revealed");
    }, 850);

    setTimeout(function () {
      overlay.classList.add("hidden");
    }, 900);

    setTimeout(function () {
      overlay.style.display = "none";
    }, 1400);
  };
})();
