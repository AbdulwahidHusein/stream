"use client";

export function DownloadButton({
  href,
  label = "Download",
}: {
  href: string;
  label?: string;
}) {
  return (
    <a
      href={href}
      download
      className="btn-secondary inline-flex items-center gap-2 !px-3.5 !py-2 text-sm"
    >
      <DownloadIcon className="size-3.5" />
      {label}
    </a>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M12 4v11" />
      <path d="M7.5 11.5 12 16l4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}
