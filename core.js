/* core.js
 * Shared namespace (window.CR), shared app state, and tiny pure helpers.
 * Loaded FIRST. Keep this file small and stable: everyone depends on it.
 */
(function () {
  const CR = (window.CR = window.CR || {});

  CR.$ = s => document.querySelector(s);

  // The ONLY shared mutable state. Speech state (speaking/paused/rate/voice/mic) lives inside speech.js.
  CR.state = {
    repo: '',        // "owner/name"
    all: [],         // every loaded item, newest first
    items: [],       // items after the current filters
    idx: 0,          // index of the current item inside `items`
    auto: false,     // true while the briefing is auto-advancing
    filter: 'all',   // 'all' | 'commit' | 'pr'
    hideBots: false  // hide dependabot / github-actions / [bot] authors
  };

  /* Item shape (produced by api.js and demo-data.js, consumed by text.js and ui.js):
   * { type:'commit'|'pr', id, title, body, author, date(ISO), url,
   *   sha (commit) | number + status (pr),  demo?:true, detail?:string }
   */

  CR.util = {
    rel(dateStr) {
      const d = new Date(dateStr), s = Math.max(1, Math.round((Date.now() - d) / 1000));
      const u = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
      for (const [sec, name] of u) if (s >= sec) { const n = Math.floor(s / sec); return `${n} ${name}${n > 1 ? 's' : ''} ago`; }
      return 'just now';
    },
    // Strip markdown / URLs so text-to-speech reads naturally.
    clean(t) {
      return (t || '')
        .replace(/https?:\/\/\S+/g, 'a link')
        .replace(/`+/g, '')
        .replace(/[*_#>]+/g, '')
        .replace(/\s*\(#\d+\)\s*$/, '')
        .replace(/\s+/g, ' ').trim();
    },
    // "https://github.com/a/b.git" -> "a/b"; returns null if invalid.
    parseRepo(v) {
      v = (v || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');
      const p = v.split('/');
      return p.length >= 2 && p[0] && p[1] ? `${p[0]}/${p[1]}` : null;
    }
  };
})();