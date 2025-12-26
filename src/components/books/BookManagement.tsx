import { useState } from 'react';
import { useBooks, useCreateBook, useUpdateBook, useDeleteBook, Book } from '@/hooks/useBooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Loader2, DollarSign, TrendingUp, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const bookTypeColors: Record<string, string> = {
  HEDGE: 'bg-chart-1/20 text-chart-1',
  PROP: 'bg-chart-2/20 text-chart-2',
  MEME: 'bg-chart-3/20 text-chart-3',
};

interface BookFormData {
  name: string;
  type: 'HEDGE' | 'PROP' | 'MEME';
  capital_allocated: number;
  max_drawdown_limit: number;
  risk_tier: number;
}

const initialFormData: BookFormData = {
  name: '',
  type: 'PROP',
  capital_allocated: 0,
  max_drawdown_limit: 10,
  risk_tier: 1,
};

export function BookManagement() {
  const { data: books = [], isLoading } = useBooks();
  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [formData, setFormData] = useState<BookFormData>(initialFormData);

  const handleCreate = async () => {
    await createBook.mutateAsync(formData);
    setIsCreateOpen(false);
    setFormData(initialFormData);
  };

  const handleUpdate = async () => {
    if (!editingBook) return;
    await updateBook.mutateAsync({ id: editingBook.id, ...formData });
    setEditingBook(null);
    setFormData(initialFormData);
  };

  const handleDelete = async (id: string) => {
    await deleteBook.mutateAsync(id);
  };

  const openEditDialog = (book: Book) => {
    setEditingBook(book);
    setFormData({
      name: book.name,
      type: book.type as 'HEDGE' | 'PROP' | 'MEME',
      capital_allocated: Number(book.capital_allocated),
      max_drawdown_limit: Number(book.max_drawdown_limit),
      risk_tier: book.risk_tier,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Trading Books</h2>
          <p className="text-muted-foreground text-sm">Manage capital allocation and risk limits</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Book
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Trading Book</DialogTitle>
              <DialogDescription>Add a new trading book with capital allocation and risk parameters</DialogDescription>
            </DialogHeader>
            <BookForm formData={formData} setFormData={setFormData} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createBook.isPending}>
                {createBook.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Book
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Books grid */}
      {books.length === 0 ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold mb-2">No Trading Books</h3>
          <p className="text-muted-foreground text-sm mb-4">Create your first trading book to start managing positions</p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Book
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => (
            <div key={book.id} className="glass-panel rounded-xl p-5 transition-all hover:border-primary/30">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold">{book.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', bookTypeColors[book.type])}>
                      {book.type}
                    </span>
                    <Badge variant={book.status === 'active' ? 'default' : 'destructive'}>
                      {book.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEditDialog(book)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Book</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{book.name}"? This will also delete all associated positions and strategies.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(book.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Capital
                  </span>
                  <span className="font-mono font-medium">
                    ${Number(book.capital_allocated).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Exposure
                  </span>
                  <span className="font-mono font-medium">
                    ${Number(book.current_exposure).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Max DD
                  </span>
                  <span className="font-mono font-medium text-destructive">
                    -{Number(book.max_drawdown_limit)}%
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Risk Tier {book.risk_tier}</span>
                  <span>
                    {Number(book.current_exposure) > 0 && Number(book.capital_allocated) > 0
                      ? `${((Number(book.current_exposure) / Number(book.capital_allocated)) * 100).toFixed(1)}% utilized`
                      : '0% utilized'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingBook} onOpenChange={(open) => !open && setEditingBook(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Trading Book</DialogTitle>
            <DialogDescription>Update book parameters and risk limits</DialogDescription>
          </DialogHeader>
          <BookForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBook(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateBook.isPending}>
              {updateBook.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookForm({ 
  formData, 
  setFormData 
}: { 
  formData: BookFormData; 
  setFormData: React.Dispatch<React.SetStateAction<BookFormData>>;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Book Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Main Prop Book"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type">Book Type</Label>
        <Select
          value={formData.type}
          onValueChange={(value: 'HEDGE' | 'PROP' | 'MEME') => setFormData(prev => ({ ...prev, type: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HEDGE">Hedge</SelectItem>
            <SelectItem value="PROP">Prop Trading</SelectItem>
            <SelectItem value="MEME">Meme/Speculative</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="capital">Capital Allocated ($)</Label>
          <Input
            id="capital"
            type="number"
            value={formData.capital_allocated}
            onChange={(e) => setFormData(prev => ({ ...prev, capital_allocated: Number(e.target.value) }))}
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxdd">Max Drawdown (%)</Label>
          <Input
            id="maxdd"
            type="number"
            value={formData.max_drawdown_limit}
            onChange={(e) => setFormData(prev => ({ ...prev, max_drawdown_limit: Number(e.target.value) }))}
            min={1}
            max={100}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="risktier">Risk Tier (1-5)</Label>
        <Select
          value={formData.risk_tier.toString()}
          onValueChange={(value) => setFormData(prev => ({ ...prev, risk_tier: Number(value) }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select risk tier" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((tier) => (
              <SelectItem key={tier} value={tier.toString()}>
                Tier {tier} {tier === 1 ? '(Conservative)' : tier === 5 ? '(Aggressive)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
