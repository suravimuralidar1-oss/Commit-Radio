/* speech.js
 * All Web Speech API access: text-to-speech (SpeechSynthesis) and voice commands (SpeechRecognition).
 * No app logic here. It speaks text, and turns spoken phrases into { cmd, arg } for app.js to dispatch.
 * Depends on: core.js (the CR namespace). Load it after core.js and before app.js.
 *
 * Public API (CR.speech):
 *   speak(text, onDone?)   speak text (replaces whatever is being spoken); onDone runs only when it
 *                          finishes naturally, never when it was interrupted or silenced
 *   silence()              stop everything immediately, no callbacks
 *   pause() / resume() / isPaused() / isSpeaking()
 *   setRate(r) -> number   clamped to 0.5..2, one decimal; getRate()
 *   initVoices(selectEl)   fill the <select id="voice"> and keep it in sync
 *   toggleMic() / isListening()
 *   supported              { tts: boolean, stt: boolean }
 *   parse(text)            -> { cmd, arg } | null   (exposed for testing in the console)
 *   hooks                  app.js assigns: onSpeaking(on), onStatus(msg, isErr), onMic(on),
 *                          onHeard(text), onCommand({ cmd, arg })
 *
 * Commands produced (all handled by dispatch() in app.js):
 *   play, next, prev, repeat, details, open, stop, pause, resume, faster, slower, help,
 *   whatsnew, jump (arg = number), filter (arg = 'commit' | 'pr' | 'all')
 */
