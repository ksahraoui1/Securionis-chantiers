interface HistoryEntry {
  id: string;
  createdAt: string;
  senderName: string;
  sentTo: string[];
}

interface EmailHistoryProps {
  entries: HistoryEntry[];
}

export function EmailHistory({ entries }: EmailHistoryProps) {
  if (entries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-400 mt-6">
      <h2 className="text-lg font-semibold mb-3">
        Historique d&apos;envoi ({entries.length})
      </h2>
      <ul className="space-y-3">
        {entries.map((e) => (
          <li
            key={e.id}
            className="border-l-2 border-blue-200 pl-3 py-1 text-sm"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <span className="font-medium text-gray-900">
                {new Date(e.createdAt).toLocaleString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-xs text-gray-500">par {e.senderName}</span>
            </div>
            <div className="mt-1">
              <span className="text-xs text-gray-500">
                {e.sentTo.length} destinataire{e.sentTo.length > 1 ? "s" : ""} :
              </span>
              <ul className="mt-0.5 flex flex-wrap gap-1">
                {e.sentTo.map((email) => (
                  <li
                    key={email}
                    className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-700"
                  >
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
