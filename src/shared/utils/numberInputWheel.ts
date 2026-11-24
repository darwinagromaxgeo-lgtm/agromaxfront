/** Keep the wheel for scrolling instead of silently stepping a focused amount. */
export function installNumberInputWheelGuard(root: Document = document) {
  const onWheel = (event: WheelEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'number' && root.activeElement === target) {
      target.blur();
    }
  };
  root.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => root.removeEventListener('wheel', onWheel, { capture: true });
}
