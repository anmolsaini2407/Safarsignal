// SafarSignal server: serves index.html and fetches flight prices from
// Aviasales (via Travelpayouts) so your token never goes into the browser.
// Run:  node server.js     (needs Node 18 or newer)

const http = require('http');
const fs = require('fs');
const path = require('path');

// tiny .env loader (no packages needed)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* no .env file, fine */ }

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TRAVELPAYOUTS_TOKEN;

// common city -> airport/city code (so no extra lookup service is needed)
const CODES = {
  delhi: 'DEL', 'new delhi': 'DEL', panipat: 'DEL', gurgaon: 'DEL', noida: 'DEL',
  mumbai: 'BOM', bangalore: 'BLR', bengaluru: 'BLR', kolkata: 'CCU', chennai: 'MAA',
  hyderabad: 'HYD', pune: 'PNQ', ahmedabad: 'AMD', jaipur: 'JAI', goa: 'GOI',
  chandigarh: 'IXC', lucknow: 'LKO', kochi: 'COK', amritsar: 'ATQ', dehradun: 'DED',
  srinagar: 'SXR', guwahati: 'GAU', indore: 'IDR', nagpur: 'NAG', patna: 'PAT',
  varanasi: 'VNS', bhopal: 'BHO', manali: 'KUU', shimla: 'SLV', leh: 'IXL',
  udaipur: 'UDR', rishikesh: 'DED', dubai: 'DXB', bangkok: 'BKK', singapore: 'SIN',
  london: 'LON', paris: 'PAR', 'new york': 'NYC', bali: 'DPS', kathmandu: 'KTM'
};

async function codeFor(q) {
  const s = String(q || '').trim();
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  const hit = CODES[s.toLowerCase()];
  if (hit) return hit;
  // best-effort lookup for other places
  try {
    const r = await fetch('https://autocomplete.travelpayouts.com/places2?locale=en&types[]=city&types[]=airport&term=' + encodeURIComponent(s),
      { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (Array.isArray(j) && j[0] && j[0].code) return j[0].code;
  } catch (e) { /* fall through */ }
  throw new Error(`"${s}" ka airport code nahi mila. 3-letter code likho (jaise DEL, BOM, GOI).`);
}

async function prices(params) {
  const u = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'X-Access-Token': TOKEN }, signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    throw new Error(r.status === 401 || r.status === 403 ? 'Token galat lag raha hai. .env me TRAVELPAYOUTS_TOKEN dobara check karo.' : (j.error || j.message || 'Travelpayouts error (' + r.status + ')'));
  }
  return j.data || [];
}

// simple per-visitor limit (30 price checks / 10 min) so strangers can't burn your token
const hits = new Map();
function limited(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 600000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
       if (url.pathname === '/googlef444fae2492c7850.html') {
       res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
       return res.end('google-site-verification: googlef444fae2492c7850.html');
     }

  if (url.pathname === '/api/flights') {
    if (!TOKEN) return send(res, 503, { ok: false, error: 'Token set nahi hai. .env file me TRAVELPAYOUTS_TOKEN daalo.' });
    if (limited(req)) return send(res, 429, { ok: false, error: 'Bahut zyada price checks ho gaye. Thodi der baad try karo.' });
    const from = url.searchParams.get('from'), to = url.searchParams.get('to'),
      toCode = url.searchParams.get('toCode'), date = url.searchParams.get('date');
    if (!from || !(to || toCode) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return send(res, 400, { ok: false, error: 'from, to aur date (YYYY-MM-DD) chahiye.' });
    }
    try {
      const o = await codeFor(from);
      const d = toCode ? String(toCode).toUpperCase() : await codeFor(to);
      const base = { origin: o, destination: d, currency: 'inr', one_way: 'true', sorting: 'price', limit: '30' };

      let offers = await prices({ ...base, departure_at: date });
      let exact = true;
      if (!offers.length) {
        // no cached fare for that exact day: look at the whole month
        exact = false;
        offers = (await prices({ ...base, departure_at: date.slice(0, 7) }))
          .filter(x => (x.departure_at || '').slice(0, 10) >= date);
      }
      if (!offers.length) return send(res, 200, { ok: false, error: `${o} → ${d} ke liye cached price nahi mila.` });

      offers.sort((a, b) => Number(a.price) - Number(b.price));
      const c = offers[0];
      return send(res, 200, {
        ok: true, from: o, to: d, date: (c.departure_at || date).slice(0, 10), asked: date,
        currency: 'INR', price: Math.round(Number(c.price)),
        airline: c.airline || '', stops: Number(c.transfers) || 0,
        count: offers.length, exact
      });
    } catch (e) {
      return send(res, 502, { ok: false, error: e.message });
    }
  }

  // Google Search Console ownership check (file name given by Google)
  if (url.pathname === '/googlef444fae2492c7850.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('google-site-verification: googlef444fae2492c7850.html');
  }

  // robots.txt and sitemap.xml are built from the address the visitor used,
  // so they stay correct whatever the final onrender.com name turns out to be
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const base = `${proto}://${host}`;
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`);
    }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${base}/</loc><changefreq>daily</changefreq></url>\n</urlset>\n`);
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, buf) => {
      if (err) { res.writeHead(500); return res.end('index.html nahi mili (server.js ke saath wale folder me rakho)'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`SafarSignal chal raha hai: http://localhost:${PORT}`);
  console.log(TOKEN ? 'Travelpayouts token mila.' : 'Token abhi set nahi hai, prices unavailable dikhenge.');
});
