'use client';

import React from 'react';

interface IconProps {
  className?: string;
}

export function LuminLogoMark({ className = 'w-8 h-8' }: IconProps) {
  return (
    <div
      className={`${className} rounded-full bg-[#111214] flex items-center justify-center shrink-0`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="5.4" r="3.3" fill="#FFFFFF" />
        <circle cx="12" cy="18.6" r="3.3" fill="#FFFFFF" />
        <circle cx="5.4" cy="12" r="3.3" fill="#FFFFFF" />
        <circle cx="18.6" cy="12" r="3.3" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

export function LuminCardMiniMark() {
  return (
    <span className="w-[15px] h-[15px] rounded-full bg-[#CBFB00] flex items-center justify-center shrink-0">
      <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="3.5" r="2" fill="#0B0C0E" />
        <circle cx="8" cy="12.5" r="2" fill="#0B0C0E" />
        <circle cx="3.5" cy="8" r="2" fill="#0B0C0E" />
        <circle cx="12.5" cy="8" r="2" fill="#0B0C0E" />
      </svg>
    </span>
  );
}

export function SFBell({ className = 'w-[17px] h-[17px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.6 8-2.6 8h17.2s-2.6-1.5-2.6-8" />
      <path d="M13.73 20a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function SFGear({ className = 'w-[17px] h-[17px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function SFArrowLeft({ className = 'w-[16px] h-[16px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function SFMagnifier({ className = 'w-[16px] h-[16px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export function SFSlidersV({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4v10" />
      <path d="M8 18v2" />
      <circle cx="8" cy="16" r="2" />
      <path d="M16 4v2" />
      <path d="M16 10v10" />
      <circle cx="16" cy="8" r="2" />
    </svg>
  );
}

export function SFCalendar({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M8 2.8v3.4" />
      <path d="M16 2.8v3.4" />
      <path d="M3.5 9.5h17" />
    </svg>
  );
}

export function SFChevronDown({ className = 'w-[14px] h-[14px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SFArrowUpRight({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function SFPlus({ className = 'w-[18px] h-[18px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SFCrown({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 18.5h15a.75.75 0 0 0 .74-.87l-1.4-9.1a.75.75 0 0 0-1.26-.42L14.2 11.4l-1.6-4.95a.75.75 0 0 0-1.42 0L9.6 11.4 6.22 8.1a.75.75 0 0 0-1.26.42l-1.4 9.1a.75.75 0 0 0 .74.87z" />
    </svg>
  );
}

export function SFCheckCircle({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.3 2.3 4.8-4.8" />
    </svg>
  );
}

export function SFXCircle({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

export function SFClose({ className = 'w-[16px] h-[16px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function SFRefresh({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </svg>
  );
}

export function SFDownload({ className = 'w-[15px] h-[15px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 19h16" />
    </svg>
  );
}

export function SFShield({ className = 'w-[16px] h-[16px]' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6.2v5.4c0 5 3.2 8.7 7.5 10.4 4.3-1.7 7.5-5.4 7.5-10.4V6.2L12 3z" />
      <path d="m9 12.2 2 2 4.2-4.2" />
    </svg>
  );
}

export function SFChip() {
  return (
    <svg width="26" height="32" viewBox="0 0 26 32" fill="none">
      <rect
        x="1"
        y="1"
        width="24"
        height="30"
        rx="4.5"
        fill="#A6ABA4"
        fillOpacity="0.48"
        stroke="#D4D8D2"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <path
        d="M9 1v30M17 1v30M1 11h8M17 11h8M1 21h8M17 21h8"
        stroke="#2B2E29"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
    </svg>
  );
}
