# Vitrola Spotify

Protótipo em HTML/CSS/JS de uma vitrola integrada ao Spotify.

## O que faz
- Faz login com Spotify usando **Authorization Code com PKCE**.
- Recebe uma URL de **música** ou **álbum** do Spotify.
- Busca a capa e os metadados pela Web API.
- Mostra a capa ao lado da vitrola e também no rótulo do disco.
- Toca via **Spotify Embed**.

## Como configurar
1. Crie um app em Spotify for Developers.
2. Edite `config.js`:
   - `clientId`: ID do seu app
   - `redirectUri`: URL HTTPS cadastrada no painel do Spotify
3. Publique em um domínio HTTPS, por exemplo GitHub Pages, Vercel ou Netlify.
4. No painel do Spotify, cadastre exatamente a mesma Redirect URI.

## Observações
- Este protótipo usa o **embed** para reproduzir o conteúdo. Para controlar play/pause/seek/volume com uma UI totalmente própria, o ideal é evoluir para o **Web Playback SDK**.
- Algumas funcionalidades avançadas do playback exigem **Spotify Premium**.
- O Spotify exige fluxos OAuth seguros; para apps web, o fluxo recomendado é **PKCE**.

## Estrutura
- `index.html`: interface
- `styles.css`: visual da vitrola
- `script.js`: login PKCE + leitura da URL + chamada à API
- `config.js`: configuração local
