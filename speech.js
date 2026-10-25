/**
 * speech.js — Commit Radio speech layer
 * Text-to-speech briefing player + voice commands (Web Speech API).
 *
 * Usage (plain <script src="speech.js"></script>, exposes window.CommitRadioSpeech):
 *
 *   const radio = new CommitRadioSpeech({
 *     onStatus:  (msg) => liveRegion.textContent = msg,   // aria-live updates
 *     onItem:    (item, index, total) => highlight(index), // UI sync
 *     onCommand: (cmd, heard) => console.log(cmd, heard),
 *     onOpen:    (item) => window.open(item.url, '_blank'), // "open link"
 *   });
 *   radio.setItems(CommitRadioSpeech.buildItems(commits, pulls));
 *   radio.play();
 *   radio.startListening();   // must be triggered by a user gesture (button click)
 *
 * Every voice command is also a public method, so main.js can bind keys:
 *   radio.next(), radio.previous(), radio.repeat(), radio.pause(), radio.resume(),
 *   radio.stop(), radio.faster(), radio.slower(), radio.openCurrent()
 */
(function (global) {
  'use strict';

  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  const synth = global.speechSynthesis;

  // Phrases -> command. Matching is done on short transcripts only (see _handleHeard).
  const COMMANDS = {
    next:     ['next', 'skip', 'forward', 'next one'],
    previous: ['previous', 'back', 'go back', 'last one', 'previous one'],
    repeat:   ['repeat', 'again', 'say again', 'repeat that'],
    pause:    ['pause', 'hold on', 'wait'],
    resume:   ['resume', 'continue', 'play', 'go on'],
    stop:     ['stop', 'quit', 'cancel'],
    faster:   ['faster', 'speed up'],
    slower:   ['slower', 'slow down'],
    open:     ['open', 'open link', 'open it'],
    help:     ['help', 'commands', 'what can i say'],
  };

  class CommitRadioSpeech {
    constructor(opts = {}) {
      this.opts = Object.assign({
        lang: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        maxChunkChars: 180,   // Chrome cuts off long utterances, so we chunk by sentence
        autoAdvance: true,    // read next item automatically when one finishes
        onStatus: () => {},
        onItem: () => {},
        onCommand: () => {},
        onOpen: null,
        onError: (e) => console.warn('[CommitRadio]', e),
      }, opts);

      this.items = [];
      this.index = -1;
      this.state = 'idle';        // idle | playing | paused
      this._token = 0;            // invalidates stale utterance callbacks
      this._voice = null;
      this._wantListening = false;
      this._recognition = null;
      this._listening = false;

      this.supportsSpeech = !!(synth && global.SpeechSynthesisUtterance);
      this.supportsRecognition = !!SR;

      if (this.supportsSpeech) {
        this._pickVoice();
        // Voices load asynchronously in Chrome
        synth.addEventListener?.('voiceschanged', () => this._pickVoice());
      }
    }

    /* ---------- Items / briefing ---------- */

    /** items: [{ text: string, url?: string, type?: 'commit'|'pr' }] */
    setItems(items) {
      this.stop();
      this.items = items || [];
      this.index = -1;
      this._status(`${this.items.length} updates loaded.`);
    }

    /**
     * Turn GitHub REST API responses into spoken items.
     * commits: GET /repos/{o}/{r}/commits   pulls: GET /repos/{o}/{r}/pulls
     */
    static buildItems(commits = [], pulls = []) {
      const items = [];
      commits.forEach((c) => {
        const msg = (c.commit?.message || '').split('\n')[0].trim();
        const author = c.commit?.author?.name || c.author?.login || 'an unknown author';
        const when = CommitRadioSpeech.relativeTime(c.commit?.author?.date);
        items.push({
          type: 'commit',
          url: c.html_url,
          text: `Commit by ${author}${when ? ', ' + when : ''}. ${CommitRadioSpeech.cleanForSpeech(msg) || 'No message.'}`,
        });
      });
      pulls.forEach((p) => {
        const state = p.merged_at ? 'merged' : p.state;
        const when = CommitRadioSpeech.relativeTime(p.created_at);
        items.push({
          type: 'pr',
          url: p.html_url,
          text: `Pull request number ${p.number}, ${state}, opened by ${p.user?.login || 'unknown'}${when ? ', ' + when : ''}. ${CommitRadioSpeech.cleanForSpeech(p.title)}`,
        });
      });
      return items;
    }

    /** Make dev text pleasant to hear: strip URLs, hashes, markdown, symbols. */
    static cleanForSpeech(s = '') {
      return s
        .replace(/https?:\/\/\S+/g, 'link')
        .replace(/\b[0-9a-f]{7,40}\b/gi, '')          // commit hashes
        .replace(/[`*_#>~]/g, '')                     // markdown
        .replace(/\(#(\d+)\)/g, ', pull request $1')  // "(#42)" -> "pull request 42"
        .replace(/\bfeat(\(.+?\))?:/i, 'feature:')
        .replace(/\bfix(\(.+?\))?:/i, 'fix:')
        .replace(/\bdocs(\(.+?\))?:/i, 'documentation:')
        .replace(/\brefactor(\(.+?\))?:/i, 'refactor:')
        .replace(/\bchore(\(.+?\))?:/i, 'chore:')
        .replace(/[_/\\|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    static relativeTime(iso) {
      if (!iso) return '';
      const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (isNaN(mins) || mins < 0) return '';
      if (mins < 60) return `${Math.max(mins, 1)} minute${mins === 1 ? '' : 's'} ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
      const days = Math.round(hrs / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    /* ---------- Playback controls ---------- */

    play(fromIndex) {
      if (!this.supportsSpeech) return this._unsupported('Text to speech');
      if (!this.items.length) return this._status('Nothing to read yet.');
      if (this.state === 'paused' && fromIndex === undefined) return this.resume();
      this.index = fromIndex !== undefined ? fromIndex : Math.max(this.index, 0);
      this._readCurrent(true);
    }

    next() {
      if (!this.items.length) return;
      if (this.index >= this.items.length - 1) {
        this._cancelSpeech();
        this.state = 'idle';
        return this._say('That was the last update.');
      }
      this.index++;
      this._readCurrent(true);
    }

    previous() {
      if (!this.items.length) return;
      this.index = Math.max(this.index - 1, 0);
      this._readCurrent(true);
    }

    repeat() {
      if (this.index < 0) return this.play(0);
      this._readCurrent(true);
    }

    pause() {
      if (this.state !== 'playing') return;
      synth.pause();
      this.state = 'paused';
      this._status('Paused.');
    }

    resume() {
      if (this.state !== 'paused') return this.play();
      synth.resume();
      this.state = 'playing';
      this._status('Resuming.');
    }

    stop() {
      this._cancelSpeech();
      this.state = 'idle';
      this._status('Stopped.');
    }

    faster() { this._setRate(this.opts.rate + 0.25); }
    slower() { this._setRate(this.opts.rate - 0.25); }

    openCurrent() {
      const item = this.items[this.index];
      if (!item || !item.url) return this._say('No link for this update.');
      if (this.opts.onOpen) this.opts.onOpen(item);
      else global.open(item.url, '_blank', 'noopener');
      this._status('Opened link.');
    }

    /** Speak an arbitrary one-off message (e.g. help text) without touching the queue. */
    say(text) { this._say(text); }

    /* ---------- Voice commands ---------- */

    startListening() {
      if (!this.supportsRecognition) {
        return this._unsupported('Voice commands (use Chrome or Edge), keyboard controls still work. Voice commands');
      }
      this._wantListening = true;
      if (!this._recognition) this._initRecognition();
      this._startRecognition();
    }

    stopListening() {
      this._wantListening = false;
      try { this._recognition && this._recognition.stop(); } catch (_) {}
      this._status('Voice commands off.');
    }

    get listening() { return this._listening; }

    _initRecognition() {
      const rec = new SR();
      rec.lang = this.opts.lang;
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onstart = () => { this._listening = true; this._status('Listening for voice commands.'); };
      rec.onend = () => {
        this._listening = false;
        // Browsers end sessions on silence/timeouts, so restart while the user wants it on
        if (this._wantListening) setTimeout(() => this._startRecognition(), 300);
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this._wantListening = false;
          this._status('Microphone permission denied. Use keyboard controls instead.');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          this.opts.onError(e);
        }
      };
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          const alts = Array.from(event.results[i]).map((a) => a.transcript);
          this._handleHeard(alts);
        }
      };
      this._recognition = rec;
    }

    _startRecognition() {
      try { this._recognition.start(); } catch (_) { /* already started */ }
    }

    /**
     * Only act on SHORT utterances (<= 3 words). Because the mic stays on while
     * Commit Radio is speaking, this stops it from reacting to its own voice
     * (long commit text) coming back through the speakers.
     */
    _handleHeard(alternatives) {
      for (const raw of alternatives) {
        const heard = raw.toLowerCase().replace(/[^a-z\s]/g, '').trim();
        if (!heard || heard.split(/\s+/).length > 3) continue;
        const cmd = this._matchCommand(heard);
        if (cmd) {
          this.opts.onCommand(cmd, heard);
          this._run(cmd);
          return;
        }
      }
    }

    _matchCommand(heard) {
      for (const [cmd, phrases] of Object.entries(COMMANDS)) {
        if (phrases.includes(heard)) return cmd;
      }
      return null;
    }

    _run(cmd) {
      switch (cmd) {
        case 'next': return this.next();
        case 'previous': return this.previous();
        case 'repeat': return this.repeat();
        case 'pause': return this.pause();
        case 'resume': return this.resume();
        case 'stop': return this.stop();
        case 'faster': return this.faster();
        case 'slower': return this.slower();
        case 'open': return this.openCurrent();
        case 'help':
          return this._say('You can say: next, previous, repeat, pause, resume, stop, faster, slower, or open link.');
      }
    }

    /* ---------- Internals: speech ---------- */

    _readCurrent(cancelFirst) {
      const item = this.items[this.index];
      if (!item) return;
      if (cancelFirst) this._cancelSpeech();
      this.state = 'playing';
      this.opts.onItem(item, this.index, this.items.length);

      const intro = `Update ${this.index + 1} of ${this.items.length}. `;
      const chunks = this._chunk(intro + item.text);
      const token = ++this._token;

      chunks.forEach((chunk, i) => {
        const u = this._makeUtterance(chunk);
        const isLast = i === chunks.length - 1;
        u.onend = () => {
          if (token !== this._token) return;      // stale (user skipped)
          if (!isLast) return;
          if (this.opts.autoAdvance && this.index < this.items.length - 1) {
            this.index++;
            this._readCurrent(false);
          } else {
            this.state = 'idle';
            this._status('End of briefing.');
          }
        };
        u.onerror = (e) => {
          if (e.error === 'interrupted' || e.error === 'canceled') return; // expected on skip
          this.opts.onError(e);
        };
        synth.speak(u);
      });
    }

    _say(text) {
      if (!this.supportsSpeech) return;
      this._cancelSpeech();
      this.state = 'idle';
      synth.speak(this._makeUtterance(text));
      this._status(text);
    }

    _makeUtterance(text) {
      const u = new global.SpeechSynthesisUtterance(text);
      u.lang = this.opts.lang;
      u.rate = this.opts.rate;
      u.pitch = this.opts.pitch;
      u.volume = this.opts.volume;
      if (this._voice) u.voice = this._voice;
      return u;
    }

    _cancelSpeech() {
      this._token++;          // invalidate pending onend handlers first
      if (synth) synth.cancel();
    }

    _chunk(text) {
      const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
      const out = [];
      let buf = '';
      for (const s of sentences) {
        if ((buf + s).length > this.opts.maxChunkChars && buf) { out.push(buf.trim()); buf = ''; }
        buf += s;
      }
      if (buf.trim()) out.push(buf.trim());
      return out;
    }

    _pickVoice() {
      const voices = synth.getVoices();
      if (!voices.length) return;
      const lang = this.opts.lang.toLowerCase();
      this._voice =
        voices.find((v) => v.lang.toLowerCase() === lang && /natural|google|samantha|neural/i.test(v.name)) ||
        voices.find((v) => v.lang.toLowerCase() === lang) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0])) ||
        null;
    }

    _setRate(r) {
      this.opts.rate = Math.min(2, Math.max(0.5, r));
      this._status(`Speed ${this.opts.rate.toFixed(2)}.`);
      if (this.state === 'playing') this._readCurrent(true); // apply immediately
    }

    _status(msg) { this.opts.onStatus(msg); }

    _unsupported(what) {
      this._status(`${what} not supported in this browser.`);
    }
  }

  CommitRadioSpeech.COMMANDS = COMMANDS;
  global.CommitRadioSpeech = CommitRadioSpeech;
  if (typeof module !== 'undefined' && module.exports) module.exports = CommitRadioSpeech;
})(typeof window !== 'undefined' ? window : globalThis);
