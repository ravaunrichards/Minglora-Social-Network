(() => {
  "use strict";
  const IMAGE_SELECTOR = "img.post-image,img.story-image,img.story-viewer-image,.profile-media-grid img,.profile-reels-grid img,.profile-reel-tile img,.creator-media-grid img";
  const VIDEO_SELECTOR = "video.post-media-video,video.story-image,video.story-viewer-image,.profile-media-tile video,.profile-reel-tile video,.profile-video-row video";
  const MODEL_SELECTOR = "model-viewer.post-media-3d,model-viewer.post-media-viewer-3d";
  const AUDIO_SELECTOR = "audio.post-media-audio";
  let overlay = null;
  let previousFocus = null;

  function mediaUrl(el) {
    return el.currentSrc || el.getAttribute("src") || el.src || "";
  }
  function enhance(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(IMAGE_SELECTOR).forEach(el => {
      if (el.dataset.mmvBound === "true") return;
      el.dataset.mmvBound = "true";
      el.dataset.mmvType = "image";
      el.classList.add("mmv-image-open");
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", "Open image full screen");
      el.title = "Open image full screen";
    });
    root.querySelectorAll(VIDEO_SELECTOR).forEach(el => addExpandButton(el,"video"));
    root.querySelectorAll(MODEL_SELECTOR).forEach(el => addExpandButton(el,"model"));
    root.querySelectorAll(AUDIO_SELECTOR).forEach(el => addExpandButton(el,"audio"));
  }
  function addExpandButton(el,type) {
    if (el.dataset.mmvBound === "true") return;
    el.dataset.mmvBound = "true";
    el.dataset.mmvType = type;
    const frame = document.createElement("div");
    frame.className = "mmv-frame";
    el.parentNode?.insertBefore(frame,el);
    frame.appendChild(el);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mmv-expand";
    button.dataset.mmvOpen = "true";
    button.setAttribute("aria-label",type === "video" ? "Open video full screen" : type === "audio" ? "Open audio player" : "Open 3D media full screen");
    button.textContent = type === "video" ? "⛶ Full screen" : type === "audio" ? "Expand player" : "⛶ Expand";
    frame.appendChild(button);
  }
  function close() {
    if (!overlay) return;
    overlay.querySelectorAll("video,audio").forEach(player => { try { player.pause(); } catch {} });
    overlay.remove();
    overlay = null;
    document.body.classList.remove("mmv-open");
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }
  function open(type,source,caption="",sourceElement=null) {
    if (!source) return;
    close();
    previousFocus = sourceElement || document.activeElement;
    overlay = document.createElement("div");
    overlay.className = "mmv-overlay";
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.setAttribute("aria-label","Full-screen media viewer");
    const shell = document.createElement("div");
    shell.className = "mmv-shell";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "mmv-close";
    closeButton.setAttribute("aria-label","Close full-screen media");
    closeButton.textContent = "×";
    const title = document.createElement("div");
    title.className = "mmv-caption";
    title.textContent = caption || "Minglora media";
    const content = document.createElement("div");
    content.className = "mmv-content";
    if (type === "image") {
      const image = document.createElement("img");
      image.src = source;
      image.alt = caption || "Minglora shared image";
      content.appendChild(image);
    } else if (type === "video" || type === "audio") {
      const player = document.createElement(type);
      player.src = source;
      player.controls = true;
      player.autoplay = type === "video";
      player.preload = "auto";
      if (type === "video") {
        player.playsInline = true;
        const poster = sourceElement?.getAttribute("poster");
        if (poster) player.poster = poster;
      }
      content.appendChild(player);
    } else if (type === "model") {
      const model = document.createElement("model-viewer");
      if (sourceElement) {
        for (const attribute of sourceElement.attributes) {
          if (attribute.name !== "id" && attribute.name !== "class" && attribute.name !== "style") {
            model.setAttribute(attribute.name,attribute.value);
          }
        }
      }
      model.setAttribute("src",source);
      model.setAttribute("camera-controls","");
      model.setAttribute("interaction-prompt","none");
      content.appendChild(model);
    }
    shell.appendChild(title);
    shell.appendChild(closeButton);
    shell.appendChild(content);
    overlay.appendChild(shell);
    overlay.addEventListener("click",event => { if (event.target === overlay) close(); });
    closeButton.addEventListener("click",close);
    document.addEventListener("keydown",onKeyDown);
    document.body.appendChild(overlay);
    document.body.classList.add("mmv-open");
    closeButton.focus({preventScroll:true});
    const player = content.querySelector("video");
    if (player) player.play().catch(() => {});
  }
  function onKeyDown(event) {
    if (event.key === "Escape" && overlay) {
      event.preventDefault();
      document.removeEventListener("keydown",onKeyDown);
      close();
    }
  }
  document.addEventListener("click",event => {
    const trigger = event.target.closest("[data-mmv-open]");
    if (trigger) {
      const frame = trigger.closest(".mmv-frame");
      const media = frame?.querySelector("[data-mmv-bound='true'],[data-mmv-type]");
      if (!media) return;
      event.preventDefault();
      open(media.dataset.mmvType,mediaUrl(media),media.getAttribute("alt") || media.getAttribute("aria-label") || "",media);
      return;
    }
    const image = event.target.closest("img[data-mmv-type='image']");
    if (image) {
      event.preventDefault();
      open("image",mediaUrl(image),image.alt || "Minglora shared image",image);
    }
  });
  document.addEventListener("keydown",event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches?.("img[data-mmv-type='image']")) {
      event.preventDefault();
      const image = event.target;
      open("image",mediaUrl(image),image.alt || "Minglora shared image",image);
    }
  });
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          enhance(node);
          if (node.matches?.(IMAGE_SELECTOR+","+VIDEO_SELECTOR+","+MODEL_SELECTOR+","+AUDIO_SELECTOR)) enhance(node.parentElement || node);
        }
      });
    }
  });
  function start() {
    enhance(document);
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
  window.MingloraMediaViewer = { open, close, enhance };
})();