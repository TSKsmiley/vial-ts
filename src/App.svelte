<script lang="ts">
  import { requestVialKeyboard, VialKeyboard, ProtocolError } from './lib/vial-hid'
  import { loadVil, saveVil, downloadVil, readVilFile } from './lib/vil'
  import { keycodeName, keycodeFromName } from './lib/keycodes'
  import type { VilFile } from './lib/types'

  // ── State ──────────────────────────────────────────────────────────────────

  let keyboard: VialKeyboard | null = $state(null)
  let vil: VilFile | null = $state(null)

  /** "keyboard" | "file" | null */
  let source: 'keyboard' | 'file' | null = $state(null)

  let activeLayer = $state(0)
  let status = $state('')
  let busy = $state(false)

  /** Currently editing: { layer, row, col } or null */
  let editing: { layer: number; row: number; col: number } | null = $state(null)
  let editValue = $state('')

  // ── Derived ────────────────────────────────────────────────────────────────

  const layers = $derived(vil ? (vil as VilFile).layout.length : 0)
  const rows   = $derived(vil ? ((vil as VilFile).layout[0]?.length ?? 0) : 0)
  const cols   = $derived(vil ? ((vil as VilFile).layout[0]?.[0]?.length ?? 0) : 0)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function setStatus(msg: string) { status = msg }

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    busy = true; status = ''
    try { return await fn() }
    catch (e) { setStatus(`⚠ ${(e as Error).message}`); return undefined }
    finally { busy = false }
  }

  // ── Connect to keyboard ────────────────────────────────────────────────────

  async function connectKeyboard() {
    await withBusy(async () => {
      const kb = await requestVialKeyboard()
      keyboard = kb
      source   = 'keyboard'
      vil      = kb.saveLayout()
      activeLayer = 0
      setStatus(`Connected: ${kb.name}  (${kb.layers} layers, ${kb.rows}×${kb.cols})`)
    })
  }

  async function disconnectKeyboard() {
    await withBusy(async () => {
      await keyboard!.disconnect()
      keyboard = null
      source   = null
      vil      = null
      setStatus('Disconnected.')
    })
  }

  // ── Load .vil file ─────────────────────────────────────────────────────────

  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement
    const file  = input.files?.[0]
    if (!file) return
    await withBusy(async () => {
      const loaded = await readVilFile(file)
      vil    = loaded
      source = 'file'
      activeLayer = 0
      setStatus(`Loaded: ${file.name}`)
    })
    input.value = ''
  }

  // ── Save .vil file ─────────────────────────────────────────────────────────

  function handleSave() {
    if (!vil) return
    downloadVil(saveVil(vil))
    setStatus('Saved keymap.vil')
  }

  /** Pull latest state from connected keyboard then download. */
  async function handleSaveFromKeyboard() {
    if (!keyboard) return
    await withBusy(async () => {
      vil = keyboard!.saveLayout()
      downloadVil(saveVil(vil))
      setStatus('Saved keymap.vil from keyboard')
    })
  }

  /** Push current VilFile layout to connected keyboard. */
  async function pushToKeyboard() {
    if (!keyboard || !vil) return
    await withBusy(async () => {
      await keyboard!.restoreLayout(vil!)
      setStatus('Keymap written to keyboard.')
    })
  }

  // ── Inline key editing ─────────────────────────────────────────────────────

  function startEdit(layer: number, row: number, col: number) {
    editing   = { layer, row, col }
    editValue = keycodeName(vil!.layout[layer][row][col])
  }

  function commitEdit() {
    if (!editing || !vil) { editing = null; return }
    const { layer, row, col } = editing
    const parsed = keycodeFromName(editValue.trim())
    const code = parsed !== undefined ? parsed : parseInt(editValue, 16)
    if (!Number.isNaN(code) && code >= 0 && code <= 0xFFFF) {
      // Clone to trigger Svelte reactivity
      const newVil: VilFile = {
        ...vil,
        layout: vil.layout.map((l, li) =>
          l.map((r, ri) =>
            r.map((c, ci) => (li === layer && ri === row && ci === col ? code : c))
          )
        ),
      }
      vil = newVil
      if (source === 'keyboard' && keyboard) {
        keyboard.setKey(layer, row, col, code).catch(e => setStatus(`⚠ ${e.message}`))
      }
    }
    editing = null
  }

  function cancelEdit() { editing = null }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }
