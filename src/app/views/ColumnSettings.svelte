<script lang="ts">
  import type { AppModel } from '../model.svelte';
  let { app }: { app: AppModel } = $props();
</script>

{#if app.showColCustomizer}
  <div
    class="modal-overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        app.showColCustomizer = false;
        app.openColDropdownSlot = null;
      }
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        if (app.openColDropdownSlot !== null) {
          app.openColDropdownSlot = null;
        } else {
          app.showColCustomizer = false;
        }
      }
    }}
    role="dialog"
    aria-modal="true"
    use:app.focusDialog
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-dialog col-order-dialog"
      role="document"
      onclick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.col-order-select-container')) {
          app.openColDropdownSlot = null;
        }
      }}
    >
      <div class="col-order-header">
        <h2 class="col-order-title">Change column order</h2>
      </div>
      <div class="col-order-body">
        <p class="col-order-subtitle">
          Choose columns to show and drag to change the order. Small screens may not display all
          columns.
        </p>

        <div class="col-order-list" role="list">
          <!-- 1. Fixed Name row -->
          <div class="col-order-row col-order-fixed-row" role="listitem">
            <span class="col-order-num">1.</span>
            <span class="col-order-fixed-name">Name</span>
          </div>

          <!-- Draggable slots 2 to N -->
          {#each app.activeColKeys.slice(1) as colKey, idx}
            {@const slotIndex = idx + 1}
            {@const isDropdownOpen = app.openColDropdownSlot === slotIndex}
            <div
              class="col-order-row col-order-slot-row"
              class:is-dragging={app.pointerDragSlot === slotIndex}
              class:is-drag-over={app.pointerOverSlot === slotIndex &&
                app.pointerDragSlot !== slotIndex}
              data-slot-index={slotIndex}
              role="listitem"
            >
              <span class="col-order-num">{slotIndex + 1}.</span>

              <div class="col-order-select-container">
                <button
                  type="button"
                  class="col-order-select-btn"
                  class:is-open={isDropdownOpen}
                  onclick={(e) => {
                    e.stopPropagation();
                    app.openColDropdownSlot = isDropdownOpen ? null : slotIndex;
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={isDropdownOpen}
                >
                  <span class="col-order-select-label">{app.getColumnLabel(colKey)}</span>
                  <span class="material-symbols-outlined col-order-arrow">
                    {isDropdownOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
                  </span>
                </button>

                {#if isDropdownOpen}
                  <div class="col-order-dropdown" role="listbox">
                    {#each app.AVAILABLE_SELECT_COLUMNS as opt}
                      <button
                        type="button"
                        class="col-order-option"
                        class:is-selected={opt.key === colKey}
                        onclick={(e) => {
                          e.stopPropagation();
                          app.selectColumnForSlot(slotIndex, opt.key);
                        }}
                        role="option"
                        aria-selected={opt.key === colKey}
                      >
                        <span>{opt.label}</span>
                        {#if opt.key === colKey}
                          <span class="material-symbols-outlined col-opt-check">check</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="col-reorder-actions">
                <div class="col-micro-arrows">
                  <button
                    type="button"
                    class="col-micro-btn"
                    disabled={slotIndex <= 1}
                    onclick={(e) => {
                      e.stopPropagation();
                      app.moveColumnSlot(slotIndex, -1);
                    }}
                    data-tooltip="Move up"
                    aria-label="Move up"
                  >
                    <span class="material-symbols-outlined">expand_less</span>
                  </button>
                  <button
                    type="button"
                    class="col-micro-btn"
                    disabled={slotIndex >= app.activeColKeys.length - 1}
                    onclick={(e) => {
                      e.stopPropagation();
                      app.moveColumnSlot(slotIndex, 1);
                    }}
                    data-tooltip="Move down"
                    aria-label="Move down"
                  >
                    <span class="material-symbols-outlined">expand_more</span>
                  </button>
                </div>

                <!-- svelte-ignore a11y_interactive_supports_focus -->
                <div
                  class="col-drag-handle-btn"
                  onpointerdown={(e) => app.startPointerDrag(slotIndex, e)}
                  data-tooltip="Drag to reorder"
                  aria-label="Drag to reorder"
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      app.moveColumnSlot(slotIndex, -1);
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      app.moveColumnSlot(slotIndex, 1);
                    }
                  }}
                >
                  <svg
                    width="18"
                    height="12"
                    viewBox="0 0 18 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <line
                      x1="0"
                      y1="2"
                      x2="18"
                      y2="2"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                    <line
                      x1="0"
                      y1="10"
                      x2="18"
                      y2="10"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="col-order-footer">
        <button type="button" class="col-order-btn-text" onclick={app.resetColumns}>Reset</button>
        <button
          type="button"
          class="col-order-btn-text col-order-btn-done"
          onclick={() => {
            app.showColCustomizer = false;
            app.openColDropdownSlot = null;
          }}
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
