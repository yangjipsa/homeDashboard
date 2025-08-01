// netlify/functions/truth.js
const BASE = 'https://truthsocial.com';
const UA = 'Mozilla/5.0 (Netlify Functions; +https://netlify.app)';

async function tryJsonLookup(limit) {
  // 1) JSON API 시도
  const accRes = await fetch(`${BASE}/api/v1/accounts/lookup?acct=realDonaldTrump`, {
    headers: { 'accept': 'application/json', 'user-agent': UA },
  });
  if (!accRes.ok) return { ok: false, status: accRes.status, detail: await accRes.text() };
  const acc = await accRes.json();
  const id = acc?.id;
  if (!id) return { ok: false, status: 500, detail: 'no id' };

  const stsRes = await fetch(`${BASE}/api/v1/accounts/${id}/statuses?limit=${limit}&exclude_replies=true&exclude_reblogs=true`, {
    headers: { 'accept': 'application/json', 'user-agent': UA },
  });
  if (!stsRes.ok) return { ok: false, status: stsRes.status, detail: await stsRes.text() };
  const statuses = await stsRes.json();
  const posts = (statuses || []).map(s => ({
    id: s.id,
    html: s.content || '',
    text: s.content ? s.content.replace(/<[^>]+>/g, '') : '',
    created_at: s.created_at,
    url: s.url || `${BASE}/@realDonaldTrump/${s.id}`,
  }));
  return { ok: true, posts };
}

function parseRss(xml, limit) {
  // 매우 단순한 RSS/Atom 파서 (Truth Social은 RSS 제공)
  const items = [];
  const blocks = xml.split(/<item>|<entry>/).slice(1);
  for (const b of blocks.slice(0, limit)) {
    const get = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const linkMatch = b.match(/<link[^>]*>([^<]+)<\/link>|<link[^>]*href="([^"]+)"/i);
    const link = linkMatch ? (linkMatch[1] || linkMatch[2]) : '';
    const pubDate = get('pubDate') || get('updated') || get('published');
    const content = get('content:encoded') || get('description') || get('summary') || '';
    items.push({
      id: get('guid') || link || pubDate || Math.random().toString(36).slice(2),
      html: content,
      text: content.replace(/<[^>]+>/g, ''),
      created_at: pubDate || new Date().toISOString(),
      url: link || `${BASE}/@realDonaldTrump`,
    });
  }
  return items;
}

export default async (req, context) => {
  const urlObj = new URL(req.url);
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '5', 10), 10);

  // 1) 먼저 JSON 시도
  try {
    const j = await tryJsonLookup(limit);
    if (j.ok) {
      return new Response(JSON.stringify({ posts: j.posts }), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
      });
    }
    // 2) JSON이 403/4xx면 RSS 폴백
    const rssRes = await fetch(`${BASE}/@realDonaldTrump.rss`, {
      headers: { 'user-agent': UA, 'accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8' },
    });
    if (!rssRes.ok) {
      return new Response(JSON.stringify({ error: 'Truth Social API 호출 실패', detail: j.detail || '', rssStatus: rssRes.status }), {
        status: 403, headers: { 'content-type': 'application/json' },
      });
    }
    const xml = await rssRes.text();
    const posts = parseRss(xml, limit);
    return new Response(JSON.stringify({ posts, source: 'rss' }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
