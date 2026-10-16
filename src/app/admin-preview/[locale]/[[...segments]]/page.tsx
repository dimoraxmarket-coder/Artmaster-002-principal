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
import { PublicContent } from "@/components/public-content";
import { PublicPreviewProvider } from "@/components/public-runtime";
import { PreviewWorkbench } from "./workbench";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Protected draft preview | ARTMASTER",
  robots: { index: false, follow: false, noarchive: true },
};
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