</script>

<main>
  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <header>
    <span class="badge">vial-ts</span>
    <h1>Vial Keyboard Configurator</h1>
    <p class="subtitle">TypeScript + Svelte · WebHID · .vil files</p>
  </header>

  <!-- ── Toolbar ────────────────────────────────────────────────────────── -->
  <section class="toolbar card">
    <div class="toolbar-row">
      <!-- Connect / disconnect -->
      {#if keyboard}
        <button class="btn btn-danger" onclick={disconnectKeyboard} disabled={busy}>
          Disconnect
        </button>
        <span class="kb-name">🎹 {keyboard.name}</span>
      {:else}
        <button class="btn btn-primary" onclick={connectKeyboard} disabled={busy}>
          Connect keyboard
        </button>
      {/if}

      <div class="divider"></div>

      <!-- Load .vil -->
      <label class="btn btn-secondary" class:disabled={busy}>
        Load .vil
        <input type="file" accept=".vil,.json" onchange={handleFileInput} hidden />
      </label>

      <!-- Save .vil -->
      {#if vil}
        {#if source === 'keyboard'}
          <button class="btn btn-secondary" onclick={handleSaveFromKeyboard} disabled={busy}>
            Save .vil
          </button>
          <button class="btn btn-accent" onclick={pushToKeyboard} disabled={busy}>
            Push to keyboard
          </button>
        {:else}
          <button class="btn btn-secondary" onclick={handleSave} disabled={busy}>
            Save .vil
          </button>
          {#if keyboard}
            <button class="btn btn-accent" onclick={pushToKeyboard} disabled={busy}>
              Push to keyboard
            </button>
          {/if}
        {/if}
      {/if}
    </div>

    {#if status}
      <p class="status">{status}</p>
    {/if}
    {#if busy}
      <p class="status busy">Working…</p>
    {/if}
  </section>

  <!-- ── Keymap editor ──────────────────────────────────────────────────── -->
  {#if vil}
    <!-- Layer picker -->
    <section class="card layers-bar">
      <span class="label">Layer</span>
      {#each { length: layers } as _, i}
        <button
          class="layer-btn"
          class:active={activeLayer === i}
          onclick={() => { activeLayer = i; cancelEdit() }}
        >
          {i}
        </button>
      {/each}
    </section>

    <!-- Keymap grid -->
    <section class="card keymap-wrap">
      <h2>
        Layer {activeLayer}
        <span class="dim">({rows} × {cols})</span>
      </h2>

      <div class="keymap-grid" style="--cols: {cols}">
        {#each { length: rows } as _, r}
          {#each { length: cols } as _, c}
            {@const code = vil.layout[activeLayer][r][c]}
            {@const isEditing =
              editing?.layer === activeLayer &&
              editing?.row === r &&
              editing?.col === c}
            <div
              class="key"
              class:transparent={code === 0x0001}
              class:empty={code === 0x0000}
              role="button"
              tabindex="0"
              onclick={() => startEdit(activeLayer, r, c)}
              onkeydown={(e) => e.key === 'Enter' && startEdit(activeLayer, r, c)}
            >
              {#if isEditing}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="key-input"
                  bind:value={editValue}
                  autofocus
                  onblur={commitEdit}
                  onkeydown={handleKeyDown}
                />
              {:else}
                <span class="key-label">{keycodeName(code)}</span>
              {/if}
            </div>
          {/each}
        {/each}
      </div>
    </section>

  {:else}
    <!-- Empty state -->
    <section class="card empty-state">
      <p>Connect a Vial keyboard or load a <code>.vil</code> file to get started.</p>
      <div class="hint-grid">
        <div class="hint">
          <span class="hint-icon">🎹</span>
          <strong>Connect keyboard</strong>
          <span>Opens a WebHID picker. Select your Vial keyboard to read and edit its keymap live.</span>
        </div>
        <div class="hint">
          <span class="hint-icon">📂</span>
          <strong>Load .vil file</strong>
          <span>Open a <code>.vil</code> save file exported by the Vial desktop app and edit it offline.</span>
        </div>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    width: min(960px, 100%);
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
    display: grid;
    gap: 1rem;
  }

  /* ── header ── */
  header {
    border: 1px solid #2b315a;
    border-radius: 1rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(145deg, #11173a, #0d1022);
  }

  .badge {
    display: inline-block;
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    background: #4f46e5;
    color: #eef2ff;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: clamp(1.6rem, 3vw, 2.2rem);
    color: #f8f9ff;
  }

  h2 {
    margin: 0 0 0.85rem;
    font-size: 1rem;
    font-weight: 500;
    color: #c8cef7;
  }

  .dim { color: #6b7494; font-weight: 400; }

  .subtitle { margin: 0; color: #8892c0; font-size: 0.9rem; }

  /* ── card ── */
  .card {
    border: 1px solid #2b315a;
    border-radius: 1rem;
    padding: 1rem 1.25rem;
    background: #121737;
  }

  /* ── toolbar ── */
  .toolbar-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .divider {
    width: 1px;
    height: 1.6rem;
    background: #2b315a;
    margin: 0 0.25rem;
  }

  .kb-name {
    color: #a5b4fc;
    font-size: 0.9rem;
  }

  .status {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #8892c0;
  }

  .status.busy { color: #f59e0b; }

  /* ── buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.38rem 0.85rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s, box-shadow 0.15s;
    user-select: none;
    text-decoration: none;
  }

  .btn:disabled, .btn.disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .btn-primary  { background: #4f46e5; color: #fff; }
  .btn-secondary { background: #1e2448; color: #c8cef7; border: 1px solid #3b4275; }
  .btn-danger   { background: #7f1d1d; color: #fca5a5; }
  .btn-accent   { background: #065f46; color: #6ee7b7; }

  .btn:not(:disabled):hover { opacity: 0.85; box-shadow: 0 0 0 2px #4f46e5; }

  /* ── layer bar ── */
  .layers-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.65rem 1rem;
  }

  .label {
    color: #6b7494;
    font-size: 0.8rem;
    margin-right: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .layer-btn {
    padding: 0.25rem 0.65rem;
    border-radius: 0.4rem;
    background: #1e2448;
    border: 1px solid #3b4275;
    color: #c8cef7;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .layer-btn.active {
    background: #4f46e5;
    border-color: #6366f1;
    color: #fff;
  }

  /* ── keymap grid ── */
  .keymap-wrap { overflow-x: auto; }

  .keymap-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(46px, 1fr));
    gap: 4px;
  }

  .key {
    aspect-ratio: 1;
    min-width: 46px;
    max-width: 72px;
    border: 1px solid #3b4275;
    border-radius: 0.45rem;
    background: #0f1434;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
    padding: 2px;
  }

  .key:hover { border-color: #6366f1; background: #1a2050; }

  .key.transparent { opacity: 0.38; }
  .key.empty       { border-style: dashed; opacity: 0.28; }

  .key-label {
    font-size: 0.68rem;
    color: #c8cef7;
    text-align: center;
    word-break: break-all;
    line-height: 1.2;
    pointer-events: none;
  }

  .key-input {
    width: 100%;
    height: 100%;
    background: #1e2448;
    border: 1px solid #6366f1;
    border-radius: 0.35rem;
    color: #eef2ff;
    font-size: 0.68rem;
    text-align: center;
    padding: 0;
    outline: none;
  }

  /* ── empty state ── */
  .empty-state {
    padding: 2rem 1.5rem;
    text-align: center;
    color: #8892c0;
  }

  .empty-state p { margin: 0 0 1.5rem; }

  .hint-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .hint {
    border: 1px solid #2b315a;
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    text-align: left;
  }

  .hint-icon { font-size: 1.5rem; }
  .hint strong { color: #c8cef7; }
  .hint span { font-size: 0.85rem; }
  .hint code { background: #1e2448; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>
