import type { ManagedPartner } from "./types";
// Transcribed from the owner's screenshot. No official websites or logo rights
// could be verified in this environment. Import only into an explicit new draft.
const names = [
  "ARGUS-S",
  "ARIDON",
  "BOSTAVAN",
  "CERAGEM",
  "CONLUXART",
  "EUROSTYLE",
  "Excellence Medical Center",
  "ZOLUȘCA",
  "MAXIMUM",
  "MICROINVEST",
  "Moldcell",
  "Moldpresa",
  "MONTACO",
  "Synevo",
  "Zepter International",
];
export function screenshotPartnerCandidates(): ManagedPartner[] {
  return names.map((name, index) => ({
    slug: `captura-${index + 1}`,
    name,
    alt: { ro: `Logo ${name}`, ru: `Логотип ${name}`, en: `${name} logo` },
    provenance:
      "Identificare vizuală din captura proprietarului din 16.10.2026. Sursa oficială, relația comercială și dreptul de publicare a logo-ului necesită confirmare.",
    identity: "unconfirmed",
    relationshipConfirmed: false,
    rights: "unverified",
    status: "draft",
  }));
}
