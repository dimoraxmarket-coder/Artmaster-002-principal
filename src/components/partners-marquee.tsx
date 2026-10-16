"use client";

import { PublicImage as Image } from "./public-runtime";
import { useId, useState } from "react";
import type { Locale } from "@/lib/content/types";
import { safePartnerWebsite, type Partner } from "@/lib/partners";
import styles from "./partners-marquee.module.css";

const copy = {
  ro: {
    title: "Companii care au încredere în noi",
    description:
      "Construim relații durabile prin proiecte realizate cu precizie, creativitate și atenție la detalii.",
    previewTitle: "Parteneri — previzualizare",
    previewDescription:
      "Logouri demonstrative pentru prezentarea acestei secțiuni. Aceste exemple nu reprezintă clienți sau parteneri ARTMASTER.",
    pause: "Oprește animația",
    resume: "Pornește animația",
    list: "Parteneri ARTMASTER",
    examples: "Exemple de logo-uri",
  },
  ru: {
    title: "Компании, которые нам доверяют",
    description:
      "Мы строим долгосрочные отношения благодаря точному исполнению, творческому подходу и вниманию к деталям.",
    previewTitle: "Партнёры — предварительный просмотр",
    previewDescription:
      "Демонстрационные логотипы для оформления раздела. Эти примеры не являются клиентами или партнёрами ARTMASTER.",
    pause: "Остановить анимацию",
    resume: "Запустить анимацию",
    list: "Партнёры ARTMASTER",
    examples: "Примеры логотипов",
  },
  en: {
    title: "Companies that trust us",
    description:
      "We build lasting relationships through precise execution, creativity and attention to detail.",
    previewTitle: "Partners — preview",
    previewDescription:
      "Example logos showing how this section will look. These examples are not ARTMASTER clients or partners.",
    pause: "Pause animation",
    resume: "Resume animation",
    list: "ARTMASTER partners",
    examples: "Example logos",
  },
};

export function PartnersMarquee({
  locale,
  partners,
  exampleMode = false,
  reviewMode = false,
}: {
  locale: Locale;
  partners: Partner[];
  exampleMode?: boolean;
  reviewMode?: boolean;
}) {
  const [paused, setPaused] = useState(false);
  const id = useId();
  const text = copy[locale];
  if (!partners.length) return null;
  // Small real lists remain static. One inert clone closes long marquee loops.
  const animate =
    partners.length >= 8 ||
    (exampleMode &&
      partners.every((p) => p.logo?.startsWith("/partners/example-")));
  const items =
    animate && partners.length < 8 ? [...partners, ...partners] : partners;
  function item(partner: Partner, index: number, duplicate: boolean) {
    const hidden = duplicate || index >= partners.length;
    const href = safePartnerWebsite(partner.website);
    const graphic = partner.logo ? (
      <Image
        src={partner.logo}
        alt={hidden ? "" : partner.alt[locale]}
        width={172}
        height={80}
        sizes="172px"
        unoptimized
        className={styles.logo}
      />
    ) : (
      <span className={styles.wordmark}>{partner.name}</span>
    );
    return (
      <li
        key={`${partner.name}-${index}`}
        className={`${styles.item}${index >= partners.length ? ` ${styles.repeat}` : ""}`}
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={partner.name}
          >
            {graphic}
          </a>
        ) : (
          graphic
        )}
      </li>
    );
  }
  return (
    <section
      className={`section ${styles.section}`}
      aria-labelledby={`${id}-title`}
      data-partners-example={exampleMode || undefined}
      data-partners-section
    >
      <div className="container">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">ARTMASTER · {text.list}</p>
            <h2 id={`${id}-title`}>
              {exampleMode ? text.previewTitle : text.title}
            </h2>
            <p>
              {reviewMode
                ? {
                    ro: "Listă de revizuit. Identitatea companiilor, relațiile comerciale și drepturile logo-urilor trebuie confirmate înainte de publicare.",
                    ru: "Список на проверке. Подтвердите компании, деловые отношения и права на логотипы перед публикацией.",
                    en: "Review list. Confirm company identities, business relationships and logo permissions before publication.",
                  }[locale]
                : exampleMode
                  ? text.previewDescription
                  : text.description}
            </p>
          </div>
          <button
            type="button"
            hidden={!animate}
            className={styles.pause}
            aria-pressed={paused}
            aria-controls={`${id}-logos`}
            onClick={() => setPaused((previous) => !previous)}
          >
            {paused ? text.resume : text.pause}
          </button>
        </div>
        <div
          id={`${id}-logos`}
          className={`${styles.window}${!animate ? ` ${styles.static}` : ""}`}
          data-paused={paused || undefined}
        >
          <div
            className={styles.track}
            style={{
              animationDuration: `${Math.max(32, (items.length * 196) / 45)}s`,
            }}
          >
            <ul
              className={styles.set}
              aria-label={exampleMode ? text.examples : text.list}
            >
              {items.map((partner, index) => item(partner, index, false))}
            </ul>
            {animate && (
              <ul
                className={`${styles.set} ${styles.duplicate}`}
                aria-hidden="true"
                inert
              >
                {items.map((partner, index) => item(partner, index, true))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
