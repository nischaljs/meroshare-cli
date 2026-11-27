export type MeroShareErrorKind = 'http' | 'challenge' | 'network' | 'schema' | 'auth';

/** Every failure of a call through the MeroShare socket. */
export class MeroShareError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number,
    readonly kind: MeroShareErrorKind,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'MeroShareError';
  }

  /** The 401 MeroShare gives after a good login when the account may not act (expired password, account or DEMAT). */
  get isRoleNotAuthorized(): boolean {
    return this.status === 401 && /role\s*not\s*authori[sz]ed/i.test(this.message);
  }

  /** True when the server answered: the request reached it and was refused. */
  get isDefiniteRejection(): boolean {
    return this.kind === 'http' && this.status >= 400 && this.status < 500;
  }
}

/** A response that does not match the endpoint's schema. */
export class ResponseShapeError extends MeroShareError {
  constructor(endpoint: string, status: number, readonly issues: string) {
    super(`MeroShare's answer to "${endpoint}" has an unexpected shape: ${issues}`, endpoint, status, 'schema');
    this.name = 'ResponseShapeError';
  }
}

/** One plain sentence for a person. */
export function friendlyMessage(err: unknown): string {
  if (err instanceof MeroShareError) {
    if (err.isRoleNotAuthorized) {
      return 'MeroShare refused this action (Role Not Authorized). The password, account or DEMAT has likely expired. Run "ipo doctor".';
    }
    if (err.kind === 'challenge') return 'MeroShare answered with a web page (a bot check) instead of data. Try again later.';
    if (err.kind === 'network') return `Could not reach MeroShare: ${err.message}`;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
