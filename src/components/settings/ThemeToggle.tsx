import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark' | 'system';

const LS_KEY = 'ec_theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = theme === 'system' ? getSystemTheme() : theme;

  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

function getSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // ignore
  }
  return 'dark'; // Enterprise Crypto defaults to dark
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getSavedTheme);

  const handleChange = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem(LS_KEY, newTheme);
    } catch {
      // ignore
    }
    applyTheme(newTheme);
  }, []);

  // Apply theme on mount and listen for system preference changes
  useEffect(() => {
    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-primary" />
          Appearance
        </CardTitle>
        <CardDescription>
          Choose how the trading interface looks
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {options.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'default' : 'outline'}
              className={cn(
                'flex-1 gap-2',
                theme === value && 'ring-2 ring-primary/50'
              )}
              onClick={() => handleChange(value)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
