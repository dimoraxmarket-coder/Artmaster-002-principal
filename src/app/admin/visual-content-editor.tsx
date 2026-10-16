"use client";
import Image from "next/image";
import { useId, useState } from "react";
import type {
  BannerAsset,
  Locale,
  ManagedPartner,
  SiteContent,
} from "@/lib/content/types";
import { screenshotPartnerCandidates } from "@/lib/content/partner-candidates";
import { MediaSelector } from "./media-selector";
import styles from "./visual-content-editor.module.css";

type Props = {
  content: SiteContent;
  locale: Locale;
  section: "banner" | "partners";
  disabled: boolean;
  mutate: (callback: (next: SiteContent) => void) => void;
  onBusy: (busy: boolean) => void;
};
const privatePath = (url: string) =>
  url.replace(/^\/api\/media\//, "/api/admin/media/");
const alt = (name: string) => ({
  ro: `Logo ${name}`,
  ru: `Логотип ${name}`,
  en: `${name} logo`,
});
export function VisualContentEditor({
  content,
  locale,
  section,
  disabled,
  mutate,
  onBusy,
}: Props) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const id = useId();
  const partners = content.partners || [];
  function edit(slug: string, patch: Partial<ManagedPartner>) {
    mutate((next) => {
      const p = next.partners?.find((p) => p.slug === slug);
      if (p) Object.assign(p, patch);
    });
  }
  async function upload(file: File, apply: (asset: BannerAsset) => void) {
    setError("");
    setMessage("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError(
        "Alege PNG sau JPEG de maximum 5 MB. SVG trebuie exportat în PNG înainte de încărcare.",
      );
      return;
    }
    onBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("purpose", "artwork");
      const response = await fetch("/api/admin/media", {
          method: "POST",
          body,
          credentials: "same-origin",
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(
          "Încărcarea nu a reușit. Verifică fișierul, sesiunea și spațiul disponibil.",
        );
      apply({
        image: data.url,
        width: data.width,
        height: data.height,
        alt: {
          ro: "Banner ARTMASTER: 0 600 10 400; design grafic, producție publicitară, echipamente moderne, montaj și logistică, soluții personalizate.",
          ru: "Баннер ARTMASTER: 0 600 10 400; графический дизайн, производство рекламы, современное оборудование, монтаж и логистика, индивидуальные решения.",
          en: "ARTMASTER banner: 0 600 10 400; graphic design, advertising production, modern equipment, installation and logistics, custom solutions.",
        },
      });
      setMessage(
        "Imagine încărcată în biblioteca privată. Salvează ciorna și verifică previzualizarea înainte de publicare.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(false);
    }
  }
  async function choose(
    url: string,
    width: number,
    height: number,
    apply: (asset: BannerAsset) => void,
  ) {
    setError("");
    if (!width || !height) {
      setError(
        "Pentru banner alege un fișier încărcat în Media Studio, cu dimensiuni cunoscute.",
      );
      return;
    }
    apply({
      image: url,
      width,
      height,
      alt: content.banner?.desktop.alt || {
        ro: "Banner ARTMASTER",
        ru: "Баннер ARTMASTER",
        en: "ARTMASTER banner",
      },
    });
  }
  function bannerAsset(size: "desktop" | "mobile") {
    const asset = content.banner?.[size];
    function apply(asset: BannerAsset) {
      mutate((next) => {
        if (!next.banner) next.banner = { enabled: false, desktop: asset };
        else next.banner[size] = asset;
      });
    }
    return (
      <section className={styles.card} key={size}>
        <h4>
          {size === "desktop"
            ? "Banner panoramic · desktop și tabletă"
            : "Banner mobil · opțional"}
        </h4>
        <p className={styles.muted}>
          Imaginea este afișată integral, fără decupare. Păstrează telefonul și
          toate cele cinci servicii.{" "}
          {size === "mobile"
            ? "Fără variantă mobilă, folosim panorama integrală."
            : "Încarcă fișierul original primit de la designer."}
        </p>
        {asset && (
          <>
            <Image
              src={privatePath(asset.image)}
              width={asset.width}
              height={asset.height}
              alt={asset.alt[locale]}
              unoptimized
              className={styles.bannerPreview}
            />
            <p className={styles.muted}>
              {asset.width} × {asset.height} · WebP · fără decupare
            </p>
            <label className="field">
              Descriere accesibilă · {locale.toUpperCase()}
              <textarea
                value={asset.alt[locale]}
                onChange={(e) =>
                  mutate((next) => {
                    next.banner![size]!.alt[locale] = e.target.value;
                  })
                }
              />
            </label>
          </>
        )}
        <MediaSelector
          disabled={disabled}
          onSelect={(url, a) =>
            void choose(url, a?.width || 0, a?.height || 0, apply)
          }
        />
        <label className="field">
          {size === "desktop"
            ? "Încarcă banner desktop"
            : "Încarcă banner mobil"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file, apply);
            }}
          />
        </label>
        {asset && size === "mobile" && (
          <button
            type="button"
            className="button"
            onClick={() =>
              mutate((next) => {
                delete next.banner!.mobile;
              })
            }
          >
            Folosește panorama și pe mobil
          </button>
        )}
      </section>
    );
  }
  return (
    <div className={styles.editor}>
      {error && (
        <p role="alert" className="form-status form-status-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-status">
          {message}
        </p>
      )}
      {section === "banner" ? (
        <>
          <p className={styles.muted}>
            Nu suprapunem texte sau butoane peste banner. Titlul SEO și
            descrierile rămân editabile în „Acasă și Despre noi”. Publicarea
            este explicită, prin comenzile de mai sus.
          </p>
          {content.banner && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={content.banner.enabled}
                onChange={(e) =>
                  mutate((next) => {
                    next.banner!.enabled = e.target.checked;
                  })
                }
              />
              Afișează bannerul după publicarea versiunii
            </label>
          )}
          <div className={styles.grid}>
            {bannerAsset("desktop")}
            {content.banner && bannerAsset("mobile")}
          </div>
          {!content.banner && (
            <p className="banner">
              Bannerul nou nu este încă importat. Imaginea existentă este
              păstrată până la încărcarea, verificarea și publicarea fișierului
              original.
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.muted}>
            Ordinea cardurilor este ordinea de afișare. Identitatea și relația
            se confirmă separat. Logo-urile necesită drept de utilizare și
            proveniență. Ascunderea sau arhivarea se aplică numai după
            publicarea versiunii și nu șterge fișierele.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className="button"
              disabled={partners.length >= 100}
              onClick={() =>
                mutate((next) => {
                  next.partners ||= [];
                  next.partners.push({
                    slug: `partener-${crypto.randomUUID()}`,
                    name: "Partener nou",
                    alt: alt("Partener nou"),
                    identity: "unconfirmed",
                    relationshipConfirmed: false,
                    rights: "unverified",
                    provenance: "",
                    status: "draft",
                  });
                })
              }
            >
              Adaugă partener
            </button>
            <button
              type="button"
              className="button"
              disabled={
                partners.some((p) => /^captura-\d+$/.test(p.slug)) ||
                partners.length > 85
              }
              onClick={() => {
                if (
                  window.confirm(
                    "Adaugi 15 candidați identificați în captură? Nicio relație și niciun logo nu sunt confirmate automat.",
                  )
                )
                  mutate((next) => {
                    next.partners = [
                      ...(next.partners || []),
                      ...screenshotPartnerCandidates(),
                    ];
                  });
              }}
            >
              Importă candidații din captură
            </button>
          </div>
          {!partners.length && (
            <p className="banner">
              Nu există parteneri administrați. Importă lista din captură pentru
              verificare sau adaugă un partener.
            </p>
          )}
          <div className={styles.grid}>
            {partners.map((p, i) => (
              <section
                key={p.slug}
                className={styles.card}
                aria-label={`Partener ${p.name}`}
              >
                <div className={styles.cardHeading}>
                  <h4>{p.name}</h4>
                  <span className={styles.badge}>
                    {p.status === "published"
                      ? "Programat pentru publicare"
                      : p.status === "draft"
                        ? "Ciornă"
                        : p.status === "hidden"
                          ? "Ascuns"
                          : "Arhivat"}
                  </span>
                </div>
                {p.image ? (
                  <Image
                    src={privatePath(p.image)}
                    width={240}
                    height={120}
                    alt={p.alt[locale]}
                    unoptimized
                    className={styles.logoPreview}
                  />
                ) : (
                  <div className={styles.textLogo}>
                    {p.name}
                    <small>Intrare text · logo neîncărcat</small>
                  </div>
                )}
                <label className="field">
                  Nume partener
                  <input
                    value={p.name}
                    maxLength={150}
                    onChange={(e) => edit(p.slug, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Descriere logo · {locale.toUpperCase()}
                  <input
                    value={p.alt[locale]}
                    onChange={(e) =>
                      edit(p.slug, {
                        alt: { ...p.alt, [locale]: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="field">
                  Website opțional · HTTPS
                  <input
                    type="url"
                    value={p.website || ""}
                    maxLength={500}
                    onChange={(e) =>
                      edit(p.slug, { website: e.target.value || undefined })
                    }
                  />
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={p.identity === "confirmed"}
                    onChange={(e) =>
                      edit(p.slug, {
                        identity: e.target.checked
                          ? "confirmed"
                          : "unconfirmed",
                        status: "draft",
                      })
                    }
                  />
                  Identitatea companiei este confirmată
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={p.relationshipConfirmed}
                    onChange={(e) =>
                      edit(p.slug, {
                        relationshipConfirmed: e.target.checked,
                        status: "draft",
                      })
                    }
                  />
                  Confirm relația ARTMASTER cu acest partener
                </label>
                <MediaSelector
                  disabled={disabled}
                  onSelect={(url) =>
                    edit(p.slug, {
                      image: url,
                      rights: "unverified",
                      provenance: "",
                      sourceUrl: undefined,
                      status: "draft",
                    })
                  }
                />
                <label className="field">
                  Încarcă logo PNG / JPEG
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file)
                        void upload(file, (asset) =>
                          edit(p.slug, {
                            image: asset.image,
                            rights: "unverified",
                            provenance: "",
                            sourceUrl: undefined,
                            status: "draft",
                          }),
                        );
                    }}
                  />
                </label>
                {p.image && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Elimini asocierea logo-ului? Fișierul rămâne în Media Studio.",
                        )
                      )
                        edit(p.slug, {
                          image: undefined,
                          rights: "unverified",
                          provenance: "",
                          sourceUrl: undefined,
                          status: "draft",
                        });
                    }}
                  >
                    Folosește doar numele
                  </button>
                )}
                <div className="field">
                  <label htmlFor={`${id}-${p.slug}-rights`}>
                    Drept de utilizare logo
                  </label>
                  <select
                    id={`${id}-${p.slug}-rights`}
                    value={p.rights}
                    onChange={(e) =>
                      edit(p.slug, {
                        rights: e.target.value as ManagedPartner["rights"],
                        status: "draft",
                      })
                    }
                  >
                    <option value="unverified">Neconfirmat</option>
                    <option value="owner-authorized">
                      Proprietarul confirmă permisiunea
                    </option>
                    <option value="official-permission">
                      Permisiune oficială documentată
                    </option>
                  </select>
                </div>
                <label className="field">
                  URL sursă / permisiune · HTTPS
                  <input
                    type="url"
                    value={p.sourceUrl || ""}
                    maxLength={500}
                    onChange={(e) =>
                      edit(p.slug, { sourceUrl: e.target.value || undefined })
                    }
                  />
                </label>
                <label className="field">
                  Proveniență și condiții de utilizare
                  <textarea
                    value={p.provenance}
                    maxLength={2000}
                    onChange={(e) =>
                      edit(p.slug, { provenance: e.target.value })
                    }
                  />
                </label>
                <label className="field" htmlFor={`${id}-${p.slug}-status`}>
                  Vizibilitate după publicarea versiunii
                </label>
                <select
                  id={`${id}-${p.slug}-status`}
                  value={p.status}
                  onChange={(e) => {
                    const status = e.target.value as ManagedPartner["status"];
                    if (
                      status !== "archived" ||
                      window.confirm(
                        `Arhivezi „${p.name}”? Fișierele și istoricul sunt păstrate.`,
                      )
                    )
                      edit(p.slug, { status });
                  }}
                >
                  <option value="draft">Ciornă</option>
                  <option
                    value="published"
                    disabled={
                      p.identity !== "confirmed" ||
                      !p.relationshipConfirmed ||
                      Boolean(
                        p.image &&
                        (p.rights === "unverified" ||
                          !p.provenance.trim() ||
                          (p.rights === "official-permission" && !p.sourceUrl)),
                      )
                    }
                  >
                    Publicat
                  </option>
                  <option value="hidden">Ascuns</option>
                  <option value="archived">Arhivat</option>
                </select>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="button"
                    disabled={i === 0}
                    aria-label={`Mută ${p.name} în sus`}
                    onClick={() =>
                      mutate((next) => {
                        [next.partners![i - 1], next.partners![i]] = [
                          next.partners![i],
                          next.partners![i - 1],
                        ];
                      })
                    }
                  >
                    ↑ În sus
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={i === partners.length - 1}
                    aria-label={`Mută ${p.name} în jos`}
                    onClick={() =>
                      mutate((next) => {
                        [next.partners![i], next.partners![i + 1]] = [
                          next.partners![i + 1],
                          next.partners![i],
                        ];
                      })
                    }
                  >
                    ↓ În jos
                  </button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
