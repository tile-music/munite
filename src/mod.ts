export { init } from "./core/matcher.ts";
export { matchSpotifyAlbum } from "./api/spotify.ts";
export type { FilterResponse } from "./types/musicbrainz.ts";
export {
    setLogLevel,
    enableLogging,
    disableLogging,
    debug,
    info,
    warn,
    error,
} from "./utils/logger.ts";
export type { LogLevel } from "./types/logger.ts";
