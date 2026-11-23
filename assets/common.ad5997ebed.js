/* Mesure légère des temps de chargement (performance.mark / measure).
   Chaque étape (connexion, chaque table, assemblage, rendu) est mesurée ; le résumé est écrit dans la console
   et, si l'adresse contient ?perf=1, dans un petit panneau en bas à droite de la page. Outil de diagnostic :
   les noms affichés sont des identifiants techniques, pas des textes de l'interface. */
(function (root) {
  var hasPerf = typeof performance !== 'undefined' && typeof performance.now === 'function';
  var now = hasPerf ? function () { return performance.now(); } : function () { return Date.now(); };
  var rows = [], seq = 0, panelOn = false;
  try { panelOn = /[?&]perf=1(&|$)/.test(root.location.search); } catch (e) { panelOn = false; }
  // span('table:player') démarre une mesure ; la fonction retournée la termine (extra : nombre de lignes, octets…)
  function span(name) {
    var id = 'ft:' + name + ':' + (++seq), t = now();
    try { performance.mark(id + ':s'); } catch (e) { /* ignore */ }
    return function (extra) {
      var d = now() - t; try { performance.mark(id + ':e'); performance.measure('ft:' + name, id + ':s', id + ':e'); } catch (e) { /* ignore */ }
      rows.push({ step: name, start: Math.round(t), ms: Math.round(d), extra: extra == null ? '' : extra }); return d;
    };
  }
  function navInfo() {
    try { var n = performance.getEntriesByType('navigation')[0]; if (n) return { html_ms: Math.round(n.responseEnd), html_ko: Math.round((n.transferSize || n.encodedBodySize || 0) / 1024), dcl_ms: Math.round(n.domContentLoadedEventEnd) }; } catch (e) { /* ignore */ }
    return null;
  }
  // résumé : appelé après le premier rendu avec les données (ou après une erreur)
  // since : début du chargement (clic sur « Connexion » ou ouverture avec session) ; load_ms = durée depuis ce moment, sans le temps de saisie du mot de passe
  function report(label, since) {
    var nav = navInfo(), total = Math.round(now()), load = since == null ? null : Math.round(now() - since), out = { label: label || 'load', total_ms: total, load_ms: load, nav: nav, steps: rows.slice() };
    root.__ftperf = out;
    try {
      if (root.console && console.groupCollapsed) {
        console.groupCollapsed('[ft-perf] ' + out.label + ' : ' + (load != null ? load + ' ms depuis le début du chargement, ' : '') + total + ' ms depuis l\'ouverture de la page' + (nav ? ' (page ' + nav.html_ko + ' Ko, HTML reçu à ' + nav.html_ms + ' ms)' : ''));
        if (console.table) console.table(rows.map(function (r) { return { step: r.step, start_ms: r.start, ms: r.ms, extra: r.extra }; })); console.groupEnd();
      }
    } catch (e) { /* ignore */ }
    if (panelOn) drawPanel(out);
    return out;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function drawPanel(out) {
    var d = root.document; if (!d || !d.body) return;
    var el = d.getElementById('ft-perf'); if (!el) { el = d.createElement('div'); el.id = 'ft-perf'; d.body.appendChild(el); }
    el.setAttribute('style', 'position:fixed;right:8px;bottom:8px;z-index:9999;max-height:45vh;overflow:auto;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;background:rgba(20,22,30,.92);color:#e8e8e8;padding:6px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3)');
    var max = out.steps.reduce(function (m, r) { return Math.max(m, r.start + r.ms); }, 1);
    el.innerHTML = '<details' + (el.dataset.open === '0' ? '' : ' open') + '><summary style="cursor:pointer">perf · ' + esc(out.label) + ' · ' + (out.load_ms != null ? 'chargement ' + out.load_ms + ' ms · ouverture ' : '') + out.total_ms + ' ms' + (out.nav ? ' · html ' + out.nav.html_ko + ' Ko' : '') + '</summary><table style="border-collapse:collapse;margin-top:4px">' +
      out.steps.map(function (r) { var l = Math.round(r.start / max * 120), w = Math.max(1, Math.round(r.ms / max * 120)); return '<tr><td style="padding-right:8px">' + esc(r.step) + '</td><td style="text-align:right;padding-right:6px">' + r.ms + '</td><td><span style="display:inline-block;width:120px;height:6px;position:relative;background:rgba(255,255,255,.08)"><span style="position:absolute;left:' + l + 'px;width:' + w + 'px;height:6px;background:#5dade2"></span></span></td><td style="padding-left:6px;color:#aaa">' + esc(r.extra) + '</td></tr>'; }).join('') + '</table></details>';
    var det = el.querySelector('details'); det.addEventListener('toggle', function () { el.dataset.open = det.open ? '1' : '0'; });
  }
  function reset() { rows = []; }
  var api = { now: now, span: span, report: report, reset: reset, rows: function () { return rows; }, enabled: panelOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTPERF = api;
})(typeof window !== 'undefined' ? window : this);

;/* Calculs et formats statistiques communs à toutes les pages (testable avec Node).
 * Règle unique du SV% : .claude/skills/ft-formules/formules.md (« SV% de saison » et « SV% de carrière »).
 * Même règle en Python : import/ft_stats.py. */
(function (root) {
  function num(v) { return v == null || String(v).trim() === '' || isNaN(v) ? null : +v; }

  // SV% d'une saison = arrêts ÷ tirs contre. null si l'un manque ou si les tirs sont 0 (tirs inconnus avant 1955).
  function svPct(saves, shotsAgainst) {
    var sv = num(saves), sa = num(shotsAgainst);
    return sv === null || sa === null || sa <= 0 ? null : sv / sa;
  }

  // SV% de carrière (option hybride, décision du 2026-11-11).
  // seasons : [{ gp, saves, shots_against }] (saisons régulières en base) ; careerGp : PJ de carrière saisis dans retirement (ou null) ;
  // entered : retirement.sv_pct saisi (ou null).
  // Calculé (Σ arrêts ÷ Σ tirs sur les saisons où les deux sont connus et tirs > 0) quand les saisons en base couvrent
  // toute la carrière (Σ PJ en base ≥ careerGp, careerGp connu) ; sinon la valeur saisie est gardée.
  // Renvoie { value, source } avec source = 'calc', 'saisi' ou null.
  function careerSvPct(seasons, careerGp, entered) {
    var gp = 0, sv = 0, sa = 0;
    (seasons || []).forEach(function (s) {
      gp += num(s.gp) || 0;
      var a = num(s.saves), b = num(s.shots_against);
      if (a !== null && b !== null && b > 0) { sv += a; sa += b; }
    });
    var cg = num(careerGp), e = num(entered);
    // PJ de carrière vides : on ne sait pas si la base couvre la carrière → pas de calcul, la valeur saisie (ou rien)
    if (cg !== null && gp >= cg && sa > 0) return { value: sv / sa, source: 'calc' };
    return e === null ? { value: null, source: null } : { value: e, source: 'saisi' };
  }

  // Affichage : FR « 90,6 % » (une décimale, virgule, espace insécable avant %), EN « 90.6% » ; « — » si vide.
  function fmtSvPct(v, lang) {
    var x = num(v); if (x === null) return '—';
    var s = (Math.round(x * 1000) / 10).toFixed(1);
    return lang === 'en' ? s + '%' : s.replace('.', ',') + ' %';
  }

  // Saisie : « .915 », « 0,915 », « 91,5 », « 91,5 % » → 0.915 (trois décimales, comme retirement.sv_pct) ; '' si vide ; NaN si illisible.
  function parseSvPct(text) {
    var t = String(text == null ? '' : text).replace(/[\s  %]/g, '').replace(',', '.');
    if (t === '') return '';
    if (isNaN(t)) return NaN;
    var x = +t; if (x > 1) x = x / 100;
    return Math.round(x * 1000) / 1000;
  }

  var api = { svPct: svPct, careerSvPct: careerSvPct, fmtSvPct: fmtSvPct, parseSvPct: parseSvPct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTSTATS = api;
})(typeof window !== 'undefined' ? window : this);

;/* Petit client Supabase sans dépendance : connexion par courriel, lecture, écriture, comptage. Utilise seulement fetch. */
(function (root) {
  // Tables propres à une franchise : chaque lecture et chaque modification est filtrée sur la franchise active (franchise_id).
  var SCOPED = ['player', 'player_stint', 'skater_season_stats', 'goalie_season_stats', 'team_season_stats', 'standing', 'playoff_series', 'award_win', 'all_star_selection',
    'stanley_cup_result', 'stanley_cup_member', 'salary_cap_season', 'contract', 'offer_sheet', 'offer_sheet_pick', 'data_issue', 'trade', 'roster_move',
    'player_rating', 'schedule_game', 'position_change', 'role_assignment', 'draft_pick_initial', 'draft_pick_value', 'draft_pick', 'draft_lottery', 'draft_top3', 'retirement', 'franchise_league_team',
    'historical_award_counts', 'projected_level', 'v_contract_year_level', 'v_skater_career_totals', 'v_skater_career_records', 'v_skater_season_records', 'hr_job', 'v_player_career'];
  // Tables enfants sans franchise_id : filtrées par leur parent (embarqué vide de PostgREST, « parent!inner() »)
  var CHILD = { contract_year: 'contract', trade_asset: 'trade' };
  var SCOPED_SET = {}; SCOPED.forEach(function (t) { SCOPED_SET[t] = 1; });
  // Ajoute le filtre de la franchise active à une requête PostgREST (select=… ; filtres…). fid absent : erreur, jamais de lecture sans filtre.
  function scopeQuery(table, query, fid, forRead) {
    var q = query || '';
    if (!SCOPED_SET[table] && !CHILD[table] && table !== 'team') return q;
    if (fid == null && table === 'team') return q ? q + '&owner_franchise_id=is.null' : 'owner_franchise_id=is.null';
    if (fid == null) { var e = new Error('no active franchise'); e.code = 'FT_NO_FRANCHISE'; throw e; }
    var add;
    if (SCOPED_SET[table]) add = 'franchise_id=eq.' + fid;
    else if (CHILD[table]) {
      if (!forRead) return q;          // modification d'une table enfant : elle vise des ids de parent déjà filtrés par franchise (et la RLS)
      add = CHILD[table] + '.franchise_id=eq.' + fid;
      q = /(^|&)select=/.test(q) ? q.replace(/(^|&)select=([^&]*)/, function (m, a, cols) { return a + 'select=' + cols + ',' + CHILD[table] + '!inner()'; }) : 'select=*,' + CHILD[table] + '!inner()' + (q ? '&' + q : '');
    } else add = 'or=(owner_franchise_id.is.null,owner_franchise_id.eq.' + fid + ')';      // équipes de la LNH + équipes personnalisées de cette franchise
    return q ? q + '&' + add : add;
  }
  function makeClient(cfg, storage, fetchFn) {
    var f = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var base = String(cfg.url).replace(/\/+$/, ''), session = null, fid = null;
    try { session = JSON.parse((storage && storage.get('ft_session')) || 'null'); } catch (e) { session = null; }
    function save() { try { storage && storage.set('ft_session', JSON.stringify(session)); } catch (e) { /* ignore */ } }
    function now() { return Math.floor(Date.now() / 1000); }
    function headers(extra, asAnon) {
      var tok = !asAnon && session && session.access_token ? session.access_token : cfg.key;
      return Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, extra || {});
    }
    function msg(j, status) { return (j && (j.message || j.error_description || j.msg || j.hint)) || ('HTTP ' + status); }
    function pspan(n) { var P = typeof FTPERF !== 'undefined' ? FTPERF : root.FTPERF; return P ? P.span(n) : function () {}; }
    async function auth(path, body) {
      var done = pspan(path.indexOf('refresh') >= 0 ? 'connexion (jeton)' : 'connexion');
      try { return await auth0(path, body); } finally { done(); }
    }
    async function auth0(path, body) {
      var r = await f(base + '/auth/v1/' + path, { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) { var e = new Error(msg(j, r.status)); e.status = r.status; throw e; }
      return j;
    }
    function setSession(j) { session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: now() + (j.expires_in || 3600), user: j.user }; save(); return session; }
    async function signIn(email, password) { return setSession(await auth('token?grant_type=password', { email: email, password: password })); }
    async function refresh() { return setSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })); }
    async function ensure() { if (session && session.expires_at - 60 < now()) { try { await refresh(); } catch (e) { session = null; save(); } } }
    function signOut() { session = null; save(); }
    // Requêtes simultanées limitées (cfg.concurrency, 6 par défaut) : les suivantes attendent dans une file, dans l'ordre d'arrivée
    var LIMIT = cfg.concurrency || 6, active = 0, queue = [];
    function acquire() { if (active < LIMIT) { active++; return Promise.resolve(); } return new Promise(function (res) { queue.push(res); }); }
    function release() { var next = queue.shift(); if (next) next(); else active--; }
    async function rest(method, path, opts) {
      await acquire();
      try { return await rest0(method, path, opts); } finally { release(); }
    }
    async function rest0(method, path, opts) {
      opts = opts || {}; await ensure();
      var r = await f(base + '/rest/v1/' + path, { method: method, headers: headers(opts.headers, opts.anon), body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      var text = await r.text(), j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
      if (!r.ok) {
        var err = new Error(msg(j, r.status)); err.status = r.status; err.code = j && j.code; err.hint = j && j.hint || null;
        // détail de la base (migration 71 : JSON des homonymes, raison du refus) : objet si c'est du JSON, sinon le texte
        var dt = j && j.details; if (typeof dt === 'string') { try { dt = JSON.parse(dt); } catch (x) { /* texte libre */ } } err.details = dt == null ? null : dt;
        throw err;
      }
      return { data: j, range: r.headers && r.headers.get ? r.headers.get('content-range') : null };
    }
    // nombre de lignes visibles pour l'utilisateur courant (ou pour un visiteur anonyme)
    async function count(table, opts) {
      // compte de la franchise active (plusieurs franchises par compte, migration 75) ; anonyme (contrôle de fuite) : sans filtre
      var q = 'select=*'; if (!(opts && opts.anon) && fid != null) q = scopeQuery(table, q, fid, true);
      var res = await rest('GET', encodeURIComponent(table) + '?' + q + '&limit=1', { headers: { Prefer: 'count=exact' }, anon: opts && opts.anon });
      var m = /\/(\d+)$/.exec(res.range || ''); return m ? +m[1] : (res.data ? res.data.length : 0);
    }
    // Lit toutes les lignes (Supabase limite chaque réponse à 1000 lignes) en suivant le total annoncé par le serveur
    // table de franchise lue ou écrite sans franchise active : on la choisit d'abord (jamais de requête sans filtre)
    function needsScope(table) { return !!(SCOPED_SET[table] || CHILD[table] || table === 'team'); }
    async function ready(table) { if (fid == null && needsScope(table)) await resolveFranchise(); return fid != null || table === 'team' || !needsScope(table); }
    // Lit toutes les lignes (Supabase limite chaque réponse, 1000 lignes par défaut).
    // opts.count : grosse table ; le total (count=exact) est demandé sur la première page, puis les pages suivantes partent en parallèle.
    // Sans opts.count : aucun comptage ; une page pleine fait lire la suite, page après page.
    async function selectAll(table, query, opts) {
      if (!(await ready(table))) return [];                 // le compte n'a aucune franchise : rien à lire
      return selectAllAs(table, query, opts, fid);
    }
    // Lecture seule d'une franchise du compte SANS la rendre active (export, page Franchise) : même filtre, autre franchise ; aucune écriture possible
    function readerFor(id) { if (id == null) { var e = new Error('no franchise'); e.code = 'FT_NO_FRANCHISE'; throw e; } return { franchiseId: function () { return id; }, selectAll: function (table, query, opts) { return selectAllAs(table, query, opts, id); } }; }
    async function selectAllAs(table, query, opts, sfid) {
      // opts.allTeams : base sans team.owner_franchise_id (migration 38 absente), donc sans équipe personnalisée : aucun filtre sur team
      query = opts && opts.allTeams && table === 'team' ? query : scopeQuery(table, query, sfid, true);
      var pageSize = 1000, url = function (off) { return encodeURIComponent(table) + '?' + (query ? query + '&' : '') + 'limit=' + pageSize + '&offset=' + off; };
      var countIt = !!(opts && opts.count), first = await rest('GET', url(0), countIt ? { headers: { Prefer: 'count=exact' } } : {});
      var out = first.data || [], m = /\/(\d+)$/.exec(first.range || ''), total = countIt && m ? +m[1] : null, step = out.length;
      if (total !== null && step && out.length < total) {
        var offs = []; for (var o = step; o < total; o += step) offs.push(o);
        var pages = await Promise.all(offs.map(function (off) { return rest('GET', url(off)).then(function (r) { return r.data || []; }); }));
        pages.forEach(function (rows) { out = out.concat(rows); });
      }
      // suite page après page : page pleine sans total connu, ou lecture parallèle incomplète
      for (var guard = 0; guard < 200 && out.length && (total !== null ? out.length < total : out.length % step === 0 && out.length >= pageSize); guard++) {
        var more = (await rest('GET', url(out.length))).data || []; if (!more.length) break; out = out.concat(more);
        if (total === null && more.length < step) break;
      }
      return out;
    }
    async function select(table, query) { if (!(await ready(table))) return []; query = scopeQuery(table, query, fid, true); return (await rest('GET', encodeURIComponent(table) + (query ? '?' + query : ''))).data; }
    // écriture : chaque ligne d'une table de franchise doit porter la franchise active (jamais une autre)
    function checkRows(table, rows) {
      if (!SCOPED_SET[table]) return rows;
      if (fid == null) { var e = new Error('no active franchise'); e.code = 'FT_NO_FRANCHISE'; throw e; }
      (Array.isArray(rows) ? rows : [rows]).forEach(function (r) {
        if (r.franchise_id == null) r.franchise_id = fid;
        else if (String(r.franchise_id) !== String(fid)) { var e2 = new Error('franchise_id ' + r.franchise_id + ' ≠ franchise active ' + fid); e2.code = 'FT_WRONG_FRANCHISE'; throw e2; }
      });
      return rows;
    }
    // PATCH ou DELETE sur une table de franchise : le filtre de la franchise active est ajouté
    function scopeFilter(table, filter) { return SCOPED_SET[table] ? scopeQuery(table, filter, fid, false) : filter; }
    async function upsert(table, rows, onConflict) { await ready(table); checkRows(table, rows); return rest('POST', encodeURIComponent(table) + (onConflict ? '?on_conflict=' + onConflict : ''), { headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: rows }); }
    async function insert(table, rows, opts) {
      await ready(table); checkRows(table, rows);
      var ret = opts && opts.returning;
      var res = await rest('POST', encodeURIComponent(table), { headers: { Prefer: ret ? 'return=representation' : 'return=minimal' }, body: rows });
      return ret ? res.data : res;
    }
    async function remove(table, filter) { await ready(table); if (SCOPED_SET[table] && fid == null) throw new Error('no active franchise'); return rest('DELETE', encodeURIComponent(table) + '?' + scopeFilter(table, filter), { headers: { Prefer: 'return=minimal' } }); }
    async function patch(table, filter, body) { await ready(table); if (SCOPED_SET[table] && fid == null) throw new Error('no active franchise'); if (SCOPED_SET[table] && body && body.franchise_id != null && String(body.franchise_id) !== String(fid)) throw new Error('franchise_id ≠ franchise active'); return rest('PATCH', encodeURIComponent(table) + '?' + scopeFilter(table, filter), { headers: { Prefer: 'return=minimal' }, body: body }); }
    // Fonction RPC (POST /rest/v1/rpc/<fn>) : un appel = une transaction côté serveur (migration 52 : ft_save_*, ft_apply_batch).
    // p_franchise_id absent ou vide : la franchise active ; une autre valeur est refusée. opts.unscoped : fonction sans franchise (create_franchise…).
    async function rpc(fn, args, opts) {
      var body = Object.assign({}, args || {});
      if (!(opts && opts.unscoped)) {
        if (fid == null) await resolveFranchise();
        if (fid == null) { var e = new Error('no active franchise'); e.code = 'FT_NO_FRANCHISE'; throw e; }
        if (body.p_franchise_id == null) body.p_franchise_id = fid;
        else if (String(body.p_franchise_id) !== String(fid)) { var e2 = new Error('franchise_id ' + body.p_franchise_id + ' ≠ franchise active ' + fid); e2.code = 'FT_WRONG_FRANCHISE'; throw e2; }
      }
      return (await rest('POST', 'rpc/' + encodeURIComponent(fn), { body: body })).data;
    }
    // franchise active : fixée avant toute lecture (live_mount.js) ; mémorisée dans ft_franchise
    function setFranchise(id) { fid = id == null ? null : +id; }
    function stored() { try { return +((storage && storage.get('ft_franchise')) || 0) || null; } catch (e) { return null; } }
    function remember(id) { try { storage && storage.set('ft_franchise', String(id)); } catch (e) { /* ignore */ } }
    // Choisit la franchise active : celle demandée (?franchise=), sinon celle mémorisée, sinon la seule du compte.
    // Plusieurs franchises sans choix : erreur FT_PICK_FRANCHISE ; franchise mémorisée disparue : FT_FRANCHISE_GONE. Aucune franchise : null.
    async function resolveFranchise(asked) {
      var list = await select('franchise', 'select=id,name,abbreviation&order=id'), ids = list.map(function (f) { return f.id; }), st = stored(), id = null;
      if (asked != null && ids.indexOf(+asked) >= 0) { id = +asked; remember(id); }
      else if (st != null && ids.indexOf(st) >= 0) id = st;
      else if (list.length === 1) { id = list[0].id; remember(id); }
      else if (list.length) { var e = new Error(st != null ? 'franchise ' + st + ' introuvable' : 'aucune franchise active'); e.code = st != null ? 'FT_FRANCHISE_GONE' : 'FT_PICK_FRANCHISE'; e.list = list; throw e; }
      fid = id; return { id: id, list: list };
    }
    async function ensureFranchise() { if (fid == null) await resolveFranchise(); return fid; }
    function chooseFranchise(id) { fid = +id; remember(fid); }
    return { signIn: signIn, signOut: signOut, user: function () { return session && session.user; }, signedIn: function () { return !!(session && session.access_token); },
             count: count, select: select, selectAll: selectAll, readerFor: readerFor, upsert: upsert, insert: insert, remove: remove, patch: patch, rest: rest, rpc: rpc,
             setFranchise: setFranchise, chooseFranchise: chooseFranchise, resolveFranchise: resolveFranchise, ensureFranchise: ensureFranchise, storedFranchise: stored, franchiseId: function () { return fid; }, scope: function (table, query) { return scopeQuery(table, query, fid, true); } };
  }
  var api = { makeClient: makeClient, SCOPED: SCOPED, CHILD: CHILD, scopeQuery: scopeQuery };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTSB = api;
})(typeof window !== 'undefined' ? window : this);

;/* Cache local des tables lues dans Supabase, une entrée par utilisateur et par franchise (IndexedDB dans le navigateur, mémoire dans les tests).
   Entrée : { versions: { table: n }, tables: { table: [lignes] }, at: horodatage }. Les versions viennent de la table data_version :
   au chargement, la page s'affiche depuis le cache, puis seules les tables dont la version a changé sont relues. */
(function (root) {
  var DB = 'ft_cache', STORE = 'franchise', FORMAT = 1;     // FORMAT : à incrémenter si la forme des lignes change (colonnes lues, assembleurs)
  function idbBackend() {
    var idb = null; try { idb = root.indexedDB; } catch (e) { idb = null; }
    if (!idb) return null;
    var dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (ok, ko) { var q = idb.open(DB, 1); q.onupgradeneeded = function () { q.result.createObjectStore(STORE); }; q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ko(q.error); }; q.onblocked = function () { ko(new Error('blocked')); }; });
      return dbp;
    }
    function tx(mode, fn) { return open().then(function (db) { return new Promise(function (ok, ko) { var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out; var r = fn(st); if (r) r.onsuccess = function () { out = r.result; }; t.oncomplete = function () { ok(out); }; t.onerror = t.onabort = function () { ko(t.error); }; }); }); }
    return {
      get: function (k) { return tx('readonly', function (st) { return st.get(k); }); },
      put: function (k, v) { return tx('readwrite', function (st) { st.put(v, k); }); },
      del: function (k) { return tx('readwrite', function (st) { st.delete(k); }); }
    };
  }
  function memBackend() { var m = {}; return { get: function (k) { return Promise.resolve(m[k] ? JSON.parse(m[k]) : undefined); }, put: function (k, v) { m[k] = JSON.stringify(v); return Promise.resolve(); }, del: function (k) { delete m[k]; return Promise.resolve(); }, raw: m }; }
  function make(backend) {
    var be = backend !== undefined ? backend : (root.__ftCacheBackend || idbBackend());     // __ftCacheBackend : cache en mémoire des tests
    function key(user, fid) { return FORMAT + '|' + (user || 'anon') + '|' + fid; }
    return {
      enabled: !!be,
      // { versions, tables } ou null (absent, illisible, ou autre format)
      read: function (user, fid) { if (!be || fid == null) return Promise.resolve(null); return be.get(key(user, fid)).then(function (v) { return v && v.tables ? v : null; }, function () { return null; }); },
      write: function (user, fid, tables, versions) { if (!be || fid == null) return Promise.resolve(); return be.put(key(user, fid), { tables: tables, versions: versions || null, at: Date.now() }).catch(function () { /* quota, navigation privée : sans cache */ }); },
      clear: function (user, fid) { if (!be || fid == null) return Promise.resolve(); return be.del(key(user, fid)).catch(function () {}); }
    };
  }
  // tables à relire : version différente ou inconnue (versions null = table data_version absente : tout relire)
  function changed(cached, fresh, names) {
    if (!fresh || !cached) return names.slice();
    return names.filter(function (n) { return !(n in fresh) || !(n in cached) || cached[n] !== fresh[n]; });
  }
  var api = { make: make, memBackend: memBackend, changed: changed, FORMAT: FORMAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTCACHE = api;
})(typeof window !== 'undefined' ? window : this);

