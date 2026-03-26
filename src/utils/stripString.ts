/**
 * Strips and normalizes a string by:
 * - Converting to lowercase
 * - Replacing multiple spaces with a single space
 * - Normalizing to decompose combined characters
 * - Removing diacritics
 * - Trimming leading and trailing whitespace
 * - Remove (Remastered), (Remaster), [Remastered], and [Remaster]
 *
 * @param input - The input string to be stripped and normalized.
 * @returns The stripped and normalized string.
 */
function stripString(input: string): string {
    return input
        .toLowerCase() // Make lowercase
        .replace(/\s+/g, " ") // Replace multiple spaces with a single space
        .normalize("NFD") // Normalize to decompose combined characters
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .replace(/\(remaster(ed)?\)|\[remaster(ed)?\]/g, "") // Remove (Remastered), (Remaster), [Remastered], [Remaster]
        .trim(); // Trim leading and trailing whitespace
}

export { stripString };
