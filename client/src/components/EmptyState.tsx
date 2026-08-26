import { Icon, type IconName } from "./Icon.js";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card empty-state">
      <div className="empty-icon" aria-hidden="true"><Icon name={icon} size={22} /></div>
      <h2 style={{ marginBottom: "0.4rem" }}>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
