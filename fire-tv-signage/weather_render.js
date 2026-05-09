const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  let weather = null;
  try {
    const res = await page.request.get('http://localhost:3002/api/weather?city=Birmingham,AL', {
      timeout: 8000,
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok()) weather = await res.json();
  } catch (e) {
    console.log('Weather fetch failed:', e.message);
  }

  const { html } = buildPage(weather);

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/weather_card.png', fullPage: true });
  await browser.close();
  console.log('Weather card done!');
  process.exit(0);
})();

function buildPage(w) {
  const now = new Date();
  const h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  const min = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hour12}:${min}`;
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const temp = w ? w.tempF : 72;
  const feelsLike = w ? w.feelsLikeF : 70;
  const condition = w ? w.condition : 'Partly Cloudy';
  const location = w ? w.location : 'Birmingham, alabama';
  const humidity = w ? w.humidity : 55;
  const windmph = w ? w.windmph : 9;
  const windDir = w ? w.windDir : 'S';
  const uvIndex = w ? w.uvIndex : 0;
  const visibility = w ? w.visibility : 9;
  const pressure = w ? (w.pressure ? Number(w.pressure).toFixed(1) : '30.0') : '30.0';

  const forecast = w && w.forecast && w.forecast.length > 0 ? w.forecast : [
    { maxTempF: 84, minTempF: 56, weatherCode: '116' },
    { maxTempF: 76, minTempF: 64, weatherCode: '266' },
    { maxTempF: 73, minTempF: 58, weatherCode: '176' },
    { maxTempF: 80, minTempF: 60, weatherCode: '116' },
    { maxTempF: 82, minTempF: 62, weatherCode: '119' },
    { maxTempF: 78, minTempF: 59, weatherCode: '176' },
    { maxTempF: 75, minTempF: 57, weatherCode: '119' },
  ];

  const dayAbbrev = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const today = new Date();

  function getDayName(i) {
    if (i === 0) return 'TODAY';
    const d = new Date(today); d.setDate(today.getDate() + i);
    return dayAbbrev[d.getDay()];
  }

  // Bold, chunky SVG weather icons
  function icon(code) {
    const i = {
      '113': `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="#FFD93D" stroke="#FFB800" stroke-width="3"/><line x1="32" y1="4" x2="32" y2="13" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="51" x2="32" y2="60" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="4" y1="32" x2="13" y2="32" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="51" y1="32" x2="60" y2="32" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="11" y1="11" x2="17.5" y2="17.5" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="46.5" y1="46.5" x2="53" y2="53" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="11" y1="53" x2="17.5" y2="46.5" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/><line x1="46.5" y1="17.5" x2="53" y2="11" stroke="#FFD93D" stroke-width="4" stroke-linecap="round"/></svg>`,
      '116': `<svg viewBox="0 0 64 64"><circle cx="22" cy="24" r="10" fill="#FFD93D" stroke="#FFB800" stroke-width="2"/><line x1="22" y1="6" x2="22" y2="11" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="24" x2="13" y2="24" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><line x1="11" y1="11" x2="15.8" y2="15.8" stroke="#FFD93D" stroke-width="3" stroke-linecap="round"/><path d="M50 38H18c-5 0-9 4-9 9s4 9 9 9h28c5 0 9-4 9-9 0-4-2.8-7.6-6.5-8.6" fill="rgba(200,215,235,0.9)" stroke="rgba(175,192,218,0.9)" stroke-width="1.5"/></svg>`,
      '119': `<svg viewBox="0 0 64 64"><path d="M50 38H18c-5 0-9 4-9 9s4 9 9 9h28c5 0 9-4 9-9 0-4-2.8-7.6-6.5-8.6" fill="rgba(180,195,215,0.9)" stroke="rgba(150,168,195,0.9)" stroke-width="1.5"/></svg>`,
      '176': `<svg viewBox="0 0 64 64"><path d="M50 34H18c-5 0-9 4-9 9s4 9 9 9h28c5 0 9-4 9-9 0-4-2.8-7.6-6.5-8.6" fill="rgba(150,165,195,0.9)" stroke="rgba(125,142,172,0.9)" stroke-width="1.5"/><line x1="22" y1="54" x2="18" y2="62" stroke="#6EA0D8" stroke-width="3.5" stroke-linecap="round"/><line x1="32" y1="54" x2="28" y2="62" stroke="#6EA0D8" stroke-width="3.5" stroke-linecap="round"/><line x1="42" y1="54" x2="38" y2="62" stroke="#6EA0D8" stroke-width="3.5" stroke-linecap="round"/></svg>`,
      '200': `<svg viewBox="0 0 64 64"><path d="M50 30H18c-5 0-9 4-9 9s4 9 9 9h28c5 0 9-4 9-9 0-4-2.8-7.6-6.5-8.6" fill="rgba(80,90,110,0.9)" stroke="rgba(60,70,90,0.9)" stroke-width="1.5"/><path d="M30 38l-6 10h8l-6 10" stroke="#FFD93D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      '266': `<svg viewBox="0 0 64 64"><path d="M50 34H18c-5 0-9 4-9 9s4 9 9 9h28c5 0 9-4 9-9 0-4-2.8-7.6-6.5-8.6" fill="rgba(140,155,180,0.9)" stroke="rgba(115,133,162,0.9)" stroke-width="1.5"/><circle cx="22" cy="54" r="3.5" fill="#6EA0D8"/><circle cx="32" cy="57" r="3.5" fill="#6EA0D8"/><circle cx="42" cy="54" r="3.5" fill="#6EA0D8"/></svg>`,
    };
    return i[String(code)] || i['116'];
  }

  const dayAbbrev2 = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  let fcHtml = '';
  for (let i = 0; i < 7; i++) {
    const d = forecast[i] || { maxTempF: 80, minTempF: 60, weatherCode: '116' };
    const label = getDayName(i);
    fcHtml += `<div class="day-card">
      <div class="day-name ${i===0?'today':''}">${label}</div>
      <div class="weather-icon">${icon(d.weatherCode)}</div>
      <div class="hi-lo">
        <span class="t-hi">${Math.round(d.maxTempF)}°</span>
        <span class="t-lo">${Math.round(d.minTempF)}°</span>
      </div>
    </div>`;
  }

  const cityDisplay = location.split(',').map(s => s.trim().toUpperCase()).slice(0, 2).join(', ');

  return {
    timeStr, dateStr,
    html: `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',sans-serif; width:1920px; height:1080px; overflow:hidden;
  background:linear-gradient(180deg,#0d1b2a 0%,#1b263b 15%,#1e3a5f 30%,#2d6a4f 50%,#40916c 65%,#74a57f 78%,#b5c99a 90%,#e9c46a 100%); }

.time-badge { position:absolute; top:40px; left:52px; }
.time-display { font-size:56px; font-weight:300; color:#fff; line-height:1; letter-spacing:-2px; text-shadow:0 4px 24px rgba(0,0,0,0.5); }
.ampm { font-size:24px; font-weight:500; vertical-align:super; opacity:0.7; }
.date-display { font-size:15px; color:rgba(255,255,255,0.6); margin-top:6px; letter-spacing:0.05em; }

/* ── MAIN CARD ── */
.card { position:absolute; bottom:36px; left:36px; right:36px;
  background:rgba(10,22,40,0.80); backdrop-filter:blur(32px); border-radius:32px;
  border:1px solid rgba(255,255,255,0.13); padding:36px 56px 32px;
  display:flex; gap:56px; align-items:flex-start; }

.current { display:flex; flex-direction:column; gap:6px; min-width:320px; padding-top:6px; }
.loc { font-size:24px; font-weight:700; color:#fff; letter-spacing:0.1em; text-transform:uppercase; opacity:0.95; }
.dt  { font-size:16px; color:rgba(255,255,255,0.55); margin-top:2px; }
.temp-main { font-size:144px; font-weight:900; color:#fff; line-height:1; letter-spacing:-6px;
  text-shadow:0 4px 32px rgba(0,0,0,0.4); margin-top:4px; }
.deg { font-size:72px; font-weight:300; letter-spacing:-4px; vertical-align:top; }
.cond { font-size:24px; color:rgba(255,255,255,0.85); margin-top:4px; }
.fl  { font-size:15px; color:rgba(255,255,255,0.5); margin-top:4px; }

.forecast { display:flex; flex-direction:column; flex:1; }
.fcast-label { font-size:13px; font-weight:600; color:rgba(255,255,255,0.3);
  text-transform:uppercase; letter-spacing:0.18em; margin-bottom:20px; }
.fcast-row { display:flex; gap:0; flex:1; align-items:stretch; }

.day-card { flex:1; display:flex; flex-direction:column; align-items:center;
  gap:16px; padding:22px 14px; border-right:1px solid rgba(255,255,255,0.09);
  border-radius:16px; }
.day-card:last-child { border-right:none; }

.day-name { font-size:56px; font-weight:800; color:rgba(255,255,255,0.45);
  text-transform:uppercase; letter-spacing:0.03em; }
.day-name.today { color:#fff; }

.weather-icon { width:120px; height:120px; }
.weather-icon svg { width:100%; height:100%; }

.hi-lo { display:flex; flex-direction:column; align-items:center; gap:6px; }
.t-hi { font-size:72px; font-weight:800; color:#fff; line-height:1; }
.t-lo { font-size:52px; font-weight:400; color:rgba(255,255,255,0.7); line-height:1; }

/* ── METRICS BAR ── */
.metrics { position:absolute; bottom:0; left:36px; right:36px;
  background:rgba(10,22,40,0.68); backdrop-filter:blur(20px);
  border-top:1px solid rgba(255,255,255,0.10);
  padding:20px 56px; display:flex; }
.metric { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;
  border-right:1px solid rgba(255,255,255,0.09); padding:0 32px; }
.metric:last-child { border-right:none; }
.metric-label { font-size:14px; font-weight:500; color:rgba(255,255,255,0.38);
  text-transform:uppercase; letter-spacing:0.12em; }
.metric-value { font-size:28px; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px; }
.metric-value .unit { font-size:15px; font-weight:400; color:rgba(255,255,255,0.5); }
.metric-icon { width:24px; height:24px; opacity:0.7; }
</style>
</head>
<body>

<div class="time-badge">
  <div class="time-display">${timeStr} <span class="ampm">${ampm}</span></div>
  <div class="date-display">${dateStr}</div>
</div>

<div class="card">
  <div class="current">
    <div class="loc">${cityDisplay}</div>
    <div class="dt">${dateStr}</div>
    <div class="temp-main">${temp}<span class="deg">°</span></div>
    <div class="cond">${condition}</div>
    <div class="fl">Feels like ${feelsLike}°F</div>
  </div>
  <div class="forecast">
    <div class="fcast-label">7-Day Forecast</div>
    <div class="fcast-row">${fcHtml}</div>
  </div>
</div>

<div class="metrics">
  <div class="metric">
    <div class="metric-label">Humidity</div>
    <div class="metric-value">
      <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
      ${humidity}<span class="unit">%</span>
    </div>
  </div>
  <div class="metric">
    <div class="metric-label">Wind</div>
    <div class="metric-value">
      <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
      ${windmph} <span class="unit">mph ${windDir}</span>
    </div>
  </div>
  <div class="metric">
    <div class="metric-label">UV Index</div>
    <div class="metric-value">
      <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      ${uvIndex}
    </div>
  </div>
  <div class="metric">
    <div class="metric-label">Visibility</div>
    <div class="metric-value">
      <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      ${visibility} <span class="unit">mi</span>
    </div>
  </div>
  <div class="metric">
    <div class="metric-label">Pressure</div>
    <div class="metric-value">
      <svg class="metric-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
      ${pressure} <span class="unit">in</span>
    </div>
  </div>
</div>

</body>
</html>`
  };
}
