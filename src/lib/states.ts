/**
 * State compliance content layer for the "Shop by State" zone (/vape-laws).
 *
 * IMPORTANT (per PRD 06): legal conclusions must be configurable, dated and
 * sourced — never hardcoded into components. This file is the single editable
 * content source for V1 (5 launch states with full content). When the
 * backend `state_rules` table lands, these values should be migrated there and
 * this module replaced by a data fetch. `status` drives the "pending review"
 * banner and non-launch states are intentionally generic + noindex.
 *
 * Research cut-off: 2026-09. Launch-state rules must be re-verified by the
 * dates in `nextReviewAt` before relying on them operationally.
 */

export type RuleStatus = 'active' | 'stale';

export interface StateRule {
  /** Two-letter USPS code, upper case, e.g. TX */
  code: string;
  /** Full name, e.g. Texas */
  name: string;
  /** URL slug, lower case, e.g. texas */
  slug: string;
  /** True for the 5 full-content launch states (TX/CA/FL/NY/PA). */
  launched: boolean;
}

export interface RuleSource {
  label: string;
  url: string;
}

export interface StateLawContent extends StateRule {
  status: RuleStatus;
  /** One-line headline conclusion shown on cards/hero. */
  headline: string;
  /** Longer plain-English summary for the state page. */
  summary: string;
  /** Last time the rules were manually verified (YYYY-MM-DD). */
  lastReviewedAt: string;
  /** Next required verification date (YYYY-MM-DD). */
  nextReviewAt: string;
  minAge: number;
  flavor: string;
  disposable: string;
  shipping: string;
  coupon: string;
  directory: string;
  /** Authoritative reference links. */
  sources: RuleSource[];
  /** Short bullets for the conclusion cards. */
  canBuy: string[];
  cannotBuy: string[];
}

const REVIEW_CUTOFF = '2026-09';

