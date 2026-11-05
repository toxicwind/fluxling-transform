<div class="pl-hero">
  <p class="pl-kicker">codeflux family</p>
  <h1>Natural-language code transformation,<br><em>without the API key tax.</em></h1>
  <p class="pl-sub">Fluxling turns plain-English goals into unified diffs — via LLM when you want it, via <strong>deterministic rules</strong> when you don't. This fork adds an offline mutation core: byte-reproducible on <code>(rule, seed)</code>, zero dependencies, zero network.</p>
  <p class="pl-cta">
    <a class="pl-btn" href="quickstart/">Get started</a>
    <a class="pl-btn pl-btn-ghost" href="https://github.com/toxicwind/codeflux-fluxling">Source</a>
    <a class="pl-btn pl-btn-ghost" href="https://pypi.org/project/fluxling/">PyPI</a>
  </p>
</div>

<div class="pl-grid">
  <div class="pl-card">
    <h3>🧬 Offline <code>mutate</code></h3>
    <p>Rule-based source transforms emit real unified diffs. Same <code>(rule, seed)</code> → byte-identical output. <code>import fluxling.mutate</code> pulls in nothing.</p>
  </div>
  <div class="pl-card">
    <h3>🤖 LLM <code>smartapply</code></h3>
    <p>Fuzzy patch application with per-file threaded LLM conflict resolution — idempotent, context-preserving, model-agnostic (any OpenAI-compatible endpoint).</p>
  </div>
  <div class="pl-card">
    <h3>🛡️ Strict applier</h3>
    <p>Plain hunk applier for disk writes, with a traversal guard: <code>../../</code> targets are refused by default and only escape with an explicit opt-out.</p>
  </div>
  <div class="pl-card">
    <h3>⌨️ Two CLIs</h3>
    <p><code>fluxling</code> transforms files from a goal; <code>fluxling-apply</code> applies diffs from any tool — including the <code>agents/fix-test-agent.py</code> loop example.</p>
  </div>
</div>

<div class="pl-code">

```python
from fluxling.mutate import mutate_diff

# deterministic — rerun it forever, get the same diff
goal, diff = mutate_diff({"app.py": source}, rule=None, seed=3)
```

</div>

<div class="pl-fork">
  <h2>Fork vs upstream — audited, not vibes</h2>
  <p>Upstream (0.9.x) is the full-fat library: fuzzy apply machinery, relevance ranking, eager 40-symbol API.</p>
  <table class="pl-table">
    <tr><th></th><th>upstream 0.9.x</th><th>this fork 0.8.x</th></tr>
    <tr><td>Mutation</td><td>LLM only</td><td><strong>+ deterministic <code>mutate</code></strong></td></tr>
    <tr><td>Import cost</td><td>eager, 40+ symbols</td><td>lazy 5-symbol API</td></tr>
    <tr><td>Apply engine</td><td>fuzzy in-library</td><td>strict on disk (guarded) + fuzzy in <code>smartapply</code></td></tr>
    <tr><td>Network</td><td>required</td><td>optional — <code>mutate</code> never calls out</td></tr>
    <tr><td>Role</td><td>general-purpose library</td><td>codeflux deterministic backend</td></tr>
  </table>
</div>

<div class="pl-credit">
  <p>originally <a href="https://github.com/255BITS/patchling-py">255BITS/patchling-py</a> by <a href="https://255labs.xyz">255labs</a> — MIT. this fork exists because they built the hard parts.</p>
</div>
