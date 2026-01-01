const SPOTIFY_API = "https://api.spotify.com/v1";

type AlbumTuple = [
  string, // artist
  string, // title
  string, // spotify album id
  string, // musicbrainz release group
  string  // musicbrainz release
];

type TrackTuple = [
  string,   //id
  string,   // track title
  number,   // track number
  string[]  // artists

];

type AlbumCategoryMap = Record<string, AlbumTuple[]>;

const TOKEN_URL = "https://accounts.spotify.com/api/token";

export async function getSpotifyAccessToken(): Promise<string> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  // Base64 encode "client_id:client_secret"
  const auth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return data.access_token;
}

async function fetchAlbumTracks(
  albumId: string,
  accessToken: string
): Promise<TrackTuple[]> {
  const tracks: TrackTuple[] = [];
  let url: string | null =
    `${SPOTIFY_API}/albums/${albumId}/tracks?limit=50`;

  while (url) {
    const res : any = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!res.ok) {
      throw new Error(
        `Spotify error ${res.status} while fetching album ${albumId}`
      );
    }

    const data : any = await res.json();

    for (const track of data.items) {
      tracks.push(...track);
    }

    url = data.next;
  }

  return tracks;
}

async function enrichCategory(
  albums: AlbumTuple[],
  accessToken: string
) {
  const enriched = [];

  for (const album of albums) {
    const spotifyAlbumId = album[1];

    const tracks = await fetchAlbumTracks(
      spotifyAlbumId,
      accessToken
    );

    enriched.push([
      ...album,
      tracks
    ]);
  }

  return enriched;
}

async function main() {
  const accessToken = await getSpotifyAccessToken();
  console.log(accessToken);
  if (!accessToken) {
    throw new Error("Missing SPOTIFY_ACCESS_TOKEN");
  }

  const raw = await Deno.readTextFile("albums.json");
  const data: AlbumCategoryMap = JSON.parse(raw);

  const output: Record<string, unknown[]> = {};

  for (const [category, albums] of Object.entries(data)) {
    console.log(`Processing ${category} (${albums.length})`);
    output[category] = await enrichCategory(albums, accessToken);
  }

  await Deno.writeTextFile(
    "newAlbums.json",
    JSON.stringify(output, null, 2)
  );

  console.log("✅ Written to newAlbums.json");
}

if (import.meta.main) {
  main().catch(err => {
    console.error(err);
    Deno.exit(1);
  });
}
