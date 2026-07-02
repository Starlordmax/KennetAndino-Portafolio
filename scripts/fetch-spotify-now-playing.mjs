import { writeFileSync } from 'node:fs';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const OUTPUT_PATH = 'spotify-now-playing.json';

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function trackToOutput(track, isPlaying) {
  return {
    isPlaying,
    track: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    albumArt: track.album.images?.[1]?.url || track.album.images?.[0]?.url || '',
    url: track.external_urls.spotify,
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };

  let output = null;

  const curRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers });
  if (curRes.status === 200) {
    const cur = await curRes.json();
    if (cur?.item) output = trackToOutput(cur.item, !!cur.is_playing);
  }

  if (!output) {
    const recRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers });
    if (recRes.ok) {
      const rec = await recRes.json();
      const track = rec?.items?.[0]?.track;
      if (track) output = trackToOutput(track, false);
    }
  }

  if (!output) output = { isPlaying: false, track: null, updatedAt: new Date().toISOString() };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log('Wrote', OUTPUT_PATH, output);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
