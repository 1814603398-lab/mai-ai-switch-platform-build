export interface PresetWithPromotionFields {
  isPartner?: boolean;
  primePartner?: boolean;
  partnerPromotionKey?: string;
  category?: string;
}

/**
 * Commercial metadata is retained for compatibility with imported providers,
 * but the renderer must not expose promotional copy or affiliate entry points.
 */
export function isCommercialPartnerPreset(
  preset: PresetWithPromotionFields,
): boolean {
  // Official providers may carry a promotion key for compatibility with the
  // upstream preset schema. They are product integrations, not partner ads.
  if (preset.category === "official") return false;

  return Boolean(
    preset.isPartner || preset.primePartner || preset.partnerPromotionKey,
  );
}
