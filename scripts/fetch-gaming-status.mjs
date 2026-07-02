import { writeFileSync } from 'node:fs';

const OUTPUT_PATH = 'gaming-status.json';

async function fetchRetroAchievements() {
  const { RA_USERNAME, RA_API_KEY } = process.env;
  if (!RA_USERNAME || !RA_API_KEY) return null;

  const url = `https://retroachievements.org/API/API_GetUserSummary.php?u=${encodeURIComponent(RA_USERNAME)}&y=${RA_API_KEY}&g=1&a=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  const recent = data.RecentlyPlayed?.[0];
  return {
    username: data.User ?? RA_USERNAME,
    points: data.TotalPoints ?? null,
    rank: data.Rank ?? null,
    totalRanked: data.TotalRanked ?? null,
    userPic: data.UserPic ? `https://media.retroachievements.org${data.UserPic}` : null,
    recentGame: recent?.Title ?? null
  };
}

async function fetchXbox() {
  const { XBL_API_KEY } = process.env;
  if (!XBL_API_KEY) return null;

  const headers = { 'X-Authorization': XBL_API_KEY, Accept: 'application/json' };

  const accRes = await fetch('https://xbl.io/api/v2/account', { headers });
  if (!accRes.ok) return null;
  const accData = await accRes.json();
  const settings = accData.content?.profileUsers?.[0]?.settings ?? [];
  const getSetting = id => settings.find(s => s.id === id)?.value ?? null;

  let recentGame = null;
  try {
    const histRes = await fetch('https://xbl.io/api/v2/player/titleHistory', { headers });
    if (histRes.ok) {
      const histData = await histRes.json();
      const games = (histData.content?.titles ?? []).filter(t => t.titleHistory?.lastTimePlayed);
      games.sort((a, b) => new Date(b.titleHistory.lastTimePlayed) - new Date(a.titleHistory.lastTimePlayed));
      recentGame = games[0]?.name ?? null;
    }
  } catch {
    // recentGame stays null
  }

  return {
    gamertag: getSetting('Gamertag'),
    gamerscore: getSetting('Gamerscore'),
    gamerpic: getSetting('GameDisplayPicRaw'),
    recentGame
  };
}

async function fetchPsn() {
  const { PSN_REFRESH_TOKEN, PSN_ONLINE_ID } = process.env;
  if (!PSN_REFRESH_TOKEN || !PSN_ONLINE_ID) return null;

  const tokenRes = await fetch('https://ca.account.sony.com/api/authz/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A='
    },
    body: new URLSearchParams({
      refresh_token: PSN_REFRESH_TOKEN,
      grant_type: 'refresh_token',
      token_format: 'jwt',
      scope: 'psn:mobile.v2.core psn:clientapp'
    })
  });
  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) return null;

  const fields = [
    'onlineId',
    'trophySummary(@default,level,progress,earnedTrophies)',
    'primaryOnlineStatus',
    'presences(@default,@titleInfo,platform,lastOnlineDate,hasBroadcastData)'
  ].join(',');

  const profileRes = await fetch(
    `https://us-prof.np.community.playstation.net/userProfile/v1/users/${encodeURIComponent(PSN_ONLINE_ID)}/profile2?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!profileRes.ok) return null;
  const profileData = await profileRes.json();
  const profile = profileData.profile;
  if (!profile) return null;

  const presence = profile.presences?.[0];
  const isPlaying = presence?.onlineStatus === 'online' && !!presence?.titleInfo?.name;

  return {
    onlineId: profile.onlineId ?? PSN_ONLINE_ID,
    level: profile.trophySummary?.level ?? null,
    trophies: profile.trophySummary?.earnedTrophies ?? null,
    isPlaying,
    currentGame: isPlaying ? presence.titleInfo.name : null
  };
}

async function main() {
  const [retro, xbox, psn] = await Promise.all([
    fetchRetroAchievements().catch(() => null),
    fetchXbox().catch(() => null),
    fetchPsn().catch(() => null)
  ]);

  const output = { retro, xbox, psn, updatedAt: new Date().toISOString() };
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log('Wrote', OUTPUT_PATH, output);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
