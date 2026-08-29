/* ══════════════════════════════════════════════════════════════
   RSVP dashboard API

   Reads the "rsvp" form's submissions back out of Netlify Forms and returns
   them in a shape the dashboard can sort, filter and search directly.

   Required environment variables (Site settings → Environment variables):
     DASHBOARD_PASSWORD  the password the dashboard asks for
     RSVP_API_TOKEN      a Netlify personal access token with access to this
                         site (User settings → Applications → Personal access
                         tokens). It cannot be called NETLIFY_* — Netlify
                         reserves that prefix and refuses to store it.

   SITE_ID is provided automatically by the Netlify runtime.
   ══════════════════════════════════════════════════════════════ */

const API = "https://api.netlify.com/api/v1";
const FORM_NAME = "rsvp";
const MAX_GUESTS = 20;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/** Length-independent comparison, so a wrong password can't be narrowed down
 *  by timing the response. */
function passwordMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function netlify(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Netlify API ${response.status} on ${path}`);
  }
  return response.json();
}

/** Netlify identifies forms by id, not name, so resolve the id once per call.
 *  Only the "rsvp" form is ever read — falling back to whatever form happens to
 *  be first would quietly show the wrong data if another form is ever added. */
async function resolveFormId(siteId, token) {
  const forms = await netlify(`/sites/${siteId}/forms`, token);
  const form = forms.find((f) => f.name === FORM_NAME);
  if (!form) {
    throw new Error(
      forms.length
        ? `No form named "${FORM_NAME}" on this site (found: ${forms
            .map((f) => f.name)
            .join(", ")}).`
        : "No forms detected yet — enable form detection in Site configuration → Forms, then redeploy."
    );
  }
  return form.id;
}

async function fetchAllSubmissions(formId, token) {
  const all = [];
  // The API caps a page at 100; walk until a short page comes back.
  for (let page = 1; page <= 50; page++) {
    const batch = await netlify(
      `/forms/${formId}/submissions?per_page=100&page=${page}`,
      token
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

function normalise(submission) {
  const data = submission.data ?? {};

  // Prefer the joined line the form sends; fall back to the numbered fields so
  // submissions made before that field existed still show their guests.
  let guestNames = String(data.guest_names ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  if (!guestNames.length) {
    for (let i = 1; i <= MAX_GUESTS; i++) {
      const value = data[`guest${i}`];
      if (value && String(value).trim()) guestNames.push(String(value).trim());
    }
  }

  const declared = Number.parseInt(data.guests, 10);
  const guests = Number.isFinite(declared)
    ? declared
    : guestNames.length || 0;

  return {
    id: submission.id,
    created_at: submission.created_at,
    rsvp: String(data.rsvp ?? "").trim(),
    attending: String(data.rsvp ?? "").toLowerCase().startsWith("accept"),
    name: String(data.name ?? "").trim(),
    phone: String(data.phone ?? "").trim(),
    guests,
    message: String(data.message ?? "").trim(),
    invite_from: String(data.invite_from ?? "").trim(),
    guest_names: guestNames,
  };
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  const token = process.env.RSVP_API_TOKEN ?? process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.SITE_ID ?? process.env.RSVP_SITE_ID;

  if (!expected) {
    return json(
      { error: "DASHBOARD_PASSWORD is not set on this site." },
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected a JSON body" }, 400);
  }

  if (!passwordMatches(body?.password ?? "", expected)) {
    return json({ error: "Incorrect password." }, 401);
  }

  if (!token || !siteId) {
    return json(
      {
        error:
          "RSVP_API_TOKEN (and SITE_ID) must be configured before submissions can be read.",
      },
      500
    );
  }

  try {
    const formId = await resolveFormId(siteId, token);
    const submissions = await fetchAllSubmissions(formId, token);
    const rsvps = submissions.map(normalise);

    return json({
      rsvps,
      totals: {
        submissions: rsvps.length,
        attending: rsvps.filter((r) => r.attending).length,
        declined: rsvps.filter((r) => !r.attending).length,
        guests: rsvps
          .filter((r) => r.attending)
          .reduce((sum, r) => sum + (r.guests || 0), 0),
      },
    });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
};

export const config = { path: "/api/rsvps" };
