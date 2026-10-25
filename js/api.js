/* api.js
 * All GitHub REST API access. No DOM, no speech. Returns plain items (see core.js for the shape).
 * Depends on: core.js
 *
 * Public API:
 *   CR.api.loadRepo(repo, token?)           -> Promise<item[]>   newest first
 *   CR.api.detailText(item, repo, token?)   -> Promise<string>   spoken details (cached)
 */
(function () {
  const { clean } = CR.util;
  const cache = {};

  async function gh(path, token) {
    const h = { Accept: 'application/vnd.github+json' };
    if (token) h.Authorization = `Bearer ${token}`;
    const r = await fetch(`https://api.github.com${path}`, { headers: h });
    if (!r.ok) {
      if (r.status === 404) throw new Error('Repository not found. Check the name, and that it is public.');
      if (r.status === 409) throw new Error('That repository is empty, so there are no commits yet.');
      if (r.status === 403 || r.status === 429) throw new Error('GitHub rate limit reached. Add a token or try again later, or use the offline demo.');
      throw new Error(`GitHub returned an error (${r.status}).`);
    }
    return r.json();
  }

  async function loadRepo(repo, token) {
    Object.keys(cache).forEach(k => delete cache[k]);
    const [cRes, pRes] = await Promise.allSettled([
      gh(`/repos/${repo}/commits?per_page=15`, token),
      gh(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`, token)
    ]);
    if (cRes.status === 'rejected' && pRes.status === 'rejected') throw cRes.reason;

    const items = [];
    if (cRes.status === 'fulfilled') cRes.value.forEach(c => items.push({
      type: 'commit', id: c.sha, sha: c.sha,
      title: (c.commit.message || '').split('\n')[0],
      body: (c.commit.message || '').split('\n').slice(1).join('\n').trim(),
      author: c.commit.author?.name || c.author?.login || 'unknown',
      date: c.commit.author?.date, url: c.html_url
    }));
    if (pRes.status === 'fulfilled') pRes.value.forEach(p => items.push({
      type: 'pr', id: 'pr' + p.number, number: p.number, title: p.title, body: p.body || '',
      author: p.user?.login || 'unknown', date: p.updated_at || p.created_at, url: p.html_url,
      status: p.merged_at ? 'merged' : p.state
    }));
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return items;
  }

  // Spoken "details" for one item: files changed / PR description. Cached per item.
  async function detailText(it, repo, token) {
    if (cache[it.id]) return cache[it.id];
    let t;
    try {
      if (it.demo) {
        t = it.detail || 'No extra details in demo data.';
      } else if (it.type === 'commit') {
        const d = await gh(`/repos/${repo}/commits/${it.sha}`, token);
        const files = (d.files || []).slice(0, 5).map(f => f.filename.split('/').pop());
        t = `This commit changed ${d.files?.length ?? 0} file${d.files?.length === 1 ? '' : 's'}, ` +
            `with ${d.stats?.additions ?? 0} lines added and ${d.stats?.deletions ?? 0} removed.` +
            (files.length ? ` Files include ${files.join(', ')}.` : '') +
            (it.body ? ` Message body: ${clean(it.body).slice(0, 300)}.` : '');
      } else {
        const d = await gh(`/repos/${repo}/pulls/${it.number}`, token);
        t = `This pull request has ${d.commits} commit${d.commits === 1 ? '' : 's'}, changes ${d.changed_files} file${d.changed_files === 1 ? '' : 's'}, ` +
            `with ${d.additions} lines added and ${d.deletions} removed. ` +
            (clean(d.body).length ? `Description: ${clean(d.body).slice(0, 400)}.` : 'It has no description.');
      }
    } catch (e) {
      return 'Could not load details. ' + e.message;   // don't cache failures
    }
    cache[it.id] = t;
    return t;
  }

  CR.api = { loadRepo, detailText };
})();
