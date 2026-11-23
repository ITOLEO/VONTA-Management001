import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseClientConfigured, supabase } from '../lib/supabaseClient';
import { ApiClientError, privateApi } from '../data/privateApi';
import type { UserProfile } from '../domain/accountTypes';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed_out' | 'authenticated';

interface AuthActionResult {
  ok: boolean;
  error?: string;
  info?: string;
  needsEmailConfirmation?: boolean;
  challengeId?: string;
  registeredEmail?: string;
  resendAfterSeconds?: number;
}

interface AuthContextValue {
  status: AuthStatus;
  isConfigured: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  sessionEpoch: number;
  refreshProfile: () => Promise<void>;
  setProfileDirect: (next: UserProfile) => void;
  signInWithPassword: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<AuthActionResult>;
  sendPasswordRecovery: (email: string) => Promise<AuthActionResult>;
  completePasswordReset: (newPassword: string) => Promise<AuthActionResult>;
  requestAccountPasswordChallenge: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<AuthActionResult>;
  confirmAccountPasswordChange: (input: {
    challengeId: string;
    verificationCode: string;
    newPassword: string;
  }) => Promise<AuthActionResult>;
  cancelAccountPasswordChallenge: (challengeId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseClientConfigured ? 'loading' : 'unconfigured'
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const loadProfileForSession = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.access_token) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const res = await privateApi.getProfile(activeSession.access_token);
      setProfile(res.profile);
    } catch {
      const u = activeSession.user;
      const metaName =
        (typeof u.user_metadata?.full_name === 'string' && u.user_metadata.full_name) ||
        u.email?.split('@')[0] ||
        'User';
      setProfile({
        userId: u.id,
        email: u.email ?? '',
        pendingEmail: null,
        displayName: metaName,
        phoneNumber: '',
        phoneStatus: 'contact_only',
        displayTimezone: 'Asia/Jakarta',
        version: 1,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session ?? null;
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'signed_out');
      void loadProfileForSession(nextSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      if (!nextSession) {
        setProfile(null);
        setStatus('signed_out');
        setSessionEpoch((e) => e + 1);
      } else {
        setStatus('authenticated');
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          void loadProfileForSession(nextSession);
        }
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfileForSession]);

  const refreshProfile = useCallback(async () => {
    await loadProfileForSession(session);
  }, [loadProfileForSession, session]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return {
          ok: false,
          error:
            'Supabase Auth is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY).',
        };
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      if (!data.session) {
        return { ok: false, error: 'Sign-in did not establish an active session.' };
      }
      setSession(data.session);
      setStatus('authenticated');
      setSessionEpoch((e) => e + 1);
      await loadProfileForSession(data.session);
      return { ok: true };
    },
    [loadProfileForSession]
  );

  const signUp = useCallback(
    async (input: { fullName: string; email: string; password: string }): Promise<AuthActionResult> => {
      if (!supabase) {
        return {
          ok: false,
          error:
            'Supabase Auth is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY).',
        };
      }
      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: input.fullName.trim(),
          },
        },
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      if (data.session) {
        setSession(data.session);
        setStatus('authenticated');
        await loadProfileForSession(data.session);
        return { ok: true, needsEmailConfirmation: false };
      }
      return {
        ok: true,
        needsEmailConfirmation: true,
        info: 'Account created. Check your email inbox to verify your address before signing in.',
      };
    },
    [loadProfileForSession]
  );

  const sendPasswordRecovery = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!supabase) {
      return {
        ok: false,
        error:
          'Supabase Auth is not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY).',
      };
    }
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) {
      return { ok: false, error: error.message };
    }
    return {
      ok: true,
      info: 'If an account exists for that email, a recovery link has been sent.',
    };
  }, []);

  const completePasswordReset = useCallback(
    async (newPassword: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return { ok: false, error: 'Supabase Auth is not configured.' };
      }
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { ok: false, error: error.message };
      }
      if (session?.access_token && data.user) {
        await privateApi
          .recordAccountSecurityEvent(session.access_token, {
            eventType: 'account_password_changed',
            reason: 'Completed via recovery reset flow',
          })
          .catch(() => undefined);
      }
      return { ok: true, info: 'Your account password has been updated.' };
    },
    [session]
  );

  /**
   * Step 1 of confirmed account password change:
   * 1. Verifies the current password with Supabase Auth.
   * 2. Sends a single-use reauthentication nonce to the registered verified email via Supabase `auth.reauthenticate()`.
   * 3. Registers a server-side expiring challenge bound to the account and operation.
   * Never mutates the password before email confirmation succeeds.
   */
  const requestAccountPasswordChallenge = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
    }): Promise<AuthActionResult> => {
      if (!supabase || !session?.access_token || !session.user.email) {
        return {
          ok: false,
          error: 'Sign in with a configured live VONTA account to change your account password.',
        };
      }

      const reauthSignIn = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: input.currentPassword,
      });
      if (reauthSignIn.error || !reauthSignIn.data.session) {
        await privateApi
          .recordAccountSecurityEvent(session.access_token, {
            eventType: 'account_password_failed',
            reason: 'Current account password verification failed',
          })
          .catch(() => undefined);
        return {
          ok: false,
          error: 'Current account password is incorrect. Your password has not changed.',
        };
      }

      const reauthEmail = await supabase.auth.reauthenticate();
      if (reauthEmail.error) {
        await privateApi
          .recordAccountSecurityEvent(reauthSignIn.data.session.access_token, {
            eventType: 'account_password_failed',
            reason: `Confirmation email could not be sent: ${reauthEmail.error.message}`,
          })
          .catch(() => undefined);
        return {
          ok: false,
          error: `Could not send confirmation email to ${session.user.email}: ${reauthEmail.error.message}. Your password was not changed.`,
        };
      }

      try {
        const res = await privateApi.requestAccountPasswordChallenge(
          reauthSignIn.data.session.access_token,
          { providerReauthSent: true }
        );
        return {
          ok: true,
          challengeId: res.challengeId,
          registeredEmail: res.registeredEmail,
          resendAfterSeconds: res.resendAfterSeconds,
          info: res.deliveryMessage,
        };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof ApiClientError
              ? err.message
              : 'Could not register password confirmation challenge. Try again.',
        };
      }
    },
    [session]
  );

  /**
   * Step 2 of confirmed account password change:
   * Submits the verification code received at the registered email address as `nonce`
   * to Supabase Auth `updateUser({ password, nonce })`. Old password remains active until this succeeds.
   */
  const confirmAccountPasswordChange = useCallback(
    async (input: {
      challengeId: string;
      verificationCode: string;
      newPassword: string;
    }): Promise<AuthActionResult> => {
      if (!supabase || !session?.access_token || !session.user.email) {
        return { ok: false, error: 'Sign in with a configured live VONTA account first.' };
      }
      const trimmedCode = input.verificationCode.trim();
      if (!trimmedCode) {
        return { ok: false, error: 'Enter the verification code sent to your registered email.' };
      }

      const { error } = await supabase.auth.updateUser({
        password: input.newPassword,
        nonce: trimmedCode,
      });
      if (error) {
        await privateApi
          .recordAccountSecurityEvent(session.access_token, {
            eventType: 'account_password_failed',
            reason: `Email verification failed: ${error.message}`,
          })
          .catch(() => undefined);
        return {
          ok: false,
          error: `${error.message} Your current password remains unchanged.`,
        };
      }

      await privateApi
        .cancelAccountPasswordChallenge(session.access_token, { challengeId: input.challengeId })
        .catch(() => undefined);
      await privateApi
        .recordAccountSecurityEvent(session.access_token, {
          eventType: 'account_password_changed',
          reason: 'Verified via current password and registered-email confirmation',
        })
        .catch(() => undefined);

      return {
        ok: true,
        info: 'Account password updated after email confirmation. Project passwords remain independent and unchanged.',
      };
    },
    [session]
  );

  const cancelAccountPasswordChallenge = useCallback(
    async (challengeId: string) => {
      if (!session?.access_token || !challengeId) return;
      await privateApi
        .cancelAccountPasswordChallenge(session.access_token, { challengeId })
        .catch(() => undefined);
    },
    [session]
  );

  const signOut = useCallback(async () => {
    setProfile(null);
    setSession(null);
    setStatus(isSupabaseClientConfigured ? 'signed_out' : 'unconfigured');
    setSessionEpoch((e) => e + 1);
    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isConfigured: isSupabaseClientConfigured,
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      profile,
      profileLoading,
      sessionEpoch,
      refreshProfile,
      setProfileDirect: setProfile,
      signInWithPassword,
      signUp,
      sendPasswordRecovery,
      completePasswordReset,
      requestAccountPasswordChallenge,
      confirmAccountPasswordChange,
      cancelAccountPasswordChallenge,
      signOut,
    }),
    [
      status,
      session,
      profile,
      profileLoading,
      sessionEpoch,
      refreshProfile,
      signInWithPassword,
      signUp,
      sendPasswordRecovery,
      completePasswordReset,
      requestAccountPasswordChallenge,
      confirmAccountPasswordChange,
      cancelAccountPasswordChallenge,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
