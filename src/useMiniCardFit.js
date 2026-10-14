import { useLayoutEffect } from "react";

// Measure the rendered text, including Korean wrapping, instead of estimating
// from character count. A card always keeps its complete source and explanation.
export function useMiniCardFit(areaRef, contentRef, face) {
  useLayoutEffect(() => {
    const area = areaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    let active = true;
    function fit() {
      if (!active || !area.clientWidth || !area.clientHeight) return;
      const max = Math.min(42, Math.max(28, area.clientWidth * 0.105));
      const apply = size => {
        const ratio = size / max;
        area.style.setProperty("--mini-font-size", `${size}px`);
        area.style.setProperty("--mini-leading", String(1.2 + ratio * 0.35));
        area.style.setProperty("--mini-gap", `${size * (0.25 + ratio * 0.4)}px`);
      };
      const fits = () => {
        const bounds = content.getBoundingClientRect();
        const available = area.getBoundingClientRect();
        // DOM clientWidth rounds to integers; mixing it with a fractional rect
        // can incorrectly reject every font size at widths such as 485.2px.
        return bounds.height <= available.height - 2 && bounds.width <= available.width + 0.25
          && content.scrollWidth <= Math.ceil(available.width);
      };
      apply(max);
      if (fits()) return;
      let low = 1, high = max;
      for (let step = 0; step < 12; step++) {
        const size = (low + high) / 2;
        apply(size);
        if (fits()) low = size; else high = size;
      }
      apply(low);
      // Line wrapping can jump at subpixel font boundaries. Keep the final
      // rendered result inside the card too, rather than relying on rounding.
      while (!fits() && low > 1) {
        low = Math.max(1, low - 0.25);
        apply(low);
      }
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    document.fonts?.ready.then(fit);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [areaRef, contentRef, face]);
}
