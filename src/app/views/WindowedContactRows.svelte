<script lang="ts">
  import ContactRow from './ContactRow.svelte';
  import { contactRowWindow } from '../contact-row-window';
  import type { Contact } from '../../lib/ipc';
  import type { AppModel } from '../model.svelte';

  let {
    app,
    contacts,
    viewport,
    rowOffset,
  }: {
    app: AppModel;
    contacts: Contact[];
    viewport: HTMLDivElement | undefined;
    rowOffset: number;
  } = $props();
  let topSpacer = $state<HTMLTableRowElement>();
  let scrollTop = $state(0);
  let viewportHeight = $state(800);
  let sectionTop = $state(0);
  const rowHeight = $derived(app.preferences.density === 'compact' ? 40 : 58);
  const range = $derived(
    contactRowWindow(contacts.length, scrollTop, viewportHeight, sectionTop, rowHeight),
  );
  const start = $derived(range.start);
  const end = $derived(range.end);

  $effect(() => {
    const element = viewport;
    if (!element) return;
    const update = () => {
      scrollTop = element.scrollTop;
      viewportHeight = element.clientHeight;
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  });

  $effect(() => {
    // A section's offset changes when favourites, filtering, or density changes.
    app.favouriteContacts.length;
    contacts.length;
    rowHeight;
    const spacer = topSpacer;
    const element = viewport;
    if (!spacer || !element) return;
    sectionTop =
      spacer.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
  });
</script>

<tr bind:this={topSpacer} class="contact-window-spacer" aria-hidden="true">
  <td colspan={app.activeColKeys.length} style="height: {start * rowHeight}px;"></td>
</tr>
{#each contacts.slice(start, end) as contact, index (contact.resource_name)}
  <ContactRow {app} {contact} rowIndex={rowOffset + start + index} />
{/each}
<tr class="contact-window-spacer" aria-hidden="true">
  <td colspan={app.activeColKeys.length} style="height: {(contacts.length - end) * rowHeight}px;"
  ></td>
</tr>
