/**
 * Extrai o user autenticado a partir do cookie de sessão Supabase.
 * Retorna null se não houver sessão válida.
 */
import { createClient } from '@/utils/supabase/server';

export async function getAuthUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
