import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Regex, 
  Save, 
  Trash2, 
  History, 
  Star, 
  ChevronDown,
  Info,
  X,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

type SavedSearch = {
  id: string;
  name: string;
  query: string;
  isRegex: boolean;
  createdAt: string;
  usageCount: number;
};

type AdvancedAuditSearchProps = {
  onSearch: (query: string, isRegex: boolean) => void;
  currentQuery: string;
};

const STORAGE_KEY = 'audit-saved-searches';

export function AdvancedAuditSearch({ onSearch, currentQuery }: AdvancedAuditSearchProps) {
  const [query, setQuery] = useState(currentQuery);
  const [isRegex, setIsRegex] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load saved searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
    const recent = localStorage.getItem('audit-recent-searches');
    if (recent) {
      setRecentSearches(JSON.parse(recent));
    }
  }, []);

  // Sync query with parent
  useEffect(() => {
    setQuery(currentQuery);
  }, [currentQuery]);

  const saveSearches = (searches: SavedSearch[]) => {
    setSavedSearches(searches);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  };

  const addToRecent = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(r => r !== q)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem('audit-recent-searches', JSON.stringify(updated));
  };

  const handleSearch = () => {
    addToRecent(query);
    onSearch(query, isRegex);
  };

  const handleSave = () => {
    if (!saveName.trim() || !query.trim()) {
      toast.error('Please enter a name and query');
      return;
    }

    const newSearch: SavedSearch = {
      id: crypto.randomUUID(),
      name: saveName,
      query,
      isRegex,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };

    saveSearches([...savedSearches, newSearch]);
    setSaveName('');
    setSaveDialogOpen(false);
    toast.success('Search saved');
  };

  const handleDelete = (id: string) => {
    saveSearches(savedSearches.filter(s => s.id !== id));
    toast.success('Search deleted');
  };

  const applySavedSearch = (search: SavedSearch) => {
    setQuery(search.query);
    setIsRegex(search.isRegex);
    onSearch(search.query, search.isRegex);

    // Increment usage count
    const updated = savedSearches.map(s => 
      s.id === search.id ? { ...s, usageCount: s.usageCount + 1 } : s
    );
    saveSearches(updated);
  };

  const clearSearch = () => {
    setQuery('');
    setIsRegex(false);
    onSearch('', false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Advanced Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRegex ? 'Enter regex pattern...' : 'Search with AND, OR, NOT operators...'}
              className="pr-8"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={clearSearch}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button onClick={handleSearch}>Search</Button>
        </div>

        {/* Options Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch 
                id="regex-mode" 
                checked={isRegex} 
                onCheckedChange={setIsRegex} 
              />
              <Label htmlFor="regex-mode" className="text-sm flex items-center gap-1 cursor-pointer">
                <Regex className="h-3 w-3" />
                Regex
              </Label>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                  <Info className="h-3 w-3" />
                  Syntax Help
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 bg-popover" align="start">
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium mb-1">Boolean Operators</p>
                    <div className="space-y-1 text-muted-foreground text-xs">
                      <p><code className="bg-muted px-1 rounded">AND</code> - Both terms required</p>
                      <p><code className="bg-muted px-1 rounded">OR</code> - Either term matches</p>
                      <p><code className="bg-muted px-1 rounded">NOT</code> - Exclude term</p>
                      <p className="mt-2">Example: <code className="bg-muted px-1 rounded">book AND freeze NOT test</code></p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="font-medium mb-1">Regex Patterns</p>
                    <div className="space-y-1 text-muted-foreground text-xs">
                      <p><code className="bg-muted px-1 rounded">.*</code> - Any characters</p>
                      <p><code className="bg-muted px-1 rounded">^book</code> - Starts with "book"</p>
                      <p><code className="bg-muted px-1 rounded">freeze$</code> - Ends with "freeze"</p>
                      <p><code className="bg-muted px-1 rounded">[abc]</code> - Any of a, b, c</p>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Save Button */}
          <Popover open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1" disabled={!query.trim()}>
                <Save className="h-3 w-3" />
                Save
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 bg-popover" align="end">
              <div className="space-y-3">
                <p className="text-sm font-medium">Save Search Query</p>
                <Input
                  placeholder="Enter a name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} className="flex-1">
                    <Plus className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Saved Searches & Recent */}
        <div className="grid grid-cols-2 gap-4">
          {/* Saved Searches */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Star className="h-3 w-3" />
              Saved Searches
            </p>
            {savedSearches.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No saved searches yet</p>
            ) : (
              <ScrollArea className="h-24">
                <div className="space-y-1">
                  {savedSearches
                    .sort((a, b) => b.usageCount - a.usageCount)
                    .map((search) => (
                      <div 
                        key={search.id}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors group"
                      >
                        <button
                          className="flex-1 text-left text-xs truncate"
                          onClick={() => applySavedSearch(search)}
                        >
                          <span className="font-medium">{search.name}</span>
                          {search.isRegex && (
                            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                              regex
                            </Badge>
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(search.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Recent Searches */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <History className="h-3 w-3" />
              Recent Searches
            </p>
            {recentSearches.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No recent searches</p>
            ) : (
              <ScrollArea className="h-24">
                <div className="space-y-1">
                  {recentSearches.map((recent, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left text-xs p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors truncate"
                      onClick={() => {
                        setQuery(recent);
                        onSearch(recent, isRegex);
                      }}
                    >
                      {recent}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
