import { useEffect, useState } from 'react';
import { Code2, FileCode2, FolderTree, SlidersHorizontal } from 'lucide-react';
import { fetchProjectSources, fetchSourceFile } from '../api';
import { ApiError } from '../../../services/api';
import CodeViewer from '../../../components/common/CodeViewer';
import FileTree from '../../../components/common/FileTree';
import ResizablePanels from '../../../components/common/ResizablePanels';
import type { FileTreeNode, SourceFile } from '../../../types';

interface SourceTabProps {
  projectId: string;
  sourcePath: string | null;
}

export default function SourceTab({ projectId, sourcePath }: SourceTabProps) {
  const [tree, setTree] = useState<FileTreeNode[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [file, setFile] = useState<SourceFile | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourcePath) return;
    setTreeLoading(true);
    setTreeError(null);
    fetchProjectSources(projectId)
      .then((data) => setTree(data as unknown as FileTreeNode[]))
      .catch((err) => setTreeError(err instanceof ApiError ? err.message : '加载源码目录失败'))
      .finally(() => setTreeLoading(false));
  }, [projectId, sourcePath]);

  useEffect(() => {
    if (!selectedPath) {
      setFile(null);
      return;
    }
    setFileLoading(true);
    setFileError(null);
    fetchSourceFile(projectId, selectedPath)
      .then((data) => setFile(data))
      .catch((err) => setFileError(err instanceof ApiError ? err.message : '加载文件失败'))
      .finally(() => setFileLoading(false));
  }, [projectId, selectedPath]);

  if (!sourcePath) {
    return (
      <div className="source-workbench source-workbench-empty">
        <div className="source-workbench-toolbar">
          <div className="project-board-toolbar-left">
            <span className="project-board-icon"><Code2 size={17} /></span>
            <div>
              <div className="project-board-title">源码画板</div>
              <div className="project-board-subtitle">目录、代码画布和文件信息将在这里联动。</div>
            </div>
          </div>
        </div>
        <div className="source-canvas-empty">
          <FileCode2 size={24} />
          <span>该项目未配置源码路径，暂时无法浏览文件。</span>
        </div>
      </div>
    );
  }

  return (
    <div className="source-workbench">
      <div className="source-workbench-toolbar">
        <div className="project-board-toolbar-left">
          <span className="project-board-icon"><Code2 size={17} /></span>
          <div>
            <div className="project-board-title">源码画板</div>
            <div className="project-board-subtitle">{sourcePath}</div>
          </div>
        </div>
        <span className="source-workbench-hint"><SlidersHorizontal size={14} /> 拖动分隔条调整视图</span>
      </div>
      <ResizablePanels
        className="source-resizable"
        leftDefault={300}
        rightDefault={300}
        left={
          <div className="source-tree-panel">
            <div className="source-tree-header"><FolderTree size={15} /> 文件目录</div>
            {treeLoading ? (
              <p className="text-secondary" style={{ padding: 12, fontSize: 13 }}>加载中...</p>
            ) : treeError ? (
              <p className="form-error" style={{ padding: 12, fontSize: 13 }}>{treeError}</p>
            ) : !tree ? (
              <p className="text-secondary" style={{ padding: 12, fontSize: 13 }}>暂无数据</p>
            ) : (
              <FileTree
                items={tree}
                selectedPath={selectedPath ?? undefined}
                onFileSelect={(path) => setSelectedPath(path)}
              />
            )}
          </div>
        }
        right={
          <div className="source-inspector">
            <div className="source-tree-header"><FileCode2 size={15} /> 文件信息</div>
            {file ? (
              <div className="source-inspector-body">
                <div className="detail-field">
                  <span className="detail-label">文件名</span>
                  <span>{(file.path ?? selectedPath ?? '').split(/[\\/]/).pop() || '未命名文件'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">路径</span>
                  <span className="text-mono">{file.path ?? selectedPath}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">语言</span>
                  <span>{file.language || 'text'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">行数</span>
                  <span>{file.lineCount || file.content.split('\n').length}</span>
                </div>
              </div>
            ) : (
              <div className="source-inspector-empty">从左侧选择文件</div>
            )}
          </div>
        }
      >
        <div className="source-content-panel">
          {fileLoading ? (
            <div style={{ padding: 16 }}><p className="text-secondary" style={{ fontSize: 13 }}>加载文件中...</p></div>
          ) : fileError ? (
            <div style={{ padding: 16 }}><p className="form-error" style={{ fontSize: 13 }}>{fileError}</p></div>
          ) : !file ? (
            <div className="source-canvas-empty">
              <FileCode2 size={24} />
              <span>请从左侧选择文件以查看内容。</span>
            </div>
          ) : (
            <CodeViewer file={file} />
          )}
        </div>
      </ResizablePanels>
    </div>
  );
}
