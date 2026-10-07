import { useCallback, useState } from "react";
import { Button } from "@cloudflare/kumo";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const mode = dark ? "light" : "dark";
    setDark(!dark);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works.
    }
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}
