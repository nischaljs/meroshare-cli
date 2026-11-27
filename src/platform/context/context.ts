import { openStore, type Store, type StoreOptions } from '../store/public.js';
import { createMeroShareClient, type ClientOptions, type MeroShareClient } from '../meroshare/public.js';
import { createNotifier, type Notifier, type NotifierOptions } from '../notify/public.js';
import { sleep as realSleep } from '../terminal/public.js';

/** Everything a module needs from the platform, built once per process. */
export interface AppContext {
  store: Store;
  client: MeroShareClient;
  notifier: Notifier;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** Gap between accounts in ms (doctor, apply, automation). */
  accountGapMs: number;
}

export interface ContextOptions {
  store?: StoreOptions;
  client?: ClientOptions;
  notifier?: NotifierOptions;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  accountGapMs?: number;
}

export function createContext(opts: ContextOptions = {}): AppContext {
  const store = openStore(opts.store);
  const sleep = opts.sleep ?? realSleep;
  return {
    store,
    client: createMeroShareClient({ sleep, ...opts.client }),
    notifier: createNotifier(store, opts.notifier),
    now: opts.now ?? (() => new Date()),
    sleep,
    accountGapMs: opts.accountGapMs ?? Number(process.env.IPO_ACCOUNT_GAP_MS ?? 3000),
  };
}
