import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAuditLogs,
  fetchAuditLog,
  searchAuditLogs,
  fetchAuditLogsByResource,
  fetchAuditLogsByUser,
  fetchAuditStats,
  exportAuditLogs,
  cleanupAuditLogs,
  fetchTeamMembers
} from '../services/api';

function getAuditUserLabel(log: any): string {
  return log.user?.name || log.user?.email || log.userName || 'Unknown user';
}

function getAuditResourceLabel(log: any): string {
  const details = log.details || {};
  const name =
    details.name ||
    details.invitedEmail ||
    details.deletedEmail ||
    details.url ||
    details.newTier;

  if (name) {
    return `${log.resourceType}: ${name}`;
  }

  return log.resourceType || 'Unknown resource';
}

function AuditLogDetailView({ log }: { log: any }) {
  const details = log.details;

  return (
    <dl className="space-y-4">
      <div>
        <dt className="text-sm text-gray-500">Action</dt>
        <dd className="font-medium">{log.action}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-500">User</dt>
        <dd className="font-medium">{getAuditUserLabel(log)}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-500">Resource</dt>
        <dd className="font-medium">{getAuditResourceLabel(log)}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-500">IP Address</dt>
        <dd className="font-medium">{log.ipAddress || 'N/A'}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-500">User Agent</dt>
        <dd className="font-mono text-sm break-all">{log.userAgent || 'N/A'}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-500">Timestamp</dt>
        <dd className="font-medium">{new Date(log.createdAt).toLocaleString()}</dd>
      </div>
      {details && Object.keys(details).length > 0 && (
        <div>
          <dt className="text-sm text-gray-500">Details</dt>
          <dd className="font-mono text-sm bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
            <pre>{JSON.stringify(details, null, 2)}</pre>
          </dd>
        </div>
      )}
    </dl>
  );
}

export default function AuditLogs() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'resource' | 'user'>('all');
  const [filterResourceType, setFilterResourceType] = useState('');
  const [filterResourceId, setFilterResourceId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(90);

  // Intentional flaw: Search doesn't debounce input
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['auditLogs', searchQuery, filterType, filterResourceType, filterResourceId, filterUserId],
    queryFn: async () => {
      if (searchQuery) {
        return searchAuditLogs(searchQuery);
      }
      if (filterType === 'resource' && filterResourceType && filterResourceId) {
        return fetchAuditLogsByResource(filterResourceType, filterResourceId);
      }
      if (filterType === 'user' && filterUserId) {
        return fetchAuditLogsByUser(filterUserId);
      }
      return fetchAuditLogs();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['auditStats'],
    queryFn: fetchAuditStats,
  });

  const { data: members } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: fetchTeamMembers,
  });

  const { data: logDetail } = useQuery({
    queryKey: ['auditLog', selectedLog?.id],
    queryFn: () => fetchAuditLog(selectedLog!.id),
    enabled: !!selectedLog?.id,
  });

  const cleanupMutation = useMutation({
    mutationFn: cleanupAuditLogs,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
      queryClient.invalidateQueries({ queryKey: ['auditStats'] });
      setShowCleanupModal(false);
      alert(`Cleaned up ${data.deletedCount} old logs`);
    },
  });

  const handleExport = async () => {
    // Intentional flaw: Loads all data into memory before download
    const data = await exportAuditLogs({
      startDate: '',
      endDate: '',
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCleanup = () => {
    cleanupMutation.mutate(cleanupDays);
  };

  const resourceTypes = ['dashboard', 'widget', 'user', 'organization', 'webhook', 'api_key'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading audit logs...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Export
          </button>
          <button
            onClick={() => setShowCleanupModal(true)}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50"
          >
            Cleanup
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{stats.totalLogs?.toLocaleString() || 0}</div>
            <div className="text-sm text-gray-500">Total Logs</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{stats.todayLogs?.toLocaleString() || 0}</div>
            <div className="text-sm text-gray-500">Today</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{stats.weekLogs?.toLocaleString() || 0}</div>
            <div className="text-sm text-gray-500">This Week</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{stats.uniqueUsers || 0}</div>
            <div className="text-sm text-gray-500">Active Users</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search - Intentional flaw: no debounce */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Filter type */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Logs</option>
              <option value="resource">By Resource</option>
              <option value="user">By User</option>
            </select>
          </div>

          {/* Resource filter */}
          {filterType === 'resource' && (
            <>
              <select
                value={filterResourceType}
                onChange={(e) => setFilterResourceType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select type</option>
                {resourceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={filterResourceId}
                onChange={(e) => setFilterResourceId(e.target.value)}
                placeholder="Resource ID"
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </>
          )}

          {/* User filter */}
          {filterType === 'user' && (
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select user</option>
              {members?.map((member: any) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Logs table */}
      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4">Action</th>
                <th className="text-left py-3 px-4">User</th>
                <th className="text-left py-3 px-4">Resource</th>
                <th className="text-left py-3 px-4">IP Address</th>
                <th className="text-left py-3 px-4">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log: any) => (
                <tr
                  key={log.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        log.action.includes('delete')
                          ? 'bg-red-100 text-red-800'
                          : log.action.includes('create')
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4">{getAuditUserLabel(log)}</td>
                  <td className="py-3 px-4">{getAuditResourceLabel(log)}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">{log.ipAddress}</td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Audit Log Details</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <AuditLogDetailView log={logDetail || selectedLog} />
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold text-red-600">Cleanup Old Logs</h2>
            </div>
            <div className="p-4">
              <p className="text-gray-600 mb-4">
                Delete audit logs older than the specified number of days. This action cannot be undone.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delete logs older than
                </label>
                <select
                  value={cleanupDays}
                  onChange={(e) => setCleanupDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCleanupModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCleanup}
                  disabled={cleanupMutation.isPending}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {cleanupMutation.isPending ? 'Cleaning...' : 'Cleanup Logs'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
