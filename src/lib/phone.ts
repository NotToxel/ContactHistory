import parsePhoneNumber, {
  isSupportedCountry,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js';

/**
 * Detect the host operating system / browser locale country code.
 * This uses standard Web APIs that require zero extra permissions.
 */
export function detectSystemCountry(): CountryCode {
  try {
    if (typeof Intl !== 'undefined' && Intl.Locale) {
      const locale = new Intl.Locale(navigator.language);
      const region = locale.region?.toUpperCase();
      if (region && isSupportedCountry(region as CountryCode)) {
        return region as CountryCode;
      }
    }
    const match = /^[a-z]{2,3}[-_]([A-Za-z]{2})/i.exec(navigator.language || '');
    if (match) {
      const candidate = match[1].toUpperCase();
      if (isSupportedCountry(candidate as CountryCode)) {
        return candidate as CountryCode;
      }
    }
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    const resolvedMatch = /^[a-z]{2,3}[-_]([A-Za-z]{2})/i.exec(resolved || '');
    if (resolvedMatch) {
      const candidate = resolvedMatch[1].toUpperCase();
      if (isSupportedCountry(candidate as CountryCode)) {
        return candidate as CountryCode;
      }
    }
  } catch (_) {}
  return 'US';
}

export interface CountryOption {
  value: string;
  label: string;
  sublabel: string;
}

let cachedCountryOptions: CountryOption[] | null = null;

export function getCountryOptions(): CountryOption[] {
  if (cachedCountryOptions) return cachedCountryOptions;

  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const detected = detectSystemCountry();
  let detectedName: string = detected;
  try {
    detectedName = displayNames.of(detected) || detected;
  } catch (_) {}
  let detectedCalling = '';
  try {
    detectedCalling = `+${getCountryCallingCode(detected)}`;
  } catch (_) {}

  const autoOption: CountryOption = {
    value: 'auto',
    label: 'Auto-detect',
    sublabel: `${detectedName} (${detectedCalling})`,
  };

  const countries = getCountries();
  const list: CountryOption[] = countries.map((code) => {
    let name: string = code;
    try {
      name = displayNames.of(code) || code;
    } catch (_) {}
    let calling = '';
    try {
      calling = `+${getCountryCallingCode(code)}`;
    } catch (_) {}
    return {
      value: code,
      label: name,
      sublabel: calling,
    };
  });

  list.sort((a, b) => a.label.localeCompare(b.label));
  cachedCountryOptions = [autoOption, ...list];
  return cachedCountryOptions;
}

export function formatPhone(value: string, canonical?: string, country?: string) {
  const raw = (value || '').trim();
  if (!raw) return { value: '', uri: '' };

  const resolvedRegion = country && country !== 'auto' ? country.toUpperCase() : detectSystemCountry();
  const defaultCountry: CountryCode | undefined =
    resolvedRegion && isSupportedCountry(resolvedRegion as CountryCode)
      ? (resolvedRegion as CountryCode)
      : undefined;

  // Google's canonical form disambiguates national numbers. Fall back to
  // the configured or detected default country to parse national formats.
  const parsed = [canonical, raw]
    .filter(Boolean)
    .map((input) => parsePhoneNumber(input!, { defaultCountry, extract: false }))
    .find((phone) => phone?.isPossible());

  return {
    value: parsed ? parsed.formatInternational() : raw,
    uri: parsed ? parsed.getURI() : `tel:${raw.replace(/[^+\d*#;,]/g, '')}`,
  };
}
