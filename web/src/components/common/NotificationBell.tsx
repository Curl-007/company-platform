import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchAuditLogs } from '../../features/audit/api';
import { RESOURCE_TYPE_LABELS, AUDIT_ACTION_LABELS, labelOf } from '../../constants/enums';
import type { AuditLogRecord } from '../../types';
import { getInterfaceLocale } from '../../i18n';
import i18n from '../../i18n';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return i18n.t('common.justNow');
  if (min < 60) return i18n.t('common.minutesAgo', { count: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return i18n.t('common.hoursAgo', { count: hour });
  return new Date(iso).toLocaleDateString(getInterfaceLocale());
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [seen, setSeen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAuditLogs()
      .then((data) => {
        setLogs(data.slice(0, 12));
        if (data.length > 0) setSeen(false);
      })
      .catch(() => {
        // 非关键失败，不打断页面
      });
  }, []);

  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleClick() {
    setOpen((prev) => !prev);
    setSeen(true);
  }

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="topbar-icon-button" onClick={handleClick} aria-label={t('common.notifications')}>
        <Bell size={18} />
        {!seen && logs.length > 0 && <span className="topbar-notification-dot" />}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">{t('common.recentActivity')}</div>
          {logs.length === 0 ? (
            <div className="notif-dropdown-empty">{t('common.noActivity')}</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="notif-item">
                <div className="notif-item-main">
                  <span className="font-medium">{log.actorName}</span>
                  <span className="text-secondary"> {labelOf(AUDIT_ACTION_LABELS, log.action)}</span>
                  <span className="text-secondary"> {labelOf(RESOURCE_TYPE_LABELS, log.resourceType)}</span>
                </div>
                <div className="notif-item-time text-secondary">{timeAgo(log.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
