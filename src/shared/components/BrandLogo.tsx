type BrandVariant = 'horizontal' | 'compact' | 'icon';

const variants = {
  horizontal: { src: '/brand/agromax-horizontal.png', width: 1640, height: 430, alt: 'Agromax Geo S.A.C. — Innovando la agricultura' },
  compact: { src: '/brand/agromax-compacto.png', width: 1040, height: 271, alt: 'Agromax' },
  icon: { src: '/brand/agromax-icon-192.png', width: 192, height: 192, alt: 'Agromax' },
} satisfies Record<BrandVariant, { src: string; width: number; height: number; alt: string }>;

export function BrandLogo({ variant = 'compact', className = '', decorative = false }: {
  variant?: BrandVariant;
  className?: string;
  decorative?: boolean;
}) {
  const logo = variants[variant];
  return <img src={logo.src} width={logo.width} height={logo.height} alt={decorative ? '' : logo.alt}
    decoding="async" draggable={false} className={`block shrink-0 object-contain ${className}`} />;
}
