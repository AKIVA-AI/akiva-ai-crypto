import { useState } from 'react';

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

interface RiskProfileStepProps {
  value: RiskLevel;
  onChange: (level: RiskLevel) => void;
  onNext: () => void;
  onBack: () => void;
}

const riskOptions: { level: RiskLevel; label: string; description: string }[] = [
  {
    level: 'conservative',
    label: 'Conservative',
    description: 'Lower risk tolerance. Smaller position sizes, tighter stop-losses, focus on major pairs.',
  },
  {
    level: 'moderate',
    label: 'Moderate',
    description: 'Balanced approach. Standard position sizing with diversified asset exposure.',
  },
  {
    level: 'aggressive',
    label: 'Aggressive',
    description: 'Higher risk tolerance. Larger positions, wider stop-losses, includes altcoins and DeFi.',
  },
];

export function RiskProfileStep({ value, onChange, onNext, onBack }: RiskProfileStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Risk Profile</h2>
        <p className="text-muted-foreground">
          Select your risk tolerance to configure default trading parameters.
        </p>
      </div>
      <div className="space-y-3">
        {riskOptions.map((option) => (
          <button
            key={option.level}
            type="button"
            className={`w-full text-left rounded-lg border p-4 transition-colors ${
              value === option.level
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onClick={() => onChange(option.level)}
            aria-pressed={value === option.level}
          >
            <p className="font-medium">{option.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
          </button>
        ))}
      </div>
      <div className="flex justify-between pt-4">
        <button
          className="inline-flex items-center justify-center rounded-md border border-border px-6 py-2 text-sm font-medium hover:bg-accent"
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}
