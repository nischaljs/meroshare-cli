export const CURRENT_VERSION = 2;

/** Top-level keys the store owns. No section may use these names. */
export const RESERVED_KEYS = ['version', 'masterPasswordHash', 'salt', 'iv', 'revisions'] as const;

export interface ConfigDoc {
  version: number;
  masterPasswordHash: string;
  salt: string;
  iv: string;
  revisions: Record<string, number>;
  [section: string]: unknown;
}

/**
 * Brings a raw config file to the current version, in memory only.
 * The file is written in the new format on the next save.
 *
 * v1 (no `version`): the original format. Its top-level keys `accounts`, `auto` and
 * `email` are already sections of the same name, and its secrets use the same
 * `iv:tag:ciphertext` format, so the step only adds `version` and `revisions`.
 * New fields inside a section (such as `auto.autoPassword`) come from that
 * section's schema defaults.
 */
export function migrate(raw: unknown): ConfigDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Config file is not a JSON object.');
  }
  const doc = { ...(raw as Record<string, unknown>) };
  const version = doc.version === undefined ? 1 : Number(doc.version);
  if (!Number.isInteger(version) || version < 1) throw new Error(`Unknown config version: ${String(doc.version)}`);
  if (version > CURRENT_VERSION) {
    throw new Error(`Config was written by a newer ipo (version ${version}). Update ipo.`);
  }
  if (typeof doc.masterPasswordHash !== 'string' || typeof doc.salt !== 'string') {
    throw new Error('Config file has no master password data. Run "ipo init" again.');
  }
  if (version === 1) {
    doc.revisions = {};
    doc.version = 2;
  }
  if (!doc.revisions || typeof doc.revisions !== 'object') doc.revisions = {};
  if (typeof doc.iv !== 'string') doc.iv = '';
  return doc as ConfigDoc;
}
