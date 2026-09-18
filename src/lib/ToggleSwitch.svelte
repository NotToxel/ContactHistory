<script lang="ts">
  let {
    checked = $bindable(false),
    disabled = false,
    label = '',
    id = '',
    onchange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    id?: string;
    onchange?: (checked: boolean) => void;
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  }
</script>

<button
  type="button"
  role="switch"
  {id}
  aria-checked={checked}
  aria-label={label}
  class="toggle-switch"
  class:checked
  class:disabled
  {disabled}
  tabindex={disabled ? -1 : 0}
  onclick={toggle}
  onkeydown={handleKeydown}
>
  <span class="toggle-thumb" aria-hidden="true"></span>
</button>

<style>
  .toggle-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 44px;
    height: 24px;
    padding: 0;
    background-color: var(--google-border);
    border: 2px solid transparent;
    border-radius: 9999px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .toggle-switch:focus-visible {
    box-shadow: 0 0 0 2px var(--surface-base), 0 0 0 4px var(--google-blue);
  }

  .toggle-switch.checked {
    background-color: var(--google-blue);
  }

  .toggle-switch.disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .toggle-thumb {
    position: absolute;
    left: 2px;
    top: 2px;
    width: 16px;
    height: 16px;
    background-color: #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .toggle-switch.checked .toggle-thumb {
    transform: translateX(20px);
  }

  :root[data-theme="dark"] .toggle-switch {
    background-color: #384352;
  }

  :root[data-theme="dark"] .toggle-switch.checked {
    background-color: var(--google-blue);
  }

  :root[data-theme="dark"] .toggle-thumb {
    background-color: #ffffff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
</style>
