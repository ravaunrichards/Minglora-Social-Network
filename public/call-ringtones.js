(() => {
  'use strict';

  // Original short synthesized tones in familiar ringtone styles. No commercial
  // recordings or copyrighted ringtone melodies are bundled with Minglora.
  const catalog = Object.freeze([
    { id: 'classic-phone', name: 'Classic Telephone', description: 'A familiar, clear double-ring pattern', waveform: 'sine', sequence: [
      { frequencies: [880, 660], duration: 0.22, gap: 0.08 },
      { frequencies: [880, 660], duration: 0.22, gap: 0.36 }
    ] },
    { id: 'retro-polyphonic', name: 'Retro Polyphonic', description: 'Bright, nostalgic digital notes', waveform: 'square', sequence: [
      { frequencies: [659], duration: 0.12, gap: 0.03 },
      { frequencies: [784], duration: 0.12, gap: 0.03 },
      { frequencies: [988], duration: 0.18, gap: 0.06 },
      { frequencies: [784], duration: 0.12, gap: 0.03 },
      { frequencies: [880], duration: 0.2, gap: 0.3 }
    ] },
    { id: 'warm-marimba', name: 'Warm Marimba', description: 'Soft wooden tones with a gentle bounce', waveform: 'triangle', sequence: [
      { frequencies: [523], duration: 0.18, gap: 0.05 },
      { frequencies: [659], duration: 0.18, gap: 0.05 },
      { frequencies: [784], duration: 0.26, gap: 0.3 }
    ] },
    { id: 'digital-pulse', name: 'Digital Pulse', description: 'Modern, crisp electronic pulses', waveform: 'square', sequence: [
      { frequencies: [740], duration: 0.1, gap: 0.07 },
      { frequencies: [988], duration: 0.1, gap: 0.07 },
      { frequencies: [740], duration: 0.1, gap: 0.07 },
      { frequencies: [1175], duration: 0.2, gap: 0.3 }
    ] },
    { id: 'soft-piano', name: 'Soft Piano', description: 'A calm, warm ascending phrase', waveform: 'sine', sequence: [
      { frequencies: [392], duration: 0.24, gap: 0.04 },
      { frequencies: [494], duration: 0.24, gap: 0.04 },
      { frequencies: [587], duration: 0.34, gap: 0.34 }
    ] },
    { id: 'double-bell', name: 'Double Bell', description: 'Two bright, traditional bell-like rings', waveform: 'sine', sequence: [
      { frequencies: [1047, 1319], duration: 0.25, gap: 0.13 },
      { frequencies: [1047, 1319], duration: 0.25, gap: 0.38 }
    ] },
    { id: 'glass-chime', name: 'Glass Chime', description: 'A clean, sparkling call alert', waveform: 'sine', sequence: [
      { frequencies: [784, 1175], duration: 0.18, gap: 0.07 },
      { frequencies: [988, 1480], duration: 0.18, gap: 0.07 },
      { frequencies: [1175, 1760], duration: 0.3, gap: 0.32 }
    ] },
    { id: 'radar-ping', name: 'Radar Ping', description: 'A distinctive, minimal digital signal', waveform: 'triangle', sequence: [
      { frequencies: [587], duration: 0.12, gap: 0.08 },
      { frequencies: [880], duration: 0.14, gap: 0.08 },
      { frequencies: [1175], duration: 0.18, gap: 0.38 }
    ] }
  ]);

  const defaults = Object.freeze({ voice: 'classic-phone', video: 'glass-chime' });
  const byId = new Map(catalog.map(item => [item.id, item]));
  let context = null;
  let loopTimer = null;
  let playGeneration = 0;
  let activeNodes = [];

  function stopAll() {
    playGeneration += 1;
    if (loopTimer !== null) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    for (const node of activeNodes) {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    }
    activeNodes = [];
  }

  function play(id, options = {}) {
    const tone = byId.get(String(id || ''));
    if (!tone) return false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    stopAll();
    const generation = playGeneration;
    if (!context) context = new AudioContextClass();
    const shouldLoop = options.loop === true;
    const volume = Math.max(0, Math.min(1, Number(options.volume ?? 0.8)));
    if (volume === 0) return false;

    const schedule = () => {
      if (generation !== playGeneration || !context || context.state !== 'running') return;
      let cursor = context.currentTime + 0.035;
      for (const step of tone.sequence) {
        const duration = Math.max(0.06, Number(step.duration) || 0.15);
        const frequencies = Array.isArray(step.frequencies) ? step.frequencies : [];
        for (const frequency of frequencies) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const peak = Math.max(0.006, Math.min(0.16, 0.13 * volume / Math.sqrt(Math.max(1, frequencies.length))));
          oscillator.type = tone.waveform || 'sine';
          oscillator.frequency.setValueAtTime(frequency, cursor);
          gain.gain.setValueAtTime(0.0001, cursor);
          gain.gain.exponentialRampToValueAtTime(peak, cursor + 0.025);
          gain.gain.setValueAtTime(peak, cursor + Math.max(0.03, duration - 0.045));
          gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(cursor);
          oscillator.stop(cursor + duration + 0.025);
          activeNodes.push(oscillator, gain);
          oscillator.onended = () => {
            try { oscillator.disconnect(); gain.disconnect(); } catch {}
            activeNodes = activeNodes.filter(node => node !== oscillator && node !== gain);
          };
        }
        cursor += duration + Math.max(0, Number(step.gap) || 0);
      }
      if (shouldLoop) {
        const delay = Math.max(400, (cursor - context.currentTime) * 1000 + 180);
        loopTimer = setTimeout(schedule, delay);
      }
    };

    if (context.state === 'suspended') {
      context.resume().then(schedule).catch(() => {});
    } else {
      schedule();
    }
    return true;
  }

  window.MingloraCallRingtones = Object.freeze({
    catalog,
    defaults,
    get: id => byId.get(String(id || '')) || null,
    play,
    stopAll
  });
})();
