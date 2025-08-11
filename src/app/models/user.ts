export interface User {
  id: number;
  auth_user_id?: string; // UUID de Supabase Auth
  name?: string;
  surname?: string;
  date_birth?: Date;
  email?: string;
  telephone?: string;
  role_id?: number;
  role?: string; // Si quieres acceder al nombre del rol directamente
  is_active?: boolean;
  deactivated_at?: string | Date | null;
  reactivated_at?: string | Date | null;
  last_deactivation_reason?: string | null;
  last_reactivation_reason?: string | null;
}