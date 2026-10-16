// Pixel-art sprites shared by the projector screen and the phone badge.
// X = body, S = snout, K = eye, D = shade (coin slot / legs)
window.PIG = [
  '......XX....',
  '..XXDDXXXX..',
  '.XXXXXXXXKX.',
  'XXXXXXXXXXSS',
  '.XXXXXXXXXSS',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '..DD....DD..',
];

window.shade = function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

function pigColors(color) {
  return { X: color, S: shade(color, 0.45), K: '#111111', D: shade(color, -0.45) };
}

// Draw the pig on a canvas. (x, y) = top-left, px = size of one pixel, flip = face left.
window.drawPig = function drawPig(ctx, x, y, px, color, flip) {
  const colors = pigColors(color);
  const w = PIG[0].length;
  PIG.forEach((row, r) => {
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = colors[ch];
      const cx = flip ? w - 1 - c : c;
      ctx.fillRect(Math.round(x + cx * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  });
};

window.pigSvg = function pigSvg(color, px, ox, oy) {
  const colors = pigColors(color);
  let out = '';
  PIG.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== '.') out += `<rect x="${ox + c * px}" y="${oy + r * px}" width="${px}" height="${px}" fill="${colors[ch]}"/>`;
    });
  });
  return out;
};

// CyberWeek hacker logo (badge centerpiece). O outline, g/G greens, C cream, K hood, B/E eye, L blue edge, W white, S/s laptop
window.HACKER = [
  '............OO............',
  '........OOOggggOOO........',
  '.......OgggGKKGgggO.......',
  '.....OOgGGGKKKKCCCgOO.....',
  '....OggGGGKKKKKKGCGggO....',
  '....OCCGGKKKKKKKKGGGgO....',
  '...OgCCGGKKLLLLKKGGGGgO...',
  '...OCCGGKKLKKKKLKKGGGgO...',
  '..OCCCGGKLKKEEKKLKGCCGgO..',
  '..OgCCGGKLKEBBEKLKGCCGgO..',
  '..OgCCGGKLKEBBEKLKGGCGgO..',
  '..OgGGGGKKLKEEKLKKGGCggO..',
  '..OgGGGGKKKLKKLKKKGGCggO..',
  '..OgGCCKKKKKLLKKKKKCgggO..',
  '..OgGKKKKKKKKKKKKKKKKggO..',
  '...KKLLKKKKKKKKKKKKKKLLKK.',
  '..KLKKKKKKKKKKKKKKKKKKKKLK',
  '.KLKKKKKKWKKKKKKWKKKKKKLK.',
  '.KLKKKSSSSSSSSSSSSSSKKKLK.',
  '.KLKKKSssssssssssssSKKKLK.',
  '.KLKKKSssssssssssssSKKKLK.',
  '.KLKKKSsssssWWsssssSKKKLK.',
  '.KLKKKSsssssWWsssssSKKKLK.',
  '.KLKKKSssssssssssssSKKKLK.',
];
window.HACKER_COLORS = { O: '#0e1014', g: '#1e6e37', G: '#46aa55', C: '#f0e2be', K: '#121418', B: '#1fa3e8', E: '#7fd0ff', L: '#5fc8f5', W: '#ebf0f0', S: '#8a96a3', s: '#5f6973' };

window.hackerSvg = function hackerSvg(px, ox, oy) {
  let out = '';
  HACKER.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== '.') out += `<rect x="${ox + c * px}" y="${oy + r * px}" width="${px}" height="${px}" fill="${HACKER_COLORS[ch]}"/>`;
    });
  });
  return out;
};

const escapeXml = (s) => String(s).replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));

