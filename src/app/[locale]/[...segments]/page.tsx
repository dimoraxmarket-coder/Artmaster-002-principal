import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getContent } from "@/lib/content/repository";
import { isLocale } from "@/lib/content/types";
import { pageMetadata } from "@/lib/seo";
import {
  PublicContent,
  resolvePublicContent,
} from "@/components/public-content";
type Props = {
  params: Promise<{ locale: string; segments: string[] }>;
  searchParams: Promise<{ serviciu?: string | string[] }>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, segments } = await params;
  if (!isLocale(locale)) return {};
  const content = await getContent();
  const item = resolvePublicContent(content, segments, locale);
  if (!item) return { title: "404" };
  const title =
    typeof item.title === "string" ? item.title : item.title[locale];
  const summary =
    typeof item.summary === "string" ? item.summary : item.summary[locale];
  const detail =
    "description" in item
      ? typeof item.description === "string"
        ? item.description
        : item.description[locale]
      : summary;
  const description =
    summary.trim().length < 50 && detail.trim().length >= 50
      ? detail
          .trim()
          .slice(0, 177)
          .replace(/\s+\S*$/, "") + "…"
      : summary;
  return pageMetadata(
    locale,
    segments.join("/"),
    title,
    description,
    !("kind" in item && item.kind === "concept"),
  );
}

export default async function ContentPage({ params, searchParams }: Props) {
  const { locale, segments } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent(),
    query = await searchParams;
  return (
    <PublicContent
      locale={locale}
      segments={segments}
      content={content}
      initialService={typeof query?.serviciu === "string" ? query.serviciu : ""}
    />
  );
}
