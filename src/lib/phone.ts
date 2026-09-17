import parsePhoneNumber, { isSupportedCountry, type CountryCode } from 'libphonenumber-js';

export function formatPhone(value: string, canonical?: string, country?: string) {
  const raw = value.trim();
  const region = country?.toUpperCase();
  const defaultCountry: CountryCode | undefined = region && isSupportedCountry(region) ? region : undefined;
  // Google's canonical form disambiguates national numbers. Never guess a
  // country from the computer's locale: archives can contain any nationality.
  const parsed = [canonical, raw].filter(Boolean).map((input) =>
    parsePhoneNumber(input!, { defaultCountry, extract: false })
  ).find((phone) => phone?.isPossible());
  return {
    value: parsed ? parsed.formatInternational() : raw,
    uri: parsed ? parsed.getURI() : `tel:${raw.replace(/[^+\d*#;,]/g, '')}`,
  };
}