export const ALL_STATES: StateRule[] = [
  { code: 'AL', name: 'Alabama', slug: 'alabama', launched: false },
  { code: 'AK', name: 'Alaska', slug: 'alaska', launched: false },
  { code: 'AZ', name: 'Arizona', slug: 'arizona', launched: false },
  { code: 'AR', name: 'Arkansas', slug: 'arkansas', launched: false },
  { code: 'CA', name: 'California', slug: 'california', launched: true },
  { code: 'CO', name: 'Colorado', slug: 'colorado', launched: false },
  { code: 'CT', name: 'Connecticut', slug: 'connecticut', launched: false },
  { code: 'DE', name: 'Delaware', slug: 'delaware', launched: false },
  { code: 'DC', name: 'District of Columbia', slug: 'district-of-columbia', launched: false },
  { code: 'FL', name: 'Florida', slug: 'florida', launched: true },
  { code: 'GA', name: 'Georgia', slug: 'georgia', launched: false },
  { code: 'HI', name: 'Hawaii', slug: 'hawaii', launched: false },
  { code: 'ID', name: 'Idaho', slug: 'idaho', launched: false },
  { code: 'IL', name: 'Illinois', slug: 'illinois', launched: false },
  { code: 'IN', name: 'Indiana', slug: 'indiana', launched: false },
  { code: 'IA', name: 'Iowa', slug: 'iowa', launched: false },
  { code: 'KS', name: 'Kansas', slug: 'kansas', launched: false },
  { code: 'KY', name: 'Kentucky', slug: 'kentucky', launched: false },
  { code: 'LA', name: 'Louisiana', slug: 'louisiana', launched: false },
  { code: 'ME', name: 'Maine', slug: 'maine', launched: false },
  { code: 'MD', name: 'Maryland', slug: 'maryland', launched: false },
  { code: 'MA', name: 'Massachusetts', slug: 'massachusetts', launched: false },
  { code: 'MI', name: 'Michigan', slug: 'michigan', launched: false },
  { code: 'MN', name: 'Minnesota', slug: 'minnesota', launched: false },
  { code: 'MS', name: 'Mississippi', slug: 'mississippi', launched: false },
  { code: 'MO', name: 'Missouri', slug: 'missouri', launched: false },
  { code: 'MT', name: 'Montana', slug: 'montana', launched: false },
  { code: 'NE', name: 'Nebraska', slug: 'nebraska', launched: false },
  { code: 'NV', name: 'Nevada', slug: 'nevada', launched: false },
  { code: 'NH', name: 'New Hampshire', slug: 'new-hampshire', launched: false },
  { code: 'NJ', name: 'New Jersey', slug: 'new-jersey', launched: false },
  { code: 'NM', name: 'New Mexico', slug: 'new-mexico', launched: false },
  { code: 'NY', name: 'New York', slug: 'new-york', launched: true },
  { code: 'NC', name: 'North Carolina', slug: 'north-carolina', launched: false },
  { code: 'ND', name: 'North Dakota', slug: 'north-dakota', launched: false },
  { code: 'OH', name: 'Ohio', slug: 'ohio', launched: false },
  { code: 'OK', name: 'Oklahoma', slug: 'oklahoma', launched: false },
  { code: 'OR', name: 'Oregon', slug: 'oregon', launched: false },
  { code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', launched: true },
  { code: 'RI', name: 'Rhode Island', slug: 'rhode-island', launched: false },
  { code: 'SC', name: 'South Carolina', slug: 'south-carolina', launched: false },
  { code: 'SD', name: 'South Dakota', slug: 'south-dakota', launched: false },
  { code: 'TN', name: 'Tennessee', slug: 'tennessee', launched: false },
  { code: 'TX', name: 'Texas', slug: 'texas', launched: true },
  { code: 'UT', name: 'Utah', slug: 'utah', launched: false },
  { code: 'VT', name: 'Vermont', slug: 'vermont', launched: false },
  { code: 'VA', name: 'Virginia', slug: 'virginia', launched: false },
  { code: 'WA', name: 'Washington', slug: 'washington', launched: false },
  { code: 'WV', name: 'West Virginia', slug: 'west-virginia', launched: false },
  { code: 'WI', name: 'Wisconsin', slug: 'wisconsin', launched: false },
  { code: 'WY', name: 'Wyoming', slug: 'wyoming', launched: false },
];

/** First states surfaced in the nav dropdown and the Hub cards. */
export const LAUNCH_CODES = ['TX', 'CA', 'FL', 'NY', 'PA'] as const;

export const LAUNCH_STATES: StateRule[] = LAUNCH_CODES
  .map((c) => ALL_STATES.find((s) => s.code === c))
  .filter((s): s is StateRule => Boolean(s));

const STATE_CONTENT: Record<string, Omit<StateLawContent, keyof StateRule>> = {
  TX: {
    status: 'active',
    headline: 'Chinese-made disposables are banned; refillable devices and US-made e-liquid (any flavor) remain legal.',
    summary:
      'Texas took an origin-based approach rather than a flavor ban. Under SB 2024 (effective September 1, 2025), selling, offering for sale, marketing or advertising certain e-cigarette products is prohibited — including products wholly or partly manufactured in China (or another designated foreign adversary), products containing cannabinoids, alcohol, kratom, kava, mushrooms or tianeptine, and youth-appealing packaging. There is no statewide flavor ban: open/refillable pod systems, mods and US-made e-liquid in any flavor remain legal for adults 21+.',
    lastReviewedAt: '2026-09-19',
    nextReviewAt: '2026-12-19',
    minAge: 21,
    flavor: 'No statewide flavor ban — all flavors remain legal for compliant devices and US-made e-liquid.',
    disposable: 'Chinese-made (foreign-adversary) and cannabinoid-containing disposables prohibited; compliant US-made refillable/open systems allowed.',
    shipping: 'Domestic PACT-registered retailers enforce age/state at checkout; confirm the retailer ships to TX at checkout.',
    coupon: 'No statewide coupon/discount prohibition for vapes.',
    directory: 'Not a PMTA "directory" state.',
    sources: [
      { label: 'Texas Comptroller — E-Cigarette Products: New Legislation (SB 2024)', url: 'https://comptroller.texas.gov/taxes/tobacco/faq-e-cig.php' },
      { label: 'Texas SB 2024 enrolled text (89th Legislature, Capitol.texas.gov)', url: 'https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB2024' },
    ],
    canBuy: [
      'Open/refillable pod systems, box mods and refillable vapes',
      'US-made e-liquid in any flavor (21+)',
      'Compliant devices not manufactured in a prohibited country',
    ],
    cannotBuy: [
      'Disposables wholly or partly made in China',
      'Products containing THC/Delta-8/cannabinoids, alcohol, kratom or kava',
      'Youth-targeted shapes, packaging or celebrity branding',
    ],
  },
  CA: {
    status: 'active',
    headline: 'Disposable vapes are being phased out under AB 762 — manufacture/import first, retail sales later; flavored online sales are already heavily restricted.',
    summary:
      'California AB 762 (passed the Legislature in August 2026 and sent to the Governor) prohibits importing or manufacturing new/refurbished disposable, battery-embedded nicotine vapor devices beginning January 1, 2027, and selling, distributing or offering them for sale beginning January 1, 2028, with civil penalties. Separately, California already restricts flavored nicotine products and online sales through its UTL (Unauthorized Tobacco Products) list, so many popular disposables cannot be legally shipped into the state even before AB 762 fully takes effect. Note: some earlier summaries cited a 2026 date; the enrolled timeline is 2027/2028.',
    lastReviewedAt: '2026-09-19',
    nextReviewAt: '2026-11-19',
    minAge: 21,
    flavor: 'Flavored nicotine products are restricted via the state UTL list; only authorized products may be sold.',
    disposable: 'Disposable battery-embedded nicotine devices: import/manufacture ban from 2027-01-01; retail sale/distribution ban from 2028-01-01 (AB 762).',
    shipping: 'Online shipment of unauthorized/flavored products is restricted; use only authorized products and PACT-compliant retailers.',
    coupon: 'No general vape-coupon ban, but heavy discounting of restricted products is not a workaround.',
    directory: 'California maintains an authorized/UTL product list — treat as a directory-style state for availability.',
    sources: [
      { label: 'California Legislative Information — AB 762 (leginfo.legislature.ca.gov)', url: 'https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB762' },
      { label: 'California Department of Justice — Tobacco/UTL enforcement', url: 'https://oag.ca.gov/tobacco' },
    ],
    canBuy: [
      'Authorized (UTL-listed) products sold through compliant channels',
      'Refillable/non-disposable compliant systems as AB 762 phases in',
    ],
    cannotBuy: [
      'Unauthorized/disposable nicotine devices once the AB 762 dates hit',
      'Flavored products not on the authorized list, especially by online order',
    ],
  },
  FL: {
    status: 'active',
    headline: 'Florida operates a PMTA-based "directory" model: only state-listed, authorized products can be legally sold or shipped.',
    summary:
      'Florida is a directory/registration state. Products must appear on the state’s authorized tobacco/nicotine product listing (tied to FDA marketing authorization / PMTA) to be lawfully sold or shipped to Florida consumers. Many popular disposable brands that lack PMTA authorization are therefore not legally available, while listed refillable systems and authorized e-liquids remain available to adults 21+. Always verify the specific product is on the current Florida directory before ordering.',
    lastReviewedAt: '2026-09-19',
    nextReviewAt: '2026-12-19',
    minAge: 21,
    flavor: 'Flavors are not categorically banned, but the product must be on the authorized directory.',
    disposable: 'Disposables are allowed only if listed/authorized; most non-PMTA disposables are not listed.',
    shipping: 'Online sellers must comply with PACT Act registration, age verification and the directory; unlisted products cannot legally ship.',
    coupon: 'No standalone vape-coupon ban.',
    directory: 'Yes — PMTA/authorized-product directory state. Check the current state listing.',
    sources: [
      { label: 'Florida DBPR — Tobacco Products Directory', url: 'https://www.myfloridalicense.com/DBPR/tobacco-products/' },
      { label: 'FDA — Vaping Products & Premarket Authorization (PMTA)', url: 'https://www.fda.gov/tobacco-products/products-ingredients-components/vaping-products-e-cigarettes' },
    ],
    canBuy: [
      'Products listed on Florida’s authorized directory',
      'Authorized refillable systems and e-liquids (21+)',
    ],
    cannotBuy: [
      'Disposables/products without PMTA that are not on the directory',
      'Off-list products from non-compliant online sellers',
    ],
  },
  NY: {
    status: 'active',
    headline: 'New York has a flavored-vape ban and strict online-shipping enforcement; only registered, authorized products can reach New York addresses.',
    summary:
      'New York bans the sale of flavored vapor products (other than tobacco flavor) and enforces a registered/authorized product list. Direct interstate shipment of vapes to New York consumers is tightly restricted under state rules and the federal PACT Act, and many unregistered online retailers will not ship to NY. Tobacco-flavored, registered products sold through compliant channels are the safest legal option for adults 21+.',
    lastReviewedAt: '2026-09-19',
    nextReviewAt: '2026-12-19',
    minAge: 21,
    flavor: 'Flavored (non-tobacco) vapor products are banned from sale.',
    disposable: 'Any disposable — flavored or unregistered — is not legally sold; only registered products qualify.',
    shipping: 'Interstate direct shipment is heavily restricted; many online retailers cannot legally deliver to NY.',
    coupon: 'Discounting does not make restricted products legal; follow current NY guidance.',
    directory: 'Yes — registration/authorized-product list model.',
    sources: [
      { label: 'New York State Department of Health — Vapor Products & Flavored Tobacco', url: 'https://www.health.ny.gov/prevention/tobacco_control/vapor_products/' },
      { label: 'ATF — PACT Act Registration', url: 'https://www.atf.gov/resource-center/keywords-alcohol-tobacco-firearms-explosives/pact-act' },
    ],
    canBuy: [
      'Registered tobacco-flavored products via compliant sellers',
    ],
    cannotBuy: [
      'Flavored (non-tobacco) vapes',
      'Unregistered disposables and orders from sellers that cannot ship to NY',
    ],
  },
  PA: {
    status: 'active',
    headline: 'Pennsylvania is a directory/registration state: products need PMTA authorization and state listing to be legally sold or shipped.',
    summary:
      'Pennsylvania restricts sales to products on its approved/registered tobacco products directory, linked to FDA marketing authorization. Popular disposables without PMTA are generally not listed and therefore cannot be lawfully sold or shipped to Pennsylvania addresses. PACT Act rules apply to online sellers (registration, age verification, shipping compliance). Authorized refillable devices and listed e-liquids remain available to adults 21+.',
    lastReviewedAt: '2026-09-19',
    nextReviewAt: '2026-12-19',
    minAge: 21,
    flavor: 'No standalone flavor ban, but flavored products still must be on the authorized directory.',
    disposable: 'Only listed/authorized disposables are legal; most no-PMTA disposables are excluded.',
    shipping: 'Online sales require PACT compliance and a listed product; verify the retailer ships to PA.',
    coupon: 'No separate vape-coupon ban.',
    directory: 'Yes — approved/registered product directory state.',
    sources: [
      { label: 'Pennsylvania Dept. of Revenue — Tobacco Tax / Products', url: 'https://www.revenue.pa.gov/TaxTypes/TobaccoTax/Pages/default.aspx' },
      { label: 'FDA — Vaping Products & Premarket Authorization (PMTA)', url: 'https://www.fda.gov/tobacco-products/products-ingredients-components/vaping-products-e-cigarettes' },
    ],
    canBuy: [
      'Products on the Pennsylvania approved directory',
      'Authorized refillable devices and listed e-liquids (21+)',
    ],
    cannotBuy: [
      'Unlisted/no-PMTA disposables',
      'Products from sellers that are not PACT-compliant',
    ],
  },
};

export function getStateBySlug(slug: string): StateRule | undefined {
  const s = slug.toLowerCase();
  return ALL_STATES.find((x) => x.slug === s || x.code.toLowerCase() === s);
}

export function getStateContent(state: StateRule): StateLawContent | null {
  const extra = STATE_CONTENT[state.code];
  if (!extra) return null;
  return { ...state, ...extra };
}

export const COMPLIANCE_DISCLAIMER =
  'Informational only, not legal advice. State vape rules change frequently. Final eligibility is determined by the retailer at checkout. International orders without FDA PMTA authorization may be seized by U.S. Customs.';

export const IMPORT_RISK_NOTICE =
  'Ships internationally (or from a U.S. warehouse run by an international seller). This channel is not subject to U.S. state PACT-Act checkout controls, and most imported vapes lack FDA PMTA authorization and may be seized or destroyed by U.S. Customs at entry; delivery is not guaranteed. Check your state rules before ordering.';

export { REVIEW_CUTOFF };
