import type { Localized, SiteContent, WebsiteCopy } from "./types";
import { t } from "../i18n";
export const aboutCopy = {
  ro: {
    title: "O idee bună merită o execuție atentă.",
    paragraph:
      "ARTMASTER lucrează în domeniul reclamei vizuale și al producției publicitare în Republica Moldova. Oficiul nostru se află în Durlești. Combinăm imprimarea UV și de mari dimensiuni cu producția de litere volumetrice, imprimarea 3D, gravura laser și frezarea CNC.",
    second:
      "Pornim de la scopul proiectului, analizăm fișierele și discutăm cerințele înainte de ofertare. Alegerea tehnologiei și detaliile de execuție se stabilesc pentru fiecare lucrare.",
    equipment: "Tehnologii care dau formă ideilor",
  },
  ru: {
    title: "Хорошая идея заслуживает тщательного исполнения.",
    paragraph:
      "ARTMASTER занимается визуальной рекламой и рекламным производством в Республике Молдова. Наш офис расположен в Дурлештах. Мы сочетаем УФ- и широкоформатную печать с производством объёмных букв, 3D-печатью, лазерной гравировкой и фрезеровкой ЧПУ.",
    second:
      "Начинаем с цели проекта, анализируем файлы и обсуждаем требования до расчёта предложения. Технология и детали изготовления подбираются для каждой работы.",
    equipment: "Технологии, которые воплощают идеи",
  },
  en: {
    title: "A good idea deserves careful execution.",
    paragraph:
      "ARTMASTER works in visual advertising and advertising production in the Republic of Moldova. Our office is in Durlești. We combine UV and large-format printing with channel letters, 3D printing, laser engraving and CNC milling.",
    second:
      "We start with your project’s purpose, review the files and discuss the requirements before preparing a quote. We select the technology and production details for each job.",
    equipment: "Technology that gives ideas a shape",
  },
};
const localized = (
  read: (locale: "ro" | "ru" | "en") => string,
): Localized => ({ ro: read("ro"), ru: read("ru"), en: read("en") });
export function websiteCopy(content: SiteContent): WebsiteCopy {
  return (
    content.copy || {
      hero: {
        eyebrow: localized((l) => t(l).hero.eyebrow),
        title: localized((l) => t(l).hero.title),
        accent: localized((l) => t(l).hero.accent),
        description: localized((l) => t(l).hero.description),
        quoteLabel: localized((l) => t(l).nav.quote),
        servicesLabel: localized((l) => t(l).hero.primary),
      },
      about: {
        title: localized((l) => t(l).about.title),
        summary: localized((l) => t(l).about.description),
        heading: localized((l) => aboutCopy[l].title),
        body: localized((l) => aboutCopy[l].paragraph),
        approach: localized((l) => aboutCopy[l].second),
        equipmentHeading: localized((l) => aboutCopy[l].equipment),
      },
    }
  );
}
