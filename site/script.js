// vibe-flow landing — vanilla JS

const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

function initMobileNav() {
  const btn = document.getElementById('navToggle');
  const menu = document.getElementById('mobileNav');
  if (!btn || !menu) return;

  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  };

  setOpen(false);

  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    setOpen(!open);
  });

  // close on click
  menu.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const a = e.target.closest('a');
    if (a) setOpen(false);
  });
}

function initRevealOnScroll() {
  if (prefersReducedMotion) return;

  const els = Array.from(document.querySelectorAll('.reveal'));
  if (els.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );

  for (const el of els) io.observe(el);
}

function initCopyToClipboard() {
  const blocks = document.querySelectorAll('[data-copy]');

  for (const block of blocks) {
    const btn = block.querySelector('[data-copy-btn]');
    const code = block.querySelector('pre > code');
    if (!btn || !code) continue;

    btn.addEventListener('click', async () => {
      const text = code.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = prev;
          btn.disabled = false;
        }, 900);
      } catch {
        // fallback: select + execCommand
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        try { document.execCommand('copy'); } catch { /* user can Ctrl+C */ }
      }
    });
  }
}

async function initMermaid() {
  const nodes = document.querySelectorAll('[data-mermaid]');
  if (nodes.length === 0) return;

  // Mermaid ESM CDN (no build step)
  const mermaid = await import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs');

  mermaid.default.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    themeVariables: {
      primaryColor: '#1a1f2e',
      primaryBorderColor: 'rgba(255,255,255,0.20)',
      primaryTextColor: 'rgba(255,255,255,0.88)',
      lineColor: 'rgba(255,255,255,0.45)',
      secondaryColor: '#0f1422',
      tertiaryColor: '#0b0d14',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      nodeBorder: 'rgba(255,255,255,0.20)',
      clusterBkg: 'rgba(255,255,255,0.04)',
      clusterBorder: 'rgba(255,255,255,0.12)',
      mainBkg: 'rgba(0,0,0,0)',
      edgeLabelBackground: 'rgba(0,0,0,0.0)',
      // accent
      accent1: '#6366f1'
    },
  });

  let i = 0;
  for (const el of nodes) {
    const graph = el.textContent ?? '';
    const id = `mmd-${i++}`;
    try {
      const { svg } = await mermaid.default.render(id, graph);
      el.innerHTML = svg;
    } catch (err) {
      el.innerHTML = `<pre><code>${escapeHtml(graph)}</code></pre>`;
      // eslint-disable-next-line no-console
      console.warn('Mermaid render failed', err);
    }
  }
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

initMobileNav();
initRevealOnScroll();
initCopyToClipboard();
initMermaid().catch((err) => console.warn('Mermaid init failed:', err));
