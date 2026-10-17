"use client";
import Script from "next/script";
import { useEffect, useSyncExternalStore, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsLocation,
  analyticsReferrer,
  removeAnalyticsCookies,
} from "@/lib/analytics-privacy";
import Link from "next/link";
import type { Locale } from "@/lib/content/types";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function clientChoice() {
  try {
    return localStorage.getItem("artmaster-analytics") || "unset";
  } catch {
    return "declined";
  }
}
export function AnalyticsConsent({
  locale,
  measurementId,
  nonce,
}: {
  locale: Locale;
  measurementId: string;
  nonce: string;
}) {
  const choice = useSyncExternalStore(subscribe, clientChoice, () => "server");
  const pathname = usePathname(),
    lastPage = useRef("");
  useEffect(() => {
    if (choice === "server" || !/^G-[A-Z0-9]+$/.test(measurementId)) return;
    (window as unknown as Record<string, unknown>)[
      "ga-disable-" + measurementId
    ] = choice !== "accepted";
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
    if (choice !== "accepted") {
      lastPage.current = "";
      w.gtag?.("consent", "update", {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      removeAnalyticsCookies();
      return;
    }
    w.gtag?.("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    const pageView = () => {
      const location = analyticsLocation(window.location.href);
      if (w.gtag && location && lastPage.current !== location) {
        w.gtag("set", {
          page_location: location,
          page_referrer: analyticsReferrer(document.referrer),
        });
        w.gtag("event", "page_view", {
          page_location: location,
          page_referrer: analyticsReferrer(document.referrer),
          page_title: document.title,
        });
        lastPage.current = location;
      }
    };
    pageView();
    window.addEventListener("artmaster:analytics-ready", pageView);
    const track = (event: Event) => {
      const w = window as typeof window & {
        gtag?: (...args: unknown[]) => void;
      };
      if (event.type === "artmaster:quote-saved")
        w.gtag?.("event", "generate_lead", {
          method: "quote_form",
          page_location: analyticsLocation(window.location.href),
          page_referrer: analyticsReferrer(document.referrer),
        });
      else {
        const element =
          event.target instanceof Element ? event.target.closest("a") : null;
        if (element?.getAttribute("href")?.startsWith("tel:"))
          w.gtag?.("event", "contact", {
            method: "phone",
            page_location: analyticsLocation(window.location.href),
            page_referrer: analyticsReferrer(document.referrer),
          });
      }
    };
    window.addEventListener("artmaster:quote-saved", track);
    document.addEventListener("click", track);
    return () => {
      window.removeEventListener("artmaster:analytics-ready", pageView);
      window.removeEventListener("artmaster:quote-saved", track);
      document.removeEventListener("click", track);
    };
  }, [choice, measurementId, pathname]);
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return null;
  function choose(value: "accepted" | "declined") {
    try {
      localStorage.setItem("artmaster-analytics", value);
      window.dispatchEvent(new Event("storage"));
    } catch {
      /* Browser storage may be unavailable. */
    }
  }
  const text = {
    ro: {
      message: "Permiți măsurarea vizitelor pentru a îmbunătăți site-ul?",
      accept: "Accept analiza",
      decline: "Refuz",
      privacy: "Confidențialitate",
    },
    ru: {
      message: "Разрешить аналитику посещений для улучшения сайта?",
      accept: "Разрешить аналитику",
      decline: "Отклонить",
      privacy: "Конфиденциальность",
    },
    en: {
      message: "Allow visit measurement to help improve this website?",
      accept: "Allow analytics",
      decline: "Decline",
      privacy: "Privacy",
    },
  }[locale];
  return (
    <>
      {choice === "accepted" && (
        <>
          <Script
            src={"https://www.googletagmanager.com/gtag/js?id=" + measurementId}
            nonce={nonce}
            strategy="afterInteractive"
          />
          <Script
            id="artmaster-analytics-config"
            nonce={nonce}
            strategy="afterInteractive"
          >{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:false,page_location:window.location.origin+window.location.pathname,page_referrer:(function(){try{var u=new URL(document.referrer);return /^https?:$/.test(u.protocol)?u.origin:'';}catch(e){return '';}})(),anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});window.dispatchEvent(new Event('artmaster:analytics-ready'));`}</Script>
        </>
      )}
      {choice === "unset" && (
        <aside className="consent-banner" aria-label={text.privacy}>
          <p>
            {text.message}{" "}
            <Link href={"/" + locale + "/confidentialitate"}>
              {text.privacy}
            </Link>
          </p>
          <div>
            <button className="button" onClick={() => choose("accepted")}>
              {text.accept}
            </button>
            <button
              className="button button-secondary"
              onClick={() => choose("declined")}
            >
              {text.decline}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

export function ConsentSettings({ locale }: { locale: Locale }) {
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={() => {
        try {
          localStorage.removeItem("artmaster-analytics");
          window.dispatchEvent(new Event("storage"));
        } catch {
          /* Browser storage unavailable. */
        }
      }}
    >
      {
        {
          ro: "Modifică preferințele de analiză",
          ru: "Изменить настройки аналитики",
          en: "Change analytics preferences",
        }[locale]
      }
    </button>
  );
}