;/* Lecture des données depuis Supabase : une lecture paginée de chaque table, puis un assembleur par page qui reconstruit la structure de données de cette page. */
(function (root) {
  // Colonnes lues : seulement celles que les assembleurs utilisent (relevé automatique, voir test_live.js). « big » : plus de 1000 lignes possibles,
  // le total (count=exact) est demandé sur la première page pour lire les suivantes en parallèle ; ailleurs, aucun comptage.
  var TABLES = [
    ['franchise', 'select=id,name,abbreviation,color_primary,color_secondary,color_tertiary,first_season_start_year,current_season_start_year,ui_locale,games_per_season,current_game_date&order=id'],
    ['team', 'select=id,code,name_en,name_fr,is_active,conference,division,color_1,color_2,color_3,franchise_code,logo&order=id'],
    ['player', 'select=id,legacy_key,full_name,position_group,first_name,last_name,origin,birth_date,height_in,weight_lb,handedness,country,draft_year,draft_round,draft_pick,draft_team,position_original,position_secondary_original,position_current,player_type,nhl_id,hr_id&order=id', 1],
    ['skater_season_stats', 'select=id,player_id,season,game_type,origin,manual,position,age,gp,g,a,pts,plus_minus,pim,shots,gwg,ppg,shg,ppp,shp,toi_minutes,fow,fot,hits,blocks,giveaways,takeaways,oa_end&order=id', 1],
    ['goalie_season_stats', 'select=id,player_id,season,game_type,origin,manual,gp,w,l,otl,so,saves,shots_against,goals_against,minutes,pim,g,a,oa_end&order=id', 1],
    ['team_season_stats', 'select=season,game_type,gp,w,l,otl,points,gf,ga,result,rw,row_,ppg,pp_opportunities,shga,ppga,times_shorthanded,shgf,home_w,home_l,home_otl,away_w,away_l,away_otl&order=id'],
    ['label', 'select=key,locale,text,short_text&order=key,locale', 1],
    ['award', 'select=id,code&order=id'],
    ['award_win', 'select=season,award_id,place,player_id,player_key,team_code,stat_value&order=id'],
    ['all_star_selection', 'select=season,team_level,position,player_id,player_key,team_code&order=id'],
    ['roster_move', 'select=id,season,moved_on,player_id,move,injury_return_on,games_missed,waiver_claimed&order=id', 1],
    ['player_stint', 'select=player_id,acquired_on,acquired_via,status_at_acquisition,rookie_gp_current,rookie_gp_previous,jersey_number,departed_on,departed_via&order=player_id,acquired_on', 1],
    ['contract', 'select=id,signed_on,player_id,event_type,contract_type,years,aav,first_season,start_on,end_on&order=id', 1],
    ['contract_year', 'select=contract_id,season,clause&order=contract_id,season', 1],
    ['position_change', 'select=id,changed_on,player_id,from_primary,from_secondary,to_primary,to_secondary&order=id'],
    ['trade', 'select=id,traded_on,partner_team_code&order=id'],
    ['trade_asset', 'select=trade_id,direction,asset_type,player_id,pick_year,pick_round,pick_original_team_id,retained_salary,retained_years&order=id', 1],
    ['salary_cap_season', 'select=season,cap,floor,player_min,player_max_one_way,player_max_two_way,ahl_exemption,effective_on&order=season'],
    ['standing', 'select=season,overall_rank,team_code,w,l,otl,points,conference,division,division_rank,draft_rank&order=id', 1],
    ['draft_top3', 'select=draft_year,pick,team_id,player_name,position,potential&order=draft_year,pick'],
    ['draft_lottery', 'select=draft_year,pick,pre_lottery_rank,team_code&order=draft_year,pick'],
    ['draft_pick', 'select=draft_year,round,original_team_code,overall_pick,selected_player_id,selected_player_key,status&order=id'],
    ['draft_pick_initial', 'select=draft_year,round,original_team_code,owned&order=draft_year,round,original_team_code'],   // choix de départ (Point de départ, Repêchage)
    ['v_contract_year_level', 'select=contract_id,player_id,season,cap_hit,contract_type,level,basis&order=contract_id,season', 1],
    ['role_assignment', 'select=season,slot,player_id&order=id'],
    ['player_rating', 'select=player_id,season,oa&order=player_id,season', 1],
    ['schedule_game', 'select=season,game_no,game_date,opponent_code&order=season,game_no', 1],
    ['stanley_cup_result', 'select=season,champion_team_id&order=season'],
    ['retirement', 'select=id,retired_season,team_code,position,player_key,hof_nominee,hof_year,gp,g,a,plus_minus,w,so,sv_pct,gaa,ms_g05,ms_a075,ms_p1,ms_20g,ms_30g,ms_50g,ms_50p,ms_75p,ms_100p,ms_20w,ms_30w,ms_c30w,ms_40w,ms_wins&order=id'],
    ['playoff_series', 'select=season,round,conference,slot,wins_a,wins_b,team_a_code,team_b_code&order=season,round,conference,slot']];

  var OPTIONAL = [['franchise_league_team', 'select=team_code,conference,division,active_from,active_to&order=id'], ['stanley_cup_member', 'select=season,position_group,player_key&order=season,position_group,sort_order,id', 1], ['historical_award_counts', 'select=award_code,counts'],
    ['offer_sheet', 'select=id,signed_on,player_id,event_type,compensation&order=signed_on,id'], ['offer_sheet_pick', 'select=offer_sheet_id,slot,team_code,pick_year,pick_round&order=offer_sheet_id,slot'],
    ['v_player_career', 'select=player_id,first_season,last_season&order=player_id'],   // migration 71 : années de carrière (étiquettes d'homonymes)
    ['draft_pick_value', 'select=overall_pick,value&order=overall_pick']];   // migration 78 : barème de valeur des choix (Repêchage › Analyse)
  var FTSBX = (function () { var S = typeof FTSB !== 'undefined' ? FTSB : (typeof require === 'function' ? require('./sb.js') : null); if (!S) return null; var set = {}; S.SCOPED.concat(Object.keys(S.CHILD), ['team']).forEach(function (t) { set[t] = 1; }); set.team = 0; return { isScoped: function (t) { return !!set[t]; } }; })();
  function pspan(n) { var P = typeof FTPERF !== 'undefined' ? FTPERF : root.FTPERF; return P ? P.span(n) : function () {}; }
  // lecture d'une table filtrée sur la franchise active (sb.js ajoute franchise_id) ; la table franchise : seulement la franchise active
  // tables lues en premier selon la page (les autres suivent, pour le cache commun à toutes les pages)
  var PAGE_TABLES = {
    player_card: ['player', 'skater_season_stats', 'contract_year', 'v_contract_year_level', 'award', 'standing', 'draft_top3', 'draft_lottery', 'draft_pick', 'award_win', 'all_star_selection', 'roster_move', 'salary_cap_season', 'team_season_stats'],
    entry: ['player', 'skater_season_stats', 'goalie_season_stats', 'team_season_stats', 'v_contract_year_level', 'player_rating'],
    events: ['player', 'v_player_career', 'contract_year', 'trade_asset', 'salary_cap_season', 'player_stint', 'position_change', 'schedule_game', 'roster_move', 'contract', 'offer_sheet', 'offer_sheet_pick', 'trade'],
    history_edit: ['player', 'v_player_career', 'skater_season_stats', 'goalie_season_stats'], setup: []
  };
  PAGE_TABLES.preseason = PAGE_TABLES.offseason = ['award', 'player', 'v_player_career', 'standing', 'role_assignment', 'player_rating', 'stanley_cup_result', 'skater_season_stats', 'team_season_stats', 'playoff_series', 'historical_award_counts', 'salary_cap_season', 'goalie_season_stats', 'schedule_game', 'draft_lottery', 'draft_top3', 'draft_pick', 'award_win', 'all_star_selection', 'retirement', 'stanley_cup_member', 'contract'];
  // pages de groupe (phase 4b, connect/ft_nav.js) : mêmes tables que les anciennes pages qui les servent
  PAGE_TABLES.franchise = PAGE_TABLES.setup.concat(PAGE_TABLES.history_edit); PAGE_TABLES.stats = PAGE_TABLES.entry; PAGE_TABLES.roster = PAGE_TABLES.events;
  PAGE_TABLES.results = PAGE_TABLES.honors = PAGE_TABLES.preseason;
  // Repêchage (phase 4d) : choix de départ, échanges de choix, compensations, barème
  PAGE_TABLES.draft = PAGE_TABLES.preseason.concat(['draft_pick_initial', 'draft_pick_value', 'trade', 'trade_asset', 'offer_sheet', 'offer_sheet_pick']); PAGE_TABLES.start = PAGE_TABLES.draft; PAGE_TABLES.cards = PAGE_TABLES.analysis = PAGE_TABLES.player_card;
  var COMMON = ['franchise', 'team', 'label', 'franchise_league_team'];
  function tableDefs() { return TABLES.map(function (t) { return { name: t[0], query: t[1], big: !!t[2], optional: false }; }).concat(OPTIONAL.map(function (t) { return { name: t[0], query: t[1], big: !!t[2], optional: true }; })); }
  // ordre de lecture : tables communes, tables de la page, puis le reste
  function ordered(page, defs) {
    var first = COMMON.concat(PAGE_TABLES[page] || []), rank = function (n) { var i = first.indexOf(n); return i < 0 ? 1000 : i; };
    return defs.map(function (d, i) { return [d, i]; }).sort(function (x, y) { return rank(x[0].name) - rank(y[0].name) || x[1] - y[1]; }).map(function (x) { return x[0]; });
  }
  // lecture d'une table filtrée sur la franchise active (sb.js ajoute franchise_id) ; la table franchise : seulement la franchise active
  async function readTable(client, def, fid) {
    if (def.name === 'franchise' && fid == null) return [];
    if (fid == null && FTSBX && FTSBX.isScoped(def.name)) return [];        // aucune franchise : rien à lire dans les tables de franchise
    // colonne absente de la base (migration facultative non exécutée, ex. player.nhl_id de la migration 25) : relire toutes les colonnes, comme avant ;
    // team.owner_franchise_id absente (migration 38) : aucune équipe personnalisée, lecture sans ce filtre
    var query = def.name === 'franchise' ? def.query + '&id=eq.' + fid : def.query, allTeams = false;
    for (var attempt = 0; ; attempt++) {
      try { return await client.selectAll(def.name, query, { count: def.big, allTeams: allTeams }); }
      catch (e) {
        if (!missingColumn(e) || attempt >= 2) throw e;
        if (/owner_franchise_id/.test(e.message || '')) allTeams = true; else query = query.replace(/(^|&)select=[^&]*/, '$1select=*');
      }
    }
  }
  function missingColumn(e) { return !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist/i.test(e.message || '')); }
  // Versions des données (table data_version, incrémentée par les triggers à chaque écriture) : une valeur par table lue.
  // Les triggers (migration 51) font monter une vue avec ses tables sources et une table enfant avec son parent : une ligne par table lue suffit
  // (team : ligne globale + ligne de la franchise). null : table data_version absente (migration non exécutée) → tout relire.
  var VERSION_DEPS = { v_player_career: ['skater_season_stats', 'goalie_season_stats'] };   // vue sans data_version propre
  function qhash(q) { var h = 5381; for (var i = 0; i < q.length; i++) h = ((h * 33) ^ q.charCodeAt(i)) >>> 0; return h.toString(36); }
  async function loadVersions(client, fid) {
    var rows;
    try { rows = await client.select('data_version', 'select=franchise_id,table_name,version&or=(franchise_id.is.null,franchise_id.eq.' + fid + ')'); } catch (e) { return null; }
    if (!rows || !rows.length) return null;
    var m = {}; rows.forEach(function (r) { m[r.table_name] = (m[r.table_name] ? m[r.table_name] + '+' : '') + r.version; });
    // table sans ligne : version inconnue, donc absente du résultat → relue à chaque chargement (ex. nouvelle franchise avant sa première écriture)
    // la liste des colonnes lues fait partie de la version : une colonne ajoutée à la lecture (ex. skater_season_stats.position, migration 66) relit la table au lieu de servir le cache, qui n'a pas cette colonne
    var out = {}; tableDefs().forEach(function (d) { var deps = VERSION_DEPS[d.name] || [d.name]; if (deps.every(function (t) { return m[t] != null; })) out[d.name] = deps.map(function (t) { return String(m[t]); }).join('.') + '#' + qhash(d.query); });
    return out;
  }
  // Lit les tables en parallèle (sb.js limite le nombre de requêtes simultanées). opts.page : page courante (ses tables d'abord) ; opts.only : liste de tables à lire.
  async function loadAll(client, progress, opts) {
    opts = opts || {};
    if (client.ensureFranchise) await client.ensureFranchise();        // franchise active d'abord : aucune lecture sans filtre
    var R = {}, all = pspan('chargement'), fid = client.franchiseId ? client.franchiseId() : null, done = 0;
    R.__franchise_id = fid;
    var defs = ordered(opts.page, tableDefs()).filter(function (d) { return !opts.only || opts.only.indexOf(d.name) >= 0; });
    await Promise.all(defs.map(async function (d) {
      var sp = pspan('table:' + d.name);
      // tables facultatives : absentes tant que les migrations correspondantes ne sont pas exécutées (la page fonctionne sans)
      if (d.optional) { try { R[d.name] = await readTable(client, d, fid); } catch (e) { R[d.name] = []; } }
      else R[d.name] = await readTable(client, d, fid);
      sp(R[d.name].length + ' lignes'); done++; if (progress) progress(done, defs.length, d.name);
    }));
    all(defs.length + ' tables');
    return R;
  }

  // ---------- utilitaires ----------
  function r2(v) { return v == null ? null : (typeof v === 'number' && v % 1 !== 0 ? Math.round(v * 100) / 100 : v); }
  function b01(v) { return v === true || v === 1 ? 1 : (v === false || v === 0 ? 0 : null); }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sortBy(rows, fn) { return rows.map(function (r, i) { return [r, i]; }).sort(function (x, y) { var a = fn(x[0]), b = fn(y[0]); for (var k = 0; k < a.length; k++) { var c = cmp(a[k], b[k]); if (c) return c; } return x[1] - y[1]; }).map(function (x) { return x[0]; }); }
  function gt(v) { return v === 'RS' ? 0 : 1; }
  function labels(R) { var o = {}; R.label.forEach(function (l) { (o[l.key] = o[l.key] || {})[l.locale] = [l.text, l.short_text]; }); return o; }
  // ligue de la franchise (équipes personnalisées, remplacements) : si la table est remplie, elle décide quelles équipes sont « actives » ; sinon l'indicateur de la table team
  // une ligne de « Nos choix » : [ronde, équipe d'origine, choix, clé, statut, prénom, nom, poste, taille, poids, naissance, main, pays, type]
  var PICK_POS = { C: 1, LW: 1, RW: 1, LD: 1, RD: 1, G: 1 };
  function pickRow(d, p) { p = p || {}; return [d.round, d.original_team_code, d.overall_pick, d.selected_player_key, d.status, p.first_name || '', p.last_name || '', PICK_POS[p.position_current] ? p.position_current : '', p.height_in == null ? '' : Math.floor(p.height_in / 12) + "'" + (p.height_in % 12), p.weight_lb == null ? '' : p.weight_lb, p.birth_date || '', p.handedness === 'Left' ? 'L' : p.handedness === 'Right' ? 'R' : '', p.country || '', p.player_type || '', d.selected_player_id == null ? null : d.selected_player_id]; }   // dernier élément : id du joueur repêché
  function leagueMembers(R) { var rows = (R.franchise_league_team || []).filter(function (x) { return x.active_to == null; }); if (!rows.length) return null; var m = {}; rows.forEach(function (x) { m[x.team_code] = 1; }); return m; }
  // taille de la ligue de la franchise : équipes actives (table de la ligue si elle existe, sinon indicateur de la table team) et répartition par conférence
  function leagueInfo(R) {
    var rows = (R.franchise_league_team || []).filter(function (x) { return x.active_to == null; }), size = 0, east = 0, west = 0;
    if (rows.length) rows.forEach(function (x) { size++; if (x.conference === 'EAST') east++; else if (x.conference === 'WEST') west++; });
    else R.team.forEach(function (t) { if (t.code !== 'NHL' && (t.is_active === true || t.is_active === 1)) { size++; if (t.conference === 'EAST') east++; else if (t.conference === 'WEST') west++; } });
    return { size: size, east: east, west: west };
  }
  // équipes de la ligue de la franchise, pour l'onglet Classement : [code, association, division, première saison, dernière saison] par code ;
  // franchise_league_team si elle est remplie (équipes remplacées comprises), sinon les équipes actives de team (saisons inconnues : null)
  // (même liste que season/build_season_data.py, qui n'a que la table team)
  function leagueTeams(R) {
    var rows = R.franchise_league_team || [], nn = function (v) { return v == null ? null : v; };
    if (rows.length) return sortBy(rows, function (x) { return [x.team_code]; }).map(function (x) { return [x.team_code, nn(x.conference), nn(x.division), nn(x.active_from), nn(x.active_to)]; });
    return sortBy(R.team.filter(function (t) { return t.code !== 'NHL' && (t.is_active === true || t.is_active === 1); }), function (t) { return [t.code]; })
      .map(function (t) { return [t.code, nn(t.conference), nn(t.division), null, null]; });
  }
  function teams(R, exclude, activeOnly) {
    var mem = activeOnly ? leagueMembers(R) : null;
    return (exclude ? sortBy(R.team.filter(function (t) { return t.code !== 'NHL' && (!activeOnly || (mem ? !!mem[t.code] : (t.is_active === true || t.is_active === 1))); }), function (t) { return [t.name_en]; }) : R.team).map(function (t) { var o = { code: t.code, en: t.name_en, fr: t.name_fr }; if (t.logo) o.logo = t.logo; return o; });
  }
  function teamCode(R) { var m = {}; R.team.forEach(function (t) { m[t.id] = t.code; }); return m; }
  // franchise active : celle que la page a choisie (R.__franchise_id) ; sans choix (données de test intégrées), la seule franchise présente
  function activeFranchise(R) { var rows = R.franchise || []; if (R.__franchise_id != null) return rows.filter(function (f) { return f.id === R.__franchise_id; })[0] || null; return rows.length === 1 ? rows[0] : null; }
  function franchise(R) { return activeFranchise(R) || {}; }
  function pkey(p) { return p.legacy_key; }

  // ---------- fiche joueur (player_card.html) ----------
  function assemblePlayerCard(R) {
    var f = franchise(R), tc = teamCode(R), pById = {}; R.player.forEach(function (p) { pById[p.id] = p; });
    var players = R.player.filter(function (p) { return p.position_group === 'F' || p.position_group === 'D'; }).map(function (p) {
      return { id: p.id, name: p.full_name, pos: p.position_group, origin: p.origin, birth: p.birth_date, h: p.height_in, w: p.weight_lb, hand: p.handedness, country: p.country, draft: p.draft_year ? [p.draft_year, p.draft_round, p.draft_pick, p.draft_team] : null }; });
    var rows = sortBy(R.skater_season_stats, function (s) { return [s.player_id, s.game_type, s.season]; }).map(function (s) {
      return [s.player_id, s.season, gt(s.game_type), s.gp, s.g, s.a, s.plus_minus, s.pim, s.shots, s.ppp, s.shp, r2(s.toi_minutes), s.fow, s.fot, s.hits, s.blocks, s.giveaways, s.takeaways, s.age, s.position || null]; });   // dernier élément : groupe de poste de la ligne (F/D, migration 66)
    var LV = { NHL: 0, AHL: 1, JUNIOR: 2 }, cl = {}; R.contract_year.forEach(function (y) { cl[y.contract_id + '|' + y.season] = y.clause; });
    var cpl = {}; R.v_contract_year_level.forEach(function (v) { var p = pById[v.player_id]; if (p) cpl[v.player_id] = [p.full_name, p.position_group]; });
    var contracts = sortBy(R.v_contract_year_level.filter(function (v) { return (v.contract_id + '|' + v.season) in cl; }), function (v) { return [v.season, -(v.cap_hit || 0), v.player_id]; }).map(function (v) {
      return [v.player_id, v.season, v.cap_hit, { one_way: 1, two_way: 2 }[v.contract_type] || 0, LV[v.level], v.basis === 'projected' ? 1 : 0, cl[v.contract_id + '|' + v.season]]; });
    var awardCode = {}; R.award.forEach(function (a) { awardCode[a.id] = a.code; });
    return {
      standings: sortBy(R.standing, function (s) { return [s.season, s.overall_rank]; }).map(function (s) { return [s.season, s.overall_rank, s.team_code, s.w, s.l, s.otl, s.points, s.conference, s.division, s.division_rank]; }),
      top3: R.draft_top3.map(function (d) { return [d.draft_year, d.pick, tc[d.team_id] || null, d.player_name, d.position, d.potential]; }),
      lottery: R.draft_lottery.map(function (d) { return [d.draft_year, d.pick, d.pre_lottery_rank, d.team_code]; }),
      picks: sortBy(R.draft_pick, function (d) { return [d.draft_year, d.round]; }).map(function (d) { var p = pById[d.selected_player_id]; return [d.draft_year, d.round, d.original_team_code, d.overall_pick, p ? p.full_name : (d.selected_player_key == null ? null : d.selected_player_key.slice(4)), d.status]; }),   // nom du joueur repêché par selected_player_id
      awards: sortBy(R.award_win, function (w) { return [w.season]; }).map(function (w) { return [w.season, awardCode[w.award_id], w.place, w.player_key, w.team_code, w.stat_value, w.player_id == null ? null : w.player_id]; }),   // lien par player_id
      allstars: sortBy(R.all_star_selection, function (a) { return [a.season]; }).map(function (a) { return [a.season, a.team_level, a.player_key, a.player_id == null ? null : a.player_id]; }),
      injuries: sortBy(R.roster_move.filter(function (m) { return m.move === 'injury' && m.player_id != null; }), function (m) { return [m.season]; }).map(function (m) { return [m.player_id, m.season, m.games_missed == null ? 0 : m.games_missed]; }),
      contracts: contracts, cplayers: cpl, caps: R.salary_cap_season.map(function (c) { return [c.season, c.cap, c.floor]; }),
      teams: teams(R), team_stats: sortBy(R.team_season_stats, function (t) { return [t.season]; }).map(function (t) { return [t.season, gt(t.game_type), t.gp, t.w, t.l, t.otl, t.points, t.gf, t.ga, t.result]; }),
      franchise: { name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year },
      players: players, rows: rows, labels: labels(R)
    };
  }

  // ---------- saisie des statistiques (entry.html) ----------
  function assembleEntry(R) {
    var f = franchise(R), mine = R.player.filter(function (p) { return p.origin === 'franchise'; }), byName = sortBy(mine, function (p) { return [p.full_name]; });
    var skaters = byName.filter(function (p) { return p.position_group === 'F' || p.position_group === 'D'; }).map(function (p) { return { id: p.id, name: p.full_name, pos: p.position_group }; });
    var goalies = byName.filter(function (p) { return p.position_group === 'G'; }).map(function (p) { return { id: p.id, name: p.full_name }; });
    var sk = {}, gk = {}, tm = {};
    sortBy(R.skater_season_stats.filter(function (s) { return s.origin === 'franchise'; }), function (s) { return [s.season, s.player_id]; }).forEach(function (s) {
      (sk[s.season + '|' + gt(s.game_type)] = sk[s.season + '|' + gt(s.game_type)] || []).push([s.player_id, s.gp, s.g, s.a, s.plus_minus, s.pim, s.shots, s.gwg, s.ppg, s.ppp, s.shg, s.shp, r2(s.toi_minutes), s.fow, s.fot, s.hits, s.blocks, s.giveaways, s.takeaways, s.oa_end]); });
    sortBy(R.goalie_season_stats.filter(function (s) { return s.origin === 'franchise'; }), function (s) { return [s.season, s.player_id]; }).forEach(function (s) {
      (gk[s.season + '|' + gt(s.game_type)] = gk[s.season + '|' + gt(s.game_type)] || []).push([s.player_id, s.gp, s.w, s.l, s.otl, s.so, s.saves, s.shots_against, r2(s.minutes), s.pim, s.g, s.a, s.oa_end]); });
    sortBy(R.team_season_stats, function (t) { return [t.season]; }).forEach(function (t) { tm[t.season + '|' + gt(t.game_type)] = [t.gp, t.w, t.l, t.otl, t.rw, t.row_, t.gf, t.ga, t.ppg, t.pp_opportunities, t.shga, t.ppga, t.times_shorthanded, t.shgf, t.home_w, t.home_l, t.home_otl, t.away_w, t.away_l, t.away_otl]; });
    var contracted = {}; R.v_contract_year_level.forEach(function (v) { var a = contracted[String(v.season)] = contracted[String(v.season)] || []; if (a.indexOf(v.player_id) < 0) a.push(v.player_id); });
    var roster = {}; R.v_contract_year_level.filter(function (v) { return v.level === 'NHL'; }).forEach(function (v) { var a = roster[String(v.season)] = roster[String(v.season)] || []; if (a.indexOf(v.player_id) < 0) a.push(v.player_id); });
    var lastOa = {}; sortBy(R.skater_season_stats.concat(R.goalie_season_stats).filter(function (s) { return s.origin === 'franchise' && s.game_type === 'RS' && s.oa_end != null; }), function (s) { return [s.season]; }).forEach(function (s) { lastOa[s.player_id] = s.oa_end; });
    return { homo: homoPlayers(R), franchise: { name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year, locale: f.ui_locale, games: f.games_per_season || 82 }, skaters: skaters, goalies: goalies, sk: sk, gk: gk, tm: tm, roster: roster, contracted: contracted, last_oa: lastOa, ratings: (function () { var o = {}; (R.player_rating || []).forEach(function (r) { (o[String(r.season)] = o[String(r.season)] || {})[String(r.player_id)] = r.oa; }); return o; })(), teams: teams(R), labels: labels(R), games: 82 };
  }

  // ---------- événements (events.html) ----------
  // joueurs pour la question « Même joueur ? » et les étiquettes d'homonymes (connect/homonym_ui.js) : tous les joueurs, historiques compris,
  // années de carrière de la vue v_player_career (migration 71), sinon des statistiques chargées par la page
  function homoPlayers(R) {
    var span = {};
    if (R.v_player_career && R.v_player_career.length) R.v_player_career.forEach(function (x) { span[x.player_id] = [x.first_season, x.last_season]; });
    else (R.skater_season_stats || []).concat(R.goalie_season_stats || []).forEach(function (x) { var a = span[x.player_id]; if (!a) span[x.player_id] = [x.season, x.season]; else { a[0] = Math.min(a[0], x.season); a[1] = Math.max(a[1], x.season); } });
    return (R.player || []).map(function (p) { var a = span[p.id]; return { id: p.id, full_name: p.full_name, position_group: p.position_group, origin: p.origin, birth_date: p.birth_date || null, first_season: a ? a[0] : null, last_season: a ? a[1] : null }; });
  }
  function assembleEvents(R) {
    var f = franchise(R), tc = teamCode(R);
    var players = sortBy(R.player.filter(function (p) { return p.origin === 'franchise'; }), function (p) { return [p.full_name]; }).map(function (p) { return { id: p.id, name: p.full_name, pos: p.position_group, pos1: p.position_original || null }; });
    var firstClause = {}; R.contract_year.forEach(function (y) { if (y.clause != null && firstClause[y.contract_id] === undefined) firstClause[y.contract_id] = y.clause; });
    var clauseBy = {}; R.contract_year.forEach(function (y) { (clauseBy[y.contract_id] = clauseBy[y.contract_id] || {})[y.season] = y.clause || ''; });
    var assetsBy = {}; R.trade_asset.forEach(function (a) { (assetsBy[a.trade_id] = assetsBy[a.trade_id] || []).push(a); });
    return { homo: homoPlayers(R),
      franchise: { name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year, date: f.current_game_date, games: f.games_per_season || 82 }, players: players,
      cap: R.salary_cap_season.map(function (c) { return [c.season, c.cap, c.floor, c.player_min, c.player_max_one_way]; }), teams: teams(R, true, true),
      roster: (function () {
        var sb = {}, pb = {}; R.player_stint.slice().sort(function (a, b) { return String(a.acquired_on).localeCompare(String(b.acquired_on)); }).forEach(function (s) { (sb[s.player_id] = sb[s.player_id] || []).push(s); });
        R.position_change.slice().sort(function (a, b) { return String(a.changed_on).localeCompare(String(b.changed_on)) || a.id - b.id; }).forEach(function (c) { (pb[c.player_id] = pb[c.player_id] || []).push(c); });
        return sortBy(R.player.filter(function (p) { return p.origin === 'franchise'; }), function (p) { return [p.full_name]; }).map(function (p) { var ss = sb[p.id] || [], pc = pb[p.id] || [], f = ss[0] || {}, la = ss[ss.length - 1] || {};
          return [p.id, p.legacy_key, la.jersey_number == null ? null : la.jersey_number, p.position_original, p.position_current, p.position_secondary_original || (pc.length ? pc[0].from_secondary : null), pc.length ? pc[pc.length - 1].to_secondary : null, p.birth_date, p.height_in, p.weight_lb, p.handedness, p.player_type, p.draft_year, p.draft_round, p.draft_pick, p.draft_team, p.country, f.status_at_acquisition || null, f.acquired_on || null, f.acquired_via || null, la.departed_on || null, la.departed_via || null, p.first_name, p.last_name, f.rookie_gp_current == null ? null : f.rookie_gp_current, f.rookie_gp_previous == null ? null : f.rookie_gp_previous]; }); })(),
      hist: sortBy(R.player.filter(function (p) { return p.origin === 'historical'; }), function (p) { return [p.full_name, p.id]; }).map(function (p) { return [p.id, p.full_name, p.position_group]; }),   // proposés côté « reçus » d'un échange
      stints: R.player_stint.filter(function (s) { return s.acquired_on != null; }).map(function (s) { return [s.player_id, s.acquired_on, s.departed_on]; }),
      schedule: (function () { var o = {}; R.schedule_game.slice().sort(function (a, b) { return a.season - b.season || a.game_no - b.game_no; }).forEach(function (g) { (o[String(g.season)] = o[String(g.season)] || []).push(g.game_date); }); return o; })(),
      base: {
        mv: sortBy(R.roster_move.filter(function (m) { return m.player_id != null; }), function (m) { return [m.moved_on]; }).map(function (m) { return [m.season, m.moved_on, m.player_id, m.move, m.injury_return_on, m.games_missed, b01(m.waiver_claimed), m.id]; }),
        ct: sortBy(R.contract, function (c) { return [c.signed_on]; }).map(function (c) { return [c.id, c.signed_on, c.player_id, c.event_type, c.contract_type, c.years, c.aav, c.first_season, c.start_on, c.end_on, firstClause[c.id] === undefined ? null : firstClause[c.id], c.years && c.first_season != null ? Array.apply(null, Array(+c.years)).map(function (_, k) { return (clauseBy[c.id] || {})[c.first_season + k] || ''; }) : []]; }),
        os: (R.offer_sheet || []).map(function (o) { return { id: o.id, date: o.signed_on, pid: o.player_id, event: o.event_type, comp: b01(o.compensation), picks: (R.offer_sheet_pick || []).filter(function (x) { return x.offer_sheet_id === o.id; }).map(function (x) { return [x.team_code, x.pick_year, x.pick_round]; }) }; }),
        tr: sortBy(R.trade, function (t) { return [t.traded_on]; }).filter(function (t) { return assetsBy[t.id]; }).map(function (t) { return { id: t.id, date: t.traded_on, partner: t.partner_team_code, assets: assetsBy[t.id].map(function (a) { return [a.direction, a.asset_type, a.player_id, a.pick_year, a.pick_round, tc[a.pick_original_team_id] || null, a.retained_salary, a.retained_years]; }) }; }),
        pc: sortBy(R.position_change, function (p) { return [p.changed_on]; }).map(function (p) { return [p.changed_on, p.player_id, p.from_primary, p.from_secondary, p.to_primary, p.to_secondary]; })
      }, labels: labels(R) };
  }

  // ---------- repêchage (phase 4d) : données brutes des onglets Choix de départ, Choix détenus, Ordre et Analyse ----------
  // Même structure que season/build_season_data.py (clé « draft ») ; les calculs sont dans season/draft_core.js (FTDRAFT.assemble).
  //   initial : [[année, ronde, équipe d'origine, détenu 1/0]] (draft_pick_initial) ;
  //   trades  : [[date, partenaire, 'in' | 'out', année, ronde, équipe d'origine]] (choix des échanges, dans l'ordre de saisie) ;
  //   offers  : [[date, 'signed' | 'unmatched', année, ronde, équipe d'origine]] (choix de compensation des offres hostiles) ;
  //   values  : [[rang global, valeur]] (draft_pick_value, migration 78 ; vide avant) ;
  //   po      : { saison : [[ronde, conférence, rang, équipe A, équipe B, victoires A, victoires B]] } (playoff_series) ;
  //   board   : [[id, année, ronde, rang, poste, prénom, nom, PJ, B, A, +/-, V, BL, arrêts, tirs, minutes]] : joueurs repêchés
  //             par l'équipe (player.draft_team = nom anglais de l'équipe), carrière en saison régulière avec l'équipe (toutes origines).
  // Point de départ › Effectif de départ (phase 4d) : même structure que season/build_season_data.py (draft.start)
  function startRoster(R) {
    var f = franchise(R), f1 = f.first_season_start_year + '-07-01', f2 = (f.first_season_start_year + 1) + '-06-30', P = {}, cl = {}, ct = {};
    R.player.forEach(function (p) { P[p.id] = p; });
    sortBy(R.contract_year || [], function (y) { return [y.contract_id, y.season]; }).forEach(function (y) { (cl[y.contract_id] = cl[y.contract_id] || []).push(y.clause || ''); });
    sortBy(R.contract.filter(function (c) { return (c.event_type === 'acquired' || c.event_type === 'entry_level') && c.signed_on <= f2; }), function (c) { return [c.signed_on, c.id]; }).forEach(function (c) { if (!ct[c.player_id]) ct[c.player_id] = c; });
    var st = R.player_stint.filter(function (s) { return P[s.player_id] && (s.acquired_via === 'Start' || (s.acquired_via === 'Draft' && s.acquired_on < f1 && (s.departed_on == null || s.departed_on >= f1))); });
    return sortBy(st, function (s) { return [P[s.player_id].full_name, s.player_id]; }).map(function (s) { var p = P[s.player_id], c = ct[p.id], nv = function (v) { return v == null ? null : v; };
      return [p.id, nv(p.first_name), nv(p.last_name), nv(p.position_original), nv(p.position_secondary_original), nv(s.jersey_number), nv(p.height_in), nv(p.weight_lb), nv(p.birth_date), nv(p.handedness),
        nv(p.player_type), nv(p.draft_year), nv(p.draft_round), nv(p.draft_pick), nv(p.draft_team), nv(p.country), nv(s.status_at_acquisition), nv(s.rookie_gp_current), nv(s.rookie_gp_previous), s.acquired_via, s.acquired_on,
        c ? [c.id, c.signed_on, c.event_type, nv(c.contract_type), nv(c.first_season), nv(c.years), c.aav == null ? null : +c.aav, cl[c.id] || []] : null]; });
  }
  function draftData(R) {
    var f = franchise(R), tc = teamCode(R), trById = {}; R.trade.forEach(function (t) { trById[t.id] = t; });
    var mine = R.team.filter(function (t) { return t.code === f.abbreviation; }).sort(function (a, b) { return (a.owner_franchise_id == null ? 1 : 0) - (b.owner_franchise_id == null ? 1 : 0); })[0];
    var names = {}; [f.name, f.abbreviation, mine && mine.name_en].forEach(function (n) { if (n) names[n] = 1; });
    var sk = {}, gk = {}, add = function (o, id, vals) { var a = o[id] = o[id] || vals.map(function () { return 0; }); vals.forEach(function (v, i) { a[i] += v || 0; }); };
    R.skater_season_stats.forEach(function (s) { if (s.game_type === 'RS') add(sk, s.player_id, [s.gp, s.g, s.a, s.plus_minus]); });
    R.goalie_season_stats.forEach(function (s) { if (s.game_type === 'RS') add(gk, s.player_id, [s.gp, s.w, s.so, s.saves, s.shots_against, s.minutes]); });
    // MJ avec l'équipe avant le début de la franchise (origin = historical) : option « exclure » de la carte Réussite (Gabriel, 2026-11-23)
    var hgp = {}; R.skater_season_stats.concat(R.goalie_season_stats).forEach(function (s) { if (s.game_type === 'RS' && s.origin === 'historical') hgp[s.player_id] = (hgp[s.player_id] || 0) + (s.gp || 0); });
    var po = {}; sortBy(R.playoff_series, function (x) { return [x.season, x.round, x.conference, x.slot]; }).forEach(function (x) { (po[String(x.season)] = po[String(x.season)] || []).push([x.round, x.conference, x.slot, x.team_a_code, x.team_b_code, x.wins_a, x.wins_b]); });
    var osById = {}; (R.offer_sheet || []).forEach(function (o) { osById[o.id] = o; });
    return {
      initial: sortBy(R.draft_pick_initial || [], function (d) { return [d.draft_year, d.round, d.original_team_code]; }).map(function (d) { return [d.draft_year, d.round, d.original_team_code, b01(d.owned)]; }),
      trades: sortBy(R.trade_asset.filter(function (a) { return a.asset_type === 'pick' && trById[a.trade_id]; }), function (a) { return [trById[a.trade_id].traded_on, a.trade_id]; })
        .map(function (a) { var t = trById[a.trade_id]; return [t.traded_on, t.partner_team_code || null, a.direction, a.pick_year, a.pick_round, tc[a.pick_original_team_id] || null, t.id]; }),   // id : lien direct depuis Choix détenus
      offers: sortBy((R.offer_sheet_pick || []).filter(function (x) { var o = osById[x.offer_sheet_id]; return o && (o.compensation === true || o.compensation === 1); }), function (x) { return [osById[x.offer_sheet_id].signed_on, x.offer_sheet_id, x.slot]; })
        .map(function (x) { var o = osById[x.offer_sheet_id]; return [o.signed_on, o.event_type, x.pick_year, x.pick_round, x.team_code, o.id]; }),
      values: sortBy(R.draft_pick_value || [], function (v) { return [v.overall_pick]; }).map(function (v) { return [v.overall_pick, v.value == null ? null : +v.value]; }),
      po: po,
      board: sortBy(R.player.filter(function (p) { return p.draft_team && names[p.draft_team] && p.draft_year != null; }), function (p) { return [p.draft_year, p.draft_round == null ? 99 : p.draft_round, p.draft_pick == null ? 9999 : p.draft_pick, p.id]; })
        .map(function (p) { var g = p.position_group === 'G', a = g ? gk[p.id] || [0, 0, 0, 0, 0, 0] : sk[p.id] || [0, 0, 0, 0];
          return [p.id, p.draft_year, p.draft_round, p.draft_pick, p.position_original || p.position_group, p.first_name || '', p.last_name || ''].concat(g ? [a[0], null, null, null, a[1], a[2], a[3], a[4], r2(a[5])] : [a[0], a[1], a[2], a[3], null, null, null, null, null], [p.position_secondary_original || null, hgp[p.id] || 0]); })
    };
  }

  // ---------- début de saison et saison morte ----------
  function assembleSeason(R) {
    var f = franchise(R), tc = teamCode(R), awardCode = {}; R.award.forEach(function (a) { awardCode[a.id] = a.code; });
    var players = sortBy(R.player.filter(function (p) { return p.origin === 'franchise'; }), function (p) { return [p.full_name]; }).map(function (p) { return { id: p.id, name: p.full_name, pos: p.position_group, key: pkey(p) }; });   // key : pour retrouver un nom tapé
    var pById = {}; R.player.forEach(function (p) { pById[p.id] = p; });
    var ranks = {}; R.standing.forEach(function (s) { (ranks[String(s.season)] = ranks[String(s.season)] || {})[s.team_code] = s.draft_rank; });
    function group(rows, keyFn, valFn) { var o = {}; rows.forEach(function (r) { (o[String(keyFn(r))] = o[String(keyFn(r))] || []).push(valFn(r)); }); return o; }
    var roles = {}; R.role_assignment.forEach(function (r) { (roles[String(r.season)] = roles[String(r.season)] || {})[r.slot] = r.player_id; });
    var ratings = {}; R.player_rating.forEach(function (r) { (ratings[String(r.season)] = ratings[String(r.season)] || {})[String(r.player_id)] = r.oa; });
    var cup = {}; R.stanley_cup_result.forEach(function (c) { cup[String(c.season)] = tc[c.champion_team_id] || null; });
    var stats = {}; R.skater_season_stats.filter(function (s) { return s.origin === 'franchise' && s.game_type === 'RS'; }).forEach(function (s) { stats[s.player_id + '|' + s.season] = [s.pts, s.g]; });
    var po = {}, poStats = {}; R.team_season_stats.filter(function (t) { return t.game_type === 'PO'; }).forEach(function (t) { po[String(t.season)] = t.result; poStats[String(t.season)] = [t.gp, t.w]; });
    // onglet Classement : base.standing[saison] = [[équipe, V, D, DP], …] dans l'ordre du rang (rang = index + 1) ; team_rs[saison] = [MJ, V, D, DP]
    var standing = {}; sortBy(R.standing, function (t) { return [t.season, t.overall_rank == null ? 1 : 0, t.overall_rank == null ? 0 : t.overall_rank, t.team_code]; }).forEach(function (t) { (standing[String(t.season)] = standing[String(t.season)] || []).push([t.team_code, t.w, t.l, t.otl]); });
    var teamRs = {}; R.team_season_stats.filter(function (t) { return t.game_type === 'RS'; }).forEach(function (t) { teamRs[String(t.season)] = [t.gp, t.w, t.l, t.otl]; });
    var standings = {}; R.standing.forEach(function (t) { (standings[String(t.season)] = standings[String(t.season)] || []).push([t.team_code, t.overall_rank, t.points, t.conference, t.division, t.division_rank]); });
    var ORDER = [[1, 'WEST', 1], [1, 'WEST', 2], [1, 'WEST', 3], [1, 'WEST', 4], [1, 'EAST', 1], [1, 'EAST', 2], [1, 'EAST', 3], [1, 'EAST', 4], [2, 'WEST', 1], [2, 'WEST', 2], [2, 'EAST', 1], [2, 'EAST', 2], [3, 'WEST', 1], [3, 'EAST', 1], [4, 'FINAL', 1]], seriesBy = {};
    R.playoff_series.forEach(function (x) { (seriesBy[String(x.season)] = seriesBy[String(x.season)] || {})[x.round + '|' + x.conference + '|' + x.slot] = [x.wins_a, x.wins_b]; });
    var series = {}; Object.keys(seriesBy).forEach(function (k) { series[k] = ORDER.map(function (o) { return seriesBy[k][o.join('|')] || null; }); });
    return { homo: homoPlayers(R),
      hist_awards: (function () { var o = {}; (R.historical_award_counts || []).forEach(function (x) { o[x.award_code] = typeof x.counts === 'string' ? JSON.parse(x.counts) : x.counts; }); return o; })(), league: Object.assign(leagueInfo(R), { teams: leagueTeams(R) }), franchise: { name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year, date: f.current_game_date, games: f.games_per_season || 82 }, players: players, teams: teams(R, true).map(function (x) { var t0 = R.team.filter(function (t) { return t.code === x.code; })[0]; x.c1 = t0 ? t0.color_1 || null : null; x.c2 = t0 ? t0.color_2 || null : null; x.c3 = t0 ? t0.color_3 || null : null; var mem = leagueMembers(R); x.active = mem ? (mem[x.code] ? 1 : 0) : (t0 && (t0.is_active === true || t0.is_active === 1) ? 1 : 0); return x; }),
      cap: R.salary_cap_season.map(function (c) { return [c.season, c.cap, c.floor, c.player_min, c.player_max_one_way, c.player_max_two_way, c.ahl_exemption, c.effective_on]; }), ranks: ranks,
      base: {
        series: series, roles: roles, ratings: ratings, oa_end: (function () { var o = {}; R.skater_season_stats.concat(R.goalie_season_stats).filter(function (s) { return s.origin === 'franchise' && s.game_type === 'RS' && s.oa_end != null; }).forEach(function (s) { (o[String(s.season)] = o[String(s.season)] || {})[String(s.player_id)] = s.oa_end; }); return o; })(), schedule: group(R.schedule_game, function (g) { return g.season; }, function (g) { return [g.game_no, g.game_date, g.opponent_code]; }),
        lottery: group(R.draft_lottery, function (d) { return d.draft_year; }, function (d) { return [d.pick, d.pre_lottery_rank, d.team_code]; }),
        top3: group(R.draft_top3, function (d) { return d.draft_year; }, function (d) { return [d.pick, tc[d.team_id] || null, d.player_name, d.position, d.potential]; }),
        picks: group(sortBy(R.draft_pick, function (d) { return [d.draft_year, d.round, d.overall_pick == null ? 1e9 : d.overall_pick]; }), function (d) { return d.draft_year; }, function (d) { return pickRow(d, pById[d.selected_player_id]); }),
        awards: group(R.award_win, function (w) { return w.season; }, function (w) { return [awardCode[w.award_id], w.place, w.player_key, w.team_code, w.stat_value]; }),
        allstar: group(R.all_star_selection, function (a) { return a.season; }, function (a) { return [a.team_level, a.position, a.player_key, a.team_code]; }), cup: cup,
        retire: group(R.retirement, function (r) { return r.retired_season; }, function (r) { return [r.team_code, r.position, r.player_key, b01(r.hof_nominee), r.hof_year, r.id, r.gp, r.g, r.a, r.plus_minus, r.w, r.so, r.sv_pct, r.gaa, r.ms_g05, r.ms_a075, r.ms_p1, r.ms_20g, r.ms_30g, r.ms_50g, r.ms_50p, r.ms_75p, r.ms_100p, r.ms_20w, r.ms_30w, r.ms_c30w, r.ms_40w, r.ms_wins]; }),
        cup_members: group(R.stanley_cup_member || [], function (m) { return m.season; }, function (m) { return [m.position_group, m.player_key]; }),
        // SV% de carrière (option hybride) : même agrégat que season/build_season_data.py
        gk_career: (function () { var o = {}; R.goalie_season_stats.forEach(function (s) { if (s.game_type !== 'RS' || !pById[s.player_id]) return;
          var k = pkey(pById[s.player_id]), a = o[k] = o[k] || [0, 0, 0], ok = s.saves != null && s.shots_against > 0;
          a[0] += s.gp || 0; if (ok) { a[1] += s.saves; a[2] += s.shots_against; } }); return o; })(),
        standing: standing
      },
      hist: sortBy(R.player.filter(function (p) { return p.origin === 'historical'; }), function (p) { return [p.full_name, p.id]; }).map(function (p) { return [p.id, p.full_name, p.position_group]; }),   // joueurs historiques proposés dans les écrans de choix d'un joueur
      contracts: R.contract.map(function (c) { return [c.player_id, c.start_on, c.end_on]; }), stats: stats, po: po, standings: standings, po_stats: poStats, team_rs: teamRs, draft: Object.assign({ start: startRoster(R) }, draftData(R)), labels: labels(R) };
  }


  // ---------- franchise et historique (setup.html) ----------
  function assembleSetup(R) {
    var f = activeFranchise(R);
    var tm = sortBy(R.team.filter(function (t) { return t.code !== 'NHL'; }), function (t) { return [t.name_en]; }).map(function (t) { var o = { code: t.code, en: t.name_en, fr: t.name_fr || t.name_en, active: t.is_active === true || t.is_active === 1 ? 1 : 0, fc: t.franchise_code || t.code, c1: t.color_1 || null, c2: t.color_2 || null, c3: t.color_3 || null }; if (t.logo) o.logo = t.logo; return o; });
    return { franchise: f ? { id: f.id, name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year, locale: f.ui_locale, games: f.games_per_season || 82 } : null, hasFranchise: !!f, teams: tm, labels: labels(R) };
  }

  // ---------- corrections de l'historique (history_edit.html) : lignes d'origine « historical », avec leur identifiant et l'indicateur « modifié à la main » ----------
  var HSK = ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'shg', 'ppp', 'shp', 'toi_minutes', 'fow', 'fot', 'hits', 'blocks', 'giveaways', 'takeaways'], HGK = ['gp', 'w', 'l', 'otl', 'so', 'saves', 'shots_against', 'goals_against', 'minutes', 'pim', 'g', 'a'];
  function assembleHistory(R) {
    var f = franchise(R), pl = {}; R.player.forEach(function (p) { pl[p.id] = { name: p.full_name, pos: p.position_group }; });
    function rows(list, cols, grp) { return list.filter(function (s) { return s.origin === 'historical'; }).map(function (s) { var r = [s.id, s.player_id, s.season, s.game_type, s.manual === true || s.manual === 1 ? 1 : 0].concat(cols.map(function (c) { return r2(s[c]); })); if (grp) r.push(s.position || null); return r; }); }   // grp : groupe de poste de la ligne (patineurs)
    return { franchise: f.id ? { name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary, f.color_tertiary], first: f.first_season_start_year, current: f.current_season_start_year } : null,
             homo: homoPlayers(R), players: pl, sk: rows(R.skater_season_stats, HSK, true), gk: rows(R.goalie_season_stats, HGK), pl: (function () {
        var span = {}; R.skater_season_stats.concat(R.goalie_season_stats).forEach(function (x) { var a = span[x.player_id] = span[x.player_id] || { lo: 99999, hi: 0, n: {} }; a.lo = Math.min(a.lo, x.season); a.hi = Math.max(a.hi, x.season); a.n[x.season] = 1; });
        return R.player.map(function (p) { var a = span[p.id]; return [p.id, p.full_name, p.position_group, p.hr_id || '', p.origin, a ? a.lo : 0, a ? a.hi : 0, a ? Object.keys(a.n).length : 0]; });
      })(), labels: labels(R) };
  }

  var api = { startRoster: startRoster, loadVersions: loadVersions, VERSION_DEPS: VERSION_DEPS, activeFranchise: activeFranchise, readTable: readTable, tableDefs: tableDefs, OPTIONAL: OPTIONAL, PAGE_TABLES: PAGE_TABLES, leagueInfo: leagueInfo, leagueTeams: leagueTeams, draftData: draftData, assembleSetup: assembleSetup, assembleHistory: assembleHistory, HSK: HSK, HGK: HGK, TABLES: TABLES, loadAll: loadAll, assemblePlayerCard: assemblePlayerCard, assembleEntry: assembleEntry, assembleEvents: assembleEvents, assembleSeason: assembleSeason };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTLIVE = api;
})(typeof window !== 'undefined' ? window : this);

