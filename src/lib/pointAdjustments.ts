export interface StudentPointAdjustment {
  id: string;
  student_id: string;
  points: number;
  reason: string;
  sender_name: string;
  created_at: string;
}

export function sumPointAdjustments(
  items?: ReadonlyArray<{ points?: number | null }> | null
): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((acc, item) => acc + Math.trunc(Number(item.points) || 0), 0);
}

export function formatPointsDelta(points: number): string {
  const safe = Math.trunc(Number(points) || 0);
  if (safe > 0) return `+${safe} б.`;
  if (safe < 0) return `−${Math.abs(safe)} б.`;
  return '0 б.';
}

export function isMissingPointAdjustmentsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  const msg = `${err.code || ''} ${err.message || ''} ${err.details || ''}`.toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('student_point_adjustments') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}
