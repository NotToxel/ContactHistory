<script lang="ts">
  import type { Contact } from './ipc';
  import { printName, printOrganizations, printRows } from './contact-print';
  let { contacts }: { contacts: Contact[] } = $props();
  function printPortal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<section class="contact-print" use:printPortal aria-label="Contacts to print">
  <!-- Repeating spacers preserve paper margins without browser header/footer space. -->
  <table class="print-pages" role="presentation">
    <thead aria-hidden="true"><tr><td class="page-spacer"></td></tr></thead>
    <tbody><tr><td>
  {#each contacts as contact}
    <article>
      <h2>{printName(contact)}</h2>
      {#each printOrganizations(contact) as organization}
        <p class="print-organization">{organization}</p>
      {/each}
      {#if Array.isArray(contact.payload.names)}
        {#each contact.payload.names as name}
          {#if name.unstructuredName && name.unstructuredName !== contact.display_name && name.unstructuredName !== name.displayName}
            <p class="print-alternate-name">{name.unstructuredName}</p>
          {/if}
        {/each}
      {/if}
      {#each printRows(contact) as row}
        <div class="print-row">
          <div>{row.label}</div>
          <div>
            {#each row.values as value}
              <div class="print-value">{value.text}{#if value.type}<span> · {value.type}</span>{/if}</div>
            {/each}
          </div>
        </div>
      {/each}
    </article>
  {/each}
    </td></tr></tbody>
    <tfoot aria-hidden="true"><tr><td class="page-spacer"></td></tr></tfoot>
  </table>
</section>

<style>
  .contact-print { display: none; }
  @media print {
    /* Chromium omits its automatic headers/footers when page margins are zero. */
    @page { margin: 0; }
    :global(html), :global(body) { height: auto !important; overflow: visible !important; background: white !important; color-scheme: light; }
    :global(body > :not(.contact-print)) { display: none !important; }
    .contact-print { padding: 0 16mm; display: block; color: black; background: white; font: 10pt/1.3 'Times New Roman', serif; }
    .print-pages { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .print-pages td { padding: 0; border: 0; vertical-align: top; }
    .print-pages .page-spacer { height: 16mm; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    article { padding: 0 0 8pt; margin: 0 0 8pt; border-bottom: .5pt solid #ccc; }
    h2 { font: bold 12pt/1.3 'Times New Roman', serif; margin: 0 0 3pt; break-after: avoid; }
    .print-alternate-name { margin-bottom: 4pt; break-after: avoid; }
    .print-organization { margin: 0 0 4pt; overflow-wrap: anywhere; break-after: avoid; }
    .print-row { display: grid; grid-template-columns: 75pt minmax(0, 1fr); margin-bottom: 4pt; break-inside: avoid; }
    .print-value { white-space: pre-wrap; overflow-wrap: anywhere; margin-bottom: 3pt; }
    span { color: #666; }
  }
</style>

