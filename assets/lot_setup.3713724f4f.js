/* Choix d'une équipe : liste déroulante (datalist) + saisie au clavier avec remplissage automatique.
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

;/* Page « Franchise et historique » : choix de l'équipe et de la première saison, lancement de l'importation automatique de l'historique
   (Hockey-Reference, faite par la base Supabase elle-même) et suivi de l'avancement. */
(function (root) {
  var TC = root.FTTC || (typeof require !== 'undefined' ? require('../connect/team_combo.js') : null);
  var FTP = root.FTP || (typeof require !== 'undefined' ? require('../connect/sync_panel.js') : null);
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function makeSetupApp(DATA, store) {
    var sync = { user: null, busy: false, msg: '', level: '' };
    var state = { custom: [], divs: {}, form: null, showLeague: false, dropped: null, lang: 'fr', team: '', first: (DATA.franchise && DATA.franchise.first) || 2024, job: null, favLang: (DATA.franchise && DATA.franchise.locale) || 'fr', games: (DATA.franchise && DATA.franchise.games) || 82 };
    function t(key, short) { var e = DATA.labels[key]; if (!e) return key; var v = e[state.lang] || e.en || [key, key]; return short && v[1] ? v[1] : v[0]; }
    function fmt(k, p) { var s = t(k); (p || []).forEach(function (x, i) { s = s.replace('{' + i + '}', x); }); return s; }
    function say(level, k, p) { sync.level = level; sync.msg = fmt(k, p); }
    function setField(k, v) {
      if (k === 'team') state.team = String(v).trim().toUpperCase(); else if (k === 'first') { var prevFirst = state.first; state.first = parseInt(v, 10) || state.first; if (state.first !== prevFirst) resetLeague(); state.dropped = null; if (!DATA.hasFranchise && state.team && !inLeague(state.team, state.first)) { state.dropped = teamName(state.team, leagueRows(Math.min(Math.max(state.first, 2014), curSeason())).filter(function (r) { return r.team_code === state.team; })[0] || (DATA.league || []).filter(function (r) { return r.team_code === state.team; })[0]); state.team = ''; } }
      else if (k === 'games') state.games = parseInt(v, 10) || 0;
      else if (k === 'lang' && (v === 'fr' || v === 'en')) { state.favLang = v; state.lang = v; }     // la langue favorite devient aussi la langue affichée
    }
    function gamesOk() { return state.games >= 20 && state.games <= 84 && state.games % 2 === 0; }
    // Matchs par saison : enregistré dans la franchise (la création le reçoit directement)
    async function saveGames(client) {
      if (!gamesOk()) { say('bad', 'setup.games_invalid'); return false; }
      if (!DATA.hasFranchise || !DATA.franchise || !DATA.franchise.id) return true;
      try { await client.rest('PATCH', 'franchise?id=eq.' + DATA.franchise.id, { headers: { Prefer: 'return=minimal' }, body: { games_per_season: state.games } }); DATA.franchise.games = state.games; say('ok', 'setup.games_saved'); return true; }
      catch (e) { say('bad', 'sb.failed', [e.message]); return false; }
    }
    // Langue favorite : enregistrée dans la franchise (langue d'ouverture sur un nouvel appareil)
    async function saveLang(client) {
      if (!DATA.hasFranchise || !DATA.franchise || !DATA.franchise.id) return true;      // franchise pas encore créée : enregistrée à la création
      try { await client.rest('PATCH', 'franchise?id=eq.' + DATA.franchise.id, { headers: { Prefer: 'return=minimal' }, body: { ui_locale: state.favLang } }); DATA.franchise.locale = state.favLang; say('ok', 'setup.language_saved'); return true; }
      catch (e) { say('bad', 'sb.failed', [e.message]); return false; }
    }
    function counts() { var p = (state.job && state.job.pages) || {}, total = 0; Object.keys(p).forEach(function (k) { total += p[k]; }); return { total: total, done: (p.done || 0) + (p.skipped || 0) }; }
    function active() { return !!(state.job && (state.job.status === 'queued' || state.job.status === 'running')); }
    function hasJob() { return !!(state.job && state.job.id); }
    async function rpc(client, name, body) {
      try { return (await client.rest('POST', 'rpc/' + name, { body: body || {} })).data; }
      catch (e) {      // migration 50 pas encore exécutée : ancienne fonction sans p_franchise_id (une seule franchise par compte)
        if (!(body && 'p_franchise_id' in body) || !(e.code === 'PGRST202' || /p_franchise_id|Could not find the function/i.test(e.message || ''))) throw e;
        var b = Object.assign({}, body); delete b.p_franchise_id; return (await client.rest('POST', 'rpc/' + name, { body: b })).data;
      }
    }

    async function poll(client) {
      try { state.job = await rpc(client, 'hr_status', { p_franchise_id: client.franchiseId() }); } catch (e) { say('bad', 'sb.failed', [e.message]); }
      return state.job;
    }
    async function loadLeague(client) {
      try { var rows = await client.select('league_format', 'select=team_code,season_from,season_to,name_en,name_fr,conference,division&order=season_from,team_code'); if (rows && rows.length) DATA.league = rows; } catch (e) { /* table absente (migration 37 non exécutée) : le format intégré à la page sert */ }
    }
    async function refreshFranchise(client) {
      await loadLeague(client);
      // franchise active seulement ; juste après une création (aucune active), la franchise créée devient la franchise active
      var known = {}; (DATA.franchiseIds || []).forEach(function (id) { known[id] = 1; });
      var all = await client.select('franchise', 'select=*&order=id'), fid = client.franchiseId();
      if (fid == null) { var created = all.filter(function (x) { return !known[x.id]; }); if (created.length === 1) { fid = created[0].id; client.setFranchise(fid); if (store) store.set('ft_franchise', String(fid)); } }
      DATA.franchiseIds = all.map(function (x) { return x.id; });
      var f = all.filter(function (x) { return x.id === fid; })[0];
      if (f) { DATA.franchise = { id: f.id, name: f.name, code: f.abbreviation, colors: [f.color_primary, f.color_secondary], first: f.first_season_start_year, current: f.current_season_start_year, locale: f.ui_locale, games: f.games_per_season || 82 }; DATA.hasFranchise = true; state.first = f.first_season_start_year; state.games = f.games_per_season || 82; }
    }
    // Crée la franchise si besoin, puis lance l'importation (la base fait le reste toute seule)
    // ---- format de la ligue selon l'année de début (2014-15 et après) ----
    var DIVS = ['ATL', 'MET', 'CEN', 'PAC'];
    function curSeason() { var d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; }     // la saison commence en octobre : de juillet à juin
    function leagueOn() { return !!(DATA.league && DATA.league.length); }
    function leagueRows(season) { return (DATA.league || []).filter(function (r) { return r.season_from <= season && (r.season_to == null || r.season_to >= season); }); }
    function teamName(code, row) { var tm = (DATA.teams || []).filter(function (x) { return x.code === code; })[0] || {}; return state.lang === 'fr' ? ((row && row.name_fr) || tm.fr || (row && row.name_en) || tm.en || code) : ((row && row.name_en) || tm.en || code); }
    function seasonChoices() { var out = [], y = curSeason(); for (; y >= 2014; y--) out.push(y); return out; }
    function yearOk() { var y = state.first; if (DATA.hasFranchise && DATA.franchise) return y >= 1917 && y <= DATA.franchise.first; return leagueOn() ? y >= 2014 && y <= curSeason() : y >= 1917 && y <= 2100; }
    function sl(y) { return y + '-' + String((y + 1) % 100).padStart(2, '0'); }
    // ---- ligue personnalisée : équipes ajoutées ou remplacées, historique rattaché, divisions ----
    var CODE_RE = /^[A-Z]{3}$/, HEX_RE = /^#[0-9A-Fa-f]{6}$/;
    function allCodes() { return (DATA.teams || []).map(function (x) { return x.code; }); }
    function teamRec(code) { return (DATA.teams || []).filter(function (x) { return x.code === code; })[0]; }
    function replacedCodes() { return state.custom.filter(function (c) { return c.mode === 'replace'; }).map(function (c) { return c.replaces; }); }
    function customByCode(code) { return state.custom.filter(function (c) { return c.code === code; })[0]; }
    function baseDivision(code, season) { var c = customByCode(code); if (c) return c.division; var r = leagueRows(season).filter(function (x) { return x.team_code === code; })[0]; return r ? r.division : null; }
    function confOf(div) { return div === 'ATL' || div === 'MET' ? 'EAST' : 'WEST'; }
    // équipes de la ligue pour la saison : équipes de la LNH (moins les remplacées) + équipes personnalisées, divisions modifiées incluses
    function leagueTeams(season) {
      var rep = replacedCodes(), std = leagueRows(season).filter(function (r) { return rep.indexOf(r.team_code) < 0; }).map(function (r) { var d = state.divs[r.team_code] || r.division; return { code: r.team_code, name: teamName(r.team_code, r), conference: confOf(d), division: d, custom: false }; });
      var cus = state.custom.map(function (c) { var d = state.divs[c.code] || c.division; return { code: c.code, name: state.lang === 'fr' ? (c.name_fr || c.name_en) : (c.name_en || c.name_fr), conference: confOf(d), division: d, custom: true, logo: c.logo || '' }; });
      return std.concat(cus);
    }
    function inLeague(code, season) { if (customByCode(code)) return true; if (replacedCodes().indexOf(code) >= 0) return false; return !leagueOn() || leagueRows(season).some(function (r) { return r.team_code === code; }); }
    // franchises qui ont quitté la ligue cette année-là (leur historique peut être rattaché à une nouvelle équipe)
    function defunctFranchises(season) {
      var live = {}; leagueRows(season).forEach(function (r) { if (replacedCodes().indexOf(r.team_code) < 0) { var t = teamRec(r.team_code); live[(t && t.fc) || r.team_code] = 1; } });
      return (DATA.teams || []).filter(function (t) { return t.fc && t.fc === t.code && t.active === 0 && !live[t.code]; }).map(function (t) { return { code: t.code, name: state.lang === 'fr' ? t.fr : t.en }; });
    }
    function divCounts(season) { var o = { ATL: 0, MET: 0, CEN: 0, PAC: 0 }; leagueTeams(season).forEach(function (x) { o[x.division]++; }); return o; }
    function newForm() { return { mode: 'add', replaces: '', history: 'none', franchise: '', name_fr: '', name_en: '', city_fr: '', city_en: '', code: '', color_1: '#1f4e9c', color_2: '#c8102e', color_3: '', logo: '', division: 'CEN', mine: false, err: null }; }
    function openForm() { state.form = newForm(); state.showLeague = true; }
    function setForm(k, v) {
      var f = state.form; if (!f) return; f[k] = k === 'code' ? String(v).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : v; f.err = null;
      if (k === 'mode' && v === 'add' && f.history === 'replaced') f.history = 'none';
      if ((k === 'replaces' || k === 'mode') && f.mode === 'replace' && f.replaces) { var d = baseDivision(f.replaces, state.first); if (d) f.division = d; }
    }
    function validateForm(f) {
      var code = String(f.code || '').toUpperCase();
      if (!CODE_RE.test(code)) return 'setup.cu_err_code';
      if (allCodes().indexOf(code) >= 0 || customByCode(code)) return 'setup.cu_err_code_used';
      if (!String(f.name_fr || '').trim() && !String(f.name_en || '').trim()) return 'setup.cu_err_name';
      if (!HEX_RE.test(f.color_1 || '') || !HEX_RE.test(f.color_2 || '') || (f.color_3 && !HEX_RE.test(f.color_3))) return 'setup.cu_err_color';
      if (f.mode === 'replace') { if (!f.replaces || replacedCodes().indexOf(f.replaces) >= 0 || !leagueRows(state.first).some(function (r) { return r.team_code === f.replaces; })) return 'setup.cu_err_replaces'; }
      if (f.history === 'replaced' && f.mode !== 'replace') return 'setup.cu_err_hist_replaced';
      if (f.history === 'franchise' && !defunctFranchises(state.first).some(function (x) { return x.code === f.franchise; })) return 'setup.cu_err_hist_franchise';
      if (DIVS.indexOf(f.division) < 0) return 'setup.cu_err_division';
      if ((f.logo || '').length > 200000) return 'setup.cu_err_logo';
      return null;
    }
    function setFormLogo(dataUrl) { var f = state.form; if (!f) return false; if (dataUrl && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(dataUrl)) { f.err = 'setup.cu_err_logo'; return false; } if ((dataUrl || '').length > 200000) { f.err = 'setup.cu_err_logo'; return false; } f.logo = dataUrl || ''; f.err = null; return true; }
    function saveForm() {
      var f = state.form; if (!f) return false; var err = validateForm(f); if (err) { f.err = err; return false; }
      var code = f.code.toUpperCase(), nf = String(f.name_fr || '').trim(), ne = String(f.name_en || '').trim();
      state.custom.push({ code: code, name_fr: nf || ne, name_en: ne || nf, city_fr: String(f.city_fr || '').trim() || String(f.city_en || '').trim(), city_en: String(f.city_en || '').trim() || String(f.city_fr || '').trim(),
        color_1: f.color_1, color_2: f.color_2, color_3: f.color_3 || '', logo: f.logo || '', mode: f.mode, replaces: f.mode === 'replace' ? f.replaces : '', history: f.history === 'franchise' ? f.franchise : f.history, division: f.division });
      if (f.mine) { state.team = code; state.dropped = null; }
      state.form = null; return true;
    }
    function removeCustom(code) { state.custom = state.custom.filter(function (c) { return c.code !== code; }); delete state.divs[code]; if (state.team === code) state.team = ''; }
    function setDivision(code, div) { if (DIVS.indexOf(div) < 0) return; if (div === baseDivision(code, state.first)) delete state.divs[code]; else state.divs[code] = div; }
    function resetDivisions() { state.divs = {}; }
    function hasHistory() { var c = customByCode(state.team); return !c || c.history !== 'none'; }
    function payload() {
      var p = { p_team: state.team, p_first_season: state.first, p_games: state.games };
      if (state.custom.length) p.p_custom = state.custom.map(function (c) { return { code: c.code, name_en: c.name_en, name_fr: c.name_fr, city_en: c.city_en, city_fr: c.city_fr, color_1: c.color_1, color_2: c.color_2, color_3: c.color_3, logo: c.logo, mode: c.mode, replaces: c.replaces || null, history: c.history, division: c.division }; });
      var ov = {}; Object.keys(state.divs).forEach(function (code) { if (state.divs[code] !== baseDivision(code, state.first)) ov[code] = state.divs[code]; }); if (Object.keys(ov).length) p.p_divisions = ov;
      return p;
    }
    // Aperçu : l'en-tête prend les couleurs (et le logo) de l'équipe choisie, y compris une équipe personnalisée, avant même la création
    // équipes proposées dans le menu (avec saisie au clavier) : celles de la ligue de l'année choisie, équipes personnalisées comprises
    function teamChoices() { return leagueOn() ? leagueTeams(state.first).map(function (x) { return { code: x.code, fr: x.name, en: x.name }; }) : DATA.teams.filter(function (x) { return x.active !== 0; }).map(function (x) { return { code: x.code, fr: x.fr, en: x.en }; }); }
    function preview() {
      if (DATA.hasFranchise || !state.team) return null;
      var c = customByCode(state.team), tm = teamRec(state.team);
      if (c) return { colors: [c.color_1, c.color_2], team: c.code, logo: c.logo || '' };
      return tm && HEX_RE.test(tm.c1 || '') ? { colors: [tm.c1, HEX_RE.test(tm.c2 || '') ? tm.c2 : tm.c1], team: tm.code, logo: '' } : null;
    }
    function confCounts() { var o = { EAST: 0, WEST: 0 }; leagueTeams(state.first).forEach(function (x) { o[x.conference]++; }); return o; }
    function lotterySize() { return leagueTeams(state.first).length >= 32 ? 16 : 15; }
    // 16 équipes aux séries : 8 par conférence, donc au moins 8 équipes dans chaque conférence
    function conferencesOk() { var c = confCounts(); return c.EAST >= 8 && c.WEST >= 8; }
    function leagueSizeOk() { if (!leagueOn()) return true; var n = leagueTeams(state.first).length; return n >= 16 && n <= 40 && conferencesOk(); }
    function resetLeague() { state.custom = []; state.divs = {}; state.form = null; }

    function modeText(c) { return t(c.mode === 'replace' ? 'setup.cu_mode_replace_short' : 'setup.cu_mode_add_short') + (c.mode === 'replace' ? ' ' + teamName(c.replaces) : ''); }
    function histText(c) { if (c.history === 'none') return t('setup.cu_hist_none_short'); if (c.history === 'replaced') return fmt('setup.cu_hist_replaced_short', [teamName(c.replaces)]); return fmt('setup.cu_hist_franchise_short', [teamName(c.history)]); }
    function formHTML() {
      var f = state.form, std = leagueRows(state.first).filter(function (r) { return replacedCodes().indexOf(r.team_code) < 0; }).map(function (r) { return { code: r.team_code, name: teamName(r.team_code, r) }; }).sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); }), def = defunctFranchises(state.first);
      var inp = function (k, lbl, extra) { return '<label class="fld">' + esc(t(lbl)) + '<input data-cf="' + k + '" value="' + esc(f[k]) + '" autocomplete="off"' + (extra || '') + '></label>'; };
      var col = function (k, lbl) { return '<label class="fld col">' + esc(t(lbl)) + '<span class="colrow"><input type="color" data-cf="' + k + '" value="' + esc(HEX_RE.test(f[k]) ? f[k] : '#000000') + '"><input data-cf="' + k + '" value="' + esc(f[k]) + '" maxlength="7" aria-label="' + esc(t(lbl)) + '"></span></label>'; };
      var h = '<div class="cust-form"><h4>' + esc(t('setup.cu_title')) + '</h4>';
      h += '<fieldset><legend>' + esc(t('setup.cu_q1')) + '</legend><label><input type="radio" name="cf-mode" data-cf="mode" value="add"' + (f.mode === 'add' ? ' checked' : '') + '> ' + esc(t('setup.cu_mode_add')) + '</label> <label><input type="radio" name="cf-mode" data-cf="mode" value="replace"' + (f.mode === 'replace' ? ' checked' : '') + '> ' + esc(t('setup.cu_mode_replace')) + '</label>';
      if (f.mode === 'replace') h += '<label class="fld">' + esc(t('setup.cu_replaces')) + '<select data-cf="replaces"><option value="">' + esc(t('setup.team_ph')) + '</option>' + std.map(function (x) { return '<option value="' + esc(x.code) + '"' + (f.replaces === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>';
      h += '</fieldset><fieldset><legend>' + esc(t('setup.cu_q2')) + '</legend><label><input type="radio" name="cf-hist" data-cf="history" value="none"' + (f.history === 'none' ? ' checked' : '') + '> ' + esc(t('setup.cu_hist_none')) + '</label>' +
        (f.mode === 'replace' ? ' <label><input type="radio" name="cf-hist" data-cf="history" value="replaced"' + (f.history === 'replaced' ? ' checked' : '') + '> ' + esc(f.replaces ? fmt('setup.cu_hist_replaced', [teamName(f.replaces)]) : t('setup.cu_hist_replaced_any')) + '</label>' : '') +
        (def.length ? ' <label><input type="radio" name="cf-hist" data-cf="history" value="franchise"' + (f.history === 'franchise' ? ' checked' : '') + '> ' + esc(t('setup.cu_hist_franchise')) + '</label>' : '<p class="note muted">' + esc(t('setup.cu_hist_no_defunct')) + '</p>');
      if (f.history === 'franchise') h += '<label class="fld">' + esc(t('setup.cu_franchise')) + '<select data-cf="franchise"><option value="">' + esc(t('setup.team_ph')) + '</option>' + def.map(function (x) { return '<option value="' + esc(x.code) + '"' + (f.franchise === x.code ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>';
      h += '<p class="note muted">' + esc(t('setup.cu_hist_note')) + '</p></fieldset>';
      h += '<div class="cust-grid">' + inp('name_fr', 'setup.cu_name_fr') + inp('name_en', 'setup.cu_name_en') + inp('city_fr', 'setup.cu_city_fr') + inp('city_en', 'setup.cu_city_en') + inp('code', 'setup.cu_code', ' maxlength="3" style="text-transform:uppercase"') + col('color_1', 'setup.cu_color1') + col('color_2', 'setup.cu_color2') + col('color_3', 'setup.cu_color3') + '</div>';
      h += '<p class="note muted">' + esc(t('setup.cu_names_note')) + '</p>';
      h += '<div class="cust-grid"><label class="fld">' + esc(t('setup.cu_logo')) + '<input type="file" id="cust-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>' + (f.logo ? '<span class="logo-prev"><img src="' + esc(f.logo) + '" alt=""></span>' : '') +
        '<label class="fld">' + esc(t('setup.cu_division')) + '<select data-cf="division">' + DIVS.map(function (d) { return '<option value="' + d + '"' + (f.division === d ? ' selected' : '') + '>' + esc(t('setup.div_' + d)) + '</option>'; }).join('') + '</select></label></div>';
      h += '<label class="chk"><input type="checkbox" data-cf="mine"' + (f.mine ? ' checked' : '') + '> ' + esc(t('setup.cu_mine')) + '</label>';
      if (f.err) h += '<p class="bad">' + esc(t(f.err)) + '</p>';
      return h + '<div class="acts left"><button class="btn" data-setup="cust-save">' + esc(t('setup.cu_save')) + '</button><button class="btn ghost" data-setup="cust-cancel">' + esc(t('setup.cu_cancel')) + '</button></div></div>';
    }
    function divisionsHTML() {
      var lt = leagueTeams(state.first), counts = divCounts(state.first), h = '<h4>' + esc(t('setup.cu_divs_title')) + '</h4><p class="note muted">' + esc(t('setup.cu_divs_note')) + '</p><div class="divs">';
      DIVS.forEach(function (d) {
        var g = lt.filter(function (x) { return x.division === d; }).sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); });
        h += '<div class="div"><h5>' + esc(t('setup.div_' + d)) + ' <span class="cnt">' + counts[d] + '</span></h5>' + g.map(function (x) { return '<label class="dv' + (x.custom ? ' cust' : '') + (state.divs[x.code] ? ' moved' : '') + '"><span>' + esc(x.name) + '</span><select data-div="' + esc(x.code) + '" aria-label="' + esc(x.name) + '">' + DIVS.map(function (o) { return '<option value="' + o + '"' + (o === d ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>'; }).join('') + '</div>';
      });
      return h + '</div>' + (Object.keys(state.divs).length ? '<div class="acts left"><button class="btn ghost" data-setup="divs-reset">' + esc(t('setup.cu_divs_reset')) + '</button></div>' : '');
    }
    function leagueCardHTML() {
      var lt = leagueTeams(state.first), h = '<section class="card"><h3>' + esc(t('setup.league')) + '</h3><p class="muted">' + esc(fmt('setup.league_summary', [lt.length, state.custom.length])) + '<br>' + esc(fmt('setup.league_format', [lotterySize(), confCounts().EAST, confCounts().WEST])) + '</p>' + (conferencesOk() ? '' : '<p class="bad">' + esc(fmt('setup.cu_err_conf', [confCounts().EAST, confCounts().WEST])) + '</p>') + '<div class="acts left"><button class="btn ghost" data-setup="league-toggle">' + esc(t(state.showLeague ? 'setup.league_hide' : 'setup.league_show')) + '</button></div>';
      if (!state.showLeague) return h + '</section>';
      h += '<h4>' + esc(t('setup.cu_list')) + '</h4>' + (state.custom.length ? '<ul class="cust">' + state.custom.map(function (c) { return '<li>' + (c.logo ? '<img class="tlogo" src="' + esc(c.logo) + '" alt="">' : '<span class="sw" style="background:' + esc(c.color_1) + '"></span>') + '<b>' + esc(state.lang === 'fr' ? c.name_fr : c.name_en) + '</b> (' + esc(c.code) + ') · ' + esc(modeText(c)) + ' · ' + esc(histText(c)) + (state.team === c.code ? ' · <b>' + esc(t('setup.cu_is_mine')) + '</b>' : '') + ' <button class="x" data-setup="cust-del" data-code="' + esc(c.code) + '" aria-label="' + esc(t('ev.remove')) + '">×</button></li>'; }).join('') + '</ul>' : '<p class="muted">' + esc(t('setup.cu_none')) + '</p>');
      h += state.form ? formHTML() : '<div class="acts left"><button class="btn" data-setup="cust-open">' + esc(t('setup.cu_add')) + '</button></div>';
      return h + divisionsHTML() + '</section>';
    }

    async function start(client) {
      sync.busy = true; sync.msg = '';
      try {
        if (!DATA.hasFranchise && !state.team) { say('warn', 'setup.pick_team'); return false; }
        if (!DATA.hasFranchise && leagueOn() && state.team && !inLeague(state.team, state.first)) { say('warn', 'setup.team_dropped', [teamName(state.team), sl(state.first)]); return false; }
        if (!DATA.hasFranchise && !gamesOk()) { say('warn', 'setup.games_invalid'); return false; }
        if (!yearOk()) { say('warn', 'setup.year_invalid', [DATA.hasFranchise && DATA.franchise ? DATA.franchise.first : 2100]); return false; }
        var first = state.first; state.noHistory = !DATA.hasFranchise && !hasHistory();
        if (!DATA.hasFranchise) {
          if (!leagueSizeOk()) { var cc = confCounts(); if (leagueOn() && (cc.EAST < 8 || cc.WEST < 8)) say('warn', 'setup.cu_err_conf', [cc.EAST, cc.WEST]); else say('warn', 'setup.cu_err_size'); return false; }
          await rpc(client, 'create_franchise', payload());
          await refreshFranchise(client); state.first = first;
          if (state.favLang !== DATA.franchise.locale) await saveLang(client);
        }
        if (state.noHistory) { say('ok', 'setup.no_history_done'); return true; }
        await rpc(client, 'start_hr_import', { p_team: DATA.franchise.code, p_first_season: first, p_replace: true, p_franchise_id: DATA.franchise.id });
        await poll(client); say('ok', 'setup.started'); return true;
      } catch (e) { say('bad', 'sb.failed', [e.message]); return false; } finally { sync.busy = false; }
    }
    async function resume(client) {
      sync.busy = true; sync.msg = '';
      try { await rpc(client, 'resume_hr_import', { p_franchise_id: client.franchiseId() }); await poll(client); say('ok', 'setup.started'); return true; }
      catch (e) { say('bad', 'sb.failed', [e.message]); return false; } finally { sync.busy = false; }
    }
    async function doPull(client) { try { await refreshFranchise(client); await poll(client); say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } }
    function doLogout(client) { client.signOut(); sync.user = null; sync.msg = ''; state.job = null; }
    async function doLogin(client, email, pw) { try { await client.signIn(email, pw); var u = client.user(); sync.user = u ? (u.email || u.id) : null; await loadLeague(client); say('ok', 'sb.connected'); } catch (e) { say('bad', 'sb.failed', [e.message]); } return !!sync.user; }

    function statusHTML() {
      var j = state.job, c = counts(), pct = c.total ? Math.round(100 * c.done / c.total) : 0, h = '';
      if (!hasJob()) return '<p class="muted">' + esc(t('setup.st_none')) + '</p>';
      var line = { queued: fmt('setup.st_queued'), running: fmt('setup.st_running', [c.done, c.total]), done: fmt('setup.st_done'), failed: fmt('setup.st_failed'), blocked: fmt('setup.st_blocked') }[j.status] || j.status;
      var cls = j.status === 'done' ? 'ok' : (j.status === 'failed' || j.status === 'blocked' ? 'bad' : 'muted');
      h += '<p class="' + cls + '">' + esc(line) + '</p>' + (j.team ? '<p class="note muted">' + esc(fmt('setup.job_info', [j.team, j.first_season, String((j.first_season + 1) % 100).padStart(2, '0')])) + '</p>' : '');
      if (j.status === 'running' || j.status === 'queued') h += '<div class="bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div><p class="note muted">' + esc(t('setup.keep_open')) + '</p>';
      if (j.message && j.status !== 'running' && j.status !== 'queued' && j.status !== 'blocked') h += '<p class="note muted">' + esc(j.message) + '</p>';
      if (j.failures && j.failures.length) h += failuresHTML(j.failures);
      return h;
    }
    function failHint(f) { var c = f.http_status; if (c === 403 || c === 429 || c === 503 || /bloqu/.test(f.error || '')) return 'setup.fail_blocked'; if (/aucune r|timeout|délai/i.test(f.error || '') || c === 0) return 'setup.fail_timeout'; return 'setup.fail_other'; }
    function failuresHTML(list) {
      return '<div class="fails"><h4>' + esc(t('setup.failures_title')) + '</h4><ul>' + list.map(function (f) { return '<li><code>' + esc(String(f.url || '').replace('https://www.hockey-reference.com', '')) + '</code> · ' + esc(f.http_status ? 'HTTP ' + f.http_status : '') + (f.error ? ' · ' + esc(f.error) : '') + '<br><span class="muted">' + esc(t(failHint(f))) + '</span></li>'; }).join('') + '</ul></div>';
    }
    function guideHTML() {
      var st = state.job && state.job.status, hot = function (k) { return st === k ? ' class="hot"' : ''; };
      return '<section class="card guide-card"><h3>' + esc(t('setup.guide_title')) + '</h3><ol class="steps">' + ['setup.guide_1', 'setup.guide_2', 'setup.guide_3'].map(function (k, i) { return '<li><b>' + (i + 1) + '</b><span>' + esc(t(k)) + '</span></li>'; }).join('') + '</ol>' +
        '<h4>' + esc(t('setup.guide_err_title')) + '</h4><ul class="errs"><li' + hot('blocked') + '>' + esc(t('setup.guide_err_blocked')) + '</li><li' + hot('failed') + '>' + esc(t('setup.guide_err_failed')) + '</li><li>' + esc(t('setup.guide_err_stuck')) + '</li><li>' + esc(t('setup.guide_err_names')) + '</li></ul></section>';
    }

    function view() {
      var f = DATA.franchise, h = '<header class="top"><div class="brand"><span class="crest"></span><div><div class="fr">' + esc(f ? f.name : 'Franchise Tracker') + '</div><div class="sub">' + esc(t('setup.title')) + '</div></div></div>' +
        '<div class="ctl"><a class="navlink" href="history_edit.html">' + esc(t('nav.hist')) + '</a><div class="seg" role="group"><button data-lang="fr" aria-pressed="' + (state.lang === 'fr') + '">FR</button><button data-lang="en" aria-pressed="' + (state.lang === 'en') + '">EN</button></div></div></header>';
      h += '<main class="entry">' + FTP.panel(t, esc, sync, { noPush: true });
      var locked = !!(DATA.hasFranchise && f), cur = locked ? f.code : state.team, list = DATA.teams.filter(function (x) { return x.active !== 0; });
      if (locked && !list.some(function (x) { return x.code === f.code; })) list.push({ code: f.code, en: f.name, fr: f.name });
      h += '<div class="setup-grid' + (!DATA.hasFranchise && leagueOn() ? '' : ' no-league') + '"><div class="ar a-fr"><section class="card"><h3>' + esc(t('setup.franchise')) + '</h3><p class="muted">' + esc(t('setup.intro')) + '</p>';
      if (locked) h += '<p><strong>' + esc(fmt('setup.exists', [f.name, f.first, String((f.first + 1) % 100).padStart(2, '0')])) + '</strong></p>';
      var lt = !locked && leagueOn() ? leagueTeams(state.first) : null, firstSel = '<label class="fld">' + esc(t(locked ? 'setup.load_before' : 'setup.first')) + (locked || !leagueOn() ? '<input id="setup-first" type="number" min="1917"' + (locked ? ' max="' + f.first + '"' : '') + ' value="' + state.first + '">' : '<select id="setup-first">' + seasonChoices().map(function (y) { return '<option value="' + y + '"' + (y === state.first ? ' selected' : '') + '>' + esc(sl(y)) + '</option>'; }).join('') + '</select>') + '</label>';
      var teamList = lt ? lt.map(function (x) { return { code: x.code, name: x.name }; }) : list.map(function (x) { return { code: x.code, name: state.lang === 'fr' ? x.fr : x.en }; }), curTeam = teamList.filter(function (x) { return x.code === cur; })[0];
      var teamOpts = TC.datalist('setup-teams', teamList.slice().sort(function (a, b) { return a.name.localeCompare(b.name, state.lang); }), function (x) { return x.name; }, esc);
      h += (locked ? '' : firstSel + (lt ? '<p class="note muted">' + esc(fmt('setup.league_info', [lt.length, sl(state.first)])) + '</p>' : '')) +
        '<label class="fld">' + esc(t('setup.team')) + '<input id="setup-team" class="tcombo" list="setup-teams" autocomplete="off"' + (locked ? ' disabled' : '') + ' value="' + esc(curTeam ? curTeam.name : '') + '" placeholder="' + esc(t('setup.team_ph')) + '">' + teamOpts + '</label>' +
        (state.dropped ? '<p class="note bad">' + esc(fmt('setup.team_dropped', [state.dropped, sl(state.first)])) + '</p>' : '') +
        (locked ? '<p class="note muted">' + esc(t('setup.team_locked')) + '</p>' : '') +
        (locked ? firstSel : '') +
        (locked ? '<p class="note muted">' + esc(fmt('setup.year_note', [f.first])) + '</p>' : '') +
        '<label class="fld">' + esc(t('setup.games')) + '<input id="setup-games" type="number" min="20" max="84" step="2" value="' + state.games + '"></label><p class="note muted">' + esc(t('setup.games_note')) + '</p>' +
        '<label class="fld">' + esc(t('setup.language')) + '<select id="setup-lang"><option value="fr"' + (state.favLang === 'fr' ? ' selected' : '') + '>Français</option><option value="en"' + (state.favLang === 'en' ? ' selected' : '') + '>English</option></select></label><p class="note muted">' + esc(t('setup.language_note')) + '</p></section></div>';
      if (!DATA.hasFranchise && leagueOn()) h += '<div class="ar a-lg">' + leagueCardHTML() + '</div>';
      h += '<div class="ar a-im"><section class="card compact"><h3>' + esc(t('setup.import')) + '</h3>' + statusHTML() + '<div class="acts left">';
      var st = state.job && state.job.status;
      if (!DATA.hasFranchise && state.team && !hasHistory()) h += '<p class="note muted">' + esc(t('setup.cu_no_history_note')) + '</p>';
      if (st === 'blocked' || st === 'failed') h += '<button class="btn" data-setup="resume"' + (sync.busy ? ' disabled' : '') + '>' + esc(t('setup.resume')) + '</button>';
      if (!active()) h += '<button class="btn' + (st === 'blocked' || st === 'failed' ? ' ghost' : '') + '" data-setup="start"' + (sync.busy || !sync.user ? ' disabled' : '') + '>' + esc(t(!DATA.hasFranchise ? 'setup.create_start' : (hasJob() && st !== 'none' ? 'setup.restart' : 'setup.start'))) + '</button>';
      h += '</div>' + (hasJob() && DATA.hasFranchise && !active() ? '<p class="note muted">' + esc(t('setup.replace_note')) + '</p>' : '') +
        (hasJob() && st === 'done' ? '<p><a href="history_edit.html">' + esc(t('setup.edit_link')) + '</a></p>' : '') + '</section></div><div class="ar a-gd">' + guideHTML() + '</div></div></main>';
      return h;
    }
    return { teamChoices: teamChoices, confCounts: confCounts, lotterySize: lotterySize, conferencesOk: conferencesOk, leagueSizeOk: leagueSizeOk, preview: preview, openForm: openForm, setForm: setForm, setFormLogo: setFormLogo, saveForm: saveForm, validateForm: validateForm, removeCustom: removeCustom, setDivision: setDivision, resetDivisions: resetDivisions, defunctFranchises: defunctFranchises, divCounts: divCounts, payload: payload, hasHistory: hasHistory, leagueTeams: leagueTeams, inLeague: inLeague, seasonChoices: seasonChoices, loadLeague: loadLeague, guideHTML: guideHTML, saveGames: saveGames, gamesOk: gamesOk, saveLang: saveLang, sync: sync, state: state, view: view, t: t, fmt: fmt, setField: setField, poll: poll, start: start, resume: resume, doPull: doPull, doLogin: doLogin, doLogout: doLogout, active: active, counts: counts };
  }

  var api = { makeSetupApp: makeSetupApp, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTSETUP = api;

  if (typeof document !== 'undefined') {
    var DATA0 = JSON.parse(document.getElementById('data').textContent), ls = { get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { window.localStorage.setItem(k, v); }, remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
    var rootEl = document.getElementById('app'), CFG0 = JSON.parse(document.getElementById('cfg').textContent);
    var host = FTLM.run({ DATA0: DATA0, store: ls, cfg: CFG0, rootEl: rootEl, makeApp: function (d, st) { return makeSetupApp(d, st || ls); }, assemble: FTLIVE.assembleSetup });
    rootEl.addEventListener('change', function (e) {
      var el = e.target, a = host.app(); if (!a) return;
      if (el.dataset && el.dataset.cf) { var cf = el.dataset.cf, text = el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'color'; a.setForm(cf, el.type === 'checkbox' ? el.checked : el.value); if (!text) host.draw(); return; }   // champs de texte : pas de redessin (il ferait perdre le curseur)
      if (el.dataset && el.dataset.div) { a.setDivision(el.dataset.div, el.value); host.draw(); return; }
      if (el.id === 'cust-logo') { readLogo(el.files && el.files[0], a); return; }
      if (el.id === 'setup-team') { var tl = a.teamChoices(), code = TC.resolve(el.value, tl); a.setField('team', code === null ? (a.state.team || '') : code); host.draw(); } else if (el.id === 'setup-first') { a.setField('first', el.value); host.draw(); }   // l'année change les équipes proposées : on redessine
      else if (el.id === 'setup-games') { a.setField('games', el.value); a.saveGames(host.client).then(function () { host.draw(); }); }
      else if (el.id === 'setup-lang') { a.setField('lang', el.value); host.draw(); a.saveLang(host.client).then(function () { host.draw(); }); }
    });
    // logo : image réduite à 256 px au plus (PNG), stockée avec l'équipe
    function readLogo(file, a) {
      if (!file) return; var fr = new FileReader();
      fr.onload = function () { var img = new Image(); img.onload = function () { var k = Math.min(1, 256 / Math.max(img.width || 256, img.height || 256)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round((img.width || 256) * k)); cv.height = Math.max(1, Math.round((img.height || 256) * k)); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); a.setFormLogo(cv.toDataURL('image/png')); host.draw(); };
        img.onerror = function () { a.setFormLogo('data:text/plain;base64,'); host.draw(); }; img.src = fr.result; };
      fr.readAsDataURL(file);
    }
    rootEl.addEventListener('input', function (e) { var el = e.target, a = host.app(); if (a && el.dataset && el.dataset.cf && el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'SELECT' && el.type !== 'color') a.setForm(el.dataset.cf, el.value); });
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null, a = host.app(); if (!b || !a) return;
      if (b.dataset.lang) { a.state.lang = b.dataset.lang; host.draw(); }
      else if (b.dataset.setup === 'league-toggle') { a.state.showLeague = !a.state.showLeague; host.draw(); }
      else if (b.dataset.setup === 'cust-open') { a.openForm(); host.draw(); }
      else if (b.dataset.setup === 'cust-cancel') { a.state.form = null; host.draw(); }
      else if (b.dataset.setup === 'cust-save') { a.saveForm(); host.draw(); }
      else if (b.dataset.setup === 'cust-del') { a.removeCustom(b.dataset.code); host.draw(); }
      else if (b.dataset.setup === 'divs-reset') { a.resetDivisions(); host.draw(); }
      else if (b.dataset.setup === 'start') {
        if (DATA0 && a.state.job && a.state.job.id && !window.confirm(a.t('setup.confirm'))) return;
        a.sync.busy = true; host.draw(); a.start(host.client).then(function () { host.draw(); });
      } else if (b.dataset.setup === 'resume') { a.sync.busy = true; host.draw(); a.resume(host.client).then(function () { host.draw(); }); }
    });
    // suivi : on interroge la base toutes les 5 secondes tant que la page est ouverte et connectée
    setInterval(function () { var a = host.app(); if (a && host.client.signedIn() && !a.sync.busy && (a.active() || !a.state.job)) a.poll(host.client).then(function () { host.draw(); }); }, 5000);
    host.start();
    setTimeout(function () { var a = host.app(); if (a && host.client.signedIn()) a.poll(host.client).then(function () { host.draw(); }); }, 2500);
  }
})(typeof window !== 'undefined' ? window : this);
