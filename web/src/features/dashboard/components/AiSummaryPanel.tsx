import Panel from '../../../components/common/Panel';
import type { DashboardData } from '../../../types';

export default function AiSummaryPanel({ data }: { data: DashboardData }) {
  const { ai } = data;
  return (
    <Panel title={ai.title || 'AI 总结'} subtitle="面向当前工作区的自动摘要">
      <p className="body-text" style={{ marginTop: 0 }}>{ai.summary}</p>

      {ai.risks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">风险提醒</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.risks.map((risk, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {ai.recommendations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">建议动作</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.recommendations.map((item, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
