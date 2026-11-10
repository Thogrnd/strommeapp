/* Strømmeapp – søk på tvers av strømmetjenester + se senere-liste.
   Alt lagres lokalt i nettleseren (localStorage). Data fra TMDB / JustWatch. */
'use strict';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const SPRAAK = 'nb-NO';
const CACHE_TID = 12 * 60 * 60 * 1000; // 12 timer
const CACHE_MAKS = 400;

const KATEGORIER = [
  ['flatrate', 'Inkludert i abonnement'],
  ['free', 'Gratis'],
  ['ads', 'Gratis med reklame'],
  ['rent', 'Leie'],
  ['buy', 'Kjøp'],
];
const STROMMING = ['flatrate', 'free', 'ads'];

/* Søkelenker per tjeneste. Åpner tjenestens eget søk med tittelen ferdig utfylt.
   Ukjente tjenester bruker TMDB/JustWatch-siden, som har direkte lenker. */
const SOKELENKER = [
  [/^netflix/, 'https://www.netflix.com/search?q='],
  [/^nrk/, 'https://tv.nrk.no/sok?q='],
  [/^disney/, 'https://www.disneyplus.com/search?q='],
  [/^(hbo )?max$/, 'https://play.max.com/search?q='],
  [/^(amazon )?prime video$/, 'https://www.primevideo.com/search/?phrase='],
  [/^tv ?2/, 'https://play.tv2.no/sok?q='],
  [/^viaplay/, 'https://viaplay.no/sok?query='],
  [/^apple tv/, 'https://tv.apple.com/no/search?term='],
  [/^youtube/, 'https://www.youtube.com/results?search_query='],
];

/* ---------- Lagring ---------- */
const lagre = (k, v) => { try { localStorage.setItem('sa.' + k, JSON.stringify(v)); } catch (e) { /* full eller blokkert */ } };
const hent = (k, std) => {
  try { const v = localStorage.getItem('sa.' + k); return v === null ? std : JSON.parse(v); } catch (e) { return std; }
};

const S = {
  token: hent('token', ''),
  land: hent('land', 'NO'),
  mine: hent('mine', []),          // [{id, navn}]
  liste: hent('liste', []),        // [{key, id, type, tittel, aar, plakat, lagtTil}]
  bareMine: hent('bareMine', true),
  listeFilter: 'alle',
  cache: hent('cache', {}),        // key -> {at, land, data}
  tjenester: [],                   // alle tjenester i valgt land
};

/* ---------- Hjelpere ---------- */
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kanon = (navn) => String(navn || '').toLowerCase()
  .replace(/\s+(standard|basic)?\s*with ads$/, '')
  .replace(/\s+med reklame$/, '')
  .trim();
const nok = (key) => S.liste.some((x) => x.key === key);
const plakatUrl = (sti, str = 'w185') => (sti ? IMG + str + sti : '');
const logoUrl = (sti) => (sti ? IMG + 'w92' + sti : '');

function erMin(p) {
  const k = kanon(p.provider_name);
  return S.mine.some((m) => m.id === p.provider_id || kanon(m.navn) === k);
}

function sokelenke(p, tittel) {
  const k = kanon(p.provider_name);
  for (const [re, url] of SOKELENKER) if (re.test(k)) return url + encodeURIComponent(tittel);
  return null;
}

function setStatus(el, tekst, type) {
  el.textContent = tekst || '';
  el.classList.toggle('feil', type === 'feil');
  el.classList.toggle('ok', type === 'ok');
}

/* ---------- TMDB ---------- */
async function api(sti, params = {}) {
  if (!S.token) throw new Error('MANGLER_NOKKEL');
  const url = new URL(API + sti);
  const headers = { accept: 'application/json' };
  const t = S.token.trim();
  if (t.includes('.') && t.length > 40) headers.Authorization = 'Bearer ' + t;
  else url.searchParams.set('api_key', t);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const r = await fetch(url, { headers });
  if (r.status === 401) throw new Error('UGYLDIG_NOKKEL');
  if (!r.ok) throw new Error('HTTP_' + r.status);
  return r.json();
}

