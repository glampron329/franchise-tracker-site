/* Logique de la fiche joueur : indépendante de l'interface, testable avec Node. */
(function (root) {
  // Colonnes d'une ligne de statistiques (tableau compact)
  var C = { pid: 0, season: 1, type: 2, gp: 3, g: 4, a: 5, pm: 6, pim: 7, s: 8, ppp: 9, shp: 10,
            toi: 11, fow: 12, fot: 13, hits: 14, bks: 15, gv: 16, tk: 17, age: 18, grp: 19 };   // grp : groupe de poste de la ligne (F/D)
  var MIN_GP_POPULATION = 200;   // population des seuils : carrières de 200 matchs et plus
  var MIN_FACEOFFS = 200;        // % de mises au jeu : au moins 200 mises au jeu

  function sum(rows, f) { var t = 0; for (var i = 0; i < rows.length; i++) t += rows[i][f] || 0; return t; }
  function pct(sorted, p) {
    if (!sorted.length) return null;
    var k = (sorted.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, sorted.length - 1);
    return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
  }

  // Saisons où chaque famille de statistiques est réellement suivie (les anciennes saisons contiennent des 0)
  function advTracked(r) { return (r[C.hits] || 0) + (r[C.bks] || 0) + (r[C.gv] || 0) + (r[C.tk] || 0) > 0; }
  function toiTracked(r) { return r[C.toi] != null && r[C.toi] > 0; }

  // Les six mesures du profil statistique pour un ensemble de lignes (un joueur, un mode)
  function profile(rows, pos) {
    var gp = sum(rows, C.gp), pts = sum(rows, C.g) + sum(rows, C.a);
    var adv = rows.filter(advTracked), toi = rows.filter(toiTracked);
    var advGP = sum(adv, C.gp), toiGP = sum(toi, C.gp);
    var tk = sum(adv, C.tk), gv = sum(adv, C.gv);
    var fot = sum(rows, C.fot), fow = sum(rows, C.fow);
    var seasons = rows.filter(function (r) { return r[C.gp] > 0; }).length;
    var D = pos === 'D';
    return {
      gp: gp, seasons: seasons,
      ppg: gp ? pts / gp : null,
      puck: tk + gv ? tk / (tk + gv) : null,
      phys: advGP ? (D ? sum(adv, C.hits) : sum(adv, C.hits) + sum(adv, C.bks)) / advGP : null,
      slot4: D ? (advGP ? sum(adv, C.bks) / advGP : null) : (fot >= MIN_FACEOFFS ? fow / fot : null),
      toiPerGame: toiGP ? sum(toi, C.toi) / toiGP : null,
      pmSeason: seasons ? sum(rows, C.pm) / seasons : null
    };
  }

  var KEYS = ['ppg', 'puck', 'phys', 'slot4', 'toiShare', 'pmSeason'];

  // Seuils recalculés à partir des données : médiane, 90e centile, maximum, par poste
  function thresholds(players, rowsByPlayer) {
    var vals = { F: {}, D: {} }, toiMax = { F: 0, D: 0 };
    KEYS.forEach(function (k) { vals.F[k] = []; vals.D[k] = []; });
    // population : par joueur ET groupe de poste de la ligne (migration 66 : un joueur fusionné F/D compte dans chaque groupe pour ses saisons de ce groupe), comme v_radar_thresholds_ppg
    var units = []; players.forEach(function (p) { var by = {}; (rowsByPlayer[p.id] || []).forEach(function (r) { if (r[C.type] !== 0) return; var g0 = grpOf(r, p.pos); (by[g0] = by[g0] || []).push(r); }); Object.keys(by).forEach(function (g0) { units.push([g0, by[g0]]); }); });
    units.forEach(function (u) {
      var rs = u[1];
      if (sum(rs, C.gp) < MIN_GP_POPULATION) return;
      var g = u[0], pr = profile(rs, g);
      KEYS.forEach(function (k) { if (k !== 'toiShare' && pr[k] != null) vals[g][k].push(pr[k]); });
      // maximum de temps de glace par match sur une saison d'au moins 20 matchs
      rs.forEach(function (r) { if (r[C.gp] >= 20 && toiTracked(r)) toiMax[g] = Math.max(toiMax[g], r[C.toi] / r[C.gp]); });
    });
    var out = { F: {}, D: {}, toiMax: toiMax };
    ['F', 'D'].forEach(function (g) {
      KEYS.forEach(function (k) {
        if (k === 'toiShare') return;
        var xs = vals[g][k].slice().sort(function (a, b) { return a - b; });
        out[g][k] = { p50: pct(xs, 0.5), p90: pct(xs, 0.9), max: xs[xs.length - 1], min: xs[0], n: xs.length };
      });
      out[g].toiShare = { p50: 0.7, p90: 0.9, max: 1, min: 0, n: 0 };   // part du max de temps de glace : seuils d'origine
    });
    return out;
  }

  // 0 à 50 jusqu'à la médiane, 50 à 90 jusqu'au 90e centile, 90 à 100 jusqu'au maximum
  function score(v, t, lowAnchor) {
    if (v == null || !t || t.p50 == null) return null;
    var lo = lowAnchor == null ? 0 : lowAnchor;
    if (v <= t.p50) return t.p50 === lo ? 50 : Math.max(0, 50 * (v - lo) / (t.p50 - lo));
    if (v <= t.p90) return 50 + 40 * (v - t.p50) / (t.p90 - t.p50);
    return Math.min(100, 90 + 10 * (v - t.p90) / (t.max - t.p90));
  }

  // Scores des six axes d'un joueur
  function radar(rows, pos, th) {
    var g = pos === 'D' ? 'D' : 'F', pr = profile(rows, g), T = th[g];
    var m = {
      ppg: pr.ppg, puck: pr.puck, phys: pr.phys, slot4: pr.slot4,
      toiShare: pr.toiPerGame != null && th.toiMax[g] ? pr.toiPerGame / th.toiMax[g] : null,
      pmSeason: pr.pmSeason
    };
    var out = {};
    KEYS.forEach(function (k) { out[k] = { value: m[k], score: score(m[k], T[k], k === 'pmSeason' ? T[k].min : 0) }; });
    return out;
  }

  // Records de la franchise : meilleur total de carrière et meilleure saison, par mode
  function records(players, rowsByPlayer, type) {
    var career = { gp: [0, null], g: [0, null], a: [0, null], pts: [0, null], pm: [-1e9, null] };
    var season = { gp: [0, null], g: [0, null], a: [0, null], pts: [0, null], pm: [-1e9, null] };
    players.forEach(function (p) {
      var rs = (rowsByPlayer[p.id] || []).filter(function (r) { return r[C.type] === type; });
      if (!rs.length) return;
      var t = { gp: sum(rs, C.gp), g: sum(rs, C.g), a: sum(rs, C.a), pm: sum(rs, C.pm) }; t.pts = t.g + t.a;
      Object.keys(career).forEach(function (k) { if (t[k] > career[k][0]) career[k] = [t[k], p.name]; });
      rs.forEach(function (r) {
        var s = { gp: r[C.gp], g: r[C.g], a: r[C.a], pm: r[C.pm] }; s.pts = s.g + s.a;
        Object.keys(season).forEach(function (k) { if (s[k] > season[k][0]) season[k] = [s[k], p.name]; });
      });
    });
    return { career: career, season: season };
  }

  // ---- un radar par poste (maquette approuvée le 2026-11-14 : docs/maquettes/radar_par_poste.html) ----
  // Petit échantillon : moins de 20 matchs à un poste en saison régulière, moins de 5 en séries (décision de Gabriel), seulement pour un joueur qui a joué aux deux postes
  var MIN_GP_PROFILE = { 0: 20, 1: 5 };
  function grpOf(r, pos) { return r[C.grp] === 'D' || r[C.grp] === 'F' ? r[C.grp] : (pos === 'D' ? 'D' : 'F'); }
  // groupes de poste d'un joueur, ordre stable quel que soit le mode : le plus joué en saison régulière d'abord ; égalité : groupe du joueur
  function groups(rows, pos) {
    var gp = {}, has = {}, own = pos === 'D' ? 'D' : 'F';
    rows.forEach(function (r) { var g = grpOf(r, pos); has[g] = 1; if (r[C.type] === 0) gp[g] = (gp[g] || 0) + (r[C.gp] || 0); });
    return Object.keys(has).sort(function (a, b) { return (gp[b] || 0) - (gp[a] || 0) || (a === own ? -1 : b === own ? 1 : 0); });
  }
  function rowsOfGroup(rows, g, pos) { return rows.filter(function (r) { return grpOf(r, pos) === g; }); }
  // groupes affichés dans un mode : ceux de groupes(toutes les lignes) qui ont au moins une ligne dans ce mode
  function groupsIn(allRows, rows, pos) { return groups(allRows, pos).filter(function (g) { return rowsOfGroup(rows, g, pos).length; }); }

  // ---- note d'équipe du Match d'ouverture (OpeningNightRoster!P3:P37, poids de Parameters!D21:H31 ; fiche ft-formules) ----
  // Valeurs par défaut de l'Excel ; la base les garde par franchise (migration 84). Un groupe : poids internes des unités
  // (lignes, paires, partant / substitut), soustracteur, multiplicateur, addition et poids global.
  var TEAM_RATING_DEFAULT = {
    F: { weights: [13.3, 10, 6.6, 3.3], size: 3, substractor: 80, multiplier: 2, addition: 80, global: 0.35 },
    D: { weights: [25, 17.5, 7.5], size: 2, substractor: 80, multiplier: 2, addition: 80, global: 0.35 },
    G: { weights: [75, 25], size: 1, substractor: 80, multiplier: 2, addition: 78, global: 0.30 } };
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  // Moyenne des cotes d'une unité, comme MOYENNE : cotes absentes ignorées ; aucune cote -> 0 (SIERREUR).
  function unitAvg(ratings) { var v = (ratings || []).filter(isNum); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0; }
  // Note d'un groupe (0-100). units : une liste de cotes par unité, dans l'ordre (ligne 1, 2…).
  // Gardiens (une cote par unité) : un gardien sans cote est ignoré et le poids des autres est ramené à 100
  // (décision du 2026-11-23 ; l'Excel donnait 0 au groupe) ; aucun gardien coté -> 0.
  function groupRating(units, g) {
    var t = 0, wsum = 0;
    for (var i = 0; i < g.weights.length; i++) {
      var u = (units || [])[i] || [];
      if (g.size === 1) { if (isNum(u[0])) { t += u[0] * g.weights[i]; wsum += g.weights[i]; } }
      else t += unitAvg(u) * g.size * g.weights[i];
    }
    if (g.size === 1) { if (!wsum) return 0; t = t * 100 / wsum; }
    return Math.max(Math.min((t / 100 - g.substractor) * g.multiplier + g.addition, 100), 0);
  }
  // roster = { F: [[LW, C, RW] × 4 lignes], D: [[LD, RD] × 3 paires], G: [[partant], [substitut]] } (cotes de la saison).
  // Une case vide (undefined) n'a pas de joueur ; null = joueur aligné sans cote pour la saison : il est ignoré
  // (décision du 2026-11-23) et listé dans out.missing ({ grp, unit, slot }, indices à partir de 0) pour l'avertissement.
  function teamRating(roster, params) {
    var P = params || TEAM_RATING_DEFAULT, r = roster || {}, missing = [];
    ['F', 'D', 'G'].forEach(function (grp) {
      (r[grp] || []).forEach(function (u, i) { (u || []).forEach(function (v, j) { if (v === null) missing.push({ grp: grp, unit: i, slot: j }); }); });
    });
    var out = { F: groupRating(r.F, P.F), D: groupRating(r.D, P.D), G: groupRating(r.G, P.G), missing: missing };
    out.team = P.F.global * out.F + P.D.global * out.D + P.G.global * out.G;
    return out;
  }

  var api = { C: C, sum: sum, profile: profile, thresholds: thresholds, score: score, radar: radar, records: records, KEYS: KEYS, MIN_GP_PROFILE: MIN_GP_PROFILE, grpOf: grpOf, groups: groups, rowsOfGroup: rowsOfGroup, groupsIn: groupsIn, teamRating: teamRating, TEAM_RATING_DEFAULT: TEAM_RATING_DEFAULT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FT = api;
})(typeof window !== 'undefined' ? window : this);

;/* Interface de la fiche joueur (prototype). Les fonctions render* retournent du HTML/SVG : testables sans navigateur. */
(function (root) {
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  var FT = root.FT || (typeof require !== 'undefined' ? require('./core.js') : null);
  var C = FT.C;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function makeApp(DATA) {
    var byP = {}, byId = {};
    DATA.rows.forEach(function (r) { (byP[r[0]] = byP[r[0]] || []).push(r); });
    DATA.players.forEach(function (p) { byId[p.id] = p; });
    var withStats = DATA.players.filter(function (p) { return byP[p.id]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    var TH = FT.thresholds(DATA.players, byP);
    var REC = [FT.records(DATA.players, byP, 0), FT.records(DATA.players, byP, 1)];

    var TEAMS = {}; (DATA.teams || []).forEach(function (tm) { TEAMS[tm.en] = tm; });
    var sync = { user: null, busy: false, msg: '', level: '' };
    var state = { lang: 'fr', mode: 0, pid: null, cmp: null, view: 'player', season: null, lseason: null };
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    var best = withStats[0], bestGP = -1;   // joueur affiché au départ : celui qui a le plus de matchs en saison régulière
    withStats.forEach(function (p) { var gp = 0; (byP[p.id] || []).forEach(function (r) { if (r[C.type] === 0) gp += r[C.gp] || 0; }); if (gp > bestGP) { bestGP = gp; best = p; } });
    state.pid = best.id;
    try { var lp = /[?&]player=(\d+)/.exec(typeof location !== 'undefined' ? location.search : ''); if (lp && byId[+lp[1]]) state.pid = +lp[1]; } catch (e) { /* lien direct ?player= (phase 4d) */ }

    function t(key, short) {
      var e = DATA.labels[key]; if (!e) return key;
      var v = e[state.lang] || e.en || [key, key];
      return short && v[1] ? v[1] : v[0];
    }
    function nf(x, d) { return x == null ? '—' : x.toLocaleString(state.lang === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    function pctf(x) { return x == null ? '—' : nf(x * 100, 1) + ' %'; }
    function mmss(x) { if (x == null) return '—'; var m = Math.floor(x), s = Math.round((x - m) * 60); if (s === 60) { m++; s = 0; } return m + ':' + (s < 10 ? '0' : '') + s; }
    function rowsOf(pid) { return (byP[pid] || []).filter(function (r) { return r[C.type] === state.mode; }).sort(function (a, b) { return a[C.season] - b[C.season]; }); }
    function seasonLabel(y) { return state.mode === 0 ? y + '-' + String((y + 1) % 100).padStart(2, '0') : String(y + 1); }
    function inches(h) { return h ? Math.floor(h / 12) + "' " + (h % 12) + '"' : null; }

    // ---------- Radar ----------
    var AXES = ['ppg', 'puck', 'phys', 'slot4', 'toiShare', 'pmSeason'];
    function axisName(k, pos) {
      var D = pos === 'D';
      return ({ ppg: t('metric.ppg', true), puck: t('metric.puck_control', true), phys: t(D ? 'metric.physical_d' : 'metric.physical', true),
                slot4: t(D ? 'metric.blocks_d' : 'metric.faceoffs', true), toiShare: t('metric.toi_share', true), pmSeason: t('metric.pm_season', true) })[k];
    }
    function axisValue(k, v, pos) {
      if (v == null) return t('ui.no_tracking', true);
      if (k === 'puck') return pctf(v);
      if (k === 'slot4') return pos === 'D' ? nf(v, 2) : pctf(v);
      if (k === 'toiShare') return mmss(v * TH.toiMax[pos === 'D' ? 'D' : 'F']);
      if (k === 'pmSeason') return (v > 0 ? '+' : '') + nf(v, 1);
      return nf(v, 2);
    }
    function renderRadar(main, cmp) {
      var W = 460, H = 400, cx = 230, cy = 205, R = 130, n = AXES.length;
      function pt(i, s) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * s / 100, cy + Math.sin(a) * R * s / 100]; }
      function poly(scores) { return AXES.map(function (k, i) { var p = pt(i, scores && scores[k].score != null ? scores[k].score : 0); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
      var g = '';
      [50, 90, 100].forEach(function (lvl) {
        g += '<polygon points="' + AXES.map(function (k, i) { var p = pt(i, lvl); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" class="ring' + (lvl === 90 ? ' ring90' : '') + '"/>';
      });
      AXES.forEach(function (k, i) { var p = pt(i, 100); g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" class="spoke"/>'; });
      g += '<text x="' + (cx + 4) + '" y="' + (cy - R * 0.5 + 12) + '" class="ringlbl">50</text><text x="' + (cx + 4) + '" y="' + (cy - R * 0.9 + 12) + '" class="ringlbl">90</text>';
      if (cmp) g += '<polygon points="' + poly(cmp.scores) + '" class="poly2"/>';
      g += '<polygon points="' + poly(main.scores) + '" class="poly1"/>';
      AXES.forEach(function (k, i) {
        var p = pt(i, 100), a = -Math.PI / 2 + i * 2 * Math.PI / n, lx = cx + Math.cos(a) * (R + 14), ly = cy + Math.sin(a) * (R + 14);
        var anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
        var dy = Math.sin(a) > 0.5 ? 14 : (Math.sin(a) < -0.5 ? -18 : -2);
        var s1 = main.scores[k].score;
        g += '<text x="' + lx.toFixed(1) + '" y="' + (ly + dy).toFixed(1) + '" text-anchor="' + anchor + '" class="axname">' + esc(axisName(k, main.pos)) + '</text>' +
             '<text x="' + lx.toFixed(1) + '" y="' + (ly + dy + 13).toFixed(1) + '" text-anchor="' + anchor + '" class="axval"><tspan class="s1">' + (s1 == null ? '—' : nf(s1, 0)) + '</tspan>' +
             (cmp && cmp.scores[k].score != null ? '<tspan class="s2"> · ' + nf(cmp.scores[k].score, 0) + '</tspan>' : '') +
             '<tspan class="raw"> ' + esc(axisValue(k, main.scores[k].value, main.pos)) + '</tspan></text>';
      });
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(t('ui.profile')) + '">' + g + '</svg>';
    }

    // ---------- Production par saison + points cumulatifs ----------
    function careerSeries(pid) {
      var rows = rowsOf(pid), cum = 0;
      return rows.map(function (r, i) { var p = r[C.g] + r[C.a]; cum += p; return { i: i + 1, season: r[C.season], g: r[C.g], a: r[C.a], p: p, cum: cum, gp: r[C.gp] }; });
    }
    function renderBars(s1, s2) {
      var W = 640, H = 250, L = 38, B = 28, T = 12, Rm = 10, n = Math.max(s1.length, s2 ? s2.length : 0, 1);
      var maxY = Math.max.apply(null, [10].concat(s1.map(function (d) { return d.p; }), s2 ? s2.map(function (d) { return d.p; }) : []));
      var step = Math.pow(10, Math.floor(Math.log10(maxY))), top = Math.ceil(maxY / step) * step; if (top / step < 3) { step /= 2; top = Math.ceil(maxY / step) * step; }
      var bw = (W - L - Rm) / n, plotH = H - T - B;
      function y(v) { return T + plotH - plotH * v / top; }
      var g = '';
      for (var v = 0; v <= top + 1e-9; v += step) g += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + nf(v, 0) + '</text>';
      s1.forEach(function (d, i) {
        var x = L + i * bw + bw * 0.18, w = bw * 0.64;
        g += '<g><title>' + esc(seasonLabel(d.season)) + ' : ' + d.g + ' ' + esc(t('stat.g', true)) + ', ' + d.a + ' ' + esc(t('stat.a', true)) + ', ' + d.p + ' ' + esc(t('stat.pts', true)) + ' (' + d.gp + ' ' + esc(t('stat.gp', true)) + ')</title>' +
             '<rect x="' + x.toFixed(1) + '" y="' + y(d.g).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (plotH * d.g / top).toFixed(1) + '" class="bar-g"/>' +
             '<rect x="' + x.toFixed(1) + '" y="' + y(d.p).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (plotH * d.a / top).toFixed(1) + '" class="bar-a"/></g>';
        if (n <= 14 || i % Math.ceil(n / 14) === 0) g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="tick">' + (n > 10 ? "'" + String(d.season).slice(2) : esc(seasonLabel(d.season))) + '</text>';
      });
      if (s2 && s2.length) {
        var pts = s2.map(function (d, i) { return (L + i * bw + bw / 2).toFixed(1) + ',' + y(d.p).toFixed(1); }).join(' ');
        g += '<polyline points="' + pts + '" class="line2"/>' + s2.map(function (d, i) { return '<circle cx="' + (L + i * bw + bw / 2).toFixed(1) + '" cy="' + y(d.p).toFixed(1) + '" r="3" class="dot2"><title>' + esc(seasonLabel(d.season)) + ' : ' + d.p + '</title></circle>'; }).join('');
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(t('ui.points_by_season')) + '">' + g + '</svg>';
    }
    function renderCum(s1, s2) {
      var W = 640, H = 230, L = 44, B = 26, T = 12, Rm = 12, n = Math.max(s1.length, s2 ? s2.length : 0, 1);
      var maxY = Math.max.apply(null, [10].concat(s1.map(function (d) { return d.cum; }), s2 ? s2.map(function (d) { return d.cum; }) : []));
      var step = Math.pow(10, Math.floor(Math.log10(maxY))); var top = Math.ceil(maxY / step) * step; if (top / step < 3) { step /= 2; top = Math.ceil(maxY / step) * step; }
      var plotH = H - T - B, plotW = W - L - Rm;
      function x(i) { return L + (n === 1 ? plotW / 2 : plotW * (i - 1) / (n - 1)); } function y(v) { return T + plotH - plotH * v / top; }
      var g = '';
      for (var v = 0; v <= top + 1e-9; v += step) g += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + nf(v, 0) + '</text>';
      function line(s, cls) { return s.length ? '<polyline points="' + s.map(function (d) { return x(d.i).toFixed(1) + ',' + y(d.cum).toFixed(1); }).join(' ') + '" class="' + cls + '"/>' : ''; }
      if (s2) g += line(s2, 'line2');
      g += line(s1, 'line1');
      for (var i = 1; i <= n; i += Math.max(1, Math.ceil(n / 12))) g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="tick">' + i + '</text>';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(t('ui.cumulative')) + '">' + g + '</svg>';
    }

    // ---------- Records ----------
    function totals(rows) { var o = { gp: 0, g: 0, a: 0, pts: 0, pm: 0 }; rows.forEach(function (r) { o.gp += r[C.gp]; o.g += r[C.g]; o.a += r[C.a]; o.pm += r[C.pm]; }); o.pts = o.g + o.a; return o; }
    function renderRecords(tot1, tot2) {
      var rec = REC[state.mode].career, defs = [['gp', 'stat.gp'], ['g', 'stat.g'], ['a', 'stat.a'], ['pts', 'stat.pts'], ['pm', 'stat.plus_minus']], h = '';
      defs.forEach(function (d) {
        var k = d[0], r = rec[k], v1 = tot1[k], v2 = tot2 ? tot2[k] : null, den = Math.max(r[0], 1);
        function w(v) { return Math.max(0, Math.min(100, 100 * v / den)).toFixed(1); }
        h += '<div class="rec"><div class="rec-l">' + esc(t(d[1], true)) + '</div><div class="rec-b"><div class="fill1" style="width:' + w(v1) + '%"></div>' + (v2 != null ? '<div class="fill2" style="width:' + w(v2) + '%"></div>' : '') + '</div>' +
             '<div class="rec-n"><b>' + nf(v1) + '</b>' + (v2 != null ? ' <span class="s2">· ' + nf(v2) + '</span>' : '') + ' / ' + nf(r[0]) + ' <span class="muted">(' + nf(100 * v1 / den, 0) + ' %)</span></div>' +
             '<div class="rec-h muted">' + esc(r[1] || '') + '</div></div>';
      });
      return h;
    }

    function renderTable(rows, p, two, lead) {
      var cols = [['season', 'ui.season'], ['age', 'ui.age']].concat(two ? [['grp', 'col.position']] : []).concat([['gp', 'stat.gp'], ['g', 'stat.g'], ['a', 'stat.a'], ['pts', 'stat.pts'], ['pm', 'stat.plus_minus'], ['pim', 'stat.pim'], ['s', 'stat.shots']]);
      var h = '<table><thead><tr>' + cols.map(function (c, i) { return '<th' + (i && c[0] !== 'grp' ? ' class="num"' : '') + ' title="' + esc(t(c[1])) + '">' + esc(t(c[1], true)) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r) {
        var g = two ? FT.grpOf(r, p.pos) : null;
        h += '<tr><td>' + esc(seasonLabel(r[C.season])) + '</td><td class="num">' + (r[C.age] == null ? '—' : r[C.age]) + '</td>' +
          (two ? '<td class="gcol"><span class="gtag' + (g === lead ? ' lead' : '') + '" title="' + esc(t('pos.' + g)) + '">' + esc(t('pc.' + g)) + '</span><span class="vh"> ' + esc(t('pos.' + g)) + '</span></td>' : '') +
          [r[C.gp], r[C.g], r[C.a], r[C.g] + r[C.a], r[C.pm], r[C.pim], r[C.s]].map(function (v) { return '<td class="num">' + v + '</td>'; }).join('') + '</tr>';
      });
      var tt = totals(rows);
      h += '<tr class="total"><td>' + esc(t('ui.career')) + '</td><td class="num">—</td>' + (two ? '<td></td>' : '') + [tt.gp, tt.g, tt.a, tt.pts, tt.pm, rows.reduce(function (x, r) { return x + r[C.pim]; }, 0), rows.reduce(function (x, r) { return x + r[C.s]; }, 0)].map(function (v) { return '<td class="num">' + v + '</td>'; }).join('') + '</tr>';
      return h + '</tbody></table>';
    }
    // ---- un radar par poste (maquette approuvée) : chaque profil ne compte que les saisons jouées à ce poste et se compare aux joueurs du même poste ----
    var WARN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="12" r=".9" fill="currentColor"/></svg>';
    function fill(k, args) { return t(k).replace(/\{(\d)\}/g, function (_, i) { return args[+i]; }); }
    function allRows(pid) { return (byP[pid] || []).slice().sort(function (a, b) { return a[C.season] - b[C.season]; }); }
    function seasonsTxt(n) { return n === 1 ? t('ui.n_season_one') : fill('ui.n_seasons', [n]); }
    function rangeTxt(ys) { var a = ys[0], b = ys[ys.length - 1]; return a === b ? seasonLabel(a) : fill('ui.season_range', [seasonLabel(a), seasonLabel(b)]); }
    function cmpOfGroup(q, g) { if (!q) return null; var rq = FT.rowsOfGroup(rowsOf(q.id), g, q.pos); return rq.length ? { pos: g, scores: FT.radar(rq, g, TH) } : null; }   // le joueur comparé : ses saisons du même poste
    function renderStrip(rows, g, pos) {
      var by = {}, ys = [];
      rows.forEach(function (r) { var y = r[C.season]; if (!by[y]) { by[y] = { gp: 0, on: 0 }; ys.push(y); } by[y].gp += r[C.gp]; if (FT.grpOf(r, pos) === g) by[y].on += r[C.gp]; });
      var mx = Math.max.apply(null, ys.map(function (y) { return by[y].gp; }).concat([1])), mine = ys.filter(function (y) { return by[y].on; });
      return '<div class="gstrip" role="img" aria-label="' + esc(t('ui.seasons') + ' (' + t('pos.' + g) + ') : ' + mine.map(seasonLabel).join(', ')) + '">' +
        ys.map(function (y) { var x = by[y]; return '<i class="' + (x.on ? 'on' : '') + '" style="height:' + Math.max(8, 100 * x.gp / mx).toFixed(0) + '%" title="' + esc(seasonLabel(y) + ' : ' + (x.on ? t('pos.' + g) : t('pos.' + (g === 'D' ? 'F' : 'D'))) + ', ' + x.gp + ' ' + t('stat.gp', true)) + '"></i>'; }).join('') + '</div>';
    }
    function renderGroupPanel(p, rows, g, small, q) {
      var rg = FT.rowsOfGroup(rows, g, p.pos), gp = FT.sum(rg, C.gp), ys = Array.from(new Set(rg.map(function (r) { return r[C.season]; }))), name = t('pos.' + g);
      var badge = small ? '<span class="smp">' + WARN + esc(fill('ui.small_sample', [nf(gp)])) + '</span>' : '';
      return '<div class="pgrp' + (small ? ' small' : '') + '" data-grp="' + g + '" role="group" aria-labelledby="pgrp-h-' + g + '"><div class="pgrp-h"><h4 id="pgrp-h-' + g + '">' + esc(name) + '</h4><span class="pgrp-meta">' + esc(rangeTxt(ys)) + ', ' + esc(seasonsTxt(ys.length)) + '</span>' + badge + '</div>' +
        renderStrip(rows, g, p.pos) + renderGroupStats(rg, g) + '<div id="pgrp-body-' + g + '">' + renderRadar({ pos: g, scores: FT.radar(rg, g, TH) }, cmpOfGroup(q, g)) + (small ? '<p class="note muted">' + esc(fill('ui.small_sample_note', [FT.MIN_GP_PROFILE[state.mode]])) + '</p>' : '') + '</div></div>';
    }
    function renderProfile(p, rows, q) {
      var gs = FT.groupsIn(allRows(p.id), rows, p.pos);
      if (gs.length < 2) {   // un seul poste dans ce mode : un radar, noté avec les seuils du poste des lignes
        var g0 = gs[0] || (p.pos === 'D' ? 'D' : 'F');
        return '<section class="card"><h3>' + esc(t('ui.profile')) + '</h3>' + renderRadar({ pos: g0, scores: FT.radar(rows, g0, TH) }, q ? (cmpOfGroup(q, g0) || cmpOfGroup(q, FT.groupsIn(allRows(q.id), rowsOf(q.id), q.pos)[0])) : null) + '<p class="note muted">' + esc(t('ui.profile_note')) + '</p></section>';
      }
      var min = FT.MIN_GP_PROFILE[state.mode];
      return '<section class="card prof2"><h3>' + esc(t('ui.profile_by_group')) + '</h3><div class="prof2-grid">' +
        gs.map(function (g) { return renderGroupPanel(p, rows, g, FT.sum(FT.rowsOfGroup(rows, g, p.pos), C.gp) < min, q); }).join('') + '</div>' +
        '<p class="note muted">' + esc(t('ui.profile_by_group_note')) + ' ' + esc(t('ui.group_strip_note')) + '</p><p class="note muted">' + esc(t('ui.profile_note')) + '</p></section>';
    }
    // Chiffres de carrière d'un poste (maquette docs/maquettes/carriere_par_poste.html, variante A) : 5 cases égales, abréviation visible, libellé complet en infobulle et pour les lecteurs d'écran
    function renderGroupStats(rg, g) {
      var o = totals(rg), defs = [['stat.gp', nf(o.gp)], ['stat.g', o.g], ['stat.a', o.a], ['stat.pts', o.pts], ['stat.plus_minus', (o.pm > 0 ? '+' : '') + o.pm]];
      return '<dl class="pgrp-stats" aria-label="' + esc(t('ui.career_by_group') + ' : ' + t('pos.' + g)) + '">' +
        defs.map(function (d) { return '<div><dt title="' + esc(t(d[0])) + '"><span aria-hidden="true">' + esc(t(d[0], true)) + '</span><span class="vh">' + esc(t(d[0])) + '</span></dt><dd>' + esc(d[1]) + '</dd></div>'; }).join('') + '</dl>';
    }

    function renderIdentity(p, rows) {
      var bits = [];
      if (p.birth) bits.push(['ui.born', p.birth]);
      if (p.draft) bits.push(['ui.drafted', p.draft[0] + (p.draft[1] ? ' · ' + (state.lang === 'fr' ? 'ronde ' : 'round ') + p.draft[1] : '') + (p.draft[2] ? ' · #' + p.draft[2] : '') + (p.draft[3] ? ' · ' + tn(p.draft[3]) : '')]);
      if (p.country) bits.push(['ui.country', p.country]);
      if (p.h || p.w) bits.push(['ui.height_weight', [inches(p.h), p.w ? p.w + ' lb' : null].filter(Boolean).join(' / ')]);
      var yrs = (byP[p.id] || []).map(function (r) { return r[C.season]; });
      if (yrs.length) bits.push(['ui.seasons', Math.min.apply(null, yrs) + '–' + (Math.max.apply(null, yrs) + 1) + ' (' + new Set(yrs).size + ')']);
      return '<div class="who"><div class="pos">' + esc(t('pos.' + (p.pos === 'D' ? 'D' : 'F'))) + '</div><h2>' + esc(p.name) + '</h2></div><dl>' +
        bits.map(function (b) { return '<div><dt>' + esc(t(b[0])) + '</dt><dd>' + esc(b[1]) + '</dd></div>'; }).join('') + '</dl>';
    }


    function roundLabel(res) { return res ? t('result.' + res) : '—'; }
    function teamRows() { return (DATA.team_stats || []).filter(function (r) { return r[1] === state.mode; }).sort(function (a, b) { return a[0] - b[0]; }); }
    function renderTeamBars(rows) {
      var W = 640, H = 250, L = 38, B = 28, T = 12, Rm = 10, n = Math.max(rows.length, 1), pi = state.mode === 0 ? 6 : 3;
      var maxY = Math.max.apply(null, [10].concat(rows.map(function (r) { return r[pi]; })));
      var step = Math.pow(10, Math.floor(Math.log10(maxY))), top = Math.ceil(maxY / step) * step; if (top / step < 3) { step /= 2; top = Math.ceil(maxY / step) * step; }
      var bw = (W - L - Rm) / n, plotH = H - T - B, g = '';
      function y(v) { return T + plotH - plotH * v / top; }
      for (var v = 0; v <= top + 1e-9; v += step) g += '<line x1="' + L + '" x2="' + (W - Rm) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="tick">' + nf(v, 0) + '</text>';
      rows.forEach(function (r, i) {
        var x = L + i * bw + bw * 0.18, w = bw * 0.64;
        g += '<g><title>' + esc(seasonLabel(r[0])) + ' : ' + r[pi] + ' (' + r[3] + '-' + r[4] + (state.mode === 0 ? '-' + r[5] : '') + ')</title><rect x="' + x.toFixed(1) + '" y="' + y(r[pi]).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (plotH * r[pi] / top).toFixed(1) + '" class="bar-g"/></g>';
        if (n <= 14 || i % Math.ceil(n / 14) === 0) g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="tick">' + (n > 10 ? "'" + String(r[0]).slice(2) : esc(seasonLabel(r[0]))) + '</text>';
      });
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">' + g + '</svg>';
    }
    function renderTeamTable(rows) {
      var po = state.mode === 1;
      var cols = [['ui.season'], ['stat.gp'], ['stat.w'], ['stat.l']].concat(po ? [] : [['stat.otl'], ['stat.pts']]).concat([['stat.gf'], ['stat.ga']]).concat(po ? [['ui.result']] : []);
      var h = '<table><thead><tr>' + cols.map(function (c, i) { return '<th' + (i && !(po && i === cols.length - 1) ? ' class="num"' : '') + '>' + esc(t(c[0], true)) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r) {
        var cells = [esc(seasonLabel(r[0])), r[2], r[3], r[4]].concat(po ? [] : [r[5], r[6]]).concat([r[7], r[8]]);
        h += '<tr>' + cells.map(function (v, i) { return '<td' + (i ? ' class="num"' : '') + '>' + v + '</td>'; }).join('') + (po ? '<td>' + esc(roundLabel(r[9])) + '</td>' : '') + '</tr>';
      });
      return h + '</tbody></table>';
    }
    function teamView() {
      var rows = teamRows(), best = rows.reduce(function (b, r) { return !b || r[state.mode === 0 ? 6 : 3] > b[state.mode === 0 ? 6 : 3] ? r : b; }, null);
      return header() + '<main>' + FTP.panel(t, esc, sync, { noPush: true }) + '<section class="card id"><div class="who"><div class="pos">' + esc(DATA.franchise.code || '') + '</div><h2>' + esc(tn(DATA.franchise.name)) + '</h2></div>' +
        (best ? '<dl><div><dt>' + esc(t(state.mode === 0 ? 'stat.pts' : 'stat.w')) + ' · max</dt><dd>' + best[state.mode === 0 ? 6 : 3] + ' (' + esc(seasonLabel(best[0])) + ')</dd></div></dl>' : '') + '</section>' +
        (rows.length ? '<section class="card wide"><h3>' + esc(t(state.mode === 0 ? 'ui.team_points_by_season' : 'ui.team_wins_by_season')) + '</h3>' + renderTeamBars(rows) + '</section>' +
          '<section class="card wide"><h3>' + esc(t('ui.season')) + '</h3><div class="scroll">' + renderTeamTable(rows) + '</div></section>' : '<section class="card"><p class="muted">' + esc(t('ui.no_data')) + '</p></section>') + '</main>';
    }


    // ---------- Trophées et blessures ----------
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
    function renderTrophies(p) {
      var wins = (DATA.awards || []).filter(function (a) { return a[6] === p.id; }), by = {};   // lien par player_id
      wins.forEach(function (a) { (by[a[1]] = by[a[1]] || []).push(a[0]); });
      var h = Object.keys(by).length ? Object.keys(by).map(function (c) {
        return '<div class="trow"><span>' + esc(t('award.' + c)) + '</span><b>' + by[c].length + '</b><span class="muted">' + esc(by[c].map(sl).join(', ')) + '</span></div>';
      }).join('') : '<p class="muted">' + esc(t('ui.none_yet')) + '</p>';
      var as = (DATA.allstars || []).filter(function (a) { return a[3] === p.id; });
      var f = as.filter(function (a) { return a[1] === 1; }), s2 = as.filter(function (a) { return a[1] === 2; });
      h += '<div class="trow"><span>' + esc(t('ui.all_star_teams')) + '</span><b>' + as.length + '</b><span class="muted">' + esc(t('ui.first_team', true)) + ' ' + f.length + ' · ' + esc(t('ui.second_team', true)) + ' ' + s2.length + '</span></div>';
      return '<section class="card"><h3>' + esc(t('ui.trophies')) + '</h3>' + h + '</section>';
    }
    function renderInjuries(p) {
      var inj = (DATA.injuries || []).filter(function (a) { return a[0] === p.id; });
      if (!inj.length) return '';
      var missed = inj.reduce(function (s, a) { return s + a[2]; }, 0);
      return '<section class="card"><h3>' + esc(t('ui.injuries')) + '</h3><div class="trow"><span>' + esc(t('ui.injury_count')) + '</span><b>' + inj.length + '</b><span class="muted"></span></div>' +
        '<div class="trow"><span>' + esc(t('ui.games_missed')) + '</span><b>' + nf(missed) + '</b><span class="muted"></span></div></section>';
    }
    // ---------- Contrats ----------
    var LV = ['NHL', 'AHL', 'JUNIOR'], CT = [null, 'one_way', 'two_way'];
    var cSeasons = Array.from(new Set((DATA.contracts || []).map(function (c) { return c[1]; }))).sort(function (a, b) { return a - b; });
    function money(x) { return x == null ? '—' : nf(x / 1e6, 2) + ' M$'; }
    function contractsView() {
      var cur = DATA.franchise.current;
      if (state.season == null || cSeasons.indexOf(state.season) < 0) state.season = cSeasons.indexOf(cur) >= 0 ? cur : cSeasons[0];
      var rows = (DATA.contracts || []).filter(function (c) { return c[1] === state.season; });
      var cap = (DATA.caps || []).filter(function (c) { return c[0] === state.season; })[0];
      var tot = [0, 0, 0], cnt = [0, 0, 0];
      rows.forEach(function (c) { tot[c[4]] += c[2] || 0; cnt[c[4]]++; });
      var opts = cSeasons.map(function (y) { return '<option value="' + y + '"' + (y === state.season ? ' selected' : '') + '>' + esc(y + '-' + String((y + 1) % 100).padStart(2, '0')) + '</option>'; }).join('');
      var bars = LV.map(function (lv, i) {
        var w = cap ? Math.min(100, 100 * tot[i] / cap[1]) : 0;
        return '<div class="rec"><div class="rec-l">' + esc(t('level.' + lv)) + '</div><div class="rec-b"><div class="fill1" style="width:' + w.toFixed(1) + '%"></div></div><div class="rec-n"><b>' + money(tot[i]) + '</b> <span class="muted">(' + cnt[i] + ')</span></div></div>';
      }).join('');
      var body = rows.map(function (c) {
        var pl = DATA.cplayers[c[0]] || ['?', '?'];
        return '<tr><td>' + esc(pl[0]) + '</td><td>' + esc(t('pos.' + (pl[1] === 'D' ? 'D' : pl[1] === 'G' ? 'G' : 'F'), true)) + '</td><td>' + esc(c[3] ? t('ctype.' + CT[c[3]]) : '—') + '</td><td>' + esc(t('level.' + LV[c[4]])) + (c[5] ? ' <span class="muted">(' + esc(t('ui.projected', true)) + ')</span>' : '') + '</td><td class="num">' + money(c[2]) + '</td><td>' + esc(c[6] || '') + '</td></tr>';
      }).join('');
      return header() + '<main>' + FTP.panel(t, esc, sync, { noPush: true }) + '<section class="pick"><label>' + esc(t('ui.season')) + '<select id="sn">' + opts + '</select></label></section>' +
        '<section class="card"><h3>' + esc(t('ui.payroll_by_level')) + '</h3>' + bars + (cap ? '<p class="note muted">' + esc(t('ui.salary_cap')) + ' : ' + money(cap[1]) + ' · ' + esc(t('ui.salary_floor')) + ' : ' + money(cap[2]) + '</p>' : '') + '</section>' +
        '<section class="card wide"><h3>' + esc(t('ui.contracts_view')) + '</h3><div class="scroll"><table><thead><tr><th>' + esc(t('ui.player')) + '</th><th>Pos</th><th>' + esc(t('ui.contract_type')) + '</th><th>' + esc(t('ui.level')) + '</th><th class="num">' + esc(t('ui.cap_hit')) + '</th><th>' + esc(t('ui.clause')) + '</th></tr></thead><tbody>' + body + '</tbody></table></div></section></main>';
    }

    // ---------- Ligue : classement et repêchage ----------
    var TEAMS_BY_CODE = {}; (DATA.teams || []).forEach(function (tm) { TEAMS_BY_CODE[tm.code] = tm; });
    function tnc(code) { var tm = TEAMS_BY_CODE[code]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : (code || '—'); }
    var lSeasons = Array.from(new Set((DATA.standings || []).map(function (r) { return r[0]; }))).sort(function (a, b) { return a - b; });
    function leagueView() {
      if (state.lseason == null || lSeasons.indexOf(state.lseason) < 0) state.lseason = lSeasons[lSeasons.length - 1];
      var ss = state.lseason, dy = ss + 1, me = DATA.franchise.code;
      var st = (DATA.standings || []).filter(function (r) { return r[0] === ss; });
      var opts = lSeasons.map(function (y) { return '<option value="' + y + '"' + (y === ss ? ' selected' : '') + '>' + esc(sl(y)) + '</option>'; }).join('');
      var rows = st.map(function (r) {
        return '<tr' + (r[2] === me ? ' class="me"' : '') + '><td class="num">' + r[1] + '</td><td>' + esc(tnc(r[2])) + '</td><td class="num">' + r[3] + '</td><td class="num">' + r[4] + '</td><td class="num">' + r[5] + '</td><td class="num"><b>' + r[6] + '</b></td><td>' + esc(r[7] ? t('conf.' + r[7], true) : '—') + '</td><td>' + esc(r[8] ? t('div.' + r[8], true) : '—') + '</td></tr>';
      }).join('');
      var top3 = (DATA.top3 || []).filter(function (r) { return r[0] === dy; }).map(function (r) {
        return '<div class="trow"><span>#' + r[1] + ' · ' + esc(r[3]) + ' <span class="muted">(' + esc(r[4] || '') + ')</span></span><b>' + esc(tnc(r[2])) + '</b><span class="muted">' + esc(r[5] || '') + '</span></div>';
      }).join('') || '<p class="muted">' + esc(t('ui.no_data')) + '</p>';
      var lot = (DATA.lottery || []).filter(function (r) { return r[0] === dy && r[1] <= 8; }).map(function (r) {
        return '<div class="trow"><span>#' + r[1] + ' · ' + esc(tnc(r[3])) + '</span><b>' + r[2] + '</b><span class="muted"></span></div>';
      }).join('');
      var mine = (DATA.picks || []).filter(function (r) { return r[0] === dy; }).map(function (r) {
        return '<div class="trow"><span>' + esc(t('ui.round', true)) + ' ' + r[1] + ' · ' + esc(tnc(r[2])) + '</span><b>' + (r[3] == null ? '—' : '#' + r[3]) + '</b><span class="muted">' + esc(r[4] ? r[4] : (r[5] === 'pending' ? 'TBD' : '')) + '</span></div>';
      }).join('') || '<p class="muted">' + esc(t('ui.none_picks')) + '</p>';
      return header() + '<main>' + FTP.panel(t, esc, sync, { noPush: true }) + '<section class="pick"><label>' + esc(t('ui.season')) + '<select id="ls">' + opts + '</select></label></section>' +
        '<section class="card wide"><h3>' + esc(t('ui.standings')) + '</h3><div class="scroll"><table><thead><tr><th class="num">' + esc(t('ui.rank', true)) + '</th><th>' + esc(t('ui.team')) + '</th><th class="num">' + esc(t('stat.w', true)) + '</th><th class="num">' + esc(t('stat.l', true)) + '</th><th class="num">' + esc(t('stat.otl', true)) + '</th><th class="num">' + esc(t('stat.pts', true)) + '</th><th>' + esc(t('ui.conference', true)) + '</th><th>' + esc(t('ui.division', true)) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
        '<section class="card"><h3>' + esc(t('ui.draft')) + ' ' + dy + ' · ' + esc(t('ui.draft_top3')) + '</h3>' + top3 + '</section>' +
        '<section class="card"><h3>' + esc(t('ui.draft')) + ' ' + dy + ' · ' + esc(t('ui.lottery_order')) + '</h3>' + (lot || '<p class="muted">' + esc(t('ui.no_data')) + '</p>') + '</section>' +
        '<section class="card"><h3>' + esc(t('ui.draft')) + ' ' + dy + ' · ' + esc(t('ui.our_picks')) + '</h3>' + mine + '</section></main>';
    }
    function header() {
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t(state.view === 'team' ? 'ui.team_view' : state.view === 'contracts' ? 'ui.contracts_view' : state.view === 'league' ? 'ui.league_view' : 'ui.player_card')) + '</div></div></div>' +
        '<div class="ctl"><div class="seg" role="group" aria-label="' + esc(t('ui.language')) + '"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>' +
        '<div class="viewbar">' + (typeof window !== 'undefined' && window.FT_PAGE ? '' : '<div class="seg" role="group"><button data-view="player" aria-pressed="' + (state.view === 'player') + '">' + esc(t('ui.player_view')) + '</button><button data-view="team" aria-pressed="' + (state.view === 'team') + '">' + esc(t('ui.team_view')) + '</button><button data-view="contracts" aria-pressed="' + (state.view === 'contracts') + '">' + esc(t('ui.contracts_view')) + '</button><button data-view="league" aria-pressed="' + (state.view === 'league') + '">' + esc(t('ui.league_view')) + '</button></div>') + '<div class="seg" role="group"><button data-mode="0" aria-pressed="' + (state.mode === 0) + '">' + esc(t('ui.regular_season')) + '</button><button data-mode="1" aria-pressed="' + (state.mode === 1) + '">' + esc(t('ui.playoffs')) + '</button></div></div>';
    }

    function view() {
      if (state.view === 'team') return teamView();
      if (state.view === 'contracts') return contractsView();
      if (state.view === 'league') return leagueView();
      var p = byId[state.pid], q = state.cmp ? byId[state.cmp] : null;
      var rows1 = rowsOf(p.id), rows2 = q ? rowsOf(q.id) : null;
      var gs1 = FT.groupsIn(allRows(p.id), rows1, p.pos), two = gs1.length > 1;   // joueur fusionné F/D (migration 66) : un radar par poste
      var s1 = careerSeries(p.id), s2 = q ? careerSeries(q.id) : null;
      var head = tn(DATA.franchise.name);
      var opts = withStats.map(function (x) { return '<option value="' + esc(x.name) + '"></option>'; }).join('');
      var legend = '<span class="lg"><i class="sw1"></i>' + esc(p.name) + '</span>' + (q ? '<span class="lg"><i class="sw2"></i>' + esc(q.name) + '</span>' : '');
      var noData = !rows1.length;
      return header() + '<main>' + FTP.panel(t, esc, sync, { noPush: true }) + '<section class="pick"><label>' + esc(t('ui.search_player')) + '<input id="pl" list="plist" value="' + esc(p.name) + '" autocomplete="off"></label>' +
        '<label>' + esc(t('ui.compare_with')) + '<input id="cp" list="plist" value="' + esc(q ? q.name : '') + '" placeholder="' + esc(t('ui.none')) + '" autocomplete="off"></label><datalist id="plist">' + opts + '</datalist><div class="legend">' + legend + '</div></section>' +
        '<section class="card id">' + renderIdentity(p, rows1) + '</section>' + renderTrophies(p) + renderInjuries(p) +
        (noData ? '<section class="card"><p class="muted">' + esc(t('ui.no_data')) + '</p></section>' :
          '<section class="card"><h3>' + esc(t('ui.career_vs_record')) + '</h3>' + renderRecords(totals(rows1), rows2 && rows2.length ? totals(rows2) : null) + '</section>' +
          renderProfile(p, rows1, q) +
          '<section class="card wide"><h3>' + esc(t('ui.points_by_season')) + ' <span class="keyl"><i class="sw1"></i>' + esc(t('stat.g', true)) + ' <i class="sw1b"></i>' + esc(t('stat.a', true)) + '</span></h3>' + renderBars(s1, s2) + '</section>' +
          '<section class="card wide"><h3>' + esc(t('ui.cumulative')) + '</h3>' + renderCum(s1, s2) + '</section>' +
          '<section class="card wide"><h3>' + esc(t('ui.season')) + '</h3><div class="scroll">' + renderTable(rows1, p, two, gs1[0]) + '</div></section>') + '</main>';
    }
    return { sync: sync, state: state, view: view, t: t, withStats: withStats, TH: TH, REC: REC, byId: byId };
  }

  var api = { makeApp: makeApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTUI = api;

  // ---------- Montage dans la page ----------
  if (typeof document !== 'undefined') {
    var DATA = JSON.parse(document.getElementById('data').textContent);
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); } };
    var host = FTLM.run({ DATA0: DATA, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d) { return makeApp(d); }, assemble: FTLIVE.assemblePlayerCard });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    function draw() { host.draw(null); }
    function findPlayer(name) { var r = app.withStats.filter(function (p) { return p.name === name; }); return r[0] || null; }
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lang) app.state.lang = b.dataset.lang; else if (b.dataset.mode) app.state.mode = +b.dataset.mode; else if (b.dataset.view) app.state.view = b.dataset.view; else return;
      draw();
    });
    rootEl.addEventListener('change', function (e) {
      if (e.target.id === 'pl') { var p = findPlayer(e.target.value); if (p) app.state.pid = p.id; }
      else if (e.target.id === 'sn') { app.state.season = +e.target.value; }
      else if (e.target.id === 'ls') { app.state.lseason = +e.target.value; }
      else if (e.target.id === 'cp') { var q = findPlayer(e.target.value); app.state.cmp = q && q.id !== app.state.pid ? q.id : null; }
      else return;
      draw();
    });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
