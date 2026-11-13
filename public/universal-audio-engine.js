(() => {
  'use strict';

  const EVENT_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
  const resolved = new Map();
  const active = new Map();
  let preferences = {
    muted:false,
    masterVolume:1,
    categoryVolumes:{},
    categoryMuted:{},
    eventMuted:{}
  };
  let activePriority = -1;
  let activeEvent = '';

  const clamp = (value,min=0,max=1) => Math.max(min,Math.min(max,Number(value)));
  const categoryFor = eventKey => String(eventKey || '').startsWith('call.') ? 'ringtone' : 'notification';
  const isMuted = value => value === true || value === 'true';

  function stopEvent(eventKey) {
    const entry = active.get(eventKey);
    if (!entry) return false;
    active.delete(eventKey);
    try { entry.audio.pause(); entry.audio.currentTime = 0; entry.audio.removeAttribute('src'); entry.audio.load(); } catch {}
    if (activeEvent === eventKey) {
      activeEvent = '';
      activePriority = -1;
    }
    return true;
  }

  function stopAll() {
    for (const key of [...active.keys()]) stopEvent(key);
    active.clear();
    activeEvent = '';
    activePriority = -1;
  }

  function setPreferences(patch={}) {
    preferences = {
      ...preferences,
      ...patch,
      categoryVolumes:{...preferences.categoryVolumes,...(patch.categoryVolumes || {})},
      categoryMuted:{...preferences.categoryMuted,...(patch.categoryMuted || {})},
      eventMuted:{...preferences.eventMuted,...(patch.eventMuted || {})}
    };
    preferences.masterVolume = clamp(preferences.masterVolume);
    return {...preferences};
  }

  async function resolveEvent(eventKey, options={}) {
    const key = String(eventKey || '').trim();
    if (!EVENT_PATTERN.test(key)) throw new Error('Invalid Minglora audio event key.');
    const now = Date.now();
    const cached = resolved.get(key);
    if (!options.refresh && cached && cached.expiresAt > now + 10000) return cached.sound;
    const response = await fetch('/api/audio/events/' + encodeURIComponent(key), {
      method:'GET',
      credentials:'same-origin',
      headers:{Accept:'application/json'}
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The assigned Minglora sound is unavailable.');
    const sound = payload.sound && typeof payload.sound === 'object' ? payload.sound : null;
    if (!sound || !/^https:\/\//i.test(String(sound.url || ''))) {
      resolved.delete(key);
      return null;
    }
    const expiresIn = Math.max(30,Math.min(300,Number(sound.expiresIn || 300)));
    resolved.set(key,{sound,expiresAt:now + Math.max(15,expiresIn-15)*1000});
    if (resolved.size > 100) {
      const oldest = resolved.keys().next().value;
      if (oldest) resolved.delete(oldest);
    }
    return sound;
  }

  async function playEvent(eventKey, options={}) {
    const key = String(eventKey || '').trim();
    if (!EVENT_PATTERN.test(key)) return false;
    if (preferences.muted || isMuted(preferences.eventMuted[key])) return false;
    const category = categoryFor(key);
    if (isMuted(preferences.categoryMuted[category])) return false;
    if (document.visibilityState === 'hidden' && options.allowBackground !== true) return false;
    if (active.has(key)) return false;

    let sound;
    try { sound = await resolveEvent(key); }
    catch { return false; }
    if (!sound) return false;

    const volume = clamp(sound.volume ?? 1) *
      clamp(preferences.masterVolume ?? 1) *
      clamp(preferences.categoryVolumes[category] ?? 1) *
      clamp(options.volume ?? 1);
    if (volume <= 0) return false;

    const priority = Number.isFinite(Number(options.priority))
      ? Number(options.priority)
      : key.startsWith('call.') ? 100 : key.startsWith('message.') ? 50 : 25;
    if (activeEvent && activePriority > priority) return false;
    stopAll();

    const audio = new Audio(sound.url);
    audio.preload = 'none';
    audio.volume = volume;
    audio.loop = options.loop === true || sound.loop === true;
    audio.playbackRate = clamp(sound.playbackSpeed ?? 1,0.5,2);
    active.set(key,{audio,priority});
    activeEvent = key;
    activePriority = priority;
    const clear = () => {
      const entry = active.get(key);
      if (entry?.audio === audio) {
        active.delete(key);
        if (activeEvent === key) {
          activeEvent = '';
          activePriority = -1;
        }
      }
      try { audio.removeAttribute('src'); audio.load(); } catch {}
    };
    audio.addEventListener('ended',clear,{once:true});
    audio.addEventListener('error',clear,{once:true});
    try {
      await audio.play();
      return true;
    } catch {
      clear();
      return false;
    }
  }

  function clearResolved() {
    resolved.clear();
  }

  window.addEventListener('minglora:session-ended',() => {
    stopAll();
    clearResolved();
    preferences = {muted:false,masterVolume:1,categoryVolumes:{},categoryMuted:{},eventMuted:{}};
  });
  window.addEventListener('pagehide',stopAll);
  window.MingloraAudioEngine = Object.freeze({
    setPreferences,
    resolveEvent,
    playEvent,
    stopEvent,
    stopAll,
    clearResolved,
    getState:() => ({resolvedEvents:resolved.size,activeEvents:[...active.keys()],preferences:{...preferences}})
  });
})();