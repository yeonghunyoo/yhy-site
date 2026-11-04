import { setThemePref, useTheme, type ThemePref } from "../theme/theme";
import { IconButton } from "./ui";

const order: ThemePref[] = ["system", "light", "dark"];
const label: Record<ThemePref, string> = { system: "시스템 테마", light: "밝은 테마", dark: "어두운 테마" };

/** 누를 때마다 시스템 → 밝게 → 어둡게 */
export function ThemeToggle() {
  const { pref } = useTheme();
  const next = order[(order.indexOf(pref) + 1) % order.length]!;
  return (
    <IconButton
      icon={pref === "system" ? "monitor" : pref === "light" ? "sun" : "moon"}
      label={`${label[pref]} (눌러서 ${label[next]})`}
      onClick={() => setThemePref(next)}
    />
  );
}
