/* Début de saison et saison morte : modèles de lignes et règles de validation (sans interface, testable avec Node). */
(function (root) {
  var SLOTS = ['CAPTAIN', 'A1', 'A2', 'A3', 'L1_LW', 'L1_C', 'L1_RW', 'L2_LW', 'L2_C', 'L2_RW', 'L3_LW', 'L3_C', 'L3_RW', 'L4_LW', 'L4_C', 'L4_RW', 'P1_LD', 'P1_RD', 'P2_LD', 'P2_RD', 'P3_LD', 'P3_RD', 'G_STARTER', 'G_BACKUP', 'X1', 'X2', 'X3'];
  var AWARDS = [['art_ross', 1], ['hart', 1], ['norris', 1], ['lady_byng', 1], ['calder', 1], ['conn_smythe', 1], ['vezina', 1], ['jennings', 1], ['jennings', 2], ['masterton', 1], ['jack_adams', 1], ['selke', 1], ['ted_lindsay', 1], ['rocket_richard', 1]];
  var ALLSTAR = []; [1, 2].forEach(function (l) { ['F', 'F', 'F', 'D', 'D', 'G'].forEach(function (p) { ALLSTAR.push([l, p]); }); });
  function A(c, level, k, p) { return { c: c, level: level, k: k, p: p || [] }; }
  function num(v) { return v === null || v === undefined || v === '' || isNaN(v) ? null : +v; }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }
  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  var KEY = /^[FDG] - .+/;

  // ---- alignement ----
  function slotGroup(slot) { return slot.charAt(0) === 'L' ? 'F' : slot.charAt(0) === 'P' ? 'D' : slot.indexOf('G_') === 0 ? 'G' : (slot === 'CAPTAIN' || slot.charAt(0) === 'A') ? 'S' : 'X'; }
  function slotMeta(slot) {
    var m;
    if (slot === 'CAPTAIN' || /^A\d$/.test(slot)) return { id: 'lead', kind: 'lead', list: 'S' };
    if ((m = /^L(\d)_/.exec(slot))) return { id: 'L' + m[1], kind: 'fwd', list: 'F' };
    if ((m = /^P(\d)_/.exec(slot))) return { id: 'P' + m[1], kind: 'def', list: 'D' };
    if (slot.indexOf('G_') === 0) return { id: 'G', kind: 'gk', list: 'G' };
    return { id: 'X', kind: 'ext', list: 'X' };
  }
  var LEADERS = ['CAPTAIN', 'A1', 'A2', 'A3'], MAX_LEADERS = 3;
  // Un joueur de ce poste (F, D, G) peut-il occuper cet emplacement ?
  function posFits(slot, pos) { var g = slotGroup(slot); return g === 'F' || g === 'D' || g === 'G' ? pos === g : g === 'S' ? pos !== 'G' : true; }
  function validateRoles(rows, ctx) {
    var used = {}, lead = {}, out = [], filledLead = rows.filter(function (r) { return LEADERS.indexOf(r.slot) >= 0 && r.pid; });
    rows.forEach(function (r) { var g = slotGroup(r.slot); if (r.pid && g !== 'S') used[r.pid] = (used[r.pid] || 0) + 1; if (r.pid && g === 'S') lead[r.pid] = (lead[r.pid] || 0) + 1; });
    var lastLead = filledLead.length > MAX_LEADERS ? filledLead[filledLead.length - 1].slot : null;
    rows.forEach(function (r) {
      var a = [], g = slotGroup(r.slot);
      if (r.pid) {
        var pos = ctx.posOf(r.pid);
        if (!posFits(r.slot, pos)) a.push(A('pid', 'err', 'val.slot_position'));
        if (g !== 'S' && used[r.pid] > 1) a.push(A('pid', 'err', 'val.duplicate_player'));
        if (g === 'S' && lead[r.pid] > 1) a.push(A('pid', 'err', 'val.duplicate_leader'));
        if (!ctx.covered(r.pid)) a.push(A('pid', 'err', 'val.no_contract'));
        if (lastLead === r.slot) a.push(A('pid', 'err', 'val.leaders_max', [MAX_LEADERS]));
      } else if (r.pname) a.push(A('pid', 'err', 'val.player_missing'));
      out.push(a);
    }); return out;
  }
  // ---- cotes ----
  function validateRatings(rows, ctx) {
    return rows.map(function (r) {
      var a = [], v = num(r.oa);
      if (v === null) return a;
      if (v < 40 || v > 99) a.push(A('oa', 'err', 'val.rating_range'));
      var prev = ctx.prevRef ? ctx.prevRef(r.pid) : ctx.prevOa(r.pid);
      if (prev != null) { var d = v - prev; if (d > 15 || d < -10) a.push(A('oa', 'warn', 'val.rating_jump', [(d > 0 ? '+' : '') + d])); }
      return a;
    });
  }
  // ---- calendrier ----
  function validateSchedule(rows, ctx) {
    var counts = {}; rows.forEach(function (r) { if (r.opp) counts[r.opp] = (counts[r.opp] || 0) + 1; });
    return rows.map(function (r, i) {
      var a = [];
      if (r.date && !isDate(r.date)) a.push(A('date', 'err', 'val.date_format'));
      if (isDate(r.date) && ctx.season && (r.date < ctx.season + '-09-01' || r.date > (ctx.season + 1) + '-04-30')) a.push(A('date', 'err', 'val.date_season', [ctx.season + '-09-01', (ctx.season + 1) + '-04-30']));
      if (r.otext && !r.opp) a.push(A('opp', 'err', 'val.team_unknown'));
      if (r.opp && r.opp === ctx.myCode) a.push(A('opp', 'err', 'val.opponent_self'));
      if (isDate(r.date) && i > 0 && isDate(rows[i - 1].date)) {
        var d = days(rows[i - 1].date, r.date);
        if (d < 0) a.push(A('date', 'err', 'val.date_order')); else if (d === 0) a.push(A('date', 'warn', 'val.same_day')); else if (d > 16) a.push(A('date', 'warn', 'val.gap_long', [d]));
      }
      if (ctx.games === 82 && r.opp && (counts[r.opp] > 4 || counts[r.opp] < 2) && rows.every(function (x) { return x.opp; })) a.push(A('opp', 'warn', 'val.opponent_count', [counts[r.opp]]));
      return a;
    });
  }
  // ---- plafond ----
  // Salaire maximum : 20 % du plafond, arrondi au multiple de 5 000 $ supérieur (même calcul que l'ancien classeur : ARRONDI.AU.MULTIPLE puis + 5 000 $ si l'arrondi est inférieur)
  function maxSalary(cap) { cap = Math.round(cap); return cap > 0 ? Math.floor((cap + 24999) / 25000) * 5000 : null; }
  function validateCap(rows, ctx) {
    return rows.map(function (r, i) {
      var a = [], cap = num(r.cap), floor = num(r.floor), min = num(r.min), m2 = num(r.max2), prev = i > 0 ? num(rows[i - 1].cap) : null, started = [r.cap, r.floor, r.min, r.max2].some(function (v) { return v !== '' && v != null; });
      if (started) { if (cap === null) a.push(A('cap', 'err', 'val.required')); if (floor === null) a.push(A('floor', 'err', 'val.required')); if (min === null) a.push(A('min', 'err', 'val.required')); }
      if (cap !== null && cap <= 0) a.push(A('cap', 'err', 'val.positive'));
      if (cap && floor && floor >= cap) a.push(A('floor', 'err', 'val.cap_floor'));
      // variation du plafond : un décimal, affiché au format de la langue par le moteur (fmt)
      if (cap && prev) { var g = (cap / prev - 1) * 100; if (g < -5 || g > 15) a.push(A('cap', 'warn', 'val.cap_growth', [Math.round(g * 10) / 10])); }
      if (cap && i > 0 && prev === null && rows.slice(0, i).some(function (x) { return num(x.cap) !== null; })) a.push(A('cap', 'warn', 'val.cap_gap'));
      if (cap && min && (min / cap < 0.005 || min / cap > 0.012)) a.push(A('min', 'warn', 'val.cap_min_ratio'));
      if (min && m2 && m2 < min) a.push(A('max2', 'err', 'val.cap_two_way'));
      if (i === 0) { var ah = num(r.ahl); if (r.ahl !== '' && r.ahl != null && (ah === null || ah < 100000 || ah > 3000000)) a.push(A('ahl', 'warn', 'val.ahl_range')); }
      return a;
    });
  }
  // ---- loterie et top 3 ----
  function validateLottery(rows, ctx) {
    var seenR = {}, n = ctx.leagueSize || 32; rows.forEach(function (r) { if (r.pre !== '' && r.pre != null) seenR[r.pre] = (seenR[r.pre] || 0) + 1; });
    return rows.map(function (r) {
      var a = [], pre = num(r.pre), orig = pre !== null ? ctx.rankTeam(pre) : null;
      if (pre === null) { if (r.owner) a.push(A('pre', 'err', 'val.required')); return a; }
      if (pre < 1 || pre > n) a.push(A('pre', 'err', 'val.lottery_range', [n]));
      if (seenR[r.pre] > 1) a.push(A('pre', 'err', 'val.lottery_dup'));
      if (!orig && !r.owner) a.push(A('owner', 'err', 'val.lottery_team_needed'));
      if (orig && r.owner && r.owner === orig) a.push(A('owner', 'warn', 'val.lottery_owner_same'));
      if (r.pick - pre > 2 || pre - r.pick > 10) a.push(A('pre', 'warn', 'val.lottery_move'));
      return a;
    });
  }
  function validateTop3(rows, ctx) {
    var seen = {}; rows.forEach(function (r) { var k = String(r.name || '').trim().toLowerCase(); if (k) seen[k] = (seen[k] || 0) + 1; });
    return rows.map(function (r) {
      var a = [], has = r.name || r.pos || r.potential;
      if (!has) return a;
      if (!r.name) a.push(A('name', 'err', 'val.required')); else if (seen[String(r.name).trim().toLowerCase()] > 1) a.push(A('name', 'warn', 'val.top3_dup'));
      if (r.name && !r.pos) a.push(A('pos', 'err', 'val.required'));
      if (r.name && !r.team) a.push(A('team', 'warn', 'val.top3_no_team'));
      return a;
    });
  }
  var PICK_GROUP_ALL = ['F', 'D', 'G'];
  var PICK_POS = ['C', 'LW', 'RW', 'LD', 'RD', 'G'], PICK_GROUP = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' };
  var PTYPES = { F: ['Power Forward', '2 Way Forward', 'Grinder', 'Sniper', 'Playmaker', 'Enforcer'], D: ['Enforcer', '2 Way Defenseman', 'Offensive Defenseman', 'Defensive Defenseman'], G: ['Butterfly', 'Hybrid', 'Stand-up'] };
  // taille en pouces et poids en livres (valeurs internes ; l'écran les affiche en cm et en kg en français)
  function validatePicks(rows, ctx) {
    var seen = {}; rows.forEach(function (r) { if (r.year !== '' && r.overall !== '' && r.overall != null) { var k = r.year + '|' + r.overall; seen[k] = (seen[k] || 0) + 1; } });
    var cols = ['year', 'round', 'overall', 'first', 'last', 'pos', 'height', 'weight', 'birth', 'country', 'ptype'];
    return rows.map(function (r) {
      var a = [];
      if (!cols.some(function (c) { return r[c] !== '' && r[c] != null; })) return a;
      var lenient = !!r.key && !r._edited, yr = num(r.year), rd = num(r.round), ov = num(r.overall), max = ctx.draftSize || 224, wt = num(r.weight), ht = num(r.height);
      if (yr === null) a.push(A('year', 'err', 'val.required')); else if ((ctx.draftYears || []).indexOf(yr) < 0) a.push(A('year', 'err', 'val.draft_year_range'));
      if (rd === null || rd < 1 || rd > 7) a.push(A('round', 'err', 'val.round_range'));
      if (ov === null) { if (!lenient) a.push(A('overall', 'err', 'val.required')); } else if (ov < 1 || ov > max) a.push(A('overall', 'warn', 'val.round_pick', [max]));
      if (ov !== null && yr !== null && seen[r.year + '|' + r.overall] > 1) a.push(A('overall', 'err', 'val.pick_dup'));
      var nT = ctx.leagueSize || 32; if (ov !== null && rd !== null && rd >= 1 && rd <= 7 && ov >= 1 && ov <= max && (ov <= (rd - 1) * nT || ov > rd * nT)) a.push(A('overall', 'warn', 'val.pick_round', [rd, (rd - 1) * nT + 1, rd * nT, nT]));   // le choix est un rang global : 15e choix de la 2e ronde = 47e
      if (!r.first) a.push(A('first', 'err', 'val.required')); if (!r.last) a.push(A('last', 'err', 'val.required'));
      if (!r.pos) { if (!lenient) a.push(A('pos', 'err', 'val.required')); } else if (PICK_POS.indexOf(r.pos) < 0) a.push(A('pos', 'err', 'val.position_unknown'));
      // la date de naissance est facultative à la saisie (elle peut être ajoutée plus tard avec « Modifier joueur »)
      if (r.birth) { if (!isDate(r.birth)) a.push(A('birth', 'err', 'val.date_format')); else if (yr !== null) { var age = (Date.parse(yr + '-06-27') - Date.parse(r.birth)) / 31557600000; if (age < 17 || age > 22) a.push(A('birth', 'warn', 'val.draft_age', [Math.round(age)])); } }
      if (ht !== null && (ht < 60 || ht > 84)) a.push(A('height', 'warn', 'val.height_range'));   // même plage qu'Événements (5'0" à 7'0", décision du 2026-11-16)
      if (wt !== null && (wt < 120 || wt > 300)) a.push(A('weight', 'warn', 'val.weight_range'));
      if (r.ptype && r.pos && PICK_GROUP[r.pos] && PTYPES[PICK_GROUP[r.pos]].indexOf(r.ptype) < 0 && Object.keys(PTYPES).some(function (g) { return PTYPES[g].indexOf(r.ptype) >= 0; })) a.push(A('ptype', 'warn', 'val.ptype_pos'));
      return a;
    });
  }
  // ---- trophées, étoiles, Coupe Stanley, retraites ----
  // trophées : poste imposé pour certains (Norris : D ; Vézina et Jennings : G ; Jack Adams : aucun) ; valeur seulement pour Art-Ross (points), Jennings (MBA) et Richard (buts)
  var AWARD_POS = { norris: 'D', vezina: 'G', jennings: 'G' };
  function awardKey(code, pos, name) { name = String(name == null ? '' : name).trim(); if (!name) return ''; return code === 'jack_adams' ? name : (pos ? pos + ' - ' + name : ''); }
  function validateAwards(rows, ctx) {
    return rows.map(function (r) {
      var a = [], slots = [['', r.pos, r.name], ['2', r.pos2, r.name2], ['3', r.pos3, r.name3]];
      slots.forEach(function (s) {
        var pos = s[1], name = String(s[2] == null ? '' : s[2]).trim();
        if (!name) return;
        if (r.code !== 'jack_adams' && !pos) a.push(A('pos' + s[0], 'err', 'val.required'));
        else if (pos && PICK_GROUP_ALL.indexOf(pos) < 0) a.push(A('pos' + s[0], 'err', 'val.position_unknown'));
        else if (AWARD_POS[r.code] && pos !== AWARD_POS[r.code]) a.push(A('pos' + s[0], 'err', 'val.award_pos', [AWARD_POS[r.code]]));
        if (s[0] && !String(r.name || '').trim()) a.push(A('name' + s[0], 'warn', 'val.award_extra_alone'));
      });
      var main = awardKey(r.code, r.pos, r.name);
      if (!main) return a;
      if (r.team && !ctx.teamOk(r.team)) a.push(A('team', 'err', 'val.team_code'));
      var v = num(r.value);
      if (r.code === 'jennings') { if (v !== null && (v < 0.5 || v > 6)) a.push(A('value', 'warn', 'val.gaa_range')); var v2 = num(r.val2); if (v2 !== null && (v2 < 0.5 || v2 > 6)) a.push(A('val2', 'warn', 'val.gaa_range')); }
      if (v !== null && r.team === ctx.myCode && (r.code === 'art_ross' || r.code === 'rocket_richard')) {
        var st = ctx.statsOf(main); if (st) { var exp = r.code === 'art_ross' ? st[0] : st[1]; if (exp !== v) a.push(A('value', 'err', 'val.value_mismatch', [exp])); }
      }
      return a;
    });
  }
  function validateAllStar(rows, ctx) {
    var seen = {}; rows.forEach(function (r) { if (r.key) seen[r.key] = (seen[r.key] || 0) + 1; });
    return rows.map(function (r) { var a = []; if (r.key && !KEY.test(r.key)) a.push(A('key', 'err', 'val.key_format')); if (r.key && seen[r.key] > 1) a.push(A('key', 'err', 'val.allstar_dup')); if (r.team && !ctx.teamOk(r.team)) a.push(A('team', 'err', 'val.team_code')); return a; });
  }
  function validateCup(rows, ctx) {
    return rows.map(function (r) {
      var a = [], po = ctx.poResult();
      if (r.champion && !ctx.teamOk(r.champion)) a.push(A('champion', 'err', 'val.team_code'));
      var sw = ctx.seriesWinner ? ctx.seriesWinner() : ''; if (r.champion && sw && r.champion !== sw) a.push(A('champion', 'warn', 'val.cup_vs_series', [ctx.teamLabel(sw)]));
      if (r.champion && po) { if (r.champion === ctx.myCode && po !== 'champion') a.push(A('champion', 'warn', 'val.cup_vs_playoffs', [{ k: 'result.' + po }])); if (r.champion !== ctx.myCode && po === 'champion') a.push(A('champion', 'warn', 'val.cup_vs_playoffs', [{ k: 'result.' + po }])); }
      return a;
    });
  }
  var RET_GROUP = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' };
  function retireKey(pos, name) { name = String(name == null ? '' : name).trim(); return name ? (RET_GROUP[pos] || 'F') + ' - ' + name : ''; }
  function validateRetire(rows, ctx) {
    var seen = {}; rows.forEach(function (r) { if (r.name && r.season !== '' && r.season != null) { var k = r.season + '|' + retireKey(r.pos, r.name); seen[k] = (seen[k] || 0) + 1; } });
    return rows.map(function (r) {
      var a = [], cols = ['season', 'team', 'pos', 'name', 'hof', 'gp', 'g', 'a', 'pm', 'w', 'so', 'svp', 'gaa'];
      if (!cols.some(function (c) { return r[c] !== '' && r[c] != null; })) return a;
      var lenient = r.id != null && r.id !== '' && !r._edited, se = num(r.season), hof = num(r.hof), gp = num(r.gp), sv = num(r.svp), gaa = num(r.gaa), goalie = r.pos === 'G', skater = r.pos && r.pos !== 'G';
      if (se === null) a.push(A('season', 'err', 'val.required')); else if (ctx.franchiseFirst && (se < ctx.franchiseFirst || se > ctx.franchiseCurrent + 1)) a.push(A('season', 'warn', 'val.retire_season_range'));
      if (!r.name || !String(r.name).trim()) a.push(A('name', 'err', 'val.required'));
      if (!r.pos) { if (!lenient) a.push(A('pos', 'err', 'val.required')); } else if (RET_GROUP[r.pos] === undefined) a.push(A('pos', 'err', 'val.position_unknown'));
      if (r.team && !ctx.teamOk(r.team)) a.push(A('team', 'err', 'val.team_code'));
      if (se !== null && r.name && seen[r.season + '|' + retireKey(r.pos, r.name)] > 1) a.push(A('name', 'err', 'val.retire_dup'));
      if (hof !== null && se !== null) { var d = hof - se; if (d < 1 || d > 15) a.push(A('hof', 'warn', 'val.hof_delay', [d])); }   // l'intronisation suit la retraite de 1 à 15 ans
      if (hof !== null && r.nominee !== 'yes') a.push(A('nominee', 'warn', 'val.hof_without_nominee'));
      if (gp !== null && (gp < 1 || gp > 2500)) a.push(A('gp', 'warn', 'val.career_gp_range'));   // MJ de carrière : clé propre (val.gp_range attend un maximum {0})
      if (sv !== null && (sv < 0.8 || sv > 0.99)) a.push(A('svp', 'warn', 'val.svp_range'));
      if (gaa !== null && (gaa < 0.5 || gaa > 6)) a.push(A('gaa', 'warn', 'val.gaa_range'));
      var SKM = ['m05', 'm075', 'mp1', 'm20g', 'm30g', 'm50g', 'm50p', 'm75p', 'm100p'], GKM = ['m20w', 'm30w', 'mc30w', 'm40w', 'mwins'];
      if (goalie && (filled0(r.g) || filled0(r.a) || filled0(r.pm) || SKM.some(function (c) { return filled0(r[c]); }))) a.push(A('pos', 'warn', 'val.stats_wrong_pos'));
      if (skater && (filled0(r.w) || filled0(r.so) || filled0(r.svp) || filled0(r.gaa) || GKM.some(function (c) { return filled0(r[c]); }))) a.push(A('pos', 'warn', 'val.stats_wrong_pos'));
      SKM.concat(GKM).forEach(function (c) { var v = num(r[c]); if (v !== null && (v < 0 || v > 30)) a.push(A(c, 'warn', 'val.milestone_range')); });
      return a;
    });
  }
  function filled0(v) { return v !== '' && v != null; }

  // ---- séries éliminatoires : reconstruction du tableau à partir du classement et des victoires ----
  var SERIES_ORDER = [[1, 'WEST', 1], [1, 'WEST', 2], [1, 'WEST', 3], [1, 'WEST', 4], [1, 'EAST', 1], [1, 'EAST', 2], [1, 'EAST', 3], [1, 'EAST', 4], [2, 'WEST', 1], [2, 'WEST', 2], [2, 'EAST', 1], [2, 'EAST', 2], [3, 'WEST', 1], [3, 'EAST', 1], [4, 'FINAL', 1]];
  var DIVS = { WEST: ['CEN', 'PAC'], EAST: ['MET', 'ATL'] };
  // teams : [[code, rang, points, association, division, rang dans la division], ...]
  function seeds(teams, conf) {
    var ts = teams.filter(function (t) { return t[3] === conf; }), d1 = DIVS[conf][0], d2 = DIVS[conf][1], top = {};
    ts.forEach(function (t) { if ((t[4] === d1 || t[4] === d2) && (t[5] === 1 || t[5] === 2 || t[5] === 3)) top[t[4] + t[5]] = t; });
    if (Object.keys(top).length < 6) return null;
    var used = {}; Object.keys(top).forEach(function (k) { used[top[k][0]] = 1; });
    var wc = ts.filter(function (t) { return !used[t[0]]; }).sort(function (a, b) { return a[1] - b[1]; }).slice(0, 2);   // quatrièmes as : ordre du Classement (qui suit les points ; un écart déclenche val.std_order) — décision du 2026-11-17
    if (wc.length < 2) return null;
    var A = top[d1 + 1], B = top[d2 + 1], betterA = A[1] <= B[1], wa = betterA ? wc[1] : wc[0], wb = betterA ? wc[0] : wc[1];
    return [top[d1 + 2], top[d1 + 3], top[d1 + 1], wa, top[d2 + 2], top[d2 + 3], top[d2 + 1], wb];
  }
  function decided(a, b) { return a !== null && b !== null && a !== '' && b !== '' && ((+a === 4 && +b >= 0 && +b < 4) || (+b === 4 && +a >= 0 && +a < 4)); }
  function better(x, y) { return x[1] <= y[1] ? [x, y] : [y, x]; }
  // wins : 15 paires [victoires équipe 1, victoires équipe 2] dans l'ordre de SERIES_ORDER (valeurs vides acceptées)
  function computeBracket(teams, wins) {
    var out = SERIES_ORDER.map(function (o, i) { var w = wins[i] || [null, null]; return { round: o[0], conf: o[1], slot: o[2], a: null, b: null, wa: num(w[0]), wb: num(w[1]), winner: null }; });
    function winnerOf(s) { return decided(s.wa, s.wb) ? (s.wa === 4 ? s.a : s.b) : null; }
    var champs = {};
    ['WEST', 'EAST'].forEach(function (conf, ci) {
      var sd = seeds(teams, conf), r1 = out.slice(ci * 4, ci * 4 + 4), r2 = out.slice(8 + ci * 2, 10 + ci * 2), cf = out[12 + ci];
      r1.forEach(function (s, p) { if (sd) { s.a = sd[2 * p]; s.b = sd[2 * p + 1]; } s.winner = winnerOf(s); });
      r2.forEach(function (s, p) { var x = r1[2 * p].winner, y = r1[2 * p + 1].winner; if (x && y) { var o = better(x, y); s.a = o[0]; s.b = o[1]; } s.winner = winnerOf(s); });
      if (r2[0].winner && r2[1].winner) { var o2 = better(r2[0].winner, r2[1].winner); cf.a = o2[0]; cf.b = o2[1]; } cf.winner = winnerOf(cf); champs[conf] = cf.winner;
    });
    var f = out[14]; if (champs.WEST && champs.EAST) { f.a = champs.WEST; f.b = champs.EAST; } f.winner = winnerOf(f);
    return out;
  }
  function validateSeries(rows, ctx) {
    var br = computeBracket(ctx.standings || [], rows.map(function (r) { return [r.wa, r.wb]; })), out = [];
    var anyRow = rows.some(function (r) { return r.wa !== '' && r.wa != null || r.wb !== '' && r.wb != null; });
    rows.forEach(function (r, i) {
      var a = [], has = (r.wa !== '' && r.wa != null) || (r.wb !== '' && r.wb != null), b = br[i];
      if (has) {
        if (r.wa === '' || r.wa == null || r.wb === '' || r.wb == null) a.push(A('wa', 'err', 'val.series_pair'));
        else if (!decided(num(r.wa), num(r.wb))) a.push(A('wa', 'err', 'val.series_winner'));
        if (!b.a || !b.b) a.push(A('wa', 'warn', ctx.standings && ctx.standings.length ? 'val.series_teams_unknown' : 'val.series_standings_missing'));
      }
      out.push(a);
    });
    var champ = br[14].winner, my = ctx.myCode;
    if (champ && ctx.cupChampionName && ctx.teamName && ctx.teamName(champ[0]) !== ctx.cupChampionName) out[14].push(A('wa', 'warn', 'val.series_champion', [ctx.cupChampionLabel || ctx.cupChampionName]));
    if (anyRow && ctx.poStats) {
      var g = 0, w = 0, played = false;
      br.forEach(function (s) { if (s.a && s.b && decided(s.wa, s.wb)) { if (s.a[0] === my) { g += s.wa + s.wb; w += s.wa; played = true; } if (s.b[0] === my) { g += s.wa + s.wb; w += s.wb; played = true; } } });
      var complete = br[14].winner !== null, last = -1; br.forEach(function (s, i) { if ((s.a && s.a[0] === my) || (s.b && s.b[0] === my)) last = i; });
      if (complete && ((played && (g !== ctx.poStats[0] || w !== ctx.poStats[1])) || (!played && ctx.poStats[0] > 0))) { var idx = last >= 0 ? last : 0; out[idx].push(A('wa', 'warn', 'val.series_vs_team_stats', [ctx.poStats[0], ctx.poStats[1]])); }
    }
    return out;
  }

  // ---- classement de la ligue (onglet Classement de Saison morte) ----
  // rows : lignes de la grille dans l'ordre du rang ({ team, w, l }) ; ctx : { games, myCode, own ({ w, l } de la fiche Équipe, ou null), confDiv(code) → [conf, div], teamOk(code), teamLabel(code), seasonLabel }.
  // Règles (onglet Standings de l'Excel, décisions de Gabriel du 2026-11-16) : DPR = MJ − V − D (calculé, jamais saisi) ; PTS = 2 V + DPR ;
  // Z = rang 1 de la ligue ; Y = la mieux classée de chaque association (une seule par association ; si c'est la 1re de la ligue, elle porte Z) ;
  // X = 3 premières de chaque division, dans l'ordre du rang ; W = 2 suivantes de l'association (quatrièmes as) ;
  // rang de repêchage = équipes non qualifiées comptées depuis le bas (1 = la pire), donc adapté au nombre d'équipes.
  var STD_DIVS = { EAST: ['ATL', 'MET'], WEST: ['CEN', 'PAC'] };
  function standCalc(rows, ctx) {
    var seen = {}, out = rows.map(function (r, i) {
      var code = r.team || '', own = !!code && code === ctx.myCode && !!ctx.own, w = own ? ctx.own.w : num(r.w), l = own ? ctx.own.l : num(r.l);
      var cd = code ? ctx.confDiv(code) : null, dup = code && seen[code] != null ? seen[code] : null; if (code && dup == null) seen[code] = i;
      var otl = own && ctx.own.otl != null ? ctx.own.otl : w != null && l != null ? ctx.games - w - l : null;   // ligne de la franchise : la fiche Équipe fait foi (DPR compris)
      var known = !!(cd && STD_DIVS[cd[0]] && STD_DIVS[cd[0]].indexOf(cd[1]) >= 0);   // association et division connues
      return { i: i, code: code, own: own, w: w, l: l, otl: otl, pts: otl != null ? 2 * w + otl : null, conf: cd ? cd[0] : '', div: cd ? cd[1] : '', dup: dup, ok: !!(code && known && dup == null && ctx.teamOk(code) && w != null && l != null), q: '', dr: null, wc: null, draft: null };   // ligne incomplète : ni lettre ni rang
    });
    var ok = out.filter(function (x) { return x.ok; }), lead = {}, inDiv = {};
    ok.forEach(function (x) { if (!lead[x.conf]) lead[x.conf] = x; inDiv[x.div] = (inDiv[x.div] || 0) + 1; if (inDiv[x.div] <= 3) { x.dr = inDiv[x.div]; x.q = 'X'; } });
    Object.keys(STD_DIVS).forEach(function (c) { var n = 0; ok.forEach(function (x) { if (x.conf === c && !x.q && n < 2) { x.wc = ++n; x.q = 'W'; } }); if (lead[c]) lead[c].q = 'Y'; });
    if (ok.length && ok[0] === out[0]) out[0].q = 'Z';
    var d = 0; for (var k = out.length - 1; k >= 0; k--) if (out[k].ok && !out[k].q) out[k].draft = ++d;
    return out;
  }
  function validateStandings(rows, ctx) {
    var C = standCalc(rows, ctx), any = rows.some(function (r) { return r.team || (r.w !== '' && r.w != null) || (r.l !== '' && r.l != null); });
    var A = function (c, level, k, p) { return { c: c, level: level, k: k, p: p || [] }; }, lbl = function (x) { return ctx.teamLabel(x); };
    var out = C.map(function (x, i) {
      var a = []; if (!any) return a;
      if (!x.code) a.push(A('team', 'err', 'val.std_team_missing', [i + 1]));
      else if (!ctx.teamOk(x.code) || !x.conf || !STD_DIVS[x.conf] || STD_DIVS[x.conf].indexOf(x.div) < 0) a.push(A('team', 'err', 'val.std_team_outside', [lbl(x.code), ctx.seasonLabel]));
      else if (x.dup != null) a.push(A('team', 'err', 'val.std_team_dup', [lbl(x.code), x.dup + 1]));
      if (x.code && !x.own) {
        if (x.w == null || x.l == null) a.push(A(x.w == null ? 'w' : 'l', 'err', 'val.std_wl_missing', [lbl(x.code)]));
        else if (x.w < 0 || x.l < 0) a.push(A(x.w < 0 ? 'w' : 'l', 'err', 'val.std_wl_negative', [lbl(x.code)]));
        else if (x.w + x.l > ctx.games) a.push(A('w', 'err', 'val.std_gp_over', [lbl(x.code), x.w + x.l, ctx.games]));
        if (x.code === ctx.myCode && !ctx.own) a.push(A('w', 'warn', 'val.std_own_manual', [lbl(x.code), ctx.seasonLabel]));
      }
      return a;
    });
    // équipe classée devant une équipe qui a plus de points (orange, sur la mieux classée des deux)
    for (var i = 0; i + 1 < C.length; i++) { var x = C[i], y = C[i + 1]; if (x.pts != null && y.pts != null && y.pts > x.pts && x.dup == null && y.dup == null) out[i].push(A('team', 'warn', 'val.std_order', [lbl(x.code), x.pts, lbl(y.code), y.pts])); }
    var full = C.length && C.every(function (x) { return x.w != null && x.l != null; }), sw = 0, slo = 0; C.forEach(function (x) { sw += x.w || 0; slo += (x.l || 0) + (x.otl || 0); });
    if (any && full && sw !== slo) out[0].push(A('w', 'warn', 'val.std_sum', [sw, slo]));
    return out;
  }
  var api = { retireKey: retireKey, standCalc: standCalc, validateStandings: validateStandings, awardKey: awardKey, AWARD_POS: AWARD_POS, PTYPES: PTYPES, PICK_GROUP: PICK_GROUP, maxSalary: maxSalary, slotMeta: slotMeta, posFits: posFits, LEADERS: LEADERS, MAX_LEADERS: MAX_LEADERS, SERIES_ORDER: SERIES_ORDER, computeBracket: computeBracket, validateSeries: validateSeries, SLOTS: SLOTS, AWARDS: AWARDS, ALLSTAR: ALLSTAR, KEY: KEY, slotGroup: slotGroup, num: num, isDate: isDate, validateRoles: validateRoles, validateRatings: validateRatings, validateSchedule: validateSchedule,
              validateCap: validateCap, validateLottery: validateLottery, validateTop3: validateTop3, validatePicks: validatePicks, validateAwards: validateAwards, validateAllStar: validateAllStar, validateCup: validateCup, validateRetire: validateRetire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTS = api;
})(typeof window !== 'undefined' ? window : this);

