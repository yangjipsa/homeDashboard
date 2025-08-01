// netlify/functions/x.js
const UA = 'Mozilla/5.0 (Netlify Functions; +https://netlify.app)';

async function fetchWithRetry(url, opts = {}, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...(opts.headers || {}) }, ...opts });
      if (res.ok) return res;
      // 5xx면 재시도
      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return res; // 4xx는 그대로 반환
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr || new Error('network error');
}

export default async (req, context) => {
  const urlObj = new URL(req.url);
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '5', 10), 10);

  const BEARER = process.env.TWITTER_BEARER_TOKEN;
  if (!BEARER) {
    return new Response(JSON.stringify({ error: 'Missing TWITTER_BEARER_TOKEN' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }

  const username = 'realDonaldTrump';
  const apiRoots = ['https://api.twitter.com', 'https://api.x.com']; // 우선 twitter.com 사용, 실패 시 x.com

  try {
    // 1) 사용자 ID 조회 (두 도메인 폴백)
    let user, userId;
    for (const root of apiRoots) {
      const r = await fetchWithRetry(`${root}/2/users/by/username/${username}`, {
        headers: { Authorization: `Bearer ${BEARER}` },
      });
      if (r.ok) { user = await r.json(); userId = user?.data?.id; break; }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: 'User lookup failed' }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }

    // 2) 최근 트윗
    let tweets;
    for (const root of apiRoots) {
      const r = await fetchWithRetry(
        `${root}/2/users/${userId}/tweets?max_results=${limit}&exclude=retweets,replies&tweet.fields=created_at,entities`,
        { headers: { Authorization: `Bearer ${BEARER}` } }
      );
      if (r.ok) { tweets = await r.json(); break; }
      if (r.status < 500) {
        // 권한/제한 등의 4xx면 그대로 반환
        const text = await r.text();
        return new Response(JSON.stringify({ error: 'Tweets fetch failed', detail: text }), {
          status: r.status, headers: { 'content-type': 'application/json' },
        });
      }
    }
    if (!tweets) {
      return new Response(JSON.stringify({ error: 'Tweets fetch failed (5xx)' }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }

    const posts = (tweets?.data || []).map(t => {
      const html = (t.text || '')
        .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br/>');
      const url = `https://x.com/${username}/status/${t.id}`;
      return { id: t.id, text: t.text, html, created_at: t.created_at, url };
    });

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }
};
