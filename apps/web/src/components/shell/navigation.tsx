import type { ComponentProps } from "react";
import { Permission } from "@/lib/auth/permissions";

export type NavigationIcon =
  | "overview"
  | "traceability"
  | "production"
  | "inspections"
  | "nonconformance"
  | "actions"
  | "users";

export type NavigationItem = {
  key: NavigationIcon;
  href: string;
  permissions: readonly Permission[];
};

export const navigationSections = [
  {
    key: "overview",
    items: [
      { key: "overview", href: "/", permissions: [Permission.DashboardView] },
    ],
  },
  {
    key: "operations",
    items: [
      {
        key: "traceability",
        href: "/traceability",
        permissions: [Permission.TraceabilityView],
      },
      {
        key: "production",
        href: "/production",
        permissions: [Permission.ManufacturingRecord],
      },
    ],
  },
  {
    key: "quality",
    items: [
      {
        key: "inspections",
        href: "/inspections",
        permissions: [Permission.InspectionWrite],
      },
      {
        key: "nonconformance",
        href: "/nonconformance",
        permissions: [
          Permission.NonconformanceCreate,
          Permission.NonconformanceUpdate,
        ],
      },
    ],
  },
  {
    key: "engineering",
    items: [
      {
        key: "actions",
        href: "/actions",
        permissions: [Permission.EngineeringActionPerform],
      },
    ],
  },
  {
    key: "administration",
    items: [
      { key: "users", href: "/users", permissions: [Permission.UsersManage] },
    ],
  },
] as const;

export const navigationItems: readonly NavigationItem[] =
  navigationSections.reduce<NavigationItem[]>(
    (items, section) => [...items, ...section.items],
    [],
  );

export function NavigationGlyph({
  name,
  ...props
}: { name: NavigationIcon } & ComponentProps<"svg">) {
  const paths: Record<NavigationIcon, React.ReactNode> = {
    overview: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
    traceability: <><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" /></>,
    production: <><path d="M4 21V10l5 3V9l5 3V5h6v16H4Z" /><path d="M8 17h2m4 0h2" /></>,
    inspections: <><path d="M12 3 5 6v5c0 4.7 2.8 8.3 7 10 4.2-1.7 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    nonconformance: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
    actions: <><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m4.9 4.9 2 2m10.2-2-2 2M2 12h3m14 0h3M4.9 19.1l2-2m10.2 2-2-2M12 2v3m0 14v3" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6m3-3h-6" /></>,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
