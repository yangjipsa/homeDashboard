// netlify/functions/truth.js
const BASE = 'https://truthsocial.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const ACCEPT_JSON = { accept: 'application/json', 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' };

function stripHtml(s = '') { return s.replace(/<[^>]+>/g, '').trim(); }

function parseRss(xml, limit) {
  const items = [];
  const blocks = xml.split(/<item>|<entry>/i).slice(1);
  for (const b of blocks.slice(0, limit)) {
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const linkMatch = b.match(/<link[^>]*>([^<]+)<\/link>|<link[^>]*href="([^"]+)"/i);
    const link = (linkMatch && (linkMatch[1] || linkMatch[2])) || '';
    const content = pick('content:encoded') || pick('description') || pick('summary') || '';
    const pubDate = pick('pubDate') || pick('updated') || pick('published') || '';
    items.push({
      id: pick('guid') || link || pubDate || Math.random().toString(36).slice(2),
      html: content,
      text: stripHtml(content),
      created_at: pubDate || new Date().toISOString(),
      url: link || `${BASE}/@realDonaldTrump`,
    });
  }
  return items;
}

function parseHtmlProfile(html, limit) {
  // 매우 단순한 파서(변경 가능성 있음). status 블록을 최대 limit개 추출
  const posts = [];
  const blocks = html.split(/<article\b[^>]*class="[^"]*status/).slice(1);
  for (const raw of blocks.slice(0, limit)) {
    const contentMatch = raw.match(/<div[^>]*class="[^"]*status__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const timeMatch = raw.match(/<time[^>]*datetime="([^"]+)"/i);
    const linkMatch = raw.match(/<a[^>]*class="[^"]*u-url[^"]*"[^>]*href="([^"]+)"/i);
    const htmlContent = contentMatch ? contentMatch[1] : '';
    posts.push({
      id: timeMatch?.[1] || Math.random().toString(36).slice(2),
      html: htmlContent,
      text: stripHtml(htmlContent),
      created_at: timeMatch?.[1] || new Date().toISOString(),
      url: linkMatch ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `${BASE}${linkMatch[1]}`) : `${BASE}/@realDonaldTrump`
    });
  }
  return posts;
}

export default async (req) => {
  const urlObj = new URL(req.url);
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '5', 10), 10);

  try {
    // 1) 공개 JSON API 시도
    const accRes = await fetch(`${BASE}/api/v1/accounts/lookup?acct=realDonaldTrump`, { headers: ACCEPT_JSON });
    if (accRes.ok) {
      const acc = await accRes.json();
      if (acc?.id) {
        const stsRes = await fetch(
          `${BASE}/api/v1/accounts/${acc.id}/statuses?limit=${limit}&exclude_replies=true&exclude_reblogs=true`,
          { headers: ACCEPT_JSON }
        );
        if (stsRes.ok) {
          const sts = await stsRes.json();
          const posts = (sts || []).map(s => ({
            id: s.id,
            html: s.content || '',
            text: stripHtml(s.content || ''),
            created_at: s.created_at,
            url: s.url || `${BASE}/@realDonaldTrump/${s.id}`,
          }));
          return new Response(JSON.stringify({ posts, source: 'json' }), {
            status: 200,
            headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=120' },
          });
        }
      }
    }

    // 2) RSS 폴백
    const rssRes = await fetch(`${BASE}/@realDonaldTrump.rss`, {
      headers: { 'user-agent': UA, 'accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' }
    });
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const posts = parseRss(xml, limit);
      if (posts.length) {
        return new Response(JSON.stringify({ posts, source: 'rss' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=180' },
        });
      }
    }

    // 3) HTML 스크레이핑 폴백
    const htmlRes = await fetch(`${BASE}/@realDonaldTrump`, {
      headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' }
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const posts = parseHtmlProfile(html, limit);
      if (posts.length) {
        return new Response(JSON.stringify({ posts, source: 'html' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=180' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Truth Social fetch failed (403/blocked)' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
