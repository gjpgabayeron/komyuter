export function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return (local[0] ?? "?").toUpperCase();
}

export function getDisplayName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed;
  }
  const local = email.split("@")[0] ?? "";
  return local || email;
}
