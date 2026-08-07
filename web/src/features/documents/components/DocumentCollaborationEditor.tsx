import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getInterfaceLocale, default as i18n } from '../../../i18n';

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
  if (status === 'connecting') return i18n.t('features.documents.documentCollaborationEditor.statusConnecting');
  if (status === 'connected') return i18n.t('features.documents.documentCollaborationEditor.statusConnected');
  if (status === 'saving') return i18n.t('features.documents.documentCollaborationEditor.statusSaving');
  if (status === 'saved') return i18n.t('features.documents.documentCollaborationEditor.statusSaved');
  if (status === 'conflict') return i18n.t('features.documents.documentCollaborationEditor.statusConflict');
  if (status === 'error') return i18n.t('features.documents.documentCollaborationEditor.statusError');
  return i18n.t('features.documents.documentCollaborationEditor.statusClosed');
}

function formatPresence(peers: CollabPeer[]) {
  if (!peers.length) return i18n.t('features.documents.documentCollaborationEditor.onlySelfOnline');
  if (peers.length === 1) {
    const first = peers[0]?.name || peers[0]?.id || i18n.t('features.documents.documentCollaborationEditor.user');
    return i18n.t('features.documents.documentCollaborationEditor.oneOnline', { name: first });
  }
  const nameSeparator = i18n.t('features.documents.documentCollaborationEditor.nameSeparator');
  const names = peers.slice(0, 3).map((peer) => peer.name || peer.id || i18n.t('features.documents.documentCollaborationEditor.user')).join(nameSeparator);
  const extra = peers.length > 3 ? i18n.t('features.documents.documentCollaborationEditor.morePeople', { count: peers.length }) : '';
  return i18n.t('features.documents.documentCollaborationEditor.onlineCount', { count: peers.length, names, extra });
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
  const { t } = useTranslation();
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
        'aria-label': t('features.documents.documentCollaborationEditor.documentBody'),
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
      setMessage(t('features.documents.documentCollaborationEditor.sessionExpired'));
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
          setMessage(t('features.documents.documentCollaborationEditor.serverUpdateConflict'));
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
          setLastSavedAt(new Date().toLocaleTimeString(getInterfaceLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          setMessage(t('features.documents.documentCollaborationEditor.bodySaved'));
          serverSnapshotRef.current = null;
          setServerSnapshot(null);
        } else {
          dirtyRef.current = true;
          if (serverSnapshotRef.current && serverSnapshotRef.current.revision > nextRevision) {
            setStatus('conflict');
            setMessage(t('features.documents.documentCollaborationEditor.savedButServerNewer'));
          } else {
            setStatus('connected');
            setMessage(t('features.documents.documentCollaborationEditor.savedButDirty'));
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
          setMessage(t('features.documents.documentCollaborationEditor.remoteUpdateConflict'));
          setStatus('conflict');
          return;
        }
        const nextContent = payload.content ?? '';
        contentRef.current = nextContent;
        revisionRef.current = nextRevision;
        setContent(nextContent);
        setRevision(nextRevision);
        setStatus('connected');
        setMessage(t('features.documents.documentCollaborationEditor.syncedRemote'));
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
        setMessage(t('features.documents.documentCollaborationEditor.saveConflict'));
        return;
      }
      if (payload.type === 'error') {
        const pending = pendingSaveRef.current;
        if (payload.clientMutationId && pending && payload.clientMutationId !== pending.clientMutationId) return;
        pendingSaveRef.current = null;
        setStatus(socketRef.current?.readyState === WebSocket.OPEN ? 'connected' : 'error');
        setMessage(payload.message || payload.code || t('features.documents.documentCollaborationEditor.collabError'));
      }
    };
    socket.onerror = () => {
      setStatus('error');
      setMessage(t('features.documents.documentCollaborationEditor.connectionFailed'));
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
      setMessage(t('features.documents.documentCollaborationEditor.notConnectedSave'));
      return;
    }
    if (serverSnapshotRef.current) {
      setStatus('conflict');
      setMessage(t('features.documents.documentCollaborationEditor.resolveConflictFirst'));
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
    setMessage(t('features.documents.documentCollaborationEditor.adoptedServer'));
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
    setMessage(t('features.documents.documentCollaborationEditor.keptLocalDraft'));
  }

  function requestClose() {
    if (dirtyRef.current) {
      const confirmed = window.confirm(t('features.documents.documentCollaborationEditor.unsavedCloseConfirm'));
      if (!confirmed) return;
    }
    onClose();
  }

  return (
    <Overlay onClose={requestClose}>
      <Panel
        title={t('features.documents.documentCollaborationEditor.panelTitle')}
        subtitle={`${doc.title} · ${t('features.documents.documentCollaborationEditor.subtitleRevision', { revision })}${lastSavedAt ? ` · ${t('features.documents.documentCollaborationEditor.subtitleLastSaved', { time: lastSavedAt })}` : ''}${dirtyRef.current ? ` · ${t('features.documents.documentCollaborationEditor.subtitleUnsaved')}` : ''}`}
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
            {t('features.documents.documentCollaborationEditor.serverAndLocalCoexist', { revision: serverSnapshot.revision })}
            <button type="button" className="btn btn-text btn-xs" onClick={adoptServerVersion}>{t('features.documents.documentCollaborationEditor.adoptServerVersion')}</button>
            <button type="button" className="btn btn-text btn-xs" onClick={keepLocalDraft}>{t('features.documents.documentCollaborationEditor.keepLocal')}</button>
            <details>
              <summary>{t('features.documents.documentCollaborationEditor.serverBody')}</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{serverSnapshot.content}</pre>
            </details>
          </div>
        ) : null}
        <div className="form-group">
          <label className="form-label">{t('features.documents.documentCollaborationEditor.documentBody')}</label>
          <div className="collab-editor-toolbar" role="toolbar" aria-label={t('features.documents.documentCollaborationEditor.formatToolbar')}>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('bold') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor}
            >
              {t('features.documents.documentCollaborationEditor.bold')}
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('italic') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor}
            >
              {t('features.documents.documentCollaborationEditor.italic')}
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('bulletList') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={!editor}
            >
              {t('features.documents.documentCollaborationEditor.list')}
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              disabled={!editor}
            >
              {t('features.documents.documentCollaborationEditor.heading')}
            </button>
            <button
              type="button"
              className={`btn btn-text btn-xs ${editor?.isActive('codeBlock') ? 'active' : ''}`}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              disabled={!editor}
            >
              {t('features.documents.documentCollaborationEditor.codeBlock')}
            </button>
          </div>
          <div className="collab-editor-surface">
            {editor ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="form-textarea collab-editor-fallback" aria-busy="true">{t('features.documents.documentCollaborationEditor.editorLoading')}</div>
            )}
          </div>
          <div className="form-help-text">
            {t('features.documents.documentCollaborationEditor.collabHelpText')}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={requestClose}>{t('common.close')}</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={status === 'connecting' || status === 'saving' || status === 'conflict' || status === 'error' || status === 'closed' || Boolean(serverSnapshot)}>
            {status === 'saving' ? t('features.documents.documentCollaborationEditor.savingButton') : t('features.documents.documentCollaborationEditor.saveAndBroadcast')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
