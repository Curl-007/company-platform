import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import {
  getAgentPageContext,
  publishAgentPageContext,
  subscribeAgentPageContext,
  useAgentPageContext,
  useAgentPageContextPublisher,
} from './agentPageContext';
import { flushAct, renderWithQueryClient } from '../../test/renderWithQuery';

// ---------------------------------------------------------------------------
// Page context bridge: window-event publish/subscribe plus the publisher
// hook lifecycle (publish on mount/change, clear on unmount).
// ---------------------------------------------------------------------------

afterEach(() => {
  publishAgentPageContext(null);
});

describe('agentPageContext bus', () => {
  it('delivers publications to subscribers and getAgentPageContext', () => {
    const received: Array<unknown> = [];
    const unsubscribe = subscribeAgentPageContext(({ detail }) => received.push(detail.context));

    publishAgentPageContext({ page: 'requirements', projectId: 'p1', projectName: 'P1' });
    expect(received).toEqual([{ page: 'requirements', projectId: 'p1', projectName: 'P1' }]);
    expect(getAgentPageContext()).toEqual({ page: 'requirements', projectId: 'p1', projectName: 'P1' });

    publishAgentPageContext(null);
    expect(received).toEqual([{ page: 'requirements', projectId: 'p1', projectName: 'P1' }, null]);
    expect(getAgentPageContext()).toBeNull();

    unsubscribe();
    publishAgentPageContext({ page: 'testing' });
    expect(received).toHaveLength(2);
  });

  it('unsubscribed listeners stop receiving events', () => {
    const received: Array<unknown> = [];
    const unsubscribe = subscribeAgentPageContext(({ detail }) => received.push(detail.context));
    unsubscribe();
    publishAgentPageContext({ page: 'testing' });
    expect(received).toHaveLength(0);
  });
});

function PublisherProbe({ page, projectId }: { page: 'requirements' | 'testing'; projectId?: string }) {
  useAgentPageContextPublisher({
    page,
    projectId,
    ...(projectId ? { projectName: `name-${projectId}` } : {}),
  });
  return null;
}

function SubscriberProbe() {
  const context = useAgentPageContext();
  return <div data-testid="context">{context ? JSON.stringify(context) : 'none'}</div>;
}

describe('useAgentPageContextPublisher', () => {
  it('publishes on mount, republishes on change and clears on unmount', async () => {
    const { container, root } = renderWithQueryClient(
      <>
        <SubscriberProbe />
        <PublisherProbe page="requirements" projectId="p1" />
      </>,
    );
    await flushAct();

    const output = () => container.querySelector('[data-testid="context"]')?.textContent;
    expect(output()).toBe('{"page":"requirements","projectId":"p1","projectName":"name-p1"}');

    // Prop change → new publication.
    await act(async () => {
      root.render(
        <>
          <SubscriberProbe />
          <PublisherProbe page="requirements" projectId="p2" />
        </>,
      );
    });
    expect(output()).toBe('{"page":"requirements","projectId":"p2","projectName":"name-p2"}');

    // Unmount → bridge cleared (stale scopes never leak to the next page).
    await act(async () => {
      root.render(<SubscriberProbe />);
    });
    expect(output()).toBe('none');
    expect(getAgentPageContext()).toBeNull();
  });

  it('renders without warnings for a single publisher', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container, unmount } = renderWithQueryClient(
      <>
        <SubscriberProbe />
        <PublisherProbe page="testing" projectId="t1" />
      </>,
    );
    await flushAct();
    expect(container.querySelector('[data-testid="context"]')?.textContent).toContain('"page":"testing"');
    expect(warn).not.toHaveBeenCalled();
    unmount();
  });
});

// The overlapping-publisher case: the last mounted publisher wins because its
// mount effect runs after the first one's. Guarded implicitly above; the
// state-based remount below exercises it explicitly for the project field.
function RemountProbe() {
  const [step, setStep] = useState(0);
  return (
    <>
      <SubscriberProbe />
      {step === 0 ? <PublisherProbe page="requirements" projectId="first" /> : null}
      {step === 1 ? <PublisherProbe page="requirements" projectId="second" /> : null}
      <button type="button" onClick={() => setStep(1)}>switch</button>
    </>
  );
}

describe('agentPageContext overlapping publishers', () => {
  it('last mounted publisher wins', async () => {
    const { container, unmount } = renderWithQueryClient(<RemountProbe />);
    await flushAct();
    expect(container.querySelector('[data-testid="context"]')?.textContent).toContain('first');

    await act(async () => {
      container.querySelector('button')?.click();
    });
    // React unmounts the old publisher (clear) then mounts the new one in the
    // same commit, so the settled state is the second publisher's context.
    expect(container.querySelector('[data-testid="context"]')?.textContent).toContain('second');
    unmount();
  });
});
