import { z } from 'zod';
import { defineEndpoint } from '../../platform/meroshare/public.js';

const Partner = z
  .object({
    id: z.number().optional(),
    partnerConfigId: z.number().optional(),
    name: z.string().optional(),
    partnerName: z.string().optional(),
    code: z.string().optional(),
  })
  .loose()
  .transform((p) => ({
    configId: p.partnerConfigId ?? p.id ?? 0,
    name: p.name ?? p.partnerName ?? p.code ?? `Partner ${p.partnerConfigId ?? p.id}`,
  }));
export type Partner = z.output<typeof Partner>;

const list = <T extends z.ZodType>(item: T) =>
  z.union([z.array(item), z.object({ object: z.array(item) }).loose().transform((o) => o.object)]);

export const PartnersEndpoint = defineEndpoint<void, Partner[]>({
  name: 'paymentPartners',
  method: 'GET',
  path: '/payment/partner/',
  kind: 'read',
  response: list(Partner),
});

const Money = z.union([z.number(), z.string()]).nullable().optional();

export const InitialDetailsSchema = z
  .object({
    meroshareRenewCharge: Money,
    dematRenewCharge: Money,
    dematMaxRenewalYear: z.union([z.number(), z.string()]).nullable().optional(),
    expiryDate: z.union([z.string(), z.number()]).nullable().optional(),
    dematExpiryDate: z.union([z.string(), z.number()]).nullable().optional(),
    paymentTypeList: z.array(z.unknown()).nullable().optional(),
  })
  .loose();
export type InitialDetails = z.infer<typeof InitialDetailsSchema>;

export const InitialDetailsEndpoint = defineEndpoint<number, InitialDetails>({
  name: 'paymentInitialDetails',
  method: 'GET',
  path: (configId) => `/payment/initialDetails/${configId}`,
  kind: 'read',
  response: InitialDetailsSchema,
});

export interface PaymentInput {
  partnerConfigId: number;
  paymentTypes: unknown[];
  years: number;
}

const Field = z
  .object({ name: z.string().optional(), key: z.string().optional(), fieldName: z.string().optional(), value: z.unknown().optional(), fieldValue: z.unknown().optional() })
  .loose()
  .transform((f) => ({ name: f.name ?? f.key ?? f.fieldName ?? '', value: String(f.value ?? f.fieldValue ?? '') }));

export const PaymentResponseSchema = z
  .object({ url: z.string(), paymentField: z.array(Field).default([]) })
  .loose()
  .transform((r) => ({ url: r.url, fields: r.paymentField.filter((f) => f.name) }));

/** Starts a renewal payment. The request body is a guess; the answer gives the partner's page and its form fields. */
export const PaymentEndpoint = defineEndpoint<PaymentInput, z.output<typeof PaymentResponseSchema>>({
  name: 'payment',
  method: 'POST',
  path: '/payment/',
  kind: 'write',
  body: (i) => ({ partnerConfigId: i.partnerConfigId, paymentTypeList: i.paymentTypes, renewalYear: i.years }),
  response: PaymentResponseSchema,
});
