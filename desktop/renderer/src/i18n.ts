import i18next from "i18next";

export type Locale = "zh-CN" | "en";

export async function initializeI18n(language: Locale = "zh-CN") {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: language,
      fallbackLng: "zh-CN",
      resources: {}
    });
  }
  await changeLanguage(language);
  return i18next;
}

export async function changeLanguage(language: Locale) {
  if (!i18next.hasResourceBundle(language, "translation")) {
    const pack = await loadLanguagePack(language);
    i18next.addResourceBundle(language, "translation", pack, true, true);
  }
  await i18next.changeLanguage(language);
}

export async function loadLanguagePack(language: Locale): Promise<Record<string, string>> {
  if (language === "en") {
    return (await import("../../../lib/i18n/locales/en.json")).default;
  }
  return (await import("../../../lib/i18n/locales/zh-CN.json")).default;
}

export function t(key: string, values?: Record<string, string | number>): string {
  return i18next.t(key, values);
}
