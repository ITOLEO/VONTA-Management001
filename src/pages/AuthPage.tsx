import { demoAccounts, demoForEmail } from '../domain/demoAccounts';
import { Brand } from './LandingPage';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

type AuthMode = 'sign-in' | 'create-account' | 'forgot-password' | 'reset-password' | 'callback';

interface AuthFieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export function AuthPage({ defaultMode = 'sign-in' }: { defaultMode?: AuthMode }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    status,
    isConfigured,
    signInWithPassword,
    signUp,
    sendPasswordRecovery,
    completePasswordReset,
  } = useAuth();

  const location = useLocation();
  const requestedRole = searchParams.get('demo');
  const demoAccount = demoAccounts.find(a=>a.role===requestedRole);
  const returnTo = location.state?.from === '/admin' ? '/admin' : '/projects';
  const modeParam = searchParams.get('mode') as AuthMode | null;
  const mode: AuthMode =
    defaultMode === 'reset-password' || defaultMode === 'callback'
      ? defaultMode
      : modeParam === 'create-account' || modeParam === 'forgot-password' || modeParam === 'sign-in'
        ? modeParam
        : defaultMode;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(demoAccount?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Strip any verification codes or auth tokens from URL immediately on callback/reset routes
  useEffect(() => {
    if (mode !== 'callback' && mode !== 'reset-password') return;
    if (typeof window === 'undefined') return;

    const handleCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      if (supabase && code) {
        await supabase.auth.exchangeCodeForSession(code).catch(() => undefined);
      }
      // Always strip auth query/hash parameters so codes/tokens never linger in URL or history
      if (url.search || url.hash) {
        window.history.replaceState({}, document.title, url.pathname);
      }
      if (mode === 'callback') {
        setFormInfo(
          supabase
            ? 'Verification processed. Continue to your projects or sign in.'
            : 'Supabase Auth is not configured in this environment. Verification parameters were cleared from the URL.'
        );
      }
    };
    void handleCallback();
  }, [mode]);

  // If already authenticated on sign-in screen, route explicitly to /projects directory
  useEffect(() => {
    if (status === 'authenticated' && mode === 'sign-in' && !demoAccount) {
      navigate(returnTo, { replace: true });
    }
  }, [status, mode, navigate, demoAccount, returnTo]);

  const setMode = (next: 'sign-in' | 'create-account' | 'forgot-password') => {
    setFieldErrors({});
    setFormError(null);
    setFormInfo(null);
    if (next === 'forgot-password') {
      navigate('/auth/forgot-password');
    } else {
      setSearchParams(next === 'sign-in' ? {} : { mode: next }, { replace: true });
      if (defaultMode !== 'sign-in') {
        navigate(next === 'sign-in' ? '/auth/sign-in' : `/auth/sign-in?mode=${next}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormInfo(null);

    const errors: AuthFieldErrors = {};
    const trimmedEmail = email.trim();

    if (mode === 'create-account' && !fullName.trim()) {
      errors.fullName = 'Full name is required.';
    }
    if (mode !== 'reset-password' && (!trimmedEmail || !trimmedEmail.includes('@'))) {
      errors.email = 'Enter a valid email address.';
    }
    if (mode === 'sign-in' || mode === 'create-account' || mode === 'reset-password') {
      if (!password) {
        errors.password = 'Password is required.';
      } else if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters.';
      }
    }
    if (mode === 'reset-password' && password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    if (mode === 'sign-in' && demoForEmail(trimmedEmail)) {
      setSubmitting(true);
      try {
        const result = await fetch('/api/demo/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:trimmedEmail,password})});
        if (!result.ok) throw new Error('Check your demo email and password.');
        navigate('/demo/dashboard', {replace:true});
      } catch (error) {setFormError(error instanceof Error ? error.message : 'Demo sign-in unavailable.');}
      finally {setSubmitting(false);}
      return;
    }
    if (!isConfigured) {
      setFormError(
        'Supabase Auth is not configured in this environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable live sign-in.'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const res = await signInWithPassword(trimmedEmail, password);
        if (!res.ok) {
          setFormError(res.error ?? 'Sign-in failed.');
          return;
        }
        // Always open /projects directory after fresh sign-in and wait for explicit project selection
        navigate(returnTo, { replace: true });
      } else if (mode === 'create-account') {
        const res = await signUp({ fullName, email: trimmedEmail, password });
        if (!res.ok) {
          setFormError(res.error ?? 'Registration failed.');
          return;
        }
        if (res.needsEmailConfirmation) {
          setFormInfo(res.info ?? 'Check your email to verify your account.');
        } else {
          navigate(returnTo, { replace: true });
        }
      } else if (mode === 'forgot-password') {
        const res = await sendPasswordRecovery(trimmedEmail);
        if (!res.ok) {
          setFormError(res.error ?? 'Could not send recovery email.');
          return;
        }
        setFormInfo(res.info ?? 'Recovery email sent.');
      } else if (mode === 'reset-password') {
        const res = await completePasswordReset(password);
        if (!res.ok) {
          setFormError(res.error ?? 'Password reset failed.');
          return;
        }
        setPassword('');
        setConfirmPassword('');
        setFormInfo(res.info ?? 'Your account password has been updated.');
      }
    } catch {
      setFormError('Could not reach the authentication service. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vt-auth">
      <header><Brand/><Link to="/">Back to home</Link></header>
      <main><aside><img src="/media/hero.webp" alt="Architectural illustration of an Indonesian job site" /><div><span>VONTA Management</span><h2>Precision at<br/>Every Pin.</h2></div></aside>
      <div className="vt-authform"><section>
          <h1 className="vonta-page-title text-[#1B2A4A]">
            {mode === 'sign-in'
              ? demoAccount ? 'Sign in to '+demoAccount.title.toLowerCase()+' demo' : 'Sign in to VONTA'
              : mode === 'create-account'
                ? 'Create account'
                : mode === 'forgot-password'
                  ? 'Recover account password'
                  : mode === 'reset-password'
                    ? 'Set new account password'
                    : 'Account verification'}
          </h1>

          <p className="mt-1.5 text-[15px] leading-[22px] text-[#4F5C67]">
            {mode === 'sign-in'
              ? 'Sign in with your email to open your Projects directory.'
              : mode === 'create-account'
                ? 'Register your account to create or join authorized VONTA projects.'
                : mode === 'forgot-password'
                  ? 'Enter your email address to receive a password recovery link.'
                  : mode === 'reset-password'
                    ? 'Choose a new account password. Project passwords remain separate.'
                    : 'Your verification link has been processed.'}
          </p>

          {!isConfigured && !demoAccount && <p role="status" className="vt-note">Live account access is waiting for configuration. Sample accounts are available.</p>}
          {demoAccount && <p className="vt-note">Sample password <code>demo123123</code></p>}
          {mode === 'callback' ? (
            <div className="mt-5 space-y-4">
              {formInfo && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] leading-[18px] text-[#166534]"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formInfo}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                <Link
                  to="/projects"
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#8C350E]"
                >
                  Open Projects
                </Link>
                <Link
                  to="/profile"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#D9DEE2] bg-white px-4 py-2 text-[14px] font-medium text-[#1B2A4A] hover:bg-[#F4F3EF]"
                >
                  Profile settings
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
              {mode === 'create-account' && (
                <div>
                  <label
                    htmlFor="auth-full-name"
                    className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                  >
                    Full name
                  </label>
                  <input
                    id="auth-full-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (fieldErrors.fullName) setFieldErrors((p) => ({ ...p, fullName: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    placeholder="e.g. Budi Santoso"
                    className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                  />
                  {fieldErrors.fullName && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>
              )}

              {mode !== 'reset-password' && (
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                  >
                    Email address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    placeholder="name@company.com"
                    className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                  />
                  {fieldErrors.email && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
              )}

              {mode !== 'forgot-password' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                    >
                      {mode === 'reset-password' ? 'New account password' : 'Password'}
                    </label>
                    {mode === 'sign-in' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot-password')}
                        className="text-[13px] leading-[18px] font-medium text-[#4F5C67] hover:text-[#1B2A4A]"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    placeholder="Minimum 8 characters"
                    className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                  />
                  {fieldErrors.password && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>
              )}

              {mode === 'reset-password' && (
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-[14px] leading-[20px] font-medium text-[#1B2A4A]"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="auth-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword) {
                        setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    className="mt-1 h-11 w-full rounded-lg border border-[#D9DEE2] bg-white px-3 text-[15px] text-[#1B2A4A]"
                  />
                  {fieldErrors.confirmPassword && (
                    <p role="alert" className="mt-1 text-[13px] font-medium text-[#B42318]">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>
              )}

              {formError && (
                <div
                  role="alert"
                  data-testid="auth-form-error"
                  className="flex items-start gap-2 rounded-lg border border-[#B42318]/40 bg-[#FEF3F2] p-3 text-[13px] leading-[18px] text-[#B42318]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              )}

              {formInfo && (
                <div
                  role="status"
                  data-testid="auth-form-info"
                  className="flex items-start gap-2 rounded-lg border border-[#166534]/30 bg-[#DCFCE7]/60 p-3 text-[13px] leading-[18px] text-[#166534]"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formInfo}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#A64011] px-4 py-2 text-[14px] leading-[20px] font-semibold text-white transition-colors hover:bg-[#8C350E] disabled:opacity-60"
              >
                {submitting
                  ? 'Please wait…'
                  : mode === 'sign-in'
                    ? 'Sign in'
                    : mode === 'create-account'
                      ? 'Create account'
                      : mode === 'forgot-password'
                        ? 'Send recovery link'
                        : 'Update password'}
              </button>
            </form>
          )}

          {mode !== 'callback' && (
            <div className="mt-5 border-t border-[#D9DEE2] pt-4 text-center text-[14px] leading-[20px] text-[#4F5C67]">
              {mode === 'sign-in' ? (
                <>
                  New to VONTA?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('create-account')}
                    className="font-semibold text-[#1B2A4A] underline-offset-4 hover:underline"
                  >
                    Create account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('sign-in')}
                    className="font-semibold text-[#1B2A4A] underline-offset-4 hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          )}
        </section><Link className="vt-under" to="/demo/access">Choose a demo account</Link></div>
      </main>
    </div>
  );
}