;/* Panneau Supabase partagé par les pages : connexion, envoi, rechargement. */
(function (root) {
  function panel(t, esc, sync, opts) {
    opts = opts || {};
    var h = '<section class="card sb"><h3>' + esc(t('sb.title')) + '</h3>';
    if (sync.user) h += '<p class="ok">' + esc(t('sb.connected')) + ' : ' + esc(sync.user) + '</p><div class="acts left">' + (opts.noPush ? '' : '<button class="btn" data-sb="push"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.push')) + '</button>') + '<button class="btn" data-sb="pull"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.pull')) + '</button><button class="btn ghost" data-sb="logout">' + esc(t('sb.logout')) + '</button></div>';
    else h += '<p class="muted">' + esc(t('sb.not_connected')) + '</p><div class="acts left"><input id="sb-email" type="email" placeholder="' + esc(t('sb.email')) + '" autocomplete="username"><input id="sb-pw" type="password" placeholder="' + esc(t('sb.password')) + '" autocomplete="current-password"><button class="btn" data-sb="login"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('sb.login')) + '</button></div>';
    return h + (sync.busy ? '<p class="muted">' + esc(t('sb.busy')) + '</p>' : sync.msg ? '<p class="' + sync.level + '">' + esc(sync.msg) + '</p>' : '') + '</section>';
  }
  // Branche les boutons du panneau sur les fonctions de l'application (doLogin, doLogout, doPull, doPush) ; draw redessine la page
  function wire(rootEl, app, client, draw) {
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || !b.dataset.sb) return;
      var act = b.dataset.sb, s = app.sync;
      if (act === 'login') { var em = document.getElementById('sb-email').value.trim(), pw = document.getElementById('sb-pw').value; s.busy = true; draw(); app.doLogin(client, em, pw).then(function (ok) { return ok ? app.doPull(client, true) : null; }).then(function () { draw(); }); }
      else if (act === 'logout') { app.doLogout(client); draw(); }
      else if (act === 'pull') { s.busy = true; draw(); app.doPull(client).then(function () { draw(); }); }
      else if (act === 'push') { s.busy = true; draw(); app.doPush(client).then(function () { draw(); }); }
    }, true);
  }
  var api = { panel: panel, wire: wire };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTP = api;
})(typeof window !== 'undefined' ? window : this);