;/* Importation d'un calendrier depuis un fichier CSV ou Excel (.xlsx) : lecture des fichiers, reconnaissance des colonnes, des dates et des équipes.
   Sans dépendance : le .xlsx est lu avec DecompressionStream (navigateurs récents et Node 18+). */
(function (root) {
  function norm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/)[0] || '', delim = [';', '\t', ','].map(function (d) { return [d, first.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', q = false, i = 0;
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // ---------- XLSX (zip + XML, lecture seule) ----------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  async function inflateRaw(bytes) { var ds = new DecompressionStream('deflate-raw'), out = new Blob([bytes]).stream().pipeThrough(ds); return new Uint8Array(await new Response(out).arrayBuffer()); }
  async function unzip(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Fichier Excel illisible (archive introuvable)');
    var n = u16(b, eocd + 10), p = u32(b, eocd + 16), files = {}, dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) break;
      var method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), off = u32(b, p + 42), name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      files[name] = { method: method, csize: csize, off: off }; p += 46 + nlen + xlen + clen;
    }
    return { files: files, bytes: b, read: async function (name) {
      var f = files[name]; if (!f) return null; var o = f.off, ln = u16(b, o + 26), lx = u16(b, o + 28), start = o + 30 + ln + lx, data = b.subarray(start, start + f.csize);
      return dec.decode(f.method === 0 ? data : await inflateRaw(data)); } };
  }
  function xmlText(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); }).replace(/&amp;/g, '&'); }
  function colIndex(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64); return n - 1; }
  async function readXlsx(buf) {
    var z = await unzip(buf), shared = [], sst = await z.read('xl/sharedStrings.xml');
    if (sst) (sst.match(/<si\b[\s\S]*?<\/si>/g) || []).forEach(function (si) { shared.push(xmlText((si.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).join(''))); });
    var sheetPath = 'xl/worksheets/sheet1.xml', wb = await z.read('xl/workbook.xml'), rels = await z.read('xl/_rels/workbook.xml.rels');
    if (wb && rels) { var sh = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb); if (sh) { var rel = new RegExp('<Relationship\\b[^>]*Id="' + sh[1] + '"[^>]*>').exec(rels) || new RegExp('<Relationship\\b[^>]*Target="[^"]*"[^>]*Id="' + sh[1] + '"[^>]*>').exec(rels); var tg = rel && /Target="([^"]+)"/.exec(rel[0]); if (tg) sheetPath = 'xl/' + tg[1].replace(/^\/?(xl\/)?/, ''); } }
    var xml = await z.read(sheetPath); if (!xml) throw new Error('Feuille de calcul introuvable');
    var rows = [];
    (xml.match(/<row\b[\s\S]*?<\/row>/g) || []).forEach(function (rx) {
      var rn = +((/<row\b[^>]*\br="(\d+)"/.exec(rx) || [])[1] || rows.length + 1) - 1, r = rows[rn] = rows[rn] || [];
      (rx.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (cx) {
        var ref = (/\br="([A-Z]+\d+)"/.exec(cx) || [])[1]; if (!ref) return; var t = (/\bt="([^"]+)"/.exec(cx) || [])[1], v = (/<v>([\s\S]*?)<\/v>/.exec(cx) || [])[1], val = '';
        if (t === 's') val = shared[+v] || ''; else if (t === 'inlineStr') val = xmlText((/<is>([\s\S]*?)<\/is>/.exec(cx) || [])[1] || ''); else if (t === 'str' || t === 'e') val = xmlText(v || ''); else if (v !== undefined && v !== '') val = isNaN(v) ? xmlText(v) : +v;
        r[colIndex(ref)] = val;
      });
    });
    return rows.map(function (r) { r = r || []; for (var i = 0; i < r.length; i++) if (r[i] === undefined) r[i] = ''; return r; });
  }

  // ---------- dates ----------
  var MONTHS = { janv: 1, janvier: 1, jan: 1, january: 1, fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2, mars: 3, mar: 3, march: 3, avr: 4, avril: 4, apr: 4, april: 4, mai: 5, may: 5, juin: 6, jun: 6, june: 6, juil: 7, juillet: 7, jul: 7, july: 7, aout: 8, aug: 8, august: 8, sept: 9, sep: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10, nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12 };
  function iso(y, m, d) { var dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  // v : texte ou nombre (numéro de série Excel) ; o.order : 'dmy' ou 'mdy' pour les dates ambiguës ; o.season : année de début de la saison (pour une date sans année)
  function parseDate(v, o) {
    o = o || {}; if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') { if (v > 20000 && v < 90000) { var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } return null; }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s))) { var a = +m[1], b = +m[2], dmy = a > 12 ? true : b > 12 ? false : (o.order || 'dmy') === 'dmy'; return dmy ? iso(+m[3], b, a) : iso(+m[3], a, b); }
    var t = norm(s).split(' '), day = null, mon = null, yr = null;
    t.forEach(function (w) { if (MONTHS[w] && mon === null) mon = MONTHS[w]; else if (/^\d{4}$/.test(w)) yr = +w; else if (/^\d{1,2}$/.test(w) && day === null) day = +w; });
    if (day !== null && mon !== null) { if (yr === null && o.season) yr = mon >= 8 ? o.season : o.season + 1; if (yr !== null) return iso(yr, mon, day); }
    return null;
  }

  // ---------- équipes ----------
  function buildTeamIndex(teams) {
    var idx = {}, dup = {};
    function add(k, code) { if (!k) return; if (idx[k] && idx[k] !== code) dup[k] = 1; else idx[k] = code; }
    teams.forEach(function (t) {
      add(norm(t.code), t.code);
      [t.en, t.fr].forEach(function (nm) { if (!nm) return; var n = norm(nm), w = n.split(' '); add(n, t.code); for (var k = 1; k <= Math.min(2, w.length - 1); k++) { add(w.slice(-k).join(' '), t.code); add(w.slice(0, k).join(' '), t.code); } });
    });
    Object.keys(dup).forEach(function (k) { delete idx[k]; });
    return idx;
  }
  function matchTeam(v, idx) {
    if (v === null || v === undefined) return null; var s = String(v).replace(/\(.*?\)/g, ' ').replace(/^\s*(@|vs\.?|v\.?|at|contre|à|chez)\s+/i, ' '), n = norm(s).replace(/^(vs|at|contre|a|chez) /, '');
    return n && idx[n] ? idx[n] : null;
  }

  // ---------- calendrier : colonnes, lignes, problèmes ----------
  function mapSchedule(matrix, o) {
    o = o || {}; var rows = matrix.filter(function (r) { return r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); }), idx = buildTeamIndex(o.teams || []);
    var hdr = -1, dc = -1, pc = -1, gc = -1;
    for (var i = 0; i < Math.min(rows.length, 6); i++) {
      var h = rows[i].map(norm), d = h.findIndex(function (x) { return /^(date|jour|date du match|game date)$/.test(x); }), p = h.findIndex(function (x) { return /^(adversaire|opponent|opp|equipe|team|equipe adverse|rival|visiteur|opposing team)$/.test(x); });
      if (d >= 0 && p >= 0) { hdr = i; dc = d; pc = p; gc = h.findIndex(function (x) { return /^(match|game|no|n|numero|game no|game number|numero du match|)$/.test(x) && x !== '' ; }); break; }
    }
    var data = rows.slice(hdr + 1);
    if (hdr < 0) {   // sans en-tête : on cherche la colonne des dates et celle des équipes d'après le contenu
      var ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([0])), best = { d: -1, ds: 0, p: -1, ps: 0 };
      for (var c = 0; c < ncol; c++) {
        var ds = 0, ps = 0; data.slice(0, 40).forEach(function (r) { if (parseDate(r[c], o)) ds++; if (matchTeam(r[c], idx)) ps++; });
        if (ds > best.ds) { best.d = c; best.ds = ds; } if (ps > best.ps) { best.p = c; best.ps = ps; }
      }
      dc = best.d; pc = best.p;
      if (dc >= 0 && pc >= 0) { for (var c2 = 0; c2 < ncol; c2++) if (c2 !== dc && c2 !== pc && data.slice(0, 40).every(function (r) { return r[c2] === '' || r[c2] === undefined || /^\d{1,3}$/.test(String(r[c2]).trim()); }) && data.some(function (r) { return String(r[c2]).trim() !== ''; })) { gc = c2; break; } }
    }
    if (dc < 0 || pc < 0) return { ok: false, rows: [], reason: 'columns' };
    var out = [], seen = {}, prev = null;
    data.forEach(function (r, k) {
      var rawD = r[dc], rawO = r[pc], date = parseDate(rawD, o), opp = matchTeam(rawO, idx), n = gc >= 0 && /^\d{1,3}$/.test(String(r[gc]).trim()) ? +r[gc] : k + 1, issues = [];
      if (rawD === '' && rawO === '') return;
      if (!date) issues.push('date'); else if (o.window && (date < o.window[0] || date > o.window[1])) issues.push('range'); if (!opp) issues.push('opp'); if (opp && o.myCode && opp === o.myCode) issues.push('self');
      if (seen[n]) issues.push('dup'); seen[n] = 1; if (date && prev && date < prev) issues.push('order'); if (date) prev = date;
      out.push({ n: n, date: date, opp: opp, rawDate: rawD, rawOpp: rawO, issues: issues });
    });
    var expected = o.games || out.length, bad = out.filter(function (x) { return x.issues.length; }).length;
    return { ok: true, rows: out, expected: expected, count: out.length, bad: bad, headerRow: hdr >= 0, columns: { date: dc, opp: pc, game: gc } };
  }

  var api = { norm: norm, parseCSV: parseCSV, readXlsx: readXlsx, parseDate: parseDate, buildTeamIndex: buildTeamIndex, matchTeam: matchTeam, mapSchedule: mapSchedule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTIMP = api;
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

;/* Vignettes transparentes des trophées (généré par assets/make_trophy_images.py) */
(function (root) {
  var IMG = {
  art_ross: 'data:image/png;base64,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',
  hart: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAABACAMAAAApvXfjAAABIFBMVEVkZGdeXWShn59dXWOnqKrf5N+ppZOjo6EqHx9ram7h3+B8fZ17fIXFuZYqf39BKiNEPUWHdViFgXuer87Xzqw9PU0AAP88RVJpVTlkaoOAfYKOinu9wby05+++yc8tLTQxMTg+PkMqLEA9QDEA//94e4CDe2yFfnehlHy9vcO2vMC2ucC/zL+7wcO9wcfAuLT//3/FxbvN09PDx8wAAABJSE50dHVWVFVUWGVoaW5zd4WmqKp/f3+JiY2WlZb+//6ytbZuZ1WLhHIvKTI4N0ZGNy5ORziYm6L1+vauqJK1vMfHyMzO09VVVVVbYW6Ce207NjR7gYxZUjpjW027wsnLxq4IBxAZGiU/Pz+bo6+sqKnc5Ovl6Os6JxtYV1KWlJUfq7pMAAAAYHRSTlOd4lhgE/7tpfIfERZh/AP+//5p//6fAfz///+W/gnuIrZu//0BsCGx/itRmxRfu0ECMU2bAP3+/f39/f0C/fsG/vz+/v/+/f3//v7//gT++f3+/v76/v/5BP4I///+zi+g7IV2AAADcklEQVR42mWU53arOhCFhTG4JDmpp7fbe7+jbolmwBTjfh2XJO//FlfEcbLiM7/Ex2gWaO8tBI91i57W+2UPWlnwJ6yfYw+aOnPfm7fPuz00Cx39w57vMaJB4DjvYfh8iBVMp6EbXEDzEXvguXg6HYXJ1KqfHnAH7oJpMuLhNKEXzeYed++sJKGckIBSqv6Gv3YY4YBwXhFTQRC0zG5APWjQIEslsThRipDZrAHXprt7G8o0VcyyuFZCqBHpQg8BGunLy1wzzkg6EZxn4W0XkKfDlbMZ+IxSNlFFrgqHtAA1Qn3pDAZlhTGuVmbhONnIQy33Q27wRlCMmcEDZ5GFDTRSfrkZDHKOcZ/p7WDwyfcN5qHcFE7+FvdNMTko5+UidBHVi0EuBKsxtrgS+cINf0SBu3AKbAZrKXmfUZb6WXiBaLi4ymk/Gs/LreozzFR2MrLRLVm4hH2DabnZUIMt4p4QG6Egy6ZnNI78bTjDROHg6oQfIzv5aXGOk3bMCY3jWRBkVxn9iDyLnr9J4naMx3HUvnlzfnJCzEGBPb45jeOb9k18FkVxfGp2dGsZ0GmEcRKPb8ZxYirGDRjeqzPGyTgJQ6Pxtwm+vTNmMXgIRwhhbPQilCLbqy1Ud9eWuWsRPhrphnFjb2+f3nUHbJ/wIu082ArtDYskIVIeP5jwETdSKrnfeY7XBnOfuAe2fwXDlMjJJ/jC9lJI/cehvwFcJeWvDz5+SgO0tPT/PcTrGs9/h6MvkqZV8cvh7CY0FC7+gY9fYBHl3V1EnvAQmiSa/3aIe3DHo7l3iJvwM++3DlLsDetoshqvn3cjSyuNjr3dBnQ/10OMCT8s3lZWHai9aEZKEyalVfW6auy0fAVHNl7525RSns+lb/prfA0vMUvzuSApW/nzlLE1fFcPebkUqiiJmaEd9Y5HnZ19LDbG+h2msxmWPMaiYYxj/ssqfIXPLGwugjGRZWmbFBu5hJjkSm+Lstzq3F+lxhXmKjiqQ03JB98UJ5N08j1coxfwmU+IwKowtCCkqoy9X6AhdBgRmhpLZStJqSAE3d8nx0JUAhsspW+SVhHugRliM8ZFnwnCU4kpYZiuAV2DzQVjEWeUT7TJfSUY3OPoNRcRZvV3R0zgdrSuT7D79XIZLaP6KsBRtGy37QcZPLu9/G9Xy6/sWs7/ASg/Jdm4BDTNAAAAAElFTkSuQmCC',
  norris: 'data:image/png;base64,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',
  lady_byng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAABACAMAAAA+n+cqAAABIFBMVEWloZ6gm5iampza2OBgX2BeWVilpKRgX2Jwb3LY3N0wIyXJzNB6e4N4fIOThXfJw7wsKzNVqqqYZmaPe3CFZ1GginfDurjMztAAAH8+PkI+PURVVQB/f4V/goeHYjqJf3uDf4i6usSZzMzDu7b//wAAAADo6uf0+PNRNSmIiYtMR0loaWv+/v52dnZJLSTU19eVlpZ/f3+1trbIyMupqq2Ge3FJKhtqORySmKM3Kix1e4R8g4pVVViqqqpVVVVmOCFYW2NqWU47OTpuRSyJh4idoqiFgns6OkRWMhxWQTRdY21zY1U/Pz9DPkZ0VTi4xMzj4tw6OzdCOzeIa1aWl5aXlZHT1tbV2+NyeYKIdWiNioq5ubizuMbi3Ng6Q01lZWz/8TUkAAAAYHRSTlPhW50ZqN0SYSb3845mlK7/tgMSnfrk/2ECTa8DKFz7evoaBTwBAP7+/v7+/QT9/v78A/7+/v7+//39/Pv+AwP///r+/in9/f/9//7/BPn9/f+5uv8jbw/+07eTMP7//1KpxQ6vAAADpUlEQVR42nWUCX/aPAyHHW56rLv33temOI7j2okDCyG0CZSjHKVdR++u3/9bvEqgtAX2B352/FgisiQTeFILcgSe6/mTC7lmHpyNsAXbSpDKM7qEjluCbb/4yXXdNeg6aHkbsE84tJyX0IWLP2+IUioguZ0LePMcOuBcsbtAqbDZnQa7DrhLOIaWwXnYZJdaMBYEonAL7ng8dkhmVhg2/WAYdz0lIu75TOSykAg8vD4rGBHTHm9HSvF2T3tdkTMKvz7kCZS3/lE8Cn1f8YQxJpjvBQI1maDbckNS6kdahu1+FE/s5lSyrqaUb6HbSgplU1Ivav+wJvEllT6u0PA3hPkGbvMUpZrZ7YkdS2pqDyEvp6G89hF2TX/I7X6//yOcmhpXTPsIyBjKHGFgNvuTdmQ3kJoy3V7AUDDKoqY6vAwim1fNUTu8M6follfggMABPEQ4V8xuMEpFo6gvA0lV4fFsC4L6bTu2udZxZNvCp7roPEKnQEze5zyOecy5zakWR+nZL7JSJswLhpwxPGTpk1cXWV7mli24aOqqEpw3pVllZRi7z/P5b6glb3PeVqYMZvDfyxq6QbPe3seeCFnuYq36/qjMPKb0zW4lv1Z9blrTTJF5sa1aunCksErKsF6a8BaOfC1q2jfQxSosgeH5Snl6E8R4Zj2mlLGpHVLbnI9OSxsbyQEyf9tN8A2GwnI/aUHsMhHmn17nZZxQ5f42tDbEiUs7d6wb7MIvziqswG2RB9hF8VVpeUaLlOHZ8TDoMnUXDK+W98I82Qeww5iJBRQzTOfV98XZZ1kAx2Bdz9SYUmZedhXJO/BYYL/DTTKcSp+lUlJOBZ8t3H4B5/rcDj0qOU/QlOqAJaMP2NwIW2Cc/5WwPU/Yox7j3JMfyejkPJdBgFcnJ8k5IaOkWKsdd2rkw+ik8/46dduCz+eDen3fQu3jmKper3fe58ElqSGuH1rH+HnSIJmlMJ+k2+tP69mewfF12mVvrVGvV3shgd/kWwqP7D26QepsDj1qmiY2Op3/VqD5KEoXk1Oqvv0cmiyD3+du1+DZCqRLeE+X8MnwkcqF25LtVVfdnsrlf/orL3R6f3pv1mwscjAsIqWWcskkSt/XjksI31mREFwIvMYZa6KE6DFRs62/8XorNiz72F5TwyoAMTpb9YX2MaH7C+FT4pB3nfrh10PUV1Sn08nGVIMTgyQDy6pbAwvpIcL5Jpzi8jWJthqZMmcWVst+VjE4NIr/A0CiMMt8qUOKAAAAAElFTkSuQmCC',
  calder: 'data:image/png;base64,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',
  conn_smythe: 'data:image/png;base64,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',
  vezina: 'data:image/png;base64,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',
  jennings: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAA9CAMAAADh0HsNAAABIFBMVEWnoaHa3+Jukaaho6hjXV6huMZrX2WVmZ9YNkOdlpxZdIrc3N9HHR+41ubHt7Y7Jik6RlNmXGPX3uCMgXtqOzxybGyrdHSPanEqf392qM+JdHe2wby2wcTExrrS3+M/P29INjV/P39jZ5d4hJGCcHKPeoOLfoG3w8X/AP8/Pz88LS0AVQAA//9VNDxAMEJOQj10fI5mmZl5hYuGfor/f3/DtLTAusDEvsFPJioAAADq+ftPNzlTRkw2JTFtaGtNHSRtVljU5uxoRkljKTL+/v5NOEU3Gh2Jd3c6HSVxhpFseoiTl5XPyclXZnGPh4lxdXPR1dR/f3+1xs5WVFastbXa8/mWp643NkeGaGpVVVVpW2Srl5ZVWWdkNzs4KUKJm6diTzafAAAAYHRSTlP5/Poa6vujmP5c/ib+/v///lhn/hAmEvQD/qjwiv+VBqUED6xhpf83AQSZAwFdg/+8BVJ7AiIl//4A/v7+/v3+/f7+/gf+//7+/vz+/v3+//4C/v7+/v7+/gP6//7+/v6YV6XNAAAGAUlEQVR42n2VB3ejuBbHBQbjljaZTNkp23t/b/c9CRWKwfRiwNixnfj7f4u9AjuT2ezZe45lED/9dYsKIoQs4UcGXwyePXv21kBvlPfw8F7RkWEYb98/Gww8cjREyE9AGkZaKsqZY5pO6Tht1OrqQdcVc3VWVaVuvL0Z9PDS+xbpjtOYzuvX+so0laqNJgc9itRqZTq6qpuoKpvWmBIPkQExEl1pE0VVX59JWD/EsYqiKAL4TJ1ECtJQm8QGWSLikYHa6k3lVGeKs3IcBUTbpo3iLD6cnbVtozhtm2TZQMLkFblSq6pBelVWh7goiihPmuYQRSKbRKpeocMhyvZX5FYGuCT/aSEwRY/VKGPMZ6LIilwIeGYsm8SHplLaYrwcSHhAvj1AGsxVpKrZes2Zojhl6ijOPlyvL6MIvq0OGcQnYTBVwqau6+qeXdbwUlbQCL6+vMyis9XKibVjnsEZo5Kw6TjVfs0zeGja1HQYZ2IyUR1Iyn5IfuzhARl0fphmlfkXnDlmErVZG3G+zg46VMqJ9wNZ586NJfkyRk2DklgwenEhKiEKVtQAr1ncxrlYD73l0Q2Qnor1JdtPorjmmAdxEQswzn0RxXvf5/WAfHGCQXos9hNVWsbW+20u6q3Yr7OuZ8KYQTzyAMuaxwBHkxgqx5i4vKxrLVLl+MlEG3qffvcIhoHjOI4Zxv5+W9uMQj22zOd+NsmyL0kvfII79d/23MJ+4IdYmoVfjqjF9/H4xD6CfyfeWKNQawHClP5aF4Hw6fa/0w9yD/CyVzcQat6hBOzdG2SMb0Dz09snMPE6M+JMQ412rSFU1yosCI88Uf4ccreVuY2aKi0bTdNQWjVJFGva8Jer47QneOlpnN/fc9HAgkuuC1EUCPbBYQ2dI39wpE9F+R/DUKm1Dosp0QAtiqwyYZHwe3/kD8n3H8Ff+9gf8XUOm7MLL0nyxkn1/B6k75n3UQW9bRiOQENuE2Z3VotcsPW9fw/r6Wp58wDD0vBDjoGljHYVwZxzTCnsMZjvnmuPArwlQx7y/jt+bMynOARH1n2IqBOeshBz/MR4Z+AHH5LbI/yCjEezOZ7P56600Z00Kg3m6hwK+xBRV5Gv7ubS7lJFUcrO0t4au59jNIVV3MHPyc8Ag7KrmH+3bb8C76bkj9Puvpp3MGxVedh1Q1ZwAMBh1itb7oMyIV9jCd99pCxhRTkqu2OI7Ai/lD2g/ACvjv9HZQzw6SjwtL/DjtMPOcH+ldfDcMb4PTx6GqB7TPnwoYJD3MNYBL19803eW3CqqOZ18HdHL/7VLPqiO5/hOLK7yWQzd++On2UyH9snR3jsIhfP8U7SyH4E2BsL441tYUvYPXxLbugmsObWJpDf0SNYDqc76XZOh0f4itKdrL/spjv/g7AcKHKOLfsan2CD4usN+IE21hxfBw9wLl1C0rm8xp8d4U/AhZTO8Sb1wbvyJC3OIQuBVJcN5M6T8HCOXSWwZIP7prNUcmkCrv0/B59gKaEl+bPLgmLb9PycuRS9Y6BNsVDAC1HWmIsUTlc29l6gV2Qsw7XT81TTlDS1baVUXuLz87KBweWO7lC66wv+HD0nQwlTCruJwqa6g6MZGnu7cbHr2rDDXbuLQpu+grsbkt6X1OpO5VOB4dV6vHnpjazgZoTxnfTbhSlGH50Epwc6k04D/FxArHNEsYUEpGrTC8LPsgPY3LDuwg2ESjeGhGVVrZcby7J32GK7D8IBTOfKRMIv3LhDgMd4E1xgN5FrAZxITiFgivoBF7Z2gWmAJWzQOQLndnZfLjs5hjkLhIVZjjtPYNnxzwAeUut8Z1l5CU4qNaZp0EnP3JJZGAWziwA8cxHlPxDkDbFcGTP2BuYv29Aqkk54kSMespwuYM4F3wge2h6aQlpoEok6ToRdNNttHWVw3dv7vGasEHDXXVNWFzQM2RR9JXVqAZefEFu6FVtWZ3smXxjcSNSGw53ZGtz/IR6jfmfjmdXnVv7PZvK978CLBcYXiwVfhHyIxAIsDEPoDD/Y4qmFCxsZQl4grstO5suG/pOJvwDCr0tH5nbaxgAAAABJRU5ErkJggg==',
  masterton: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAABACAMAAADGfxzdAAABIFBMVEWenJ/c2NVfXmmkm5R1VCvNoGffzKCvrW/Mtpfr3rWjo6HSr4fp5Nmsq6jc3NhlZQxlbobSrZxwPSZ8iJWGdmKBfYWrkm3/AAD/f3/Zya9/KhWNXCeHbmOjiF3b1Mc/Px9ycqy0amqwgD2wnHq8vMa6uMW9wcjKt6nCvsVJO0ByWzt9hpyJemT/vz/Jv8nAvsr//wD//38AAAD09/f9//+pp66MZ0qUk5ePWS6vlmuPd2a3tLSzhUzJx8qXdk+KiY+QmahyeIq1ejrNpXDPuJGGZjOniWqrqqrCh0nJllrIq4rX1NNrZ25/f3+FW0Hr6eduV05vSTGXhXKqeUuqmIm6pHS0ppG3uMLMvK/UxLCLTSe9vb1pTkh3YUybgk7l2tT5o76LAAAAYHRSTlPgJf2n+vv6CaIjJN38WVUD9Sf++Kn+pQECZwP8/+mrBAQD/kdmy25H//+icmgEGI4BAgD+A/77/P76/v3++/79/f7//Pn9/wX+/vf//AP//////P/1+/f98/j/Bv///viTZsvXAAADWklEQVR42mWSh5biOBBFhRMmNnScTjOzkzfvCmRZliMO4ECT0zbh//9iZaLpqXPsI1+XXj1VCcB9/ANf5QLsHj7BYdGFRSLD/E88D3m9BOFP/Bco+yQH373hTZgjvlSFhTc8D+/Jo3QqcNSB12u9DN7qt2FOMXXJyx8K7PkFvB1OBNGrwPoZ/wB/G5OBF31nO7P8AV57gumejB515InvrkmTGT7zU1isfTLxzvkdbD57E1Un0j18Pc8nken7vvT+jDdhXhoqikAYz+rk4TUdayvTJ+Xi/gfY954ibuwJ+rHwPv8Pif46nZBPUSHDmR0hoBwxJ/ozz45y4KxpwYSsiE58c9LebdjxgiSZwlQh5mVQ340AbEdYEX1BIYK/Vj3+5LMAq7pprqZDbTh8zx912Gil9ZoMNA4b3LfqrtMglf+sm4LQXyWMV4q7u7X1f02UwZDrO5aRnHGeJtYUc9iKk2+5o/5HWEXJDNsWcgzuy4mzY804atuI8atqO+OnOLuh6MecOoZVzfb/4qtFkWHENz9ALnMfmvArpgjF8Q0Fucx9e4V/A0Qto2wxfpflXxBCtVlsobP8NqwAhDh7gQDI3tsuzGE041BMEcjOka1ZXQ71qMHDboZ/hHzM+MaO0y5v/4BU5jXHG6iGYtvgK0W2u5ly1n7esahlGwgZ4Mqp/f5Xms+Gix0H49kVQoACu1ZzxgX4L8hDmVjGnBqWjdiOGFEa3cM80y95i3KDJlziJAku9zZeSYbvmH4Ued5CHPkjopuBJ5VEt9RkdbvRPBJHeqczanU6emsUuov5RerTaJQD9YWFIvRfFMXcNDZb/16vEahKMJ4vptNgyxcpf4gWlPFeYxvaizmP5x/S/HnDCFTtyLVNw9ied4xmwxNXRsZs+mfKAcbay9OBqyNsTwupDgBA8zP62GZTAA+Qx7Z2qqvueZtxprMqb3FPGew502H5wkobamkoqmJZ4xzjMrGB2bdurP6gb1n4SbXwWG6CphjYtrZ0HKc/SN+Jgq8CNwe+hzq2ny6Xy+Xg8nLZ7w8UjIl4D2TRjaLg8b80VJU9I9d1RRmUOrruhi1d77BWp+/QDTthCbhiGOrqo3qKMBRFF3y+JW6n1Wp9ah0idMltnfmv35pKNp75Orz7H7aHJFSgNarsAAAAAElFTkSuQmCC',
  jack_adams: 'data:image/png;base64,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',
  selke: 'data:image/png;base64,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',
  ted_lindsay: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAABACAMAAADVqFwpAAABIFBMVEWPbF/e3NanmZKflZJjXFydmpji19KLcmypp2orJSNoKyNkWVaqoJx0aWmTdnGbgnzGrq4/FQA1IyZtbW2qVVWjiXnIwrvSxbhqagD/f3/Dtq/GwLp/AABEKSlCPDtHQTt/fYF/f/+FNCaPVT/BubnDuLf//wD//3/Wz8zLx8MAAAAOBggqGBgzKCdHODJnWFOGeHF3aWVVSUVyZFtbUk08My/+//8/Pz+ol5DGuLAWExWTh4JPQzl/f3+1o5ptNy2Sg3u6q6V8cWxQJRptSTdYVFO9sacnJSROKyWMWEhORkVVVVVjWVaNSTknDQ0uIBxtS0eqqqq9vblwJxh4PDxmWFSFeHGOhoTy6ONNGRJNPT5JQj1rXmFuZ2ZuamZ/fz/SsBWSAAAAYHRSTlP5HahUnjP9pwtk8tDaeW+cHATvFAPsXP8CAuirAnq4t5YC+/9GqgECUYAA/v7+/v7+/f7+/P4EBP78/vv+Av7+/P/9/v64/mT9/WQDsfz9/vkDD/0Exs+Q//1rZPuY0QQdmAotAAADk0lEQVR42nXUh3LbOBAAUFDNvZxryt3lelmiE2TYxCIpjpS4+9wS2/n/v7iFmqWIXs94NPO4wGKxJIFpBMvQhqb3CLNBnvlHqG9t3RDh4GOL/hcEtcHJgJBeEz5X5UNt/+o3fICuBRAs+AXUByc8v+r1TvNN+LbgbdgWuUdWr/J8damyPtgSXJCT1ZMrUu2w1OO9Xo90ryt9GZqC8/z3AV99IR+Ou908776QbzfI+/37e7oB7yv8G2wOen1KqX8508C5+k7yLj3F9Kr+YdPO8/Ocnu4E1ffThto5Vtevw94Lvh7yfNDfgP8qfQ82C85X73+aqX7u/sG59d1+98sL+QDOB9/w7uztze9fFw//PvnLs+Mzt35wW28wf7fah9MZrBlTh91Xe6+/98DGr1CTHcdOVxDMewCXteRm7UZpcbN2fd3YnmxCJsW9PYwSmYQ2VJitO+MZHfk2HERHkQzD6OjoTSSTLKvhvEz9NThRFGWytF5GoSyz6B8c6bH/DfXCU5LIAv9sCKnUk7M88Qt4qzjXknPGznBAqNZnzE8ubQnWP0Oto4SSDJ0xyqgnmc+P4RVM/NYoJdWZ5R1KT7VIjf9uWh/mo2uPsh1Mx+BGG96Y8S0vkcaj43C5MYb/PPX3sIQuMH/sqdGaf5jzQgqFxHB+h270rDdE0tEK9QHrsOun8/mfRutjPj9nrpumvvFn/avA9b1Yc2xTn6NX5sdaK0KUojxlzD+ezfcKZQR1R6d3sdE+m83/iPUZEVOFIUWFG9xfuNP+WD+e88T6JOxFLrg3cobn4z56Y87lJF9J6voLLiZOy5CO8lfgh6mv4ETpoYtW6C76F1GMnIYlrfTR+n6yztyxfxx+B8b9FbJjXSWeUiP3V75zo103HrbHtcf3v05917qyPumP9U/D7wj6pX2tk06azrntn53/ALkmhOiIZ8ft4zP/Ft+cgLThjzdlC+9cPK+v/dgVSbJ+AG3i/BmVUeuwQ1PmxkONXYNHYbLIoppDnKhs3d217jLs+yRYosJCCFVEB6S5ftdq4ct/KM9SPg6/iLIsK7x0PyBGRlFZltE+F56H3bH/pM6yMMwyaRTRPFXh0VGY9nBFRJwDL1FeFGah1L4iG4bjE6XHwwRZdaT0VFgKlUnNjaoT2H40mp9zLYbTjy8e/vQE01w//OIAwSY2H4V+Ln7SI9NoQvuCQBuvofnE4mnYFsQxfkeh3Yb/ARZeZQBc9IinAAAAAElFTkSuQmCC',
  rocket_richard: 'data:image/png;base64,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',
  stanley_cup: 'data:image/png;base64,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'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = IMG; else root.FTTROPHY = IMG;
})(typeof window !== 'undefined' ? window : this);

;/* Logos des divisions, des conférences et des séries (généré par assets/make_logos.py) */
(function (root) {
  var L = {"div": {"ATL": "data:image/png;base64,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", "PAC": "data:image/png;base64,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", "CEN": "data:image/png;base64,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", "MET": "data:image/png;base64,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"}, "conf": {"EAST": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAABXCAMAAAD4QHEDAAABgFBMVEUAAAD5/PzGFDLFCSkDAQHm6On+/v6VpqqQh46PlJrS1tjRyMuyCiWttrmTnKIuBQy2Ey5NBxJtCRrLNk/+/v+YeYXJKUS1N07SZnjPV2vl19qmWGmvRFm3xcj+/v7ZprClqaySDSP////MRFu6KkT///8WFhfTdob+/f6caHZ0dXfVh5VVVlcnJic1NTbFIT3////btLtHR0hnZ2jd4eO7IjyjZ3XXmaSyvMCMBhzBAB3PTGLcvMPtyc+sTWDa3uCasrW1ARvuqLPWkZ3plqXm3uCZcX7leYuYECbp6el7gobZ2dkEBAQGBgaid4LoiJgbIiE+QURaXmFeY2Z8DSCVlZWhcX2qqqrhZXoAAABVVVV/f391e4GQSFSgm5y/v7/jbIHru8QjFxlGNjl3PEZgXl6oh4/UboDgXnT/qqrxs70zMzN/AAByFCN0LjluMTxgX2BmZmacIjeTP02eX3DMzMz/f3//zMzv7+8AAAAAAAAAAAAAAAAAAAAAAAAAAAA0RhT5AAAAgHRSTlMA/f7+/fwF/fz9+/z7+/37+/r6+877+/v6+vz6+/tO+/z7bvv7sPz6Mvv8+vz8/PyS+/39/Pv6+vr7+/v7/fr7+/z9+v39+/z6DPsLL0r6+/z5+fr7BvoG/nEDAvv3/QX6/Pn49/v6/PwD/QUC+fj3/wX5+PoKAgUhAAAAAAAAABcuPKUAAA+sSURBVHjavVqHfxo5vrek0fQZysA0wGADxoBtjI0xuNe0TTbbbuttu3737l5vf/77/SQNjP2ym8TJrj6JGTEaffXrZVhZeaOh67q62Fxd393tVioVIgZcdLu766ub+td3F76PoTbTN9d3K4Q7Xssc7G/t7Yixt/XHgdnyHE4qAK+/R2y5jb662yW2Z25taz8xtrfMlk26uwL83bEVKoC29peYhUKpVCqLAReFwhJ9/zsAV9jvhAv/N3eJbe4oxFJ5PncZY1SOcAR/GHMv5/NySeHvmA7ZXVUPPxj3i9UKtyRqoQyQgBWd1abVqmlaVpHatuOcNA+Hf06CkLLLeVmC71i8sv7Bw5H1ldWKvS+2KiFoWJ9WTUMOy7LMIj1NU86letvj6zigzJ2XxAP7TmX1oci6/pQMFCqCCkzL/HB6FkWdzsFBkdJRGAZBO4mHTSdFdKcJ4Ap7n+gPRNZXNm3YoAyotapvGL45rUcHINJs0Px12I4PT4B6fjJs08syPGivPhh4twW49AxJBdAOXQCOAiA0RPWCC5hmN4Lk8BQJ79G5plm7DwPW9Q8qW5rmRoBai9iR1GUWN8dNSpv8lhwyyto85TFLxs1hTyo4o+0heJPE1bS9ytMHIQOn+YZWYFOjRpGWYfMkAGgHCEJAToaX7CjET8Z6BLCUjTGcNhnI2d58IPC6h5w2/Q5sGYP0iDNiIahxk7FjDh9JksQAfM1YwG/5MDNuykJuhyDl1sN4rX9R+VfB6arYCwA5PwEIQWJClBnBB5wjSPGDLpCbitcPcZ05TqP6xoSnoLSHSGKPwfSWO8PDwyacZowC4NyhS+AYFAB8CX8IrxecNpDT7BDCEm0COiAlKMUUZcxoKhDZGL4OjzJXCnyxR8jr9QcBd/cFp02xFwCAFo+BtZwEjF0T5DgYEviNdIS8hfsxWJjS/TFJLjVtq/K9/va4OtkGTtckp1GLY7gY89RphqBcvThGHafJn3s9uN8D34kSP232QlzfA5UraBsP4LWurzs5Tg/JbQpA4KBgQpXLUsYj+Ru2k971OJWMAF47FHjtvRWvdTFWuuCn10LFaaCPLnEUFlvGx8VRgjgW0zE5Bl7vd7/Q30iz9eWyTeC0pjidOeWl3o4ORgdyFPPAS0b0hF5vE/3etj8BKi7+jslVt+JABGadTobHaL0PURj+mRiL1fB9H+fV6qN+v1arQ9gaKU4A5cDrRhcSMf3u/q8kVCV0p1ePj5GhBwdRfXomhFo3jYZ9PrEdozE5P59MJlyM1mxiw3AajZnnGRjCzGq/dhZ1ioDuzqOXVymvdFUaeCcf+n+YN19iPHcP6rU+hn3voorAfcOWAZ84BskNz5osJ47l8HM4xOwCEgURuKl7xOjxY0TfXd18BZshiawITIhCxc5Z34T422jYE7ARG11m/4Jnu7cgp1qOmZU7h2355/KKnzcMX+QN/VpUBM8S/uXmFMBz2JCh71Z4evU4oEdusVNDzFnD+LzaUrtNzBGrGwKXw0Em5tSb2GIKLD73fF/eEn+q0+UxuGcZNrcbnuHXWD0C0kfJVS4r2STpDfiCI7dT75uW4TVwUxuMyFS85RCdqoJIOL9pXEzr8OGJuVA1wetzyzBanmcdyKdkBHEseV7b79RgLZB+ebo07G+6V5cu61QzTCm5R6xjcUWHEVGxOQfgWr0W0SLtN8SNOkrfFPeUknf6tpj5M6kAkm0NM7Js2zOsYlz5n4WC6cIXRlWfL7lknLE+PioI8+rUkvdAcCaCsTxw1ZZsd5yZZ0Q1ece3HMEsy1aECJ5d1ClfJGKQw/Ii2t6jhgS1Zy3DP4jwHLaQWKPGMrbjV+BRXgEsh1GPLoQCWpLWljVTN0zcyqke3XQXwOAcvysV1Wa2jxyD2F/FmSeB++DA+JIbEaOPbAnjaiXWzwFf1DqGZE1DPNCqGpmiWOf4bCdYqpeubxLzd24o2Nmy/BZw7CwypKgEkY8onYLbUJvDORSVAFwoKOpB4TmydGQtJQZwdVNNHRNpn/WPcuoFuUbl5LIm5OmgHTasSOzsGZ60J5BEp28aM6mjVcoWwMWSO21IPfLRbk26lAqZGFNpD2IzCzlhul9Wlu4LEuibnBiJUa1d5HwENyOzX4/qj6QROdUcxQAs1clT/lspvC0WzEx6hs/Y+J1wfQao1+ZSvXQSdJZStP3PzfO8W/SrngNuwPDEEg+0y8wDS7ags261/GnVk+5NfMz6HWEsvo0ORarX1e4SeP30SEnKhnrft+RTmR8Awdt5f9zJA5fdupc7ow0MlyIVS7hRl0JDyaOX4P7BUr30v1Z+cAWNjnIDQkFsCDVSU1o5d+z4aENSZVoIPK/ng8bEki50Uj2TB6hKY1l49FmNpUq9MI+l8mmIKcBQZXxGLYokwGy2IMhDBwIUNzAUCornkWFPJlmxSnx5WO5HSg+qamfFF9t0H1f+WwHvXh0Js+UtB9kh+AJnpYKlfAK+zms0IOJ6UESNGC3OaVUMM0LgQCYGoNMXsAwCkjBhLxIWCbQKdzt7ZDYyH6PUCxheOS7m/CWR3k64JfMCA0N1elbrQ4ZRj0S2VSgvMqBisVwG102LB50oiuqw7HPsFQDbLsCSGlJBhEFVI6UojUy9wGXespqXD6o2xjKIwkUW1aNOPp+Ca7eguQtgt7hWvpdxwRo4Rb1WYx3T8GbOTDpPo5OFVv+gLdQLPObLhRGL8GmZ1f/ECnytdDePFEhQBK4BoWqU3LWyvMovUgdgkDdBeLesi5lzDkao/C5cpSJS6CREcShMSBhUAU5LhYyh7tqai3+wsVMAesuL/hJ1ly2oQqlUnsPC4r2MtxMJeMoeeZl6iUgBRjy9mOUxFXFaGejJd7GwHbImTlIqlBAIpF0siU7X3VWFUrm8VswnvvQgQl29gJAPUYYSSIH+WvmyiNlBHrOIiJpWXLTTRCcNN6M/PYDfwJRy7qjw4Dx7RNQBI8iQIVWpHv1tdwWNmB7kMJ8sOmVlulaez4siWNOsgFAdl0U7JLvO3aWYpM6XByiU1hQ8rgPGf1g8roBq3biULTAzjm4NDlxRj9+kfOjGjj0OWOI0WWC3245zOqZNx0kTuHSuaeCcnDrhMO1d9pwRa4/ttN07/TG9AYsvrv1jaydDl7yXxwX1qjxmiPmZpPOjvcGWps0D409i0TEUn+N2j4ybxIHCjQQJacfEGR+OUt48aSekeUiuQ5I2x+GQ8DAmweiWNMfHsKZ5KFl4SpI57Lsjm4OKdPBekPj8u2wEbuwNWjavkP1FycTC2zRkR21sNjg8hOq/1yNhj7QhSU9PRiOWkITx8YiPach6nI/bJE6gZsKeyCENJYRsDuyR1DG3PhLc/AzSnbiysrLrYdcVagBRaWD/oQTFaSSL04Rh0d1m1OHB6cmJ0+T0kAD3sVAnQLHj8GNxfXxMrvk1Hx6LMhVbE6THqCpYQYJ8HesUuzUQpJea4Lx04og+8+ZT9NxYFZcoWJ2sNaH4h01GRwE/Cckw5txhTd5sJiF3oCpLyInD2zRN4zgMSAxEN+EGivEQFrel6gCvZKWsut63HoCLrt/q+uaynts1UZ19WRWfkOugTR0Sh1Duws70loyZk9IjoGMctEcJ3BHftIMg5IfMISkdkmYQwJGGYTtkEjgA4EFX/yIr0bqQr+uqrazqRX0Fm3llRTGLwcelosXFe0c9khw1SRPok60JqP2Rrw4JxrBRGqYOfAssOoQZEE6yBlQqKN4DoX714sWL57JUW71fNn9T2dMWMgYBxT0oV9u9OASFiUfwH4hJ0BVgcy0IofYJ4rAdwwy/Z8dyYQ9nSZzQZVNimzxdef78q6+e6//2ihpddlwWLZdl5yFzEKFyJbl4tbyg0p3kHAxVbZiSJnoDz1devHj1qxoJ/JHmdnzMrO4O3PIqyH3L2sf5WXglF919KEx529V2tI3XdK/1yo72sVZmU8Ms3tskpJdUmogalzdX7p1uHiwI7x92DGb8mfZHQbH+c92tyr72yQaEetMwozuxmMWnN0OS5iI0S3kuALqn5OXwNL7zCGufEGfkahumUK6f741b2tYWSJlWIYrUc6wrun/BaPpjLwmUiANwoUfyIOFx72949wc3F4xp0uTkJAQJ75ua2f15Tq+sOtqGBc6Lica8eUYXYatU+BeZuySAmRwn7RtCrtpwAU4muRV3/lAoLaNgfAK22KOAu2HvaM76a4BRuwbPMNFgtA5UW7VOBl3SMEH60xOIZqOrZY72I/gJ9uRDBNYKGWzYSyFRjSFAgkZ7HujWa5qLECYtbcMYiJcgjEaf+4Y/VcJm/wHujgxK6PrZDxnuY4YaVt5Hx/utssHg+pbwJti1i0mSRXaQ09+8rksNJO+1fruBrtxlrDPFlCESxhSbG9p3BC+fFAq/l42A3xcKIhviLU171hO5wDGIlh+2mYTdbpHBm3RTdRGtPmlZezLFYmxUQ2GDnkF0A749Foq7BgwUJQomnYCWvITFoJNKtEPwNGuYVWzs28SCtd3XNlPx3QvEiS3A2kKqC5/BZnWErh1ApvdEm6s4+8+ypvuDNOVwrj2BfLjTw3cl4FvdNYzxGwOYAu7gTd4RILNBxB9bLcP6VLxAFcKu+oY1RTrKqrX5mDjb2x55qablNeYGw5TwsRAtwm5jto6vCPfJG7WtEdlCJuHLNRW3lbD9DyOaOatTE++YaZbp0/ZCtCJz22thVdqCo5vkDdvl+sr/du09kZYA9LOPRbYEwj6oWdKpiKzoW2AFKM+3oYwfyRhFGyjRaluegIVj7zmVN27TY5Zf8QB641PLWAgbOX4mhS1KN9Rmt1BA2JEQbS9Uov3dwOFYKiOsR9b/6c279JgSrFcchP4EoXPCFk5l2gExSh8F36FoyTizWm0Ha1so/bYlrL7ydm8HVlaeAjSkIxtbINuFsNdAz6bCqVDlLNqHINrmMV2KFpTdNhHWkbD6W74MWVn5IIM2sQX8bC8TdkcJG1/CgEbdFe0StvIA2HtUawjt54UtnApmg1K05cxqEXYAq7YeDHsfek9AW/KnESUp7CLlIg4sRZuD/eCdfhihGC5+KLD3DKHzwi5SEO3awmoB1tlXsJCjf/9uPwVB6N+o3yh8DNBWTtigW8J8pGgRVnsf1L4Keue3YExLYedEC7Cf4C8S7Mr6f70X2Az6a4AeLKGt7HcwQrQTTrwtBfv9e4NdvC/KoAcCWghbiHbCeQa7+pv3Crv49Y2C3h4AyeBWoAZEjeItFPrgl4FdQHc52ss2hC4fQpidh/36l4HNOA7QpoIGikUA0ga88o6/Knor6E8hj9tBrf7lYe9BiwaGybu/Buw9aAWr/xqwGfQmQP/KsEvod4H9P2mKsvifXL/oAAAAAElFTkSuQmCC", "WEST": "data:image/png;base64,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"}, "po": {"en": {"uri": "data:image/png;base64,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", "w": 158, "h": 170, "x": 78.8, "y": 143.4, "tl": 29.8, "fs": 8.3}, "fr": {"uri": "data:image/png;base64,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", "w": 120, "h": 170, "x": 58.4, "y": 143.7, "tl": 29.9, "fs": 8.2}}};
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.FTLOGOS = L;
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

;/* Moteur de grilles pilotées par une configuration : lignes fixes par saison (alignement, calendrier...) ou journal de lignes (retraites...). */
(function (root) {
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  var TC = root.FTTC || (typeof require !== 'undefined' ? require('../connect/team_combo.js') : null);
  var PC = root.FTPC || (typeof require !== 'undefined' ? require('../connect/player_combo.js') : null);   // choix d'un joueur avec saisie libre
  var GIC = root.FTGIC || (typeof require !== 'undefined' ? require('../connect/grid_input_core.js') : null);   // nombres selon la langue (num)
  var IMP = root.FTIMP || (typeof require !== 'undefined' ? require('./import_tools.js') : null);
  function logoURL(code) { var c = String(code || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c === 'VEG') c = 'VGK'; return c ? 'https://assets.nhle.com/logos/nhl/svg/' + c + '_light.svg' : ''; }
  function moneyText(v, lang) { return v === '' || v == null || isNaN(v) ? '' : String(Math.round(+v)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '\u00a0'); }   // milliers : 8,500,000 (EN) / 8 500 000 (FR)
  var CUR_ROWS = [], CUR_H = null;   // lignes affichées (pour les cellules calculées qui dépendent d'autres lignes)
  var TEAM_LOGOS = {};   // logos des équipes personnalisées (image intégrée), par code
  function logoHTML(code) { if (TEAM_LOGOS[code]) return '<img class="tlogo" src="' + TEAM_LOGOS[code] + '" alt="">'; var u = logoURL(code); return u ? '<img class="tlogo" src="' + u + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function makeGridApp(DATA, CFG, store) {
    var entries = {}; CFG.tabs.forEach(function (tb) { entries[tb.k] = {}; });
    try { var sv = store && store.get(CFG.storeKey); if (sv) { var o = JSON.parse(sv); CFG.tabs.forEach(function (tb) { if (o[tb.k]) entries[tb.k] = o[tb.k]; }); } } catch (e) { /* stockage indisponible */ }
    var state = { lang: 'fr', tab: CFG.tabs[0].k, season: {}, flt: {}, imp: null, step: 2 };
    var TEAMS = {}; DATA.teams.forEach(function (tm) { TEAMS[tm.code] = tm; TEAMS[tm.en] = tm; });
    var byName = {}; DATA.players.forEach(function (p) { byName[p.name.toLowerCase()] = p; });
    var byId = {}; DATA.players.forEach(function (p) { byId[p.id] = p; });
    var teamIdx = IMP ? IMP.buildTeamIndex(DATA.teams) : {}; TEAM_LOGOS = {}; (DATA.teams || []).forEach(function (x) { if (x.logo) TEAM_LOGOS[x.code] = x.logo; });
    function teamCode(v) { v = String(v == null ? '' : v).trim(); if (!v) return ''; if (TEAMS[v]) return TEAMS[v].code; return IMP ? (IMP.matchTeam(v, teamIdx) || '') : ''; }

    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    // paramètre { k: clé } : libellé traduit ; nombre décimal : virgule en français
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { var v = x && typeof x === 'object' && x.k ? t(x.k) : typeof x === 'number' && x % 1 && state.lang === 'fr' ? String(x).replace('.', ',') : x; s = s.split('{' + i + '}').join(v); }); return s; }   // toutes les occurrences d'un même paramètre
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    function tab() { return CFG.tabs.filter(function (x) { return x.k === state.tab; })[0]; }
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
    function seasonOf(tb) { var v = state.season[tb.k]; if (v == null) v = tb.defaultSeason ? tb.defaultSeason(DATA) : DATA.franchise.current + 1; return v; }
    function H() { return CFG.helpers(DATA, { season: seasonOf(tab()), tab: state.tab, lang: state.lang, entries: entries }); }

    // ---- lignes fusionnées (base + saisies) ----
    function rows(tb) {
      var sk = String(seasonOf(tb)), h = H();
      if (tb.mode === 'log') return (entries[tb.k][sk] || []);
      var base = tb.fixed(seasonOf(tb), h, DATA), ov = entries[tb.k][sk] || {};
      return base.map(function (r, i) { var x = Object.assign({}, r); Object.keys(ov[i] || {}).forEach(function (c) { x[c] = ov[i][c]; }); x._edited = !!ov[i]; return x; });
    }
    var storeErr = false;   // le navigateur a refusé d'enregistrer (stockage plein ou bloqué) : la barre d'état passe en erreur
    function persist() { try { store && store.set(CFG.storeKey, JSON.stringify(entries)); storeErr = false; } catch (e) { storeErr = true; } }
    function colDef(tb, c) { return tb.schema.filter(function (d) { return d[0] === c; })[0]; }
    // Saisie rapide d'une date de match : « 10-08 », « 8 oct », « 08/10 » : l'année est déduite de la saison (août à décembre = année de début)
    function normDate(v, tb) {
      if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v) || !IMP) return v;
      var y = seasonOf(tb), order = state.lang === 'fr' ? 'dmy' : 'mdy', d = IMP.parseDate(v, { order: order, season: y }); if (d) return d;
      var m = /^(\d{1,2})[-\/.](\d{1,2})$/.exec(v); if (!m) return v;
      var a = +m[1], b = +m[2], dmy = a > 12 ? true : b > 12 ? false : order === 'dmy', mo = dmy ? b : a, dy = dmy ? a : b;
      return IMP.parseDate((mo >= 8 ? y : y + 1) + '-' + mo + '-' + dy) || v;
    }
    // ---- cellules « joueur » avec saisie libre (FTPC, maquette approuvée) : tb.playerGroup(def, r) → 'F' | 'D' | 'G' | '' (tous), undefined = pas une cellule joueur ----
    var TOUCHED = {};   // noms saisis ou modifiés pendant la séance : seuls eux reçoivent l'avertissement « nom proche » (décision de Gabriel)
    function touchKey(ri, c) { return state.tab + '|' + seasonOf(tab()) + '|' + ri + '|' + c; }
    // étiquette d'homonyme « Nom (D · 2026-27 – 2030-31) » (connect/homonym_ui.js) : seulement si un autre joueur porte le même nom
    var LBLC = { lang: null, n: -1, m: {} };
    function plLabels() { var HO = root.FTHOMO || (typeof require !== 'undefined' ? require('../connect/homonym_ui.js') : null), n = (DATA.homo || []).length; if (!HO) return {}; if (LBLC.lang !== state.lang || LBLC.n !== n) LBLC = { lang: state.lang, n: n, m: HO.labels(DATA.homo, t) }; return LBLC.m; }
    function plLabel(p) { return plLabels()[p.id] || p.name; }
    function plist() { var L = plLabels(); return DATA.players.map(function (p) { return { id: p.id, name: p.name, label: L[p.id] || null, g: p.pos, o: 'franchise' }; }).concat((DATA.hist || []).map(function (h) { return { id: h[0], name: h[1], label: L[h[0]] || null, g: h[2], o: 'historical' }; })); }
    function setCell(r, c, raw) {
      var tb = tab(), def = colDef(tb, c); if (!def || def[2] === 'ro') return false;
      if (PC && tb.playerGroup) { var rows0 = rows(tb), pg = tb.playerGroup(def, rows0[r] || {}); if (pg !== undefined) { TOUCHED[touchKey(r, c)] = 1; raw = PC.complete(String(raw == null ? '' : raw).trim(), pg || null, plist()); } }
      var v = String(raw == null ? '' : raw).trim();
      var custom = tb.parseCell ? tb.parseCell(def, v, state.lang) : undefined; if (custom === false) return false;
      if (def[2] === 'team') {
        var tcur = (rows(tb)[r] || {})[c], tcode = TC.resolve(v, DATA.teams.filter(function (x) { return x.active !== 0 || x.code === tcur; }));
        if (tcode === null) { var all = DATA.teams.filter(function (x) { var n = TC.norm(v); return TC.norm(x.code) === n || TC.norm(x.fr) === n || TC.norm(x.en) === n; }); if (all.length === 1) tcode = all[0].code; }   // le nom exact ou le code d'une équipe retirée de la ligue reste accepté
        if (tcode === null) return false; v = tcode;
      }
      if (custom === undefined && (def[2] === 'int' || def[2] === 'money' || def[2] === 'dec3')) { if (v !== '') { v = GIC.num(v, state.lang); if (isNaN(v)) return false; if (def[2] === 'dec3') { v = Math.round(v * 1000) / 1000; } else if (def[4] === 'dec') { v = Math.round(v * 100) / 100; } else v = Math.round(v); } }
      var sk = String(seasonOf(tb)), patch = {};
      if (def[2] === 'player') { var p = DATA.players.filter(function (x) { return plLabels()[x.id] && plLabel(x).toLowerCase() === v.toLowerCase(); })[0] || byName[v.toLowerCase()]; patch[c] = p ? p.id : null; patch.pname = v; patch.auto = false; if (v === '') { patch[c] = null; } }
      else if (def[2] === 'teamlist') { var code = teamCode(v); patch[c] = code; patch.otext = code ? '' : v; }
      else if (def[2] === 'date' && tb.shortDates) { patch[c] = normDate(v, tb); patch.dateAuto = false; }
      else patch[c] = custom !== undefined ? custom : v;
      if (tb.mode === 'fixed') { var cur0 = rows(tb)[r]; if (cur0 && cur0.autoCols && cur0.autoCols[c]) patch.autoCols = Object.assign({}, cur0.autoCols, { [c]: false }); }
      if (tb.cellRO) {   // les cases qui ne s'appliquent plus (hachurées) après ce changement sont vidées : elles ne partent pas à l'envoi
        var cur1 = Object.assign({}, rows(tb)[r] || {}, patch), rs1 = rows(tb).slice(); rs1[r] = cur1; var h1 = H();
        tb.schema.forEach(function (d) { var k = d[0]; if (k === c || d[2] === 'ro' || cur1[k] == null || cur1[k] === '') return; var ro = tb.cellRO(d, cur1, r, rs1, h1, t); if (ro && ro.cls === 'na') patch[k] = ''; });
      }
      if (tb.mode === 'log') {
        entries[tb.k][sk] = entries[tb.k][sk] || [];
        if (r >= entries[tb.k][sk].length) entries[tb.k][sk].push(tb.blank ? tb.blank(seasonOf(tb), H()) : {});
        Object.assign(entries[tb.k][sk][r], patch);
      } else {
        entries[tb.k][sk] = entries[tb.k][sk] || {}; entries[tb.k][sk][r] = Object.assign(entries[tb.k][sk][r] || {}, patch);
        if (tb.suggest) tb.suggest(rows(tb), r, c, { step: state.step, season: seasonOf(tb) }).forEach(function (p) { entries[tb.k][sk][p.i] = Object.assign(entries[tb.k][sk][p.i] || {}, p.patch); });   // ex. : date du match suivant proposée (+2 jours)
      }
      persist(); return true;
    }
    // valeur refusée par setCell : message qui dit comment corriger, selon le type de la colonne (null : case non modifiable)
    function refusal(c, raw) {
      var def = colDef(tab(), c); if (!def || def[2] === 'ro') return null;
      var ty = def[2], k = { money: 'val.bad_money', dec3: 'val.bad_decimal', team: 'val.bad_team', teamlist: 'val.bad_team', player: 'val.bad_player_list', date: 'val.bad_date' }[ty] || (ty === 'int' ? (def[4] === 'dec' ? 'val.bad_decimal' : 'val.bad_int') : null);
      if (c === 'height') k = 'val.bad_height'; else if (c === 'weight') k = 'val.bad_weight'; else if (c === 'svp') k = 'val.bad_svp';
      return { ok: false, k: k || 'val.bad_value', p: [String(raw == null ? '' : raw).trim()] };
    }
    // nom de la ligne (colonne en lecture seule de l'onglet) et abréviation de la colonne : ligne de correction de la barre
    function rowLabel(r) { var tb = tab(), d = tb.schema.filter(function (x) { return x[2] === 'ro'; })[0], row = rows(tb)[r]; return d && row ? String(roText(tb, d, row)).replace(/<[^>]*>/g, '') : ''; }
    function colLabel(c) { var d = colDef(tab(), c); return d ? t(d[1], true) : c; }
    function alertCount() { var n = 0; alertsOf(tab()).forEach(function (a) { n += (a || []).length; }); return n; }
    function isNA(r, c) { var tb = tab(), def = colDef(tb, c); if (!def || !tb.cellRO) return false; var rs = rows(tb), ro = rs[r] ? tb.cellRO(def, rs[r], r, rs, H(), t) : null; return !!ro; }
    function snapshot() { return JSON.stringify(entries); }
    function restore(s) { var o; try { o = JSON.parse(s); } catch (e) { return false; } CFG.tabs.forEach(function (tb) { entries[tb.k] = o[tb.k] || {}; }); persist(); return true; }
    function pasteCols() { return tab().schema.filter(function (d) { return d[2] !== 'ro'; }).map(function (d) { return d[0]; }); }
    function removeRow(r) { var tb = tab(), sk = String(seasonOf(tb)); if (tb.mode === 'log') { (entries[tb.k][sk] || []).splice(r, 1); } else if (entries[tb.k][sk]) delete entries[tb.k][sk][r]; persist(); }
    function reset() { CFG.tabs.forEach(function (tb) { entries[tb.k] = {}; }); persist(); }
    function countEntries() { var n = 0; CFG.tabs.forEach(function (tb) { Object.keys(entries[tb.k]).forEach(function (s) { var e = entries[tb.k][s]; n += Array.isArray(e) ? e.length : Object.keys(e).length; }); }); return n; }
    function filterOf(tb) { return state.flt[tb.k] || (state.flt[tb.k] = { q: '', missing: false }); }
    function visibleIdx(tb) {
      var rs = rows(tb), out = [], f = filterOf(tb), h = H();
      for (var i = 0; i < rs.length; i++) if (!tb.hidden || !tb.hidden(rs[i], f, h)) out.push(i);
      return out;
    }
    function applyPaste(r, c, text) {
      var tb = tab(), cols = tb.schema.filter(function (d) { return d[2] !== 'ro'; }).map(function (d) { return d[0]; }), c0 = cols.indexOf(c), n = 0, vis = visibleIdx(tb), pos = vis.indexOf(r);
      String(text).replace(/\r/g, '').split('\n').filter(function (x) { return x.trim() !== ''; }).forEach(function (line, i) {
        var target = tb.mode === 'fixed' ? vis[pos + i] : r + i;
        if (target === undefined) return;
        line.split('\t').forEach(function (cell, j) { if (c0 + j < cols.length && setCell(target, cols[c0 + j], cell)) n++; });
      }); return n;
    }
    function alertsOf(tb) { return tb.validate(rows(tb), H(), seasonOf(tb)); }
    function alertsText(al) { var tb = tab(); return al.map(function (a) { var d = a.c && colDef(tb, a.c); return (d ? t(d[1], true) + ' : ' : '') + fmt(a.k, a.p); }).join('\n'); }
    function cellClass(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.some(function (a) { return a.level === 'err'; }) ? ' err' : m.length ? ' warn' : ''; }
    function cellTitle(al, c) { var m = al.filter(function (a) { return a.c === c; }); return m.length ? ' title="' + esc(alertsText(m)) + '"' : ''; }

    function roText(tb, def, r) { var v = r[def[0]]; return tb.roFormat ? tb.roFormat(def[0], v, r, t, tn) : (v == null ? '' : v); }
    function listId(tb, r) { return tb.listOf ? 'pl_' + tb.listOf(r) : 'plist'; }
    function cellHTML(tb, def, r, ri, al) {
      var c = def[0], type = def[2], cls = 'ci' + cellClass(al, c), ttl = cellTitle(al, c), lbl = ' aria-label="' + esc(t(def[1])) + '"';
      var roC = tb.cellRO ? tb.cellRO(def, r, ri, CUR_ROWS, CUR_H, t) : null;
      if (roC) return '<td class="d ro' + (roC.cls ? ' ' + roC.cls : '') + '"' + ttl + '>' + (roC.html !== undefined ? roC.html : esc(roC.text)) + '</td>';
      var after = tb.cellAfter ? tb.cellAfter(def, r, ri, CUR_H, t) || '' : '', ph = tb.placeholder ? tb.placeholder(def, r, ri, CUR_H) || '' : '';
      if (type === 'ro') return '<th class="pl">' + (tb.roHTML ? tb.roHTML(def, r, t) : esc(roText(tb, def, r))) + '</th>';
      if (type === 'player' && r.auto) { cls += ' auto'; if (!ttl) ttl = ' title="' + esc(t('pre.auto_hint')) + '"'; }
      if (r.autoCols && r.autoCols[c]) { cls += ' auto'; if (!ttl) ttl = ' title="' + esc(t('pre.auto_hint2')) + '"'; }
      if (type === 'date' && r.dateAuto) { cls += ' auto'; if (!ttl) ttl = ' title="' + esc(t('pre.auto_date_hint')) + '"'; }
      var val = type === 'player' ? (r.pname != null ? r.pname : (r[c] && byId[r[c]] ? plLabel(byId[r[c]]) : '')) : type === 'teamlist' ? (r[c] ? tn(r[c]) : (r.otext || '')) : type === 'money' ? moneyText(r[c], state.lang) : tb.fmtCell ? tb.fmtCell(def, r[c], state.lang) : r[c];
      if (type === 'sel') {
        var opts = (tb.selOptions ? tb.selOptions(def, r, t, state.lang) : null) || def[3];
        if (val !== '' && val != null && !opts.some(function (o) { return String(o[0]) === String(val); })) opts = opts.concat([[val, val]]);   // une valeur déjà enregistrée reste toujours disponible
        return '<td class="' + cls + '"' + ttl + '><select class="cell" data-r="' + ri + '" data-c="' + c + '"' + lbl + '><option value=""></option>' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(t(o[1])) + '</option>'; }).join('') + '</select>' + after + '</td>';
      }
      var pg = PC && tb.playerGroup ? tb.playerGroup(def, r) : undefined;
      if (pg !== undefined) { var pres = PC.resolve(val, pg || null, plist(), 'free', { near: !!TOUCHED[touchKey(ri, c)] }); if (PC.isWarn(pres) && cls.indexOf(' err') < 0) cls += ' warn'; }
      if (pg !== undefined) return '<td class="' + cls + '"' + ttl + '>' + PC.cellHTML({ res: pres, r: ri, c: c, value: val, list: plist(), group: pg || null, unknown: 'free', listId: 'dl-pc-' + (pg || 'all'), label: t(def[1]), touched: !!TOUCHED[touchKey(ri, c)] }, esc, t) + after + '</td>';
      if (type === 'team') return '<td class="' + cls + '"' + ttl + '><input class="cell tcombo" list="dl-teams" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val ? teamText(val) : '') + '" placeholder="' + esc(tb.blankOption ? tb.blankOption(def, r, ri, CUR_H, t) || '' : '') + '" autocomplete="off"' + lbl + '>' + after + '</td>';
      var wrapO = (type === 'player' && r.auto) || (type === 'date' && r.dateAuto) || (r.autoCols && r.autoCols[c]) ? '<span class="cw">' : '', wrapC = wrapO ? '</span>' : '';
      return '<td class="' + cls + '"' + ttl + '>' + wrapO + '<input class="cell ' + type + '" data-r="' + ri + '" data-c="' + c + '" value="' + esc(val == null ? '' : val) + '"' + (type === 'player' ? ' list="' + listId(tb, r) + '"' : type === 'key' ? ' list="klist"' : type === 'teamlist' ? ' list="tlist"' : '') + (type === 'date' ? ' placeholder="' + esc(t('ui.date_ph')) + '"' : ph ? ' placeholder="' + esc(ph) + '"' : '') + (type === 'money' ? ' inputmode="numeric"' : '') + (tb.listFor && tb.listFor(def, r) ? ' list="dl-' + tb.listFor(def, r) + '"' : '') + ' autocomplete="off"' + lbl + '>' + wrapC + after + '</td>';
    }
    function dcell(x, k, tb) { var cl = (tb.derivedClass && tb.derivedClass[k]) || ''; return '<td class="num d ' + cl + '" data-d="' + k + '">' + (x && typeof x === 'object' && x.html !== undefined ? x.html : esc(x)) + '</td>'; }
    function gridHTML(tb) {
      var rs = rows(tb), al = alertsOf(tb), heads = tb.derivedHeads || [], total = 0, n = tb.mode === 'log' ? rs.length + 1 : rs.length, vis = tb.mode === 'log' ? null : visibleIdx(tb), cols = tb.schema.length + heads.length + 2, sh = !!tb.shortHeads;
      CUR_ROWS = rs; CUR_H = H();
      // mise en page libre (alignement, tableau des séries) : l'onglet fournit le HTML ; api.cell(ligne, colonne) donne le champ de saisie habituel
      if (tb.layout) {
        var totalL = 0; al.forEach(function (a) { totalL += a.length; });
        var lapi = { H: CUR_H, t: t, tn: tn, rows: rs, alerts: al, cell: function (ri, col) { var def = tb.schema.filter(function (d) { return d[0] === col; })[0], x = cellHTML(tb, def, rs[ri] || {}, ri, al[ri] || []), m = /^<(?:td|th)[^>]*?class="([^"]*)"([^>]*)>([\s\S]*)<\/(?:td|th)>$/.exec(x); return m ? '<span class="lcell ' + m[1] + '"' + m[2] + '>' + m[3] + '</span>' : x; } };
        return { html: '<div class="layout ' + (tb.tableClass || '') + '">' + tb.layout(rs, al, lapi) + '</div>', alerts: totalL };
      }
      var headHTML = '<tr>' + tb.schema.map(function (d) { return '<th' + (d[2] === 'ro' ? ' class="pl"' : '') + (tb.headTip && tb.headTip(d, t) ? ' data-tip="' + esc(tb.headTip(d, t)) + '"' : ' title="' + esc(t(d[1])) + '"') + '>' + (tb.headHTML && tb.headHTML(d, t) != null ? tb.headHTML(d, t) : esc(t(d[1], sh))) + '</th>'; }).join('') + heads.map(function (h, k) { return '<th class="d ' + ((tb.derivedClass && tb.derivedClass[k]) || '') + '"' + (h ? ' title="' + esc(t(h)) + '"' : '') + '>' + (h ? esc(t(h, sh)) : '') + '</th>'; }).join('') + '<th></th><th></th></tr>';
      function tableOf(idxs, id) {
        var body = '', lastG = null, kcount = {}, lastHead = null;
        idxs.forEach(function (i) {
          var r = rs[i] || {}, a = al[i] || [], d = rs[i] && tb.derived ? tb.derived(rs[i], i, rs, H(), t) : heads.map(function () { return ''; }), trc = '';
          if (tb.groupHead && rs[i]) { var gh = tb.groupHead(rs[i], i, rs); if (gh && gh !== lastHead) { body += '<tr class="grphead"><th colspan="' + cols + '">' + esc(t(gh)) + '</th></tr>'; lastHead = gh; } }
          if (tb.group && rs[i]) {
            var g = tb.group(rs[i], i, rs), first = g.id !== lastG; if (first) { kcount[g.kind] = (kcount[g.kind] || 0) + 1; lastG = g.id; }
            trc = ' class="g-' + g.kind + ' ga' + (kcount[g.kind] % 2) + (first ? ' gfirst' : '') + (first && kcount[g.kind] === 1 ? ' kfirst' : '') + '"';
          }
          // sous-ligne facultative de l'onglet (ex. : question « Même joueur ? » de l'onglet Choix) ; sans case .cell : Entrée et le collage la sautent
          var after = tb.rowAfter && rs[i] ? tb.rowAfter(rs[i], i, DATA, t, esc, cols) : '';
          if (after) trc = trc ? trc.replace('class="', 'class="has-homo ') : ' class="has-homo"';
          body += '<tr data-row="' + i + '"' + trc + '>' + tb.schema.map(function (def) { return cellHTML(tb, def, r, i, a); }).join('') + d.map(function (x, k) { return dcell(x, k, tb); }).join('') +
            '<td class="al" title="' + esc(alertsText(a)) + '">' + (a.length ? '<span class="badge' + (a.some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '">' + a.length + '</span>' : '') + '</td><td>' + ((tb.mode === 'log' && rs[i]) || (tb.mode === 'fixed' && r._edited && !tb.noReset) ? '<button class="x" data-rm="' + i + '" title="' + esc(t('ev.remove')) + '" aria-label="' + esc(t('ev.remove')) + '">×</button>' : '') + '</td></tr>';
          if (after) body += after;
        });
        return '<div class="scroll' + (idxs.length > 16 ? ' vs' : '') + '"><table class="grid ev ' + (tb.tableClass || '') + '" id="' + id + '"><thead>' + headHTML + '</thead><tbody>' + body + '</tbody></table></div>';
      }
      var all = []; for (var i = 0; i < n; i++) { total += (al[i] || []).length; if (!vis || vis.indexOf(i) >= 0) all.push(i); }
      if (!tb.panels || tb.mode === 'log') return { html: tableOf(all, 'grid'), alerts: total };
      // panneaux côte à côte (alignement : trios | paires, gardiens | surnuméraires ; cotes : attaquants | défenseurs et gardiens)
      var panels = tb.panels(rs, H()).map(function (p) { return { id: p.id, key: p.key, idx: p.idx.filter(function (i) { return all.indexOf(i) >= 0; }) }; }).filter(function (p) { return p.idx.length; });
      return { html: '<div class="panels ' + (tb.tableClass || '') + '">' + panels.map(function (p, k) { return '<section class="panel p-' + p.id + '"><h4>' + esc(t(p.key)) + '</h4>' + tableOf(p.idx, k ? 'grid-' + p.id : 'grid') + '</section>'; }).join('') + '</div>', alerts: total };
    }
    function baseHTML(tb) {
      if (tb.mode !== 'log' || !tb.baseView) return '';
      var bv = tb.baseView(seasonOf(tb), H(), t, tn, DATA), head = bv.head;
      return '<details class="base"><summary>' + esc(t('ev.already')) + ' · ' + bv.rows.length + '</summary><div class="scroll"><table><thead><tr>' + head.map(function (h) { return '<th>' + esc(t(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        bv.rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
    }

    function sortNames(list) { return list.sort(function (a, b) { return a.localeCompare(b, state.lang); }); }
    function teamOptions(tb) {
      var present = {}; rows(tb).forEach(function (r) { if (r.opp) present[r.opp] = 1; });
      return sortNames(DATA.teams.filter(function (tm) { return tm.code !== DATA.franchise.code && (tm.active || present[tm.code]); }).map(function (tm) { return tn(tm.en); })).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
    }
    function listsHTML(tb) {
      var h = '';
      if (tb.lists) { var L = tb.lists(H(), DATA, state.lang); Object.keys(L).forEach(function (k) { h += '<datalist id="pl_' + k + '">' + L[k].map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>'; }); }
      if (tb.schema.some(function (d) { return d[2] === 'teamlist'; })) h += '<datalist id="tlist">' + teamOptions(tb) + '</datalist>';
      if (PC && tb.playerGroup) { var all = plist().sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); }); h += PC.legendHTML(false, esc, t); ['F', 'D', 'G'].forEach(function (g) { h += PC.datalistHTML('dl-pc-' + g, all.filter(function (p) { return p.g === g; }), esc, t); }); h += PC.datalistHTML('dl-pc-all', all, esc, t); }
      return h;
    }
    function toolbarHTML(tb) {
      if (tb.suggest) return '<div class="toolbar"><label class="fld sm">' + esc(t('pre.step')) + '<input id="step" type="number" min="1" max="14" value="' + state.step + '"></label><span class="muted">' + esc(fmt('pre.window', [tb.window ? tb.window(seasonOf(tb))[0] : '', tb.window ? tb.window(seasonOf(tb))[1] : ''])) + '</span></div>';
      if (!tb.search) return '';
      var f = filterOf(tb);
      return '<div class="toolbar"><label class="fld sm">' + esc(t('pre.search')) + '<input id="flt-q" value="' + esc(f.q) + '" autocomplete="off"></label><button type="button" class="btn small' + (f.missing ? ' on' : '') + '" data-act="flt-missing" aria-pressed="' + !!f.missing + '">' + esc(t('pre.only_missing')) + '</button></div>';
    }
    function summaryHTML(tb) {
      if (!tb.summary) return '';
      var s = tb.summary(rows(tb), H(), DATA); if (!s) return '';
      var pct = s.total ? Math.round(100 * s.done / s.total) : 0;
      return '<div class="summary"><span class="' + (s.done === s.total ? 'ok' : '') + '"><b>' + s.done + ' / ' + s.total + '</b> ' + esc(t(s.key)) + '</span><div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div></div>';
    }
    // ---- importation d'un calendrier (Excel ou CSV) ----
    var ISSUE = { range: 'imp.issue_range', date: 'imp.issue_date', opp: 'imp.issue_opp', self: 'imp.issue_self', order: 'imp.issue_order', dup: 'imp.issue_dup' };
    function importHTML(tb) {
      var im = state.imp; if (!im || im.tb !== tb.k) return '';
      var r = im.res, h = '<section class="imp-box" aria-live="polite"><h4>' + esc(t('imp.title')) + ' · ' + esc(im.file) + '</h4>';
      if (!r.ok) return h + '<p class="bad">' + esc(t('imp.no_columns')) + '</p><div class="acts left"><button class="btn ghost" data-act="imp-cancel">' + esc(t('imp.cancel')) + '</button></div></section>';
      var okN = r.count - r.bad, exp = r.expected;
      h += '<p>' + esc(fmt('imp.summary', [r.count, sl(im.season), exp, okN])) + '</p>';
      if (r.count !== exp) h += '<p class="warn">' + esc(fmt('imp.count_mismatch', [r.count, exp])) + '</p>';
      h += '<p class="muted">' + esc(fmt('imp.replace_note', [sl(im.season)])) + '</p>';
      h += '<table class="imp-prev"><thead><tr><th>' + esc(t('col.game')) + '</th><th>' + esc(t('col.date')) + '</th><th>' + esc(t('col.opponent')) + '</th><th></th></tr></thead><tbody>' +
        r.rows.slice(0, 6).map(function (x) { return '<tr' + (x.issues.length ? ' class="bad"' : '') + '><td>' + x.n + '</td><td>' + esc(x.date || String(x.rawDate)) + '</td><td>' + (x.opp ? logoHTML(x.opp) + ' ' + esc(tn(x.opp)) : esc(String(x.rawOpp))) + '</td><td>' + x.issues.map(function (k) { return esc(t(ISSUE[k])); }).join(', ') + '</td></tr>'; }).join('') + (r.count > 6 ? '<tr><td colspan="4" class="muted">… ' + (r.count - 6) + '</td></tr>' : '') + '</tbody></table>';
      var bad = r.rows.filter(function (x) { return x.issues.length; });
      if (bad.length) h += '<p class="warn">' + esc(t('imp.issues')) + ' ' + bad.slice(0, 8).map(function (x) { return '#' + x.n + ' (' + x.issues.map(function (k) { return t(ISSUE[k]); }).join(', ') + ')'; }).join(' · ') + (bad.length > 8 ? ' …' : '') + '</p>';
      return h + '<div class="acts left"><button class="btn" data-act="imp-apply">' + esc(fmt('imp.apply', [sl(im.season)])) + '</button><button class="btn ghost" data-act="imp-cancel">' + esc(t('imp.cancel')) + '</button></div></section>';
    }
    function stageImport(matrix, fileName) {
      var tb = tab(); if (!tb.import) return null;
      var res = IMP.mapSchedule(matrix, { teams: DATA.teams, games: tb.rowCount ? tb.rowCount(DATA) : null, season: seasonOf(tb), myCode: DATA.franchise.code, window: tb.window ? tb.window(seasonOf(tb)) : null, order: state.lang === 'fr' ? 'dmy' : 'mdy' });
      state.imp = { tb: tb.k, season: seasonOf(tb), file: fileName || '', res: res }; return state.imp;
    }
    function stageImportError(fileName, msg) { var tb = tab(); state.imp = { tb: tb.k, season: seasonOf(tb), file: fileName || '', res: { ok: false, rows: [] }, error: msg }; }
    // Remplace tout le calendrier de la saison choisie : lignes du fichier d'abord, puis lignes vidées
    function applyImport() {
      var im = state.imp; if (!im || !im.res.ok) return 0; var tb = tab(), sk = String(seasonOf(tb)), max = rows(tb).length, n = 0, byN = {};
      im.res.rows.forEach(function (x) { if (x.n >= 1 && x.n <= max) byN[x.n] = x; });
      entries[tb.k][sk] = {};
      for (var g = 1; g <= max; g++) { var x = byN[g]; entries[tb.k][sk][g - 1] = x ? { date: x.date || String(x.rawDate == null ? '' : x.rawDate), opp: x.opp || '', otext: x.opp ? '' : String(x.rawOpp == null ? '' : x.rawOpp) } : { date: '', opp: '', otext: '' }; if (x) n++; }
      persist(); state.imp = null; return n;
    }
    function cancelImport() { state.imp = null; }
    function setStep(v) { var n = parseInt(v, 10); state.step = n >= 1 && n <= 14 ? n : 2; }
    function setFilter(k, v) { var tb = tab(), f = filterOf(tb); if (k === 'q') f.q = String(v || ''); else if (k === 'missing') f.missing = !f.missing; }

    function teamText(code) { var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? tn(tm.en) : code; }
    function teamsListHTML() { return TC.datalist('dl-teams', DATA.teams.filter(function (x) { return x.active !== 0; }), function (x) { return tn(x.en); }, esc); }
    function datalistsHTML(tb) {
      if (!tb.datalists) return '';
      var dl = tb.datalists(DATA); return Object.keys(dl).map(function (k) { return '<datalist id="dl-' + esc(k) + '">' + dl[k].map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>'; }).join('');
    }
    // Aide en contexte (connect/ft_help.js) : configuration dans CFG.help (écran) et tb.help (listes complètes de clés par onglet).
    // Un onglet sans tb.help n'affiche que le rappel (les notes de tête et les définitions ont été remplacées par l'aide le 2026-11-16). Maquette validée : docs/maquettes/aide_debut_saison.html.
    function hasHelp(tb) { return !!(CFG.help && tb.help); }
    function hintText(tb) { return esc(t(tb.hintKey || 'ev.hint')) + (tb.hintKey ? ' · ' + esc(t('ui.undo_hint')) : ''); }
    function helpHTML(tb) {
      var C = CFG.help, h = tb.help, FH = root.FTHELP || (typeof require !== 'undefined' ? require('../connect/ft_help.js') : null);
      var part = function (k, o) { var a = h[k]; return a && a.length ? [{ h: C.h[k], items: a, ordered: !!o.ordered, lead: !!o.lead }] : null; };
      var tt = h.note && h.noteParams ? function (k) { return k === h.note ? fmt(k, h.noteParams(DATA)) : t(k); } : t;   // remarque chiffrée (taille de la ligue)
      return FH.html({
        screen: C.screen, prefix: C.prefix, t: tt, esc: esc, defaults: { open: false, common: false },
        summary: hintText(tb), chip: t(tb.lbl),
        top: h.where && h.where.length ? { h: C.h.where, items: h.where, lead: true } : null,
        note: h.note || null,
        cols: [part('order', { ordered: true }), part('errors', { lead: true }), part('alerts', { lead: true })].filter(Boolean),
        common: h.common === false ? [] : (C.common || [])
      });
    }
    function view() {
      var tb = tab(), g = gridHTML(tb), sv = seasonOf(tb), list = tb.seasons ? tb.seasons(DATA) : [];
      var opts = list.map(function (y) { return '<option value="' + y + '"' + (y === sv ? ' selected' : '') + '>' + esc(tb.seasonKind === 'year' ? y : sl(y)) + '</option>'; }).join('');
      var plist = DATA.players.map(function (p) { return '<option value="' + esc(plLabel(p)) + '"></option>'; }).join(''), klist = DATA.players.map(function (p) { return '<option value="' + esc(p.key) + '"></option>'; }).join('');
      var tabs = CFG.tabs.map(function (x) { return '<button data-tab="' + x.k + '" aria-pressed="' + (state.tab === x.k) + '">' + esc(t(x.lbl)) + '</button>'; }).join('');
      var nav = CFG.nav.map(function (n) { return '<a class="navlink" href="' + n[0] + '">' + esc(t(n[1])) + '</a>'; }).join('');
      var nAuto = tb.mode === 'fixed' ? rows(tb).filter(function (r) { return r.auto; }).length : 0;
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t(CFG.titleKey)) + '</div></div></div>' +
        '<div class="ctl">' + nav + '<div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>' +
        '<main class="entry">' + FTP.panel(t, esc, sync) + '<section class="pick">' + (typeof window !== 'undefined' && window.FT_PAGE ? '' : '<div class="seg tabs" role="group">' + tabs + '</div>') + (list.length ? '<label>' + esc(t(tb.seasonKind === 'year' ? 'col.draft_year' : 'ui.season')) + '<select id="sn">' + opts + '</select></label>' : '') +
        '<div class="acts"><button class="btn" data-act="csv">' + esc(t('entry.export_csv')) + '</button>' + (tb.import ? '<button class="btn" data-act="import">' + esc(t('imp.button')) + '</button><input type="file" id="impfile" accept=".csv,.txt,.xlsx" hidden>' : '') +
        '<button class="btn" data-act="json">' + esc(t('entry.export_json')) + '</button><button class="btn ghost" data-act="reset">' + esc(t('entry.reset')) + '</button></div><datalist id="plist">' + plist + '</datalist><datalist id="klist">' + klist + '</datalist>' + listsHTML(tb) + '</section>' +
        '<section class="card wide">' + (nAuto ? '<p class="note auto-note"><span class="autodot"></span>' + esc(fmt(tb.autoNoteKey || 'pre.auto_note', [nAuto])) + '</p>' : '') + baseHTML(tb) + importHTML(tb) + summaryHTML(tb) + toolbarHTML(tb) + (hasHelp(tb) ? helpHTML(tb) : '<p class="note muted">' + hintText(tb) + '</p>') + (tb.banner ? tb.banner(rows(tb), H(), t, DATA) : '') + g.html + datalistsHTML(tb) + teamsListHTML() + (tb.footer ? tb.footer(rows(tb), H(), t, DATA) : '') +
        '<p class="note muted">' + esc(t('entry.local_note')) + '</p></section></main>';   // saisies en attente et alertes : barre d'état du moteur commun
    }

    // ---- synchronisation avec Supabase ----
    var sync = { user: null, busy: false, msg: '', level: '' }, lk = null;
    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    function reindex() { byName = {}; byId = {}; DATA.players.forEach(function (p) { byName[p.name.toLowerCase()] = p; byId[p.id] = p; }); }
    async function lookups(client) {
      if (lk) return lk; lk = { teamId: {}, teamCode: {}, awardId: {}, awardCode: {} };
      (await client.select('team', 'select=id,code')).forEach(function (x) { lk.teamId[x.code] = x.id; lk.teamCode[x.id] = x.code; });
      (await client.select('award', 'select=id,code')).forEach(function (x) { lk.awardId[x.code] = x.id; lk.awardCode[x.id] = x.code; }); return lk;
    }
    async function refreshPlayers(client) {
      var pl = await client.select('player', 'select=id,legacy_key,full_name,position_group&origin=eq.franchise&order=full_name'); DATA.players.splice(0, DATA.players.length);
      pl.forEach(function (p) { DATA.players.push({ id: p.id, name: p.full_name, pos: p.position_group, key: p.legacy_key }); }); reindex();   // key : pour retrouver un nom tapé
    }
    // Toutes les opérations d'un envoi passent dans un seul appel transactionnel (ft_apply_batch) : tout est écrit, ou rien.
    // Seule exception : « custom » (choix au repêchage), qui appelle elle-même sa propre fonction transactionnelle.
    function batchOps(plan) {
      return plan.filter(function (o) { return o.op !== 'custom' && !((o.op === 'upsert' || o.op === 'insert') && !o.rows.length); }).map(function (o) {
        var x = { op: o.op, table: o.table }; if (o.conflict && (o.op === 'upsert' || o.op === 'upsertset')) x.conflict = o.conflict;
        if (o.match) x.match = o.match; if (o.rows) x.rows = o.rows; return x;
      });
    }
    async function runPlan(client, plan, fid) {
      var ops = batchOps(plan); if (ops.length) await client.rpc('ft_apply_batch', { p_franchise_id: fid, p_ops: ops });
      for (var i = 0; i < plan.length; i++) if (plan[i].op === 'custom') await plan[i].run(client);
    }
    function ctxFor(fid, season) { return { fid: fid, lk: lk, DATA: DATA, season: season }; }
    async function doLogin(client, email, pw) {
      sync.busy = true; try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } sync.busy = false; return !!sync.user;
    }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; }
    async function doPull(client, quiet) {
      sync.busy = true;
      try { var tb = tab(), s = seasonOf(tb); await lookups(client); await refreshPlayers(client); var n = await tb.pull(client, s, ctxFor(null, s)); if (!quiet) say('ok', 'sb.pulled', [n]); }
      catch (e) { say('bad', 'sb.failed', [e.message]); }
      sync.busy = false;
    }
    async function doPush(client) {
      sync.busy = true;
      try {
        var tb = tab(), s = seasonOf(tb), fid = await client.ensureFranchise();
        if (fid == null) { say('bad', 'sb.no_franchise'); sync.busy = false; return false; }
        var rs = exportRows(tb); if (!rs.length) { say('warn', 'sb.nothing'); sync.busy = false; return false; }
        var errs = alertsOf(tb).reduce(function (n, a) { return n + a.filter(function (x) { return x.level === 'err'; }).length; }, 0);
        if (errs) { say('bad', 'sb.errors_block'); sync.busy = false; return false; }
        await lookups(client); await refreshPlayers(client);
        var plan = tb.plan(rs, s, ctxFor(fid, s)); await runPlan(client, plan, fid);
        delete entries[tb.k][String(s)]; persist(); var n = await tb.pull(client, s, ctxFor(fid, s)); say('ok', 'sb.pushed', [rs.length]); sync.busy = false; return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); sync.busy = false; return false; }
    }

    // ---- exports : seules les lignes modifiées (ou toute la saison pour les tableaux « ensemble ») ----
    function exportRows(tb) {
      var rs = rows(tb); if (tb.mode === 'log') return rs;
      var any = rs.some(function (r) { return r._edited || r.auto; });
      return tb.exportAll ? (any ? rs : []) : rs.filter(function (r) { return r._edited; });
    }
    function csvRows() { var tb = tab(); return tb.csv(exportRows(tb), seasonOf(tb), H()); }
    function jsonExport() {
      var out = { version: 1, screens: CFG.storeKey, tabs: {} };
      CFG.tabs.forEach(function (tb) { var rs = []; Object.keys(entries[tb.k]).forEach(function (sk) { var saved = state.season[tb.k], keep = Object.assign({}, state.season), tabK = state.tab; state.tab = tb.k; state.season[tb.k] = +sk; var x = exportRows(tb).map(function (r) { return Object.assign({ season: +sk }, r); }); state.tab = tabK; state.season = keep; if (x.length) rs = rs.concat(x); });
        if (rs.length) out.tabs[tb.k] = rs; });
      return JSON.stringify(out, null, 1);
    }
    // réponse à « Même joueur ? » (tb.homoCands) : yes → { yes: id } ; no → { no: [ids] } ; undo → effacée
    function homoAnswer(ri, kind, id) {
      var tb = tab(), sk = String(seasonOf(tb)); if (!tb.homoCands) return false;
      var r = rows(tb)[ri]; if (!r) return false; var cands = tb.homoCands(r, DATA), v = kind === 'yes' ? { yes: id } : kind === 'no' ? { no: cands.map(function (c) { return c.id; }) } : null;
      if (tb.mode === 'log') { var L = entries[tb.k][sk] = entries[tb.k][sk] || []; if (!L[ri]) return false; L[ri].homo = v; }
      else { entries[tb.k][sk] = entries[tb.k][sk] || {}; entries[tb.k][sk][ri] = Object.assign(entries[tb.k][sk][ri] || {}, { homo: v }); }
      persist(); return true;
    }
    return { homoAnswer: homoAnswer, setStep: setStep, getStep: function () { return state.step; }, stageImport: stageImport, stageImportError: stageImportError, applyImport: applyImport, cancelImport: cancelImport, importState: function () { return state.imp; }, setFilter: setFilter, visibleIdx: function () { return visibleIdx(tab()); }, lists: function () { var tb = tab(); return tb.lists ? tb.lists(H(), DATA, state.lang) : {}; }, sync: sync, doLogin: doLogin, doLogout: doLogout, doPull: doPull, doPush: doPush, state: state, view: view, t: t, tab: tab, rows: function () { return rows(tab()); }, setCell: setCell, removeRow: removeRow, reset: reset, applyPaste: applyPaste, alerts: function () { return alertsOf(tab()); },
             csvRows: csvRows, jsonExport: jsonExport, countEntries: countEntries, isNA: isNA, refusal: refusal, rowLabel: rowLabel, colLabel: colLabel, alertCount: alertCount, storageOk: function () { return !storeErr; }, ctx: function () { return state.tab + '|' + seasonOf(tab()); }, snapshot: snapshot, restore: restore, pasteCols: pasteCols, derived: function (i) { var tb = tab(), rs = rows(tb); return tb.derived ? tb.derived(rs[i], i, rs, H(), t) : []; }, alertsText: alertsText, seasonOf: function () { return seasonOf(tab()); }, entries: function () { return entries; } };
  }

  // ---- montage dans la page ----
  function mount(DATA, CFG) {
    var ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeGridApp(d, CFG, st || ls); }, assemble: CFG.assemble || FTLIVE.assembleSeason });
    var app = new Proxy({}, { get: function (_, k) { var a = host.app(); return a ? a[k] : undefined; } });
    if (CFG.help && root.FTHELP) FTHELP.bind(rootEl);   // aide en contexte : ouvrir/fermer sans redessiner la page
    function draw(focus) { host.draw(focus ? '.cell[data-r="' + focus[0] + '"][data-c="' + focus[1] + '"]' : null); }
    // la largeur des champs ne change pas : si un nom (ou un nom d'équipe) est trop long, la police rapetisse jusqu'à ce qu'il soit entièrement visible
    var fitCanvas = (function () { try { return document.createElement('canvas').getContext('2d'); } catch (e) { return null; } })();
    function fitOne(el) {
      if (!fitCanvas) return;
      var cs = window.getComputedStyle(el), base = parseFloat(el.dataset.fs || cs.fontSize); el.dataset.fs = base;
      var txt = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : el.value, avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.tagName === 'SELECT' ? 24 : 6), size = base;
      if (avail > 0) while (size > 8) { fitCanvas.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + size + 'px ' + cs.fontFamily; if (fitCanvas.measureText(txt).width <= avail) break; size -= 0.5; }
      el.style.fontSize = size === base ? '' : size + 'px';
    }
    var FITSEL = '.lineup input.cell, .lineup select.cell, table.retire input.cell[data-c="name"], table.retire input.cell[data-c="team"]', fitT = null;
    function fitAll() { [].forEach.call(rootEl.querySelectorAll(FITSEL), fitOne); }
    // barre de défilement horizontale en haut des grandes tables (retraites), synchronisée avec celle du bas
    function topScrollAll() {
      [].forEach.call(rootEl.querySelectorAll('.scroll'), function (sc) {
        var tbl = sc.querySelector('table.retire'); if (!tbl) return;
        var top = sc.previousElementSibling && sc.previousElementSibling.classList.contains('topscroll') ? sc.previousElementSibling : null;
        if (!top) { top = document.createElement('div'); top.className = 'topscroll'; top.innerHTML = '<div></div>'; sc.parentNode.insertBefore(top, sc); top.addEventListener('scroll', function () { if (sc.scrollLeft !== top.scrollLeft) sc.scrollLeft = top.scrollLeft; }); sc.addEventListener('scroll', function () { if (top.scrollLeft !== sc.scrollLeft) top.scrollLeft = sc.scrollLeft; }); }
        top.firstChild.style.width = tbl.scrollWidth + 'px'; top.style.display = tbl.scrollWidth > sc.clientWidth + 2 ? '' : 'none';
      });
    }
    if (typeof MutationObserver !== 'undefined') new MutationObserver(function () { clearTimeout(fitT); fitT = setTimeout(function () { fitAll(); topScrollAll(); }, 0); }).observe(rootEl, { childList: true, subtree: true });
    rootEl.addEventListener('input', function (e) { if (e.target.matches && e.target.matches(FITSEL)) fitOne(e.target); });
    function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    async function readImport(file) {
      var name = file.name || '';
      try {
        var matrix;
        if (/\.xlsx$/i.test(name)) matrix = await FTIMP.readXlsx(await file.arrayBuffer());
        else if (/\.xls$/i.test(name)) { app.stageImportError(name, 'xls'); return; }
        else matrix = FTIMP.parseCSV(await file.text());
        app.stageImport(matrix, name);
      } catch (err) { app.stageImportError(name, String(err && err.message || err)); }
    }
    rootEl.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'sn') { app.state.season[app.state.tab] = +el.value; draw(); }
      else if (el.id === 'flt-q') { app.setFilter('q', el.value); draw(); }
      else if (el.id === 'step') { app.setStep(el.value); draw(); }
      else if (el.id === 'impfile' && el.files && el.files[0]) { readImport(el.files[0]).then(function () { el.value = ''; draw(); }); }
    });
    // clavier, collage, focus, Ctrl+Z et avertissement avant de quitter : moteur commun (connect/grid_input.js)
    var gi = FTGI.attach({ rootEl: rootEl, host: host, adapter: {
      write: function (r, c, raw) { return app.setCell(r, c, raw) || app.refusal(c, raw); },
      t: function (k, sh) { return app.t(k, sh); },
      alerts: function () { return app.alertCount(); },
      storageOk: function () { return app.storageOk(); },
      ctx: function () { return app.ctx(); },
      rowName: function (r) { return app.rowLabel(r); },
      colName: function (c) { return app.colLabel(c); },
      rows: function (c) { var l = app.visibleIdx(); return c == null ? l : l.filter(function (r) { return !app.isNA(r, c); }); },   // Entrée et ↑/↓ sautent les cases en lecture seule de la colonne
      grow: function () { return app.tab().mode === 'log'; },
      cols: function () { return app.pasteCols(); },
      na: function (r, c) { return app.isNA(r, c); },
      snapshot: function () { return app.snapshot(); }, restore: function (s) { app.restore(s); },
      pending: function () { return app.countEntries(); }
    } });
    if (root.FTHOMO) root.FTHOMO.bindKeys(rootEl);   // Alt+↓ / Échap entre la ligne et la question « Même joueur ? »
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.homo) {   // « Même joueur ? » : Non → focus sur la date de naissance ; Oui ou Changer → sur l'encadré
        var hri = +String(b.dataset.ref).replace(/^\D+-/, ''), hk = b.dataset.homo; gi.edit(function () { app.homoAnswer(hri, hk, +b.dataset.id); });
        host.draw(hk === 'no' ? '.cell[data-r="' + hri + '"][data-c="birth"]' : '#homo-' + b.dataset.ref + ' button'); return;
      }
      if (b.dataset.act === 'pcb-accept') { gi.edit(function () { app.setCell(+b.dataset.r, b.dataset.c, b.dataset.name); }); draw([+b.dataset.r, b.dataset.c]); return; }   // « Lier à … »
      if (b.dataset.lang) app.state.lang = b.dataset.lang; else if (b.dataset.tab) app.state.tab = b.dataset.tab; else if (b.dataset.rm) { gi.edit(function () { app.removeRow(+b.dataset.rm); }); }
      else if (b.dataset.act === 'csv') { download(CFG.storeKey + '_' + app.state.tab + '.csv', app.csvRows(), 'text/csv'); return; }
      else if (b.dataset.act === 'json') { download(CFG.storeKey + '.json', app.jsonExport(), 'application/json'); return; }
      else if (b.dataset.act === 'import') { var fi = rootEl.querySelector('#impfile'); if (fi) fi.click(); return; }
      else if (b.dataset.act === 'imp-apply') { app.applyImport(); }
      else if (b.dataset.act === 'imp-cancel') { app.cancelImport(); }
      else if (b.dataset.act === 'flt-missing') { app.setFilter('missing'); }
      else if (b.dataset.act === 'reset') { if (window.confirm(app.t('entry.confirm_reset'))) app.reset(); else return; } else return;
      draw();
    });
    host.start();
  }
  var api = { makeGridApp: makeGridApp, mount: mount, esc: esc, logoURL: logoURL, logoHTML: logoHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTG = api;
})(typeof window !== 'undefined' ? window : this);

