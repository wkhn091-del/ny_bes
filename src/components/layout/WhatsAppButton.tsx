export function WhatsAppButton({ number, message }: { number: string; message: string }) {
  const href = `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="שיחה איתנו בוואטסאפ"
      className="fixed bottom-4 left-4 z-40 [html[data-bookbar]_&]:bottom-24 sm:bottom-5 sm:left-5 lg:[html[data-bookbar]_&]:bottom-5 [html[data-walk3d]_&]:hidden inline-flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:scale-105"
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" aria-hidden="true">
        <path d="M19.11 17.27c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.14-.42-2.17-1.34-.8-.71-1.34-1.6-1.5-1.87-.16-.27-.02-.41.12-.55.12-.12.27-.32.41-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27 0 1.34.98 2.63 1.11 2.81.14.18 1.92 2.93 4.65 4.11.65.28 1.16.45 1.55.58.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.31zM16.04 26.67h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.07-3.92-.25-.4a10.58 10.58 0 0 1-1.62-5.65c0-5.86 4.77-10.63 10.64-10.63 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.52c0 5.86-4.77 10.62-10.65 10.62zm9.05-19.67A12.72 12.72 0 0 0 16.04 3.3C9 3.3 3.27 9.02 3.27 16.06c0 2.25.59 4.45 1.71 6.39L3.17 29l6.71-1.76a12.74 12.74 0 0 0 6.15 1.57h.01c7.03 0 12.76-5.73 12.76-12.76 0-3.41-1.33-6.61-3.71-9.05z" />
      </svg>
    </a>
  );
}
