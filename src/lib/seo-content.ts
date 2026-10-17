import type { Locale, Localized } from './content/types';
const l = (ro: string, ru: string, en: string): Localized => ({ ro, ru, en });

// Initial semantic map: actual services, natural synonyms, no volume/rank claims.
export const serviceSearchTerms: Record<string, Localized> = {
  'print-uv': l('print UV Moldova; print UV Chișinău; imprimare UV; print pe materiale rigide', 'УФ-печать Молдова; УФ-печать Кишинёв; печать на твёрдых материалах', 'UV printing Moldova; UV print Chisinau; rigid substrate printing'),
  'imprimare-mari-dimensiuni': l('imprimare de format mare; print mare Moldova; grafică vitrine; publicitate exterioară', 'широкоформатная печать Молдова; оформление витрин; наружная реклама', 'large-format printing Moldova; shop-window graphics; outdoor advertising'),
  'litere-volumetrice': l('litere volumetrice Moldova; litere 3D; firme luminoase — cerințe de iluminare în ofertă', 'объёмные буквы Молдова; 3D-буквы; вывески', 'dimensional lettering Moldova; channel letters; three-dimensional signs'),
  'imprimare-3d': l('imprimare 3D Chișinău; printare 3D Moldova; prototipuri 3D', '3D-печать Кишинёв; 3D-печать Молдова; прототипы', '3D printing Chisinau; 3D printing Moldova; prototypes'),
  'gravura-laser': l('gravură laser Moldova; gravare laser; personalizare laser', 'лазерная гравировка Молдова; персонализация лазером', 'laser engraving Moldova; laser personalisation'),
  'frezare-cnc': l('frezare CNC Chișinău; debitare CNC Moldova; prelucrare materiale publicitare', 'фрезеровка ЧПУ Кишинёв; резка ЧПУ Молдова; обработка рекламных материалов', 'CNC routing Chisinau; CNC cutting Moldova; advertising material machining'),
  'colantare-auto': l('colantare auto Moldova; încleiere auto; inscripționare auto; branding flote', 'оклейка автомобилей Молдова; реклама на автомобилях; брендирование автопарка', 'vehicle wrapping Moldova; vehicle graphics; fleet branding'),
  'stickere-personalizate': l('stickere personalizate Moldova; autocolante; etichete personalizate; grafică vitrine', 'наклейки на заказ Молдова; этикетки; графика на витрины', 'custom stickers Moldova; decals; custom labels; window graphics'),
  'print-bannere': l('print bannere Moldova; imprimare bannere; bannere publicitare', 'печать баннеров Молдова; рекламные баннеры', 'banner printing Moldova; advertising banners'),
  'branding-design': l('branding comercial; design publicitar Chișinău; identitate vizuală Moldova', 'брендинг Молдова; рекламный дизайн Кишинёв; фирменный стиль', 'branding Moldova; advertising design Chisinau; visual identity'),
  'standuri-expozitionale': l('standuri expoziționale Moldova; construcții publicitare; rame; vitrine', 'выставочные стенды Молдова; рекламные конструкции; витрины', 'exhibition stands Moldova; advertising structures; displays'),
};
const serviceNames: Record<string, Localized> = {
  'print-uv': l('Print UV', 'УФ-печать', 'UV printing'), 'imprimare-mari-dimensiuni': l('Imprimare de format mare', 'Широкоформатная печать', 'Large-format printing'),
  'litere-volumetrice': l('Litere volumetrice', 'Объёмные буквы', 'Dimensional lettering'), 'imprimare-3d': l('Imprimare 3D', '3D-печать', '3D printing'),
  'gravura-laser': l('Gravură laser', 'Лазерная гравировка', 'Laser engraving'), 'frezare-cnc': l('Frezare și debitare CNC', 'Фрезеровка и резка ЧПУ', 'CNC routing and cutting'),
  'colantare-auto': l('Colantare și inscripționare auto', 'Оклейка и брендирование автомобилей', 'Vehicle wrapping and graphics'),
  'stickere-personalizate': l('Stickere și etichete personalizate', 'Индивидуальные наклейки и этикетки', 'Custom stickers and labels'),
  'print-bannere': l('Print bannere', 'Печать баннеров', 'Banner printing'), 'branding-design': l('Branding și design publicitar', 'Брендинг и рекламный дизайн', 'Branding and advertising design'),
  'standuri-expozitionale': l('Standuri și construcții publicitare', 'Выставочные и рекламные конструкции', 'Exhibition and advertising structures'),
};
const sectionTitles: Record<string, Localized> = {
  '': l('Producție publicitară în Chișinău și Moldova', 'Рекламное производство в Кишинёве и Молдове', 'Advertising production in Chisinau, Moldova'),
  servicii: l('Servicii de producție publicitară în Moldova', 'Услуги рекламного производства в Молдове', 'Advertising production services in Moldova'),
  echipamente: l('Echipamente de print, 3D și CNC în Durlești', 'Оборудование для печати, 3D и ЧПУ в Дурлештах', 'Printing, 3D and CNC equipment in Durlești'),
  portofoliu: l('Portofoliu și concepte de producție publicitară', 'Портфолио и концепты рекламного производства', 'Advertising production portfolio and concepts'),
  'despre-noi': l('Despre atelierul ARTMASTER din Durlești', 'О мастерской ARTMASTER в Дурлештах', 'About the ARTMASTER workshop in Durlești'),
  contact: l('Contact — oficiu în Durlești, Moldova', 'Контакты — офис в Дурлештах, Молдова', 'Contact — Durlești office, Moldova'),
};
const legalDescriptions: Record<string, Localized> = {
  confidentialitate: l('Cum sunt prelucrate datele de contact, cererile de ofertă și fișierele trimise către ARTMASTER. Acces restricționat și drepturile tale.', 'Как ARTMASTER обрабатывает контактные данные, запросы и файлы. Ограниченный доступ к заявкам и ваши права.', 'How ARTMASTER processes contact details, quote requests and uploaded files. Restricted access and your data rights.'),
  termeni: l('Condiții pentru solicitarea ofertelor ARTMASTER, confirmarea comenzilor, utilizarea fișierelor și conținutul vizual.', 'Условия запросов ARTMASTER, подтверждения заказов, использования файлов и визуального контента.', 'Terms for ARTMASTER quote requests, order confirmation, submitted files and visual content.'),
  cookies: l('Informații despre cookie-urile necesare și analiza opțională a vizitelor ARTMASTER. Alege și modifică preferințele tale.', 'Информация о необходимых cookie и необязательной аналитике ARTMASTER. Выбор и изменение ваших настроек.', 'Necessary cookies and optional ARTMASTER website analytics. Choose and change your preferences.'),
};
export function localizedSeoCopy(locale: Locale, path: string, title: string, description: string) {
  const slug = path.startsWith('servicii/') ? path.slice('servicii/'.length) : undefined;
  const name = slug && serviceNames[slug]?.[locale];
  const serviceTitle = name ? ({ ro: `${name} în Moldova`, ru: `${name} в Молдове`, en: `${name} in Moldova` })[locale] : undefined;
  return { title: serviceTitle || sectionTitles[path]?.[locale] || title, description: legalDescriptions[path]?.[locale] || description };
}
