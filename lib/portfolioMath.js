export function enrichHoldings(portfolio, quotes) {
  return portfolio.map((h) => {
    const quote = quotes[h.ticker];
    const currentPrice = quote?.price;
    const costBasis = h.shares * h.purchasePrice;
    const currentValue = currentPrice != null ? h.shares * currentPrice : null;
    const gainLoss = currentValue != null ? currentValue - costBasis : null;
    const gainLossPct = currentValue != null ? (gainLoss / costBasis) * 100 : null;

    return {
      ...h,
      currentPrice: currentPrice ?? null,
      costBasis,
      currentValue,
      gainLoss,
      gainLossPct,
    };
  });
}

export function portfolioTotals(enriched) {
  const knownRows = enriched.filter((r) => r.currentValue != null);
  const totalCost = knownRows.reduce((sum, r) => sum + r.costBasis, 0);
  const totalValue = knownRows.reduce((sum, r) => sum + r.currentValue, 0);
  const totalGainLoss = totalValue - totalCost;
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : null;

  return {
    totalCost,
    totalValue,
    totalGainLoss,
    totalGainLossPct,
    pricedHoldings: knownRows.length,
    totalHoldings: enriched.length,
  };
}
