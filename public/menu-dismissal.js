/* Shared outside-dismissal behavior for Minglora menus and dropdown panels. */
(() => {
  'use strict';

  const TAP_MOVEMENT_THRESHOLD = 10;

  function bindOutsideDismissal(options = {}) {
    const { roots, isOpen, onDismiss } = options;
    if (typeof isOpen !== 'function' || typeof onDismiss !== 'function') {
      throw new TypeError('Minglora outside dismissal requires isOpen and onDismiss callbacks.');
    }

    const resolveRoots = () => {
      const value = typeof roots === 'function' ? roots() : roots;
      return (Array.isArray(value) ? value : [value]).filter(Boolean);
    };

    const isInside = target => resolveRoots().some(root => {
      if (root === target) return true;
      return typeof root.contains === 'function' && root.contains(target);
    });

    let pointerStart = null;

    const onPointerDown = event => {
      pointerStart = null;
      if (!isOpen() || isInside(event.target)) return;
      pointerStart = {
        pointerId: event.pointerId,
        x: Number(event.clientX) || 0,
        y: Number(event.clientY) || 0
      };
    };

    const onPointerUp = event => {
      const start = pointerStart;
      pointerStart = null;
      if (!start || start.pointerId !== event.pointerId || !isOpen()) return;

      const movedX = Math.abs((Number(event.clientX) || 0) - start.x);
      const movedY = Math.abs((Number(event.clientY) || 0) - start.y);
      const isTap = movedX < TAP_MOVEMENT_THRESHOLD && movedY < TAP_MOVEMENT_THRESHOLD;
      if (isTap && !isInside(event.target)) onDismiss('outside-pointer');
    };

    const onPointerCancel = () => {
      pointerStart = null;
    };

    const onKeyboardClick = event => {
      if (event.detail === 0 && isOpen() && !isInside(event.target)) {
        onDismiss('outside-keyboard');
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('click', onKeyboardClick, true);

    return () => {
      pointerStart = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('click', onKeyboardClick, true);
    };
  }

  window.MingloraMenuDismissal = Object.freeze({ bindOutsideDismissal });
})();
