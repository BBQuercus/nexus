import type { ModelProvider } from '@/lib/types';

function AnthropicLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm1.21 5.36-2.48 6.386h4.96L7.78 8.881z" />
    </svg>
  );
}

function OpenAILogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function MetaLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6.915 4.03c-1.968 0-3.49 1.228-4.662 3.013C1.05 8.96.366 11.432.366 13.795c0 1.718.46 3.13 1.28 4.065.82.935 1.945 1.405 3.12 1.405 1.667 0 2.97-.907 4.258-2.46.555-.67 1.097-1.467 1.62-2.363l.48-.82.48.82c.524.896 1.066 1.693 1.621 2.363 1.288 1.553 2.591 2.46 4.258 2.46 1.175 0 2.3-.47 3.12-1.405.82-.935 1.28-2.347 1.28-4.065 0-2.363-.684-4.835-1.887-6.747C18.575 5.258 17.053 4.03 15.085 4.03c-1.67 0-2.975.912-4.267 2.472a15.674 15.674 0 0 0-.818 1.1 15.674 15.674 0 0 0-.818-1.1C7.89 4.942 6.585 4.03 6.915 4.03zm0 1.56c1.157 0 2.162.68 3.258 2.044.476.593.96 1.312 1.452 2.14l.245.42-.907 1.556c-.84 1.44-1.548 2.378-2.3 3.286-.958 1.156-1.908 1.839-2.893 1.839-.775 0-1.505-.32-2.058-.95-.553-.63-.88-1.555-.88-2.73 0-2.09.6-4.293 1.64-5.985.52-.847 1.12-1.519 1.78-1.96a3.16 3.16 0 0 1 1.663-.66zm8.17 0c.585.043 1.138.267 1.664.66.658.441 1.259 1.113 1.779 1.96 1.04 1.692 1.64 3.895 1.64 5.985 0 1.175-.327 2.1-.88 2.73-.553.63-1.283.95-2.058.95-.985 0-1.935-.683-2.893-1.839-.752-.908-1.46-1.846-2.3-3.286l-.907-1.556.245-.42c.492-.828.976-1.547 1.452-2.14 1.096-1.364 2.1-2.044 3.258-2.044z" />
    </svg>
  );
}

function MicrosoftLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" />
    </svg>
  );
}

function XAILogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 5h3.4l4.7 6.13L16.6 5H20l-6.15 8L20.2 19H16.8l-4.98-6.47L6.97 19H3.6l6.4-6.88z" />
    </svg>
  );
}

function MoonshotLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M14.6 2.5a8.9 8.9 0 1 0 6.9 14.5A9.8 9.8 0 1 1 14.6 2.5z" />
    </svg>
  );
}

function DeepSeekLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 6.5C4 4.57 5.57 3 7.5 3h3.75a6.75 6.75 0 1 1 0 13.5H8.5V21H4zm4.5 5.5h2.75a2.75 2.75 0 1 0 0-5.5H8.5z" />
    </svg>
  );
}

export function ProviderLogo({ provider, size = 16, className = '' }: { provider: ModelProvider; size?: number; className?: string }) {
  switch (provider) {
    case 'anthropic':
      return <AnthropicLogo size={size} className={className} />;
    case 'openai':
      return <OpenAILogo size={size} className={className} />;
    case 'meta':
      return <MetaLogo size={size} className={className} />;
    case 'microsoft':
      return <MicrosoftLogo size={size} className={className} />;
    case 'xai':
      return <XAILogo size={size} className={className} />;
    case 'moonshot':
      return <MoonshotLogo size={size} className={className} />;
    case 'deepseek':
      return <DeepSeekLogo size={size} className={className} />;
  }
}
