// netlify/functions/truth.js
export default async (req, context) => {
  const urlObj = new URL(req.url);
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '5', 10), 10);

  const base = 'https://truthsocial.com';

  try {
    // 1) 계정 조회 (lookup)
    const accRes = await fetch(`${base}/api/v1/accounts/lookup?acct=realDonaldTrump`, {
      headers: { 'accept': 'application/json' },
    });
    if (!accRes.ok) {
      const text = await accRes.text();
      return new Response(JSON.stringify({ error: 'Account lookup failed', detail: text }), {
        status: accRes.status, headers: { 'content-type': 'application/json' },
      });
    }
    const acc = await accRes.json();
    const id = acc?.id;
    if (!id) throw new Error('No account id');

    // 2) 상태글 목록
    const stsRes = await fetch(`${base}/api/v1/accounts/${id}/statuses?limit=${limit}&exclude_replies=true`, {
      headers: { 'accept': 'application/json' },
    });
    if (!stsRes.ok) {
      const text = await stsRes.text();
      return new Response(JSON.stringify({ error: 'Statuses fetch failed', detail: text }), {
        status: stsRes.status, headers: { 'content-type': 'application/json' },
      });
    }
    const statuses = await stsRes.json();
    const posts = (statuses || []).map(s => {
      // s.content는 HTML (이미 a/p/br 등 포함)
      return {
        id: s.id,
        html: s.content || '',
        text: s.content ? s.content.replace(/<[^>]+>/g, '') : '',
        created_at: s.created_at,
        url: s.url || `${base}/@realDonaldTrump/${s.id}`,
      };
    });

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
}