(function () {
  const CR = (window.CR = window.CR || {});

  // Voice recognition language. en-IN suits Indian-accent English; use 'en-US' if that works better for you.
  const REC_LANG = 'en-IN';
  const MAX_CHUNK = 170;   // Chrome cuts off long utterances, so we speak sentence-sized pieces

  const synth = window.speechSynthesis;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = { tts: !!(synth && window.SpeechSynthesisUtterance), stt: !!SR };

  const hooks = {
    onSpeaking() {}, onStatus() {}, onMic() {}, onHeard() {}, onCommand() {}
  };

  /* =====================================================================
   * TEXT TO SPEECH
   * ===================================================================== */
  let token = 0;            // bumped on every speak()/silence() so stale callbacks ignore themselves
  let active = false;       // a speak() is in progress (stays true while paused)
  let paused = false;
  let rate = 1;
  let voice = null;
  let voices = [];
  let live = [];            // keep utterance objects referenced: Chrome can garbage-collect them mid-speech

  function setActive(on) {
    if (active === on) return;
    active = on;
    hooks.onSpeaking(on);
  }

  // Split into sentence-sized pieces (and break very long sentences at commas/spaces).
  function chunk(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return [];
    const out = [];
    (t.match(/.+?(?:[.!?]+(?=\s|$)|$)/g) || [t]).forEach(s => {
      s = s.trim();
      while (s.length > MAX_CHUNK) {
        let cut = s.lastIndexOf(',', MAX_CHUNK);
        if (cut < 40) cut = s.lastIndexOf(' ', MAX_CHUNK);
        if (cut < 1) cut = MAX_CHUNK;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  function speak(text, onDone) {
    if (!supported.tts) return;
    const my = ++token;
    synth.cancel();
    synth.resume();                 // a cancel while paused can leave the engine paused
    paused = false;
    const parts = chunk(text);
    if (!parts.length) {
      setActive(false);
      if (onDone) setTimeout(() => { if (my === token) onDone(); }, 0);
      return;
    }
    setActive(true);

    live = parts.map((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.rate = rate;
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onend = () => {
        if (my !== token || i !== parts.length - 1) return;   // interrupted, or not the last piece
        setActive(false);
        live = [];
        if (onDone) onDone();
      };
      u.onerror = e => {
        if (my !== token) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;   // normal when skipping
        setActive(false);
        hooks.onStatus(
          e.error === 'not-allowed'
            ? 'The browser blocked speech. Click or press a key on the page once, then try again.'
            : `Speech error: ${e.error}.`, true);
      };
      return u;
    });

    // Small delay after cancel(): Chrome sometimes drops a speak() issued in the same tick.
    setTimeout(() => { if (my === token) live.forEach(u => synth.speak(u)); }, 40);
  }

  function silence() {
    token++;
    if (supported.tts) { synth.cancel(); synth.resume(); }
    paused = false;
    live = [];
    setActive(false);
  }

  function pause() {
    if (!supported.tts || !active || paused) return;
    synth.pause();
    paused = true;
    hooks.onSpeaking(false);
    hooks.onStatus('Paused. Press Space or say resume.');
  }

  function resume() {
    if (!supported.tts || !paused) return;
    synth.resume();
    paused = false;
    hooks.onSpeaking(true);
  }

  function setRate(r) {
    r = Math.round(Math.min(2, Math.max(0.5, Number(r) || 1)) * 10) / 10;
    rate = r;                       // applies from the next sentence on
    return rate;
  }

  /* ---------- voice picker ---------- */
  const isEn = v => /^en/i.test(v.lang);
  function pickDefault() {
    return voices.find(v => /^en-IN/i.test(v.lang)) ||
           voices.find(v => isEn(v) && /natural|google|neural/i.test(v.name)) ||
           voices.find(isEn) || voices[0] || null;
  }
  function initVoices(sel) {
    if (!supported.tts || !sel) { if (sel) sel.disabled = true; return; }
    const fill = () => {
      const all = synth.getVoices();
      if (!all.length) return;      // Chrome loads voices asynchronously; voiceschanged fires later
      voices = all.slice().sort((a, b) => (isEn(b) - isEn(a)) || a.name.localeCompare(b.name));
      let saved = null; try { saved = localStorage.getItem('cr_voice'); } catch (_) {}
      const keep = voice && voices.find(v => v.name === voice.name);
      voice = keep || voices.find(v => v.name === saved) || pickDefault();
      sel.innerHTML = '';
      voices.forEach(v => {
        const o = document.createElement('option');
        o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
        sel.appendChild(o);
      });
      if (voice) sel.value = voice.name;
    };
    fill();
    synth.addEventListener('voiceschanged', fill);
    sel.addEventListener('change', () => {
      voice = voices.find(v => v.name === sel.value) || voice;
      try { localStorage.setItem('cr_voice', voice.name); } catch (_) {}
      speak('This is the new voice.');
    });
  }

  /* =====================================================================
   * VOICE COMMANDS
   * ===================================================================== */
  const PHRASES = {
    play:     ['play', 'start', 'begin', 'start over', 'start briefing', 'play briefing', 'start the briefing', 'play all'],
    resume:   ['resume', 'continue', 'keep going', 'go on', 'unpause'],
    pause:    ['pause', 'hold on', 'wait', 'hold'],
    next:     ['next', 'next one', 'next update', 'skip', 'skip it', 'forward', 'go forward'],
    prev:     ['previous', 'previous one', 'previous update', 'back', 'go back'],
    repeat:   ['repeat', 'repeat that', 'again', 'say again', 'say that again', 'one more time'],
    details:  ['details', 'more', 'more details', 'tell me more', 'read details', 'read more', 'show details', 'explain'],
    open:     ['open', 'open link', 'open the link', 'open it', 'open this', 'open github', 'open in github'],
    stop:     ['stop', 'quit', 'cancel', 'end', 'silence', 'be quiet'],
    faster:   ['faster', 'speed up', 'go faster', 'talk faster', 'speak faster'],
    slower:   ['slower', 'slow down', 'go slower', 'talk slower', 'speak slower'],
    help:     ['help', 'commands', 'what can i say', 'help me', 'options'],
    whatsnew: ['whats new', 'what is new', 'anything new', 'new updates', 'whats new since last time',
               'whats new since i last listened', 'catch me up', 'catch up']
  };
  const FILTERS = {
    commit: ['commits', 'commits only', 'show commits', 'show commits only', 'only commits'],
    pr:     ['pull requests', 'pull requests only', 'show pull requests', 'only pull requests', 'prs', 'show prs', 'only prs'],
    all:    ['all', 'show all', 'everything', 'show everything', 'all updates']
  };
  const LOOKUP = {};
  Object.keys(PHRASES).forEach(c => PHRASES[c].forEach(p => (LOOKUP[p] = { cmd: c })));
  Object.keys(FILTERS).forEach(f => FILTERS[f].forEach(p => (LOOKUP[p] = { cmd: 'filter', arg: f })));

  const UNITS = { zero: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7,
                  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
                  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30 };
  function toNumber(s) {
    if (/^\d{1,3}$/.test(s)) return parseInt(s, 10);
    let total = 0;
    for (const w of s.split(' ')) {
      if (w in TENS) total += TENS[w]; else if (w in UNITS) total += UNITS[w]; else return NaN;
    }
    return total;
  }
  const JUMP = /^(?:(?:go to|jump to|skip to|play)\s+(?:update\s+|item\s+|number\s+)?|(?:update|item|number)\s+)([a-z0-9 ]+)$/;

  // Match the WHOLE phrase, never a word inside it. This keeps the app from reacting to its own
  // voice (long commit text) coming back through the speakers while the mic is on.
  function parse(text) {
    let t = String(text || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    t = t.replace(/^(?:hey |ok |okay )?(?:commit radio |radio )?(?:please )?/, '').replace(/ please$/, '').trim();
    if (!t || t.split(' ').length > 8) return null;
    if (LOOKUP[t]) return { cmd: LOOKUP[t].cmd, arg: LOOKUP[t].arg };
    const m = JUMP.exec(t);
    if (m) { const n = toNumber(m[1].trim()); if (n >= 1) return { cmd: 'jump', arg: n }; }
    return null;
  }

  /* ---------- microphone ---------- */
  let rec = null;
  let wantMic = false;
  let micOn = false;
  let startedAt = 0;
  let quickEnds = 0;

  function setMic(on) {
    if (micOn === on) return;
    micOn = on;
    hooks.onMic(on);
  }

  function handleResult(alts) {
    for (const raw of alts) {
      const cmd = parse(raw);
      if (cmd) { hooks.onHeard(raw); hooks.onCommand(cmd); return; }
    }
    // Unrecognised: only show short phrases (long ones are probably our own voice, not the user)
    const first = String(alts[0] || '').trim();
    if (first && first.split(/\s+/).length <= 4) hooks.onHeard(first);
  }

  function buildRecognizer() {
    rec = new SR();
    rec.lang = REC_LANG;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onstart = () => { startedAt = Date.now(); setMic(true); };
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        handleResult(Array.from(e.results[i]).map(a => a.transcript));
      }
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wantMic = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        hooks.onStatus('Microphone permission was denied. Allow it in the browser, or use the keyboard.', true);
      else if (e.error === 'audio-capture')
        hooks.onStatus('No microphone found. Use the keyboard controls instead.', true);
      else if (e.error === 'network')
        hooks.onStatus('Voice commands need an internet connection in this browser. Use the keyboard instead.', true);
      else hooks.onStatus(`Voice error: ${e.error}.`, true);
    };
    rec.onend = () => {
      setMic(false);
      if (!wantMic) return;
      // Browsers end sessions after silence; restart while the user wants the mic on.
      quickEnds = Date.now() - startedAt < 1500 ? quickEnds + 1 : 0;
      if (quickEnds >= 5) {
        wantMic = false;
        hooks.onStatus('Voice commands keep stopping. Turn the mic on again, or use the keyboard.', true);
        return;
      }
      setTimeout(() => { if (wantMic) startRec(); }, 300);
    };
  }

  function startRec() {
    try { rec.start(); } catch (_) { /* already running */ }
  }

  // Confirmations are spoken only when idle, so toggling the mic never cuts off a briefing.
  function announce(text) { if (!active) speak(text); }

  function toggleMic() {
    if (!supported.stt) {
      hooks.onStatus('Voice commands are not supported in this browser. Use Chrome or Edge, or the keyboard.', true);
      announce('Voice commands are not supported in this browser. Use the keyboard.');
      return;
    }
    if (wantMic) {
      wantMic = false;
      try { rec.stop(); } catch (_) {}
      hooks.onStatus('Voice commands off.');
      announce('Voice commands off.');
      return;
    }
    if (!rec) buildRecognizer();
    wantMic = true; quickEnds = 0;
    startRec();
    hooks.onStatus('Voice commands on. Say help to hear what you can say.');
    announce('Voice commands on. Say help for the list.');
  }

  CR.speech = {
    speak, silence, pause, resume,
    isPaused: () => paused,
    isSpeaking: () => active,
    setRate, getRate: () => rate,
    initVoices, toggleMic,
    isListening: () => micOn,
    supported, parse, hooks
  };
})();
