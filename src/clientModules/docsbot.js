/**
 * DocsBot AI chat widget — deferred initialization.
 *
 * chat.js is ~1 MB and bundles its own React copy. Client modules evaluate
 * before Docusaurus hydrates, so injecting it immediately makes its
 * parse/execute compete with hydration and delays time-to-interactive.
 * Init therefore waits for the window load event plus an idle period.
 */

if (typeof window !== 'undefined') {
  window.DocsBotAI = window.DocsBotAI || {};

  DocsBotAI.init = function(e) {
    return new Promise((t, r) => {
      var n = document.createElement("script");
      n.type = "text/javascript";
      n.async = true;
      n.src = "https://widget.docsbot.ai/chat.js";

      let o = document.getElementsByTagName("script")[0];
      o.parentNode.insertBefore(n, o);

      n.addEventListener("load", () => {
        let waitForElement = function(selector) {
          return new Promise(resolve => {
            if (document.querySelector(selector)) {
              return resolve(document.querySelector(selector));
            }
            let observer = new MutationObserver(() => {
              if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
          });
        };

        Promise.all([
          new Promise((resolve, reject) => {
            window.DocsBotAI.mount(Object.assign({}, e)).then(resolve).catch(reject);
          }),
          waitForElement("#docsbotai-root"),
        ]).then(() => t()).catch(r);
      });

      n.addEventListener("error", e => {
        r(e.message);
      });
    });
  };

  const initDocsBot = () => {
    DocsBotAI.init({
      id: "RSMLmklQeWMQGiTlIFU5/xVUdXNDdPK304IgNgzPT"
    });
  };

  const scheduleWhenIdle = () => {
    // Safari shipped requestIdleCallback late; fall back to a short delay.
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(initDocsBot, { timeout: 4000 });
    } else {
      window.setTimeout(initDocsBot, 1500);
    }
  };

  if (document.readyState === 'complete') {
    scheduleWhenIdle();
  } else {
    window.addEventListener('load', scheduleWhenIdle, { once: true });
  }
}
