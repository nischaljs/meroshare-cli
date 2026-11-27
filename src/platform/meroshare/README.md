# platform/meroshare: the MeroShare socket

The only code that does HTTP to MeroShare (`MEROSHARE_API_BASE`, default `https://webbackend.cdsc.com.np/api`) and the result site (`IPORESULT_BASE`, default `https://iporesult.cdsc.com.np`). No module imports `fetch` or `node:http`.

## What plugs in

A module defines each endpoint it uses, next to its code:

```ts
export const OwnDetail = defineEndpoint<void, OwnDetail>({
  name: 'ownDetail',
  method: 'GET',
  path: '/meroShare/ownDetail/',
  kind: 'read',
  response: OwnDetailSchema,
});
const detail = await client.call(OwnDetail, undefined, session);
```

Fields: `name`, `method`, `path` (string or a function of the input), `kind` (`read` or `write`), `response` (zod), and optional `body(input)`, `site` (`meroshare` or `result`), `auth` (`token` or `none`).

## What the socket decides

- Headers: a browser User-Agent, `Origin` and `Referer` `https://meroshare.cdsc.com.np/`, and the token in `Authorization` as is (no `Bearer`).
- Login: `client.login(def, input)` returns the parsed body and the token from the `Authorization` response header.
- Retries: reads only. 3 attempts; the waits are 2 s and 4 s, each plus 250 to 750 ms of jitter. A read is retried on 429, 5xx, a network error or an HTML page (bot check). A write is never retried.
- HTML challenge: `content-type: text/html`, or a body that starts with `<!doctype` or `<html`.
- Errors: every failure is a `MeroShareError` with `endpoint`, `status`, `kind` (`http`, `challenge`, `network`, `schema`, `auth`) and `errorCode`. A body that does not match the schema is a `ResponseShapeError` that names the endpoint.
- `friendlyMessage(err)` turns an error into one sentence; a 401 "Role Not Authorized" points to `ipo doctor`.
- The result site needs cookies: the socket opens `/` first and keeps them for the process.
