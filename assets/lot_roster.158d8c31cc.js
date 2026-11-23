/* Événements de la saison : règles de validation et valeurs calculées (sans interface, testable avec Node). */
(function (root) {
  var HO = root.FTHOMO || (typeof require !== 'undefined' ? require('../connect/homonym_ui.js') : null);   // joueurs homonymes
  var POS = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
  // types de joueur par groupe de poste (mêmes listes que l'entrée des joueurs repêchés) et clé de libellé
  var PTYPES = { F: ['Power Forward', '2 Way Forward', 'Grinder', 'Sniper', 'Playmaker', 'Enforcer'], D: ['Enforcer', '2 Way Defenseman', 'Offensive Defenseman', 'Defensive Defenseman'], G: ['Butterfly', 'Hybrid', 'Stand-up'] };
  var PTSLUG = { 'Power Forward': 'power_forward', '2 Way Forward': 'two_way_forward', 'Grinder': 'grinder', 'Sniper': 'sniper', 'Playmaker': 'playmaker', 'Enforcer': 'enforcer', '2 Way Defenseman': 'two_way_defenseman', 'Offensive Defenseman': 'offensive_defenseman', 'Defensive Defenseman': 'defensive_defenseman', 'Butterfly': 'butterfly', 'Hybrid': 'hybrid', 'Stand-up': 'stand_up' };
  var GROUP_OF = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' };
  // poste secondaire : un attaquant ne peut être que C, LW ou RW (autre que son poste), un défenseur que LD ou RD ; un gardien n'en a pas
  function secondaryOptions(pos) { var g = GROUP_OF[pos]; if (!g || g === 'G') return []; return POS.filter(function (x) { return GROUP_OF[x] === g && x !== pos; }); }
  // acquis par (calculé) : repêchage si l'information de repêchage est connue, sinon l'événement lié, sinon début de franchise ou joueur autonome
  function viaFrom(r, evt, firstDate) { if (r.dyear || r.dround || r.dpick || r.dteam) return 'draft'; if (evt) return evt; return isDate(r.date) && firstDate && r.date <= firstDate ? 'start' : 'free_agent'; }
  var MOVES = ['injury', 'call_up', 'send_down', 'waiver_claim'];
  var EVENTS = ['entry_level', 'rfa_extension', 'ufa_extension', 'free_agent', 'acquired', 'traded_for', 'buy_out', 'release'];
  var NO_TERMS = ['buy_out', 'release'];                     // rachat et libération : pas de type, de nombre d'années, de première saison, de salaire ni de clause
  var ACTIVE_ONLY = ['rfa_extension', 'ufa_extension', 'buy_out', 'release'];   // événements qui visent un joueur déjà avec l'équipe
  var NTC_N = [4, 8, 10, 12, 16, 20, 24, 29];
  // clauses possibles pour chaque année d'un contrat à un volet : NMC, NTC, M-NTC-n, et les combinaisons NMC | M-NTC-n
  var CLAUSES = ['NMC', 'NTC'].concat(NTC_N.map(function (n) { return 'M-NTC-' + n; })).concat(NTC_N.map(function (n) { return 'NMC | M-NTC-' + n; }));
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
  function seasonOf(d) { var y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 7 ? y : y - 1; }
  function num(v) { return v === null || v === undefined || v === '' || isNaN(v) ? null : +v; }
  function A(c, level, k, p) { return { c: c, level: level, k: k, p: p || [] }; }
  function addDays(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

  // ---- mouvements et blessures ----
  // joueurs actifs avec l'équipe à une date : l'arrivée est avant ou le jour même, le départ après ou le jour même (ou aucun départ)
  function activeAt(stints, pid, d) { return (stints || []).some(function (x) { return x[0] === pid && x[1] <= d && (x[2] == null || x[2] >= d); }); }
  // matchs manqués sur blessure : matchs du calendrier strictement après la date de blessure et strictement avant la date de retour
  // (réglé sur les 362 blessures déjà enregistrées : concordance complète)
  function missedGames(dates, inj, ret) { if (!dates || !isDate(inj) || !isDate(ret) || ret < inj) return null; return dates.filter(function (d) { return d > inj && d < ret; }).length; }
  function validateMove(r, ctx) {
    var out = [];
    if (!isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (!r.pid) out.push(A('pid', 'err', 'val.player_missing'));
    if (!r.move) out.push(A('move', 'err', 'val.required'));
    if (r.pid && isDate(r.date) && ctx.stints && !activeAt(ctx.stints, r.pid, r.date)) out.push(A('pid', 'err', 'val.player_not_active'));
    if (r.move !== 'injury' && r.ret) out.push(A('ret', 'err', 'val.ret_only_injury'));
    if (r.move !== 'send_down' && (r.claimed === 'yes' || r.claimed === 1 || r.claimed === '1')) out.push(A('claimed', 'err', 'val.claimed_only_send_down'));
    if (r.move === 'injury') {
      if (r.ret && !isDate(r.ret)) out.push(A('ret', 'err', 'val.date_format'));
      else if (r.ret && isDate(r.date) && r.ret < r.date) out.push(A('ret', 'err', 'val.return_before_date'));
      else if (r.ret && isDate(r.date) && r.ret === r.date) out.push(A('ret', 'warn', 'val.return_same_day'));
      if (!r.ret) out.push(A('ret', 'warn', 'val.return_missing'));
      if (ctx.injuriesOf && r.pid && isDate(r.date)) { var end = isDate(r.ret) && r.ret >= r.date ? r.ret : '9999-12-31'; if (ctx.injuriesOf(r.pid, r.id).some(function (o) { return o.date <= end && (o.ret || '9999-12-31') >= r.date; })) out.push(A('date', 'err', 'val.injury_overlap')); }
      // matchs manqués : calculés d'après le calendrier de la saison
      if (isDate(r.date) && ctx.scheduleOf) {
        var sc = ctx.scheduleOf(seasonOf(r.date)), n = ctx.gamesPerSeason || 82;
        if (!sc || !sc.length) out.push(A('games', 'warn', 'val.schedule_missing'));
        else if (sc.length < n) out.push(A('games', 'warn', 'val.schedule_incomplete', [sc.length, n]));
        else if (isDate(r.ret) && r.ret > sc[sc.length - 1]) out.push(A('games', 'warn', 'val.return_after_season'));
        if (isDate(r.ret) && isDate(r.date) && seasonOf(r.ret) !== seasonOf(r.date)) out.push(A('ret', 'warn', 'val.return_other_season'));
      }
    }
    if (isDate(r.date) && ctx.currentSeason !== undefined && Math.abs(seasonOf(r.date) - ctx.currentSeason) > 1) out.push(A('date', 'warn', 'val.date_far'));
    return out;
  }

  // ---- contrats ----
  function contractDerived(r) {
    var first = num(r.first), years = num(r.years);
    if (first === null || years === null || years < 1) return { last: null, end: null };
    return { last: first + years - 1, end: (first + years) + '-06-30' };
  }
  function validateContract(r, ctx) {
    var out = [], first = num(r.first), years = num(r.years), aav = num(r.aav), terms = NO_TERMS.indexOf(r.event) < 0;
    if (!isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (!r.pid) out.push(A('pid', 'err', 'val.player_missing'));
    if (!r.event) out.push(A('event', 'err', 'val.required'));
    // joueur déjà avec l'équipe à la date : prolongations, rachat et libération
    if (r.pid && isDate(r.date) && ACTIVE_ONLY.indexOf(r.event) >= 0 && ctx.stints && !activeAt(ctx.stints, r.pid, r.date)) out.push(A('pid', 'err', 'val.player_not_active'));
    if (!terms) {
      ['ctype', 'years', 'first', 'aav'].forEach(function (c) { if (r[c] !== '' && r[c] != null) out.push(A(c, 'err', 'val.not_applicable')); });
      return out;
    }
    if (!r.ctype) out.push(A('ctype', 'err', 'val.required'));
    if (years === null || years < 1 || years > 8) out.push(A('years', 'err', 'val.years_range'));
    else if (r.event === 'entry_level' && years > 3) out.push(A('years', 'warn', 'val.elc_years'));
    if (first === null) out.push(A('first', 'err', 'val.required'));
    if (aav === null || aav <= 0) out.push(A('aav', 'err', 'val.aav_missing'));
    // clauses : seulement pour un contrat à un volet, une par année du contrat (jusqu'à 8)
    for (var k = 1; k <= 8; k++) { var cl = r['cl' + k]; if (cl === '' || cl == null) continue;
      if (r.ctype !== 'one_way') out.push(A('cl' + k, 'err', 'val.clause_one_way'));
      else if (years !== null && k > years) out.push(A('cl' + k, 'err', 'val.clause_beyond_years'));
      else if (CLAUSES.indexOf(cl) < 0) out.push(A('cl' + k, 'err', 'val.clause_unknown')); }
    if (first !== null && aav !== null) {
      var known = ctx.cap[first] ? first : Object.keys(ctx.cap).map(Number).filter(function (y) { return y < first; }).sort(function (a, b) { return b - a; })[0];
      var c = known !== undefined ? ctx.cap[known] : null, lvl = known === first ? 'err' : 'warn';   // saison à venir : plafond pas encore saisi, on compare au dernier connu
      if (c && c[2] && aav < c[2]) out.push(A('aav', lvl, 'val.aav_below_min', [c[2]]));
      if (c && c[3] && aav > c[3]) out.push(A('aav', lvl, 'val.aav_above_max', [c[3]]));
    }
    if (first !== null && isDate(r.date)) {
      var diff = first - seasonOf(r.date), maxd = 1 + (r.event === 'entry_level' ? 1 : 0);
      if (diff < 0 || diff > maxd) out.push(A('first', 'warn', 'val.first_season_vs_date', [diff]));
    }
    if (r.pid && isDate(r.date) && first !== null && ctx.contractsOf) {
      var others = ctx.contractsOf(r.pid, r.id), start = first + '-07-01';
      var overlap = others.filter(function (o) { return o.end && o.end >= addDays(start, 1) && o.start && o.start < start; });
      if (r.event.indexOf('extension') < 0 && r.event && overlap.length && r.event !== 'traded_for' && r.event !== 'acquired') out.push(A('pid', 'warn', 'val.contract_overlap'));
    }
    return out;
  }
  // offres hostiles : compensation et jusqu'à 4 choix (équipe, année, ronde)
  function validateOffer(r, ctx) {
    var out = [];
    if (!isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (!r.pid) out.push(A('pid', 'err', 'val.player_missing'));
    if (!r.event) out.push(A('event', 'err', 'val.required'));
    if (r.pid && isDate(r.date) && r.event === 'unmatched' && ctx.stints && !activeAt(ctx.stints, r.pid, r.date)) out.push(A('pid', 'err', 'val.player_not_active'));
    if (!r.comp) out.push(A('comp', 'err', 'val.required'));
    var any = false, seen = {};
    for (var k = 1; k <= 4; k++) {
      var t = r['p' + k + 't'], y = r['p' + k + 'y'], rd = r['p' + k + 'r'], has = [t, y, rd].some(function (v) { return v !== '' && v != null; });
      if (!has) continue; any = true;
      if (r.comp !== 'yes') { out.push(A('p' + k + 't', 'err', 'val.picks_need_comp')); continue; }
      if (!t) out.push(A('p' + k + 't', 'err', 'val.required')); if (num(y) === null) out.push(A('p' + k + 'y', 'err', 'val.required')); else if (isDate(r.date) && num(y) < seasonOf(r.date)) out.push(A('p' + k + 'y', 'warn', 'val.pick_year_past'));
      if (num(rd) === null || num(rd) < 1 || num(rd) > 7) out.push(A('p' + k + 'r', 'err', 'val.round_range'));
      var key = t + '|' + y + '|' + rd; if (t && seen[key]) out.push(A('p' + k + 't', 'warn', 'val.comp_pick_dup')); seen[key] = 1;
    }
    if (r.comp === 'yes' && !any) out.push(A('p1t', 'warn', 'val.comp_no_pick'));
    return out;
  }

  // ---- transactions : lignes regroupées par (date, partenaire) ----
  function tradeGroups(rows) {
    var g = {}, order = [];
    rows.forEach(function (r, i) { var k = (r.date || '') + '|' + (r.partner || '') + '|' + (r.grp || ''); if (!g[k]) { g[k] = []; order.push(k); } g[k].push(i); });
    return { g: g, order: order };
  }
  function validateTradeRow(r, ctx) {
    var out = [];
    if (!isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (!r.partner) out.push(A('partner', 'err', 'val.required'));
    if (!r.dir) out.push(A('dir', 'err', 'val.required'));
    if (r.type === 'player' && !r.pid) out.push(A('pid', 'err', 'val.player_missing'));
    if (r.type === 'pick') {
      var y = num(r.year), rd = num(r.round);
      if (y === null) out.push(A('year', 'err', 'val.required')); if (rd === null || rd < 1 || rd > 7) out.push(A('round', 'err', 'val.round_range'));
      if (!r.orig) out.push(A('orig', 'err', 'val.required'));
    }
    if (!r.type) out.push(A('type', 'err', 'val.required'));
    var ret = num(r.ret), ry = num(r.ryears);
    if (ret !== null && ret < 0) out.push(A('ret', 'err', 'val.negative'));
    if (ret > 0 && (ry === null || ry < 1)) out.push(A('ryears', 'err', 'val.retention_years'));
    if (ret > 0 && r.type !== 'player') out.push(A('ret', 'err', 'val.retention_player_only'));
    if (ret > 0 && ctx && ctx.aavAt && r.pid && isDate(r.date)) { var aav = ctx.aavAt(r.pid, r.date); var full = r.dir === 'in' ? aav + ret : aav; if (aav && ret > full * 0.505) out.push(A('ret', 'warn', 'val.retention_over_half', [Math.round(full * 0.5)])); }
    return out;
  }
  function validateTradeGroup(rows, idxs) {
    var out = [], o = idxs.filter(function (i) { return rows[i].dir === 'out'; }).length, n = idxs.filter(function (i) { return rows[i].dir === 'in'; }).length;
    if (!o) out.push(A('dir', 'warn', 'val.trade_no_out')); if (!n) out.push(A('dir', 'warn', 'val.trade_no_in'));
    if (o > 5 || n > 5) out.push(A('dir', 'err', 'val.trade_max_assets'));
    return out;
  }

  // ---- changements de position ----
  function validatePosChange(r, ctx) {
    var out = [];
    if (!isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (!r.pid) out.push(A('pid', 'err', 'val.player_missing'));
    else if (isDate(r.date) && ctx && ctx.stints && !activeAt(ctx.stints, r.pid, r.date)) out.push(A('pid', 'err', 'val.player_not_active'));
    // position de départ (fp) : case calculée, que l'on ne peut pas remplir → message propre (val.pc_from_missing)
    ['fp', 'tp'].forEach(function (c) { if (!r[c]) out.push(A(c, 'err', c === 'fp' ? 'val.pc_from_missing' : 'val.required')); else if (POS.indexOf(r[c]) < 0) out.push(A(c, 'err', 'val.position_unknown')); });
    if (r.fp && r.tp && r.fp === r.tp && (r.fs || '') === (r.ts || '')) out.push(A('tp', 'warn', 'val.position_same'));
    return out;
  }

  // ---- nouveau joueur ----
  function validateNewPlayer(r, ctx) {
    var out = [];
    ['first', 'last', 'pos', 'birth', 'date'].forEach(function (c) { if (!r[c]) out.push(A(c, 'err', 'val.required')); });
    if (r.pos2 && (r.pos2 === r.pos || secondaryOptions(r.pos).indexOf(r.pos2) < 0)) out.push(A('pos2', 'err', 'val.pos2_group'));
    if (r.ptype && r.pos && PTYPES[GROUP_OF[r.pos]] && PTYPES[GROUP_OF[r.pos]].indexOf(r.ptype) < 0) out.push(A('ptype', 'warn', 'val.ptype_group'));
    if (r.pos && POS.indexOf(r.pos) < 0) out.push(A('pos', 'err', 'val.position_unknown'));
    if (r.birth && !isDate(r.birth)) out.push(A('birth', 'err', 'val.date_format'));
    if (r.date && !isDate(r.date)) out.push(A('date', 'err', 'val.date_format'));
    if (r.birth && r.date && isDate(r.birth) && isDate(r.date)) { var age = (Date.parse(r.date) - Date.parse(r.birth)) / 31557600000; if (age < 16 || age > 45) out.push(A('birth', 'warn', 'val.age_range', [Math.round(age)])); }
    var hh = num(r.height); if (r.height !== '' && r.height != null && (hh === null || hh < 60 || hh > 84)) out.push(A('height', 'warn', 'val.height_range'));
    var w = num(r.weight); if (w !== null && (w < 120 || w > 300)) out.push(A('weight', 'warn', 'val.weight_range'));
    var dr = num(r.dround), dp = num(r.dpick); if (dr !== null && (dr < 1 || dr > 7)) out.push(A('dround', 'err', 'val.round_range')); if (dp !== null && (dp < 1 || dp > 300)) out.push(A('dpick', 'warn', 'val.pick_range'));
    // homonyme (même groupe, même nom simplifié, joueurs historiques compris) : réponse obligatoire à « Même joueur ? » (migration 71)
    if (r.first && r.last && ctx.homoCands && HO) {
      var hc = ctx.homoCands(r), nm = (r.first + ' ' + r.last).trim(), hs = HO.status(hc, r.homo);
      if (hs === 'ask') out.push(A('last', 'err', 'val.homonym_unanswered', [nm]));
      else if (hs === 'no' && r.birth && isDate(r.birth) && HO.sameBirth(hc, r.birth)) out.push(A('birth', 'err', 'val.homonym_same_birth', [nm, r.birth]));
    }
    return out;
  }

  var api = { PTYPES: PTYPES, PTSLUG: PTSLUG, GROUP_OF: GROUP_OF, secondaryOptions: secondaryOptions, viaFrom: viaFrom, validateOffer: validateOffer, CLAUSES: CLAUSES, NO_TERMS: NO_TERMS, ACTIVE_ONLY: ACTIVE_ONLY, activeAt: activeAt, missedGames: missedGames, POS: POS, MOVES: MOVES, EVENTS: EVENTS, isDate: isDate, seasonOf: seasonOf, num: num, addDays: addDays, contractDerived: contractDerived,
              validateMove: validateMove, validateContract: validateContract, tradeGroups: tradeGroups, validateTradeRow: validateTradeRow, validateTradeGroup: validateTradeGroup,
              validatePosChange: validatePosChange, validateNewPlayer: validateNewPlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTV = api;
})(typeof window !== 'undefined' ? window : this);

;/* Choix d'une équipe : liste déroulante (datalist) + saisie au clavier avec remplissage automatique.
   Le texte saisi se résout en code d'équipe : nom complet (français ou anglais), code à trois lettres, ou partie du nom si une seule équipe correspond ;
   sans accents ni majuscules. */
(function (root) {
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  // renvoie le code, '' (champ vidé) ou null (texte ambigu ou inconnu)
  function resolve(text, teams) {
    var t = norm(text); if (!t) return '';
    var i, ex = teams.filter(function (x) { return norm(x.fr) === t || norm(x.en) === t || norm(x.code) === t; }); if (ex.length === 1) return ex[0].code;
    var part = teams.filter(function (x) { return norm(x.fr).indexOf(t) >= 0 || norm(x.en).indexOf(t) >= 0; }); if (part.length === 1) return part[0].code;
    var start = part.filter(function (x) { return norm(x.fr).indexOf(t) === 0 || norm(x.en).indexOf(t) === 0; }); if (start.length === 1) return start[0].code;
    return null;
  }
  function labelOf(teams, code, label) { var tm = teams.filter(function (x) { return x.code === code; })[0]; return tm ? label(tm) : code || ''; }
  function datalist(id, teams, label, esc) { return '<datalist id="' + id + '">' + teams.map(function (x) { return '<option value="' + esc(label(x)) + '"></option>'; }).join('') + '</datalist>'; }
  var api = { norm: norm, resolve: resolve, labelOf: labelOf, datalist: datalist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTTC = api;
})(typeof window !== 'undefined' ? window : this);

;/* Choix d'un joueur (FTPC) : liste déroulante (datalist) + saisie libre, sur le modèle du menu d'équipe (FTTC, team_combo.js).
   Maquette approuvée : docs/maquettes/saisie_joueurs_echanges.html.
   Un joueur : { id, name, g: 'F' | 'D' | 'G', o: 'franchise' | 'historical' }.
   Le texte saisi se résout en un état (sans accents ni majuscules) :
     linked / hist : nom exact d'un joueur du bon groupe (franchise / historique) ;
     group         : nom exact, mais le joueur est inscrit dans un autre groupe (pas de lien tant que le poste n'est pas corrigé) ;
     near          : nom à 1 faute d'un joueur connu du même groupe (2 fautes à partir de 10 caractères ; Damerau-Levenshtein) ;
     free / new    : inconnu (unknownState : 'free' = gardé en texte, 'new' = joueur à créer) ;
     ''            : champ vide.
   Règle visuelle : trait plein = lié à une fiche ; trait pointillé = pas de fiche. L'icône dit l'état ; son texte est lu par aria-describedby.
   Aucune donnée ni texte en dur : t(key) renvoie le libellé, esc(s) échappe le HTML (fonctions de la page). */
(function (root) {
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // distance de Damerau-Levenshtein (transposition de deux lettres voisines = 1 faute)
  function dist(a, b) {
    a = String(a); b = String(b);
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }

  function isHist(p) { return p.o === 'historical' || p.o === 'h'; }
  function inGroup(p, g) { return !g || p.g === g; }
  function nearLimit(n) { return n.length >= 10 ? 2 : 1; }

  // À la validation (Entrée, Tab, sortie du champ) : un début de prénom ou de nom (3 lettres au moins) qui ne désigne
  // qu'un seul joueur du groupe est complété (« taip » → « Toni Taipalus »). Sinon le texte est rendu tel quel.
  function complete(text, group, list) {
    var n = norm(text); if (n.length < 3) return text;
    if ((list || []).some(function (p) { return norm(p.name) === n; })) return text;
    var hit = (list || []).filter(function (p) {
      if (!inGroup(p, group)) return false;
      var full = norm(p.name);
      return full.indexOf(n) === 0 || full.split(' ').some(function (w) { return w.indexOf(n) === 0; });
    });
    return hit.length === 1 ? hit[0].name : text;
  }

  // → { st, p, near } ; p = le joueur reconnu (linked, hist, group), near = le joueur proche (near), sinon null.
  // opts.near === false : pas de recherche de nom proche (nom venu de la base, non saisi ni modifié pendant la séance).
  function resolve(text, group, list, unknownState, opts) {
    var n = norm(text); list = list || [];
    if (!n) return { st: '', p: null, near: null };
    // étiquette d'homonyme « Nom (D · …) » (p.label, connect/homonym_ui.js) : désigne un seul joueur ; sinon le nom
    var lb = list.filter(function (p) { return p.label && norm(p.label) === n; }); if (lb.length) return { st: isHist(lb[0]) ? 'hist' : 'linked', p: lb[0], near: null };
    var ex = list.filter(function (p) { return norm(p.name) === n; });
    var same = ex.filter(function (p) { return inGroup(p, group); });
    if (same.length) return { st: isHist(same[0]) ? 'hist' : 'linked', p: same[0], near: null };
    if (ex.length) return { st: 'group', p: ex[0], near: null };
    if (!opts || opts.near !== false) {
      var lim = nearLimit(n), best = null, bd = lim + 1;
      list.forEach(function (p) { if (!inGroup(p, group)) return; var d = dist(n, norm(p.name)); if (d <= lim && d < bd) { bd = d; best = p; } });
      if (best) return { st: 'near', p: null, near: best };
    }
    return { st: unknownState === 'new' ? 'new' : 'free', p: null, near: null };
  }

  // remplace toutes les occurrences de {0}, {1}… (val.pl_near contient {0} deux fois)
  function fill(s, a) { s = String(s); (a || []).forEach(function (x, i) { s = s.split('{' + i + '}').join(x); }); return s; }
  var KEY = { linked: 'ui.pl_state_linked', hist: 'ui.pl_state_hist', free: 'ui.pl_state_free', new: 'ui.pl_state_new', group: 'val.pl_group', homo: 'val.player_exists' };   // homo : nom exact d'un joueur connu, réponse à « Même joueur ? » attendue
  function stateKey(res, unknownState) {
    if (!res || !res.st) return '';
    if (res.st === 'near') return unknownState === 'new' ? 'val.pl_near_new' : 'val.pl_near';
    return KEY[res.st] || '';
  }
  // texte complet de l'état (infobulle, aria-describedby, message sous la grille)
  function stateText(res, unknownState, t) {
    var k = stateKey(res, unknownState); if (!k) return '';
    if (res.st === 'near') return fill(t(k), [res.near.name]);
    if (res.st === 'group') return fill(t(k), [res.p.name, t('pc.' + res.p.g)]);
    return t(k);
  }
  // un avertissement (near, group) se signale aussi sur la cellule : <td class="ci warn">
  function isWarn(res) { return !!res && (res.st === 'near' || res.st === 'group'); }

  var IC = {
    ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 8.4l2.1 2.1 4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.9 14.7 13.8H1.3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.2v3.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="currentColor"/></svg>',
    free: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.1"/></svg>',
    nw: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.1"/><path d="M8 4.8v6.4M4.8 8h6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    err: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };
  var ST_IC = { linked: 'ok', hist: 'ok', free: 'free', new: 'nw', near: 'warn', group: 'warn', homo: 'warn' };
  function idOf(r, c) { return 'pcb-' + String(r).replace(/[^A-Za-z0-9_-]/g, '-') + '-' + String(c).replace(/[^A-Za-z0-9_-]/g, '-'); }

  // bouton « Lier à … » : button.pcb-sug[data-act="pcb-accept"][data-r][data-c][data-name][data-pid]
  function suggestionHTML(r, c, near, unknownState, esc, t) {
    if (!near) return '';
    var txt = fill(t(unknownState === 'new' ? 'val.pl_near_new' : 'val.pl_near'), [near.name]);
    return '<button type="button" class="pcb-sug" data-act="pcb-accept" data-r="' + esc(r) + '" data-c="' + esc(c) + '" data-name="' + esc(near.name) + '"' + (near.id != null ? ' data-pid="' + esc(near.id) + '"' : '') +
      ' title="' + esc(txt) + '">' + esc(fill(t('ui.pl_link_to'), [near.name])) + '</button>';
  }

  // o = { r, c, value, list, group, unknown: 'free'|'new', listId, label, touched (défaut true), noSug, res (facultatif, déjà calculé) }
  // → <span class="pcb" data-st="…"><span class="pcb-f"><input class="cell pcombo" list data-r data-c …><span class="pcb-mk" id>…</span></span>[button.pcb-sug]</span>
  function cellHTML(o, esc, t) {
    var res = o.res || resolve(o.value, o.group, o.list, o.unknown, { near: o.touched !== false });
    var id = idOf(o.r, o.c), txt = stateText(res, o.unknown, t);
    return '<span class="pcb" data-st="' + res.st + '"><span class="pcb-f"><input class="cell pcombo"' + (o.listId ? ' list="' + esc(o.listId) + '"' : '') +
      ' data-r="' + esc(o.r) + '" data-c="' + esc(o.c) + '" value="' + esc(o.value == null ? '' : o.value) + '" autocomplete="off" spellcheck="false" aria-label="' + esc(o.label || '') + '"' + (txt ? ' aria-describedby="' + id + '"' : '') + '>' +
      (res.st ? '<span class="pcb-mk" id="' + id + '" title="' + esc(txt) + '">' + IC[ST_IC[res.st]] + '<span class="vh">' + esc(txt) + '</span></span>' : '') + '</span>' +
      (res.st === 'near' && !o.noSug ? suggestionHTML(o.r, o.c, res.near, o.unknown, esc, t) : '') + '</span>';
  }

  // une option par joueur ; label = poste et origine, affichés à côté du nom (Chrome, Edge, Firefox)
  function datalistHTML(id, list, esc, t) {
    return '<datalist id="' + esc(id) + '">' + (list || []).map(function (p) {
      return '<option value="' + esc(p.label || p.name) + '" label="' + esc(t('pc.' + p.g) + ' · ' + t(isHist(p) ? 'ui.pl_opt_hist' : 'ui.pl_opt_franchise')) + '"></option>';
    }).join('') + '</datalist>';
  }

  // légende au-dessus de la grille ; withNew = échange (côté reçu), sinon « hors base »
  function legendHTML(withNew, esc, t) {
    return '<div class="pcb-legend" role="note"><span>' + esc(t('ui.pl_legend')) + '</span>' +
      '<span class="lg ok">' + IC.ok + '<span>' + esc(t('ui.pl_lg_linked')) + '</span></span>' +
      '<span class="lg wn">' + IC.warn + '<span>' + esc(t('ui.pl_lg_near')) + '</span></span>' +
      (withNew ? '<span class="lg">' + IC.nw + '<span>' + esc(t('ui.pl_lg_new')) + '</span></span>'
        : '<span class="lg fr">' + IC.free + '<span>' + esc(t('ui.pl_lg_free')) + '</span></span>') + '</div>';
  }

  // message de la cellule active, sous la grille : <p class="pcb-live [wn|er]" aria-live="polite">
  function liveClass(st) { return st === 'near' || st === 'group' ? 'wn' : ''; }

  var api = { norm: norm, dist: dist, complete: complete, resolve: resolve, stateKey: stateKey, stateText: stateText, isWarn: isWarn, liveClass: liveClass,
    cellHTML: cellHTML, datalistHTML: datalistHTML, legendHTML: legendHTML, suggestionHTML: suggestionHTML, idOf: idOf, fill: fill, IC: IC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTPC = api;
})(typeof window !== 'undefined' ? window : this);

;/* Pays : nom anglais (tel qu'enregistré dans la base), nom français, code ISO pour le drapeau. */
(function (root) {
  var LIST = [
    ['Argentina', 'Argentine', 'ar'], ['Armenia', 'Arménie', 'am'], ['Australia', 'Australie', 'au'], ['Austria', 'Autriche', 'at'], ['Bahamas', 'Bahamas', 'bs'], ['Belarus', 'Biélorussie', 'by'], ['Belgium', 'Belgique', 'be'], ['Bermuda', 'Bermudes', 'bm'],
    ['Brazil', 'Brésil', 'br'], ['Bulgaria', 'Bulgarie', 'bg'], ['Cameroon', 'Cameroun', 'cm'], ['Canada', 'Canada', 'ca'], ['Chile', 'Chili', 'cl'], ['China', 'Chine', 'cn'], ['Colombia', 'Colombie', 'co'], ['Croatia', 'Croatie', 'hr'],
    ['Czechia', 'Tchéquie', 'cz'], ['Denmark', 'Danemark', 'dk'], ['Estonia', 'Estonie', 'ee'], ['Finland', 'Finlande', 'fi'], ['France', 'France', 'fr'], ['Georgia', 'Géorgie', 'ge'], ['Germany', 'Allemagne', 'de'], ['Ghana', 'Ghana', 'gh'],
    ['Great Britain', 'Grande-Bretagne', 'gb'], ['Greece', 'Grèce', 'gr'], ['Haiti', 'Haïti', 'ht'], ['Hungary', 'Hongrie', 'hu'], ['Iceland', 'Islande', 'is'], ['India', 'Inde', 'in'], ['Ireland', 'Irlande', 'ie'], ['Israel', 'Israël', 'il'],
    ['Italy', 'Italie', 'it'], ['Jamaica', 'Jamaïque', 'jm'], ['Japan', 'Japon', 'jp'], ['Kazakhstan', 'Kazakhstan', 'kz'], ['Latvia', 'Lettonie', 'lv'], ['Lithuania', 'Lituanie', 'lt'], ['Luxembourg', 'Luxembourg', 'lu'], ['Mexico', 'Mexique', 'mx'],
    ['Moldova', 'Moldavie', 'md'], ['Netherlands', 'Pays-Bas', 'nl'], ['New Zealand', 'Nouvelle-Zélande', 'nz'], ['Nigeria', 'Nigeria', 'ng'], ['Norway', 'Norvège', 'no'], ['Poland', 'Pologne', 'pl'], ['Portugal', 'Portugal', 'pt'], ['Romania', 'Roumanie', 'ro'],
    ['Russia', 'Russie', 'ru'], ['Serbia', 'Serbie', 'rs'], ['Slovakia', 'Slovaquie', 'sk'], ['Slovenia', 'Slovénie', 'si'], ['South Africa', 'Afrique du Sud', 'za'], ['South Korea', 'Corée du Sud', 'kr'], ['Spain', 'Espagne', 'es'], ['Sweden', 'Suède', 'se'],
    ['Switzerland', 'Suisse', 'ch'], ['Trinidad and Tobago', 'Trinité-et-Tobago', 'tt'], ['Turkey', 'Turquie', 'tr'], ['Ukraine', 'Ukraine', 'ua'], ['United States', 'États-Unis', 'us']
  ].map(function (c) { return { en: c[0], fr: c[1], iso: c[2] }; });
  var BY = {}; LIST.forEach(function (c) { BY[c.en] = c; });
  function name(en, lang) { var c = BY[en]; return c ? (lang === 'fr' ? c.fr : c.en) : en; }
  function options(lang) { return LIST.slice().sort(function (a, b) { return (lang === 'fr' ? a.fr : a.en).localeCompare(lang === 'fr' ? b.fr : b.en, lang); }).map(function (c) { return [c.en, lang === 'fr' ? c.fr : c.en]; }); }
  function flagURL(en) { var c = BY[en]; return c ? 'https://flagcdn.com/w40/' + c.iso + '.png' : ''; }
  var api = { LIST: LIST, name: name, options: options, flagURL: flagURL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTC = api;
})(typeof window !== 'undefined' ? window : this);

;/* Moteur commun des grilles de saisie : logique pure (sans DOM), testable sous Node.
   Collage d'un bloc copié d'un tableur, déplacement vertical, pile d'annulation (Ctrl+Z), résultat d'une écriture. */
(function (root) {
  // Un collage est traité comme un bloc dès qu'il contient une tabulation ou un saut de ligne (sinon : collage natif dans la case)
  function isBlock(text) { return /[\t\n\r]/.test(String(text == null ? '' : text)); }

  // Bloc → matrice de lignes et de cellules. Seule la DERNIÈRE ligne vide (saut de ligne final ajouté par le tableur) est ignorée :
  // une ligne vide au milieu du bloc reste une ligne (elle vide les cases correspondantes), sinon les lignes suivantes seraient décalées.
  function parsePaste(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.map(function (l) { return l.split('\t'); });
  }

  // Ligne d'arrivée après Entrée (move = 1) ou ↑ (move = -1), dans l'ordre des lignes visibles.
  // grow : la grille ajoute une ligne vide en bas (journal) ; descendre depuis la dernière ligne vise la ligne suivante, qui existera après l'écriture.
  function nextRow(list, r, move, grow) {
    var pos = list.indexOf(r); if (pos < 0) return r;
    var p = pos + move;
    if (p < 0) return list[0];
    if (p >= list.length) return grow && move > 0 ? r + 1 : list[list.length - 1];
    return list[p];
  }

  // Cases visées par un collage commençant en (r, c).
  // rows : lignes visibles dans l'ordre ; cols : colonnes dans l'ordre de l'écran (une colonne non modifiable consomme sa valeur sans l'écrire).
  // grow : les lignes manquantes sont créées à la suite (journal) ; sinon le bloc s'arrête à la dernière ligne.
  function pasteTargets(rows, cols, r, c, matrix, grow) {
    var out = [], pos = rows.indexOf(r), c0 = cols.indexOf(c);
    if (c0 < 0) return out;
    if (pos < 0) { if (!grow) return out; rows = [r]; pos = 0; }
    matrix.forEach(function (line, i) {
      var p = pos + i, row = p < rows.length ? rows[p] : grow ? rows[rows.length - 1] + (p - rows.length + 1) : undefined;
      if (row === undefined) return;
      line.forEach(function (val, j) { var col = cols[c0 + j]; if (col !== undefined) out.push({ r: row, c: col, v: val }); });
    });
    return out;
  }

  // Résultat d'une écriture, quelle que soit la forme rendue par la page :
  // true → écrite ; null / undefined → case non modifiable (ignorée sans être comptée comme refusée) ;
  // false → refusée (message générique) ; { ok: false, k, p } → refusée avec un message qui dit comment corriger.
  function result(x) {
    if (x === true || (x && x.ok === true)) return { ok: true };
    if (x === null || x === undefined) return { ok: null };
    if (x && typeof x === 'object') return { ok: false, k: x.k || 'val.bad_value', p: x.p || [] };
    return { ok: false, k: 'val.bad_value', p: [] };
  }

  // Valeur inchangée : Entrée sans rien modifier ne doit pas créer de saisie
  function same(a, b) { return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim(); }

  // Pile d'annulation : on y garde l'état des saisies AVANT chaque modification (copie sérialisée)
  function makeUndo(limit) {
    var st = [], max = limit || 50;
    return {
      push: function (s) { if (s == null || st[st.length - 1] === s) return; st.push(s); if (st.length > max) st.shift(); },
      pop: function () { return st.length ? st.pop() : null; },
      clear: function () { st = []; },
      size: function () { return st.length; }
    };
  }

  // Nombre tapé ou collé, selon la langue de l'écran (décision du 2026-11-15) : $ et espaces acceptés partout.
  // Anglais : la virgule sépare les milliers (8,500,000 ; 1,450), le point est décimal ; une virgule hors groupes de 3 chiffres est refusée.
  // Français : l'espace sépare les milliers (8 500 000), la virgule est décimale (2,45) ; le point décimal est aussi accepté.
  // Rend '' (vide), un nombre, ou NaN (refusé).
  function num(raw, lang) {
    var s = String(raw == null ? '' : raw).trim().replace(/[\s\u00a0\u202f$]/g, '');
    if (s === '') return '';
    if (lang === 'en') { if (s.indexOf(',') >= 0) { if (!/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN; s = s.replace(/,/g, ''); } }
    else { if ((s.match(/,/g) || []).length > 1 || (s.indexOf(',') >= 0 && s.indexOf('.') >= 0)) return NaN; s = s.replace(',', '.'); }
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? +s : NaN;
  }
  var api = { num: num, isBlock: isBlock, parsePaste: parsePaste, nextRow: nextRow, pasteTargets: pasteTargets, result: result, same: same, makeUndo: makeUndo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTGIC = api;
})(typeof window !== 'undefined' ? window : this);

;/* Moteur commun des grilles de saisie : clavier, collage, focus après redessin, annulation (Ctrl+Z), avertissement avant de quitter.
   Branché une fois par page : FTGI.attach({ rootEl, host, adapter }). La logique pure est dans grid_input_core.js (FTGIC).

   adapter (seul write est obligatoire) :
     write(r, c, raw, el)  → true (écrite) | false ou { ok: false, k, p } (refusée) | null (case non modifiable, ignorée)
     rows(c, el)           → lignes visibles dans l'ordre (Entrée, ↑/↓, collage) ; par défaut : l'ordre des cases de la colonne à l'écran
     grow                  → true si la grille ajoute des lignes en bas (journal : une ligne vide attend la saisie suivante)
     cols(c, el)           → colonnes dans l'ordre de l'écran, pour le collage (une colonne non modifiable prend sa valeur sans l'écrire)
     na(r, c)              → true si la case ne s'applique pas (hachurée) : le collage la saute
     snapshot() / restore(s) → copie sérialisée des saisies en attente (Ctrl+Z)
     pending()             → nombre de lignes en attente d'envoi (avertissement avant de quitter)
     patch(r, el)          → facultatif : recalculer la ligne sans tout redessiner après une modification (le focus reste en place)
     redrawEach            → facultatif : redessiner après chaque case collée (cases qui dépendent d'autres cases de la ligne)
     targets(el, matrix)   → facultatif : cases visées par un collage [{ r, c, v }] quand la grille n'est pas un simple tableau (null : calcul habituel)
     onKey(e, el)          → facultatif : raccourcis propres à la page ; rend true s'il a traité la touche
     isCell(el)            → facultatif : élément de la grille géré par le moteur (par défaut : .cell avec data-r et data-c)
     t(k, short)           → libellé (barre d'état et bulles)
     alerts()              → nombre d'alertes de la vue affichée (barre d'état)
     storageOk()           → false si le navigateur a refusé d'enregistrer les saisies (barre en erreur)
     ctx()                 → clé de la vue affichée (onglet, saison…) : une valeur refusée reste attachée à sa vue
     rowName(r) / colName(c) → nom de la ligne et abréviation de la colonne (ligne de correction sur téléphone)
   Barre d'état (maquette docs/maquettes/saisie_moteur_commun.html, variante A) : dernier enfant de <main>, toujours visible ;
   case refusée : le texte tapé reste, td.err.rej, bulle .gi-tip qui dit comment corriger.
*/
(function (root) {
  var C = root.FTGIC || (typeof require !== 'undefined' ? require('./grid_input_core.js') : null);

  function cellSel(r, c) { return '.cell[data-r="' + r + '"][data-c="' + String(c).replace(/"/g, '\\"') + '"]'; }
  // valeur affichée au dernier dessin : sert à savoir si la case a vraiment été modifiée
  function committed(el) {
    if (el.tagName === 'SELECT') { for (var i = 0; i < el.options.length; i++) if (el.options[i].defaultSelected) return el.options[i].value; return el.options.length ? el.options[0].value : ''; }
    if (el.dataset && el.dataset.giRaw !== undefined) return el.dataset.giRaw;   // texte refusé remis dans la case : déjà traité, pas « en cours de frappe »
    return el.defaultValue;
  }
  function dirty(el) { return !C.same(el.value, committed(el)); }
  function markCommitted(el) { if (el.tagName === 'SELECT') { for (var i = 0; i < el.options.length; i++) el.options[i].defaultSelected = el.options[i].selected; } else el.defaultValue = el.value; }

  var IC = {
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5 15.2 14H.8L8 1.5Zm-.8 4.3v4.4h1.6V5.8H7.2Zm0 5.6v1.6h1.6v-1.6H7.2Z"/></svg>',
    ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="m3 8.5 3.2 3L13 4.5"/></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M5.5 3 2.5 6l3 3M3 6h6.5a4 4 0 0 1 0 8H6"/></svg>',
    disk: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M2.5 2.5h9l2 2v9h-11zM5 2.5v4h6v-4M5 13.5v-4h6v4"/><path stroke="currentColor" stroke-width="2" d="M3 13 13 3"/></svg>'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function attach(o) {
    var rootEl = o.rootEl, host = o.host, ad = o.adapter, doc = rootEl.ownerDocument || document, win = doc.defaultView || root;
    var undo = C.makeUndo(50), undoApp = null, leaving = false;
    var refused = {}, live = { text: '', bad: false, ic: '' }, bar = null, liveEl = null;
    function on(t, type, fn, cap) { if (t && typeof t.addEventListener === 'function') t.addEventListener(type, fn, cap); }   // DOM simulé des tests : écouteurs absents
    function app() { return host && host.app ? host.app() : null; }
    function isCell(el) { return !!el && (ad.isCell ? ad.isCell(el) : !!(el.classList && el.classList.contains('cell') && el.dataset && el.dataset.r !== undefined && el.dataset.c !== undefined)); }
    function t(k, sh) { return ad.t ? ad.t(k, sh) : k; }
    function fmt(k, p) { var x = t(k); (p || []).forEach(function (v, i) { x = x.split('{' + i + '}').join(v); }); return x; }
    function ctx() { return ad.ctx ? String(ad.ctx()) : ''; }
    function refusedHere() { return refused[ctx()] || (refused[ctx()] = {}); }
    function announce(kind, info) {
      info = info || {};
      if (kind === 'paste') live = info.bad ? { text: fmt('entry.pasted_rejected', [info.ok, info.bad]), bad: true, ic: 'warn' } : { text: fmt('entry.pasted', [info.ok]), bad: false, ic: 'ok' };
      else if (kind === 'undo') live = { text: t(info.none ? 'entry.undo_empty' : 'entry.undone'), bad: false, ic: info.none ? '' : 'undo' };
      else if (kind === 'refused') live = { text: fmt('entry.rejected_title', [info.raw]) + ' ' + fmt(info.k, info.p), bad: true, ic: 'warn' };
      if (ad.announce) ad.announce(kind, info);
      refreshBar();
    }
    // une nouvelle application (nouvelles données reçues, autre franchise) : l'ancienne pile ne s'applique plus
    function checkApp() { var a = app(); if (a !== undoApp) { undo.clear(); undoApp = a; } }
    function grows() { return typeof ad.grow === 'function' ? !!ad.grow() : !!ad.grow; }
    // modification faite hors des cases (bouton ×, « Lier à … ») : elle s'annule aussi par Ctrl+Z
    function edit(fn) { checkApp(); var before = snap(), x = fn(); if (before !== null && snap() !== before) undo.push(before); return x; }
    function snap() { return ad.snapshot ? ad.snapshot() : null; }

    // redessine puis donne le focus à la première case trouvée parmi les sélecteurs
    function redraw(sels) {
      host.draw(null);
      for (var i = 0; i < (sels || []).length; i++) { var el = sels[i] && rootEl.querySelector(sels[i]); if (el) { el.focus(); if (el.select) el.select(); return el; } }
      return null;
    }
    // sélecteur de l'élément qui a le focus, pour le retrouver après un redessin
    function activeSel() {
      var ae = doc.activeElement; if (!ae || !rootEl.contains(ae)) return null;
      if (isCell(ae)) return cellSel(ae.dataset.r, ae.dataset.c);
      if (ae.id) return '#' + ae.id;
      return null;
    }

    // écrit une case ; la copie d'avant va dans la pile d'annulation seulement si les saisies ont changé
    function write(el, r, c, raw, before) {
      var res = C.result(ad.write(r, c, raw, el)), key = r + '|' + c;
      if (before !== undefined && before !== null && snap() !== before) undo.push(before);
      if (res.ok === false) { refusedHere()[key] = { raw: String(raw), k: res.k, p: res.p }; announce('refused', { k: res.k, p: res.p, el: el, r: r, c: c, raw: String(raw) }); }
      else delete refusedHere()[key];
      return res;
    }
    function commit(el) {
      if (!dirty(el)) return null;
      checkApp(); var before = snap();
      return write(el, +el.dataset.r, el.dataset.c, el.value, before);
    }

    on(rootEl, 'change', function (e) {
      var el = e.target; if (!isCell(el)) return;
      var res = commit(el); if (!res) return;
      if (ad.patch && el.tagName !== 'SELECT') { ad.patch(+el.dataset.r, el); if (res.ok) markCommitted(el); return; }
      // avec Tab, le champ suivant n'a pas encore le focus au moment du « change » : on redessine juste après, puis on lui rend le focus
      setTimeout(function () { var s = activeSel(); redraw(s ? [s] : []); }, 0);
    });

    on(rootEl, 'keydown', function (e) {
      var el = e.target;
      if (ad.onKey && ad.onKey(e, el)) return;
      if (!isCell(el) || el.tagName === 'SELECT') return;                      // liste déroulante : Entrée garde son comportement natif
      if (el.classList.contains('pcombo') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;   // ↑/↓ parcourent la liste du navigateur
      var move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!move || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      var r = +el.dataset.r, c = el.dataset.c; commit(el);
      var list = ad.rows ? ad.rows(c, el) : domRows(c), nx = C.nextRow(list, r, move, grows());
      redraw([cellSel(nx, c), cellSel(r, c)]);
    });
    function domRows(c) {
      var seen = {}, out = [];
      [].forEach.call(rootEl.querySelectorAll('.cell[data-c="' + String(c).replace(/"/g, '\\"') + '"]'), function (x) { var r = +x.dataset.r; if (!seen[r]) { seen[r] = 1; out.push(r); } });
      return out;
    }

    on(rootEl, 'paste', function (e) {
      var el = e.target; if (!isCell(el)) return;
      var text = (e.clipboardData || win.clipboardData).getData('text');
      if (!C.isBlock(text)) return;                                             // une seule valeur : collage natif dans la case
      var r = +el.dataset.r, c = el.dataset.c, cols = ad.cols ? ad.cols(c, el) : domCols(el);
      var matrix = C.parsePaste(text), targets = ad.targets ? ad.targets(el, matrix) : null;   // la page peut placer elle-même le bloc (cartes d'échange)
      if (!targets) targets = C.pasteTargets(ad.rows ? ad.rows(c, el) : domRows(c), cols, r, c, matrix, grows());
      if (!targets.length) return;
      e.preventDefault(); checkApp();
      var before = snap(), ok = 0, bad = 0, firstBad = null;
      targets.forEach(function (x) {
        if (ad.na && ad.na(x.r, x.c)) return;
        var res = C.result(ad.write(x.r, x.c, x.v, null)), key = x.r + '|' + x.c;
        if (res.ok && ad.redrawEach) host.draw(null);   // une case peut en ouvrir ou en hacher d'autres (blessure → retour) : na() lit l'écran à jour
        if (res.ok) { ok++; delete refusedHere()[key]; } else if (res.ok === false) { bad++; refusedHere()[key] = { raw: String(x.v), k: res.k, p: res.p }; if (!firstBad) firstBad = { r: x.r, c: x.c, k: res.k, p: res.p }; }
      });
      if (before !== null && snap() !== before) undo.push(before);             // tout le bloc s'annule d'un seul Ctrl+Z
      redraw([cellSel(r, c)]);
      announce('paste', { ok: ok, bad: bad, first: firstBad });
    });
    // colonnes par défaut : l'ordre des cases de la ligne à l'écran
    function domCols(el) { var tr = el.closest ? el.closest('tr') : null; return tr ? [].map.call(tr.querySelectorAll('.cell[data-c]'), function (x) { return x.dataset.c; }) : [el.dataset.c]; }

    // Ctrl+Z : annule la dernière modification de la grille. Dans une case dont le texte n'est pas encore validé, l'annulation du champ garde la main.
    on(doc, 'keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || String(e.key).toLowerCase() !== 'z') return;
      var el = doc.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.type !== 'checkbox' && (!isCell(el) || dirty(el))) return;
      if (el && el !== doc.body && !rootEl.contains(el)) return;
      checkApp(); var s = undo.pop();
      e.preventDefault();
      if (s === null) { announce('undo', { none: true }); return; }
      var keep = activeSel(); refused[ctx()] = {}; ad.restore(s); redraw(keep ? [keep] : []);
      announce('undo', {});
    });

    // un envoi, une lecture de la base, une déconnexion ou « Tout effacer » : les saisies d'avant ne doivent pas revenir par Ctrl+Z
    on(rootEl, 'click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-sb],[data-act="reset"]') : null; if (b) { undo.clear(); refused = {}; }
    }, true);

    // Avertissement avant de quitter le site ou de fermer l'onglet avec des saisies non envoyées.
    // Les liens entre les pages du site ne déclenchent rien : les saisies restent enregistrées sur cet ordinateur.
    on(doc, 'click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a || a.target === '_blank') return;
      try { var u = new URL(a.getAttribute('href'), win.location.href); if (u.origin === win.location.origin || (u.protocol === 'file:' && win.location.protocol === 'file:')) { leaving = true; setTimeout(function () { leaving = false; }, 2000); } } catch (x) { /* adresse invalide : rien */ }
    }, true);
    on(win, 'beforeunload', function (e) {
      if (leaving || !ad.pending || !(ad.pending() > 0)) return;
      e.preventDefault(); e.returnValue = ''; return '';
    });

    // ---- cases refusées : texte tapé conservé, case en erreur, bulle qui dit comment corriger ----
    function applyRefused() {
      var m = refused[ctx()] || {};
      Object.keys(m).forEach(function (key) {
        var i = key.indexOf('|'), r = key.slice(0, i), c = key.slice(i + 1), el = rootEl.querySelector(cellSel(r, c)), x = m[key]; if (!el) return;
        var td = el.closest ? (el.closest('td,.lcell') || el.parentNode) : null,   // case de tableau, ou étiquette d'un champ (carte d'échange)
           id = 'gi-tip-' + r + '-' + String(c).replace(/[^\w-]/g, '_');
        if (el.tagName !== 'SELECT' && el.dataset.giRaw === undefined && el.value !== x.raw && el.value === el.defaultValue) el.value = x.raw;   // case fraîchement dessinée : on remet le texte tapé
        if (el.tagName !== 'SELECT' && el.value === x.raw) el.dataset.giRaw = x.raw;
        el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', id);
        if (!td || td.querySelector('.gi-tip')) return;
        td.classList.add('err', 'rej'); if (td.tagName !== 'TD') td.classList.add('gi-host');
        var tr = td.parentNode, cells = tr ? [].filter.call(tr.children, function (z) { return z.classList && z.classList.contains('ci'); }) : [];
        if (cells[0] === td) td.classList.add('first');
        var body = tr && tr.parentNode, rowsN = body ? body.children.length : 0, idx = body ? [].indexOf.call(body.children, tr) : 0;
        var tip = doc.createElement('span'); tip.className = 'gi-tip' + (rowsN > 3 && idx >= rowsN - 2 ? ' up' : ''); tip.id = id; tip.setAttribute('role', 'tooltip');
        tip.innerHTML = '<b>' + IC.warn + esc(fmt('entry.rejected_title', [x.raw])) + '</b>' + esc(fmt(x.k, x.p));
        td.appendChild(tip);
      });
    }
    // ---- barre d'état : toujours visible, dernier enfant de <main> ; la zone d'annonce (aria-live) n'est jamais recréée ----
    function refreshBar() {
      if (!doc.createElement || !rootEl.querySelector) return;
      var a = app(), main = rootEl.querySelector('main');
      if (!a || !main) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
      if (!bar) { bar = doc.createElement('div'); bar.className = 'gbar'; bar.id = 'gbar'; bar.setAttribute('role', 'region'); bar.setAttribute('data-tip', '1');
        liveEl = doc.createElement('span'); liveEl.id = 'gbar-live'; liveEl.setAttribute('role', 'status'); liveEl.setAttribute('aria-live', 'polite'); liveEl.setAttribute('aria-atomic', 'true'); }
      var n = ad.pending ? ad.pending() : 0, here = refused[ctx()] || {}, nRef = Object.keys(here).length, al = (ad.alerts ? ad.alerts() : 0) + nRef, ok = !ad.storageOk || ad.storageOk() !== false;
      var pend = n ? esc(fmt(n === 1 ? 'entry.pending_one' : 'entry.pending_other', [n])).replace(String(n), '<b>' + n + '</b>') : esc(t('entry.pending_none'));
      var fix = '', ae = doc.activeElement;
      if (ae && isCell(ae) && here[ae.dataset.r + '|' + ae.dataset.c]) {
        var x = here[ae.dataset.r + '|' + ae.dataset.c];
        var cn = ad.colName ? ad.colName(ae.dataset.c) : ae.dataset.c, rn = ad.rowName ? ad.rowName(+ae.dataset.r) : '';
        var head = rn ? fmt('entry.rejected_line', [cn, rn, x.raw]) : cn + ' · ' + fmt('entry.rejected_title', [x.raw]);   // ligne sans nom (carte d'échange, onglet Équipe)
        fix = '<p class="gbar-fix">' + IC.warn + '<span><b>' + esc(head) + '</b> ' + esc(fmt(x.k, x.p)) + '</span></p>';
      }
      var html = (ok ? '' : '<p class="gbar-err" role="alert">' + IC.disk + '<span><b>' + esc(t('ui.storage_error')) + '</b></span><button type="button" class="btn" data-act="json">' + esc(t('entry.export_json')) + '</button></p>') +
        '<span class="gbar-pend" data-n="' + n + '">' + pend + '</span>' + (n && ok ? '<span class="gbar-saved">' + esc(t('entry.saved')) + '</span>' : '') +
        '<span class="gbar-al' + (al ? ' bad' : '') + '">' + (al ? IC.warn + al + ' ' + esc(t(al === 1 ? 'entry.alerts_one' : 'entry.alerts')) : IC.ok + esc(t('entry.no_alerts'))) + '</span>' +
        '<span id="gbar-live-slot"></span><span class="gbar-key"><kbd>Ctrl</kbd>+<kbd>Z</kbd> ' + esc(t('entry.undo_short')) + '</span>' + fix;
      bar.setAttribute('data-state', ok ? 'ok' : 'err'); bar.setAttribute('aria-label', t('entry.status_region'));
      if (bar.dataset.html !== html) { bar.innerHTML = html; bar.dataset.html = html; var slot = bar.querySelector('#gbar-live-slot'); slot.parentNode.replaceChild(liveEl, slot); }
      liveEl.className = 'gbar-live' + (live.bad ? ' bad' : '');
      var lh = live.text ? (live.ic ? IC[live.ic] : '') + '<span>' + esc(live.text) + '</span>' : '';
      if (liveEl.dataset.html !== lh) { liveEl.innerHTML = lh; liveEl.dataset.html = lh; }
      if (bar.parentNode !== main || main.lastElementChild !== bar) main.appendChild(bar);
    }
    function render() { if (!rootEl.querySelector) return; if (app()) applyRefused(); refreshBar(); }   // pas encore de données (page lite avant connexion) : rien à reposer
    // après chaque dessin de la page (ou recalcul d'une ligne) : on repose les cases refusées et la barre
    var pendingRender = false;
    if (typeof MutationObserver !== 'undefined') new MutationObserver(function (ms) {
      if (pendingRender || ms.every(function (m) { return bar && (m.target === bar || bar.contains(m.target)) || (m.target.classList && m.target.classList.contains('gi-tip')) || [].every.call(m.addedNodes, function (x) { return x.classList && x.classList.contains('gi-tip'); }) && m.addedNodes.length && !m.removedNodes.length; })) return;
      pendingRender = true; Promise.resolve().then(function () { pendingRender = false; render(); });
    }).observe(rootEl, { childList: true, subtree: true });
    on(rootEl, 'focusin', function () { refreshBar(); });
    on(rootEl, 'focusout', function () { setTimeout(refreshBar, 0); });

    return { refresh: render, clearUndo: function () { undo.clear(); }, undoSize: function () { return undo.size(); }, commit: commit, edit: edit };
  }

  var api = { attach: attach, cellSel: cellSel, committed: committed, dirty: dirty, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTGI = api;
})(typeof window !== 'undefined' ? window : this);

;/* Écran des événements : grilles clavier d'abord, alertes, enregistrement local, export. */
(function (root) {
  var FTC = root.FTC || (typeof require !== 'undefined' ? require('../season/countries.js') : null);
  var TC = root.FTTC || (typeof require !== 'undefined' ? require('../connect/team_combo.js') : null);
  var PC = root.FTPC || (typeof require !== 'undefined' ? require('../connect/player_combo.js') : null);   // choix d'un joueur avec saisie libre
  var GIC = root.FTGIC || (typeof require !== 'undefined' ? require('../connect/grid_input_core.js') : null);   // nombres selon la langue (num)
  var V = root.FTV || (typeof require !== 'undefined' ? require('./events_core.js') : null);
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  var HO = root.FTHOMO || (typeof require !== 'undefined' ? require('../connect/homonym_ui.js') : null);   // question « Même joueur ? »
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STORE_KEY = 'ft_events_v1';
  function SHELL() { return typeof window !== 'undefined' && !!window.FT_PAGE; }   // coquille de navigation : les onglets sont dans la rangée commune (connect/ft_shell.js)
  var YN = ['yes', 'no'], DIRS = ['out', 'in'], ATYPES = ['player', 'pick'], CTYPES = ['one_way', 'two_way'], HANDS = ['L', 'R'], VIA = ['start', 'draft', 'trade', 'free_agent', 'waivers'];

  function makeEventsApp(DATA, store) {
    var entries = { mv: [], ct: [], tr: [], pc: [], np: [], mvx: [], ctx: [], os: [], trf: [] };   // trf : échanges saisis (deux équipes × 5 éléments)   // mvx : modifications d'événements déjà enregistrés (par identifiant)
    try { var sv = store && store.get(STORE_KEY); if (sv) entries = Object.assign(entries, JSON.parse(sv)); } catch (e) { /* stockage indisponible */ }
    var state = { lang: 'fr', tab: 'mv', season: DATA.franchise.current + 1, plq: '', plpos: '', plst: '', plmiss: false };
    // lien direct depuis Repêchage › Choix détenus (phase 4d) : ?tr=<id de la transaction> ou ?os=<id de l'offre hostile> ouvre sa saison
    (function () { try { var m = /[?&](tr|os)=(\d+)/.exec(typeof location !== 'undefined' ? location.search : ''); if (!m) return; var id = +m[2], l = m[1] === 'tr' ? DATA.base.tr || [] : DATA.base.os || [], x = l.filter(function (o) { return o.id === id; })[0];
      if (x) { state.season = V.seasonOf(x.date); state['focus_' + m[1]] = id; } } catch (e) { /* adresse illisible : ouverture normale */ } })();
    var PLE = { open: null, d: null, o: null, save: 'idle', msg: '', just: null, live: '', liveCls: '' };   // panneau de modification (non gardé dans localStorage)
    var TEAMS = {}; DATA.teams.forEach(function (tm) { TEAMS[tm.code] = tm; }); (DATA.teams || []).forEach(function (tm) { TEAMS[tm.en] = tm; });
    var capBy = {}; DATA.cap.forEach(function (c) { capBy[c[0]] = c.slice(1); });
    var byId = {}; DATA.players.forEach(function (p) { byId[p.id] = p; });

    function dtab(k) { k = k || state.tab; return k === 'inj' ? 'mv' : k; }   // onglet de données (Blessures → mv)
    function isMv() { return state.tab === 'mv' || state.tab === 'inj'; }
    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    var MONEY_MSG = { 'val.aav_below_min': 1, 'val.aav_above_max': 1, 'val.retention_over_half': 1 };   // paramètre = montant : format de la langue
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', MONEY_MSG[k] && typeof x === 'number' ? money(x) : x); }); return s; }
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    function teamName(code) { var tm = TEAMS[code]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : (code || ''); }
    function money(x) { return x == null ? '' : state.lang === 'fr' ? x.toLocaleString('fr-CA') + ' $' : '$' + x.toLocaleString('en-CA'); }   // 8 500 000 $ / $8,500,000
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }

    // ---- schémas des grilles ----
    var POSOPT = V.POS.map(function (p) { return [p, 'pc.' + p]; });
    var SCHEMA = {
      // phase 4b : Blessures (inj) et Mouvements (mv) sont deux onglets d'une même liste (entries.mv, roster_move), envoyée d'un seul appel
      inj: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['ret', 'col.return', 'date'], ['games', 'col.games_missed', 'int']],
      mv: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['move', 'col.move', 'sel', V.MOVES.filter(function (m) { return m !== 'injury'; }).map(function (m) { return [m, 'move.' + m]; })], ['claimed', 'col.claimed', 'sel', YN.map(function (y) { return [y, 'claimed.' + y]; })]],
      ct: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['event', 'col.event', 'sel', V.EVENTS.map(function (x) { return [x, 'ev.' + x]; })], ['ctype', 'col.contract_type', 'sel', CTYPES.map(function (c) { return [c, 'ctype.' + c]; })], ['years', 'col.years', 'ysel'], ['first', 'col.first_season', 'fsel'], ['aav', 'col.aav', 'int']].concat([1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return ['cl' + k, 'ct.col_clause' + k, 'csel']; })),
      os: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['event', 'col.event', 'sel', [['signed', 'os.signed'], ['unmatched', 'os.unmatched']]], ['comp', 'os.comp', 'sel', YN.map(function (y) { return [y, 'claimed.' + y]; })]].concat([1, 2, 3, 4].reduce(function (a, k) { return a.concat([['p' + k + 't', 'os.pick_team' + k, 'team'], ['p' + k + 'y', 'os.pick_year' + k, 'int'], ['p' + k + 'r', 'os.pick_round' + k, 'rsel']]); }, [])),
      tr: [['date', 'col.date', 'date'], ['partner', 'col.partner', 'team'], ['grp', 'col.group', 'text'], ['dir', 'col.direction', 'sel', DIRS.map(function (d) { return [d, 'dir.' + d]; })], ['type', 'col.asset_type', 'sel', ATYPES.map(function (a) { return [a, 'asset.' + a]; })], ['pid', 'col.player', 'player'], ['year', 'col.pick_year', 'int'], ['round', 'col.round', 'int'], ['orig', 'col.orig_team', 'team'], ['ret', 'col.retained', 'int'], ['ryears', 'col.retained_years', 'int']],
      pc: [['date', 'col.date', 'date'], ['pid', 'col.player', 'player'], ['fp', 'col.from_primary', 'sel', POSOPT], ['fs', 'col.from_secondary', 'sel', POSOPT], ['tp', 'col.to_primary', 'sel', POSOPT], ['ts', 'col.to_secondary', 'sel', POSOPT]]
    };

    // ---- joueurs : existants + nouveaux (identifiants temporaires négatifs) ----
    function allPlayers() {
      var l = DATA.players.slice();
      return l;
    }
    // étiquette d'homonyme « Nom (D · 2026-27 – 2030-31) » : seulement si un autre joueur porte le même nom (connect/homonym_ui.js) ; sinon le nom
    var LBLC = { lang: null, n: -1, m: {} };
    function plLabels() { var n = (DATA.homo || []).length; if (LBLC.lang !== state.lang || LBLC.n !== n) LBLC = { lang: state.lang, n: n, m: HO.labels(DATA.homo, t) }; return LBLC.m; }
    function plLabel(p) { return plLabels()[p.id] || p.name; }
    function pidFromName(name) { var n = String(name || '').trim().toLowerCase(); if (!n) return null; var L = allPlayers(), p = L.filter(function (x) { return plLabel(x).toLowerCase() === n; })[0] || L.filter(function (x) { return x.name.toLowerCase() === n; })[0]; return p ? p.id : null; }
    function nameOf(pid) { var p = allPlayers().filter(function (x) { return x.id === pid; })[0]; if (p) return plLabel(p); var h = (DATA.hist || []).filter(function (x) { return x[0] === pid; })[0]; return h ? h[1] : ''; }
    // côté « reçus » d'un échange : joueurs de la franchise absents de l'équipe à la date, puis joueurs historiques (FTPC : { id, name, g, o })
    function inList(tr) {
      var l = allPlayers().filter(function (p) { return p.id > 0 && (!V.isDate(tr.date) || !DATA.stints || !V.activeAt(DATA.stints, p.id, tr.date)); }).map(function (p) { return { id: p.id, name: p.name, label: plLabels()[p.id] || null, g: p.pos, o: 'franchise' }; });
      return l.concat((DATA.hist || []).map(function (h) { return { id: h[0], name: h[1], label: plLabels()[h[0]] || null, g: h[2], o: 'historical' }; }));
    }

    var storeErr = false, lastAlerts = 0;   // stockage refusé (barre d'état en erreur) ; alertes du dernier dessin (barre d'état)
    function persist() { try { store && store.set(STORE_KEY, JSON.stringify(entries)); storeErr = false; } catch (e) { storeErr = true; } }
    // Ctrl+Z : copie des saisies (moteur commun connect/grid_input.js)
    function snapshot() { return JSON.stringify(entries); }
    function restore(sv) { var o; try { o = JSON.parse(sv); } catch (e) { return false; } entries = Object.assign({ mv: [], ct: [], tr: [], pc: [], np: [], mvx: [], ctx: [], os: [], trf: [] }, o); persist(); return true; }
    // valeur refusée par setCell : message qui dit comment corriger (null : case calculée, non modifiable)
    var RO_COLS = { games: 1, via: 1, fp: 1, fs: 1 };
    function refusal(c, raw) {
      var f = String(c).split(':').pop(), def = (SCHEMA[state.tab] || []).filter(function (d) { return d[0] === f; })[0], ty = def ? def[2] : '';
      if (RO_COLS[f]) return null;
      var k = f === 'aav' || (f === 'ret' && state.tab === 'tr') ? 'val.bad_money' : f === 'height' || f === 'np_height' ? 'val.bad_height' : f === 'weight' || f === 'np_weight' ? 'val.bad_weight' : f === 'country' ? 'val.bad_country'
        : ty === 'team' || f === 'partner' || f === 'orig' ? 'val.bad_team' : ty === 'player' || ty === 'pidsel' || f === 'pid' || f === 'pname' ? 'val.bad_player_list' : ty === 'int' || f === 'year' || f === 'round' || f === 'years' || f === 'first' ? 'val.bad_int' : ty === 'date' ? 'val.bad_date' : 'val.bad_value';
      return { ok: false, k: k, p: [String(raw == null ? '' : raw).trim()] };
    }
    function colLabel(c) { var f = String(c).split(':').pop(), def = (SCHEMA[state.tab] || []).filter(function (d) { return d[0] === f; })[0]; return def ? t(def[1], true) : f; }
    function pasteCols() { return (SCHEMA[state.tab] || []).map(function (d) { return d[0]; }); }
    function blank(tab) {
      var last = entries[tab][entries[tab].length - 1], r = {};
      if (tab !== 'tr') r.date = (last && last.date) || DATA.franchise.date;   // (os et ct comprises)
      if (tab === 'tr') { r.date = (last && last.date) || DATA.franchise.date; if (last) { r.partner = last.partner; r.grp = last.grp; } }
      return r;
    }
    function setCell(r, c, raw) {
      if (state.tab === 'pc' && (c === 'fp' || c === 'fs')) return false;   // positions de départ calculées d'après les données déjà saisies
      if (state.tab === 'tr') return trSetCell(r, c, raw);
      if (isMv()) return mvSetCell(r, c, raw); if (state.tab === 'ct') return ctSetCell(r, c, raw); if (state.tab === 'os') return osSetCell(r, c, raw);
      var tab = state.tab, rows = entries[tab], def = SCHEMA[tab].filter(function (d) { return d[0] === c; })[0]; if (!def) return false;
      var v = String(raw == null ? '' : raw).trim();
      if (def[2] === 'int') { if (v === '') v = ''; else { v = GIC.num(v, state.lang); if (isNaN(v)) return false; v = Math.round(v); } }
      if (def[2] === 'team') { var tcode = TC.resolve(v, DATA.teams); if (tcode === null) return false; v = tcode; }
      if (r >= rows.length) { rows.push(blank(tab)); r = rows.length - 1; }
      if (def[2] === 'player') { rows[r].pname = v; rows[r].pid = pidFromName(v); } else rows[r][c] = v;
      if (tab === 'tr' && c === 'type') { /* conserve les champs inutiles mais ignorés */ }
      persist(); return true;
    }
    function removeRow(r) {
      if (isMv()) { var it = mvItems()[r]; if (it && it.kind === 'new') entries.mv.splice(it.i, 1); else if (it) entries.mvx = entries.mvx.filter(function (x) { return x.id !== it.id; }); persist(); return; }
      if (state.tab === 'tr') { entries.trf.splice(r, 1); persist(); return; }
      if (state.tab === 'ct') { var ic = ctItems()[r]; if (ic && ic.kind === 'new') entries.ct.splice(ic.i, 1); else if (ic) entries.ctx = entries.ctx.filter(function (x) { return x.id !== ic.id; }); persist(); return; }
      entries[state.tab].splice(r, 1); persist();
    }
    function reset() { entries = { mv: [], ct: [], tr: [], pc: [], np: [], mvx: [], ctx: [], os: [], trf: [] }; persist(); }
    function countEntries() { var n = 0; Object.keys(entries).forEach(function (k) { n += entries[k].length; }); return n; }
    function applyPaste(r, c, text) {
      var tab = state.tab, cols = SCHEMA[tab].map(function (d) { return d[0]; }), c0 = cols.indexOf(c), n = 0;
      String(text).replace(/\r/g, '').split('\n').filter(function (x) { return x.trim() !== ''; }).forEach(function (line, i) {
        line.split('\t').forEach(function (cell, j) { if (c0 + j < cols.length && setCell(r + i, cols[c0 + j], cell)) n++; });
      }); return n;
    }

    // ---- contexte de validation (contrats existants + nouveaux) ----
    // ---- joueurs homonymes (migration 71) : candidats d'une ligne « nouveau joueur », réponse à « Même joueur ? » ----
    function npCands(r) { var g = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' }[r.pos]; return r.first && r.last && g ? HO.find(DATA.homo, r.first + ' ' + r.last, g) : []; }
    function homoBox(ref, r, cands, nm, grp, extra) {
      var st = HO.status(cands, r.homo), o = { ref: ref, name: nm, group: grp, cands: cands, answer: st === 'yes' ? r.homo : st === 'no' ? 'no' : null, jumpHint: st === 'ask' };
      if (st === 'no') { var sb = HO.sameBirth(cands, r.birth); if (!r.birth) { o.birthErr = 'val.homonym_birth_missing'; o.birthErrP = [nm]; } else if (sb) { o.birthErr = 'val.homonym_same_birth'; o.birthErrP = [nm, r.birth]; } }
      return HO.boxHTML(Object.assign(o, extra || {}), esc, t);
    }
    // réponse : ref « np-<ligne> » ou « tr-<carte>-in-<élément> » ; kind yes | no | undo
    function homoAnswer(ref, kind, id) {
      var r = null, cands = [];
      var mt = /^tr-(\d+)-in-(\d+)$/.exec(ref), me = /^(ct|mv)-r(\d+)$/.exec(ref);
      if (mt && entries.trf[+mt[1]]) { r = entries.trf[+mt[1]].in[+mt[2]]; if (r) cands = trCands(r); }
      if (me) { var ie = (me[1] === 'ct' ? ctItems() : mvItems())[+me[2]]; r = ie && ie.kind === 'new' ? ie.r : null; if (r) cands = trCands(r); }
      if (!r) return false;
      if (kind === 'yes') r.homo = { yes: id }; else if (kind === 'no') r.homo = { no: cands.map(function (c) { return c.id; }) }; else delete r.homo;
      if (mt || me) trHomoApply(r, cands);
      persist(); return true;
    }
    // échanges : candidats d'un élément reçu (joueurs de la liste au même nom, notés à la saisie du nom)
    function trCands(sl) { var ids = sl.hc || []; return (DATA.homo || []).filter(function (p) { return ids.indexOf(p.id) >= 0; }); }
    function trHomoApply(sl, cands) {
      var st = HO.status(cands, sl.homo);
      if (st === 'yes') { sl.pid = sl.homo.yes; sl.np = null; }
      else { sl.pid = null; if (st === 'no') { if (!sl.np) { var w = String(sl.pname).split(/\s+/); sl.np = { first: w[0] || '', last: w.slice(1).join(' '), pos: '', birth: '' }; } } else sl.np = null; }
    }
    // ---- nouveau joueur dans Contrats (agent libre) et Mouvements (réclamation au ballottage), phase 4b : même composant que les échanges ----
    var NEWP = { ct: ['event', 'free_agent'], mv: ['move', 'waiver_claim'] };
    function newCap(tab, it) { var k = NEWP[tab]; return !!(k && it && it.kind === 'new' && it.r[k[0]] === k[1]); }
    // nouvelle ligne de Contrats ou de Mouvements : la case Joueur accepte un nom tapé, quel que soit l'événement (la colonne Joueur vient
    // avant Événement / Mouvement) ; un nom inconnu est gardé, et le joueur se crée dès que l'événement est Agent libre ou Réclamation
    function freeCell(tab, it) { return !!NEWP[tab] && (!it || it.kind === 'new'); }
    function newList(r) { return inList({ date: r.date }); }
    function pickList(tab, r) {   // joueurs proposés hors création : mêmes listes que les menus (joueurs actifs à la date selon l'événement)
      var l = tab === 'ct' ? (r.event ? ctPlayers(r.date, r.pid, r.event) : allPlayers()) : mvPlayers(r.date, r.pid);
      return l.filter(function (p) { return p.id > 0; }).map(function (p) { return { id: p.id, name: p.name, label: plLabels()[p.id] || null, g: p.pos, o: 'franchise' }; });
    }
    function cellList(tab, r) { var k = NEWP[tab]; return r[k[0]] === k[1] ? newList(r) : pickList(tab, r); }
    function evNewCell(tab, it, c, raw) {
      var v = String(raw == null ? '' : raw); if (tab === 'mv' && state.tab === 'inj') return false;   // Blessures : liste fermée (pas de création)
      if (!it && c === 'pname' && freeCell(tab, it)) { var nb = blank(tab); if (tab === 'mv') nb.move = ''; entries[tab].push(nb); it = { kind: 'new', i: entries[tab].length - 1, r: nb }; }
      if (c === 'pname' && freeCell(tab, it) && !newCap(tab, it)) {   // pas (encore) de création : le nom se lie à un joueur de la liste, sinon il reste tapé
        var r0 = it.r, res = PC.resolve(v.trim(), null, pickList(tab, r0), 'free'); dropNew(r0);
        if (res.st === 'linked') { r0.pid = res.p.id; r0.pname = res.p.name; } else { r0.pid = null; r0.pname = v.trim(); }
        r0.touched = true; persist(); return true;
      }
      if (!newCap(tab, it)) return false; var r = it.r;
      if (c === 'pname') { setInName({ date: r.date }, r, v); delete r.type; }
      else { v = v.trim(); r.np = r.np || { first: '', last: '', pos: '', birth: '' }; r.np[c.slice(3)] = c === 'np_pos' || c === 'np_pos2' ? v.toUpperCase() : c === 'np_status' ? v : v; }
      persist(); return true;
    }
    // nom inconnu sur une nouvelle ligne sans événement : on indique quel événement crée le joueur
    function pickHint(tab, it, a) {
      var k = NEWP[tab]; if (!freeCell(tab, it) || !it || it.r.pid != null || !it.r.pname || it.r[k[0]]) return a;
      return a.filter(function (x) { return x.k !== 'val.player_missing' && x.c !== 'pid'; }).concat([{ c: 'pid', level: 'err', k: tab === 'ct' ? 'val.np_pick_event_ct' : 'val.np_pick_event_mv', p: [it.r.pname] }]);
    }
    // l'événement devient Agent libre / Réclamation alors qu'un nom inconnu est tapé : le bloc « nouveau joueur » s'ouvre
    function newFromName(tab, r) { if (r && r.pid == null && r.pname && !r.np && !(r.hc && r.hc.length)) { setInName({ date: r.date }, r, r.pname); delete r.type; } }
    function dropNew(r) { if (r && (r.np || r.hc || r.homo)) { r.np = null; delete r.hc; delete r.homo; delete r.touched; } }
    // alertes d'un nouveau joueur : mêmes règles que le côté reçus d'un échange (trModel)
    function npAlerts(r, a, list) {
      var hcs = r.hc && r.hc.length ? trCands(r) : [], hst = HO.status(hcs, r.homo);
      if (hst === 'ask') { a = a.filter(function (x) { return x.c !== 'pid'; }); a.push({ c: 'pid', level: 'err', k: 'val.homonym_unanswered', p: [r.pname] }); }
      if (r.np) {
        a = a.filter(function (x) { return x.c !== 'pid' && x.k !== 'val.player_missing'; });
        if (hst === 'no') { var nmh = (r.np.first + ' ' + r.np.last).trim(); if (!r.np.birth) a.push({ c: 'np', level: 'err', k: 'val.homonym_birth_missing', p: [nmh] }); else if (V.isDate(r.np.birth) && HO.sameBirth(hcs, r.np.birth)) a.push({ c: 'np', level: 'err', k: 'val.homonym_same_birth', p: [nmh, r.np.birth] }); }
        var miss = []; if (!r.np.first) miss.push(t('col.first_name')); if (!r.np.last) miss.push(t('col.last_name')); if (!r.np.pos) miss.push(t('col.position')); npArrivalCheck(r.np, miss, a);
        if (miss.length) a.push({ c: 'np', level: 'err', k: 'val.np_missing', p: [miss.join(', ')] });
        if (r.np.birth && !V.isDate(r.np.birth)) a.push({ c: 'np', level: 'err', k: 'val.date_format', p: [] });
        else if (!r.np.birth && hst !== 'no') a.push({ c: 'np', level: 'warn', k: 'val.np_birth_later', p: [t('ev.tab_pl')] });
        var rs = r.touched ? PC.resolve(r.pname, null, list, 'new') : null; if (rs && rs.st === 'near') a.push({ c: 'np', level: 'warn', k: 'val.pl_near_new', p: [rs.near.name] });
      }
      return a;
    }
    function newPidCell(tab, i, r, a) {
      var hp = !r.pid && r.hc && r.hc.length && HO.status(trCands(r), r.homo) === 'ask', al = a.filter(function (x) { return x.c === 'pid' || x.c === 'np'; }), cr = r[NEWP[tab][0]] === NEWP[tab][1], list = cellList(tab, r);
      return '<td class="ci' + (hp ? ' warn' : cellClass(al.filter(function (x) { return x.c === 'pid'; }), 'pid')) + '">' + PC.cellHTML({ r: i, c: 'pname', value: r.pid ? nameOf(r.pid) : r.pname || '', list: list, unknown: cr ? 'new' : 'free', listId: 'dl-new-' + tab + '-' + i, label: t('col.player'), touched: r.touched, noSug: true, res: hp ? { st: 'homo', p: null, near: null } : null }, esc, t) +
        PC.datalistHTML('dl-new-' + tab + '-' + i, list.slice().sort(function (x, y) { return x.name.localeCompare(y.name, state.lang); }), esc, t) + '</td>';
    }
    // ligne sous la ligne : question « Même joueur ? » et champs du nouveau joueur
    function newRowHTML(tab, i, r, a, span) {
      var hc = r.hc && r.hc.length ? trCands(r) : [], inner = '', note = fmt(tab === 'ct' ? 'ev.np_note_ct' : 'ev.np_note_mv', [r.date || '—']);
      var npx = function () { return npxCore({ r: i, pre: 'np_', pc: 'pname', id: 'npx-' + tab + '-' + i, sl: r, al: a, list: newList(r), tag: fmt('ev.np_tag', [r.pname]), note: note }); };
      if (hc.length) { inner = homoBox(tab + '-r' + i, { homo: r.homo, birth: r.np && r.np.birth }, hc, r.pname, hc[0].position_group) + (HO.status(hc, r.homo) === 'no' && r.np ? npx() : ''); }
      else if (r.np) inner = npx();
      return inner ? '<tr class="npx-row"><td colspan="' + span + '">' + inner + '</td></tr>' : '';
    }
    // migration 79 (Gabriel, 2026-11-23) : toute création de joueur demande le poste secondaire (facultatif), le statut à l'arrivée
    // (obligatoire) et, pour une recrue, les matchs des critères 1 (saison de l'arrivée) et 2 (saison précédente), de 0 à 84
    function npArrivalCheck(np, miss, a) {
      if (!np.status) miss.push(t('pl.col_status'));
      if (np.status === 'Rookie') { if (np.gp1 === '' || np.gp1 == null) miss.push(t('col.gp_prior1')); if (np.gp2 === '' || np.gp2 == null) miss.push(t('col.gp_prior2')); }
      if (np.status === 'Rookie' && ['gp1', 'gp2'].some(function (k) { var v = np[k]; return v !== '' && v != null && !(/^\d{1,2}$/.test(String(v)) && +v <= 84); })) a.push({ c: 'np', level: 'err', k: 'val.np_gp_prior', p: [] });
      if (np.pos2 && np.pos2 === np.pos) a.push({ c: 'np', level: 'err', k: 'val.pos2_same', p: [] });
      else if (np.pos2 && np.pos && V.secondaryOptions(np.pos).indexOf(np.pos2) < 0) a.push({ c: 'np', level: 'err', k: 'val.pos2_group', p: [] });
    }
    function npArrival(np) {
      var o = {}; if (np.pos2 && np.pos !== 'G') o.position_secondary_original = np.pos2; if (np.status) o.status_at_acquisition = np.status;
      if (np.status === 'Rookie') { o.rookie_gp_current = +np.gp1; o.rookie_gp_previous = +np.gp2; }
      return o;
    }
    function newPlayerPayload(r) {   // forme de ft_private.event_new_player (migrations 77 et 79)
      var np = r.np, o = Object.assign({ first_name: np.first, last_name: np.last, position_original: np.pos, birth_date: np.birth || null }, npArrival(np)), x = np.extra || {};
      Object.keys(x).forEach(function (k) { if (x[k] !== '' && x[k] != null) o[k] = x[k]; });
      if (HO.status(r.hc && r.hc.length ? trCands(r) : [], r.homo) === 'no') o.distinct_from = HO.find(DATA.homo, np.first + ' ' + np.last, POSGRP[np.pos]).map(function (p) { return p.id; });
      return o;
    }
    function contractList() {
      var l = DATA.base.ct.map(function (c) { var ed = ctEdit(c[0]); if (!ed) return { id: 'b' + c[0], pid: c[2], start: c[8], end: c[9], aav: c[6] }; var r = ctRowOf(c), d = V.contractDerived(r); return { id: 'b' + c[0], pid: r.pid, start: V.num(r.first) !== null ? r.first + '-07-01' : r.date, end: d.end || null, aav: V.num(r.aav) }; });
      entries.ct.forEach(function (r, i) { var d = V.contractDerived(r); if (r.pid && d.end) l.push({ id: 'n' + i, pid: r.pid, start: V.num(r.first) !== null ? r.first + '-07-01' : r.date, end: d.end, aav: V.num(r.aav) }); });
      return l;
    }
    function ctx() {
      var list = contractList();
      return { cap: capBy, currentSeason: DATA.franchise.current, homoCands: npCands,
               contractsOf: function (pid, id) { return list.filter(function (o) { return o.pid === pid && o.id !== id; }); },
               aavAt: function (pid, d) { var c = list.filter(function (o) { return o.pid === pid && o.start <= d && o.end >= d; })[0]; return c ? c.aav : null; } };
    }


    // ---- mouvements et blessures : tous les événements de la saison, modifiables après l'envoi ----
    function scheduleOf(season) { return (DATA.schedule || {})[String(season)] || []; }
    function mvEdit(id) { return entries.mvx.filter(function (x) { return x.id === id; })[0]; }
    function claimedOf(v) { return v === 1 || v === true ? 'yes' : v === 0 || v === false ? 'no' : ''; }
    function gamesOfRow(r) { return r.move === 'injury' && V.isDate(r.date) && V.isDate(r.ret) ? V.missedGames(scheduleOf(V.seasonOf(r.date)), r.date, r.ret) : null; }
    // lignes de la table : événements enregistrés de la saison (avec les modifications en attente), puis les nouvelles lignes
    function mvItems() { var inj = state.tab === 'inj'; return mvAll().filter(function (it) { return (it.r.move === 'injury') === inj; }); }   // lignes de l'onglet affiché
    function mvAll() {
      var items = [];
      DATA.base.mv.filter(function (b) { return b[0] === state.season; }).forEach(function (b) {
        var ed = mvEdit(b[7]), g = function (k, d) { return ed && ed[k] != null ? ed[k] : d; };
        items.push({ kind: 'base', id: b[7], edited: !!ed, r: { id: b[7], date: g('date', b[1]), pid: g('pid', b[2]), move: g('move', b[3]), ret: g('ret', b[4] || ''), claimed: g('claimed', claimedOf(b[6])) } });
      });
      entries.mv.forEach(function (r, i) { items.push({ kind: 'new', i: i, r: r }); });
      return items;
    }
    function mvSetCell(ri, c, raw) {
      if (c === 'pid' && state.tab !== 'inj' && freeCell('mv', mvItems()[ri]) && !/^-?\d+$/.test(String(raw == null ? '' : raw).trim())) c = 'pname';   // nom collé ou tapé sur une nouvelle ligne
      if (c === 'pname' || /^np_/.test(c)) return evNewCell('mv', mvItems()[ri], c, raw);
      var def = SCHEMA[state.tab === 'inj' ? 'inj' : 'mv'].filter(function (d) { return d[0] === c; })[0]; if (!def || c === 'games') return false;
      var v = String(raw == null ? '' : raw).trim(), items = mvItems(), it = items[ri];
      if (c === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      if (!it) { var nb = blank('mv'); nb.move = state.tab === 'inj' ? 'injury' : ''; entries.mv.push(nb); it = { kind: 'new', i: entries.mv.length - 1, r: nb }; }
      var tgt = it.kind === 'new' ? entries.mv[it.i] : (mvEdit(it.id) || (entries.mvx.push({ id: it.id }), mvEdit(it.id)));
      tgt[c] = v; if (c === 'pid') { tgt.pname = v == null ? '' : nameOf(v); dropNew(tgt); }
      if (c === 'move' && v !== 'waiver_claim') dropNew(tgt);   // nouveau joueur : réclamation au ballottage seulement
      if (c === 'move' && v === 'waiver_claim' && it.kind === 'new') newFromName('mv', tgt);
      // formulaire conditionnel : « retour » seulement pour une blessure, « réclamé » seulement pour une cession à la LAH
      if (c === 'move') { if (v !== 'injury') tgt.ret = ''; if (v !== 'send_down') tgt.claimed = ''; }
      persist(); return true;
    }
    function mvCtx() {
      var cx = ctx(), inj = []; cx.currentSeason = state.season; mvAll().forEach(function (it) { if (it.r.move === 'injury' && it.r.pid && V.isDate(it.r.date)) inj.push({ id: it.kind === 'base' ? it.id : 'n' + it.i, pid: it.r.pid, date: it.r.date, ret: it.r.ret || null }); });
      cx.stints = DATA.stints || null; cx.scheduleOf = scheduleOf; cx.gamesPerSeason = DATA.franchise.games || 82;
      cx.injuriesOf = function (pid, id) { return inj.filter(function (o) { return o.pid === pid && o.id !== id; }); }; return cx;
    }
    function mvAlerts(all) {   // all : les deux onglets (envoi commun) ; sinon les lignes de l'onglet affiché
      var cx = mvCtx(); return (all ? mvAll() : mvItems()).map(function (it) { var a = V.validateMove(Object.assign({}, it.r, { id: it.kind === 'base' ? it.id : 'n' + it.i }), cx); if (it.r.pid == null && it.r.pname && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] }); if (V.isDate(it.r.date) && V.seasonOf(it.r.date) !== state.season) a.push({ c: 'date', level: 'warn', k: 'val.date_other_season', p: [] }); return newCap('mv', it) ? npAlerts(it.r, a, newList(it.r)) : pickHint('mv', it, a); });
    }
    // joueurs actifs avec l'équipe à la date de l'événement (le joueur déjà choisi reste affiché pour pouvoir le corriger)
    function mvPlayers(date, current) {
      var list = allPlayers().filter(function (p) { return p.id === current || p.id < 0 || !DATA.stints || !V.isDate(date) || V.activeAt(DATA.stints, p.id, date); });
      return list.sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); });
    }
    function mvGridHTML() {
      var isInj = state.tab === 'inj', items = mvItems(), al = mvAlerts(), body = '', total = 0, sc = SCHEMA[isInj ? 'inj' : 'mv'], def = function (c) { return sc.filter(function (d) { return d[0] === c; })[0]; }, na = '<td class="d ro na"></td>';
      for (var i = 0; i <= items.length; i++) {
        var it = items[i], r = it ? it.r : Object.assign(blank('mv'), { move: isInj ? 'injury' : '' }), a = al[i] || [], inj = r.move === 'injury', sd = r.move === 'send_down', g = inj && it ? gamesOfRow(r) : null;
        total += a.length;
        var opts = '<option value=""></option>' + mvPlayers(r.date, r.pid).map(function (p) { return '<option value="' + p.id + '"' + (p.id === r.pid ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
        body += '<tr data-row="' + i + '"' + (it && it.kind === 'base' ? ' class="saved' + (it.edited ? ' edited' : '') + '"' : '') + '>' + cellHTML(def('date'), r, i, a) +
          (freeCell('mv', it) && !isInj ? newPidCell('mv', i, r, a) : '<td class="ci' + cellClass(a, 'pid') + '"' + cellTitle(a, 'pid') + '><select class="cell" data-r="' + i + '" data-c="pid" aria-label="' + esc(t('col.player')) + '">' + opts + '</select></td>') +
          (isInj ? cellHTML(def('ret'), r, i, a) + '<td class="num d' + cellClass(a, 'games') + '"' + cellTitle(a, 'games') + '>' + (g == null ? '—' : g) + '</td>'
                 : cellHTML(def('move'), r, i, a) + (sd ? cellHTML(def('claimed'), r, i, a) : na)) +
          '<td class="al" title="' + esc(alertsText(a)) + '">' + (a.length ? '<span class="badge' + (a.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '">' + a.length + '</span>' : '') + '</td><td>' + (it && (it.kind === 'new' || it.edited) ? '<button class="x" data-rm="' + i + '" title="' + esc(t(it.kind === 'new' ? 'ev.remove' : 'ev.undo_edit')) + '">×</button>' : '') + '</td></tr>' + (newCap('mv', it) ? newRowHTML('mv', i, r, a, sc.length + 2) : '');
      }
      var head = '<tr>' + sc.map(function (d) { return '<th>' + esc(t(d[1])) + '</th>'; }).join('') + '<th></th><th></th></tr>';
      return { html: '<div class="scroll' + (items.length > 16 ? ' vs' : '') + '"><table class="grid ev mv' + (isInj ? ' inj' : '') + '" id="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: total };
    }
    // Aide en contexte (connect/ft_help.js), comme l'écran Saisie : bloc de l'onglet (« Où trouver », ordre, erreurs, alertes), bloc commun replié dessous
    // (absent de la Liste des joueurs, sans grille). Fermée par défaut ; état mémorisé dans ft_help_events. Maquette validée : docs/maquettes/aide_evenements.html.
    var HELP_COLS = {
      inj: { where: ['inj_where'], order: 3, errors: 3, alerts: ['inj_al_return', 'inj_al_games', 'inj_al_season'] },   // phase 4b : aide séparée (Blessures, Mouvements)
      mv: { p: 'mo', where: ['mo_where'], order: 3, errors: 3, alerts: ['mo_al_new', 'mo_al_claimed', 'mo_al_season'] },
      ct: { where: ['ct_where', 'ct_where_end'], order: 4, errors: 3, alerts: ['ct_al_new', 'ct_al_calc', 'ct_al_aav', 'ct_al_first', 'ct_al_other'] },
      tr: { where: ['tr_where'], order: 4, errors: 3, alerts: ['tr_al_side', 'tr_al_new', 'tr_al_same', 'tr_al_near', 'tr_al_ours'] },
      os: { where: ['os_where'], order: 3, errors: 3, alerts: ['os_al_nopick', 'os_al_dup'] },
      pc: { where: ['pc_where'], order: 3, errors: 2, alerts: ['pc_al_same'] },
      pl: { where: ['pl_where'], order: 3, errors: 3, alerts: ['pl_al_blocked', 'pl_al_pick', 'pl_al_odd', 'pl_al_label'] }
    };
    var HELP_COMMON = ['ev.help_c_season', 'ev.help_c_active', 'ev.help_c_hatched', 'ev.help_c_numbers', 'ev.help_c_paste', 'ev.help_c_badge', 'entry.help_c_refused', 'ev.help_c_bar', 'ev.help_c_homonym'];
    var HELP_HINT = { tr: 'ev.tr_hint', pl: 'ev.pl_hint' };   // rappel court sur la ligne du bouton ; les autres onglets : ev.hint
    function helpHTML() {
      var H = 'ev.help_', tab = state.tab, c = HELP_COLS[tab];
      var k = function (a) { return a.map(function (x) { return H + x; }); };
      var n = function (part, cnt) { var a = []; for (var i = 1; i <= cnt; i++) a.push(H + (c.p || tab) + '_' + part + '_' + i); return a; };
      var FH = root.FTHELP || (typeof require !== 'undefined' ? require('../connect/ft_help.js') : null);
      return FH.html({
        screen: 'events', prefix: 'ev.', t: t, esc: esc, defaults: { open: false, common: false },
        top: { h: H + 'h_where', items: k(c.where), lead: true },
        summary: esc(t(HELP_HINT[tab] || 'ev.hint')), chip: t(tab === 'inj' ? 'nav.t.roster.injuries' : tab === 'mv' ? 'nav.t.roster.moves' : 'ev.tab_' + tab),
        note: tab === 'pl' ? H + 'pl_note' : null,
        cols: [[{ h: 'entry.help_h_order', items: n('order', c.order), ordered: true }], [{ h: 'entry.help_h_errors', items: n('err', c.errors), lead: true }], [{ h: 'entry.help_h_alerts', items: k(c.alerts), lead: true }]],
        common: tab === 'pl' ? [] : HELP_COMMON
      });
    }


    // ---- contrats : tous les événements de la saison, modifiables ; clauses par année ; offres hostiles ----
    function clauseText(c) { c = String(c || ''); return state.lang === 'fr' ? c.replace(/M-NTC/g, 'CNÉ-M').replace(/NMC/g, 'CNM').replace(/\bNTC\b/g, 'CNÉ') : c; }
    function firstSeasons() { var l = [], a = DATA.franchise.first - 8, z = DATA.franchise.first + 25; for (var y = a; y <= z; y++) l.push(y); return l; }
    function ctEdit(id) { return entries.ctx.filter(function (x) { return x.id === id; })[0]; }
    function ctRowOf(c) {
      var ed = ctEdit(c[0]), g = function (k, d) { return ed && ed[k] != null ? ed[k] : d; }, r = { id: c[0], date: g('date', c[1]), pid: g('pid', c[2]), event: g('event', c[3]), ctype: g('ctype', c[4] || ''), years: g('years', c[5] == null ? '' : c[5]), first: g('first', c[7] == null ? '' : c[7]), aav: g('aav', c[6] == null ? '' : c[6]) };
      for (var k = 1; k <= 8; k++) r['cl' + k] = ed && ed['cl' + k] != null ? ed['cl' + k] : ((c[11] || [])[k - 1] || '');
      return r;
    }
    function ctItems() {
      var items = [];
      DATA.base.ct.filter(function (c) { return inSeason(c[1]); }).forEach(function (c) { items.push({ kind: 'base', id: c[0], edited: !!ctEdit(c[0]), r: ctRowOf(c) }); });
      entries.ct.forEach(function (r, i) { items.push({ kind: 'new', i: i, r: r }); });
      return items;
    }
    function ctSetCell(ri, c, raw) {
      if (c === 'pid' && freeCell('ct', ctItems()[ri]) && !/^-?\d+$/.test(String(raw == null ? '' : raw).trim())) c = 'pname';   // nom collé ou tapé sur une nouvelle ligne
      if (c === 'pname' || /^np_/.test(c)) return evNewCell('ct', ctItems()[ri], c, raw);
      var def = SCHEMA.ct.filter(function (d) { return d[0] === c; })[0]; if (!def) return false;
      var v = String(raw == null ? '' : raw).trim(), items = ctItems(), it = items[ri];
      if (c === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      else if (c === 'aav') { v = GIC.num(v, state.lang); if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : Math.round(v); }   // format de la langue (FTGIC.num)
      else if (c === 'years' || c === 'first') { if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : +v; }
      if (!it) { entries.ct.push(blank('ct')); it = { kind: 'new', i: entries.ct.length - 1, r: entries.ct[entries.ct.length - 1] }; }
      var tgt = it.kind === 'new' ? entries.ct[it.i] : (ctEdit(it.id) || (entries.ctx.push({ id: it.id }), ctEdit(it.id))), k;
      tgt[c] = v; if (c === 'pid') { tgt.pname = v == null ? '' : nameOf(v); dropNew(tgt); }
      if (c === 'event' && v !== 'free_agent') dropNew(tgt);   // nouveau joueur : agent libre seulement
      if (c === 'event' && v === 'free_agent' && it.kind === 'new') newFromName('ct', tgt);
      // formulaire conditionnel : rachat et libération n'ont ni type, ni années, ni saison, ni salaire, ni clause ; les clauses n'existent que pour un contrat à un volet, une par année du contrat
      if (c === 'event' && V.NO_TERMS.indexOf(v) >= 0) { ['ctype', 'years', 'first', 'aav'].forEach(function (x) { tgt[x] = ''; }); for (k = 1; k <= 8; k++) tgt['cl' + k] = ''; }
      if (c === 'ctype' && v !== 'one_way') for (k = 1; k <= 8; k++) tgt['cl' + k] = '';
      if (c === 'years') for (k = 1; k <= 8; k++) if (v === '' || k > +v) tgt['cl' + k] = '';
      persist(); return true;
    }
    function ctAlerts() {
      var cx = ctx(); cx.stints = DATA.stints || null;
      return ctItems().map(function (it) { var a = ctAlert0(it, cx); return newCap('ct', it) ? npAlerts(it.r, a, newList(it.r)) : pickHint('ct', it, a); });
    }
    function ctAlert0(it, cx) { { var a = V.validateContract(Object.assign({}, it.r, { id: it.kind === 'base' ? 'b' + it.id : 'n' + it.i }), cx); if (it.r.pid == null && it.r.pname && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] }); if (V.isDate(it.r.date) && V.seasonOf(it.r.date) !== state.season) a.push({ c: 'date', level: 'warn', k: 'val.date_other_season', p: [] }); return a; } }
    function ctPlayers(date, current, event) { return V.ACTIVE_ONLY.indexOf(event) >= 0 ? mvPlayers(date, current) : allPlayers().sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); }); }
    function selTD(c, ri, a, opts, val) { return '<td class="ci' + cellClass(a, c) + '"' + cellTitle(a, c) + '><select class="cell" data-r="' + ri + '" data-c="' + c + '" aria-label="' + esc(t((SCHEMA[state.tab].filter(function (d) { return d[0] === c; })[0] || [0, c])[1])) + '"><option value=""></option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td>'; }
    function alertTD(a, removable, label) { return '<td class="al" title="' + esc(alertsText(a)) + '">' + (a.length ? '<span class="badge' + (a.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '">' + a.length + '</span>' : '') + '</td><td>' + (removable ? '<button class="x" data-rm="@" title="' + esc(label) + '">×</button>' : '') + '</td>'; }
    function playerOpts(list, cur) { return list.map(function (p) { return [p.id, p.name]; }); }
    function ctGridHTML() {
      var items = ctItems(), al = ctAlerts(), body = '', total = 0, sc = SCHEMA.ct, def = function (c) { return sc.filter(function (d) { return d[0] === c; })[0]; }, na = '<td class="d ro na"></td>', yrsOpts = [1, 2, 3, 4, 5, 6, 7, 8].map(function (y) { return [y, y]; }), fsOpts = firstSeasons().map(function (y) { return [y, sl(y)]; }), clOpts = V.CLAUSES.map(function (c) { return [c, clauseText(c)]; });
      for (var i = 0; i <= items.length; i++) {
        var it = items[i], r = it ? it.r : blank('ct'), a = al[i] || [], terms = V.NO_TERMS.indexOf(r.event) < 0, one = terms && r.ctype === 'one_way', yrs = +r.years || 0, k, fo = fsOpts.slice();
        if (r.first !== '' && r.first != null && !fo.some(function (o) { return +o[0] === +r.first; })) fo.push([r.first, sl(+r.first)]);
        total += a.length;
        var d = it && terms ? derived('ct', r, i) : ['—', '—'], row = '<tr data-row="' + i + '"' + (it && it.kind === 'base' ? ' class="saved' + (it.edited ? ' edited' : '') + '"' : '') + '>' + cellHTML(def('date'), r, i, a) + (freeCell('ct', it) ? newPidCell('ct', i, r, a) : selTD('pid', i, a, playerOpts(ctPlayers(r.date, r.pid, r.event), r.pid), r.pid)) + cellHTML(def('event'), r, i, a) +
          (terms ? cellHTML(def('ctype'), r, i, a) : na) + (terms ? selTD('years', i, a, yrsOpts, r.years) : na) + (terms ? selTD('first', i, a, fo, r.first) : na) + (terms ? cellHTML(def('aav'), r, i, a) : na);
        for (k = 1; k <= 8; k++) row += one && k <= yrs ? selTD('cl' + k, i, a, clOpts, r['cl' + k]) : na;
        body += row + d.map(function (x, n) { return '<td class="num d" data-d="' + n + '">' + esc(x) + '</td>'; }).join('') + alertTD(a, it && (it.kind === 'new' || it.edited), t(it && it.kind === 'new' ? 'ev.remove' : 'ev.undo_edit')).replace('data-rm="@"', 'data-rm="' + i + '"') + '</tr>' +
          (newCap('ct', it) ? newRowHTML('ct', i, r, a, sc.length + 4) : '');
      }
      var head = '<tr>' + sc.map(function (d) { return '<th>' + esc(t(d[1])) + '</th>'; }).join('') + '<th class="d">' + esc(t('col.last_season')) + '</th><th class="d">' + esc(t('col.end_date')) + '</th><th></th><th></th></tr>';
      return { html: '<div class="scroll' + (items.length > 14 ? ' vs' : '') + '"><table class="grid ev ct" id="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: total };
    }
    // ---- offres hostiles ----
    function osAlerts() { var cx = { stints: DATA.stints || null }; return entries.os.map(function (r) { var a = V.validateOffer(r, cx); if (r.pname && !r.pid) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] }); return a; }); }
    function osSetCell(ri, c, raw) {
      var def = SCHEMA.os.filter(function (d) { return d[0] === c; })[0]; if (!def) return false;
      var v = String(raw == null ? '' : raw).trim();
      if (c === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      else if (def[2] === 'int' || def[2] === 'rsel') { if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : Math.round(+v); }
      else if (def[2] === 'team') { var tcode = TC.resolve(v, DATA.teams); if (tcode === null) return false; v = tcode; }
      if (ri >= entries.os.length) { entries.os.push(blank('os')); ri = entries.os.length - 1; }
      var r = entries.os[ri]; r[c] = v; if (c === 'pid') r.pname = v == null ? '' : nameOf(v);
      if (c === 'comp' && v !== 'yes') for (var k = 1; k <= 4; k++) { r['p' + k + 't'] = ''; r['p' + k + 'y'] = ''; r['p' + k + 'r'] = ''; }   // les choix de compensation n'existent qu'avec une compensation
      persist(); return true;
    }
    function osGridHTML() {
      var rows = entries.os, al = osAlerts(), body = '', total = 0, sc = SCHEMA.os, def = function (c) { return sc.filter(function (d) { return d[0] === c; })[0]; }, na = '<td class="d ro na"></td>', rOpts = [1, 2, 3, 4, 5, 6, 7].map(function (x) { return [x, x]; });
      for (var i = 0; i <= rows.length; i++) {
        var r = rows[i] || blank('os'), a = al[i] || [], comp = r.comp === 'yes', pl = (r.event === 'unmatched' ? mvPlayers(r.date, r.pid) : allPlayers().sort(function (x, y) { return x.name.localeCompare(y.name, state.lang); }));
        total += a.length;
        var row = '<tr data-row="' + i + '">' + cellHTML(def('date'), r, i, a) + selTD('pid', i, a, playerOpts(pl, r.pid), r.pid) + cellHTML(def('event'), r, i, a) + cellHTML(def('comp'), r, i, a);
        for (var k = 1; k <= 4; k++) row += comp ? cellHTML(def('p' + k + 't'), r, i, a) + cellHTML(def('p' + k + 'y'), r, i, a) + selTD('p' + k + 'r', i, a, rOpts, r['p' + k + 'r']) : na + na + na;
        body += row + alertTD(a, !!rows[i], t('ev.remove')).replace('data-rm="@"', 'data-rm="' + i + '"') + '</tr>';
      }
      var head = '<tr>' + sc.map(function (d) { return '<th>' + esc(t(d[1])) + '</th>'; }).join('') + '<th></th><th></th></tr>';
      return { html: '<div class="scroll"><table class="grid ev os" id="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: total };
    }


    // ---- transactions : un échange = deux équipes × 5 éléments (joueur ou choix), champs conditionnels selon le type ----
    var TR_SLOTS = 5, TR_SIDES = ['out', 'in'];
    function logoHTML(code) { var c = String(code || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c === 'VEG') c = 'VGK'; return c ? '<img class="tlogo" src="https://assets.nhle.com/logos/nhl/svg/' + c + '_light.svg" alt="" loading="lazy">' : ''; }
    function teamNm(code) { var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? tn(tm.en) : code || ''; }
    function newSlot() { return { type: '', pid: null, pname: '', np: null, touched: false, ret: '', ryears: '', orig: '', year: '', round: '' }; }
    function newTrade() { var last = entries.trf[entries.trf.length - 1], o = { date: (last && last.date) || DATA.franchise.date, partner: '', editId: null, out: [], in: [] }; for (var i = 0; i < TR_SLOTS; i++) { o.out.push(newSlot()); o.in.push(newSlot()); } return o; }
    function trFromBase(x) {
      var o = { date: x.date, partner: x.partner, editId: x.id, out: [], in: [] }; for (var i = 0; i < TR_SLOTS; i++) { o.out.push(newSlot()); o.in.push(newSlot()); }
      var n = { out: 0, in: 0 }; x.assets.forEach(function (a) { var s = o[a[0]][n[a[0]]++]; if (!s) return; s.type = a[1]; if (a[1] === 'player') { s.pid = a[2]; s.pname = nameOf(a[2]); s.ret = a[6] == null ? '' : a[6]; s.ryears = a[7] == null ? '' : a[7]; } else { s.year = a[3] == null ? '' : a[3]; s.round = a[4] == null ? '' : a[4]; s.orig = a[5] || ''; } });
      return o;
    }
    function trSetCell(ti, c, raw) {
      var v = String(raw == null ? '' : raw).trim(), parts = c.split(':'), field = parts.length === 3 ? parts[2] : c;
      if (parts.length === 1) { if (c === 'partner') { var code = TC.resolve(v, DATA.teams); if (code === null) return false; v = code; } else if (c !== 'date') return false; }
      else if (['out', 'in'].indexOf(parts[0]) < 0 || +parts[1] >= TR_SLOTS) return false;
      else if (field === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      else if (field === 'orig') { var oc = TC.resolve(v, DATA.teams); if (oc === null) return false; v = oc; }
      else if (['ret', 'ryears', 'year', 'round'].indexOf(field) >= 0) { v = GIC.num(v, state.lang); if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : Math.round(+v); }
      else if (field === 'type' && v !== '' && v !== 'player' && v !== 'pick') return false;
      var tr = entries.trf[ti]; if (!tr) { tr = newTrade(); entries.trf.push(tr); }
      if (parts.length === 3 && parts[0] === 'in' && (field === 'pname' || /^np_/.test(field))) { var sl0 = tr.in[+parts[1]]; if (field === 'pname') setInName(tr, sl0, String(raw == null ? '' : raw)); else { sl0.np = sl0.np || { first: '', last: '', pos: '', birth: '' }; sl0.np[field.slice(3)] = field === 'np_pos' ? v.toUpperCase() : v; } persist(); return true; }
      if (parts.length === 1) tr[c] = v;
      else {
        var sl = tr[parts[0]][+parts[1]]; sl[field] = v; if (field === 'pid') sl.pname = v == null ? '' : nameOf(v);
        // champs conditionnels : un joueur n'a ni équipe d'origine, ni année, ni ronde ; un choix n'a ni joueur ni rétention
        if (field === 'type') { if (v !== 'player') { sl.pid = null; sl.pname = ''; sl.ret = ''; sl.ryears = ''; } if (v !== 'pick') { sl.orig = ''; sl.year = ''; sl.round = ''; } }
      }
      persist(); return true;
    }
    // nom tapé côté reçu : joueur reconnu → lié ; inconnu ou proche → nouveau joueur à créer (prénom, nom, poste, date facultative)
    function setInName(tr, sl, text) {
      var list = inList(tr), v = PC.complete(text.trim(), null, list), res = PC.resolve(v, null, list, 'new');
      sl.touched = true; sl.type = 'player';
      // nom exact d'un joueur connu : plus de lien d'office, question « Même joueur ? » (décision du 2026-11-17)
      if ((res.st === 'linked' || res.st === 'hist') && res.p.label && HO.norm(v) === HO.norm(res.p.label)) { sl.pid = res.p.id; sl.pname = res.p.name; sl.np = null; delete sl.hc; delete sl.homo; return; }   // étiquette d'homonyme choisie : ce joueur-là
      if (res.st === 'linked' || res.st === 'hist') { var k = HO.norm(res.p.name); sl.pid = null; sl.pname = res.p.name; sl.np = null; delete sl.homo; sl.hc = list.filter(function (p) { return HO.norm(p.name) === k; }).map(function (p) { return p.id; }); return; }
      delete sl.hc; delete sl.homo;
      sl.pid = null; sl.pname = v; if (!v) { sl.np = null; return; }
      var w = v.split(/\s+/), np = sl.np || { first: '', last: '', pos: '', birth: '' };
      if (!sl.np || (np.first + ' ' + np.last).trim() === '') { np.first = w[0] || ''; np.last = w.slice(1).join(' '); }
      sl.np = np;
    }
    function trModel() {
      var rows = [], meta = [], cx = ctx(); cx.stints = DATA.stints || null;
      entries.trf.forEach(function (tr, ti) { TR_SIDES.forEach(function (side) { tr[side].forEach(function (sl, s) {
        if (!(sl.type || sl.pid || sl.ret !== '' || sl.ryears !== '' || sl.orig || sl.year !== '' || sl.round !== '')) return;
        rows.push({ date: tr.date, partner: tr.partner, grp: 'g' + ti, dir: side, type: sl.type, pid: sl.pid, pname: sl.pname, np: side === 'in' ? sl.np : null, hc: side === 'in' ? sl.hc || null : null, homo: side === 'in' ? sl.homo || null : null, touched: sl.touched, inl: side === 'in' ? inList(tr) : null, year: sl.year, round: sl.round, orig: sl.orig, ret: sl.ret, ryears: sl.ryears }); meta.push({ t: ti, side: side, s: s }); }); }); });
      var groups = V.tradeGroups(rows), gA = {}; groups.order.forEach(function (k) { gA[k] = V.validateTradeGroup(rows, groups.g[k]); });
      var alerts = rows.map(function (r) {
        var a = V.validateTradeRow(r, cx).filter(function (x) { return x.c !== 'date' && x.c !== 'partner' && x.c !== 'dir'; });
        if (r.type === 'player' && r.pid && V.isDate(r.date) && cx.stints) { var act = V.activeAt(cx.stints, r.pid, r.date); if (r.dir === 'out' && !act) a.push({ c: 'pid', level: 'err', k: 'val.player_not_active', p: [] }); if (r.dir === 'in' && act) a.push({ c: 'pid', level: 'warn', k: 'val.trade_player_already_ours', p: [] }); }
        var hcs = r.hc && r.hc.length ? trCands(r) : [], hst = HO.status(hcs, r.homo);
        if (hst === 'ask') { a = a.filter(function (x) { return x.c !== 'pid'; }); a.push({ c: 'pid', level: 'err', k: 'val.homonym_unanswered', p: [r.pname] }); }
        if (r.np) {   // nouveau joueur reçu : prénom, nom et poste obligatoires ; date facultative (à compléter plus tard), obligatoire pour un homonyme
          a = a.filter(function (x) { return x.c !== 'pid'; });
          if (hst === 'no') { var nmh = (r.np.first + ' ' + r.np.last).trim(); if (!r.np.birth) a.push({ c: 'np', level: 'err', k: 'val.homonym_birth_missing', p: [nmh] }); else if (V.isDate(r.np.birth) && HO.sameBirth(hcs, r.np.birth)) a.push({ c: 'np', level: 'err', k: 'val.homonym_same_birth', p: [nmh, r.np.birth] }); }
          var miss = []; if (!r.np.first) miss.push(t('col.first_name')); if (!r.np.last) miss.push(t('col.last_name')); if (!r.np.pos) miss.push(t('col.position')); npArrivalCheck(r.np, miss, a);
          if (miss.length) a.push({ c: 'np', level: 'err', k: 'val.np_missing', p: [miss.join(', ')] });
          if (r.np.birth && !V.isDate(r.np.birth)) a.push({ c: 'np', level: 'err', k: 'val.date_format', p: [] });
          else if (!r.np.birth && hst !== 'no') a.push({ c: 'np', level: 'warn', k: 'val.np_birth_later', p: [t('ev.tab_pl')] });
          var rs = r.touched ? PC.resolve(r.pname, null, r.inl, 'new') : null; if (rs && rs.st === 'near') a.push({ c: 'np', level: 'warn', k: 'val.pl_near_new', p: [rs.near.name] });
        }
        else if (r.pid == null && r.pname && hst !== 'ask') a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] });
        return a; });
      var head = entries.trf.map(function (tr, ti) {
        var a = [], k = (tr.date || '') + '|' + (tr.partner || '') + '|g' + ti;
        if (!V.isDate(tr.date)) a.push({ c: 'date', level: 'err', k: 'val.date_format', p: [] });
        if (!tr.partner) a.push({ c: 'partner', level: 'err', k: 'val.required', p: [] }); else if (tr.partner === DATA.franchise.code) a.push({ c: 'partner', level: 'err', k: 'val.trade_self', p: [] });
        if (!groups.g[k]) a.push({ c: 'items', level: 'warn', k: 'val.trade_empty', p: [] }); else (gA[k] || []).forEach(function (x) { a.push({ c: 'items', level: x.level, k: x.k, p: x.p || [] }); });
        return a; });
      return { rows: rows, meta: meta, alerts: alerts, head: head };
    }
    function trSlotAlerts(m, ti, side, s) { for (var i = 0; i < m.meta.length; i++) if (m.meta[i].t === ti && m.meta[i].side === side && m.meta[i].s === s) return m.alerts[i]; return []; }
    function trCardHTML(ti, m) {
      var tr = entries.trf[ti] || newTrade(), ha = m.head[ti] || [], ours = DATA.franchise.code, na = '<td class="d ro na"></td>', rOpts = [1, 2, 3, 4, 5, 6, 7];
      var total = ha.length, ae = function (a, c) { return a.filter(function (x) { return x.c === c; }); };
      var inp = function (side, s, f, a, val, cls) { var c = side + ':' + s + ':' + f, al = ae(a, f); return '<td class="ci' + cellClass(al, f) + '"' + cellTitle(al, f) + '><input class="cell ' + (cls || 'int') + '" data-r="' + ti + '" data-c="' + c + '" value="' + esc(val == null ? '' : val) + '" autocomplete="off"></td>'; };
      var sel = function (side, s, f, a, opts, val) { var c = side + ':' + s + ':' + f, al = ae(a, f); return '<td class="ci' + cellClass(al, f) + '"' + cellTitle(al, f) + '><select class="cell" data-r="' + ti + '" data-c="' + c + '"><option value=""></option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td>'; };
      var body = '';
      for (var s = 0; s < TR_SLOTS; s++) {
        body += '<tr><th class="el" scope="row">' + esc(fmt('tr.element', [s + 1])) + '</th>';
        TR_SIDES.forEach(function (side, si) {
          var sl = tr[side][s], a = trSlotAlerts(m, ti, side, s), isP = sl.type === 'player', isK = sl.type === 'pick'; total += a.length;
          var pl = side === 'out' ? mvPlayers(tr.date, sl.pid) : allPlayers().filter(function (p) { return p.id === sl.pid || !V.isDate(tr.date) || !DATA.stints || !V.activeAt(DATA.stints, p.id, tr.date); }).sort(function (x, y) { return x.name.localeCompare(y.name, state.lang); });
          body += sel(side, s, 'type', a, [['player', t('tr.type_player')], ['pick', t('tr.type_pick')]], sl.type) + (isP ? (side === 'in' ? pcbCell(ti, s, sl, a, tr) : sel(side, s, 'pid', a, pl.map(function (p) { return [p.id, p.name]; }), sl.pid)) : na) +
            (isP ? inp(side, s, 'ryears', a, sl.ryears, 'int') + inp(side, s, 'ret', a, sl.ret, 'int') : na + na) +
            (isK ? '<td class="ci' + cellClass(ae(a, 'orig'), 'orig') + '"' + cellTitle(ae(a, 'orig'), 'orig') + '><input class="cell tcombo" list="dl-teams" data-r="' + ti + '" data-c="' + side + ':' + s + ':orig" value="' + esc(sl.orig ? teamNm(sl.orig) : '') + '" autocomplete="off"></td>' + inp(side, s, 'year', a, sl.year, 'int') + sel(side, s, 'round', a, rOpts.map(function (x) { return [x, x]; }), sl.round) : na + na + na) + (si === 0 ? '<td class="gap"></td>' : '');
        });
        body += '</tr>';
        var sl_ = tr.in[s], hc_ = sl_.hc && sl_.hc.length ? trCands(sl_) : [];
        if (hc_.length) { var hs_ = HO.status(hc_, sl_.homo); body += '<tr class="npx-row"><td colspan="16">' + homoBox('tr-' + ti + '-in-' + s, { homo: sl_.homo, birth: sl_.np && sl_.np.birth }, hc_, sl_.pname, hc_[0].position_group) + (hs_ === 'no' && sl_.np ? npxHTML(tr, ti, s, sl_, trSlotAlerts(m, ti, 'in', s)) : '') + '</td></tr>'; }
        else if (sl_.np) body += '<tr class="npx-row"><td colspan="16">' + npxHTML(tr, ti, s, sl_, trSlotAlerts(m, ti, 'in', s)) + '</td></tr>';   // toute la largeur, visible à 900 px
      }
      var sideHead = function (side) { var code = side === 'out' ? ours : tr.partner; return '<th colspan="7" class="side">' + (code ? logoHTML(code) : '') + '<span>' + esc(code ? teamNm(code) : t('tr.partner_pending')) + '</span></th>'; };
      var sub = '<th rowspan="2">' + esc(t('tr.type')) + '</th><th rowspan="2">' + esc(t('tr.player')) + '</th><th colspan="2" class="grp">' + esc(t('tr.ret_group')) + '</th><th colspan="3" class="grp">' + esc(t('tr.pick_group')) + '</th>', sub2 = '<th>' + esc(t('tr.ret_years')) + '</th><th>' + esc(t('tr.ret_amount')) + '</th><th>' + esc(t('tr.pick_team')) + '</th><th>' + esc(t('tr.pick_year')) + '</th><th>' + esc(t('tr.pick_round')) + '</th>';
      var hdA = ae(ha, 'date'), hpA = ae(ha, 'partner');
      var html = '<section class="tcard' + (tr.editId ? ' editing' : '') + '" data-ti="' + ti + '"><header class="tch"><label>' + esc(t('col.date')) + '<input class="cell date' + cellClass(hdA, 'date') + '" data-r="' + ti + '" data-c="date" value="' + esc(tr.date) + '"></label>' +
        '<label>' + esc(t('col.partner')) + '<input class="cell tcombo' + cellClass(hpA, 'partner') + '" list="dl-teams" data-r="' + ti + '" data-c="partner" value="' + esc(tr.partner ? teamNm(tr.partner) : '') + '" autocomplete="off"></label>' + (tr.partner ? logoHTML(tr.partner) : '') +
        (tr.editId ? '<span class="tedit">' + esc(fmt('tr.editing', [tr.date])) + '</span>' : '') + (ha.length ? '<span class="badge' + (ha.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '" title="' + esc(alertsText(ha)) + '">' + ha.length + '</span>' : '') +
        (entries.trf[ti] ? saveBtnHTML(tr, ti, trCardErrors(m, ti)) + '<button class="x" data-rm="' + ti + '" title="' + esc(t(tr.editId ? 'tr.undo' : 'ev.remove')) + '">×</button>' : '') + '</header>' +
        (entries.trf[ti] ? saveMsgHTML(tr, ti, trCardErrors(m, ti)) : '') +
        '<div class="scroll"><table class="grid ev trg"><thead><tr class="tsides"><th></th>' + sideHead('out') + '<th class="gap"></th>' + sideHead('in') + '</tr><tr><th></th>' + sub + '<th class="gap"></th>' + sub + '</tr><tr><th></th>' + sub2 + '<th class="gap"></th>' + sub2 + '</tr></thead><tbody>' + body + '</tbody></table></div>' + PC.datalistHTML('dl-in-' + ti, inList(tr).slice().sort(function (x, y) { return x.name.localeCompare(y.name, state.lang); }), esc, t) + '</section>';
      return { html: html, alerts: total };
    }
    // ---- bouton « Enregistrer » d'une carte d'échange (maquette approuvée) : un seul échange par appel ----
    function trCardErrors(m, ti) { var n = (m.head[ti] || []).filter(function (x) { return x.level === 'err'; }).length; m.meta.forEach(function (x, i) { if (x.t === ti) n += m.alerts[i].filter(function (a) { return a.level === 'err'; }).length; }); return n; }
    var IC = function (k) { return PC && PC.IC && PC.IC[k] ? PC.IC[k] : ''; };
    function saveBtnHTML(tr, ti, errs) {
      var blocked = errs > 0 || !sync.user, busy = tr.save === 'busy';
      var inner = busy ? '<span class="spin" aria-hidden="true"></span>' + esc(t('tr.saving')) : esc(t('tr.save'));
      return '<button type="button" class="btn tsave" data-act="save-trade" data-ti="' + ti + '" title="' + esc(t('tr.save_title')) + '" aria-describedby="tsave-msg-' + ti + '"' + (blocked || busy ? ' aria-disabled="true"' : '') + (busy ? ' aria-busy="true"' : '') + '>' + inner + '</button>';
    }
    function saveMsgHTML(tr, ti, errs) {
      var m = '', cls = 'mu', role = 'status';
      if (tr.save === 'fail') { cls = 'er'; role = 'alert'; m = IC('err') + '<span>' + esc(fmt('tr.save_failed', [tr.msg || ''])) + '</span>'; }
      else if (!sync.user) m = '<span>' + esc(t('tr.save_login')) + '</span>';
      else if (errs) m = '<span>' + esc(t('tr.save_blocked')) + '</span>';
      return '<p class="tsave-msg ' + cls + '" id="tsave-msg-' + ti + '" role="' + role + '">' + m + '</p>';
    }
    // message technique du serveur (droits, JSON…) → texte générique ; les messages en français des fonctions RPC sont gardés
    function plainError(msg) { return /permission denied|JWT|PGRST|json|syntax error|violates|row-level/i.test(msg || '') ? t('sb.failed_generic') : msg; }
    async function saveTrade(client, ti) {
      var tr = entries.trf[ti]; if (!tr || tr.save === 'busy') return false;
      var m = trModel(); if (!sync.user || trCardErrors(m, ti)) return false;
      tr.save = 'busy'; tr.msg = '';
      try {
        var fid = await client.ensureFranchise(); if (fid == null) throw new Error(t('sb.no_franchise'));
        var rows = m.rows.filter(function (r, i) { return m.meta[i].t === ti; });
        if (rows.some(function (r) { return r.pid != null && r.pid < 0; })) throw new Error(t('sb.new_player_first'));
        var date = tr.date, partner = tr.partner;
        entries.tr = rows; await pushTab(client, fid, 'tr'); entries.tr = [];
        entries.trf.splice(ti, 1); persist();
        if (V.isDate(date)) await pullTab(client, 'tr', V.seasonOf(date)); if (V.isDate(date) && V.seasonOf(date) !== state.season) await pullTab(client, 'tr', state.season);
        say('ok', 'tr.saved_msg', [date, teamNm(partner)]); return true;
      } catch (e) { entries.tr = []; tr.save = 'fail'; tr.msg = HO.errText(e, t) || plainError(e.message); persist(); return false; }
      finally { if (tr.save === 'busy') tr.save = ''; }
    }
    // ---- côté reçu : choix d'un joueur avec saisie libre (FTPC) et sous-ligne « nouveau joueur » (maquette approuvée) ----
    function pcbCell(ti, s, sl, a, tr) {
      var al = a.filter(function (x) { return x.c === 'pid' || x.c === 'np'; });
      var hp = !sl.pid && sl.hc && sl.hc.length && HO.status(trCands(sl), sl.homo) === 'ask';   // réponse attendue : état « homo » (trait pointillé orange)
      return '<td class="ci' + (hp ? ' warn' : cellClass(al.filter(function (x) { return x.c === 'pid'; }), 'pid')) + '">' + PC.cellHTML({ r: ti, c: 'in:' + s + ':pname', value: sl.pid ? nameOf(sl.pid) : sl.pname, list: inList(tr), unknown: 'new', listId: 'dl-in-' + ti, label: t('tr.player'), touched: sl.touched, noSug: true, res: hp ? { st: 'homo', p: null, near: null } : null }, esc, t) + '</td>';
    }
    // bloc « nouveau joueur » (prénom, nom, poste, naissance) sous la ligne : échanges (côté reçus), Contrats (agent libre) et Mouvements (réclamation)
    // o : { r: data-r, pre: préfixe des champs, pc: data-c du nom, id, sl: { np, pname, touched }, al, list, tag, note }
    function npxCore(o) {
      var np = o.sl.np, pre = o.pre, id = o.id, ti = o.r, a = o.al.filter(function (x) { return x.c === 'np'; });
      var er = a.filter(function (x) { return x.level === 'err'; }), wn = a.filter(function (x) { return x.level !== 'err' && x.k !== 'val.pl_near_new'; });
      var bad = function (k) { return er.some(function (x) { return x.k === 'val.np_missing' && !np[k] || x.k === 'val.date_format' && k === 'birth'; }) ? ' class="err"' : ''; };
      // listes du bloc : poste secondaire (sans objet pour un gardien), statut à l'arrivée (obligatoire : rouge tant qu'il est vide)
      var npxSel = function (k, lbl, opts, req) { if (!opts) return '<span class="npx-na">' + esc(lbl) + ' : —</span>'; return '<label' + (req && er.some(function (x) { return x.k === 'val.np_missing'; }) ? ' class="err"' : '') + '>' + esc(lbl) + '<select class="cell" data-r="' + ti + '" data-c="' + pre + k + '" aria-describedby="' + id + '"><option value=""></option>' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (np[k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
      var f = function (k, lbl, cls, ph) { return '<label' + bad(k) + '>' + esc(lbl) + '<input class="cell ' + cls + '" data-r="' + ti + '" data-c="' + pre + k + '" value="' + esc(np[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off" aria-describedby="' + id + '"></label>'; };
      var rs = o.sl.touched ? PC.resolve(o.sl.pname, null, o.list, 'new') : null;
      var sug = rs && rs.st === 'near' ? '<button type="button" class="pcb-sug" data-act="pcb-accept" data-r="' + ti + '" data-c="' + o.pc + '" data-name="' + esc(rs.near.name) + '" title="' + esc(PC.fill(t('val.pl_near_new'), [rs.near.name])) + '">' + esc(PC.fill(t('ui.pl_link_to'), [rs.near.name])) + '</button><span class="npx-near">' + PC.IC.warn + esc(PC.fill(t('val.pl_near_new'), [rs.near.name])) + '</span>' : '';
      var msg = er.concat(wn).map(function (x) { return PC.fill(t(x.k), x.p || []); }).join(' ');
      return '<div class="npx" role="group" aria-label="' + esc(t('ui.pl_state_new', true) + ' : ' + o.sl.pname) + '"><span class="npx-tag">' + PC.IC.nw + esc(o.tag) + sug + '</span>' +
        f('first', t('col.first_name'), 'text') + f('last', t('col.last_name'), 'text') +
        '<label' + bad('pos') + '>' + esc(t('col.position')) + '<select class="cell" data-r="' + ti + '" data-c="' + pre + 'pos" aria-describedby="' + id + '"><option value=""></option>' + ['C', 'LW', 'RW', 'LD', 'RD', 'G'].map(function (p) { return '<option value="' + p + '"' + (np.pos === p ? ' selected' : '') + '>' + esc(t('pc.' + p)) + '</option>'; }).join('') + '</select></label>' +
        f('birth', t('picks.col_birth'), 'date', t('ui.date_ph')) +
        npxSel('pos2', t('col.position2'), np.pos === 'G' ? null : V.secondaryOptions(np.pos).filter(function (p) { return p !== np.pos; }).map(function (p) { return [p, t('pc.' + p)]; })) +
        npxSel('status', t('pl.col_status'), [['Rookie', t('pl.st_rookie')], ['Veteran', t('pl.st_veteran')]], !np.status) +
        (np.status === 'Rookie' ? f('gp1', t('col.gp_prior1'), 'int' + (bad('gp1') ? '' : '')) + f('gp2', t('col.gp_prior2'), 'int') : '<span class="npx-na" title="' + esc(t('ev.np_rookie_only')) + '">' + esc(t('col.gp_prior1', true)) + ' · ' + esc(t('col.gp_prior2', true)) + ' : ' + esc(t('ev.np_rookie_only')) + '</span>') +
        '<p class="npx-msg' + (er.length ? ' er' : '') + '" id="' + id + '">' + (er.length ? PC.IC.err : '') + '<span>' + esc((msg ? msg + ' ' : '') + o.note) + '</span></p></div>';
    }
    function npxHTML(tr, ti, s, sl, al) {
      return npxCore({ r: ti, pre: 'in:' + s + ':np_', pc: 'in:' + s + ':pname', id: 'npx-' + ti + '-' + s, sl: sl, al: al, list: inList(tr), tag: fmt('tr.np_tag', [sl.pname, s + 1]), note: fmt('tr.np_note', [tr.date]) });
    }
    function trGridHTML() { var m = trModel(), html = '', total = 0; for (var i = 0; i <= entries.trf.length; i++) { var c = trCardHTML(i, m); html += c.html; total += c.alerts; } return { html: html, alerts: total }; }
    function trBaseHTML() {
      var list = DATA.base.tr.filter(function (x) { return inSeason(x.date); }), editing = {}; entries.trf.forEach(function (x) { if (x.editId) editing[x.editId] = 1; });
      var item = function (a) { return '<li>' + (a[1] === 'player' ? '<b>' + esc(t('asset.player')) + '</b> ' + esc(nameOf(a[2])) + (a[6] ? ' <small>(' + esc(fmt('tr.retention_text', [fmtMoney(a[6]), a[7] || '?'])) + ')</small>' : '') : '<b>' + esc(t('asset.pick')) + '</b> ' + esc(a[3] + ' · ' + t('tr.pick_round') + ' ' + a[4]) + ' ' + '<span class="plg" title="' + esc(teamNm(a[5])) + '">' + logoHTML(a[5]) + '</span>') + '</li>'; };
      return '<details class="base trbase" open><summary>' + esc(t('ev.already')) + ' · ' + list.length + '</summary><div class="trlist">' + list.map(function (x) {
        var out = x.assets.filter(function (a) { return a[0] === 'out'; }), inn = x.assets.filter(function (a) { return a[0] === 'in'; });
        var who = function (code, label, items) { return '<div class="trcol"><h5 class="who">' + logoHTML(code) + '<b>' + esc(teamNm(code)) + '</b></h5><div class="sub">' + esc(label) + '</div><ul>' + items.map(item).join('') + '</ul></div>'; };
        return '<article class="trc' + (editing[x.id] ? ' editing' : '') + (state.focus_tr === x.id ? ' focus' : '') + '" id="tr-' + x.id + '"><header><span class="d">' + esc(x.date) + '</span><button class="btn small" data-act="edit-trade" data-id="' + x.id + '" type="button"' + (editing[x.id] ? ' disabled' : '') + '>' + esc(t(editing[x.id] ? 'tr.in_edit' : 'tr.edit')) + '</button></header><div class="cols">' + who(DATA.franchise.code, t('tr.sent'), out) + who(x.partner, t('tr.received'), inn) + '</div></article>'; }).join('') + '</div></details>';
    }
    function fmtMoney(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
    function editTrade(id) { if (entries.trf.some(function (x) { return x.editId === id; })) return false; var b = DATA.base.tr.filter(function (x) { return x.id === id; })[0]; if (!b) return false; entries.trf.push(trFromBase(b)); persist(); return true; }


    // ---- liste des joueurs (comme la feuille PlayersList de l'Excel) : lecture seule, avec recherche et filtres ----
    var PL_ST = { Veteran: 'pl.st_veteran', Rookie: 'pl.st_rookie', Prospect: 'pl.st_prospect' }, PL_VIA = { 'Draft': 'draft', 'Free Agent': 'free_agent', 'Start': 'start', 'Trade': 'trade', 'Waivers': 'waivers' }, PL_DEP = { 'Release': 'ev.release', 'Buy Out': 'ev.buy_out', 'Waivers': 'via.waivers', 'Offer Sheet': 'os.unmatched', 'Retirement': 'pl.dep_retirement', 'Trade': 'via.trade' }, PL_HAND = { Left: 'L', Right: 'R' };
    var PL_COLS = [['pl.col_no', 'n'], ['col.first_name', 'first'], ['col.last_name', 'last'], ['col.number', 'num'], ['pl.col_pos_orig', 'po'], ['pl.col_pos_cur', 'pc'], ['pl.col_pos2_orig', 'so'], ['pl.col_pos2_cur', 'sc'], ['picks.col_height', 'h'], ['picks.col_weight', 'w'], ['picks.col_birth', 'b'], ['picks.col_hand', 'hand'], ['picks.col_ptype', 'pt'], ['col.draft_year', 'dy'], ['col.draft_round', 'dr'], ['col.draft_pick', 'dp'], ['col.draft_team', 'dt'], ['picks.col_country', 'co'], ['pl.col_status', 'st'], ['pl.col_acq_date', 'ad'], ['pl.col_acq_via', 'av'], ['pl.col_dep_date', 'dd'], ['pl.col_dep_via', 'dv'], ['pl.col_key', 'key']];
    function plNorm(s) { return HO.norm(s); }   // même simplification que la base (public.hr_norm)
    function plRows() {
      var q = plNorm(state.plq), pos = state.plpos, st = state.plst;
      return (DATA.roster || []).filter(function (r) {
        if (state.plmiss && !plMissing(r).length && r[0] !== PLE.open && r[0] !== PLE.just) return false;   // la ligne ouverte ou tout juste enregistrée reste visible
        if (pos && r[4] !== pos && r[3] !== pos) return false;
        var gone = !!r[20]; if (st === 'active' && gone) return false; if (st === 'gone' && !gone) return false;
        return !q || plNorm([r[1], r[22], r[23], r[15], r[16], r[11], r[18], r[19]].join(' ')).indexOf(q) >= 0;
      });
    }
    function plCell(r, k, n) {
      var s = function (v) { return v == null || v === '' ? '' : v; };
      switch (k) {
        case 'n': return n; case 'first': return s(r[22]); case 'last': return s(r[23]); case 'num': return s(r[2]);
        case 'po': return r[3] ? posLabel(r[3]) : ''; case 'pc': return r[4] ? posLabel(r[4]) : ''; case 'so': return r[5] ? posLabel(r[5]) : ''; case 'sc': return r[6] ? posLabel(r[6]) : '';
        case 'h': return fmtHeight(r[8]); case 'w': return fmtWeight(r[9]); case 'b': return s(r[7]); case 'hand': return r[10] ? t('hand.' + (PL_HAND[r[10]] || r[10])) : '';
        case 'pt': return r[11] ? (V.PTSLUG[r[11]] ? t('ptype.' + V.PTSLUG[r[11]]) : r[11]) : ''; case 'dy': return s(r[12]); case 'dr': return s(r[13]); case 'dp': return s(r[14]); case 'dt': return r[15] === 'Undrafted' ? t('pl.undrafted') : r[15] ? tn(r[15]) : '';
        case 'co': return r[16] ? FTC.name(r[16], state.lang) : ''; case 'st': return r[17] ? (PL_ST[r[17]] ? t(PL_ST[r[17]]) : r[17]) : ''; case 'ad': return s(r[18]); case 'av': return r[19] ? t('via.' + (PL_VIA[r[19]] || r[19])) : '';
        case 'dd': return s(r[20]); case 'dv': return r[21] ? t(PL_DEP[r[21]] || r[21]) : ''; case 'key': return s(r[1]);
      }
      return '';
    }
    // ---- liste des joueurs modifiable (maquette approuvée : docs/maquettes/liste_joueurs_modifiable.html) ----
    // Renseignements manquants : une case vide (null) ; « Undrafted » = non repêché (pas un manque) ; le repêchage compte pour 1.
    var PL_MISS = { b: 7, h: 8, w: 9, hand: 10, pt: 11, co: 16, num: 2 }, PL_MISS_OF = { num: 'num', h: 'h', w: 'w', b: 'b', hand: 'hand', pt: 'pt', co: 'co', dy: 'draft', dr: 'draft', dp: 'draft', dt: 'draft' };
    var PL_PEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.6l2.8 2.8-7.7 7.7-3.4.6.6-3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>', PL_HANDDB = { L: 'Left', R: 'Right' };
    function plMissing(r) { var m = Object.keys(PL_MISS).filter(function (k) { return r[PL_MISS[k]] == null || r[PL_MISS[k]] === ''; }); if (r[15] == null || r[15] === '') m.push('draft'); return m; }
    function plById(id) { return (DATA.roster || []).filter(function (r) { return r[0] === id; })[0]; }
    function plName(r) { return ((r[22] || '') + ' ' + (r[23] || '')).trim(); }
    function plGroup(r) { var p = DATA.players.filter(function (x) { return x.id === r[0]; })[0]; return p ? p.pos : String(r[1] || '').charAt(0); }
    function teamByName(en) { return DATA.teams.filter(function (x) { return x.en === en; })[0]; }
    function plPartner(r) { var x = (DATA.base.tr || []).filter(function (tr) { return tr.date === r[18] && tr.assets.some(function (a) { return a[0] === 'in' && a[1] === 'player' && a[2] === r[0]; }); })[0]; return x ? x.partner : ''; }
    function parseHeight(v) { if (v === '') return ''; var m = /^(\d+)\s*(?:'|’|-|\s)\s*(\d{1,2})\s*(?:"|''|”)?$/.exec(v); if (m) return +m[1] * 12 + +m[2]; var n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) return false; return state.lang === 'fr' ? n / 2.54 : n; }
    function parseWeight(v) { if (v === '') return ''; if (!/^\d+([.,]\d+)?$/.test(String(v).trim())) return false; var n = parseFloat(String(v).replace(',', '.')); return state.lang === 'fr' ? n / 0.45359237 : n; }
    function plDraft(r) {   // valeurs AFFICHÉES, dans la langue (cm/kg en français, 6'2/lb en anglais)
      var tm = r[15] && r[15] !== 'Undrafted' ? teamByName(r[15]) : null;
      return { first: r[22] || '', last: r[23] || '', num: r[2] == null ? '' : String(r[2]), birth: r[7] || '', height: fmtHeight(r[8]), weight: fmtWeight(r[9]), hand: PL_HAND[r[10]] || '',
        ptype: r[11] || '', country: r[16] || '', undrafted: r[15] === 'Undrafted', dy: r[12] == null ? '' : String(r[12]), dr: r[13] == null ? '' : String(r[13]), dp: r[14] == null ? '' : String(r[14]),
        dteam: tm ? tn(tm.en) : (r[15] && r[15] !== 'Undrafted' ? r[15] : '') };
    }
    // validation : { champ: { lvl: 'err' | 'wn', k, p } } ; les erreurs bloquent, les avertissements non (repêchage incomplet = avertissement, décision de Gabriel)
    function plValidate(d, r) {
      var out = {}, A = function (f, lvl, k, p) { if (!out[f]) out[f] = { lvl: lvl, k: k, p: p || [] }; }, num = V.num, g = plGroup(r), nteams = DATA.teams.length || 32;
      if (!d.first.trim()) A('first', 'err', 'val.required'); if (!d.last.trim()) A('last', 'err', 'val.required');
      if (d.first.trim() && d.last.trim()) { var nn = plNorm(d.first + ' ' + d.last), dup = (DATA.roster || []).filter(function (x) { return x[0] !== r[0] && plGroup(x) === g && plNorm(plName(x)) === nn; })[0]; if (dup) A('last', 'err', 'val.pl_name_taken', [plName(dup), posLabel(dup[3])]); }
      if (d.num !== '' && !/^\d{1,2}$/.test(d.num.trim())) A('num', 'err', 'val.jersey_range');
      if (d.birth && !V.isDate(d.birth)) A('birth', 'err', 'val.date_format');
      else if (d.birth && r[18] && V.isDate(r[18])) { var age = (Date.parse(r[18]) - Date.parse(d.birth)) / 31557600000; if (age < 16 || age > 45) A('birth', 'wn', 'val.age_range', [Math.round(age)]); }
      var hh = parseHeight(d.height); if (hh === false) A('height', 'err', 'val.pl_height_format'); else if (hh !== '' && (hh < 60 || hh > 84)) A('height', 'wn', 'val.height_range');
      var ww = parseWeight(d.weight); if (ww === false) A('weight', 'err', 'val.pl_weight_format'); else if (ww !== '' && (ww < 120 || ww > 300)) A('weight', 'wn', 'val.weight_range');   // bornes comparées en lb, après conversion
      if (d.ptype && V.PTYPES[g] && V.PTYPES[g].indexOf(d.ptype) < 0) A('ptype', 'wn', 'val.ptype_group');
      if (!d.undrafted) {
        var y = d.dy.trim(), rd = num(d.dr), pk = num(d.dp);
        if (y && !/^\d{4}$/.test(y)) A('dy', 'err', 'val.year_format');
        if (d.dr !== '' && (rd === null || rd < 1 || rd > 7 || rd !== Math.round(rd))) A('dr', 'err', 'val.round_range');
        if (d.dp !== '' && (pk === null || pk < 1 || pk > 300)) A('dp', 'wn', 'val.pick_range');
        else if (rd && pk && (pk < (rd - 1) * nteams + 1 || pk > rd * nteams)) A('dp', 'wn', 'val.pick_round', [rd, (rd - 1) * nteams + 1, rd * nteams, nteams]);
        if (d.dteam && TC.resolve(d.dteam, DATA.teams) === null) A('dteam', 'err', 'val.team_unknown');
        var filled = [y, d.dr, d.dp, d.dteam].filter(function (x) { return x !== ''; }).length;
        if (filled > 0 && filled < 4) ['dteam', 'dp', 'dr', 'dy'].forEach(function (f) { if ((f === 'dy' ? y : d[f]) === '') A(f, 'wn', 'val.pl_draft_partial'); });
      }
      return out;
    }
    // envoi (ft_update_player, migration 64) : SEULEMENT les champs dont la valeur affichée a changé (sinon cm → po ou kg → lb arrondis feraient dériver la valeur stockée)
    function plPayload(d, o, r) {
      var p = { id: r[0] }, ch = function (f) { return d[f] !== o[f]; };
      if (ch('first') || ch('last')) { p.first_name = d.first.trim(); p.last_name = d.last.trim(); }
      if (ch('birth')) p.birth_date = d.birth || null;
      if (ch('height')) { var hh = parseHeight(d.height); p.height_in = hh === '' ? null : Math.round(hh); }
      if (ch('weight')) { var ww = parseWeight(d.weight); p.weight_lb = ww === '' ? null : Math.round(ww); }
      if (ch('hand')) p.handedness = PL_HANDDB[d.hand] || null;
      if (ch('ptype')) p.player_type = d.ptype || null;
      if (ch('country')) p.country = d.country || null;
      if (ch('undrafted') || ch('dy') || ch('dr') || ch('dp') || ch('dteam')) {
        if (d.undrafted) { p.draft_team = 'Undrafted'; p.draft_year = null; p.draft_round = null; p.draft_pick = null; }
        else { var code = TC.resolve(d.dteam, DATA.teams), tm = code ? DATA.teams.filter(function (x) { return x.code === code; })[0] : null; p.draft_team = tm ? tm.en : null; p.draft_year = d.dy ? +d.dy : null; p.draft_round = d.dr ? +d.dr : null; p.draft_pick = d.dp ? +d.dp : null; }   // draft_team est stocké en nom anglais
      }
      if (ch('num')) p.jersey_number = d.num === '' ? null : +d.num;
      return p;
    }
    function plChanges(d, o) { return Object.keys(o).filter(function (f) { return d[f] !== o[f]; }).length; }
    function plOpen(pid) {
      if (PLE.open === pid) { plClose(); return 'close'; }
      if (PLE.open != null && plChanges(PLE.d, PLE.o)) { PLE.live = fmt('pl.other_open', [plName(plById(PLE.open))]); PLE.liveCls = 'wn'; return 'blocked'; }
      var r = plById(pid); if (!r) return false; PLE.open = pid; PLE.d = plDraft(r); PLE.o = plDraft(r); PLE.save = 'idle'; PLE.msg = ''; PLE.live = ''; PLE.just = null; return 'open';
    }
    function plClose() { PLE.open = null; PLE.d = PLE.o = null; PLE.save = 'idle'; PLE.msg = ''; }
    function plSet(pid, f, value) {
      if (!PLE.d || pid !== PLE.open) return false;
      if (f === 'undrafted') { PLE.d.undrafted = !!value; if (value) { PLE.d.dy = PLE.d.dr = PLE.d.dp = PLE.d.dteam = ''; } }   // les cases qui ne s'appliquent plus sont vidées
      else if (f === 'dteam') { var c = TC.resolve(value, DATA.teams); PLE.d.dteam = c ? teamNm(c) : String(value); }
      else PLE.d[f] = String(value == null ? '' : value);
      if (PLE.save === 'fail') PLE.save = 'idle'; return true;
    }
    function plFirstMissing() { var d = PLE.d, f = ['birth', 'height', 'weight', 'hand', 'ptype', 'country', 'dy', 'num'].filter(function (x) { return d[x] === ''; })[0] || 'first'; if (f === 'dy' && d.undrafted) f = 'first'; return f; }
    async function plSave(client) {
      var r = plById(PLE.open); if (!r || PLE.save === 'busy') return false;
      var v = plValidate(PLE.d, r); if (Object.keys(v).some(function (f) { return v[f].lvl === 'err'; }) || !plChanges(PLE.d, PLE.o) || !sync.user) return false;
      PLE.save = 'busy';
      try {
        var fid = await client.ensureFranchise(); if (fid == null) throw new Error(t('sb.no_franchise'));
        var p = plPayload(PLE.d, PLE.o, r), res = await client.rpc('ft_update_player', { p_franchise_id: fid, p_player: p }) || {};
        // la ligne affichée suit tout de suite ; la page relit ensuite les tables touchées (afterPush)
        if ('first_name' in p) { r[22] = p.first_name; r[23] = p.last_name; r[1] = res.legacy_key || (String(r[1]).charAt(0) + ' - ' + p.first_name + ' ' + p.last_name); var pp = DATA.players.filter(function (x) { return x.id === r[0]; })[0]; if (pp) pp.name = p.first_name + ' ' + p.last_name; }
        if ('birth_date' in p) r[7] = p.birth_date; if ('height_in' in p) r[8] = p.height_in; if ('weight_lb' in p) r[9] = p.weight_lb; if ('handedness' in p) r[10] = p.handedness;
        if ('player_type' in p) r[11] = p.player_type; if ('country' in p) r[16] = p.country; if ('draft_team' in p) { r[12] = p.draft_year; r[13] = p.draft_round; r[14] = p.draft_pick; r[15] = p.draft_team; }
        if ('jersey_number' in p) r[2] = p.jersey_number;
        var pid = r[0]; plClose(); PLE.just = pid; PLE.live = fmt('pl.saved_msg', [plName(r)]); PLE.liveCls = 'ok'; return true;
      } catch (e) { PLE.save = 'fail'; PLE.msg = HO.errText(e, t, true) || plainError(e.message); return false; }
    }
    function plFieldHTML(r, f, label, ctl, v, miss) {
      var a = v[f], id = 'pf-' + r[0] + '-' + f, mid = 'pfm-' + r[0] + '-' + f, cls = 'pf' + (a ? (a.lvl === 'err' ? ' err' : ' wn') : '') + (miss ? ' miss' : '');
      var msg = a ? IC(a.lvl === 'err' ? 'err' : 'warn') + '<span>' + esc(PC ? PC.fill(t(a.k), a.p) : fmt(a.k, a.p)) + '</span>' : '';
      return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label><span class="pf-in">' + ctl.replace('%ID%', id).replace('%DESC%', ' aria-describedby="' + mid + '"' + (a && a.lvl === 'err' ? ' aria-invalid="true"' : '')) + '<span class="pf-m" id="' + mid + '">' + msg + '</span></span></div>';
    }
    function plInp(r, f, val, extra) { return '<input class="cell" id="%ID%" data-pid="' + r[0] + '" data-f="' + f + '" value="' + esc(val) + '" autocomplete="off"%DESC%' + (extra || '') + '>'; }
    function plSel(r, f, val, opts) { return '<select class="cell" id="%ID%" data-pid="' + r[0] + '" data-f="' + f + '"%DESC%><option value="">—</option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    function plNa(label) { return '<div class="pf na"><span>' + esc(label) + '</span><span class="na-box" aria-hidden="true"></span></div>'; }
    function plPanelHTML(r) {
      var d = PLE.d, o = PLE.o, v = plValidate(d, r), g = plGroup(r), m = plMissing(r), isMiss = function (f) { return d[f] === '' && o[f] === ''; };
      var cnt = function (fs) { var n = fs.filter(isMiss).length; return n ? '<span class="cnt">' + esc(fmt('pl.grp_missing', [n])) + '</span>' : ''; };
      var errs = Object.keys(v).filter(function (f) { return v[f].lvl === 'err'; }).length, nch = plChanges(d, o), part = plPartner(r);
      var origin = r[19] === 'Trade' && m.length ? fmt('pl.origin_trade', [r[18], part ? teamNm(part) : '—']) + ' ' + fmt('pl.origin_missing', [m.length]) : m.length ? fmt('pl.origin_missing', [m.length]) : '';
      var flag = d.country && FTC.flagURL(d.country) ? '<img class="flag" src="' + FTC.flagURL(d.country) + '" alt="" onerror="this.style.display=\'none\'">' : '';
      var draftMiss = !d.undrafted && ['dy', 'dr', 'dp', 'dteam'].every(function (f) { return d[f] === '' && o[f] === ''; });
      var h = '<div class="ple" id="ple-' + r[0] + '" role="group" aria-labelledby="ple-h-' + r[0] + '"><div class="ple-head"><h4 id="ple-h-' + r[0] + '">' + esc(fmt('pl.edit_head', [plName(r)])) + '</h4>' + (origin ? '<span class="ple-origin">' + IC('warn') + esc(origin) + '</span>' : '') + '</div><div class="ple-grid">';
      h += '<fieldset class="ple-fs"><legend>' + esc(t('pl.grp_identity')) + cnt(['first', 'last', 'num']) + '</legend>' + plFieldHTML(r, 'first', t('col.first_name'), plInp(r, 'first', d.first), v, isMiss('first')) +
        plFieldHTML(r, 'last', t('col.last_name'), plInp(r, 'last', d.last), v, isMiss('last')) + plFieldHTML(r, 'num', t('col.number'), plInp(r, 'num', d.num, ' inputmode="numeric" title="' + esc(t('pl.num_note')) + '"'), v, isMiss('num')) + '</fieldset>';
      h += '<fieldset class="ple-fs"><legend>' + esc(t('pl.grp_body')) + cnt(['birth', 'height', 'weight', 'hand']) + '</legend>' + plFieldHTML(r, 'birth', t('picks.col_birth'), plInp(r, 'birth', d.birth, ' inputmode="numeric" placeholder="' + esc(t('ui.date_ph')) + '"'), v, isMiss('birth')) +
        plFieldHTML(r, 'height', t('picks.col_height'), plInp(r, 'height', d.height), v, isMiss('height')) + plFieldHTML(r, 'weight', t('picks.col_weight'), plInp(r, 'weight', d.weight, ' inputmode="numeric"'), v, isMiss('weight')) +
        plFieldHTML(r, 'hand', t('picks.col_hand'), plSel(r, 'hand', d.hand, [['L', t('hand.L')], ['R', t('hand.R')]]), v, isMiss('hand')) + '</fieldset>';
      var pts = (V.PTYPES[g] || []).map(function (x) { return [x, t('ptype.' + V.PTSLUG[x])]; }); if (d.ptype && !pts.some(function (x) { return x[0] === d.ptype; })) pts.push([d.ptype, V.PTSLUG[d.ptype] ? t('ptype.' + V.PTSLUG[d.ptype]) : d.ptype]);
      h += '<fieldset class="ple-fs"><legend>' + esc(t('pl.grp_profile')) + cnt(['ptype', 'country']) + '</legend>' + plFieldHTML(r, 'ptype', t('picks.col_ptype'), plSel(r, 'ptype', d.ptype, pts), v, isMiss('ptype')) +
        plFieldHTML(r, 'country', t('picks.col_country'), '<span class="fl">' + plSel(r, 'country', d.country, FTC.options(state.lang)) + flag + '</span>', v, isMiss('country')) + '</fieldset>';
      h += '<fieldset class="ple-fs"><legend>' + esc(t('pl.grp_draft')) + (draftMiss ? '<span class="cnt">' + esc(fmt('pl.grp_missing', [1])) + '</span>' : '') + '</legend><label class="pf chk"><input type="checkbox" data-pid="' + r[0] + '" data-f="undrafted"' + (d.undrafted ? ' checked' : '') + '>' + esc(t('pl.undrafted')) + '</label>';
      if (d.undrafted) h += plNa(t('picks.col_year')) + plNa(t('picks.col_round')) + plNa(t('col.draft_pick')) + plNa(t('col.team'));
      else h += plFieldHTML(r, 'dy', t('picks.col_year'), plInp(r, 'dy', d.dy, ' inputmode="numeric"'), v, draftMiss) + plFieldHTML(r, 'dr', t('picks.col_round'), plInp(r, 'dr', d.dr, ' inputmode="numeric"'), v, draftMiss) +
        plFieldHTML(r, 'dp', t('col.draft_pick'), plInp(r, 'dp', d.dp, ' inputmode="numeric"'), v, draftMiss) + plFieldHTML(r, 'dteam', t('col.team'), plInp(r, 'dteam', d.dteam, ' list="dl-teams"').replace('class="cell"', 'class="cell tcombo"'), v, draftMiss);
      h += '</fieldset></div>';
      var newKey = g + ' - ' + d.first.trim() + ' ' + d.last.trim(), keyTxt = newKey !== r[1] && d.first.trim() && d.last.trim() ? PC.fill(t('pl.ro_key_new'), [r[1], newKey]) : PC.fill(t('pl.ro_key'), [r[1]]);
      h += '<p class="ple-ro"><span class="ro-t">' + esc(t('pl.ro_title')) + '</span><span>' + esc(fmt('pl.ro_pos', [posLabel(r[4] || r[3]), t('ev.tab_pc')])) + '</span><span>' + esc(fmt('pl.ro_stint', [r[18] || '—', r[19] ? t('via.' + (PL_VIA[r[19]] || r[19])) : '—'])) + '</span><span>' + esc(keyTxt) + '</span></p>';
      return h + '<div class="tch ple-acts">' + plSaveMsgHTML(r[0], errs, nch) + plSaveBtnHTML(r[0], errs, nch) + '<button type="button" class="btn ghost" data-act="pl-cancel" data-pid="' + r[0] + '">' + esc(t('tr.undo')) + '</button></div></div>';
    }
    function plSaveBtnHTML(pid, errs, nch) {
      var blocked = errs > 0 || !nch || !sync.user, busy = PLE.save === 'busy', inner = busy ? '<span class="spin" aria-hidden="true"></span>' + esc(t('tr.saving')) : esc(t('tr.save'));
      return '<button type="button" class="btn tsave" data-act="pl-save" data-pid="' + pid + '" title="' + esc(t('pl.save_title')) + '" aria-describedby="tsave-msg-pl' + pid + '"' + (blocked || busy ? ' aria-disabled="true"' : '') + (busy ? ' aria-busy="true"' : '') + '>' + inner + '</button>';
    }
    function plSaveMsgHTML(pid, errs, nch) {
      var m = '', cls = 'mu', role = 'status';
      if (PLE.save === 'fail') { cls = 'er'; role = 'alert'; m = IC('err') + '<span>' + esc(fmt('tr.save_failed', [PLE.msg])) + '</span>'; }
      else if (!sync.user) m = '<span>' + esc(t('tr.save_login')) + '</span>';
      else if (errs) { cls = 'er'; m = IC('err') + '<span>' + esc(t('pl.save_blocked')) + '</span>'; }
      else if (!nch) m = '<span>' + esc(t('pl.save_none')) + '</span>';
      else m = '<span>' + esc(fmt('pl.save_ready', [nch])) + '</span>';
      return '<p class="tsave-msg ' + cls + '" id="tsave-msg-pl' + pid + '" role="' + role + '">' + m + '</p>';
    }
    function plBodyHTML() {
      return plRows().map(function (r, i) {
        var m = plMissing(r), open = PLE.open === r[0], name = plName(r);
        var btn = '<button type="button" class="pled' + (m.length ? ' need' : '') + '" data-act="pl-edit" data-pid="' + r[0] + '" aria-expanded="' + open + '" aria-controls="ple-' + r[0] + '" aria-label="' + esc(m.length ? fmt('pl.complete_aria', [name, m.length]) : fmt('pl.edit_aria', [name])) + '">' + (m.length ? IC('warn') + esc(t('pl.complete')) : PL_PEN + esc(t('tr.edit'))) + '</button>';
        var h = '<tr data-pid="' + r[0] + '" class="' + (open ? 'open' : '') + (PLE.just === r[0] ? ' just' : '') + '">';
        PL_COLS.forEach(function (c, ci) {
          var k = c[1], v = plCell(r, k, i + 1), cls = []; if (ci < 3) cls.push('plc' + ci); if (/^(num|h|w|dy|dr|dp)$/.test(k)) cls.push('num');
          if (k === 'n') { h += '<td class="' + cls.join(' ') + '">' + (PLE.just === r[0] ? '<span class="pln pl-ok" title="' + esc(t('tr.saved')) + '">' + IC('ok') + '<span class="vh">' + esc(t('tr.saved')) + '</span></span>' : '<span class="pln">' + (i + 1) + '</span>') + btn + '</td>'; return; }
          if (PL_MISS_OF[k] && m.indexOf(PL_MISS_OF[k]) >= 0 && !(k !== 'dt' && r[15] === 'Undrafted')) { cls.push('miss'); h += '<td class="' + cls.join(' ') + '"><span class="mk" aria-hidden="true">—</span><span class="vh">' + esc(t('pl.miss_cell')) + '</span></td>'; return; }
          var fl = k === 'co' && r[16] && FTC.flagURL(r[16]) ? '<img class="flag" src="' + FTC.flagURL(r[16]) + '" alt="" onerror="this.style.display=\'none\'"> ' : '';
          h += '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + fl + esc(v) + '</td>';
        });
        return h + '</tr>' + (open ? '<tr class="ple-row"><td colspan="' + PL_COLS.length + '">' + plPanelHTML(r) + '</td></tr>' : '');
      }).join('');
    }
    function plGridHTML() {
      var total = (DATA.roster || []).length, n = plRows().length, nMiss = (DATA.roster || []).filter(function (r) { return plMissing(r).length; }).length, pOpts = V.POS.map(function (x) { return '<option value="' + x + '"' + (state.plpos === x ? ' selected' : '') + '>' + esc(posLabel(x)) + '</option>'; }).join('');
      var filt = '<div class="plf"><input type="search" data-pl="q" value="' + esc(state.plq) + '" placeholder="' + esc(t('pl.search')) + '" aria-label="' + esc(t('pl.search')) + '"><select data-pl="pos" aria-label="' + esc(t('col.position')) + '"><option value="">' + esc(t('pl.all_pos')) + '</option>' + pOpts + '</select><select data-pl="st" aria-label="' + esc(t('pl.col_status2')) + '">' + [['', 'pl.all'], ['active', 'pl.active'], ['gone', 'pl.gone']].map(function (o) { return '<option value="' + o[0] + '"' + (state.plst === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select>' +
        (nMiss || state.plmiss ? '<button type="button" class="btn small" data-pl="miss" aria-pressed="' + !!state.plmiss + '">' + IC('warn') + esc(fmt('pl.filter_missing', [nMiss])) + '</button>' : '') + '<span class="plcount" id="pl-count">' + n + ' / ' + total + '</span></div>' +
        '<p class="pl-live ' + PLE.liveCls + '" id="pl-live" role="status">' + (PLE.live ? IC(PLE.liveCls === 'ok' ? 'ok' : 'warn') + '<span>' + esc(PLE.live) + '</span>' : '') + '</p>';
      return { html: filt + '<div class="scroll vs"><table class="grid ev pl"><thead><tr>' + PL_COLS.map(function (c, ci) { return '<th' + (ci < 3 ? ' class="plc' + ci + '"' : '') + '>' + esc(t(c[0])) + '</th>'; }).join('') + '</tr></thead><tbody id="pl-body">' + plBodyHTML() + '</tbody></table></div>' + TC.datalist('dl-teams', DATA.teams, function (x) { return tn(x.en); }, esc), alerts: 0 };
    }
    function rowAlerts(tab) {
      if (tab === 'pl') return [];
      if (tab === 'tr') { var mt = trModel(); return mt.alerts.concat(mt.head); }
      if (tab === 'mv') return mvAlerts(true); if (tab === 'inj') return mvAlerts(); if (tab === 'ct') return ctAlerts(); if (tab === 'os') return osAlerts();
      var rows = entries[tab], cx = ctx(), out = [];
      var groups = tab === 'tr' ? V.tradeGroups(rows) : null, gAlerts = {};
      if (groups) groups.order.forEach(function (k) { groups.g[k].forEach(function (i) { gAlerts[i] = V.validateTradeGroup(rows, groups.g[k]); }); });
      rows.forEach(function (r, i) {
        var a = [];
        if (tab === 'mv') a = V.validateMove(r, cx); else if (tab === 'ct') a = V.validateContract(Object.assign({ id: 'n' + i }, r), cx);
        else if (tab === 'tr') a = V.validateTradeRow(r, cx).concat(gAlerts[i] || []); else if (tab === 'pc') { cx.stints = DATA.stints || null; var fr_ = r.pid ? fromOf(r.pid, r.date, i) : ['', '']; a = V.validatePosChange(Object.assign({}, r, { fp: fr_[0], fs: fr_[1] }), cx); } else a = V.validateNewPlayer(r, cx);
        if (r.pname && !r.pid && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] });
        out.push(a);
      });
      return out;
    }
    // positions de départ (non saisies) : dernier changement du joueur avant cette ligne, sinon sa position initiale
    function fromOf(pid, date, idx) {
      var best = null, bi = -1, byId_ = byId[pid] || {};
      DATA.base.pc.forEach(function (r, k) { if (r[1] === pid && r[0] <= date && (!best || r[0] >= best.d)) best = { d: r[0], p: r[4], s: r[5] }; });
      entries.pc.forEach(function (r, k) { if (k !== idx && r.pid === pid && V.isDate(r.date) && r.date <= date && (k < idx || idx == null || r.date < date) && (!best || r.date >= best.d)) best = { d: r.date, p: r.tp, s: r.ts }; });
      if (best) return [best.p || '', best.s || ''];
      return [byId_.pos1 || '', ''];
    }
    function fmtHeight(v) { if (v === '' || v == null || isNaN(v)) return ''; return state.lang === 'fr' ? String(Math.round(v * 2.54)) : Math.floor(Math.round(v) / 12) + "'" + (Math.round(v) % 12); }
    function fmtWeight(v) { if (v === '' || v == null || isNaN(v)) return ''; return state.lang === 'fr' ? String(Math.round(v * 0.45359237)) : String(Math.round(v)); }
    function parseHeight(v) { if (v === '') return ''; var m = /^(\d+)\s*(?:'|\u2019|-|\s)\s*(\d{1,2})\s*(?:"|''|\u201d)?$/.exec(v); if (m) return +m[1] * 12 + +m[2]; var n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) return false; return state.lang === 'fr' ? n / 2.54 : n; }
    function parseWeight(v) { if (v === '') return ''; var w = parseFloat(String(v).replace(/[\s\u00a0]/g, '').replace(',', '.')); if (isNaN(w)) return false; return state.lang === 'fr' ? w / 0.45359237 : w; }
    function posLabel(code) { var o = POSOPT.filter(function (x) { return x[0] === code; })[0]; return o ? t(o[1]) : code; }
    // une liste de suggestions par ligne : joueurs actifs avec l'équipe à la date de la ligne
    function pcLists() { var out = ''; for (var i = 0; i <= entries.pc.length; i++) { var r = entries.pc[i] || {}; out += '<datalist id="pl-pc-' + i + '">' + mvPlayers(r.date, r.pid).map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join('') + '</datalist>'; } return out; }
    function derived(tab, r, i) {
      if (tab === 'ct') { var d = V.contractDerived(r); return [d.last === null ? '—' : sl(d.last), d.end || '—']; }
      if (tab === 'tr') { var g = V.tradeGroups(entries.tr), n = 0; g.order.forEach(function (k, idx) { if (g.g[k].indexOf(i) >= 0) n = idx + 1; }); return [n ? t('ev.trade_n') + ' ' + n : '—']; }
      return [];
    }
    function derivedHeads(tab) { return tab === 'ct' ? ['col.last_season', 'col.end_date'] : tab === 'tr' ? ['ev.trade_n'] : []; }

    function alertsText(al) { return al.map(function (a) { return fmt(a.k, a.p); }).join('\n'); }
    function cellClass(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.some(function (a) { return a.level === 'err'; }) ? ' err' : m.length ? ' warn' : ''; }
    function cellTitle(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.length ? ' title="' + esc(alertsText(m)) + '"' : ''; }

    function cellHTML(def, r, ri, al) {
      var c = def[0], type = def[2], val = type === 'player' ? (r.pname != null ? r.pname : nameOf(r.pid)) : r[c];
      var cls = 'ci' + cellClass(al, c), ttl = cellTitle(al, c), lbl = ' aria-label="' + esc(t(def[1])) + '"';
      if (state.tab === 'pc' && (c === 'fp' || c === 'fs')) { var fo = r.pid ? fromOf(r.pid, r.date, ri) : ['', '']; return '<td class="d ro pos0' + cellClass(al, c) + '"' + cellTitle(al, c) + '>' + esc(fo[c === 'fp' ? 0 : 1] ? posLabel(fo[c === 'fp' ? 0 : 1]) : '—') + '</td>'; }
      if (type === 'sel') return '<td class="' + cls + '"' + ttl + '><select class="cell" data-r="' + ri + '" data-c="' + c + '"' + lbl + '><option value=""></option>' + def[3].map(function (o) { return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></td>';
      if (type === 'team') return '<td class="' + cls + '"' + ttl + '><input class="cell tcombo" list="dl-teams" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val ? ((DATA.teams.filter(function (x) { return x.code === val; })[0] || {}).en ? tn(DATA.teams.filter(function (x) { return x.code === val; })[0].en) : val) : '') + '" autocomplete="off"' + lbl + '></td>';
      return '<td class="' + cls + '"' + ttl + '><input class="cell ' + type + '" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val == null ? '' : val) + '"' + (type === 'player' ? ' list="' + (state.tab === 'pc' ? 'pl-pc-' + ri : 'plist') + '"' : '') + (type === 'date' ? ' placeholder="' + esc(t('ui.date_ph')) + '"' : '') + ' autocomplete="off"' + lbl + '></td>';
    }
    function gridHTML() {
      if (state.tab === 'pl') return plGridHTML();
      if (state.tab === 'tr') return trGridHTML();
      if (isMv()) return mvGridHTML(); if (state.tab === 'ct') return ctGridHTML(); if (state.tab === 'os') return osGridHTML();
      var tab = state.tab, sc = SCHEMA[tab], rows = entries[tab], al = rowAlerts(tab), heads = derivedHeads(tab), body = '', total = 0;
      for (var i = 0; i <= rows.length; i++) {
        var r = rows[i] || {}, a = al[i] || [], d = rows[i] ? derived(tab, r, i) : heads.map(function () { return ''; });
        total += a.length;
        body += '<tr data-row="' + i + '">' + sc.map(function (def) { return cellHTML(def, r, i, a); }).join('') + d.map(function (x, k) { return '<td class="num d" data-d="' + k + '">' + esc(x) + '</td>'; }).join('') +
          '<td class="al" title="' + esc(alertsText(a)) + '">' + (a.length ? '<span class="badge' + (a.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '">' + a.length + '</span>' : '') + '</td><td>' + (rows[i] ? '<button class="x" data-rm="' + i + '" title="' + esc(t('ev.remove')) + '">×</button>' : '') + '</td></tr>';
      }
      var head = '<tr>' + sc.map(function (d) { return '<th>' + esc(t(d[1])) + '</th>'; }).join('') + heads.map(function (h) { return '<th class="d">' + esc(t(h)) + '</th>'; }).join('') + '<th></th><th></th></tr>';
      return { html: '<div class="scroll"><table class="grid ev ' + state.tab + '" id="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: total };
    }

    // ---- événements déjà saisis pour la saison (lecture seule) ----
    function inSeason(d) { return d && V.seasonOf(d) === state.season; }
    function baseHTML() {
      var tab = state.tab, rows = [], head = [];
      if (tab === 'mv' || tab === 'inj' || tab === 'ct' || tab === 'pl') return '';
      if (tab === 'tr') return trBaseHTML();
      if (tab === 'os') { head = ['col.date', 'col.player', 'col.event', 'os.comp', 'os.picks_list']; rows = DATA.base.os.filter(function (o) { return inSeason(o.date); }).map(function (o) { return [o.date, nameOf(o.pid), t('os.' + o.event), o.comp ? t('claimed.yes') : t('claimed.no'), o.picks.map(function (p) { return teamName(p[0]) + ' ' + p[1] + ' R' + p[2]; }).join(' · ')]; }); }
      if (tab === 'mv_old') { head = ['col.date', 'col.player', 'col.move', 'col.return', 'col.games_missed']; rows = DATA.base.mv.filter(function (r) { return r[0] === state.season; }).map(function (r) { return [r[1], nameOf(r[2]), t('move.' + r[3]), r[4] || '', r[5] == null ? '' : r[5]]; }); }
      if (tab === 'ct') { head = ['col.date', 'col.player', 'col.event', 'col.contract_type', 'col.years', 'col.aav', 'col.clause']; rows = DATA.base.ct.filter(function (r) { return inSeason(r[1]); }).map(function (r) { return [r[1], nameOf(r[2]), t('ev.' + r[3]), r[4] ? t('ctype.' + r[4]) : '', r[5] || '', money(r[6]), r[10] || '']; }); }
      if (tab === 'tr') { head = ['col.date', 'col.partner', 'col.direction', 'col.asset_type', 'col.player']; DATA.base.tr.filter(function (x) { return inSeason(x.date); }).forEach(function (x) { x.assets.forEach(function (a) { rows.push([x.date, teamName(x.partner), t('dir.' + a[0]), t('asset.' + a[1]), a[1] === 'player' ? nameOf(a[2]) : a[3] + ' · ' + t('col.round') + ' ' + a[4] + ' · ' + teamName(a[5])]); }); }); }
      if (tab === 'pc') { head = ['col.date', 'col.player', 'col.from_primary', 'col.from_secondary', 'col.to_primary', 'col.to_secondary']; rows = DATA.base.pc.filter(function (r) { return inSeason(r[0]); }).map(function (r) { return [r[0], nameOf(r[1]), r[2] ? posLabel(r[2]) : '—', r[3] ? posLabel(r[3]) : '—', r[4] ? posLabel(r[4]) : '—', r[5] ? posLabel(r[5]) : '—']; }); }
      return '<details class="base"><summary>' + esc(t('ev.already')) + ' · ' + rows.length + '</summary><div class="scroll"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(t(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
    }

    function view() {
      var g = gridHTML(), seasons = []; lastAlerts = g.alerts || 0; var titled = ['inj', 'mv', 'ct', 'os', 'tr', 'pl'].indexOf(state.tab) >= 0;
      for (var y = DATA.franchise.first; y <= DATA.franchise.current + 1; y++) seasons.push(y);
      var opts = seasons.map(function (y) { return '<option value="' + y + '"' + (y === state.season ? ' selected' : '') + '>' + esc(sl(y)) + '</option>'; }).join('');
      var plist = allPlayers().map(function (p) { return '<option value="' + esc(plLabel(p)) + '"></option>'; }).join('');
      var tabs = ['inj', 'mv', 'ct', 'tr', 'os', 'pc', 'pl'].map(function (k) { return '<button data-tab="' + k + '" aria-pressed="' + (state.tab === k) + '">' + esc(t(k === 'inj' ? 'nav.t.roster.injuries' : k === 'mv' ? 'nav.t.roster.moves' : 'ev.tab_' + k, true)) + '</button>'; }).join('');
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t('ev.title')) + '</div></div></div>' +
        '<div class="ctl"><div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>' +
        '<main class="entry">' + FTP.panel(t, esc, sync) + '<section class="pick">' + (SHELL() ? '' : '<div class="seg tabs" role="group">' + tabs + '</div>') + '<label>' + esc(t('ui.season')) + '<select id="sn">' + opts + '</select></label>' +
        '<div class="acts"><button class="btn" data-act="csv">' + esc(t('entry.export_csv')) + '</button><button class="btn" data-act="json">' + esc(t('entry.export_json')) + '</button><button class="btn ghost" data-act="reset">' + esc(t('entry.reset')) + '</button></div><datalist id="plist">' + plist + '</datalist>' + TC.datalist('dl-teams', DATA.teams, function (x) { return tn(x.en); }, esc) + '</section>' +
        (npConv ? '<p class="note warn ev-npconv" role="status">' + esc(fmt('ev.np_converted', [npConv])) + '</p>' : '') +
        '<section class="card wide">' + (state.tab === 'tr' ? helpHTML() : '') + baseHTML() + '<h3>' + esc(t(titled ? 'ev.' + state.tab + '_title' : 'ev.new_rows')) + '</h3>' + (state.tab === 'tr' ? '' : helpHTML()) + g.html + (state.tab === 'pc' ? pcLists() : '') +   // Transactions : aide en tête de la carte, au-dessus de « Déjà saisi » (choix de Gabriel)
        '<p class="note muted">' + esc(t('entry.local_note')) + '</p></section></main>';
    }


    // ---- synchronisation avec Supabase ----
    var sync = { user: null, busy: false, msg: '', level: '' }, lk = null;
    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    function addDays0(d) { return d; }
    function window_(season) { return { from: season + '-07-01', to: (season + 1) + '-06-30' }; }
    async function lookups(client) {
      var teams = await client.select('team', 'select=id,code'); lk = { idByCode: {}, codeById: {} };
      teams.forEach(function (t_) { lk.idByCode[t_.code] = t_.id; lk.codeById[t_.id] = t_.code; }); return lk;
    }
    function setPlayers(list) { DATA.players.splice(0, DATA.players.length); list.forEach(function (p) { DATA.players.push({ id: p.id, name: p.full_name, pos: p.position_group, pos1: p.position_original || null }); }); Object.keys(byId).forEach(function (k) { delete byId[k]; }); DATA.players.forEach(function (p) { byId[p.id] = p; }); }
    function blockedBy(tab) {
      var al = rowAlerts(tab), n = 0; al.forEach(function (a) { n += a.filter(function (x) { return x.level === 'err'; }).length; });
      if (n) return 'sb.errors_block';
      if (entries[tab] && entries[tab].some(function (r) { return r.pid != null && r.pid < 0; })) return 'sb.new_player_first';
      return null;
    }
    var POSGRP = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' }, HAND = { L: 'Left', R: 'Right' }, VIAMAP = { start: 'Start', draft: 'Draft', trade: 'Trade', free_agent: 'Free Agent', waivers: 'Waivers' };
    function nn(v) { return v === '' || v == null ? null : v; }
    async function pushTab(client, fid, tab) {
      var rows = entries[tab];
      if (tab === 'mv') {
        var wc = function (r) { return r.move !== 'send_down' ? null : r.claimed === 'yes' ? true : r.claimed === 'no' ? false : null; };
        var mvBody = function (r, g0) { var g = gamesOfRow(r); return { season: V.seasonOf(r.date), moved_on: r.date, player_id: r.pid, move: r.move, injury_return_on: r.move === 'injury' ? nn(r.ret) : null, games_missed: r.move === 'injury' ? (g != null ? g : nn(g0)) : null, waiver_claimed: wc(r) }; };
        // un seul appel transactionnel (ft_save_roster_moves, migration 77) : ajouts, modifications et joueurs réclamés créés réussissent ou échouent ensemble
        var moves = rows.map(function (r) { var o = mvBody(r, r.games); if (r.np && r.pid == null && r.move === 'waiver_claim') { delete o.player_id; o.new_player = newPlayerPayload(r); } return o; });
        for (var ei = 0; ei < entries.mvx.length; ei++) { var ed = entries.mvx[ei], it0 = mvAll().filter(function (x) { return x.kind === 'base' && x.id === ed.id; })[0], b0 = DATA.base.mv.filter(function (x) { return x[7] === ed.id; })[0]; if (it0 && b0) moves.push(Object.assign({ id: ed.id }, mvBody(it0.r, b0[5]))); }
        if (moves.length) await client.rpc('ft_save_roster_moves', { p_franchise_id: fid, p_moves: moves });
      } else if (tab === 'pc') {
        await client.insert('position_change', rows.map(function (r) { return { franchise_id: fid, player_id: r.pid, changed_on: r.date, from_primary: fromOf(r.pid, r.date, entries.pc.indexOf(r))[0] || null, from_secondary: nn(fromOf(r.pid, r.date, entries.pc.indexOf(r))[1]), to_primary: r.tp, to_secondary: nn(r.ts) }; }));
      } else if (tab === 'ct') {
        var ctBody = function (r) { var terms = V.NO_TERMS.indexOf(r.event) < 0, first = +r.first, yrs = +r.years, start = !terms ? r.date : (['acquired', 'traded_for', 'free_agent'].indexOf(r.event) >= 0 ? r.date : (r.date > first + '-07-01' ? r.date : first + '-07-01')); return { signed_on: r.date, player_id: r.pid, event_type: r.event, contract_type: terms ? r.ctype : null, first_season: terms ? first : null, years: terms ? yrs : null, aav: terms ? +r.aav : null, start_on: start, end_on: terms ? (first + yrs) + '-06-30' : null }; };
        var ctYears = function (cid, r) { var ys = [], terms = V.NO_TERMS.indexOf(r.event) < 0; if (terms) for (var k = 0; k < +r.years; k++) ys.push({ contract_id: cid, season: +r.first + k, cap_hit: +r.aav, clause: r.ctype === 'one_way' ? nn(r['cl' + (k + 1)]) : null }); return ys; };
        // création et modification en un seul appel transactionnel (ft_save_contracts) : les années sont toujours envoyées en entier
        var strip = function (ys) { return ys.map(function (y) { return { season: y.season, cap_hit: y.cap_hit, clause: y.clause }; }); };
        var ctItems = rows.map(function (r) { var o = Object.assign(ctBody(r), { contract_years: strip(ctYears(null, r)) }); if (r.np && r.pid == null && r.event === 'free_agent') { delete o.player_id; o.new_player = newPlayerPayload(r); } return o; });   // agent libre inconnu : créé avec le contrat (migration 77)
        // modification d'un contrat enregistré : si la durée, la 1re saison, le salaire ou la nature (avec ou sans termes) changent, le contrat et ses années sont refaits ;
        // sinon seules les clauses des saisons existantes changent (« clauses ») : les saisons glissées d'un contrat d'entrée, end_on et la fin prévue restent intacts
        entries.ctx.forEach(function (ed) { var b0 = DATA.base.ct.filter(function (x) { return x[0] === ed.id; })[0]; if (!b0) return; var r = ctRowOf(b0), terms2 = V.NO_TERMS.indexOf(r.event) < 0, wasTerms = b0[5] != null;
          var structural = !terms2 || !wasTerms || +r.years !== b0[5] || +r.first !== b0[7] || +r.aav !== b0[6];
          if (structural) { ctItems.push(Object.assign({ id: ed.id }, ctBody(r), { contract_years: strip(ctYears(ed.id, r)) })); return; }
          var body = ctBody(r), it = { id: ed.id, signed_on: body.signed_on, player_id: body.player_id, event_type: body.event_type, contract_type: body.contract_type, clauses: [] };
          if (body.start_on !== b0[8]) it.start_on = body.start_on;
          for (var k = 1; k <= +r.years; k++) it.clauses.push({ season: +r.first + k - 1, clause: r.ctype === 'one_way' ? nn(r['cl' + k]) : null });
          ctItems.push(it); });
        if (ctItems.length) await client.rpc('ft_save_contracts', { p_franchise_id: fid, p_contracts: ctItems });
      } else if (tab === 'os') {
        if (rows.length) await client.rpc('ft_save_offer_sheets', { p_franchise_id: fid, p_sheets: rows.map(function (r) { var pk = []; for (var k = 1; k <= 4; k++) if (r['p' + k + 't']) pk.push({ slot: k, team_code: r['p' + k + 't'], pick_year: +r['p' + k + 'y'], pick_round: +r['p' + k + 'r'] }); return { signed_on: r.date, player_id: r.pid, event_type: r.event, compensation: r.comp === 'yes', picks: pk }; }) });
      } else if (tab === 'tr') {
        if (!lk) await lookups(client);
        var g = V.tradeGroups(rows), assetOf = function (r) { return r.type === 'player' && r.np ? { direction: 'in', asset_type: 'player', new_player: Object.assign({ first_name: r.np.first, last_name: r.np.last, position_original: r.np.pos, birth_date: r.np.birth || null }, npArrival(r.np), HO.status(r.hc && r.hc.length ? trCands(r) : [], r.homo) === 'no' ? { distinct_from: HO.find(DATA.homo, r.np.first + ' ' + r.np.last, POSGRP[r.np.pos]).map(function (p) { return p.id; }) } : {}), retained_salary: nn(r.ret), retained_years: nn(r.ryears) } : r.type === 'player' ? { direction: r.dir, asset_type: 'player', player_id: r.pid, retained_salary: nn(r.ret), retained_years: nn(r.ryears) } : { direction: r.dir, asset_type: 'pick', pick_year: nn(r.year), pick_round: nn(r.round), pick_original_team_id: lk.idByCode[r.orig] || null }; };
        var tiOf = function (k) { return +k.split('|')[2].slice(1); };
        g.order.forEach(function (k) { var f = rows[g.g[k][0]]; if (!lk.idByCode[f.partner]) throw new Error(fmt('sb.unknown_team') + ' ' + f.partner); });
        // création (editId vide) et modification en un seul appel transactionnel (ft_save_trades) ; les éléments sont remplacés en entier
        var trItems = g.order.map(function (k) { var f = rows[g.g[k][0]]; return { id: entries.trf[tiOf(k)].editId || null, traded_on: f.date, partner_team_id: lk.idByCode[f.partner], partner_team_code: f.partner, assets: g.g[k].map(function (i) { return assetOf(rows[i]); }) }; });
        if (trItems.length) await client.rpc('ft_save_trades', { p_franchise_id: fid, p_trades: trItems });
      }
      return rows.length;
    }
    async function pullTab(client, tab, seasonArg) {
      var pl = await client.select('player', 'select=id,full_name,position_group,position_original&origin=eq.franchise&order=full_name'); setPlayers(pl);
      DATA.stints = (await client.select('player_stint', 'select=player_id,acquired_on,departed_on&order=player_id,acquired_on')).filter(function (x) { return x.acquired_on != null; }).map(function (x) { return [x.player_id, x.acquired_on, x.departed_on]; });
      var S = seasonArg == null ? state.season : seasonArg, w = window_(S), n = 0;
      if (tab === 'mv') { var m = await client.select('roster_move', 'select=id,season,moved_on,player_id,move,injury_return_on,games_missed,waiver_claimed&season=eq.' + S + '&order=moved_on');
        DATA.base.mv = DATA.base.mv.filter(function (r) { return r[0] !== S; }).concat(m.map(function (r) { return [r.season, r.moved_on, r.player_id, r.move, r.injury_return_on, r.games_missed, r.waiver_claimed, r.id]; })); n = m.length; }
      if (tab === 'pc') { var p = await client.select('position_change', 'select=changed_on,player_id,from_primary,from_secondary,to_primary,to_secondary&changed_on=gte.' + w.from + '&changed_on=lte.' + w.to + '&order=changed_on');
        DATA.base.pc = DATA.base.pc.filter(function (r) { return V.seasonOf(r[0]) !== S; }).concat(p.map(function (r) { return [r.changed_on, r.player_id, r.from_primary, r.from_secondary, r.to_primary, r.to_secondary]; })); n = p.length; }
      if (tab === 'ct') {
        var c = await client.select('contract', 'select=id,signed_on,player_id,event_type,contract_type,years,aav,first_season,start_on,end_on&signed_on=gte.' + w.from + '&signed_on=lte.' + w.to + '&order=signed_on'), cy = {};
        if (c.length) (await client.select('contract_year', 'select=contract_id,season,clause&contract_id=in.(' + c.map(function (x) { return x.id; }).join(',') + ')')).forEach(function (y) { (cy[y.contract_id] = cy[y.contract_id] || {})[y.season] = y.clause || ''; });
        DATA.base.ct = DATA.base.ct.filter(function (r) { return V.seasonOf(r[1]) !== S; }).concat(c.map(function (r) { var arr = r.years && r.first_season != null ? Array.apply(null, Array(+r.years)).map(function (_, k) { return (cy[r.id] || {})[r.first_season + k] || ''; }) : []; return [r.id, r.signed_on, r.player_id, r.event_type, r.contract_type, r.years, r.aav, r.first_season, r.start_on, r.end_on, arr[0] || null, arr]; })); n = c.length;
      }
      if (tab === 'os') {
        var os_ = await client.select('offer_sheet', 'select=id,signed_on,player_id,event_type,compensation&signed_on=gte.' + w.from + '&signed_on=lte.' + w.to + '&order=signed_on,id'), pks = [];
        if (os_.length) pks = await client.select('offer_sheet_pick', 'select=offer_sheet_id,slot,team_code,pick_year,pick_round&offer_sheet_id=in.(' + os_.map(function (x) { return x.id; }).join(',') + ')&order=offer_sheet_id,slot');
        DATA.base.os = (DATA.base.os || []).filter(function (o) { return V.seasonOf(o.date) !== S; }).concat(os_.map(function (o) { return { id: o.id, date: o.signed_on, pid: o.player_id, event: o.event_type, comp: o.compensation ? 1 : 0, picks: pks.filter(function (x) { return x.offer_sheet_id === o.id; }).map(function (x) { return [x.team_code, x.pick_year, x.pick_round]; }) }; })); n = os_.length;
      }
      if (tab === 'tr') { if (!lk) await lookups(client);
        var t_ = await client.select('trade', 'select=id,traded_on,partner_team_code&traded_on=gte.' + w.from + '&traded_on=lte.' + w.to + '&order=traded_on'), as = [];
        if (t_.length) as = await client.select('trade_asset', 'select=trade_id,direction,asset_type,player_id,pick_year,pick_round,pick_original_team_id,retained_salary,retained_years&trade_id=in.(' + t_.map(function (x) { return x.id; }).join(',') + ')&order=trade_id');
        DATA.base.tr = DATA.base.tr.filter(function (x) { return V.seasonOf(x.date) !== S; }).concat(t_.map(function (x) { return { id: x.id, date: x.traded_on, partner: x.partner_team_code, assets: as.filter(function (a) { return a.trade_id === x.id; }).map(function (a) { return [a.direction, a.asset_type, a.player_id, a.pick_year, a.pick_round, lk.codeById[a.pick_original_team_id] || null, a.retained_salary, a.retained_years]; }) }; })); n = t_.length; }
      // un événement modifié qui change de saison ne doit pas rester en double dans l'ancienne : on garde la dernière copie de chaque identifiant
      var dd = function (list, idf) { var seen = {}, out = []; for (var q = list.length - 1; q >= 0; q--) { var k = idf(list[q]); if (k != null) { if (seen[k]) continue; seen[k] = 1; } out.unshift(list[q]); } return out; };
      DATA.base.tr = dd(DATA.base.tr, function (x) { return x.id; }); DATA.base.ct = dd(DATA.base.ct, function (x) { return x[0]; }); DATA.base.mv = dd(DATA.base.mv, function (x) { return x[7]; });
      return n;
    }
    async function doLogin(client, email, pw) {
      sync.busy = true; try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } sync.busy = false; return !!sync.user;
    }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; }
    async function doPull(client, quiet) {
      sync.busy = true; try { var n = await pullTab(client, dtab()); if (!quiet) say('ok', 'sb.pulled', [n]); } catch (e) { say('bad', 'sb.failed', [e.message]); } sync.busy = false;
    }
    async function doPush(client) {
      sync.busy = true;
      try {
        var tab = dtab(), fid = await client.ensureFranchise();
        if (fid == null) { say('bad', 'sb.no_franchise'); sync.busy = false; return false; }
        if (tab === 'tr') entries.tr = trModel().rows;
        if (!entries[tab].length && !(tab === 'mv' && entries.mvx.length) && !(tab === 'ct' && entries.ctx.length)) { say('warn', 'sb.nothing'); sync.busy = false; return false; }
        var bl = blockedBy(tab); if (bl) { say('bad', bl); sync.busy = false; return false; }
        var touched = {}; entries[tab].forEach(function (r) { if (V.isDate(r.date)) touched[V.seasonOf(r.date)] = 1; }); touched[state.season] = 1;
        var n = await pushTab(client, fid, tab); entries[tab] = []; if (tab === 'mv') entries.mvx = []; if (tab === 'ct') entries.ctx = []; if (tab === 'tr') entries.trf = []; persist();
        var seasonsList = Object.keys(touched).map(Number); for (var si = 0; si < seasonsList.length; si++) await pullTab(client, tab, seasonsList[si]);
        say('ok', 'sb.pushed', [n]); sync.busy = false; return true;
      } catch (e) { var hm = HO.errText(e, t); if (hm) { sync.level = 'bad'; sync.msg = hm; } else say('bad', 'sb.failed', [e.message]); sync.busy = false; return false; }
    }

    // ---- exports ----
    function q(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function csvRows() {
      if (state.tab === 'tr') entries.tr = trModel().rows;
      var tab = dtab(), rows = entries[tab], out = [], head;
      if (tab === 'pl') { head = PL_COLS.map(function (c) { return c[1]; }).join(','); plRows().forEach(function (r, i) { out.push(PL_COLS.map(function (c) { return plCell(r, c[1], i + 1); }).map(q).join(',')); }); }
      if (tab === 'mv') { head = 'franchise_id,id,season,moved_on,player_id,move,injury_return_on,games_missed,waiver_claimed'; mvAll().forEach(function (it) { if (it.kind === 'new' || it.edited) { var r = it.r, g = gamesOfRow(r); out.push([1, it.kind === 'base' ? it.id : '', V.isDate(r.date) ? V.seasonOf(r.date) : '', r.date, r.pid, r.move, r.move === 'injury' ? r.ret : '', g == null ? '' : g, r.move === 'send_down' ? (r.claimed === 'yes' ? 1 : r.claimed === 'no' ? 0 : '') : ''].map(q).join(',')); } }); }
      if (tab === 'ct') { head = 'franchise_id,id,player_id,signed_on,event_type,contract_type,first_season,years,aav,end_on,clause_y1,clause_y2,clause_y3,clause_y4,clause_y5,clause_y6,clause_y7,clause_y8'; ctItems().forEach(function (it) { if (it.kind === 'new' || it.edited) { var r = it.r, terms = V.NO_TERMS.indexOf(r.event) < 0; out.push([1, it.kind === 'base' ? it.id : '', r.pid, r.date, r.event, terms ? r.ctype : '', terms ? r.first : '', terms ? r.years : '', terms ? r.aav : '', terms ? V.contractDerived(r).end : ''].concat([1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return terms ? r['cl' + k] : ''; })).map(q).join(',')); } }); }
      if (tab === 'os') { head = 'franchise_id,signed_on,player_id,event_type,compensation,p1_team,p1_year,p1_round,p2_team,p2_year,p2_round,p3_team,p3_year,p3_round,p4_team,p4_year,p4_round'; rows.forEach(function (r) { out.push([1, r.date, r.pid, r.event, r.comp === 'yes' ? 1 : 0].concat([1, 2, 3, 4].reduce(function (a, k) { return a.concat([r['p' + k + 't'], r['p' + k + 'y'], r['p' + k + 'r']]); }, [])).map(q).join(',')); }); }
      if (tab === 'tr') { head = 'traded_on,partner_team_code,group,direction,asset_type,player_id,pick_year,pick_round,pick_original_team_code,retained_salary,retained_years'; rows.forEach(function (r) { out.push([r.date, r.partner, r.grp, r.dir, r.type, r.type === 'player' ? r.pid : '', r.type === 'pick' ? r.year : '', r.type === 'pick' ? r.round : '', r.type === 'pick' ? r.orig : '', r.ret, r.ryears].map(q).join(',')); }); }
      if (tab === 'pc') { head = 'franchise_id,player_id,changed_on,from_primary,from_secondary,to_primary,to_secondary'; rows.forEach(function (r, ix) { var f_ = fromOf(r.pid, r.date, ix); out.push([1, r.pid, r.date, f_[0], f_[1], r.tp, r.ts].map(q).join(',')); }); }
      return [head].concat(out).join('\r\n') + '\r\n';
    }
    function jsonExport() { return JSON.stringify({ version: 1, events: entries }, null, 1); }

    // ---- phase 4b : l'onglet Nouveau joueur est retiré (décision du 2026-11-18). Ses saisies en attente deviennent des nouveaux joueurs
    // de Contrats (agent libre), de Mouvements (réclamation au ballottage) ou d'une carte d'échange ; sinon une ligne d'agent libre à compléter.
    // Les données de la fiche (numéro, taille, poids, tir, type, pays, repêchage) suivent avec new_player (migration 77).
    var npConv = 0;
    function convertNp() {
      var list = entries.np || []; if (!list.length) return 0;
      var hands = { L: 'Left', R: 'Right' }, teamEn = function (c) { var x = (DATA.teams || []).filter(function (tm) { return tm.code === c; })[0]; return x ? x.en : c || ''; };
      list.forEach(function (r, i) {
        var pid = -(i + 1), name = ((r.first || '') + ' ' + (r.last || '')).trim(), cands = npCands(r), st = HO.status(cands, r.homo);
        var refs = function (fn) { ['ct', 'mv', 'pc', 'os'].forEach(function (k) { (entries[k] || []).forEach(function (x) { if (x.pid === pid) fn(x); }); }); (entries.trf || []).forEach(function (tr) { ['out', 'in'].forEach(function (sd) { tr[sd].forEach(function (x) { if (x.pid === pid) fn(x); }); }); }); };
        if (st === 'yes') { refs(function (x) { x.pid = r.homo.yes; x.pname = nameOf(r.homo.yes) || name; }); return; }   // « Oui, c'est lui » : le joueur existant
        var np = { first: r.first || '', last: r.last || '', pos: r.pos || '', birth: r.birth || '', extra: { jersey_number: r.num, height_in: r.height === '' || r.height == null ? '' : Math.round(r.height), weight_lb: r.weight, handedness: hands[r.hand], player_type: r.ptype, country: r.country, draft_year: r.dyear, draft_round: r.dround, draft_pick: r.dpick, draft_team: r.dteam ? teamEn(r.dteam) : '' } };
        var tgt = (entries.ct || []).filter(function (x) { return x.pid === pid && x.event === 'free_agent'; })[0] || (entries.mv || []).filter(function (x) { return x.pid === pid && x.move === 'waiver_claim'; })[0], slot = null;
        if (!tgt) (entries.trf || []).forEach(function (tr) { tr.in.forEach(function (x) { if (!slot && x.pid === pid) slot = x; }); });
        var link = function (x, full) { x.pid = null; x.pname = name; x.np = full ? np : { first: np.first, last: np.last, pos: np.pos, birth: np.birth }; x.touched = true; if (cands.length) { x.hc = cands.map(function (c) { return c.id; }); if (r.homo) x.homo = r.homo; } };
        if (slot) link(slot, false);
        else { if (!tgt) { tgt = { date: r.date || DATA.franchise.date, event: 'free_agent' }; entries.ct.push(tgt); } link(tgt, true); }
        refs(function (x) { if (x !== tgt && x !== slot) { x.pid = null; x.pname = name; } });   // autres lignes : le nom reste, le joueur se choisit après l'envoi
      });
      entries.np = []; persist(); return list.length;
    }
    npConv = convertNp();

    return { homoAnswer: homoAnswer, npCands: npCands, plTotal: function () { return (DATA.roster || []).length; }, plRows: plRows, plBodyHTML: plBodyHTML, trModel: trModel, editTrade: editTrade, saveTrade: saveTrade, plOpen: plOpen, plClose: plClose, plSet: plSet, plSave: plSave, plMissing: plMissing, plValidate: plValidate, plPayload: plPayload, plDraft: plDraft, plFirstMissing: plFirstMissing, PLE: PLE, ctItems: ctItems, ctAlerts: ctAlerts, osAlerts: osAlerts, mvItems: mvItems, mvAll: mvAll, newPlayerPayload: newPlayerPayload, mvAlerts: mvAlerts, sync: sync, doLogin: doLogin, doLogout: doLogout, doPull: doPull, doPush: doPush, state: state, entries: function () { return entries; }, view: view, t: t, setCell: setCell, removeRow: removeRow, reset: reset, applyPaste: applyPaste, rowAlerts: rowAlerts, derived: derived,
             snapshot: snapshot, restore: restore, refusal: refusal, colLabel: colLabel, pasteCols: pasteCols, storageOk: function () { return !storeErr; }, alertCount: function () { return lastAlerts; }, nameOf: nameOf,
             csvRows: csvRows, jsonExport: jsonExport, countEntries: countEntries, alertsText: alertsText, pidFromName: pidFromName, SCHEMA: SCHEMA };
  }

  var api = { makeEventsApp: makeEventsApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTEV = api;

  if (typeof document !== 'undefined') {
    var DATA = JSON.parse(document.getElementById('data').textContent);
    var TR_SLOTS_UI = 5;   // éléments par côté d'une carte d'échange (TR_SLOTS de l'application)
    var ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeEventsApp(d, st || ls); }, assemble: FTLIVE.assembleEvents });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    if (window.FTHELP) FTHELP.bind(rootEl);   // aide en contexte : ouvrir/fermer sans redessiner la page
    (function scrollToLinked(n) { var a = host.app(), el = a && a.state.focus_tr ? document.getElementById('tr-' + a.state.focus_tr) : null; if (el) { el.scrollIntoView({ block: 'center' }); return; } if (n < 40 && /[?&]tr=\d/.test(location.search)) setTimeout(function () { scrollToLinked(n + 1); }, 250); })(0);   // lien ?tr= (les données peuvent arriver après la connexion)
    function draw(focus) { host.draw(focus ? '.cell[data-r="' + focus[0] + '"][data-c="' + focus[1] + '"]' : null); }
    function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    rootEl.addEventListener('input', function (e) {
      var el = e.target; if (el.dataset && el.dataset.pl) { app.state['pl' + el.dataset.pl] = el.value; var bd = document.getElementById('pl-body'), ct = document.getElementById('pl-count'); if (bd) bd.innerHTML = app.plBodyHTML(); if (ct) ct.textContent = app.plRows().length + ' / ' + app.plTotal(); }
    });
    rootEl.addEventListener('change', function (e) {
      if (e.target.closest && e.target.closest('.ple')) { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') { plCommit(e.target); host.draw(plSel(e.target)); } return; }   // panneau de la liste des joueurs
      if (e.target.dataset && e.target.dataset.pl) { app.state['pl' + e.target.dataset.pl] = e.target.value; draw(); return; }
      if (e.target.id === 'sn') { app.state.season = +e.target.value; draw(); }   // cases de la grille : moteur commun (connect/grid_input.js)
    });
    // ---- Liste des joueurs modifiable : panneau sous la ligne ----
    function plSel(el) { if (!el || !el.dataset) return null; if (el.dataset.f) return '.ple [data-pid="' + el.dataset.pid + '"][data-f="' + el.dataset.f + '"]'; if (el.dataset.act && el.dataset.pid) return 'button[data-act="' + el.dataset.act + '"][data-pid="' + el.dataset.pid + '"]'; if (el.dataset.pl) return '[data-pl="' + el.dataset.pl + '"]'; return null; }
    function plCommit(el) { if (!el || !el.dataset || !el.dataset.f) return false; return app.plSet(+el.dataset.pid, el.dataset.f, el.type === 'checkbox' ? el.checked : el.value); }
    function plSaveNow() { var pid = app.PLE.open; if (pid == null) return; var p = app.plSave(host.client); host.draw('button[data-act="pl-save"][data-pid="' + pid + '"]'); p.then(function (ok) { if (ok) { host.draw('button[data-act="pl-edit"][data-pid="' + pid + '"]'); host.afterPush(); } else host.draw('button[data-act="pl-save"][data-pid="' + pid + '"]'); }); }
    rootEl.addEventListener('focusout', function (e) {
      var el = e.target; if (!el.closest || !el.closest('.ple') || !el.dataset.f || el.type === 'checkbox' || el.tagName === 'SELECT') return;
      var d0 = JSON.stringify(app.PLE.d); plCommit(el); if (JSON.stringify(app.PLE.d) === d0) return;
      setTimeout(function () { host.draw(plSel(document.activeElement)); }, 0);   // après Tab : redessiner APRÈS le déplacement du focus
    });
    function saveCard(ti) { var p = app.saveTrade(host.client, ti); draw(); p.then(function (ok) { draw(); if (ok) { host.afterPush(); var st = document.querySelector('.sb p.ok'); if (st) st.setAttribute('role', 'status'); } else { var b = rootEl.querySelector('button.tsave[data-ti="' + ti + '"]'); if (b) b.focus(); } }); }
    // clavier, collage, focus, Ctrl+Z et avertissement avant de quitter : moteur commun (connect/grid_input.js)
    function cardSlot(c) { var p = String(c || '').split(':'); return p.length === 3 ? p : null; }
    var gi = FTGI.attach({ rootEl: rootEl, host: host, adapter: {
      write: function (r, c, raw) { return app.setCell(r, c, raw) || app.refusal(c, raw); },
      redrawEach: true,
      grow: true,   // la dernière ligne de chaque grille est toujours vide : descendre depuis elle vise la ligne qui sera créée
      cols: function () { return app.pasteCols(); },
      na: function (r, c) { var tr = rootEl.querySelector('tr[data-row="' + r + '"]'); return !!tr && !tr.querySelector(FTGI.cellSel(r, c)) && !(c === 'pid' && tr.querySelector(FTGI.cellSel(r, 'pname'))); },   // nouvelle ligne : Joueur = case pname   // case hachurée ou calculée de la ligne
      // carte d'échange : chaque ligne du bloc va à l'élément suivant du même côté, les colonnes suivent l'ordre de la ligne de l'élément
      targets: function (el, m) {
        if (!el.closest || !el.closest('.tcard')) return null;
        var r = +el.dataset.r, p = cardSlot(el.dataset.c); if (!p) return [{ r: r, c: el.dataset.c, v: m[0][0] }];
        var tr = el.closest('tr'), fields = tr ? [].map.call(tr.querySelectorAll('.cell[data-c^="' + p[0] + ':"]'), function (x) { return (cardSlot(x.dataset.c) || [])[2]; }) : [p[2]], j0 = fields.indexOf(p[2]), out = [];
        m.forEach(function (line, i) { var sl = +p[1] + i; if (sl >= TR_SLOTS_UI) return; line.forEach(function (v, j) { var f = fields[j0 + j]; if (f) out.push({ r: r, c: p[0] + ':' + sl + ':' + f, v: v }); }); });
        return out;
      },
      snapshot: function () { return app.snapshot(); }, restore: function (sv) { app.restore(sv); },
      pending: function () { return app.countEntries(); },
      t: function (k, sh) { return app.t(k, sh); },
      alerts: function () { return app.alertCount(); },
      storageOk: function () { return app.storageOk(); },
      ctx: function () { return app.state.tab + '|' + app.state.season; },
      rowName: function (r) { var el = rootEl.querySelector('tr[data-row="' + r + '"] .cell[data-c="pid"], tr[data-row="' + r + '"] .cell[data-c="pname"]'); return el ? (el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : el.value) : ''; },
      colName: function (c) { return app.colLabel(c); },
      onKey: function (e, el) {
        var ple = el.closest && el.closest('.ple');
        if (ple) {   // panneau : Ctrl+Entrée enregistre, Échap annule, Entrée passe au champ suivant
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); plCommit(el); plSaveNow(); return true; }
          if (e.key === 'Escape') { e.preventDefault(); var pid0 = app.PLE.open; app.plClose(); host.draw('button[data-act="pl-edit"][data-pid="' + pid0 + '"]'); return true; }
          if (e.key === 'Enter' && el.tagName === 'INPUT' && el.dataset.f) { e.preventDefault(); var all = [].slice.call(ple.querySelectorAll('input[data-f],select[data-f],button.tsave')), nx = all[all.indexOf(el) + 1]; plCommit(el); host.draw(plSel(nx) || 'button[data-act="pl-save"][data-pid="' + app.PLE.open + '"]'); }
          return true;
        }
        var card = app.state.tab === 'tr' && el.closest ? el.closest('.tcard') : null;
        if (!card || !el.dataset || el.dataset.c === undefined) return false;
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); gi.commit(el); saveCard(+card.dataset.ti); return true; }   // Ctrl+Entrée : enregistre la carte
        if (!el.classList.contains('cell') || el.tagName === 'SELECT' || e.altKey || e.ctrlKey || e.metaKey) return false;
        if (el.classList.contains('pcombo') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return false;
        var move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!move) return false;
        // carte d'échange : Entrée descend d'un élément, même côté et même colonne (sinon sur le type de l'élément)
        e.preventDefault(); var r = +el.dataset.r, cp = String(el.dataset.c).split(':'); gi.commit(el);
        var nc = cp.length === 3 ? cp[0] + ':' + Math.max(0, Math.min(TR_SLOTS_UI - 1, +cp[1] + move)) + ':' + cp[2] : (move > 0 ? 'out:0:type' : el.dataset.c);
        if (cp.length === 3 && /^np_/.test(cp[2])) nc = el.dataset.c;   // sous-ligne « nouveau joueur » : on reste sur le champ
        draw([r, nc]); var tgt = rootEl.querySelector('.cell[data-r="' + r + '"][data-c="' + nc + '"]');
        if (!tgt && cp.length === 3) { var tc = rootEl.querySelector('.cell[data-r="' + r + '"][data-c="' + nc.split(':').slice(0, 2).join(':') + ':type"]'); if (tc) tc.focus(); }
        return true;
      }
    } });
    HO.bindKeys(rootEl);
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lang) app.state.lang = b.dataset.lang; else if (b.dataset.tab) app.state.tab = b.dataset.tab; else if (b.dataset.rm) { gi.edit(function () { app.removeRow(+b.dataset.rm); }); }
      else if (b.dataset.act === 'edit-trade') { if (app.editTrade(+b.dataset.id)) { draw(); setTimeout(function () { var cs = rootEl.querySelectorAll('.tcard.editing'); if (cs.length && cs[cs.length - 1].scrollIntoView) cs[cs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); } return; }
      else if (b.dataset.pl === 'miss') { app.state.plmiss = !app.state.plmiss; app.PLE.just = null; host.draw('[data-pl="miss"]'); return; }
      else if (b.dataset.act === 'pl-edit') { var pid = +b.dataset.pid, st0 = app.plOpen(pid); host.draw(st0 === 'open' ? '.ple [data-pid="' + pid + '"][data-f="' + app.plFirstMissing() + '"]' : st0 === 'blocked' ? '.ple [data-pid="' + app.PLE.open + '"][data-f="first"]' : 'button[data-act="pl-edit"][data-pid="' + pid + '"]'); return; }
      else if (b.dataset.act === 'pl-cancel') { var pc0 = +b.dataset.pid; app.plClose(); host.draw('button[data-act="pl-edit"][data-pid="' + pc0 + '"]'); return; }
      else if (b.dataset.act === 'pl-save') { if (b.getAttribute('aria-disabled') !== 'true') { var a0 = document.activeElement; if (a0 && a0.closest && a0.closest('.ple')) plCommit(a0); plSaveNow(); } return; }
      else if (b.dataset.homo) {     // « Même joueur ? » : Non → focus sur la date de naissance ; Oui ou Changer → sur l'encadré
        var hr = b.dataset.ref, hk = b.dataset.homo, mn = /^np-(\d+)$/.exec(hr), mt = /^tr-(\d+)-in-(\d+)$/.exec(hr);
        gi.edit(function () { app.homoAnswer(hr, hk, +b.dataset.id); });
        host.draw(hk === 'no' ? (mn ? '.cell[data-r="' + mn[1] + '"][data-c="birth"]' : mt ? '.cell[data-r="' + mt[1] + '"][data-c="in:' + mt[2] + ':np_birth"]' : '#homo-' + hr) : '#homo-' + hr + ' button'); return;
      }
      else if (b.dataset.act === 'pcb-accept') { gi.edit(function () { app.setCell(+b.dataset.r, b.dataset.c, b.dataset.name); }); draw([+b.dataset.r, b.dataset.c]); return; }
      else if (b.dataset.act === 'save-trade') { if (b.getAttribute('aria-disabled') === 'true') return; saveCard(+b.dataset.ti); return; }
      else if (b.dataset.act === 'csv') { download('evenements_' + app.state.tab + '.csv', app.csvRows(), 'text/csv'); return; }
      else if (b.dataset.act === 'json') { download('evenements.json', app.jsonExport(), 'application/json'); return; }
      else if (b.dataset.act === 'reset') { if (window.confirm(app.t('entry.confirm_reset'))) app.reset(); else return; }
      else return;
      draw();
    });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
