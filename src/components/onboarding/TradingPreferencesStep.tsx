interface TradingPreferencesStepProps {
  maxPositionSize: string;
  preferredAssets: string[];
  onMaxPositionSizeChange: (value: string) => void;
  onPreferredAssetsChange: (assets: string[]) => void;
  onFinish: () => void;
  onBack: () => void;
}

const availableAssets = ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'LINK', 'UNI', 'AAVE'];

export function TradingPreferencesStep({
  maxPositionSize,
  preferredAssets,
  onMaxPositionSizeChange,
  onPreferredAssetsChange,
  onFinish,
  onBack,
}: TradingPreferencesStepProps) {
  const toggleAsset = (asset: string) => {
    if (preferredAssets.includes(asset)) {
      onPreferredAssetsChange(preferredAssets.filter((a) => a !== asset));
    } else {
      onPreferredAssetsChange([...preferredAssets, asset]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Trading Preferences</h2>
        <p className="text-muted-foreground">
          Configure your default trading parameters. You can change these later in Settings.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="max-position-size" className="text-sm font-medium">
            Max Position Size (USD)
          </label>
          <input
            id="max-position-size"
            type="number"
            className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="10000"
            value={maxPositionSize}
            onChange={(e) => onMaxPositionSizeChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Preferred Assets</p>
          <div className="flex flex-wrap gap-2">
            {availableAssets.map((asset) => (
              <button
                key={asset}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  preferredAssets.includes(asset)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => toggleAsset(asset)}
                aria-pressed={preferredAssets.includes(asset)}
              >
                {asset}
              </button>
            ))}
          </div>
        </div>
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
          onClick={onFinish}
        >
          Finish
        </button>
      </div>
    </div>
  );
}
