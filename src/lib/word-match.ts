/**
 * Word-order prefix matching.
 *
 * The query is split into words in typing order; every query word must match
 * the BEGINNING (spelling prefix) of a distinct word in the target text, and
 * the matched words must appear in the same order.
 *
 * Examples:
 *   matchWords("voo dra", "VOOPOO Drag X2 Pod Kit")  -> true
 *   matchWords("voo dra", "Drag X2 by VOOPOO")        -> false (wrong order)
 *   matchWords("arg g3",  "VooPoo Argus G3 Kit")      -> true
 */
export function matchWords(query: string, text: string): boolean {
  const rawQuery = (query || '').toLowerCase().trim();
  if (!rawQuery) return false;
  const rawText = (text || '').toLowerCase();

  // CJK (e.g. Chinese) has no spaces: fall back to ordered substring matching.
  const hasCjk = /[\u4e00-\u9fa5]/.test(rawQuery);
  if (hasCjk) {
    let idx = 0;
    for (const ch of rawQuery.replace(/\s+/g, '')) {
      idx = rawText.indexOf(ch, idx);
      if (idx === -1) return false;
      idx += 1;
    }
    return true;
  }

  const needles = rawQuery.split(/\s+/).filter(Boolean);

  const words = rawText
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim())
    .filter(Boolean);

  let cursor = 0;
  for (const needle of needles) {
    let found = -1;
    for (let i = cursor; i < words.length; i++) {
      if (words[i].startsWith(needle)) {
        found = i;
        break;
      }
    }
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
}

/**
 * Returns the [start, end) character ranges in the ORIGINAL text that the
 * query matched, following the same word-order prefix rules as matchWords.
 * Each matched word contributes the prefix actually used (the needle length).
 * Returns [] when there is no match.
 */
export function getMatchRanges(query: string, text: string): Array<[number, number]> {
  const rawQuery = (query || '').toLowerCase().trim();
  if (!rawQuery || !text) return [];

  // CJK: ordered per-character substring matching.
  if (/[\u4e00-\u9fa5]/.test(rawQuery)) {
    const ranges: Array<[number, number]> = [];
    let idx = 0;
    for (const ch of rawQuery.replace(/\s+/g, '')) {
      idx = text.toLowerCase().indexOf(ch, idx);
      if (idx === -1) return [];
      ranges.push([idx, idx + 1]);
      idx += 1;
    }
    return ranges;
  }

  const needles = rawQuery.split(/\s+/).filter(Boolean);

  // Build tokens keeping their original offsets in the source text.
  const tokens: Array<{ start: number; end: number; word: string }> = [];
  const re = /[a-z0-9]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ start: m.index, end: m.index + m[0].length, word: m[0].toLowerCase() });
  }

  const ranges: Array<[number, number]> = [];
  let cursor = 0;
  for (const needle of needles) {
    let found = -1;
    for (let i = cursor; i < tokens.length; i++) {
      if (tokens[i].word.startsWith(needle)) {
        found = i;
        break;
      }
    }
    if (found === -1) return [];
    ranges.push([tokens[found].start, tokens[found].start + needle.length]);
    cursor = found + 1;
  }
  return ranges;
}
