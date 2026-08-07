import React from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './utils';

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);
const SIDEBAR_STORAGE_KEY = 'pm.kaneo.sidebar-collapsed';

function readDefaultOpen() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function SidebarProvider({
  children,
  defaultOpen = readDefaultOpen(),
  open: openProp,
  onOpenChange,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const [isMobile, setIsMobile] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const open = openProp ?? openState;

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const sync = () => {
      setIsMobile(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const setOpen = React.useCallback((next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!next));
    } catch {
      // The shell remains usable when storage is unavailable.
    }
  }, [onOpenChange, openProp]);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setMobileOpen((value) => !value);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    const handleCustomToggle = () => toggleSidebar();
    window.addEventListener('keydown', handleShortcut);
    window.addEventListener('toggle-sidebar', handleCustomToggle);
    return () => {
      window.removeEventListener('keydown', handleShortcut);
      window.removeEventListener('toggle-sidebar', handleCustomToggle);
    };
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, isMobile, mobileOpen, setMobileOpen, toggleSidebar }}>
      <div className={cn('kaneo-sidebar-provider', className)} data-slot="sidebar-provider" data-state={open ? 'expanded' : 'collapsed'} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error('Sidebar components must be used within <SidebarProvider>');
  return context;
}

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  collapsible?: 'offcanvas' | 'icon' | 'none';
  variant?: 'inset' | 'sidebar';
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, children, collapsible = 'offcanvas', variant = 'inset', ...props }, ref) => {
    const { open, isMobile, mobileOpen, setMobileOpen } = useSidebar();
    const { t } = useTranslation();
    const visible = isMobile ? mobileOpen : true;
    const asideRef = React.useRef<HTMLElement | null>(null);

    React.useEffect(() => {
      if (!isMobile || !mobileOpen) return undefined;

      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const getFocusable = () => Array.from(asideRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      const focusFirst = window.setTimeout(() => getFocusable()[0]?.focus(), 0);
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setMobileOpen(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        window.clearTimeout(focusFirst);
        document.removeEventListener('keydown', handleKeyDown);
        if (previousFocus?.isConnected) previousFocus.focus();
      };
    }, [isMobile, mobileOpen, setMobileOpen]);

    const setAsideRef = (node: HTMLElement | null) => {
      asideRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
    };

    return (
      <>
        <div className="kaneo-sidebar-gap" data-slot="sidebar-gap" aria-hidden="true" />
        {isMobile && mobileOpen ? (
          <button className="kaneo-sidebar-scrim" type="button" aria-label={t('common.closeNav')} onClick={() => setMobileOpen(false)} />
        ) : null}
        <aside
          ref={setAsideRef}
          className={cn('kaneo-sidebar', isMobile && mobileOpen ? 'mobile-open' : '', className)}
          data-slot="sidebar"
          data-state={visible ? 'open' : 'closed'}
          data-collapsible={!isMobile && collapsible === 'icon' && !open ? 'icon' : collapsible}
          data-variant={variant}
          aria-hidden={isMobile && !mobileOpen ? true : undefined}
          {...props}
        >
          <div className="kaneo-sidebar-inner">{children}</div>
        </aside>
      </>
    );
  },
);
Sidebar.displayName = 'Sidebar';

export const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <main ref={ref} className={cn('kaneo-sidebar-inset', className)} data-slot="sidebar-inset" {...props} />,
);
SidebarInset.displayName = 'SidebarInset';

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const { isMobile, mobileOpen, open, toggleSidebar } = useSidebar();
    const { t } = useTranslation();
    const triggerLabel = isMobile
      ? (mobileOpen ? t('common.closeNav') : t('common.openNav'))
      : (open ? t('common.collapseSidebar') : t('common.expandSidebar'));
    return (
      <button ref={ref} type="button" className={cn('kaneo-sidebar-trigger', className)} aria-label={triggerLabel} onClick={toggleSidebar} {...props}>
        {isMobile ? (mobileOpen ? <X size={16} /> : <Menu size={16} />) : (open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />)}
        {children}
      </button>
    );
  },
);
SidebarTrigger.displayName = 'SidebarTrigger';

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-header', className)} data-slot="sidebar-header" {...props} />,
);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-content', className)} data-slot="sidebar-content" {...props} />,
);
SidebarContent.displayName = 'SidebarContent';

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-footer', className)} data-slot="sidebar-footer" {...props} />,
);
SidebarFooter.displayName = 'SidebarFooter';

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <section ref={ref} className={cn('kaneo-sidebar-group', className)} data-slot="sidebar-group" {...props} />,
);
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-group-label', className)} data-slot="sidebar-group-label" {...props} />,
);
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarMenu = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-menu', className)} data-slot="sidebar-menu" {...props} />,
);
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('kaneo-sidebar-menu-item', className)} data-slot="sidebar-menu-item" {...props} />,
);
SidebarMenuItem.displayName = 'SidebarMenuItem';

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }>(
  ({ className, isActive = false, ...props }, ref) => <button ref={ref} type="button" className={cn('kaneo-sidebar-menu-button', className)} data-slot="sidebar-menu-button" data-active={isActive ? 'true' : 'false'} aria-current={isActive ? 'page' : undefined} {...props} />,
);
SidebarMenuButton.displayName = 'SidebarMenuButton';
