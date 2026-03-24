'use client';

import { type ReactNode } from 'react';
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
              <div className="fixed left-0 top-12 bottom-0 z-40 animate-slide-in-left">
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
                  ? 'fixed left-0 right-0 bottom-0 top-[35%] z-40 animate-slide-up rounded-t-lg overflow-hidden'
                  : 'fixed right-0 top-12 bottom-0 z-40 animate-slide-in-right')
              : 'h-full'
          }>
            <PanelErrorBoundary panelName="Right panel">
              <RightPanel />
            </PanelErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}
