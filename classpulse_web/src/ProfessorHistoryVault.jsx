import { useEffect, useMemo, useState } from 'react';
import { Play, Search } from 'lucide-react';
import LiveAnalytics from './LiveAnalytics';
import { API_BASE_URL, authFetch, readAccessToken } from './apiClient';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Spinner } from './components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';

function formatDate(value) {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
}

export default function ProfessorHistoryVault({ onLaunchQuiz }) {
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  const authToken = useMemo(() => readAccessToken(), []);

  useEffect(() => {
    const loadHistory = async () => {
      if (!authToken) {
        setError('You are signed out. Please sign in again as instructor.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await authFetch(`${API_BASE_URL}/api/professor/quizzes/history/`);

        const payload = await response.json().catch(() => ({}));
        const isEmptyPayload = !payload || Object.keys(payload).length === 0;

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            setHistoryRows([]);
            setError('Session expired. Please sign in again to load assessment history.');
            return;
          }

          throw new Error(payload?.error || 'Unable to load assessment history.');
        }

        if (isEmptyPayload) {
          setHistoryRows([]);
          setError('');
          return;
        }

        setHistoryRows(Array.isArray(payload?.history) ? payload.history : []);
      } catch (fetchError) {
        const statusCode = Number(fetchError?.status || fetchError?.response?.status || 0);
        if (statusCode === 401 || statusCode === 403) {
          setHistoryRows([]);
          setError('Session expired. Please sign in again to load assessment history.');
          return;
        }

        setError(fetchError.message || 'Unable to load assessment history.');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [authToken]);

  return (
    <div className="rounded-2xl border border-border bg-card/90 p-6 text-foreground shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">📁 Quiz History</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Instructor history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review past quizzes, results, and class responses.</p>
        </div>
      </div>

      {loading ? (
        <div className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner label="Loading history" />
          <span>Loading history...</span>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-300 mb-4">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <Table className="min-w-[760px] text-left">
          <TableHeader className="bg-background/80">
            <TableRow>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Quiz Title</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Access Code</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Status</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Date</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Submissions</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Saved AI Summary</TableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-[0.2em]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyRows.length ? historyRows.map((row) => (
              <TableRow key={row.id} className="bg-card/70">
                <TableCell className="px-4 py-3 text-sm font-semibold">{row.title}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground font-mono">{row.access_code || 'N/A'}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{row.status || 'UNKNOWN'}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{formatDate(row.created_at)}</TableCell>
                <TableCell className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-200">
                    {row.total_submissions} submissions
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{row.has_ai_summary_cached ? 'Saved' : 'Not saved'}</TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => onLaunchQuiz?.(row)}
                      variant="outline"
                      size="sm"
                      className="border-cyan-500/50 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-200"
                    >
                      <Play className="size-4" /> Start Live Session
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setSelectedQuiz(row)}
                      variant="outline"
                      size="sm"
                      className="border-violet-500/50 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 dark:text-violet-200"
                    >
                      <Search className="size-4" /> Open History
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-5 text-sm text-muted-foreground bg-card/70">No past quizzes found for this instructor account yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selectedQuiz)} onOpenChange={(open) => { if (!open) setSelectedQuiz(null); }}>
        <DialogContent className="max-w-[95vw] h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quiz History Analytics</DialogTitle>
          </DialogHeader>
          {selectedQuiz ? (
            <LiveAnalytics
              quizId={selectedQuiz.id}
              accessCode={selectedQuiz.access_code || ''}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