;/* Navigation par groupes (phase 4b) : la liste unique des groupes et des onglets, décrite dans docs/NAVIGATION.md.
   Un groupe = une page (<groupe>.html) ; un onglet est servi par une application (« volet ») de la page, avec son onglet interne (app).
   soon : onglet pas encore construit (visible, grisé, « À venir », décision du 2026-11-19).
   Ce fichier ne dépend de rien : il sert aux pages, à l'index et aux tests Node (connect/test_nav.js vérifie qu'il concorde avec NAVIGATION.md). */
(function (root) {
  // kind : saisie (enter) ou consultation (view) ; store : clé des saisies en attente de la page (suffixe _f<franchise>, connect/live_mount.js)
  var GROUPS = [
    { id: 'franchise', sec: 'enter', store: null, tabs: [{ id: 'franchise', pane: 'setup' }, { id: 'history_fix', pane: 'hist' }] },
    { id: 'start', sec: 'enter', tabs: [{ id: 'roster0', app: 'roster0' }, { id: 'picks0', app: 'picks0' }] },
    { id: 'preseason', sec: 'enter', store: 'ft_pre_v1', tabs: [{ id: 'cap', app: 'cap' }, { id: 'lineup', app: 'roles' }, { id: 'ratings', app: 'ratings' }, { id: 'schedule', app: 'schedule' }] },
    { id: 'stats', sec: 'enter', store: 'ft_entries_v1', tabs: [{ id: 'skaters', app: 'sk' }, { id: 'goalies', app: 'gk' }, { id: 'team', app: 'tm' }] },
    { id: 'roster', sec: 'enter', store: 'ft_events_v1', tabs: [{ id: 'injuries', app: 'inj' }, { id: 'moves', app: 'mv' }, { id: 'trades', app: 'tr' }, { id: 'contracts', app: 'ct' }, { id: 'offers', app: 'os' }, { id: 'positions', app: 'pc' }, { id: 'players', app: 'pl' }] },
    { id: 'results', sec: 'enter', store: 'ft_results_v1', tabs: [{ id: 'standings', app: 'standings' }, { id: 'series', app: 'series' }, { id: 'cup', app: 'cup' }] },
    { id: 'honors', sec: 'enter', store: 'ft_honors_v1', tabs: [{ id: 'awards', app: 'awards' }, { id: 'allstar', app: 'allstar' }, { id: 'retire', app: 'retire' }] },
    { id: 'draft', sec: 'enter', store: 'ft_draft_v1', tabs: [{ id: 'owned', app: 'owned', kind: 'view' }, { id: 'lottery', app: 'lottery' }, { id: 'ranks', app: 'ranks', kind: 'view' }, { id: 'top3', app: 'top3' }, { id: 'picks', app: 'picks' }, { id: 'board', app: 'board', kind: 'view' }] },
    { id: 'cards', sec: 'view', tabs: [{ id: 'player', app: 'player' }, { id: 'goalie', soon: 1 }, { id: 'team', app: 'team' }] },
    { id: 'team_records', sec: 'view', tabs: [{ id: 'skaters', soon: 1 }, { id: 'goalies', soon: 1 }, { id: 'team', soon: 1 }] },
    { id: 'league_records', sec: 'view', tabs: [{ id: 'players', soon: 1 }, { id: 'teams', soon: 1 }, { id: 'hof', soon: 1 }] },
    { id: 'analysis', sec: 'view', tabs: [{ id: 'opening', soon: 1 }, { id: 'depth', soon: 1 }, { id: 'contracts', app: 'contracts' }, { id: 'evolution', soon: 1 }, { id: 'makeup', soon: 1 }, { id: 'trades', soon: 1 }] }
  ];
  GROUPS.forEach(function (g) { g.tabs.forEach(function (x) { if (!x.kind) x.kind = g.sec; if (!x.pane) x.pane = 'main'; }); });
  // anciennes pages → groupe et onglet (les fichiers restent publiés, réduits à une redirection)
  var REDIRECTS = { 'setup.html': ['franchise', 'franchise'], 'history_edit.html': ['franchise', 'history_fix'], 'entry.html': ['stats', 'skaters'], 'events.html': ['roster', 'moves'],
                    'offseason.html': ['results', 'standings'], 'player_card.html': ['cards', 'player'] };
  // saisies en attente de l'ancienne Saison morte (ft_off_v1) : réparties par onglet dans les clés des nouveaux groupes
  var LEGACY_SPLIT = { ft_off_v1: { standings: 'ft_results_v1', series: 'ft_results_v1', cup: 'ft_results_v1', awards: 'ft_honors_v1', allstar: 'ft_honors_v1', retire: 'ft_honors_v1', cap: 'ft_pre_v1', lottery: 'ft_draft_v1', top3: 'ft_draft_v1', picks: 'ft_draft_v1' } };

  function group(id) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i]; return null; }
  function tab(gid, tid) { var g = group(gid); if (!g) return null; for (var i = 0; i < g.tabs.length; i++) if (g.tabs[i].id === tid) return g.tabs[i]; return null; }
  function ready(g) { return g.tabs.some(function (x) { return !x.soon; }); }
  function firstReady(g) { for (var i = 0; i < g.tabs.length; i++) if (!g.tabs[i].soon) return g.tabs[i]; return null; }
  function href(gid, tid) { return gid + '.html' + (tid ? '#' + tid : ''); }
  // onglet de navigation servi par (volet, onglet interne)
  function tabOfApp(gid, pane, app) { var g = group(gid); if (!g) return null; for (var i = 0; i < g.tabs.length; i++) { var x = g.tabs[i]; if (!x.soon && x.pane === (pane || 'main') && (x.app == null || x.app === app)) return x; } return null; }
  function storeKeys() { var l = []; GROUPS.forEach(function (g) { if (g.store && l.indexOf(g.store) < 0) l.push(g.store); }); return l; }

  // ---- saisies en attente, comptées depuis le stockage (sans l'application) : { onglet: n } ----
  function size(x) { return Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0; }
  function countGrid(o, g) { var out = {}; g.tabs.forEach(function (x) { if (x.soon || !x.app) return; var n = 0, e = o[x.app] || {}; Object.keys(e).forEach(function (s) { n += size(e[s]); }); if (n) out[x.id] = n; }); return out; }
  function countEntry(o) {
    var out = {}, by = { sk: 'skaters', gk: 'goalies' };
    ['sk', 'gk'].forEach(function (k) { var n = 0; Object.keys(o[k] || {}).forEach(function (s) { Object.keys(o[k][s]).forEach(function (p) { if (size(o[k][s][p])) n++; }); }); Object.keys((o.removed || {})[k] || {}).forEach(function (s) { n += size(o.removed[k][s]); }); if (n) out[by[k]] = n; });
    var t = 0; Object.keys(o.tm || {}).forEach(function (s) { if (size(o.tm[s])) t++; }); if (t) out.team = t; return out;
  }
  function countEvents(o) {
    var out = {}, add = function (k, n) { if (n) out[k] = (out[k] || 0) + n; };
    (o.mv || []).forEach(function (r) { add(r.move === 'injury' ? 'injuries' : 'moves', 1); });
    (o.mvx || []).forEach(function (r) { add(r.move === 'injury' || r.kind === 'inj' ? 'injuries' : 'moves', 1); });
    add('trades', (o.trf || []).length); add('contracts', size(o.ct) + size(o.ctx)); add('offers', size(o.os)); add('positions', size(o.pc));
    add('contracts', (o.np || []).length);   // anciennes lignes de Nouveau joueur : converties à l'ouverture d'Effectif (onglet Contrats par défaut)
    return out;
  }
  function countStore(key, json) {
    var o; try { o = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return {}; } if (!o || typeof o !== 'object') return {};
    var g = GROUPS.filter(function (x) { return x.store === key; })[0]; if (!g) return {};
    if (key === 'ft_entries_v1') return countEntry(o);
    if (key === 'ft_events_v1') return countEvents(o);
    return countGrid(o, g);
  }
  // { groupe: { total, tabs: { onglet: n } }, total } pour une franchise ; get(clé) lit le stockage
  function pending(get, fid) {
    var res = { total: 0 };
    GROUPS.forEach(function (g) {
      if (!g.store) return; var raw = null; try { raw = get(fid != null ? g.store + '_f' + fid : g.store); } catch (e) { raw = null; }
      var c = raw ? countStore(g.store, raw) : {}, n = 0; Object.keys(c).forEach(function (k) { n += c[k]; });
      res[g.id] = { total: n, tabs: c }; res.total += n;
    });
    return res;
  }
  // répartit une ancienne clé (objet { onglet: … }) dans les nouvelles : { clé: objet fusionné } ; les saisies déjà présentes dans la nouvelle clé gardent la priorité
  function splitLegacy(oldKey, oldJson, readNew) {
    var map = LEGACY_SPLIT[oldKey], o; if (!map) return {}; try { o = JSON.parse(oldJson); } catch (e) { return {}; } if (!o || typeof o !== 'object') return {};
    var out = {};
    Object.keys(map).forEach(function (tb) {
      var e = o[tb]; if (!e || !size(e)) return; var k = map[tb];
      if (!out[k]) { var cur = null; try { cur = JSON.parse(readNew(k) || 'null'); } catch (x) { cur = null; } out[k] = cur && typeof cur === 'object' ? cur : {}; }
      var dst = out[k][tb] = out[k][tb] || {}; Object.keys(e).forEach(function (s) { if (!(s in dst) || !size(dst[s])) dst[s] = e[s]; });
    });
    return out;
  }

  var api = { GROUPS: GROUPS, REDIRECTS: REDIRECTS, LEGACY_SPLIT: LEGACY_SPLIT, group: group, tab: tab, ready: ready, firstReady: firstReady, href: href, tabOfApp: tabOfApp, storeKeys: storeKeys, countStore: countStore, pending: pending, splitLegacy: splitLegacy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTNAV = api;
})(typeof window !== 'undefined' ? window : this);

