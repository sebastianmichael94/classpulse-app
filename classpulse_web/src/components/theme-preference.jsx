import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function ThemePreference() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const resolvedLabel = resolvedTheme === 'dark' ? 'Dark' : 'Light';

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="hidden sm:inline-flex">
        Active: {resolvedLabel}
      </Badge>
      <Select value={theme || 'system'} onValueChange={setTheme}>
        <SelectTrigger className="h-9 w-[138px]">
          <SelectValue placeholder="Theme" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">
            <span className="inline-flex items-center gap-2"><Monitor className="size-4" /> System</span>
          </SelectItem>
          <SelectItem value="light">
            <span className="inline-flex items-center gap-2"><Sun className="size-4" /> Light</span>
          </SelectItem>
          <SelectItem value="dark">
            <span className="inline-flex items-center gap-2"><Moon className="size-4" /> Dark</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
