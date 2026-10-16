"use client";
import type {
  Equipment,
  EquipmentCatalog,
  Locale,
  Localized,
} from "@/lib/content/types";
import { emptyCatalog } from "@/lib/content/equipment-candidates";
import styles from "./growth.module.css";
export function EquipmentFields({
  equipment,
  locale,
  onChange,
}: {
  equipment: Equipment;
  locale: Locale;
  onChange: (c: EquipmentCatalog) => void;
}) {
  const c = equipment.catalog;
  if (!c)
    return (
      <div className={styles.panel}>
        <p>
          Fișă existentă păstrată. Adaugă verificarea modelului și drepturile
          imaginii înainte de a identifica un aparat exact.
        </p>
        <button
          className="button"
          type="button"
          onClick={() => onChange(emptyCatalog(equipment.title.ro))}
        >
          Activează fișa verificată în ciornă
        </button>
      </div>
    );
  function patch(value: Partial<EquipmentCatalog>) {
    onChange({ ...c!, ...value });
  }
  const localized = (key: "category", value: string) =>
    patch({ [key]: { ...c![key], [locale]: value } });
  const blank: Localized = { ro: "", ru: "", en: "" };
  return (
    <section className={styles.panel}>
      <h4>Identitate, surse și publicare</h4>
      <p>
        Existența unui model la producător nu confirmă aparatul din atelier sau
        dreptul de a copia fotografia. Publicarea necesită confirmare proprie și
        drepturi documentate.
      </p>
      <label className="field">
        Model exact
        <input
          value={c.model}
          maxLength={150}
          onChange={(e) => patch({ model: e.target.value })}
        />
      </label>
      <label className="field">
        Producător
        <input
          value={c.manufacturer}
          maxLength={150}
          onChange={(e) => patch({ manufacturer: e.target.value })}
        />
      </label>
      <label className="field">
        Categorie · {locale.toUpperCase()}
        <input
          value={c.category[locale]}
          onChange={(e) => localized("category", e.target.value)}
        />
      </label>
      <label className="field">
        Verificarea modelului
        <select
          value={c.verification}
          onChange={(e) =>
            patch({
              verification: e.target.value as EquipmentCatalog["verification"],
            })
          }
        >
          <option value="unverified">Neconfirmat</option>
          <option value="manufacturer_documented">
            Documentat la producător · atelier neconfirmat
          </option>
          <option value="owner_confirmed">
            Confirmat de proprietar în atelier
          </option>
        </select>
      </label>
      <label className="field">
        Sursă oficială / licență HTTPS
        <input
          type="url"
          value={c.sourceUrl}
          maxLength={1000}
          onChange={(e) => patch({ sourceUrl: e.target.value })}
        />
      </label>
      {c.sourceUrl && /^https:\/\//.test(c.sourceUrl) && (
        <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">
          Consultă sursa ↗
        </a>
      )}
      <label className="field">
        Drepturile imaginii
        <select
          value={c.imageRights}
          onChange={(e) =>
            patch({
              imageRights: e.target.value as EquipmentCatalog["imageRights"],
            })
          }
        >
          <option value="pending">Drepturi neconfirmate</option>
          <option value="owner">Fotografie proprie autorizată</option>
          <option value="licensed">Licență / permisiune documentată</option>
          <option value="concept">
            Ilustrație · nu este fotografie autentică
          </option>
        </select>
      </label>
      <label className="field">
        Dovada / nota drepturilor
        <textarea
          value={c.licenseNote}
          maxLength={2000}
          onChange={(e) => patch({ licenseNote: e.target.value })}
        />
      </label>
      <label className="field">
        Ordine în galerie
        <input
          type="number"
          min="0"
          max="10000"
          value={c.order}
          onChange={(e) => patch({ order: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={c.published}
          onChange={(e) => patch({ published: e.target.checked })}
        />{" "}
        Include după publicarea explicită a documentului
      </label>
      {c.published &&
        (c.verification !== "owner_confirmed" ||
          !["owner", "licensed"].includes(c.imageRights) ||
          !c.licenseNote.trim()) && (
          <p role="alert">
            Confirmă modelul în atelier și drepturile fotografiei. Serverul va
            refuza publicarea unei fișe incomplete.
          </p>
        )}
      <h4>Specificații · {locale.toUpperCase()}</h4>
      {c.specs.map((s, i) => (
        <div key={i} className={styles.spec}>
          <label className="field">
            Parametru {i + 1}
            <input
              value={s.label[locale]}
              onChange={(e) =>
                patch({
                  specs: c.specs.map((v, n) =>
                    n === i
                      ? {
                          ...v,
                          label: { ...v.label, [locale]: e.target.value },
                        }
                      : v,
                  ),
                })
              }
            />
          </label>
          <label className="field">
            Valoare {i + 1}
            <input
              value={s.value[locale]}
              onChange={(e) =>
                patch({
                  specs: c.specs.map((v, n) =>
                    n === i
                      ? {
                          ...v,
                          value: { ...v.value, [locale]: e.target.value },
                        }
                      : v,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (
                confirm(
                  "Elimini specificația din toate limbile în această ciornă?",
                )
              )
                patch({ specs: c.specs.filter((_, n) => n !== i) });
            }}
          >
            Elimină parametrul {i + 1}
          </button>
        </div>
      ))}
      <button
        className="button"
        type="button"
        disabled={c.specs.length >= 40}
        onClick={() =>
          patch({
            specs: [...c.specs, { label: { ...blank }, value: { ...blank } }],
          })
        }
      >
        Adaugă specificație
      </button>
    </section>
  );
}