// The LinkedIn badge, as an SVG string (BADGE_W × BADGE_H).
window.BADGE_W = 600;
window.BADGE_H = 720;
window.badgeSvg = function badgeSvg({ name, points, color, eventName, talkTitle }) {
  const year = new Date().getFullYear();
  const hex = (r) => [[300, 300 - r], [300 + r * 0.866, 300 - r / 2], [300 + r * 0.866, 300 + r / 2], [300, 300 + r], [300 - r * 0.866, 300 + r / 2], [300 - r * 0.866, 300 - r / 2]]
    .map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
  const fit = (text, max, width) => (text.length > max ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : '');

  let grid = '';
  for (let i = -7; i <= 7; i++) grid += `<line x1="${300 + i * 20}" y1="320" x2="${300 + i * 100}" y2="430" />`;
  for (const y of [330, 345, 368, 400]) grid += `<line x1="40" y1="${y}" x2="560" y2="${y}" />`;
  let stripes = '';
  for (const [y, h] of [[276, 4], [290, 6], [305, 8]]) stripes += `<rect x="200" y="${y}" width="200" height="${h}" fill="#0b1f33"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720" viewBox="0 0 600 720">
  <defs>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f08a1c"/></linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f33"/><stop offset="1" stop-color="#173a4a"/></linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient>
    <clipPath id="inner"><polygon points="${hex(220)}"/></clipPath>
  </defs>
  <rect x="4" y="4" width="592" height="712" rx="36" fill="#06161b" stroke="#ffc94a" stroke-width="4"/>
  <polygon points="${hex(252)}" fill="#fff8e6"/>
  <polygon points="${hex(240)}" fill="url(#rim)"/>
  <polygon points="${hex(220)}" fill="url(#sky)"/>
  <g clip-path="url(#inner)">
    <circle cx="300" cy="255" r="90" fill="url(#sun)"/>
    ${stripes}
    <rect x="0" y="320" width="600" height="220" fill="#0b1f33"/>
    <g stroke="#2ee59d" stroke-width="2" opacity="0.75">${grid}</g>
    <g fill="#ffffff" opacity="0.9"><rect x="170" y="220" width="6" height="6"/><rect x="420" y="200" width="6" height="6"/><rect x="200" y="180" width="4" height="4"/><rect x="410" y="270" width="4" height="4"/></g>
    <g fill="#ffc94a"><circle cx="170" cy="306" r="10"/><circle cx="430" cy="306" r="10"/><circle cx="142" cy="314" r="6"/><circle cx="458" cy="314" r="6"/></g>
    <text x="300" y="484" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="18" letter-spacing="3" fill="#2ee59d">${points} PTS</text>
  </g>
  <text x="300" y="150" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="20" letter-spacing="4" fill="#ffffff">${year} · PBSC</text>
  ${pigSvg(color || '#ff5fa2', 14, 216, 200)}
  <polygon points="14,372 46,362 46,446 14,436 30,404" fill="#0f6b3d"/>
  <polygon points="586,372 554,362 554,446 586,436 570,404" fill="#0f6b3d"/>
  <rect x="40" y="350" width="520" height="96" rx="6" fill="#1fa35f"/>
  <rect x="40" y="350" width="520" height="10" rx="4" fill="#6ff0b0"/>
  <text x="300" y="390" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="20" fill="#ffffff" stroke="#0b4a2b" stroke-width="2" paint-order="stroke" textLength="470" lengthAdjust="spacingAndGlyphs">THANK YOU FOR PARTICIPATING IN THE</text>
  <text x="300" y="432" text-anchor="middle" font-family="'Arial Black', Impact, sans-serif" font-size="32" fill="#ffffff" stroke="#0b4a2b" stroke-width="2" paint-order="stroke" textLength="460" lengthAdjust="spacingAndGlyphs">CYBERWEEK CONFERENCE</text>
  <text x="300" y="612" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="34" fill="#ffc94a"${fit(name, 22, 520)}>${escapeXml(name)}</text>
  <text x="300" y="650" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#eafff6"${fit(talkTitle, 52, 520)}>${escapeXml(talkTitle)}</text>
  <text x="300" y="684" text-anchor="middle" font-family="'Arial Black', Arial, sans-serif" font-size="13" letter-spacing="2" fill="#2ee59d"${fit(eventName, 48, 520)}>${escapeXml(eventName.toUpperCase())}</text>
</svg>`;
};

window.svgToPng = function svgToPng(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = BADGE_W * scale;
      c.height = BADGE_H * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
};
