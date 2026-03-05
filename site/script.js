/* ===== Mermaid Initialization ===== */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#6366f1',
        primaryTextColor: '#f1f5f9',
        primaryBorderColor: '#4f46e5',
        lineColor: '#64748b',
        secondaryColor: '#1e293b',
        tertiaryColor: '#111827',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        fontSize: '14px',
        nodeBorder: '#4f46e5',
        mainBkg: '#1e293b',
        clusterBkg: '#111827',
        titleColor: '#f1f5f9',
        edgeLabelBackground: '#111827',
        nodeTextColor: '#f1f5f9',
      },
    });
  }

  initScrollAnimations();
  initStatCounters();
  initCopyButtons();
  initSmoothScroll();
});

/* ===== Scroll-Triggered Animations ===== */
function initScrollAnimations() {
  var fadeEls = document.querySelectorAll('.fade-up');
  if (!fadeEls.length) return;

  if (!('IntersectionObserver' in window)) {
    fadeEls.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  fadeEls.forEach(function (el) { observer.observe(el); });
}

/* ===== Animated Stat Counters ===== */
function initStatCounters() {
  var statNumbers = document.querySelectorAll('.stat-number[data-target]');
  if (!statNumbers.length) return;

  if (!('IntersectionObserver' in window)) {
    statNumbers.forEach(function (el) {
      el.textContent = el.getAttribute('data-target');
    });
    return;
  }

  var animated = new Set();
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !animated.has(entry.target)) {
          animated.add(entry.target);
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  statNumbers.forEach(function (el) { observer.observe(el); });
}

function animateCounter(el) {
  var target = parseInt(el.getAttribute('data-target'), 10);
  var duration = 1500;
  var start = performance.now();

  function tick(now) {
    var elapsed = now - start;
    var progress = Math.min(elapsed / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

/* ===== Copy to Clipboard ===== */
function initCopyButtons() {
  var buttons = document.querySelectorAll('.code-copy');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-copy');
      var codeEl = document.getElementById(targetId);
      if (!codeEl) return;

      var text = codeEl.textContent
        .replace(/^#.*$/gm, '')
        .replace(/^\s*\n/gm, '')
        .trim();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showCopyFeedback(btn);
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showCopyFeedback(btn); }
        catch (e) { /* silent */ }
        document.body.removeChild(ta);
      }
    });
  });
}

function showCopyFeedback(btn) {
  var original = btn.innerHTML;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  btn.style.color = 'var(--accent-emerald)';
  setTimeout(function () {
    btn.innerHTML = original;
    btn.style.color = '';
  }, 2000);
}

/* ===== Smooth Scroll for Anchor Links ===== */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (href === '#') return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
