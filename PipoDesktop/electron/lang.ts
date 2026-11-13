// Idiomas de las pistas de audio y subtítulos: códigos ISO 639 → nombre en español.
const NAMES: Record<string, string> = {
  spa: 'Español', eng: 'Inglés', por: 'Portugués', fra: 'Francés', deu: 'Alemán', ita: 'Italiano', jpn: 'Japonés',
  kor: 'Coreano', zho: 'Chino', rus: 'Ruso', ara: 'Árabe', hin: 'Hindi', nld: 'Neerlandés', pol: 'Polaco',
  tur: 'Turco', swe: 'Sueco', nor: 'Noruego', dan: 'Danés', fin: 'Finés', heb: 'Hebreo', ces: 'Checo',
  hun: 'Húngaro', ell: 'Griego', tha: 'Tailandés', vie: 'Vietnamita', ukr: 'Ucraniano', cat: 'Catalán',
  ron: 'Rumano', ind: 'Indonesio', fil: 'Filipino', glg: 'Gallego', eus: 'Vasco',
};

// Variantes habituales (ISO 639-1, 639-2/B, nombres) → código de tres letras.
const ALIASES: Record<string, string> = {
  es: 'spa', esp: 'spa', spanish: 'spa', español: 'spa', espanol: 'spa', castellano: 'spa', latino: 'spa', lat: 'spa', 'es-419': 'spa', 'es-es': 'spa', 'es-mx': 'spa',
  en: 'eng', english: 'eng', ingles: 'eng', inglés: 'eng', 'en-us': 'eng', 'en-gb': 'eng',
  pt: 'por', portuguese: 'por', 'pt-br': 'por', 'pt-pt': 'por', brazilian: 'por',
  fr: 'fra', fre: 'fra', french: 'fra', frances: 'fra', francés: 'fra',
  de: 'deu', ger: 'deu', german: 'deu', aleman: 'deu', alemán: 'deu',
  it: 'ita', italian: 'ita', ja: 'jpn', jp: 'jpn', japanese: 'jpn', ko: 'kor', korean: 'kor',
  zh: 'zho', chi: 'zho', chinese: 'zho', ru: 'rus', russian: 'rus', ar: 'ara', arabic: 'ara', hi: 'hin',
  nl: 'nld', dut: 'nld', pl: 'pol', tr: 'tur', sv: 'swe', swe: 'swe', no: 'nor', da: 'dan', fi: 'fin',
  he: 'heb', cs: 'ces', cze: 'ces', hu: 'hun', el: 'ell', gre: 'ell', th: 'tha', vi: 'vie', uk: 'ukr',
  ca: 'cat', ro: 'ron', rum: 'ron', id: 'ind', gl: 'glg', eu: 'eus',
};

/** Normaliza un código o nombre de idioma; '' si no se reconoce. */
export function normalizeLang(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (!k || k === 'und' || k === 'unk' || k === 'mis' || k === 'zxx') return '';
  if (NAMES[k]) return k;
  return ALIASES[k] ?? '';
}

/** ¿La palabra es el nombre o código de un idioma («English», «spa», «Español»)? */
export function isLanguageWord(word: string): boolean {
  return normalizeLang(word) !== '';
}

export function langName(code: string): string {
  return NAMES[code] ?? '';
}
