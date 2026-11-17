/* Page « Historique : corrections manuelles » : consulter et corriger une valeur de l'historique réel (lignes d'origine « historical »).
   Une valeur modifiée est enregistrée avec l'indicateur « manual » (posé par la base) : une réimportation ne l'écrase plus. */
(function (root) {
  var FTL = root.FTLIVE || (typeof require !== 'undefined' ? require('../connect/live_data.js') : null);
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  var FH = root.FTHELP || (typeof require !== 'undefined' ? require('../connect/ft_help.js') : null);
  var COLS = { sk: FTL.HSK, gk: FTL.HGK }, TABLE = { sk: 'skater_season_stats', gk: 'goalie_season_stats' };
  // en-têtes : clés stat.* (même ordre que COLS) ; abréviation affichée, forme longue en infobulle et pour le lecteur d'écran
  var HEAD = { sk: ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'shg', 'ppp', 'shp', 'toi', 'fow', 'fot', 'hits', 'blocks', 'giveaways', 'takeaways'], gk: ['gp', 'w', 'l', 'otl', 'so', 'saves', 'sa', 'ga', 'min', 'pim', 'g', 'a'] };
  var NOTNULL = { sk: ['gp', 'g', 'a', 'plus_minus', 'pim', 'shots', 'gwg', 'ppg', 'shg', 'ppp', 'shp'], gk: ['gp', 'w', 'l', 'otl', 'so', 'pim', 'g', 'a'] };
  var DEC = { sk: ['toi_minutes'], gk: ['minutes'] }, SIGNED = ['plus_minus'], OFFSET = 5;   // une ligne : [id, joueur, saison, période, manuel, ...valeurs]
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Aide en contexte (connect/ft_help.js) : clé sans point = préfixe hist.help_ ; avec point = clé complète
  var HELP_COLS = {
    sk: { where: ['st_where', 'sk_where_opt'], order: ['st_order_1', 'st_order_2', 'st_order_3', 'st_order_4'], errors: ['st_err_red', 'sk_err_zero', 'st_err_time', 'st_err_find'], alerts: ['st_al_nocheck', 'al_count', 'st_al_manual', 'st_al_restore', 'sk_al_pts'] },
    gk: { where: ['st_where', 'gk_where_opt'], order: ['st_order_1', 'st_order_2', 'st_order_3', 'st_order_4'], errors: ['st_err_red', 'gk_err_zero', 'st_err_time', 'st_err_find'], alerts: ['st_al_nocheck', 'al_count', 'st_al_manual', 'st_al_restore'] },
    pl: { where: ['pl_where', 'pl_where_id'], order: ['pl_order_1', 'pl_order_2', 'pl_order_3', 'pl_order_4'], errors: ['pl_err_chars', 'ev.help_pl_err_1', 'pl_err_split'], alerts: ['pl_al_scope', 'al_count'] }
  };
  var HELP_COMMON = ['hist.help_c_reload', 'hist.help_c_scope', 'hist.help_c_msg'];
  // case refusée : infobulle qui dit comment corriger, selon la règle de la colonne (voir parse)
  function fixKey(kind, col) { return DEC[kind].indexOf(col) >= 0 ? 'hist.fix_dec' : SIGNED.indexOf(col) >= 0 ? 'hist.fix_signed' : NOTNULL[kind].indexOf(col) >= 0 ? 'hist.fix_int' : 'hist.fix_opt'; }
  function sn(s) { return s + '-' + String((s + 1) % 100).padStart(2, '0'); }

  // Valeur saisie -> { ok, v }
  function parse(kind, col, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '') return NOTNULL[kind].indexOf(col) >= 0 ? { ok: false } : { ok: true, v: null };
    var dec = DEC[kind].indexOf(col) >= 0, signed = SIGNED.indexOf(col) >= 0;
    if (!(dec ? /^-?\d+([.,]\d+)?$/ : /^-?\d+$/).test(s)) return { ok: false };
    var v = parseFloat(s.replace(',', '.')); if (v < 0 && !signed) return { ok: false };
    return { ok: true, v: v };
  }

  function makeHistApp(DATA, store) {
    var sync = { user: null, busy: false, msg: '', level: '' };
    var seasons0 = DATA.sk.concat(DATA.gk).map(function (r) { return r[2]; });
    var state = { lang: 'fr', kind: 'sk', season: seasons0.length ? Math.max.apply(null, seasons0) : null, gt: 'RS', filter: '', edits: {}, names: {} };
    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s; }
    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    function seasons() { var seen = {}; DATA[state.kind].forEach(function (r) { seen[r[2]] = 1; }); return Object.keys(seen).map(Number).sort(function (a, b) { return b - a; }); }
    // ---- noms des joueurs : adapter l'orthographe à celle du jeu (ex. « JJ Peterka » = « John-Jason Peterka ») ----
    function nrm(x) { return String(x == null ? '' : x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function plList() { return DATA.pl || []; }
    function plFind(id) { return plList().filter(function (r) { return r[0] === id; })[0]; }
    function cleanName(raw) { return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim(); }
    function nameState(id) {       // '' (inchangé), 'ok', 'empty', 'taken'
      var raw = state.names[id]; if (raw === undefined) return ''; var nm = cleanName(raw), r = plFind(id); if (!r || nm === r[1]) return '';
      if (!nm || nm.length > 80 || /[<>"]/.test(nm)) return 'empty';
      return plList().some(function (o) { return o[0] !== id && o[2] === r[2] && nrm(o[1]) === nrm(nm); }) ? 'taken' : 'ok';
    }
    function setName(id, raw) { var r = plFind(id); if (!r) return; if (cleanName(raw) === r[1]) delete state.names[id]; else state.names[id] = String(raw); }
    function namesEdited() { return Object.keys(state.names).filter(function (id) { return nameState(+id) !== ''; }).length; }
    function namesInvalid() { return Object.keys(state.names).filter(function (id) { var st = nameState(+id); return st === 'empty' || st === 'taken'; }).length; }
    function plShown() { var f = nrm(state.filter); return plList().filter(function (r) { return !f || nrm(r[1]).indexOf(f) >= 0 || nrm((state.names[r[0]] || '')).indexOf(f) >= 0; }).sort(function (a, b) { return a[1].localeCompare(b[1], state.lang); }); }
    function setField(k, v) {
      if (k === 'kind') { state.kind = v; var s = v === 'pl' ? [] : seasons(); if (s.indexOf(state.season) < 0) state.season = s[0]; }
      else if (k === 'season') state.season = parseInt(v, 10); else if (k === 'gt') state.gt = v; else if (k === 'filter') state.filter = String(v || '');
    }
    function rowsShown() {
      var f = state.filter.trim().toLowerCase(), cols = COLS[state.kind];
      return DATA[state.kind].filter(function (r) { var p = DATA.players[r[1]] || {}; return r[2] === state.season && r[3] === state.gt && (!f || String(p.name || '').toLowerCase().indexOf(f) >= 0); })
        .sort(function (a, b) { var ga = state.kind === 'sk' ? (a[OFFSET + 1] || 0) + (a[OFFSET + 2] || 0) : (a[OFFSET] || 0), gb = state.kind === 'sk' ? (b[OFFSET + 1] || 0) + (b[OFFSET + 2] || 0) : (b[OFFSET] || 0); return gb - ga || String((DATA.players[a[1]] || {}).name).localeCompare(String((DATA.players[b[1]] || {}).name)); });
    }
    function findRow(kind, id) { return DATA[kind].filter(function (r) { return r[0] === id; })[0]; }
    function ekey(kind, id) { return kind + '|' + id; }
    // valeur décimale affichée dans le format de la langue (1450,5 en français) ; la saisie accepte la virgule ou le point
    function numText(kind, col, v) { if (v == null) return ''; var x = String(v); return state.lang === 'fr' && DEC[kind].indexOf(col) >= 0 ? x.replace('.', ',') : x; }
    function shown(kind, row, ci) { var e = state.edits[ekey(kind, row[0])]; if (e && COLS[kind][ci] in e) return e[COLS[kind][ci]]; return numText(kind, COLS[kind][ci], row[OFFSET + ci]); }
    function setEdit(kind, id, col, raw) {
      var row = findRow(kind, id); if (!row) return;
      var ci = COLS[kind].indexOf(col), orig = row[OFFSET + ci], origS = orig == null ? '' : String(orig), k = ekey(kind, id), e = state.edits[k] || {};
      var pv = parse(kind, col, raw);     // même valeur, écrite avec une virgule ou un point : pas une modification
      if (String(raw).trim() === origS || (pv.ok && pv.v === (orig == null ? null : orig))) delete e[col]; else e[col] = String(raw).trim();
      if (Object.keys(e).length) state.edits[k] = e; else delete state.edits[k];
    }
    function cellState(kind, id, col) { var e = state.edits[ekey(kind, id)]; if (!e || !(col in e)) return ''; return parse(kind, col, e[col]).ok ? 'ed' : 'inv'; }
    function editedRows() { return Object.keys(state.edits).length + namesEdited(); }
    function invalidCount() { var n = namesInvalid(); Object.keys(state.edits).forEach(function (k) { var p = k.split('|'); Object.keys(state.edits[k]).forEach(function (c) { if (!parse(p[0], c, state.edits[k][c]).ok) n++; }); }); return n; }
    function manualCount() { return DATA.sk.concat(DATA.gk).filter(function (r) { return r[4] === 1; }).length; }
    function fixText(kind, col) { return t(fixKey(kind, col)); }
    function helpHTML() {
      var k = state.kind, H = HELP_COLS[k], key = function (x) { return x.indexOf('.') >= 0 ? x : 'hist.help_' + x; };
      return FH.html({
        screen: 'history_edit', prefix: 'hist.', t: t, esc: esc, defaults: { open: false, common: false },
        summary: esc(t('hist.help_sum')), chip: t(k === 'sk' ? 'hist.skaters' : k === 'gk' ? 'hist.goalies' : 'hist.names'),
        top: { h: 'hist.help_h_where', items: H.where.map(key), lead: true },
        note: k === 'pl' ? 'hist.help_pl_note' : null,
        cols: [[{ h: 'entry.help_h_order', items: H.order.map(key), ordered: true }], [{ h: 'entry.help_h_errors', items: H.errors.map(key), lead: true }], [{ h: 'entry.help_h_alerts', items: H.alerts.map(key), lead: true }]],
        common: HELP_COMMON
      });
    }
    function cancel() { state.edits = {}; state.names = {}; sync.msg = ''; }

    async function doPush(client) {
      sync.busy = true; sync.msg = '';
      try {
        if (!editedRows()) { say('warn', 'hist.nothing'); return false; }
        if (invalidCount()) { say('bad', 'hist.invalid'); return false; }
        var keys = Object.keys(state.edits), n = 0;
        var ids = Object.keys(state.names).map(Number).filter(function (id) { return nameState(id) === 'ok'; });
        for (var ni = 0; ni < ids.length; ni++) {
          var r0 = plFind(ids[ni]), nm = cleanName(state.names[ids[ni]]), parts = nm.split(' '), first = parts[0], last = parts.slice(1).join(' ');
          await client.patch('player', 'id=eq.' + ids[ni], { full_name: nm, first_name: first, last_name: last, legacy_key: r0[2] + ' - ' + nm });
          r0[1] = nm; if (DATA.players[ids[ni]]) DATA.players[ids[ni]].name = nm; delete state.names[ids[ni]]; n++;
        }
        for (var i = 0; i < keys.length; i++) {
          var p = keys[i].split('|'), kind = p[0], id = +p[1], patch = {};
          Object.keys(state.edits[keys[i]]).forEach(function (c) { patch[c] = parse(kind, c, state.edits[keys[i]][c]).v; });
          await client.patch(TABLE[kind], 'id=eq.' + id, patch);
          var row = findRow(kind, id); Object.keys(patch).forEach(function (c) { row[OFFSET + COLS[kind].indexOf(c)] = patch[c]; }); row[4] = 1; n++;
        }
        state.edits = {}; say('ok', 'hist.saved', [n]); return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); return false; } finally { sync.busy = false; }
    }
    async function restore(client, kind, id) {
      try { await client.patch(TABLE[kind], 'id=eq.' + id, { manual: false }); findRow(kind, id)[4] = 0; say('ok', 'hist.restored'); return true; }
      catch (e) { say('bad', 'sb.failed', [e.message]); return false; }
    }
    async function doPull(client) {
      try {
        var cols = { sk: 'select=id,player_id,season,game_type,manual,' + COLS.sk.join(',') + '&origin=eq.historical&order=id', gk: 'select=id,player_id,season,game_type,manual,' + COLS.gk.join(',') + '&origin=eq.historical&order=id' };
        for (var k in TABLE) { var rows = await client.selectAll(TABLE[k], cols[k]); DATA[k] = rows.map(function (s) { return [s.id, s.player_id, s.season, s.game_type, s.manual === true || s.manual === 1 ? 1 : 0].concat(COLS[k].map(function (c) { return s[c] == null ? null : s[c]; })); }); }
        state.edits = {}; say('ok', 'sb.connected');
      } catch (e) { say('bad', 'sb.failed', [e.message]); }
    }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; }
    async function doLogin(client, email, pw) { try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } return !!sync.user; }

    function barHTML() {
      var n = editedRows(), bad = invalidCount();
      return (n ? '<span class="' + (bad ? 'bad' : 'warn') + '">' + esc(fmt('hist.edited', [n])) + (bad ? ' · ' + esc(t('hist.invalid')) : '') + '</span>' : '<span class="muted">' + esc(fmt('hist.count_manual', [manualCount()])) + '</span>') +
        (n ? '<div class="acts left"><button class="btn" data-sb="push"' + (sync.busy || bad ? ' disabled' : '') + '>' + esc(t('hist.save')) + '</button><button class="btn ghost" data-hist="cancel">' + esc(t('hist.cancel')) + '</button></div>' : '');
    }
    function view() {
      var f = DATA.franchise, kind = state.kind, rows = kind === 'pl' ? [] : rowsShown(), h = '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(f ? f.name : 'Franchise Tracker') + '</div><div class="sub">' + esc(t('hist.title')) + '</div></div></div>' +
        '<div class="ctl"><a class="navlink" href="setup.html">' + esc(t('nav.setup')) + '</a><div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>';
      h += '<main class="entry">' + FTP.panel(t, esc, sync, { noPush: true }) + helpHTML();
      h += '<section class="card wide"><p class="muted">' + esc(t('hist.intro')) + '</p><div class="acts left">' +
        '<label class="fld">' + esc(t('hist.kind')) + '<select id="hist-kind"><option value="sk"' + (kind === 'sk' ? ' selected' : '') + '>' + esc(t('hist.skaters')) + '</option><option value="gk"' + (kind === 'gk' ? ' selected' : '') + '>' + esc(t('hist.goalies')) + '</option><option value="pl"' + (kind === 'pl' ? ' selected' : '') + '>' + esc(t('hist.names')) + '</option></select></label>' +
        (kind === 'pl' ? '' : '<label class="fld">' + esc(t('hist.season')) + '<select id="hist-season">' + seasons().map(function (s) { return '<option value="' + s + '"' + (s === state.season ? ' selected' : '') + '>' + sn(s) + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld">' + esc(t('hist.gt')) + '<select id="hist-gt"><option value="RS"' + (state.gt === 'RS' ? ' selected' : '') + '>' + esc(t('hist.rs')) + '</option><option value="PO"' + (state.gt === 'PO' ? ' selected' : '') + '>' + esc(t('hist.po')) + '</option></select></label>') +
        '<label class="fld">' + esc(t('hist.filter')) + '<input id="hist-filter" value="' + esc(state.filter) + '"></label></div><div id="hist-bar" class="hist-bar">' + barHTML() + '</div>';
      if (kind === 'pl') {
        var pr = plShown();
        if (!pr.length) return h + '<p class="muted">' + esc(t('hist.no_names')) + '</p></section></main>';
        h += '<div class="scroll vs"><table class="hist names"><thead><tr><th>' + esc(t('hist.name_col')) + '</th><th>' + esc(t('hist.pos_col')) + '</th><th>' + esc(t('hist.seasons_col')) + '</th><th>' + esc(t('hist.source_col')) + '</th></tr></thead><tbody>';
        pr.forEach(function (r) {
          var raw = state.names[r[0]] !== undefined ? state.names[r[0]] : r[1], st = nameState(r[0]), cl = st === 'ok' ? ' ed' : (st === 'empty' || st === 'taken') ? ' inv' : '';
          h += '<tr><td><input class="cell nm-in' + cl + '" data-pid="' + r[0] + '" value="' + esc(raw) + '" aria-label="' + esc(r[1]) + '"' + (cl === ' inv' ? ' aria-invalid="true"' : '') + ' maxlength="80">' + (st === 'taken' ? ' <span class="bad">' + esc(t('hist.name_taken')) + '</span>' : st === 'empty' ? ' <span class="bad">' + esc(t('hist.name_empty')) + '</span>' : '') + '</td><td>' + esc(r[2]) + '</td><td class="muted">' + (r[7] ? esc(sn(r[5]) + ' – ' + sn(r[6]) + ' (' + r[7] + ')') : '—') + '</td><td class="muted">' + esc(r[4] === 'historical' ? t('hist.src_hist') : t('hist.src_game')) + (r[3] ? ' · ' + esc(r[3]) : '') + '</td></tr>';
        });
        return h + '</tbody></table></div></section></main>';
      }
      if (!rows.length) return h + '<p class="muted">' + esc(t('hist.no_rows')) + '</p></section></main>';
      h += '<div class="scroll"><table class="hist"><thead><tr><th>' + esc(t('hist.player')) + '</th>' + HEAD[kind].map(function (x) { return '<th class="num" title="' + esc(t('stat.' + x)) + '">' + esc(t('stat.' + x, true)) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var p = DATA.players[r[1]] || { name: '?', pos: '' }, rg = kind === 'sk' && r.length > 5 + COLS.sk.length ? r[5 + COLS.sk.length] : null;
        if (rg) p = { name: p.name, pos: rg };   // groupe de poste de la LIGNE (migration 66 : un joueur fusionné F/D garde le groupe de chaque saison)
        h += '<tr' + (r[4] === 1 ? ' class="manual"' : '') + '><td>' + esc(p.name) + (kind === 'sk' ? ' <span class="muted">' + esc(t('pc.' + p.pos) === 'pc.' + p.pos ? p.pos : t('pc.' + p.pos)) + '</span>' : '') + (r[4] === 1 ? ' <span class="badge" title="' + esc(t('hist.manual_tip')) + '">' + esc(t('hist.manual_badge')) + '</span>' : '') + '</td>' +
          COLS[kind].map(function (c, ci) { var cs = cellState(kind, r[0], c); return '<td class="num"><input class="cell ' + cs + '" data-k="' + kind + '" data-id="' + r[0] + '" data-c="' + c + '" value="' + esc(shown(kind, r, ci)) + '" inputmode="decimal" aria-label="' + esc(p.name + ' ' + t('stat.' + HEAD[kind][ci])) + '"' + (cs === 'inv' ? ' title="' + esc(fixText(kind, c)) + '" aria-invalid="true"' : '') + '></td>'; }).join('') +
          '<td>' + (r[4] === 1 ? '<button class="btn ghost small" data-hist="restore" data-k="' + kind + '" data-id="' + r[0] + '" title="' + esc(t('hist.restore_tip')) + '">' + esc(t('hist.restore')) + '</button>' : '') + '</td></tr>';
      });
      return h + '</tbody></table></div></section></main>';
    }
    return { setName: setName, nameState: nameState, namesEdited: namesEdited, plShown: plShown, sync: sync, state: state, view: view, barHTML: barHTML, t: t, fmt: fmt, setField: setField, setEdit: setEdit, cancel: cancel, doPush: doPush, restore: restore, doPull: doPull, doLogin: doLogin, doLogout: doLogout, rowsShown: rowsShown, seasons: seasons, editedRows: editedRows, invalidCount: invalidCount, manualCount: manualCount, cellState: cellState, fixText: fixText, helpHTML: helpHTML };
  }

  var api = { makeHistApp: makeHistApp, parse: parse, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTHIST = api;

  if (typeof document !== 'undefined') {
    var DATA0 = JSON.parse(document.getElementById('data').textContent), ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA0, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeHistApp(d, st || ls); }, assemble: FTLIVE.assembleHistory });
    rootEl.addEventListener('change', function (e) {
      var el = e.target, a = host.app(); if (!a) return;
      if (el.dataset && el.dataset.pid) { a.setName(+el.dataset.pid, el.value); host.draw(); return; }
      if (el.dataset && el.dataset.c) {       // une cellule : mise à jour sur place pour ne pas perdre le focus
        a.setEdit(el.dataset.k, +el.dataset.id, el.dataset.c, el.value); var cs = a.cellState(el.dataset.k, +el.dataset.id, el.dataset.c); el.className = 'cell ' + cs;
        if (cs === 'inv') { el.title = a.fixText(el.dataset.k, el.dataset.c); el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('title'); el.removeAttribute('aria-invalid'); }
        var bar = document.getElementById('hist-bar'); if (bar) bar.innerHTML = a.barHTML(); return;
      }
      if (el.id === 'hist-kind') a.setField('kind', el.value); else if (el.id === 'hist-season') a.setField('season', el.value); else if (el.id === 'hist-gt') a.setField('gt', el.value); else if (el.id === 'hist-filter') a.setField('filter', el.value); else return;
      host.draw('#' + el.id);        // garde le focus sur le champ changé
    });
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null, a = host.app(); if (!b || !a) return;
      if (b.dataset.lang) { a.state.lang = b.dataset.lang; host.draw(); }
      else if (b.dataset.hist === 'cancel') { a.cancel(); host.draw(); }
      else if (b.dataset.hist === 'restore') { a.restore(host.client, b.dataset.k, +b.dataset.id).then(function () { host.draw(); }); }
    });
    FH.bind(rootEl);       // aide : délégation sur rootEl, survit aux redessins
    // Modifications non enregistrées : avertissement du navigateur avant de rafraîchir, fermer l'onglet ou changer de page
    // (« Recharger depuis Supabase » les garde : l'état de la page est recopié)
    if (typeof window.addEventListener === 'function') window.addEventListener('beforeunload', function (e) { var a = host.app(); if (!a || !(a.editedRows() > 0)) return; e.preventDefault(); e.returnValue = ''; return ''; });
    host.start();
  }
})(typeof window !== 'undefined' ? window : this);
