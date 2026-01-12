import { useEffect, useState } from "react"

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("theme") === "light" ? "light" : "dark")
  )

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("theme", theme)
  }, [theme])

  return { theme, setTheme }
}
