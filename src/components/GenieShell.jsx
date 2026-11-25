import React, { useEffect, useState } from "react";
import genieWordmark from "../assets/genie/genie-wordmark-reversed.png";

/**
 * Genie application shell (Figma: Cell-Grouping-UI · "Genie sidebar · Web" and "Web top bar").
 * Groups follow the value stream; a group header collapses, and the group of the open
 * screen stays expanded. Below the lg breakpoint the sidebar opens as a drawer.
 */

function initialsOf(name) {
  const parts = String(name || "")
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function NavItem({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className="flex min-h-[48px] w-full shrink-0 items-center gap-2 rounded-genie-md bg-genie-primary-pressed pl-6 pr-3 text-left text-sm leading-[1.4] text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-accent"
    >
      <span className={`h-6 w-1 shrink-0 rounded-[2px] bg-genie-accent ${active ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
      <span className={`min-w-0 flex-1 ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
    </button>
  );
}

function NavGroup({ group, expanded, onToggle, currentView, onSelect }) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        aria-expanded={expanded}
        className="flex min-h-[48px] w-full items-center gap-2 px-3 text-left leading-[1.4] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-accent"
      >
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase opacity-80">{group.label}</span>
        <span className="text-xs font-medium opacity-70">{group.items.length}</span>
        <span className="w-3 text-center text-base font-medium opacity-80" aria-hidden="true">
          {expanded ? "⌄" : "›"}
        </span>
      </button>
      {expanded && (
        <div className="flex w-full flex-col gap-1">
          {group.items.map((item) => (
            <NavItem key={item.id} item={item} active={item.id === currentView} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GenieSidebar({ groups, currentView, onSelect, user, onSignOut }) {
  const openGroup = groups.find((g) => g.items.some((i) => i.id === currentView))?.id;
  const [expanded, setExpanded] = useState(() => new Set(openGroup ? [openGroup] : []));

  // The group of the open screen stays expanded.
  useEffect(() => {
    if (openGroup) setExpanded((prev) => (prev.has(openGroup) ? prev : new Set([...prev, openGroup])));
  }, [openGroup]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id) && id !== openGroup) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full w-[240px] flex-col gap-3 bg-genie-brand px-4 pb-4 pt-6">
      <img src={genieWordmark} alt="Genie" width={128} height={35} className="h-[35px] w-[128px] shrink-0 object-contain" />
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-clip pr-1">
        {groups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            expanded={expanded.has(group.id)}
            onToggle={toggle}
            currentView={currentView}
            onSelect={onSelect}
          />
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-genie-accent text-sm font-medium text-genie-brand">
          {initialsOf(user.name)}
        </div>
        <div className="min-w-0 flex-1 leading-[1.4] text-white">
          <p className="truncate text-sm font-medium" title={user.name}>
            {user.roleLabel}
          </p>
          <p className="truncate text-xs" title={user.name}>
            {user.place || user.name}
          </p>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-accent"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GenieTopBar({ breadcrumb, title, onMenu, children }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-genie-border bg-genie-surface px-6">
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-genie-md text-genie-text hover:bg-genie-muted lg:hidden"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            ☰
          </span>
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col leading-[1.4]">
        <p className="truncate text-xs text-genie-text-secondary">{breadcrumb}</p>
        <h1 className="truncate text-[18px] font-semibold tracking-normal text-genie-text">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Sidebar + top bar + scrolling content area. */
export default function GenieShell({ groups, currentView, onSelect, user, onSignOut, topBarRight, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const group = groups.find((g) => g.items.some((i) => i.id === currentView));
  const item = group?.items.find((i) => i.id === currentView);
  const select = (id) => {
    onSelect(id);
    setDrawerOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-genie-app font-body text-genie-text">
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <GenieSidebar groups={groups} currentView={currentView} onSelect={select} user={user} onSignOut={onSignOut} />
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="h-full">
            <GenieSidebar groups={groups} currentView={currentView} onSelect={select} user={user} onSignOut={onSignOut} />
          </div>
          <button type="button" aria-label="Close navigation" className="flex-1 bg-[rgba(0,11,109,0.4)]" onClick={() => setDrawerOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <GenieTopBar breadcrumb={group ? `${group.breadcrumb} / ${item?.label ?? ""}` : ""} title={item?.label ?? ""} onMenu={() => setDrawerOpen(true)}>
          {topBarRight}
        </GenieTopBar>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