function feiltekst(e) {
  if (e.message === 'MANGLER_NOKKEL') return 'Legg inn TMDB-nøkkelen under Tjenester først.';
  if (e.message === 'UGYLDIG_NOKKEL') return 'TMDB godtok ikke nøkkelen. Sjekk den under Tjenester.';
  if (e instanceof TypeError) return 'Fikk ikke kontakt med TMDB. Sjekk nettforbindelsen.';
  return 'Noe gikk galt (' + e.message + '). Prøv igjen.';
}

let cacheLagreTimer;
function lagreCacheSnart() {
  clearTimeout(cacheLagreTimer);
  cacheLagreTimer = setTimeout(() => {
    const n = Object.entries(S.cache).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAKS);
    S.cache = Object.fromEntries(n);
    lagre('cache', S.cache);
  }, 400);
}

/* Henter hvor en tittel finnes i valgt land. */
async function tilbydere(type, id) {
  const key = type + ':' + id;
  const c = S.cache[key];
  if (c && c.land === S.land && Date.now() - c.at < CACHE_TID) return c.data;
  const svar = await api(`/${type}/${id}/watch/providers`);
  const data = (svar.results && svar.results[S.land]) || {};
  S.cache[key] = { at: Date.now(), land: S.land, data };
  lagreCacheSnart();
  return data;
}

function oppsummer(data) {
  const mine = [], andre = [], sett = new Set();
  for (const kat of STROMMING) {
    for (const p of data[kat] || []) {
      const k = kanon(p.provider_name);
      if (sett.has(k)) continue;
      sett.add(k);
      (erMin(p) ? mine : andre).push(p);
    }
  }
  const leieKjop = (data.rent || []).length + (data.buy || []).length > 0;
  return { mine, andre, leieKjop, lenke: data.link || '' };
}

function tittelInfo(r) {
  const type = r.media_type || r.type || (r.title !== undefined ? 'movie' : 'tv');
  const tittel = r.title || r.name || r.tittel || '';
  const dato = r.release_date || r.first_air_date || '';
  return {
    key: type + ':' + r.id,
    id: r.id,
    type,
    tittel,
    aar: r.aar || (dato ? dato.slice(0, 4) : ''),
    plakat: r.poster_path !== undefined ? r.poster_path : r.plakat,
    oversikt: r.overview || '',
  };
}

