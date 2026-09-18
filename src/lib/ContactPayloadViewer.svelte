<script lang="ts">
  type JsonPrimitive = string | number | boolean | null;
  interface JsonObject { [key: string]: JsonValue }
  type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

  let {
    payload,
    maxHeight = '420px',
  }: {
    payload: Record<string, unknown> | null | undefined;
    maxHeight?: string;
  } = $props();

  // ── State ─────────────────────────────────────────────────────────────────
  let viewMode = $state<'tree' | 'code'>('tree');
  let showClean = $state(true);
  let searchQuery = $state('');
  let collapsed = $state<Set<string>>(new Set());
  let allCollapsed = $state(false);
  let copiedKey = $state<string | null>(null);
  let wrapCode = $state(true);

  // ── Derived ───────────────────────────────────────────────────────────────
  const NOISE_KEYS = new Set(['metadata', 'etag']);

  function cleanValue(val: unknown): unknown {
    if (Array.isArray(val)) return val.map(cleanValue);
    if (val && typeof val === 'object') {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>)
          .filter(([k]) => !NOISE_KEYS.has(k))
          .map(([k, v]) => [k, cleanValue(v)])
      );
    }
    return val;
  }

  const displayPayload = $derived(
    showClean ? (cleanValue(payload) as Record<string, unknown>) : payload
  );

  const jsonString = $derived(JSON.stringify(displayPayload, null, 2) ?? '');
  const lineCount = $derived(jsonString.split('\n').length);
  const byteSize = $derived(new TextEncoder().encode(jsonString).length);
  const topKeyCount = $derived(displayPayload ? Object.keys(displayPayload).length : 0);

  // ── Search matching ────────────────────────────────────────────────────────
  const searchLower = $derived(searchQuery.trim().toLowerCase());

  function matchesSearch(val: unknown, query: string): boolean {
    if (!query) return true;
    const s = JSON.stringify(val)?.toLowerCase() ?? '';
    return s.includes(query);
  }

  // ── Copy helpers ──────────────────────────────────────────────────────────
  async function copyText(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    copiedKey = key;
    setTimeout(() => { if (copiedKey === key) copiedKey = null; }, 2000);
  }

  function copyJson() { copyText(jsonString, '__root__'); }

  function downloadJson() {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'contact.json'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Collapse helpers ───────────────────────────────────────────────────────
  function toggleNode(path: string) {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path); else next.add(path);
    collapsed = next;
  }

  function collapseAll() {
    const paths = new Set<string>();
    function walk(val: unknown, path: string) {
      if (val && typeof val === 'object') {
        paths.add(path);
        for (const [k, v] of Object.entries(val as object)) walk(v, path + '.' + k);
      }
      if (Array.isArray(val)) {
        paths.add(path);
        val.forEach((v, i) => walk(v, path + '[' + i + ']'));
      }
    }
    walk(displayPayload, 'root');
    paths.delete('root');
    collapsed = paths;
    allCollapsed = true;
  }

  function expandAll() { collapsed = new Set(); allCollapsed = false; }

  // ── Syntax highlighted code view ───────────────────────────────────────────
  interface CodeToken { type: 'key' | 'str' | 'num' | 'bool' | 'null' | 'punc' | 'ws'; text: string; }

  function tokenizeJson(src: string): CodeToken[] {
    const tokens: CodeToken[] = [];
    let i = 0;
    while (i < src.length) {
      // whitespace / newlines
      if (/[\s]/.test(src[i])) {
        let ws = '';
        while (i < src.length && /[\s]/.test(src[i])) ws += src[i++];
        tokens.push({ type: 'ws', text: ws });
        continue;
      }
      // string
      if (src[i] === '"') {
        let str = '"'; i++;
        while (i < src.length) {
          if (src[i] === '\\') { str += src[i] + src[i + 1]; i += 2; }
          else if (src[i] === '"') { str += '"'; i++; break; }
          else { str += src[i++]; }
        }
        // check if followed by colon → it's a key
        let j = i;
        while (j < src.length && src[j] === ' ') j++;
        if (src[j] === ':') tokens.push({ type: 'key', text: str });
        else tokens.push({ type: 'str', text: str });
        continue;
      }
      // number
      if (/[-\d]/.test(src[i])) {
        let num = '';
        while (i < src.length && /[-\d.eE+]/.test(src[i])) num += src[i++];
        tokens.push({ type: 'num', text: num });
        continue;
      }
      // bool / null
      const rest = src.slice(i);
      for (const kw of ['true', 'false', 'null']) {
        if (rest.startsWith(kw)) {
          tokens.push({ type: kw === 'null' ? 'null' : 'bool', text: kw });
          i += kw.length;
          break;
        }
      }
      if (/[{}[\]:,]/.test(src[i])) { tokens.push({ type: 'punc', text: src[i] }); i++; continue; }
      i++;
    }
    return tokens;
  }

  const codeTokens = $derived(tokenizeJson(jsonString));

  // ── Tree rendering (recursive, Svelte 5 compatible) ────────────────────────
  interface TreeNode {
    path: string;
    key?: string | number;
    value: unknown;
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
    children?: TreeNode[];
    childCount?: number;
  }

  function buildTree(val: unknown, path: string, key?: string | number): TreeNode {
    if (val === null) return { path, key, value: val, type: 'null' };
    if (typeof val === 'boolean') return { path, key, value: val, type: 'boolean' };
    if (typeof val === 'number') return { path, key, value: val, type: 'number' };
    if (typeof val === 'string') return { path, key, value: val, type: 'string' };
    if (Array.isArray(val)) {
      const children = val.map((v, i) => buildTree(v, `${path}[${i}]`, i));
      return { path, key, value: val, type: 'array', children, childCount: val.length };
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>);
      const children = entries.map(([k, v]) => buildTree(v, `${path}.${k}`, k));
      return { path, key, value: val, type: 'object', children, childCount: entries.length };
    }
    return { path, key, value: val, type: 'null' };
  }

  const tree = $derived(buildTree(displayPayload, 'root'));

  function nodeVisible(node: TreeNode): boolean {
    if (!searchLower) return true;
    return matchesSearch(node.value, searchLower);
  }

  function searchMatchCount(): number {
    if (!searchLower) return 0;
    let count = 0;
    function walk(n: TreeNode) {
      if (n.type !== 'object' && n.type !== 'array') {
        if (String(n.value).toLowerCase().includes(searchLower) ||
            String(n.key ?? '').toLowerCase().includes(searchLower)) count++;
      }
      n.children?.forEach(walk);
    }
    walk(tree);
    return count;
  }

  const matchCount = $derived(searchMatchCount());

  function highlightText(text: string, query: string): string {
    if (!query) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      `<mark class="json-match">${escapeHtml(text.slice(idx, idx + query.length))}</mark>` +
      escapeHtml(text.slice(idx + query.length));
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
</script>

<!-- ─── Toolbar ─────────────────────────────────────────────────────────── -->
<div class="cpv-root">
  <div class="cpv-toolbar">
    <!-- Mode toggle -->
    <div class="cpv-mode-toggle" role="group" aria-label="View mode">
      <button
        class="cpv-mode-btn"
        class:active={viewMode === 'tree'}
        onclick={() => (viewMode = 'tree')}
        title="Interactive tree view"
      >
        <span class="material-symbols-outlined">account_tree</span>
        <span>Tree</span>
      </button>
      <button
        class="cpv-mode-btn"
        class:active={viewMode === 'code'}
        onclick={() => (viewMode = 'code')}
        title="Syntax-highlighted code"
      >
        <span class="material-symbols-outlined">code</span>
        <span>Code</span>
      </button>
    </div>

    <!-- Search -->
    <div class="cpv-search-wrap">
      <span class="material-symbols-outlined cpv-search-icon">search</span>
      <input
        class="cpv-search-input"
        type="search"
        placeholder="Search keys or values…"
        bind:value={searchQuery}
        aria-label="Search JSON"
      />
      {#if searchLower && matchCount > 0}
        <span class="cpv-match-badge">{matchCount}</span>
      {:else if searchLower}
        <span class="cpv-match-badge cpv-match-none">0</span>
      {/if}
    </div>

    <!-- Right actions -->
    <div class="cpv-actions">
      <!-- Clean toggle -->
      <button
        class="cpv-pill-btn"
        class:active={showClean}
        onclick={() => (showClean = !showClean)}
        title={showClean ? 'Showing cleaned payload (metadata stripped)' : 'Showing raw payload'}
      >
        <span class="material-symbols-outlined">filter_alt</span>
        <span>{showClean ? 'Clean' : 'Raw'}</span>
      </button>

      {#if viewMode === 'tree'}
        <button class="cpv-icon-btn" onclick={expandAll} title="Expand all nodes">
          <span class="material-symbols-outlined">unfold_more</span>
        </button>
        <button class="cpv-icon-btn" onclick={collapseAll} title="Collapse all nodes">
          <span class="material-symbols-outlined">unfold_less</span>
        </button>
      {:else}
        <button
          class="cpv-pill-btn"
          class:active={wrapCode}
          onclick={() => (wrapCode = !wrapCode)}
          title="Toggle line wrapping"
        >
          <span class="material-symbols-outlined">wrap_text</span>
        </button>
      {/if}

      <button class="cpv-icon-btn" onclick={copyJson} title="Copy JSON to clipboard">
        <span class="material-symbols-outlined">{copiedKey === '__root__' ? 'check' : 'content_copy'}</span>
      </button>
      <button class="cpv-icon-btn" onclick={downloadJson} title="Download as JSON file">
        <span class="material-symbols-outlined">download</span>
      </button>
    </div>
  </div>

  <!-- Meta pills -->
  <div class="cpv-meta-bar">
    <span class="cpv-meta-pill">
      <span class="material-symbols-outlined">view_list</span>
      {lineCount} lines
    </span>
    <span class="cpv-meta-pill">
      <span class="material-symbols-outlined">straighten</span>
      {byteSize < 1024 ? byteSize + ' B' : (byteSize / 1024).toFixed(1) + ' KB'}
    </span>
    <span class="cpv-meta-pill">
      <span class="material-symbols-outlined">category</span>
      {topKeyCount} top-level keys
    </span>
    {#if showClean}
      <span class="cpv-meta-pill cpv-meta-clean">
        <span class="material-symbols-outlined">auto_fix_high</span>
        metadata stripped
      </span>
    {/if}
  </div>

  <!-- ─── Content ──────────────────────────────────────────────────────── -->
  <div class="cpv-content" style="max-height: {maxHeight}">
    {#if viewMode === 'tree'}
      <div class="cpv-tree">
        {#if displayPayload}
          {@render treeNode(tree, 0, true)}
        {:else}
          <span class="cpv-empty">No payload data.</span>
        {/if}
      </div>
    {:else}
      <!-- Code view -->
      <div class="cpv-code" class:cpv-wrap={wrapCode}>
        {#each codeTokens as tok}
          {#if tok.type === 'ws'}
            {tok.text}
          {:else if tok.type === 'key'}
            <span class="tok-key">{@html highlightText(tok.text, searchLower)}</span>
          {:else if tok.type === 'str'}
            <span class="tok-str">{@html highlightText(tok.text, searchLower)}</span>
          {:else if tok.type === 'num'}
            <span class="tok-num">{tok.text}</span>
          {:else if tok.type === 'bool'}
            <span class="tok-bool">{tok.text}</span>
          {:else if tok.type === 'null'}
            <span class="tok-null">{tok.text}</span>
          {:else}
            <span class="tok-punc">{tok.text}</span>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- ─── Tree Node Snippet ─────────────────────────────────────────────── -->
{#snippet treeNode(node: TreeNode, depth: number, isRoot: boolean)}
  {@const isCollapsed = collapsed.has(node.path)}
  {@const isExpandable = node.type === 'object' || node.type === 'array'}
  {@const keyStr = node.key !== undefined ? String(node.key) : null}
  {@const visible = isRoot || nodeVisible(node)}

  {#if visible}
    <div
      class="cpv-node"
      class:cpv-node-root={isRoot}
      style="--depth: {depth}; padding-left: {isRoot ? 0 : depth * 18}px"
    >
      <!-- Row: button for expandable nodes, div for leaf nodes -->
      {#if isExpandable}
        <button
          type="button"
          class="cpv-node-row cpv-node-clickable"
          onclick={() => toggleNode(node.path)}
          aria-expanded={!isCollapsed}
        >
          <span class="cpv-caret material-symbols-outlined" class:rotated={!isCollapsed}>
            chevron_right
          </span>
          {#if keyStr !== null}
            <span class="cpv-key" class:cpv-key-index={typeof node.key === 'number'}>
              {@html highlightText(keyStr, searchLower)}
            </span>
            <span class="cpv-colon">:</span>
          {/if}
          {#if node.type === 'object'}
            {#if isCollapsed}
              <span class="cpv-collapse-preview">{`{ ${node.childCount} ${node.childCount === 1 ? 'key' : 'keys'} }`}</span>
            {:else}
              <span class="cpv-brace">{`{`}</span>
            {/if}
          {:else if node.type === 'array'}
            {#if isCollapsed}
              <span class="cpv-collapse-preview">{`[ ${node.childCount} ${node.childCount === 1 ? 'item' : 'items'} ]`}</span>
            {:else}
              <span class="cpv-bracket">{`[`}</span>
            {/if}
          {/if}
        </button>
      {:else}
        <div class="cpv-node-row">
          <span class="cpv-caret-spacer"></span>
          {#if keyStr !== null}
            <span class="cpv-key" class:cpv-key-index={typeof node.key === 'number'}>
              {@html highlightText(keyStr, searchLower)}
            </span>
            <span class="cpv-colon">:</span>
          {/if}
          {#if node.type === 'string'}
            <span class="cpv-val-str">{@html highlightText(`"${node.value}"`, searchLower)}</span>
          {:else if node.type === 'number'}
            <span class="cpv-val-num">{node.value}</span>
          {:else if node.type === 'boolean'}
            <span class="cpv-val-bool">{String(node.value)}</span>
          {:else}
            <span class="cpv-val-null">null</span>
          {/if}
          {#if !isRoot}
            <button
              class="cpv-copy-leaf"
              onclick={(e) => { e.stopPropagation(); copyText(String(node.value ?? ''), node.path); }}
              title="Copy value"
            >
              <span class="material-symbols-outlined">{copiedKey === node.path ? 'check' : 'content_copy'}</span>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Children -->
      {#if isExpandable && !isCollapsed}
        <div class="cpv-children">
          {#each node.children ?? [] as child (child.path)}
            {@render treeNode(child, depth + 1, false)}
          {/each}
          <!-- Closing bracket -->
          <div class="cpv-closing" style="padding-left: {depth * 18}px">
            <span class="cpv-brace">{node.type === 'object' ? '}' : ']'}</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<style>
  /* ── Root ───────────────────────────────────────────────────────────── */
  .cpv-root {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--surface-base);
    border: 1px solid var(--google-border);
    border-radius: 12px;
    overflow: hidden;
    font-size: 13px;
  }

  /* ── Toolbar ────────────────────────────────────────────────────────── */
  .cpv-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--google-surface);
    border-bottom: 1px solid var(--google-border-subtle);
    flex-wrap: wrap;
  }

  .cpv-mode-toggle {
    display: flex;
    border: 1px solid var(--google-border);
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .cpv-mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    border: none;
    background: transparent;
    font-size: 12.5px;
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .cpv-mode-btn .material-symbols-outlined { font-size: 15px; }

  .cpv-mode-btn.active {
    background: var(--google-blue-surface);
    color: var(--google-blue);
    font-weight: 600;
  }

  .cpv-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 140px;
  }

  .cpv-search-icon {
    position: absolute;
    left: 8px;
    font-size: 15px;
    color: var(--google-text-secondary);
    pointer-events: none;
  }

  .cpv-search-input {
    width: 100%;
    padding: 5px 8px 5px 30px;
    border: 1px solid var(--google-border);
    border-radius: 8px;
    font-size: 12.5px;
    background: var(--surface-base);
    color: var(--google-text);
    outline: none;
  }

  .cpv-search-input:focus { border-color: var(--google-blue); }

  .cpv-match-badge {
    position: absolute;
    right: 8px;
    font-size: 11px;
    font-weight: 600;
    background: var(--google-blue-surface);
    color: var(--google-blue);
    padding: 1px 6px;
    border-radius: 10px;
  }

  .cpv-match-none {
    background: var(--google-danger-surface);
    color: var(--google-danger);
  }

  .cpv-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .cpv-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .cpv-icon-btn:hover {
    background: var(--google-surface-hover);
    color: var(--google-text);
  }

  .cpv-icon-btn .material-symbols-outlined { font-size: 17px; }

  .cpv-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid var(--google-border);
    border-radius: 8px;
    background: transparent;
    font-size: 12px;
    color: var(--google-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .cpv-pill-btn .material-symbols-outlined { font-size: 14px; }

  .cpv-pill-btn.active {
    background: var(--google-blue-surface);
    border-color: var(--google-blue);
    color: var(--google-blue);
  }

  .cpv-pill-btn:hover:not(.active) { background: var(--google-surface-hover); }

  /* ── Meta bar ───────────────────────────────────────────────────────── */
  .cpv-meta-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--google-surface);
    border-bottom: 1px solid var(--google-border-subtle);
    flex-wrap: wrap;
  }

  .cpv-meta-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    color: var(--google-text-secondary);
    background: var(--surface-base);
    border: 1px solid var(--google-border-subtle);
    padding: 2px 8px;
    border-radius: 10px;
  }

  .cpv-meta-pill .material-symbols-outlined { font-size: 13px; }

  .cpv-meta-clean {
    background: var(--google-blue-surface);
    border-color: var(--google-blue);
    color: var(--google-blue);
  }

  /* ── Content area ───────────────────────────────────────────────────── */
  .cpv-content {
    overflow-y: auto;
    overflow-x: auto;
    background: var(--surface-base);
  }

  /* ── Tree view ──────────────────────────────────────────────────────── */
  .cpv-tree {
    padding: 10px 12px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 12.5px;
    line-height: 1.7;
  }

  .cpv-node {
    display: flex;
    flex-direction: column;
  }

  .cpv-node-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-height: 22px;
    border-radius: 5px;
    padding: 1px 4px 1px 2px;
    transition: background 0.1s;
    position: relative;
    /* Reset button styles when used as button element */
    border: none;
    background: transparent;
    text-align: left;
    width: 100%;
    font: inherit;
    color: inherit;
  }

  .cpv-node-row:hover .cpv-copy-leaf { opacity: 1; }
  .cpv-node-row:hover { background: rgba(0,0,0,0.03); }
  :root[data-theme="dark"] .cpv-node-row:hover { background: rgba(255,255,255,0.04); }

  .cpv-node-clickable { cursor: pointer; }


  .cpv-caret {
    font-size: 15px;
    color: var(--google-text-secondary);
    flex-shrink: 0;
    transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    line-height: 1;
    transform: rotate(0deg);
    margin-top: 2px;
  }

  .cpv-caret.rotated { transform: rotate(90deg); }

  .cpv-caret-spacer { width: 15px; flex-shrink: 0; }

  .cpv-key {
    color: var(--cpv-key-color, #1a6fe0);
    font-weight: 600;
    white-space: nowrap;
    user-select: text;
  }

  .cpv-key-index { color: var(--cpv-index-color, #6a5acd); }

  .cpv-colon {
    color: var(--google-text-secondary);
    margin-right: 2px;
  }

  .cpv-brace, .cpv-bracket {
    color: var(--google-text);
    font-weight: 500;
  }

  .cpv-collapse-preview {
    font-size: 11.5px;
    padding: 1px 8px;
    border-radius: 6px;
    background: var(--google-blue-surface);
    color: var(--google-blue);
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: border-color 0.1s;
    white-space: nowrap;
  }

  .cpv-node-clickable:hover .cpv-collapse-preview {
    border-color: var(--google-blue);
  }

  .cpv-val-str {
    color: var(--cpv-str-color, #1e7e34);
    word-break: break-all;
    user-select: text;
  }

  .cpv-val-num {
    color: var(--cpv-num-color, #d97706);
    user-select: text;
  }

  .cpv-val-bool {
    color: var(--cpv-bool-color, #be185d);
    font-weight: 600;
    user-select: text;
  }

  .cpv-val-null {
    color: var(--cpv-null-color, #6b7280);
    font-style: italic;
    user-select: text;
  }

  .cpv-children {
    display: flex;
    flex-direction: column;
    border-left: 2px solid var(--google-border-subtle);
    margin-left: 7px;
  }

  .cpv-closing {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 12.5px;
    color: var(--google-text);
    padding: 1px 4px;
  }

  .cpv-copy-leaf {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--google-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .cpv-copy-leaf:hover { background: var(--google-surface-hover); }
  .cpv-copy-leaf .material-symbols-outlined { font-size: 12px; }

  .cpv-empty {
    color: var(--google-text-secondary);
    font-style: italic;
    padding: 12px;
  }

  /* ── Code view ──────────────────────────────────────────────────────── */
  .cpv-code {
    display: block;
    padding: 12px 16px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 12.5px;
    line-height: 1.7;
    white-space: pre;
    overflow-x: auto;
    user-select: text;
    color: var(--google-text);
    min-width: max-content;
  }

  .cpv-code.cpv-wrap {
    white-space: pre-wrap;
    overflow-x: hidden;
    min-width: 0;
    word-break: break-all;
  }

  /* Token colors */
  .tok-key { color: var(--cpv-key-color, #1a6fe0); font-weight: 600; }
  .tok-str { color: var(--cpv-str-color, #1e7e34); }
  .tok-num { color: var(--cpv-num-color, #d97706); }
  .tok-bool { color: var(--cpv-bool-color, #be185d); font-weight: 600; }
  .tok-null { color: var(--cpv-null-color, #6b7280); font-style: italic; }
  .tok-punc { color: var(--google-text); }

  /* ── Dark theme overrides ───────────────────────────────────────────── */
  :root[data-theme="dark"] {
    --cpv-key-color: #88b4ff;
    --cpv-index-color: #c4b0ff;
    --cpv-str-color: #6ee7a0;
    --cpv-num-color: #fbbf24;
    --cpv-bool-color: #f472b6;
    --cpv-null-color: #94a3b8;
  }

  /* ── Search match highlight ─────────────────────────────────────────── */
  :global(.json-match) {
    background: #fef08a;
    color: #713f12;
    border-radius: 2px;
    padding: 0 1px;
  }

  :root[data-theme="dark"] :global(.json-match) {
    background: #854d0e;
    color: #fef9c3;
  }
</style>
