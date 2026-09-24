import { useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import './TargetCursor.css';

const getContainingBlock = (element) => {
  let node = element?.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.willChange.includes('transform') ||
      style.willChange.includes('perspective') ||
      style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

const TargetCursor = ({
  targetSelector = '.cursor-target',
  hoverDuration = 0.18,
  parallaxOn = true,
  cursorColor = '#10b981',
  cursorColorOnTarget = '#34d399'
}) => {
  const cursorRef = useRef(null);
  const cornersRef = useRef(null);
  const dotRef = useRef(null);
  const containingBlockRef = useRef(null);
  const targetCornerPositionsRef = useRef(null);
  const activeStrengthRef = useRef(0);
  const currentPosRef = useRef([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 }
  ]);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 768;
  }, []);

  const moveCursor = useCallback((clientX, clientY) => {
    if (!cursorRef.current) return;
    cursorRef.current.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
  }, []);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return;
    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll('.target-cursor-corner');
    containingBlockRef.current = getContainingBlock(cursor);

    gsap.set(cursor, { autoAlpha: 0 });

    let activeTarget = null;

    const forceLeave = () => {
      gsap.ticker.remove(tickerFn);
      activeStrengthRef.current = 0;
      targetCornerPositionsRef.current = null;
      if (activeTarget) {
        activeTarget.removeEventListener('mouseleave', forceLeave);
        activeTarget = null;
      }
      if (cursorRef.current) {
        gsap.to(cursorRef.current, { autoAlpha: 0, duration: 0.12, ease: 'power2.out' });
      }
    };

    const tickerFn = () => {
      // 1. Detect if target was unmounted (e.g. dropdown closed, modal dismissed)
      if (!activeTarget || !activeTarget.isConnected || !document.body.contains(activeTarget)) {
        forceLeave();
        return;
      }

      const rect = activeTarget.getBoundingClientRect();
      // 2. Detect if target collapsed or hidden
      if (rect.width === 0 && rect.height === 0) {
        forceLeave();
        return;
      }

      const borderWidth = 2;
      const cornerSize = 10;
      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.bottom + borderWidth - cornerSize },
        { x: rect.left - borderWidth, y: rect.bottom + borderWidth - cornerSize }
      ];

      const strength = activeStrengthRef.current;
      if (strength <= 0 || !cornersRef.current) return;

      const cursorRect = cursor.getBoundingClientRect();
      const cursorX = cursorRect.left;
      const cursorY = cursorRect.top;
      const corners = cornersRef.current;

      for (let i = 0; i < 4; i++) {
        const target = targetCornerPositionsRef.current[i];
        const targetRelX = target.x - cursorX;
        const targetRelY = target.y - cursorY;

        currentPosRef.current[i].x += (targetRelX - currentPosRef.current[i].x) * (parallaxOn ? 0.32 : 0.48);
        currentPosRef.current[i].y += (targetRelY - currentPosRef.current[i].y) * (parallaxOn ? 0.32 : 0.48);

        corners[i].style.transform = `translate3d(${currentPosRef.current[i].x}px, ${currentPosRef.current[i].y}px, 0)`;
      }
    };

    const moveHandler = (e) => moveCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', moveHandler, { passive: true });

    const enterHandler = (e) => {
      let current = e.target;
      let target = null;
      while (current && current !== document.body) {
        if (current.matches && current.matches(targetSelector)) {
          target = current;
          break;
        }
        current = current.parentElement;
      }

      if (!target) return;
      if (activeTarget === target) return;

      if (activeTarget) {
        activeTarget.removeEventListener('mouseleave', forceLeave);
      }

      activeTarget = target;

      gsap.to(cursorRef.current, { autoAlpha: 1, duration: 0.12, ease: 'power2.out' });
      if (cursorColorOnTarget) {
        cornersRef.current?.forEach((c) => (c.style.borderColor = cursorColorOnTarget));
        if (dotRef.current) dotRef.current.style.backgroundColor = cursorColorOnTarget;
      }

      activeTarget.addEventListener('mouseleave', forceLeave, { once: true });

      gsap.ticker.add(tickerFn);
      gsap.to(activeStrengthRef, { current: 1, duration: hoverDuration, ease: 'power2.out' });
    };

    window.addEventListener('mouseover', enterHandler, { passive: true });

    // Hide reticle if user clicks into the iframe or leaves the window
    const windowBlurHandler = () => forceLeave();
    window.addEventListener('blur', windowBlurHandler);
    document.addEventListener('mouseleave', windowBlurHandler);

    return () => {
      gsap.ticker.remove(tickerFn);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', enterHandler);
      window.removeEventListener('blur', windowBlurHandler);
      document.removeEventListener('mouseleave', windowBlurHandler);
      if (activeTarget) {
        activeTarget.removeEventListener('mouseleave', forceLeave);
      }
    };
  }, [targetSelector, moveCursor, isMobile, hoverDuration, parallaxOn, cursorColorOnTarget]);

  if (isMobile || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={cursorRef} className="target-cursor-wrapper" style={{ willChange: 'transform' }}>
      <div ref={dotRef} className="target-cursor-dot" style={{ backgroundColor: cursorColor }} />
      <div className="target-cursor-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="target-cursor-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>,
    document.body
  );
};

export default TargetCursor;