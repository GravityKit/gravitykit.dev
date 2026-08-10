/**
 * Throttle Docusaurus's viewport link prefetching.
 *
 * Every internal <Link> that enters the viewport calls
 * window.docusaurus.prefetch() synchronously from its own
 * IntersectionObserver callback. Each call route-matches against this site's
 * full route table (thousands of generated doc pages), costing ~50-70ms, and
 * a link-dense page like the homepage fires dozens back to back — measured as
 * ~1.2s of continuous main-thread work right after hydration, during which
 * clicks and the search box go dead. Safari compounds it by downloading every
 * prefetched chunk eagerly via XHR (it has no <link rel="prefetch"> support).
 *
 * clientEntry assigns window.docusaurus AFTER client modules evaluate, so a
 * property interceptor wraps prefetch at the moment of assignment. Queued
 * routes drain one per idle period instead of in a burst. Hover/touch preload
 * (docusaurus.preload) is untouched, so navigation stays instant. If core
 * ever stops assigning window.docusaurus, the interceptor simply never
 * engages and behavior reverts to stock.
 */

if (typeof window !== 'undefined') {
  const queue = [];
  const queued = new Set();
  let draining = false;
  let realDocusaurus;
  let wrappedDocusaurus;

  const idle = typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 })
    : (cb) => window.setTimeout(cb, 300);

  const drain = () => {
    if (draining || queue.length === 0) {
      return;
    }
    draining = true;
    idle(() => {
      draining = false;
      const route = queue.shift();
      if (route !== undefined && realDocusaurus) {
        realDocusaurus.prefetch(route);
      }
      drain();
    });
  };

  const throttledPrefetch = (route) => {
    if (queued.has(route)) {
      return false;
    }
    queued.add(route);
    queue.push(route);
    drain();
    return false;
  };

  Object.defineProperty(window, 'docusaurus', {
    configurable: true,
    get() {
      return wrappedDocusaurus || realDocusaurus;
    },
    set(value) {
      realDocusaurus = value;
      wrappedDocusaurus = Object.assign({}, value, { prefetch: throttledPrefetch });
    },
  });
}
