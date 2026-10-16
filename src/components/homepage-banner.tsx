"use client";
import type { HomepageBanner, Locale } from "@/lib/content/types";
import { usePublicPreview } from "./public-runtime";
import styles from "./homepage-banner.module.css";

export function HomepageBannerView({
  banner,
  locale,
  title,
}: {
  banner: HomepageBanner;
  locale: Locale;
  title: string;
}) {
  const preview = usePublicPreview();
  const path = (image: string) =>
    preview ? image.replace(/^\/api\/media\//, "/api/admin/media/") : image;
  return (
    <section
      className={styles.banner}
      aria-labelledby="hero-title"
      data-homepage-banner
    >
      <h1 id="hero-title" className="sr-only">
        {title}
      </h1>
      <picture>
        {banner.mobile && (
          <source
            media="(max-width: 600px)"
            srcSet={path(banner.mobile.image)}
            width={banner.mobile.width}
            height={banner.mobile.height}
          />
        )}
        {/* Native picture keeps authenticated media outside the public image optimizer. */}
        <img
          src={path(banner.desktop.image)}
          alt={banner.desktop.alt[locale]}
          width={banner.desktop.width}
          height={banner.desktop.height}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </section>
  );
}
