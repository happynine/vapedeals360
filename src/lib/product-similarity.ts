/**
 * Product-name similarity for import de-duplication.
 *
 * Based on the established VapeDeals360 crawler-tool standard: keyword
 * Jaccard over the slug/name with a 0.6 threshold, greedy grouping, and
 * MANUAL confirmation before any merge.
 *
 * Three fixes are applied on top of that standard (the 0.6 Jaccard backbone is
 * unchanged) to handle title wording differences:
 *   1. Brand normalisation: "geekvape" == "geek vape", multi-word brands are
 *      collapsed so a spacing difference cannot break a match.
 *   2. Model tokens that contain letters are kept even with digits ("q2",
 *      "pro2"); only pure numbers and single letters are dropped.
 *   3. A numeric model-version clash (nord 5 vs nord 4) or an explicit puff
 *      clash vetoes a match.
 */

/** Multi-/single-word brands (lowercase, normalised to the compact key form). */
const BRAND_ALIASES: Record<string, string> = {
  geekbar: 'geekbar', geek: 'geekvape', geekvape: 'geekvape',
  elfbar: 'elfbar', lostmary: 'lostmary', lostangel: 'lostangel',
  lostvape: 'lostvape',
};
const BRAND_PHRASES: Array<[RegExp, string]> = [
  [/geek[\s-]?bar/, 'geekbar'],
  [/geek[\s-]?vape/, 'geekvape'],
  [/elf[\s-]?bar/, 'elfbar'],
  [/lost[\s-]?mary/, 'lostmary'],
  [/lost[\s-]?angel/, 'lostangel'],
  [/lost[\s-]?vape/, 'lostvape'],
];

/** Generic / category words that carry no product identity. */
const STOP_WORDS = new Set([
  'vape', 'vapes', 'vapor', 'vaping', 'kit', 'kits', 'device', 'pod', 'pods',
  'mod', 'mods', 'box', 'system', 'systems', 'tank', 'tanks', 'disposable',
  'disposables', 'refillable', 'rechargeable', 'pen', 'ecig', 'electronic',
  'starter', 'the', 'with', 'and', 'for', 'edition', 'series', 'type', 'style',
  'authentic', 'genuine', 'buy', 'online', 'shop', 'store', 'best', 'free',
  'nicotine', 'zero', 'flavor', 'flavors', 'flavour', 'flavours', 'taste',
  'pack', 'pcs', 'battery', 'replaceable', 'prefilled', 'puff', 'puffs',
]);

/** Flavour words: descriptive, never part of product identity. */
const FLAVOR_WORDS = new Set([
  'lemonade', 'lemon', 'lime', 'mango', 'melon', 'watermelon', 'strawberry',
  'blueberry', 'raspberry', 'grape', 'mint', 'menthol', 'peach', 'banana',
  'cherry', 'apple', 'pineapple', 'coconut', 'orange', 'cola', 'vanilla',
  'gummy', 'berry', 'fruit', 'tropical', 'sour', 'sweet', 'kiwi',
  'passionfruit', 'passion', 'dragonfruit',
]);

export interface ParsedTitle {
  brand: string | null;
  keywords: Set<string>;
  puffs: number | null;
  /** Numeric version tokens that identify a model variant (e.g. "v5", "gen4"). */
  versions: Set<string>;
}

function toLetters(raw: string): string {
  return raw.replace(/[0-9]+/g, '');
}

/** Absolute puff count from a token like "25k" or a 4–6 digit run. */
function puffFromToken(raw: string): number | null {
  const k = raw.match(/^(\d{1,3}(?:\.\d+)?)k$/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  if (/^\d{4,6}$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= 1000 && n <= 100000) return n;
  }
  return null;
}

