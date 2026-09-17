<script lang="ts">
  import { formatPhone } from './phone';
  let { before, after, labels = new Map<string, string>() }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null; labels?: Map<string, string> } = $props();
  const names: Record<string, string> = { names: 'Name', phoneNumbers: 'Phone numbers', emailAddresses: 'Email addresses', addresses: 'Addresses', organizations: 'Work', birthdays: 'Birthday', memberships: 'Labels', biographies: 'Notes', nicknames: 'Nickname', photos: 'Photo', urls: 'Websites', events: 'Events', relations: 'Relationships', userDefined: 'Custom fields' };
  function clean(value: any): any {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['metadata', 'etag'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, clean(val)]));
    return value;
  }
  function render(value: any, key: string): string {
    if (value == null) return 'Not set';
    if (Array.isArray(value)) return value.map((item) => render(item, key)).join('\n') || 'Not set';
    if (typeof value !== 'object') return String(value);
    if (key === 'phoneNumbers') return formatPhone(value.value || '', value.canonicalForm).value;
    if (key === 'memberships') { const resource = value.contactGroupMembership?.contactGroupResourceName; return resource ? labels.get(resource) || resource : render(clean(value), ''); }
    if (key === 'names') return value.displayName || [value.givenName, value.middleName, value.familyName].filter(Boolean).join(' ') || JSON.stringify(clean(value));
    if (value.date) return [value.date.day, value.date.month, value.date.year].filter(Boolean).join('/');
    if (value.formattedValue) return value.formattedValue;
    if (value.value) return [value.value, value.formattedType || value.type].filter(Boolean).join(' · ');
    return Object.entries(clean(value)).map(([field, val]) => `${field}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join('\n');
  }
  const fields = $derived([...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter((key) => !['metadata', 'etag', 'resourceName'].includes(key) && JSON.stringify(clean(before?.[key])) !== JSON.stringify(clean(after?.[key]))));
</script>
<div class="field-diff-list">
  {#each fields as key}
    <div class="field-diff">
      <h4>{names[key] || key.replace(/([A-Z])/g, ' $1')}</h4>
      <div class="field-diff-values">
        <div class="value-before"><span>Before</span><p>{render(before?.[key], key)}</p></div>
        <div class="value-after"><span>After</span><p>{render(after?.[key], key)}</p></div>
      </div>
    </div>
  {:else}
    <p class="timeline-note">No visible detail changes. Only archive metadata changed.</p>
  {/each}
</div>
