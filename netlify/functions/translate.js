// netlify/functions/translate.js
// 비공식 Google Translate 엔드포인트 사용 (소량/개인용 권장)
export default async (req) => {
  try {
    const { texts = [], to = 'ko' } = await req.json();
    if (!Array.isArray(texts) || !texts.length) {
      return new Response(JSON.stringify({ error: 'No texts' }), { status: 400, headers: {'content-type':'application/json'} });
    }

    const results = [];
    for (const t of texts) {
      const u = new URL('https://translate.googleapis.com/translate_a/single');
      u.searchParams.set('client', 'gtx');
      u.searchParams.set('sl', 'auto');
      u.searchParams.set('tl', to);
      u.searchParams.set('dt', 't');
      u.searchParams.set('q', t);

      const r = await fetch(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!r.ok) { results.push(''); continue; }
      const data = await r.json(); // [[["번역","원문",null,null,...]],...]
      const translated = Array.isArray(data?.[0]) ? data[0].map(seg => seg[0]).join('') : '';
      results.push(translated);
      // 살짝 지연(연속 호출 제한 회피)
      await new Promise(res => setTimeout(res, 120));
    }

    return new Response(JSON.stringify({ translations: results }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
