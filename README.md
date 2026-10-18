# SafarSignal

Trip se pehle check karo: **GO, WAIT ya AVOID**.

SafarSignal ek travel decision web app hai. Destination aur date daalo, aur ye live data dekh kar batata hai ki ab jaana theek hai ya nahi.

**Live demo:** https://safarsignal.onrender.com

> Free hosting par chalta hai, isliye pehli baar khulne me 30-50 second lag sakte hain.

## Features

- **GO / WAIT / AVOID verdict** live weather aur air quality ke basis par
- **16-day forecast** aur best travel dates
- **Crowd pressure** (public holidays aur Wikipedia pageviews se)
- **Flight price** (cached fares, Aviasales / Travelpayouts)
- **Train aur bus** ke liye IRCTC, ixigo aur redBus ke links

## Tech stack

- Frontend: HTML, CSS, vanilla JavaScript (single file)
- Backend: Node.js (`http`, koi external package nahi)
- APIs: Open-Meteo (weather, air quality, geocoding), Wikipedia pageviews, Nager.Date holidays, Aviasales / Travelpayouts
- Deploy: Render + GitHub auto-deploy

## Kaise kaam karta hai

- Browser seedha Open-Meteo aur Wikipedia se data leta hai.
- Flight price ke liye browser `/api/flights` ko call karta hai. Ye Node.js server API token ko apne paas rakhta hai, taaki token browser me kabhi na dikhe.
- Server me har visitor ke liye rate limit hai (10 minute me 30 price checks).
- `robots.txt` aur `sitemap.xml` server khud banata hai.

## Local me chalana

Node.js 18 ya naya chahiye.

```bash
git clone https://github.com/anmolsaini2407/Safarsignal.git
cd Safarsignal
cp .env.example .env     # phir .env me apna TRAVELPAYOUTS_TOKEN daalo
npm start
```

Phir http://localhost:3000 kholo. Token ke bina bhi site chalti hai, bas flight price nahi dikhega.

## Limitations

- Flight prices cached fares hain, live booking price nahi.
- Train aur bus ke liye sirf links hain, prices nahi.
- India ke holidays ki list 2026 ke liye hardcoded hai.

## Author

Anmol Saini
