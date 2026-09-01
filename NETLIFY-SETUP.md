# Rabih &amp; Rita — Netlify setup

The site is fully static. There is no PHP, no build step, and no server to
maintain: Netlify serves the files, **Netlify Forms** collects the RSVPs, and a
single serverless function reads them back for the dashboard.

---

## 1. Deploy

Connect the repository (or drag the folder onto <https://app.netlify.com/drop>).
`netlify.toml` already sets everything:

| Setting        | Value                |
| -------------- | -------------------- |
| Build command  | *(none)*             |
| Publish dir    | `.`                  |
| Functions dir  | `netlify/functions`  |

## 2. Turn on form detection

**Site configuration → Forms → Form detection → Enable.**
Then **redeploy once** — Netlify only scans for forms at deploy time, so the
`rsvp` form appears after the first build that runs with detection on.

## 3. Get the RSVP emails

This replaces the old PHPMailer/Brevo script.

**Site configuration → Forms → Form notifications → Add notification →
Email notification**

- Event to listen for: **New form submission**
- Form: **rsvp**
- Email to notify: **whichever address should receive the replies**

> The old site hard-coded `Rasha.najd@hotmail.com` into `contact.php`. There is
> no address baked into the code any more — you set it here, in the Netlify UI,
> and can change it any time without a redeploy.

Every reply then lands in that inbox *and* in the dashboard.

## 4. Environment variables

**Site configuration → Environment variables**

| Variable             | What it is                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_PASSWORD` | The password the dashboard asks for. Pick anything.                                                                                                |
| `RSVP_API_TOKEN`     | A Netlify **personal access token** — User settings → Applications → Personal access tokens → New access token. This is what lets the function read your form submissions. |

> The token variable deliberately isn't called `NETLIFY_API_TOKEN`: Netlify
> reserves the `NETLIFY_` prefix and refuses to store variables that use it.
> `SITE_ID` is injected automatically, so you don't set it.

Redeploy after adding them — functions pick up environment variables at deploy.

---

## The dashboard

Live at **`/dashboard`** (`https://your-site.netlify.app/dashboard`).

It is password-gated, excluded from search engines, and set to `no-store` so it
is never cached. The password is checked **server-side** in the function and
held only in `sessionStorage` — closing the tab locks it again.

**What it does**

- **Search** — one box across names, phone numbers, guest names and messages,
  with matches highlighted. Press `/` to jump to it, `Esc` to clear.
- **Filter by number of guests** — 1, 2, 3, 4, or 5-and-over.
- **Filter by reply** — attending or declined.
- **Filter by which side invited them** — Rabih's side or Rita's side.
- **Sort** — alphabetical A→Z and Z→A, guests most/fewest first, newest/oldest.
- **Summary tiles** — replies, attending, declined, and total guests expected.
- **Export CSV** — exports exactly what's on screen, filters and all, UTF-8 with
  a BOM so Excel opens Arabic and accented names correctly.

---

## Invitation links

Every guest is invited to the same thing: the ceremony and the dinner that
follows it are identical on every link and are plain text in `index.html`. What varies is who
did the inviting, and how many seats they were given:

```
https://your-site.netlify.app/?from=rita&guests=2
```

| Parameter | Values            | Effect                                                                              |
| --------- | ----------------- | ----------------------------------------------------------------------------------- |
| `guests`  | `1`–`20`          | Locks the guest count on the RSVP form and renders that many guest-name inputs.      |
| `from`    | `rita` / `rabih`  | `rita` shows the **Liste de Mariage** block. `rabih` hides it.                        |

The liste de mariage appears **only** on an explicit `?from=rita`. A missing or
unrecognised `from` keeps it hidden, so a link that loses its query string never
asks anyone for a contribution. The `from` value rides along with the submission,
which is what feeds the side tag and the *Invited by* filter on the dashboard.

### Changing the liste de mariage details

The block holds the bank name and the account number — edit them in
[`index.html`](index.html), in the `<div class="registry">` markup inside the
*With Love* card.

### Changing the ceremony details

Venue, date, time and the map pin are static markup — edit them once in
[`index.html`](index.html), in the `zz-box` block under
`<h3 class="zz-title">Ceremony</h3>`. The countdown reads its target from the
`data-countdown` attribute a few lines below, in `M/D/YYYY` form.

---

## What changed from the PHP site

| Before                                        | Now                                                       |
| --------------------------------------------- | --------------------------------------------------------- |
| `index.php` rendered by PHP                   | `index.html` + `js/invite.js`                              |
| `contact.php` → PHPMailer → Brevo             | Netlify Forms → email notification + dashboard             |
| Two ceremonies, chosen by `?from=talal/rasha` | One ceremony for every guest, static in the HTML           |
| `?invite=day/day-night` gated the dinner      | Dinner is on every invitation; `?from=` gates the registry |
| Full page reload on submit                    | AJAX submit with an inline confirmation, no reload         |
| `?success=1` query flag                       | Inline message; `thankyou.html` is the no-JS fallback     |
| WOW.js (disabled on mobile)                   | `js/anim.js` reveal engine, runs everywhere                |
| Ivory / silver palette                        | Strict monochrome (`css/mono.css`), greyscale photography  |

The PHP files are deleted. `netlify.toml` still redirects `/index.php` and
`/contact.php` to `/`, so an old bookmarked link lands on the real site instead
of a 404.

---

## Local preview

```bash
npx netlify-cli dev
```

That serves the site *and* the `/api/rsvps` function. Set `DASHBOARD_PASSWORD`
and `RSVP_API_TOKEN` in a local `.env` to exercise the dashboard. Form
submissions only work against a deployed site — a plain
`python -m http.server` renders the whole site fine, but the RSVP POST will
fail, which the form reports as an error rather than swallowing.
