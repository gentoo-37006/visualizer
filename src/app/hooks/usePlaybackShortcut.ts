import { useEffect } from "react";

export function usePlaybackShortcut(onToggle?: () => void) {
  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) onToggle?.();
    };
    window.addEventListener("keydown", handleSpace, true);
    window.addEventListener("keyup", handleSpace, true);
    return () => {
      window.removeEventListener("keydown", handleSpace, true);
      window.removeEventListener("keyup", handleSpace, true);
    };
  }, [onToggle]);
}
