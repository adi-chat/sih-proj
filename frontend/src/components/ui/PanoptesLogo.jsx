// src/components/ui/PanoptesLogo.jsx
import React from 'react';

export default function PanoptesLogo({ className = "w-6 h-6 text-emerald-500", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Tactical Optical HUD Framing */}
      <path d="M3 7V3.5H6.5" stroke="currentColor" strokeOpacity="0.4" />
      <path d="M17.5 3.5H21V7" stroke="currentColor" strokeOpacity="0.4" />
      <path d="M21 17V20.5H17.5" stroke="currentColor" strokeOpacity="0.4" />
      <path d="M6.5 20.5H3V17" stroke="currentColor" strokeOpacity="0.4" />

      {/* Panoptes Surveillance Lens */}
      <path
        d="M2.5 12C5 7.2 8.2 5.2 12 5.2C15.8 5.2 19 7.2 21.5 12C19 16.8 15.8 18.8 12 18.8C8.2 18.8 5 16.8 2.5 12Z"
        stroke="currentColor"
      />

      {/* Forensic Mesh Core & Targeting Reticle */}
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />

      {/* Network Edge Connectors / Axes */}
      <path d="M12 2.5V4.2" stroke="currentColor" />
      <path d="M12 19.8V21.5" stroke="currentColor" />
      <path d="M7.2 12H8.6" stroke="currentColor" />
      <path d="M15.4 12H16.8" stroke="currentColor" />
    </svg>
  );
}