import React, { useEffect, useState, useRef } from "react";

const GLYPHS = "01_/-[]{}*+=:.~<>|#$";

export default function AsciiDecryptedText({
  text = "",
  speed = 28,
  maxIterations = 8,
  className = "",
  triggerOnHover = false,
}) {
  const [displayText, setDisplayText] = useState(text);
  const isScrambling = useRef(false);

  const scramble = () => {
    if (isScrambling.current) return;
    isScrambling.current = true;
    let iteration = 0;
    const target = String(text);

    const interval = setInterval(() => {
      setDisplayText(
        target
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) return target[index];
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join("")
      );

      if (iteration >= target.length) {
        clearInterval(interval);
        setDisplayText(target);
        isScrambling.current = false;
      }
      iteration += target.length / maxIterations;
    }, speed);
  };

  useEffect(() => {
    scramble();
  }, [text]);

  return (
    <span
      onMouseEnter={triggerOnHover ? scramble : undefined}
      className={`font-mono ${className}`}
    >
      {displayText}
    </span>
  );
}