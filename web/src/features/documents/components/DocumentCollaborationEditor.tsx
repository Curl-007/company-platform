import { useEffect, useRef, useState } from 'react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { getToken } from '../../../services/api';
import type { Document } from '../../../types';

type CollabStatus = 'connecting' | 'connected' | 'saving' | 'saved' | 'conflict' | 'error' | 'closed';

interface CollabPeer {
  id?: string;
  name?: string;
}

interface CollabMessage {
  type?: string;
  documentId?: string;
  content?: string;
  revision?: number;
  code?: string;
  message?: string;
  peers?: CollabPeer[];
  count?: number;
}

function collabStatusText(status: CollabStatus) {
  if (status === 'connecting') return '正在连接协同通道';
  if (status === 'connected') return '已连接';
  if (status === 'saving') return '保存中';
  if (status === 'saved') return '已保存';
  if (status === 'conflict') return '存在版本冲突';
  if (status === 'error') return '连接异常';
  return '已关闭';
}

function formatPresence(peers: CollabPeer[]) {
  if (!peers.length) return '仅自己在线';
  if (peers.length === 1) return `在线 1 人 · ${peers[0]?.name || peers[0]?.id || '用户'}`;
  const names = peers.slice(0, 3).map((peer) => peer.name || peer.id || '用户').join('、');
  const extra = peers.length > 3 ? ` 等 ${peers.length} 人` : '';
  return `在线 ${peers.length} 人 · ${names}${extra}`;
}

function buildCollaborationUrl(documentId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ documentId });
  return `${protocol}//${window.location.host}/ws/collab?${params.toString()}`;
}

export default function DocumentCollaborationEditor({
  document: doc,
  onClose,
  onSaved,
}: {
  document: Document;
  onClose: () => void;
  onSaved: (content: string, revision: number) => void;
}) {
  const socketRef = useRef<WebSocket | null>(null);
  const dirtyRef = useRef(false);
  const contentRef = useRef(doc.content ?? '');
  const revisionRef = useRef(Number(doc.collabRevision) || 0);
  const [content, setContent] = useState(doc.content ?? '');
  const [revision, setRevision] = useState(Number(doc.collabRevision) || 0);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('error');
      setMessage('登录态已失效，请重新登录后再编辑。');
      return;
    }

    const socket = new WebSocket(buildCollaborationUrl(doc.id), ['pm.jwt', token]);
    socketRef.current = socket;
    setStatus('connecting');
    setMessage(null);
    setPeers([]);
    setLastSavedAt(null);

    socket.onopen = () => {
      setStatus('connected');
    };
    socket.onmessage = (event) => {
      let payload: CollabMessage;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (Array.isArray(payload.peers)) {
        setPeers(payload.peers);
      }
      if (payload.type === 'presence') {
        setPeers(Array.isArray(payload.peers) ? payload.peers : []);
        return;
      }
      if (payload.type === 'snapshot') {
        const nextContent = payload.content ?? '';
        const nextRevision = Number(payload.revision) || 0;
        contentRef.current = nextContent;
        revisionRef.current = nextRevision;
        setContent(nextContent);
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('connected');
        setMessage(null);
        return;
      }
      if (payload.type === 'saved') {
        const nextRevision = Number(payload.revision) || revisionRef.current + 1;
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setMessage('正文已保存，其他在线编辑者会收到更新。');
        onSaved(contentRef.current, nextRevision);
        return;
      }
      if (payload.type === 'update') {
        const nextRevision = Number(payload.revision) || revisionRef.current;
        if (dirtyRef.current) {
          setMessage('其他人刚刚更新了正文。请先保存，若版本冲突会自动切换到服务器最新内容。');
          return;
        }
        const nextContent = payload.content ?? '';
        contentRef.current = nextContent;
        revisionRef.current = nextRevision;
        setContent(nextContent);
        setRevision(nextRevision);
        setStatus('connected');
        setMessage('已同步其他编辑者的最新正文。');
        onSaved(nextContent, nextRevision);
        return;
      }
      if (payload.type === 'conflict') {
        const latest = payload.content ?? '';
        const nextRevision = Number(payload.revision) || revisionRef.current;
        contentRef.current = latest;
        revisionRef.current = nextRevision;
        setContent(latest);
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('conflict');
        setMessage('保存时发现版本冲突，已切换为服务器最新正文，请确认后再次编辑。');
        onSaved(latest, nextRevision);
        return;
      }
      if (payload.type === 'error') {
        setStatus('error');
        setMessage(payload.message || payload.code || '协同编辑发生错误。');
      }
    };
    socket.onerror = () => {
      setStatus('error');
      setMessage('协同通道连接失败，请确认后端服务仍在运行。');
    };
    socket.onclose = () => {
      setStatus((current) => current === 'error' ? current : 'closed');
      setPeers([]);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [doc.id]);

  function updateContent(value: string) {
    dirtyRef.current = true;
    contentRef.current = value;
    setStatus((current) => current === 'saved' ? 'connected' : current);
    setContent(value);
  }

  function save() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('error');
      setMessage('协同通道未连接，暂时不能保存。');
      return;
    }
    setStatus('saving');
    setMessage(null);
    socket.send(JSON.stringify({ type: 'update', content: contentRef.current, baseRevision: revisionRef.current }));
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title="协同编辑正文"
        subtitle={`${doc.title} · revision ${revision}${lastSavedAt ? ` · 上次保存 ${lastSavedAt}` : ''}`}
        toolbar={(
          <div className="collab-toolbar">
            <span className="collab-presence">{formatPresence(peers)}</span>
            <StatusBadge label={collabStatusText(status)} variant={status === 'error' || status === 'conflict' ? 'warning' : status === 'saved' ? 'success' : 'info'} />
          </div>
        )}
      >
        {message ? <div className={status === 'error' || status === 'conflict' ? 'form-error' : 'form-help-text'} style={{ marginBottom: 10 }}>{message}</div> : null}
        <div className="form-group">
          <label className="form-label">文档正文</label>
          <textarea
            className="form-textarea"
            rows={16}
            value={content}
            onChange={(event) => updateContent(event.target.value)}
            placeholder="在这里编辑文档正文；保存后会广播给同一文档的在线编辑者。"
          />
          <div className="form-help-text">
            保存使用服务器 revision 做冲突检测；顶部会显示当前在线人数与最近保存时间。若别人先保存，会提示冲突并刷新为最新内容。
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={status === 'connecting' || status === 'saving' || status === 'error' || status === 'closed'}>
            {status === 'saving' ? '保存中...' : '保存并广播'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
