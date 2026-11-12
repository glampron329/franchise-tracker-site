/* Historique réel de la LNH : conversion des réponses de l'API, rapprochement avec la base et plan d'importation (sans interface, testable avec Node). */
(function (root) {
  var SK_FIELDS = ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'shg', 'toi_minutes', 'ppp', 'shp', 'hits', 'blocks', 'giveaways', 'takeaways', 'fow', 'fot'];
  // Rapports détaillés de l'API de statistiques de la LNH : champ de la base -> noms possibles dans la réponse
  var ENRICH = { ppp: ['ppPoints'], shp: ['shPoints'], hits: ['hits'], blocks: ['blockedShots'], giveaways: ['giveaways'], takeaways: ['takeaways'], fow: ['totalFaceoffWins', 'faceoffsWon', 'faceoffWins'], fot: ['totalFaceoffs', 'faceoffs'] };
  var REPORTS = { summary: ['ppp', 'shp'], realtime: ['hits', 'blocks', 'giveaways', 'takeaways'], faceoffwins: ['fow', 'fot'] };
  var GK_FIELDS = ['gp', 'w', 'l', 'otl', 'so', 'saves', 'shots_against', 'goals_against', 'minutes', 'pim', 'g', 'a'];
  var SK_EXPECTED = ['playerId', 'firstName', 'lastName', 'positionCode', 'gamesPlayed', 'goals', 'assists', 'plusMinus', 'penaltyMinutes', 'shots'];
  var GK_EXPECTED = ['playerId', 'firstName', 'lastName', 'gamesPlayed', 'wins', 'losses', 'saves', 'shotsAgainst', 'goalsAgainst', 'timeOnIce'];

  function txt(v) { return v && typeof v === 'object' ? (v.default || v.fr || v.en || '') : (v == null ? '' : String(v)); }
  function fullName(a) { return (txt(a.firstName) + ' ' + txt(a.lastName)).replace(/\s+/g, ' ').trim(); }
  function normName(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim(); }
  function seasonStart(id) { var n = parseInt(String(id).slice(0, 4), 10); return isNaN(n) ? null : n; }
  function n(v) { return v === undefined || v === null || v === '' || isNaN(v) ? null : +v; }
  function round2(v) { return v === null ? null : Math.round(v * 100) / 100; }
  function grpOf(pos) { return pos === 'D' ? 'D' : pos === 'G' ? 'G' : 'F'; }

  function mapSkater(a) {
    var gp = n(a.gamesPlayed), toi = n(a.avgTimeOnIcePerGame);
    return { kind: 'sk', nhl_id: n(a.playerId), name: fullName(a), grp: grpOf(a.positionCode), row: {
      gp: gp, g: n(a.goals), a: n(a.assists), plus_minus: n(a.plusMinus), pim: n(a.penaltyMinutes), shots: n(a.shots), gwg: n(a.gameWinningGoals), ppg: n(a.powerPlayGoals), shg: n(a.shorthandedGoals),
      toi_minutes: gp !== null && toi !== null ? round2(toi * gp / 60) : null } };
  }
  function mapGoalie(a) {
    var t = n(a.timeOnIce);
    return { kind: 'gk', nhl_id: n(a.playerId), name: fullName(a), grp: 'G', row: {
      gp: n(a.gamesPlayed), w: n(a.wins), l: n(a.losses), otl: n(a.overtimeLosses), so: n(a.shutouts), saves: n(a.saves), shots_against: n(a.shotsAgainst), goals_against: n(a.goalsAgainst),
      minutes: t !== null ? round2(t / 60) : null, pim: n(a.penaltyMinutes), g: n(a.goals), a: n(a.assists) } };
  }
  // raw : { team, seasons: { 'YYYYYYYY': { '2': {skaters, goalies}, '3': {...} } } }
  function collect(raw) {
    var out = [];
    Object.keys(raw.seasons || {}).sort().forEach(function (sid) {
      ['2', '3'].forEach(function (gt) {
        var d = (raw.seasons[sid] || {})[gt]; if (!d) return;
        var en = enrichIndex(((raw.stats || {})[sid] || {})[gt], raw.team);
        (d.skaters || []).forEach(function (a) { var m = mapSkater(a); m.season = seasonStart(sid); m.gt = gt === '2' ? 'RS' : 'PO'; var x = en.map[m.nhl_id]; if (x) { Object.keys(x).forEach(function (f) { m.row[f] = x[f]; }); m.enriched = true; } else m.enriched = false; out.push(m); });
        (d.goalies || []).forEach(function (a) { var m = mapGoalie(a); m.season = seasonStart(sid); m.gt = gt === '2' ? 'RS' : 'PO'; out.push(m); });
      });
    });
    return out;
  }

  function pick(row, names) { for (var i = 0; i < names.length; i++) { if (row[names[i]] !== undefined && row[names[i]] !== null) return n(row[names[i]]); } return null; }
  function teamsOf(row) { return String(row.teamAbbrevs || row.teamAbbrev || '').split(/[,\s]+/).filter(Boolean); }
  // reports : { summary:{data:[...]}, realtime:{data:[...]}, faceoffwins:{data:[...]} } pour une saison et un type de match ; seuls les joueurs
  // qui n'ont joué que pour cette équipe sont retenus (pour un joueur échangé, la LNH additionne les équipes : on ne peut pas isoler la part de l'équipe).
  function enrichIndex(reports, team) {
    var map = {}, multi = 0;
    if (!reports) return { map: map, multi: 0 };
    Object.keys(REPORTS).forEach(function (rep) {
      var rows = ((reports[rep] || {}).data) || (Array.isArray(reports[rep]) ? reports[rep] : []);
      rows.forEach(function (r) {
        var id = n(r.playerId), ts = teamsOf(r); if (id === null) return;
        if (ts.length !== 1 || ts[0] !== team) { if (ts.indexOf(team) >= 0 && rep === 'summary') multi++; return; }
        REPORTS[rep].forEach(function (f) { var v = pick(r, ENRICH[f]); if (v !== null) { map[id] = map[id] || {}; map[id][f] = v; } });
      });
    });
    return { map: map, multi: multi };
  }
  // Contrôle des champs de l'API de statistiques (diagnostic)
  function checkReport(rep, resp) {
    var row = ((resp && resp.data) || [])[0]; if (!row) return { rows: 0, missing: ['aucune ligne'] };
    var need = ['playerId', 'teamAbbrevs'].filter(function (f) { return !(f in row); });
    REPORTS[rep].forEach(function (f) { var found = ENRICH[f].some(function (nm) { return nm in row; }); if (!found) need.push(f + ' (' + ENRICH[f].join(' ou ') + ')'); });
    return { rows: resp.data.length, missing: need, keys: Object.keys(row) };
  }


  // ---- Hockey-Reference (fichier produit par hr/hr_fetch.py) ----
  function sum2(a, b) { return a === null || a === undefined || b === null || b === undefined ? null : a + b; }
  function hrSkater(r) {
    return { kind: 'sk', nhl_id: null, hr_id: r.hr_id || null, bio: r.bio || null, name: r.name, grp: r.pos === 'D' ? 'D' : 'F', enriched: true, row: {
      gp: n(r.gp), g: n(r.g), a: n(r.a), plus_minus: n(r.plus_minus), pim: n(r.pim), shots: n(r.shots), gwg: n(r.gwg), ppg: n(r.g_pp), shg: n(r.g_sh), ppp: sum2(n(r.g_pp), n(r.a_pp)), shp: sum2(n(r.g_sh), n(r.a_sh)),
      toi_minutes: n(r.toi_minutes), fow: n(r.fow), fot: sum2(n(r.fow), n(r.fol)), hits: n(r.hits), blocks: n(r.blocks), giveaways: n(r.giveaways), takeaways: n(r.takeaways) } };
  }
  function hrGoalie(r) {
    return { kind: 'gk', nhl_id: null, hr_id: r.hr_id || null, bio: r.bio || null, name: r.name, grp: 'G', enriched: false, row: { gp: n(r.gp), w: n(r.w), l: n(r.l), otl: n(r.otl), so: n(r.so), saves: n(r.saves), shots_against: n(r.sa), goals_against: n(r.ga), minutes: n(r.minutes), pim: n(r.pim), g: n(r.g), a: n(r.a) } };
  }
  function collectHr(raw) {
    var out = [];
    Object.keys(raw.seasons || {}).sort().forEach(function (key) {
      var s = raw.seasons[key];
      [['rs', 'RS'], ['po', 'PO']].forEach(function (g) {
        var d = s[g[0]] || {};
        (d.skaters || []).forEach(function (r) { var m = hrSkater(r); m.season = +key; m.gt = g[1]; out.push(m); });
        (d.goalies || []).forEach(function (r) { var m = hrGoalie(r); m.season = +key; m.gt = g[1]; out.push(m); });
      });
    });
    return out;
  }
  function collectAny(raw) { return raw && raw.format === 'hockey-reference' ? collectHr(raw) : collect(raw); }
  var SK_NOTNULL = ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'shg', 'ppp', 'shp'], GK_NOTNULL = ['gp', 'w', 'l', 'otl', 'so', 'saves', 'shots_against', 'goals_against', 'pim', 'g', 'a'];
  // Ligne complète pour le mode « remplacer tout » : un champ absent de la source est mis à vide (ou à 0 quand la colonne l'exige)
  function fullRow(kind, row) {
    var fields = kind === 'sk' ? SK_FIELDS : GK_FIELDS, notnull = kind === 'sk' ? SK_NOTNULL : GK_NOTNULL, o = {};
    fields.forEach(function (f) { var v = row[f]; o[f] = v === undefined || v === null ? (notnull.indexOf(f) >= 0 ? 0 : null) : v; }); return o;
  }

  // Contrôle des champs attendus dans une réponse (diagnostic de l'API réelle)
  function checkShape(resp) {
    var sk = (resp.skaters || [])[0], gk = (resp.goalies || [])[0], miss = [];
    if (sk) SK_EXPECTED.forEach(function (f) { if (!(f in sk)) miss.push('skaters.' + f); });
    if (gk) GK_EXPECTED.forEach(function (f) { if (!(f in gk)) miss.push('goalies.' + f); });
    return { skaters: (resp.skaters || []).length, goalies: (resp.goalies || []).length, missing: miss };
  }

  // ctx : { players:[{id,key,nhl_id,origin}], existing:{ sk:{ 'pid|season|gt': row }, gk:{...} }, firstSeason, mode:'missing'|'replace' }
  function planImport(entries, ctx) {
    var byNhl = {}, byHr = {}, byName = {};
    ctx.players.forEach(function (p) { if (p.nhl_id) byNhl[p.nhl_id] = p; if (p.hr_id) byHr[p.hr_id] = p; var k = p.key.charAt(0) + '|' + normName(p.key.slice(4)); (byName[k] = byName[k] || []).push(p); });
    var newPlayers = {}, rows = [], skipped = 0, st = { new: 0, same: 0, update: 0, fill: 0 }, patchNhl = {}, patchHr = {};
    entries.forEach(function (e) {
      if (ctx.firstSeason != null && e.season >= ctx.firstSeason) { skipped++; return; }
      var p = (e.nhl_id && byNhl[e.nhl_id]) || (e.hr_id && byHr[e.hr_id]) || null, key = e.grp + '|' + normName(e.name);
      if (!p) { var c = byName[key]; if (c && c.length) { p = c.filter(function (x) { return !x.nhl_id || x.nhl_id === e.nhl_id; })[0] || c[0]; } }
      var pid = p ? p.id : null, tmp = null;
      if (p && e.nhl_id && !p.nhl_id) patchNhl[p.id] = e.nhl_id;
      if (p && e.hr_id && !p.hr_id) patchHr[p.id] = e.hr_id;
      if (!p) { var nk = e.nhl_id ? 'n' + e.nhl_id : e.hr_id ? 'h' + e.hr_id : key; if (!newPlayers[nk]) newPlayers[nk] = { tmp: nk, grp: e.grp, name: e.name, nhl_id: e.nhl_id || null, hr_id: e.hr_id || null, bio: e.bio || null }; tmp = nk; }
      var ex = pid ? (ctx.existing[e.kind] || {})[pid + '|' + e.season + '|' + e.gt] : null, fields = e.kind === 'sk' ? SK_FIELDS : GK_FIELDS, diff = [];
      if (ex) fields.forEach(function (f) { var a = e.row[f], b = ex[f]; if (a === null || a === undefined) return;
        if (b === null || b === undefined) diff.push({ field: f, db: null, api: a, fill: true });                 // champ vide chez toi : peut être complété
        else if (Math.abs(+a - +b) > (f === 'toi_minutes' || f === 'minutes' ? 1 : 0)) diff.push({ field: f, db: b, api: a }); });   // valeur différente : jamais écrasée sans ton accord
      var action = !ex ? 'new' : diff.length ? (diff.some(function (d) { return !d.fill; }) ? 'update' : 'fill') : 'same'; st[action]++;
      rows.push({ kind: e.kind, season: e.season, gt: e.gt, name: e.name, grp: e.grp, pid: pid, tmp: tmp, row: e.row, action: action, diff: diff, enriched: !!e.enriched });
    });
    return { newPlayers: Object.keys(newPlayers).map(function (k) { return newPlayers[k]; }), rows: rows, skippedAfterStart: skipped, stats: st, patchNhl: patchNhl, patchHr: patchHr };
  }

  function splitName(full) { var p = full.split(' '); return { first: p[0] || '', last: p.slice(1).join(' ') || p[0] || '' }; }
  // Écritures à faire : selon le mode, seules les lignes nouvelles ou aussi les lignes qui diffèrent
  function buildWrites(plan, fid, mode, idByTmp) {
    var players = plan.newPlayers.map(function (p) { var s = splitName(p.name), b = p.bio || {}, o = { franchise_id: fid, legacy_key: p.grp + ' - ' + p.name, first_name: s.first, last_name: s.last, full_name: p.name, nhl_id: p.nhl_id || null, hr_id: p.hr_id || null, origin: 'historical' };
      if (b.birth) o.birth_date = b.birth; if (b.height_in) o.height_in = b.height_in; if (b.weight_lb) o.weight_lb = b.weight_lb; if (b.shoots) o.handedness = b.shoots === 'L' ? 'Left' : 'Right'; if (b.country) o.country = b.country; return o; });
    var sk = [], gk = [];
    plan.rows.forEach(function (r) {
      var pid = r.pid != null ? r.pid : (idByTmp || {})[r.tmp];
      if (mode === 'scratch') { if (pid == null) return; (r.kind === 'sk' ? sk : gk).push(Object.assign({ franchise_id: fid, player_id: pid, season: r.season, game_type: r.gt, origin: 'historical' }, fullRow(r.kind, r.row))); return; }
      if (r.action === 'same') return;
      if (pid == null) return;
      var base = { franchise_id: fid, player_id: pid, season: r.season, game_type: r.gt, origin: 'historical' }, row = {};
      var only = null;    // lignes existantes : « ajouter seulement ce qui manque » complète les champs vides ; « remplacer » écrit aussi les valeurs différentes
      if (r.action === 'update' || r.action === 'fill') { only = {}; r.diff.forEach(function (d) { if (mode === 'replace' || d.fill) only[d.field] = 1; }); if (!Object.keys(only).length) return; }
      Object.keys(r.row).forEach(function (f) { if (r.row[f] !== null && r.row[f] !== undefined && (!only || only[f])) row[f] = r.row[f]; });
      (r.kind === 'sk' ? sk : gk).push(Object.assign(base, row));
    });
    return { players: players, sk: sk, gk: gk, patchNhl: plan.patchNhl, patchHr: plan.patchHr || {} };
  }
  var api = { collectHr: collectHr, collectAny: collectAny, fullRow: fullRow, enrichIndex: enrichIndex, checkReport: checkReport, REPORTS: REPORTS, ENRICH: ENRICH, SK_FIELDS: SK_FIELDS, GK_FIELDS: GK_FIELDS, normName: normName, seasonStart: seasonStart, mapSkater: mapSkater, mapGoalie: mapGoalie, collect: collect, checkShape: checkShape, planImport: planImport, buildWrites: buildWrites, fullName: fullName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTN = api;
})(typeof window !== 'undefined' ? window : this);

