// Shared helpers for the Abundance Hub automation. No dependencies; needs Node 20+.

const API = "https://api.github.com";

export const SCALE_LABELS = {
  Person: "scale:person",
  Household: "scale:household",
  Neighbourhood: "scale:neighbourhood",
  "City or region": "scale:city-region",
  Nation: "scale:national",
  Global: "scale:global",
};

export const SCALES = ["person", "household", "neighbourhood", "city-region", "national", "global"];
export const PHASES = ["0", "1", "2", "3"];
export const NEEDS = [
  "food", "water", "shelter", "energy", "health",
  "education", "connection", "mobility", "income", "safety",
];

/** Minimal GitHub REST client using fetch and a token from the environment. */
export function createClient(token, repoFullName) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "abundance-hub",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function request(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function paginate(path, { maxPages = 20 } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const items = await request("GET", `${path}${sep}per_page=100&page=${page}`);
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  }

  return {
    repo: repoFullName,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    paginate,
  };
}

/**
 * Parse the body of an issue created from a GitHub issue form.
 * Issue forms render as "### Label\n\nvalue" blocks. Empty fields appear as "_No response_".
 * Returns { "Label": "value" }.
 */
export function parseForm(body) {
  const fields = {};
  if (!body) return fields;
  const parts = body.split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const label = part.slice(0, nl).trim();
    let value = part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    fields[label] = value;
  }
  return fields;
}

/** Turn "12", "1,200", "about 40" into a number. Returns 0 if there is none. Caps absurd values. */
export function toNumber(text) {
  if (!text) return 0;
  const match = String(text).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1e12);
}

export function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name));
}

export function labelValue(labels, prefix) {
  const hit = labels.find((l) => l.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

export function labelValues(labels, prefix) {
  return labels.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length));
}

export function isBot(user) {
  return !user || user.type === "Bot" || /\[bot\]$/.test(user.login || "");
}
