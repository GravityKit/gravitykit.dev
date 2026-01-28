/**
 * DocsBot AI Widget initialization
 *
 * This client module initializes the DocsBot AI chat widget
 * after the page loads.
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
            let observer = new MutationObserver(mutations => {
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

  // Initialize DocsBot with your bot ID
  DocsBotAI.init({
    id: "RSMLmklQeWMQGiTlIFU5/xVUdXNDdPK304IgNgzPT"
  });
}
