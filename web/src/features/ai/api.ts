// Thin barrel: the AI data-access layer lives in ./api/ (split by endpoint
// domain). This module re-exports the full surface so existing importers
// (AiSidebar, BusinessAdvicePanel, …) keep working unchanged.
export * from './api/index';
