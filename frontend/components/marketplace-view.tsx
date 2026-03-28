'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search, Star, Download, ChevronLeft, ChevronRight, SlidersHorizontal,
  Bot, Code, FileText, Palette, MessageSquare, Shield, Zap, Globe,
  Loader2, Send, BookOpen, Lock, Unlock,
} from 'lucide-react';
import PageShell from './page-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from './ui/dialog';
import type { MarketplaceListing, AgentRatingRecord } from '@/lib/types';
import {
  browseMarketplace,
  getFeaturedListings,
  installFromMarketplace,
  rateMarketplaceListing,
  getListingRatings,
} from '@/lib/api';
import { useStore } from '@/lib/store';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type ListingTypeFilter = 'all' | 'agent' | 'knowledge_base';
type Category = 'all' | 'coding' | 'writing' | 'design' | 'research' | 'productivity' | 'security' | 'data';
type SortOption = 'popular' | 'recent' | 'highest_rated';

const SORT_MAP: Record<SortOption, string> = {
  popular: 'popular',
  recent: 'recent',
  highest_rated: 'rating',
};

const CATEGORIES: { value: Category; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Globe size={12} /> },
  { value: 'coding', label: 'Coding', icon: <Code size={12} /> },
  { value: 'writing', label: 'Writing', icon: <FileText size={12} /> },
  { value: 'design', label: 'Design', icon: <Palette size={12} /> },
  { value: 'research', label: 'Research', icon: <Search size={12} /> },
  { value: 'productivity', label: 'Productivity', icon: <Zap size={12} /> },
  { value: 'security', label: 'Security', icon: <Shield size={12} /> },
  { value: 'data', label: 'Data', icon: <MessageSquare size={12} /> },
];

const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  coding: <Code size={18} />,
  writing: <FileText size={18} />,
  design: <Palette size={18} />,
  research: <Search size={18} />,
  productivity: <Zap size={18} />,
  security: <Shield size={18} />,
  data: <MessageSquare size={18} />,
};

const CATEGORY_COLOR_MAP: Record<string, string> = {
  coding: 'bg-blue-500/15 text-blue-400',
  writing: 'bg-emerald-500/15 text-emerald-400',
  design: 'bg-violet-500/15 text-violet-400',
  research: 'bg-amber-500/15 text-amber-400',
  productivity: 'bg-cyan-500/15 text-cyan-400',
  security: 'bg-rose-500/15 text-rose-400',
  data: 'bg-orange-500/15 text-orange-400',
};

const ITEMS_PER_PAGE = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listingName(l: MarketplaceListing): string {
  if (l.listingType === 'knowledge_base') return l.knowledgeBase?.name ?? 'Unnamed Knowledge Base';
  return l.agent?.name ?? 'Unnamed Agent';
}

function listingDescription(l: MarketplaceListing): string {
  if (l.listingType === 'knowledge_base') return l.knowledgeBase?.description ?? '';
  return l.agent?.description ?? '';
}

function listingCategory(l: MarketplaceListing): string {
  return l.category ?? 'other';
}

function listingAuthor(l: MarketplaceListing): string {
  return l.publisherName ?? l.agent?.name ?? 'Unknown';
}

function listingSystemPrompt(l: MarketplaceListing): string {
  return l.agent?.systemPrompt ?? '';
}

function listingIcon(l: MarketplaceListing, size: number): React.ReactNode {
  if (l.listingType === 'knowledge_base') return <BookOpen size={size} />;
  const cat = listingCategory(l);
  return CATEGORY_ICON_MAP[cat] ?? <Bot size={size} />;
}

