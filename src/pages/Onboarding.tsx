import { useState } from 'react';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { RiskProfileStep, type RiskLevel } from '@/components/onboarding/RiskProfileStep';
import { TradingPreferencesStep } from '@/components/onboarding/TradingPreferencesStep';

type Step = 'welcome' | 'risk' | 'preferences' | 'complete';

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>('welcome');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('moderate');
  const [maxPositionSize, setMaxPositionSize] = useState('10000');
  const [preferredAssets, setPreferredAssets] = useState<string[]>(['BTC', 'ETH']);

  const stepNumber = step === 'welcome' ? 1 : step === 'risk' ? 2 : step === 'preferences' ? 3 : 3;

  if (step === 'complete') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg rounded-lg border bg-card p-8 shadow-sm text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold">Setup Complete</h2>
          <p className="text-muted-foreground">
            Your trading environment is configured. Risk level: <strong>{riskLevel}</strong>.
            You can adjust these settings anytime from the Settings page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-lg border bg-card p-8 shadow-sm">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Step {stepNumber} of 3
        </p>
        {step === 'welcome' && (
          <WelcomeStep onNext={() => setStep('risk')} />
        )}
        {step === 'risk' && (
          <RiskProfileStep
            value={riskLevel}
            onChange={setRiskLevel}
            onNext={() => setStep('preferences')}
            onBack={() => setStep('welcome')}
          />
        )}
        {step === 'preferences' && (
          <TradingPreferencesStep
            maxPositionSize={maxPositionSize}
            preferredAssets={preferredAssets}
            onMaxPositionSizeChange={setMaxPositionSize}
            onPreferredAssetsChange={setPreferredAssets}
            onFinish={() => setStep('complete')}
            onBack={() => setStep('risk')}
          />
        )}
      </div>
    </div>
  );
}

export default OnboardingWizard;
