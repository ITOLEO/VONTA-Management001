import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Protects all private /projects/* and /profile routes.
 * Never loads or falls back to synthetic demo projects inside /projects.
 */
export function PrivateRouteGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F4F3EF] px-4 text-[#1B2A4A]">
        <div
          role="status"
          data-testid="auth-session-loading"
          className="flex items-center gap-3 rounded-xl border border-[#D9DEE2] bg-white px-6 py-5 text-[15px] leading-[22px] font-medium"
        >
          <Loader2 className="h-5 w-5 animate-spin text-[#D4652F]" aria-hidden="true" />
          Restoring session…
        </div>
      </div>
    );
  }

  if (status === 'signed_out') {
    return <Navigate to="/auth/sign-in" state={{ from: location.pathname }} replace />;
  }

  if (status === 'unconfigured') {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F4F3EF] text-[#1B2A4A]">
        <header className="border-b border-[#D9DEE2] bg-white">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link
              to="/"
              className="text-[18px] leading-[24px] font-bold tracking-tight text-[#1B2A4A]"
            >
              VONTA
            </Link>
            <Link
              to="/auth/sign-in"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white hover:bg-[#8C350E]"
            >
              Sign in
            </Link>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 py-12">
          <section
            data-testid="private-signed-out-gate"
            className="rounded-xl border border-[#D9DEE2] bg-white p-6 sm:p-8"
          >
            <div className="flex items-center gap-2 text-[13px] leading-[18px] font-semibold text-[#A64011]">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Sign-in required · Authentication staging not configured
            </div>
            <h1 className="mt-2 text-[26px] leading-[32px] font-bold tracking-tight text-[#1B2A4A]">
              Sign in to access private projects
            </h1>
            <p className="mt-2 text-[15px] leading-[22px] text-[#4F5C67]">
              Private routes under <code className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[13px]">/projects</code>{' '}
              and <code className="rounded bg-[#F4F3EF] px-1.5 py-0.5 text-[13px]">/profile</code>{' '}
              require a live Supabase session. Demo projects are never loaded here.
            </p>
            <p className="mt-2 text-[13px] leading-[18px] text-[#4F5C67]">
              Configure <code className="rounded bg-[#F4F3EF] px-1 py-0.5">VITE_SUPABASE_URL</code>{' '}
              and <code className="rounded bg-[#F4F3EF] px-1 py-0.5">VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
              for the browser, plus server credentials in the environment, to enable live sign-in.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/auth/sign-in"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white hover:bg-[#8C350E]"
              >
                Go to sign in
              </Link>
              <Link
                to="/demo"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] leading-[20px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
              >
                Open isolated A-03 demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
