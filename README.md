# Munite

A Deno-based library for matching Spotify albums with MusicBrainz releases. Munite helps you find accurate MusicBrainz release metadata for Spotify albums through fuzzy matching and scoring algorithms.

It is **strongly recommended** to use this library in conjunction with a locally-hosted MusicBrainz instance, such as one created using [mbootstrap](https://github.com/tile-music/mbootstrap). This is to compensate for the aggressive rate limiting of the public MusicBrainz API (which is 1 request per second), especially when processing large numbers of albums. With release querying enabled, Munite sends a MusicBrainz query for each potential release, which may be as high as 30 for each album.

## Installation

This project uses Deno. Make sure you have [Deno installed](https://deno.land/manual/getting_started/installation).

Import the library directly through JSR:
```ts
import { init, matchSpotifyAlbum } from "jsr@tile-music/munite@0";
```

Or, use an import map:
```json
{
  "imports": {
+    "@tile-music/munite": "jsr:@tile-music/munite@0"
  }
}
```

```ts
import { init, matchSpotifyAlbum } from "@tile-music/munite";
```

## Configuration

Create a `.env` file in the project root with the following variables:

```env
# MusicBrainz Configuration
MUSICBRAINZ_API_URL=https://musicbrainz.org/ws/2
MAX_MUSICBRAINZ_REQUESTS_PER_SECOND=1

# Spotify API Credentials
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
MAX_SPOTIFY_REQUESTS_PER_SECOND=10

# Query Configuration
QUERY_RELEASE=true

# Logging
LOG_LEVEL=info
```

Or, copy from the provided `.env.sample` file:

```sh
cp .env.sample .env
```

### Getting Spotify API Credentials

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Copy your Client ID and Client Secret to the `.env` file

## Usage

### Basic Example

```typescript
import { init, matchSpotifyAlbum } from "./src/mod.ts";

// Initialize the API clients and rate limiters
await init();

// Match a Spotify album with MusicBrainz releases
const spotifyAlbumId = "4HTy9WFTYooRjE9giTmzAF";
const result = await matchSpotifyAlbum(spotifyAlbumId);

console.log("Matched release:", result.release_id);
console.log("Matched release group:", result.release_group_id);
console.log("Score:", result.filter_score);
```

### Logging Configuration

```typescript
import { setLogLevel, enableLogging, disableLogging } from "./src/mod.ts";

// Set log level (debug, info, warn, error)
setLogLevel("debug");

// Enable or disable logging
enableLogging();
disableLogging();
```

## API Reference

### `init()`

Initializes the Spotify and MusicBrainz API clients, sets up rate limiting queues, and configures logging. Must be called before using `matchSpotifyAlbum()`.

**Returns:** `Promise<void>`

### `matchSpotifyAlbum(album_id: string)`

Fetches a Spotify album by ID and finds matching MusicBrainz releases.

**Parameters:**
- `album_id` - The Spotify album ID

**Returns:** `Promise<FilterResponse>` - Contains the best match and all candidate matches

### Logging Functions

- `setLogLevel(level: LogLevel)` - Set the logging level ("debug" | "info" | "warn" | "error")
- `enableLogging()` - Enable logging output
- `disableLogging()` - Disable logging output
- `debug(message: string, data?: unknown)` - Log debug message
- `info(message: string, data?: unknown)` - Log info message
- `warn(message: string, data?: unknown)` - Log warning message
- `error(message: string, data?: unknown)` - Log error message

### Running Tests

```sh
deno test --allow-net --allow-read --allow-env
```

### Project Structure

```
munite/
├── src/
│   ├── api/          # API client implementations (Spotify, MusicBrainz)
│   ├── core/         # Core matching, scoring, and validation logic
│   ├── types/        # TypeScript type definitions
│   ├── utils/        # Utility functions (logging, queuing)
│   └── mod.ts        # Main module exports
├── tests/            # Test files
├── deno.json         # Deno configuration
├── .env.sample       # Sample environment variables
└── .env              # Environment variables (not tracked)
```

## How It Works

1. Retrieves album metadata from Spotify API
2. Strips and normalize titles, artist names, and track names
3. Searches MusicBrainz for potential matching releases
4. Scores each candidate based on:
   - Title similarity
   - Artist matches
   - Track count and titles
   - Release date proximity
5. Returns the highest-scoring release as the best match, with additional context for its associated release group, query score (provided by MusicBrainz), and filter score (calculated by Munite)

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
