export function DeliveryFormError({ message }: { message: string | null }) {
  return message ? <div className="form-error" style={{ marginBottom: 12 }}>{message}</div> : null;
}

export function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function FormTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <textarea className="form-textarea" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
    </div>
  );
}

export function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
  );
}

export function QuickIdInput({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: string[];
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder="可输入多个 ID，用逗号或空格分隔" />
      {items.length > 0 ? (
        <div className="delivery-id-suggestions">
          {items.slice(0, 8).map((item) => (
            <button type="button" key={item} onClick={() => onChange([value, item].filter(Boolean).join(', '))}>{item}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FormActions({
  submitting,
  submitText,
  onClose,
}: {
  submitting: boolean;
  submitText: string;
  onClose: () => void;
}) {
  return (
    <div className="delivery-form-actions">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
      <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>{submitting ? '提交中...' : submitText}</button>
    </div>
  );
}