function listingIconColor(l: MarketplaceListing): string {
  if (l.listingType === 'knowledge_base') return 'bg-purple-500/15 text-purple-400';
  const cat = listingCategory(l);
  return CATEGORY_COLOR_MAP[cat] ?? 'bg-surface-2 text-text-secondary';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplaceView() {
  const t = useTranslations('marketplace');
  const { user } = useStore();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [featured, setFeatured] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ListingTypeFilter>('all');
  const [category, setCategory] = useState<Category>('all');
  const [sort, setSort] = useState<SortOption>('popular');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<string | null>(null);

  // Fetch listings when filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: Parameters<typeof browseMarketplace>[0] = {
      sort_by: SORT_MAP[sort],
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    };
    if (category !== 'all') params.category = category;
    if (search) params.search = search;

    browseMarketplace(params)
      .then((data) => {
        if (!cancelled) {
          const filtered = typeFilter === 'all' ? data : data.filter((l) => l.listingType === typeFilter);
          setListings(filtered);
          setTotalCount(data.length < ITEMS_PER_PAGE ? (page - 1) * ITEMS_PER_PAGE + data.length : (page + 1) * ITEMS_PER_PAGE);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListings([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [category, sort, page, search, typeFilter]);

  // Fetch featured on mount
  useEffect(() => {
    getFeaturedListings()
      .then(setFeatured)
      .catch(() => setFeatured([]));
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const handleInstall = useCallback(async (id: string) => {
    setInstalling(id);
    try {
      await installFromMarketplace(id);
      setInstalledIds((prev) => new Set(prev).add(id));
    } catch {
      // Install failed -- could show toast here
    } finally {
      setInstalling(null);
    }
  }, []);

  // Sidebar
  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('searchPlaceholder')}
            className="pl-7 h-7 text-[11px]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        <div className="flex flex-col gap-0.5 pb-2">
          <p className="px-2.5 py-1.5 text-[10px] text-text-tertiary uppercase tracking-wider font-medium">{t('categories')}</p>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => { setCategory(cat.value); setPage(1); }}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                category === cat.value
                  ? 'bg-accent/8 text-text-primary border-l-2 border-accent -ml-px'
                  : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
              }`}
            >
              {cat.icon}
              <span className="text-[11px] font-medium">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <PageShell sidebar={sidebar} title={t('marketplace')}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Featured section */}
          {category === 'all' && !search && featured.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-text-primary mb-3">{t('featuredAgents')}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
                {featured.map((listing) => (
                  <FeaturedCard
                    key={listing.id}
                    listing={listing}
                    installed={installedIds.has(listing.id)}
                    isOwn={listing.publisherId === user?.id}
                    installing={installing === listing.id}
                    onInstall={() => handleInstall(listing.id)}
                    onSelect={() => setSelectedListing(listing)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Type filter + Sort controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-text-primary">
                {category === 'all' ? (typeFilter === 'knowledge_base' ? t('allKnowledgeBases') : typeFilter === 'agent' ? t('allAgents') : t('allListings')) : CATEGORIES.find((c) => c.value === category)?.label}
              </h2>
              <Tabs value={typeFilter} onValueChange={(v) => { setTypeFilter(v as ListingTypeFilter); setPage(1); }}>
                <TabsList className="h-7">
                  <TabsTrigger value="all" className="text-[10px] px-2 py-0.5">{t('typeAll')}</TabsTrigger>
                  <TabsTrigger value="agent" className="text-[10px] px-2 py-0.5 gap-1"><Bot size={10} /> {t('typeAgents')}</TabsTrigger>
                  <TabsTrigger value="knowledge_base" className="text-[10px] px-2 py-0.5 gap-1"><BookOpen size={10} /> {t('typeKnowledgeBases')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={12} className="text-text-tertiary" />
              <Tabs value={sort} onValueChange={(v) => { setSort(v as SortOption); setPage(1); }}>
                <TabsList className="h-7">
                  <TabsTrigger value="popular" className="text-[10px] px-2 py-0.5">{t('popular')}</TabsTrigger>
                  <TabsTrigger value="recent" className="text-[10px] px-2 py-0.5">{t('recent')}</TabsTrigger>
                  <TabsTrigger value="highest_rated" className="text-[10px] px-2 py-0.5">{t('highestRated')}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-text-tertiary" />
            </div>
          )}

          {/* Grid */}
          {!loading && listings.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  installed={installedIds.has(listing.id)}
                  isOwn={listing.publisherId === user?.id}
                  installing={installing === listing.id}
                  onInstall={() => handleInstall(listing.id)}
                  onSelect={() => setSelectedListing(listing)}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && listings.length === 0 && (
            <div className="text-center py-16">
              <Bot size={32} className="mx-auto text-text-tertiary mb-3 opacity-50" />
              <p className="text-sm text-text-secondary">{t('noAgentsFound')}</p>
              <p className="text-xs text-text-tertiary mt-1">{t('tryAdjusting')}</p>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-xs text-text-secondary">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      {selectedListing && (
        <ListingDetailDialog
          listing={selectedListing}
          installed={installedIds.has(selectedListing.id)}
          isOwn={selectedListing.publisherId === user?.id}
          installing={installing === selectedListing.id}
          onInstall={() => handleInstall(selectedListing.id)}
          onClose={() => setSelectedListing(null)}
        />
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Featured card (horizontal scroll)
// ---------------------------------------------------------------------------

function FeaturedCard({
  listing,
  installed,
  isOwn,
  installing,
  onInstall,
  onSelect,
}: {
  listing: MarketplaceListing;
  installed: boolean;
  isOwn: boolean;
  installing: boolean;
  onInstall: () => void;
  onSelect: () => void;
}) {
  const t = useTranslations('marketplace');
  const isKB = listing.listingType === 'knowledge_base';
  return (
    <div
      onClick={onSelect}
      className="min-w-[260px] max-w-[280px] p-4 rounded-xl border border-border-default bg-surface-0 hover:bg-surface-1 hover:border-border-focus transition-colors cursor-pointer flex flex-col gap-3 shrink-0"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${listingIconColor(listing)}`}>
          {listingIcon(listing, 18)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-text-primary truncate">{listingName(listing)}</h3>
          <p className="text-[10px] text-text-tertiary">by {listingAuthor(listing)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isKB && (
            <Badge variant="outline" className="text-[9px]">
              {listing.accessMode === 'fixed' ? <Lock size={8} className="mr-0.5" /> : <Unlock size={8} className="mr-0.5" />}
              {listing.accessMode === 'fixed' ? t('fixed') : t('extensible')}
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px]">{isKB ? t('typeKB') : listingCategory(listing)}</Badge>
        </div>
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">{listingDescription(listing)}</p>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <span className="flex items-center gap-0.5"><Star size={10} className="text-amber-400 fill-amber-400" /> {listing.avgRating ?? 0}</span>
          <span className="flex items-center gap-0.5"><Download size={10} /> {listing.installCount.toLocaleString()}</span>
        </div>
        <Button
          variant={installed || isOwn ? 'ghost' : 'default'}
          size="sm"
          disabled={installed || isOwn || installing}
          onClick={(e) => { e.stopPropagation(); onInstall(); }}
          className="h-6 text-[10px] px-2"
        >
          {installing ? <Loader2 size={10} className="animate-spin" /> : isOwn ? t('yours') : installed ? t('installed') : t('install')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listing card (grid)
// ---------------------------------------------------------------------------

function ListingCard({
  listing,
  installed,
  isOwn,
  installing,
  onInstall,
  onSelect,
}: {
  listing: MarketplaceListing;
  installed: boolean;
  isOwn: boolean;
  installing: boolean;
  onInstall: () => void;
  onSelect: () => void;
}) {
  const t = useTranslations('marketplace');
  const isKB = listing.listingType === 'knowledge_base';
  return (
    <div
      onClick={onSelect}
      className="p-4 rounded-xl border border-border-default bg-surface-0 hover:bg-surface-1 hover:border-border-focus transition-colors cursor-pointer flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${listingIconColor(listing)}`}>
          {listingIcon(listing, 16)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-text-primary truncate">{listingName(listing)}</h3>
          <span className="text-[10px] text-text-tertiary">by {listingAuthor(listing)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[9px] whitespace-nowrap">{isKB ? t('typeKB') : listingCategory(listing)}</Badge>
        {isKB && listing.accessMode && (
          <Badge variant="outline" className="text-[9px] whitespace-nowrap">
            {listing.accessMode === 'fixed' ? <Lock size={8} className="mr-0.5 inline" /> : <Unlock size={8} className="mr-0.5 inline" />}
            {listing.accessMode === 'fixed' ? t('fixed') : t('extensible')}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2 flex-1">{listingDescription(listing)}</p>
      <div className="flex items-center justify-between pt-1 border-t border-border-default">
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <span className="flex items-center gap-0.5">
            <Star size={10} className="text-amber-400 fill-amber-400" /> {listing.avgRating ?? 0}
            <span className="text-text-tertiary/60">({listing.ratingCount})</span>
          </span>
          <span className="flex items-center gap-0.5"><Download size={10} /> {listing.installCount.toLocaleString()}</span>
        </div>
        <Button
          variant={installed || isOwn ? 'ghost' : 'default'}
          size="sm"
          disabled={installed || isOwn || installing}
          onClick={(e) => { e.stopPropagation(); onInstall(); }}
          className="h-6 text-[10px] px-2"
        >
          {installing ? <Loader2 size={10} className="animate-spin" /> : isOwn ? t('yours') : installed ? t('installed') : t('install')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function ListingDetailDialog({
  listing,
  installed,
  isOwn,
  installing,
  onInstall,
  onClose,
}: {
  listing: MarketplaceListing;
  installed: boolean;
  isOwn: boolean;
  installing: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ratings, setRatings] = useState<AgentRatingRecord[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(true);
  const t = useTranslations('marketplace');

  const isKB = listing.listingType === 'knowledge_base';
  const prompt = listingSystemPrompt(listing);

  // Fetch ratings for this listing
  useEffect(() => {
    setRatingsLoading(true);
    getListingRatings(listing.id)
      .then(setRatings)
      .catch(() => setRatings([]))
      .finally(() => setRatingsLoading(false));
  }, [listing.id]);

  const handleSubmitReview = async () => {
    if (userRating === 0 || submitting) return;
    setSubmitting(true);
    try {
      const newRating = await rateMarketplaceListing(listing.id, {
        rating: userRating,
        review: reviewText || undefined,
      });
      setRatings((prev) => [newRating, ...prev]);
      setSubmitted(true);
      setShowRatingForm(false);
    } catch {
      // Could show error toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <DialogHeader className="mb-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${listingIconColor(listing)}`}>
                {listingIcon(listing, 16)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold leading-none">{listingName(listing)}</DialogTitle>
                  <Badge variant="outline" className="text-[9px]">{isKB ? t('typeKB') : listingCategory(listing)}</Badge>
                  {isKB && listing.accessMode && (
                    <Badge variant="outline" className="text-[9px]">
                      {listing.accessMode === 'fixed' ? <Lock size={8} className="mr-0.5" /> : <Unlock size={8} className="mr-0.5" />}
                      {listing.accessMode === 'fixed' ? t('fixed') : t('extensible')}
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-text-secondary mt-1">
                  by {listingAuthor(listing)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 py-2 px-3 rounded-lg bg-surface-1 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Star size={13} className="text-amber-400 fill-amber-400" />
              <span className="font-medium text-text-primary">{listing.avgRating ?? 0}</span>
              <span className="text-text-tertiary">({listing.ratingCount} ratings)</span>
            </span>
            <span className="w-px h-3.5 bg-border-default" />
            <span className="flex items-center gap-1.5">
              <Download size={13} />
              <span className="font-medium text-text-primary">{listing.installCount.toLocaleString()}</span>
              <span className="text-text-tertiary">installs</span>
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1 border-t border-border-default">
          <div className="px-5 py-4 flex flex-col gap-5">
            {/* Description */}
            <div>
              <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">{t('description')}</h4>
              <p className="text-[13px] text-text-secondary leading-relaxed">{listingDescription(listing)}</p>
            </div>

            {/* KB details */}
            {isKB && listing.knowledgeBase && (
              <div>
                <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">{t('kbDetails')}</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-lg bg-surface-0 border border-border-default text-center">
                    <div className="text-sm font-semibold text-text-primary font-mono">{listing.knowledgeBase.documentCount}</div>
                    <div className="text-[10px] text-text-tertiary">{t('documents')}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-0 border border-border-default text-center">
                    <div className="text-sm font-semibold text-text-primary font-mono">{listing.knowledgeBase.chunkCount}</div>
                    <div className="text-[10px] text-text-tertiary">{t('chunks')}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface-0 border border-border-default text-center">
                    <div className="text-[11px] font-medium text-text-primary">{listing.accessMode === 'fixed' ? t('readOnly') : t('editable')}</div>
                    <div className="text-[10px] text-text-tertiary">{t('accessMode')}</div>
                  </div>
                </div>
              </div>
            )}

            {/* System prompt preview */}
            {!isKB && prompt && (
              <div>
                <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2">{t('systemPromptPreview')}</h4>
                <div className="p-3 rounded-lg bg-surface-0 border border-border-default">
                  <p className="text-[11px] text-text-tertiary font-mono leading-relaxed line-clamp-6 whitespace-pre-wrap">{prompt}</p>
                </div>
              </div>
            )}

            {/* Reviews */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                  {t('reviews')} ({ratings.length})
                </h4>
                {!showRatingForm && !submitted && (
                  <Button variant="ghost" size="sm" onClick={() => setShowRatingForm(true)} className="h-6 text-[10px]">
                    {t('writeReview')}
                  </Button>
                )}
              </div>

              {/* Rating form */}
              {showRatingForm && (
                <div className="p-3 rounded-lg bg-surface-0 border border-border-default mb-3">
                  <div className="flex items-center gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setUserRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="cursor-pointer p-0.5"
                      >
                        <Star
                          size={16}
                          className={`transition-colors ${
                            star <= (hoverRating || userRating)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-text-tertiary/30'
                          }`}
                        />
                      </button>
                    ))}
                    {userRating > 0 && (
                      <span className="text-[10px] text-text-tertiary ml-1">{userRating}/5</span>
                    )}
                  </div>
                  <Textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Write your review..."
                    className="min-h-[60px] text-[11px] mb-2"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowRatingForm(false)} className="h-6 text-[10px]">
                      {t('cancel')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={userRating === 0 || submitting}
                      onClick={handleSubmitReview}
                      className="h-6 text-[10px] gap-1"
                    >
                      {submitting ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} {t('submit')}
                    </Button>
                  </div>
                </div>
              )}

              {submitted && (
                <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 mb-3">
                  <p className="text-[11px] text-accent">Thank you for your review!</p>
                </div>
              )}

              {ratingsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={14} className="animate-spin text-text-tertiary" />
                </div>
              ) : ratings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {ratings.map((rating) => (
                    <div key={rating.id} className="p-3 rounded-lg bg-surface-0 border border-border-default">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-text-primary">{rating.userId.slice(0, 8)}</span>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                size={9}
                                className={i < rating.rating ? 'text-amber-400 fill-amber-400' : 'text-text-tertiary/30'}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] text-text-tertiary">
                          {new Date(rating.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {rating.review && (
                        <p className="text-[11px] text-text-secondary leading-relaxed">{rating.review}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !showRatingForm && !submitted && (
                  <p className="text-[11px] text-text-tertiary text-center py-6">{t('noReviewsYet')}</p>
                )
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border-default">
          <Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button>
          <Button
            size="sm"
            disabled={installed || isOwn || installing}
            onClick={onInstall}
            className="gap-1.5"
          >
            {installing ? <Loader2 size={12} className="animate-spin" /> : isOwn ? t('yours') : installed ? t('installed') : <><Download size={12} /> {t('install')}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MarketplaceView;
