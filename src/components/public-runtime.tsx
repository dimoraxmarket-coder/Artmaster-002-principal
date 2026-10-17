"use client";
import NextLink from "next/link";
import NextImage from "next/image";
import { createContext, useContext, type ComponentProps } from "react";
const PreviewContext = createContext(false);
export function PublicPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PreviewContext.Provider value={true}>{children}</PreviewContext.Provider>
  );
}
export function usePublicPreview() {
  return useContext(PreviewContext);
}
export function PublicLink({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const preview = usePublicPreview();
  const path =
    preview && typeof href === "string" && /^\/(ro|ru|en)(?:[/?#]|$)/.test(href)
      ? `/admin-preview${href}${href.includes("?") ? "&" : "?"}canvas=1`
      : href;
  return (
    <NextLink
      {...props}
      href={path}
      prefetch={preview ? false : props.prefetch}
    />
  );
}
export function PublicImage({
  src,
  ...props
}: ComponentProps<typeof NextImage>) {
  const preview = usePublicPreview();
  // Managed bytes must be authorized on every request, including after unpublish.
  // An optimizer cache can outlive the public reference even with no-store upstream.
  const managed =
    typeof src === "string" && /^\/api\/(?:admin\/)?media\//.test(src);
  const path =
    preview && typeof src === "string" && src.startsWith("/api/media/")
      ? src.replace("/api/media/", "/api/admin/media/")
      : src;
  return (
    <NextImage
      {...props}
      src={path}
      unoptimized={preview || managed || props.unoptimized}
    />
  );
}
