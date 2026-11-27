'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchRequestStats } from '@/lib/api';
import { STATUSES, REASONS, RESOLUTIONS, STATUS_STYLES } from '@/lib/constants';
import StatusBadge from '@/components/StatusBadge';
import ErrorState from '@/components/ErrorState';
import {
  BarChart2,
  ArrowLeft,
  RotateCw,
  Inbox,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  ArrowUpRight,
} from 'lucide-react';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRequestStats();
      setStats(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={loadStats}
        title="Could not load analytics"
        description="We couldn't fetch the return desk metrics from the server."
      />
    );
  }

  const summary = stats?.summary || {};
  const totalRequests = summary.total_requests || 0;
  const activeRequests = summary.active_requests || 0;
  const decidedRequests = summary.decided_requests || 0;
  const approvedOrCompleted = summary.approved_or_completed || 0;
  const approvalRate = decidedRequests > 0 ? Math.round((approvedOrCompleted / decidedRequests) * 100) : 0;
  const totalRefunded = summary.total_refunded || 0;
  const totalUnits = summary.total_units || 0;

  // Map DB rows to lookup objects so every enum value is shown even if count is 0
  const statusCounts = Object.fromEntries(
    (stats?.byStatus || []).map((row) => [row.status, row.count])
  );
  const reasonCounts = Object.fromEntries(
    (stats?.byReason || []).map((row) => [row.reason, row.count])
  );
  const resolutionMap = Object.fromEntries(
    (stats?.byResolution || []).map((row) => [row.resolution, row])
  );

  const sortedReasons = [...REASONS].sort(
    (a, b) => (reasonCounts[b] || 0) - (reasonCounts[a] || 0)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Returns Analytics</h1>
            <p className="text-sm text-gray-500">
              Overview of return volume, status pipeline, reasons, and refund payouts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadStats}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/requests"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-black transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return Desk
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse space-y-3">
              <div className="h-3.5 w-24 bg-gray-200 rounded" />
              <div className="h-7 w-20 bg-gray-200 rounded" />
              <div className="h-3 w-32 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : totalRequests === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto">
            <Inbox className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-gray-900">No return requests yet</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Analytics will populate automatically once return requests are created or seeded.
          </p>
          <div className="pt-2">
            <Link
              href="/requests/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-xs font-semibold rounded-xl hover:bg-black transition-all"
            >
              Raise First Request
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                <span>Total Requests</span>
                <Package className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalRequests}</p>
              <p className="text-xs text-gray-500 mt-1">{totalUnits} total units returned</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                <span>Active Queue</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{activeRequests}</p>
              <p className="text-xs text-gray-500 mt-1">Open, In Review, or Approved</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                <span>Approval Rate</span>
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{approvalRate}%</p>
              <p className="text-xs text-gray-500 mt-1">
                {approvedOrCompleted} of {decidedRequests} decided
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                <span>Total Refunds Issued</span>
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRefunded)}</p>
              <p className="text-xs text-gray-500 mt-1">Approved &amp; Completed refunds</p>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Pipeline */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Requests by Status</h2>
                  <p className="text-xs text-gray-500">Click any status to filter the desk.</p>
                </div>
              </div>

              <div className="space-y-3.5">
                {STATUSES.map((status) => {
                  const count = statusCounts[status] || 0;
                  const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;
                  const style = STATUS_STYLES[status] || STATUS_STYLES['Open'];

                  return (
                    <Link
                      key={status}
                      href={`/requests?status=${encodeURIComponent(status)}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={status} />
                          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600 transition-colors" />
                        </div>
                        <span className="font-semibold text-gray-700">
                          {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${style.dot}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Return Reasons */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">Requests by Reason</h2>
                <p className="text-xs text-gray-500">Click any reason to inspect matching requests.</p>
              </div>

              <div className="space-y-3.5">
                {sortedReasons.map((reason) => {
                  const count = reasonCounts[reason] || 0;
                  const pct = totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0;

                  return (
                    <Link
                      key={reason}
                      href={`/requests?reason=${encodeURIComponent(reason)}`}
                      className="block group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                          {reason}
                          <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-600 transition-colors" />
                        </span>
                        <span className="font-semibold text-gray-700">
                          {count} <span className="text-gray-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-900 group-hover:bg-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Resolution Breakdown */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Resolution Outcomes</h2>
              <p className="text-xs text-gray-500">
                Breakdown across Approved and Completed requests.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {RESOLUTIONS.map((resName) => {
                const row = resolutionMap[resName] || { count: 0, total_amount: 0 };
                return (
                  <div
                    key={resName}
                    className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 flex flex-col justify-between gap-2"
                  >
                    <span className="text-xs font-semibold text-gray-600">{resName}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold text-gray-900">{row.count}</span>
                      {resName === 'Refund' && (
                        <span className="text-xs font-semibold text-green-700">
                          {formatCurrency(row.total_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
