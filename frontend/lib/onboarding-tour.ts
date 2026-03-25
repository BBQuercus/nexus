import { useStore } from '@/lib/store';

type DriveStep = import('driver.js').DriveStep;

const STORAGE_KEY = 'nexus-tour-completed';

export function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function resetTour(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {}
}

const allSteps: DriveStep[] = [
  {
    element: '[data-tour="chat-input"]',
    popover: {
      title: 'Chat with Nexus',
      description: 'Type a message, attach files, or use / commands to interact with AI models.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: 'Conversations',
      description: 'Your conversations live here. Search, pin, and organize them by project.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="project-switcher"]',
    popover: {
      title: 'Projects',
      description: 'Switch between projects to keep your conversations organized.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="new-chat"]',
    popover: {
      title: 'New conversation',
      description: 'Start a fresh conversation anytime with ⌘N.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="right-panel-toggle"]',
    popover: {
      title: 'Side panel',
      description: 'Open the panel for terminal, file browser, artifacts, and AI memory.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="user-dropdown"]',
    popover: {
      title: 'Your menu',
      description: 'Access agents, knowledge bases, keyboard shortcuts, and settings from here.',
      side: 'bottom',
      align: 'end',
    },
  },
];

function getVisibleSteps(): DriveStep[] {
  return allSteps.filter((step) => {
    if (!step.element) return true;
    const selector = typeof step.element === 'string' ? step.element : null;
    if (!selector) return true;
    return document.querySelector(selector) !== null;
  });
}

export function startTour(): void {
  // Ensure sidebar is open so sidebar-related steps are visible
  const store = useStore.getState();
  if (!store.sidebarOpen) {
    store.setSidebarOpen(true);
  }

  // Small delay to let sidebar animation finish and DOM update
  setTimeout(async () => {
    const steps = getVisibleSteps();
    if (steps.length === 0) return;

    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);

    const tourDriver = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: 'rgb(0 0 0 / 0.7)',
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'nexus-tour-popover',
      steps,
      onDestroyed: () => {
        markCompleted();
      },
    });

    tourDriver.drive();
  }, 300);
}
