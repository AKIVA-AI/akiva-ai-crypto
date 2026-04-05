interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold">Welcome to Enterprise Crypto</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Let's set up your trading environment. We'll walk you through your
          risk profile and trading preferences to customize the platform for
          your needs.
        </p>
      </div>
      <div className="space-y-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">1</span>
          <div>
            <p className="font-medium text-foreground">Risk Profile</p>
            <p>Choose your risk tolerance level</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">2</span>
          <div>
            <p className="font-medium text-foreground">Trading Preferences</p>
            <p>Set position sizes, assets, and trading hours</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-4">
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
