<script lang="ts">
  type LayerPreview = {
    name: string
    keys: string[]
  }

  const layers: LayerPreview[] = [
    { name: 'Base', keys: ['ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BSPC'] },
    { name: 'Fn', keys: ['`', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'DEL'] },
  ]

  const vialFeatures = [
    'Type-safe keymap data models for layers and macros',
    'Reactive Svelte UI shell ready for HID/VIA protocol integration',
    'Portable frontend foundation for replacing the Python desktop UI',
  ]
</script>

<main>
  <header>
    <p class="badge">Prototype</p>
    <h1>vial-ts</h1>
    <p class="subtitle">A TypeScript + Svelte foundation for a web-based Vial UI.</p>
  </header>

  <section class="card">
    <h2>Migration goals</h2>
    <ul>
      {#each vialFeatures as feature}
        <li>{feature}</li>
      {/each}
    </ul>
  </section>

  <section class="card">
    <h2>Layer preview</h2>
    <div class="layer-grid">
      {#each layers as layer}
        <article>
          <h3>{layer.name}</h3>
          <div class="keys">
            {#each layer.keys as key}
              <span>{key}</span>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </section>
</main>
