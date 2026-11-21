/** Grão de café estilizado: mesmo logo do sistema da exportadora. */
export function Logo({ tamanho = 26 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={tamanho} height={tamanho} fill="none" aria-hidden>
      <ellipse cx="16" cy="16" rx="9" ry="12.5" transform="rotate(30 16 16)" fill="var(--menu-ouro)" />
      <path d="M12.2 5.8c4.2 3.6 1.2 7.6 3.6 10.6s0 6.6 4 9.8" stroke="#132a1f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
