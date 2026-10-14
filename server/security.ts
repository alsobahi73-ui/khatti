import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const mac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
export function phone(input: string) {
 const normalized = input.replace(/[٠-٩۰-۹]/g, c => String('٠١٢٣٤٥٦٧٨٩'.includes(c) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(c) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[\s()-]/g, '');
 const value = normalized.startsWith('07') ? '+964' + normalized.slice(1) : normalized;
 return /^\+9647[3-9]\d{8}$/.test(value) ? value : null;
}
