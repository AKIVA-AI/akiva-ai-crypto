import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, TrendingUp, Bot, Wallet, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AuthView = 'auth' | 'forgot-password';

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [view, setView] = useState<AuthView>('auth');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(loginEmail, loginPassword);
      navigate('/');
    } catch {
      // Error is handled in useAuth
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signUp(signupEmail, signupPassword, signupName);
      navigate('/');
    } catch {
      // Error is handled in useAuth
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail || !resetEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success('Password reset email sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (view === 'forgot-password') {
    return (
      <div className="min-h-screen bg-background flex">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-background to-background p-12 flex-col justify-between">
          <div className="flex items-center gap-1">
            <span className="text-xl font-semibold tracking-tight">enterprise crypto</span>
            <span className="text-primary font-bold text-2xl">.</span>
          </div>
          <div className="space-y-8">
            <h1 className="text-4xl font-bold leading-tight">
              Institutional-Grade
              <span className="text-gradient block">Crypto Trading Infrastructure</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-md">
              The open-source control center for hedge funds, prop shops, and crypto-native trading desks.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; 2026 enterprise crypto. Open-source under MIT license.
          </p>
        </div>

        {/* Right side - Forgot password */}
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-md glass-panel border-border/50">
            <CardHeader className="space-y-1 text-center">
              <div className="lg:hidden flex items-center justify-center gap-1 mb-4">
                <span className="font-semibold tracking-tight">enterprise crypto</span>
                <span className="text-primary font-bold text-lg">.</span>
              </div>
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <CardDescription>
                Enter your email and we will send you a reset link
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {resetSent ? (
                <div className="space-y-4">
                  <Alert className="bg-success/10 border-success/30">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <AlertDescription className="text-success">
                      Check your email for a password reset link. It may take a few minutes to arrive.
                    </AlertDescription>
                  </Alert>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setView('auth'); setResetSent(false); setResetEmail(''); }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="name@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      className="bg-muted/50"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => { setView('auth'); setResetEmail(''); }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Sign In
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 via-background to-background p-12 flex-col justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xl font-semibold tracking-tight">enterprise crypto</span>
          <span className="text-primary font-bold text-2xl">.</span>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold leading-tight">
            Institutional-Grade
            <span className="text-gradient block">Crypto Trading Infrastructure</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-md">
            The open-source control center for hedge funds, prop shops, and crypto-native trading desks.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel rounded-lg p-4 space-y-2">
              <Bot className="h-6 w-6 text-primary" />
              <p className="font-medium">Multi-Agent System</p>
              <p className="text-sm text-muted-foreground">Autonomous trading agents with real-time monitoring</p>
            </div>
            <div className="glass-panel rounded-lg p-4 space-y-2">
              <Shield className="h-6 w-6 text-primary" />
              <p className="font-medium">Risk Management</p>
              <p className="text-sm text-muted-foreground">Enterprise-grade risk controls and circuit breakers</p>
            </div>
            <div className="glass-panel rounded-lg p-4 space-y-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              <p className="font-medium">Strategy Engine</p>
              <p className="text-sm text-muted-foreground">Deploy and manage trading strategies at scale</p>
            </div>
            <div className="glass-panel rounded-lg p-4 space-y-2">
              <Wallet className="h-6 w-6 text-primary" />
              <p className="font-medium">Treasury Ops</p>
              <p className="text-sm text-muted-foreground">Multi-venue treasury management and approvals</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          &copy; 2026 enterprise crypto. Open-source under MIT license.
        </p>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md glass-panel border-border/50">
          <CardHeader className="space-y-1 text-center">
            <div className="lg:hidden flex items-center justify-center gap-1 mb-4">
              <span className="font-semibold tracking-tight">enterprise crypto</span>
              <span className="text-primary font-bold text-lg">.</span>
            </div>
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription>Sign in to access your control center</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="name@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="bg-muted/50"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => { setView('forgot-password'); setResetEmail(loginEmail); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="name@company.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className="bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={6}
                      className="bg-muted/50"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
