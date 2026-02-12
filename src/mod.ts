export { init } from "./core/matcher.ts";
export { matchSpotifyAlbum } from "./api/spotify.ts";
export { matchAppleMusicAlbum } from "./api/appleMusic.ts";
export type { MuniteConfig } from "./core/config.ts";
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
