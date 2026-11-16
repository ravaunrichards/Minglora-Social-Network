(() => {
  "use strict";
  const decorate = (root = document) => {
    root.querySelectorAll?.(".story-card .story-avatar").forEach(image => {
      image.classList.add("ml-creator-ring", "ml-creator-ring--story");
    });
    root.querySelectorAll?.(".live-ranking-row").forEach(row => {
      if (row.querySelector("[data-live-ranking-watch]")) {
        row.querySelector("img")?.classList.add("ml-creator-ring", "ml-creator-ring--live");
      }
    });
    root.querySelectorAll?.(".person-avatar-wrap.has-story img.avatar").forEach(image => {
      image.classList.add("ml-creator-ring", "ml-creator-ring--story");
    });
    root.querySelectorAll?.(".person-avatar-wrap").forEach(wrap => {
      if (wrap.parentElement?.querySelector(".person-live-mini")) {
        const image = wrap.querySelector("img.avatar");
        image?.classList.remove("ml-creator-ring--story");
        image?.classList.add("ml-creator-ring", "ml-creator-ring--live");
      }
    });
  };
  if (!document.documentElement.dataset.mingloraCreatorRings) {
    document.documentElement.dataset.mingloraCreatorRings = "true";
    decorate();
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) decorate(node);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
