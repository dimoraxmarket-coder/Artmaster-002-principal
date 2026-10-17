import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/content/types";
import { savedDraftPreview } from "@/lib/server/content-preview";
import { BackendError, publicOrigin } from "@/lib/server/config";
import { Home } from "@/components/home";
import { Header } from "@/components/header";
import { FloatingActions } from "@/components/floating-actions";
import { Footer } from "@/components/footer";
import { PublicContent, resolvePublicContent } from "@/components/public-content";
import { localizedSeoCopy } from "@/lib/seo-content";
import { metadataDescription } from "@/lib/content/seo";
import { websiteCopy } from "@/lib/content/page-copy";
import { PublicPreviewProvider } from "@/components/public-runtime";
import { PreviewWorkbench } from "./workbench";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const privateMetadata: Metadata = {
  title: "Protected draft preview | ARTMASTER",
  robots: { index: false, follow: false, noarchive: true },
};
export async function generateMetadata({ params }: { params: Promise<{ locale: string; segments?: string[] }> }): Promise<Metadata> {
  const { locale, segments = [] } = await params;
  if (!isLocale(locale)) return privateMetadata;
  try {
    const state = await savedDraftPreview(new Request(publicOrigin() + "/admin-preview", {
      headers: new Headers(await headers()),
    }));
    const content = state.content, path = segments.join("/");
    const item = segments.length ? resolvePublicContent(content, segments, locale, true) : null;
    if (segments.length && !item) return privateMetadata;
    const override = content.seo?.find((entry) => entry.path === path);
    const rawTitle = item ? typeof item.title === "string" ? item.title : item.title[locale] : websiteCopy(content).hero.title[locale];
    const rawSummary = item ? typeof item.summary === "string" ? item.summary : item.summary[locale] : websiteCopy(content).hero.description[locale];
    const detail = item && "description" in item ? typeof item.description === "string" ? item.description : item.description[locale] : rawSummary;
    const copy = override ? { title: override.title[locale], description: override.description[locale] }
      : localizedSeoCopy(locale, path, rawTitle, metadataDescription(rawSummary, detail));
    return { ...privateMetadata, title: { absolute: copy.title + (override ? "" : " | ARTMASTER") }, description: copy.description };
  } catch (error) {
    if (error instanceof BackendError && [401, 403].includes(error.status)) return privateMetadata;
    throw error;
  }
}
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; segments?: string[] }>;
  searchParams: Promise<{ canvas?: string; serviciu?: string }>;
}) {
  const { locale, segments = [] } = await params;
  if (!isLocale(locale)) notFound();
  let state;
  try {
    state = await savedDraftPreview(
      new Request(publicOrigin() + "/admin-preview", {
        headers: new Headers(await headers()),
      }),
    );
  } catch (error) {
    if (error instanceof BackendError && [401, 403].includes(error.status))
      redirect("/admin");
    throw error;
  }
  const query = await searchParams;
  if (query.canvas !== "1")
    return (
      <PreviewWorkbench
        locale={locale}
        segments={segments}
        version={state.version}
        hasDraft={state.hasDraft}
        entries={(
          ["services", "equipment", "projects", "articles"] as const
        ).flatMap((section) =>
          state.content[section].map((item) => ({
            path:
              {
                services: "servicii",
                equipment: "echipamente",
                projects: "portofoliu",
                articles: "blog",
              }[section] +
              "/" +
              item.slug,
            title: item.title,
          })),
        )}
      />
    );
  const { content } = state;
  return (
    <PublicPreviewProvider>
      <div
        role="note"
        style={{
          background: "#17191d",
          color: "#ffe16a",
          padding: "10px 20px",
          fontSize: 13,
        }}
      >
        ARTMASTER · CIORNĂ / DRAFT · v{state.version} · {locale.toUpperCase()} ·
        nepublicat / unpublished
      </div>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header locale={locale} contact={content.contact} />
      <main id="main-content">
        {segments.length ? (
          <PublicContent
            preview
            locale={locale}
            segments={segments}
            content={content}
            initialService={query.serviciu || ""}
          />
        ) : (
          <Home preview locale={locale} content={content} />
        )}
      </main>
      <Footer locale={locale} content={content} />
      <FloatingActions
        locale={locale}
        contact={content.contact}
        viber={process.env.CONTACT_VIBER_NUMBER || ""}
      />
    </PublicPreviewProvider>
  );
}
