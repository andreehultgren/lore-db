import React from "react";

interface ThemeToggleProps {
  // Optional: You can pass in a callback to notify parent components of theme changes
  onToggle?: (mode: "light" | "dark") => void;
  value?: "light" | "dark"; // Optional controlled mode
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ onToggle, value }) => {
  const isDark = value === "dark";
  return (
    <button
      type="button"
      onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        event.preventDefault();
        const newMode = value === "light" ? "dark" : "light";
        onToggle?.(newMode);
      }}
      className={`
        relative flex items-center justify-center
        h-10 w-10 shrink-0 rounded-full
        border border-slate-700 bg-slate-900
        transition-all duration-300 ease-in-out
        hover:border-slate-600
        ${isDark ? "text-yellow-300" : "text-orange-400"}
      `}
      aria-label="Toggle Dark Mode"
    >
      {/* Sun Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute w-5 h-5 transition-all duration-300 ${
          isDark
            ? "scale-0 rotate-90 opacity-0"
            : "scale-100 rotate-0 opacity-100"
        }`}
      >
        <title>Sun Icon</title>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>

      {/* Moon Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute w-5 h-5 transition-all duration-300 ${
          isDark
            ? "scale-100 rotate-0 opacity-100"
            : "scale-0 -rotate-90 opacity-0"
        }`}
      >
        <title>Moon Icon</title>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </button>
  );
};

export default ThemeToggle;
