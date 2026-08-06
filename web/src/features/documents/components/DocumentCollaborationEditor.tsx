import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { getToken } from '../../../services/api';
import type { Document } from '../../../types';
import {
  resolveCollaborationSaveAck,
  type PendingCollaborationSave,
} from '../collaborationState';

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
  preserveLocalDraft?: boolean;
  clientMutationId?: string;
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
  const pendingSaveRef = useRef<PendingCollaborationSave | null>(null);
  const serverSnapshotRef = useRef<{ content: string; revision: number } | null>(null);
  const revisionRef = useRef(Number(doc.collabRevision) || 0);
  const [content, setContent] = useState(doc.content ?? '');
  const [revision, setRevision] = useState(Number(doc.collabRevision) || 0);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [serverSnapshot, setServerSnapshot] = useState<{ content: string; revision: number } | null>(null);

  function updateContent(value: string) {
    dirtyRef.current = true;
    contentRef.current = value;
    setStatus((current) => (current === 'saved' ? 'connected' : current));
    setContent(value);
  }

  // Tiptap editor for a richer editing surface. The collab protocol still
  // exchanges plain text, so we serialize with getText() and rehydrate with
  // setContent() so remote updates stay compatible with the existing backend.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: doc.content ?? '',
    editorProps: {
      attributes: {
        class: 'collab-editor-prose form-textarea',
        'data-slot': 'collab-editor',
        'aria-label': '文档正文',
      },
    },
    onUpdate: ({ editor: current }) => {
      updateContent(current.getText({ blockSeparator: '\n' }));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: '\n' });
    if (current === content) return;
    // Programmatic remote/server updates must not re-fire onUpdate dirty flags.
    editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

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
    setServerSnapshot(null);
    serverSnapshotRef.current = null;
    pendingSaveRef.current = null;

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
        // Initial snapshot only seeds a clean editor; never clobber an unsaved local draft.
        if (dirtyRef.current) {
          const snapshot = { content: nextContent, revision: nextRevision };
          serverSnapshotRef.current = snapshot;
          setServerSnapshot(snapshot);
          setMessage('服务器有更新正文。本地草稿已保留，可选择采用服务器版本或继续编辑后保存。');
          setStatus('conflict');
          return;
        }
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
        const pending = pendingSaveRef.current;
        const resolved = resolveCollaborationSaveAck(
          pending,
          contentRef.current,
          payload,
          revisionRef.current,
          serverSnapshotRef.current?.revision,
        );
        if (!resolved) return;
        const nextRevision = resolved.revision;
        pendingSaveRef.current = null;
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        onSaved(resolved.savedContent, nextRevision);
        if (!resolved.draftIsDirty) {
          dirtyRef.current = false;
          setStatus('saved');
          setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          setMessage('正文已保存，其他在线编辑者会收到更新。');
          serverSnapshotRef.current = null;
          setServerSnapshot(null);
        } else {
          dirtyRef.current = true;
          if (serverSnapshotRef.current && serverSnapshotRef.current.revision > nextRevision) {
            setStatus('conflict');
            setMessage('本地保存已确认，但服务器还有更新版本；本地草稿与服务器版本均已保留。');
          } else {
            setStatus('connected');
            setMessage('收到保存确认，但本地已有更新内容，请再次保存。');
          }
        }
        return;
      }
      if (payload.type === 'update') {
        const nextRevision = Number(payload.revision) || revisionRef.current;
        if (dirtyRef.current) {
          // Remote update must not overwrite local draft.
          const snapshot = { content: payload.content ?? '', revision: nextRevision };
          serverSnapshotRef.current = snapshot;
          setServerSnapshot(snapshot);
          setMessage('其他人刚刚更新了正文。本地草稿已保留；保存可能触发冲突，可先对比服务器版本。');
          setStatus('conflict');
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
        const pending = pendingSaveRef.current;
        if (payload.clientMutationId && pending && payload.clientMutationId !== pending.clientMutationId) return;
        const latest = payload.content ?? '';
        const nextRevision = Number(payload.revision) || revisionRef.current;
        pendingSaveRef.current = null;
        const snapshot = { content: latest, revision: nextRevision };
        serverSnapshotRef.current = snapshot;
        setServerSnapshot(snapshot);
        dirtyRef.current = true;
        setStatus('conflict');
        setMessage('保存时发现版本冲突。本地草稿已保留，请先采用服务器版本或合并后再保存。');
        return;
      }
      if (payload.type === 'error') {
        const pending = pendingSaveRef.current;
        if (payload.clientMutationId && pending && payload.clientMutationId !== pending.clientMutationId) return;
        pendingSaveRef.current = null;
        setStatus(socketRef.current?.readyState === WebSocket.OPEN ? 'connected' : 'error');
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

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  function save() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('error');
      setMessage('协同通道未连接，暂时不能保存。');
      return;
    }
    if (serverSnapshotRef.current) {
      setStatus('conflict');
      setMessage('请先处理服务器版本与本地草稿的冲突。');
      return;
    }
    const clientMutationId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingSave: PendingCollaborationSave = {
      clientMutationId,
      content: contentRef.current,
      baseRevision: revisionRef.current,
    };
    pendingSaveRef.current = pendingSave;
    setStatus('saving');
    setMessage(null);
    socket.send(JSON.stringify({
      type: 'update',
      content: pendingSave.content,
      baseRevision: pendingSave.baseRevision,
      clientMutationId: pendingSave.clientMutationId,
    }));
  }

  function adoptServerVersion() {
    if (!serverSnapshot) return;
    contentRef.current = serverSnapshot.content;
    revisionRef.current = serverSnapshot.revision;
    setContent(serverSnapshot.content);
    setRevision(serverSnapshot.revision);
    dirtyRef.current = false;
    pendingSaveRef.current = null;
    serverSnapshotRef.current = null;
    setServerSnapshot(null);
    setStatus('connected');
    setMessage('已采用服务器最新正文。');
    onSaved(serverSnapshot.content, serverSnapshot.revision);
  }

  function keepLocalDraft() {
    if (!serverSnapshot) return;
    revisionRef.current = serverSnapshot.revision;
    setRevision(serverSnapshot.revision);
    pendingSaveRef.current = null;
    serverSnapshotRef.current = null;
    setServerSnapshot(null);
    dirtyRef.current = true;
    setStatus('connected');
    setMessage('本地草稿已保留，可基于服务器最新 revision 再次保存。');
  }

  function requestClose() {
    if (dirtyRef.current) {
      const confirmed = window.confirm('正文尚未保存，确定关闭并丢弃本地修改？');
      if (!confirmed) return;
    }
    onClose();
  }

  return (
    <Overlay onClose={requestClose}>
      <Panel
        title="协同编辑正文"
        subtitle={`${doc.title} · revision ${revision}${lastSavedAt ? ` · 上次保存 ${lastSavedAt}` : ''}${dirtyRef.current ? ' · 未保存' : ''}`}
        toolbar={(
          <div className="collab-toolbar">
            <span className="collab-presence">{formatPresence(peers)}</span>
            <StatusBadge label={collabStatusText(status)} variant={status === 'error' || status === 'conflict' ? 'warning' : status === 'saved' ? 'success' : 'info'} />
          </div>
        )}
      >
        {message ? <div className={status === 'error' || status === 'conflict' ? 'form-error' : 'form-help-text'} style={{ marginBottom: 10 }}>{message}</div> : null}
        {serverSnapshot ? (
          <div className="form-help-text" style={{ marginBottom: 10 }}>
            服务器 revision {serverSnapshot.revision} 与本地草稿并存。
            <button type="button" className="btn btn-text btn-xs" onClick={adoptServerVersion}>采用服务器版本</button>
            <button type="button" className="btn btn-text btn-xs" onClick={keepLocalDraft}>保留本地继续</button>
            <details>
              <summary>服务器正文</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{serverSnapshot.content}</pre>
            </details>
          </div>
        ) : null}
        <div className="form-group">
          <label className="form-label">文档正文</label>
          <div className="collab-editor-toolbar" role="toolbar" aria-label="格式工具栏">
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('bold') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor}
            >
              粗体
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('italic') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor}
            >
              斜体
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('bulletList') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={!editor}
            >
              列表
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              disabled={!editor}
            >
              标题
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('codeBlock') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              disabled={!editor}
            >
              代码块
            </button>
          </div>
          <div className="collab-editor-surface">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="form-textarea collab-editor-fallback" aria-busy="true">编辑器加载中…</div>
            )}
          </div>
          <div className="form-help-text">
            保存使用服务器 revision 做冲突检测；顶部会显示当前在线人数与最近保存时间。冲突与远端更新不会覆盖本地未保存草稿。协同通道仍以纯文本同步，格式工具仅增强本地编辑体验。
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={requestClose}>关闭</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={status === 'connecting' || status === 'saving' || status === 'conflict' || status === 'error' || status === 'closed' || Boolean(serverSnapshot)}>
            {status === 'saving' ? '保存中...' : '保存并广播'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
