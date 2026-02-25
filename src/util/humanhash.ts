/**
 * Generate human-readable identifiers from timestamps
 */

const ADJECTIVES = [
  'amber', 'azure', 'brass', 'cedar', 'coral', 'crisp', 'delta', 'ember',
  'frost', 'gamma', 'grape', 'hazel', 'ivory', 'jade', 'lunar', 'maple',
  'mango', 'moss', 'navy', 'olive', 'onyx', 'pearl', 'pine', 'plum',
  'prism', 'ruby', 'sage', 'slate', 'solar', 'storm', 'terra', 'topaz',
  'velvet', 'violet', 'willow', 'zinc'
];

const NOUNS = [
  'atlas', 'beacon', 'bridge', 'canyon', 'castle', 'cipher', 'cliff',
  'comet', 'condor', 'cosmos', 'creek', 'crystal', 'delta', 'dune',
  'eagle', 'falcon', 'fjord', 'flame', 'forest', 'glacier', 'harbor',
  'hawk', 'horizon', 'island', 'lagoon', 'lake', 'meadow', 'mesa',
  'meteor', 'moon', 'nebula', 'north', 'oak', 'ocean', 'orbit', 'peak',
  'phoenix', 'pine', 'prism', 'quasar', 'rapids', 'raven', 'reef',
  'ridge', 'river', 'sage', 'shadow', 'shore', 'sierra', 'sky',
  'spark', 'sphere', 'spring', 'star', 'stone', 'stream', 'summit',
  'thunder', 'tide', 'timber', 'trail', 'valley', 'wave', 'wind'
];

/**
 * Generate a human-readable hash from a timestamp
 * Format: adjective-noun-number (e.g., "azure-falcon-42")
 */
export function generateHumanhash(timestamp: Date): string {
  const ts = timestamp.getTime();

  // Use different parts of the timestamp for each component
  const adjIdx = Math.abs(Math.floor(ts / 1000) % ADJECTIVES.length);
  const nounIdx = Math.abs(Math.floor(ts / 60000) % NOUNS.length);
  const num = Math.abs(Math.floor(ts / 3600000) % 100);

  return `${ADJECTIVES[adjIdx]}-${NOUNS[nounIdx]}-${num}`;
}

/**
 * Generate a short hash for display (just adjective-noun)
 */
export function generateShortHash(timestamp: Date): string {
  const ts = timestamp.getTime();
  const adjIdx = Math.abs(Math.floor(ts / 1000) % ADJECTIVES.length);
  const nounIdx = Math.abs(Math.floor(ts / 60000) % NOUNS.length);
  return `${ADJECTIVES[adjIdx]}-${NOUNS[nounIdx]}`;
}
