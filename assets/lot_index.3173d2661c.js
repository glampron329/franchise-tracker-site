/* Navigation par groupes (phase 4b) : la liste unique des groupes et des onglets, décrite dans docs/NAVIGATION.md.
   Un groupe = une page (<groupe>.html) ; un onglet est servi par une application (« volet ») de la page, avec son onglet interne (app).
   soon : onglet pas encore construit (visible, grisé, « À venir », décision du 2026-11-19).
   Ce fichier ne dépend de rien : il sert aux pages, à l'index et aux tests Node (connect/test_nav.js vérifie qu'il concorde avec NAVIGATION.md). */
(function (root) {
  // kind : saisie (enter) ou consultation (view) ; store : clé des saisies en attente de la page (suffixe _f<franchise>, connect/live_mount.js)
  var GROUPS = [
    { id: 'franchise', sec: 'enter', store: null, tabs: [{ id: 'franchise', pane: 'setup' }, { id: 'history_fix', pane: 'hist' }] },
    { id: 'start', sec: 'enter', tabs: [{ id: 'roster0', app: 'roster0' }, { id: 'picks0', app: 'picks0' }] },
    { id: 'preseason', sec: 'enter', store: 'ft_pre_v1', tabs: [{ id: 'cap', app: 'cap' }, { id: 'lineup', app: 'roles' }, { id: 'ratings', app: 'ratings' }, { id: 'schedule', app: 'schedule' }] },
    { id: 'roster', sec: 'enter', store: 'ft_events_v1', tabs: [{ id: 'injuries', app: 'inj' }, { id: 'moves', app: 'mv' }, { id: 'trades', app: 'tr' }, { id: 'contracts', app: 'ct' }, { id: 'offers', app: 'os' }, { id: 'positions', app: 'pc' }, { id: 'players', app: 'pl' }] },
    { id: 'stats', sec: 'enter', store: 'ft_entries_v1', tabs: [{ id: 'skaters', app: 'sk' }, { id: 'goalies', app: 'gk' }, { id: 'team', app: 'tm' }] },
    { id: 'results', sec: 'enter', store: 'ft_results_v1', tabs: [{ id: 'standings', app: 'standings' }, { id: 'series', app: 'series' }, { id: 'cup', app: 'cup' }] },
    { id: 'honors', sec: 'enter', store: 'ft_honors_v1', tabs: [{ id: 'awards', app: 'awards' }, { id: 'allstar', app: 'allstar' }, { id: 'retire', app: 'retire' }] },
    { id: 'draft', sec: 'enter', store: 'ft_draft_v1', tabs: [{ id: 'owned', app: 'owned', kind: 'view' }, { id: 'lottery', app: 'lottery' }, { id: 'ranks', app: 'ranks', kind: 'view' }, { id: 'top3', app: 'top3' }, { id: 'picks', app: 'picks' }, { id: 'board', app: 'board', kind: 'view' }] },
    { id: 'cards', sec: 'view', tabs: [{ id: 'player', app: 'player' }, { id: 'goalie', app: 'goalie' }, { id: 'team', app: 'team' }] },
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

;/* Coquille de navigation (phase 4b, docs/NAVIGATION.md ; barre verticale décidée le 2026-11-26, maquette docs/maquettes/4e_nav.js) : barre verticale
   (Accueil, Saisir, Consulter, groupes repliables et leurs onglets, 2026-11-27), titre de la page, compteur de saisies en attente,
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
  // Icônes de la barre verticale (maquette docs/maquettes/4e_nav.js, approuvée le 2026-11-26) : 16 × 16, trait 1,5, couleur du texte ; une par onglet
  var ICONS = {
    home: '<path d="M2.5 7.5 8 2.8l5.5 4.7v6H9.8V10H6.2v3.5H2.5z"/>',
    shield: '<path d="M8 1.8 13.2 3.6v4.1c0 3-2.2 5.3-5.2 6.5-3-1.2-5.2-3.5-5.2-6.5V3.6z"/>',
    clockBack: '<path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4"/><path d="M4.6 1.8v2.8h2.8"/><path d="M8 5.6V8l1.8 1.2"/>',
    people: '<circle cx="5.6" cy="5.2" r="2.1"/><path d="M1.8 13.4c.3-2.4 1.8-3.8 3.8-3.8s3.5 1.4 3.8 3.8"/><circle cx="11.2" cy="5.8" r="1.7"/><path d="M10.4 9.7c1.9 0 3.3 1.2 3.7 3.4"/>',
    ticket: '<path d="M2 4.5h12v2.2a1.4 1.4 0 0 0 0 2.6v2.2H2V9.3a1.4 1.4 0 0 0 0-2.6z"/><path d="M10 4.8v6.4" stroke-dasharray="1.2 1.4"/>',
    cap: '<path d="M2 3.5h12"/><path d="M4 13.5V7M8 13.5V5.5M12 13.5V8.5"/><path d="M2 13.5h12"/>',
    lines: '<path d="M2.5 4h5M9.5 4h4M2.5 8h3M7.5 8h6M2.5 12h7M11.5 12h2"/>',
    star: '<path d="m8 2 1.8 3.8 4 .5-3 2.8.8 4L8 11.1 4.4 13l.8-4-3-2.8 4-.5z"/>',
    calendar: '<rect x="2.3" y="3.3" width="11.4" height="10.4" rx="1.4"/><path d="M2.3 6.5h11.4M5.3 2v2.6M10.7 2v2.6"/><path d="M5 9h1.2M7.4 9h1.2M9.8 9H11M5 11.3h1.2M7.4 11.3h1.2"/>',
    stick: '<path d="M11.8 1.8 6.4 11.6"/><path d="M6.4 11.6c-.6 1.1-1.5 1.6-2.7 1.6H2"/><circle cx="12.6" cy="12.6" r="1.4"/>',
    mask: '<path d="M4 3.2c1.2-1 6.8-1 8 0 .6 3 .4 6.6-1.4 8.6-.8.9-1.6 1.6-2.6 2-1-.4-1.8-1.1-2.6-2C3.6 9.8 3.4 6.2 4 3.2z"/><path d="M6 6.3h4M6 8.6h4M8 5v5.4"/>',
    bars: '<path d="M2 13.5h12"/><path d="M3.8 11V8M7 11V4M10.2 11V6.5M13 11V9"/>',
    cross: '<rect x="2.3" y="2.3" width="11.4" height="11.4" rx="2.2"/><path d="M8 5v6M5 8h6"/>',
    updown: '<path d="M5 13V3M2.6 5.4 5 3l2.4 2.4M11 3v10M8.6 10.6 11 13l2.4-2.4"/>',
    swap: '<path d="M2.5 5h10M10.2 2.6 12.6 5l-2.4 2.4M13.5 11h-10M5.8 8.6 3.4 11l2.4 2.4"/>',
    doc: '<path d="M4 1.8h5.4L12 4.4v9.8H4z"/><path d="M9.2 1.8v2.8H12"/><path d="M5.8 8h4.4M5.8 10.4h3"/>',
    docAlert: '<path d="M4 1.8h5.4L12 4.4v9.8H4z"/><path d="M8 6.2v3.4"/><circle cx="8" cy="11.6" r=".4" fill="currentColor"/>',
    posSwap: '<circle cx="4.4" cy="4.4" r="2"/><circle cx="11.6" cy="11.6" r="2"/><path d="M6.8 4.4h3.4c.8 0 1.4.6 1.4 1.4v2.6M9.2 11.6H5.8c-.8 0-1.4-.6-1.4-1.4V7.6"/>',
    list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.8" cy="4" r=".5" fill="currentColor"/><circle cx="2.8" cy="8" r=".5" fill="currentColor"/><circle cx="2.8" cy="12" r=".5" fill="currentColor"/>',
    podium: '<path d="M1.8 13.5h12.4M2.2 13.5V9h3.6v4.5M5.8 13.5V5.8h4.4v7.7M10.2 13.5v-3h3.6v3"/><path d="M8 2.3v1.6"/>',
    bracket: '<path d="M2 3h3.5v4H9M2 11h3.5V7M9 7h1.5M10.5 4.5V9.5H14"/><path d="M10.5 4.5H14"/>',
    cup: '<path d="M4.5 2.2h7v3.6a3.5 3.5 0 0 1-7 0z"/><path d="M8 9.3v2.4M5.2 13.8h5.6M6.2 11.7h3.6"/><path d="M4.5 3.4H2.6c0 1.8.8 2.8 2.1 3M11.5 3.4h1.9c0 1.8-.8 2.8-2.1 3"/>',
    jersey: '<path d="M5.6 2.2 2 4.2l1.2 3 1.4-.6v7.2h6.8V6.6l1.4.6 1.2-3-3.6-2c-.4 1-1.3 1.6-2.4 1.6S6 3.2 5.6 2.2z"/>',
    lottery: '<circle cx="5.4" cy="10" r="3.2"/><circle cx="11" cy="5.6" r="3"/><path d="M4.6 9.2h1.6v1.6M10.4 5h1.2v1.2"/>',
    rank: '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M2.4 2.8 3.4 2.2v3.4M2.2 7.2c.6-.8 2-.6 1.8.4l-1.8 2h2M2.2 11.2c.8-.6 2-.2 1.8.6-.1.4-.6.6-1 .6.6 0 1.2.3 1.1.9-.2.8-1.4.9-2 .3"/>',
    medal: '<path d="M5.2 1.8 8 6.4l2.8-4.6"/><circle cx="8" cy="10.2" r="3.6"/><path d="M8 8.6v3.2"/>',
    pick: '<path d="M3.2 8.4 6.4 11.6 12.8 4.4"/><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="2"/>',
    lens: '<path d="M2 13.5h4M2.8 11V8.5M5.2 11V6.5"/><circle cx="10.4" cy="7.2" r="3"/><path d="m12.6 9.4 1.8 1.8"/>',
    person: '<circle cx="8" cy="4.6" r="2.6"/><path d="M3 14c.4-3.2 2.3-5 5-5s4.6 1.8 5 5"/>',
    recSk: '<path d="M10 1.8 5.6 9.8c-.5.9-1.2 1.4-2.2 1.4H2.4"/><path d="m11.8 8.6.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    recG: '<path d="M2.6 3c1-.8 5.6-.8 6.6 0 .5 2.5.3 5.4-1.1 7.1-.7.8-1.3 1.3-2.2 1.6-.9-.3-1.5-.8-2.2-1.6C2.3 8.4 2.1 5.5 2.6 3z"/><path d="m12 8.6.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    recTm: '<path d="M6 1.8 10.2 3.3v3.2c0 2.4-1.8 4.3-4.2 5.3-2.4-1-4.2-2.9-4.2-5.3V3.3z"/><path d="m12 8.6.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2z"/>',
    columns: '<path d="M2 5.2 8 2l6 3.2zM2 14h12M3.8 6.4v6M6.6 6.4v6M9.4 6.4v6M12.2 6.4v6"/>',
    puck: '<ellipse cx="8" cy="6" rx="5.6" ry="2.2"/><path d="M2.4 6v3.4c0 1.2 2.5 2.2 5.6 2.2s5.6-1 5.6-2.2V6"/>',
    layers: '<path d="M8 2 14 5 8 8 2 5z"/><path d="m2 8 6 3 6-3M2 11l6 3 6-3"/>',
    money: '<rect x="1.8" y="4" width="12.4" height="8" rx="1.2"/><circle cx="8" cy="8" r="1.8"/><path d="M4 6v4M12 6v4"/>',
    trend: '<path d="M2 13.5h12"/><path d="m2.6 10.4 3.4-3.6 2.6 2 4.8-5"/><path d="M10.6 3.8h2.8v2.8"/>',
    pie: '<path d="M8 2a6 6 0 1 0 6 6H8z"/><path d="M10 1.9A6 6 0 0 1 14.1 6H10z"/>',
    swapLens: '<path d="M2 4.5h8M8 2.5l2 2-2 2M10.5 9.5h-8M4.5 7.5l-2 2 2 2"/><circle cx="12" cy="11.4" r="2"/><path d="m13.4 12.8 1.2 1.2"/>',
    menu: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>', close: '<path d="m3.5 3.5 9 9M12.5 3.5l-9 9"/>',
    pen: '<path d="M10.6 2.4l3 3L5.4 13.6 2 14l.4-3.4z"/>', view: '<path d="M2 13.5h12M3.5 11V7.5M7 11V3.5M10.5 11V6M14 11V8.5"/>'
  };
  var TAB_IC = {
    'franchise.franchise': 'shield', 'franchise.history_fix': 'clockBack', 'start.roster0': 'people', 'start.picks0': 'ticket',
    'preseason.cap': 'cap', 'preseason.lineup': 'lines', 'preseason.ratings': 'star', 'preseason.schedule': 'calendar',
    'stats.skaters': 'stick', 'stats.goalies': 'mask', 'stats.team': 'bars',
    'roster.injuries': 'cross', 'roster.moves': 'updown', 'roster.trades': 'swap', 'roster.contracts': 'doc', 'roster.offers': 'docAlert', 'roster.positions': 'posSwap', 'roster.players': 'list',
    'results.standings': 'podium', 'results.series': 'bracket', 'results.cup': 'cup',
    'honors.awards': 'medal', 'honors.allstar': 'star', 'honors.retire': 'jersey',
    'draft.owned': 'ticket', 'draft.lottery': 'lottery', 'draft.ranks': 'rank', 'draft.top3': 'podium', 'draft.picks': 'pick', 'draft.board': 'lens',
    'cards.player': 'person', 'cards.goalie': 'mask', 'cards.team': 'shield',
    'team_records.skaters': 'recSk', 'team_records.goalies': 'recG', 'team_records.team': 'recTm',
    'league_records.players': 'people', 'league_records.teams': 'globe', 'league_records.hof': 'columns',
    'analysis.opening': 'puck', 'analysis.depth': 'layers', 'analysis.contracts': 'money', 'analysis.evolution': 'trend', 'analysis.makeup': 'pie', 'analysis.trades': 'swapLens'
  };
  function icon(name) { return '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.list) + '</g></svg>'; }
  // Barre verticale (décision du 2026-11-26 ; groupes repliables, décision du 2026-11-27, maquette docs/maquettes/4e_revision.js) : Accueil, puis Saisir et Consulter,
  // chaque groupe avec ses onglets dessous. Le titre d'un groupe est un bouton qui replie ou déplie sa liste ; le groupe de la page ouverte garde un titre simple, toujours déplié.
  // gid : groupe de la page ('index' pour l'accueil) ; cur : onglet affiché ; pane / attr : volet affiché et attribut lu par son application
  // (les onglets du groupe courant portent data-navtab, et data-<attr> quand l'application du volet les sert elle-même) ; q : paramètres gardés ;
  // fold : groupes repliés { groupe: true } (localStorage ft_nav_fold_v1, lu par foldState) ; absent : tout déplié.
  var FOLD_KEY = 'ft_nav_fold_v1';
  var CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.2 6 7.8l3.5-3.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function foldState(get) { try { var o = JSON.parse((get && get(FOLD_KEY)) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function foldTitle(L, closed, gn) { return fill(lbl(L, closed ? 'nav.fold_open' : 'nav.fold_close'), [gn]); }
  function side(L, gid, cur, pane, attr, pend, q, index, fold) {
    var F = fold || {};
    function sec(id) {
      return '<section class="ft-side-sec" aria-labelledby="ft-side-' + id + '"><h2 id="ft-side-' + id + '">' + icon(id === 'enter' ? 'pen' : 'view') + esc(lbl(L, 'nav.sec.' + id)) + '</h2>' +
        NAV.GROUPS.filter(function (g) { return g.sec === id; }).map(function (g) {
          var here = g.id === gid, n = pend && pend[g.id] ? pend[g.id].total : 0, counts = pend && pend[g.id] && pend[g.id].tabs ? pend[g.id].tabs : {};
          var closed = !here && !!F[g.id], gn = lbl(L, 'nav.g.' + g.id), ulid = 'ft-side-ul-' + g.id;
          var cnt = n ? '<span class="ft-cnt" title="' + esc(fill(lbl(L, n === 1 ? 'nav.pending_group_one' : 'nav.pending_group_other'), [n])) + '">' + n + '</span>' : '';
          var head = here ? '<p class="ft-side-gn">' + esc(gn) + cnt + '</p>'
            : '<button type="button" class="ft-side-gb" data-g="' + g.id + '" aria-expanded="' + !closed + '" aria-controls="' + ulid + '" title="' + esc(foldTitle(L, closed, gn)) + '"><span class="gnm">' + esc(gn) + '</span>' + cnt + CHEV + '</button>';
          return '<div class="ft-side-g' + (NAV.ready(g) ? '' : ' soon') + (here ? ' on' : '') + '" data-g="' + g.id + '">' + head + '<ul id="' + ulid + '"' + (closed ? ' hidden' : '') + '>' +
            g.tabs.map(function (x) {
              var name = esc(lbl(L, 'nav.t.' + g.id + '.' + x.id, true)), full = lbl(L, 'nav.t.' + g.id + '.' + x.id), c = counts[x.id] || 0;
              var nav = here ? ' data-navtab="' + x.id + '" data-kind="' + x.kind + '"' + (!x.soon && x.app && x.pane === pane ? ' data-' + attr + '="' + x.app + '"' : '') : '';
              var inner = icon(TAB_IC[g.id + '.' + x.id]) + '<span class="nm">' + name + '</span>' + (c ? '<span class="ft-cnt">' + c + '</span>' : '') + (x.soon ? '<span class="ft-soon">' + esc(lbl(L, 'nav.soon')) + '</span>' : '');
              if (x.soon) return '<li><span class="ft-side-t" data-g="' + g.id + '" data-t="' + x.id + '"' + nav + ' aria-disabled="true"' + (here ? ' role="link" tabindex="0"' : '') + (here && x.id === cur ? ' aria-current="page"' : '') + ' title="' + esc(full + ' : ' + lbl(L, 'nav.soon_hint')) + '">' + inner + '</span></li>';
              return '<li><a class="ft-side-t" data-g="' + g.id + '" data-t="' + x.id + '"' + nav + ' href="' + NAV.href(g.id) + (q || '') + '#' + x.id + '"' + (here && x.id === cur ? ' aria-current="page"' : '') + (full !== name ? ' title="' + esc(full) + '"' : '') + '>' + inner +
                '<span class="vh">, ' + esc(lbl(L, x.kind === 'view' ? 'nav.kind_view' : 'nav.kind_enter')) + '</span></a></li>';
            }).join('') + '</ul></div>';
        }).join('') + '</section>';
    }
    return '<nav class="ft-side" id="ft-side" aria-label="' + esc(lbl(L, 'nav.side_label')) + '"><a class="ft-side-home" href="' + esc(index || 'index.html') + (q || '') + '"' + (gid === 'index' ? ' aria-current="page"' : '') + '>' + icon('home') + esc(lbl(L, 'nav.side_home')) + '</a>' + sec('enter') + sec('view') + '</nav><div class="ft-side-scrim" hidden></div>';
  }
  function menuButton(L) { return '<button type="button" class="ft-menu" aria-controls="ft-side" aria-expanded="false">' + icon('menu') + '<span>' + esc(lbl(L, 'nav.menu')) + '</span></button>'; }
  // titre de la page (remplace la rangée d'onglets) : icône et nom de l'onglet, puis « Saisir › Groupe »
  function pageTitle(L, gid, cur) {
    var g = NAV.group(gid), x = NAV.tab(gid, cur) || NAV.firstReady(g); if (!x) return '';
    return '<div class="ft-ptitle"><h1>' + icon(TAB_IC[gid + '.' + x.id]) + esc(lbl(L, 'nav.t.' + gid + '.' + x.id)) + '</h1><span class="grp">' + esc(lbl(L, 'nav.sec.' + g.sec)) + ' › ' + esc(lbl(L, 'nav.g.' + gid)) + '</span></div>';
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
  var S = { L: null, menu: false, page: null, tab: null, soon: null, pane: null, hosts: {}, mounts: {}, mounted: {}, moved: null, fid: null, leaving: false, store: null };
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
    var gid = S.page.group, L = c.L, pend = pendNow(), qs = q(); S.L = L;
    if (c.pane === S.pane && !S.soon && c.app && c.app.state) {   // l'application a changé d'onglet d'elle-même : l'URL suit
      var x = NAV.tabOfApp(gid, c.pane, c.app.state[attr()]);
      if (x && x.id !== S.tab) { S.tab = x.id; lsSet('ft_tab_' + gid, x.id); try { root.history.replaceState(null, '', root.location.pathname + root.location.search + '#' + x.id); } catch (e) { /* ignore */ } }
    }
    html = html.replace(/(<header class="top">[\s\S]*?<div class="sub">)[^<]*(<\/div>)/, function (m, x, y) { return x + esc(lbl(L, 'nav.g.' + gid)) + y; });   // sous-titre : le groupe
    // bande du haut : bouton Menu (barre repliée à 1440 px et moins) et compteur des saisies en attente ; l'accueil est en tête de la barre verticale
    html = html.replace('<div class="ctl">', '<div class="ctl">' + menuButton(L) + pendBadge(L, pend, qs));
    var top = (S.soon ? '' : pageTitle(L, gid, S.tab)) + (S.moved ? movedMsg(L, S.moved.g, S.moved.t) : '');
    if (S.soon) html = html.replace(/<main[\s\S]*<\/main>/, soonMain(L, gid, S.soon));
    var hi = html.indexOf('</header>'), head = hi >= 0 ? html.slice(0, hi + 9) : '', body = hi >= 0 ? html.slice(hi + 9) : html;
    if (top) body = /<main[^>]*>/.test(body) ? body.replace(/<main[^>]*>/, function (m) { return m + top; }) : top + body;
    var out = head + '<div class="ft-layout">' + side(L, gid, S.tab, c.pane, attr(), pend, qs, S.page.index, foldState(lsGet)) + '<div class="ft-content">' + body + footer(L, S.page.connect) + '</div></div>';
    return S.menu ? out.replace('class="ft-menu" aria-controls="ft-side" aria-expanded="false"', 'class="ft-menu" aria-controls="ft-side" aria-expanded="true"').replace('<nav class="ft-side" id="ft-side"', '<nav class="ft-side open" id="ft-side"').replace('<div class="ft-side-scrim" hidden>', '<div class="ft-side-scrim">') : out;
  }

  // ---- évènements : onglets (clic, clavier), « Aller à », retour arrière, sortie de l'application ----
  // menu replié (1440 px et moins) : l'état survit aux dessins (le rendu remplace innerHTML) ; le focus va à l'onglet affiché, puis revient au bouton
  function menuApply(focus) {
    var doc = root.document; if (!doc || typeof doc.querySelector !== 'function') return;
    var b = doc.querySelector('.ft-menu'), sd = doc.getElementById('ft-side'), sc = doc.querySelector('.ft-side-scrim'), v = !!S.menu; if (!b || !sd) return;
    b.setAttribute('aria-expanded', String(v)); sd.classList.toggle('open', v); if (sc) sc.hidden = !v; doc.documentElement.classList.toggle('ft-side-lock', v);
    if (focus) { if (v) { var cur = sd.querySelector('[aria-current=page]') || sd.querySelector('a'); if (cur) { cur.focus(); if (cur.scrollIntoView) cur.scrollIntoView({ block: 'center' }); } } else b.focus(); }
  }
  function menu(v) { S.menu = !!v; menuApply(true); }
  // groupe replié ou déplié (bouton du titre) : attributs changés sur place, sans redessiner (le focus reste sur le bouton) ; état enregistré dans ft_nav_fold_v1
  function toggleFold(b) {
    var doc = root.document, g = b.getAttribute('data-g'), closed = b.getAttribute('aria-expanded') === 'true', ul = doc.getElementById(b.getAttribute('aria-controls')), F = foldState(lsGet);
    b.setAttribute('aria-expanded', String(!closed)); if (ul) ul.hidden = closed;
    var gn = b.querySelector('.gnm'); if (S.L) b.setAttribute('title', foldTitle(S.L, closed, gn ? gn.textContent : g));
    if (closed) F[g] = true; else delete F[g]; lsSet(FOLD_KEY, JSON.stringify(F));
  }
  // bouton Menu, voile, Échap et titres de groupes repliables : sur toutes les pages, accueil compris (index_ui.js l'appelle aussi, avec ses libellés)
  var menuWired = false;
  function wireMenu(L) {
    if (L) S.L = L;
    if (menuWired || !root.document) return; menuWired = true; var doc = root.document;
    on(doc, 'click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var fb = t.closest('button.ft-side-gb'); if (fb) { e.preventDefault(); toggleFold(fb); return; }
      if (t.closest('.ft-menu')) { e.preventDefault(); menu(doc.querySelector('.ft-menu').getAttribute('aria-expanded') !== 'true'); return; }
      if (t.closest('.ft-side-scrim')) menu(false);
    });
    on(doc, 'keydown', function (e) { if (e.key === 'Escape' && doc.querySelector('.ft-menu[aria-expanded=true]')) { e.preventDefault(); menu(false); } });
  }
  var wired = false;
  function wire() {
    if (wired || !root.document) return; wired = true; var doc = root.document; wireMenu();
    on(doc, 'click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var b = t.closest('[data-navtab]');
      if (b) {
        var x = NAV.tab(S.page.group, b.getAttribute('data-navtab')), own = x && !x.soon && b.tagName === 'BUTTON' && b.hasAttribute('data-' + attr());   // un lien de la barre verticale : la coquille change l'onglet elle-même
        if (!x) return; if (!own) { e.preventDefault(); e.stopPropagation(); }
        S.menu = false; go(x.id, true, own);
        if (e.detail === 0) setTimeout(function () { var el = doc.querySelector('#ft-side [data-navtab="' + x.id + '"]'); if (el) el.focus(); }, 0);   // activé au clavier : le focus reste sur l'onglet après le dessin
        return;
      }
      var gt = t.closest('[data-go-tab]'); if (gt) { e.preventDefault(); e.stopPropagation(); go(gt.getAttribute('data-go-tab'), true, false); return; }
      var a = t.closest('a[href]'); if (a && a.target !== '_blank') { try { var u = new URL(a.getAttribute('href'), root.location.href); if (u.origin === root.location.origin || (u.protocol === 'file:' && root.location.protocol === 'file:')) { S.leaving = true; setTimeout(function () { S.leaving = false; }, 2000); } } catch (x2) { /* ignore */ } }
    }, true);
    // barre verticale : Entrée sur un onglet « À venir » du groupe courant ; Échap ferme le menu replié (1440 px et moins)
    on(doc, 'keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var sp = e.target && e.target.closest ? e.target.closest('span.ft-side-t[data-navtab]') : null; if (!sp) return;
      e.preventDefault(); sp.click();
    });
    on(root, 'hashchange', function () { var h = hashTab(); if (h && h !== S.tab && NAV.tab(S.page.group, h)) go(h, false, false); });
    // saisies non envoyées : avertissement en quittant l'application (pas en passant d'un groupe à l'autre : elles restent dans ce navigateur)
    on(root, 'beforeunload', function (e) { if (S.leaving || !(pendNow().total > 0)) return; e.preventDefault(); e.returnValue = ''; return ''; });
    // le compteur suit les saisies faites dans une autre fenêtre
    on(root, 'storage', function (e) { if (e.key && /^ft_(entries|events|pre|results|honors|draft)_v1/.test(e.key)) redraw(); });
  }

  var api = { init: init, mount: mount, addHost: addHost, applyTo: applyTo, decorate: decorate, go: go, state: function () { return S; }, page: P,
              side: side, foldState: foldState, FOLD_KEY: FOLD_KEY, pageTitle: pageTitle, wireMenu: wireMenu, menuButton: menuButton, menuApply: menuApply, TAB_IC: TAB_IC, icon: icon, soonMain: soonMain, pendBadge: pendBadge, footer: footer, IC: IC, esc: esc, fill: fill };
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
      // tables de CETTE page seulement (les vues des fiches ne sont lues que par la page Fiches) ; les versions des autres tables restent
      // celles du cache, pour que la page qui les lit les relise si elles ont changé entre-temps
      var pg = pageName(), names = FTLIVE.tableDefs().filter(function (x) { return !x.pages || x.pages.indexOf(pg) >= 0; }).map(function (x) { return x.name; }), need = CACHE ? CACHE.changed(VERS, fresh, names) : names;
      if (fresh) { var next = Object.assign({}, VERS || {}); names.forEach(function (n) { if (n in fresh) next[n] = fresh[n]; else delete next[n]; }); VERS = next; } else VERS = fresh;
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
          RAW = R; VERS = await vp; if (VERS) { var vk = {}; Object.keys(VERS).forEach(function (n) { if (n in R) vk[n] = VERS[n]; }); VERS = vk; }   apply(R, 'sb.connected'); report(page); save(fid);   // versions gardées : celles des tables lues seulement (une autre page lira les siennes)
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

