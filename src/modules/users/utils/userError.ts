export function userError(error: unknown, fallback = 'No se pudo guardar el usuario'): string {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.filter(value => typeof value === 'string').join('. ') || fallback;
  return typeof message === 'string' && message ? message : fallback;
}
