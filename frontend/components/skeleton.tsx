'use client';

export function MessageSkeleton() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto px-4 py-6 animate-fade-in-up" style={{ animationDuration: '0.15s' }}>
      {/* User message skeleton */}
      <div className="flex justify-end">
        <div className="w-[45%] h-10 rounded-xl rounded-br-sm shimmer" />
      </div>
      {/* Assistant message skeleton */}
      <div className="flex justify-start">
        <div className="w-[70%] space-y-2">
          <div className="h-4 w-24 rounded shimmer" />
          <div className="h-4 w-full rounded shimmer" />
          <div className="h-4 w-[85%] rounded shimmer" />
          <div className="h-4 w-[60%] rounded shimmer" />
        </div>
      </div>
      {/* Another user message */}
      <div className="flex justify-end">
        <div className="w-[35%] h-10 rounded-xl rounded-br-sm shimmer" />
      </div>
      {/* Another assistant */}
      <div className="flex justify-start">
        <div className="w-[65%] space-y-2">
          <div className="h-4 w-full rounded shimmer" />
          <div className="h-4 w-[90%] rounded shimmer" />
          <div className="h-4 w-[40%] rounded shimmer" />
        </div>
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="px-1.5 space-y-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2.5 py-2">
          <div className="w-3.5 h-3.5 rounded shimmer shrink-0" />
          <div className="flex-1 h-3.5 rounded shimmer" style={{ width: `${60 + Math.random() * 30}%` }} />
        </div>
      ))}
    </div>
  );
}
