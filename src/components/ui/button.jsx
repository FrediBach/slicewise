export function Button({ variant = "default", className = "", ...props }) {
  return <button className={`button button--${variant} ${className}`} {...props} />;
}
