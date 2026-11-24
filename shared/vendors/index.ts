import { ValidationError } from '../hum/validation';

/**
 * Becoming a vendor. Anyone can pay and be paid on Faara, but taking payments as a business
 * needs an application and a review first: business details, the owner's identity (NIN),
 * and agreeing to the vendor terms. Faara's team approves or rejects each one.
 */

export const VENDOR_CATEGORIES = [
  'Food and drinks',
  'Groceries and provisions',
  'Fashion and tailoring',
  'Phones and electronics',
  'Printing and stationery',
  'Beauty and hair',
  'Transport and delivery',
  'Services',
  'Other',
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export interface VendorApplicationInput {
  businessName: string;
  category: VendorCategory;
  /** Where customers find the business, e.g. "Beside the main gate, OOU Ago-Iwoye". */
  location: string;
  description: string;
  /** National Identification Number: 11 digits. Only its last four are ever shown. */
  nin: string;
  /** CAC business name or company number, if registered. */
  cacNumber: string;
  agreedToTerms: boolean;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface VendorApplication {
  businessName: string;
  category: VendorCategory;
  location: string;
  description: string;
  ninLast4: string;
  cacNumber: string;
  status: ApplicationStatus;
  submittedAt: number;
  reviewedAt: number | null;
  /** Why it was rejected, shown to the applicant. */
  reason: string;
}

export interface VendorProfile {
  businessName: string;
  category: VendorCategory;
  location: string;
  approvedAt: number;
}

export interface VendorStatus {
  application: VendorApplication | null;
  vendor: VendorProfile | null;
  /** Whether this person reviews applications. */
  isReviewer: boolean;
}

/** An application as a reviewer sees it. */
export interface ApplicationForReview extends VendorApplication {
  uid: string;
  applicant: { fullName: string; username: string; phone: string };
}

/** Thrown for malformed requests; the message is safe to show. */
export class VendorValidationError extends ValidationError {}

const record = (body: unknown) =>
  (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

function text(value: unknown, label: string, min: number, max: number): string {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (s.length < min) throw new VendorValidationError(`Add the ${label}.`);
  if (s.length > max) throw new VendorValidationError(`Keep the ${label} under ${max} characters.`);
  return s;
}

export function parseVendorApplication(body: unknown): VendorApplicationInput {
  const data = record(body);
  const category = data.category;
  if (!VENDOR_CATEGORIES.includes(category as VendorCategory)) {
    throw new VendorValidationError('Choose what your business sells.');
  }
  const nin = typeof data.nin === 'string' ? data.nin.replace(/\s/g, '') : '';
  if (!/^\d{11}$/.test(nin)) throw new VendorValidationError('Your NIN is 11 digits.');
  const cac = typeof data.cacNumber === 'string' ? data.cacNumber.trim().toUpperCase() : '';
  if (cac && !/^(RC|BN|IT)?\s?\d{4,9}$/.test(cac)) {
    throw new VendorValidationError('Check the CAC number, e.g. BN 1234567, or leave it empty.');
  }
  if (data.agreedToTerms !== true) {
    throw new VendorValidationError('Agree to the vendor terms to apply.');
  }
  return {
    businessName: text(data.businessName, 'business name', 3, 60),
    category: category as VendorCategory,
    location: text(data.location, 'business location', 5, 120),
    description: text(data.description, 'description', 10, 300),
    nin,
    cacNumber: cac,
    agreedToTerms: true,
  };
}

export function parseVendorReview(body: unknown): {
  uid: string;
  approve: boolean;
  reason: string;
} {
  const data = record(body);
  if (typeof data.uid !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(data.uid)) {
    throw new VendorValidationError('That application isn’t valid.');
  }
  if (typeof data.approve !== 'boolean') throw new VendorValidationError('Approve or reject.');
  const reason = typeof data.reason === 'string' ? data.reason.trim().slice(0, 300) : '';
  if (!data.approve && reason.length < 5) {
    throw new VendorValidationError('Say why, so the applicant can fix it.');
  }
  return { uid: data.uid, approve: data.approve, reason };
}

/**
 * A vendor's till: a fixed code the vendor's phone hums and broadcasts over Bluetooth, so
 * many customers can pay the shop at once. Till codes always start with "V"; ordinary hum
 * codes never do, so a phone can tell them apart without asking the server.
 */
export const TILL_PREFIX = 'V';
const TILL_PATTERN = /^V[0-9A-HJKMNP-TV-Z]{9}$/;

export function isTillCode(code: string): boolean {
  return TILL_PATTERN.test(code.toUpperCase());
}

/** A shop as a paying customer sees it. */
export interface ShopInfo {
  code: string;
  username: string;
  businessName: string;
  category: VendorCategory;
  location: string;
}

/** The caller's own till. */
export interface TillResponse {
  code: string;
  username: string;
  businessName: string;
}

export function parseTillLookup(body: unknown): { code: string } {
  const code = String(record(body).code ?? '').toUpperCase();
  if (!isTillCode(code)) throw new VendorValidationError('That isn’t a shop code.');
  return { code };
}
