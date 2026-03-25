'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useIsMobile, useIsDesktop } from '@/lib/useMediaQuery';
import PanelErrorBoundary from '../panel-error-boundary';
import Sidebar from '../sidebar';
import RightPanel from '../right-panel';

interface ShellLayoutProps {
  focusMode: boolean;
  children: ReactNode;
}

export default function ShellLayout({ focusMode, children }: ShellLayoutProps) {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const rightPanelOpen = useStore((s) => s.rightPanelOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setRightPanelOpen = useStore((s) => s.setRightPanelOpen);

  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

  const sidebarIsOverlay = !isDesktop;
  const rightPanelIsOverlay = !isDesktop;

  // Mutual panel exclusion on mobile: only one panel open at a time
  const prevSidebar = useRef(sidebarOpen);
  const prevRightPanel = useRef(rightPanelOpen);

  useEffect(() => {
    if (!sidebarIsOverlay) return;
    if (sidebarOpen && !prevSidebar.current && rightPanelOpen) {
      setRightPanelOpen(false);
    }
    if (rightPanelOpen && !prevRightPanel.current && sidebarOpen) {
      setSidebarOpen(false);
    }
    prevSidebar.current = sidebarOpen;
    prevRightPanel.current = rightPanelOpen;
  }, [sidebarOpen, rightPanelOpen, sidebarIsOverlay, setSidebarOpen, setRightPanelOpen]);

  return (
    <div className="flex flex-1 min-h-0 relative">
      {/* Sidebar — slides on desktop, overlay on mobile/tablet */}
      {!focusMode && (
        sidebarIsOverlay ? (
          sidebarOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <div className={`fixed left-0 bottom-0 z-40 animate-slide-in-left ${isMobile ? 'top-0' : 'top-12'}`}>
                <PanelErrorBoundary panelName="Sidebar">
                  <Sidebar />
                </PanelErrorBoundary>
              </div>
            </>
          )
        ) : (
          <div
            className="h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
            style={{ width: sidebarOpen ? '272px' : '0px' }}
          >
            <div className="h-full w-[272px]">
              <PanelErrorBoundary panelName="Sidebar">
                <Sidebar />
              </PanelErrorBoundary>
            </div>
          </div>
        )
      )}

      {/* Main chat area */}
      {children}

      {/* Right panel — inline on desktop, overlay on mobile/tablet */}
      {!focusMode && rightPanelOpen && (
        <>
          {rightPanelIsOverlay && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
              onClick={() => setRightPanelOpen(false)}
            />
          )}
          <div className={
            rightPanelIsOverlay
              ? (isMobile
                  ? 'fixed left-0 right-0 bottom-0 top-[30%] z-40 animate-slide-up rounded-t-xl overflow-hidden bg-surface-0 border-t border-border-default'
                  : 'fixed right-0 top-12 bottom-0 z-40 animate-slide-in-right')
              : 'h-full'
          }>
            {/* Drag handle for mobile bottom sheet */}
            {isMobile && rightPanelIsOverlay && (
              <div
                className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing"
                onClick={() => setRightPanelOpen(false)}
              >
                <div className="w-8 h-1 rounded-full bg-text-tertiary/40" />
              </div>
            )}
            <PanelErrorBoundary panelName="Right panel">
              <RightPanel />
            </PanelErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}
