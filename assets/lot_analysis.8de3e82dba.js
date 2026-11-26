/* Analyse de l'effectif › Contrats (prototype). La fiche joueur et la vue Équipe sont passées à la page Fiches (cards/cards_ui.js, phase 4e,
   2026-11-26) ; les vues Joueur, Équipe et Ligue de ce fichier sont retirées. view() retourne du HTML : testable sans navigateur (prototype/test_ui.js). */
(function (root) {
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function makeApp(DATA) {
    var TEAMS = {}; (DATA.teams || []).forEach(function (tm) { TEAMS[tm.en] = tm; });
    var sync = { user: null, busy: false, msg: '', level: '' };
    var state = { lang: 'fr', view: 'contracts', season: null };
    function tn(en) { var tm = TEAMS[en]; return tm ? (state.lang === 'fr' && tm.fr ? tm.fr : tm.en) : en; }
    function t(key, short) {
      var e = DATA.labels[key]; if (!e) return key;
      var v = e[state.lang] || e.en || [key, key];
      return short && v[1] ? v[1] : v[0];
    }
    function nf(x, d) { return x == null ? '—' : x.toLocaleString(state.lang === 'fr' ? 'fr-CA' : 'en-CA', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
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

    function header() {
      return '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(tn(DATA.franchise.name)) + '</div><div class="sub">' + esc(t('ui.contracts_view')) + '</div></div></div>' +
        '<div class="ctl"><div class="seg" role="group" aria-label="' + esc(t('ui.language')) + '"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>';
    }
    function view() { return contractsView(); }
    return { sync: sync, state: state, view: view, t: t };
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
    function draw(sel) { host.draw(sel || null); }
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !b.dataset.lang) return;
      app.state.lang = b.dataset.lang; draw('[data-lang="' + b.dataset.lang + '"]');
    });
    rootEl.addEventListener('change', function (e) { if (e.target.id !== 'sn') return; app.state.season = +e.target.value; draw('#sn'); });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