;/* Coquille de navigation (phase 4b, docs/NAVIGATION.md) : barre de groupes, rangée d'onglets, compteur de saisies en attente,
   onglets « À venir », onglet dans l'URL (#onglet), volets d'une page (Franchise : deux applications), pied de page.
   La page déclare window.FT_PAGE = { group, panes: ['main'] | ['setup', 'hist'], attr: 'tab' | 'view', index, connect }.
   live_mount.js appelle decorate() à chaque dessin d'un volet ; les applications gardent leur état (state.tab ou state.view). */
(function (root) {
  var NAV = root.FTNAV || (typeof require !== 'undefined' ? require('./ft_nav.js') : null);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fill(s, p) { (p || []).forEach(function (x, i) { s = String(s).split('{' + i + '}').join(x); }); return s; }
  var IC = {
    pen: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.4l3 3L5.4 13.6 2 14l.4-3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    view: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 13.5h12M3.5 11V7.5M7 11V3.5M10.5 11V6M14 11V8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    clock: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2"/><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tool: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.2a3.3 3.3 0 0 0-3.9 4.4L2.3 10.9a1.2 1.2 0 0 0 1.7 1.7l4.3-4.3a3.3 3.3 0 0 0 4.4-3.9l-2 2-1.9-.3-.3-1.9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    home: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5L8 2.8l5.5 4.7V13.5h-3.7v-3.6H6.2v3.6H2.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };

  // ---- rendu (fonctions pures, testées sous Node) ; L(clé, court) = libellé ----
  function lbl(L, k, short) { var v = L(k, short); return v == null ? k : v; }
  function search(loc) { return String(loc || '').replace(/([?&])moved=[^&]*&?/, '$1').replace(/[?&]$/, ''); }
  function groupBar(L, active, pend, q) {
    function sec(id, icon) {
      return '<div class="ft-gsec" data-sec="' + id + '"><span class="ft-gsec-l">' + icon + esc(lbl(L, 'nav.sec.' + id)) + '</span><ul>' + NAV.GROUPS.filter(function (g) { return g.sec === id; }).map(function (g) {
        var name = esc(lbl(L, 'nav.g.' + g.id)), n = pend && pend[g.id] ? pend[g.id].total : 0;
        var c = n ? '<span class="ft-cnt" title="' + esc(fill(lbl(L, n === 1 ? 'nav.pending_group_one' : 'nav.pending_group_other'), [n])) + '">' + n + '</span>' : '';
        if (!NAV.ready(g)) return '<li><span class="ft-g" data-g="' + g.id + '" aria-disabled="true" title="' + esc(lbl(L, 'nav.soon_hint')) + '">' + name + '</span></li>';
        return '<li><a class="ft-g" data-g="' + g.id + '" href="' + NAV.href(g.id) + (q || '') + '"' + (g.id === active ? ' aria-current="page"' : '') + '>' + name + c + '</a></li>';
      }).join('') + '</ul></div>';
    }
    return '<nav class="ft-groups" aria-label="' + esc(lbl(L, 'nav.groups')) + '">' + sec('enter', IC.pen) + sec('view', IC.view) + '</nav>';
  }
  // pane : volet affiché ; attr : attribut que l'application du volet lit (data-tab ou data-view)
  function tabRow(L, gid, cur, pane, attr, pend) {
    var g = NAV.group(gid), x0 = NAV.tab(gid, cur) || NAV.firstReady(g), counts = pend && pend[gid] ? pend[gid].tabs : {};
    return '<div class="ft-tabs" role="tablist" data-mode="' + (x0 ? x0.kind : g.sec) + '" data-group="' + gid + '" aria-label="' + esc(fill(lbl(L, 'nav.tabs'), [lbl(L, 'nav.g.' + gid)])) + '">' + g.tabs.map(function (x) {
      var on = x.id === cur, own = !x.soon && x.app && x.pane === pane ? ' data-' + attr + '="' + x.app + '"' : '', n = counts[x.id] || 0;
      return '<button type="button" role="tab" class="ft-tab" id="tab-' + gid + '-' + x.id + '" data-navtab="' + x.id + '" data-kind="' + x.kind + '"' + own + ' aria-selected="' + on + '" aria-pressed="' + on + '" tabindex="' + (on ? 0 : -1) + '"' +
        (x.soon ? ' aria-disabled="true" title="' + esc(lbl(L, 'nav.soon_hint')) + '"' : '') + '>' + esc(lbl(L, 'nav.t.' + gid + '.' + x.id, true)) +
        (n ? '<span class="ft-cnt">' + n + '</span>' : '') + (x.soon ? '<span class="ft-soon">' + esc(lbl(L, 'nav.soon')) + '</span>' : '') + '<span class="vh">, ' + esc(lbl(L, x.kind === 'view' ? 'nav.kind_view' : 'nav.kind_enter')) + '</span></button>';
    }).join('') + '</div>';
  }
  function soonMain(L, gid, tid) {
    var first = NAV.firstReady(NAV.group(gid));
    return '<main class="entry ft-soonmain"><div class="ft-empty" role="status">' + IC.clock + '<h2>' + esc(lbl(L, 'nav.t.' + gid + '.' + tid)) + '</h2><p class="lead">' + esc(lbl(L, 'nav.soon_hint')) + '</p><p>' + esc(lbl(L, 'nav.soon_body')) + '</p>' +
      (first ? '<button type="button" class="btn" data-go-tab="' + first.id + '">' + esc(fill(lbl(L, 'nav.soon_go'), [lbl(L, 'nav.t.' + gid + '.' + first.id)])) + '</button>' : '') + '</div></main>';
  }
  function pendBadge(L, pend, q) {
    var n = pend ? pend.total : 0, first = n ? NAV.GROUPS.filter(function (g) { return pend[g.id] && pend[g.id].total; })[0] : null;
    var txt = esc(fill(lbl(L, n === 1 ? 'nav.pending_badge_one' : 'nav.pending_badge_other'), ['\u0000'])).replace('\u0000', '<b>' + n + '</b>');
    return '<a class="ft-pend" data-n="' + n + '" href="' + (first ? NAV.href(first.id) + (q || '') : '#') + '"' + (n ? '' : ' hidden') + ' title="' + esc(fill(lbl(L, 'nav.pending_title'), [n])) + '">' + txt + '</a>';
  }
  function footer(L, connectHref) { return '<footer class="ft-foot">' + IC.tool + '<span>' + esc(lbl(L, 'nav.sec.tools')) + '</span><a href="' + esc(connectHref || 'connect.html') + '">' + esc(lbl(L, 'nav.t.tools.connect')) + '</a></footer>'; }
  function movedMsg(L, gid, tid) { return '<p class="ft-redirect" role="status">' + esc(fill(lbl(L, 'nav.redirect'), [lbl(L, 'nav.g.' + gid) + ' › ' + lbl(L, 'nav.t.' + gid + '.' + tid)])) + '</p>'; }

  // ---- état de la page ----
  var S = { page: null, tab: null, soon: null, pane: null, hosts: {}, mounts: {}, mounted: {}, moved: null, fid: null, leaving: false, store: null };
  function P() { return S.page; }
  function lsGet(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (root.localStorage) root.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function fidNow() { return S.fid != null ? S.fid : (+lsGet('ft_franchise') || null); }
  function pendNow() { return NAV.pending(lsGet, fidNow()); }
  function hashTab() { try { return decodeURIComponent(String((root.location && root.location.hash) || '').slice(1)); } catch (e) { return ''; } }
  function q() { try { return search(root.location.search || ''); } catch (e) { return ''; } }
  function paneOf(x) { var g = NAV.group(S.page.group); return x && !x.soon ? x.pane : (S.pane || (NAV.firstReady(g) || {}).pane || 'main'); }
  function qsa(sel) { var d = root.document; return d && typeof d.querySelectorAll === 'function' ? [].slice.call(d.querySelectorAll(sel)) : []; }   // (tests Node : document minimal)
  function paneEl(p) { var d = root.document; return d && typeof d.querySelector === 'function' ? d.querySelector('[data-pane="' + p + '"]') : null; }
  function on(t, ev, f, cap) { if (t && typeof t.addEventListener === 'function') t.addEventListener(ev, f, cap); }
  function attr() { return S.page.attr || 'tab'; }

  // hauteur de l'en-tête collant de la page, publiée dans --ft-top-h : l'en-tête d'un long tableau colle juste dessous (phase 4d)
  function topH() { try { var h = root.document.querySelector('header.top'); if (h) root.document.documentElement.style.setProperty('--ft-top-h', h.getBoundingClientRect().height + 'px'); } catch (e) { /* hors navigateur */ } }
  function watchTop() { if (typeof root.document === 'undefined' || !root.document.body) return; topH(); if (root.ResizeObserver) new root.ResizeObserver(topH).observe(root.document.body); }
  function init(page) {
    watchTop();
    S.page = page; var g = NAV.group(page.group); if (!g) return;
    var h = hashTab(), x = NAV.tab(g.id, h), saved = NAV.tab(g.id, lsGet('ft_tab_' + g.id) || '');
    if (!x) x = saved && !saved.soon ? saved : NAV.firstReady(g);
    S.tab = x.id; S.soon = x.soon ? x.id : null; S.pane = paneOf(x);
    try {   // ancienne adresse redirigée : message une fois, paramètre retiré de l'URL
      var m = /[?&]moved=([^&#]*)/.exec(root.location.search); if (m) { S.moved = { g: g.id, t: x.id }; root.history.replaceState(null, '', root.location.pathname + q() + '#' + x.id); }
      else if (h !== x.id) root.history.replaceState(null, '', root.location.pathname + root.location.search + '#' + x.id);
    } catch (e) { /* file:// ou historique indisponible */ }
    qsa('[data-pane]').forEach(function (el) { el.hidden = el.getAttribute('data-pane') !== S.pane; });
    wire();
  }
  // applique l'onglet courant à l'application d'un volet (au premier dessin, ou après un changement d'URL)
  function applyTo(app, pane) {
    if (!S.page || !app || !app.state) return; var x = NAV.tab(S.page.group, S.tab);
    if (x && !x.soon && x.pane === pane && x.app) app.state[attr()] = x.app;
  }
  function mount(pane, fn) {
    S.mounts[pane] = fn;
    if (!S.page || pane === S.pane || (S.page.panes || ['main']).length < 2) { S.mounted[pane] = true; fn(paneEl(pane) || root.document.getElementById('app'), pane); }
  }
  function addHost(pane, host) { S.hosts[pane] = host; }
  function redraw() { var h = S.hosts[S.pane]; if (h) h.draw(); }
  function showPane(p) {
    S.pane = p; qsa('[data-pane]').forEach(function (el) { el.hidden = el.getAttribute('data-pane') !== p; });
    if (!S.mounted[p] && S.mounts[p]) { S.mounted[p] = true; S.mounts[p](paneEl(p), p); return; }
    var h = S.hosts[p]; if (h) { var a = h.app(); if (a && a.state) { applyTo(a, p); var lg = lsGet('ft_lang'); if (lg === 'fr' || lg === 'en') a.state.lang = lg; } h.draw(); }
  }
  // va à un onglet ; push : nouvelle entrée d'historique ; byApp : l'application du volet fait elle-même le changement (bouton data-tab)
  function go(id, push, byApp) {
    var g = NAV.group(S.page.group), x = NAV.tab(g.id, id); if (!x) return;
    S.tab = x.id; S.soon = x.soon ? x.id : null; S.moved = null; if (!x.soon) lsSet('ft_tab_' + g.id, x.id);
    try { if (root.location.hash !== '#' + x.id) root.history[push ? 'pushState' : 'replaceState'](null, '', root.location.pathname + root.location.search + '#' + x.id); } catch (e) { /* ignore */ }
    var p = paneOf(x);
    if (p !== S.pane) { showPane(p); return; }
    if (byApp) return;
    var h = S.hosts[p], a = h && h.app(); if (a) applyTo(a, p); redraw();
  }

  // ---- décoration du HTML d'un volet (appelée par live_mount.js) ; c : { L, pane, app, fid } ----
  function decorate(html, c) {
    if (!S.page) return html;
    if (c.fid != null) S.fid = c.fid;
    var gid = S.page.group, L = c.L, pend = pendNow(), qs = q();
    if (c.pane === S.pane && !S.soon && c.app && c.app.state) {   // l'application a changé d'onglet d'elle-même : l'URL suit
      var x = NAV.tabOfApp(gid, c.pane, c.app.state[attr()]);
      if (x && x.id !== S.tab) { S.tab = x.id; lsSet('ft_tab_' + gid, x.id); try { root.history.replaceState(null, '', root.location.pathname + root.location.search + '#' + x.id); } catch (e) { /* ignore */ } }
    }
    html = html.replace(/(<header class="top">[\s\S]*?<div class="sub">)[^<]*(<\/div>)/, function (m, x, y) { return x + esc(lbl(L, 'nav.g.' + gid)) + y; });   // sous-titre : le groupe
    var bar = groupBar(L, gid, pend, qs) + tabRow(L, gid, S.tab, c.pane, attr(), pend) + (S.moved ? movedMsg(L, S.moved.g, S.moved.t) : '');
    html = html.replace('<div class="ctl">', '<div class="ctl"><a class="ft-home" href="' + esc(S.page.index || 'index.html') + qs + '" title="' + esc(lbl(L, 'nav.home')) + '" aria-label="' + esc(lbl(L, 'nav.home')) + '">' + IC.home + '</a>' + pendBadge(L, pend, qs));
    var hi = html.indexOf('</header>');
    html = hi >= 0 ? html.slice(0, hi + 9) + bar + html.slice(hi + 9) : bar + html;
    if (S.soon) html = html.replace(/<main[\s\S]*<\/main>/, soonMain(L, gid, S.soon));
    return html + footer(L, S.page.connect);
  }

  // ---- évènements : onglets (clic, clavier), « Aller à », retour arrière, sortie de l'application ----
  var wired = false;
  function wire() {
    if (wired || !root.document) return; wired = true; var doc = root.document;
    on(doc, 'click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var b = t.closest('[data-navtab]');
      if (b) {
        var x = NAV.tab(S.page.group, b.getAttribute('data-navtab')), own = x && !x.soon && b.hasAttribute('data-' + attr());
        if (!x) return; if (!own) { e.preventDefault(); e.stopPropagation(); }
        go(x.id, true, own); return;
      }
      var gt = t.closest('[data-go-tab]'); if (gt) { e.preventDefault(); e.stopPropagation(); go(gt.getAttribute('data-go-tab'), true, false); return; }
      var a = t.closest('a[href]'); if (a && a.target !== '_blank') { try { var u = new URL(a.getAttribute('href'), root.location.href); if (u.origin === root.location.origin || (u.protocol === 'file:' && root.location.protocol === 'file:')) { S.leaving = true; setTimeout(function () { S.leaving = false; }, 2000); } } catch (x2) { /* ignore */ } }
    }, true);
    on(doc, 'keydown', function (e) {
      var tab = e.target && e.target.closest ? e.target.closest('.ft-tabs [role=tab]') : null; if (!tab) return;
      var list = [].slice.call(tab.parentNode.querySelectorAll('[role=tab]')), i = list.indexOf(tab), j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % list.length; else if (e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = list.length - 1;
      if (j == null) return; e.preventDefault(); var id = list[j].id; list[j].click();
      setTimeout(function () { var el = doc.getElementById(id); if (el) el.focus(); }, 0);
    });
    on(root, 'hashchange', function () { var h = hashTab(); if (h && h !== S.tab && NAV.tab(S.page.group, h)) go(h, false, false); });
    // saisies non envoyées : avertissement en quittant l'application (pas en passant d'un groupe à l'autre : elles restent dans ce navigateur)
    on(root, 'beforeunload', function (e) { if (S.leaving || !(pendNow().total > 0)) return; e.preventDefault(); e.returnValue = ''; return ''; });
    // le compteur suit les saisies faites dans une autre fenêtre
    on(root, 'storage', function (e) { if (e.key && /^ft_(entries|events|pre|results|honors|draft)_v1/.test(e.key)) redraw(); });
  }

  var api = { init: init, mount: mount, addHost: addHost, applyTo: applyTo, decorate: decorate, go: go, state: function () { return S; }, page: P,
              groupBar: groupBar, tabRow: tabRow, soonMain: soonMain, pendBadge: pendBadge, footer: footer, IC: IC, esc: esc, fill: fill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTSHELL = api;
  if (typeof window !== 'undefined' && root.FT_PAGE && root.document) init(root.FT_PAGE);
})(typeof window !== 'undefined' ? window : this);

;/* Démarrage d'une page connectée à Supabase : écran de connexion, chargement des données, reconstruction de l'application. */
(function (root) {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // o : { DATA0, store, cfg, rootEl, makeApp(data), assemble(raw) }
  function perfApi() { return typeof FTPERF !== 'undefined' ? FTPERF : root.FTPERF; }
  function pspan(n) { var P = perfApi(); return P ? P.span(n) : function () {}; }
  // ---- Texte lisible sur une couleur d'équipe (2026-11-12) : la 3e couleur de l'équipe si elle atteint 4,5:1 contre le fond,
  //      sinon le noir ou le blanc, celui qui contraste le plus (l'un des deux atteint toujours au moins 4,58:1). Copie courte dans make_site.py (index).
  var HEX = /^#[0-9A-Fa-f]{6}$/;
  function lum(hex) {   // luminance relative WCAG 2.x
    var n = parseInt(hex.slice(1), 16), k = [0.2126, 0.7152, 0.0722];
    return [n >> 16 & 255, n >> 8 & 255, n & 255].reduce(function (s, v, i) { v /= 255; return s + k[i] * (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); }, 0);
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function mixHex(a, b, p) {   // = CSS color-mix(in srgb, a p*100 %, b)
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    return '#' + [16, 8, 0].map(function (s) { var v = Math.round(p * (x >> s & 255) + (1 - p) * (y >> s & 255)); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase();
  }
  function onColor(bg, third) {
    if (!HEX.test(bg || '')) return '#FFFFFF';
    if (HEX.test(third || '') && contrast(bg, third) >= 4.5) return third.toUpperCase();
    return contrast(bg, '#FFFFFF') >= contrast(bg, '#000000') ? '#FFFFFF' : '#000000';
  }
  function run(o) {
    var rootEl = o.rootEl, store = o.store, DATA0 = o.DATA0, saved = {};
    // coquille de navigation (connect/ft_shell.js) : volet de la page (« main », ou « setup » / « hist » dans Franchise)
    var SH = root.FTSHELL && root.FTSHELL.page() ? root.FTSHELL : null, PANE = (rootEl && rootEl.getAttribute && rootEl.getAttribute('data-pane')) || 'main';
    try { saved = JSON.parse(store.get('ft_cfg') || '{}'); } catch (e) { saved = {}; }
    var LANGS = ['fr', 'en'], storedLang = null, storedTeam = null, storedTheme = null;
    try { storedLang = store.get('ft_lang'); storedTeam = store.get('ft_team'); storedTheme = store.get('ft_theme'); } catch (e) { /* stockage indisponible */ }
    var hasStoredLang = LANGS.indexOf(storedLang) >= 0, f0 = DATA0.franchise || {};
    var client = FTSB.makeClient({ url: saved.url || o.cfg.url, key: saved.key || o.cfg.key }, store), app = null,
        ui = { lang: hasStoredLang ? storedLang : (!DATA0.__lite && LANGS.indexOf(f0.locale) >= 0 ? f0.locale : 'fr'), last: null, busy: false, progress: '', error: '', team: storedTeam || (!DATA0.__lite && f0.code) || null };
    function T(key, p) {
      var e = (DATA0.labels || {})[key], s = key, lg = app ? app.state.lang : ui.lang; if (e) { var v = e[lg] || e.fr || e.en; if (v) s = v[0]; }
      (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s;
    }
    // Langue : la dernière langue choisie est conservée dans le navigateur ; sinon la langue favorite de la franchise ; sinon le français
    function persistLang() {
      var cur = app ? app.state.lang : ui.lang;
      if (LANGS.indexOf(cur) < 0) return;
      if (ui.last !== null && cur !== ui.last) { hasStoredLang = true; try { store.set('ft_lang', cur); } catch (e) { /* ignore */ } }   // changement fait par l'utilisateur
      ui.last = cur; ui.lang = cur;
    }
    // Thème : « clair » ou « sombre » choisi par l'utilisateur ; tant que rien n'est choisi, la page suit l'ordinateur
    function systemDark() { try { return typeof root.matchMedia === 'function' && root.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } }
    function chosenTheme() { var s = null; try { s = store.get('ft_theme'); } catch (e) { /* ignore */ } return s === 'dark' || s === 'light' ? s : null; }
    function effectiveTheme() { return chosenTheme() || (systemDark() ? 'dark' : 'light'); }
    function applyTheme() { try { var el = root.document && root.document.documentElement, c = chosenTheme(); if (el && el.setAttribute && c) el.setAttribute('data-theme', c); } catch (e) { /* ignore */ } }
    var THEME_FALLBACK = { light: { fr: 'Clair', en: 'Light' }, dark: { fr: 'Sombre', en: 'Dark' }, title: { fr: 'Affichage', en: 'Display' } };
    function TT(key, fb) { var r = T(key); return r === key ? THEME_FALLBACK[fb][app ? app.state.lang : ui.lang] || THEME_FALLBACK[fb].fr : r; }
    function themeSegHTML() {
      var cur = effectiveTheme();
      return '<div class="seg" role="group" data-themeseg="1" aria-label="' + esc(TT('ui.theme', 'title')) + '"><button data-theme-set="light" aria-pressed="' + (cur === 'light') + '">' + esc(TT('ui.theme_light', 'light')) + '</button><button data-theme-set="dark" aria-pressed="' + (cur === 'dark') + '">' + esc(TT('ui.theme_dark', 'dark')) + '</button></div>';
    }
    // Logo officiel de l'équipe (réseau de distribution de la LNH) à la place du carré ; si l'image ne charge pas, le carré revient
    function crestHTML(code) {
      var c = String(code || '').toUpperCase().replace(/[^A-Z]/g, ''); if (c === 'VEG') c = 'VGK'; if (!c) return '<span class="crest"></span>';
      if (ui.logo && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(ui.logo)) return '<span class="crest logo"><img src="' + ui.logo + '" alt=""></span>';       // équipe personnalisée : son logo
      return '<span class="crest logo"><img src="https://assets.nhle.com/logos/nhl/svg/' + c + '_light.svg" alt="" onerror="this.parentNode.className=\'crest\';this.remove()"></span>';
    }

    // Navigation : barre de groupes et onglets de la coquille (connect/ft_shell.js, phase 4b) ; l'ancienne navigation en pilules est retirée
    // libellé long ou court (table label) pour la coquille
    function LBL(key, short) {
      var labs = (ui.dataNow && ui.dataNow.labels) || DATA0.labels || {}, e = labs[key], lg = app ? app.state.lang : ui.lang; if (!e) return key;
      var v = e[lg] || e.fr || e.en; return v ? (short && v[1] ? v[1] : v[0]) : key;
    }
    function decorate(html) {
      var seg = themeSegHTML();
      html = html.replace(/<button data-u?lang="en"[^>]*>EN<\/button><\/div>/, function (m) { return m + seg; });
      html = html.replace(/<section class="card sb">[\s\S]*?<\/section>/, function (sec) { return sec.replace(/<p class="([^"]*)">([^<]*)<\/p>/g, '<p class="$1" title="$2">$2</p>'); });   // texte du panneau complet en infobulle quand il est tronqué
      var hi = html.indexOf('</header>');     // sélecteurs placés dans la page (onglets) : version « pilule » lisible sur le fond de la page
      if (hi >= 0) html = html.slice(0, hi) + html.slice(hi).replace(/class="seg((?: [^"]*)?)"/g, function (m, rest) { return /(^| )page( |$)/.test(rest) ? m : 'class="seg' + rest + ' page"'; });
      html = html.replace(/<a class="navlink" href="[^"]*">[^<]*<\/a>/g, '');                       // anciens liens soulignés : remplacés par la navigation commune
      if (SH) html = SH.decorate(html, { L: LBL, pane: PANE, app: app, fid: client.franchiseId() });
      return ui.team ? html.replace(/<span class="crest"><\/span>/g, function () { return crestHTML(ui.team); }) : html;
    }
    // Couleurs de l'équipe : --base1, --base2 et la couleur du texte posé dessus (--on-base1 ; --on-c1-dark pour --c1 éclairci du thème sombre).
    // colors[2] = 3e couleur de l'équipe (null ou 'n/a' possibles) ; ft_colors garde les 3 couleurs (l'index les relit).
    function theme(d, noPersist) {
      // sans couleurs (page hébergée avant la connexion) : celles mémorisées par la dernière page (ft_colors), sinon le repli gris neutre du CSS (phase 4b)
      var c = (d && d.franchise && d.franchise.colors) || null, st = document.documentElement.style;
      if (!c) { try { c = JSON.parse(store.get('ft_colors') || 'null'); } catch (e) { c = null; } }
      if (!c || !HEX.test(c[0] || '')) { ['--base1', '--base2', '--on-base1', '--on-c1-dark'].forEach(function (k) { st.removeProperty(k); }); return; }
      var b1 = c[0]; st.setProperty('--base1', b1); st.setProperty('--base2', HEX.test(c[1] || '') ? c[1] : b1);
      if (HEX.test(b1)) { st.setProperty('--on-base1', onColor(b1, c[2])); st.setProperty('--on-c1-dark', onColor(mixHex(b1, '#FFFFFF', 0.72), c[2])); }   // --c1 sombre = color-mix(base1 72 %, #fff)
      else { st.removeProperty('--on-base1'); st.removeProperty('--on-c1-dark'); }
      if (!noPersist && d && d.franchise && d.franchise.colors) { try { store.set('ft_colors', JSON.stringify([c[0], c[1], c[2] == null ? null : c[2]])); } catch (e) { /* ignore */ } }
    }
    // ---- libellés d'une page hébergée : ceux de la base (cache local, table label) ; repli : fichier partagé labels.js (cfg.labels) ----
    // Le fichier est chargé en arrière-plan ; tant qu'il manque et qu'aucune donnée n'est affichée, l'écran reste vide (pas de clés brutes).
    var labelsState = 0;      // 0 : pas demandé, 1 : en cours, 2 : chargé (ou impossible)
    function needLabels() { return !!(DATA0.__lite && !Object.keys(DATA0.labels || {}).length); }
    function loadLabels() {
      if (labelsState) return; labelsState = 1;
      var done = function () {
        labelsState = 2; var L = root.FT_LABELS; if (L) DATA0.labels = Object.assign({}, L, DATA0.labels || {});
        if (ui.errKey) { ui.error = T(ui.errKey); if (app) app.sync.msg = ui.error; }       // message calculé avant l'arrivée des libellés
        if (app && ui.dataNow) build(ui.dataNow);        // les libellés de la base gardent la priorité (build les fusionne par-dessus)
        draw();
      };
      if (root.FT_LABELS || !o.cfg || !o.cfg.labels) { done(); return; }
      try {
        var d = pspan('libellés (fichier)'), sc = root.document.createElement('script'); sc.src = o.cfg.labels; sc.async = true;
        sc.onload = function () { d(); done(); }; sc.onerror = function () { d('erreur'); done(); };
        (root.document.head || root.document.body).appendChild(sc);
      } catch (e) { done(); }
    }
    function loginHTML() {
      if (needLabels() && labelsState < 2) return '';
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(T('sb.live_title')) + '</div><div class="sub">' + esc(T('sb.title')) + '</div></div></div>' +
        '<div class="ctl"><div class="seg" role="group"><button data-ulang="fr" aria-pressed="' + (ui.lang === 'fr') + '">FR</button><button data-ulang="en" aria-pressed="' + (ui.lang === 'en') + '">EN</button></div></div></header>' +
        '<main class="entry"><section class="card sb"><h3>' + esc(T('sb.title')) + '</h3><p class="muted">' + esc(T('sb.login_needed')) + '</p>' +
        (ui.busy ? '<p class="muted">' + esc(T('sb.loading', [ui.progress])) + '</p>' : '<div class="acts left"><input id="sb-email" type="email" placeholder="' + esc(T('sb.email')) + '" autocomplete="username"><input id="sb-pw" type="password" placeholder="' + esc(T('sb.password')) + '" autocomplete="current-password"><button class="btn" data-sb="login">' + esc(T('sb.login')) + '</button></div>') +
        (ui.error ? '<p class="bad">' + esc(ui.error) + '</p>' : '') + '</section></main>';
    }
    function draw(sel) {
      // aperçu d'une page qui n'a pas encore de franchise (écran « Franchise ») : couleurs et logo de l'équipe choisie, sans rien mémoriser
      if (app && typeof app.preview === 'function') {
        var pv = app.preview();
        if (pv) { if (!ui.pv) ui.base = { team: ui.team, logo: ui.logo, data: ui.dataNow }; theme({ franchise: { colors: pv.colors } }, true); ui.team = pv.team; ui.logo = pv.logo || ''; ui.pv = true; }
        else if (ui.pv && ui.base) { theme(ui.base.data, true); ui.team = ui.base.team; ui.logo = ui.base.logo; ui.pv = false; }
      }
      persistLang(); document.documentElement.lang = app ? app.state.lang : ui.lang; rootEl.innerHTML = decorate(app ? app.view() : loginHTML());
      if (sel) { var el = rootEl.querySelector(sel); if (el) { el.focus(); if (el.select) el.select(); } }
    }
    // ---- franchise active (ft_franchise) : choisie dans la page Franchise, mémorisée ; aucune lecture sans elle ----
    // saisies en attente : une clé par franchise (ft_entries_v1_f12…). Les anciennes clés sans franchise vont à Montréal.
    // phase 4b : Saison morte (ft_off_v1) est répartie entre Début de saison (Plafond), Résultats, Honneurs et Repêchage (connect/ft_nav.js, LEGACY_SPLIT)
    var PENDING = ['ft_entries_v1', 'ft_events_v1', 'ft_pre_v1', 'ft_off_v1', 'ft_results_v1', 'ft_honors_v1', 'ft_draft_v1'], FKEY = 'ft_franchise';
    function sget(k) { try { return store.get(k); } catch (e) { return null; } }
    function sset(k, v) { try { store.set(k, v); } catch (e) { /* ignore */ } }
    function sdel(k) { try { if (store.remove) store.remove(k); else store.set(k, ''); } catch (e) { /* ignore */ } }
    function pendingKey(k, fid) { return PENDING.indexOf(k) >= 0 && fid != null ? k + '_f' + fid : k; }
    // saisies en attente : une écriture refusée (stockage plein) remonte à la page, qui l'affiche dans la barre d'état (connect/grid_input.js)
    function scopedStore(fid) { return { get: function (k) { return sget(pendingKey(k, fid)); }, set: function (k, v) { store.set(pendingKey(k, fid), v); }, remove: function (k) { sdel(pendingKey(k, fid)); }, franchiseId: fid }; }
    function migratePending(list) {
      var mtl = list.filter(function (f) { return f.abbreviation === 'MTL'; })[0]; if (!mtl) return;
      PENDING.forEach(function (k) { var v = sget(k); if (v && !sget(pendingKey(k, mtl.id))) sset(pendingKey(k, mtl.id), v); if (v) sdel(k); });
    }
    // anciennes saisies de Saison morte d'une franchise : réparties par onglet dans les clés des nouveaux groupes, puis l'ancienne clé est effacée
    function splitLegacy(list) {
      var N = root.FTNAV; if (!N) return;
      (list || []).forEach(function (f) {
        Object.keys(N.LEGACY_SPLIT).forEach(function (old) {
          var ok = pendingKey(old, f.id), v = sget(ok); if (!v) return;
          var parts = N.splitLegacy(old, v, function (k) { return sget(pendingKey(k, f.id)); }), done = true;
          Object.keys(parts).forEach(function (k) { try { store.set(pendingKey(k, f.id), JSON.stringify(parts[k])); } catch (e) { done = false; } });
          if (done) sdel(ok);
        });
      });
    }
    function urlFranchise() { try { var m = /[?&]franchise=(\d+)(&|$)/.exec(root.location.search); return m ? +m[1] : null; } catch (e) { return null; } }
    // franchise active (sb.js) ; anciennes saisies en attente rattachées à Montréal ; message clair s'il faut la choisir
    async function resolveFranchise() {
      try { var r = await client.resolveFranchise(urlFranchise()); ui.franchises = r.list; migratePending(r.list); splitLegacy(r.list); return r.id; }
      catch (e) { if (e.list) { migratePending(e.list); splitLegacy(e.list); } if (e.code === 'FT_PICK_FRANCHISE' || e.code === 'FT_FRANCHISE_GONE') { var k = e.code === 'FT_PICK_FRANCHISE' ? 'sb.pick_franchise' : 'sb.franchise_gone', m = new Error(T(k)); m.ftKey = k; throw m; } throw e; }
    }
    function setActiveFranchise(id) { client.chooseFranchise(id); }
    function build(data) {
      data.labels = Object.assign({}, DATA0.labels || {}, data.labels || {});   // les libellés absents de la base gardent leur version intégrée
      var prev = app, a = o.makeApp(data, scopedStore(client.franchiseId())); if (SH && !prev) SH.applyTo(a, PANE); if (prev) { Object.assign(a.state, prev.state); if (a.sync && prev.sync) { a.sync.msg = prev.sync.msg; a.sync.level = prev.sync.level; a.sync.busy = prev.sync.busy; } } else a.state.lang = ui.lang;
      if (data && !data.league && DATA0.league) data.league = DATA0.league;     // format de la ligue intégré à la page
      var u = client.user(); a.sync.user = u ? (u.email || u.id) : null; app = a; ui.lang = a.state.lang; theme(data);
      ui.dataNow = data; ui.pv = false;
      ui.logo = ''; if (data.teams && data.franchise && data.franchise.code) { var mine = data.teams.filter(function (x) { return x.code === data.franchise.code; })[0]; if (mine && mine.logo) ui.logo = mine.logo; }
      if (data.franchise && data.franchise.code) { ui.team = data.franchise.code; try { store.set('ft_team', ui.team); } catch (e) { /* ignore */ } }
    }
    // ---- chargement : cache local d'abord (affichage immédiat), puis seules les tables dont la version a changé ----
    var CACHE = typeof FTCACHE !== 'undefined' ? FTCACHE : root.FTCACHE, cache = CACHE ? CACHE.make(o.cacheBackend) : null;
    var RAW = null, VERS = null;          // tables brutes affichées et leurs versions (data_version)
    function pageName() { try { return document.body.dataset.page || ''; } catch (e) { return ''; } }
    function userId() { var u = client.user(); return u ? (saved.url || o.cfg.url) + '|' + (u.id || u.email) : null; }     // clé du cache : projet + utilisateur (+ franchise)
    function apply(R, msgKey, params, level) {
      var dA = pspan('assemblage'); var data = o.assemble(R); dA(); var dB = pspan('construction'); build(data); dB();
      app.sync.msg = fmt(msgKey, params); app.sync.level = level || 'ok'; app.sync.busy = false;
      var fav = (FTLIVE.activeFranchise(R) || {}).ui_locale;
      if (!hasStoredLang && LANGS.indexOf(fav) >= 0) { ui.lang = fav; app.state.lang = fav; ui.last = fav; }
      ui.busy = false; var dR = pspan('rendu'); draw(); dR();
    }
    function fmt(key, params) { var x = app.t(key); (params || []).forEach(function (p, i) { x = x.replace('{' + i + '}', p); }); return x; }
    function report(label) { var P = perfApi(); if (P) P.report(label, ui.t0); }
    function perfNow() { var P = perfApi(); return P && P.now ? P.now() : Date.now(); }
    function merge(base, fresh) { var R = Object.assign({}, base || {}); Object.keys(fresh).forEach(function (k) { R[k] = fresh[k]; }); return R; }
    function save(fid) { if (cache && RAW) { var d = pspan('cache:écriture'); var t = {}; Object.keys(RAW).forEach(function (k) { if (k !== '__franchise_id') t[k] = RAW[k]; }); cache.write(userId(), fid, t, VERS).then(function () { d(); }); } }
    async function versions(fid) { var d = pspan('versions'); try { var v = await FTLIVE.loadVersions(client, fid); d(v ? Object.keys(v).length + ' tables' : 'absent'); return v; } catch (e) { d('erreur'); return null; } }
    // relit les tables dont la version a changé (toutes si data_version est absente) ; retourne le nombre de tables relues
    async function refresh(fid, fresh, label) {
      var names = FTLIVE.tableDefs().map(function (x) { return x.name; }), need = CACHE ? CACHE.changed(VERS, fresh, names) : names;
      VERS = fresh;
      if (need.length) { var R2 = await FTLIVE.loadAll(client, null, { page: pageName(), only: need }); RAW = merge(RAW, R2); RAW.__franchise_id = fid; apply(RAW, 'sb.cache_updated', [need.length]); report(label); }
      else { if (app) { app.sync.msg = fmt('sb.cache_fresh'); app.sync.level = 'ok'; app.sync.busy = false; } draw(); }
      save(fid); return need.length;
    }
    async function loadLive(force) {
      if (ui.t0 == null) ui.t0 = perfNow();          // début du chargement (déjà fixé au clic sur « Connexion »)
      try { return await loadLive0(force); } finally { ui.t0 = null; }
    }
    async function loadLive0(force) {
      ui.busy = true; ui.error = ''; if (app) { app.sync.busy = true; app.sync.msg = ''; } draw();
      var page = pageName();
      try {
        var stored = client.storedFranchise(), shown = false, cached = null;
        // 1. cache de la franchise mémorisée : affichage immédiat, vérifié ensuite
        if (!force && cache && cache.enabled && stored != null) {
          var dc = pspan('cache:lecture'); cached = await cache.read(userId(), stored); dc(cached ? 'trouvé' : 'absent');
          if (cached) { client.setFranchise(stored); RAW = cached.tables; RAW.__franchise_id = stored; VERS = cached.versions; apply(RAW, 'sb.cache_stale', null, 'warn'); app.sync.busy = true; shown = true; report(page + ' (cache)'); }
        }
        // 2. franchise active et versions, en parallèle (la franchise mémorisée est presque toujours la bonne)
        var vp = shown ? versions(stored) : null, fid = await resolveFranchise();
        if (shown && fid !== stored) { shown = false; RAW = null; VERS = null; }
        // 3. tables à lire : celles qui ont changé depuis le cache, sinon toutes. Sans cache, les versions sont demandées
        // juste avant les tables (en tête de file) : une écriture entre les deux ne fait que provoquer une relecture de plus.
        if (shown) await refresh(fid, await vp, page);
        else {
          vp = fid == null ? Promise.resolve(null) : versions(fid);
          var R = await FTLIVE.loadAll(client, function (i, n) { ui.progress = i + '/' + n; if (!app) draw(); }, { page: page });
          RAW = R; VERS = await vp; apply(R, 'sb.connected'); report(page); save(fid);
        }
      } catch (e) {
        ui.errKey = e.ftKey || null; ui.error = e.ftKey ? e.message : T('sb.failed', [e.message]); if (app) { app.sync.msg = ui.error; app.sync.level = 'bad'; app.sync.busy = false; }
        ui.busy = false; draw(); report(page);
      }
    }
    // après un envoi : les triggers ont changé la version des tables touchées ; seules celles-ci sont relues, le cache suit
    async function afterPush() {
      var fid = client.franchiseId(); if (fid == null || !RAW) return;
      try { await refresh(fid, await versions(fid), pageName() + ' (après envoi)'); } catch (e) { /* l'envoi a réussi : le prochain chargement relira la base */ }
    }
    function fail(e) { ui.error = T('sb.failed', [e.message]); if (app) { app.sync.msg = ui.error; app.sync.level = 'bad'; app.sync.busy = false; } draw(); }
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      if (b.dataset.ulang) { ui.lang = b.dataset.ulang; draw(); return; }
      if (b.dataset.themeSet) { try { store.set('ft_theme', b.dataset.themeSet); } catch (e2) { /* ignore */ } applyTheme(); rootEl.querySelectorAll('[data-theme-set]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.themeSet === b.dataset.themeSet)); }); return; }
      var act = b.dataset.sb; if (!act) return;
      if (act === 'login') {
        ui.t0 = perfNow(); var em = document.getElementById('sb-email').value.trim(), pw = document.getElementById('sb-pw').value; ui.busy = true; ui.error = ''; if (app) app.sync.busy = true; draw();
        client.signIn(em, pw).then(function () { return loadLive(); }).catch(function (err) { ui.busy = false; fail(err); });
      } else if (act === 'logout') {
        client.signOut(); if (DATA0.__lite) app = null; else { app.sync.user = null; app.sync.msg = ''; } draw();
      } else if (act === 'pull') { loadLive(true); }
      else if (act === 'push' && app) { app.sync.busy = true; draw(); app.doPush(client).then(function (okPush) { draw(); if (okPush !== false) return afterPush(); }); }
    }, true);
    var api = {
      app: function () { return app; }, draw: draw, client: client, reload: loadLive, afterPush: afterPush, setActiveFranchise: setActiveFranchise, franchises: function () { return ui.franchises || []; },
      start: function () {
        var sf = client.storedFranchise(); if (sf != null) splitLegacy([{ id: sf }]);     // avant la construction de l'application (qui lit ses saisies)
        applyTheme(); theme(DATA0); if (!DATA0.__lite) { var dB = pspan('construction (intégrée)'); build(DATA0); dB(); }
        if (needLabels()) loadLabels();          // page hébergée : libellés de repli (fichier partagé), sans bloquer l'affichage depuis le cache
        var dR = pspan(DATA0.__lite ? 'rendu (connexion)' : 'rendu (intégré)'); draw(); dR();
        if (!client.signedIn()) { var P = perfApi(); if (P) P.report('sans session'); }
        if (client.signedIn()) loadLive();
      }
    };
    if (SH) SH.addHost(PANE, api);
    return api;
  }
  var api = { run: run, onColor: onColor, contrast: contrast, mixHex: mixHex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTLM = api;
})(typeof window !== 'undefined' ? window : this);

;/* Aide en contexte des écrans de saisie (entry, events, preseason, offseason, setup, history_edit) : composant commun.
   FTHELP.html(o) rend l'aide d'un écran (chaîne HTML insérée par le rendu de la page) ;
   FTHELP.bind(rootEl) branche une fois les boutons (délégation : survit au remplacement d'innerHTML) ; ouvrir ou fermer ne redessine pas la page.
   Mémorisation : localStorage « ft_help_<écran> » = JSON {"open": bool, "<bloc>": bool, …}, par exemple ft_help_entry = {"open":false,"common":false}.
   Lecture tolérante (valeur absente ou illisible = valeurs par défaut), écriture dans try/catch ; stockage refusé = état gardé en mémoire pour la séance.
   Jamais de fenêtre modale : le panneau s'ouvre dans la page, au-dessus de la grille. Maquette validée : docs/maquettes/aide_saisie.html. */
(function (root) {
  var MEM = {};
  var MARK = /\[(?:À COMPLÉTER|TO COMPLETE)[^\]]*\]/g;
  var PEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M10.5 2.5l3 3-8 8H2.5v-3z M9 4l3 3"/></svg>';
  var ICON = '<svg class="help-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M7.6 7.7a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6"/><circle cx="10" cy="14.6" r="1.1" fill="currentColor"/></svg>';
  var CHEV = '<svg class="help-chev" viewBox="0 0 10 10" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M1.5 3.5 5 7l3.5-3.5"/></svg>';
  function ls() { return root.localStorage || (typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined); }   // Node (tests) : globalThis
  function sk(screen) { return 'ft_help_' + screen; }
  function load(screen) { var o = null; try { o = JSON.parse(ls().getItem(sk(screen)) || 'null'); } catch (e) { o = null; } return o && typeof o === 'object' ? o : {}; }
  function state(screen, defaults) {
    var o = load(screen), m = MEM[screen] || {}, out = {};
    Object.keys(defaults).forEach(function (k) { out[k] = typeof m[k] === 'boolean' ? m[k] : typeof o[k] === 'boolean' ? o[k] : defaults[k]; });
    return out;
  }
  function save(screen, part, val) {
    (MEM[screen] = MEM[screen] || {})[part] = val;
    try { var o = load(screen); o[part] = val; ls().setItem(sk(screen), JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  // texte d'un libellé : échappé ; marqueurs « [À COMPLÉTER …] » repérables ; option lead = début en gras jusqu'au premier « : » hors crochets
  function text(s, esc, lead) {
    var h = esc(s);
    if (lead) {
      var re = /\s?:\s/g, m, depth;
      while ((m = re.exec(h))) { depth = (h.slice(0, m.index).match(/\[/g) || []).length - (h.slice(0, m.index).match(/\]/g) || []).length; if (depth <= 0) break; }
      if (m && m.index > 0 && m.index < 140) h = '<span class="help-lead">' + h.slice(0, m.index) + '</span>' + h.slice(m.index);
    }
    return h.replace(MARK, function (x) { return '<mark class="help-todo">' + PEN + x + '</mark>'; });
  }
  function list(items, o, cls, lead) {
    return '<' + (cls ? 'ol class="' + cls + '"' : 'ul') + '>' + items.map(function (k) { return '<li>' + text(o.t(k), o.esc, lead) + '</li>'; }).join('') + '</' + (cls ? 'ol' : 'ul') + '>';
  }
  /* o.top = {h, items, lead} : bande courte au-dessus des colonnes (facultative)
     o = { screen, prefix ('entry.'), t, esc, defaults {open, common}, summary (HTML, facultatif), chip (texte, facultatif), note (clé, facultatif),
           cols: [[{h: clé, items: [clés], ordered: bool, lead: bool}, …], …], common: [clés] } */
  function html(o) {
    var s = state(o.screen, o.defaults), id = 'help-' + o.screen, P = o.prefix, e = o.esc;
    var tg = '<button type="button" class="help-tg" data-help-tg="open" aria-expanded="' + s.open + '" aria-controls="' + id + '" data-show="' + e(o.t(P + 'help_show')) + '" data-hide="' + e(o.t(P + 'help_hide')) + '">' +
      ICON + '<span class="help-tl">' + e(o.t(P + (s.open ? 'help_hide' : 'help_show'))) + '</span>' + CHEV + '</button>';
    var cols = o.cols.map(function (col) {
      return '<div class="help-col">' + col.map(function (sec) { return '<h4 class="help-sh">' + e(o.t(sec.h)) + '</h4>' + list(sec.items, o, sec.ordered ? 'help-steps' : '', sec.lead); }).join('') + '</div>';
    }).join('');
    var more = o.common && o.common.length ? '<div class="help-more"><button type="button" class="help-tg sub" data-help-tg="common" aria-expanded="' + s.common + '" aria-controls="' + id + '-common">' + CHEV +
      '<span>' + e(o.t(P + 'help_h_common')) + '</span><span class="help-n">' + o.common.length + '</span></button>' +
      '<ul class="help-common" id="' + id + '-common"' + (s.common ? '' : ' hidden') + '>' + o.common.map(function (k) { return '<li>' + text(o.t(k), e, false) + '</li>'; }).join('') + '</ul></div>' : '';
    return '<div class="help" data-help="' + e(o.screen) + '"><div class="help-bar">' + (o.summary ? '<p class="note muted help-sum">' + o.summary + '</p>' : '') + tg + '</div>' +
      '<section class="help-body" id="' + id + '" aria-labelledby="' + id + '-h"' + (s.open ? '' : ' hidden') + '>' +
      '<h3 class="help-h" id="' + id + '-h">' + e(o.t(P + 'help_title')) + (o.chip ? '<span class="help-chip">' + e(o.chip) + '</span>' : '') + '</h3>' +
      (o.top ? '<div class="help-top"><h4 class="help-sh">' + e(o.t(o.top.h)) + '</h4><ul class="help-inline">' + o.top.items.map(function (k) { return '<li>' + text(o.t(k), e, o.top.lead) + '</li>'; }).join('') + '</ul></div>' : '') +
      (o.note ? '<p class="help-note">' + text(o.t(o.note), e, true) + '</p>' : '') +
      '<div class="help-cols">' + cols + '</div>' + more + '</section></div>';
  }
  // Ouverture/fermeture sans redessiner la page : le focus reste sur le bouton (Entrée et Espace natifs du <button>).
  function bind(rootEl, onChange) {
    rootEl.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button[data-help-tg]'); if (!b || typeof b.getAttribute !== 'function' || !b.closest) return;   // cible sans élément réel (simulateur de page) : ignorée
      var box = b.closest('.help'), part = b.getAttribute('data-help-tg'), open = b.getAttribute('aria-expanded') !== 'true', panel = document.getElementById(b.getAttribute('aria-controls'));
      b.setAttribute('aria-expanded', String(open));
      if (b.dataset.show) b.querySelector('.help-tl').textContent = open ? b.dataset.hide : b.dataset.show;
      if (panel) { panel.hidden = !open; panel.classList.toggle('help-anim', open); }
      save(box.getAttribute('data-help'), part, open);
      if (onChange) onChange();
    });
  }
  var api = { html: html, bind: bind, state: state, save: save, text: text, storageKey: sk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTHELP = api;
})(typeof window !== 'undefined' ? window : this);

;/* Nom simplifié pour comparer deux noms de joueurs : copie EXACTE de public.hr_norm (hr/30_hr_pipeline.sql).
   Toute modification se fait des deux côtés ; connect/test_ft_names.js compare les deux tables au fichier SQL.
   « Jean-Luc Béliveau » = « jean luc beliveau » → « jeanlucbeliveau ». */
(function (root) {
  var HR_FROM = 'àáâãäåāăąçćĉċčďèéêëēĕėęěĝğġģĥìíîïĩīĭįĵķĺļľñńņňòóôõöōŏőŕŗřśŝşšţťùúûüũūŭůűųŵýÿŷźżžÀÁÂÃÄÅĀĂĄÇĆĈĊČĎÈÉÊËĒĔĖĘĚĜĞĠĢĤÌÍÎÏĨĪĬĮĴĶĹĻĽÑŃŅŇÒÓÔÕÖŌŎŐŔŖŘŚŜŞŠŢŤÙÚÛÜŨŪŬŮŰŲŴÝŸŶŹŻŽøØđĐħĦłŁıŧŦ';
  var HR_TO = 'aaaaaaaaacccccdeeeeeeeeegggghiiiiiiiijklllnnnnoooooooorrrssssttuuuuuuuuuuwyyyzzzaaaaaaaaacccccdeeeeeeeeegggghiiiiiiiijklllnnnnoooooooorrrssssttuuuuuuuuuuwyyyzzzooddhhllitt';
  var MAP = null;
  function hrNorm(x) {
    if (!MAP) { MAP = {}; for (var i = 0; i < HR_FROM.length; i++) MAP[HR_FROM[i]] = HR_TO[i]; }
    var s = String(x == null ? '' : x).replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe'), o = '';
    for (var j = 0; j < s.length; j++) { var c = s[j]; o += Object.prototype.hasOwnProperty.call(MAP, c) ? MAP[c] : c; }
    return o.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  // nom propre : espaces superflus retirés, forme NFC (comme ft_private.clean_name, migration 71)
  function cleanName(x) { var s = String(x == null ? '' : x); if (s.normalize) s = s.normalize('NFC'); return s.replace(/\s+/g, ' ').trim(); }
  var api = { hrNorm: hrNorm, cleanName: cleanName, HR_FROM: HR_FROM, HR_TO: HR_TO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTNAMES = api;
})(typeof window !== 'undefined' ? window : this);

;/* Question « Même joueur ? » (joueurs homonymes) : composant commun aux pages (maquette docs/maquettes/homonymes.html, validée le 2026-11-17).
   Aucun texte en dur : t(key) et esc(s) viennent de la page. Règle (migration 71) : même groupe et même nom simplifié (hrNorm),
   joueurs historiques compris. Sélecteurs stables : encadré #homo-<ref> ; boutons button[data-homo=yes|no|undo][data-ref][data-id] ;
   date (Historique) input.cell.date[data-homo=birth][data-ref]. */
(function (root) {
  var N = root.FTNAMES || (typeof require !== 'undefined' ? require('./ft_names.js') : null);
  var FTHOMO = (function () {
    var IC = {
      warn: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.9 14.7 13.8H1.3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.2v3.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="currentColor"/></svg>',
      ok: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 8.4l2.1 2.1 4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nw: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 2.1"/><path d="M8 4.8v6.4M4.8 8h6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      err: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    };
    function fill(s, a) { s = String(s); (a || []).forEach(function (x, i) { s = s.split('{' + i + '}').join(x); }); return s; }
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
    // années de carrière avec la franchise, historique compris : forme longue de l'Historique (décision de Gabriel)
    function career(c) { return c.first_season == null ? '' : c.first_season === c.last_season ? sl(c.first_season) : sl(c.first_season) + ' – ' + sl(c.last_season); }
    function born(c, t) { return c.birth_date ? fill(t('ui.homonym_born'), [String(c.birth_date).slice(0, 4)]) : ''; }
    // étiquette de liste (select, datalist) : seulement si un autre joueur porte le même nom, quel que soit le groupe
    function listLabel(p, t) { var g = t('pc.' + p.position_group), x = career(p) || born(p, t); return x ? fill(t('ui.homonym_list'), [p.full_name, g, x]) : fill(t('ui.homonym_list_plain'), [p.full_name, g]); }
    function candText(c, t) {
      return fill(t('ui.homonym_cand'), [c.full_name, t('pc.' + c.position_group), born(c, t) || t('ui.homonym_born_unknown'), career(c) || t('ui.homonym_career_none'), t(c.origin === 'historical' ? 'hist.src_hist' : 'hist.src_game')]);
    }
    function candHTML(c, o, esc, t) {
      var parts = candText(c, t).split(' · '), id = 'homo-' + o.ref + '-c' + c.id;
      return '<li class="homo-cand"><span class="homo-who" id="' + id + '"><b>' + esc(parts[0]) + '</b><span class="homo-meta"> · ' + esc(parts.slice(1).join(' · ')) + '</span></span>' +
        '<button type="button" class="homo-btn yes" data-homo="yes" data-ref="' + o.ref + '" data-id="' + c.id + '" aria-describedby="' + id + '">' + IC.ok + esc(t('ui.homonym_yes')) + '</button></li>';
    }
    /* o = { ref, name, group, cands:[…], answer: null | { yes: id } | 'no', birthErr: clé val.* | null, birthErrP:[…], refused: bool, dateField: { value } | null, jumpHint: bool } */
    function boxHTML(o, esc, t) {
      var id = 'homo-' + o.ref, undo = '<button type="button" class="homo-btn undo" data-homo="undo" data-ref="' + o.ref + '">' + esc(t('ui.homonym_change')) + '</button>';
      if (o.answer && o.answer.yes != null) {
        var c = o.cands.filter(function (x) { return x.id === o.answer.yes; })[0];
        return '<div class="homo done ok" id="' + id + '" tabindex="-1" role="group" aria-label="' + esc(t('ui.homonym_q')) + '"><p class="homo-msg ok">' + IC.ok + '<span>' + esc(fill(t('ui.homonym_yes_done'), [listLabel(c, t)])) + '</span></p>' + undo + '</div>';
      }
      if (o.answer === 'no') {
        var er = o.birthErr, dateF = o.dateField ? '<label class="homo-date' + (er ? ' err' : '') + '">' + esc(t('picks.col_birth')) + '<input class="cell date" data-homo="birth" data-ref="' + o.ref + '" value="' + esc(o.dateField.value || '') + '" placeholder="' + esc(t('ui.date_ph')) + '" autocomplete="off" inputmode="numeric"' + (er ? ' aria-invalid="true"' : '') + ' aria-describedby="' + id + '-m"></label>' : '';
        return '<div class="homo done other' + (er ? ' er' : '') + '" id="' + id + '" tabindex="-1" role="group" aria-label="' + esc(t('ui.homonym_q')) + '"><span class="homo-tag">' + esc(t('ui.homonym_other_tag')) + '</span>' + dateF +
          '<p class="homo-msg' + (er ? ' er' : '') + '" id="' + id + '-m">' + (er ? IC.err : '') + '<span>' + esc(er ? fill(t(er), o.birthErrP || []) : t('ui.homonym_birth_req')) + '</span></p>' + undo + '</div>';
      }
      var many = o.cands.length > 1, intro = many ? fill(t('ui.homonym_intro_n'), [o.name, t('ui.homonym_grp_' + o.group), o.cands.length]) : fill(t('ui.homonym_intro'), [o.name, t('ui.homonym_grp_' + o.group)]);
      return '<div class="homo appear' + (o.refused ? ' er' : '') + '" id="' + id + '" tabindex="-1" role="group" aria-labelledby="' + id + '-q">' +
        '<p class="homo-q" id="' + id + '-q">' + IC.warn + '<span><b>' + esc(t('ui.homonym_q')) + '</b>' + esc(intro) + '</span></p>' +
        '<ul class="homo-list">' + o.cands.map(function (c) { return candHTML(c, o, esc, t); }).join('') + '</ul>' +
        (o.refused ? '<p class="homo-msg er" role="alert">' + IC.err + '<span>' + esc(fill(t('val.homonym_rename'), [o.name])) + '</span></p>' : '') +
        '<div class="homo-foot"><button type="button" class="homo-btn no" data-homo="no" data-ref="' + o.ref + '">' + IC.nw + esc(t('ui.homonym_no')) + '</button>' +
        (o.jumpHint ? '<span class="homo-key">' + esc(t('ui.homonym_jump')) + '</span>' : '') + '</div></div>';
    }
    // annonce (aria-live polite, zone unique jamais recréée : #gbar-live dans les pages qui ont la barre d'état)
    function announce(o, t) { return t('ui.homonym_q') + ' ' + (o.cands.length > 1 ? fill(t('ui.homonym_intro_n'), [o.name, t('ui.homonym_grp_' + o.group), o.cands.length]) : fill(t('ui.homonym_intro'), [o.name, t('ui.homonym_grp_' + o.group)])); }
    // ---- recherche locale (même règle que la base, migration 71 : même groupe, même nom simplifié, joueurs historiques compris) ----
    // players : [{ id, full_name, position_group, origin, birth_date, first_season, last_season }]
    function norm(x) { return N.hrNorm(N.cleanName(x)); }
    function find(players, name, group, excludeId) {
      var k = norm(name); if (!k || !group) return [];
      return (players || []).filter(function (p) { return p.id !== excludeId && p.position_group === group && norm(p.full_name) === k; })
        .sort(function (a, b) { return (b.last_season || 0) - (a.last_season || 0) || a.id - b.id; });
    }
    // étiquettes de liste : seulement pour un nom porté par plusieurs joueurs, quel que soit le groupe → { id: « Nom (D · 2026-27 – 2030-31) » }
    function labels(players, t) {
      var by = {}, out = {}; (players || []).forEach(function (p) { var k = norm(p.full_name); if (k) (by[k] = by[k] || []).push(p); });
      Object.keys(by).forEach(function (k) { if (by[k].length > 1) by[k].forEach(function (p) { out[p.id] = listLabel(p, t); }); });
      return out;
    }
    // réponse attendue pour une ligne : candidats sans réponse → 'ask' ; Oui → 'yes' ; Non → 'no' ; aucun candidat → ''
    // ans : { yes: id } | { no: [ids] } | null ; une réponse « Non » vaut pour les candidats connus au moment de la réponse
    function status(cands, ans) {
      if (!cands.length) return '';
      if (ans && ans.yes != null && cands.some(function (c) { return c.id === ans.yes; })) return 'yes';
      if (ans && ans.no && cands.every(function (c) { return ans.no.indexOf(c.id) >= 0; })) return 'no';
      return 'ask';
    }
    // même date de naissance qu'un candidat : refus (décision du 2026-11-17)
    function sameBirth(cands, birth) { return birth ? cands.filter(function (c) { return c.birth_date && String(c.birth_date).slice(0, 10) === birth; })[0] || null : null; }
    // clavier : Alt+↓ depuis une case de la ligne → première réponse de l'encadré qui suit ; Échap dans l'encadré → première case de la ligne
    function bindKeys(rootEl) {
      if (!rootEl || typeof rootEl.addEventListener !== 'function') return;
      rootEl.addEventListener('keydown', function (e) {
        var el = e.target; if (!el || !el.closest) return;
        if (e.altKey && e.key === 'ArrowDown') {
          var tr = el.closest('tr'), nx = tr && tr.nextElementSibling; if (!nx || !/\b(homo-row|npx-row)\b/.test(nx.className)) return;
          var b = nx.querySelector('.homo button') || nx.querySelector('.homo'); if (b) { e.preventDefault(); e.stopPropagation(); b.focus(); }
        } else if (e.key === 'Escape' && el.closest('.homo')) {
          var row = el.closest('tr'), pv = row && row.previousElementSibling, c = pv && (pv.querySelector('.cell[data-c="first"], .cell[data-c$="pname"], .cell.nm-in') || pv.querySelector('.cell')); if (c) { e.preventDefault(); e.stopPropagation(); c.focus(); }
        }
      }, true);
    }
    // erreur de la base (migration 71) → message de la page (les messages de la base sont en français en dur) ; null si ce n'est pas un refus d'homonyme
    function errText(e, t, rename) {
      var d = e && e.details || {}, nm = d.full_name || '';
      if (!e) return null;
      if (e.code === 'FT002') return fill(t(rename ? 'val.homonym_rename' : 'val.homonym_unanswered'), [nm]);
      if (e.code === 'FT003') return fill(t('val.homonym_birth_missing'), [nm]);
      if (e.code === '23505' && d.reason === 'same_birth') return fill(t('val.homonym_same_birth'), [nm, d.birth_date || '']);
      if (e.code === '23505' && d.reason === 'key_taken') return fill(t('val.homonym_birth_missing'), [nm]);
      return null;
    }
    return { errText: errText, bindKeys: bindKeys, IC: IC, boxHTML: boxHTML, listLabel: listLabel, candText: candText, career: career, born: born, announce: announce, fill: fill, find: find, labels: labels, status: status, sameBirth: sameBirth, norm: norm };
  })();
  if (typeof module !== 'undefined' && module.exports) module.exports = FTHOMO; else root.FTHOMO = FTHOMO;
})(typeof window !== 'undefined' ? window : this);