/* ---------- Visning: felles kort ---------- */
function plakatHtml(t, klasse = '') {
  const url = plakatUrl(t.plakat);
  return `<button type="button" class="plakat ${klasse}" data-detalj="${esc(t.key)}" aria-label="Detaljer om ${esc(t.tittel)}">` +
    (url ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span>${esc(t.tittel)}</span>`) + '</button>';
}

function tagHtml(p, min) {
  const logo = logoUrl(p.logo_path);
  return `<span class="tag${min ? '' : ' annen'}">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${esc(p.provider_name)}</span>`;
}

function aapneKnapp(t, sum) {
  const p = sum.mine[0];
  if (p) {
    const url = sokelenke(p, t.tittel) || sum.lenke;
    if (url) return `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Åpne i ${esc(p.provider_name)}</a>`;
  }
  if (sum.lenke) return `<a class="btn primary" href="${esc(sum.lenke)}" target="_blank" rel="noopener">Se hvor</a>`;
  return '';
}

function listeKnapp(t) {
  const har = nok(t.key);
  return `<button type="button" class="btn icon${har ? ' on' : ''}" data-liste="${esc(t.key)}" aria-pressed="${har}" aria-label="${har ? 'Fjern fra se senere' : 'Legg til i se senere'}">` +
    (har
      ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
      : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>') +
    '</button>';
}

function treffHtml(t, sum) {
  const typeTekst = t.type === 'movie' ? 'Film' : 'Serie';
  const meta = [typeTekst, t.aar].filter(Boolean).join(' · ');
  let tags = sum.mine.map((p) => tagHtml(p, true)).join('') + sum.andre.map((p) => tagHtml(p, false)).join('');
  if (!tags) tags = `<span class="meta">${sum.leieKjop ? 'Kun leie eller kjøp' : 'Ikke tilgjengelig for strømming her'}</span>`;
  return `<article class="treff">
    ${plakatHtml(t)}
    <div class="treff-body">
      <h3><button type="button" data-detalj="${esc(t.key)}">${esc(t.tittel)}</button></h3>
      <p class="meta">${esc(meta)}</p>
      <div class="tags">${tags}</div>
      <div class="handling">${aapneKnapp(t, sum)}${listeKnapp(t)}</div>
    </div>
  </article>`;
}

/* Husker titler som vises, så detaljvinduet og lista har data. */
const kjente = new Map();
function husk(t) { kjente.set(t.key, Object.assign(kjente.get(t.key) || {}, t)); return kjente.get(t.key); }

/* ---------- SØK ---------- */
let sokNr = 0;
let sokTimer;

async function sok(q) {
  const nr = ++sokNr;
  const status = $('#sok-status');
  const ut = $('#sok-resultat');
  q = q.trim();
  if (!q) { setStatus(status, ''); visPopulaert(); return; }
  if (!S.token) { setStatus(status, ''); ut.innerHTML = trengerNokkel(); return; }
  setStatus(status, 'Søker …');
  try {
    const svar = await api('/search/multi', { query: q, language: SPRAAK, include_adult: 'false' });
    if (nr !== sokNr) return;
    const titler = (svar.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 20).map((r) => husk(tittelInfo(r)));
    if (!titler.length) { setStatus(status, `Ingen treff på «${q}».`); ut.innerHTML = ''; return; }
    const sums = await Promise.all(titler.map((t) => tilbydere(t.type, t.id).then(oppsummer).catch(() => oppsummer({}))));
    if (nr !== sokNr) return;
    const mine = [], andre = [], ingen = [];
    titler.forEach((t, i) => {
      const s = sums[i];
      (s.mine.length ? mine : s.andre.length ? andre : ingen).push([t, s]);
    });
    let html = '';
    if (!S.mine.length) html += `<p class="varsel"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>Velg tjenestene dine under Tjenester, så havner treffene du har tilgang til øverst.</p>`;
    if (mine.length) html += gruppe('På dine tjenester', mine);
    if (!S.bareMine) {
      if (andre.length) html += gruppe('På andre tjenester', andre);
      if (ingen.length) html += gruppe('Ikke inkludert i noen abonnement', ingen);
    }
    const skjult = andre.length + ingen.length;
    if (S.bareMine && !mine.length) {
      html += `<div class="tomt">Ingen av treffene finnes på dine tjenester.<br><button type="button" class="btn ghost" data-vis-alle>Vis alle ${skjult} treff</button></div>`;
    } else if (S.bareMine && skjult) {
      html += `<div class="tomt"><button type="button" class="btn ghost" data-vis-alle>Vis ${skjult} treff på andre tjenester</button></div>`;
    }
    setStatus(status, '');
    ut.innerHTML = html;
  } catch (e) {
    if (nr !== sokNr) return;
    setStatus(status, feiltekst(e), 'feil');
  }
}

function gruppe(overskrift, par) {
  return `<div class="gruppe"><p class="caps">${esc(overskrift)}</p>${par.map(([t, s]) => treffHtml(t, s)).join('')}</div>`;
}

function trengerNokkel() {
  return `<div class="tomt">For å søke trenger appen en gratis TMDB-nøkkel.<br><a class="btn primary" href="#tjenester">Sett opp</a></div>`;
}

async function visPopulaert() {
  const ut = $('#sok-resultat');
  const nr = sokNr;
  if (!S.token) { ut.innerHTML = trengerNokkel(); return; }
  if (!S.mine.length) {
    ut.innerHTML = `<div class="tomt">Søk etter en film eller serie.<br>Tips: Velg tjenestene dine under Tjenester først.<br><a class="btn ghost" href="#tjenester">Velg tjenester</a></div>`;
    return;
  }
  ut.innerHTML = '<p class="status">Henter populært på dine tjenester …</p>';
  try {
    const params = {
      watch_region: S.land, with_watch_providers: S.mine.map((m) => m.id).join('|'),
      with_watch_monetization_types: 'flatrate|free|ads', sort_by: 'popularity.desc', language: SPRAAK,
    };
    const [tv, film] = await Promise.all([api('/discover/tv', params), api('/discover/movie', params)]);
    if (nr !== sokNr) return;
    const hylle = (liste, type) => liste.slice(0, 15).map((r) => plakatHtml(husk(tittelInfo(Object.assign({ media_type: type }, r))))).join('');
    ut.innerHTML = `<div class="gruppe"><p class="caps">Populære serier hos deg</p><div class="hylle">${hylle(tv.results || [], 'tv')}</div></div>
      <div class="gruppe"><p class="caps">Populære filmer hos deg</p><div class="hylle">${hylle(film.results || [], 'movie')}</div></div>`;
  } catch (e) {
    if (nr !== sokNr) return;
    ut.innerHTML = `<p class="status feil">${esc(feiltekst(e))}</p>`;
  }
}

function settFilter(bareMine) {
  S.bareMine = bareMine;
  lagre('bareMine', bareMine);
  $('#filter-mine').setAttribute('aria-pressed', String(bareMine));
  $('#filter-alle').setAttribute('aria-pressed', String(!bareMine));
  if ($('#sok').value.trim()) sok($('#sok').value);
}

/* ---------- SE SENERE ---------- */
function toggleListe(key) {
  const i = S.liste.findIndex((x) => x.key === key);
  if (i >= 0) S.liste.splice(i, 1);
  else {
    const t = kjente.get(key);
    if (!t) return;
    S.liste.unshift({ key: t.key, id: t.id, type: t.type, tittel: t.tittel, aar: t.aar, plakat: t.plakat, lagtTil: Date.now() });
  }
  lagre('liste', S.liste);
  oppdaterListeKnapper(key);
  if (aktivFane === 'liste') visListe();
}

function oppdaterListeKnapper(key) {
  document.querySelectorAll('[data-liste]').forEach((b) => {
    if (b.dataset.liste !== key) return;
    const t = kjente.get(key) || S.liste.find((x) => x.key === key);
    if (t) b.outerHTML = listeKnapp(t);
  });
}

let listeNr = 0;
async function visListe() {
  const nr = ++listeNr;
  const ut = $('#liste-innhold');
  const status = $('#liste-status');
  $('#liste-antall').textContent = S.liste.length ? `${S.liste.length} ${S.liste.length === 1 ? 'tittel' : 'titler'}` : '';
  if (!S.liste.length) {
    $('#liste-filter').innerHTML = '';
    setStatus(status, '');
    ut.innerHTML = '<div class="tomt">Lista er tom. Trykk + på en tittel i søket for å legge den her.</div>';
    return;
  }
  S.liste.forEach((x) => husk(x));
  if (!S.token) { ut.innerHTML = trengerNokkel(); return; }
  setStatus(status, 'Oppdaterer …');
  const sums = await Promise.all(S.liste.map((t) => tilbydere(t.type, t.id).then(oppsummer).catch(() => null)));
  if (nr !== listeNr) return;
  setStatus(status, sums.some((s) => s === null) ? 'Fikk ikke oppdatert alle titlene. Prøv igjen senere.' : '', sums.some((s) => s === null) ? 'feil' : '');

  // Filterknapper: tjenester du har som finnes i lista
  const navn = new Map();
  sums.forEach((s) => s && s.mine.forEach((p) => navn.set(kanon(p.provider_name), p.provider_name)));
  if (S.listeFilter !== 'alle' && !navn.has(S.listeFilter)) S.listeFilter = 'alle';
  const knapp = (k, tekst) => `<button type="button" class="chip" data-lfilter="${esc(k)}" aria-pressed="${S.listeFilter === k}">${esc(tekst)}</button>`;
  $('#liste-filter').innerHTML = navn.size ? knapp('alle', 'Alle') + [...navn].map(([k, v]) => knapp(k, v)).join('') : '';

  const mine = [], andre = [];
  S.liste.forEach((t, i) => {
    const s = sums[i] || oppsummer({});
    if (S.listeFilter !== 'alle') {
      if (s.mine.some((p) => kanon(p.provider_name) === S.listeFilter)) mine.push([t, s]);
      return;
    }
    (s.mine.length ? mine : andre).push([t, s]);
  });
  let html = '';
  if (mine.length) html += gruppe(S.listeFilter === 'alle' ? 'Klar til å se' : 'På ' + navn.get(S.listeFilter), mine);
  if (andre.length) html += gruppe('Ikke på dine tjenester nå', andre);
  ut.innerHTML = html;
}

/* ---------- DETALJER ---------- */
async function visDetalj(key) {
  const t = kjente.get(key) || S.liste.find((x) => x.key === key);
  if (!t) return;
  const dlg = $('#detalj');
  const ut = $('#d-innhold');
  const typeTekst = t.type === 'movie' ? 'Film' : 'Serie';
  const topp = `<div class="d-topp">${plakatHtml(t)}<div class="treff-body"><h2 id="d-tittel">${esc(t.tittel)}</h2><p class="meta">${esc([typeTekst, t.aar].filter(Boolean).join(' · '))}</p></div></div>`;
  ut.innerHTML = topp + '<p class="status">Henter …</p>';
  if (!dlg.open) dlg.showModal();
  try {
    const [info, data] = await Promise.all([
      t.oversikt ? Promise.resolve({ overview: t.oversikt }) : api(`/${t.type}/${t.id}`, { language: SPRAAK }).catch(() => ({})),
      tilbydere(t.type, t.id),
    ]);
    if (info.overview && !t.oversikt) t.oversikt = info.overview;
    const sum = oppsummer(data);
    let html = topp;
    if (t.oversikt) html += `<p class="oversikt">${esc(t.oversikt)}</p>`;
    html += `<div class="handling">${aapneKnapp(t, sum)}${listeKnapp(t)}</div>`;
    let noe = false;
    for (const [kat, tekst] of KATEGORIER) {
      const ps = data[kat] || [];
      if (!ps.length) continue;
      noe = true;
      html += `<div class="d-seksjon"><p class="caps">${esc(tekst)}</p><div class="tags">${ps.map((p) => {
        const url = sokelenke(p, t.tittel) || data.link;
        const tag = tagHtml(p, erMin(p));
        return url ? tag.replace('<span class="tag', `<a href="${esc(url)}" target="_blank" rel="noopener" class="tag`).replace(/<\/span>$/, '</a>') : tag;
      }).join('')}</div></div>`;
    }
    if (!noe) html += `<p class="meta">Ikke tilgjengelig i ${esc(landNavn(S.land))} akkurat nå.</p>`;
    if (data.link) html += `<a class="btn ghost full" href="${esc(data.link)}" target="_blank" rel="noopener">Alle direktelenker (JustWatch)</a>`;
    ut.innerHTML = html;
  } catch (e) {
    ut.innerHTML = topp + `<p class="status feil">${esc(feiltekst(e))}</p>`;
  }
}

/* ---------- TJENESTER / INNSTILLINGER ---------- */
const LAND_STD = { NO: 'Norge', SE: 'Sverige', DK: 'Danmark', FI: 'Finland', GB: 'Storbritannia', US: 'USA', DE: 'Tyskland', ES: 'Spania' };
let landListe = null;
const landNavn = (kode) => (landListe && landListe[kode]) || LAND_STD[kode] || kode;

function fyllLand() {
  const sel = $('#land');
  const liste = Object.entries(landListe || LAND_STD).sort((a, b) => (a[0] === 'NO' ? -1 : b[0] === 'NO' ? 1 : a[1].localeCompare(b[1], 'nb')));
  sel.innerHTML = liste.map(([k, v]) => `<option value="${esc(k)}"${k === S.land ? ' selected' : ''}>${esc(v)} (${esc(k)})</option>`).join('');
}

async function hentLand() {
  if (!S.token || landListe) return;
  try {
    const svar = await api('/watch/providers/regions', { language: SPRAAK });
    landListe = {};
    (svar.results || []).forEach((r) => { landListe[r.iso_3166_1] = r.native_name || r.english_name; });
    fyllLand();
  } catch (e) { /* beholder standardlisten */ }
}

async function hentTjenester() {
  const ut = $('#tjeneste-liste');
  if (!S.token) { ut.innerHTML = '<p class="tom">Legg inn TMDB-nøkkelen over for å se tjenestene.</p>'; return; }
  ut.innerHTML = '<p class="tom">Henter tjenester …</p>';
  try {
    const [film, tv] = await Promise.all([
      api('/watch/providers/movie', { watch_region: S.land, language: SPRAAK }),
      api('/watch/providers/tv', { watch_region: S.land, language: SPRAAK }),
    ]);
    const map = new Map();
    for (const p of [...(tv.results || []), ...(film.results || [])]) {
      const k = kanon(p.provider_name);
      if (!map.has(k)) map.set(k, p);
    }
    const prio = (p) => (p.display_priorities && p.display_priorities[S.land]) ?? p.display_priority ?? 999;
    S.tjenester = [...map.values()].sort((a, b) => prio(a) - prio(b));
    visTjenester();
  } catch (e) {
    ut.innerHTML = `<p class="tom">${esc(feiltekst(e))}</p>`;
  }
}

function visTjenester() {
  const filter = kanon($('#tjeneste-filter').value);
  const valgt = (p) => erMin(p);
  const liste = S.tjenester
    .filter((p) => !filter || kanon(p.provider_name).includes(filter))
    .sort((a, b) => Number(valgt(b)) - Number(valgt(a)));
  $('#valgt-antall').textContent = S.mine.length ? `${S.mine.length} valgt` : '';
  $('#tjeneste-liste').innerHTML = liste.length
    ? liste.map((p) => `<label><img src="${esc(logoUrl(p.logo_path))}" alt="" loading="lazy"><span class="navn">${esc(p.provider_name)}</span><input type="checkbox" data-tjeneste="${p.provider_id}"${valgt(p) ? ' checked' : ''}></label>`).join('')
    : '<p class="tom">Fant ingen tjenester.</p>';
}

function velgTjeneste(id, paa) {
  const p = S.tjenester.find((x) => x.provider_id === id);
  if (!p) return;
  const k = kanon(p.provider_name);
  S.mine = S.mine.filter((m) => m.id !== id && kanon(m.navn) !== k);
  if (paa) S.mine.push({ id: p.provider_id, navn: p.provider_name });
  lagre('mine', S.mine);
  $('#valgt-antall').textContent = S.mine.length ? `${S.mine.length} valgt` : '';
}

async function lagreNokkel() {
  const status = $('#token-status');
  const ny = $('#token').value.trim();
  if (!ny) { setStatus(status, 'Lim inn nøkkelen først.', 'feil'); return; }
  const gammel = S.token;
  S.token = ny;
  setStatus(status, 'Tester …');
  try {
    await api('/configuration');
    lagre('token', ny);
    setStatus(status, 'Nøkkelen virker og er lagret.', 'ok');
    landListe = null;
    hentLand();
    hentTjenester();
  } catch (e) {
    S.token = gammel;
    setStatus(status, feiltekst(e), 'feil');
  }
}

function eksporter() {
  const blob = new Blob([JSON.stringify({ app: 'strommeapp', versjon: 1, liste: S.liste, mine: S.mine, land: S.land }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `strommeapp-kopi-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus($('#backup-status'), 'Kopien er lastet ned.', 'ok');
}

async function importer(fil) {
  const status = $('#backup-status');
  try {
    const d = JSON.parse(await fil.text());
    if (!d || !Array.isArray(d.liste)) throw new Error('format');
    const fantes = new Set(S.liste.map((x) => x.key));
    const nye = d.liste.filter((x) => x && x.key && x.id && x.type && !fantes.has(x.key));
    S.liste = [...S.liste, ...nye];
    lagre('liste', S.liste);
    if (Array.isArray(d.mine) && !S.mine.length) { S.mine = d.mine; lagre('mine', S.mine); visTjenester(); }
    setStatus(status, `Hentet ${nye.length} nye titler fra kopien.`, 'ok');
  } catch (e) {
    setStatus(status, 'Klarte ikke å lese filen. Er det en kopi fra denne appen?', 'feil');
  }
}

/* ---------- Navigasjon ---------- */
let aktivFane = 'sok';
function visFane() {
  const fane = (location.hash || '#sok').slice(1);
  aktivFane = ['sok', 'liste', 'tjenester'].includes(fane) ? fane : 'sok';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + aktivFane; });
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === aktivFane) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (aktivFane === 'liste') visListe();
  if (aktivFane === 'tjenester') { hentLand(); if (!S.tjenester.length) hentTjenester(); else visTjenester(); }
  if (aktivFane === 'sok') sok($('#sok').value);
}