;/* Page « Historique de la LNH » : lecture de l'API (ou d'un fichier), aperçu des écarts avec la base, importation dans Supabase. */
(function (root) {
  var N = root.FTN || (typeof require !== 'undefined' ? require('./nhl_core.js') : null);
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  var BASE = 'https://api-web.nhle.com/v1', STATS = 'https://api.nhle.com/stats/rest/en';
  function reportUrl(rep, sid, gt) { return STATS + '/skater/' + rep + '?isAggregate=false&isGame=false&start=0&limit=-1&cayenneExp=' + encodeURIComponent('seasonId=' + sid + ' and gameTypeId=' + gt); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // nhlFetch(url) -> { ok, status, json() }  (par défaut : fetch du navigateur)
  function makeNhlApp(DATA, store, nhlFetch, opts) {
    opts = opts || {}; var doFetch = nhlFetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null), delay = opts.delay == null ? 250 : opts.delay;
    var sync = { user: null, busy: false, msg: '', level: '' };
    var first = DATA.franchise.first || 2024;
    var state = { lang: 'fr', team: DATA.franchise.code || '', from: first - 5, to: first - 1, mode: 'missing', extra: true, extraFailed: false, raw: null, plan: null, diag: null, progress: '', error: '' };
    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s; }
    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    function setField(k, v) { if (k === 'from' || k === 'to') state[k] = parseInt(v, 10) || state[k]; else if (k === 'team') state.team = String(v).trim().toUpperCase(); else if (k === 'mode') { state.mode = v; } else if (k === 'extra') { state.extra = !!v; } else return false; return true; }

    function replan() {
      if (!state.raw) { state.plan = null; return; }
      state.plan = N.planImport(N.collectAny(state.raw), { players: DATA.players, existing: DATA.existing, firstSeason: first, mode: state.mode });
      if (state.mode === 'scratch') plan_leftover();
    }
    function plan_leftover() {   // lignes historiques existantes qui ne sont pas dans la source : elles seront supprimées
      var keep = {}; state.plan.rows.forEach(function (r) { if (r.pid != null) keep[r.kind + '|' + r.pid + '|' + r.season + '|' + r.gt] = 1; });
      var n = 0; ['sk', 'gk'].forEach(function (k) { Object.keys(DATA.existing[k] || {}).forEach(function (key) { var p = key.split('|'); if (+p[1] < first && !keep[k + '|' + key]) n++; }); });
      state.plan.leftover = n;
    }
    async function getJson(url) {
      var r = await doFetch(url); if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.json();
    }
    async function diagnose() {
      var d = [], team = state.team, reached = false;
      try {
        var seasons = await getJson(BASE + '/roster-season/' + encodeURIComponent(team)); reached = Array.isArray(seasons); var sorted = Array.isArray(seasons) ? seasons.map(String).sort() : []; d.push({ ok: sorted.length > 0, label: 'roster-season/' + team, detail: sorted.length ? sorted.length + ' saison(s), de ' + sorted[0] + ' à ' + sorted[sorted.length - 1] : 'réponse inattendue' });
        var ids = (seasons || []).map(String).sort(), sid = ids.filter(function (x) { return +x.slice(0, 4) <= state.to; }).pop() || ids[ids.length - 1];
        try { var cs = await getJson(BASE + '/club-stats/' + team + '/' + sid + '/2'), c = N.checkShape(cs);
          d.push({ ok: c.skaters > 0 && c.missing.length === 0, label: 'club-stats/' + team + '/' + sid + '/2', detail: c.skaters + ' patineurs, ' + c.goalies + ' gardiens' + (c.missing.length ? ' · champs absents : ' + c.missing.join(', ') : ' · tous les champs attendus sont présents') }); }
        catch (e) { d.push({ ok: false, label: 'club-stats/' + team + '/' + sid + '/2', detail: String(e.message || e) }); }
      } catch (e) { d.push({ ok: false, label: 'roster-season/' + team, detail: String(e.message || e) + (e.status ? '' : ' → accès bloqué par le navigateur ? utilise nhl_fetch.py et charge le fichier') }); }
      if (state.extra && reached) {
        var sid2 = state.diagSeason || (d.length > 1 ? (d[1].label.split('/')[2]) : null);
        var reps2 = Object.keys(N.REPORTS);
        for (var ri2 = 0; ri2 < reps2.length; ri2++) {
          var u = reportUrl(reps2[ri2], sid2 || (state.to + '' + (state.to + 1)), 2);
          try { var rr = await getJson(u), cr = N.checkReport(reps2[ri2], rr); d.push({ ok: cr.rows > 0 && cr.missing.length === 0, label: 'skater/' + reps2[ri2], detail: cr.rows + ' lignes' + (cr.missing.length ? ' · champs absents : ' + cr.missing.join(', ') + (cr.keys ? ' · champs reçus : ' + cr.keys.slice(0, 40).join(', ') : '') : ' · champs détaillés présents') }); }
          catch (e3) { d.push({ ok: false, label: 'skater/' + reps2[ri2], detail: String(e3.message || e3) }); }
        }
      }
      state.diag = d; return d;
    }
    async function fetchApi() {
      sync.busy = true; state.error = ''; state.extraFailed = false;
      try {
        var seasons = (await getJson(BASE + '/roster-season/' + encodeURIComponent(state.team))).map(String).sort().filter(function (s) { var y = +s.slice(0, 4); return y >= state.from && y <= state.to; });
        if (!seasons.length) { say('warn', 'nhl.no_seasons'); state.raw = null; state.plan = null; sync.busy = false; return false; }
        var raw = { team: state.team, source: BASE, seasons: {} };
        for (var i = 0; i < seasons.length; i++) {
          state.progress = seasons[i] + ' (' + (i + 1) + '/' + seasons.length + ')'; raw.seasons[seasons[i]] = {};
          for (var g = 2; g <= 3; g++) {
            try { raw.seasons[seasons[i]][String(g)] = await getJson(BASE + '/club-stats/' + state.team + '/' + seasons[i] + '/' + g); } catch (e) { if (e.status !== 404) throw e; } if (delay) await sleep(delay);
            if (state.extra && raw.seasons[seasons[i]][String(g)] && (raw.seasons[seasons[i]][String(g)].skaters || []).length) {
              raw.stats = raw.stats || {}; raw.stats[seasons[i]] = raw.stats[seasons[i]] || {}; raw.stats[seasons[i]][String(g)] = {};
              var reps = Object.keys(N.REPORTS);
              for (var ri = 0; ri < reps.length; ri++) { try { raw.stats[seasons[i]][String(g)][reps[ri]] = await getJson(reportUrl(reps[ri], seasons[i], g)); } catch (e2) { state.extraFailed = true; } if (delay) await sleep(delay); }
            }
          }
        }
        state.raw = raw; state.progress = ''; if (!state.extra) state.extraFailed = false; replan(); say('ok', 'sb.pulled', [state.plan.rows.length]);
      } catch (e) { say('bad', 'sb.failed', [e.message]); state.progress = ''; }
      sync.busy = false; return !!state.plan;
    }
    function loadFile(text) {
      try { var raw = JSON.parse(text); if (!raw || !raw.seasons) throw new Error('x'); state.raw = raw; if (raw.team) state.team = raw.team; replan(); say('ok', raw.format === 'hockey-reference' ? 'nhl.source_hr' : 'sb.pulled', [state.plan.rows.length]); return true; }
      catch (e) { say('bad', 'nhl.file_bad'); return false; }
    }
    async function refresh(client) {
      var pl = await client.selectAll('player', 'select=id,legacy_key,nhl_id,hr_id,origin&order=id');
      DATA.players.splice(0, DATA.players.length); pl.forEach(function (p) { DATA.players.push({ id: p.id, key: p.legacy_key, nhl_id: p.nhl_id == null ? null : p.nhl_id, hr_id: p.hr_id == null ? null : p.hr_id, origin: p.origin }); });
      var ex = { sk: {}, gk: {} };
      (await client.selectAll('skater_season_stats', 'select=player_id,season,game_type,gp,g,a,plus_minus,pim,shots,gwg,ppg,shg,toi_minutes,ppp,shp,hits,blocks,giveaways,takeaways,fow,fot&origin=eq.historical&order=id')).forEach(function (s) { ex.sk[s.player_id + '|' + s.season + '|' + s.game_type] = s; });
      (await client.selectAll('goalie_season_stats', 'select=player_id,season,game_type,gp,w,l,otl,so,saves,shots_against,goals_against,minutes,pim,g,a&origin=eq.historical&order=id')).forEach(function (s) { ex.gk[s.player_id + '|' + s.season + '|' + s.game_type] = s; });
      DATA.existing = ex;
    }
    async function makeBackup(client) {
      return { kind: 'sauvegarde-historique', at: new Date().toISOString(), players: await client.selectAll('player', 'select=*&origin=eq.historical&order=id'), skater_season_stats: await client.selectAll('skater_season_stats', 'select=*&origin=eq.historical&order=id'), goalie_season_stats: await client.selectAll('goalie_season_stats', 'select=*&origin=eq.historical&order=id') };
    }
    function groupByKeys(rows) { var g = {}; rows.forEach(function (r) { var k = Object.keys(r).sort().join(','); (g[k] = g[k] || []).push(r); }); return Object.keys(g).map(function (k) { return g[k]; }); }
    async function upsertChunks(client, table, rows) {
      var groups = groupByKeys(rows), n = 0;   // même liste de colonnes dans chaque envoi : une valeur absente ne remplace pas une valeur existante par du vide
      for (var gi = 0; gi < groups.length; gi++) for (var i = 0; i < groups[gi].length; i += 400) { await client.upsert(table, groups[gi].slice(i, i + 400), 'franchise_id,player_id,season,game_type'); n += Math.min(400, groups[gi].length - i); }
      return n;
    }
    async function doPush(client) {
      sync.busy = true;
      try {
        if (!state.plan) { say('warn', 'nhl.nothing'); sync.busy = false; return false; }
        if ((await client.ensureFranchise()) == null) { say('bad', 'sb.no_franchise'); sync.busy = false; return false; }
        if (state.mode === 'scratch' && !(state.raw && state.raw.format === 'hockey-reference')) { say('warn', 'nhl.scratch_needs_hr'); sync.busy = false; return false; }
        if (state.mode === 'scratch' && state.raw.complete === false) { say('bad', 'nhl.scratch_incomplete'); sync.busy = false; return false; }
        var fid = client.franchiseId(), w = N.buildWrites(state.plan, fid, state.mode, {}), idByTmp = {}, created = 0, backed = 0;
        if (state.mode === 'scratch') { var bk = await makeBackup(client); backed = bk.skater_season_stats.length + bk.goalie_season_stats.length; if (opts.onBackup) opts.onBackup(JSON.stringify(bk), bk); }
        if (!w.players.length && !w.sk.length && !w.gk.length && !Object.keys(w.patchNhl).length && !Object.keys(w.patchHr).length && !(state.plan.leftover > 0)) { say('warn', 'nhl.nothing'); sync.busy = false; return false; }
        if (w.players.length) {
          var made; try { made = await client.insert('player', w.players, { returning: true }); } catch (e) { if (/nhl_id/.test(e.message)) { say('bad', 'nhl.migration_needed'); sync.busy = false; return false; } throw e; }
          made.forEach(function (p, i) { idByTmp[state.plan.newPlayers[i].tmp] = p.id; }); created = made.length;
        }
        var patch = {}; Object.keys(w.patchNhl).forEach(function (k) { (patch[k] = patch[k] || {}).nhl_id = w.patchNhl[k]; }); Object.keys(w.patchHr).forEach(function (k) { (patch[k] = patch[k] || {}).hr_id = w.patchHr[k]; });
        var pids = Object.keys(patch);
        for (var i = 0; i < pids.length; i++) { try { await client.patch('player', 'id=eq.' + pids[i], patch[pids[i]]); } catch (e) { if (/nhl_id|hr_id/.test(e.message)) { say('bad', 'nhl.migration_needed'); sync.busy = false; return false; } throw e; } }
        var w2 = N.buildWrites(state.plan, fid, state.mode, idByTmp), n = 0;
        n += await upsertChunks(client, 'skater_season_stats', w2.sk); n += await upsertChunks(client, 'goalie_season_stats', w2.gk);
        var removed = 0, orphans = 0;
        if (state.mode === 'scratch') {
          var written = {}; w2.sk.forEach(function (r) { written['sk|' + r.player_id + '|' + r.season + '|' + r.game_type] = 1; }); w2.gk.forEach(function (r) { written['gk|' + r.player_id + '|' + r.season + '|' + r.game_type] = 1; });
          // on supprime en dernier : un échec en cours de route laisse des lignes en trop, jamais de trou
          var tabs = [['sk', 'skater_season_stats'], ['gk', 'goalie_season_stats']];
          for (var ti = 0; ti < tabs.length; ti++) {
            var old = await client.selectAll(tabs[ti][1], 'select=id,player_id,season,game_type&origin=eq.historical&season=lt.' + first + '&order=id');
            var del = old.filter(function (r) { return !written[tabs[ti][0] + '|' + r.player_id + '|' + r.season + '|' + r.game_type]; }).map(function (r) { return r.id; });
            for (var di = 0; di < del.length; di += 200) { await client.remove(tabs[ti][1], 'id=in.(' + del.slice(di, di + 200).join(',') + ')'); } removed += del.length;
          }
          var used = {}; (await client.selectAll('skater_season_stats', 'select=player_id&order=id')).concat(await client.selectAll('goalie_season_stats', 'select=player_id&order=id')).forEach(function (r) { used[r.player_id] = 1; });
          var hist = await client.selectAll('player', 'select=id&origin=eq.historical&order=id');
          for (var hi = 0; hi < hist.length; hi++) { if (!used[hist[hi].id]) { try { await client.remove('player', 'id=eq.' + hist[hi].id); orphans++; } catch (e) { /* encore référencé ailleurs : on le garde */ } } }
        }
        await refresh(client); replan(); say('ok', 'nhl.imported', [n, created]); if (state.mode === 'scratch') sync.msg += ' · ' + fmt('nhl.cleaned', [removed, orphans]) + ' · ' + fmt('nhl.backup_done', [backed]); sync.busy = false; return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); sync.busy = false; return false; }
    }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; }
    async function doLogin(client, email, pw) { try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } return !!sync.user; }
    async function doPull(client) { try { await refresh(client); replan(); say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } }

    function row(l, v) { return '<div class="trow"><span>' + esc(t(l)) + '</span><b>' + esc(v) + '</b><span class="muted"></span></div>'; }
    function view() {
      var pl = state.plan, diag = state.diag, h = '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(DATA.franchise.name) + '</div><div class="sub">' + esc(t('nhl.title')) + '</div></div></div>' +
        '<div class="ctl"><a class="navlink" href="offseason.html">' + esc(t('nav.off')) + '</a><div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>';
      h += '<main class="entry">' + FTP.panel(t, esc, sync);
      h += '<section class="card"><h3>' + esc(t('nhl.source')) + '</h3><p class="muted">' + esc(t('nhl.intro')) + '</p>' +
        '<label class="fld">' + esc(t('nhl.team')) + '<input id="nhl-team" value="' + esc(state.team) + '" maxlength="4"></label>' +
        '<label class="fld">' + esc(t('nhl.from')) + '<input id="nhl-from" type="number" value="' + state.from + '"></label><label class="fld">' + esc(t('nhl.to')) + '<input id="nhl-to" type="number" value="' + state.to + '"></label>' +
        (state.to >= first ? '<p class="warn">' + esc(t('nhl.range_after')) + '</p>' : '') +
        '<div class="acts left"><button class="btn" data-nhl="diag">' + esc(t('nhl.test_api')) + '</button><button class="btn" data-nhl="fetch"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('nhl.fetch')) + '</button></div>' +
        '<label class="fld"><span><input id="nhl-extra" type="checkbox"' + (state.extra ? ' checked' : '') + '> ' + esc(t('nhl.extra')) + '</span></label>' +
        '<label class="fld">' + esc(t('nhl.load_file')) + '<input id="nhl-file" type="file" accept=".json,application/json"></label>' +
        (state.extraFailed ? '<p class="warn">' + esc(t('nhl.extra_failed')) + '</p>' : '') + (state.progress ? '<p class="muted">' + esc(fmt('nhl.reading', [state.progress])) + '</p>' : '') + '</section>';
      if (diag) h += '<section class="card"><h3>' + esc(t('nhl.diag_title')) + '</h3><div class="scroll"><table><tbody>' + diag.map(function (d) { return '<tr class="' + (d.ok ? 'okrow' : 'badrow') + '"><td>' + (d.ok ? '✓' : '✗') + '</td><td>' + esc(d.label) + '</td><td>' + esc(d.detail) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
      if (pl) {
        h += '<section class="card"><h3>' + esc(t('nhl.preview')) + '</h3>' + row('nhl.sum_seasons', Object.keys(state.raw.seasons).length) + row('nhl.sum_rows', pl.rows.length) + row('nhl.sum_new', pl.stats.new) + row('nhl.sum_same', pl.stats.same) + row('nhl.sum_fill', pl.stats.fill) + row('nhl.sum_diff', pl.stats.update) + (state.mode === 'scratch' ? row('nhl.sum_leftover', pl.leftover || 0) : '') +
          (function () { var sk = pl.rows.filter(function (r) { return r.kind === 'sk'; }); return sk.length ? row('nhl.sum_enriched', sk.filter(function (r) { return r.enriched; }).length + ' / ' + sk.length) : ''; })() + row('nhl.sum_players', pl.newPlayers.length) + row('nhl.sum_nhlid', Object.keys(pl.patchNhl).length) + (pl.skippedAfterStart ? row('nhl.sum_skipped', pl.skippedAfterStart) : '') +
          '<label class="fld">' + esc(t('nhl.mode')) + '<select id="nhl-mode"><option value="missing"' + (state.mode === 'missing' ? ' selected' : '') + '>' + esc(t('nhl.mode_missing')) + '</option><option value="replace"' + (state.mode === 'replace' ? ' selected' : '') + '>' + esc(t('nhl.mode_replace')) + '</option><option value="scratch"' + (state.mode === 'scratch' ? ' selected' : '') + '>' + esc(t('nhl.mode_scratch')) + '</option></select></label>' + (state.mode === 'scratch' ? '<p class="warn">' + esc(t('nhl.scratch_warn')) + '</p>' : '') +
          '<p class="note muted">' + esc(t('nhl.note')) + '</p></section>';
        var diffs = pl.rows.filter(function (r) { return r.action === 'update'; }).slice(0, 40);
        if (diffs.length) h += '<section class="card wide"><h3>' + esc(t('nhl.diff_title')) + ' (' + pl.stats.update + ')</h3><div class="scroll"><table><thead><tr><th>' + esc(t('ui.season')) + '</th><th>' + esc(t('ui.player')) + '</th><th>' + esc(t('nhl.field')) + '</th><th class="num">' + esc(t('nhl.db')) + '</th><th class="num">' + esc(t('nhl.api')) + '</th></tr></thead><tbody>' +
          diffs.map(function (r) { return r.diff.map(function (d, i) { return '<tr><td>' + (i ? '' : r.season + '-' + String((r.season + 1) % 100).padStart(2, '0') + ' ' + r.gt) + '</td><td>' + (i ? '' : esc(r.name)) + '</td><td>' + esc(d.field) + '</td><td class="num">' + esc(d.db == null ? '—' : d.db) + '</td><td class="num">' + esc(d.api) + '</td></tr>'; }).join(''); }).join('') + '</tbody></table></div></section>';
      }
      return h + '<section class="card wide"><p class="note muted">' + esc(t('nhl.tos')) + '</p></section></main>';
    }
    return { makeBackup: makeBackup, sync: sync, state: state, view: view, t: t, setField: setField, replan: replan, diagnose: diagnose, fetchApi: fetchApi, loadFile: loadFile, doPush: doPush, doPull: doPull, doLogin: doLogin, doLogout: doLogout, refresh: refresh };
  }

  var api = { makeNhlApp: makeNhlApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTNUI = api;

  if (typeof document !== 'undefined') {
    var DATA0 = JSON.parse(document.getElementById('data').textContent), ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA0, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d) { return makeNhlApp(d, ls, null, { onBackup: function (text) { var b = new Blob([text], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sauvegarde_historique_' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); } }); }, assemble: FTLIVE.assembleNhl });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    rootEl.addEventListener('change', function (e) {
      var el = e.target, a = host.app(); if (!a) return;
      if (el.id === 'nhl-team') a.setField('team', el.value); else if (el.id === 'nhl-from') a.setField('from', el.value); else if (el.id === 'nhl-to') a.setField('to', el.value);
      else if (el.id === 'nhl-mode') { a.setField('mode', el.value); a.replan(); }
      else if (el.id === 'nhl-extra') { a.setField('extra', el.checked); }
      else if (el.id === 'nhl-file' && el.files && el.files[0]) { var rd = new FileReader(); rd.onload = function () { a.loadFile(rd.result); host.draw(); }; rd.readAsText(el.files[0]); return; }
      else return;
      host.draw();
    });
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null, a = host.app(); if (!b || !a) return;
      if (b.dataset.lang) { a.state.lang = b.dataset.lang; host.draw(); }
      else if (b.dataset.nhl === 'diag') { a.diagnose().then(function () { host.draw(); }); }
      else if (b.dataset.nhl === 'fetch') { var t1 = setInterval(function () { host.draw(); }, 400); a.fetchApi().then(function () { clearInterval(t1); host.draw(); }); }
    });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
