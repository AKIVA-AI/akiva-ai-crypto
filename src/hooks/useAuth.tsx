import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** AAL from Supabase MFA: 'aal1' = password only, 'aal2' = MFA verified */
type AalLevel = 'aal1' | 'aal2';

interface AalState {
  currentLevel: AalLevel | null;
  nextLevel: AalLevel | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Current AAL state */
  aal: AalState | null;
  /** True if user has enrolled MFA but session is still aal1 */
  mfaRequired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Refresh AAL status (call after MFA challenge/verify) */
  refreshAal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [aal, setAal] = useState<AalState | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const checkAal = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) return;
      setAal({
        currentLevel: data.currentLevel as AalLevel | null,
        nextLevel: data.nextLevel as AalLevel | null,
      });
      // MFA is required when user has enrolled factors (nextLevel > currentLevel)
      setMfaRequired(
        data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
      );
    } catch {
      // Ignore MFA check errors for users without MFA
    }
  };

  useEffect(() => {
    // Set up auth state listener
    // IMPORTANT: Do NOT await Supabase calls inside this callback — causes deadlock
    // (supabase/auth-js#762). Dispatch async work via setTimeout(0).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          setTimeout(() => { checkAal(); }, 0);
        } else {
          setAal(null);
          setMfaRequired(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        checkAal();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error(error.message);
      throw error;
    }

    // Check if MFA is required after login
    await checkAal();

    toast.success('Signed in successfully');
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // Input validation
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      throw new Error('Invalid email');
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      throw new Error('Password too short');
    }
    if (!fullName.trim()) {
      toast.error('Please enter your full name');
      throw new Error('Name required');
    }

    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('This email is already registered. Please sign in instead.');
      } else {
        toast.error(error.message);
      }
      throw error;
    }

    toast.success('Account created successfully');
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      throw error;
    }
    toast.success('Signed out successfully');
  };

  const refreshAal = async () => {
    await checkAal();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, aal, mfaRequired, signIn, signUp, signOut, refreshAal }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
