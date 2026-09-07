import type { OpenedPrepaidDeal } from './types';

export function summarizeOpenedPrepaidDeals(
  deals: readonly OpenedPrepaidDeal[],
) {
  return deals.reduce(
    (total, deal) => ({
      gross: total.gross + (deal.sum ?? 0),
      payout: total.payout + (deal.payout ?? 0),
    }),
    { gross: 0, payout: 0 },
  );
}
