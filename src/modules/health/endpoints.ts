import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

const DateLike = z.union([z.string(), z.number()]).nullable().optional();

/** The account's own details. Field names come from community code, not from a MeroShare document. */
export const OwnDetailSchema = z
  .object({
    expiredDate: DateLike,
    expiredDateStr: DateLike,
    dematExpiryDate: DateLike,
    passwordExpiryDate: DateLike,
    passwordExpiryDateStr: DateLike,
    renewedDate: DateLike,
  })
  .loose();
export type OwnDetail = z.infer<typeof OwnDetailSchema>;

export const OwnDetailEndpoint = defineEndpoint<void, OwnDetail>({
  name: 'ownDetail',
  method: 'GET',
  path: '/meroShare/ownDetail/',
  kind: 'read',
  response: OwnDetailSchema,
});
