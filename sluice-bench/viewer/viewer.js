// The stills viewer: one title (a moment at a window size) at a time, every run's still side by side under its blind
// letter. ← and → move between titles; click a still to zoom (Esc closes); 0-3 rates it (stored in this browser);
// Export downloads the ratings as {code: rating}, the form tally.mjs reads as human.json.
(() => {
  const data = window.STILLS;
  const KEY = `stills-ratings-${data.item}`;
  const ratings = JSON.parse(localStorage.getItem(KEY) || '{}');
  const main = document.querySelector('main');
  const titleEl = document.querySelector('.title');
  const posEl = document.querySelector('.pos');
  let i = Number(location.hash.slice(1)) || 0;

  const save = () => { localStorage.setItem(KEY, JSON.stringify(ratings)); rated(); };
  const rated = () => { document.querySelector('.rated').textContent = `${Object.keys(ratings).length} of ${data.titles.reduce((s, t) => s + t.stills.length, 0)} rated`; };

  function show(n) {
    i = (n + data.titles.length) % data.titles.length;
    location.hash = String(i);
    const t = data.titles[i];
    titleEl.textContent = t.title;
    posEl.textContent = `${i + 1} / ${data.titles.length}`;
    main.replaceChildren(...t.stills.map((s) => {
      const fig = document.createElement('figure');
      const img = new Image();
      img.src = s.src; img.alt = `${t.title}, still ${s.letter}`; img.loading = 'eager';
      img.addEventListener('click', () => fig.classList.toggle('zoomed'));
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<span class="letter">${s.letter}</span><span class="code">${s.code}</span><span class="rate"></span>`;
      const rate = cap.querySelector('.rate');
      for (const v of [0, 1, 2, 3]) {
        const b = document.createElement('button');
        b.textContent = String(v); b.title = ['wrong or unreadable', 'weak', 'good', 'excellent'][v];
        if (ratings[s.code] === v) b.classList.add('on');
        b.addEventListener('click', (e) => { e.stopPropagation(); ratings[s.code] = v; save(); show(i); });
        rate.append(b);
      }
      fig.append(img, cap);
      return fig;
    }));
    // Warm the neighbours so arrowing is instant.
    for (const d of [1, -1]) for (const s of data.titles[(i + d + data.titles.length) % data.titles.length].stills) new Image().src = s.src;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Escape') document.querySelector('figure.zoomed')?.classList.remove('zoomed');
  });
  document.querySelector('.prev').addEventListener('click', () => show(i - 1));
  document.querySelector('.next').addEventListener('click', () => show(i + 1));
  document.querySelector('.cols').addEventListener('input', (e) => document.documentElement.style.setProperty('--cols', e.target.value));
  document.querySelector('.export').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ratings, null, 2) + '\n'], { type: 'application/json' }));
    a.download = 'human.json'; a.click();
  });
  rated();
  show(i);
})();
