<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

<thead>
  <tr>
    {#each app.activeColKeys as colKey}
      {@const colDef = app.ALL_COLUMNS.find((c) => c.key === colKey)!}
      <th style="width: {app.colWidths[colKey]}px;" class={colKey === 'name' ? 'th-name-col' : ''}>
        <div class="th-content {colKey === 'name' ? 'th-name-content' : ''}">
          {#if colKey === 'name'}
            <button
              type="button"
              class="th-sort-toggle-btn"
              onclick={app.toggleSortDirection}
              data-tooltip="Sort: {app.nameSortField === 'first'
                ? 'First'
                : 'Last'} name ({app.nameSortDirection === 'asc'
                ? 'A→Z'
                : 'Z→A'}) • Click to reverse"
              data-tooltip-pos="bottom-left"
              aria-label="Toggle sort direction"
            >
              <span class="th-col-label">{colDef ? colDef.label : 'Name'}</span>
              <span
                class="material-symbols-outlined th-sort-arrow"
                class:desc={app.nameSortDirection === 'desc'}
              >
                arrow_upward
              </span>
            </button>

            <div class="th-sort-menu-wrapper">
              <button
                type="button"
                class="th-sort-tune-btn"
                class:active={app.showSortMenu}
                onclick={(e) => {
                  e.stopPropagation();
                  app.showSortMenu = !app.showSortMenu;
                }}
                data-tooltip={app.showSortMenu ? '' : 'Name sorting options'}
                data-tooltip-pos="bottom-left"
                aria-haspopup="menu"
                aria-expanded={app.showSortMenu}
              >
                <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
              </button>

              {#if app.showSortMenu}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="menu-scrim"
                  style="position: fixed; inset: 0; z-index: 101; background: transparent;"
                  onclick={() => (app.showSortMenu = false)}
                  role="presentation"
                ></div>
                <div class="th-sort-popover" role="menu" aria-label="Sort options">
                  <div class="sort-menu-heading">Sort by</div>
                  <button
                    type="button"
                    class="sort-menu-item"
                    class:is-active={app.nameSortField === 'first'}
                    onclick={() => {
                      app.setSortField('first');
                      app.showSortMenu = false;
                    }}
                    role="menuitemradio"
                    aria-checked={app.nameSortField === 'first'}
                  >
                    <span class="material-symbols-outlined item-check-icon"
                      >{app.nameSortField === 'first' ? 'check' : ''}</span
                    >
                    <span>First name</span>
                  </button>
                  <button
                    type="button"
                    class="sort-menu-item"
                    class:is-active={app.nameSortField === 'last'}
                    onclick={() => {
                      app.setSortField('last');
                      app.showSortMenu = false;
                    }}
                    role="menuitemradio"
                    aria-checked={app.nameSortField === 'last'}
                  >
                    <span class="material-symbols-outlined item-check-icon"
                      >{app.nameSortField === 'last' ? 'check' : ''}</span
                    >
                    <span>Last name</span>
                  </button>

                  <div class="menu-divider"></div>
                  <div class="sort-menu-heading">Order</div>
                  <button
                    type="button"
                    class="sort-menu-item"
                    class:is-active={app.nameSortDirection === 'asc'}
                    onclick={() => {
                      app.setSortDirection('asc');
                      app.showSortMenu = false;
                    }}
                    role="menuitemradio"
                    aria-checked={app.nameSortDirection === 'asc'}
                  >
                    <span class="material-symbols-outlined item-check-icon"
                      >{app.nameSortDirection === 'asc' ? 'check' : ''}</span
                    >
                    <span>A &rarr; Z (Ascending)</span>
                  </button>
                  <button
                    type="button"
                    class="sort-menu-item"
                    class:is-active={app.nameSortDirection === 'desc'}
                    onclick={() => {
                      app.setSortDirection('desc');
                      app.showSortMenu = false;
                    }}
                    role="menuitemradio"
                    aria-checked={app.nameSortDirection === 'desc'}
                  >
                    <span class="material-symbols-outlined item-check-icon"
                      >{app.nameSortDirection === 'desc' ? 'check' : ''}</span
                    >
                    <span>Z &rarr; A (Reverse)</span>
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <span>{colDef ? colDef.label : colKey}</span>
          {/if}

          <div
            class="col-resizer"
            class:resizing={app.resizingCol === colKey}
            onmousedown={(e) => app.onResizeStart(colKey, e)}
            role="presentation"
            aria-hidden="true"
            data-tooltip="Drag to resize"
          ></div>
        </div>
      </th>
    {/each}
  </tr>
</thead>
