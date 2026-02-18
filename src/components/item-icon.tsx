import {
  FileText,
  Database,
  Users,
  FolderKanban,
  CircleDashed,
  Circle,
  CircleDot,
  CircleCheckBig,
  Ban,
  Search,
  type LucideIcon,
} from 'lucide-react';
import type { NotionIcon, FinderItem } from '@/types/finder';

const LUCIDE_MAP: Record<string, LucideIcon> = {
  'file-text': FileText,
  database: Database,
  users: Users,
  'folder-kanban': FolderKanban,
  'circle-dashed': CircleDashed,
  circle: Circle,
  'circle-dot': CircleDot,
  'circle-check-big': CircleCheckBig,
  ban: Ban,
  search: Search,
};

const DEFAULT_ICONS: Record<FinderItem['type'], LucideIcon> = {
  page: FileText,
  database: Database,
};

interface ItemIconProps {
  icon: NotionIcon | null;
  type: FinderItem['type'];
  className?: string;
  size?: number;
}

export function ItemIcon({ icon, type, className = '', size = 15 }: ItemIconProps) {
  if (icon?.type === 'emoji' && icon.emoji) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
        {icon.emoji}
      </span>
    );
  }

  if (icon?.type === 'lucide' && icon.lucide) {
    const Icon = LUCIDE_MAP[icon.lucide.name];
    if (Icon) {
      return (
        <span className={className}>
          <Icon
            size={size}
            color={icon.lucide.color}
            strokeWidth={1.75}
            style={icon.lucide.color ? undefined : { opacity: 0.5 }}
          />
        </span>
      );
    }
  }

  const FallbackIcon = DEFAULT_ICONS[type] ?? FileText;
  return (
    <span className={className} style={{ opacity: 0.5 }}>
      <FallbackIcon size={size} strokeWidth={1.75} />
    </span>
  );
}
