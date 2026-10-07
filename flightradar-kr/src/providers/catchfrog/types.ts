/**
 * Catchfrog public "뚝 떨어진 항공권" deal (what the site shows: route, current
 * price, discount vs. the average price). This is a DEAL, not a date-searchable
 * fare — it is never put in the flight price ranking.
 */
export interface CatchfrogRawDeal {
  origin?: string; // "인천"
  destination?: string; // "후쿠오카"
  price?: string | number; // "165,300원"
  averagePrice?: string | number;
  discountPercent?: string | number; // "-44.7%"
  sourceUrl?: string;
}

export interface CatchfrogDeal {
  destination: string;
  price: number;
  averagePrice?: number;
  /** Fraction 0..1 below the average price. */
  discountPercent?: number;
  departureOrigin?: string;
  discoveredAt: string;
  sourceUrl: string;
}
