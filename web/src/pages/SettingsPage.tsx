import SettingsTabs from '../features/settings/components/SettingsTabs';
import PageFrame from '../components/common/PageFrame';

function SettingsPage() {
  return (
    <PageFrame className="page-frame-settings">
      <SettingsTabs />
    </PageFrame>
  );
}

export default SettingsPage;
