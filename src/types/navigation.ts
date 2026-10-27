import { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  name: string;
  href: string;
  iconName: string;
  isImplemented: boolean;
  badge?: string;
  description?: string;
}
