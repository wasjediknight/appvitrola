const config = window.SPOTIFY_CONFIG || {};
const scopes = [
  'user-read-private'
];

const els = {
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  loadBtn: document.getElementById('loadBtn'),
  spotifyUrl: document.getElementById('spotifyUrl'),
  coverImage: document.getElementById('coverImage'),
  coverOnDisc: document.getElementById('coverOnDisc'),
  typeBadge: document.getElementById('typeBadge'),
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  artist: document.getElementById('artist'),
  album: document.getElementById('album'),
  spotifyEmbed: document.getElementById('spotifyEmbed'),
  openSpotify: document.getElementById('openSpotify'),
  statusText: document.getElementById('statusText'),
  vinyl: document.getElementById('vinyl')
};

function setStatus(text) {
  els.statusText.textContent = text;
}

function extractSpotifyResource(url) {
  try {
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (!['track', 'album'].includes(type) || !id) return null;
    return { type, id: id.split('?')[0], url: parsed.toString() };
  } catch {
    return null;
  }
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(arrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  const cryptoArray = new Uint8Array(length);
  crypto.getRandomValues(cryptoArray);
  cryptoArray.forEach(x => { text += possible[x % possible.length]; });
  return text;
}

async function loginWithSpotify() {
  if (!config.clientId || config.clientId.includes('COLOQUE_SEU_CLIENT_ID')) {
    setStatus('Preencha o clientId em config.js antes de autenticar.');
    alert('Edite o arquivo config.js com seu clientId e redirectUri.');
    return;
  }

  const verifier = generateRandomString(64);
  const challenge = base64UrlEncode(await sha256(verifier));
  localStorage.setItem('spotify_code_verifier', verifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: scopes.join(' ')
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('spotify_code_verifier');
  if (!verifier) throw new Error('Code verifier não encontrado.');

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    throw new Error('Falha ao trocar o código por token.');
  }

  const data = await response.json();
  const expiresAt = Date.now() + (data.expires_in * 1000);
  localStorage.setItem('spotify_access_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_expires_at', String(expiresAt));
  return data.access_token;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) return null;
  const data = await response.json();
  const expiresAt = Date.now() + (data.expires_in * 1000);
  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_expires_at', String(expiresAt));
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
  return data.access_token;
}

async function getValidAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = Number(localStorage.getItem('spotify_expires_at') || 0);
  if (token && Date.now() < expiresAt - 60_000) return token;
  return refreshAccessToken();
}

function updateAuthUI(isLoggedIn) {
  els.loginBtn.hidden = isLoggedIn;
  els.logoutBtn.hidden = !isLoggedIn;
}

function logout() {
  [
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_expires_at',
    'spotify_code_verifier'
  ].forEach(key => localStorage.removeItem(key));
  updateAuthUI(false);
  setStatus('Sessão encerrada.');
}

async function spotifyFetch(path) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Você precisa entrar com Spotify primeiro.');

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Erro Spotify (${response.status}): ${body}`);
  }

  return response.json();
}

function normalizeMeta(type, data, originalUrl) {
  if (type === 'track') {
    return {
      kind: 'Música',
      title: data.name,
      artist: data.artists?.map(a => a.name).join(', ') || '—',
      album: data.album?.name || '—',
      cover: data.album?.images?.[0]?.url || '',
      embed: `https://open.spotify.com/embed/track/${data.id}?utm_source=generator`,
      openUrl: originalUrl || data.external_urls?.spotify || '#'
    };
  }

  return {
    kind: 'Álbum',
    title: data.name,
    artist: data.artists?.map(a => a.name).join(', ') || '—',
    album: data.name,
    cover: data.images?.[0]?.url || '',
    embed: `https://open.spotify.com/embed/album/${data.id}?utm_source=generator`,
    openUrl: originalUrl || data.external_urls?.spotify || '#'
  };
}

function renderMeta(meta) {
  els.typeBadge.textContent = meta.kind;
  els.title.textContent = meta.title;
  els.subtitle.textContent = meta.kind === 'Música'
    ? 'A capa foi aplicada no disco e ao lado da vitrola.'
    : 'O álbum foi carregado com a capa no disco e no painel lateral.';
  els.artist.textContent = meta.artist;
  els.album.textContent = meta.album;
  els.coverImage.src = meta.cover;
  els.coverOnDisc.src = meta.cover;
  els.spotifyEmbed.src = meta.embed;
  els.openSpotify.href = meta.openUrl;
  els.openSpotify.hidden = false;
  els.vinyl.classList.remove('paused');
  els.vinyl.classList.add('spinning');
}

async function loadSpotifyUrl() {
  const resource = extractSpotifyResource(els.spotifyUrl.value);
  if (!resource) {
    setStatus('Cole uma URL válida de track ou album do Spotify.');
    return;
  }

  try {
    setStatus('Buscando metadados no Spotify...');
    const data = await spotifyFetch(`/${resource.type}s/${resource.id}`);
    const meta = normalizeMeta(resource.type, data, resource.url);
    renderMeta(meta);
    setStatus(`${meta.kind} carregado com sucesso.`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Não foi possível carregar o conteúdo.');
  }
}

async function bootstrapAuth() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    setStatus(`Erro no login do Spotify: ${error}`);
    return;
  }

  if (code) {
    try {
      setStatus('Finalizando login com Spotify...');
      await exchangeCodeForToken(code);
      url.searchParams.delete('code');
      window.history.replaceState({}, document.title, url.pathname);
    } catch (e) {
      console.error(e);
      setStatus('Falha na autenticação com o Spotify.');
    }
  }

  const token = await getValidAccessToken();
  updateAuthUI(Boolean(token));
  if (token) setStatus('Conectado ao Spotify. Agora cole uma URL.');
}

els.loginBtn.addEventListener('click', loginWithSpotify);
els.logoutBtn.addEventListener('click', logout);
els.loadBtn.addEventListener('click', loadSpotifyUrl);
els.spotifyUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadSpotifyUrl();
});

bootstrapAuth();
