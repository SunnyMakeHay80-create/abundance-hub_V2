/* Abundance Hub front end. Plain JavaScript, no libraries.
   Reads data/progress.json (rebuilt by a GitHub Action), data/goals.json and data/tasks.json.
   Everything that comes from issues is written with textContent, never as HTML. */

(function () {
  "use strict";

  var SCALES = [
    ["person", "Person"],
    ["household", "Household"],
    ["neighbourhood", "Neighbourhood"],
    ["city-region", "City or region"],
    ["national", "Nation"],
    ["global", "Global"]
  ];
  var NEEDS = ["food", "water", "shelter", "energy", "health", "education", "connection", "mobility", "income", "safety"];
  var DEFAULT_PHASES = [
    { id: "0", title: "Foundations", years: "Late 2026 to 2027", summary: "" },
    { id: "1", title: "Deploy what works", years: "2027 to 2030", summary: "" },
    { id: "2", title: "Add firm power, deepen cooperation", years: "2030 to 2040", summary: "" },
    { id: "3", title: "Abundance and sharing", years: "2040 to 2055", summary: "" }
  ];
  var nf = new Intl.NumberFormat(undefined);

  /* ---------- small helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "class") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function scaleName(id) {
    for (var i = 0; i < SCALES.length; i++) if (SCALES[i][0] === id) return SCALES[i][1];
    return id || "";
  }

  function safeGithubUrl(url) {
    return typeof url === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/[^\s]*)?$/.test(url) ? url : null;
  }

  function getJson(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }

  function repoUrl(progress) {
    var cfg = (window.HUB_CONFIG && window.HUB_CONFIG.repo || "").trim();
    if (/^[\w.-]+\/[\w.-]+$/.test(cfg)) return "https://github.com/" + cfg;
    var fromData = progress && progress.repo && safeGithubUrl(progress.repo.url);
    if (fromData) return fromData;
    var host = location.hostname;
    if (/\.github\.io$/.test(host)) {
      var owner = host.split(".")[0];
      var repo = location.pathname.split("/").filter(Boolean)[0];
      if (owner && repo && /^[\w.-]+$/.test(repo)) return "https://github.com/" + owner + "/" + repo;
    }
    return null;
  }

  /* ---------- the day on the grid (illustrative) ---------- */

  var SVG_NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function gauss(t, mu, sigma) { return Math.exp(-Math.pow(t - mu, 2) / (2 * sigma * sigma)); }
  function demand(t) {
    return 0.62 + 0.12 * gauss(t, 8, 1.6) + 0.42 * gauss(t, 19.5, 2.2) - 0.1 * gauss(t, 3.5, 2.5);
  }
  function wind(t) { return 0.12 + 0.05 * Math.cos(2 * Math.PI * (t - 3) / 24); }
  function sunShape(t) { return t > 6 && t < 18 ? Math.pow(Math.sin(Math.PI * (t - 6) / 12), 1.1) : 0; }

  /* Pick the solar size so that the day balances: stored surplus (with 10% losses) equals the evening and night deficit. */
  function solveSolarScale() {
    function balance(k) {
      var surplus = 0, deficit = 0, dt = 0.1;
      for (var t = 0; t < 24; t += dt) {
        var s_ = k * sunShape(t), w = wind(t), d = demand(t);
        surplus += Math.max(0, s_ + w - d) * dt;
        deficit += Math.max(0, d - s_ - w) * dt;
      }
      return surplus * 0.9 - deficit;
    }
    var lo = 0.5, hi = 6;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (balance(mid) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function dayAt(t, k) {
    var d = demand(t), sun = k * sunShape(t), w = wind(t);
    var us = Math.min(sun, d);
    var uw = Math.min(w, d - us);
    var battery = Math.max(0, d - us - uw);
    var surplus = Math.max(0, sun + w - d);
    return { d: d, us: us, uw: uw, battery: battery, surplus: surplus };
  }

  function initDayChart() {
    var svg = $("day-chart");
    var slider = $("day-hour");
    var readout = $("day-readout");
    if (!svg || !slider || !readout) return;

    var k = solveSolarScale();
    var W = 640, H = 300, left = 36, right = 14, top = 34, bottom = 40;
    var pw = W - left - right, ph = H - top - bottom;
    var yMax = 1;
    var steps = [], t;
    for (t = 0; t <= 24.001; t += 0.25) {
      var p = dayAt(t, k);
      steps.push({ t: t, p: p });
      yMax = Math.max(yMax, p.d + p.surplus);
    }
    yMax *= 1.06;
    function X(t) { return left + (t / 24) * pw; }
    function Y(v) { return top + ph - (v / yMax) * ph; }

    function band(lower, upper) {
      var fwd = steps.map(function (st, i) { return (i ? "L" : "M") + X(st.t).toFixed(1) + " " + Y(upper(st.p)).toFixed(1); });
      var back = steps.slice().reverse().map(function (st) { return "L" + X(st.t).toFixed(1) + " " + Y(lower(st.p)).toFixed(1); });
      return fwd.concat(back).join(" ") + " Z";
    }

    svg.textContent = "";
    var defs = s("defs", {}, [
      s("pattern", { id: "stripes", width: "6", height: "6", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
        s("rect", { width: "6", height: "6", style: "fill: var(--surface)" }),
        s("line", { x1: "0", y1: "0", x2: "0", y2: "6", "class": "stripe-bg" })
      ])
    ]);
    svg.appendChild(defs);

    svg.appendChild(s("path", { "class": "a-surplus", d: band(function (p) { return p.d; }, function (p) { return p.d + p.surplus; }) }));
    svg.appendChild(s("path", { "class": "a-solar", d: band(function () { return 0; }, function (p) { return p.us; }) }));
    svg.appendChild(s("path", { "class": "a-wind", d: band(function (p) { return p.us; }, function (p) { return p.us + p.uw; }) }));
    svg.appendChild(s("path", { "class": "a-battery", d: band(function (p) { return p.us + p.uw; }, function (p) { return p.d; }) }));

    var demandPath = steps.map(function (st, i) { return (i ? "L" : "M") + X(st.t).toFixed(1) + " " + Y(st.p.d).toFixed(1); }).join(" ");
    svg.appendChild(s("path", { "class": "demand", d: demandPath }));

    svg.appendChild(s("line", { "class": "axis", x1: left, y1: Y(0), x2: W - right, y2: Y(0) }));
    [0, 6, 12, 18, 24].forEach(function (h) {
      svg.appendChild(s("line", { "class": "axis", x1: X(h), y1: Y(0), x2: X(h), y2: Y(0) + 5 }));
      var label = s("text", { "class": "tick", x: X(h), y: Y(0) + 20, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle" });
      label.textContent = (h < 10 ? "0" : "") + h + ":00";
      svg.appendChild(label);
    });
    var yTitle = s("text", { "class": "tick", transform: "rotate(-90)", x: -(top + ph / 2), y: 12, "text-anchor": "middle" });
    yTitle.textContent = "Power";
    svg.appendChild(yTitle);

    // Legend
    var lx = left;
    [
      ["a-solar", "Solar"],
      ["a-wind", "Wind"],
      ["a-battery", "Batteries"],
      ["a-surplus", "Extra solar charging batteries"]
    ].forEach(function (item) {
      svg.appendChild(s("rect", { "class": item[0], x: lx, y: 9, width: 12, height: 12 }));
      var text = s("text", { "class": "legend", x: lx + 17, y: 19 });
      text.textContent = item[1];
      svg.appendChild(text);
      lx += 17 + item[1].length * 6.6 + 16;
    });
    svg.appendChild(s("line", { "class": "demand", x1: lx, y1: 15, x2: lx + 18, y2: 15, style: "animation: none; stroke-dasharray: none;" }));
    var dText = s("text", { "class": "legend", x: lx + 23, y: 19 });
    dText.textContent = "Demand";
    svg.appendChild(dText);

    var cursor = s("line", { "class": "cursor", x1: 0, y1: top, x2: 0, y2: Y(0) });
    var dot = s("circle", { r: 5, cx: 0, cy: 0, style: "fill: var(--ink)" });
    svg.appendChild(cursor);
    svg.appendChild(dot);

    function update() {
      var hour = Number(slider.value);
      var tt = hour + 0.5;
      var p = dayAt(tt, k);
      cursor.setAttribute("x1", X(tt)); cursor.setAttribute("x2", X(tt));
      dot.setAttribute("cx", X(tt)); dot.setAttribute("cy", Y(p.d));

      var solarPct = Math.round(p.us / p.d * 100);
      var windPct = Math.round(p.uw / p.d * 100);
      var battPct = Math.max(0, 100 - solarPct - windPct);
      if (p.battery <= 0) { windPct = 100 - solarPct; battPct = 0; }
      var parts = [];
      if (solarPct > 0) parts.push("solar " + solarPct + "%");
      if (windPct > 0) parts.push("wind " + windPct + "%");
      if (battPct > 0) parts.push("batteries " + battPct + "%");
      var text = (hour < 10 ? "0" : "") + hour + ":00. Share of demand: " + parts.join(", ") + ".";
      if (p.surplus > 0.01) text += " The extra solar is charging batteries.";
      readout.textContent = text;
    }
    slider.addEventListener("input", update);
    update();
  }

  /* ---------- data driven sections ---------- */

  function renderLedger(progress) {
    var body = $("ledger-body");
    var rep = progress.impact.reported, ver = progress.impact.verified;
    var rows = [
      ["Reports filed", rep.reports, ver.reports],
      ["People involved", rep.people, ver.people],
      ["Households reached", rep.households, ver.households],
      ["Energy saved or generated per year (kWh)", rep.kwh, ver.kwh]
    ];
    body.textContent = "";
    rows.forEach(function (r) {
      body.appendChild(el("tr", null, [
        el("th", { scope: "row", text: r[0] }),
        el("td", { "class": "num", text: nf.format(r[1]) }),
        el("td", { "class": "num", text: nf.format(r[2]) })
      ]));
    });
    $("progress-empty").hidden = rep.reports > 0;

    var t = progress.totals;
    var tally = $("tally");
    tally.textContent = "";
    [
      ["Open tasks", t.openTasks],
      ["Tasks done", t.doneTasks],
      ["Chapters", t.chapters],
      ["People taking part", t.participants]
    ].forEach(function (item) {
      tally.appendChild(el("div", null, [
        el("dt", { text: item[0] }),
        el("dd", { text: nf.format(item[1]) })
      ]));
    });
  }

  function buildTaskModel(progress, starterTasks) {
    var live = progress && progress.generatedAt && (progress.totals.openTasks + progress.totals.doneTasks) > 0;
    if (live) {
      return {
        live: true,
        tasks: progress.tasks.map(function (t) {
          return {
            title: t.title, url: safeGithubUrl(t.url), scale: t.scale, phase: t.phase, needs: t.needs || [],
            claimed: !!t.claimed, blocked: !!t.blocked, firstTask: !!t.firstTask
          };
        }),
        counts: progress.byScale
      };
    }
    var counts = {};
    SCALES.forEach(function (sc) { counts[sc[0]] = { open: 0, done: 0 }; });
    var tasks = (starterTasks || []).map(function (t) {
      if (counts[t.scale]) counts[t.scale].open++;
      return {
        title: t.title, url: null, scale: t.scale, phase: t.phase, needs: t.needs || [],
        claimed: false, blocked: false, firstTask: t.phase === "0" && (t.scale === "person" || t.scale === "household")
      };
    });
    return { live: false, tasks: tasks, counts: counts };
  }

  function initTasks(model, phases) {
    var scaleBox = $("scale-options");
    var needSel = $("filter-need");
    var phaseSel = $("filter-phase");
    var list = $("task-list");
    var status = $("task-status");
    $("starter-note").hidden = model.live;

    NEEDS.forEach(function (n) { needSel.appendChild(el("option", { value: n, text: cap(n) })); });
    phases.forEach(function (p) { phaseSel.appendChild(el("option", { value: p.id, text: "Phase " + p.id + ": " + p.title })); });

    var totalOpen = SCALES.reduce(function (sum, sc) { return sum + ((model.counts[sc[0]] || {}).open || 0); }, 0);
    var options = [["all", "All scales", totalOpen]].concat(SCALES.map(function (sc) {
      return [sc[0], sc[1], (model.counts[sc[0]] || {}).open || 0];
    }));
    options.forEach(function (o, i) {
      var id = "scale-" + o[0];
      var input = el("input", { type: "radio", name: "scale", id: id, value: o[0] });
      if (o[0] === "person") input.checked = true;
      scaleBox.appendChild(input);
      scaleBox.appendChild(el("label", { "for": id }, [o[1] + " ", el("span", { "class": "count", text: String(o[2]) })]));
    });

    function selectedScale() {
      var checked = scaleBox.querySelector("input:checked");
      return checked ? checked.value : "all";
    }

    function render() {
      var sc = selectedScale(), need = needSel.value, phase = phaseSel.value;
      var shown = model.tasks.filter(function (t) {
        return (sc === "all" || t.scale === sc) && (!need || t.needs.indexOf(need) !== -1) && (!phase || t.phase === phase);
      });
      list.textContent = "";
      shown.forEach(function (t) {
        var title = t.url ? el("a", { href: t.url, text: t.title }) : el("span", { text: t.title });
        var meta = el("div", { "class": "task-meta" });
        if (t.firstTask) meta.appendChild(el("span", { "class": "tag good", text: "Good first task" }));
        if (t.claimed) meta.appendChild(el("span", { "class": "tag claimed", text: "Claimed" }));
        if (t.blocked) meta.appendChild(el("span", { "class": "tag blocked", text: "Blocked" }));
        if (t.phase) meta.appendChild(el("span", { "class": "tag", text: "Phase " + t.phase }));
        if (sc === "all") meta.appendChild(el("span", { "class": "tag", text: scaleName(t.scale) }));
        t.needs.forEach(function (n) { meta.appendChild(el("span", { "class": "tag", text: cap(n) })); });
        list.appendChild(el("li", { "class": "task" + (t.claimed ? " is-claimed" : "") }, [
          el("div", { "class": "task-title" }, [title]), meta
        ]));
      });
      var where = sc === "all" ? "" : " at the " + scaleName(sc).toLowerCase() + " scale";
      if (shown.length === 0) {
        status.textContent = "No open tasks match" + where + ". Try another filter, or propose a new task.";
      } else {
        status.textContent = "Showing " + shown.length + " open task" + (shown.length === 1 ? "" : "s") + where + ".";
      }
    }

    scaleBox.addEventListener("change", render);
    needSel.addEventListener("change", render);
    phaseSel.addEventListener("change", render);
    render();
  }

  function renderPhases(progress, phases, starterTasks) {
    var host = $("phases");
    host.textContent = "";
    phases.forEach(function (p) {
      var done = 0, total = 0;
      var milestone = (progress.milestones || []).filter(function (m) { return m.title.indexOf("Phase " + p.id) === 0; })[0];
      if (milestone) {
        done = milestone.closed; total = milestone.open + milestone.closed;
      } else if (progress.byPhase && progress.byPhase[p.id] && (progress.byPhase[p.id].open + progress.byPhase[p.id].done) > 0) {
        done = progress.byPhase[p.id].done; total = done + progress.byPhase[p.id].open;
      } else {
        total = (starterTasks || []).filter(function (t) { return t.phase === p.id; }).length;
      }
      var pct = total ? Math.round(done / total * 100) : 0;
      var fill = el("span");
      fill.style.width = pct + "%";
      var bar = el("div", { "class": "bar", role: "img", "aria-label": done + " of " + total + " tasks done" }, [fill]);
      host.appendChild(el("li", { "class": "phase" }, [
        el("div", { "class": "when", text: "Phase " + p.id + " · " + p.years }),
        el("h3", { text: p.title }),
        el("p", { text: p.summary || "" }),
        bar,
        el("div", { "class": "bar-label", text: done + " of " + total + " tasks done" })
      ]));
    });
  }

  function renderGoals(goals) {
    $("goals-note").textContent = goals.note || "";
    var body = $("goals-body");
    body.textContent = "";
    goals.goals.forEach(function (g) {
      body.appendChild(el("tr", null, [
        el("th", { scope: "row" }, [g.label, el("span", { "class": "need", text: cap(g.need) })]),
        el("td", { "data-label": "Today", text: g.baseline }),
        el("td", { "data-label": "2030", text: g.targets["2030"] }),
        el("td", { "data-label": "2040", text: g.targets["2040"] }),
        el("td", { "data-label": "2050", text: g.targets["2050"] })
      ]));
    });
  }

  function renderChapters(progress) {
    var list = $("chapter-list");
    list.textContent = "";
    var chapters = progress.chapters || [];
    $("chapters-empty").hidden = chapters.length > 0;
    chapters.forEach(function (c) {
      var url = safeGithubUrl(c.url);
      var name = url ? el("a", { href: url, text: c.title }) : el("span", { text: c.title });
      var where = [c.region, c.scale].filter(Boolean).join(" · ");
      list.appendChild(el("li", { "class": "chapter" }, [name, where ? el("span", { "class": "where", text: where }) : ""]));
    });
  }

  function wireLinks(base) {
    $("preview-note").hidden = !!base;
    Array.prototype.forEach.call(document.querySelectorAll("[data-issue]"), function (a) {
      if (base) a.setAttribute("href", base + "/issues/new?template=" + encodeURIComponent(a.getAttribute("data-issue")));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-repo-link]"), function (a) {
      if (base) a.setAttribute("href", base + a.getAttribute("data-repo-link"));
    });
  }

  /* ---------- start ---------- */

  var EMPTY_PROGRESS = {
    generatedAt: null, repo: {}, totals: { openTasks: 0, doneTasks: 0, chapters: 0, participants: 0 },
    impact: { reported: { reports: 0, people: 0, households: 0, kwh: 0 }, verified: { reports: 0, people: 0, households: 0, kwh: 0 } },
    byScale: {}, byPhase: {}, milestones: [], tasks: [], chapters: []
  };

  function start() {
    initDayChart();
    Promise.allSettled([getJson("data/progress.json"), getJson("data/goals.json"), getJson("data/tasks.json")]).then(function (r) {
      var progress = r[0].status === "fulfilled" ? r[0].value : EMPTY_PROGRESS;
      var goals = r[1].status === "fulfilled" ? r[1].value : { note: "", goals: [], phases: DEFAULT_PHASES };
      var starter = r[2].status === "fulfilled" ? r[2].value : [];
      var phases = goals.phases && goals.phases.length ? goals.phases : DEFAULT_PHASES;

      wireLinks(repoUrl(progress));
      renderLedger(progress);
      initTasks(buildTaskModel(progress, starter), phases);
      renderPhases(progress, phases, starter);
      renderGoals(goals);
      renderChapters(progress);

      $("updated").textContent = progress.generatedAt
        ? "Data updated " + new Date(progress.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "."
        : "Showing the starter tasks. Live numbers appear after the first progress update runs.";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
