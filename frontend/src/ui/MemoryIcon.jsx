export default function MemoryIcon({ name }) {
  const paths = {
    settings: <><path d="M4 6h7m4 0h5M4 12h2m4 0h10M4 18h10m4 0h2" /><circle cx="13" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></>,
    headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h4v8H6a2 2 0 0 1-2-2zm16 0h-4v8h2a2 2 0 0 0 2-2z" /></>,
    book: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
