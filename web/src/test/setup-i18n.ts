import i18n from '../i18n';

// 测试环境固定使用 zh-CN：
// happy-dom 的 navigator.language 默认为 en-US，会触发 i18n 语言检测，
// 导致组件渲染英文文案、中文断言失败。此处同步切换语言并持久化。
i18n.changeLanguage('zh-CN');