;/* Configuration des écrans « Début de saison » et « Saison morte » pour le moteur de grilles. */
(function (root) {
  var S = root.FTS || (typeof require !== 'undefined' ? require('./season_core.js') : null);
  var FTC = root.FTC || (typeof require !== 'undefined' ? require('./countries.js') : null);
  var HO = root.FTHOMO || (typeof require !== 'undefined' ? require('../connect/homonym_ui.js') : null);   // joueurs homonymes (migration 71)
  var FTLOGOS = root.FTLOGOS || (function () { try { return typeof require !== 'undefined' ? require('./logos.js') : null; } catch (e) { return null; } })() || { div: {}, conf: {}, po: {} };
  var FTTROPHY = root.FTTROPHY || (function () { try { return typeof require !== 'undefined' ? require('./trophy_images.js') : {}; } catch (e) { return {}; } })();
  var POSOPT = ['C', 'LW', 'RW', 'LD', 'RD', 'G'].map(function (p) { return [p, 'pc.' + p]; });
  function pcode(t, c) { var k = 'pc.' + c, v = t ? t(k) : k; return v === k ? c : v; }   // code de poste affiché dans la langue (en français : A, AD, AG, DG, DD)
  var YN = [['yes', 'claimed.yes'], ['no', 'claimed.no']];
  // calcul et format communs du SV% (connect/ft_stats.js, chargé avant ce fichier dans les pages)
  var FSTAT = root.FTSTATS || (typeof require !== 'undefined' ? require('../connect/ft_stats.js') : null);
  var GK_CAREER = {};   // clé du joueur → [PJ en base, Σ arrêts, Σ tirs] (DATA.base.gk_career), rempli par retire.fixed
  // SV% de carrière d'une ligne de retraite : calculé si les saisons en base couvrent la carrière, sinon la valeur saisie
  function retireSv(r) {
    var c = r.pos === 'G' && r.name ? GK_CAREER[S.retireKey(r.pos, r.name)] : null;
    return FSTAT.careerSvPct(c ? [{ gp: c[0], saves: c[1], shots_against: c[2] }] : [], r.gp, r.svp);
  }
  function q(v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csv(head, lines) { return [head].concat(lines.map(function (l) { return l.map(q).join(','); })).join('\r\n') + '\r\n'; }
  function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
  function seasonRange(DATA) { var l = []; for (var y = DATA.franchise.first; y <= DATA.franchise.current + 1; y++) l.push(y); return l; }
  function draftRange(DATA) { var l = []; for (var y = DATA.franchise.first + 1; y <= DATA.franchise.current + 2; y++) l.push(y); return l; }
  var nowSeason = function (D) { return D.franchise.current + 1; }, lastSeason = function (D) { return D.franchise.current; };

  // ---- aides de contexte (calculées à la demande) ----
  function helpers(DATA, c) {
    var posOf = {}; DATA.players.forEach(function (p) { posOf[p.id] = p.pos; });
    var y = c.season, ent = c.entries || {};
    function merged(tab, year, fn) { return fn; }
    // date de référence « sous contrat » : le 15 octobre de la saison, ou la date du premier match si elle est plus tôt (décision du 2026-11-16)
    function refDate() {
      var d = y + '-10-15', g = ((DATA.base || {}).schedule || {})[String(y)] || [];
      var first = g.filter(function (x) { return x && x[0] === 1 && x[1]; })[0];
      return first && first[1] < d ? first[1] : d;
    }
    return {
      homo: DATA.homo || [], myCode: DATA.franchise.code, season: y, lang: c.lang, franchiseFirst: DATA.franchise.first, franchiseCurrent: DATA.franchise.current,
      standings: (DATA.standings || {})[String(y)] || [], poStats: (DATA.po_stats || {})[String(y)] || null,
      teamLabel: function (code) { var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? (c.lang === 'fr' && tm.fr ? tm.fr : tm.en) : (code || '—'); },
      teamName: function (code) { var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? tm.en : code; },
      cupChampionName: (function () { var ov = ((ent.cup || {})[String(y)] || {})[0], code = ov && ov.champion ? ov.champion : (DATA.base.cup || {})[String(y)]; var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? tm.en : null; })(),
      cupChampionLabel: (function () { var ov = ((ent.cup || {})[String(y)] || {})[0], code = ov && ov.champion ? ov.champion : (DATA.base.cup || {})[String(y)]; var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; return tm ? (c.lang === 'fr' && tm.fr ? tm.fr : tm.en) : null; })(),   // nom affiché dans les messages (langue de l'écran)
      posOf: function (pid) { return posOf[pid]; },
      covered: function (pid) { var d = refDate(); return DATA.contracts.some(function (k) { return k[0] === pid && k[1] <= d && k[2] >= d; }); },
      prevOa: function (pid) { var b = DATA.base.ratings[String(y - 1)]; return b ? b[pid] : null; },
      logo: function (code) { var G = root.FTG || (typeof require !== 'undefined' ? require('./grid_engine.js') : null); return G && G.logoHTML ? G.logoHTML(code) : ''; },
      prevRef: function (pid) { var e = (DATA.base.oa_end || {})[String(y - 1)], b = DATA.base.ratings[String(y - 1)]; return e && e[pid] != null ? e[pid] : (b && b[pid] != null ? b[pid] : null); },   // cote de fin de la saison précédente, sinon sa cote de début
      games: DATA.franchise.games || 82,
      prevCap: function () { var p = DATA.cap.filter(function (x) { return x[0] === y - 1; })[0]; return p ? p[1] : null; },
      // taille de la ligue : 16 équipes aux séries ; loterie de 15 équipes (ligue de 31 équipes ou moins) ou de 16 (32 ou plus) ; 7 rondes de repêchage
      leagueSize: (DATA.league && DATA.league.size) || 32,
      lotterySize: ((DATA.league && DATA.league.size) || 32) >= 32 ? 16 : 15,
      draftSize: 7 * ((DATA.league && DATA.league.size) || 32),
      draftRank: function (code) { var r = DATA.ranks[String(y - 1)]; return r && r[code] != null ? r[code] : null; },
      season: y,
      // classement : fiche Équipe de la saison (Saisie > Équipe, saison régulière), association et division d'une équipe, appartenance à la ligue cette saison
      ownRecord: function () { var r = (DATA.team_rs || {})[String(y)]; return r && r[1] != null && r[2] != null ? { gp: r[0], w: r[1], l: r[2], otl: r[3] } : null; },
      confDiv: function (code) { var s = ((DATA.standings || {})[String(y)] || []).filter(function (t) { return t[0] === code; })[0]; if (s && s[3]) return [s[3], s[4]]; var x = ((DATA.league || {}).teams || []).filter(function (t) { return t[0] === code; })[0]; return x && x[1] ? [x[1], x[2]] : null; },   // saison passée : l'association et la division enregistrées avec elle ; sinon celles de la ligue
      leagueOk: function (code) { var L = ((DATA.league || {}).teams || []); if (!L.length) return DATA.teams.some(function (t) { return t.code === code && t.active !== 0; }); return L.some(function (t) { return t[0] === code && (t[3] == null || t[3] <= y) && (t[4] == null || t[4] >= y); }); },
      // gagnant de la finale d'après les résultats de l'onglet Séries (saisies non envoyées comprises) ; vide tant que la finale n'est pas terminée
      seriesWinner: function () {
        var sk = String(y), ov = (ent.series || {})[sk] || {}, b = (DATA.base.series || {})[sk] || [];
        var pairs = S.SERIES_ORDER.map(function (o, i) { var x = ov[i] || {}, w = b[i] || []; return [x.wa !== undefined ? x.wa : (w[0] == null ? '' : w[0]), x.wb !== undefined ? x.wb : (w[1] == null ? '' : w[1])]; });
        var br = S.computeBracket((DATA.standings || {})[sk] || [], pairs); return br[14].winner ? br[14].winner[0] : '';
      },
      at: function (yy) { return helpers(DATA, Object.assign({}, c, { season: yy })); },           // mêmes aides pour une autre année (vues qui couvrent toutes les années)
      rankTeam: function (rank) { return rankTeamAt(DATA, y, rank); },                           // équipe qui a ce rang avant la loterie (classement de la saison précédente)
      draftYears: draftRange(DATA),
      // équipe qui détient réellement le choix : celle saisie, sinon l'équipe du rang tiré, sinon la valeur déjà enregistrée
      lotteryOwner: function (pick) {
        var sk = String(y), ov = ((ent.lottery || {})[sk] || {})[pick - 1], b = (DATA.base.lottery[sk] || []).filter(function (l) { return l[0] === pick; })[0];
        var pre = ov && ov.pre !== undefined ? ov.pre : (b ? b[1] : null), baseOwner = b && b[2] && b[2] !== rankTeamAt(DATA, y, b[1]) ? b[2] : '';
        var owner = ov && ov.owner !== undefined ? ov.owner : baseOwner;
        return owner || (filled(pre) ? rankTeamAt(DATA, y, +pre) : null) || (b && !ov ? b[2] : null);
      },
      teamOk: function (code) { return DATA.teams.some(function (t) { return t.code === code; }); },
      statsOf: function (key) { var p = DATA.players.filter(function (x) { return x.key === key; })[0]; return p ? DATA.stats[p.id + '|' + y] : null; },
      poResult: function () { return DATA.po[String(y)] || null; },
      playersUnderContract: function () { var d = refDate(); var ids = {}; DATA.contracts.forEach(function (k) { if (k[1] <= d && k[2] >= d) ids[k[0]] = 1; }); return DATA.players.filter(function (p) { return ids[p.id]; }); }
    };
  }

  // ======================= DÉBUT DE SAISON =======================
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function logoHTML(code) { var c = String(code || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c === 'VEG') c = 'VGK'; return c ? '<img class="tlogo" src="https://assets.nhle.com/logos/nhl/svg/' + c + '_light.svg" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : ''; }
  function sortedNames(list) { return list.map(function (p) { return p.name; }).sort(function (a, b) { return a.localeCompare(b); }); }
  function norm(x) { return String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

  // ---- alignement : listes limitées aux joueurs sous contrat, groupes visuels, rôles reconduits de la saison précédente ----
  var roles = {
    k: 'roles', lbl: 'pre.tab_roles', hintKey: 'pre.hint_roles', help: { where: ['pre.help_roles_where'], order: ['pre.help_roles_order_1', 'pre.help_roles_order_2', 'pre.help_roles_order_3', 'pre.help_roles_order_4'], errors: ['pre.help_roles_err_1', 'pre.help_roles_err_2', 'pre.help_roles_err_3'], alerts: ['pre.help_roles_al_pos', 'pre.help_roles_al_dup', 'pre.help_roles_al_leaders'] }, tableClass: 'roles', shortHeads: true, mode: 'fixed', seasons: seasonRange, defaultSeason: nowSeason,
    schema: [['slot', 'col.slot', 'ro'], ['pid', 'col.player', 'player']],
    roFormat: function (c, v, r, t) { return t('slot.' + v); },
    group: function (r) { var m = S.slotMeta(r.slot); return { id: m.id, kind: m.kind }; },
    panels: function (rows) { var by = { lead: [], fwd: [], def: [], gk: [], ext: [] }; rows.forEach(function (r, i) { by[S.slotMeta(r.slot).kind].push(i); }); return [{ id: 'lead', key: 'pre.pan_lead', idx: by.lead }, { id: 'fwd', key: 'pre.pan_fwd', idx: by.fwd }, { id: 'def', key: 'pre.pan_def', idx: by.def }, { id: 'gk', key: 'pre.pan_gk', idx: by.gk }, { id: 'ext', key: 'pre.pan_ext', idx: by.ext }]; },
    listOf: function (r) { return S.slotMeta(r.slot).list; },
    lists: function (H) {
      var under = H.playersUnderContract();
      return { F: sortedNames(under.filter(function (p) { return p.pos === 'F'; })), D: sortedNames(under.filter(function (p) { return p.pos === 'D'; })), G: sortedNames(under.filter(function (p) { return p.pos === 'G'; })),
               S: sortedNames(under.filter(function (p) { return p.pos !== 'G'; })), X: sortedNames(under) };
    },
    fixed: function (season, H, DATA) {
      var b = DATA.base.roles[String(season)] || {}, saved = Object.keys(b).length > 0, prev = DATA.base.roles[String(season - 1)] || {};
      return S.SLOTS.map(function (s) {
        if (saved) return { slot: s, pid: b[s] || null };
        var p = prev[s];   // par défaut : le rôle de la saison précédente, si le joueur est toujours sous contrat (donc avec l'équipe) et que son poste convient
        return p && H.covered(p) && S.posFits(s, H.posOf(p)) ? { slot: s, pid: p, auto: true } : { slot: s, pid: null };
      });
    },
    validate: function (rows, H) { return S.validateRoles(rows, H); },
    derivedHeads: ['col.pos_slot', 'col.contract'],
    derived: function (r, i, rows, H, t) { return [r.pid ? pcode(t, H.posOf(r.pid)) : '', r.pid ? (H.covered(r.pid) ? '✓' : '—') : '']; },
    exportAll: true,
    csv: function (rows, season) { return csv('franchise_id,season,slot,player_id', rows.map(function (r) { return [1, season, r.slot, r.pid]; })); }
  };

  // ---- cotes : une ligne par joueur sous contrat, regroupées par poste, avec recherche et suivi de la saisie ----
  var POS_ORDER = { F: 0, D: 1, G: 2 };
  function filled(v) { return v !== '' && v != null && !isNaN(v); }
  var ratings = {
    k: 'ratings', lbl: 'pre.tab_ratings', hintKey: 'pre.hint_ratings', help: { where: ['pre.help_ratings_where', 'pre.help_ratings_where_team'], order: ['pre.help_ratings_order_1', 'pre.help_ratings_order_2', 'pre.help_ratings_order_3', 'pre.help_ratings_order_4'], errors: ['pre.help_ratings_err_1', 'pre.help_ratings_err_2', 'pre.help_ratings_err_3'], alerts: ['pre.help_ratings_al_range', 'pre.help_ratings_al_jump', 'pre.help_ratings_al_prev'] }, tableClass: 'ratings', search: true, mode: 'fixed', seasons: seasonRange, defaultSeason: nowSeason,
    schema: [['name', 'col.player', 'ro'], ['oa', 'pre.col_oa', 'int']],
    roHTML: function (def, r, t) { return '<span class="nm">' + esc(r.name) + '</span><span class="poschip pos-' + esc(r.pos) + '">' + esc(pcode(t, r.pos)) + '</span>'; },
    fixed: function (season, H, DATA) {
      var base = DATA.base.ratings[String(season)] || {}, ids = {}, list = [];
      Object.keys(base).forEach(function (p) { ids[p] = 1; }); H.playersUnderContract().forEach(function (p) { ids[p.id] = 1; });
      DATA.players.forEach(function (p) { if (ids[p.id]) list.push({ pid: p.id, name: p.name, pos: p.pos, oa: base[p.id] != null ? base[p.id] : '' }); });
      return list.sort(function (a, b) { return (POS_ORDER[a.pos] - POS_ORDER[b.pos]) || a.name.localeCompare(b.name); });
    },
    panels: function (rows) { var by = { F: [], D: [], G: [] }; rows.forEach(function (r, i) { (by[r.pos] || by.F).push(i); }); return [{ id: 'F', key: 'pre.grp_F', idx: by.F }, { id: 'D', key: 'pre.grp_D', idx: by.D }, { id: 'G', key: 'pre.grp_G', idx: by.G }]; },
    hidden: function (r, f) { var q = norm(f.q); if (q && norm(r.name).indexOf(q) < 0) return true; return !!f.missing && filled(r.oa); },
    summary: function (rows) { return { done: rows.filter(function (r) { return filled(r.oa); }).length, total: rows.length, key: 'pre.ratings_done' }; },
    validate: function (rows, H) { return S.validateRatings(rows, H); },
    derivedHeads: ['pre.col_prev', 'col.delta'], derivedClass: ['', 'delta'],
    derived: function (r, i, rows, H) {
      var p = H.prevRef(r.pid), v = S.num(r.oa), d = p != null && v !== null ? v - p : null;
      return [p == null ? '—' : p, d === null ? '—' : { html: '<span class="' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d > 0 ? '+' : '') + d + '</span>' }];
    },
    csv: function (rows, season) { return csv('franchise_id,player_id,season,oa', rows.filter(function (r) { return filled(r.oa); }).map(function (r) { return [1, r.pid, season, r.oa]; })); }
  };

  // ---- calendrier : nombre de matchs de la franchise, adversaire en liste avec saisie assistée, logo, importation Excel / CSV ----
  var schedule = {
    k: 'schedule', lbl: 'pre.tab_schedule', hintKey: 'pre.hint_schedule', help: { where: ['pre.help_schedule_where'], order: ['pre.help_schedule_order_1', 'pre.help_schedule_order_2', 'pre.help_schedule_order_3', 'pre.help_schedule_order_4'], errors: ['pre.help_schedule_err_1', 'pre.help_schedule_err_2', 'pre.help_schedule_err_3'], alerts: ['pre.help_schedule_al_date', 'pre.help_schedule_al_order', 'pre.help_schedule_al_gap', 'pre.help_schedule_al_count', 'pre.help_schedule_al_import'] }, tableClass: 'sched', shortHeads: true, shortDates: true, import: true,
    window: function (season) { return [season + '-09-01', (season + 1) + '-04-30']; },
    // date du match suivant proposée automatiquement (+N jours, modifiable) ; saisir l'adversaire confirme la date proposée
    suggest: function (rows, r, c, o) {
      var out = [], cur = rows[r]; if (!cur || !S.isDate(cur.date)) return out;
      if (c === 'opp' && cur.dateAuto && cur.opp) out.push({ i: r, patch: { dateAuto: false } });
      var date = cur.date, i = r + 1, nx = rows[i]; if (!nx || (nx.date && !nx.dateAuto)) return out;     // pas de ligne suivante, ou date saisie à la main : on n'y touche pas
      if (!nx.date) { out.push({ i: i, patch: { date: new Date(Date.parse(date) + o.step * 86400000).toISOString().slice(0, 10), dateAuto: true } }); return out; }   // case vide : une seule proposition
      while (i < rows.length && rows[i].date && rows[i].dateAuto) { date = new Date(Date.parse(date) + o.step * 86400000).toISOString().slice(0, 10); out.push({ i: i, patch: { date: date, dateAuto: true } }); i++; }   // propositions non confirmées : recalculées
      return out;
    }, mode: 'fixed', seasons: seasonRange, defaultSeason: nowSeason,
    rowCount: function (DATA) { return DATA.franchise.games || 82; },
    schema: [['game', 'col.game', 'ro'], ['date', 'col.date', 'date'], ['opp', 'col.opponent', 'teamlist']],
    fixed: function (season, H, DATA) { var b = DATA.base.schedule[String(season)] || [], m = {}; b.forEach(function (g) { m[g[0]] = g; }); var l = [], n = DATA.franchise.games || 82; for (var g = 1; g <= n; g++) l.push({ game: g, date: m[g] ? m[g][1] : '', opp: m[g] ? m[g][2] : '' }); return l; },
    validate: function (rows, H) { return S.validateSchedule(rows, H); },
    derivedHeads: ['', 'ev.date_gap'], derivedClass: ['logo', 'gap'],
    derived: function (r, i, rows, H) {
      var gap = ''; if (i > 0 && S.isDate(r.date) && S.isDate(rows[i - 1].date)) gap = String(Math.round((Date.parse(r.date) - Date.parse(rows[i - 1].date)) / 86400000));
      return [{ html: r.opp ? (H.logo ? H.logo(r.opp) : logoHTML(r.opp)) : '' }, gap];
    },
    exportAll: true,
    csv: function (rows, season) { return csv('franchise_id,season,game_no,game_date,opponent_code', rows.filter(function (r) { return r.date && r.opp; }).map(function (r) { return [1, season, r.game, r.date, r.opp]; })); }
  };

  // ======================= SAISON MORTE =======================
  function teamBanner(DATA, H, code, title) {
    var tm = DATA.teams.filter(function (x) { return x.code === code; })[0]; if (!tm) return '';
    var hex = function (v) { return /^#[0-9a-f]{6}$/i.test(v || '') ? v : null; }, c1 = hex(tm.c1), c2 = hex(tm.c2) || c1;
    var LM = typeof FTLM !== 'undefined' ? FTLM : null, on = c1 && LM ? LM.onColor(c1, tm.c3) : null;   // texte lisible sur la couleur de l'équipe gagnante (décision du 2026-11-12)
    var st = c1 ? '--o1:' + c1 + ';--o2:' + c2 + (on ? ';--on-o1:' + on : '') : '';
    return '<div class="winband"' + (st ? ' style="' + st + '"' : '') + '><span class="wlogo">' + H.logo(code) + '</span><div class="wtxt"><div class="wt">' + esc(title) + '</div><div class="wn">' + esc(H.teamLabel(code)) + '</div></div></div>';
  }
  var cap_money = function (v) { return v === '' || v == null || isNaN(v) ? '—' : String(Math.round(+v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0$'; };
  var AHL_DEFAULT = 1075000;   // exemption de la LAH suggérée
  function ahlOf(rows) { return rows && rows[0] && filled(rows[0].ahl) ? +rows[0].ahl : AHL_DEFAULT; }
  function rankTeamAt(DATA, year, rank) { var r = (DATA.ranks || {})[String(year - 1)]; if (!r || !rank) return null; for (var code in r) if (r[code] === rank) return code; return null; }
  function teamCell(H, code) { return code ? H.logo(code) + '<span class="tn">' + esc(H.teamLabel(code)) + '</span>' : '<span class="muted">—</span>'; }
  function heightStr(h) { return h == null || h === '' ? '' : Math.floor(h / 12) + "'" + (h % 12); }
  var HANDOPT = [['L', 'hand.L'], ['R', 'hand.R']], POSGRP = { C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G' }, HANDDB = { L: 'Left', R: 'Right' };
  // une ligne de « Nos choix » à partir de la base : [ronde, équipe d'origine, choix, clé, statut, prénom, nom, poste, taille, poids, naissance, main, pays, type, id du joueur]
  function pickRowFromDb(x, p) {
    p = p || {};
    return [x.round, x.original_team_code, x.overall_pick, x.selected_player_key, x.status, p.first_name || '', p.last_name || '', POSGRP[p.position_current] ? p.position_current : '', heightStr(p.height_in), p.weight_lb == null ? '' : p.weight_lb, p.birth_date || '', p.handedness === 'Left' ? 'L' : p.handedness === 'Right' ? 'R' : '', p.country || '', p.player_type || '', x.selected_player_id == null ? null : x.selected_player_id];
  }

  // ---- plafond salarial : toutes les saisons dans un seul tableau ----
  var cap = {
    k: 'cap', lbl: 'off.tab_cap', help: { where: ['off.help_cap_where'], order: ['off.help_cap_order_1', 'off.help_cap_order_2', 'off.help_cap_order_3', 'off.help_cap_order_4'], errors: ['off.help_cap_err_1', 'off.help_cap_err_2', 'off.help_cap_err_3'], alerts: ['off.help_cap_al_req', 'off.help_cap_al_floor', 'off.help_cap_al_two_way', 'off.help_cap_al_growth', 'off.help_cap_al_gap', 'off.help_cap_al_min', 'off.help_cap_al_ahl'] }, hintKey: 'cap.hint', tableClass: 'cap', mode: 'fixed', multi: true, seasons: function () { return []; }, defaultSeason: function () { return 0; },
    schema: [['season', 'ui.season', 'ro'], ['cap', 'col.cap', 'money'], ['floor', 'col.floor', 'money'], ['min', 'col.min_salary', 'money'], ['max1', 'col.max_one_way', 'money'], ['max2', 'col.max_two_way', 'money'], ['ahl', 'col.ahl_exemption', 'money']],
    roFormat: function (c, v) { return sl(v); },
    cellRO: function (def, r, i, rows) {
      if (def[0] === 'max1') return { text: filled(r.cap) ? cap_money(S.maxSalary(+r.cap)) : '—', cls: 'calc' };          // 20 % du plafond, arrondi au 5 000 $ supérieur
      if (def[0] === 'ahl' && i > 0) return { text: cap_money(ahlOf(rows)), cls: 'calc' };                                  // une seule valeur, entrée à la première saison
      return null;
    },
    placeholder: function (def, r, i) { return def[0] === 'ahl' && i === 0 ? cap_money(AHL_DEFAULT) : ''; },
    fixed: function (_s, H, DATA) {
      return seasonRange(DATA).map(function (y, i) {
        var c = DATA.cap.filter(function (x) { return x[0] === y; })[0], row = { season: y, cap: c ? c[1] : '', floor: c ? c[2] : '', min: c ? c[3] : '', max2: c ? c[5] : '', ahl: c && c[6] != null ? c[6] : '' };
        if (i === 0 && !filled(row.ahl)) { var any = DATA.cap.filter(function (x) { return x[6] != null; })[0]; row.ahl = any ? any[6] : AHL_DEFAULT; if (!any) row.autoCols = { ahl: true }; }
        return row;
      });
    },
    validate: function (rows, H) { return S.validateCap(rows, H); },
    derivedHeads: ['cap.col_change'],
    derived: function (r, i, rows, H) { var p = i > 0 ? S.num(rows[i - 1].cap) : null, c = S.num(r.cap); if (!p || !c) return ['—']; var g = (c / p - 1) * 100, s = (g > 0 ? '+' : '') + g.toFixed(1); return [(H.lang === 'fr' ? s.replace('.', ',') : s) + ' %']; },
    exportAll: true,
    csv: function (rows) { var a = ahlOf(rows); return csv('franchise_id,season,effective_on,cap,floor,player_min,player_max_one_way,player_max_two_way,ahl_exemption', rows.filter(function (r) { return filled(r.cap); }).map(function (r) { return [1, r.season, r.season + '-07-01', r.cap, r.floor, r.min, S.maxSalary(+r.cap), r.max2, a]; })); }
  };

  // ---- loterie : l'équipe et son logo viennent du rang tiré ; on saisit seulement qui détient réellement le choix ----
  var lottery = {
    k: 'lottery', lbl: 'off.tab_lottery', help: { note: 'off.help_lottery_note', noteParams: function (DATA) { var n = (DATA.league && DATA.league.size) || 32; return [n >= 32 ? 16 : 15, n]; }, where: ['off.help_lottery_where'], order: ['off.help_lottery_order_1', 'off.help_lottery_order_2', 'off.help_lottery_order_3', 'off.help_lottery_order_4'], errors: ['off.help_lottery_err_1', 'off.help_lottery_err_2', 'off.help_lottery_err_3'], alerts: ['off.help_lottery_al_req', 'off.help_lottery_al_range', 'off.help_lottery_al_dup', 'off.help_lottery_al_team', 'off.help_lottery_al_same', 'off.help_lottery_al_move'] }, hintKey: 'lot.hint', tableClass: 'lottery', mode: 'fixed', seasons: draftRange, seasonKind: 'year', defaultSeason: nowSeason,
    schema: [['pick', 'col.pick', 'ro'], ['pre', 'lot.col_rank', 'int'], ['orig', 'lot.col_origin', 'text'], ['origlogo', '', 'text'], ['owner', 'lot.col_owner', 'team'], ['ownerlogo', '', 'text']],
    cellRO: function (def, r, i, rows, H) {
      var o = H.rankTeam(S.num(r.pre));
      if (def[0] === 'orig') return { html: o ? '<span class="tn">' + esc(H.teamLabel(o)) + '</span>' : '<span class="muted">—</span>' };
      if (def[0] === 'origlogo') return { html: o ? H.logo(o) : '', cls: 'lg' };
      if (def[0] === 'ownerlogo') { var w = r.owner || o; return { html: w ? H.logo(w) : '', cls: 'lg' }; }
      return null;
    },
    fixed: function (year, H, DATA) {
      var b = DATA.base.lottery[String(year)] || [], m = {}; b.forEach(function (l) { m[l[0]] = l; }); var l = [];
      for (var p = 1; p <= H.lotterySize; p++) { var x = m[p], pre = x ? x[1] : '', o = x && x[2] && x[2] !== H.rankTeam(pre) ? x[2] : ''; l.push({ pick: p, pre: pre == null ? '' : pre, owner: o }); }
      return l;
    },
    validate: function (rows, H) { return S.validateLottery(rows, H); },
    exportAll: true,
    csv: function (rows, year) { return csv('franchise_id,draft_year,pick,pre_lottery_rank,team_code', rows.filter(function (r) { return filled(r.pre); }).map(function (r) { return [1, year, r.pick, r.pre, r.owner || '']; })); }
  };

  // ---- top 3 : les 25 années dans une seule vue, l'équipe vient de la loterie ----
  var top3 = {
    k: 'top3', lbl: 'off.tab_top3', help: { where: ['off.help_top3_where'], order: ['off.help_top3_order_1', 'off.help_top3_order_2', 'off.help_top3_order_3'], errors: ['off.help_top3_err_1', 'off.help_top3_err_2'], alerts: ['off.help_top3_al_req', 'off.help_top3_al_dup', 'off.help_top3_al_team'] }, hintKey: 'top3.hint', tableClass: 'top3', mode: 'fixed', multi: true, seasons: function () { return []; }, defaultSeason: function () { return 0; },
    schema: [['year', 'col.draft_year', 'ro'], ['pick', 'col.pick', 'text'], ['team', 'col.team', 'team'], ['teamlogo', '', 'text'], ['name', 'col.selected', 'text'], ['pos', 'col.position', 'sel', POSOPT], ['potential', 'col.potential', 'text']],
    roFormat: function (c, v) { return v; },
    group: function (r) { return { id: r.year, kind: 'year' }; },
    // équipe qui repêche : par défaut celle qui détient le choix à la loterie ; modifiable (échange au repêchage) sans toucher à la loterie
    blankOption: function (def, r, i, H) { return r.lotteryTeam && H ? H.teamLabel(r.lotteryTeam) : ''; },
    cellRO: function (def, r, i, rows, H) { if (def[0] === 'pick') return { text: r.pick, cls: 'pk' }; if (def[0] === 'teamlogo') { var w = r.team || r.lotteryTeam; return { html: w ? H.logo(w) : '', cls: 'lg' }; } return null; },
    fixed: function (_s, H, DATA) {
      var out = []; draftRange(DATA).forEach(function (y) { var b = DATA.base.top3[String(y)] || [], m = {}; b.forEach(function (l) { m[l[0]] = l; }); var Hy = H.at(y); [1, 2, 3].forEach(function (p) { var lt = Hy.lotteryOwner(p), bt = m[p] && m[p][1]; out.push({ year: y, pick: p, team: bt && bt !== lt ? bt : '', lotteryTeam: lt, name: m[p] ? m[p][2] : '', pos: m[p] ? m[p][3] : '', potential: m[p] ? m[p][4] : '' }); }); });
      return out;
    },
    validate: function (rows, H) { return S.validateTop3(rows.map(function (r) { return Object.assign({}, r, { team: r.team || r.lotteryTeam }); }), H); },
    exportAll: true,
    csv: function (rows) { return csv('franchise_id,draft_year,pick,team_code,player_name,position,potential', rows.filter(function (r) { return r.name; }).map(function (r) { return [1, r.year, r.pick, r.team || r.lotteryTeam, r.name, r.pos, r.potential]; })); }
  };

  // ---- nos choix : tous les renseignements sur le joueur repêché, toutes les années dans un seul tableau ----
  var PICK_BLANK = 12;
  var PTSLUG = { 'Power Forward': 'power_forward', '2 Way Forward': 'two_way_forward', 'Grinder': 'grinder', 'Sniper': 'sniper', 'Playmaker': 'playmaker', 'Enforcer': 'enforcer', '2 Way Defenseman': 'two_way_defenseman', 'Offensive Defenseman': 'offensive_defenseman', 'Defensive Defenseman': 'defensive_defenseman', 'Butterfly': 'butterfly', 'Hybrid': 'hybrid', 'Stand-up': 'stand_up' };
  function inchesFrom(str) { var m = /^(\d+)\s*'\s*(\d{1,2})/.exec(String(str == null ? '' : str).trim()); return m ? +m[1] * 12 + +m[2] : null; }
  var picks = {
    k: 'picks', lbl: 'off.tab_picks', help: { note: 'off.help_picks_note', noteParams: function (DATA) { var n = (DATA.league && DATA.league.size) || 32; return [n, 7 * n]; }, where: ['off.help_picks_where_1', 'off.help_picks_where_2'], order: ['off.help_picks_order_1', 'off.help_picks_order_2', 'off.help_picks_order_3', 'off.help_picks_order_4'], errors: ['off.help_picks_err_1', 'off.help_picks_err_2', 'off.help_picks_err_3'], alerts: ['off.help_picks_al_year', 'off.help_picks_al_round', 'off.help_picks_al_req', 'off.help_picks_al_dup', 'off.help_picks_al_pick', 'off.help_picks_al_age', 'off.help_picks_al_odd', 'off.help_picks_al_ptype', 'off.help_picks_al_birth', 'off.help_al_homonym', 'off.help_picks_al_birth_req'] }, hintKey: 'picks.hint', tableClass: 'picks', mode: 'fixed', multi: true, seasons: function () { return []; }, defaultSeason: function () { return 0; },
    schema: [['year', 'picks.col_year', 'int'], ['round', 'picks.col_round', 'int'], ['overall', 'picks.col_overall', 'int'], ['first', 'col.first_name', 'text'], ['last', 'col.last_name', 'text'], ['pos', 'col.position', 'sel', POSOPT], ['height', 'picks.col_height', 'text'], ['weight', 'picks.col_weight', 'int'], ['birth', 'picks.col_birth', 'date'], ['hand', 'picks.col_hand', 'sel', HANDOPT], ['country', 'picks.col_country', 'sel', []], ['ptype', 'picks.col_ptype', 'sel', []]],
    placeholder: function (def, r, i, H) { var fr = H && H.lang === 'fr'; return def[0] === 'height' ? (fr ? '188' : "6'2") : def[0] === 'weight' ? (fr ? '86' : '190') : def[0] === 'year' ? '2025' : ''; },
    // taille et poids sont gardés en pouces et en livres ; l'écran les saisit et les affiche en cm et en kg en français
    parseCell: function (def, v, lang) {
      if (def[0] === 'height') { if (v === '') return ''; var ft = inchesFrom(v); if (ft !== null) return ft; var n = parseFloat(String(v).replace(',', '.')); if (isNaN(n)) return false; return lang === 'fr' ? n / 2.54 : n; }
      if (def[0] === 'weight') { if (v === '') return ''; var w = parseFloat(String(v).replace(/[\s\u00a0]/g, '').replace(',', '.')); if (isNaN(w)) return false; return lang === 'fr' ? w / 0.45359237 : w; }
      return undefined;
    },
    fmtCell: function (def, v, lang) {
      if (v === '' || v == null) return v == null ? '' : v;
      if (def[0] === 'height' && !isNaN(v)) { if (lang === 'fr') return String(Math.round(v * 2.54)); var i = Math.round(v); return Math.floor(i / 12) + "'" + (i % 12); }
      if (def[0] === 'weight' && !isNaN(v)) return String(Math.round(lang === 'fr' ? v * 0.45359237 : v));
      return v;
    },
    selOptions: function (def, r, t, lang) {
      if (def[0] === 'country') return FTC.options(lang);
      if (def[0] === 'ptype') { var g = POSGRP[r.pos], list = g ? S.PTYPES[g] : ['F', 'D', 'G'].reduce(function (a, k) { S.PTYPES[k].forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); return a; }, []); return list.map(function (x) { return [x, 'ptype.' + PTSLUG[x]]; }); }
      return null;
    },
    cellAfter: function (def, r) { var u = def[0] === 'country' && r.country ? FTC.flagURL(r.country) : ''; return u ? ' <img class="flag" src="' + u + '" alt="" onerror="this.style.display=\'none\'">' : ''; },
    fixed: function (_s, H, DATA) {
      var rows = [], years = Object.keys(DATA.base.picks).sort();
      years.forEach(function (y) { DATA.base.picks[y].filter(function (x) { return x[4] === 'selected' && x[3]; })   /* doublons exacts : fusionnés par la migration 57, contrainte draft_pick_uniq */.forEach(function (x) { var hi = inchesFrom(x[8]); rows.push({ year: +y, round: x[0], overall: x[2] == null ? '' : x[2], first: x[5] || '', last: x[6] || '', pos: x[7] || '', height: hi == null ? '' : hi, weight: x[9] === '' ? '' : x[9], birth: x[10] || '', hand: x[11] || '', country: x[12] || '', ptype: x[13] || '', key: x[3], pid: x[14] == null ? null : x[14], orig: x[1] || '' }); }); });
      for (var i = 0; i < PICK_BLANK; i++) rows.push({ year: '', round: '', overall: '', first: '', last: '', pos: '', height: '', weight: '', birth: '', hand: '', country: '', ptype: '' });
      return rows;
    },
    // joueur repêché homonyme d'un joueur connu (même groupe, historiques compris) : question « Même joueur ? » sous la ligne (maquette docs/maquettes/homonymes.html)
    homoCands: function (r, DATA) { return pickCands(r, DATA.homo); },
    rowAfter: function (r, i, DATA, t, esc_, cols) {
      var hc = pickCands(r, DATA.homo); if (!hc.length) return '';
      var nm = (r.first + ' ' + r.last).trim(), st = HO.status(hc, r.homo), o = { ref: 'picks-' + i, name: nm, group: hc[0].position_group, cands: hc, answer: st === 'yes' ? r.homo : st === 'no' ? 'no' : null, jumpHint: st === 'ask' };
      if (st === 'no') { if (!r.birth) { o.birthErr = 'val.homonym_birth_missing'; o.birthErrP = [nm]; } else if (HO.sameBirth(hc, r.birth)) { o.birthErr = 'val.homonym_same_birth'; o.birthErrP = [nm, r.birth]; } }
      return '<tr class="homo-row" data-for="' + i + '"><td colspan="' + (cols + 2) + '">' + HO.boxHTML(o, esc_, t) + '</td></tr>';
    },
    validate: function (rows, H) {
      var out = S.validatePicks(rows, H);
      rows.forEach(function (r, i) {
        var hc = pickCands(r, H.homo); if (!hc.length) return; var nm = (r.first + ' ' + r.last).trim(), st = HO.status(hc, r.homo), a = out[i] = out[i] || [];
        if (st === 'ask') a.push({ c: 'last', level: 'err', k: 'val.homonym_unanswered', p: [nm] });
        else if (st === 'no' && !r.birth) a.push({ c: 'birth', level: 'err', k: 'val.homonym_birth_missing', p: [nm] });
        else if (st === 'no' && HO.sameBirth(hc, r.birth)) a.push({ c: 'birth', level: 'err', k: 'val.homonym_same_birth', p: [nm, r.birth] });
      });
      return out;
    },
    exportAll: true,
    csv: function (rows) { return csv('draft_year,round,overall_pick,first_name,last_name,position,height_in,weight_lb,birth_date,handedness,country,player_type', rows.filter(function (r) { return r.first || r.last; }).map(function (r) { return [r.year, r.round, r.overall, r.first, r.last, r.pos, filled(r.height) ? Math.round(+r.height) : '', filled(r.weight) ? Math.round(+r.weight) : '', r.birth, r.hand, r.country, r.ptype]; })); }
  };

  // ---- trophées : une ligne par trophée ; poste et récipiendaire ; autres récipiendaires à droite (Jennings, Richard) ----
  var AWARD_ORDER = ['art_ross', 'hart', 'norris', 'lady_byng', 'calder', 'conn_smythe', 'vezina', 'jennings', 'masterton', 'jack_adams', 'selke', 'ted_lindsay', 'rocket_richard'];
  var AWARD_VALUE = { art_ross: 1, jennings: 1, rocket_richard: 1 };   // points, moyenne de buts alloués, buts
  var AWARD_EXTRA = { jennings: { 2: 'G' }, rocket_richard: { 2: '*', 3: '*' } };   // places 2 et 3 : poste imposé (G) ou au choix (*)
  var TROPHY_COLOR = { art_ross: '#c8962e', hart: '#d4a72c', norris: '#2f6fb2', lady_byng: '#8a99a8', calder: '#3b8f4f', conn_smythe: '#caa02a', vezina: '#b3342f', jennings: '#7d8c9b', masterton: '#7a4fa3', jack_adams: '#9a6a3a', selke: '#2a8f8a', ted_lindsay: '#d0702a', rocket_richard: '#a8232f' };
  var TROPHY_IMG = FTTROPHY || {};   // code -> image du trophée (vignette intégrée) ; sans image, une icône de coupe aux couleurs du trophée est affichée
  function trophyIcon(code) {
    if (TROPHY_IMG[code]) return '<img class="trophy" src="' + esc(TROPHY_IMG[code]) + '" alt="">';
    var col = TROPHY_COLOR[code] || '#c8962e';
    return '<svg class="trophy" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 3h12v5.2a6 6 0 0 1-12 0V3z" fill="' + col + '"/><path d="M6 5H3.2v1.6A3.4 3.4 0 0 0 6.6 10M18 5h2.8v1.6A3.4 3.4 0 0 1 17.4 10" fill="none" stroke="' + col + '" stroke-width="1.6"/><rect x="10.6" y="14" width="2.8" height="4" fill="' + col + '"/><rect x="7.5" y="18" width="9" height="3" rx="1" fill="' + col + '"/><path d="M8.6 5.2v3" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }
  // candidats homonymes d'une ligne de repêchage : seulement un joueur pas encore lié (sans id) dont le nom et le poste sont remplis
  function pickCands(r, homo) { var g = POSGRP[r.pos]; return r && !r.pid && r.first && r.last && g ? HO.find(homo, r.first + ' ' + r.last, g) : []; }
  function splitKey(k) { var m = /^([FDG]) - (.+)$/.exec(k || ''); return m ? [m[1], m[2]] : ['', k || '']; }
  var AWD_POS = [['F', 'pc.F'], ['D', 'pc.D'], ['G', 'pc.G']];
  function awardPosOf(r, n) { return n ? r['pos' + n] : r.pos; }
  var awards = {
    k: 'awards', lbl: 'off.tab_awards', help: { where: ['off.help_awards_where'], order: ['off.help_awards_order_1', 'off.help_awards_order_2', 'off.help_awards_order_3', 'off.help_awards_order_4'], errors: ['off.help_awards_err_1', 'off.help_awards_err_2', 'off.help_awards_err_3'], alerts: ['off.help_awards_al_pos', 'off.help_awards_al_extra', 'off.help_al_team', 'off.help_awards_al_gaa', 'off.help_awards_al_value'] }, hintKey: 'awd.hint', tableClass: 'awards', mode: 'fixed', seasons: seasonRange, defaultSeason: lastSeason,
    schema: [['img', '', 'ro'], ['code', 'col.award', 'text'], ['team', 'col.team', 'team'], ['teamlogo', '', 'text'], ['pos', 'awd.col_pos', 'sel', AWD_POS], ['name', 'awd.col_recipient', 'text'], ['value', 'col.value', 'dec3'],
             ['pos2', 'awd.col_pos2', 'sel', AWD_POS], ['name2', 'awd.col_recipient2', 'text'], ['val2', 'awd.col_gaa2', 'dec3'], ['pos3', 'awd.col_pos2', 'sel', AWD_POS], ['name3', 'awd.col_recipient3', 'text']],
    roHTML: function (def, r) { return trophyIcon(r.code); },
    cellRO: function (def, r, i, rows, H, t) {
      var c = def[0], na = { text: '', cls: 'na' };
      if (c === 'code') return { text: t('award.' + r.code), cls: 'awn' };
      if (c === 'teamlogo') return { html: r.team ? H.logo(r.team) : '', cls: 'lg' };
      if (c === 'pos') { if (S.AWARD_POS[r.code]) return { text: t('pc.' + S.AWARD_POS[r.code]), cls: 'fix' }; if (r.code === 'jack_adams') return { text: '—', cls: 'na' }; return null; }
      if (c === 'value') return AWARD_VALUE[r.code] ? null : na;
      var m = /^(pos|name|val)(\d)$/.exec(c); if (!m) return null;
      var slot = (AWARD_EXTRA[r.code] || {})[m[2]]; if (!slot) return na;
      if (m[1] === 'pos') return slot === 'G' ? { text: t('pc.G'), cls: 'fix' } : null;
      if (m[1] === 'val') return r.code === 'jennings' && m[2] === '2' ? null : na;
      return null;
    },
    // nom de la statistique à saisir, affiché au survol ou à la sélection de la cellule
    cellAfter: function (def, r, i, H, t) { var k = (def[0] === 'value' && AWARD_VALUE[r.code]) ? r.code : (def[0] === 'val2' && r.code === 'jennings' ? 'jennings' : ''); return k ? '<span class="tip">' + esc(t('awd.tip_' + k)) + '</span>' : ''; },
    // choix d'un joueur avec saisie libre (FTPC) ; Jack-Adams : entraîneurs, texte libre sans liste
    playerGroup: function (def, r) { var m = /^name(\d?)$/.exec(def[0]); if (!m || r.code === 'jack_adams') return undefined; var pos = (m[1] ? ((AWARD_EXTRA[r.code] || {})[m[1]] === 'G' ? 'G' : r['pos' + m[1]]) : (S.AWARD_POS[r.code] || r.pos)); return { F: 'F', D: 'D', G: 'G', C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D' }[pos] || ''; },
    listFor: function (def, r) { var m = /^name(\d?)$/.exec(def[0]); if (!m) return ''; var pos = (m[1] ? ((AWARD_EXTRA[r.code] || {})[m[1]] === 'G' ? 'G' : r['pos' + m[1]]) : (S.AWARD_POS[r.code] || r.pos)); return r.code === 'jack_adams' ? '' : (pos || ''); },
    datalists: function (DATA) { var o = { F: [], D: [], G: [] }; DATA.players.forEach(function (p) { if (o[p.pos]) o[p.pos].push(p.name); }); Object.keys(o).forEach(function (k) { o[k].sort(function (a, b) { return a.localeCompare(b); }); }); return o; },
    fixed: function (season, H, DATA) {
      var b = DATA.base.awards[String(season)] || [];
      return AWARD_ORDER.map(function (code) {
        var by = {}; b.filter(function (x) { return x[0] === code; }).forEach(function (x) { by[x[1]] = x; });
        var w1 = by[1] ? splitKey(by[1][2]) : ['', ''], w2 = by[2] ? splitKey(by[2][2]) : ['', ''], w3 = by[3] ? splitKey(by[3][2]) : ['', ''], ex = AWARD_EXTRA[code] || {};
        var row = { code: code, place: 1, pos: S.AWARD_POS[code] || w1[0], name: w1[1], team: by[1] ? by[1][3] || '' : '', value: by[1] && by[1][4] != null ? by[1][4] : '',
          pos2: ex[2] === 'G' ? 'G' : w2[0], name2: w2[1], val2: by[2] && by[2][4] != null ? by[2][4] : '', pos3: w3[0], name3: w3[1], base2: by[2] ? by[2][2] : '', base3: by[3] ? by[3][2] : '', bteam2: by[2] ? by[2][3] || '' : '', bteam3: by[3] ? by[3][3] || '' : '' };
        if (code === 'jack_adams') row.pos = '';
        return row;
      });
    },
    validate: function (rows, H) { return S.validateAwards(rows, H); },
    exportAll: true,
    csv: function (rows, season) {
      var out = []; rows.forEach(function (r) { [['', 1], ['2', 2], ['3', 3]].forEach(function (s) { var k = S.awardKey(r.code, s[0] ? r['pos' + s[0]] : r.pos, s[0] ? r['name' + s[0]] : r.name); if (k) out.push([1, r.code, season, s[1], k, s[1] === 1 ? r.team : '', s[1] === 1 ? r.value : s[1] === 2 && r.code === 'jennings' ? r.val2 : '']); }); });
      return csv('franchise_id,award_code,season,place,player_key,team_code,stat_value', out);
    }
  };

  var allstar = {
    k: 'allstar', lbl: 'off.tab_allstar', help: { where: ['off.help_allstar_where'], order: ['off.help_allstar_order_1', 'off.help_allstar_order_2', 'off.help_allstar_order_3'], errors: ['off.help_allstar_err_1', 'off.help_allstar_err_2'], alerts: ['off.help_allstar_al_dup', 'off.help_al_team'] }, hintKey: 'asl.hint', tableClass: 'allstar', mode: 'fixed', seasons: seasonRange, defaultSeason: lastSeason,
    schema: [['lvl', 'col.team_level', 'ro'], ['pos', 'col.pos_slot', 'ro'], ['name', 'col.player', 'text'], ['team', 'col.team', 'team']],
    playerGroup: function (def, r) { return def[0] === 'name' ? ({ F: 'F', D: 'D', G: 'G' }[r.pos] || '') : undefined; },
    roFormat: function (c, v, r, t) { return c === 'lvl' ? t('asl.' + v) : v; },
    fixed: function (season, H, DATA) {
      var b = DATA.base.allstar[String(season)] || [], pool = { 1: { F: [], D: [], G: [] }, 2: { F: [], D: [], G: [] } };
      b.forEach(function (x) { var g = (x[2] || '').charAt(0); if (pool[x[0]] && pool[x[0]][g]) pool[x[0]][g].push(x); });
      return S.ALLSTAR.map(function (a, i) { var n = S.ALLSTAR.slice(0, i).filter(function (z) { return z[0] === a[0] && z[1] === a[1]; }).length, x = pool[a[0]][a[1]][n]; return { lvl: a[0], pos: a[1], name: x ? splitKey(x[2])[1] : '', team: x ? x[3] || '' : '' }; });
    },
    // alignement : trois attaquants, deux défenseurs et un gardien par équipe d'étoiles ; l'équipe du joueur et son logo
    layout: function (rows, al, api) {
      var H = api.H, t = api.t;
      function slot(ri, lbl) { var r = rows[ri]; return '<div class="slot' + (r.name ? '' : ' empty') + '"><div class="slbl">' + esc(lbl) + '</div>' + api.cell(ri, 'name') + '<div class="steam">' + api.cell(ri, 'team') + (r.team ? '<span class="tl" title="' + esc(H.teamLabel(r.team)) + '">' + H.logo(r.team) + '</span>' : '') + '</div></div>'; }
      function lineup(lvl) {
        var b = (lvl - 1) * 6, f = t('pc.F');
        return '<section class="lineup l' + lvl + '"><h4>' + esc(t('asl.' + lvl)) + '</h4><div class="lrow f3">' + slot(b, f + '1') + slot(b + 1, f + '2') + slot(b + 2, f + '3') + '</div><div class="lrow d2">' + slot(b + 3, 'D1') + slot(b + 4, 'D2') + '</div><div class="lrow g1">' + slot(b + 5, 'G') + '</div></section>';
      }
      return '<div class="lineups">' + lineup(1) + lineup(2) + '</div>';
    },
    validate: function (rows, H) { var out = S.validateAllStar(rows.map(function (r) { return Object.assign({}, r, { key: r.name ? r.pos + ' - ' + r.name : '' }); }), H); return out.map(function (a) { return a.map(function (x) { return x.c === 'key' ? Object.assign({}, x, { c: 'name' }) : x; }); }); },
    exportAll: true,
    csv: function (rows, season) { return csv('franchise_id,season,team_level,position,player_key,team_code', rows.filter(function (r) { return r.name; }).map(function (r) { return [1, season, r.lvl, r.pos, r.pos + ' - ' + r.name, r.team]; })); }
  };

  var CUP_SLOTS = { F: 20, D: 10, G: 4 };   // cases proposées par groupe (davantage si plus de noms sont déjà enregistrés)
  var cup = {
    k: 'cup', lbl: 'off.tab_cup', help: { where: ['off.help_cup_where'], note: 'off.help_cup_note', order: ['off.help_cup_order_1', 'off.help_cup_order_2', 'off.help_cup_order_3'], errors: ['off.help_cup_err_1', 'off.help_cup_err_2', 'off.help_cup_err_3'], alerts: ['off.help_al_team', 'off.help_cup_al_series', 'off.help_cup_al_po', 'off.help_cup_al_dup', 'off.help_cup_al_nochamp', 'off.help_cup_al_max'] }, autoNoteKey: 'off.cup_auto_note', hintKey: 'cup.hint', tableClass: 'cup', mode: 'fixed', seasons: seasonRange, defaultSeason: lastSeason,
    schema: [['season', 'ui.season', 'ro'], ['champion', 'col.champion', 'team'], ['name', 'cup.col_member', 'text']],
    playerGroup: function (def, r) { return def[0] === 'name' && r.grp ? ({ F: 'F', D: 'D', G: 'G' }[r.grp] || '') : undefined; },
    roFormat: function (c, v) { return sl(v); },
    // ligne 0 : le champion (celui de la finale des séries tant qu'aucune équipe n'est enregistrée) ; ensuite les cases des membres : attaquants, défenseurs, gardiens
    fixed: function (season, H, DATA) {
      var base = DATA.base.cup[String(season)] || '', auto = base ? '' : H.seriesWinner();
      var row0 = { season: season, champion: base || auto, grp: '', slot: -1, name: '' }; if (auto) { row0.auto = true; row0.autoCols = { champion: true }; }
      var mem = ((DATA.base.cup_members || {})[String(season)] || []), by = { F: [], D: [], G: [] }; mem.forEach(function (m) { if (by[m[0]]) by[m[0]].push(splitKey(m[1])[1]); });
      var out = [row0]; ['F', 'D', 'G'].forEach(function (g) { var n = Math.max(CUP_SLOTS[g], by[g].length + 2); for (var k = 0; k < n; k++) out.push({ season: season, champion: '', grp: g, slot: k, name: by[g][k] || '' }); });
      return out;
    },
    banner: function (rows, H, t, DATA) { var r = rows[0]; return r && r.champion ? teamBanner(DATA, H, r.champion, t('cup.banner') + ' ' + sl(r.season)) : ''; },
    layout: function (rows, al, api) {
      var H = api.H, t = api.t, champ = rows[0].champion, n = rows.filter(function (r) { return r.grp && r.name && String(r.name).trim(); }).length;
      function list(g) { var items = ''; rows.forEach(function (r, i) { if (r.grp === g) items += '<div class="mrow"><span class="mnum">' + (r.slot + 1) + '</span>' + api.cell(i, 'name') + '</div>'; }); return '<section class="mgrp g' + g + '"><h4>' + esc(t('cup.grp_' + g)) + '</h4>' + items + '</section>'; }
      return '<h4 class="mtitle">' + esc(t('cup.members')) + ' <span class="mcount' + (n > 52 ? ' over' : '') + '">' + n + ' / 52</span></h4><div class="members">' + list('F') + list('D') + list('G') + '</div>';
    },
    validate: function (rows, H) {
      var out = S.validateCup(rows.map(function (r, i) { return i ? { champion: '' } : r; }), H), seen = {}, n = 0;
      rows.forEach(function (r, i) { if (i && r.name && String(r.name).trim()) { n++; var k = String(r.name).trim().toLowerCase(); (seen[k] = seen[k] || []).push(i); } });
      Object.keys(seen).forEach(function (k) { if (seen[k].length > 1) seen[k].forEach(function (i) { out[i] = (out[i] || []).concat([{ c: 'name', level: 'err', k: 'val.cup_member_dup', p: [] }]); }); });
      if (n && !rows[0].champion) out[0] = (out[0] || []).concat([{ c: 'name', level: 'warn', k: 'val.cup_members_no_champion', p: [] }]);
      if (n > 52) out[0] = (out[0] || []).concat([{ c: 'name', level: 'warn', k: 'val.cup_members_max', p: [n] }]);
      return out;
    },
    exportAll: true,
    csv: function (rows) { var l = [[1, rows[0].season, rows[0].champion, '', '']]; rows.forEach(function (r) { if (r.grp && r.name) l.push([1, r.season, '', r.grp, r.name]); }); return csv('franchise_id,season,champion_team_code,group,player', l.filter(function (x) { return x[2] || x[4]; })); }
  };

  // ---- Classement de la ligue (saisie : équipe à chaque rang, V et D ; le reste est calculé par S.standCalc) ----
  var LINK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/></svg>';
  function stdCtx(H) { return { games: H.games, myCode: H.myCode, own: H.ownRecord(), confDiv: H.confDiv, teamOk: H.leagueOk, teamLabel: H.teamLabel, seasonLabel: sl(H.season) }; }
  var STD_CALC = { rows: null, v: null };
  function stdCalc(rows, H) { if (STD_CALC.rows !== rows) { STD_CALC.rows = rows; STD_CALC.v = S.standCalc(rows, stdCtx(H)); } return STD_CALC.v; }
  function stdLetter(t, q) { return q ? t('std.clinch_' + q, true) : t('std.clinch_none', true); }
  var standings = {
    k: 'standings', lbl: 'ui.standings', hintKey: 'std.hint', tableClass: 'standings', shortHeads: true, mode: 'fixed', exportAll: true,
    help: { note: 'off.help_standings_note', noteParams: function (D) { return [(D.league && D.league.size) || 32, D.franchise.games || 82]; },
      where: ['off.help_standings_where'],
      order: ['off.help_standings_order_1', 'off.help_standings_order_2', 'off.help_standings_order_3', 'off.help_standings_order_4'],
      errors: ['off.help_standings_err_1', 'off.help_standings_err_2', 'off.help_standings_err_3', 'off.help_standings_err_4'],
      alerts: ['off.help_standings_al_team', 'off.help_standings_al_wl', 'off.help_standings_al_order', 'off.help_standings_al_sum', 'off.help_standings_al_own_manual'] },
    seasons: seasonRange, defaultSeason: lastSeason,
    // Rang (lecture seule) · logo · Équipe (saisie avec liste) · V · D ; puis 7 colonnes calculées (maquette validée : docs/maquettes/classement.html)
    schema: [['rank', 'std.col_rank', 'ro'], ['logo', '', 'text'], ['team', 'col.team', 'team'], ['w', 'stat.w', 'int'], ['l', 'stat.l', 'int']],
    derivedHeads: ['stat.otl', 'stat.pts', 'std.col_clinch', 'std.col_conf', 'std.col_div', 'std.col_seed', 'std.col_draft'],
    derivedClass: ['sc-otl', 'sc-pts', 'sc-q', 'sc-conf', 'sc-div', 'sc-seed', 'sc-draft'],
    roHTML: function (def, r) { return String(r.rank); },
    roFormat: function (c, v, r, t) { return t('std.col_rank') + ' ' + v + (r.team ? ' · ' + r.team : ''); },
    cellRO: function (def, r, i, rows, H, t) {
      if (def[0] === 'logo') return { html: r.team ? H.logo(r.team) : '', cls: 'lg' + (r.team && r.team === H.myCode ? ' mine' : '') };
      if ((def[0] === 'w' || def[0] === 'l') && r.team && r.team === H.myCode) { var rec = H.ownRecord(); if (rec) return { html: '<span class="std-own" title="' + esc(t('std.row_auto')) + '">' + rec[def[0]] + LINK + '</span>', cls: 'calc own' }; }
      return null;
    },
    fixed: function (season, H, D) {
      var b = (D.base.standing || {})[String(season)] || [], out = [];
      for (var i = 0; i < H.leagueSize; i++) { var x = b[i]; out.push({ rank: i + 1, team: x ? x[0] : '', w: x && x[1] != null ? x[1] : '', l: x && x[2] != null ? x[2] : '' }); }
      return out;
    },
    derived: function (r, i, rows, H, t) {
      var x = stdCalc(rows, H)[i], dash = { html: '<span class="na">—</span>' };
      if (!x || !x.code || x.dup != null) return [dash, dash, '', '', '', '', ''];
      var qt = t(x.q ? 'std.clinch_' + x.q : 'std.clinch_none');
      var q = { html: '<span class="std-q" data-q="' + x.q + '" title="' + esc(qt) + '" aria-label="' + esc(qt) + '">' + esc(stdLetter(t, x.q)) + '</span>' };
      var seed = x.q === 'W' ? t('std.wc_seed').split('{0}').join(t('std.conf_letter_' + x.conf)).split('{1}').join(x.wc) : x.dr ? t('std.div_seed').split('{0}').join(t('div.' + x.div, true)).split('{1}').join(x.dr) : '';
      return [x.otl == null ? dash : x.otl, x.pts == null ? dash : x.pts, q,
        x.conf ? { html: '<span title="' + esc(t('conf.' + x.conf)) + '">' + esc(t('conf.' + x.conf, true)) + '</span>' } : '',
        x.div ? { html: '<span title="' + esc(t('div.' + x.div)) + '">' + esc(t('div.' + x.div, true)) + '</span>' } : '',
        seed, x.draft == null ? '' : x.draft];
    },
    // légende des pastilles de Résultat, sous la grille (texte de Gabriel)
    footer: function (rows, H, t) { return '<p class="std-legend"><span>' + esc(t('std.col_clinch')) + ' :</span>' + ['Z', 'Y', 'X', 'W'].map(function (q) { return '<span class="std-leg"><span class="std-q" data-q="' + q + '" aria-hidden="true">' + esc(stdLetter(t, q)) + '</span>' + esc(t('std.clinch_' + q)) + '</span>'; }).join('') + '</p>'; },
    validate: function (rows, H) { STD_CALC.rows = null; return S.validateStandings(rows, stdCtx(H)); }
  };
  var series = {
    k: 'series', lbl: 'off.tab_series', help: { where: ['off.help_series_where_1', 'off.help_series_where_2'], order: ['off.help_series_order_1', 'off.help_series_order_2', 'off.help_series_order_3', 'off.help_series_order_4'], errors: ['off.help_series_err_1', 'off.help_series_err_2', 'off.help_series_err_3'], alerts: ['off.help_series_al_pair', 'off.help_series_al_winner', 'off.help_series_al_teams', 'off.help_series_al_standings', 'off.help_series_al_champion', 'off.help_series_al_stats'] }, mode: 'fixed', seasons: seasonRange, defaultSeason: lastSeason,
    schema: [['label', 'col.series', 'ro'], ['wa', 'col.wins_a', 'int'], ['wb', 'col.wins_b', 'int']],
    roFormat: function (c, v, r, t) { return (r.round === 1 ? t('series.round1') : r.round === 2 ? t('series.round2') : r.round === 3 ? t('series.conf_final') : t('series.final')) + (r.conf === 'FINAL' ? '' : ' · ' + t('conf.' + (r.conf === 'WEST' ? 'WEST' : 'EAST'), true) + (r.round < 3 ? ' · ' + r.slot : '')); },
    fixed: function (season, H, DATA) {
      var b = (DATA.base.series || {})[String(season)] || [];
      return S.SERIES_ORDER.map(function (o, i) { var w = b[i]; return { label: i, round: o[0], conf: o[1], slot: o[2], wa: w && w[0] != null ? w[0] : '', wb: w && w[1] != null ? w[1] : '' }; });
    },
    validate: function (rows, H) { return S.validateSeries(rows, H); },
    hintKey: 'srs.hint', tableClass: 'series',
    // arbre des séries : ouest à gauche, est à droite, finale de la Coupe Stanley au centre ; les équipes sont des logos (nom au survol)
    layout: function (rows, al, api) {
      var H = api.H, t = api.t, br = S.computeBracket(H.standings, rows.map(function (x) { return [x.wa, x.wb]; })), wc = {};
      // quatrièmes as (« wild cards ») de chaque conférence : les équipes de première ronde hors des trois premières de leur division, classées par rang ; WC1 / QA1 est la mieux classée
      [[0, 3], [4, 7]].forEach(function (rg) { var seen = {}, list = []; for (var i = rg[0]; i <= rg[1]; i++) [br[i].a, br[i].b].forEach(function (e) { if (e && !seen[e[0]] && !(e[5] >= 1 && e[5] <= 3)) { seen[e[0]] = 1; list.push(e); } }); list.sort(function (x, y) { return x[1] - y[1]; }).forEach(function (e, k) { wc[e[0]] = t('series.wc') + (k + 1); }); });
      function tl(e) { var nm = e ? H.teamLabel(e[0]) : ''; return e ? '<span class="tl" data-name="' + esc(nm) + '" title="' + esc(nm) + '">' + H.logo(e[0]) + '</span><span class="seed">' + esc(wc[e[0]] || (e[4] && e[5] ? e[4] + e[5] : '')) + '</span>' : '<span class="tl none">?</span><span class="seed"></span>'; }
      function box(i) {
        var s = br[i], wa = s.winner && s.a && s.winner[0] === s.a[0], wb = s.winner && s.b && s.winner[0] === s.b[0];
        return '<div class="sbox' + (al[i] && al[i].some(function (x) { return x.level === 'err'; }) ? ' bad' : '') + '"><div class="srow' + (wa ? ' win' : wb ? ' lose' : '') + '">' + tl(s.a) + api.cell(i, 'wa') + '</div><div class="srow' + (wb ? ' win' : wa ? ' lose' : '') + '">' + tl(s.b) + api.cell(i, 'wb') + '</div></div>';
      }
      function div(i) { var e = br[i].a, u = e && e[4] ? FTLOGOS.div[e[4]] : ''; return u ? '<img class="dlogo" src="' + u + '" alt="' + esc(e[4]) + '" title="' + esc(e[4] + ' · ' + t('series.division')) + '">' : e && e[4] ? '<span class="dbadge" title="' + esc(t('series.division')) + '">' + esc(e[4]) + '</span>' : '<span class="dbadge none">·</span>'; }
      function col(cls, head, items) { return '<div class="tcol ' + cls + '"><div class="thead">' + head + '</div><div class="tbody">' + items.join('') + '</div></div>'; }
      function confHead(side) { var u = FTLOGOS.conf[side], nm = t('conf.' + side, true); return (u ? '<img class="clogo" src="' + u + '" alt="' + esc(nm) + '" title="' + esc(nm) + '">' : '<span class="cbadge ' + side.toLowerCase() + '">' + esc(nm) + '</span>') + '<span>' + esc(t('series.conf_final')) + '</span>'; }
      // logo des séries de la Coupe Stanley : l'année de la saison est dessinée par-dessus (anglais : version 2021 ; français : version 2019)
      var pl = FTLOGOS.po[H.lang === 'en' ? 'en' : 'fr'], yr = H.season + 1, cup = pl ? '<svg class="polog" viewBox="0 0 ' + pl.w + ' ' + pl.h + '" width="' + pl.w + '" height="' + pl.h + '" role="img" aria-label="' + esc(t('series.cup') + ' ' + yr) + '"><image href="' + pl.uri + '" width="' + pl.w + '" height="' + pl.h + '"/><text x="' + pl.x + '" y="' + pl.y + '" font-size="' + pl.fs + '" textLength="' + pl.tl + '" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="#e6e6e6" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-weight="600">' + yr + '</text></svg>' : '';
      function conf(side) { var w = side === 'WEST', o = w ? 0 : 4;
        return [col((w ? 'w' : 'e') + 'r1', esc(t('series.round1')), [div(o) + box(o) + box(o + 1), div(o + 2) + box(o + 2) + box(o + 3)].map(function (x) { return '<div class="pair">' + x + '</div>'; })),
          col((w ? 'w' : 'e') + 'r2', esc(t('series.round2')), (w ? [8, 9] : [10, 11]).map(function (i) { return '<div class="pair">' + box(i) + '</div>'; })),
          col((w ? 'w' : 'e') + 'r3', confHead(side), ['<div class="pair">' + box(w ? 12 : 13) + '</div>'])]; }
      var W = conf('WEST'), E = conf('EAST');
      return '<div class="tree">' + W.join('') + col('fin', esc(t('series.final')), ['<div class="cupwrap">' + cup + '</div><div class="pair">' + box(14) + '</div>']) + [E[2], E[1], E[0]].join('') + '</div>';
    },
    banner: function (rows, H, t, DATA) { var br = S.computeBracket(H.standings, rows.map(function (x) { return [x.wa, x.wb]; })), w = br[14].winner; return w ? teamBanner(DATA, H, w[0], t('cup.banner') + ' ' + sl(H.season)) : ''; },
    exportAll: true,
    csv: function (rows, season, H) { var br = S.computeBracket(H.standings, rows.map(function (x) { return [x.wa, x.wb]; })); return csv('franchise_id,season,round,conference,slot,team_a_code,team_b_code,wins_a,wins_b', br.filter(function (x) { return x.a && x.b && x.wa != null && x.wb != null; }).map(function (x) { return [1, season, x.round, x.conf, x.slot, x.a[0], x.b[0], x.wa, x.wb]; })); }
  };

  // ---- retraites : toutes les années dans une seule vue ; équipe + logo, poste, nom, Temple de la renommée (modifiable en tout temps), statistiques de carrière ----
  var RET_BLANK = 12;
  var MS = [['m05', 'ret.col_m05', 'S'], ['m075', 'ret.col_m075', 'S'], ['mp1', 'ret.col_mp1', 'S'], ['m20g', 'ret.col_m20g', 'S'], ['m30g', 'ret.col_m30g', 'S'], ['m50g', 'ret.col_m50g', 'S'], ['m50p', 'ret.col_m50p', 'S'], ['m75p', 'ret.col_m75p', 'S'], ['m100p', 'ret.col_m100p', 'S'], ['m20w', 'ret.col_m20w', 'G'], ['m30w', 'ret.col_m30w', 'G'], ['mc30w', 'ret.col_mc30w', 'G'], ['m40w', 'ret.col_m40w', 'G'], ['mwins', 'ret.col_mwins', 'G']];
  // compteurs d'honneurs de la fiche de retraite : [clé, libellé, poste(s) admis] (même règle que l'Excel : Norris défenseurs, Vézina et Jennings gardiens, Selke attaquants, Art-Ross, Lady Byng et Richard sans gardiens)
  var HON = [['cup', 'ret.col_h_cup', ''], ['art_ross', 'ret.col_h_art_ross', 'FD'], ['hart', 'ret.col_h_hart', ''], ['norris', 'ret.col_h_norris', 'D'], ['lady_byng', 'ret.col_h_lady_byng', 'FD'], ['calder', 'ret.col_h_calder', ''], ['conn_smythe', 'ret.col_h_conn_smythe', ''], ['vezina', 'ret.col_h_vezina', 'G'], ['jennings', 'ret.col_h_jennings', 'G'], ['masterton', 'ret.col_h_masterton', ''], ['selke', 'ret.col_h_selke', 'F'], ['ted_lindsay', 'ret.col_h_ted_lindsay', ''], ['rocket_richard', 'ret.col_h_rocket_richard', 'FD'], ['allstar', 'ret.col_h_allstar', '']];
  // nombre de fois de chaque honneur : avant la franchise (table historique) + les saisons de l'outil (trophées, équipes d'étoiles, joueurs inscrits sur la Coupe)
  function toolHonors(DATA) {
    var by = { allstar: {}, cup: {} }; Object.keys(DATA.base.awards || {}).forEach(function (y) { DATA.base.awards[y].forEach(function (x) { (by[x[0]] = by[x[0]] || {})[x[2]] = ((by[x[0]] || {})[x[2]] || 0) + 1; }); });
    Object.keys(DATA.base.allstar || {}).forEach(function (y) { DATA.base.allstar[y].forEach(function (x) { by.allstar[x[2]] = (by.allstar[x[2]] || 0) + 1; }); });
    Object.keys(DATA.base.cup_members || {}).forEach(function (y) { var seen = {}; DATA.base.cup_members[y].forEach(function (m) { if (!seen[m[1]]) { seen[m[1]] = 1; by.cup[m[1]] = (by.cup[m[1]] || 0) + 1; } }); });
    return by;
  }
  function honorOf(DATA, tool, r, code, allowed) {
    var key = S.retireKey(r.pos, r.name), g = S.PICK_GROUP[r.pos] || ''; if (!key || !g) return '';
    if (allowed && allowed.indexOf(g) < 0) return '';
    return ((((DATA.hist_awards || {})[code]) || {})[key] || 0) + (((tool[code]) || {})[key] || 0);
  }
  var retire = {
    k: 'retire', lbl: 'off.tab_retire', help: { where: ['off.help_retire_where_1', 'off.help_retire_where_2'], note: 'off.help_retire_note', order: ['off.help_retire_order_1', 'off.help_retire_order_2', 'off.help_retire_order_3', 'off.help_retire_order_4'], errors: ['off.help_retire_err_1', 'off.help_retire_err_2', 'off.help_retire_err_3'], alerts: ['off.help_retire_al_req', 'off.help_al_team', 'off.help_retire_al_dup', 'off.help_retire_al_season', 'off.help_retire_al_hof_delay', 'off.help_retire_al_hof_nom', 'off.help_retire_al_gp', 'off.help_retire_al_svp', 'off.help_retire_al_gaa', 'off.help_retire_al_pos', 'off.help_retire_al_ms'] }, hintKey: 'ret.hint', tableClass: 'retire', mode: 'fixed', multi: true, seasons: function () { return []; }, defaultSeason: function () { return 0; },
    playerGroup: function (def, r) { return def[0] === 'name' ? ({ C: 'F', LW: 'F', RW: 'F', LD: 'D', RD: 'D', G: 'G', F: 'F', D: 'D' }[r.pos] || '') : undefined; },   // choix d'un joueur avec saisie libre (FTPC)
    schema: [['season', 'ret.col_season', 'int'], ['team', 'col.team', 'team'], ['teamlogo', '', 'text'], ['pos', 'col.position', 'sel', POSOPT], ['name', 'col.player', 'text'], ['nominee', 'col.hof_nominee', 'sel', YN], ['hof', 'col.hof_year', 'int'],
             ['gp', 'ret.col_gp', 'int'], ['g', 'ret.col_g', 'int'], ['a', 'ret.col_a', 'int'], ['pts', 'ret.col_pts', 'text'], ['pm', 'ret.col_pm', 'int'], ['w', 'ret.col_w', 'int'], ['so', 'ret.col_so', 'int'], ['svp', 'stat.sv_pct', 'text'], ['gaa', 'ret.col_gaa', 'int', null, 'dec']]
      .concat(MS.map(function (m) { return [m[0], m[1], 'int']; })).concat(HON.map(function (h) { return ['h_' + h[0], h[1], 'text']; })),
    // info-bulle des titres de colonnes : jalons et honneurs
    // honneurs : l'image du trophée remplace le nom dans le titre (le nom reste en info-bulle) ; sans image (équipes d'étoiles), le texte est conservé
    headHTML: function (d, t) { if (d[0] === 'svp') return esc(t('stat.sv_pct', true)); if (/^h_/.test(d[0])) { var u = TROPHY_IMG[d[0] === 'h_cup' ? 'stanley_cup' : d[0].slice(2)]; return u ? '<img class="trophy hi" src="' + u + '" alt="">' : null; } return null; },
    headTip: function (d, t) { if (/^m/.test(d[0]) && MS.some(function (m) { return m[0] === d[0]; })) return t('ret.tip_' + d[0]); if (/^h_/.test(d[0])) return t('ret.tip_' + d[0]); return ''; },
    placeholder: function (def) { return def[0] === 'season' ? '2040' : def[0] === 'svp' ? '.915' : def[0] === 'gaa' ? '2.50' : ''; },
    // joueurs de champ : B, A, P, +/- et jalons des joueurs de champ ; gardiens : V, BL, % d'arrêts, MBA et jalons des gardiens (les cases qui ne s'appliquent pas au poste sont grisées)
    cellRO: function (def, r, i, rows, H) {
      var c = def[0], goalie = r.pos === 'G', skater = r.pos && r.pos !== 'G', na = { text: '', cls: 'na' };
      if (c === 'teamlogo') return { html: r.team ? H.logo(r.team) : '', cls: 'lg' };
      if (c === 'pts') return skater ? { text: filled(r.g) || filled(r.a) ? String((+r.g || 0) + (+r.a || 0)) : '', cls: 'calc' } : na;
      if (goalie && (c === 'g' || c === 'a' || c === 'pm')) return na;
      if (skater && (c === 'w' || c === 'so' || c === 'svp' || c === 'gaa')) return na;
      // SV% calculé (carrière entièrement en base) : lecture seule ; sinon la case reste à saisir
      if (c === 'svp' && goalie) { var sv = retireSv(r); if (sv.source === 'calc') return { text: FSTAT.fmtSvPct(sv.value, H && H.lang), cls: 'calc' }; }
      var ms = MS.filter(function (m) { return m[0] === c; })[0]; if (ms) return (ms[2] === 'S' && goalie) || (ms[2] === 'G' && skater) ? na : null;
      if (c.indexOf('h_') === 0) { var code = c.slice(2), h = HON.filter(function (x) { return x[0] === code; })[0], v = r.h ? r.h[code] : ''; return v === '' || v == null ? na : { text: String(v), cls: 'calc' + (v === 0 ? ' zero' : '') }; }
      return null;
    },
    fixed: function (_s, H, DATA) {
      GK_CAREER = DATA.base.gk_career || {};
      var rows = [], years = Object.keys(DATA.base.retire).sort(), tool = toolHonors(DATA), nn = function (v) { return v == null ? '' : v; };
      years.forEach(function (y) { DATA.base.retire[y].forEach(function (x) {
        var sp = splitKey(x[2]), row = { season: +y, team: x[0] || '', pos: x[1] || '', name: sp[1], nominee: x[3] || filled(x[4]) ? 'yes' : '', hof: nn(x[4]), id: x[5], key: x[2], gp: nn(x[6]), g: nn(x[7]), a: nn(x[8]), pm: nn(x[9]), w: nn(x[10]), so: nn(x[11]), svp: nn(x[12]), gaa: nn(x[13]) };
        MS.forEach(function (m, k) { row[m[0]] = nn(x[14 + k]); }); row.h = {}; HON.forEach(function (h) { row.h[h[0]] = honorOf(DATA, tool, row, h[0], h[2]); }); rows.push(row); }); });
      for (var i = 0; i < RET_BLANK; i++) { var b = { season: '', team: '', pos: '', name: '', nominee: '', hof: '', gp: '', g: '', a: '', pm: '', w: '', so: '', svp: '', gaa: '' }; MS.forEach(function (m) { b[m[0]] = ''; }); rows.push(b); }
      return rows;
    },
    // % AR : saisi « .915 », « 0,915 » ou « 91,5 » ; gardé en décimal (0.915) ; affiché « 91,5 % » / « 91.5% »
    parseCell: function (def, v) { if (def[0] !== 'svp') return undefined; var x = FSTAT.parseSvPct(v); return x !== '' && isNaN(x) ? false : x; },
    fmtCell: function (def, v, lang) { return def[0] === 'svp' && v !== '' && v != null ? FSTAT.fmtSvPct(v, lang) : v; },
    validate: function (rows, H) { return S.validateRetire(rows, H); },
    csv: function (rows) { return csv('retired_season,team_code,position,player_key,hof_nominee,hof_year,gp,g,a,plus_minus,w,so,sv_pct,gaa,' + MS.map(function (m) { return m[0]; }).join(','), rows.filter(function (r) { return r.name; }).map(function (r) { return [r.season, r.team, r.pos, S.retireKey(r.pos, r.name), r.nominee === 'yes' || filled(r.hof) ? 1 : 0, r.hof, r.gp, r.g, r.a, r.pm, r.w, r.so, r.svp, r.gaa].concat(MS.map(function (m) { return r[m[0]]; })); })); }
  };


  // ======================= SYNCHRONISATION SUPABASE =======================
  // plan(rows, season, c) retourne une liste d'opérations ; pull(client, season, c) met à jour DATA.base avec le contenu de la base et retourne le nombre de lignes.
  // c = { fid, lk (team/award id <-> code), DATA }
  // Trophées, étoiles, Coupe et retraites : on tape un nom ; la ligne est envoyée avec player_key, et le trigger de transition (migration 56) y met le player_id du joueur qui porte cette clé (historiques compris).
  function filled(v) { return v !== '' && v != null; }
  var PLANS = {
    // Classement : la saison entière en un envoi (ajouter ou mettre à jour d'abord, puis retirer les équipes absentes ; migration 70) ; DPR, résultat, rangs calculés par S.standCalc
    standings: {
      plan: function (rows, season, c) {
        var D = c.DATA, H = helpers(D, { season: season, lang: 'fr', entries: {} }), C = S.standCalc(rows, stdCtx(H));
        return [{ op: 'upsertset', table: 'standing', conflict: 'franchise_id,season,team_code', match: { season: season }, rows: C.filter(function (x) { return x.code && x.ok; }).map(function (x) {
          return { franchise_id: c.fid, season: season, team_id: c.lk.teamId[x.code] || null, team_code: x.code, overall_rank: x.i + 1, w: x.w, l: x.l, otl: x.otl, clinch: x.q || null, conference: x.conf || null, division: x.div || null, division_rank: x.dr || null, draft_rank: x.draft || null };
        }) }];
      },
      pull: async function (cl, season, c) {
        var r = await cl.select('standing', 'select=team_code,overall_rank,w,l,otl,points,conference,division,division_rank,draft_rank&season=eq.' + season + '&order=overall_rank'), k = String(season);
        c.DATA.base.standing = c.DATA.base.standing || {}; c.DATA.standings = c.DATA.standings || {}; c.DATA.ranks = c.DATA.ranks || {};
        c.DATA.base.standing[k] = r.map(function (x) { return [x.team_code, x.w, x.l, x.otl]; });
        c.DATA.standings[k] = r.map(function (x) { return [x.team_code, x.overall_rank, x.points, x.conference, x.division, x.division_rank]; });
        var rk = {}; r.forEach(function (x) { rk[x.team_code] = x.draft_rank; }); c.DATA.ranks[k] = rk; return r.length;
      }
    },
    roles: {
      plan: function (rows, season, c) { return [{ op: 'replace', table: 'role_assignment', match: { season: season }, rows: rows.filter(function (r) { return r.pid; }).map(function (r) { return { franchise_id: c.fid, season: season, slot: r.slot, player_id: r.pid }; }) }]; },
      pull: async function (cl, season, c) { var r = await cl.select('role_assignment', 'select=slot,player_id&season=eq.' + season); var o = {}; r.forEach(function (x) { o[x.slot] = x.player_id; }); c.DATA.base.roles[String(season)] = o; return r.length; }
    },
    ratings: {
      plan: function (rows, season, c) { return [{ op: 'upsert', table: 'player_rating', conflict: 'franchise_id,player_id,season', rows: rows.filter(function (r) { return filled(r.oa); }).map(function (r) { return { franchise_id: c.fid, player_id: r.pid, season: season, oa: +r.oa }; }) }]; },
      pull: async function (cl, season, c) { var r = await cl.select('player_rating', 'select=player_id,oa&season=eq.' + season); var o = {}; r.forEach(function (x) { o[x.player_id] = x.oa; }); c.DATA.base.ratings[String(season)] = o; return r.length; }
    },
    schedule: {
      plan: function (rows, season, c) { return [{ op: 'upsertset', table: 'schedule_game', conflict: 'franchise_id,season,game_no', match: { season: season }, rows: rows.filter(function (r) { return r.date && r.opp; }).map(function (r) { return { franchise_id: c.fid, season: season, game_no: r.game, game_date: r.date, opponent_code: r.opp }; }) }]; },
      pull: async function (cl, season, c) { var r = await cl.select('schedule_game', 'select=game_no,game_date,opponent_code&season=eq.' + season + '&order=game_no'); c.DATA.base.schedule[String(season)] = r.map(function (x) { return [x.game_no, x.game_date, x.opponent_code]; }); return r.length; }
    },
    cap: {
      plan: function (rows, _s, c) { var a = ahlOf(rows); return [{ op: 'upsert', table: 'salary_cap_season', conflict: 'franchise_id,season', rows: rows.filter(function (r) { return filled(r.cap); }).map(function (r) { return { franchise_id: c.fid, season: r.season, effective_on: r.season + '-07-01', cap: +r.cap, floor: filled(r.floor) ? +r.floor : null, player_min: filled(r.min) ? +r.min : null, player_max_one_way: S.maxSalary(+r.cap), player_max_two_way: filled(r.max2) ? +r.max2 : null, ahl_exemption: a }; }) }]; },
      pull: async function (cl, _s, c) { var r = await cl.select('salary_cap_season', 'select=season,cap,floor,player_min,player_max_one_way,player_max_two_way,ahl_exemption,effective_on&order=season'); c.DATA.cap = r.map(function (x) { return [x.season, x.cap, x.floor, x.player_min, x.player_max_one_way, x.player_max_two_way, x.ahl_exemption, x.effective_on]; }); return r.length; }
    },
    lottery: {
      plan: function (rows, year, c) { return [{ op: 'upsertset', table: 'draft_lottery', conflict: 'franchise_id,draft_year,pick', match: { draft_year: year }, rows: rows.filter(function (r) { return filled(r.pre); }).map(function (r) { var code = r.owner || rankTeamAt(c.DATA, year, +r.pre) || null; return { franchise_id: c.fid, draft_year: year, pick: r.pick, pre_lottery_rank: +r.pre, team_id: code ? c.lk.teamId[code] || null : null, team_code: code }; }) }]; },
      pull: async function (cl, year, c) { var r = await cl.select('draft_lottery', 'select=pick,pre_lottery_rank,team_code&draft_year=eq.' + year + '&order=pick'); c.DATA.base.lottery[String(year)] = r.map(function (x) { return [x.pick, x.pre_lottery_rank, x.team_code]; }); return r.length; }
    },
    top3: {
      plan: function (rows, _s, c) {
        var by = {}; rows.forEach(function (r) { (by[r.year] = by[r.year] || []).push(r); });
        return Object.keys(by).filter(function (y) { return by[y].some(function (r) { return r.name; }) || (c.DATA.base.top3[y] || []).length; }).map(function (y) { return { op: 'upsertset', table: 'draft_top3', conflict: 'franchise_id,draft_year,pick', match: { draft_year: +y }, rows: by[y].filter(function (r) { return r.name; }).map(function (r) { return { franchise_id: c.fid, draft_year: +y, pick: r.pick, team_id: (r.team || r.lotteryTeam) ? c.lk.teamId[r.team || r.lotteryTeam] || null : null, player_name: r.name, position: r.pos || null, potential: r.potential || null }; }) }; });
      },
      pull: async function (cl, _s, c) { var r = await cl.select('draft_top3', 'select=draft_year,pick,team_id,player_name,position,potential&order=draft_year,pick'); c.DATA.base.top3 = {}; r.forEach(function (x) { (c.DATA.base.top3[String(x.draft_year)] = c.DATA.base.top3[String(x.draft_year)] || []).push([x.pick, x.team_id != null ? (c.lk && c.lk.teamCode[x.team_id]) || null : null, x.player_name, x.position, x.potential]); }); return r.length; }
    },
    picks: {
      // les joueurs repêchés sont créés (ou mis à jour) d'abord, puis les choix de chaque année sont remplacés : les nouveaux sont ajoutés avant de retirer les anciens
      plan: function (rows, _s, c) {
        var used = rows.filter(function (r) { return filled(r.year) && (r.first || r.last); });
        return [{ op: 'custom', run: async function (client) {
          var nn = function (v) { return v === '' || v == null ? null : v; }, myCode = c.DATA.franchise.code, myTeam = (c.DATA.teams.filter(function (t) { return t.code === myCode; })[0] || { en: myCode }).en;
          var existing = {}; (await client.select('player', 'select=id,legacy_key&origin=eq.franchise')).forEach(function (p) { existing[p.legacy_key] = p.id; });
          var fields = function (r, key) {
            var o = { first_name: r.first, last_name: r.last, full_name: (r.first + ' ' + r.last).trim(), legacy_key: key, birth_date: nn(r.birth), height_in: filled(r.height) ? Math.round(+r.height) : null, weight_lb: filled(r.weight) ? Math.round(+r.weight) : null, handedness: HANDDB[r.hand] || null, player_type: nn(r.ptype), country: nn(r.country), draft_year: +r.year, draft_round: filled(r.round) ? +r.round : null, draft_pick: filled(r.overall) ? +r.overall : null, draft_team: myTeam };
            if (r.pos) { o.position_original = r.pos; o.position_current = r.pos; } return o;
          };
          var keyOf = function (r) { var prefix = r.key ? r.key.slice(0, 4) : (POSGRP[r.pos] || 'F') + ' - '; return prefix + (r.first + ' ' + r.last).trim(); };
          // joueurs (création ou mise à jour des seules valeurs remplies) puis choix de chaque année, en un seul appel transactionnel
          await client.rpc('ft_save_draft_picks', { p_franchise_id: c.fid, p_years: Object.keys(c.DATA.base.picks).map(Number), p_rows: used.map(function (r) {
            // joueur déjà repêché : par son id ; « Oui, c'est lui » : le joueur existant (sans toucher à son nom ni à sa clé) ; sinon création
            // (plus de reprise silencieuse par la clé : un homonyme est demandé à l'écran, migration 71 ; la base calcule la clé d'un homonyme confirmé)
            var key = keyOf(r), hc = pickCands(r, c.DATA.homo), hs = HO.status(hc, r.homo), id = r.pid || (r.key && existing[r.key]) || (hs === 'yes' ? r.homo.yes : null), f = fields(r, key), player;
            if (id) { player = { id: id }; Object.keys(f).forEach(function (k) { if (f[k] !== null && f[k] !== '' && f[k] !== undefined && (r.pid || ['first_name', 'last_name', 'full_name', 'legacy_key'].indexOf(k) < 0)) player[k] = f[k]; }); if (!r.pid) player.origin = 'franchise'; }
            else { player = Object.assign({}, f, { origin: 'franchise' }); if (!player.position_original) player.position_original = POSGRP[r.pos] || null; if (hs === 'no') { player.distinct_from = r.homo.no; delete player.legacy_key; } }
            return { player: player, pick: { draft_year: +r.year, round: filled(r.round) ? +r.round : 1, original_team_id: c.lk.teamId[r.orig || myCode] || null, original_team_code: r.orig || myCode, overall_pick: filled(r.overall) ? +r.overall : null, selected_player_key: key } };
          }) });
        } }];
      },
      pull: async function (cl, _s, c) {
        var r = await cl.select('draft_pick', 'select=draft_year,round,original_team_code,overall_pick,selected_player_id,selected_player_key,status&status=eq.selected&order=draft_year,overall_pick'), ids = r.map(function (x) { return x.selected_player_id; }).filter(Boolean), by = {};
        if (ids.length) (await cl.select('player', 'select=id,first_name,last_name,position_current,height_in,weight_lb,birth_date,handedness,country,player_type&id=in.(' + ids.join(',') + ')')).forEach(function (p) { by[p.id] = p; });
        c.DATA.base.picks = {}; r.forEach(function (x) { (c.DATA.base.picks[String(x.draft_year)] = c.DATA.base.picks[String(x.draft_year)] || []).push(pickRowFromDb(x, by[x.selected_player_id])); }); return r.length;
      }
    },
    awards: {
      // l'équipe d'un deuxième ou troisième récipiendaire : celle déjà enregistrée si le joueur n'a pas changé, sinon la nôtre si c'est un de nos joueurs
      plan: function (rows, season, c) {
        var mine = {}; c.DATA.players.forEach(function (p) { mine[p.key] = 1; }); var my = c.DATA.franchise.code, out = [];
        rows.forEach(function (r) {
          [['', 1], ['2', 2], ['3', 3]].forEach(function (s) {
            var k = S.awardKey(r.code, s[0] ? r['pos' + s[0]] : r.pos, s[0] ? r['name' + s[0]] : r.name); if (!k) return;
            var team = s[1] === 1 ? r.team || null : (r['base' + s[1]] === k && r['bteam' + s[1]]) || (mine[k] ? my : null);
            var v = s[1] === 1 ? r.value : s[1] === 2 && r.code === 'jennings' ? r.val2 : '';
            out.push({ franchise_id: c.fid, award_id: c.lk.awardId[r.code], season: season, place: s[1], player_key: k, team_code: team, stat_value: filled(v) ? +v : null });
          });
        });
        return [{ op: 'replace', table: 'award_win', match: { season: season }, rows: out }];
      },
      pull: async function (cl, season, c) { var r = await cl.select('award_win', 'select=award_id,place,player_key,team_code,stat_value&season=eq.' + season + '&order=id'); c.DATA.base.awards[String(season)] = r.map(function (x) { return [c.lk.awardCode[x.award_id], x.place, x.player_key, x.team_code, x.stat_value]; }); return r.length; }
    },
    allstar: {
      plan: function (rows, season, c) { return [{ op: 'replace', table: 'all_star_selection', match: { season: season }, rows: rows.filter(function (r) { return r.name; }).map(function (r) { var k = r.pos + ' - ' + String(r.name).trim(); return { franchise_id: c.fid, season: season, team_level: r.lvl, position: r.pos, player_key: k, team_code: r.team || null }; }) }]; },
      pull: async function (cl, season, c) { var r = await cl.select('all_star_selection', 'select=team_level,position,player_key,team_code&season=eq.' + season + '&order=id'); c.DATA.base.allstar[String(season)] = r.map(function (x) { return [x.team_level, x.position, x.player_key, x.team_code]; }); return r.length; }
    },
    cup: {
      plan: function (rows, season, c) {
        var r = rows[0], mem = rows.filter(function (x, i) { return i && x.name && String(x.name).trim(); }), had = ((c.DATA.base.cup_members || {})[String(season)] || []).length, ops = [{ op: 'upsert', table: 'stanley_cup_result', conflict: 'franchise_id,season', rows: r.champion ? [{ franchise_id: c.fid, season: season, champion_team_id: c.lk.teamId[r.champion] || null }] : [] }];
        if (mem.length || had) ops.push({ op: 'replace', table: 'stanley_cup_member', match: { season: season }, rows: mem.map(function (x) { var k = x.grp + ' - ' + String(x.name).trim(); return { franchise_id: c.fid, season: season, position_group: x.grp, sort_order: x.slot, player_key: k }; }) });
        return ops;
      },
      pull: async function (cl, season, c) {
        var r = await cl.select('stanley_cup_result', 'select=champion_team_id&season=eq.' + season); if (r.length) c.DATA.base.cup[String(season)] = c.lk.teamCode[r[0].champion_team_id] || ''; else delete c.DATA.base.cup[String(season)];
        c.DATA.base.cup_members = c.DATA.base.cup_members || {};
        try { var m = await cl.select('stanley_cup_member', 'select=position_group,player_key&season=eq.' + season + '&order=position_group,sort_order,id'); c.DATA.base.cup_members[String(season)] = m.map(function (x) { return [x.position_group, x.player_key]; }); } catch (e) { /* table absente : migration 42 pas encore exécutée */ }
        return r.length;
      }
    },
    series: {
      plan: function (rows, season, c) {
        var br = S.computeBracket((c.DATA.standings || {})[String(season)] || [], rows.map(function (x) { return [x.wa, x.wb]; }));
        return [{ op: 'upsertset', table: 'playoff_series', conflict: 'franchise_id,season,round,conference,slot', match: { season: season }, rows: br.filter(function (x) { return x.a && x.b && x.winner; }).map(function (x) {
          return { franchise_id: c.fid, season: season, round: x.round, conference: x.conf, slot: x.slot, team_a_id: c.lk.teamId[x.a[0]] || null, team_a_code: x.a[0], team_b_id: c.lk.teamId[x.b[0]] || null, team_b_code: x.b[0], wins_a: x.wa, wins_b: x.wb, winner_team_id: c.lk.teamId[x.winner[0]] || null }; }) }];
      },
      pull: async function (cl, season, c) {
        var r = await cl.select('playoff_series', 'select=round,conference,slot,wins_a,wins_b&season=eq.' + season), m = {};
        r.forEach(function (x) { m[x.round + '|' + x.conference + '|' + x.slot] = [x.wa === undefined ? x.wins_a : x.wins_a, x.wins_b]; });
        c.DATA.base.series = c.DATA.base.series || {}; if (r.length) c.DATA.base.series[String(season)] = S.SERIES_ORDER.map(function (o) { return m[o.join('|')] || null; }); else delete c.DATA.base.series[String(season)]; return r.length;
      }
    },
    retire: {
      // seules les lignes modifiées sont envoyées : celles qui existent déjà (id) sont mises à jour, les nouvelles sont ajoutées
      plan: function (rows, _s, c) {
        var ok = rows.filter(function (r) { return r.name && String(r.name).trim() && filled(r.season) && r.pos; }), mk = function (r) { var k = S.retireKey(r.pos, r.name), nn = function (v) { return filled(v) ? +v : null; }; return { franchise_id: c.fid, retired_season: +r.season, player_key: k, team_code: r.team || null, position: r.pos, hof_nominee: r.nominee === 'yes' || filled(r.hof), hof_year: nn(r.hof), gp: nn(r.gp), g: r.pos === 'G' ? null : nn(r.g), a: r.pos === 'G' ? null : nn(r.a), plus_minus: r.pos === 'G' ? null : nn(r.pm), w: r.pos === 'G' ? nn(r.w) : null, so: r.pos === 'G' ? nn(r.so) : null, sv_pct: r.pos === 'G' ? nn(r.svp) : null, gaa: r.pos === 'G' ? nn(r.gaa) : null, ms_g05: r.pos === 'G' ? null : nn(r.m05), ms_a075: r.pos === 'G' ? null : nn(r.m075), ms_p1: r.pos === 'G' ? null : nn(r.mp1), ms_20g: r.pos === 'G' ? null : nn(r.m20g), ms_30g: r.pos === 'G' ? null : nn(r.m30g), ms_50g: r.pos === 'G' ? null : nn(r.m50g), ms_50p: r.pos === 'G' ? null : nn(r.m50p), ms_75p: r.pos === 'G' ? null : nn(r.m75p), ms_100p: r.pos === 'G' ? null : nn(r.m100p), ms_20w: r.pos === 'G' ? nn(r.m20w) : null, ms_30w: r.pos === 'G' ? nn(r.m30w) : null, ms_c30w: r.pos === 'G' ? nn(r.mc30w) : null, ms_40w: r.pos === 'G' ? nn(r.m40w) : null, ms_wins: r.pos === 'G' ? nn(r.mwins) : null }; };
        var ups = ok.filter(function (r) { return r.id != null && r.id !== ''; }).map(function (r) { return Object.assign({ id: r.id }, mk(r)); }), news = ok.filter(function (r) { return r.id == null || r.id === ''; }).map(mk), ops = [];
        if (ups.length) ops.push({ op: 'upsert', table: 'retirement', conflict: 'id', rows: ups }); if (news.length) ops.push({ op: 'insert', table: 'retirement', rows: news }); return ops;
      },
      pull: async function (cl, _s, c) { var r = await cl.select('retirement', 'select=id,retired_season,team_code,position,player_key,hof_nominee,hof_year,gp,g,a,plus_minus,w,so,sv_pct,gaa,ms_g05,ms_a075,ms_p1,ms_20g,ms_30g,ms_50g,ms_50p,ms_75p,ms_100p,ms_20w,ms_30w,ms_c30w,ms_40w,ms_wins&order=retired_season,id'); c.DATA.base.retire = {}; r.forEach(function (x) { (c.DATA.base.retire[String(x.retired_season)] = c.DATA.base.retire[String(x.retired_season)] || []).push([x.team_code, x.position, x.player_key, x.hof_nominee ? 1 : 0, x.hof_year, x.id, x.gp, x.g, x.a, x.plus_minus, x.w, x.so, x.sv_pct, x.gaa, x.ms_g05, x.ms_a075, x.ms_p1, x.ms_20g, x.ms_30g, x.ms_50g, x.ms_50p, x.ms_75p, x.ms_100p, x.ms_20w, x.ms_30w, x.ms_c30w, x.ms_40w, x.ms_wins]); }); return r.length; }
    }
  };
  [roles, ratings, schedule, standings, cap, lottery, top3, picks, awards, allstar, cup, series, retire].forEach(function (tb) { Object.assign(tb, PLANS[tb.k]); });

  var CFGS = {
    pre: { storeKey: 'ft_pre_v1', titleKey: 'pre.title', help: { screen: 'preseason', prefix: 'pre.', h: { where: 'ev.help_h_where', order: 'entry.help_h_order', errors: 'entry.help_h_errors', alerts: 'entry.help_h_alerts' },
      common: ['pre.help_c_flow', 'pre.help_c_season', 'pre.help_c_send', 'entry.help_c_paste', 'entry.help_c_badge', 'entry.help_c_refused', 'pre.help_c_bar'] },   // aide en contexte (ft_help_preseason)
      helpers: helpers, nav: [], tabs: [cap, roles, ratings, schedule] },   // phase 4b : Plafond déplacé de Saison morte (décision du 2026-11-18)
    off: { storeKey: 'ft_off_v1', titleKey: 'off.title', help: { screen: 'offseason', prefix: 'off.', h: { where: 'ev.help_h_where', order: 'entry.help_h_order', errors: 'entry.help_h_errors', alerts: 'entry.help_h_alerts' },
      common: ['off.help_c_flow', 'off.help_c_season', 'off.help_c_send', 'entry.help_c_numbers', 'entry.help_c_paste', 'entry.help_c_badge', 'entry.help_c_refused', 'pre.help_c_bar'] },   // aide en contexte (ft_help_offseason)
      helpers: helpers, nav: [], tabs: [standings, series, cup, awards, allstar, cap, retire, lottery, top3, picks] }
  };
  // phase 4b : Saison morte répartie en trois groupes (docs/NAVIGATION.md) ; CFGS.off garde tous ses onglets pour les tests du moteur (season/test_*.js), aucune page ne l'utilise
  // aide : titre et boutons propres au groupe (res., hon., dft. : help_title, help_show, help_hide, help_h_common) ; aide des onglets et aide commune inchangées
  function part(key, titleKey, screen, prefix, tabs) { var o = Object.assign({}, CFGS.off, { storeKey: key, titleKey: titleKey, tabs: tabs }); o.help = Object.assign({}, CFGS.off.help, { screen: screen, prefix: prefix }); return o; }
  CFGS.results = part('ft_results_v1', 'nav.g.results', 'results', 'res.', [standings, series, cup]);
  CFGS.honors = part('ft_honors_v1', 'nav.g.honors', 'honors', 'hon.', [awards, allstar, retire]);
  CFGS.draft = part('ft_draft_v1', 'nav.g.draft', 'draft', 'dft.', [lottery, top3, picks]);
  var api = { CFGS: CFGS, helpers: helpers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTCFG = api;
})(typeof window !== 'undefined' ? window : this);
