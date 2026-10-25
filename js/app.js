/* app.js 
 * The glue: playback flow, one command dispatcher shared by voice + keyboard + buttons, event wiring.
 * Loaded LAST. If something doesn't work end-to-end, the bug is usually here or at a file boundary.
 * Depends on: every other file.
 */
(function () {
  const $ = CR.$, S = CR.state, U = CR.util, T = CR.text;
  const api = CR.api, sp = CR.speech, ui = CR.ui;
  const token = () => $('#token').value.trim();
  const BOT = /\[bot\]|dependabot|github-actions|renovate/i;

  /* ---------- loading data ---------- */
  function applyFilter() {
    S.items = S.all.filter(i =>
      (S.filter === 'all' || i.type === S.filter) &&
      !(S.hideBots && BOT.test(i.author))
    );
    S.idx = 0;
    ui.renderList(pickItem);
    ui.render();
  }
  function useItems(all, repo) {
    S.repo = repo; S.all = all; applyFilter();
    const c = all.filter(i => i.type === 'commit').length, p = all.length - c;
    ui.setStatus(`Loaded ${all.length} updates from ${repo}: ${c} commits, ${p} pull requests. Press Play, or Space.`);
    ui.focusPlayer();
  }
  async function loadFromForm(e) {
    e.preventDefault();
    const repo = U.parseRepo($('#repo').value);
    if (!repo) { ui.setStatus('Enter a repository like owner/name.', true); return; }
    try {
      ui.setStatus(`Loading ${repo}…`); sp.silence(); S.auto = false;
      const items = await api.loadRepo(repo, token());
      try { localStorage.setItem('cr_repo', repo); } catch (_) {}
      useItems(items, repo);
    } catch (err) { ui.setStatus(err.message, true); }
  }
  function loadDemo() {
    sp.silence(); S.auto = false;
    $('#repo').value = CR.DEMO_REPO;
    useItems(CR.demoItems(), CR.DEMO_REPO);
  }

  /* ---------- "what's new since I last listened" ---------- */
  function markSeen() {          // remember the newest item's date when a briefing finishes
    try { if (S.all[0]) localStorage.setItem('cr_seen_' + S.repo, S.all[0].date); } catch (_) {}
  }
  function whatsNew() {
    if (needItems()) return;
    let seen = ''; try { seen = localStorage.getItem('cr_seen_' + S.repo) || ''; } catch (_) {}
    if (!seen) { sp.speak('This is your first visit to this repository. Press play for the full briefing.'); return; }
    const fresh = S.all.filter(i => i.date > seen && !(S.hideBots && BOT.test(i.author)));
    if (!fresh.length) { sp.speak('Nothing new since you last listened.'); return; }
    S.items = fresh; S.idx = 0; S.auto = true;
    ui.renderList(pickItem); ui.render();
    sp.speak(`${fresh.length} new update${fresh.length > 1 ? 's' : ''} since you last listened.`, playCurrent);
  }

  /* ---------- playback ---------- */
  function needItems() {
    if (!S.items.length) { sp.speak(T.NOTHING_LOADED); ui.setStatus('Load a repository first.', true); return true; }
    return false;
  }
  function afterItem() {                       // runs when an item finishes being spoken
    if (!S.auto) return;
    if (S.idx < S.items.length - 1) { S.idx++; playCurrent(); }
    else { S.auto = false; markSeen(); ui.updatePlayBtn(); sp.speak(T.END); }
  }
  function playCurrent() {
    if (needItems()) return;
    ui.render(); sp.speak(T.spokenText(S.items[S.idx]), afterItem);
  }
  function pickItem(i) { S.idx = i; S.auto = false; playCurrent(); }
  function startBriefing() {
    if (needItems()) return;
    S.auto = true; S.idx = 0; ui.render();
    sp.speak(T.introText(), playCurrent);
  }
  function togglePlay() {
    if (needItems()) return;
    if (sp.isPaused()) { sp.resume(); return; }
    if (sp.isSpeaking() && S.auto) { sp.pause(); return; }
    if (S.idx === 0 && !S.auto) startBriefing(); else { S.auto = true; playCurrent(); }
  }
  function go(d) {
    if (needItems()) return;
    const n = S.idx + d;
    if (n < 0) { sp.speak(T.FIRST); return; }
    if (n >= S.items.length) { S.auto = false; sp.speak(T.LAST); return; }
    S.idx = n; playCurrent();
  }
  function jump(n) {
    if (needItems()) return;
    if (!(n >= 1 && n <= S.items.length)) { sp.speak(`There is no update ${n}.`); return; }
    S.idx = n - 1; playCurrent();
  }
  function stop() { S.auto = false; sp.silence(); ui.updatePlayBtn(); ui.setStatus('Stopped.'); }
  async function details() {
    if (needItems()) return;
    ui.showDetail('Loading details…');
    const t = await api.detailText(S.items[S.idx], S.repo, token());
    ui.showDetail(t); sp.speak(t, afterItem);
  }
  function openCurrent() {
    const it = S.items[S.idx]; if (!it) return;
    window.open(it.url, '_blank', 'noopener'); sp.speak('Opened in a new tab.');
  }
  function changeRate(delta) { ui.setRateLabel(sp.setRate(sp.getRate() + delta)); }
  function setFilter(f, say) {
    S.filter = f; $('#filter').value = f; applyFilter();
    if (say) sp.speak(`${say} ${S.items.length} updates.`);
  }

  /* ---------- one dispatcher for voice, keyboard and buttons ---------- */
  const FILTER_SAY = { commit: 'Showing commits only.', pr: 'Showing pull requests only.', all: 'Showing everything.' };
  function dispatch(cmd, arg) {
    switch (cmd) {
      case 'play': return startBriefing();
      case 'toggle': return togglePlay();
      case 'next': return go(1);
      case 'prev': return go(-1);
      case 'repeat': return playCurrent();
      case 'details': return details();
      case 'open': return openCurrent();
      case 'stop': return stop();
      case 'pause': if (sp.isSpeaking() && !sp.isPaused()) sp.pause(); return;
      case 'resume': if (sp.isPaused()) sp.resume(); else { S.auto = true; playCurrent(); } return;
      case 'jump': return jump(arg);
      case 'filter': return setFilter(arg, FILTER_SAY[arg]);
      case 'whatsnew': return whatsNew();
      case 'faster': changeRate(0.2); return sp.speak('Faster.');
      case 'slower': changeRate(-0.2); return sp.speak('Slower.');
      case 'help': return sp.speak(T.HELP);
      case 'mic': return sp.toggleMic();
    }
  }

  /* ---------- wiring ---------- */
  sp.hooks.onSpeaking = on => ui.setSpeaking(on);
  sp.hooks.onStatus = (msg, isErr) => ui.setStatus(msg, isErr);
  sp.hooks.onMic = on => ui.setMic(on);
  sp.hooks.onHeard = text => ui.setStatus(`Heard: "${text.trim()}"`);
  sp.hooks.onCommand = c => dispatch(c.cmd, c.arg);

  $('#loadForm').addEventListener('submit', loadFromForm);
  $('#demoBtn').addEventListener('click', loadDemo);
  $('#bPlay').addEventListener('click', () => dispatch('toggle'));
  $('#bPrev').addEventListener('click', () => dispatch('prev'));
  $('#bNext').addEventListener('click', () => dispatch('next'));
  $('#bRepeat').addEventListener('click', () => dispatch('repeat'));
  $('#bDetails').addEventListener('click', () => dispatch('details'));
  $('#bOpen').addEventListener('click', () => dispatch('open'));
  $('#bStop').addEventListener('click', () => dispatch('stop'));
  $('#bMic').addEventListener('click', () => dispatch('mic'));
  $('#filter').addEventListener('change', e => setFilter(e.target.value));
  $('#rate').addEventListener('input', e => ui.setRateLabel(sp.setRate(+e.target.value)));

  // Optional controls: only wired if Keerthana has added them to index.html
  const hb = $('#hideBots');
  if (hb) hb.addEventListener('change', e => { S.hideBots = e.target.checked; applyFilter(); });
  const wn = $('#bNew');
  if (wn) wn.addEventListener('click', () => dispatch('whatsnew'));

  const KEYS = {
    ' ': () => dispatch('toggle'),
    'n': () => dispatch('next'), 'arrowright': () => dispatch('next'),
    'p': () => dispatch('prev'), 'arrowleft': () => dispatch('prev'),
    'r': () => dispatch('repeat'), 'd': () => dispatch('details'), 'o': () => dispatch('open'),
    's': () => dispatch('stop'), 'm': () => dispatch('mic'), 'w': () => dispatch('whatsnew'),
    '+': () => changeRate(0.1), '=': () => changeRate(0.1), '-': () => changeRate(-0.1),
    '?': () => dispatch('help')
  };
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    if (e.key === ' ' && tag === 'BUTTON') return;      // let Space click a focused button
    const fn = KEYS[e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  /* ---------- init ---------- */
  sp.initVoices($('#voice'));
  ui.setRateLabel(sp.setRate(1));
  try { const r = localStorage.getItem('cr_repo'); if (r) $('#repo').value = r; } catch (_) {}
  if (!sp.supported.tts) ui.setStatus('This browser does not support speech synthesis. Try Chrome, Edge or Safari.', true);

  CR.dispatch = dispatch;   // handy in the browser console: CR.dispatch('next')
})();
