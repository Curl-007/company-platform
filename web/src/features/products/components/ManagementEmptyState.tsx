export default function ManagementEmptyState({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: string[];
}) {
  return (
    <div className="management-empty">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="management-empty-steps">
        {steps.map((step, index) => (
          <div key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
