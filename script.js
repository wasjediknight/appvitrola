const config = window.SPOTIFY_CONFIG || {};
const scopes = ['user-read-private'];

const els = {
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  loadBtn: document.getElementById('loadBtn'),
  spotifyUrl: document.getElementById('spotifyUrl'),

  coverDisc: document.getElementById('coverOverlay'),
  coverInfo: document.getElementById('coverInfo'),

  typeBadge: document.getElementById('mediaType'),
  title: document.getElementById('title'),
  subtitle: document.getElementById('description'),
  artist: document.getElementById('artist'),
  album: document.getElementById('album'),

  spotifyEmbed: document.getElementById('spotifyEmbed'),
  openSpotify: document.getElementById('spotifyLink'),

  statusText: document.getElementById('statusText'),
  vinyl: document.getElementById('vinyl'),
  tonearm: document.querySelector('.tonearm')
};

function setStatus(text) {
  if (els.statusText) {
    els.statusText.textContent = text;
  } else {
    console.log(text);
  }
}

function extractSpotifyResource(url) {
  try {
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);

    let type;
    let id;

    if (['track', 'album', 'playlist'].includes(parts[0])) {
      type = parts[0];
      id = parts[1];
    } else if (
      parts[0].startsWith('intl-') &&
      ['track', 'album', 'playlist'].includes(parts[1])
    ) {
      type = parts[1];
      id = parts[2];
    } else {
      return null;
    }

    if (!id) return null;

    return {
      type,
      id: id.split('?')[0],
      url: parsed.toString()
    };
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

  cryptoArray.forEach((x) => {
    text += possible[x % possible.length];
  });

  return text;
}

function setPlayingState(isPlaying) {
  if (!els.vinyl) return;

  if (isPlaying) {
    els.vinyl.classList.remove('paused');
    els.vinyl.classList.add('spinning');
    els.tonearm?.classList.add('playing');
  } else {
    els.vinyl.classList.add('paused');
    els.vinyl.classList.remove('spinning');
    els.tonearm?.classList.remove('playing');
  }
}

async function loginWithSpotify() {
  if (!config.clientId || !config.redirectUri) {
    setStatus('Preencha o clientId e a redirectUri em config.js antes de autenticar.');
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

  if (!verifier) {
    throw new Error('Code verifier não encontrado.');
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new Error('Falha ao trocar o código por token.');
  }

  const data = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  localStorage.setItem('spotify_access_token', data.access_token);

  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
  }

  localStorage.setItem('spotify_expires_at', String(expiresAt));

  return data.access_token;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');

  if (!refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const expiresAt = Date.now() + data.expires_in * 1000;

  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_expires_at', String(expiresAt));

  if (data.refresh_token) {
    localStorage.setItem('spotify_refresh_token', data.refresh_token);
  }

  return data.access_token;
}

async function getValidAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiresAt = Number(localStorage.getItem('spotify_expires_at') || 0);

  if (token && Date.now() < expiresAt - 60000) {
    return token;
  }

  return refreshAccessToken();
}

function updateAuthUI(isLoggedIn) {
  if (els.loginBtn) els.loginBtn.hidden = isLoggedIn;
  if (els.logoutBtn) els.logoutBtn.hidden = !isLoggedIn;
}

function clearLoadedMedia() {
  if (els.coverDisc) {
    els.coverDisc.src = 'https://placehold.co/300x300?text=Capa';
  }

  if (els.coverInfo) {
    els.coverInfo.src = 'https://placehold.co/300x300?text=Capa';
  }

  if (els.openSpotify) {
    els.openSpotify.hidden = true;
    els.openSpotify.removeAttribute('href');
  }

  if (els.spotifyEmbed) {
    els.spotifyEmbed.src = '';
  }

  if (els.typeBadge) {
    els.typeBadge.textContent = 'Música';
  }

  if (els.title) {
    els.title.textContent = 'Título do conteúdo';
  }

  if (els.subtitle) {
    els.subtitle.textContent =
      'A capa será aplicada no disco e exibida no painel lateral da vitrola.';
  }

  if (els.artist) {
    els.artist.textContent = 'Artista';
  }

  if (els.album) {
    els.album.textContent = 'Álbum';
  }
}

