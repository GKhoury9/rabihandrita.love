/* ══════════════════════════════════════════════════════════════
   RSVP dashboard

   Talks to /api/rsvps (netlify/functions/rsvps.mjs), which checks the password
   and reads the replies back out of Netlify Forms. The password is held in
   sessionStorage only — closing the tab locks the dashboard again.
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ENDPOINT = "/api/rsvps";
  var STORAGE_KEY = "tr-rsvp-password";

  var el = {
    gate: document.getElementById("gate"),
    gateForm: document.getElementById("gate-form"),
    gatePassword: document.getElementById("gate-password"),
    gateSubmit: document.getElementById("gate-submit"),
    gateError: document.getElementById("gate-error"),

    app: document.getElementById("app"),
    list: document.getElementById("list"),
    empty: document.getElementById("empty"),
    error: document.getElementById("error"),
    resultLine: document.getElementById("result-line"),

    search: document.getElementById("search"),
    searchClear: document.getElementById("search-clear"),
    filterGuests: document.getElementById("filter-guests"),
    filterStatus: document.getElementById("filter-status"),
    filterInvite: document.getElementById("filter-invite"),
    sort: document.getElementById("sort"),
    reset: document.getElementById("reset"),
    refresh: document.getElementById("refresh"),
    exportBtn: document.getElementById("export"),
    lock: document.getElementById("lock"),
  };

  var state = {
    password: "",
    rsvps: [],
    totals: null,
  };

  /* ── Helpers ──────────────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  /** Escapes first, then wraps matches, so the highlight can never inject markup.
   *  A term containing a character that escaping rewrites (& < > " ') would match
   *  inside an entity like &amp; and split it, so those terms are left unmarked. */
  function highlight(value, term) {
    var safe = escapeHtml(value);
    if (!term || /[&<>"']/.test(term)) return safe;
    var pattern = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp("(" + pattern + ")", "gi"), "<mark>$1</mark>");
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  /** Locale-aware so accented names sort where a reader expects them. */
  var collator = new Intl.Collator(undefined, {
    sensitivity: "base",
    numeric: true,
  });

  function plural(count, singular, pluralForm) {
    return count + " " + (count === 1 ? singular : pluralForm || singular + "s");
  }

  /* ── Data ─────────────────────────────────────────────────── */

  function load(password) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password }),
    }).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || "Request failed");
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  /* ── Filtering, sorting, searching ────────────────────────── */

  function matchesGuests(rsvp, filter) {
    if (filter === "all") return true;
    if (filter === "5+") return rsvp.guests >= 5;
    return rsvp.guests === parseInt(filter, 10);
  }

  function searchIndex(rsvp) {
    return [
      rsvp.name,
      rsvp.phone,
      rsvp.message,
      rsvp.rsvp,
      rsvp.invite_from,
      rsvp.guest_names.join(" "),
    ]
      .join(" ")
      .toLowerCase();
  }

  var SORTERS = {
    "name-asc": function (a, b) {
      return collator.compare(a.name, b.name);
    },
    "name-desc": function (a, b) {
      return collator.compare(b.name, a.name);
    },
    "guests-desc": function (a, b) {
      return b.guests - a.guests || collator.compare(a.name, b.name);
    },
    "guests-asc": function (a, b) {
      return a.guests - b.guests || collator.compare(a.name, b.name);
    },
    "date-desc": function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    },
    "date-asc": function (a, b) {
      return new Date(a.created_at) - new Date(b.created_at);
    },
  };

  function visibleRsvps() {
    var term = el.search.value.trim().toLowerCase();
    var guests = el.filterGuests.value;
    var status = el.filterStatus.value;
    var invited = el.filterInvite.value;

    var rows = state.rsvps.filter(function (rsvp) {
      if (!matchesGuests(rsvp, guests)) return false;
      if (status === "attending" && !rsvp.attending) return false;
      if (status === "declined" && rsvp.attending) return false;
      if (invited !== "all" && rsvp.invite_from.toLowerCase() !== invited)
        return false;
      if (term && searchIndex(rsvp).indexOf(term) === -1) return false;
      return true;
    });

    return rows.sort(SORTERS[el.sort.value] || SORTERS["name-asc"]);
  }

  /* ── Rendering ────────────────────────────────────────────── */

  function cardMarkup(rsvp, index, term) {
    var tags = [];
    if (rsvp.invite_from) {
      tags.push(rsvp.invite_from === "rita" ? "Rita's side" : "Rabih's side");
    }

    var rows = "";

    if (rsvp.phone) {
      rows +=
        '<div class="card-row"><dt>Phone</dt><dd><a href="tel:' +
        escapeHtml(rsvp.phone.replace(/\s+/g, "")) +
        '">' +
        highlight(rsvp.phone, term) +
        "</a></dd></div>";
    }

    if (rsvp.guest_names.length) {
      rows +=
        '<div class="card-row"><dt>Guests</dt><dd><ul class="guest-list">' +
        rsvp.guest_names
          .map(function (name) {
            return "<li>" + highlight(name, term) + "</li>";
          })
          .join("") +
        "</ul></dd></div>";
    }

    if (rsvp.message) {
      rows +=
        '<div class="card-row"><dt>Message</dt><dd class="quote">&ldquo;' +
        highlight(rsvp.message, term) +
        "&rdquo;</dd></div>";
    }

    return (
      '<article class="card ' +
      (rsvp.attending ? "is-attending" : "is-declined") +
      '" style="--i: ' +
      index +
      '">' +
      '<div class="card-head">' +
      '<h2 class="card-name">' +
      highlight(rsvp.name || "Unnamed", term) +
      "</h2>" +
      '<span class="card-count">' +
      rsvp.guests +
      "<small>" +
      (rsvp.guests === 1 ? "guest" : "guests") +
      "</small></span>" +
      "</div>" +
      '<p class="card-status">' +
      (rsvp.attending ? "Joyfully accepts" : "Regretfully declines") +
      "</p>" +
      (tags.length
        ? '<div class="card-meta">' +
          tags
            .map(function (t) {
              return '<span class="tag">' + escapeHtml(t) + "</span>";
            })
            .join("") +
          "</div>"
        : "") +
      "<dl style=\"margin:0\">" +
      rows +
      "</dl>" +
      '<p class="card-date">' +
      formatDate(rsvp.created_at) +
      "</p>" +
      "</article>"
    );
  }

  function render() {
    var rows = visibleRsvps();
    var term = el.search.value.trim().toLowerCase();

    el.list.innerHTML = rows
      .map(function (rsvp, i) {
        return cardMarkup(rsvp, i, term);
      })
      .join("");

    // The left rule draws itself in once the card has settled.
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(el.list.children, function (card, i) {
        setTimeout(function () {
          card.classList.add("is-revealed");
        }, 60 + i * 45);
      });
    });

    var guestTotal = rows
      .filter(function (r) {
        return r.attending;
      })
      .reduce(function (sum, r) {
        return sum + (r.guests || 0);
      }, 0);

    var tail = " · " + plural(guestTotal, "guest") + " attending";

    el.resultLine.textContent =
      rows.length === state.rsvps.length
        ? plural(rows.length, "reply", "replies") + tail
        : "Showing " + rows.length + " of " + state.rsvps.length + tail;

    el.empty.hidden = rows.length > 0;
    el.searchClear.hidden = !el.search.value;
  }

  function renderTotals(totals) {
    if (!totals) return;
    Object.keys(totals).forEach(function (key) {
      var node = document.querySelector('[data-stat="' + key + '"]');
      if (!node) return;
      countUp(node, totals[key]);
    });
  }

  /** Ticks the summary numbers up rather than snapping them into place. */
  function countUp(node, target) {
    var start = performance.now();
    var from = parseInt(node.textContent, 10) || 0;
    var duration = 700;

    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /* ── CSV export ───────────────────────────────────────────── */

  function toCsv(rows) {
    var headers = [
      "Name",
      "Reply",
      "Guests",
      "Phone",
      "Guest names",
      "Invited by",
      "Message",
      "Received",
    ];

    var cell = function (value) {
      return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
    };

    var lines = rows.map(function (r) {
      return [
        r.name,
        r.rsvp,
        r.guests,
        r.phone,
        r.guest_names.join("; "),
        r.invite_from,
        r.message,
        r.created_at,
      ]
        .map(cell)
        .join(",");
    });

    // The BOM makes Excel open the file as UTF-8 rather than mangling accents.
    return "﻿" + headers.map(cell).join(",") + "\r\n" + lines.join("\r\n");
  }

  function exportCsv() {
    var blob = new Blob([toCsv(visibleRsvps())], {
      type: "text/csv;charset=utf-8;",
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "rabih-rita-rsvps.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ── Wiring ───────────────────────────────────────────────── */

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }

  function refresh() {
    el.refresh.disabled = true;
    el.app.classList.add("is-loading");
    el.error.hidden = true;

    return load(state.password)
      .then(function (body) {
        state.rsvps = body.rsvps;
        state.totals = body.totals;
        renderTotals(body.totals);
        render();
      })
      .catch(function (error) {
        if (error.status === 401) return lock();
        showError(error.message);
      })
      .then(function () {
        el.refresh.disabled = false;
        el.app.classList.remove("is-loading");
      });
  }

  function unlock(password, body) {
    state.password = password;
    state.rsvps = body.rsvps;
    state.totals = body.totals;

    try {
      sessionStorage.setItem(STORAGE_KEY, password);
    } catch (e) {
      // Private-mode browsers refuse sessionStorage; the dashboard still works,
      // it just asks for the password again on reload.
    }

    el.gate.classList.add("is-open");
    el.app.hidden = false;
    renderTotals(body.totals);
    render();

    setTimeout(function () {
      el.gate.hidden = true;
    }, 650);
  }

  function lock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* nothing to clear */
    }
    window.location.reload();
  }

  el.gateForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var password = el.gatePassword.value;

    el.gateSubmit.disabled = true;
    el.gateError.hidden = true;

    load(password)
      .then(function (body) {
        unlock(password, body);
      })
      .catch(function (error) {
        el.gateError.textContent = error.message;
        el.gateError.hidden = false;
        el.gatePassword.select();
      })
      .then(function () {
        el.gateSubmit.disabled = false;
      });
  });

  [el.filterGuests, el.filterStatus, el.filterInvite, el.sort].forEach(function (
    control
  ) {
    control.addEventListener("change", render);
  });

  var searchTimer;
  el.search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 140);
  });

  el.searchClear.addEventListener("click", function () {
    el.search.value = "";
    el.search.focus();
    render();
  });

  el.reset.addEventListener("click", function () {
    el.search.value = "";
    el.filterGuests.value = "all";
    el.filterStatus.value = "all";
    el.filterInvite.value = "all";
    el.sort.value = "name-asc";
    render();
  });

  el.refresh.addEventListener("click", refresh);
  el.exportBtn.addEventListener("click", exportCsv);
  el.lock.addEventListener("click", lock);

  // "/" focuses search, Escape clears it — this list gets scanned a lot.
  document.addEventListener("keydown", function (event) {
    if (el.app.hidden) return;
    if (event.key === "/" && document.activeElement !== el.search) {
      event.preventDefault();
      el.search.focus();
    } else if (event.key === "Escape" && document.activeElement === el.search) {
      el.search.value = "";
      render();
    }
  });

  /* ── Resume a session ─────────────────────────────────────── */

  var saved = null;
  try {
    saved = sessionStorage.getItem(STORAGE_KEY);
  } catch (e) {
    /* storage unavailable — fall through to the gate */
  }

  if (saved) {
    load(saved)
      .then(function (body) {
        unlock(saved, body);
      })
      .catch(function () {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) {
          /* nothing to clear */
        }
      });
  }
})();
