import {
  Building2,
  ChartColumn,
  Download,
  Keyboard,
  ListPlus,
  MessageSquare,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Table2,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Resolves the icon names held in `src/lib/features.ts` to components.
 *
 * The registry stores names rather than components so it stays free of any
 * React or `lucide-react` import — `src/app/sitemap.ts` reads it inside a
 * Worker route and only needs the slugs. This map is the one place that pays
 * for the icons, and it's only ever imported by rendering code.
 */
const ICONS: Record<string, LucideIcon> = {
  Building2,
  ChartColumn,
  Download,
  Keyboard,
  ListPlus,
  MessageSquare,
  Mic,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Table2,
  Tags,
  Users,
};

export function FeatureIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  // An unknown name means the registry and this map drifted. Fall back rather
  // than crash a marketing page over an icon.
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