function logout() {
  [
    'spotify_access_token',
    'spotify_refresh_token',
    'spotify_expires_at',
    'spotify_code_verifier'
  ].forEach((key) => localStorage.removeItem(key));

  updateAuthUI(false);
  setPlayingState(false);
  clearLoadedMedia();
  setStatus('Sessão encerrada.');
}

async function spotifyFetch(path) {
  const token = await getValidAccessToken();

  if (!token) {
    throw new Error('Você precisa entrar com Spotify primeiro.');
  }

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
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
      artist: data.artists?.map((a) => a.name).join(', ') || '—',
      album: data.album?.name || '—',
      cover: data.album?.images?.[0]?.url || '',
      embed: `https://open.spotify.com/embed/track/${data.id}?utm_source=generator`,
      openUrl: originalUrl || data.external_urls?.spotify || '#'
    };
  }

  if (type === 'playlist') {
    return {
      kind: 'Playlist',
      title: data.name,
      artist: data.owner?.display_name || 'Spotify',
      album: `${data.tracks?.total || 0} faixas`,
      cover: data.images?.[0]?.url || '',
      embed: `https://open.spotify.com/embed/playlist/${data.id}?utm_source=generator`,
      openUrl: originalUrl || data.external_urls?.spotify || '#'
    };
  }

  return {
    kind: 'Álbum',
    title: data.name,
    artist: data.artists?.map((a) => a.name).join(', ') || '—',
    album: data.name,
    cover: data.images?.[0]?.url || '',
    embed: `https://open.spotify.com/embed/album/${data.id}?utm_source=generator`,
    openUrl: originalUrl || data.external_urls?.spotify || '#'
  };
}

function renderMeta(meta) {
  if (els.typeBadge) {
    els.typeBadge.textContent = meta.kind;
  }

  if (els.title) {
    els.title.textContent = meta.title;
  }

  if (els.subtitle) {
    if (meta.kind === 'Música') {
      els.subtitle.textContent =
        'A música foi carregada com a capa aplicada no disco e exibida no painel lateral.';
    } else if (meta.kind === 'Playlist') {
      els.subtitle.textContent =
        'A playlist foi carregada com a capa aplicada no disco e pronta para reprodução no player abaixo.';
    } else {
      els.subtitle.textContent =
        'O álbum foi carregado com a capa aplicada no disco e exibida no painel lateral da vitrola.';
    }
  }

  if (els.artist) {
    els.artist.textContent = meta.artist;
  }

  if (els.album) {
    els.album.textContent = meta.album;
  }

  if (els.coverDisc) {
  if (meta.cover) {
    els.coverDisc.src = meta.cover;
    els.coverDisc.style.display = 'block';
  } else {
    els.coverDisc.removeAttribute('src');
    els.coverDisc.style.display = 'none';
  }
}

  if (els.coverInfo) {
  if (meta.cover) {
    els.coverInfo.src = meta.cover;
    els.coverInfo.style.display = 'block';
  } else {
    els.coverInfo.removeAttribute('src');
    els.coverInfo.style.display = 'none';
  }
}

  if (els.spotifyEmbed) {
    els.spotifyEmbed.src = meta.embed;
  }

  if (els.openSpotify) {
    els.openSpotify.href = meta.openUrl;
    els.openSpotify.hidden = false;
  }

  setPlayingState(true);
}

async function loadSpotifyUrl() {
  const resource = extractSpotifyResource(els.spotifyUrl?.value || '');

  if (!resource) {
    setStatus('Cole uma URL válida de track, album ou playlist do Spotify.');
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
    setPlayingState(false);
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

  if (token) {
    setStatus('Conectado ao Spotify. Cole uma URL de música, álbum ou playlist.');
  } else {
    setStatus('Faça login no Spotify para carregar uma música, álbum ou playlist.');
  }
}

if (els.loginBtn) {
  els.loginBtn.addEventListener('click', loginWithSpotify);
}

if (els.logoutBtn) {
  els.logoutBtn.addEventListener('click', logout);
}

if (els.loadBtn) {
  els.loadBtn.addEventListener('click', loadSpotifyUrl);
}

if (els.spotifyUrl) {
  els.spotifyUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadSpotifyUrl();
    }
  });
}

bootstrapAuth();