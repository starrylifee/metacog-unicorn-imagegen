export default async function handler(req, res) {
  // Vercel already URL-decodes query params — do NOT call decodeURIComponent again
  const url = req.query.url || '';
  if (!url.startsWith('https://firebasestorage.googleapis.com/')) {
    return res.status(400).end('invalid url');
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();
    const ct = upstream.headers.get('content-type') || 'image/png';
    const buf = await upstream.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(buf));
  } catch(e) {
    res.status(502).end(e.message);
  }
}
