// netlify/functions/x.js
export default async (req, context) => {
  const urlObj = new URL(req.url);
  const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '5', 10), 10);

  const BEARER = process.env.TWITTER_BEARER_TOKEN;
  if (!BEARER) {
    return new Response(JSON.stringify({ error: 'Missing TWITTER_BEARER_TOKEN' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const username = 'realDonaldTrump';

  try {
    // 1) 사용자 ID 조회
    const userRes = await fetch(`https://api.x.com/2/users/by/username/${username}`, {
      headers: { Authorization: `Bearer ${BEARER}` },
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      return new Response(JSON.stringify({ error: 'User lookup failed', detail: text }), {
        status: userRes.status, headers: { 'content-type': 'application/json' },
      });
    }
    const user = await userRes.json();
    const userId = user?.data?.id;
    if (!userId) throw new Error('No user id');

    // 2) 최근 트윗
    const tweetsRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?max_results=${limit}&exclude=retweets,replies&tweet.fields=created_at,entities`, {
      headers: { Authorization: `Bearer ${BEARER}` },
    });
    if (!tweetsRes.ok) {
      const text = await tweetsRes.text();
      return new Response(JSON.stringify({ error: 'Tweets fetch failed', detail: text }), {
        status: tweetsRes.status, headers: { 'content-type': 'application/json' },
      });
    }
    const tweets = await tweetsRes.json();
    const posts = (tweets?.data || []).map(t => {
      // 간단한 링크 변환
      let html = (t.text || '')
        .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/\n/g, '<br/>');
      const url = `https://x.com/${username}/status/${t.id}`;
      return { id: t.id, text: t.text, html, created_at: t.created_at, url };
    });

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=60', // 함수 레벨의 짧은 캐시
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
}
