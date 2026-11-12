/* Événements de la saison : règles de validation et valeurs calculées (sans interface, testable avec Node). */
(function (root) {
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
  // matchs manqués sur blessure : matchs de la cédule strictement après la date de blessure et strictement avant la date de retour
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
      // matchs manqués : calculés d'après la cédule de la saison
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
    ['fp', 'tp'].forEach(function (c) { if (!r[c]) out.push(A(c, 'err', 'val.required')); else if (POS.indexOf(r[c]) < 0) out.push(A(c, 'err', 'val.position_unknown')); });
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
    if (r.first && r.last && ctx.names && ctx.names[(r.first + ' ' + r.last).toLowerCase()]) out.push(A('last', 'warn', 'val.player_exists'));
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

;/* Écran des événements : grilles clavier d'abord, alertes, enregistrement local, export. */
(function (root) {
  var FTC = root.FTC || (typeof require !== 'undefined' ? require('../season/countries.js') : null);
  var TC = root.FTTC || (typeof require !== 'undefined' ? require('../connect/team_combo.js') : null);
  var V = root.FTV || (typeof require !== 'undefined' ? require('./events_core.js') : null);
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STORE_KEY = 'ft_events_v1';
  var YN = ['yes', 'no'], DIRS = ['out', 'in'], ATYPES = ['player', 'pick'], CTYPES = ['one_way', 'two_way'], HANDS = ['L', 'R'], VIA = ['start', 'draft', 'trade', 'free_agent', 'waivers'];

  function makeEventsApp(DATA, store) {
    var entries = { mv: [], ct: [], tr: [], pc: [], np: [], mvx: [], ctx: [], os: [], trf: [] };   // trf : échanges saisis (deux équipes × 5 éléments)   // mvx : modifications d'événements déjà enregistrés (par identifiant)
    try { var sv = store && store.get(STORE_KEY); if (sv) entries = Object.assign(entries, JSON.parse(sv)); } catch (e) { /* stockage indisponible */ }
    var state = { lang: 'fr', tab: 'mv', season: DATA.franchise.current + 1, plq: '', plpos: '', plst: '' };
    var TEAMS = {}; DATA.teams.forEach(function (tm) { TEAMS[tm.code] = tm; }); (DATA.teams || []).forEach(function (tm) { TEAMS[tm.en] = tm; });
    var capBy = {}; DATA.cap.forEach(function (c) { capBy[c[0]] = c.slice(1); });
    var byId = {}; DATA.players.forEach(function (p) { byId[p.id] = p; });

    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s; }
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    function teamName(code) { var tm = TEAMS[code]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : (code || ''); }
    function money(x) { return x == null ? '' : x.toLocaleString(state.lang === 'fr' ? 'fr-CA' : 'en-CA') + ' $'; }
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }

    // ---- schémas des grilles ----
    var POSOPT = V.POS.map(function (p) { return [p, 'pc.' + p]; });
    var SCHEMA = {
      mv: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['move', 'col.move', 'sel', V.MOVES.map(function (m) { return [m, 'move.' + m]; })], ['ret', 'col.return', 'date'], ['games', 'col.games_missed', 'int'], ['claimed', 'col.claimed', 'sel', YN.map(function (y) { return [y, 'claimed.' + y]; })]],
      ct: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['event', 'col.event', 'sel', V.EVENTS.map(function (x) { return [x, 'ev.' + x]; })], ['ctype', 'col.contract_type', 'sel', CTYPES.map(function (c) { return [c, 'ctype.' + c]; })], ['years', 'col.years', 'ysel'], ['first', 'col.first_season', 'fsel'], ['aav', 'col.aav', 'int']].concat([1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return ['cl' + k, 'ct.col_clause' + k, 'csel']; })),
      os: [['date', 'col.date', 'date'], ['pid', 'col.player', 'pidsel'], ['event', 'col.event', 'sel', [['signed', 'os.signed'], ['unmatched', 'os.unmatched']]], ['comp', 'os.comp', 'sel', YN.map(function (y) { return [y, 'claimed.' + y]; })]].concat([1, 2, 3, 4].reduce(function (a, k) { return a.concat([['p' + k + 't', 'os.pick_team' + k, 'team'], ['p' + k + 'y', 'os.pick_year' + k, 'int'], ['p' + k + 'r', 'os.pick_round' + k, 'rsel']]); }, [])),
      tr: [['date', 'col.date', 'date'], ['partner', 'col.partner', 'team'], ['grp', 'col.group', 'text'], ['dir', 'col.direction', 'sel', DIRS.map(function (d) { return [d, 'dir.' + d]; })], ['type', 'col.asset_type', 'sel', ATYPES.map(function (a) { return [a, 'asset.' + a]; })], ['pid', 'col.player', 'player'], ['year', 'col.pick_year', 'int'], ['round', 'col.round', 'int'], ['orig', 'col.orig_team', 'team'], ['ret', 'col.retained', 'int'], ['ryears', 'col.retained_years', 'int']],
      pc: [['date', 'col.date', 'date'], ['pid', 'col.player', 'player'], ['fp', 'col.from_primary', 'sel', POSOPT], ['fs', 'col.from_secondary', 'sel', POSOPT], ['tp', 'col.to_primary', 'sel', POSOPT], ['ts', 'col.to_secondary', 'sel', POSOPT]],
      np: [['first', 'col.first_name', 'text'], ['last', 'col.last_name', 'text'], ['num', 'col.number', 'int'], ['pos', 'col.position', 'sel', POSOPT], ['pos2', 'col.position2', 'pos2sel'], ['height', 'picks.col_height', 'htcm'], ['weight', 'picks.col_weight', 'wtkg'], ['birth', 'picks.col_birth', 'date'],
           ['hand', 'picks.col_hand', 'sel', HANDS.map(function (h) { return [h, 'hand.' + h]; })], ['country', 'picks.col_country', 'ctry'], ['ptype', 'picks.col_ptype', 'ptsel'], ['dyear', 'col.draft_year', 'int'], ['dround', 'col.draft_round', 'int'], ['dpick', 'col.draft_pick', 'int'], ['dteam', 'col.draft_team', 'team'],
           ['date', 'col.date', 'date'], ['via', 'col.via', 'viaro']]
    };

    // ---- joueurs : existants + nouveaux (identifiants temporaires négatifs) ----
    function allPlayers() {
      var l = DATA.players.slice();
      entries.np.forEach(function (r, i) { if (r.first && r.last) l.push({ id: -(i + 1), name: (r.first + ' ' + r.last).trim(), pos: r.pos === 'G' ? 'G' : (r.pos === 'LD' || r.pos === 'RD') ? 'D' : 'F' }); });
      return l;
    }
    function pidFromName(name) { var n = String(name || '').trim().toLowerCase(); if (!n) return null; var p = allPlayers().filter(function (x) { return x.name.toLowerCase() === n; })[0]; return p ? p.id : null; }
    function nameOf(pid) { var p = allPlayers().filter(function (x) { return x.id === pid; })[0]; return p ? p.name : ''; }

    function persist() { try { store && store.set(STORE_KEY, JSON.stringify(entries)); } catch (e) { /* ignore */ } }
    function blank(tab) {
      var last = entries[tab][entries[tab].length - 1], r = {};
      if (tab !== 'np' && tab !== 'tr') r.date = (last && last.date) || DATA.franchise.date;   // (os et ct comprises)
      if (tab === 'tr') { r.date = (last && last.date) || DATA.franchise.date; if (last) { r.partner = last.partner; r.grp = last.grp; } }
      if (tab === 'np') r.date = (last && last.date) || DATA.franchise.date;
      return r;
    }
    function npSetCell(ri, c, raw) {
      var v = String(raw == null ? '' : raw).trim();
      if (c === 'via') return false;
      if (c === 'height') { v = parseHeight(v); if (v === false) return false; } else if (c === 'weight') { v = parseWeight(v); if (v === false) return false; v = v === '' ? '' : Math.round(v); }
      else if (c === 'country' && v !== '' && !FTC.LIST.some(function (x) { return x.en === v; })) return false;
      else if (c === 'pos') {   // le poste secondaire et le type de joueur dépendent du poste
        while (entries.np.length <= ri) entries.np.push(blank('np')); var rw = entries.np[ri], g0 = V.GROUP_OF[v]; rw.pos = v;
        if (V.secondaryOptions(v).indexOf(rw.pos2) < 0) rw.pos2 = ''; if (g0 && rw.ptype && V.PTYPES[g0].indexOf(rw.ptype) < 0) rw.ptype = ''; persist(); return true;
      } else return undefined;
      while (entries.np.length <= ri) entries.np.push(blank('np'));
      entries.np[ri][c] = v === '' ? '' : (c === 'height' ? Math.round(v * 10) / 10 : v); persist(); return true;
    }
    function setCell(r, c, raw) {
      if (state.tab === 'np') { var rn = npSetCell(r, c, raw); if (rn !== undefined) return rn; }
      if (state.tab === 'pc' && (c === 'fp' || c === 'fs')) return false;   // positions de départ calculées d'après les données déjà saisies
      if (state.tab === 'tr') return trSetCell(r, c, raw);
      if (state.tab === 'mv') return mvSetCell(r, c, raw); if (state.tab === 'ct') return ctSetCell(r, c, raw); if (state.tab === 'os') return osSetCell(r, c, raw);
      var tab = state.tab, rows = entries[tab], def = SCHEMA[tab].filter(function (d) { return d[0] === c; })[0]; if (!def) return false;
      var v = String(raw == null ? '' : raw).trim();
      if (def[2] === 'int') { if (v === '') v = ''; else { v = v.replace(',', '.'); if (isNaN(v)) return false; v = Math.round(+v); } }
      if (def[2] === 'team') { var tcode = TC.resolve(v, DATA.teams); if (tcode === null) return false; v = tcode; }
      if (r >= rows.length) { rows.push(blank(tab)); r = rows.length - 1; }
      if (def[2] === 'player') { rows[r].pname = v; rows[r].pid = pidFromName(v); } else rows[r][c] = v;
      if (tab === 'tr' && c === 'type') { /* conserve les champs inutiles mais ignorés */ }
      persist(); return true;
    }
    function removeRow(r) {
      if (state.tab === 'mv') { var it = mvItems()[r]; if (it && it.kind === 'new') entries.mv.splice(it.i, 1); else if (it) entries.mvx = entries.mvx.filter(function (x) { return x.id !== it.id; }); persist(); return; }
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
    function contractList() {
      var l = DATA.base.ct.map(function (c) { var ed = ctEdit(c[0]); if (!ed) return { id: 'b' + c[0], pid: c[2], start: c[8], end: c[9], aav: c[6] }; var r = ctRowOf(c), d = V.contractDerived(r); return { id: 'b' + c[0], pid: r.pid, start: V.num(r.first) !== null ? r.first + '-07-01' : r.date, end: d.end || null, aav: V.num(r.aav) }; });
      entries.ct.forEach(function (r, i) { var d = V.contractDerived(r); if (r.pid && d.end) l.push({ id: 'n' + i, pid: r.pid, start: V.num(r.first) !== null ? r.first + '-07-01' : r.date, end: d.end, aav: V.num(r.aav) }); });
      return l;
    }
    function ctx() {
      var list = contractList();
      return { cap: capBy, currentSeason: DATA.franchise.current, names: (function () { var o = {}; DATA.players.forEach(function (p) { o[p.name.toLowerCase()] = 1; }); return o; })(),
               contractsOf: function (pid, id) { return list.filter(function (o) { return o.pid === pid && o.id !== id; }); },
               aavAt: function (pid, d) { var c = list.filter(function (o) { return o.pid === pid && o.start <= d && o.end >= d; })[0]; return c ? c.aav : null; } };
    }


    // ---- mouvements et blessures : tous les événements de la saison, modifiables après l'envoi ----
    function scheduleOf(season) { return (DATA.schedule || {})[String(season)] || []; }
    function mvEdit(id) { return entries.mvx.filter(function (x) { return x.id === id; })[0]; }
    function claimedOf(v) { return v === 1 || v === true ? 'yes' : v === 0 || v === false ? 'no' : ''; }
    function gamesOfRow(r) { return r.move === 'injury' && V.isDate(r.date) && V.isDate(r.ret) ? V.missedGames(scheduleOf(V.seasonOf(r.date)), r.date, r.ret) : null; }
    // lignes de la table : événements enregistrés de la saison (avec les modifications en attente), puis les nouvelles lignes
    function mvItems() {
      var items = [];
      DATA.base.mv.filter(function (b) { return b[0] === state.season; }).forEach(function (b) {
        var ed = mvEdit(b[7]), g = function (k, d) { return ed && ed[k] != null ? ed[k] : d; };
        items.push({ kind: 'base', id: b[7], edited: !!ed, r: { id: b[7], date: g('date', b[1]), pid: g('pid', b[2]), move: g('move', b[3]), ret: g('ret', b[4] || ''), claimed: g('claimed', claimedOf(b[6])) } });
      });
      entries.mv.forEach(function (r, i) { items.push({ kind: 'new', i: i, r: r }); });
      return items;
    }
    function mvSetCell(ri, c, raw) {
      var def = SCHEMA.mv.filter(function (d) { return d[0] === c; })[0]; if (!def || c === 'games') return false;
      var v = String(raw == null ? '' : raw).trim(), items = mvItems(), it = items[ri];
      if (c === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      if (!it) { entries.mv.push(blank('mv')); it = { kind: 'new', i: entries.mv.length - 1, r: entries.mv[entries.mv.length - 1] }; }
      var tgt = it.kind === 'new' ? entries.mv[it.i] : (mvEdit(it.id) || (entries.mvx.push({ id: it.id }), mvEdit(it.id)));
      tgt[c] = v; if (c === 'pid') tgt.pname = v == null ? '' : nameOf(v);
      // formulaire conditionnel : « retour » seulement pour une blessure, « réclamé » seulement pour une cession à la LAH
      if (c === 'move') { if (v !== 'injury') tgt.ret = ''; if (v !== 'send_down') tgt.claimed = ''; }
      persist(); return true;
    }
    function mvCtx() {
      var cx = ctx(), inj = []; cx.currentSeason = state.season; mvItems().forEach(function (it) { if (it.r.move === 'injury' && it.r.pid && V.isDate(it.r.date)) inj.push({ id: it.kind === 'base' ? it.id : 'n' + it.i, pid: it.r.pid, date: it.r.date, ret: it.r.ret || null }); });
      cx.stints = DATA.stints || null; cx.scheduleOf = scheduleOf; cx.gamesPerSeason = DATA.franchise.games || 82;
      cx.injuriesOf = function (pid, id) { return inj.filter(function (o) { return o.pid === pid && o.id !== id; }); }; return cx;
    }
    function mvAlerts() {
      var cx = mvCtx(); return mvItems().map(function (it) { var a = V.validateMove(Object.assign({}, it.r, { id: it.kind === 'base' ? it.id : 'n' + it.i }), cx); if (it.r.pid == null && it.r.pname && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] }); if (V.isDate(it.r.date) && V.seasonOf(it.r.date) !== state.season) a.push({ c: 'date', level: 'warn', k: 'val.date_other_season', p: [] }); return a; });
    }
    // joueurs actifs avec l'équipe à la date de l'événement (le joueur déjà choisi reste affiché pour pouvoir le corriger)
    function mvPlayers(date, current) {
      var list = allPlayers().filter(function (p) { return p.id === current || p.id < 0 || !DATA.stints || !V.isDate(date) || V.activeAt(DATA.stints, p.id, date); });
      return list.sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); });
    }
    function mvGridHTML() {
      var items = mvItems(), al = mvAlerts(), body = '', total = 0, sc = SCHEMA.mv, def = function (c) { return sc.filter(function (d) { return d[0] === c; })[0]; }, na = '<td class="d ro na"></td>';
      for (var i = 0; i <= items.length; i++) {
        var it = items[i], r = it ? it.r : blank('mv'), a = al[i] || [], inj = r.move === 'injury', sd = r.move === 'send_down', g = inj && it ? gamesOfRow(r) : null;
        total += a.length;
        var opts = '<option value=""></option>' + mvPlayers(r.date, r.pid).map(function (p) { return '<option value="' + p.id + '"' + (p.id === r.pid ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
        body += '<tr data-row="' + i + '"' + (it && it.kind === 'base' ? ' class="saved' + (it.edited ? ' edited' : '') + '"' : '') + '>' + cellHTML(def('date'), r, i, a) +
          '<td class="ci' + cellClass(a, 'pid') + '"' + cellTitle(a, 'pid') + '><select class="cell" data-r="' + i + '" data-c="pid" aria-label="' + esc(t('col.player')) + '">' + opts + '</select></td>' + cellHTML(def('move'), r, i, a) +
          (inj ? cellHTML(def('ret'), r, i, a) : na) + (inj ? '<td class="num d' + cellClass(a, 'games') + '"' + cellTitle(a, 'games') + '>' + (g == null ? '—' : g) + '</td>' : na) + (sd ? cellHTML(def('claimed'), r, i, a) : na) +
          '<td class="al" title="' + esc(alertsText(a)) + '">' + (a.length ? '<span class="badge' + (a.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '">' + a.length + '</span>' : '') + '</td><td>' + (it && (it.kind === 'new' || it.edited) ? '<button class="x" data-rm="' + i + '" title="' + esc(t(it.kind === 'new' ? 'ev.remove' : 'ev.undo_edit')) + '">×</button>' : '') + '</td></tr>';
      }
      var head = '<tr>' + sc.map(function (d) { return '<th>' + esc(t(d[1])) + '</th>'; }).join('') + '<th></th><th></th></tr>';
      return { html: '<div class="scroll' + (items.length > 16 ? ' vs' : '') + '"><table class="grid ev mv" id="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>', alerts: total };
    }
    function defsHTML() {
      var K = { mv: ['mv', ['date', 'player', 'move', 'return', 'games', 'claimed', 'edit']], ct: ['ct', ['date', 'player', 'event', 'type', 'years', 'first', 'aav', 'clause', 'edit']], os: ['os', ['date', 'player', 'event', 'comp', 'picks']], tr: ['tr', ['trade', 'team', 'type', 'player', 'ret', 'pick', 'edit']] }[state.tab]; if (!K) return '';
      return '<section class="defs" id="defs-help"><h4>' + esc(t('ui.defs')) + '</h4><dl>' + K[1].map(function (k) { return '<div><dt>' + esc(t('ev.' + K[0] + 't_' + k)) + '</dt><dd>' + esc(t('ev.' + K[0] + 'd_' + k)) + '</dd></div>'; }).join('') + '</dl></section>';
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
      var def = SCHEMA.ct.filter(function (d) { return d[0] === c; })[0]; if (!def) return false;
      var v = String(raw == null ? '' : raw).trim(), items = ctItems(), it = items[ri];
      if (c === 'pid') { var n = v === '' ? null : /^-?\d+$/.test(v) ? +v : pidFromName(v); if (v !== '' && n == null) return false; v = n; }
      else if (c === 'aav') { v = v.replace(/[\s\u00a0$]/g, '').replace(',', '.'); if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : Math.round(+v); }
      else if (c === 'years' || c === 'first') { if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : +v; }
      if (!it) { entries.ct.push(blank('ct')); it = { kind: 'new', i: entries.ct.length - 1, r: entries.ct[entries.ct.length - 1] }; }
      var tgt = it.kind === 'new' ? entries.ct[it.i] : (ctEdit(it.id) || (entries.ctx.push({ id: it.id }), ctEdit(it.id))), k;
      tgt[c] = v; if (c === 'pid') tgt.pname = v == null ? '' : nameOf(v);
      // formulaire conditionnel : rachat et libération n'ont ni type, ni années, ni saison, ni salaire, ni clause ; les clauses n'existent que pour un contrat à un volet, une par année du contrat
      if (c === 'event' && V.NO_TERMS.indexOf(v) >= 0) { ['ctype', 'years', 'first', 'aav'].forEach(function (x) { tgt[x] = ''; }); for (k = 1; k <= 8; k++) tgt['cl' + k] = ''; }
      if (c === 'ctype' && v !== 'one_way') for (k = 1; k <= 8; k++) tgt['cl' + k] = '';
      if (c === 'years') for (k = 1; k <= 8; k++) if (v === '' || k > +v) tgt['cl' + k] = '';
      persist(); return true;
    }
    function ctAlerts() {
      var cx = ctx(); cx.stints = DATA.stints || null;
      return ctItems().map(function (it) { var a = V.validateContract(Object.assign({}, it.r, { id: it.kind === 'base' ? 'b' + it.id : 'n' + it.i }), cx); if (it.r.pid == null && it.r.pname && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] }); if (V.isDate(it.r.date) && V.seasonOf(it.r.date) !== state.season) a.push({ c: 'date', level: 'warn', k: 'val.date_other_season', p: [] }); return a; });
    }
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
        var d = it && terms ? derived('ct', r, i) : ['—', '—'], row = '<tr data-row="' + i + '"' + (it && it.kind === 'base' ? ' class="saved' + (it.edited ? ' edited' : '') + '"' : '') + '>' + cellHTML(def('date'), r, i, a) + selTD('pid', i, a, playerOpts(ctPlayers(r.date, r.pid, r.event), r.pid), r.pid) + cellHTML(def('event'), r, i, a) +
          (terms ? cellHTML(def('ctype'), r, i, a) : na) + (terms ? selTD('years', i, a, yrsOpts, r.years) : na) + (terms ? selTD('first', i, a, fo, r.first) : na) + (terms ? cellHTML(def('aav'), r, i, a) : na);
        for (k = 1; k <= 8; k++) row += one && k <= yrs ? selTD('cl' + k, i, a, clOpts, r['cl' + k]) : na;
        body += row + d.map(function (x, n) { return '<td class="num d" data-d="' + n + '">' + esc(x) + '</td>'; }).join('') + alertTD(a, it && (it.kind === 'new' || it.edited), t(it && it.kind === 'new' ? 'ev.remove' : 'ev.undo_edit')).replace('data-rm="@"', 'data-rm="' + i + '"') + '</tr>';
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
    function newSlot() { return { type: '', pid: null, pname: '', ret: '', ryears: '', orig: '', year: '', round: '' }; }
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
      else if (['ret', 'ryears', 'year', 'round'].indexOf(field) >= 0) { v = v.replace(/[\s\u00a0$]/g, '').replace(',', '.'); if (v !== '' && isNaN(v)) return false; v = v === '' ? '' : Math.round(+v); }
      else if (field === 'type' && v !== '' && v !== 'player' && v !== 'pick') return false;
      var tr = entries.trf[ti]; if (!tr) { tr = newTrade(); entries.trf.push(tr); }
      if (parts.length === 1) tr[c] = v;
      else {
        var sl = tr[parts[0]][+parts[1]]; sl[field] = v; if (field === 'pid') sl.pname = v == null ? '' : nameOf(v);
        // champs conditionnels : un joueur n'a ni équipe d'origine, ni année, ni ronde ; un choix n'a ni joueur ni rétention
        if (field === 'type') { if (v !== 'player') { sl.pid = null; sl.pname = ''; sl.ret = ''; sl.ryears = ''; } if (v !== 'pick') { sl.orig = ''; sl.year = ''; sl.round = ''; } }
      }
      persist(); return true;
    }
    function trModel() {
      var rows = [], meta = [], cx = ctx(); cx.stints = DATA.stints || null;
      entries.trf.forEach(function (tr, ti) { TR_SIDES.forEach(function (side) { tr[side].forEach(function (sl, s) {
        if (!(sl.type || sl.pid || sl.ret !== '' || sl.ryears !== '' || sl.orig || sl.year !== '' || sl.round !== '')) return;
        rows.push({ date: tr.date, partner: tr.partner, grp: 'g' + ti, dir: side, type: sl.type, pid: sl.pid, pname: sl.pname, year: sl.year, round: sl.round, orig: sl.orig, ret: sl.ret, ryears: sl.ryears }); meta.push({ t: ti, side: side, s: s }); }); }); });
      var groups = V.tradeGroups(rows), gA = {}; groups.order.forEach(function (k) { gA[k] = V.validateTradeGroup(rows, groups.g[k]); });
      var alerts = rows.map(function (r) {
        var a = V.validateTradeRow(r, cx).filter(function (x) { return x.c !== 'date' && x.c !== 'partner' && x.c !== 'dir'; });
        if (r.type === 'player' && r.pid && V.isDate(r.date) && cx.stints) { var act = V.activeAt(cx.stints, r.pid, r.date); if (r.dir === 'out' && !act) a.push({ c: 'pid', level: 'err', k: 'val.player_not_active', p: [] }); if (r.dir === 'in' && act) a.push({ c: 'pid', level: 'warn', k: 'val.trade_player_already_ours', p: [] }); }
        if (r.pid == null && r.pname) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] });
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
          body += sel(side, s, 'type', a, [['player', t('tr.type_player')], ['pick', t('tr.type_pick')]], sl.type) + (isP ? sel(side, s, 'pid', a, pl.map(function (p) { return [p.id, p.name]; }), sl.pid) : na) +
            (isP ? inp(side, s, 'ryears', a, sl.ryears, 'int') + inp(side, s, 'ret', a, sl.ret, 'int') : na + na) +
            (isK ? '<td class="ci' + cellClass(ae(a, 'orig'), 'orig') + '"' + cellTitle(ae(a, 'orig'), 'orig') + '><input class="cell tcombo" list="dl-teams" data-r="' + ti + '" data-c="' + side + ':' + s + ':orig" value="' + esc(sl.orig ? teamNm(sl.orig) : '') + '" autocomplete="off"></td>' + inp(side, s, 'year', a, sl.year, 'int') + sel(side, s, 'round', a, rOpts.map(function (x) { return [x, x]; }), sl.round) : na + na + na) + (si === 0 ? '<td class="gap"></td>' : '');
        });
        body += '</tr>';
      }
      var sideHead = function (side) { var code = side === 'out' ? ours : tr.partner; return '<th colspan="7" class="side">' + (code ? logoHTML(code) : '') + '<span>' + esc(code ? teamNm(code) : t('tr.partner_pending')) + '</span></th>'; };
      var sub = '<th rowspan="2">' + esc(t('tr.type')) + '</th><th rowspan="2">' + esc(t('tr.player')) + '</th><th colspan="2" class="grp">' + esc(t('tr.ret_group')) + '</th><th colspan="3" class="grp">' + esc(t('tr.pick_group')) + '</th>', sub2 = '<th>' + esc(t('tr.ret_years')) + '</th><th>' + esc(t('tr.ret_amount')) + '</th><th>' + esc(t('tr.pick_team')) + '</th><th>' + esc(t('tr.pick_year')) + '</th><th>' + esc(t('tr.pick_round')) + '</th>';
      var hdA = ae(ha, 'date'), hpA = ae(ha, 'partner');
      var html = '<section class="tcard' + (tr.editId ? ' editing' : '') + '" data-ti="' + ti + '"><header class="tch"><label>' + esc(t('col.date')) + '<input class="cell date' + cellClass(hdA, 'date') + '" data-r="' + ti + '" data-c="date" value="' + esc(tr.date) + '"></label>' +
        '<label>' + esc(t('col.partner')) + '<input class="cell tcombo' + cellClass(hpA, 'partner') + '" list="dl-teams" data-r="' + ti + '" data-c="partner" value="' + esc(tr.partner ? teamNm(tr.partner) : '') + '" autocomplete="off"></label>' + (tr.partner ? logoHTML(tr.partner) : '') +
        (tr.editId ? '<span class="tedit">' + esc(fmt('tr.editing', [tr.date])) + '</span>' : '') + (ha.length ? '<span class="badge' + (ha.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '" title="' + esc(alertsText(ha)) + '">' + ha.length + '</span>' : '') +
        (entries.trf[ti] ? '<button class="x" data-rm="' + ti + '" title="' + esc(t(tr.editId ? 'tr.undo' : 'ev.remove')) + '">×</button>' : '') + '</header>' +
        '<div class="scroll"><table class="grid ev trg"><thead><tr class="tsides"><th></th>' + sideHead('out') + '<th class="gap"></th>' + sideHead('in') + '</tr><tr><th></th>' + sub + '<th class="gap"></th>' + sub + '</tr><tr><th></th>' + sub2 + '<th class="gap"></th>' + sub2 + '</tr></thead><tbody>' + body + '</tbody></table></div></section>';
      return { html: html, alerts: total };
    }
    function trGridHTML() { var m = trModel(), html = '', total = 0; for (var i = 0; i <= entries.trf.length; i++) { var c = trCardHTML(i, m); html += c.html; total += c.alerts; } return { html: html, alerts: total }; }
    function trBaseHTML() {
      var list = DATA.base.tr.filter(function (x) { return inSeason(x.date); }), editing = {}; entries.trf.forEach(function (x) { if (x.editId) editing[x.editId] = 1; });
      var item = function (a) { return '<li>' + (a[1] === 'player' ? '<b>' + esc(t('asset.player')) + '</b> ' + esc(nameOf(a[2])) + (a[6] ? ' <small>(' + esc(fmt('tr.retention_text', [fmtMoney(a[6]), a[7] || '?'])) + ')</small>' : '') : '<b>' + esc(t('asset.pick')) + '</b> ' + esc(a[3] + ' · ' + t('tr.pick_round') + ' ' + a[4]) + ' ' + '<span class="plg" title="' + esc(teamNm(a[5])) + '">' + logoHTML(a[5]) + '</span>') + '</li>'; };
      return '<details class="base trbase" open><summary>' + esc(t('ev.already')) + ' · ' + list.length + '</summary><div class="trlist">' + list.map(function (x) {
        var out = x.assets.filter(function (a) { return a[0] === 'out'; }), inn = x.assets.filter(function (a) { return a[0] === 'in'; });
        var who = function (code, label, items) { return '<div class="trcol"><h5 class="who">' + logoHTML(code) + '<b>' + esc(teamNm(code)) + '</b></h5><div class="sub">' + esc(label) + '</div><ul>' + items.map(item).join('') + '</ul></div>'; };
        return '<article class="trc' + (editing[x.id] ? ' editing' : '') + '"><header><span class="d">' + esc(x.date) + '</span><button class="btn small" data-act="edit-trade" data-id="' + x.id + '" type="button"' + (editing[x.id] ? ' disabled' : '') + '>' + esc(t(editing[x.id] ? 'tr.in_edit' : 'tr.edit')) + '</button></header><div class="cols">' + who(DATA.franchise.code, t('tr.sent'), out) + who(x.partner, t('tr.received'), inn) + '</div></article>'; }).join('') + '</div></details>';
    }
    function fmtMoney(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
    function editTrade(id) { if (entries.trf.some(function (x) { return x.editId === id; })) return false; var b = DATA.base.tr.filter(function (x) { return x.id === id; })[0]; if (!b) return false; entries.trf.push(trFromBase(b)); persist(); return true; }


    // ---- liste des joueurs (comme la feuille PlayersList de l'Excel) : lecture seule, avec recherche et filtres ----
    var PL_ST = { Veteran: 'pl.st_veteran', Rookie: 'pl.st_rookie', Prospect: 'pl.st_prospect' }, PL_VIA = { 'Draft': 'draft', 'Free Agent': 'free_agent', 'Start': 'start', 'Trade': 'trade', 'Waivers': 'waivers' }, PL_DEP = { 'Release': 'ev.release', 'Buy Out': 'ev.buy_out', 'Retirement': 'pl.dep_retirement', 'Trade': 'via.trade' }, PL_HAND = { Left: 'L', Right: 'R' };
    var PL_COLS = [['pl.col_no', 'n'], ['col.first_name', 'first'], ['col.last_name', 'last'], ['col.number', 'num'], ['pl.col_pos_orig', 'po'], ['pl.col_pos_cur', 'pc'], ['pl.col_pos2_orig', 'so'], ['pl.col_pos2_cur', 'sc'], ['picks.col_height', 'h'], ['picks.col_weight', 'w'], ['picks.col_birth', 'b'], ['picks.col_hand', 'hand'], ['picks.col_ptype', 'pt'], ['col.draft_year', 'dy'], ['col.draft_round', 'dr'], ['col.draft_pick', 'dp'], ['col.draft_team', 'dt'], ['picks.col_country', 'co'], ['pl.col_status', 'st'], ['pl.col_acq_date', 'ad'], ['pl.col_acq_via', 'av'], ['pl.col_dep_date', 'dd'], ['pl.col_dep_via', 'dv'], ['pl.col_key', 'key']];
    function plNorm(s) { return TC.norm(s); }
    function plRows() {
      var q = plNorm(state.plq), pos = state.plpos, st = state.plst;
      return (DATA.roster || []).filter(function (r) {
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
        case 'pt': return r[11] ? (V.PTSLUG[r[11]] ? t('ptype.' + V.PTSLUG[r[11]]) : r[11]) : ''; case 'dy': return s(r[12]); case 'dr': return s(r[13]); case 'dp': return s(r[14]); case 'dt': return r[15] ? tn(r[15]) : '';
        case 'co': return r[16] ? FTC.name(r[16], state.lang) : ''; case 'st': return r[17] ? (PL_ST[r[17]] ? t(PL_ST[r[17]]) : r[17]) : ''; case 'ad': return s(r[18]); case 'av': return r[19] ? t('via.' + (PL_VIA[r[19]] || r[19])) : '';
        case 'dd': return s(r[20]); case 'dv': return r[21] ? t(PL_DEP[r[21]] || r[21]) : ''; case 'key': return s(r[1]);
      }
      return '';
    }
    function plBodyHTML() {
      return plRows().map(function (r, i) { return '<tr>' + PL_COLS.map(function (c) { var v = plCell(r, c[1], i + 1), fl = c[1] === 'co' && r[16] && FTC.flagURL(r[16]) ? '<img class="flag" src="' + FTC.flagURL(r[16]) + '" alt="" onerror="this.style.display=\'none\'"> ' : ''; return '<td' + (/^(n|num|h|w|dy|dr|dp)$/.test(c[1]) ? ' class="num"' : '') + '>' + fl + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('');
    }
    function plGridHTML() {
      var total = (DATA.roster || []).length, n = plRows().length, pOpts = V.POS.map(function (x) { return '<option value="' + x + '"' + (state.plpos === x ? ' selected' : '') + '>' + esc(posLabel(x)) + '</option>'; }).join('');
      var filt = '<div class="plf"><input type="search" data-pl="q" value="' + esc(state.plq) + '" placeholder="' + esc(t('pl.search')) + '" aria-label="' + esc(t('pl.search')) + '"><select data-pl="pos" aria-label="' + esc(t('col.position')) + '"><option value="">' + esc(t('pl.all_pos')) + '</option>' + pOpts + '</select><select data-pl="st" aria-label="' + esc(t('pl.col_status2')) + '">' + [['', 'pl.all'], ['active', 'pl.active'], ['gone', 'pl.gone']].map(function (o) { return '<option value="' + o[0] + '"' + (state.plst === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select><span class="plcount" id="pl-count">' + n + ' / ' + total + '</span></div>';
      return { html: filt + '<div class="scroll vs"><table class="grid ev pl"><thead><tr>' + PL_COLS.map(function (c) { return '<th>' + esc(t(c[0])) + '</th>'; }).join('') + '</tr></thead><tbody id="pl-body">' + plBodyHTML() + '</tbody></table></div>', alerts: 0 };
    }
    function rowAlerts(tab) {
      if (tab === 'pl') return [];
      if (tab === 'tr') { var mt = trModel(); return mt.alerts.concat(mt.head); }
      if (tab === 'mv') return mvAlerts(); if (tab === 'ct') return ctAlerts(); if (tab === 'os') return osAlerts();
      var rows = entries[tab], cx = ctx(), out = [];
      var groups = tab === 'tr' ? V.tradeGroups(rows) : null, gAlerts = {};
      if (groups) groups.order.forEach(function (k) { groups.g[k].forEach(function (i) { gAlerts[i] = V.validateTradeGroup(rows, groups.g[k]); }); });
      rows.forEach(function (r, i) {
        var a = [];
        if (tab === 'mv') a = V.validateMove(r, cx); else if (tab === 'ct') a = V.validateContract(Object.assign({ id: 'n' + i }, r), cx);
        else if (tab === 'tr') a = V.validateTradeRow(r, cx).concat(gAlerts[i] || []); else if (tab === 'pc') { cx.stints = DATA.stints || null; var fr_ = r.pid ? fromOf(r.pid, r.date, i) : ['', '']; a = V.validatePosChange(Object.assign({}, r, { fp: fr_[0], fs: fr_[1] }), cx); } else a = V.validateNewPlayer(r, cx);
        if (r.pname && !r.pid && tab !== 'np' && !a.some(function (x) { return x.c === 'pid'; })) a.push({ c: 'pid', level: 'err', k: 'val.player_missing', p: [] });
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
      var np = entries.np.filter(function (n) { return n.pid === pid || ('-' + (entries.np.indexOf(n) + 1)) === String(pid); })[0];
      return [byId_.pos1 || (np && np.pos) || '', (np && np.pos2) || ''];
    }
    // acquis par (calculé) : repêchage si l'information de repêchage est saisie, sinon l'événement lié (contrat ou échange), sinon début de franchise ou joueur autonome
    function npVia(r, i) {
      var pid = -(i + 1), evt = null, ct = entries.ct.filter(function (x) { return x.pid === pid; })[0];
      if (ct) evt = { free_agent: 'free_agent', acquired: 'waivers', traded_for: 'trade' }[ct.event] || null;
      if (!evt && entries.trf.some(function (tr) { return tr.in.some(function (s) { return s.pid === pid; }); })) evt = 'trade';
      return V.viaFrom(r, evt, DATA.franchise.first + '-10-01');
    }
    function fmtHeight(v) { if (v === '' || v == null || isNaN(v)) return ''; return state.lang === 'fr' ? String(Math.round(v * 2.54)) : Math.floor(Math.round(v) / 12) + "'" + (Math.round(v) % 12); }
    function fmtWeight(v) { if (v === '' || v == null || isNaN(v)) return ''; return state.lang === 'fr' ? String(Math.round(v * 0.45359237)) : String(Math.round(v)); }
    function parseHeight(v) { if (v === '') return ''; var m = /^(\d+)\s*(?:'|\u2019|-|\s)\s*(\d{1,2})\s*(?:"|''|\u201d)?$/.exec(v); if (m) return +m[1] * 12 + +m[2]; var n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) return false; return state.lang === 'fr' ? n / 2.54 : n; }
    function parseWeight(v) { if (v === '') return ''; var w = parseFloat(String(v).replace(/[\s\u00a0]/g, '').replace(',', '.')); if (isNaN(w)) return false; return state.lang === 'fr' ? w / 0.45359237 : w; }
    function npCell(def, r, ri, al, cls, ttl, lbl) {
      var c = def[0], na = '<td class="d ro na"></td>', opt = function (list, val) { return '<option value=""></option>' + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); };
      var sel = function (list, val, extra) { return '<td class="' + cls + '"' + ttl + '><select class="cell" data-r="' + ri + '" data-c="' + c + '"' + lbl + '>' + opt(list, val) + '</select>' + (extra || '') + '</td>'; };
      if (c === 'via') return '<td class="d ro via0"' + ttl + '>' + esc(r.first || r.last ? t('via.' + npVia(r, ri)) : '—') + '</td>';
      if (c === 'pos2') { var o2 = V.secondaryOptions(r.pos); return o2.length ? sel(o2.map(function (x) { return [x, posLabel(x)]; }), r.pos2) : na; }
      if (c === 'ptype') { var g = V.GROUP_OF[r.pos], list = g ? V.PTYPES[g] : ['F', 'D', 'G'].reduce(function (a, k) { V.PTYPES[k].forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); return a; }, []); return sel(list.map(function (x) { return [x, t('ptype.' + V.PTSLUG[x])]; }), r.ptype); }
      if (c === 'country') { var fu = r.country ? FTC.flagURL(r.country) : ''; return sel(FTC.options(state.lang), r.country, fu ? ' <img class="flag" src="' + fu + '" alt="" onerror="this.style.display=\'none\'">' : ''); }
      if (c === 'height' || c === 'weight') return '<td class="' + cls + '"' + ttl + '><input class="cell int" data-r="' + ri + '" data-c="' + c + '" value="' + esc(c === 'height' ? fmtHeight(r.height) : fmtWeight(r.weight)) + '" placeholder="' + (c === 'height' ? (state.lang === 'fr' ? '188' : "6'2") : (state.lang === 'fr' ? '86' : '190')) + '" autocomplete="off"' + lbl + '></td>';
      return null;
    }
    function posLabel(code) { var o = POSOPT.filter(function (x) { return x[0] === code; })[0]; return o ? t(o[1]) : code; }
    // une liste de suggestions par ligne : joueurs actifs avec l'équipe à la date de la ligne
    function pcLists() { var out = ''; for (var i = 0; i <= entries.pc.length; i++) { var r = entries.pc[i] || {}; out += '<datalist id="pl-pc-' + i + '">' + mvPlayers(r.date, r.pid).map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join('') + '</datalist>'; } return out; }
    function derived(tab, r, i) {
      if (tab === 'ct') { var d = V.contractDerived(r); return [d.last === null ? '—' : sl(d.last), d.end || '—']; }
      if (tab === 'tr') { var g = V.tradeGroups(entries.tr), n = 0; g.order.forEach(function (k, idx) { if (g.g[k].indexOf(i) >= 0) n = idx + 1; }); return [n ? t('ev.trade_n') + ' ' + n : '—']; }
      if (tab === 'np' && V.isDate(r.birth) && V.isDate(r.date)) return [String(Math.floor((Date.parse(r.date) - Date.parse(r.birth)) / 31557600000))];
      return tab === 'np' ? ['—'] : [];
    }
    function derivedHeads(tab) { return tab === 'ct' ? ['col.last_season', 'col.end_date'] : tab === 'tr' ? ['ev.trade_n'] : tab === 'np' ? ['col.age'] : []; }

    function alertsText(al) { return al.map(function (a) { return fmt(a.k, a.p); }).join('\n'); }
    function cellClass(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.some(function (a) { return a.level === 'err'; }) ? ' err' : m.length ? ' warn' : ''; }
    function cellTitle(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.length ? ' title="' + esc(alertsText(m)) + '"' : ''; }

    function cellHTML(def, r, ri, al) {
      var c = def[0], type = def[2], val = type === 'player' ? (r.pname != null ? r.pname : nameOf(r.pid)) : r[c];
      var cls = 'ci' + cellClass(al, c), ttl = cellTitle(al, c), lbl = ' aria-label="' + esc(t(def[1])) + '"';
      if (state.tab === 'np' && ['via', 'pos2', 'ptype', 'country', 'height', 'weight'].indexOf(c) >= 0) return npCell(def, r, ri, al, cls, ttl, lbl);
      if (state.tab === 'pc' && (c === 'fp' || c === 'fs')) { var fo = r.pid ? fromOf(r.pid, r.date, ri) : ['', '']; return '<td class="d ro pos0' + cellClass(al, c) + '"' + cellTitle(al, c) + '>' + esc(fo[c === 'fp' ? 0 : 1] ? posLabel(fo[c === 'fp' ? 0 : 1]) : '—') + '</td>'; }
      if (type === 'sel') return '<td class="' + cls + '"' + ttl + '><select class="cell" data-r="' + ri + '" data-c="' + c + '"' + lbl + '><option value=""></option>' + def[3].map(function (o) { return '<option value="' + esc(o[0]) + '"' + (val === o[0] ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select></td>';
      if (type === 'team') return '<td class="' + cls + '"' + ttl + '><input class="cell tcombo" list="dl-teams" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val ? ((DATA.teams.filter(function (x) { return x.code === val; })[0] || {}).en ? tn(DATA.teams.filter(function (x) { return x.code === val; })[0].en) : val) : '') + '" autocomplete="off"' + lbl + '></td>';
      return '<td class="' + cls + '"' + ttl + '><input class="cell ' + type + '" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val == null ? '' : val) + '"' + (type === 'player' ? ' list="' + (state.tab === 'pc' ? 'pl-pc-' + ri : 'plist') + '"' : '') + (type === 'date' ? ' placeholder="AAAA-MM-JJ"' : '') + ' autocomplete="off"' + lbl + '></td>';
    }
    function gridHTML() {
      if (state.tab === 'pl') return plGridHTML();
      if (state.tab === 'tr') return trGridHTML();
      if (state.tab === 'mv') return mvGridHTML(); if (state.tab === 'ct') return ctGridHTML(); if (state.tab === 'os') return osGridHTML();
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
      if (tab === 'mv' || tab === 'ct' || tab === 'pl') return '';
      if (tab === 'tr') return trBaseHTML();
      if (tab === 'os') { head = ['col.date', 'col.player', 'col.event', 'os.comp', 'os.picks_list']; rows = DATA.base.os.filter(function (o) { return inSeason(o.date); }).map(function (o) { return [o.date, nameOf(o.pid), t('os.' + o.event), o.comp ? t('claimed.yes') : t('claimed.no'), o.picks.map(function (p) { return teamName(p[0]) + ' ' + p[1] + ' R' + p[2]; }).join(' · ')]; }); }
      if (tab === 'mv_old') { head = ['col.date', 'col.player', 'col.move', 'col.return', 'col.games_missed']; rows = DATA.base.mv.filter(function (r) { return r[0] === state.season; }).map(function (r) { return [r[1], nameOf(r[2]), t('move.' + r[3]), r[4] || '', r[5] == null ? '' : r[5]]; }); }
      if (tab === 'ct') { head = ['col.date', 'col.player', 'col.event', 'col.contract_type', 'col.years', 'col.aav', 'col.clause']; rows = DATA.base.ct.filter(function (r) { return inSeason(r[1]); }).map(function (r) { return [r[1], nameOf(r[2]), t('ev.' + r[3]), r[4] ? t('ctype.' + r[4]) : '', r[5] || '', money(r[6]), r[10] || '']; }); }
      if (tab === 'tr') { head = ['col.date', 'col.partner', 'col.direction', 'col.asset_type', 'col.player']; DATA.base.tr.filter(function (x) { return inSeason(x.date); }).forEach(function (x) { x.assets.forEach(function (a) { rows.push([x.date, teamName(x.partner), t('dir.' + a[0]), t('asset.' + a[1]), a[1] === 'player' ? nameOf(a[2]) : a[3] + ' · ' + t('col.round') + ' ' + a[4] + ' · ' + teamName(a[5])]); }); }); }
      if (tab === 'pc') { head = ['col.date', 'col.player', 'col.from_primary', 'col.from_secondary', 'col.to_primary', 'col.to_secondary']; rows = DATA.base.pc.filter(function (r) { return inSeason(r[0]); }).map(function (r) { return [r[0], nameOf(r[1]), r[2] ? posLabel(r[2]) : '—', r[3] ? posLabel(r[3]) : '—', r[4] ? posLabel(r[4]) : '—', r[5] ? posLabel(r[5]) : '—']; }); }
      if (tab === 'np') return '';
      return '<details class="base"><summary>' + esc(t('ev.already')) + ' · ' + rows.length + '</summary><div class="scroll"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(t(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
    }

    function view() {
      var g = gridHTML(), seasons = [], helpTab = ['mv', 'ct', 'os', 'tr'].indexOf(state.tab) >= 0;
      for (var y = DATA.franchise.first; y <= DATA.franchise.current + 1; y++) seasons.push(y);
      var opts = seasons.map(function (y) { return '<option value="' + y + '"' + (y === state.season ? ' selected' : '') + '>' + esc(sl(y)) + '</option>'; }).join('');
      var plist = allPlayers().map(function (p) { return '<option value="' + esc(p.name) + '"></option>'; }).join('');
      var tabs = ['mv', 'ct', 'tr', 'os', 'pc', 'np', 'pl'].map(function (k) { return '<button data-tab="' + k + '" aria-pressed="' + (state.tab === k) + '">' + esc(t('ev.tab_' + k)) + '</button>'; }).join('');
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t('ev.title')) + '</div></div></div>' +
        '<div class="ctl"><a class="navlink" href="entry.html">' + esc(t('ev.stats_link')) + '</a><a class="navlink" href="preseason.html">' + esc(t('nav.pre')) + '</a><a class="navlink" href="offseason.html">' + esc(t('nav.off')) + '</a><div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>' +
        '<main class="entry">' + FTP.panel(t, esc, sync) + '<section class="pick"><div class="seg tabs" role="group">' + tabs + '</div><label>' + esc(t('ui.season')) + '<select id="sn">' + opts + '</select></label>' +
        '<div class="acts"><button class="btn" data-act="csv">' + esc(t('entry.export_csv')) + '</button><button class="btn" data-act="json">' + esc(t('entry.export_json')) + '</button><button class="btn ghost" data-act="reset">' + esc(t('entry.reset')) + '</button></div><datalist id="plist">' + plist + '</datalist>' + TC.datalist('dl-teams', DATA.teams, function (x) { return tn(x.en); }, esc) + '</section>' +
        '<section class="card wide">' + baseHTML() + '<h3>' + esc(t(helpTab || state.tab === 'pl' ? 'ev.' + state.tab + '_title' : 'ev.new_rows')) + '</h3><p class="note muted">' + esc(t(helpTab || state.tab === 'pl' ? 'ev.' + state.tab + '_hint' : 'ev.hint')) + (helpTab ? ' <button class="btn small" data-act="goto-defs" type="button">' + esc(t('ev.goto_help')) + '</button>' : '') + '</p>' + g.html + (state.tab === 'pc' ? pcLists() : '') + defsHTML() +
        '<div class="foot" id="status"><span class="' + (g.alerts ? 'bad' : 'ok') + '">' + (g.alerts ? g.alerts + ' ' + esc(t('entry.alerts')) : esc(t('entry.no_alerts'))) + '</span><span class="muted">' + esc(t('entry.saved')) + ' · ' + countEntries() + ' ' + esc(t('entry.entries')) + '</span></div><p class="note muted">' + esc(t('entry.local_note')) + '</p></section></main>';
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
    function setPlayers(list) { DATA.players.splice(0, DATA.players.length); list.forEach(function (p) { DATA.players.push({ id: p.id, name: p.legacy_key.slice(4), pos: p.legacy_key.charAt(0), pos1: p.position_original || null }); }); Object.keys(byId).forEach(function (k) { delete byId[k]; }); DATA.players.forEach(function (p) { byId[p.id] = p; }); }
    function keyOf(pid) { var p = DATA.players.filter(function (x) { return x.id === pid; })[0]; return p ? p.pos + ' - ' + p.name : null; }
    function blockedBy(tab) {
      var al = rowAlerts(tab), n = 0; al.forEach(function (a) { n += a.filter(function (x) { return x.level === 'err'; }).length; });
      if (n) return 'sb.errors_block';
      if (tab !== 'np' && entries[tab].some(function (r) { return r.pid != null && r.pid < 0; })) return 'sb.new_player_first';
      return null;
    }
    var POSGRP = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' }, HAND = { L: 'Left', R: 'Right' }, VIAMAP = { start: 'Start', draft: 'Draft', trade: 'Trade', free_agent: 'Free Agent', waivers: 'Waivers' };
    function nn(v) { return v === '' || v == null ? null : v; }
    async function pushTab(client, fid, tab) {
      var rows = entries[tab], created = [];
      if (tab === 'mv') {
        var wc = function (r) { return r.move !== 'send_down' ? null : r.claimed === 'yes' ? true : r.claimed === 'no' ? false : null; };
        var mvBody = function (r, g0) { var g = gamesOfRow(r); return { season: V.seasonOf(r.date), moved_on: r.date, player_id: r.pid, player_key: keyOf(r.pid), move: r.move, injury_return_on: r.move === 'injury' ? nn(r.ret) : null, games_missed: r.move === 'injury' ? (g != null ? g : nn(g0)) : null, waiver_claimed: wc(r) }; };
        if (rows.length) await client.insert('roster_move', rows.map(function (r) { return Object.assign({ franchise_id: fid }, mvBody(r, r.games)); }));
        for (var ei = 0; ei < entries.mvx.length; ei++) { var ed = entries.mvx[ei], it0 = mvItems().filter(function (x) { return x.kind === 'base' && x.id === ed.id; })[0], b0 = DATA.base.mv.filter(function (x) { return x[7] === ed.id; })[0]; if (it0 && b0) await client.patch('roster_move', 'id=eq.' + ed.id, mvBody(it0.r, b0[5])); }
      } else if (tab === 'pc') {
        await client.insert('position_change', rows.map(function (r) { return { franchise_id: fid, player_id: r.pid, changed_on: r.date, from_primary: fromOf(r.pid, r.date, entries.pc.indexOf(r))[0] || null, from_secondary: nn(fromOf(r.pid, r.date, entries.pc.indexOf(r))[1]), to_primary: r.tp, to_secondary: nn(r.ts) }; }));
      } else if (tab === 'ct') {
        var ctBody = function (r) { var terms = V.NO_TERMS.indexOf(r.event) < 0, first = +r.first, yrs = +r.years, start = !terms ? r.date : (['acquired', 'traded_for', 'free_agent'].indexOf(r.event) >= 0 ? r.date : (r.date > first + '-07-01' ? r.date : first + '-07-01')); return { signed_on: r.date, player_id: r.pid, event_type: r.event, contract_type: terms ? r.ctype : null, first_season: terms ? first : null, years: terms ? yrs : null, aav: terms ? +r.aav : null, start_on: start, end_on: terms ? (first + yrs) + '-06-30' : null }; };
        var ctYears = function (cid, r) { var ys = [], terms = V.NO_TERMS.indexOf(r.event) < 0; if (terms) for (var k = 0; k < +r.years; k++) ys.push({ contract_id: cid, season: +r.first + k, cap_hit: +r.aav, clause: r.ctype === 'one_way' ? nn(r['cl' + (k + 1)]) : null }); return ys; };
        if (rows.length) {
          var made = await client.insert('contract', rows.map(function (r) { return Object.assign({ franchise_id: fid }, ctBody(r)); }), { returning: true }); made.forEach(function (c) { created.push(c.id); });
          try { var ys = []; made.forEach(function (c, i) { ys = ys.concat(ctYears(c.id, rows[i])); }); if (ys.length) await client.insert('contract_year', ys); } catch (e) { await client.remove('contract', 'id=in.(' + created.join(',') + ')'); throw e; }
        }
        // modifications des contrats déjà enregistrés : le contrat est mis à jour ; les années sont refaites si la durée, la première saison ou le salaire changent, sinon seules les clauses sont mises à jour
        for (var ci = 0; ci < entries.ctx.length; ci++) {
          var ed = entries.ctx[ci], b0 = DATA.base.ct.filter(function (x) { return x[0] === ed.id; })[0]; if (!b0) continue; var r = ctRowOf(b0), terms2 = V.NO_TERMS.indexOf(r.event) < 0;
          await client.patch('contract', 'id=eq.' + ed.id, ctBody(r));
          var structural = !terms2 || +r.years !== b0[5] || +r.first !== b0[7] || +r.aav !== b0[6];
          if (structural) { await client.remove('contract_year', 'contract_id=eq.' + ed.id); var ny = ctYears(ed.id, r); if (ny.length) await client.insert('contract_year', ny); }
          else for (var k2 = 1; k2 <= +r.years; k2++) { var old = (b0[11] || [])[k2 - 1] || '', now = r.ctype === 'one_way' ? r['cl' + k2] || '' : ''; if (old !== now) await client.rest('PATCH', 'contract_year?contract_id=eq.' + ed.id + '&season=eq.' + (+r.first + k2 - 1), { headers: { Prefer: 'return=minimal' }, body: { clause: nn(now) } }); }
        }
      } else if (tab === 'os') {
        var madeO = await client.insert('offer_sheet', rows.map(function (r) { return { franchise_id: fid, signed_on: r.date, player_id: r.pid, event_type: r.event, compensation: r.comp === 'yes' }; }), { returning: true }); madeO.forEach(function (o) { created.push(o.id); });
        try { var pk = []; madeO.forEach(function (o, i) { for (var k = 1; k <= 4; k++) if (rows[i]['p' + k + 't']) pk.push({ franchise_id: fid, offer_sheet_id: o.id, slot: k, team_code: rows[i]['p' + k + 't'], pick_year: +rows[i]['p' + k + 'y'], pick_round: +rows[i]['p' + k + 'r'] }); }); if (pk.length) await client.insert('offer_sheet_pick', pk); } catch (e) { await client.remove('offer_sheet', 'id=in.(' + created.join(',') + ')'); throw e; }
      } else if (tab === 'tr') {
        if (!lk) await lookups(client);
        var g = V.tradeGroups(rows), assetOf = function (r, tid) { return r.type === 'player' ? { trade_id: tid, direction: r.dir, asset_type: 'player', player_id: r.pid, player_key: keyOf(r.pid), retained_salary: nn(r.ret), retained_years: nn(r.ryears) } : { trade_id: tid, direction: r.dir, asset_type: 'pick', pick_year: nn(r.year), pick_round: nn(r.round), pick_original_team_id: lk.idByCode[r.orig] || null }; };
        var tiOf = function (k) { return +k.split('|')[2].slice(1); };
        g.order.forEach(function (k) { var f = rows[g.g[k][0]]; if (!lk.idByCode[f.partner]) throw new Error(fmt('sb.unknown_team') + ' ' + f.partner); });
        var newKeys = g.order.filter(function (k) { return !entries.trf[tiOf(k)].editId; }), editKeys = g.order.filter(function (k) { return entries.trf[tiOf(k)].editId; });
        if (newKeys.length) {
          var madeT = await client.insert('trade', newKeys.map(function (k) { var f = rows[g.g[k][0]]; return { franchise_id: fid, traded_on: f.date, partner_team_id: lk.idByCode[f.partner], partner_team_code: f.partner }; }), { returning: true }); madeT.forEach(function (c) { created.push(c.id); });
          try { var as = []; newKeys.forEach(function (k, gi) { g.g[k].forEach(function (i) { as.push(assetOf(rows[i], madeT[gi].id)); }); }); await client.insert('trade_asset', as); } catch (e) { await client.remove('trade', 'id=in.(' + created.join(',') + ')'); throw e; }
        }
        // échanges déjà enregistrés : l'échange est mis à jour et ses éléments sont refaits
        for (var ei = 0; ei < editKeys.length; ei++) { var kk = editKeys[ei], f2 = rows[g.g[kk][0]], tid = entries.trf[tiOf(kk)].editId;
          await client.patch('trade', 'id=eq.' + tid, { traded_on: f2.date, partner_team_id: lk.idByCode[f2.partner], partner_team_code: f2.partner });
          await client.remove('trade_asset', 'trade_id=eq.' + tid); await client.insert('trade_asset', g.g[kk].map(function (i) { return assetOf(rows[i], tid); })); }
      } else if (tab === 'np') {
        if (!lk) await lookups(client);
        var teamName = function (code) { var t_ = DATA.teams.filter(function (x) { return x.code === code; })[0]; return t_ ? t_.en : code || null; };
        var ps = rows.map(function (r) { return { franchise_id: fid, legacy_key: POSGRP[r.pos] + ' - ' + r.first + ' ' + r.last, first_name: r.first, last_name: r.last, full_name: r.first + ' ' + r.last, birth_date: r.birth, height_in: nn(r.height), weight_lb: nn(r.weight),
          handedness: HAND[r.hand] || null, player_type: nn(r.ptype), position_original: r.pos, position_current: r.pos, country: nn(r.country), draft_year: nn(r.dyear), draft_round: nn(r.dround), draft_pick: nn(r.dpick), draft_team: r.dteam ? teamName(r.dteam) : null, origin: 'franchise' }; });
        var madeP = await client.insert('player', ps, { returning: true }); madeP.forEach(function (c) { created.push(c.id); });
        try { await client.insert('player_stint', madeP.map(function (p, i) { return { franchise_id: fid, player_id: p.id, jersey_number: nn(rows[i].num), acquired_on: rows[i].date, acquired_via: VIAMAP[npVia(rows[i], i)] || null }; })); }
        catch (e) { await client.remove('player', 'id=in.(' + created.join(',') + ')'); throw e; }
      }
      return rows.length;
    }
    async function pullTab(client, tab, seasonArg) {
      var pl = await client.select('player', 'select=id,legacy_key,position_original&origin=eq.franchise&order=full_name'); setPlayers(pl);
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
      sync.busy = true; try { var n = await pullTab(client, state.tab); if (!quiet) say('ok', 'sb.pulled', [n]); } catch (e) { say('bad', 'sb.failed', [e.message]); } sync.busy = false;
    }
    async function doPush(client) {
      sync.busy = true;
      try {
        var tab = state.tab, fid = await client.ensureFranchise();
        if (fid == null) { say('bad', 'sb.no_franchise'); sync.busy = false; return false; }
        if (tab === 'tr') entries.tr = trModel().rows;
        if (!entries[tab].length && !(tab === 'mv' && entries.mvx.length) && !(tab === 'ct' && entries.ctx.length)) { say('warn', 'sb.nothing'); sync.busy = false; return false; }
        var bl = blockedBy(tab); if (bl) { say('bad', bl); sync.busy = false; return false; }
        var touched = {}; entries[tab].forEach(function (r) { if (V.isDate(r.date)) touched[V.seasonOf(r.date)] = 1; }); touched[state.season] = 1;
        var n = await pushTab(client, fid, tab); entries[tab] = []; if (tab === 'mv') entries.mvx = []; if (tab === 'ct') entries.ctx = []; if (tab === 'tr') entries.trf = []; persist();
        var seasonsList = Object.keys(touched).map(Number); for (var si = 0; si < seasonsList.length; si++) await pullTab(client, tab, seasonsList[si]);
        say('ok', 'sb.pushed', [n]); sync.busy = false; return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); sync.busy = false; return false; }
    }

    // ---- exports ----
    function q(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function csvRows() {
      if (state.tab === 'tr') entries.tr = trModel().rows;
      var tab = state.tab, rows = entries[tab], out = [], head;
      if (tab === 'pl') { head = PL_COLS.map(function (c) { return c[1]; }).join(','); plRows().forEach(function (r, i) { out.push(PL_COLS.map(function (c) { return plCell(r, c[1], i + 1); }).map(q).join(',')); }); }
      if (tab === 'mv') { head = 'franchise_id,id,season,moved_on,player_id,move,injury_return_on,games_missed,waiver_claimed'; mvItems().forEach(function (it) { if (it.kind === 'new' || it.edited) { var r = it.r, g = gamesOfRow(r); out.push([1, it.kind === 'base' ? it.id : '', V.isDate(r.date) ? V.seasonOf(r.date) : '', r.date, r.pid, r.move, r.move === 'injury' ? r.ret : '', g == null ? '' : g, r.move === 'send_down' ? (r.claimed === 'yes' ? 1 : r.claimed === 'no' ? 0 : '') : ''].map(q).join(',')); } }); }
      if (tab === 'ct') { head = 'franchise_id,id,player_id,signed_on,event_type,contract_type,first_season,years,aav,end_on,clause_y1,clause_y2,clause_y3,clause_y4,clause_y5,clause_y6,clause_y7,clause_y8'; ctItems().forEach(function (it) { if (it.kind === 'new' || it.edited) { var r = it.r, terms = V.NO_TERMS.indexOf(r.event) < 0; out.push([1, it.kind === 'base' ? it.id : '', r.pid, r.date, r.event, terms ? r.ctype : '', terms ? r.first : '', terms ? r.years : '', terms ? r.aav : '', terms ? V.contractDerived(r).end : ''].concat([1, 2, 3, 4, 5, 6, 7, 8].map(function (k) { return terms ? r['cl' + k] : ''; })).map(q).join(',')); } }); }
      if (tab === 'os') { head = 'franchise_id,signed_on,player_id,event_type,compensation,p1_team,p1_year,p1_round,p2_team,p2_year,p2_round,p3_team,p3_year,p3_round,p4_team,p4_year,p4_round'; rows.forEach(function (r) { out.push([1, r.date, r.pid, r.event, r.comp === 'yes' ? 1 : 0].concat([1, 2, 3, 4].reduce(function (a, k) { return a.concat([r['p' + k + 't'], r['p' + k + 'y'], r['p' + k + 'r']]); }, [])).map(q).join(',')); }); }
      if (tab === 'tr') { head = 'traded_on,partner_team_code,group,direction,asset_type,player_id,pick_year,pick_round,pick_original_team_code,retained_salary,retained_years'; rows.forEach(function (r) { out.push([r.date, r.partner, r.grp, r.dir, r.type, r.type === 'player' ? r.pid : '', r.type === 'pick' ? r.year : '', r.type === 'pick' ? r.round : '', r.type === 'pick' ? r.orig : '', r.ret, r.ryears].map(q).join(',')); }); }
      if (tab === 'pc') { head = 'franchise_id,player_id,changed_on,from_primary,from_secondary,to_primary,to_secondary'; rows.forEach(function (r, ix) { var f_ = fromOf(r.pid, r.date, ix); out.push([1, r.pid, r.date, f_[0], f_[1], r.tp, r.ts].map(q).join(',')); }); }
      if (tab === 'np') { head = 'first_name,last_name,jersey_number,position,secondary_position,height,weight_lb,birth_date,handedness,player_type,draft_year,draft_round,draft_pick,draft_team,country,acquired_on,acquired_via'; rows.forEach(function (r, ix) { out.push([r.first, r.last, r.num, r.pos, r.pos2, r.height, r.weight, r.birth, r.hand, r.ptype, r.dyear, r.dround, r.dpick, r.dteam, r.country, r.date, npVia(r, ix)].map(q).join(',')); }); }
      return [head].concat(out).join('\r\n') + '\r\n';
    }
    function jsonExport() { return JSON.stringify({ version: 1, events: entries }, null, 1); }

    return { plTotal: function () { return (DATA.roster || []).length; }, plRows: plRows, plBodyHTML: plBodyHTML, npVia: npVia, trModel: trModel, editTrade: editTrade, ctItems: ctItems, ctAlerts: ctAlerts, osAlerts: osAlerts, mvItems: mvItems, mvAlerts: mvAlerts, sync: sync, doLogin: doLogin, doLogout: doLogout, doPull: doPull, doPush: doPush, state: state, entries: function () { return entries; }, view: view, t: t, setCell: setCell, removeRow: removeRow, reset: reset, applyPaste: applyPaste, rowAlerts: rowAlerts, derived: derived,
             csvRows: csvRows, jsonExport: jsonExport, countEntries: countEntries, alertsText: alertsText, pidFromName: pidFromName, SCHEMA: SCHEMA };
  }

  var api = { makeEventsApp: makeEventsApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTEV = api;

  if (typeof document !== 'undefined') {
    var DATA = JSON.parse(document.getElementById('data').textContent);
    var ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeEventsApp(d, st || ls); }, assemble: FTLIVE.assembleEvents });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    function draw(focus) { host.draw(focus ? '.cell[data-r="' + focus[0] + '"][data-c="' + focus[1] + '"]' : null); }
    function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    rootEl.addEventListener('input', function (e) {
      var el = e.target; if (el.dataset && el.dataset.pl) { app.state['pl' + el.dataset.pl] = el.value; var bd = document.getElementById('pl-body'), ct = document.getElementById('pl-count'); if (bd) bd.innerHTML = app.plBodyHTML(); if (ct) ct.textContent = app.plRows().length + ' / ' + app.plTotal(); }
    });
    rootEl.addEventListener('change', function (e) {
      if (e.target.dataset && e.target.dataset.pl) { app.state['pl' + e.target.dataset.pl] = e.target.value; draw(); return; }
      var el = e.target;
      if (el.classList && el.classList.contains('cell')) {
        app.setCell(+el.dataset.r, el.dataset.c, el.value);
        setTimeout(function () { var ae = typeof document !== 'undefined' ? document.activeElement : null; draw(ae && ae.classList && ae.classList.contains('cell') && ae.dataset.r !== undefined ? [+ae.dataset.r, ae.dataset.c] : null); }, 0);   // Tab : redessiner après le déplacement du focus
      }
      else if (el.id === 'sn') { app.state.season = +el.value; draw(); }
    });
    rootEl.addEventListener('keydown', function (e) {
      var el = e.target; if (!el.classList || !el.classList.contains('cell') || el.tagName === 'SELECT') return;
      var r = +el.dataset.r, move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!move) return; e.preventDefault();
      app.setCell(r, el.dataset.c, el.value); var n = rootEl.querySelectorAll('tr[data-row]').length; draw([Math.max(0, Math.min(n, r + move)), el.dataset.c]);
    });
    rootEl.addEventListener('paste', function (e) {
      var el = e.target; if (!el.classList || !el.classList.contains('cell')) return; var text = (e.clipboardData || window.clipboardData).getData('text');
      if (text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return; e.preventDefault(); app.applyPaste(+el.dataset.r, el.dataset.c, text); draw(null);
    });
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lang) app.state.lang = b.dataset.lang; else if (b.dataset.tab) app.state.tab = b.dataset.tab; else if (b.dataset.rm) app.removeRow(+b.dataset.rm);
      else if (b.dataset.act === 'edit-trade') { if (app.editTrade(+b.dataset.id)) { draw(); setTimeout(function () { var cs = rootEl.querySelectorAll('.tcard.editing'); if (cs.length && cs[cs.length - 1].scrollIntoView) cs[cs.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); } return; }
      else if (b.dataset.act === 'goto-defs') { var dd = document.getElementById('defs-help'); if (dd && dd.scrollIntoView) { dd.scrollIntoView({ behavior: 'smooth', block: 'start' }); dd.classList.add('flash'); setTimeout(function () { dd.classList.remove('flash'); }, 1600); } return; }
      else if (b.dataset.act === 'csv') { download('evenements_' + app.state.tab + '.csv', app.csvRows(), 'text/csv'); return; }
      else if (b.dataset.act === 'json') { download('evenements.json', app.jsonExport(), 'application/json'); return; }
      else if (b.dataset.act === 'reset') { if (window.confirm(app.t('entry.confirm_reset'))) app.reset(); else return; }
      else return;
      draw();
    });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