;/* Index de navigation (phase 4b ; accueil en bento, décision du 2026-11-27) : deux boîtes, Saisir puis Consulter, construites depuis connect/ft_nav.js ; Outils en pied de page.
   Libellés : table label (fichier partagé FT_LABELS) ; couleurs, logo, langue et thème mémorisés par les pages (ft_colors, ft_team, ft_lang, ft_theme).
   Aucune connexion : le compteur de saisies en attente lit le stockage du navigateur pour la franchise active (ft_franchise). */
(function (root) {
  var NAV = root.FTNAV, SH = root.FTSHELL, esc = SH.esc, fill = SH.fill, D = root.document, LS = null;
  try { LS = root.localStorage; } catch (e) { LS = null; }
  function g(k) { try { return LS && LS.getItem(k); } catch (e) { return null; } }
  function sv(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) { /* ignore */ } }
  var LINKS = root.FT_INDEX || {}, lang = g('ft_lang') === 'en' ? 'en' : 'fr';
  function L(k, short) { var e = (root.FT_LABELS || {})[k]; if (!e) return k; var v = e[lang] || e.fr || e.en; return v ? (short && v[1] ? v[1] : v[0]) : k; }
  function theme() { var t = g('ft_theme'); return t === 'dark' || t === 'light' ? t : (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  function crest() {
    var tm = String(g('ft_team') || '').toUpperCase().replace(/[^A-Z]/g, ''); if (tm === 'VEG') tm = 'VGK'; if (!tm) return '<span class="crest"></span>';
    return '<span class="crest logo"><img src="https://assets.nhle.com/logos/nhl/svg/' + tm + '_light.svg" alt="" onerror="this.parentNode.className=\'crest\';this.remove()"></span>';
  }
  function colors() {   // couleurs de l'équipe ; texte de l'en-tête = même règle que live_mount.js (onColor)
    try {
      var c = JSON.parse(g('ft_colors') || 'null'), st = D.documentElement.style; if (!c) return;
      st.setProperty('--base1', c[0]); st.setProperty('--base2', c[1]);
      if (/^#[0-9A-Fa-f]{6}$/.test(c[0] || '') && root.FTLM) { st.setProperty('--on-base1', root.FTLM.onColor(c[0], c[2])); st.setProperty('--on-c1-dark', root.FTLM.onColor(root.FTLM.mixHex(c[0], '#FFFFFF', 0.72), c[2])); }
    } catch (e) { /* ignore */ }
  }
  // Accueil en bento (décision du 2026-11-27, maquette docs/maquettes/4e_revision.js) : une boîte Saisir, une boîte Consulter ; une sous-boîte par groupe,
  // chaque onglet avec son icône (FTSHELL.TAB_IC) et son nom long ; onglets « À venir » grisés, sans lien. Aucune phrase d'explication.
  function cell(gr, pend) {
    var ready = NAV.ready(gr), gn = esc(L('nav.g.' + gr.id)), n = pend[gr.id] ? pend[gr.id].total : 0;
    var cnt = n ? '<span class="ft-cnt" title="' + esc(fill(L(n === 1 ? 'nav.pending_group_one' : 'nav.pending_group_other'), [n])) + '">' + n + '</span>' : '';
    return '<section class="ft-cell' + (ready ? '' : ' soon') + '" data-g="' + gr.id + '"><h3>' + (ready ? '<a href="' + NAV.href(gr.id) + '">' + gn + '</a>' : gn) + cnt + '</h3><ul>' +
      gr.tabs.map(function (x) {
        var nm = esc(L('nav.t.' + gr.id + '.' + x.id)), inner = '<span class="tile">' + SH.icon(SH.TAB_IC[gr.id + '.' + x.id]) + '</span><span class="nm">' + nm + '</span>';
        return '<li>' + (x.soon ? '<span class="ft-hl" data-g="' + gr.id + '" data-t="' + x.id + '" aria-disabled="true" title="' + esc(L('nav.soon_hint')) + '">' + inner + '<span class="ft-soon">' + esc(L('nav.soon')) + '</span></span>'
          : '<a class="ft-hl" data-g="' + gr.id + '" data-t="' + x.id + '" href="' + NAV.href(gr.id, x.id) + '">' + inner + '<span class="vh">, ' + esc(L(x.kind === 'view' ? 'nav.kind_view' : 'nav.kind_enter')) + '</span></a>') + '</li>';
      }).join('') + '</ul></section>';
  }
  function view() {
    var pend = NAV.pending(g, +g('ft_franchise') || null), cur = theme();
    var box = function (id, icon) {
      return '<section class="ft-box" data-sec="' + id + '" aria-labelledby="ft-box-' + id + '"><h2 id="ft-box-' + id + '">' + icon + esc(L('nav.sec.' + id)) + '</h2><div class="ft-cells">' +
        NAV.GROUPS.filter(function (x) { return x.sec === id; }).map(function (x) { return cell(x, pend); }).join('') + '</div></section>';
    };
    return '<header class="top"><div class="brand">' + crest() + '<div><div class="fr">Franchise Tracker</div><div class="sub">' + esc(L('nav.index')) + '</div></div></div>' +
      '<div class="ctl">' + SH.menuButton(L) + SH.pendBadge(L, pend, '') +
      '<div class="seg" role="group" aria-label="' + esc(L('ui.language')) + '"><button data-lang="fr" aria-pressed="' + (lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (lang === 'en') + '">EN</button></div>' +
      '<div class="seg" role="group" data-themeseg="1" aria-label="' + esc(L('ui.theme')) + '"><button data-theme-set="light" aria-pressed="' + (cur === 'light') + '">' + esc(L('ui.theme_light')) + '</button><button data-theme-set="dark" aria-pressed="' + (cur === 'dark') + '">' + esc(L('ui.theme_dark')) + '</button></div></div></header>' +
      '<div class="ft-layout">' + SH.side(L, 'index', null, null, 'tab', pend, '', 'index.html', SH.foldState(g)) + '<div class="ft-content">' +   // barre verticale, comme les autres pages (2026-11-26)
      '<div class="ft-homewrap"><main class="ft-home" aria-label="' + esc(L('nav.home_label')) + '"><h1 class="vh">' + esc(L('nav.index')) + '</h1>' + box('enter', SH.IC.pen) + box('view', SH.IC.view) + '</main></div>' + SH.footer(L, LINKS.connect) + '</div></div>';
  }
  function draw() { D.documentElement.lang = lang; D.getElementById('app').innerHTML = view(); }
  D.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.getAttribute('data-lang')) { lang = b.getAttribute('data-lang'); sv('ft_lang', lang); draw(); }
    else if (b.getAttribute('data-theme-set')) { var t = b.getAttribute('data-theme-set'); sv('ft_theme', t); D.documentElement.setAttribute('data-theme', t); draw(); }
  });
  root.addEventListener('storage', function () { draw(); });
  SH.wireMenu(L); colors(); draw();
})(typeof window !== 'undefined' ? window : this);
