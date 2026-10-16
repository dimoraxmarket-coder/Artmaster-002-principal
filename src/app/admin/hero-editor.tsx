"use client";
import { useEffect, useState } from "react";
import type { HeroAsset, HeroMedia } from "@/lib/content/types";
import { privateMedia } from "@/lib/content/assets";
import { MediaSelector } from "./media-selector";
import styles from "./growth.module.css";
export function HeroEditor({
  value,
  panoramicActive = false,
  onChange,
  onBusy,
}: {
  value: HeroMedia | undefined;
  panoramicActive?: boolean;
  onChange: (v: HeroMedia | undefined) => void;
  onBusy: (b: boolean) => void;
}) {
  const media = value || {
    desktop: { image: "/media/hero-wide.webp" },
    mobile: { image: "/media/hero-narrow.webp" },
  };
  return (
    <section className={styles.panel}>
      <h4>Banner · imagine sau video</h4>
      {panoramicActive && (
        <p role="note">
          Bannerul panoramic este activ și are prioritate pe homepage. Poți
          pregăti aici imaginea/video de fundal; pentru afișarea lor,
          dezactivează bannerul din „Banner Acasă”, salvează și publică separat.
          Datele ambelor variante sunt păstrate.
        </p>
      )}
      <p>
        Fișierele sunt private până la publicarea explicită. Desktop și mobil au
        imagini/postere separate. Video MP4/WebM, maximum 20 MB, fără
        transcodare automată; verifică redarea înainte de publicare.
      </p>
      {(["desktop", "mobile"] as const).map((key) => (
        <AssetEditor
          key={key}
          name={key === "desktop" ? "Desktop" : "Mobil"}
          asset={media[key] || media.desktop}
          ratio={key === "desktop" ? 16 / 9 : 9 / 16}
          onBusy={onBusy}
          onChange={(asset) => onChange({ ...media, [key]: asset })}
        />
      ))}
      {value && (
        <button
          type="button"
          className="button"
          onClick={() => {
            if (confirm("Revii la bannerul original în această ciornă?"))
              onChange(undefined);
          }}
        >
          Revino la bannerul original în ciornă
        </button>
      )}
    </section>
  );
}
function AssetEditor({
  name,
  asset,
  ratio,
  onChange,
  onBusy,
}: {
  name: string;
  asset: HeroAsset;
  ratio: number;
  onChange: (a: HeroAsset) => void;
  onBusy: (b: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [size, setSize] = useState({ width: 1, height: 1 }),
    [x, setX] = useState(0.5),
    [y, setY] = useState(0.5),
    [zoom, setZoom] = useState(1),
    [rights, setRights] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file || file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file),
      image = new window.Image();
    image.onload = () => {
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
      setPreview(url);
    };
    image.onerror = () => setError("Imaginea nu poate fi citită.");
    image.src = url;
    return () => {
      image.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  const width = Math.min(size.width, size.height * ratio) / zoom / size.width,
    height = (width * size.width) / ratio / size.height;
  const crop = { x: (1 - width) * x, y: (1 - height) * y, width, height };
  async function upload() {
    if (!file || !rights) return;
    onBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("rightsConfirmed", "true");
      if (!file.type.startsWith("video/"))
        form.set("crop", JSON.stringify(crop));
      const r = await fetch("/api/admin/hero", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      if (!r.ok)
        throw Error(
          "Încărcarea nu a reușit. Verifică formatul, mărimea și sesiunea.",
        );
      const result = await r.json();
      onChange(
        file.type.startsWith("video/")
          ? { ...asset, video: result.url }
          : { ...asset, image: result.url },
      );
      setFile(null);
      setPreview("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className={styles.assetEditor}>
      <h5>{name}</h5>
      <img
        className={styles.heroThumb}
        src={privateMedia(asset.image)}
        alt={`Banner ${name}`}
      />
      {asset.video && (
        <>
          <video
            muted
            className={styles.heroThumb}
            src={privateMedia(asset.video)}
            controls
            preload="metadata"
            aria-label={`Video ${name}`}
          />
          <button
            type="button"
            className="button"
            onClick={() => onChange({ image: asset.image })}
          >
            Elimină video din ciornă · {name}
          </button>
        </>
      )}
      <MediaSelector
        disabled={false}
        onSelect={(url) => onChange({ ...asset, image: url })}
      />
      <label className="field">
        Fișier nou · {name}
        <input
          type="file"
          accept="image/png,image/jpeg,video/mp4,video/webm"
          onChange={(e) => {
            setError("");
            setPreview("");
            setFile(e.target.files?.[0] || null);
            e.target.value = "";
          }}
        />
      </label>
      {preview && file && !file.type.startsWith("video/") && (
        <>
          <div className={styles.cropCanvas}>
            <img src={preview} alt="Imagine înainte de decupare" />
            <span
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
            />
          </div>
          <label className="field">
            Poziție orizontală · {name}
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={x}
              onChange={(e) => setX(+e.target.value)}
            />
          </label>
          <label className="field">
            Poziție verticală · {name}
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={y}
              onChange={(e) => setY(+e.target.value)}
            />
          </label>
          <label className="field">
            Zoom decupare · {name}
            <input
              type="range"
              min="1"
              max="3"
              step=".05"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
          </label>
        </>
      )}
      {file && (
        <>
          <label>
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />{" "}
            Confirm dreptul de utilizare pentru acest fișier · {name}
          </label>
          <button
            type="button"
            className="button"
            disabled={!rights}
            onClick={() => void upload()}
          >
            {file.type.startsWith("video/")
              ? "Încarcă video privat"
              : "Decupează și încarcă privat"}{" "}
            · {name}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
