import { input, password } from '@inquirer/prompts';
import type { Store } from '../store/public.js';

/** Asks for the master password and unlocks the store. Throws on a wrong password. */
export async function unlockStore(store: Store): Promise<void> {
  if (!store.exists()) throw new Error('No config found. Run "ipo init" first.');
  if (store.unlocked) return;
  const pwd = process.env.IPO_MASTER_PASSWORD ?? (await password({ message: 'Master password:', mask: '*' }));
  store.unlock(pwd);
}

/** True only when the person types "yes". */
export async function typedYes(message: string): Promise<boolean> {
  const answer = await input({ message: `${message} Type "yes" to go ahead:` });
  return answer.trim().toLowerCase() === 'yes';
}