/* ---------- Oppstart ---------- */
function init() {
  $('#token').value = S.token;
  fyllLand();
  settFilterVisning();

  $('#sok').addEventListener('input', (e) => { clearTimeout(sokTimer); sokTimer = setTimeout(() => sok(e.target.value), 350); });
  $('#sok').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(sokTimer); sok(e.target.value); e.target.blur(); } });
  $('#filter-mine').addEventListener('click', () => settFilter(true));
  $('#filter-alle').addEventListener('click', () => settFilter(false));

  $('#token-vis').addEventListener('click', () => {
    const f = $('#token');
    f.type = f.type === 'password' ? 'text' : 'password';
    $('#token-vis').textContent = f.type === 'password' ? 'Vis' : 'Skjul';
  });
  $('#token-lagre').addEventListener('click', lagreNokkel);
  $('#land').addEventListener('change', (e) => {
    S.land = e.target.value;
    lagre('land', S.land);
    hentTjenester();
  });
  $('#tjeneste-filter').addEventListener('input', visTjenester);
  $('#tjeneste-liste').addEventListener('change', (e) => {
    const id = Number(e.target.dataset.tjeneste);
    if (id) velgTjeneste(id, e.target.checked);
  });
  $('#eksport').addEventListener('click', eksporter);
  $('#import').addEventListener('change', (e) => { if (e.target.files[0]) importer(e.target.files[0]); e.target.value = ''; });

  // Felles klikk: detaljer, se senere, filter
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-detalj]');
    if (d) { visDetalj(d.dataset.detalj); return; }
    const l = e.target.closest('[data-liste]');
    if (l) { toggleListe(l.dataset.liste); return; }
    const f = e.target.closest('[data-lfilter]');
    if (f) { S.listeFilter = f.dataset.lfilter; visListe(); return; }
    if (e.target.closest('[data-vis-alle]')) settFilter(false);
  });
  const dlg = $('#detalj');
  $('#d-lukk').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { if (aktivFane === 'liste') visListe(); });

  window.addEventListener('hashchange', visFane);
  if (!S.token && !location.hash) location.hash = '#tjenester';
  visFane();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function settFilterVisning() {
  $('#filter-mine').setAttribute('aria-pressed', String(S.bareMine));
  $('#filter-alle').setAttribute('aria-pressed', String(!S.bareMine));
}

init();
