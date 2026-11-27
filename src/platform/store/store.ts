import path from 'node:path';
import { z } from 'zod';
import { ConfigFile, ipoHome, type FileHooks } from './file.js';
import { CURRENT_VERSION, RESERVED_KEYS, migrate, type ConfigDoc } from './migrate.js';
import { decrypt, deriveKey, encrypt, generateSalt, hashPassword, verifyPassword } from './crypto.js';

/** What a secret reads as while the store is locked. Never written back. */
export const LOCKED = '\u0000locked';

export class StaleRevisionError extends Error {
  constructor(
    readonly section: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Config section "${section}" changed since it was read (revision ${expected}, now ${actual}). ` +
        'Another ipo process wrote it. Read it again and retry.',
    );
    this.name = 'StaleRevisionError';
  }
}

export class StoreLockedError extends Error {
  constructor(section: string) {
    super(`Section "${section}" holds secrets. Unlock the store with the master password first.`);
    this.name = 'StoreLockedError';
  }
}

export class WrongMasterPasswordError extends Error {
  constructor() {
    super('Invalid master password.');
    this.name = 'WrongMasterPasswordError';
  }
}

/** Schema kit handed to a section's builder. `secret()` marks a string the store encrypts. */
export interface SchemaKit {
  secret(): z.ZodType<string>;
}

export interface SectionDef<T> {
  readonly name: string;
  readonly build: (kit: SchemaKit) => z.ZodType<T>;
}

/**
 * Declares a section of the config file. The schema must accept `undefined`
 * (use `.default()` or `.prefault()`), so a missing section reads as its default.
 */
export function defineSection<S extends z.ZodType>(
  name: string,
  build: (kit: SchemaKit) => S,
): SectionDef<z.output<S>> {
  if ((RESERVED_KEYS as readonly string[]).includes(name)) throw new Error(`Reserved section name: ${name}`);
  return { name, build: build as unknown as (kit: SchemaKit) => z.ZodType<z.output<S>> };
}

export type SectionValue<D> = D extends SectionDef<infer T> ? T : never;

export interface Snapshot<T> {
  value: T;
  revision: number;
}

export interface Section<T> {
  read(): Snapshot<T>;
  /**
   * Read, change and write the section under the file lock.
   * With `revision`, the write fails with StaleRevisionError when the section
   * changed since that revision was read.
   */
  update(fn: (value: T) => T | void, opts?: { revision?: number }): Snapshot<T>;
}

export interface StoreOptions {
  home?: string;
  hooks?: FileHooks;
}

export class Store {
  private readonly file: ConfigFile;
  private key: Buffer | null = null;

  constructor(opts: StoreOptions = {}) {
    this.file = new ConfigFile(path.join(opts.home ?? ipoHome(), 'config.json'), opts.hooks);
  }

  get path(): string {
    return this.file.filePath;
  }

  /** The folder that holds config.json (and the other files ipo keeps). */
  get home(): string {
    return path.dirname(this.file.filePath);
  }

  exists(): boolean {
    return this.file.exists();
  }

  get unlocked(): boolean {
    return this.key !== null;
  }

  /** Writes a fresh config (replaces any existing one) and unlocks the store. */
  create(masterPassword: string): void {
    const salt = generateSalt();
    const doc: ConfigDoc = {
      version: CURRENT_VERSION,
      masterPasswordHash: hashPassword(masterPassword),
      salt,
      iv: '',
      revisions: {},
    };
    this.file.withLock(() => this.file.writeJson(doc));
    this.key = deriveKey(masterPassword, salt);
  }

  verify(masterPassword: string): boolean {
    const doc = this.readDoc();
    try {
      return verifyPassword(masterPassword, doc.masterPasswordHash);
    } catch {
      return false;
    }
  }

  /** Checks the master password and keeps the derived key for secrets. */
  unlock(masterPassword: string): void {
    if (!this.verify(masterPassword)) throw new WrongMasterPasswordError();
    this.key = deriveKey(masterPassword, this.readDoc().salt);
  }

  section<T>(def: SectionDef<T>): Section<T> {
    return {
      read: () => {
        const doc = this.readDoc();
        return { value: this.decode(def, doc[def.name]), revision: doc.revisions[def.name] ?? 0 };
      },
      update: (fn, opts = {}) =>
        this.file.withLock(() => {
          const doc = this.readDoc();
          const current = doc.revisions[def.name] ?? 0;
          if (opts.revision !== undefined && opts.revision !== current) {
            throw new StaleRevisionError(def.name, opts.revision, current);
          }
          const value = this.decode(def, doc[def.name]);
          const next = (fn(value) ?? value) as T;
          doc[def.name] = this.encode(def, next);
          doc.revisions = { ...doc.revisions, [def.name]: current + 1 };
          doc.version = CURRENT_VERSION;
          this.file.writeJson(doc);
          return { value: next, revision: current + 1 };
        }),
    };
  }

  private readDoc(): ConfigDoc {
    return migrate(this.file.readJson());
  }

  private decode<T>(def: SectionDef<T>, raw: unknown): T {
    const key = this.key;
    const kit: SchemaKit = {
      secret: () =>
        z.string().transform((s) => {
          if (s === '') return '';
          if (!key) return LOCKED;
          try {
            return decrypt(s, key);
          } catch {
            throw new Error(`Cannot decrypt a secret in "${def.name}". Wrong master password?`);
          }
        }),
    };
    const parsed = def.build(kit).safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Config section "${def.name}" is not valid: ${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }

  private encode<T>(def: SectionDef<T>, value: T): unknown {
    const key = this.key;
    const kit: SchemaKit = {
      secret: () =>
        z.string().transform((s) => {
          if (s === '') return '';
          if (!key || s === LOCKED) throw new StoreLockedError(def.name);
          return encrypt(s, key);
        }),
    };
    return def.build(kit).parse(value);
  }
}

export function openStore(opts: StoreOptions = {}): Store {
  return new Store(opts);
}
