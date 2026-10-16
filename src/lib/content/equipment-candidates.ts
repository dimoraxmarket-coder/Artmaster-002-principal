import type { Equipment, EquipmentCatalog, Localized } from "./types";
const l = (ro: string, ru = ro, en = ro): Localized => ({ ro, ru, en });
// Candidate identity is not proof of ownership, exact configuration or image rights.
export const equipmentCandidates = [
  {
    slug: "roland-vs-640",
    model: "Roland VS-640",
    manufacturer: "Roland DG",
    sourceUrl: "https://downloadcenter.rolanddg.com/",
    note: "Confirmați VS-640 versus VS-640i pe eticheta aparatului.",
  },
  {
    slug: "roland-rs-540",
    model: "Roland RS-540",
    manufacturer: "Roland DG",
    sourceUrl: "https://downloadcenter.rolanddg.com/",
    note: "Model și configurație de verificat pe etichetă și în manualul oficial.",
  },
  {
    slug: "roland-rs-540i",
    model: "Roland RS-540i — neconfirmat",
    manufacturer: "Roland DG",
    sourceUrl: "https://downloadcenter.rolanddg.com/",
    note: "Denumirea RS-540i nu este verificată. Nu substituiți fotografia altui model.",
  },
  {
    slug: "mimaki-ujv55-320",
    model: "Mimaki UJV55-320",
    manufacturer: "Mimaki",
    sourceUrl: "https://mimaki.com/product/inkjet/i-roll/ujv55-320/",
    note: "Verificați aparatul din atelier separat de existența modelului la producător.",
  },
  {
    slug: "harfmak-hm-430",
    model: "Harfmak HM-430",
    manufacturer: "Harfmak",
    sourceUrl: "https://www.harfmak.com/",
    note: "Model, producător și utilizare de verificat cu eticheta și documentația oficială.",
  },
  {
    slug: "inc-s-max",
    model: "INC-S MAX — imprimantă 3D",
    manufacturer: "INC-S — de confirmat",
    sourceUrl: "",
    note: "Producătorul, denumirea exactă și volumul util nu sunt confirmate.",
  },
  {
    slug: "yusto-laser",
    model: "Laser Yusto — neconfirmat",
    manufacturer: "Yusto — de confirmat",
    sourceUrl: "",
    note: "Marca, modelul, puterea și suprafața utilă necesită confirmare.",
  },
  {
    slug: "cnc-2350-2250",
    model: "CNC ≈2350 × 2250 mm — neconfirmat",
    manufacturer: "",
    sourceUrl: "",
    note: "Dimensiuni orientative comunicate; nu sunt specificații verificate.",
  },
  {
    slug: "latex-model-necunoscut",
    model: "Imprimantă latex — model necunoscut",
    manufacturer: "",
    sourceUrl: "",
    note: "Sunt necesare producătorul, modelul, configurația și o fotografie proprie.",
  },
] as const;
export function emptyCatalog(model: string, order = 0): EquipmentCatalog {
  return {
    model,
    manufacturer: "",
    category: l("Producție", "Производство", "Production"),
    verification: "unverified",
    sourceUrl: "",
    imageRights: "pending",
    licenseNote: "",
    order,
    published: false,
    specs: [],
  };
}
export function candidateEquipment(
  candidate: (typeof equipmentCandidates)[number],
  order: number,
): Equipment {
  return {
    slug: candidate.slug,
    title: l(candidate.model),
    summary: l(
      "Candidat în curs de verificare.",
      "Кандидат на проверку.",
      "Candidate awaiting verification.",
    ),
    description: l(
      "Modelul, configurația și prezența în atelier trebuie confirmate înainte de publicare.",
      "Модель, комплектация и наличие в мастерской требуют подтверждения перед публикацией.",
      "Model, configuration and workshop ownership must be confirmed before publication.",
    ),
    image: "/images/equipment-placeholder.svg",
    serviceSlugs: [],
    facts: [],
    catalog: {
      ...emptyCatalog(candidate.model, order),
      manufacturer: candidate.manufacturer,
      sourceUrl: candidate.sourceUrl,
    },
  };
}
