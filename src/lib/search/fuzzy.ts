/**
 * Typo-tolerant search over the (small, public) catalog. Pure functions, safe on server and client.
 * Hebrew-aware: niqqud stripped, final letters folded, one-letter prefixes (ב/ה/ל/ו/מ/ש/כ) tolerated.
 */

export const MAX_QUERY_LENGTH = 60;
const MAX_TOKENS = 6;

const NIQQUD = /[\u0591-\u05C7]/g;
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const HEBREW_PREFIXES = new Set(['ב', 'ה', 'ל', 'ו', 'מ', 'ש', 'כ']);

/** Common ways people type the same thing → canonical words that appear in catalog text. */
const SYNONYMS: Record<string, string[]> = {
  meeting: ['ישיבות'],
  meetings: ['ישיבות'],
  room: ['חדר'],
  conference: ['ישיבות'],
  זום: ['ישיבות'],
  פגישה: ['ישיבות'],
  פגישות: ['ישיבות'],
  ישיבה: ['ישיבות'],
  office: ['משרד'],
  offices: ['משרד'],
  משרדים: ['משרד'],
  desk: ['עמדה'],
  desks: ['עמדה'],
  hotdesk: ['עמדה'],
  cowork: ['עמדה'],
  coworking: ['עמדה'],
  קווורקינג: ['עמדה'],
  קוורקינג: ['עמדה'],
  עמדות: ['עמדה'],
  tlv: ['תל', 'אביב'],
  telaviv: ['תל', 'אביב'],
  תא: ['תל', 'אביב'],
  tel: ['תל'],
  aviv: ['אביב'],
  jerusalem: ['ירושלים'],
  ירושליים: ['ירושלים'],
  haifa: ['חיפה'],
  beersheva: ['באר', 'שבע'],
  בש: ['באר', 'שבע'],
  sarona: ['שרונה'],
  rothschild: ['רוטשילד'],
};

export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(NIQQUD, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c] ?? c)
    .replace(/["'״׳`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const norm = normalize(text);
  return norm ? norm.split(' ').filter(Boolean) : [];
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent transpositions), capped. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) d[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[rows - 1]![cols - 1]!;
}

function variants(token: string): string[] {
  const out = [token];
  if (token.length > 3 && HEBREW_PREFIXES.has(token[0]!)) out.push(token.slice(1));
  if (token.length > 4 && HEBREW_PREFIXES.has(token[0]!) && HEBREW_PREFIXES.has(token[1]!)) out.push(token.slice(2));
  return out;
}

/** How well one query token matches one document token, 0..1. */
function tokenScore(q: string, doc: string): number {
  if (q === doc) return 1;
  if (q.length >= 2 && doc.startsWith(q)) return 0.85;
  if (q.length >= 3 && doc.includes(q)) return 0.6;
  if (q.length < 3) return 0;
  const allowed = q.length >= 6 ? 2 : 1;
  const dist = editDistance(q, doc, allowed);
  if (dist <= allowed) return 0.7 - dist * 0.15;
  // Typo in a word that is still being typed: compare against the same-length prefix.
  if (doc.length > q.length && q.length >= 4) {
    const prefixDist = editDistance(q, doc.slice(0, q.length), 1);
    if (prefixDist <= 1) return 0.5;
  }
  return 0;
}

export interface SearchField {
  text: string;
  weight: number;
}

export interface Indexed<T> {
  item: T;
  fields: { tokens: string[]; weight: number }[];
}

export function indexItems<T>(items: T[], fieldsOf: (item: T) => SearchField[]): Indexed<T>[] {
  return items.map((item) => ({
    item,
    fields: fieldsOf(item).map((f) => ({ tokens: tokenize(f.text), weight: f.weight })),
  }));
}

/** Query tokens with synonyms expanded into alternative groups: every group must match. */
export function parseQuery(query: string): string[][] {
  const tokens = tokenize(query.slice(0, MAX_QUERY_LENGTH)).slice(0, MAX_TOKENS);
  const joined = tokens.join('');
  if (tokens.length > 1 && SYNONYMS[joined]) return SYNONYMS[joined].map((s) => [s]);
  const groups: string[][] = [];
  for (const t of tokens) {
    const syn = SYNONYMS[t];
    if (!syn) groups.push([t]);
    else if (syn.length === 1) groups.push([t, syn[0]!]);
    else for (const s of syn) groups.push([s]);
  }
  return groups;
}

/** 0 when any query group fails to match anything; otherwise a weighted relevance score. */
export function scoreItem<T>(entry: Indexed<T>, groups: string[][]): number {
  if (groups.length === 0) return 0;
  let total = 0;
  for (const group of groups) {
    let best = 0;
    for (const alt of group) {
      for (const qv of variants(alt)) {
        for (const field of entry.fields) {
          for (const tok of field.tokens) {
            const s = tokenScore(qv, tok) * field.weight;
            if (s > best) best = s;
          }
        }
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  return total / groups.length;
}

export function search<T>(entries: Indexed<T>[], query: string, limit = 8): { item: T; score: number }[] {
  const groups = parseQuery(query);
  if (groups.length === 0) return [];
  return entries
    .map((entry) => ({ item: entry.item, score: scoreItem(entry, groups) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** The closest vocabulary word for each query token, when the query itself has no exact hit. */
export function suggestCorrection(query: string, vocabulary: Set<string>): string | null {
  const tokens = tokenize(query.slice(0, MAX_QUERY_LENGTH)).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return null;
  let changed = false;
  const fixed = tokens.map((t) => {
    if (vocabulary.has(t) || t.length < 3) return t;
    let best: string | null = null;
    let bestDist = 3;
    for (const word of vocabulary) {
      const dist = editDistance(t, word, 2);
      if (dist < bestDist) {
        best = word;
        bestDist = dist;
      }
    }
    if (best && bestDist <= (t.length >= 6 ? 2 : 1)) {
      changed = true;
      return best;
    }
    return t;
  });
  return changed ? fixed.join(' ') : null;
}
