import { useEffect, useMemo, useState } from 'react';
import LiveAnalytics from './LiveAnalytics';
import { API_BASE_URL, authFetch, readAccessToken } from './apiClient';

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
        setError('Authentication token missing. Sign in again as professor.');
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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-slate-100 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">📁 Assessment Vault & History</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Professor archives</h2>
          <p className="mt-1 text-sm text-slate-400">Audit completed assessments, final analytics states, and historical submissions.</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading archive vault...</p> : null}
      {error ? <p className="text-sm text-rose-300 mb-4">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[760px] text-left">
          <thead className="bg-slate-950/80">
            <tr>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Quiz Title</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Access Code</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Status</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Date Conducted</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Submissions</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">AI Summary Cache</th>
              <th className="px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.length ? historyRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-800 bg-slate-900/70">
                <td className="px-4 py-3 text-sm font-semibold text-slate-100">{row.title}</td>
                <td className="px-4 py-3 text-sm text-slate-300 font-mono">{row.access_code || 'N/A'}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{row.status || 'UNKNOWN'}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                    {row.total_submissions} submissions
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">{row.has_ai_summary_cached ? 'Cached' : 'Not Cached'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLaunchQuiz?.(row)}
                      className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-200 transition-all hover:bg-cyan-500/20"
                    >
                      ▶ Start Live Session
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQuiz(row)}
                      className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-200 transition-all hover:bg-violet-500/20"
                    >
                      🔍 Open Archives
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-4 py-5 text-sm text-slate-400 bg-slate-900/70">No historical quizzes found for this professor account yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedQuiz ? (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedQuiz(null)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition-all hover:border-rose-400/50 hover:text-rose-300"
              >
                Close Archive
              </button>
            </div>
            <LiveAnalytics
              quizId={selectedQuiz.id}
              accessCode={selectedQuiz.access_code || ''}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