export function parseTitle(input: string): ParsedTitle {
  let text = (input || '').toLowerCase().replace(/&/g, ' and ');

  // 1. Brand (normalised, then removed from the text).
  let brand: string | null = null;
  for (const [re, key] of BRAND_PHRASES) {
    if (re.test(text)) {
      brand = key;
      text = text.replace(re, ' ');
      break;
    }
  }

  const keywords = new Set<string>();
  const versions = new Set<string>();
  let puffs: number | null = null;
  const puffsVotes = new Map<number, number>();

  const rawTokens = text.split(/[^a-z0-9]+/i).filter(Boolean);
  for (let tok of rawTokens) {
    // Explicit puff count (also removes the token from identity).
    const p = puffFromToken(tok);
    if (p !== null) {
      puffsVotes.set(p, (puffsVotes.get(p) ?? 0) + 1);
      continue;
    }
    // A number embedded at the end of a model code ("mt35000"): read puffs but
    // keep the alphabetic model part.
    const embedded = tok.match(/^([a-z]+)(\d{4,6})$/);
    if (embedded) {
      const n = parseInt(embedded[2], 10);
      if (n >= 1000 && n <= 100000) {
        puffsVotes.set(n, (puffsVotes.get(n) ?? 0) + 1);
        tok = embedded[1];
      }
    }
    if (STOP_WORDS.has(tok) || FLAVOR_WORDS.has(tok)) continue;
    // Volume tokens ("18ml", "20ml") are captured nowhere for identity: skip.
    if (/^\d+(?:\.\d+)?ml$/.test(tok)) continue;

    const letters = toLetters(tok);
    if (letters.length === 0) {
      // Pure number that is not a puff count: a model version (e.g. "5").
      if (/^\d{1,3}$/.test(tok)) versions.add(`v${tok}`);
      continue;
    }
    if (letters.length === 1 && tok === letters) {
      // A single bare letter can be a model designator ("Pulse X", "Drag X2"):
      // keep it so it participates in identity / version comparison.
      keywords.add(tok);
      continue;
    }
    if (/\d/.test(tok)) {
      // Alphanumeric model code ("q2", "pro2"): keep as a keyword and record
      // its numeric variant component for version clash detection.
      keywords.add(tok);
      const num = tok.match(/(\d{1,3})$/);
      if (num) versions.add(`${letters}${num[1]}`);
    } else {
      keywords.add(tok);
    }
  }

  if (puffsVotes.size > 0) {
    puffs = [...puffsVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return { brand, keywords, puffs, versions };
}

/** Jaccard similarity between two sets (0..1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * A version clash exists when both sides share a model word but attach a
 * different number to it (nord 5 vs nord 4), or one has a bare version number
 * the other lacks while keyword sets are otherwise near-identical.
 */
function hasVersionClash(a: ParsedTitle, b: ParsedTitle): boolean {
  for (const va of a.versions) {
    const base = va.replace(/[0-9]+/g, '');
    if (base) {
      // Same base model code with a different number.
      for (const vb of b.versions) {
        if (vb.replace(/[0-9]+/g, '') === base && vb !== va) return true;
      }
    }
  }
  // Bare version numbers differing (e.g. standalone 5 vs 4).
  const bareA = [...a.versions].filter((v) => /^v\d+$/.test(v));
  const bareB = [...b.versions].filter((v) => /^v\d+$/.test(v));
  if (bareA.length && bareB.length) {
    for (const x of bareA) if (!bareB.includes(x)) return true;
  }
  return false;
}

export interface SimilarityResult {
  score: number;
  level: 'strong' | 'possible' | 'none';
  reasons: string[];
}

export function scoreSimilarity(
  feedName: string,
  existingName: string,
  possibleThreshold = 0.6,
  strongThreshold = 0.85,
): SimilarityResult {
  const a = parseTitle(feedName);
  const b = parseTitle(existingName);
  const reasons: string[] = [];

  if (a.brand && b.brand) {
    if (a.brand !== b.brand) return { score: 0, level: 'none', reasons: ['品牌不同'] };
    reasons.push('品牌一致');
  }
  if (a.puffs !== null && b.puffs !== null && a.puffs !== b.puffs) {
    return { score: 0, level: 'none', reasons: ['口数不一致'] };
  }
  if (a.puffs !== null && b.puffs !== null && a.puffs === b.puffs) reasons.push('口数相同');
  if (hasVersionClash(a, b)) return { score: 0, level: 'none', reasons: ['型号版本不同'] };

  const score = jaccard(a.keywords, b.keywords);
  let inter = 0;
  for (const t of a.keywords) if (b.keywords.has(t)) inter += 1;
  if (inter === 0) return { score: 0, level: 'none', reasons: ['无共同型号词'] };

  let level: SimilarityResult['level'] = 'none';
  if (score >= strongThreshold) level = 'strong';
  else if (score >= possibleThreshold) level = 'possible';
  return { score: Math.round(score * 100) / 100, level, reasons };
}
