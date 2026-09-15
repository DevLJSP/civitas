// Minimal i18n scaffold. English is primary; other locales can override keys.
export type Locale = 'en' | 'pt';

type Dict = Record<string, string>;

const en: Dict = {
  'app.name': 'Civitas',
  'setup.welcome': 'Welcome to Civitas.',
  'election.title': 'Election',
  'vote.success': 'Your vote has been recorded.',
  'vote.duplicate': 'You have already voted.',
  'mandate.active': 'Active',
};

const pt: Dict = {
  'app.name': 'Civitas',
  'setup.welcome': 'Bem-vindo ao Civitas.',
  'election.title': 'Eleição',
  'vote.success': 'Seu voto foi registrado.',
  'vote.duplicate': 'Você já votou.',
  'mandate.active': 'Ativo',
};

const bundles: Record<Locale, Dict> = { en, pt };

export function t(key: string, locale: Locale = 'en', vars?: Record<string, string | number>): string {
  const bundle = bundles[locale] ?? bundles.en;
  let out = bundle[key] ?? bundles.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

export function normalizeLocale(raw?: string | null): Locale {
  if (raw === 'pt') return 'pt';
  return 'en';
}
