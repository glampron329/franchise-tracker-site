/* Saisie : colonnes, statistiques dérivées et règles de validation (sans interface, testable avec Node). */
(function (root) {
  // calculs communs (SV%) : connect/ft_stats.js, chargé avant ce fichier dans les pages
  var FS = typeof module !== 'undefined' && module.exports ? require('../connect/ft_stats.js') : root.FTSTATS;
  var SK = ['gp', 'g', 'a', 'pm', 'pim', 's', 'gwg', 'ppg', 'ppp', 'shg', 'shp', 'toi', 'fow', 'fot', 'hits', 'bks', 'gv', 'tk', 'oa'];
  var GK = ['gp', 'w', 'l', 'otl', 'so', 'sv', 'sa', 'min', 'pim', 'g', 'a', 'oa'];
  var TM_RS = ['gp', 'w', 'l', 'otl', 'rw', 'row', 'gf', 'ga', 'ppg', 'tpp', 'shga', 'ppga', 'tsh', 'shgf', 'hw', 'hl', 'ho', 'aw', 'al', 'ao'];
  var TM_PO = ['gp', 'w', 'l', 'gf', 'ga', 'ppg', 'tpp', 'shga', 'ppga', 'tsh', 'shgf', 'hw', 'hl', 'aw', 'al'];
  // clé de libellé de chaque colonne (table label)
  var LBL = { gp: 'stat.gp', g: 'stat.g', a: 'stat.a', pm: 'stat.plus_minus', pim: 'stat.pim', s: 'stat.shots', gwg: 'stat.gwg', ppg: 'stat.ppg', ppp: 'stat.ppp', shg: 'stat.shg', shp: 'stat.shp',
              toi: 'stat.toi', fow: 'stat.fow', fot: 'stat.fot', hits: 'stat.hits', bks: 'stat.blocks', gv: 'stat.giveaways', tk: 'stat.takeaways', oa: 'stat.oa',
              w: 'stat.w', l: 'stat.l', otl: 'stat.otl', so: 'stat.so', sv: 'stat.saves', sa: 'stat.sa', min: 'stat.min', rw: 'stat.rw', row: 'stat.row', gf: 'stat.gf', ga: 'stat.ga',
              tpp: 'stat.tpp', shga: 'stat.shga', ppga: 'stat.ppga', tsh: 'stat.tsh', shgf: 'stat.shgf', hw: 'stat.home_w', hl: 'stat.home_l', ho: 'stat.home_otl', aw: 'stat.away_w', al: 'stat.away_l', ao: 'stat.away_otl' };
  var DECIMAL = { toi: 1, min: 1 };

    // Ordre des colonnes à l'écran, comme dans le jeu : « @nom » = colonne calculée (en lecture seule), le reste = cellule à saisir
  var LAYOUT = {
    sk: ['gp', 'g', 'a', '@pts', 'pm', 'pim', 's', '@shot_pct', 'gwg', 'ppg', 'ppp', 'shg', 'shp', '@toi_per_game', 'toi', 'fow', 'fot', '@fo_pct', 'hits', 'bks', 'gv', 'tk', '@oa_start', 'oa', '@oa_avg'],
    gk: ['gp', 'w', 'l', 'otl', 'so', '@sv_pct', '@gaa', 'sv', 'sa', '@ga', 'min', 'pim', 'g', 'a', '@pts', '@oa_start', 'oa', '@oa_avg'],
    tm_rs: ['gp', '@pts', 'w', 'l', 'otl', 'rw', 'row', '@pts_pct', 'gf', '@gf_pg', 'ga', '@ga_pg', 'ppg', 'tpp', '@pp_pct', 'shga', 'ppga', 'tsh', '@pk_pct', 'shgf', 'hw', 'hl', 'ho', 'aw', 'al', 'ao'],
    tm_po: ['gp', 'w', 'l', 'gf', '@gf_pg', 'ga', '@ga_pg', 'ppg', 'tpp', '@pp_pct', 'shga', 'ppga', 'tsh', '@pk_pct', 'shgf', 'hw', 'hl', 'aw', 'al']
  };
  // colonnes calculées de chaque onglet, dans l'ordre des tableaux renvoyés par rowInfo().derived
  var DER = { sk: ['pts', 'shot_pct', 'toi_per_game', 'fo_pct', 'oa_start', 'oa_avg'], gk: ['ga', 'sv_pct', 'gaa', 'pts', 'oa_start', 'oa_avg'], tm: ['pts', 'pts_pct', 'pp_pct', 'pk_pct', 'gf_pg', 'ga_pg'] };
  var DLBL = { pts: 'stat.pts', shot_pct: 'stat.shot_pct', toi_per_game: 'stat.toi_per_game', fo_pct: 'stat.fo_pct', sv_pct: 'stat.sv_pct', gaa: 'stat.gaa', ga: 'stat.ga', pts_pct: 'stat.pts_pct', gf_pg: 'stat.gf_pg', ga_pg: 'stat.ga_pg', pp_pct: 'stat.pp_pct', pk_pct: 'stat.pk_pct', oa_start: 'stat.oa_start', oa_avg: 'stat.oa_avg' };
  var LINKED = { oa_start: 1 };   // colonnes calculées qui sont en fait liées à une autre saisie
  function layout(tab, po) { return tab === 'sk' ? LAYOUT.sk : tab === 'gk' ? LAYOUT.gk : (po ? LAYOUT.tm_po : LAYOUT.tm_rs); }
  // Matchs attendus pour les patineurs : 18 patineurs par match. Saison régulière terminée = 82 matchs ; sinon matchs de l'équipe saisis.
  var SKATERS_PER_GAME = 18, GAMES = 82;   // GAMES : matchs de la saison régulière (paramètre de la franchise)
  function setGames(n) { GAMES = n >= 20 && n <= 84 && n % 2 === 0 ? n : 82; }
  function seasonGames() { return GAMES; }
  function skaterGpCheck(sumGp, games) {
    if (games === null || games === undefined || !games) return null;
    var expected = SKATERS_PER_GAME * games; return { sum: sumGp, expected: expected, games: games, ok: sumGp === expected };
  }

  function n(v) { return v === null || v === undefined || v === '' || isNaN(v) ? null : +v; }
  function z(v) { return n(v) || 0; }

  function skaterDerived(v) {
    var g = z(v.g), a = z(v.a), s = n(v.s), gp = z(v.gp), toi = n(v.toi), fot = n(v.fot);
    return { pts: g + a, shotPct: s ? g / s : null, toiPerGame: gp && toi != null ? toi / gp : null, foPct: fot ? z(v.fow) / fot : null };
  }
  function goalieDerived(v) {
    var sa = n(v.sa), sv = n(v.sv), min = n(v.min), ga = sa != null && sv != null ? sa - sv : null;
    // tirs saisis sans arrêts : SV% et MBA vides (« — »), pas 0 (décision C3 du 2026-11-11)
    return { ga: ga, svPct: FS.svPct(sv, sa), gaa: min && ga != null ? ga * 60 / min : null, pts: z(v.g) + z(v.a) };
  }
  function teamDerived(v, po) {
    var w = z(v.w), l = z(v.l), otl = po ? 0 : z(v.otl), gp = z(v.gp);
    return { pts: po ? null : 2 * w + otl, ptsPct: !po && gp ? (2 * w + otl) / (2 * gp) : null, ppPct: n(v.tpp) ? z(v.ppg) / v.tpp : null, pkPct: n(v.tsh) ? 1 - z(v.ppga) / v.tsh : null, gfpg: gp ? z(v.gf) / gp : null, gapg: gp ? z(v.ga) / gp : null };
  }

  // Alerte : { c: colonne, level: 'err'|'warn', k: clé de message, p: paramètres }
  function validateSkater(v, po) {
    var out = [], max = po ? 28 : GAMES, gp = n(v.gp), d = skaterDerived(v);
    function add(c, level, k, p) { out.push({ c: c, level: level, k: k, p: p || [] }); }
    SK.forEach(function (c) { if (c !== 'pm' && c !== 'oa' && n(v[c]) !== null && n(v[c]) < 0) add(c, 'err', 'val.negative'); });
    if (gp !== null && gp > max) add('gp', 'err', 'val.gp_range', [max]);
    if (!gp) { if (['g', 'a', 's', 'pim', 'hits', 'toi'].some(function (c) { return z(v[c]) > 0; })) add('gp', 'err', 'val.stats_without_gp'); return out; }
    if (n(v.s) !== null && z(v.g) > n(v.s)) add('g', 'err', 'val.goals_gt_shots');
    if (z(v.gwg) > z(v.g)) add('gwg', 'err', 'val.gwg_gt_g');
    if (z(v.ppg) > z(v.g)) add('ppg', 'err', 'val.ppg_gt_g');
    if (z(v.shg) > z(v.g)) add('shg', 'err', 'val.shg_gt_g');
    if (n(v.ppp) !== null && z(v.ppp) < z(v.ppg)) add('ppp', 'err', 'val.pp_lt');
    if (n(v.shp) !== null && z(v.shp) < z(v.shg)) add('shp', 'err', 'val.sh_lt');
    if (z(v.ppp) + z(v.shp) > d.pts) add('ppp', 'err', 'val.special_gt_pts');
    if (z(v.fow) > z(v.fot)) add('fow', 'err', 'val.fow_gt_fot');
    if (n(v.toi) === null) add('toi', 'warn', 'val.toi_missing');
    else if (v.toi / gp > 60) add('toi', 'err', 'val.toi_high');
    if (n(v.oa) !== null && (v.oa < 40 || v.oa > 99)) add('oa', 'warn', 'val.oa_range');
    return out;
  }
  function validateGoalie(v, po) {
    var out = [], max = po ? 28 : GAMES, gp = n(v.gp), d = goalieDerived(v);
    function add(c, level, k, p) { out.push({ c: c, level: level, k: k, p: p || [] }); }
    GK.forEach(function (c) { if (c !== 'oa' && n(v[c]) !== null && n(v[c]) < 0) add(c, 'err', 'val.negative'); });
    if (gp !== null && gp > max) add('gp', 'err', 'val.gp_range', [max]);
    if (!gp) { if (z(v.sa) > 0 || z(v.min) > 0) add('gp', 'err', 'val.stats_without_gp'); return out; }
    if (z(v.w) + z(v.l) + z(v.otl) > gp) add('gp', 'err', 'val.wlo_gt_gp');
    if (z(v.so) > gp) add('so', 'err', 'val.so_gt_gp');
    if (n(v.sa) !== null && n(v.sv) !== null && n(v.sv) > n(v.sa)) add('sv', 'err', 'val.saves_gt_sa');
    if (n(v.sa) !== null && n(v.sv) === null) add('sv', 'warn', 'val.sa_no_saves');
    if (n(v.min) !== null && v.min / gp > 75) add('min', 'err', 'val.min_high');
    if (n(v.min) === null) add('min', 'warn', 'val.min_missing');
    return out;
  }
  function validateTeam(v, po, skaterGoals) {
    var out = [], gp = n(v.gp);
    function add(c, level, k, p) { out.push({ c: c, level: level, k: k, p: p || [] }); }
    if (gp === null) return out;
    var rec = z(v.w) + z(v.l) + (po ? 0 : z(v.otl));
    if (rec !== gp) add('gp', 'err', 'val.record_sum', [rec, gp]);
    if (!po && gp > GAMES) add('gp', 'err', 'val.gp_range', [GAMES]);
    if (z(v.ppg) > n(v.tpp) && n(v.tpp) !== null) add('ppg', 'err', 'val.ppg_gt_tpp');
    if (z(v.ppga) > n(v.tsh) && n(v.tsh) !== null) add('ppga', 'err', 'val.ppga_gt_tsh');
    var home = z(v.hw) + z(v.hl) + (po ? 0 : z(v.ho)), away = z(v.aw) + z(v.al) + (po ? 0 : z(v.ao));
    if (n(v.hw) !== null && home + away !== gp) add('hw', 'warn', 'val.home_away_sum', [home + away, gp]);
    if (n(v.hw) !== null && z(v.hw) + z(v.aw) !== z(v.w)) add('hw', 'warn', 'val.home_away_wins', [z(v.hw) + z(v.aw), z(v.w)]);
    if (skaterGoals !== null && skaterGoals !== undefined && n(v.gf) !== null && skaterGoals !== z(v.gf)) add('gf', 'warn', 'val.team_goals_mismatch', [skaterGoals, z(v.gf)]);
    return out;
  }
  var api = { LINKED: LINKED, LAYOUT: LAYOUT, DER: DER, DLBL: DLBL, layout: layout, skaterGpCheck: skaterGpCheck, SKATERS_PER_GAME: SKATERS_PER_GAME, setGames: setGames, seasonGames: seasonGames, SK: SK, GK: GK, TM_RS: TM_RS, TM_PO: TM_PO, LBL: LBL, DECIMAL: DECIMAL, n: n, z: z, skaterDerived: skaterDerived, goalieDerived: goalieDerived, teamDerived: teamDerived,
              validateSkater: validateSkater, validateGoalie: validateGoalie, validateTeam: validateTeam };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTE = api;
})(typeof window !== 'undefined' ? window : this);

