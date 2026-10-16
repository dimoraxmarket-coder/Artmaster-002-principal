"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import type { HeroMedia as Media, Locale } from "@/lib/content/types";
import { usePublicPreview } from "./public-runtime";
import { privateMedia } from "@/lib/content/assets";
function subscribe(callback: () => void) {
  const q = matchMedia("(max-width:480px)"),
    r = matchMedia("(prefers-reduced-motion:reduce)");
  q.addEventListener("change", callback);
  r.addEventListener("change", callback);
  return () => {
    q.removeEventListener("change", callback);
    r.removeEventListener("change", callback);
  };
}
export function HeroMedia({ media, locale }: { media: Media; locale: Locale }) {
  const preview = usePublicPreview(),
    video = useRef<HTMLVideoElement>(null),
    [paused, setPaused] = useState(false);
  const mode = useSyncExternalStore(
    subscribe,
    () =>
      `${matchMedia("(max-width:480px)").matches}:${matchMedia("(prefers-reduced-motion:reduce)").matches}`,
    () => "false:true",
  );
  const [mobile, reduced] = mode.split(":"),
    asset = mobile === "true" && media.mobile ? media.mobile : media.desktop;
  const path = (url: string) => (preview ? privateMedia(url) : url);
  const label = paused
    ? { ro: "Redă animația", ru: "Воспроизвести видео", en: "Play animation" }
    : {
        ro: "Oprește animația",
        ru: "Приостановить видео",
        en: "Pause animation",
      };
  return (
    <>
      <picture className="hero-picture">
        <source
          media="(max-width:480px)"
          srcSet={path(media.mobile?.image || media.desktop.image)}
        />
        <img
          className="hero-background"
          src={path(media.desktop.image)}
          alt=""
          width={1672}
          height={941}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      {asset.video && reduced === "false" && (
        <>
          <video
            ref={video}
            key={asset.video}
            className="hero-background hero-video"
            src={path(asset.video)}
            poster={path(asset.image)}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            onPause={() => setPaused(true)}
            onPlay={() => setPaused(false)}
          />
          <button
            className="hero-motion-control"
            type="button"
            onClick={() => {
              if (!video.current) return;
              if (video.current.paused)
                void video.current.play().catch(() => setPaused(true));
              else video.current.pause();
            }}
          >
            {label[locale]}
          </button>
        </>
      )}
    </>
  );
}
