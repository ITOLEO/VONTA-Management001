import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Clock,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
} from 'lucide-react';
import {
  formatThemeLabel,
  useThemePreference,
  type ThemeChoice,
} from '../utils/themePreference';

export interface ProfileMenuProps {
  mode: 'live' | 'demo';
  displayName: string;
  emailOrSubtitle: string;
  /** Optional portrait image URL for the account profile (never mutated by attendance selfies) */
  avatarUrl?: string | null;
  badgeText?: string | null;
  timezoneLabel: string;
  accountPath: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSignOut?: () => void;
  onResetDemo?: () => void;
  triggerTestId?: string;
}

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
];

/**
 * Right-aligned top-bar Profile trigger and popover (Field Operations Revision):
 * - Trigger shows circular portrait photo (or initials fallback), display name, and smaller registered email.
 * - Popover order: Identity (with distinct demo label when in demo mode) -> Account -> Theme -> Timezone -> Sign out.
 * - Closes on Escape (returning focus to trigger) or outside click.
 */
export function ProfileMenu({
  mode,
  displayName,
  emailOrSubtitle,
  avatarUrl,
  badgeText,
  timezoneLabel,
  accountPath,
  open,
  onOpenChange,
  onSignOut,
  onResetDemo,
  triggerTestId = 'profile-menu-trigger',
}: ProfileMenuProps) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { theme, setTheme } = useThemePreference();

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus();
        });
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onOpenChange]);

  const returnToParam =
    location.pathname && !location.pathname.endsWith('/profile')
      ? `?returnTo=${encodeURIComponent(location.pathname)}`
      : '';
  const accountHref = `${accountPath}${returnToParam}`;

  const renderAvatar = (sizeClass: string) =>
    avatarUrl ? (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        className={`${sizeClass} shrink-0 rounded-full border border-[#D9DEE2] object-cover`}
      />
    ) : (
      <span
        aria-hidden="true"
        className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full bg-[#1B2A4A] text-[12px] font-semibold text-white`}
      >
        {initials}
      </span>
    );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Profile"
        data-testid={triggerTestId}
        className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-[#D9DEE2] bg-white px-2 py-1 text-left text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]"
      >
        {renderAvatar('h-8 w-8')}
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span
            data-testid="profile-trigger-name"
            className="max-w-[126px] truncate text-[13px] font-semibold text-[#1B2A4A] 2xl:max-w-[144px]"
          >
            {displayName}
          </span>
          <span
            data-testid="profile-trigger-email"
            className="max-w-[126px] truncate text-[11px] font-normal text-[#4F5C67] 2xl:max-w-[144px]"
          >
            {emailOrSubtitle}
          </span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-[#4F5C67] sm:inline" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile menu"
          data-testid="profile-menu-popover"
          className="fixed right-3 top-[64px] z-50 w-[min(300px,calc(100vw-24px))] rounded-xl border border-[#D9DEE2] bg-white p-2 shadow-xl sm:absolute sm:right-0 sm:top-full sm:mt-1.5 sm:w-[300px]"
        >
          {/* 1. Identity */}
          <div className="rounded-lg bg-[#F4F3EF]/75 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              {renderAvatar('h-9 w-9')}
              <div className="min-w-0 flex-1">
                <div
                  data-testid="profile-popover-name"
                  className="truncate text-[14px] leading-[19px] font-semibold text-[#1B2A4A]"
                >
                  {displayName}
                </div>
                <div
                  data-testid="profile-popover-email"
                  className="truncate text-[12px] leading-[16px] text-[#4F5C67]"
                >
                  {emailOrSubtitle}
                </div>
              </div>
            </div>
            {badgeText && (
              <div className="mt-2 inline-flex items-center rounded border border-[#D4652F]/35 bg-[#FFF3EB] px-2 py-0.5 text-[11px] leading-[15px] font-semibold text-[#A64011]">
                {badgeText}
              </div>
            )}
          </div>

          <div className="my-2 border-t border-[#D9DEE2]" />

          {/* 2. Account */}
          <Link
            to={accountHref}
            role="menuitem"
            onClick={() => onOpenChange(false)}
            data-testid="menu-account-link"
            className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] md:min-h-[38px]"
          >
            <span>Account</span>
            <span className="text-[12px] text-[#4F5C67]">Settings</span>
          </Link>

          <div className="my-2 border-t border-[#D9DEE2]" />

          {/* 3. Theme */}
          <div className="px-3 py-1.5" role="group" aria-label="Theme">
            <div className="flex items-center justify-between text-[13px] leading-[18px]">
              <span className="font-medium text-[#1B2A4A]">Theme</span>
              <span className="text-[#4F5C67]" data-testid="profile-current-theme">
                {formatThemeLabel(theme)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => setTheme(opt.value)}
                    data-testid={`profile-theme-${opt.value}`}
                    className={`flex min-h-[36px] items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[13px] leading-[18px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] ${
                      active
                        ? 'border-[#D4652F] bg-[#FFF3EB] text-[#A64011]'
                        : 'border-[#D9DEE2] bg-white text-[#4F5C67] hover:bg-[#F4F3EF] hover:text-[#1B2A4A]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-2 border-t border-[#D9DEE2]" />

          {/* 4. Timezone */}
          <Link
            to={`${accountPath}?section=preferences${returnToParam ? `&returnTo=${encodeURIComponent(location.pathname)}` : ''}`}
            role="menuitem"
            onClick={() => onOpenChange(false)}
            className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[13px] leading-[18px] transition-colors hover:bg-[#F4F3EF] md:min-h-[38px]"
          >
            <span className="flex items-center gap-1.5 font-medium text-[#1B2A4A]">
              <Clock className="h-3.5 w-3.5 text-[#4F5C67]" aria-hidden="true" />
              Timezone
            </span>
            <span
              className="max-w-[140px] truncate text-[#4F5C67]"
              data-testid="profile-current-timezone"
            >
              {timezoneLabel}
            </span>
          </Link>

          <div className="my-2 border-t border-[#D9DEE2]" />

          {/* 5. Sign out / Demo session exit */}
          {mode === 'live' ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(false);
                onSignOut?.();
              }}
              data-testid="menu-sign-out"
              className="flex min-h-[42px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#B42318] transition-colors hover:bg-[#FEF3F2] md:min-h-[38px]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          ) : (
            <div className="space-y-1">
              {onResetDemo && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenChange(false);
                    onResetDemo();
                  }}
                  className="flex min-h-[42px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] md:min-h-[38px]"
                >
                  <RotateCcw className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                  Reset demo data
                </button>
              )}
              <Link
                to="/auth/sign-in"
                role="menuitem"
                onClick={() => onOpenChange(false)}
                className="flex min-h-[42px] items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#1B2A4A] transition-colors hover:bg-[#F4F3EF] md:min-h-[38px]"
              >
                <LogIn className="h-4 w-4 text-[#4F5C67]" aria-hidden="true" />
                Sign in
              </Link>
              <Link
                to="/"
                role="menuitem"
                onClick={() => onOpenChange(false)}
                className="flex min-h-[42px] items-center gap-2 rounded-lg px-3 py-1.5 text-[14px] leading-[20px] font-medium text-[#4F5C67] transition-colors hover:bg-[#F4F3EF] hover:text-[#1B2A4A] md:min-h-[38px]"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out of demo
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