;/* Écran de saisie : grille clavier d'abord, statistiques calculées en direct, alertes, enregistrement local, export. */
(function (root) {
  var E = root.FTE || (typeof require !== 'undefined' ? require('./entry_core.js') : null);
  // format commun du SV% (connect/ft_stats.js, chargé avant ce fichier dans les pages)
  var FSTAT = root.FTSTATS || (typeof require !== 'undefined' ? require('../connect/ft_stats.js') : null);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STORE_KEY = 'ft_entries_v1';

  function makeEntryApp(DATA, store) {
    var skMap = {}, gkMap = {};
    DATA.skaters.forEach(function (p) { skMap[p.id] = p; }); DATA.goalies.forEach(function (p) { gkMap[p.id] = p; });
    var entries = { sk: {}, gk: {}, tm: {}, extra: { sk: {}, gk: {} }, removed: { sk: {}, gk: {} } };
    try { var saved = store && store.get(STORE_KEY); if (saved) entries = JSON.parse(saved); } catch (e) { /* stockage indisponible */ }
    if (!entries.removed) entries.removed = { sk: {}, gk: {} };
    if (!entries.order) entries.order = { sk: {}, gk: {} };
    var TEAMS = {}; (DATA.teams || []).forEach(function (tm) { TEAMS[tm.en] = tm; });
    var state = { lang: 'fr', tab: 'sk', mode: 0, season: DATA.franchise.current + 1, msg: '' };

    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s; }
    function nf(x, d) { return x == null ? '—' : x.toLocaleString(state.lang === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    function pct(x) { return x == null ? '—' : nf(x * 100, 1) + ' %'; }
    function mmss(x) { if (x == null) return '—'; var m = Math.floor(x), s = Math.round((x - m) * 60); if (s === 60) { m++; s = 0; } return m + ':' + (s < 10 ? '0' : '') + s; }
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    function key() { return state.season + '|' + state.mode; }
    function cols() { return state.tab === 'sk' ? E.SK : state.tab === 'gk' ? E.GK : (state.mode ? E.TM_PO : E.TM_RS); }
    function seasonLabel(y) { return state.mode === 0 ? y + '-' + String((y + 1) % 100).padStart(2, '0') : String(y + 1); }

    // ---- valeurs : saisies de l'utilisateur d'abord, sinon valeurs de la base ----
    var TM_ORDER = E.TM_RS;
    function baseRows(tab) { return (DATA[tab] || {})[key()] || []; }
    function baseRow(tab, pid) { var r = baseRows(tab).filter(function (x) { return x[0] === pid; })[0]; return r || null; }
    function value(tab, pid, c) {
      var ov = entries[tab][key()] && entries[tab][key()][pid] && entries[tab][key()][pid][c];
      if (ov !== undefined) return ov === '' ? null : ov;
      var r = baseRow(tab, pid), list = tab === 'sk' ? E.SK : E.GK, i = list.indexOf(c);
      return r && i >= 0 ? r[i + 1] : null;
    }
    function teamValue(c) {
      var ov = entries.tm[key()] && entries.tm[key()][c];
      if (ov !== undefined) return ov === '' ? null : ov;
      var r = (DATA.tm || {})[key()], i = TM_ORDER.indexOf(c);
      return r && i >= 0 ? r[i] : null;
    }
    function rowValues(pid) { var o = {}; cols().forEach(function (c) { o[c] = value(state.tab, pid, c); }); return o; }
    function teamValues() { var o = {}; cols().forEach(function (c) { o[c] = teamValue(c); }); return o; }

    // ---- liste des lignes de la grille ----
    var prefilledFlag = false;
    function pidsOf(tab, flag) {
      var map = tab === 'sk' ? skMap : gkMap, list = [];
      baseRows(tab).forEach(function (r) { list.push(r[0]); });
      var pre = list.length === 0;                                  // saison sans données : alignement présumé d'après les contrats
      if (pre) (DATA.roster[String(state.season)] || []).forEach(function (p) { if (map[p] && list.indexOf(p) < 0) list.push(p); });
      var ex = (entries.extra[tab] || {})[key()] || []; ex.forEach(function (p) { if (list.indexOf(p) < 0) list.push(p); });
      Object.keys(entries[tab][key()] || {}).forEach(function (p) { if (list.indexOf(+p) < 0) list.push(+p); });
      if (pre) list.sort(function (a, b) { return map[a].name.localeCompare(map[b].name); });
      if (flag) prefilledFlag = pre;
      var rm = removedList(tab); if (rm.length) list = list.filter(function (p) { return rm.indexOf(p) < 0; });
      var ord = ((entries.order || {})[tab] || {})[key()];       // ordre choisi à la main (glisser-déposer) : les joueurs ajoutés ensuite se placent à la fin
      if (ord && ord.length) { var pos = {}; ord.forEach(function (p, i) { pos[p] = i; }); var rest = list.filter(function (p) { return pos[p] === undefined; }); list = list.filter(function (p) { return pos[p] !== undefined; }).sort(function (a, b) { return pos[a] - pos[b]; }).concat(rest); }
      return list;
    }
    function pids() { return pidsOf(state.tab, true); }
    // Réordonner : le joueur de la ligne « from » est placé à la position « to » ; l'ordre est conservé sur cet appareil (affichage seulement, rien n'est envoyé)
    function hasOrder() { return state.tab !== 'tm' && !!(((entries.order || {})[state.tab] || {})[key()] || []).length; }
    function moveRow(from, to) {
      var tab = state.tab; if (tab === 'tm') return false;
      var ids = pids().slice(); if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return false;
      var p = ids.splice(from, 1)[0]; ids.splice(to, 0, p);
      entries.order = entries.order || { sk: {}, gk: {} }; entries.order[tab] = entries.order[tab] || {}; entries.order[tab][key()] = ids; persist(); return true;
    }
    function resetOrder() { if (state.tab === 'tm') return; if (entries.order && entries.order[state.tab]) delete entries.order[state.tab][key()]; persist(); }
    function removedList(tab) { return ((entries.removed || {})[tab] || {})[key()] || []; }
    function removedCount() { return state.tab === 'tm' ? 0 : removedList(state.tab).length; }
    function pidName(r) { var id = pids()[r], m = state.tab === 'sk' ? skMap : gkMap; return id !== undefined && m[id] ? m[id].name : ''; }
    // Retire un joueur de la saison affichée (alignement présumé ou ligne déjà enregistrée) ; la ligne enregistrée est supprimée de la base au prochain envoi
    function needsConfirmRemove(r) { var id = pids()[r]; if (id === undefined) return false; var e = entries[state.tab][key()]; return !!baseRow(state.tab, id) || !!(e && e[id] && Object.keys(e[id]).length); }
    function removePlayer(r) {
      var tab = state.tab; if (tab === 'tm') return false;
      var p = pids()[r]; if (p === undefined) return false;
      var k = key(); entries.removed = entries.removed || { sk: {}, gk: {} }; entries.removed[tab] = entries.removed[tab] || {};
      var rl = entries.removed[tab][k] = entries.removed[tab][k] || []; if (rl.indexOf(p) < 0) rl.push(p);
      if (entries[tab][k]) delete entries[tab][k][p];
      if (entries.extra[tab] && entries.extra[tab][k]) entries.extra[tab][k] = entries.extra[tab][k].filter(function (x) { return x !== p; });
      persist(); return true;
    }
    function restoreRemoved() { if (state.tab === 'tm') return; if (entries.removed && entries.removed[state.tab]) delete entries.removed[state.tab][key()]; persist(); }

    function persist() { try { store && store.set(STORE_KEY, JSON.stringify(entries)); state.msg = 'ok'; } catch (e) { state.msg = 'err'; } }
    function parse(c, raw) {
      var s = String(raw == null ? '' : raw).trim().replace(',', '.');
      if (s === '') return '';
      var m = /^(\d+):(\d{2})$/.exec(s);
      return { m: m, s: s };
    }
    // Enregistre une cellule. toi : « mm:ss » = temps par match, converti en minutes totales
    function setCell(r, c, raw) {
      var tab = state.tab, k = key(), ids = tab === 'tm' ? null : pids(), p = ids ? ids[r] : null;
      var pr = parse(c, raw), v;
      if (pr === '') v = '';
      else if (pr.m && (c === 'toi' || c === 'min')) { var gp = E.n(ids ? value(tab, p, 'gp') : null); v = gp ? Math.round((+pr.m[1] + pr.m[2] / 60) * gp * 10) / 10 : ''; }
      else if (isNaN(pr.s)) return false;
      else v = E.DECIMAL[c] ? Math.round(+pr.s * 10) / 10 : Math.round(+pr.s);
      if (tab === 'tm') { entries.tm[k] = entries.tm[k] || {}; entries.tm[k][c] = v; }
      else { entries[tab][k] = entries[tab][k] || {}; entries[tab][k][p] = entries[tab][k][p] || {}; entries[tab][k][p][c] = v; }
      persist(); return true;
    }
    function applyPaste(r, c, text) {
      var lines = String(text).replace(/\r/g, '').split('\n').filter(function (x) { return x.trim() !== ''; });
      var lay = E.layout(state.tab, state.mode === 1), c0 = lay.indexOf(c), ids = state.tab === 'tm' ? [0] : pids(), n = 0;
      lines.forEach(function (line, i) { line.split('\t').forEach(function (cell, j) { var col = lay[c0 + j]; if (c0 < 0 || col === undefined || col.charAt(0) === '@' || r + i >= ids.length) return; if (setCell(r + i, col, cell)) n++; }); });
      return n;
    }
    function underContract(id) { return ((DATA.contracted || {})[String(state.season)] || []).indexOf(id) >= 0; }
    // Joueurs proposés à l'ajout : sous contrat pendant la saison affichée et pas déjà dans la liste
    function addable() { var tab = state.tab; if (tab === 'tm') return []; var shown = pids(); return (tab === 'sk' ? DATA.skaters : DATA.goalies).filter(function (p) { return underContract(p.id) && shown.indexOf(p.id) < 0; }).map(function (p) { return p.name; }).sort(function (a, b) { return a.localeCompare(b, state.lang); }); }
    function addPlayer(name) {
      var tab = state.tab, list = tab === 'sk' ? DATA.skaters : DATA.goalies, p = list.filter(function (x) { return x.name.toLowerCase() === String(name).trim().toLowerCase(); })[0];
      if (!p) return false;
      if (!underContract(p.id)) { say('warn', 'entry.not_under_contract', [p.name, state.season + '-' + String((state.season + 1) % 100).padStart(2, '0')]); return false; }
      var rl = ((entries.removed || {})[tab] || {})[key()]; if (rl && rl.indexOf(p.id) >= 0) rl.splice(rl.indexOf(p.id), 1);     // un joueur retiré qu'on rajoute redevient visible
      entries.extra[tab][key()] = entries.extra[tab][key()] || []; if (entries.extra[tab][key()].indexOf(p.id) < 0 && pids().indexOf(p.id) < 0) entries.extra[tab][key()].push(p.id);
      persist(); return true;
    }
    function reset() { entries = { sk: {}, gk: {}, tm: {}, extra: { sk: {}, gk: {} }, removed: { sk: {}, gk: {} }, order: { sk: {}, gk: {} } }; persist(); }
    function countEntries() { var n = 0; ['sk', 'gk'].forEach(function (tb) { Object.keys(entries[tb]).forEach(function (k) { Object.keys(entries[tb][k]).forEach(function (p) { n += Object.keys(entries[tb][k][p]).length; }); }); }); Object.keys(entries.tm).forEach(function (k) { n += Object.keys(entries.tm[k]).length; }); return n; }

    // ---- calculs par ligne ----
    function skaterGoals() {
      var tot = 0, any = false;
      pidsOf('sk').forEach(function (p) { var g = E.n(value('sk', p, 'g')); if (g !== null) { tot += g; any = true; } });
      return any ? tot : null;
    }
    // 18 patineurs par match : somme des matchs joués attendue (saison régulière terminée = 82 matchs ; sinon matchs de l'équipe saisis)
    function gpCheck() {
      if (state.tab !== 'sk') return null;
      var po = state.mode === 1, tg = E.n(teamValue('gp')), games = !po && state.season <= DATA.franchise.current ? E.seasonGames() : tg, sum = 0;
      pidsOf('sk').forEach(function (p) { sum += E.z(value('sk', p, 'gp')); });
      return E.skaterGpCheck(sum, games);
    }
    function extraAlerts() { var c = gpCheck(); return c && !c.ok ? 1 : 0; }
    function alertCount() {
      var n = extraAlerts(), rowsN = state.tab === 'tm' ? 1 : pids().length;
      for (var r = 0; r < rowsN; r++) n += rowInfo(r).alerts.length;
      return n;
    }
    // Cote globale de début de saison : liée à la cote saisie dans « Début de saison » (table des cotes)
    function startOa(pid) { var m = (DATA.ratings || {})[String(state.season)], v = m ? m[String(pid)] : undefined; return v === undefined || v === null ? null : v; }
    function oaPair(pid, v) { var st = startOa(pid), en = E.n(v.oa); return [st === null ? '—' : nf(st), st !== null && en !== null ? nf((st + en) / 2, 1) : '—']; }
    function rowInfo(r) {
      var tab = state.tab, po = state.mode === 1, v, d, al;
      if (tab === 'sk') { var id = pids()[r]; v = rowValues(id); d = E.skaterDerived(v); al = E.validateSkater(v, po); return { derived: [nf(d.pts), pct(d.shotPct), mmss(d.toiPerGame), pct(d.foPct)].concat(oaPair(id, v)), alerts: al }; }
      if (tab === 'gk') { var gid = pids()[r]; v = rowValues(gid); d = E.goalieDerived(v); al = E.validateGoalie(v, po); return { derived: [nf(d.ga), FSTAT.fmtSvPct(d.svPct, state.lang), nf(d.gaa, 2), nf(d.pts)].concat(oaPair(gid, v)), alerts: al }; }
      v = teamValues(); d = E.teamDerived(v, po); al = E.validateTeam(v, po, skaterGoals());
      return { derived: [po ? '—' : nf(d.pts), po ? '—' : pct(d.ptsPct), pct(d.ppPct), pct(d.pkPct), nf(d.gfpg, 2), nf(d.gapg, 2)], alerts: al };
    }
    function derivedHeads() { return E.DER[state.tab].map(function (d) { return E.DLBL[d]; }); }

    function alertsText(al) { return al.map(function (a) { return t(E.LBL[a.c] || a.c, true) + ' : ' + fmt(a.k, a.p); }).join('\n'); }
    function cellClass(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.some(function (a) { return a.level === 'err'; }) ? ' err' : m.length ? ' warn' : ''; }
    function cellTitle(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.length ? ' title="' + esc(m.map(function (a) { return fmt(a.k, a.p); }).join(' · ')) + '"' : ''; }

    function inputCell(r, c, val, al) {
      var shown = val == null ? '' : (E.DECIMAL[c] ? String(val) : String(val));
      return '<td class="ci' + cellClass(al, c) + '"' + cellTitle(al, c) + '><input class="cell" inputmode="decimal" data-r="' + r + '" data-c="' + c + '" value="' + esc(shown) + '" aria-label="' + esc(t(E.LBL[c] || c)) + '"></td>';
    }
    var HOME = ['hw', 'hl', 'ho'];
    function groupRow(lay) {          // onglet Équipe : « DOMICILE » et « ÉTRANGER » au-dessus de leurs trois colonnes
      var h = '<tr class="grp"><th></th>', i = 0;
      while (i < lay.length) {
        var c = lay[i];
        if (c === 'hw' || c === 'aw') { var home = c === 'hw', n = 0; while (i + n < lay.length && ['hw', 'hl', 'ho', 'aw', 'al', 'ao'].indexOf(lay[i + n]) >= 0 && (HOME.indexOf(lay[i + n]) >= 0) === home) n++; h += '<th class="grp" colspan="' + n + '" title="' + esc(t(home ? 'stat.home' : 'stat.away')) + '">' + esc(t(home ? 'stat.home' : 'stat.away', true)) + '</th>'; i += n; }
        else { h += '<th></th>'; i++; }
      }
      return h + '<th></th></tr>';
    }
    function gridHTML() {
      var tab = state.tab, po = state.mode === 1, lay = E.layout(tab, po), DN = E.DER[tab], body = '', alertsTotal = extraAlerts();
      var rowsN = tab === 'tm' ? 1 : pids().length;
      for (var r = 0; r < rowsN; r++) {
        var info = rowInfo(r), v = tab === 'tm' ? teamValues() : rowValues(pids()[r]);
        alertsTotal += info.alerts.length;
        var plain = tab === 'tm' ? tn(DATA.franchise.name) : (tab === 'sk' ? skMap : gkMap)[pids()[r]].name;
        var pos = tab === 'sk' ? ' <span class="muted">' + esc(t('pc.' + skMap[pids()[r]].pos) === 'pc.' + skMap[pids()[r]].pos ? skMap[pids()[r]].pos : t('pc.' + skMap[pids()[r]].pos)) + '</span>' : '';
        var rm = tab === 'tm' ? '' : '<button type="button" class="rm" data-rm="' + r + '" title="' + esc(t('entry.remove_player')) + '" aria-label="' + esc(t('entry.remove_player') + ' : ' + plain) + '">×</button>';
        var dh = tab === 'tm' ? '' : '<span class="dh" draggable="true" data-drag="' + r + '" title="' + esc(t('entry.drag_hint')) + '" aria-label="' + esc(t('entry.drag_hint') + ' : ' + plain) + '">⠿</span>';
        body += '<tr data-row="' + r + '"><th class="pl"><div class="plin">' + dh + '<span class="nm">' + esc(plain) + pos + '</span>' + rm + '</div></th>' +
          lay.map(function (c) {
            if (c.charAt(0) === '@') { var di = DN.indexOf(c.slice(1)); return '<td class="num d" data-d="' + di + '">' + esc(info.derived[di]) + '</td>'; }
            return inputCell(r, c, v[c], info.alerts);
          }).join('') +
          '<td class="al" data-al="1" title="' + esc(alertsText(info.alerts)) + '">' + (info.alerts.length ? '<span class="badge' + (info.alerts.some(function (a) { return a.level === 'err'; }) ? ' bad' : '') + '">' + info.alerts.length + '</span>' : '') + '</td></tr>';
      }
      var head = '<tr class="cols' + (tab === 'tm' ? ' has-grp' : '') + '"><th>' + esc(t(tab === 'tm' ? 'entry.team_stats' : 'ui.player')) + '</th>' + lay.map(function (c) {
        if (c.charAt(0) === '@') { var k = E.DLBL[c.slice(1)]; return '<th class="num d" title="' + esc(t(k) + ' · ' + t(E.LINKED[c.slice(1)] ? 'entry.linked_tag' : 'entry.calc_tag')) + '">' + esc(t(k, true)) + '</th>'; }
        return '<th class="num" title="' + esc(t(E.LBL[c] || c)) + '">' + esc(t(E.LBL[c] || c, true)) + '</th>';
      }).join('') + '<th></th></tr>';
      var orderNote = hasOrder() ? '<p class="note muted">' + esc(t('entry.order_custom')) + ' <button type="button" class="linkbtn" data-act="order-reset">' + esc(t('entry.order_reset')) + '</button></p>' : '';
      var removedNote = removedCount() ? '<p class="note muted">' + esc(fmt('entry.removed_note', [removedCount()])) + ' <button type="button" class="linkbtn" data-act="restore">' + esc(t('entry.restore_removed')) + '</button></p>' : '';
      return { html: removedNote + orderNote + '<div class="scroll-top" id="scrolltop" role="presentation" aria-label="' + esc(t('entry.scroll_top')) + '"><div></div></div><div class="scroll" id="scrollmain"><table class="grid" id="grid"><thead>' + (tab === 'tm' ? groupRow(lay) : '') + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: alertsTotal };
    }
    // Encadré des définitions : toutes les abréviations de l'onglet affiché, dans l'ordre de l'écran
    function glossaryHTML() {
      var lay = E.layout(state.tab, state.mode === 1), seen = {}, items = '', GROUPED = ['hw', 'hl', 'ho', 'aw', 'al', 'ao'];
      lay.forEach(function (c) {
        if (GROUPED.indexOf(c) >= 0) return;
        var derived = c.charAt(0) === '@', k = derived ? E.DLBL[c.slice(1)] : E.LBL[c];
        if (!k || seen[k]) return; seen[k] = 1;
        items += '<div class="gl"><dt>' + esc(t(k, true)) + '</dt><dd>' + esc(t(k)) + (derived ? ' <span class="tag">' + esc(t(E.LINKED[c.slice(1)] ? 'entry.linked_tag' : 'entry.calc_tag')) + '</span>' : '') + '</dd></div>';
      });
      if (state.tab === 'tm') ['stat.home', 'stat.away'].forEach(function (k) { items += '<div class="gl"><dt>' + esc(t(k, true)) + '</dt><dd>' + esc(t(k)) + '</dd></div>'; });
      return '<section class="card wide glossary"><h3>' + esc(t('entry.glossary')) + '</h3><dl class="gl-list">' + items + '</dl></section>';
    }
    function totalsHTML() {
      if (state.tab === 'tm') return '';
      var tab = state.tab, ids = pids(), sums = {}, c;
      var show = tab === 'sk' ? ['gp', 'g', 'a', 'pm'] : ['gp', 'w', 'l', 'otl', 'so'];
      show.forEach(function (c2) { sums[c2] = 0; });
      ids.forEach(function (p) { show.forEach(function (c2) { sums[c2] += E.z(value(tab, p, c2)); }); });
      var h = '<span><b>' + esc(t('entry.totals')) + '</b></span>' + show.map(function (c2) { return '<span>' + esc(t(E.LBL[c2], true)) + ' <b>' + nf(sums[c2]) + '</b></span>'; }).join('');
      if (tab === 'sk') {
        var tg = E.n(teamValue('gf')), sg = skaterGoals();
        h += '<span class="' + (tg !== null && sg !== tg ? 'bad' : '') + '">' + esc(t('entry.goals_check')) + ' <b>' + nf(sg) + ' / ' + nf(tg) + '</b></span>';
        var gc = gpCheck(); if (gc) h += '<span class="' + (gc.ok ? '' : 'bad') + '" title="' + esc(fmt('entry.gp_check_hint', [gc.games, nf(gc.expected)])) + '">' + esc(t('entry.gp_check')) + ' <b>' + nf(gc.sum) + ' / ' + nf(gc.expected) + '</b></span>';
      }
      return h;
    }

    function view() {
      var g = gridHTML(), seasons = [];
      for (var y = DATA.franchise.first; y <= DATA.franchise.current + 1; y++) seasons.push(y);
      var opts = seasons.map(function (y) { return '<option value="' + y + '"' + (y === state.season ? ' selected' : '') + '>' + esc(seasonLabel(y)) + '</option>'; }).join('');
      var plist = addable().map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
      var tabs = ['sk', 'gk', 'tm'].map(function (k) { return '<button data-tab="' + k + '" aria-pressed="' + (state.tab === k) + '">' + esc(t('entry.tab_' + k)) + '</button>'; }).join('');
      var moments = '<button data-mode="0" aria-pressed="' + (state.mode === 0) + '">' + esc(t('entry.moment_rs')) + '</button><button data-mode="1" aria-pressed="' + (state.mode === 1) + '">' + esc(t('entry.moment_po')) + '</button>';
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t('entry.title')) + '</div></div></div>' +
        '<div class="ctl"><a class="navlink" href="preseason.html">' + esc(t('nav.pre')) + '</a><a class="navlink" href="events.html">' + esc(t('ev.events_link')) + '</a><a class="navlink" href="offseason.html">' + esc(t('nav.off')) + '</a><div class="seg" role="group" aria-label="' + esc(t('ui.language')) + '"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>' +
        '<main class="entry">' + syncPanel() + '<section class="pick">' +
        '<div class="slicer"><span class="lbl">' + esc(t('entry.type')) + '</span><div class="seg page" role="group" aria-label="' + esc(t('entry.type')) + '">' + tabs + '</div></div>' +
        '<div class="slicer"><span class="lbl">' + esc(t('entry.period')) + '</span><div class="seg page" role="group" aria-label="' + esc(t('entry.period')) + '">' + moments + '</div></div>' +
        '<label>' + esc(t('ui.season')) + '<select id="sn">' + opts + '</select></label>' +
        (state.tab === 'tm' ? '' : '<label>' + esc(t('entry.add_player')) + '<input id="addp" list="plist" autocomplete="off"></label><datalist id="plist">' + plist + '</datalist>') +
        '<div class="acts"><button class="btn" data-act="csv">' + esc(t('entry.export_csv')) + '</button><button class="btn two" data-act="json"><span class="b1">' + esc(t('entry.export_json')) + '</span><span class="b2">' + esc(t('entry.export_json_sub')) + '</span></button><button class="btn ghost" data-act="reset">' + esc(t('entry.reset')) + '</button></div></section>' +
        '<section class="card wide">' + (prefilledFlag && state.tab !== 'tm' ? '<p class="note">' + esc(t('entry.prefilled')) + '</p>' : '') + '<p class="note muted">' + esc(t('entry.hint')) + '</p>' + g.html +
        '<div class="foot" id="totals">' + totalsHTML() + '</div><div class="foot" id="status"><span class="' + (g.alerts ? 'bad' : 'ok') + '">' + (g.alerts ? g.alerts + ' ' + esc(t('entry.alerts')) : esc(t('entry.no_alerts'))) + '</span><span class="muted">' + esc(t('entry.saved')) + ' · ' + countEntries() + ' ' + esc(t('entry.entries')) + '</span></div>' +
        '<p class="note muted">' + esc(t('entry.local_note')) + '</p></section>' + glossaryHTML() + '</main>';
    }


    // ---- synchronisation avec Supabase ----
    E.setGames(DATA.franchise.games || 82);
    var sync = { user: null, busy: false, msg: '', level: '' };
    var SK_DB = ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'ppp', 'shg', 'shp', 'toi_minutes', 'fow', 'fot', 'hits', 'blocks', 'giveaways', 'takeaways', 'oa_end'];
    var GK_DB = ['gp', 'w', 'l', 'otl', 'so', 'saves', 'shots_against', 'minutes', 'pim', 'g', 'a', 'oa_end'];
    var TM_DB_RS = { gp: 'gp', w: 'w', l: 'l', otl: 'otl', rw: 'rw', row: 'row_', gf: 'gf', ga: 'ga', ppg: 'ppg', tpp: 'pp_opportunities', shga: 'shga', ppga: 'ppga', tsh: 'times_shorthanded', shgf: 'shgf', hw: 'home_w', hl: 'home_l', ho: 'home_otl', aw: 'away_w', al: 'away_l', ao: 'away_otl' };
    var NOT_NULL = { gp: 1, g: 1, a: 1, plus_minus: 1, pim: 1, shots: 1, gwg: 1, ppg: 1, ppp: 1, shg: 1, shp: 1, w: 1, l: 1, otl: 1, so: 1 };
    function dbVal(db, v) { return v == null || v === '' ? (NOT_NULL[db] ? 0 : null) : v; }
    // Lignes à envoyer pour l'onglet courant : seulement celles qui ont des saisies, complétées par les valeurs de la base
    function pushPayload(franchiseId) {
      var tab = state.tab, gt = state.mode ? 'PO' : 'RS', out = { errors: 0, rows: [], table: null, conflict: null, deletes: [] };
      if (tab === 'sk' || tab === 'gk') {
        var list = tab === 'sk' ? E.SK : E.GK, dbc = tab === 'sk' ? SK_DB : GK_DB, ids = Object.keys(entries[tab][key()] || {});
        out.table = tab === 'sk' ? 'skater_season_stats' : 'goalie_season_stats'; out.conflict = 'franchise_id,player_id,season,game_type';
        ids.forEach(function (p) {
          var v = {}; list.forEach(function (c) { v[c] = value(tab, +p, c); });
          var al = tab === 'sk' ? E.validateSkater(v, state.mode === 1) : E.validateGoalie(v, state.mode === 1); out.errors += al.filter(function (a) { return a.level === 'err'; }).length;
          var row = { franchise_id: franchiseId, player_id: +p, season: state.season, game_type: gt, origin: 'franchise' }; list.forEach(function (c, i) { row[dbc[i]] = dbVal(dbc[i], v[c]); });
          var os = startOa(+p); if (os !== null) row.oa_start = os;
          if (tab === 'sk') { row.position = skMap[+p] ? skMap[+p].pos : null; } out.rows.push(row);
        });
        if (tab === 'sk') out.rows.forEach(function (r) { delete r.position; });
        removedList(tab).forEach(function (p) { if (baseRow(tab, p)) out.deletes.push({ table: out.table, match: { player_id: +p, season: state.season, game_type: gt, origin: 'franchise' } }); });   // franchise_id imposé par ft_apply_batch
      } else {
        var tv = teamValues(), has = Object.keys(entries.tm[key()] || {}).length > 0;
        out.table = 'team_season_stats'; out.conflict = 'franchise_id,season,game_type';
        if (has) {
          var al2 = E.validateTeam(tv, state.mode === 1, skaterGoals()); out.errors += al2.filter(function (a) { return a.level === 'err'; }).length;
          var row2 = { franchise_id: franchiseId, season: state.season, game_type: gt };
          cols().forEach(function (c) { var d = TM_DB_RS[c]; if (d) row2[d] = dbVal(d, tv[c]); });
          if (state.mode === 1) row2.otl = 0; out.rows.push(row2);
        }
      }
      return out;
    }
    function selectQuery(tab) {
      var gt = state.mode ? 'PO' : 'RS', f = 'season=eq.' + state.season + '&game_type=eq.' + gt;
      if (tab === 'sk') return { table: 'skater_season_stats', q: 'select=player_id,' + SK_DB.join(',') + '&origin=eq.franchise&' + f + '&order=player_id' };
      if (tab === 'gk') return { table: 'goalie_season_stats', q: 'select=player_id,' + GK_DB.join(',') + '&origin=eq.franchise&' + f + '&order=player_id' };
      return { table: 'team_season_stats', q: 'select=' + TM_ORDER.map(function (c) { return TM_DB_RS[c]; }).join(',') + '&' + f };
    }
    // Remplace la « base » de l'écran par les lignes reçues de Supabase et efface les saisies locales correspondantes
    function applyPulled(tab, rowsIn) {
      var k = key(), dbc = tab === 'sk' ? SK_DB : GK_DB;
      if (tab === 'tm') { var r = rowsIn[0]; if (r) { DATA.tm = DATA.tm || {}; DATA.tm[k] = TM_ORDER.map(function (c) { var v = r[TM_DB_RS[c]]; return v === undefined ? null : v; }); } else if (DATA.tm) delete DATA.tm[k]; delete entries.tm[k]; }
      else { DATA[tab] = DATA[tab] || {}; DATA[tab][k] = rowsIn.map(function (r) { return [r.player_id].concat(dbc.map(function (c) { return r[c] === undefined ? null : r[c]; })); }); delete entries[tab][k]; if (entries.extra[tab]) delete entries.extra[tab][k]; }
      persist(); return rowsIn.length;
    }
    function setPlayers(list) {   // list : [{id, name, grp}] depuis la table player (full_name, position_group)
      skMap = {}; gkMap = {}; DATA.skaters = []; DATA.goalies = [];
      list.forEach(function (p) { var o = { id: p.id, name: p.name, pos: p.grp }; if (p.grp === 'G') { gkMap[p.id] = o; DATA.goalies.push(o); } else { skMap[p.id] = o; DATA.skaters.push(o); } });
    }


    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    async function doLogin(client, email, pw) {
      sync.busy = true; try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } sync.busy = false;
      return !!sync.user;
    }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; }
    async function doPull(client, quiet) {
      sync.busy = true;
      try {
        var pl = await client.select('player', 'select=id,full_name,position_group&origin=eq.franchise&order=full_name'); setPlayers(pl.map(function (p) { return { id: p.id, name: p.full_name, grp: p.position_group }; }));
        var sq = selectQuery(state.tab), rows = await client.select(sq.table, sq.q), n = applyPulled(state.tab, rows);
        if (!quiet) say('ok', 'sb.pulled', [n]);
      } catch (e) { say('bad', 'sb.failed', [e.message]); }
      sync.busy = false;
    }
    async function doPush(client) {
      sync.busy = true;
      try {
        var fid = await client.ensureFranchise();
        if (fid == null) { say('bad', 'sb.no_franchise'); sync.busy = false; return false; }
        var pl = pushPayload(fid);
        if (!pl.rows.length && !pl.deletes.length) { say('warn', 'sb.nothing'); sync.busy = false; return false; }
        if (pl.errors) { say('bad', 'sb.errors_block'); sync.busy = false; return false; }
        // un seul appel transactionnel : tout l'envoi réussit ou rien n'est écrit (ft_apply_batch regroupe lui-même les lignes par liste de colonnes)
        var ops = []; if (pl.rows.length) ops.push({ op: 'upsert', table: pl.table, conflict: pl.conflict, rows: pl.rows });
        pl.deletes.forEach(function (d) { ops.push({ op: 'delete', table: d.table, match: d.match }); });
        await client.rpc('ft_apply_batch', { p_franchise_id: fid, p_ops: ops });
        await doPull(client, true); say('ok', 'sb.pushed', [pl.rows.length + pl.deletes.length]);
        sync.busy = false; return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); sync.busy = false; return false; }
    }
    function syncPanel() {
      var h = '<section class="card sb"><h3>' + esc(t('sb.title')) + '</h3>';
      if (sync.user) h += '<p class="ok">' + esc(t('sb.connected')) + ' : ' + esc(sync.user) + '</p><div class="acts left"><button class="btn" data-sb="push"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.push')) + '</button><button class="btn" data-sb="pull"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.pull')) + '</button><button class="btn ghost" data-sb="logout">' + esc(t('sb.logout')) + '</button></div>';
      else h += '<p class="muted">' + esc(t('sb.not_connected')) + '</p><div class="acts left"><input id="sb-email" type="email" placeholder="' + esc(t('sb.email')) + '" autocomplete="username"><input id="sb-pw" type="password" placeholder="' + esc(t('sb.password')) + '" autocomplete="current-password"><button class="btn" data-sb="login"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.login')) + '</button></div>';
      return h + (sync.busy ? '<p class="muted">' + esc(t('sb.busy')) + '</p>' : sync.msg ? '<p class="' + sync.level + '">' + esc(sync.msg) + '</p>' : '') + '</section>';
    }

    // ---- export ----
    function csvRows() {
      var tab = state.tab, k = key(), out = [], list = tab === 'sk' ? E.SK : E.GK;
      var dbc = tab === 'sk' ? ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'ppp', 'shg', 'shp', 'toi_minutes', 'fow', 'fot', 'hits', 'blocks', 'giveaways', 'takeaways', 'oa_end']
                              : ['gp', 'w', 'l', 'otl', 'so', 'saves', 'shots_against', 'minutes', 'pim', 'g', 'a', 'oa_end'];
      var head = ['franchise_id', 'player_id', 'season', 'game_type', 'origin'].concat(dbc);
      out.push(head.join(','));
      Object.keys(entries[tab][k] || {}).forEach(function (p) {
        var vals = list.map(function (c) { var v = value(tab, +p, c); return v == null ? '' : v; });
        out.push([1, p, state.season, state.mode ? 'PO' : 'RS', 'franchise'].concat(vals).join(','));
      });
      return out.join('\r\n') + '\r\n';
    }
    function jsonExport() { return JSON.stringify({ version: 1, exported_season_filter: null, entries: entries }, null, 1); }

    return { doLogin: doLogin, doLogout: doLogout, doPull: doPull, doPush: doPush, sync: sync, pushPayload: pushPayload, selectQuery: selectQuery, applyPulled: applyPulled, setPlayers: setPlayers, state: state, entries: function () { return entries; }, view: view, t: t, setCell: setCell, applyPaste: applyPaste, addPlayer: addPlayer, addable: addable, underContract: underContract, moveRow: moveRow, resetOrder: resetOrder, hasOrder: hasOrder, reset: reset, rowInfo: rowInfo, totalsHTML: totalsHTML,
             pids: pids, startOa: startOa, alertCount: alertCount, removePlayer: removePlayer, restoreRemoved: restoreRemoved, needsConfirmRemove: needsConfirmRemove, removedCount: removedCount, pidName: pidName, gpCheck: gpCheck, glossaryHTML: glossaryHTML, fmt: fmt, csvRows: csvRows, jsonExport: jsonExport, countEntries: countEntries, value: value, cols: cols, alertsText: alertsText, derivedHeads: derivedHeads, seasonLabel: seasonLabel };
  }

  var api = { makeEntryApp: makeEntryApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTEUI = api;

  // ---------- Montage dans la page ----------
  if (typeof document !== 'undefined') {
    var DATA = JSON.parse(document.getElementById('data').textContent);
    var ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeEntryApp(d, st || ls); }, assemble: FTLIVE.assembleEntry });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    function draw(focus) { host.draw(focus ? 'input.cell[data-r="' + focus[0] + '"][data-c="' + focus[1] + '"]' : null); }
    function patch(r) {
      var tr = rootEl.querySelector('tr[data-row="' + r + '"]'); if (!tr) return;
      var info = app.rowInfo(r);
      tr.querySelectorAll('td.d').forEach(function (td) { td.textContent = info.derived[+td.dataset.d]; });
      tr.querySelectorAll('td.ci').forEach(function (td) {
        var c = td.querySelector('input').dataset.c, m = info.alerts.filter(function (a) { return a.c === c; });
        td.className = 'ci' + (m.some(function (a) { return a.level === 'err'; }) ? ' err' : m.length ? ' warn' : ''); td.title = m.length ? app.alertsText(m) : '';
      });
      var al = tr.querySelector('td.al'); al.title = app.alertsText(info.alerts); al.innerHTML = info.alerts.length ? '<span class="badge' + (info.alerts.some(function (a) { return a.level === 'err'; }) ? ' bad' : '') + '">' + info.alerts.length + '</span>' : '';
      var tot = rootEl.querySelector('#totals'); if (tot) tot.innerHTML = app.totalsHTML();
      var stt = rootEl.querySelector('#status'); if (stt) { var n = app.alertCount(); stt.firstChild.className = n ? 'bad' : 'ok'; stt.firstChild.textContent = n ? n + ' ' + app.t('entry.alerts') : app.t('entry.no_alerts'); }
    }
    function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    rootEl.addEventListener('change', function (e) {
      var el = e.target;
      if (el.classList.contains('cell')) { var r = +el.dataset.r; app.setCell(r, el.dataset.c, el.value); patch(r); }
      else if (el.id === 'sn') { app.state.season = +el.value; draw(); }
      else if (el.id === 'addp') { if (app.addPlayer(el.value)) draw(); }
    });
    rootEl.addEventListener('keydown', function (e) {
      var el = e.target; if (!el.classList.contains('cell')) return;
      var r = +el.dataset.r, c = el.dataset.c, move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!move) return; e.preventDefault();
      if (e.altKey && app.moveRow) { app.setCell(r, c, el.value); if (app.moveRow(r, r + move)) draw([r + move, c]); return; }       // Alt + flèche : déplace le joueur d'une ligne
      app.setCell(r, c, el.value); var next = Math.max(0, Math.min(rootEl.querySelectorAll('tr[data-row]').length - 1, r + move)); draw([next, c]);
    });
    rootEl.addEventListener('paste', function (e) {
      var el = e.target; if (!el.classList.contains('cell')) return;
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return;
      e.preventDefault(); app.applyPaste(+el.dataset.r, el.dataset.c, text); draw([+el.dataset.r, el.dataset.c]);
    });
    // Glisser-déposer : la poignée ⠿ de la cellule du nom déplace le joueur ; Alt + flèche haut / bas fait la même chose au clavier
    var dragFrom = null;
    function rowOf(el) { return el && el.closest ? el.closest('tr[data-row]') : null; }
    rootEl.addEventListener('dragstart', function (e) { var h = e.target.closest && e.target.closest('[data-drag]'); if (!h) return; dragFrom = +h.dataset.drag; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (x) { /* ignore */ } var tr = rowOf(h); if (tr) tr.classList.add('dragging'); });
    rootEl.addEventListener('dragover', function (e) { if (dragFrom === null) return; var tr = rowOf(e.target); if (!tr) return; e.preventDefault(); rootEl.querySelectorAll('tr.drop-before,tr.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); }); var r = +tr.dataset.row; tr.classList.add(r < dragFrom ? 'drop-before' : 'drop-after'); });
    rootEl.addEventListener('drop', function (e) { if (dragFrom === null) return; var tr = rowOf(e.target), app = host.app(); e.preventDefault(); if (tr && app && app.moveRow(dragFrom, +tr.dataset.row)) { dragFrom = null; draw(); } else dragFrom = null; });
    rootEl.addEventListener('dragend', function () { dragFrom = null; rootEl.querySelectorAll('tr.dragging,tr.drop-before,tr.drop-after').forEach(function (x) { x.classList.remove('dragging', 'drop-before', 'drop-after'); }); });
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rm !== undefined) { var rr = +b.dataset.rm; if (app.needsConfirmRemove(rr) && !window.confirm(app.fmt('entry.confirm_remove', [app.pidName(rr)]))) return; app.removePlayer(rr); }
      else if (b.dataset.act === 'restore') { app.restoreRemoved(); }
      else if (b.dataset.act === 'order-reset') { app.resetOrder(); }
      else if (b.dataset.lang) app.state.lang = b.dataset.lang; else if (b.dataset.mode) app.state.mode = +b.dataset.mode; else if (b.dataset.tab) app.state.tab = b.dataset.tab;
      else if (b.dataset.act === 'csv') { download('saisie_' + app.state.tab + '_' + app.state.season + '_' + (app.state.mode ? 'PO' : 'RS') + '.csv', app.csvRows(), 'text/csv'); return; }
      else if (b.dataset.act === 'json') { download('saisies.json', app.jsonExport(), 'application/json'); return; }
      else if (b.dataset.act === 'reset') { if (window.confirm(app.t('entry.confirm_reset'))) app.reset(); else return; }
      else return;
      draw();
    });
    // Barre de défilement des colonnes au-dessus de la grille, synchronisée avec celle du bas
    var syncing = false;
    function syncScroll() {
      var top = rootEl.querySelector('#scrolltop'), main = rootEl.querySelector('#scrollmain'), tbl = rootEl.querySelector('#grid'); if (!top || !main || !tbl) return;
      top.firstChild.style.width = tbl.scrollWidth + 'px'; top.style.display = tbl.scrollWidth > main.clientWidth + 1 ? '' : 'none';
      if (!top.dataset.wired) {
        top.dataset.wired = '1';
        top.addEventListener('scroll', function () { if (syncing) { syncing = false; return; } syncing = true; main.scrollLeft = top.scrollLeft; });
        main.addEventListener('scroll', function () { if (syncing) { syncing = false; return; } syncing = true; top.scrollLeft = main.scrollLeft; });
      }
      top.scrollLeft = main.scrollLeft;
    }
    if (typeof MutationObserver !== 'undefined') new MutationObserver(function () { syncScroll(); }).observe(rootEl, { childList: true, subtree: true });
    if (typeof window.addEventListener === 'function') window.addEventListener('resize', syncScroll);
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
